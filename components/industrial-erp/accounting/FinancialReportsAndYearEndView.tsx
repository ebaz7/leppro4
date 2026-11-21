import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  Check,
  Download,
  Factory,
  FileSpreadsheet,
  Lock,
  Plus,
  Printer,
  Scale,
  Search,
  Settings,
  Sliders,
  Unlock,
  Users
} from 'lucide-react';
import { User } from '../../../types';
import { printHtmlInPage } from '../../../utils/pdfGenerator';
import {
  ErpCompanySummary,
  ErpCutoverConfig,
  ErpSubViewId,
  ErpVoucher,
  ErpVoucherLine,
  IndustrialErpState,
  getTodayJalali
} from '../types';
import { matchesSearchQuery } from '../erpCodeUtils';
import {
  VOUCHER_TYPE_META,
  computeAccountCardLines,
  computeFinancialStatements,
  computeTrialBalanceRows,
  escapeHtml,
  exportRowsToCsv,
  formatRials,
  getDescendantAccountIds,
  getEffectiveAccountingSettings,
  getLevelDisplayTitle
} from './accountingUtils';

interface FinancialReportsAndYearEndViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  erpState: IndustrialErpState;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser: User;
  showToast: (type: 'success' | 'error', text: string) => void;
  cutoffDateInput: string;
  setCutoffDateInput: React.Dispatch<React.SetStateAction<string>>;
  importingTrialBalance: boolean;
  handleImportSayanTrialBalance: () => Promise<void>;
  handleToggleCutoverStage: (stageKey: keyof ErpCutoverConfig) => Promise<void>;
}

const DEFAULT_ACCOUNT_LABELS: { key: keyof ReturnType<typeof getEffectiveAccountingSettings>['defaultAccounts']; label: string }[] = [
  { key: 'cashBank', label: 'حساب پیش‌فرض نقد و بانک' },
  { key: 'receivable', label: 'حساب‌های دریافتنی تجاری (مشتریان)' },
  { key: 'payable', label: 'حساب‌های پرداختنی تجاری (تامین‌کنندگان)' },
  { key: 'inventoryRaw', label: 'موجودی مواد اولیه' },
  { key: 'wipProduction', label: 'کالای در جریان ساخت (WIP)' },
  { key: 'inventoryFinished', label: 'موجودی کالای ساخته‌شده (محصول)' },
  { key: 'salesRevenue', label: 'درآمد فروش محصولات' },
  { key: 'salesReturn', label: 'برگشت از فروش و تخفیفات' },
  { key: 'cogs', label: 'بهای تمام‌شده کالای فروش‌رفته' },
  { key: 'directMaterial', label: 'مواد مستقیم مصرفی تولید' },
  { key: 'directLabor', label: 'دستمزد مستقیم خطوط تولید' },
  { key: 'factoryOverhead', label: 'سربار ساخت کارخانه' },
  { key: 'adminExpense', label: 'هزینه‌های اداری و عمومی' },
  { key: 'vatReceivable', label: 'مالیات ارزش افزوده خرید' },
  { key: 'vatPayable', label: 'مالیات ارزش افزوده فروش' },
  { key: 'incomeSummary', label: 'خلاصه سود و زیان دوره' },
  { key: 'retainedEarnings', label: 'سود (زیان) انباشته' },
  { key: 'openingClosing', label: 'حساب تراز افتتاحیه و اختتامیه' }
];

