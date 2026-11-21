import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FilePlus2,
  Paperclip,
  Plus,
  Printer,
  Scale,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap
} from 'lucide-react';
import { User } from '../../../types';
import {
  ErpCompanySummary,
  ErpSubViewId,
  ErpSupportingDoc,
  ErpVoucher,
  ErpVoucherLine,
  ErpVoucherType,
  IndustrialErpState,
  getTodayJalali
} from '../types';
import { matchesSearchQuery } from '../erpCodeUtils';
import {
  AutoVoucherCandidate,
  QuickAutoTemplateId,
  SUPPORTING_DOC_TYPE_META,
  VOUCHER_STATUS_META,
  VOUCHER_TYPE_META,
  buildQuickAutoTemplate,
  exportRowsToCsv,
  formatRials,
  getEffectiveAccountingSettings,
  getTafsilFullPath,
  printVoucherDocument,
  scanPendingAutoVoucherCandidates
} from './accountingUtils';

interface VoucherEditorAndArchiveViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  erpState: IndustrialErpState;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser: User;
  showToast: (type: 'success' | 'error', text: string) => void;
  editingVoucherId: string | null;
  onStartEditVoucher: (voucherId: string) => void;
  onClearEditingVoucher: () => void;
  openSubViewTab?: (id: ErpSubViewId) => void;
}

const VOUCHER_TYPES_ORDER: ErpVoucherType[] = [
  'GENERAL',
  'AUTO_FINANCIAL',
  'PRODUCTION',
  'WAREHOUSE',
  'SALES',
  'PURCHASE',
  'TREASURY',
  'PAYROLL',
  'RETURN',
  'OPENING_CUTOVER',
  'CLOSING',
  'ADJUSTMENT'
];

const QUICK_TEMPLATES: { id: QuickAutoTemplateId; title: string; subtitle: string; hasVat: boolean }[] = [
  { id: 'PURCHASE_RAW_VAT', title: 'خرید مواد اولیه + ارزش افزوده', subtitle: 'بدهکار: موجودی مواد و اعتبار مالیاتی | بستانکار: پرداختنی', hasVat: true },
  { id: 'SALES_PRODUCT_VAT', title: 'فروش محصول + ارزش افزوده', subtitle: 'بدهکار: دریافتنی مشتریان | بستانکار: فروش و مالیات فروش', hasVat: true },
  { id: 'PRODUCTION_ABSORPTION', title: 'جذب بهای تمام‌شده تولید', subtitle: 'بدهکار: کالای ساخته‌شده | بستانکار: مواد، دستمزد و سربار', hasVat: false },
  { id: 'BANK_RECEIPT', title: 'دریافت وجه / واریز بانکی', subtitle: 'بدهکار: نقد و بانک | بستانکار: حساب دریافتنی مشتری', hasVat: false },
  { id: 'BANK_PAYMENT', title: 'پرداخت وجه به تامین‌کننده', subtitle: 'بدهکار: حساب پرداختنی | بستانکار: نقد و بانک', hasVat: false },
  { id: 'OVERHEAD_EXPENSE', title: 'ثبت هزینه سربار و عملیاتی', subtitle: 'بدهکار: سربار ساخت / هزینه | بستانکار: بانک / تنخواه', hasVat: false }
];