export const FinancialReportsAndYearEndView: React.FC<FinancialReportsAndYearEndViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  persistErpState,
  currentUser,
  showToast,
  cutoffDateInput,
  setCutoffDateInput,
  importingTrialBalance,
  handleImportSayanTrialBalance,
  handleToggleCutoverStage
}) => {
  const settings = useMemo(() => getEffectiveAccountingSettings(erpState), [erpState]);
  const accounts = useMemo(() => erpState.chartOfAccounts || [], [erpState.chartOfAccounts]);
  const vouchers = useMemo(() => erpState.vouchers || [], [erpState.vouchers]);
  const activeFiscalYear = erpState.activeFiscalYear || selectedCompany.activeFiscalYear || '1405';

  // --- Shared Filters ---
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithTurnover, setOnlyWithTurnover] = useState(true);
  const [includeDrafts, setIncludeDrafts] = useState(false);

  // --- Ledger Review State ---
  const [reviewMode, setReviewMode] = useState<'ACCOUNTS' | 'TAFSIL'>('ACCOUNTS');
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'GROUP' | 'KOL' | 'MOEIN' | 'TAFZILI'>('ALL');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedTafsilName, setSelectedTafsilName] = useState<string | null>(null);

  // --- Trial Balance & Legal Books State ---
  const [tbMode, setTbMode] = useState<'TB2' | 'TB4' | 'TB6' | 'JOURNAL' | 'SUMMARY'>('TB4');
  const [tbDepthFilter, setTbDepthFilter] = useState<'ALL' | 'LEAF' | 'KOL' | 'MOEIN'>('LEAF');

  // --- Year-End & Overhead Allocation State ---
  const [overheadSourceCode, setOverheadSourceCode] = useState(settings.defaultAccounts.factoryOverhead || '6103');
  const [overheadAmount, setOverheadAmount] = useState('');
  const [overheadNote, setOverheadNote] = useState('تسهیم سربار ساخت کارخانه به خطوط تولید');
  const [allocationTargets, setAllocationTargets] = useState<{ id: string; targetName: string; accountCode: string; percent: number }[]>(() => {
    const lines = erpState.productionLines || [];
    if (lines.length > 0) {
      const equalPct = Math.floor(100 / lines.length);
      return lines.map((ln, idx) => ({
        id: ln.id,
        targetName: ln.name,
        accountCode: settings.defaultAccounts.wipProduction || '110302',
        percent: idx === lines.length - 1 ? 100 - equalPct * (lines.length - 1) : equalPct
      }));
    }
    return [
      { id: 't1', targetName: 'خط تولید ۱', accountCode: settings.defaultAccounts.wipProduction || '110302', percent: 60 },
      { id: 't2', targetName: 'خط تولید ۲', accountCode: settings.defaultAccounts.wipProduction || '110302', percent: 40 }
    ];
  });
  const [nextYearLabel, setNextYearLabel] = useState(() => {
    const num = parseInt(activeFiscalYear, 10);
    return Number.isFinite(num) ? String(num + 1) : '1406';
  });

  // --- Settings State ---
  const [newFiscalYearInput, setNewFiscalYearInput] = useState('');
  const [draftAutoVoucher, setDraftAutoVoucher] = useState(settings.autoVoucherEnabled);
  const [draftAllowEditFinal, setDraftAllowEditFinal] = useState(settings.allowEditFinalizedVoucher);
  const [draftDefaults, setDraftDefaults] = useState(settings.defaultAccounts);

  // --- Computed Balances ---
  const trialBalanceRolled = useMemo(
    () =>
      computeTrialBalanceRows(accounts, vouchers, {
        dateFrom,
        dateTo,
        includeDrafts,
        onlyWithTurnover,
        rollupHierarchy: true
      }),
    [accounts, vouchers, dateFrom, dateTo, includeDrafts, onlyWithTurnover]
  );

  const trialBalanceLeaf = useMemo(
    () =>
      computeTrialBalanceRows(accounts, vouchers, {
        dateFrom,
        dateTo,
        includeDrafts,
        onlyWithTurnover,
        rollupHierarchy: false
      }),
    [accounts, vouchers, dateFrom, dateTo, includeDrafts, onlyWithTurnover]
  );

  const tafsilSummaryRows = useMemo(() => {
    const map = new Map<string, { key: string; code: string; name: string; debit: number; credit: number; count: number }>();
    for (const v of vouchers) {
      if (!includeDrafts && v.status === 'DRAFT') continue;
      if (dateFrom && v.dateJalali && v.dateJalali < dateFrom) continue;
      if (dateTo && v.dateJalali && v.dateJalali > dateTo) continue;
      for (const l of v.lines || []) {
        const name = (l.tafziliName || '').trim();
        if (!name) continue;
        const key = name;
        const cur = map.get(key) || {
          key,
          code: l.tafziliCode || '-',
          name,
          debit: 0,
          credit: 0,
          count: 0
        };
        cur.debit += Number(l.debit) || 0;
        cur.credit += Number(l.credit) || 0;
        cur.count += 1;
        if (!cur.code || cur.code === '-') cur.code = l.tafziliCode || '-';
        map.set(key, cur);
      }
    }
    return Array.from(map.values())
      .filter(r => !searchQuery.trim() || matchesSearchQuery(searchQuery, [r.code, r.name]))
      .sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit));
  }, [vouchers, includeDrafts, dateFrom, dateTo, searchQuery]);

  // Selected Account Card Lines (gathers account + all descendant codes when a parent Group/Kol is selected!)
  const selectedAccountObj = useMemo(
    () => accounts.find(a => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const accountCardRows = useMemo(() => {
    if (reviewMode === 'ACCOUNTS' && selectedAccountId) {
      const descIds = getDescendantAccountIds(selectedAccountId, accounts);
      const validCodes = new Set<string>();
      for (const a of accounts) {
        if (descIds.has(a.id)) validCodes.add(a.code);
      }
      if (selectedAccountId.startsWith('orphan_')) {
        validCodes.add(selectedAccountId.replace(/^orphan_/, ''));
      }
      return computeAccountCardLines(vouchers, (line, v) => {
        if (!includeDrafts && v.status === 'DRAFT') return false;
        if (dateFrom && v.dateJalali && v.dateJalali < dateFrom) return false;
        if (dateTo && v.dateJalali && v.dateJalali > dateTo) return false;
        return validCodes.has(line.accountCode);
      });
    }
    if (reviewMode === 'TAFSIL' && selectedTafsilName) {
      return computeAccountCardLines(vouchers, (line, v) => {
        if (!includeDrafts && v.status === 'DRAFT') return false;
        if (dateFrom && v.dateJalali && v.dateJalali < dateFrom) return false;
        if (dateTo && v.dateJalali && v.dateJalali > dateTo) return false;
        return (line.tafziliName || '').trim() === selectedTafsilName;
      });
    }
    return [];
  }, [reviewMode, selectedAccountId, selectedTafsilName, accounts, vouchers, includeDrafts, dateFrom, dateTo]);

  // Financial Statements
  const statements = useMemo(
    () => computeFinancialStatements(accounts, vouchers, erpState.productionVouchers || []),
    [accounts, vouchers, erpState.productionVouchers]
  );

  // --- Print Helpers (All HTML Escaped via escapeHtml) ---
  const printLedgerCard = (cardTitle: string) => {
    const sumD = accountCardRows.reduce((s, r) => s + r.debit, 0);
    const sumC = accountCardRows.reduce((s, r) => s + r.credit, 0);
    const rowsHtml = accountCardRows
      .map(
        (r, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;">#${escapeHtml(r.voucherNo)}</td>
        <td style="font-family:monospace;">${escapeHtml(r.dateJalali)}</td>
        <td style="font-family:monospace;">${escapeHtml(r.accountCode)}</td>
        <td>${escapeHtml(r.tafziliName)}</td>
        <td>${escapeHtml(r.description)}</td>
        <td style="text-align:left;font-family:monospace;">${r.debit.toLocaleString('en-US')}</td>
        <td style="text-align:left;font-family:monospace;">${r.credit.toLocaleString('en-US')}</td>
        <td style="text-align:left;font-family:monospace;font-weight:700;">${r.runningBalance.toLocaleString('en-US')} (${escapeHtml(r.balanceSide)})</td>
      </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8" />
    <title>${escapeHtml(cardTitle)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: Tahoma, Vazirmatn, sans-serif; font-size: 11px; color: #0f172a; }
      h1 { margin: 0 0 4px 0; font-size: 15px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: right; }
      th { background: #f1f5f9; }
      tfoot td { background: #e2e8f0; font-weight: 700; }
    </style></head><body>
    <h1>${escapeHtml(selectedCompany.name)} — کارت حساب: ${escapeHtml(cardTitle)}</h1>
    <div>دوره مالی: ${escapeHtml(activeFiscalYear)} | تاریخ چاپ: ${escapeHtml(getTodayJalali())}</div>
    <table><thead><tr>
      <th>ردیف</th><th>سند</th><th>تاریخ</th><th>کد حساب</th><th>تفصیل</th><th>شرح</th>
      <th>بدهکار</th><th>بستانکار</th><th>مانده تجمعی</th>
    </tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr>
      <td colspan="6">جمع گردش کارت حساب:</td>
      <td style="text-align:left;font-family:monospace;">${sumD.toLocaleString('en-US')}</td>
      <td style="text-align:left;font-family:monospace;">${sumC.toLocaleString('en-US')}</td>
      <td style="text-align:left;font-family:monospace;">${Math.abs(sumD - sumC).toLocaleString('en-US')} (${sumD > sumC ? 'بد' : sumC > sumD ? 'بس' : 'تسویه'})</td>
    </tr></tfoot></table></body></html>`;
    printHtmlInPage(html, 'landscape', `کارت_حساب_${cardTitle}`, { skipStyleInjection: true });
  };

  const printFinancialStatements = () => {
    const mkRows = (items: { code: string; title: string; amount: number }[]) =>
      items
        .map(
          x => `<tr><td style="font-family:monospace;">${escapeHtml(x.code)}</td><td>${escapeHtml(x.title)}</td><td style="text-align:left;font-family:monospace;font-weight:700;">${Math.round(x.amount).toLocaleString('en-US')}</td></tr>`
        )
        .join('') || '<tr><td colspan="3" style="text-align:center;color:#64748b;">گردشی ثبت نشده است</td></tr>';

    const html = `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8" />
    <title>صورت‌های مالی ${escapeHtml(selectedCompany.name)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: Tahoma, Vazirmatn, sans-serif; font-size: 11px; color: #0f172a; }
      h1 { font-size: 16px; margin: 0 0 4px 0; }
      h2 { font-size: 13px; margin: 14px 0 6px 0; border-bottom: 1px solid #94a3b8; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: right; }
      th { background: #f1f5f9; }
      .tot { background: #e2e8f0; font-weight: 700; }
    </style></head><body>
    <h1>صورت‌های مالی اساسی — ${escapeHtml(selectedCompany.name)}</h1>
    <div>دوره مالی: ${escapeHtml(activeFiscalYear)} | تاریخ تهیه: ${escapeHtml(getTodayJalali())} | واحد: ریال</div>
    <h2>۱. صورت سود و زیان</h2>
    <table><thead><tr><th>کد</th><th>شرح</th><th>مبلغ (ریال)</th></tr></thead><tbody>
      ${mkRows(statements.revenues)}
      <tr class="tot"><td colspan="2">جمع درآمدها و فروش</td><td style="text-align:left;font-family:monospace;">${Math.round(statements.totalRevenue).toLocaleString('en-US')}</td></tr>
      ${mkRows(statements.cogsItems)}
      <tr class="tot"><td colspan="2">سود (زیان) ناخالص</td><td style="text-align:left;font-family:monospace;">${Math.round(statements.grossProfit).toLocaleString('en-US')}</td></tr>
      ${mkRows(statements.expenses)}
      <tr class="tot"><td colspan="2">سود (زیان) خالص دوره</td><td style="text-align:left;font-family:monospace;">${Math.round(statements.netProfit).toLocaleString('en-US')}</td></tr>
    </tbody></table>
    <h2>۲. ترازنامه (صورت وضعیت مالی)</h2>
    <table><thead><tr><th>کد</th><th>دارایی‌ها</th><th>مبلغ (ریال)</th></tr></thead><tbody>
      ${mkRows(statements.assets)}
      <tr class="tot"><td colspan="2">جمع کل دارایی‌ها</td><td style="text-align:left;font-family:monospace;">${Math.round(statements.totalAssets).toLocaleString('en-US')}</td></tr>
    </tbody></table>
    <table><thead><tr><th>کد</th><th>بدهی‌ها و حقوق صاحبان سهام</th><th>مبلغ (ریال)</th></tr></thead><tbody>
      ${mkRows(statements.liabilities)}
      ${mkRows(statements.equity)}
      <tr><td>—</td><td>سود (زیان) خالص دوره جاری</td><td style="text-align:left;font-family:monospace;">${Math.round(statements.netProfit).toLocaleString('en-US')}</td></tr>
      <tr class="tot"><td colspan="2">جمع بدهی‌ها و حقوق صاحبان سهام</td><td style="text-align:left;font-family:monospace;">${Math.round(statements.totalLiabilitiesAndEquity).toLocaleString('en-US')}</td></tr>
    </tbody></table></body></html>`;
    printHtmlInPage(html, 'portrait', `صورت_های_مالی_${selectedCompany.name}`, { skipStyleInjection: true });
  };

  // --- Year-End & Allocation Handlers ---
  const handlePostOverheadAllocation = async () => {
    const totalAmt = Math.round(Number(overheadAmount) || 0);
    if (totalAmt <= 0) {
      showToast('error', 'مبلغ سربار قابل تسهیم باید بزرگ‌تر از صفر باشد.');
      return;
    }
    const pctSum = allocationTargets.reduce((s, t) => s + (Number(t.percent) || 0), 0);
    if (Math.abs(pctSum - 100) > 0.01) {
      showToast('error', `جمع درصدهای تسهیم باید دقیقاً ۱۰۰٪ باشد (جمع فعلی: ${pctSum}٪).`);
      return;
    }
    const srcAcc = accounts.find(a => a.code === overheadSourceCode);
    const vNo = erpState.nextVoucherNo || 1001;
    let allocatedSoFar = 0;
    const debitLines: ErpVoucherLine[] = allocationTargets.map((t, idx) => {
      const isLast = idx === allocationTargets.length - 1;
      const share = isLast ? totalAmt - allocatedSoFar : Math.round((totalAmt * t.percent) / 100);
      allocatedSoFar += share;
      const targetAcc = accounts.find(a => a.code === t.accountCode);
      return {
        id: `ovh_d_${Date.now()}_${idx}`,
        accountId: targetAcc?.id,
        accountCode: t.accountCode,
        accountTitle: targetAcc?.title || 'کالای در جریان ساخت / مرکز هزینه',
        tafziliName: t.targetName,
        debit: share,
        credit: 0,
        description: `سهم ${t.percent}٪ ${overheadNote} — ${t.targetName}`
      };
    });

    const creditLine: ErpVoucherLine = {
      id: `ovh_c_${Date.now()}`,
      accountId: srcAcc?.id,
      accountCode: overheadSourceCode,
      accountTitle: srcAcc?.title || 'سربار ساخت کارخانه',
      tafziliName: 'تسهیم سربار صنعتی',
      debit: 0,
      credit: totalAmt,
      description: overheadNote
    };

    const created: ErpVoucher = {
      id: `vch_ovh_${Date.now()}`,
      voucherNo: vNo,
      dateJalali: getTodayJalali(),
      fiscalYear: activeFiscalYear,
      type: 'ADJUSTMENT',
      status: 'FINALIZED',
      description: `${overheadNote} (مبلغ ${formatRials(totalAmt)} ریال)`,
      autoGenerated: true,
      createdBy: currentUser.fullName,
      createdAt: Date.now(),
      lines: [...debitLines, creditLine]
    };

    await persistErpState(
      { ...erpState, vouchers: [created, ...vouchers], nextVoucherNo: vNo + 1 },
      `سند تسهیم سربار #${vNo} با موفقیت صادر و ثبت شد.`
    );
    setOverheadAmount('');
  };

  const handleCloseTemporaryAccounts = async () => {
    const leafRows = computeTrialBalanceRows(accounts, vouchers, {
      rollupHierarchy: false,
      onlyWithTurnover: true,
      includeDrafts: false
    });
    const tempRows = leafRows.filter(
      r => r.category === 'REVENUE' || r.category === 'COGS' || r.category === 'EXPENSE'
    );
    const lines: ErpVoucherLine[] = [];
    let netProfitDiff = 0; // positive => profit (credit retained earnings)

    for (const r of tempRows) {
      const net = r.totalDebit - r.totalCredit;
      if (Math.abs(net) < 0.01) continue;
      if (net > 0) {
        // Account has Debit balance -> Credit it to close
        lines.push({
          id: `cls_t_${r.code}_${Date.now()}`,
          accountCode: r.code,
          accountTitle: r.title,
          tafziliName: 'بستن حساب‌های موقت',
          debit: 0,
          credit: Math.round(net),
          description: `بستن حساب موقت ${r.title} پایان دوره ${activeFiscalYear}`
        });
        netProfitDiff -= Math.round(net);
      } else {
        // Account has Credit balance -> Debit it to close
        const amt = Math.round(Math.abs(net));
        lines.push({
          id: `cls_t_${r.code}_${Date.now()}`,
          accountCode: r.code,
          accountTitle: r.title,
          tafziliName: 'بستن حساب‌های موقت',
          debit: amt,
          credit: 0,
          description: `بستن حساب موقت ${r.title} پایان دوره ${activeFiscalYear}`
        });
        netProfitDiff += amt;
      }
    }

    if (lines.length === 0) {
      showToast('error', 'هیچ حساب موقت (درآمد/بهای تمام‌شده/هزینه) دارای مانده باز برای بستن وجود ندارد.');
      return;
    }

    const retCode = settings.defaultAccounts.retainedEarnings || '3102';
    const retAcc = accounts.find(a => a.code === retCode);
    if (netProfitDiff !== 0) {
      lines.push({
        id: `cls_ret_${Date.now()}`,
        accountId: retAcc?.id,
        accountCode: retCode,
        accountTitle: retAcc?.title || 'سود (زیان) انباشته',
        tafziliName: `دوره مالی ${activeFiscalYear}`,
        debit: netProfitDiff < 0 ? Math.abs(netProfitDiff) : 0,
        credit: netProfitDiff > 0 ? netProfitDiff : 0,
        description:
          netProfitDiff > 0
            ? `انتقال سود خالص دوره مالی ${activeFiscalYear} به سود انباشته`
            : `انتقال زیان خالص دوره مالی ${activeFiscalYear} به زیان انباشته`
      });
    }

    const vNo = erpState.nextVoucherNo || 1001;
    const created: ErpVoucher = {
      id: `vch_cls_tmp_${Date.now()}`,
      voucherNo: vNo,
      dateJalali: getTodayJalali(),
      fiscalYear: activeFiscalYear,
      type: 'CLOSING',
      status: 'FINALIZED',
      description: `سند بستن حساب‌های موقت و انتقال سود/زیان دوره ${activeFiscalYear}`,
      autoGenerated: true,
      createdBy: currentUser.fullName,
      createdAt: Date.now(),
      lines
    };

    await persistErpState(
      { ...erpState, vouchers: [created, ...vouchers], nextVoucherNo: vNo + 1 },
      `سند بستن حساب‌های موقت #${vNo} صادر شد.`
    );
  };

  const handleIssuePermanentVoucher = async (mode: 'CLOSING' | 'OPENING') => {
    const leafRows = computeTrialBalanceRows(accounts, vouchers, {
      rollupHierarchy: false,
      onlyWithTurnover: true,
      includeDrafts: false
    });
    const permRows = leafRows.filter(
      r => r.category === 'ASSET' || r.category === 'LIABILITY' || r.category === 'EQUITY'
    );
    const lines: ErpVoucherLine[] = [];
    let totalD = 0;
    let totalC = 0;

    for (const r of permRows) {
      const net = Math.round(r.totalDebit - r.totalCredit);
      if (net === 0) continue;
      if (mode === 'CLOSING') {
        // Reverse permanent balances to close
        const d = net < 0 ? Math.abs(net) : 0;
        const c = net > 0 ? net : 0;
        totalD += d;
        totalC += c;
        lines.push({
          id: `cls_p_${r.code}_${Date.now()}`,
          accountCode: r.code,
          accountTitle: r.title,
          tafziliName: `اختتامیه ${activeFiscalYear}`,
          debit: d,
          credit: c,
          description: `بستن حساب دائم ${r.title} - سند اختتامیه`
        });
      } else {
        // Carry forward permanent balances into Opening voucher
        const d = net > 0 ? net : 0;
        const c = net < 0 ? Math.abs(net) : 0;
        totalD += d;
        totalC += c;
        lines.push({
          id: `opn_p_${r.code}_${Date.now()}`,
          accountCode: r.code,
          accountTitle: r.title,
          tafziliName: `افتتاحیه ${nextYearLabel}`,
          debit: d,
          credit: c,
          description: `انتقال مانده حساب دائم ${r.title} به دوره ${nextYearLabel}`
        });
      }
    }

    if (lines.length === 0) {
      showToast('error', 'هیچ حساب دائمی (دارایی/بدهی/سرمایه) دارای مانده برای این عملیات یافت نشد.');
      return;
    }

    const diff = totalD - totalC;
    if (diff !== 0) {
      const ocCode = settings.defaultAccounts.openingClosing || '9101';
      const ocAcc = accounts.find(a => a.code === ocCode);
      lines.push({
        id: `oc_bal_${Date.now()}`,
        accountId: ocAcc?.id,
        accountCode: ocCode,
        accountTitle: ocAcc?.title || 'تراز افتتاحیه و اختتامیه',
        tafziliName: mode === 'CLOSING' ? activeFiscalYear : nextYearLabel,
        debit: diff < 0 ? Math.abs(diff) : 0,
        credit: diff > 0 ? diff : 0,
        description: 'ترازکننده سند افتتاحیه/اختتامیه (معادل سود/زیان نبسته دوره)'
      });
    }

    const vNo = erpState.nextVoucherNo || 1001;
    const created: ErpVoucher = {
      id: `vch_${mode.toLowerCase()}_${Date.now()}`,
      voucherNo: vNo,
      dateJalali: getTodayJalali(),
      fiscalYear: mode === 'OPENING' ? nextYearLabel : activeFiscalYear,
      type: mode === 'CLOSING' ? 'CLOSING' : 'OPENING_CUTOVER',
      status: 'FINALIZED',
      description:
        mode === 'CLOSING'
          ? `سند اختتامیه بستن حساب‌های دائم دوره مالی ${activeFiscalYear}`
          : `سند افتتاحیه دوره مالی جدید ${nextYearLabel} (نقل از ${activeFiscalYear})`,
      autoGenerated: true,
      createdBy: currentUser.fullName,
      createdAt: Date.now(),
      lines
    };

    const existingYears = Array.from(new Set([...(erpState.fiscalYears || [activeFiscalYear]), nextYearLabel]));
    await persistErpState(
      {
        ...erpState,
        fiscalYears: mode === 'OPENING' ? existingYears : erpState.fiscalYears,
        vouchers: [created, ...vouchers],
        nextVoucherNo: vNo + 1
      },
      mode === 'CLOSING'
        ? `سند اختتامیه #${vNo} صادر شد.`
        : `سند افتتاحیه دوره ${nextYearLabel} با شماره #${vNo} ثبت شد.`
    );
  };

  // =========================================================================
  // VIEW 1: fin_ledger_review (Drill-down Account & Tafsil Review + Card)
  // =========================================================================
  if (activeSubView === 'fin_ledger_review') {
    const displayedAccounts = trialBalanceRolled.filter(r => {
      if (levelFilter !== 'ALL') {
        if (levelFilter === 'TAFZILI') {
          if (r.level !== 'TAFZILI' && r.level !== 'SUB_TAFZILI') return false;
        } else if (r.level !== levelFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        return matchesSearchQuery(searchQuery, [r.code, r.title]);
      }
      return true;
    });

    const cardTitle =
      reviewMode === 'ACCOUNTS'
        ? selectedAccountObj
          ? `${selectedAccountObj.code} — ${selectedAccountObj.title}`
          : selectedAccountId?.replace(/^orphan_/, '') || ''
        : selectedTafsilName || '';

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen size={18} className="text-indigo-600" />
                <span>مرور جامع حساب‌ها، تفصیل‌ها و کارت حساب اشخاص — «{selectedCompany.name}»</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                روی هر حساب (حتی گروه یا کل جهت تجمیع زیرشاخه‌ها) یا هر شخص/تفصیل کلیک کنید تا کارت حساب با مانده تجمعی نمایش داده شود.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setReviewMode('ACCOUNTS');
                  setSelectedTafsilName(null);
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  reviewMode === 'ACCOUNTS'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                }`}
              >
                مرور سرفصل حساب‌ها
              </button>
              <button
                type="button"
                onClick={() => {
                  setReviewMode('TAFSIL');
                  setSelectedAccountId(null);
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  reviewMode === 'TAFSIL'
                    ? 'bg-teal-600 text-white'
                    : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                }`}
              >
                <Users size={14} />
                <span>مرور تفصیل و اشخاص</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 text-xs items-center">
            <div className="lg:col-span-4 relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="جستجوی کد یا عنوان حساب / نام شخص..."
                className="w-full min-h-[40px] pr-8 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            {reviewMode === 'ACCOUNTS' && (
              <div className="lg:col-span-2">
                <select
                  value={levelFilter}
                  onChange={e => setLevelFilter(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  <option value="ALL">همه سطوح درختی</option>
                  <option value="GROUP">سطح گروه</option>
                  <option value="KOL">سطح کل</option>
                  <option value="MOEIN">سطح معین</option>
                  <option value="TAFZILI">سطح تفصیل و زیرتفصیل</option>
                </select>
              </div>
            )}
            <div className="lg:col-span-2">
              <input
                type="text"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                placeholder="از تاریخ 1405/01/01"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center"
              />
            </div>
            <div className="lg:col-span-2">
              <input
                type="text"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                placeholder="تا تاریخ 1405/12/29"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center"
              />
            </div>
            <label className="lg:col-span-2 flex items-center gap-2 cursor-pointer font-bold">
              <input
                type="checkbox"
                checked={onlyWithTurnover}
                onChange={e => setOnlyWithTurnover(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span>فقط دارای گردش</span>
            </label>
          </div>
        </div>

        {/* Summary Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto custom-scrollbar">
            {reviewMode === 'ACCOUNTS' ? (
              <table className="w-full text-right text-xs min-w-[720px]">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3">کد حساب</th>
                    <th className="py-2.5 px-3">عنوان سرفصل</th>
                    <th className="py-2.5 px-3">سطح</th>
                    <th className="py-2.5 px-3">گردش بدهکار</th>
                    <th className="py-2.5 px-3">گردش بستانکار</th>
                    <th className="py-2.5 px-3">مانده بدهکار</th>
                    <th className="py-2.5 px-3">مانده بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedAccounts.map(row => (
                    <tr
                      key={row.accountId}
                      onClick={() => setSelectedAccountId(row.accountId)}
                      className={`cursor-pointer transition-colors ${
                        selectedAccountId === row.accountId
                          ? 'bg-indigo-50 dark:bg-indigo-950/50'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 px-3 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                        {row.code}
                      </td>
                      <td
                        className={`py-2 px-3 ${row.depth <= 2 ? 'font-black text-slate-900 dark:text-white' : 'font-semibold'}`}
                        style={{ paddingRight: `${12 + Math.min(row.depth - 1, 6) * 14}px` }}
                      >
                        {row.title}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-500">
                        {getLevelDisplayTitle({ id: row.accountId, code: row.code, title: row.title, level: row.level, nature: 'DEBIT' }, row.depth, settings.layers)}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums">{formatRials(row.totalDebit)}</td>
                      <td className="py-2 px-3 font-mono tabular-nums">{formatRials(row.totalCredit)}</td>
                      <td className="py-2 px-3 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                        {formatRials(row.endingDebit)}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                        {formatRials(row.endingCredit)}
                      </td>
                    </tr>
                  ))}
                  {displayedAccounts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        حسابی با این شرایط یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-right text-xs min-w-[680px]">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3">کد تفصیل</th>
                    <th className="py-2.5 px-3">نام شخص / تفصیل</th>
                    <th className="py-2.5 px-3">تعداد آرتیکل</th>
                    <th className="py-2.5 px-3">گردش بدهکار</th>
                    <th className="py-2.5 px-3">گردش بستانکار</th>
                    <th className="py-2.5 px-3">مانده بدهکار</th>
                    <th className="py-2.5 px-3">مانده بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tafsilSummaryRows.map(row => {
                    const net = row.debit - row.credit;
                    return (
                      <tr
                        key={row.key}
                        onClick={() => setSelectedTafsilName(row.name)}
                        className={`cursor-pointer transition-colors ${
                          selectedTafsilName === row.name
                            ? 'bg-teal-50 dark:bg-teal-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 px-3 font-mono tabular-nums font-bold text-teal-700 dark:text-teal-300">
                          {row.code}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">{row.name}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">{row.count}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">{formatRials(row.debit)}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">{formatRials(row.credit)}</td>
                        <td className="py-2 px-3 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                          {net > 0 ? formatRials(net) : '۰'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                          {net < 0 ? formatRials(Math.abs(net)) : '۰'}
                        </td>
                      </tr>
                    );
                  })}
                  {tafsilSummaryRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        گردشی برای تفصیل‌ها یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Running-Balance Account Card */}
        {(selectedAccountId || selectedTafsilName) && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-indigo-900 dark:text-indigo-200">
                  کارت حساب (ریز گردش با مانده تجمعی): {cardTitle}
                </h3>
                <div className="text-[11px] text-slate-500 mt-0.5">{accountCardRows.length} ردیف آرتیکل ثبت‌شده</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printLedgerCard(cardTitle)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>چاپ کارت حساب</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToCsv(
                      `کارت_حساب_${cardTitle}`,
                      ['شماره سند', 'تاریخ', 'کد حساب', 'تفصیل', 'شرح', 'بدهکار', 'بستانکار', 'مانده', 'تشخیص'],
                      accountCardRows.map(r => [
                        r.voucherNo,
                        r.dateJalali,
                        r.accountCode,
                        r.tafziliName,
                        r.description,
                        r.debit,
                        r.credit,
                        r.runningBalance,
                        r.balanceSide
                      ])
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} />
                  <span>اکسل CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
              <table className="w-full text-right text-xs min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px]">
                    <th className="py-2 px-2">سند</th>
                    <th className="py-2 px-2">تاریخ</th>
                    <th className="py-2 px-2">کد حساب</th>
                    <th className="py-2 px-2">تفصیل</th>
                    <th className="py-2 px-2">شرح آرتیکل</th>
                    <th className="py-2 px-2">بدهکار</th>
                    <th className="py-2 px-2">بستانکار</th>
                    <th className="py-2 px-2">مانده تجمعی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {accountCardRows.map(r => (
                    <tr key={r.lineId}>
                      <td className="py-2 px-2 font-mono font-bold text-indigo-600">#{r.voucherNo}</td>
                      <td className="py-2 px-2 font-mono text-slate-500">{r.dateJalali}</td>
                      <td className="py-2 px-2 font-mono">{r.accountCode}</td>
                      <td className="py-2 px-2">{r.tafziliName}</td>
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300">{r.description}</td>
                      <td className="py-2 px-2 font-mono tabular-nums text-emerald-700 dark:text-emerald-300 font-bold">
                        {formatRials(r.debit)}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums text-indigo-700 dark:text-indigo-300 font-bold">
                        {formatRials(r.credit)}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums font-black">
                        {formatRials(r.runningBalance)} <span className="text-[10px] text-slate-500">({r.balanceSide})</span>
                      </td>
                    </tr>
                  ))}
                  {accountCardRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">
                        آرتیکلی در این بازه زمانی یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: fin_trial_balance (2/4/6-Col Trial Balance + Journal + Summary)
  // =========================================================================
  if (activeSubView === 'fin_trial_balance') {
    const tbRows =
      tbDepthFilter === 'LEAF'
        ? trialBalanceLeaf
        : tbDepthFilter === 'KOL'
        ? trialBalanceRolled.filter(r => r.level === 'KOL')
        : tbDepthFilter === 'MOEIN'
        ? trialBalanceRolled.filter(r => r.level === 'MOEIN')
        : trialBalanceRolled;

    const tbTotals = tbRows.reduce(
      (acc, r) => ({
        openD: acc.openD + r.openingDebit,
        openC: acc.openC + r.openingCredit,
        perD: acc.perD + r.periodDebit,
        perC: acc.perC + r.periodCredit,
        totD: acc.totD + r.totalDebit,
        totC: acc.totC + r.totalCredit,
        endD: acc.endD + r.endingDebit,
        endC: acc.endC + r.endingCredit
      }),
      { openD: 0, openC: 0, perD: 0, perC: 0, totD: 0, totC: 0, endD: 0, endC: 0 }
    );

    const journalLines = computeAccountCardLines(vouchers, (_l, v) => {
      if (!includeDrafts && v.status === 'DRAFT') return false;
      if (dateFrom && v.dateJalali && v.dateJalali < dateFrom) return false;
      if (dateTo && v.dateJalali && v.dateJalali > dateTo) return false;
      return true;
    });

    const summaryByType = Object.keys(VOUCHER_TYPE_META)
      .map(typeKey => {
        const list = vouchers.filter(v => {
          if (v.type !== typeKey) return false;
          if (!includeDrafts && v.status === 'DRAFT') return false;
          if (dateFrom && v.dateJalali && v.dateJalali < dateFrom) return false;
          if (dateTo && v.dateJalali && v.dateJalali > dateTo) return false;
          return true;
        });
        const debit = list.reduce(
          (s, v) => s + (v.lines || []).reduce((ls, l) => ls + (Number(l.debit) || 0), 0),
          0
        );
        const credit = list.reduce(
          (s, v) => s + (v.lines || []).reduce((ls, l) => ls + (Number(l.credit) || 0), 0),
          0
        );
        return {
          type: typeKey as keyof typeof VOUCHER_TYPE_META,
          label: VOUCHER_TYPE_META[typeKey as keyof typeof VOUCHER_TYPE_META].label,
          count: list.length,
          debit,
          credit
        };
      })
      .filter(x => x.count > 0);

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Scale size={18} className="text-indigo-600" />
                <span>تراز آزمایشی (۲، ۴ و ۶ ستونی)، دفتر روزنامه و سند خلاصه — «{selectedCompany.name}»</span>
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'TB2', label: 'تراز ۲ ستونی' },
                  { id: 'TB4', label: 'تراز ۴ ستونی' },
                  { id: 'TB6', label: 'تراز ۶ ستونی' },
                  { id: 'JOURNAL', label: 'دفتر روزنامه' },
                  { id: 'SUMMARY', label: 'سند خلاصه' }
                ] as const
              ).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTbMode(m.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    tbMode === m.id
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  exportRowsToCsv(
                    `تراز_آزمایشی_${selectedCompany.name}`,
                    ['کد حساب', 'عنوان حساب', 'افتتاحیه بدهکار', 'افتتاحیه بستانکار', 'گردش بدهکار', 'گردش بستانکار', 'مانده بدهکار', 'مانده بستانکار'],
                    tbRows.map(r => [
                      r.code,
                      r.title,
                      r.openingDebit,
                      r.openingCredit,
                      r.periodDebit,
                      r.periodCredit,
                      r.endingDebit,
                      r.endingCredit
                    ])
                  )
                }
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Download size={14} />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 text-xs items-center">
            {tbMode.startsWith('TB') && (
              <div className="lg:col-span-3">
                <select
                  value={tbDepthFilter}
                  onChange={e => setTbDepthFilter(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  <option value="LEAF">سطح ثبت اسناد (بدون همپوشانی)</option>
                  <option value="KOL">تراز تجمیعی در سطح کل</option>
                  <option value="MOEIN">تراز تجمیعی در سطح معین</option>
                  <option value="ALL">تمام سطوح درختی</option>
                </select>
              </div>
            )}
            <div className="lg:col-span-2">
              <input
                type="text"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                placeholder="از تاریخ"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center"
              />
            </div>
            <div className="lg:col-span-2">
              <input
                type="text"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                placeholder="تا تاریخ"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center"
              />
            </div>
            <label className="lg:col-span-2 flex items-center gap-2 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithTurnover}
                onChange={e => setOnlyWithTurnover(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span>فقط دارای گردش</span>
            </label>
            <label className="lg:col-span-3 flex items-center gap-2 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={includeDrafts}
                onChange={e => setIncludeDrafts(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span>احتساب اسناد پیش‌نویس</span>
            </label>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          {tbMode.startsWith('TB') && (
            <table className="w-full text-right text-xs min-w-[780px]">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">کد حساب</th>
                  <th className="py-2.5 px-3">عنوان حساب</th>
                  {tbMode === 'TB6' && (
                    <>
                      <th className="py-2.5 px-3">افتتاحیه بدهکار</th>
                      <th className="py-2.5 px-3">افتتاحیه بستانکار</th>
                    </>
                  )}
                  {(tbMode === 'TB4' || tbMode === 'TB6') && (
                    <>
                      <th className="py-2.5 px-3">{tbMode === 'TB6' ? 'گردش طی دوره بد' : 'گردش کل بدهکار'}</th>
                      <th className="py-2.5 px-3">{tbMode === 'TB6' ? 'گردش طی دوره بس' : 'گردش کل بستانکار'}</th>
                    </>
                  )}
                  <th className="py-2.5 px-3">مانده بدهکار</th>
                  <th className="py-2.5 px-3">مانده بستانکار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tbRows.map(r => (
                  <tr key={r.accountId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                      {r.code}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">{r.title}</td>
                    {tbMode === 'TB6' && (
                      <>
                        <td className="py-2 px-3 font-mono tabular-nums">{formatRials(r.openingDebit)}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">{formatRials(r.openingCredit)}</td>
                      </>
                    )}
                    {(tbMode === 'TB4' || tbMode === 'TB6') && (
                      <>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          {formatRials(tbMode === 'TB6' ? r.periodDebit : r.totalDebit)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          {formatRials(tbMode === 'TB6' ? r.periodCredit : r.totalCredit)}
                        </td>
                      </>
                    )}
                    <td className="py-2 px-3 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                      {formatRials(r.endingDebit)}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                      {formatRials(r.endingCredit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-800 font-black border-t-2 border-slate-300 dark:border-slate-700">
                <tr>
                  <td colSpan={2} className="py-2.5 px-3">جمع کل تراز آزمایشی (ریال)</td>
                  {tbMode === 'TB6' && (
                    <>
                      <td className="py-2.5 px-3 font-mono tabular-nums">{formatRials(tbTotals.openD)}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">{formatRials(tbTotals.openC)}</td>
                    </>
                  )}
                  {(tbMode === 'TB4' || tbMode === 'TB6') && (
                    <>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {formatRials(tbMode === 'TB6' ? tbTotals.perD : tbTotals.totD)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {formatRials(tbMode === 'TB6' ? tbTotals.perC : tbTotals.totC)}
                      </td>
                    </>
                  )}
                  <td className="py-2.5 px-3 font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatRials(tbTotals.endD)}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-indigo-700 dark:text-indigo-300">
                    {formatRials(tbTotals.endC)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {tbMode === 'JOURNAL' && (
            <table className="w-full text-right text-xs min-w-[780px]">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">شماره سند</th>
                  <th className="py-2.5 px-3">تاریخ</th>
                  <th className="py-2.5 px-3">کد حساب</th>
                  <th className="py-2.5 px-3">عنوان حساب</th>
                  <th className="py-2.5 px-3">تفصیل</th>
                  <th className="py-2.5 px-3">شرح عملیات</th>
                  <th className="py-2.5 px-3">بدهکار</th>
                  <th className="py-2.5 px-3">بستانکار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {journalLines.map(r => (
                  <tr key={r.lineId}>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-600">#{r.voucherNo}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{r.dateJalali}</td>
                    <td className="py-2 px-3 font-mono">{r.accountCode}</td>
                    <td className="py-2 px-3 font-semibold">{r.accountTitle}</td>
                    <td className="py-2 px-3">{r.tafziliName}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{r.description}</td>
                    <td className="py-2 px-3 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                      {formatRials(r.debit)}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                      {formatRials(r.credit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tbMode === 'SUMMARY' && (
            <table className="w-full text-right text-xs min-w-[600px]">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">گروه نوع سند</th>
                  <th className="py-2.5 px-3">تعداد اسناد</th>
                  <th className="py-2.5 px-3">جمع بدهکار (ریال)</th>
                  <th className="py-2.5 px-3">جمع بستانکار (ریال)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summaryByType.map(s => (
                  <tr key={s.type}>
                    <td className="py-2.5 px-3 font-bold">{s.label}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">{s.count}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                      {formatRials(s.debit)}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                      {formatRials(s.credit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: fin_financial_statements (Income Statement, Balance Sheet, COGM)
  // =========================================================================
  if (activeSubView === 'fin_financial_statements') {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-600" />
              <span>صورت‌های مالی اساسی و گزارش بهای تمام‌شده صنعتی — «{selectedCompany.name}»</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              محاسبه‌شده مستقیم از دفتر کل و اسناد تولید برای دوره مالی {activeFiscalYear} (واحد: ریال).
            </p>
          </div>
          <button
            type="button"
            onClick={printFinancialStatements}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Printer size={15} />
            <span>چاپ رسمی صورت‌های مالی</span>
          </button>
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-slate-500">جمع درآمد و فروش</div>
            <div className="font-mono tabular-nums font-black text-lg text-emerald-700 dark:text-emerald-300 mt-1">
              {formatRials(statements.totalRevenue)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-slate-500">سود (زیان) خالص دوره</div>
            <div
              className={`font-mono tabular-nums font-black text-lg mt-1 ${
                statements.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'
              }`}
            >
              {formatRials(statements.netProfit)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-slate-500">جمع کل دارایی‌ها</div>
            <div className="font-mono tabular-nums font-black text-lg text-indigo-700 dark:text-indigo-300 mt-1">
              {formatRials(statements.totalAssets)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-slate-500">وضعیت معادله ترازنامه</div>
            <div
              className={`font-black text-sm mt-1.5 ${
                statements.isBalanceSheetBalanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-600'
              }`}
            >
              {statements.isBalanceSheetBalanced
                ? 'متوازن (دارایی = بدهی + سرمایه)'
                : `اختلاف: ${formatRials(Math.abs(statements.totalAssets - statements.totalLiabilitiesAndEquity))}`}
            </div>
          </div>
        </div>

        {/* Income Statement + Balance Sheet */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Income Statement */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs">
            <h3 className="font-black text-sm border-b border-slate-200 dark:border-slate-800 pb-2">
              ۱. صورت سود و زیان
            </h3>
            <div className="space-y-2">
              <div className="font-bold text-emerald-700 dark:text-emerald-300">درآمدها و فروش</div>
              {statements.revenues.map(r => (
                <div key={r.code} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span><span className="font-mono text-slate-400 ml-2">{r.code}</span>{r.title}</span>
                  <span className="font-mono tabular-nums font-bold">{formatRials(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1.5 font-black bg-emerald-50/60 dark:bg-emerald-950/30 px-2 rounded-lg">
                <span>جمع درآمدهای عملیاتی</span>
                <span className="font-mono tabular-nums">{formatRials(statements.totalRevenue)}</span>
              </div>

              <div className="font-bold text-orange-700 dark:text-orange-300 pt-2">بهای تمام‌شده و تولید صنعتی</div>
              {statements.cogsItems.map(r => (
                <div key={r.code} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span><span className="font-mono text-slate-400 ml-2">{r.code}</span>{r.title}</span>
                  <span className="font-mono tabular-nums font-bold">{formatRials(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1.5 font-black bg-slate-100 dark:bg-slate-800 px-2 rounded-lg">
                <span>سود (زیان) ناخالص</span>
                <span className="font-mono tabular-nums">{formatRials(statements.grossProfit)}</span>
              </div>

              <div className="font-bold text-rose-700 dark:text-rose-300 pt-2">هزینه‌های اداری، عمومی و فروش</div>
              {statements.expenses.map(r => (
                <div key={r.code} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span><span className="font-mono text-slate-400 ml-2">{r.code}</span>{r.title}</span>
                  <span className="font-mono tabular-nums font-bold">{formatRials(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 font-black bg-slate-900 dark:bg-indigo-600 text-white px-3 rounded-xl text-sm">
                <span>سود (زیان) خالص دوره</span>
                <span className="font-mono tabular-nums">{formatRials(statements.netProfit)} ریال</span>
              </div>
            </div>
          </div>

          {/* Balance Sheet */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs">
            <h3 className="font-black text-sm border-b border-slate-200 dark:border-slate-800 pb-2">
              ۲. ترازنامه (صورت وضعیت مالی)
            </h3>
            <div className="space-y-2">
              <div className="font-bold text-indigo-700 dark:text-indigo-300">دارایی‌ها</div>
              {statements.assets.map(r => (
                <div key={r.code} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span><span className="font-mono text-slate-400 ml-2">{r.code}</span>{r.title}</span>
                  <span className="font-mono tabular-nums font-bold">{formatRials(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1.5 font-black bg-indigo-50/70 dark:bg-indigo-950/30 px-2 rounded-lg">
                <span>جمع کل دارایی‌ها</span>
                <span className="font-mono tabular-nums">{formatRials(statements.totalAssets)}</span>
              </div>

              <div className="font-bold text-amber-700 dark:text-amber-300 pt-2">بدهی‌ها</div>
              {statements.liabilities.map(r => (
                <div key={r.code} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span><span className="font-mono text-slate-400 ml-2">{r.code}</span>{r.title}</span>
                  <span className="font-mono tabular-nums font-bold">{formatRials(r.amount)}</span>
                </div>
              ))}

              <div className="font-bold text-teal-700 dark:text-teal-300 pt-2">حقوق صاحبان سهام</div>
              {statements.equity.map(r => (
                <div key={r.code} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span><span className="font-mono text-slate-400 ml-2">{r.code}</span>{r.title}</span>
                  <span className="font-mono tabular-nums font-bold">{formatRials(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span>سود (زیان) خالص دوره جاری</span>
                <span className="font-mono tabular-nums font-bold">{formatRials(statements.netProfit)}</span>
              </div>
              <div className="flex justify-between py-2 font-black bg-slate-900 dark:bg-emerald-700 text-white px-3 rounded-xl text-sm">
                <span>جمع بدهی‌ها و حقوق صاحبان سهام</span>
                <span className="font-mono tabular-nums">{formatRials(statements.totalLiabilitiesAndEquity)} ریال</span>
              </div>
            </div>
          </div>
        </div>

        {/* Industrial Costing Report */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-orange-200 dark:border-orange-900/60 p-4 space-y-3 text-xs">
          <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Factory size={17} className="text-orange-600" />
            <span>۳. گزارش بهای تمام‌شده کالای ساخته‌شده (حسابداری صنعتی)</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">مواد اولیه مستقیم</div>
              <div className="font-mono tabular-nums font-black text-sm mt-1">
                {formatRials(statements.industrialCosting.directMaterial)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">دستمزد مستقیم تولید</div>
              <div className="font-mono tabular-nums font-black text-sm mt-1">
                {formatRials(statements.industrialCosting.directLabor)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">سربار ساخت کارخانه</div>
              <div className="font-mono tabular-nums font-black text-sm mt-1">
                {formatRials(statements.industrialCosting.factoryOverhead)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900">
              <div className="text-[11px] text-orange-800 dark:text-orange-300">کل بهای تمام‌شده تولید</div>
              <div className="font-mono tabular-nums font-black text-sm text-orange-900 dark:text-orange-200 mt-1">
                {formatRials(statements.industrialCosting.totalManufacturedCost)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">وزن خالص تولید (کیلوگرم)</div>
              <div className="font-mono tabular-nums font-black text-sm mt-1">
                {statements.industrialCosting.totalNetWeightKg.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div className="text-[11px] text-emerald-800 dark:text-emerald-300">بهای هر کیلوگرم (ریال)</div>
              <div className="font-mono tabular-nums font-black text-sm text-emerald-800 dark:text-emerald-200 mt-1">
                {formatRials(statements.industrialCosting.avgCostPerKg)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 4: fin_year_end (Year-End Closing, Overhead Allocation + Sayan Cutover)
  // =========================================================================
  if (activeSubView === 'fin_year_end') {
    const pctSum = allocationTargets.reduce((s, t) => s + (Number(t.percent) || 0), 0);

    return (
      <div className="space-y-4">
        {/* Overhead & Industrial Cost Allocation */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Factory size={17} className="text-orange-600" />
              <span>تسهیم سربار و هزینه‌های تولید به خطوط / مراکز هزینه (حسابداری صنعتی)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مبلغ هزینه یا سربار ساخت را بر اساس درصد سهم هر خط تولید به حساب کالای در جریان ساخت تسهیم و سند دوبل صادر می‌کند.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold mb-1">حساب مبدا سربار / هزینه</label>
              <select
                value={overheadSourceCode}
                onChange={e => setOverheadSourceCode(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold mb-1">مبلغ کل قابل تسهیم (ریال)</label>
              <input
                type="number"
                value={overheadAmount}
                onChange={e => setOverheadAmount(e.target.value)}
                placeholder="مثلاً 500000000"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">شرح سند تسهیم</label>
              <input
                type="text"
                value={overheadNote}
                onChange={e => setOverheadNote(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {allocationTargets.map((t, idx) => (
              <div key={t.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <input
                  type="text"
                  value={t.targetName}
                  onChange={e =>
                    setAllocationTargets(prev => prev.map((x, i) => (i === idx ? { ...x, targetName: e.target.value } : x)))
                  }
                  placeholder="نام مرکز هزینه / خط تولید"
                  className="sm:col-span-4 min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                />
                <select
                  value={t.accountCode}
                  onChange={e =>
                    setAllocationTargets(prev => prev.map((x, i) => (i === idx ? { ...x, accountCode: e.target.value } : x)))
                  }
                  className="sm:col-span-5 min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.code}>
                      {a.code} — {a.title}
                    </option>
                  ))}
                </select>
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={t.percent}
                    onChange={e =>
                      setAllocationTargets(prev =>
                        prev.map((x, i) => (i === idx ? { ...x, percent: Number(e.target.value) || 0 } : x))
                      )
                    }
                    className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums font-bold text-center"
                  />
                  <span className="font-bold text-slate-500">٪</span>
                  {allocationTargets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setAllocationTargets(prev => prev.filter((_, i) => i !== idx))}
                      className="px-2 py-1 text-rose-600 font-bold cursor-pointer"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() =>
                  setAllocationTargets(prev => [
                    ...prev,
                    {
                      id: `t_${Date.now()}`,
                      targetName: `مرکز هزینه ${prev.length + 1}`,
                      accountCode: settings.defaultAccounts.wipProduction || '110302',
                      percent: Math.max(0, 100 - pctSum)
                    }
                  ])
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 font-bold cursor-pointer"
              >
                + افزودن مرکز هزینه مقصد
              </button>
              <span className={`font-mono font-black ${Math.abs(pctSum - 100) < 0.01 ? 'text-emerald-700' : 'text-rose-600'}`}>
                جمع درصدها: {pctSum}٪
              </span>
            </div>
            <button
              type="button"
              onClick={handlePostOverheadAllocation}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black cursor-pointer"
            >
              صدور سند دوبل تسهیم سربار
            </button>
          </div>
        </div>

        {/* Year-End Closing & Opening Vouchers */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
          <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar size={17} className="text-indigo-600" />
            <span>عملیات بستن حساب‌ها و انتقال به دوره مالی جدید (دوره فعلی: {activeFiscalYear})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col justify-between gap-3">
              <div>
                <div className="font-black text-slate-900 dark:text-white">۱. بستن حساب‌های موقت</div>
                <p className="text-[11px] text-slate-500 mt-1">
                  تمام مانده‌های درآمد، بهای تمام‌شده و هزینه‌ها را بسته و سود/زیان خالص ({formatRials(statements.netProfit)} ریال) را به سود انباشته ({settings.defaultAccounts.retainedEarnings}) منتقل می‌کند.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseTemporaryAccounts}
                className="w-full min-h-[40px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black cursor-pointer"
              >
                صدور سند بستن حساب‌های موقت
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col justify-between gap-3">
              <div>
                <div className="font-black text-slate-900 dark:text-white">۲. صدور سند اختتامیه</div>
                <p className="text-[11px] text-slate-500 mt-1">
                  حساب‌های دائم ترازنامه (دارایی، بدهی و سرمایه) را در پایان سال مالی {activeFiscalYear} می‌بندد.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleIssuePermanentVoucher('CLOSING')}
                className="w-full min-h-[40px] py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black cursor-pointer"
              >
                صدور سند اختتامیه {activeFiscalYear}
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col justify-between gap-3">
              <div className="space-y-2">
                <div className="font-black text-slate-900 dark:text-white">۳. صدور سند افتتاحیه دوره جدید</div>
                <p className="text-[11px] text-slate-500">
                  مانده حساب‌های دائم را به عنوان سند افتتاحیه به سال مالی مقصد منتقل می‌کند.
                </p>
                <input
                  type="text"
                  value={nextYearLabel}
                  onChange={e => setNextYearLabel(e.target.value)}
                  placeholder="سال مالی مقصد (مثلاً 1406)"
                  className="w-full min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-center"
                />
              </div>
              <button
                type="button"
                onClick={() => handleIssuePermanentVoucher('OPENING')}
                className="w-full min-h-[40px] py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black cursor-pointer"
              >
                صدور سند افتتاحیه دوره {nextYearLabel}
              </button>
            </div>
          </div>
        </div>

        {/* Preserved Sayan Cutover 3-Stage Config & Trial Balance Import */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 p-4 sm:p-5 space-y-4">
          <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders size={18} className="text-indigo-600" />
            <span>مراحل گذار از سایان و انتقال تراز افتتاحیه در «{selectedCompany.name}»</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              onClick={() => handleToggleCutoverStage('stage1FactoryWarehouseActive')}
              className={`p-4 rounded-xl border-2 cursor-pointer ${
                erpState.cutoverConfig?.stage1FactoryWarehouseActive !== false
                  ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="font-black text-xs text-emerald-800 dark:text-emerald-300">
                مرحله ۱: انبار کارخانه، باسکول و بارکدها (فعال)
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                توزین باسکول، اسکن بارکدهای سایان و دلکام، و صدور خروج کارخانه بدون فی.
              </p>
            </div>
            <div
              onClick={() => handleToggleCutoverStage('stage2TehranPricingInvoiceActive')}
              className={`p-4 rounded-xl border-2 cursor-pointer ${
                erpState.cutoverConfig?.stage2TehranPricingInvoiceActive !== false
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="font-black text-xs text-indigo-800 dark:text-indigo-300">
                مرحله ۲: قیمت‌گذاری دفتر تهران و فاکتور نهایی
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                تبدیل حواله خروج بدون فی کارخانه به فاکتور نهایی و سند فروش در دفتر تهران.
              </p>
            </div>
            <div
              onClick={() => handleToggleCutoverStage('stage3PaymentOrdersAutoVoucherActive')}
              className={`p-4 rounded-xl border-2 cursor-pointer ${
                erpState.cutoverConfig?.stage3PaymentOrdersAutoVoucherActive
                  ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/30'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="font-black text-xs text-amber-800 dark:text-amber-300">
                مرحله ۳: اتصال خودکار دستور پرداخت و رسید دریافت به بانک‌های حسابداری
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                با فعال‌سازی این مرحله، تایید نهایی دستور پرداخت یا رسید چک، خودکار سند حسابداری صادر می‌کند.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-black text-xs text-slate-900 dark:text-white">
                انتقال تراز دقیق مانده حساب‌ها و اشخاص از سایان تا تاریخ مشخص به «{selectedCompany.name}»
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                تراز آزمایشی سایان تا تاریخ انتخابی خوانده شده و به عنوان سند افتتاحیه تراز در این شرکت ثبت می‌شود.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={cutoffDateInput}
                onChange={e => setCutoffDateInput(e.target.value)}
                placeholder="1405/08/20"
                className="w-32 min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-xs text-center"
              />
              <button
                type="button"
                onClick={handleImportSayanTrialBalance}
                disabled={importingTrialBalance}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer"
              >
                دریافت تراز سایان و صدور سند افتتاحیه
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 5: fin_settings (Fiscal Years & Accounting Settings)
  // =========================================================================
  const fiscalYears = Array.from(
    new Set([activeFiscalYear, ...(erpState.fiscalYears || ['1404', '1405'])])
  ).sort();

  const saveAccountingSettings = async (patch: Partial<typeof settings>, nextActiveYear?: string, nextFiscalYears?: string[], toastMsg?: string) => {
    await persistErpState(
      {
        ...erpState,
        activeFiscalYear: nextActiveYear || erpState.activeFiscalYear,
        fiscalYears: nextFiscalYears || erpState.fiscalYears || fiscalYears,
        cutoverConfig: {
          ...(erpState.cutoverConfig || {
            stage1FactoryWarehouseActive: true,
            stage2TehranPricingInvoiceActive: true,
            stage3PaymentOrdersAutoVoucherActive: false,
            lastSayanBarcodeSyncAt: null,
            lastSayanBarcodeSyncCount: 0,
            lastTrialBalanceCutoffDate: '',
            lastTrialBalanceImportAt: null,
            defaultPaymentBankAccountCode: '110101',
            defaultReceivableAccountCode: '110201',
            defaultPayableAccountCode: '210101'
          }),
          accountingSettings: {
            ...settings,
            ...patch
          }
        }
      },
      toastMsg || 'تنظیمات حسابداری ذخیره شد.'
    );
  };

  return (
    <div className="space-y-4">
      {/* Fiscal Years Manager */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar size={18} className="text-indigo-600" />
              <span>مدیریت دوره‌های مالی — «{selectedCompany.name}»</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تعریف سال مالی جدید، تغییر دوره فعال و قفل‌گذاری دوره‌های بسته‌شده جهت جلوگیری از ویرایش ناخواسته.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newFiscalYearInput}
              onChange={e => setNewFiscalYearInput(e.target.value)}
              placeholder="سال جدید (مثلاً 1406)"
              className="w-36 min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs text-center"
            />
            <button
              type="button"
              onClick={async () => {
                const yr = newFiscalYearInput.trim();
                if (!yr) return;
                if (fiscalYears.includes(yr)) {
                  showToast('error', `دوره مالی ${yr} هم‌اکنون موجود است.`);
                  return;
                }
                await saveAccountingSettings({}, undefined, [...fiscalYears, yr], `دوره مالی ${yr} اضافه شد.`);
                setNewFiscalYearInput('');
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} />
              <span>افزودن سال مالی</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {fiscalYears.map(yr => {
            const isActive = yr === activeFiscalYear;
            const isLocked = settings.lockedFiscalYears.includes(yr);
            return (
              <div
                key={yr}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                    سال مالی {yr}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isActive ? 'دوره فعال فعلی' : 'قابل انتخاب'} • {isLocked ? 'قفل‌شده' : 'باز'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => saveAccountingSettings({}, yr, fiscalYears, `دوره مالی فعال به ${yr} تغییر یافت.`)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[11px] cursor-pointer"
                    >
                      فعال‌سازی
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const nextLocked = isLocked
                        ? settings.lockedFiscalYears.filter(x => x !== yr)
                        : [...settings.lockedFiscalYears, yr];
                      saveAccountingSettings(
                        { lockedFiscalYears: nextLocked },
                        undefined,
                        undefined,
                        isLocked ? `قفل دوره مالی ${yr} باز شد.` : `دوره مالی ${yr} قفل شد.`
                      );
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                      isLocked
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                    }`}
                  >
                    {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                    <span>{isLocked ? 'باز کردن' : 'قفل دوره'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-Voucher & Default Account Mapping */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Settings size={17} className="text-indigo-600" />
              <span>تنظیمات سند اتوماتیک مالی و کدهای پیش‌فرض حسابداری</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              اگر کدینگ استاندارد را ویرایش کردید، سرفصل‌های پیش‌فرض موتور سند اتوماتیک و بستن حساب‌ها را اینجا منطبق کنید.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              saveAccountingSettings(
                {
                  allowEditFinalizedVoucher: draftAllowEditFinal,
                  autoVoucherEnabled: draftAutoVoucher,
                  defaultAccounts: draftDefaults
                },
                undefined,
                undefined,
                'تنظیمات سند اتوماتیک و کدهای پیش‌فرض ذخیره شد.'
              )
            }
            className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Check size={15} />
            <span>ذخیره تنظیمات حسابداری</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 cursor-pointer font-bold">
            <input
              type="checkbox"
              checked={draftAllowEditFinal}
              onChange={e => setDraftAllowEditFinal(e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            <span>اجازه ویرایش و حذف اسناد قطعی</span>
          </label>
          {(
            [
              { key: 'production', label: 'سند اتوماتیک تولید و بهای تمام‌شده' },
              { key: 'warehouse', label: 'سند اتوماتیک انبارداری' },
              { key: 'sales', label: 'سند اتوماتیک فاکتور فروش' },
              { key: 'purchase', label: 'سند اتوماتیک فاکتور خرید' },
              { key: 'treasury', label: 'سند اتوماتیک خزانه‌داری و بانک' }
            ] as const
          ).map(item => (
            <label
              key={item.key}
              className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 cursor-pointer font-bold"
            >
              <input
                type="checkbox"
                checked={draftAutoVoucher[item.key]}
                onChange={e =>
                  setDraftAutoVoucher(prev => ({ ...prev, [item.key]: e.target.checked }))
                }
                className="w-4 h-4 accent-emerald-600"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs pt-2">
          {DEFAULT_ACCOUNT_LABELS.map(item => (
            <div key={item.key}>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                {item.label}
              </label>
              <select
                value={draftDefaults[item.key]}
                onChange={e =>
                  setDraftDefaults(prev => ({ ...prev, [item.key]: e.target.value }))
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {!accounts.some(a => a.code === draftDefaults[item.key]) && (
                  <option value={draftDefaults[item.key]}>{draftDefaults[item.key]} (کد فعلی)</option>
                )}
                {accounts.map(a => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.title}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