function createEmptyLine(defaultAccCode = '1101', defaultAccTitle = 'موجودی نقد و بانک‌ها'): ErpVoucherLine {
  return {
    id: `vl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    accountCode: defaultAccCode,
    accountTitle: defaultAccTitle,
    tafziliCode: '',
    tafziliName: '',
    tafziliPath: [],
    debit: 0,
    credit: 0,
    description: ''
  };
}

export const VoucherEditorAndArchiveView: React.FC<VoucherEditorAndArchiveViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  persistErpState,
  currentUser,
  showToast,
  editingVoucherId,
  onStartEditVoucher,
  onClearEditingVoucher,
  openSubViewTab
}) => {
  const settings = useMemo(() => getEffectiveAccountingSettings(erpState), [erpState]);
  const activeFiscalYear = erpState.activeFiscalYear || selectedCompany.activeFiscalYear || '1405';
  const isYearLocked = settings.lockedFiscalYears.includes(activeFiscalYear);

  const accounts = useMemo(
    () =>
      [...(erpState.chartOfAccounts || [])].sort((a, b) =>
        String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true })
      ),
    [erpState.chartOfAccounts]
  );

  const postableAccounts = useMemo(() => {
    const filtered = accounts.filter(a => a.isActive !== false && a.acceptsVoucher !== false);
    return filtered.length > 0 ? filtered : accounts;
  }, [accounts]);

  const parties = useMemo(
    () =>
      [...(erpState.parties || [])].sort((a, b) =>
        String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true })
      ),
    [erpState.parties]
  );

  const vouchers = useMemo(() => erpState.vouchers || [], [erpState.vouchers]);

  // --- Voucher Editor State ---
  const [voucherNoInput, setVoucherNoInput] = useState<number>(erpState.nextVoucherNo || 1001);
  const [voucherDate, setVoucherDate] = useState<string>(getTodayJalali());
  const [voucherType, setVoucherType] = useState<ErpVoucherType>('GENERAL');
  const [voucherStatus, setVoucherStatus] = useState<ErpVoucher['status']>('FINALIZED');
  const [archiveCode, setArchiveCode] = useState<string>('');
  const [voucherDesc, setVoucherDesc] = useState<string>('');
  const [voucherRefId, setVoucherRefId] = useState<string>('');
  const [voucherAutoFlag, setVoucherAutoFlag] = useState<boolean>(false);
  const [lines, setLines] = useState<ErpVoucherLine[]>(() => {
    const firstAcc = postableAccounts[0];
    const secondAcc = postableAccounts[1] || firstAcc;
    return [
      createEmptyLine(firstAcc?.code || '1101', firstAcc?.title || 'موجودی نقد و بانک'),
      createEmptyLine(secondAcc?.code || '1102', secondAcc?.title || 'حساب‌های دریافتنی')
    ];
  });
  const [accountQuickFilter, setAccountQuickFilter] = useState<string>('');
  const [savingVoucher, setSavingVoucher] = useState(false);

  // --- Auto-Voucher Panel State ---
  const [showAutoPanel, setShowAutoPanel] = useState<boolean>(true);
  const [autoPanelTab, setAutoPanelTab] = useState<'PENDING' | 'TEMPLATES'>('PENDING');
  const [tplId, setTplId] = useState<QuickAutoTemplateId>('PURCHASE_RAW_VAT');
  const [tplAmount, setTplAmount] = useState<string>('');
  const [tplVat, setTplVat] = useState<string>('10');
  const [tplParty, setTplParty] = useState<string>('');
  const [tplRef, setTplRef] = useState<string>('');
  const [tplNote, setTplNote] = useState<string>('');

  // --- Archive Filter State ---
  const [archiveTypeFilter, setArchiveTypeFilter] = useState<'ALL' | ErpVoucherType>('ALL');
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<'ALL' | ErpVoucher['status']>('ALL');
  const [archiveSearch, setArchiveSearch] = useState<string>('');
  const [archiveDateFrom, setArchiveDateFrom] = useState<string>('');
  const [archiveDateTo, setArchiveDateTo] = useState<string>('');
  const [expandedVoucherIds, setExpandedVoucherIds] = useState<Set<string>>(new Set());
  const [confirmDeleteVoucherId, setConfirmDeleteVoucherId] = useState<string | null>(null);

  // --- Supporting Docs State ---
  const [supSearch, setSupSearch] = useState('');
  const [supTypeFilter, setSupTypeFilter] = useState<'ALL' | ErpSupportingDoc['docType']>('ALL');
  const [confirmDeleteSupId, setConfirmDeleteSupId] = useState<string | null>(null);
  const [supForm, setSupForm] = useState<{
    editingId: string | null;
    docNo: string;
    title: string;
    docType: ErpSupportingDoc['docType'];
    dateJalali: string;
    amountRials: string;
    partyName: string;
    linkedVoucherId: string;
    referenceNo: string;
    notes: string;
  }>({
    editingId: null,
    docNo: '',
    title: '',
    docType: 'INVOICE',
    dateJalali: getTodayJalali(),
    amountRials: '',
    partyName: '',
    linkedVoucherId: '',
    referenceNo: '',
    notes: ''
  });

  // Sync editing voucher when editingVoucherId changes
  useEffect(() => {
    if (!editingVoucherId) {
      setVoucherNoInput(erpState.nextVoucherNo || 1001);
      return;
    }
    const target = vouchers.find(v => v.id === editingVoucherId);
    if (!target) return;
    setVoucherNoInput(target.voucherNo);
    setVoucherDate(target.dateJalali || getTodayJalali());
    setVoucherType(target.type || 'GENERAL');
    setVoucherStatus(target.status || 'FINALIZED');
    setArchiveCode(target.archiveCode || target.supportingDocRef || '');
    setVoucherDesc(target.description || '');
    setVoucherRefId(target.referenceId || '');
    setVoucherAutoFlag(Boolean(target.autoGenerated));
    setLines(
      (target.lines || []).length > 0
        ? target.lines.map(l => ({ ...l }))
        : [createEmptyLine(), createEmptyLine()]
    );
  }, [editingVoucherId, vouchers, erpState.nextVoucherNo]);

  const pendingAutoCandidates = useMemo(
    () => scanPendingAutoVoucherCandidates(erpState),
    [erpState]
  );

  const filteredAccountOptions = useMemo(() => {
    const q = accountQuickFilter.trim();
    if (!q) return postableAccounts;
    return postableAccounts.filter(a => matchesSearchQuery(q, [a.code, a.title, a.description]));
  }, [postableAccounts, accountQuickFilter]);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    const diff = debit - credit;
    return { debit, credit, diff, isBalanced: debit > 0 && Math.abs(diff) < 0.01 };
  }, [lines]);

  const resetEditorForNew = (nextNo?: number) => {
    onClearEditingVoucher();
    setVoucherNoInput(nextNo || erpState.nextVoucherNo || 1001);
    setVoucherDate(getTodayJalali());
    setVoucherType('GENERAL');
    setVoucherStatus('FINALIZED');
    setArchiveCode('');
    setVoucherDesc('');
    setVoucherRefId('');
    setVoucherAutoFlag(false);
    const firstAcc = postableAccounts[0];
    const secondAcc = postableAccounts[1] || firstAcc;
    setLines([
      createEmptyLine(firstAcc?.code || '1101', firstAcc?.title || 'موجودی نقد و بانک'),
      createEmptyLine(secondAcc?.code || '1102', secondAcc?.title || 'حساب‌های دریافتنی')
    ]);
  };

  // --- Voucher Editor Line Helpers ---
  const updateLine = (idx: number, patch: Partial<ErpVoucherLine>) => {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleAutoBalanceLine = (idx: number) => {
    const otherDebit = lines.reduce((s, l, i) => (i === idx ? s : s + (Number(l.debit) || 0)), 0);
    const otherCredit = lines.reduce((s, l, i) => (i === idx ? s : s + (Number(l.credit) || 0)), 0);
    const diff = otherDebit - otherCredit;
    if (diff > 0) {
      updateLine(idx, { debit: 0, credit: Math.round(diff) });
    } else if (diff < 0) {
      updateLine(idx, { debit: Math.round(Math.abs(diff)), credit: 0 });
    }
  };

  const handleMoveLine = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= lines.length) return;
    setLines(prev => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleSaveVoucher = async (overrideStatus?: ErpVoucher['status']) => {
    if (isYearLocked) {
      showToast('error', `دوره مالی «${activeFiscalYear}» قفل شده است. برای ثبت یا ویرایش، قفل دوره را در تنظیمات باز کنید.`);
      return;
    }

    const statusToSave = overrideStatus || voucherStatus;
    const cleanedLines = lines.filter(
      l => l.accountCode.trim() && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)
    );

    if (cleanedLines.length < 2) {
      showToast('error', 'سند دوبل باید حداقل شامل ۲ ردیف آرتیکل دارای مبلغ بدهکار یا بستانکار باشد.');
      return;
    }

    const sumD = cleanedLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const sumC = cleanedLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (statusToSave !== 'DRAFT' && (sumD <= 0 || Math.abs(sumD - sumC) > 0.01)) {
      showToast(
        'error',
        `سند نامتوازن است (اختلاف: ${formatRials(Math.abs(sumD - sumC))} ریال). برای ثبت موقت یا قطعی، جمع بدهکار و بستانکار باید برابر باشند.`
      );
      return;
    }

    const finalNo = Number(voucherNoInput) || erpState.nextVoucherNo || 1001;
    const dupNo = vouchers.find(v => v.voucherNo === finalNo && v.id !== editingVoucherId);
    if (dupNo) {
      showToast('error', `شماره سند #${finalNo} قبلاً در بایگانی ثبت شده است. لطفاً شماره دیگری انتخاب کنید.`);
      return;
    }

    setSavingVoucher(true);
    try {
      if (editingVoucherId) {
        const existing = vouchers.find(v => v.id === editingVoucherId);
        if (!existing) return;
        const updated: ErpVoucher = {
          ...existing,
          voucherNo: finalNo,
          dateJalali: voucherDate.trim() || getTodayJalali(),
          fiscalYear: existing.fiscalYear || activeFiscalYear,
          type: voucherType,
          status: statusToSave,
          archiveCode: archiveCode.trim() || undefined,
          description: voucherDesc.trim() || `سند حسابداری #${finalNo}`,
          referenceId: voucherRefId || existing.referenceId,
          autoGenerated: voucherAutoFlag,
          updatedAt: Date.now(),
          updatedBy: currentUser.fullName,
          lines: cleanedLines
        };
        const nextVouchers = vouchers.map(v => (v.id === existing.id ? updated : v));
        const nextNo = Math.max(erpState.nextVoucherNo || 1001, finalNo + 1);
        await persistErpState(
          { ...erpState, vouchers: nextVouchers, nextVoucherNo: nextNo },
          `سند حسابداری #${finalNo} با موفقیت ویرایش شد.`
        );
        resetEditorForNew(nextNo);
      } else {
        const created: ErpVoucher = {
          id: `vch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          voucherNo: finalNo,
          archiveCode: archiveCode.trim() || undefined,
          dateJalali: voucherDate.trim() || getTodayJalali(),
          fiscalYear: activeFiscalYear,
          type: voucherType,
          status: statusToSave,
          description: voucherDesc.trim() || `سند حسابداری #${finalNo}`,
          referenceId: voucherRefId || undefined,
          autoGenerated: voucherAutoFlag,
          createdBy: currentUser.fullName,
          createdAt: Date.now(),
          lines: cleanedLines
        };
        const nextNo = Math.max(erpState.nextVoucherNo || 1001, finalNo + 1);
        await persistErpState(
          { ...erpState, vouchers: [created, ...vouchers], nextVoucherNo: nextNo },
          `سند حسابداری #${finalNo} (${VOUCHER_STATUS_META[statusToSave].label}) ثبت شد.`
        );
        resetEditorForNew(nextNo);
      }
    } finally {
      setSavingVoucher(false);
    }
  };

  // --- Auto-Voucher Actions ---
  const handleLoadCandidateIntoEditor = (cand: AutoVoucherCandidate) => {
    onClearEditingVoucher();
    setVoucherNoInput(erpState.nextVoucherNo || 1001);
    setVoucherDate(cand.dateJalali || getTodayJalali());
    setVoucherType(cand.voucherType);
    setVoucherStatus('FINALIZED');
    setArchiveCode(cand.sourceDocNo);
    setVoucherDesc(cand.title);
    setVoucherRefId(cand.sourceId);
    setVoucherAutoFlag(true);
    setLines(cand.lines.map(l => ({ ...l })));
    showToast('success', `آرتیکل‌های دوبل «${cand.title}» جهت بررسی در فرم سند بارگذاری شد.`);
  };

  const handlePostSingleCandidate = async (cand: AutoVoucherCandidate) => {
    if (isYearLocked) {
      showToast('error', `دوره مالی «${activeFiscalYear}» قفل است.`);
      return;
    }
    const vNo = erpState.nextVoucherNo || 1001;
    const created: ErpVoucher = {
      id: `vch_auto_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      voucherNo: vNo,
      archiveCode: cand.sourceDocNo,
      dateJalali: cand.dateJalali || getTodayJalali(),
      fiscalYear: activeFiscalYear,
      type: cand.voucherType,
      status: 'FINALIZED',
      description: cand.title,
      referenceId: cand.sourceId,
      sourceModule: cand.sourceModule,
      autoGenerated: true,
      createdBy: currentUser.fullName,
      createdAt: Date.now(),
      lines: cand.lines
    };
    await persistErpState(
      { ...erpState, vouchers: [created, ...vouchers], nextVoucherNo: vNo + 1 },
      `سند اتوماتیک #${vNo} بابت «${cand.sourceDocNo}» صادر و در بایگانی ثبت شد.`
    );
  };

  const handlePostAllPendingCandidates = async () => {
    if (isYearLocked) {
      showToast('error', `دوره مالی «${activeFiscalYear}» قفل است.`);
      return;
    }
    if (pendingAutoCandidates.length === 0) return;
    let nextNo = erpState.nextVoucherNo || 1001;
    const createdList: ErpVoucher[] = pendingAutoCandidates.map((cand, idx) => {
      const vNo = nextNo++;
      return {
        id: `vch_auto_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 4)}`,
        voucherNo: vNo,
        archiveCode: cand.sourceDocNo,
        dateJalali: cand.dateJalali || getTodayJalali(),
        fiscalYear: activeFiscalYear,
        type: cand.voucherType,
        status: 'FINALIZED',
        description: cand.title,
        referenceId: cand.sourceId,
        sourceModule: cand.sourceModule,
        autoGenerated: true,
        createdBy: currentUser.fullName,
        createdAt: Date.now() + idx,
        lines: cand.lines
      };
    });

    await persistErpState(
      { ...erpState, vouchers: [...createdList.reverse(), ...vouchers], nextVoucherNo: nextNo },
      `${createdList.length} سند اتوماتیک مالی به‌صورت یکجا صادر و ثبت شد.`
    );
  };

  const handleApplyQuickTemplate = () => {
    const amt = Number(tplAmount) || 0;
    if (amt <= 0) {
      showToast('error', 'لطفاً مبلغ پایه سند را بزرگ‌تر از صفر وارد کنید.');
      return;
    }
    const built = buildQuickAutoTemplate(
      tplId,
      {
        amount: amt,
        vatPercent: Number(tplVat) || 0,
        partyName: tplParty,
        bankOrLineName: tplRef,
        note: tplNote
      },
      erpState
    );
    onClearEditingVoucher();
    setVoucherType(built.type);
    setVoucherDesc(built.description);
    setVoucherAutoFlag(true);
    setLines(built.lines);
    showToast('success', 'آرتیکل‌های دوبل از الگوی اتوماتیک تولید و تراز شدند.');
  };

  // --- Archive Actions ---
  const voucherCountsByType = useMemo(() => {
    const map: Record<string, number> = { ALL: vouchers.length };
    for (const v of vouchers) {
      map[v.type] = (map[v.type] || 0) + 1;
    }
    return map;
  }, [vouchers]);

  const filteredVouchers = useMemo(() => {
    const q = archiveSearch.trim();
    return [...vouchers]
      .filter(v => {
        if (archiveTypeFilter !== 'ALL' && v.type !== archiveTypeFilter) return false;
        if (archiveStatusFilter !== 'ALL' && v.status !== archiveStatusFilter) return false;
        if (archiveDateFrom && v.dateJalali && v.dateJalali < archiveDateFrom) return false;
        if (archiveDateTo && v.dateJalali && v.dateJalali > archiveDateTo) return false;
        if (q) {
          const lineFields = (v.lines || []).flatMap(l => [
            l.accountCode,
            l.accountTitle,
            l.tafziliName,
            l.description
          ]);
          return matchesSearchQuery(q, [
            v.voucherNo,
            v.description,
            v.archiveCode,
            v.dateJalali,
            v.createdBy,
            ...lineFields
          ]);
        }
        return true;
      })
      .sort((a, b) => (b.voucherNo || 0) - (a.voucherNo || 0));
  }, [vouchers, archiveTypeFilter, archiveStatusFilter, archiveDateFrom, archiveDateTo, archiveSearch]);

  const archiveSummary = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let autoCount = 0;
    for (const v of filteredVouchers) {
      if (v.autoGenerated || v.type === 'AUTO_FINANCIAL') autoCount++;
      for (const l of v.lines || []) {
        totalDebit += Number(l.debit) || 0;
        totalCredit += Number(l.credit) || 0;
      }
    }
    return { count: filteredVouchers.length, totalDebit, totalCredit, autoCount };
  }, [filteredVouchers]);

  const handleChangeVoucherStatus = async (voucher: ErpVoucher, nextStatus: ErpVoucher['status']) => {
    if (isYearLocked) {
      showToast('error', `دوره مالی «${activeFiscalYear}» قفل است.`);
      return;
    }
    if (nextStatus !== 'DRAFT') {
      const sumD = (voucher.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const sumC = (voucher.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
      if (sumD <= 0 || Math.abs(sumD - sumC) > 0.01) {
        showToast('error', 'سند نامتوازن را نمی‌توان به وضعیت موقت یا قطعی تغییر داد.');
        return;
      }
    }
    const nextVouchers = vouchers.map(v =>
      v.id === voucher.id
        ? { ...v, status: nextStatus, updatedAt: Date.now(), updatedBy: currentUser.fullName }
        : v
    );
    await persistErpState(
      { ...erpState, vouchers: nextVouchers },
      `وضعیت سند #${voucher.voucherNo} به «${VOUCHER_STATUS_META[nextStatus].label}» تغییر یافت.`
    );
  };

  const handleDuplicateVoucher = (voucher: ErpVoucher) => {
    onClearEditingVoucher();
    setVoucherNoInput(erpState.nextVoucherNo || 1001);
    setVoucherDate(getTodayJalali());
    setVoucherType(voucher.type);
    setVoucherStatus('TEMPORARY');
    setArchiveCode('');
    setVoucherDesc(`کپی از سند #${voucher.voucherNo} — ${voucher.description}`);
    setVoucherRefId('');
    setVoucherAutoFlag(false);
    setLines(
      (voucher.lines || []).map((l, idx) => ({
        ...l,
        id: `vl_dup_${Date.now()}_${idx}`
      }))
    );
    if (openSubViewTab) openSubViewTab('fin_voucher_new');
    showToast('success', `سند #${voucher.voucherNo} جهت ویرایش و ثبت جدید کپی شد.`);
  };

  const handleDeleteVoucher = async (voucher: ErpVoucher) => {
    if (isYearLocked) {
      showToast('error', `دوره مالی «${activeFiscalYear}» قفل است و امکان حذف سند وجود ندارد.`);
      return;
    }
    if (voucher.status === 'FINALIZED' && !settings.allowEditFinalizedVoucher) {
      showToast('error', 'طبق تنظیمات حسابداری، حذف سند قطعی مسدود است. ابتدا سند را به موقت تغییر دهید یا تنظیمات را باز کنید.');
      return;
    }
    const nextVouchers = vouchers.filter(v => v.id !== voucher.id);
    await persistErpState(
      { ...erpState, vouchers: nextVouchers },
      `سند حسابداری #${voucher.voucherNo} از بایگانی حذف شد.`
    );
    setConfirmDeleteVoucherId(null);
    if (editingVoucherId === voucher.id) onClearEditingVoucher();
  };

  // --- Supporting Docs CRUD ---
  const supportingDocs = settings.supportingDocs || [];

  const filteredSupportingDocs = useMemo(() => {
    const q = supSearch.trim();
    return supportingDocs
      .filter(d => {
        if (supTypeFilter !== 'ALL' && d.docType !== supTypeFilter) return false;
        if (q) {
          return matchesSearchQuery(q, [
            d.docNo,
            d.title,
            d.partyName,
            d.referenceNo,
            d.linkedVoucherNo,
            d.notes
          ]);
        }
        return true;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [supportingDocs, supTypeFilter, supSearch]);

  const persistSupportingDocs = async (nextDocs: ErpSupportingDoc[], toastText: string) => {
    await persistErpState(
      {
        ...erpState,
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
            supportingDocs: nextDocs
          }
        }
      },
      toastText
    );
  };

  const handleSaveSupportingDoc = async () => {
    if (!supForm.title.trim()) {
      showToast('error', 'عنوان سند مثبته الزامی است.');
      return;
    }
    const linked = supForm.linkedVoucherId
      ? vouchers.find(v => v.id === supForm.linkedVoucherId)
      : undefined;

    if (supForm.editingId) {
      const nextDocs = supportingDocs.map(d =>
        d.id === supForm.editingId
          ? {
              ...d,
              docNo: supForm.docNo.trim() || d.docNo,
              title: supForm.title.trim(),
              docType: supForm.docType,
              dateJalali: supForm.dateJalali.trim() || getTodayJalali(),
              amountRials: Number(supForm.amountRials) || 0,
              partyName: supForm.partyName.trim() || undefined,
              linkedVoucherId: linked?.id,
              linkedVoucherNo: linked?.voucherNo,
              referenceNo: supForm.referenceNo.trim() || undefined,
              notes: supForm.notes.trim() || undefined
            }
          : d
      );
      await persistSupportingDocs(nextDocs, 'سند مثبته با موفقیت ویرایش شد.');
    } else {
      const created: ErpSupportingDoc = {
        id: `sdoc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        docNo: supForm.docNo.trim() || `SD-${supportingDocs.length + 101}`,
        title: supForm.title.trim(),
        docType: supForm.docType,
        dateJalali: supForm.dateJalali.trim() || getTodayJalali(),
        amountRials: Number(supForm.amountRials) || 0,
        partyName: supForm.partyName.trim() || undefined,
        linkedVoucherId: linked?.id,
        linkedVoucherNo: linked?.voucherNo,
        referenceNo: supForm.referenceNo.trim() || undefined,
        notes: supForm.notes.trim() || undefined,
        createdBy: currentUser.fullName,
        createdAt: Date.now()
      };
      await persistSupportingDocs([created, ...supportingDocs], `سند مثبته «${created.title}» ثبت شد.`);
    }
    setSupForm({
      editingId: null,
      docNo: '',
      title: '',
      docType: 'INVOICE',
      dateJalali: getTodayJalali(),
      amountRials: '',
      partyName: '',
      linkedVoucherId: '',
      referenceNo: '',
      notes: ''
    });
  };

  // =========================================================================
  // VIEW 1: fin_voucher_new (Double-Entry Voucher Editor + Auto-Voucher Engine)
  // =========================================================================
  if (activeSubView === 'fin_voucher_new') {
    const selectedTemplateMeta = QUICK_TEMPLATES.find(t => t.id === tplId);

    return (
      <div className="space-y-4">
        {isYearLocked && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2 font-bold">
            <AlertTriangle size={16} className="shrink-0" />
            <span>دوره مالی «{activeFiscalYear}» قفل شده است؛ جهت ثبت یا تغییر سند، قفل دوره را از تنظیمات حسابداری باز کنید.</span>
          </div>
        )}

        {/* Automatic Financial Voucher Engine (Collapsible) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/70 overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap size={17} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                موتور سند اتوماتیک مالی (اسناد عملیاتی آماده + الگوهای دوبل استاندارد)
              </span>
              {pendingAutoCandidates.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono text-[11px] font-bold">
                  {pendingAutoCandidates.length} آماده صدور
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAutoPanel(v => !v)}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer"
              >
                {showAutoPanel ? 'جمع کردن پنل اتوماتیک' : 'باز کردن پنل سند اتوماتیک'}
              </button>
            </div>
          </div>

          {showAutoPanel && (
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAutoPanelTab('PENDING')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      autoPanelTab === 'PENDING'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    اسناد عملیاتی آماده صدور ({pendingAutoCandidates.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoPanelTab('TEMPLATES')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      autoPanelTab === 'TEMPLATES'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    الگوهای سریع سند اتوماتیک
                  </button>
                </div>

                {autoPanelTab === 'PENDING' && pendingAutoCandidates.length > 0 && (
                  <button
                    type="button"
                    onClick={handlePostAllPendingCandidates}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={14} />
                    <span>صدور دسته‌ای همه ({pendingAutoCandidates.length} سند)</span>
                  </button>
                )}
              </div>

              {autoPanelTab === 'PENDING' ? (
                pendingAutoCandidates.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>
                      تمام اسناد عملیاتی (تولید، انبار، فروش، خرید و خزانه) که دارای مبلغ ریالی بوده‌اند، هم‌اکنون سند حسابداری دارند یا هنوز سند جدیدی ثبت نشده است.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto custom-scrollbar">
                    {pendingAutoCandidates.map(cand => (
                      <div
                        key={cand.key}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col justify-between gap-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 dark:text-white truncate">{cand.title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {VOUCHER_TYPE_META[cand.voucherType]?.shortLabel} • تاریخ {cand.dateJalali} • {cand.lines.length} آرتیکل
                            </div>
                          </div>
                          <div className="font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                            {formatRials(cand.amountRials)} ریال
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleLoadCandidateIntoEditor(cand)}
                            className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] cursor-pointer"
                          >
                            پیش‌نمایش در فرم سند
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePostSingleCandidate(cand)}
                            className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer"
                          >
                            صدور فوری سند
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {QUICK_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTplId(t.id)}
                        className={`p-3 rounded-xl border text-right transition-colors cursor-pointer ${
                          tplId === t.id
                            ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40'
                        }`}
                      >
                        <div className="font-black text-xs text-slate-900 dark:text-white">{t.title}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{t.subtitle}</div>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs items-end">
                    <div className="lg:col-span-2">
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">مبلغ پایه (ریال) *</label>
                      <input
                        type="number"
                        value={tplAmount}
                        onChange={e => setTplAmount(e.target.value)}
                        placeholder="مثلاً 250000000"
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
                      />
                    </div>
                    {selectedTemplateMeta?.hasVat && (
                      <div>
                        <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">ارزش افزوده (٪)</label>
                        <input
                          type="number"
                          value={tplVat}
                          onChange={e => setTplVat(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold text-center"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">طرف حساب / تفصیل</label>
                      <input
                        type="text"
                        value={tplParty}
                        onChange={e => setTplParty(e.target.value)}
                        placeholder="نام مشتری / فروشنده"
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">بانک / خط تولید</label>
                      <input
                        type="text"
                        value={tplRef}
                        onChange={e => setTplRef(e.target.value)}
                        placeholder="بانک ملت / خط ۱"
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                    <div className={selectedTemplateMeta?.hasVat ? '' : 'lg:col-span-2'}>
                      <button
                        type="button"
                        onClick={handleApplyQuickTemplate}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Wand2 size={14} />
                        <span>تولید آرتیکل دوبل</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Double-Entry Voucher Form */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FilePlus2 size={18} className="text-emerald-600 shrink-0" />
                <span>
                  {editingVoucherId
                    ? `ویرایش سند حسابداری #${voucherNoInput} — «${selectedCompany.name}»`
                    : `صدور سند حسابداری دوبل جدید — «${selectedCompany.name}»`}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                ثبت استاندارد حسابداری دوطرفه (بدهکار = بستانکار) با انتخاب سرفصل از کل درخت کدینگ و تفصیل/زیرتفصیل.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingVoucherId && (
                <button
                  type="button"
                  onClick={() => resetEditorForNew()}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <X size={14} />
                  <span>انصراف از ویرایش</span>
                </button>
              )}
              {openSubViewTab && (
                <button
                  type="button"
                  onClick={() => openSubViewTab('fin_voucher_list')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Archive size={14} />
                  <span>مشاهده بایگانی اسناد</span>
                </button>
              )}
            </div>
          </div>

          {/* Header Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 text-xs">
            <div className="lg:col-span-2">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">شماره سند</label>
              <input
                type="number"
                value={voucherNoInput}
                onChange={e => setVoucherNoInput(Number(e.target.value) || 0)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-black text-indigo-700 dark:text-indigo-300"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">تاریخ سند (شمسی)</label>
              <input
                type="text"
                value={voucherDate}
                onChange={e => setVoucherDate(e.target.value)}
                placeholder="1405/08/20"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold text-center"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">نوع سند (تفکیک بایگانی)</label>
              <select
                value={voucherType}
                onChange={e => setVoucherType(e.target.value as ErpVoucherType)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                {VOUCHER_TYPES_ORDER.map(t => (
                  <option key={t} value={t}>
                    {VOUCHER_TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">وضعیت سند</label>
              <select
                value={voucherStatus}
                onChange={e => setVoucherStatus(e.target.value as ErpVoucher['status'])}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="FINALIZED">قطعی (تراز اجباری)</option>
                <option value="TEMPORARY">موقت (تراز اجباری)</option>
                <option value="DRAFT">پیش‌نویس (یادداشت)</option>
              </select>
            </div>
            <div className="lg:col-span-3">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">شماره عطف / کد بایگانی</label>
              <input
                type="text"
                value={archiveCode}
                onChange={e => setArchiveCode(e.target.value)}
                placeholder="مثلاً شماره فاکتور یا فیش بانکی"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-8">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">شرح کلی سند حسابداری</label>
              <input
                type="text"
                value={voucherDesc}
                onChange={e => setVoucherDesc(e.target.value)}
                placeholder="بابت ..."
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                فیلتر سریع لیست حساب‌ها (برای کدینگ‌های پرشاخه)
              </label>
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={accountQuickFilter}
                  onChange={e => setAccountQuickFilter(e.target.value)}
                  placeholder="فیلتر کد یا نام حساب..."
                  className="w-full min-h-[40px] pr-8 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Double-Entry Voucher Lines */}
          <div className="space-y-2.5">
            <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-[11px] font-black text-slate-600 dark:text-slate-300">
              <div className="col-span-3">سرفصل حساب (کدینگ)</div>
              <div className="col-span-2">تفصیل / زیرتفصیل</div>
              <div className="col-span-3">شرح آرتیکل</div>
              <div className="col-span-2">بدهکار (ریال)</div>
              <div className="col-span-2">بستانکار (ریال) و عملیات</div>
            </div>

            {lines.map((line, idx) => {
              const selectedParty = parties.find(
                p => (line.tafziliCode && p.code === line.tafziliCode) || p.name === line.tafziliName
              );
              const lineAccIncluded = filteredAccountOptions.some(a => a.code === line.accountCode);
              const currentAccObj = accounts.find(a => a.code === line.accountCode);

              return (
                <div
                  key={line.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/40 grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start text-xs"
                >
                  {/* Account Selector */}
                  <div className="lg:col-span-3 space-y-1">
                    <div className="lg:hidden text-[10px] font-bold text-slate-500">ردیف {idx + 1} — سرفصل حساب</div>
                    <select
                      value={line.accountCode}
                      onChange={e => {
                        const acc = accounts.find(a => a.code === e.target.value);
                        updateLine(idx, {
                          accountId: acc?.id,
                          accountCode: e.target.value,
                          accountTitle: acc?.title || e.target.value
                        });
                      }}
                      className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-white"
                    >
                      {!lineAccIncluded && line.accountCode && (
                        <option value={line.accountCode}>
                          {line.accountCode} — {currentAccObj?.title || line.accountTitle || 'سرفصل انتخابی'}
                        </option>
                      )}
                      {filteredAccountOptions.map(a => (
                        <option key={a.id} value={a.code}>
                          {a.code} — {a.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tafsil / Sub-Tafsil Selector + Free Text */}
                  <div className="lg:col-span-2 space-y-1">
                    <div className="lg:hidden text-[10px] font-bold text-slate-500">تفصیل / زیرتفصیل</div>
                    <select
                      value={selectedParty?.id || ''}
                      onChange={e => {
                        const p = parties.find(x => x.id === e.target.value);
                        if (!p) {
                          updateLine(idx, { tafziliCode: '', tafziliPath: [] });
                          return;
                        }
                        const fullPath = getTafsilFullPath(p, parties);
                        updateLine(idx, {
                          tafziliCode: p.code,
                          tafziliName: p.name,
                          tafziliPath: fullPath.split(' / ')
                        });
                      }}
                      className="w-full min-h-[38px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                    >
                      <option value="">— انتخاب از درخت تفصیل —</option>
                      {parties.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {getTafsilFullPath(p, parties)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={line.tafziliName}
                      onChange={e => updateLine(idx, { tafziliName: e.target.value })}
                      placeholder="یا نام تفصیل دستی..."
                      className="w-full min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                    />
                  </div>

                  {/* Line Description */}
                  <div className="lg:col-span-3 space-y-1">
                    <div className="lg:hidden text-[10px] font-bold text-slate-500">شرح آرتیکل</div>
                    <input
                      type="text"
                      value={line.description}
                      onChange={e => updateLine(idx, { description: e.target.value })}
                      placeholder="شرح دقیق آرتیکل..."
                      className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Debit */}
                  <div className="lg:col-span-2 space-y-1">
                    <div className="lg:hidden text-[10px] font-bold text-emerald-700">بدهکار (ریال)</div>
                    <input
                      type="number"
                      min={0}
                      value={line.debit || ''}
                      onChange={e => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        updateLine(idx, { debit: val, credit: val > 0 ? 0 : line.credit });
                      }}
                      placeholder="0"
                      className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300"
                    />
                    {line.debit > 0 && (
                      <div className="text-[10px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatRials(line.debit)} ریال
                      </div>
                    )}
                  </div>

                  {/* Credit + Row Actions */}
                  <div className="lg:col-span-2 space-y-1.5">
                    <div className="lg:hidden text-[10px] font-bold text-indigo-700">بستانکار (ریال)</div>
                    <input
                      type="number"
                      min={0}
                      value={line.credit || ''}
                      onChange={e => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        updateLine(idx, { credit: val, debit: val > 0 ? 0 : line.debit });
                      }}
                      placeholder="0"
                      className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300"
                    />
                    {line.credit > 0 && (
                      <div className="text-[10px] font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                        {formatRials(line.credit)} ریال
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleAutoBalanceLine(idx)}
                        title="تراز خودکار این ردیف"
                        className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-400 cursor-pointer"
                      >
                        تراز ردیف
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLine(idx, -1)}
                        disabled={idx === 0}
                        title="انتقال به بالا"
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLine(idx, 1)}
                        disabled={idx === lines.length - 1}
                        title="انتقال به پایین"
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown size={12} />
                      </button>
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                          title="حذف ردیف"
                          className="p-1.5 rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-600 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Double-Entry Balance Bar & Actions */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 ml-1">جمع بدهکار:</span>
                <span className="font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-300">
                  {formatRials(totals.debit)} ریال
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 ml-1">جمع بستانکار:</span>
                <span className="font-mono tabular-nums font-black text-indigo-700 dark:text-indigo-300">
                  {formatRials(totals.credit)} ریال
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-black">
                <Scale size={15} className={totals.isBalanced ? 'text-emerald-600' : 'text-rose-600'} />
                {totals.isBalanced ? (
                  <span className="text-emerald-700 dark:text-emerald-300">سند متوازن است (اختلاف: ۰)</span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                    اختلاف تراز: {formatRials(Math.abs(totals.diff))} ریال ({totals.diff > 0 ? 'کمبود بستانکار' : 'کمبود بدهکار'})
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const defaultAcc = postableAccounts[0];
                  setLines(prev => [
                    ...prev,
                    createEmptyLine(defaultAcc?.code || '1101', defaultAcc?.title || 'موجودی نقد و بانک')
                  ]);
                }}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} />
                <span>افزودن ردیف</span>
              </button>
              {!totals.isBalanced && Math.abs(totals.diff) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const acc = postableAccounts[0];
                    setLines(prev => [
                      ...prev,
                      {
                        ...createEmptyLine(acc?.code || '1101', acc?.title || 'حساب تراز'),
                        debit: totals.diff < 0 ? Math.round(Math.abs(totals.diff)) : 0,
                        credit: totals.diff > 0 ? Math.round(totals.diff) : 0,
                        description: voucherDesc || 'ردیف تراز سند'
                      }
                    ]);
                  }}
                  className="min-h-[40px] px-3 py-2 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-bold cursor-pointer"
                >
                  تراز خودکار با ردیف جدید
                </button>
              )}
              <button
                type="button"
                disabled={savingVoucher}
                onClick={() => handleSaveVoucher('DRAFT')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-bold cursor-pointer"
              >
                ذخیره پیش‌نویس
              </button>
              <button
                type="button"
                disabled={savingVoucher}
                onClick={() => handleSaveVoucher(voucherStatus === 'DRAFT' ? 'FINALIZED' : voucherStatus)}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check size={15} />
                <span>{editingVoucherId ? 'ذخیره ویرایش سند دوبل' : 'ثبت سند حسابداری دوبل'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: fin_voucher_list (Categorized Voucher Archive with Edit & Delete)
  // =========================================================================
  if (activeSubView === 'fin_voucher_list') {
    return (
      <div className="space-y-4">
        {/* Top Bar & KPIs */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Archive size={18} className="text-indigo-600 shrink-0" />
                <span>بایگانی جامع اسناد حسابداری (تفکیک نوع سند، ویرایش و حذف) — «{selectedCompany.name}»</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                فیلتر تفکیکی بر اساس نوع سند (عمومی، اتوماتیک، تولید، انبار، فروش، خرید، خزانه، افتتاحیه، اختتامیه و ...) با چاپ، کپی، ویرایش و حذف ایمن.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {openSubViewTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClearEditingVoucher();
                    openSubViewTab('fin_voucher_new');
                  }}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>صدور سند جدید</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  exportRowsToCsv(
                    `بایگانی_اسناد_${selectedCompany.name}`,
                    ['شماره سند', 'تاریخ', 'نوع سند', 'وضعیت', 'کد عطف', 'شرح سند', 'بدهکار (ریال)', 'بستانکار (ریال)', 'تنظیم‌کننده'],
                    filteredVouchers.map(v => [
                      v.voucherNo,
                      v.dateJalali,
                      VOUCHER_TYPE_META[v.type]?.label || v.type,
                      VOUCHER_STATUS_META[v.status]?.label || v.status,
                      v.archiveCode || '-',
                      v.description,
                      (v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0),
                      (v.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0),
                      v.createdBy || '-'
                    ])
                  )
                }
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>خروجی CSV</span>
              </button>
            </div>
          </div>

          {/* Categorized Document Type Filter Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            <button
              type="button"
              onClick={() => setArchiveTypeFilter('ALL')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                archiveTypeFilter === 'ALL'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                  : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              همه اسناد ({voucherCountsByType.ALL || 0})
            </button>
            {VOUCHER_TYPES_ORDER.map(t => {
              const cnt = voucherCountsByType[t] || 0;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setArchiveTypeFilter(t)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                    archiveTypeFilter === t
                      ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                      : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {VOUCHER_TYPE_META[t].shortLabel} ({cnt})
                </button>
              );
            })}
          </div>

          {/* Secondary Search, Status & Date Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 text-xs">
            <div className="lg:col-span-5 relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={archiveSearch}
                onChange={e => setArchiveSearch(e.target.value)}
                placeholder="جستجوی شماره سند، شرح، کد عطف، کد حساب یا تفصیلی..."
                className="w-full min-h-[40px] pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div className="lg:col-span-3">
              <select
                value={archiveStatusFilter}
                onChange={e => setArchiveStatusFilter(e.target.value as any)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="ALL">همه وضعیت‌ها</option>
                <option value="FINALIZED">فقط قطعی</option>
                <option value="TEMPORARY">فقط موقت</option>
                <option value="DRAFT">فقط پیش‌نویس</option>
              </select>
            </div>
            <div className="lg:col-span-2">
              <input
                type="text"
                value={archiveDateFrom}
                onChange={e => setArchiveDateFrom(e.target.value)}
                placeholder="از تاریخ 1405/01/01"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center"
              />
            </div>
            <div className="lg:col-span-2">
              <input
                type="text"
                value={archiveDateTo}
                onChange={e => setArchiveDateTo(e.target.value)}
                placeholder="تا تاریخ 1405/12/29"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center"
              />
            </div>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">اسناد نمایش‌داده‌شده</div>
              <div className="font-mono tabular-nums font-black text-base text-slate-900 dark:text-white mt-0.5">
                {archiveSummary.count.toLocaleString('fa-IR')} سند
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">جمع بدهکار فیلترشده</div>
              <div className="font-mono tabular-nums font-black text-base text-emerald-700 dark:text-emerald-300 mt-0.5">
                {formatRials(archiveSummary.totalDebit)} ریال
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">جمع بستانکار فیلترشده</div>
              <div className="font-mono tabular-nums font-black text-base text-indigo-700 dark:text-indigo-300 mt-0.5">
                {formatRials(archiveSummary.totalCredit)} ریال
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">اسناد اتوماتیک سیستمی</div>
              <div className="font-mono tabular-nums font-black text-base text-slate-900 dark:text-white mt-0.5">
                {archiveSummary.autoCount.toLocaleString('fa-IR')} سند
              </div>
            </div>
          </div>
        </div>

        {/* Vouchers List */}
        <div className="space-y-3">
          {filteredVouchers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-500">
              هیچ سندی با فیلتر انتخابی در بایگانی یافت نشد.
            </div>
          ) : (
            filteredVouchers.map(v => {
              const vDebit = (v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
              const vCredit = (v.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
              const isExpanded = expandedVoucherIds.has(v.id);
              const isConfirmingDelete = confirmDeleteVoucherId === v.id;
              const typeMeta = VOUCHER_TYPE_META[v.type] || { label: v.type, shortLabel: v.type, accent: 'text-slate-600' };
              const statusMeta = VOUCHER_STATUS_META[v.status] || { label: v.status, textClass: 'text-slate-600' };

              return (
                <div
                  key={v.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <div className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div
                      onClick={() =>
                        setExpandedVoucherIds(prev => {
                          const next = new Set(prev);
                          if (next.has(v.id)) next.delete(v.id);
                          else next.add(v.id);
                          return next;
                        })
                      }
                      className="flex-1 min-w-0 cursor-pointer space-y-1"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-mono tabular-nums font-black">
                          سند #{v.voucherNo}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 font-bold">
                          {v.dateJalali}
                        </span>
                        <span className={`font-bold ${typeMeta.accent}`}>{typeMeta.shortLabel}</span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className={`font-bold ${statusMeta.textClass}`}>{statusMeta.label}</span>
                        {v.autoGenerated && (
                          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                            • اتوماتیک
                          </span>
                        )}
                        {v.archiveCode && (
                          <span className="font-mono text-[11px] text-slate-500">عطف: {v.archiveCode}</span>
                        )}
                      </div>
                      <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {v.description}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                        <span>{(v.lines || []).length} آرتیکل</span>
                        <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                          بدهکار: {formatRials(vDebit)} ریال
                        </span>
                        <span className="font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                          بستانکار: {formatRials(vCredit)} ریال
                        </span>
                        <span>ثبت‌کننده: {v.createdBy || '-'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => printVoucherDocument(v, selectedCompany.name)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Printer size={13} />
                        <span>چاپ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (v.status === 'FINALIZED' && !settings.allowEditFinalizedVoucher) {
                            showToast('error', 'ویرایش سند قطعی در تنظیمات حسابداری مسدود است.');
                            return;
                          }
                          onStartEditVoucher(v.id);
                        }}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 size={13} />
                        <span>ویرایش</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateVoucher(v)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={13} />
                        <span>کپی</span>
                      </button>
                      <select
                        value={v.status}
                        onChange={e => handleChangeVoucherStatus(v, e.target.value as ErpVoucher['status'])}
                        aria-label="تغییر وضعیت سند"
                        className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold"
                      >
                        <option value="DRAFT">پیش‌نویس</option>
                        <option value="TEMPORARY">موقت</option>
                        <option value="FINALIZED">قطعی</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteVoucherId(isConfirmingDelete ? null : v.id)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>

                  {isConfirmingDelete && (
                    <div className="px-4 py-3 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-rose-800 dark:text-rose-200">
                        آیا از حذف دائمی سند حسابداری #{v.voucherNo} ({v.description}) اطمینان دارید؟
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteVoucher(v)}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                        >
                          تایید و حذف سند
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteVoucherId(null)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold cursor-pointer"
                        >
                          انصراف
                        </button>
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 overflow-x-auto bg-slate-50/50 dark:bg-slate-950/30 p-3">
                      <table className="w-full text-right text-xs min-w-[640px]">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px]">
                            <th className="py-1.5 px-2 w-10">#</th>
                            <th className="py-1.5 px-2 w-24">کد حساب</th>
                            <th className="py-1.5 px-2">عنوان حساب</th>
                            <th className="py-1.5 px-2">تفصیل / زیرتفصیل</th>
                            <th className="py-1.5 px-2">شرح آرتیکل</th>
                            <th className="py-1.5 px-2 w-32">بدهکار</th>
                            <th className="py-1.5 px-2 w-32">بستانکار</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {(v.lines || []).map((l, idx) => (
                            <tr key={l.id || idx}>
                              <td className="py-1.5 px-2 font-mono text-slate-400">{idx + 1}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                                {l.accountCode}
                              </td>
                              <td className="py-1.5 px-2 font-semibold text-slate-900 dark:text-white">
                                {l.accountTitle}
                              </td>
                              <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
                                {l.tafziliPath?.length ? l.tafziliPath.join(' / ') : l.tafziliName || '-'}
                              </td>
                              <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">{l.description || '-'}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
                                {formatRials(l.debit)}
                              </td>
                              <td className="py-1.5 px-2 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300">
                                {formatRials(l.credit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: fin_supporting_docs (Supporting Documents Archive)
  // =========================================================================
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Paperclip size={18} className="text-indigo-600" />
            <span>بایگانی و مدیریت اسناد مثبته — «{selectedCompany.name}»</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ثبت، ویرایش، حذف و پیوند مستندات مثبته (فاکتور، فیش بانکی، قرارداد، بارنامه، قبض مالیاتی) به اسناد حسابداری.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            exportRowsToCsv(
              `بایگانی_اسناد_مثبته_${selectedCompany.name}`,
              ['شماره مدرک', 'عنوان', 'نوع', 'تاریخ', 'مبلغ (ریال)', 'طرف حساب', 'سند مرتبط', 'شماره پیگیری'],
              filteredSupportingDocs.map(d => [
                d.docNo,
                d.title,
                SUPPORTING_DOC_TYPE_META[d.docType]?.label || d.docType,
                d.dateJalali,
                d.amountRials,
                d.partyName || '-',
                d.linkedVoucherNo ? `#${d.linkedVoucherNo}` : '-',
                d.referenceNo || '-'
              ])
            )
          }
          className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
        >
          <Download size={14} />
          <span>خروجی CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Form (5 cols) */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <h3 className="font-black text-sm text-slate-900 dark:text-white">
              {supForm.editingId ? 'ویرایش سند مثبته' : 'ثبت سند مثبته جدید در بایگانی'}
            </h3>
            {supForm.editingId && (
              <button
                type="button"
                onClick={() =>
                  setSupForm({
                    editingId: null,
                    docNo: '',
                    title: '',
                    docType: 'INVOICE',
                    dateJalali: getTodayJalali(),
                    amountRials: '',
                    partyName: '',
                    linkedVoucherId: '',
                    referenceNo: '',
                    notes: ''
                  })
                }
                className="text-xs font-bold text-slate-500 cursor-pointer"
              >
                انصراف
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">شماره مدرک</label>
              <input
                type="text"
                value={supForm.docNo}
                onChange={e => setSupForm(p => ({ ...p, docNo: e.target.value }))}
                placeholder="خودکار یا دستی"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">نوع سند مثبته</label>
              <select
                value={supForm.docType}
                onChange={e => setSupForm(p => ({ ...p, docType: e.target.value as ErpSupportingDoc['docType'] }))}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                {(Object.keys(SUPPORTING_DOC_TYPE_META) as ErpSupportingDoc['docType'][]).map(k => (
                  <option key={k} value={k}>
                    {SUPPORTING_DOC_TYPE_META[k].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold mb-1">عنوان / شرح سند مثبته *</label>
              <input
                type="text"
                value={supForm.title}
                onChange={e => setSupForm(p => ({ ...p, title: e.target.value }))}
                placeholder="مثلاً فاکتور خرید چیپس پلی‌استر - شرکت پتروشیمی"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">تاریخ مدرک</label>
              <input
                type="text"
                value={supForm.dateJalali}
                onChange={e => setSupForm(p => ({ ...p, dateJalali: e.target.value }))}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">مبلغ مدرک (ریال)</label>
              <input
                type="number"
                value={supForm.amountRials}
                onChange={e => setSupForm(p => ({ ...p, amountRials: e.target.value }))}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">طرف حساب</label>
              <input
                type="text"
                value={supForm.partyName}
                onChange={e => setSupForm(p => ({ ...p, partyName: e.target.value }))}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">شماره پیگیری / صیادی / عطف</label>
              <input
                type="text"
                value={supForm.referenceNo}
                onChange={e => setSupForm(p => ({ ...p, referenceNo: e.target.value }))}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold mb-1">اتصال به سند حسابداری (اختیاری)</label>
              <select
                value={supForm.linkedVoucherId}
                onChange={e => setSupForm(p => ({ ...p, linkedVoucherId: e.target.value }))}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="">— بدون اتصال فعلی —</option>
                {vouchers.map(v => (
                  <option key={v.id} value={v.id}>
                    سند #{v.voucherNo} ({v.dateJalali}) — {v.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold mb-1">یادداشت / محل فیزیکی زونکن</label>
              <input
                type="text"
                value={supForm.notes}
                onChange={e => setSupForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="مثلاً زونکن خرید آبان - برگ ۴۲"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveSupportingDoc}
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer"
          >
            {supForm.editingId ? 'ذخیره تغییرات سند مثبته' : 'ثبت سند مثبته در بایگانی'}
          </button>
        </div>

        {/* List (7 cols) */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 text-xs">
            <div className="relative flex-1">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={supSearch}
                onChange={e => setSupSearch(e.target.value)}
                placeholder="جستجو در شماره، عنوان، طرف حساب یا سند مرتبط..."
                className="w-full min-h-[40px] pr-8 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <select
              value={supTypeFilter}
              onChange={e => setSupTypeFilter(e.target.value as any)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
            >
              <option value="ALL">همه انواع ({supportingDocs.length})</option>
              {(Object.keys(SUPPORTING_DOC_TYPE_META) as ErpSupportingDoc['docType'][]).map(k => (
                <option key={k} value={k}>
                  {SUPPORTING_DOC_TYPE_META[k].label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5 max-h-[580px] overflow-y-auto custom-scrollbar">
            {filteredSupportingDocs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                سند مثبته‌ای ثبت یا یافت نشد.
              </div>
            ) : (
              filteredSupportingDocs.map(doc => (
                <div
                  key={doc.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">{doc.docNo}</span>
                        <span className="font-bold text-slate-900 dark:text-white">{doc.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{SUPPORTING_DOC_TYPE_META[doc.docType]?.label}</span>
                        <span>• {doc.dateJalali}</span>
                        {doc.partyName && <span>• {doc.partyName}</span>}
                        {doc.linkedVoucherNo && (
                          <button
                            type="button"
                            onClick={() => {
                              if (doc.linkedVoucherId) onStartEditVoucher(doc.linkedVoucherId);
                            }}
                            className="font-mono font-bold text-emerald-700 dark:text-emerald-300 underline cursor-pointer"
                          >
                            سند مرتبط #{doc.linkedVoucherNo}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono tabular-nums font-black text-slate-900 dark:text-white ml-2">
                        {formatRials(doc.amountRials)} ریال
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSupForm({
                            editingId: doc.id,
                            docNo: doc.docNo,
                            title: doc.title,
                            docType: doc.docType,
                            dateJalali: doc.dateJalali,
                            amountRials: String(doc.amountRials || ''),
                            partyName: doc.partyName || '',
                            linkedVoucherId: doc.linkedVoucherId || '',
                            referenceNo: doc.referenceNo || '',
                            notes: doc.notes || ''
                          })
                        }
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSupId(confirmDeleteSupId === doc.id ? null : doc.id)}
                        className="p-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-600 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {confirmDeleteSupId === doc.id && (
                    <div className="pt-2 border-t border-rose-200 dark:border-rose-900 flex items-center justify-between gap-2">
                      <span className="font-bold text-rose-700 dark:text-rose-300">حذف این سند مثبته تایید شود؟</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await persistSupportingDocs(
                              supportingDocs.filter(x => x.id !== doc.id),
                              `سند مثبته «${doc.title}» حذف شد.`
                            );
                            setConfirmDeleteSupId(null);
                          }}
                          className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                        >
                          حذف قطعی
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSupId(null)}
                          className="px-3 py-1 rounded-lg border border-slate-300 bg-white dark:bg-slate-800 font-bold cursor-pointer"
                        >
                          انصراف
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
