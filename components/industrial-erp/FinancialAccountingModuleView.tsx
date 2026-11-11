import React, { useState, useMemo } from 'react';
import { Trash2, Sliders } from 'lucide-react';
import { User } from '../../types';
import {
  ErpCompanySummary,
  ErpSubViewId,
  IndustrialErpState,
  ErpAccount,
  ErpParty,
  ErpVoucher,
  ErpVoucherLine,
  ErpCutoverConfig,
  getTodayJalali
} from './types';

interface FinancialAccountingModuleViewProps {
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

export const FinancialAccountingModuleView: React.FC<FinancialAccountingModuleViewProps> = ({
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
  const [newAccountForm, setNewAccountForm] = useState({
    code: '',
    title: '',
    level: 'MOEIN' as ErpAccount['level'],
    parentCode: '1101',
    nature: 'DEBIT' as ErpAccount['nature']
  });

  const [newPartyForm, setNewPartyForm] = useState({
    code: '',
    name: '',
    type: 'CUSTOMER' as ErpParty['type'],
    nationalId: '',
    phone: '',
    city: 'تهران',
    creditLimitRials: 1000000000
  });

  const [newVoucherDesc, setNewVoucherDesc] = useState<string>('');
  const [newVoucherType] = useState<ErpVoucher['type']>('GENERAL');
  const [newVoucherLines, setNewVoucherLines] = useState<ErpVoucherLine[]>([
    {
      id: 'vl_init_1',
      accountCode: '110101',
      accountTitle: 'بانک ملت - حساب جاری عامل',
      tafziliName: 'بانک ملت شعبه مرکزی',
      debit: 0,
      credit: 0,
      description: ''
    },
    {
      id: 'vl_init_2',
      accountCode: '110201',
      accountTitle: 'حساب‌های دریافتنی تجاری (مشتریان)',
      tafziliName: 'مشتری',
      debit: 0,
      credit: 0,
      description: ''
    }
  ]);

  const [selectedReviewAccountCode, setSelectedReviewAccountCode] = useState<string | null>(null);
  const [voucherFilterText, setVoucherFilterText] = useState<string>('');

  const accountBalances = useMemo(() => {
    const map = new Map<string, { code: string; title: string; level: string; debit: number; credit: number }>();
    for (const acc of erpState.chartOfAccounts) {
      map.set(acc.code, { code: acc.code, title: acc.title, level: acc.level, debit: 0, credit: 0 });
    }
    for (const v of erpState.vouchers) {
      for (const line of v.lines) {
        const existing = map.get(line.accountCode) || {
          code: line.accountCode,
          title: line.accountTitle,
          level: 'MOEIN',
          debit: 0,
          credit: 0
        };
        existing.debit += Number(line.debit) || 0;
        existing.credit += Number(line.credit) || 0;
        map.set(line.accountCode, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [erpState]);

  return (
    <div className="space-y-5">
      {activeSubView === 'fin_year_end' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 p-5 space-y-5">
          <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders size={18} className="text-indigo-600" />
            <span>عملیات پایان سال مالی، بستن حساب‌های موقت و انتقال تراز افتتاحیه در «{selectedCompany.name}»</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => handleToggleCutoverStage('stage1FactoryWarehouseActive')}
              className={`p-4 rounded-xl border-2 cursor-pointer ${
                erpState.cutoverConfig?.stage1FactoryWarehouseActive !== false
                  ? 'border-emerald-500 bg-emerald-50/40'
                  : 'border-slate-200'
              }`}
            >
              <div className="font-black text-xs text-emerald-800">مرحله ۱: انبار کارخانه، باسکول و بارکدها (فعال)</div>
              <p className="text-[11px] text-slate-600 mt-1">
                توزین باسکول، اسکن بارکدهای سایان و دلکام، و صدور خروج کارخانه بدون فی.
              </p>
            </div>
            <div
              onClick={() => handleToggleCutoverStage('stage2TehranPricingInvoiceActive')}
              className={`p-4 rounded-xl border-2 cursor-pointer ${
                erpState.cutoverConfig?.stage2TehranPricingInvoiceActive !== false
                  ? 'border-indigo-500 bg-indigo-50/40'
                  : 'border-slate-200'
              }`}
            >
              <div className="font-black text-xs text-indigo-800">مرحله ۲: قیمت‌گذاری دفتر تهران و فاکتور نهایی</div>
              <p className="text-[11px] text-slate-600 mt-1">
                تبدیل حواله خروج بدون فی کارخانه به فاکتور نهایی و سند فروش در دفتر تهران.
              </p>
            </div>
            <div
              onClick={() => handleToggleCutoverStage('stage3PaymentOrdersAutoVoucherActive')}
              className={`p-4 rounded-xl border-2 cursor-pointer ${
                erpState.cutoverConfig?.stage3PaymentOrdersAutoVoucherActive
                  ? 'border-amber-500 bg-amber-50/40'
                  : 'border-slate-200'
              }`}
            >
              <div className="font-black text-xs text-amber-800">
                مرحله ۳: اتصال خودکار دستور پرداخت و رسید دریافت به بانک‌های حسابداری
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                با زدن تیک این مرحله، تایید نهایی دستور پرداخت یا رسید چک، خودکار سند حسابداری صادر می‌کند.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-black text-xs">
                انتقال تراز دقیق مانده حساب‌ها و اشخاص از سایان تا تاریخ مشخص به «{selectedCompany.name}»
              </div>
              <p className="text-[11px] text-slate-500">
                تراز آزمایشی سایان تا تاریخ انتخابی خوانده شده و به عنوان سند افتتاحیه تراز در این شرکت ثبت می‌شود.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={cutoffDateInput}
                onChange={e => setCutoffDateInput(e.target.value)}
                placeholder="1405/08/20"
                className="w-32 px-3 py-2 rounded-xl border bg-white font-mono font-bold text-xs text-center"
              />
              <button
                onClick={handleImportSayanTrialBalance}
                disabled={importingTrialBalance}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
              >
                دریافت تراز سایان و صدور سند افتتاحیه
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSubView === 'fin_chart' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-3">
            <h3 className="font-black text-sm">معرفی سرفصل حساب جدید (گروه / کل / معین / تفصیلی)</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                type="text"
                value={newAccountForm.code}
                onChange={e => setNewAccountForm({ ...newAccountForm, code: e.target.value })}
                placeholder="کد حساب (مثلاً 110108)"
                className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
              />
              <select
                value={newAccountForm.level}
                onChange={e => setNewAccountForm({ ...newAccountForm, level: e.target.value as any })}
                className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
              >
                <option value="GROUP">گروه حساب</option>
                <option value="KOL">حساب کل</option>
                <option value="MOEIN">حساب معین</option>
                <option value="TAFZILI">حساب تفصیلی</option>
              </select>
              <input
                type="text"
                value={newAccountForm.title}
                onChange={e => setNewAccountForm({ ...newAccountForm, title: e.target.value })}
                placeholder="عنوان سرفصل حساب..."
                className="col-span-2 px-3 py-2 rounded-xl border bg-slate-50 font-bold"
              />
            </div>
            <button
              onClick={async () => {
                if (!newAccountForm.code || !newAccountForm.title) return;
                const acc: ErpAccount = { id: `acc_${Date.now()}`, ...newAccountForm };
                await persistErpState(
                  { ...erpState, chartOfAccounts: [...erpState.chartOfAccounts, acc] },
                  `سرفصل حساب «${acc.title}» ثبت شد.`
                );
                setNewAccountForm({ ...newAccountForm, code: '', title: '' });
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
            >
              افزودن به درختواره حساب‌ها
            </button>
          </div>
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-3">
            <h3 className="font-black text-sm">درختواره سرفصل حساب‌های استاندارد ({erpState.chartOfAccounts.length})</h3>
            <div className="max-h-96 overflow-y-auto divide-y text-xs">
              {erpState.chartOfAccounts.map(a => (
                <div key={a.id} className="py-2 px-2 flex justify-between items-center">
                  <div>
                    <span className="font-mono font-black text-indigo-600 ml-2">{a.code}</span>
                    <span className="font-bold">{a.title}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold">{a.level}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSubView === 'fin_tafsili' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-3">
            <h3 className="font-black text-sm">معرفی طرف‌حساب / تفصیلی شناور جدید</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                type="text"
                value={newPartyForm.code}
                onChange={e => setNewPartyForm({ ...newPartyForm, code: e.target.value })}
                placeholder="کد تفصیلی (مثلاً 113220)"
                className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
              />
              <select
                value={newPartyForm.type}
                onChange={e => setNewPartyForm({ ...newPartyForm, type: e.target.value as any })}
                className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
              >
                <option value="CUSTOMER">مشتری / خریدار</option>
                <option value="SUPPLIER">تامین‌کننده / فروشنده</option>
                <option value="COST_CENTER">مرکز هزینه کارخانه</option>
                <option value="PERSONNEL">پرسنل</option>
              </select>
              <input
                type="text"
                value={newPartyForm.name}
                onChange={e => setNewPartyForm({ ...newPartyForm, name: e.target.value })}
                placeholder="نام کامل شخص یا شرکت..."
                className="col-span-2 px-3 py-2 rounded-xl border bg-slate-50 font-bold"
              />
            </div>
            <button
              onClick={async () => {
                if (!newPartyForm.name) return;
                const p: ErpParty = { id: `pty_${Date.now()}`, ...newPartyForm };
                await persistErpState(
                  { ...erpState, parties: [...(erpState.parties || []), p] },
                  `طرف حساب «${p.name}» ثبت شد.`
                );
                setNewPartyForm({ ...newPartyForm, code: '', name: '' });
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
            >
              ذخیره طرف حساب در تفصیلی‌ها
            </button>
          </div>
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-3">
            <h3 className="font-black text-sm">فهرست طرف‌حساب‌ها و مراکز هزینه ({(erpState.parties || []).length})</h3>
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 px-2">کد تفصیلی</th>
                  <th className="py-2 px-2">نام طرف حساب</th>
                  <th className="py-2 px-2">نوع</th>
                  <th className="py-2 px-2">شهر</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(erpState.parties || []).map(p => (
                  <tr key={p.id}>
                    <td className="py-2 px-2 font-mono font-bold text-indigo-600">{p.code}</td>
                    <td className="py-2 px-2 font-bold">{p.name}</td>
                    <td className="py-2 px-2">{p.type}</td>
                    <td className="py-2 px-2">{p.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubView === 'fin_voucher_new' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-black text-sm">صدور و ویرایش سند حسابداری روزانه در «{selectedCompany.name}»</h3>
            <span className="font-mono font-black text-xs text-indigo-600">
              شماره سند بعدی: #{erpState.nextVoucherNo}
            </span>
          </div>
          <input
            type="text"
            value={newVoucherDesc}
            onChange={e => setNewVoucherDesc(e.target.value)}
            placeholder="شرح کلی سند حسابداری..."
            className="w-full px-3 py-2 rounded-xl border bg-slate-50 text-xs font-bold"
          />
          <div className="space-y-2">
            {newVoucherLines.map((line, idx) => (
              <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-xl border text-xs">
                <div className="md:col-span-3">
                  <select
                    value={line.accountCode}
                    onChange={e => {
                      const acc = erpState.chartOfAccounts.find(a => a.code === e.target.value);
                      setNewVoucherLines(prev =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, accountCode: e.target.value, accountTitle: acc?.title || '' } : l
                        )
                      );
                    }}
                    className="w-full px-2 py-1.5 rounded-lg border bg-white font-bold"
                  >
                    {erpState.chartOfAccounts.map(a => (
                      <option key={a.id} value={a.code}>
                        {a.code} — {a.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={line.tafziliName}
                    onChange={e =>
                      setNewVoucherLines(prev => prev.map((l, i) => (i === idx ? { ...l, tafziliName: e.target.value } : l)))
                    }
                    placeholder="نام تفصیلی..."
                    className="w-full px-2 py-1.5 rounded-lg border bg-white"
                  />
                </div>
                <div className="md:col-span-3">
                  <input
                    type="text"
                    value={line.description}
                    onChange={e =>
                      setNewVoucherLines(prev => prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)))
                    }
                    placeholder="شرح آرتیکل..."
                    className="w-full px-2 py-1.5 rounded-lg border bg-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    type="number"
                    value={line.debit}
                    onChange={e =>
                      setNewVoucherLines(prev =>
                        prev.map((l, i) => (i === idx ? { ...l, debit: parseFloat(e.target.value) || 0, credit: 0 } : l))
                      )
                    }
                    placeholder="بدهکار"
                    className="w-full px-2 py-1.5 rounded-lg border bg-white font-mono text-emerald-700 font-bold"
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-1">
                  <input
                    type="number"
                    value={line.credit}
                    onChange={e =>
                      setNewVoucherLines(prev =>
                        prev.map((l, i) => (i === idx ? { ...l, credit: parseFloat(e.target.value) || 0, debit: 0 } : l))
                      )
                    }
                    placeholder="بستانکار"
                    className="w-full px-2 py-1.5 rounded-lg border bg-white font-mono text-indigo-700 font-bold"
                  />
                  {newVoucherLines.length > 2 && (
                    <button
                      onClick={() => setNewVoucherLines(prev => prev.filter((_, i) => i !== idx))}
                      className="text-rose-500 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() =>
                setNewVoucherLines(prev => [
                  ...prev,
                  {
                    id: `vl_${Date.now()}`,
                    accountCode: '110101',
                    accountTitle: 'بانک ملت - حساب جاری عامل',
                    tafziliName: '',
                    debit: 0,
                    credit: 0,
                    description: ''
                  }
                ])
              }
              className="px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
            >
              + افزودن ردیف آرتیکل
            </button>
            <button
              onClick={async () => {
                const bed = newVoucherLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                const bes = newVoucherLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                if (bed <= 0 || bed !== bes) {
                  showToast('error', 'جمع بدهکار و بستانکار سند باید برابر و بزرگ‌تر از صفر باشد.');
                  return;
                }
                const voucherNo = erpState.nextVoucherNo || 1002;
                const v: ErpVoucher = {
                  id: `vch_${Date.now()}`,
                  voucherNo,
                  dateJalali: getTodayJalali(),
                  type: newVoucherType,
                  status: 'FINALIZED',
                  description: newVoucherDesc || `سند حسابداری #${voucherNo}`,
                  createdBy: currentUser.fullName,
                  createdAt: Date.now(),
                  lines: newVoucherLines
                };
                await persistErpState(
                  { ...erpState, vouchers: [v, ...erpState.vouchers], nextVoucherNo: voucherNo + 1 },
                  `سند حسابداری #${voucherNo} در شرکت «${selectedCompany.name}» ثبت گردید.`
                );
                setNewVoucherDesc('');
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs cursor-pointer"
            >
              ثبت قطعی سند حسابداری
            </button>
          </div>
        </div>
      )}

      {(activeSubView === 'fin_trial_balance' || activeSubView === 'fin_ledger_review') && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4">
          <h3 className="font-black text-sm">
            مرور جامع حساب‌ها و تراز آزمایشی ۴ ستونی شرکت «{selectedCompany.name}» (کلیک روی هر حساب برای ریز گردش)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 px-2">کد حساب</th>
                  <th className="py-2 px-2">عنوان سرفصل</th>
                  <th className="py-2 px-2">سطح</th>
                  <th className="py-2 px-2">گردش بدهکار (ریال)</th>
                  <th className="py-2 px-2">گردش بستانکار (ریال)</th>
                  <th className="py-2 px-2">مانده بدهکار</th>
                  <th className="py-2 px-2">مانده بستانکار</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accountBalances.map(row => {
                  const net = row.debit - row.credit;
                  return (
                    <tr
                      key={row.code}
                      onClick={() => setSelectedReviewAccountCode(row.code)}
                      className="hover:bg-indigo-50/50 cursor-pointer"
                    >
                      <td className="py-2 px-2 font-mono font-black text-indigo-600">{row.code}</td>
                      <td className="py-2 px-2 font-bold">{row.title}</td>
                      <td className="py-2 px-2 text-[10px]">{row.level}</td>
                      <td className="py-2 px-2 font-mono">{row.debit.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono">{row.credit.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono font-black text-emerald-600">
                        {net > 0 ? net.toLocaleString() : '0'}
                      </td>
                      <td className="py-2 px-2 font-mono font-black text-indigo-600">
                        {net < 0 ? Math.abs(net).toLocaleString() : '0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedReviewAccountCode && (
            <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-black text-xs text-indigo-900">
                  ریز گردش آرتیکل‌های حساب کد {selectedReviewAccountCode}
                </h4>
                <button
                  onClick={() => setSelectedReviewAccountCode(null)}
                  className="text-xs font-bold text-slate-500 cursor-pointer"
                >
                  بستن
                </button>
              </div>
              <div className="space-y-1 text-xs">
                {erpState.vouchers.flatMap(v =>
                  v.lines
                    .filter(l => l.accountCode === selectedReviewAccountCode)
                    .map(l => (
                      <div key={l.id} className="bg-white p-2 rounded border flex justify-between">
                        <span>
                          سند #{v.voucherNo} ({v.dateJalali}) — {l.tafziliName}: {l.description}
                        </span>
                        <span className="font-mono font-bold">
                          بدهکار: {l.debit.toLocaleString()} | بستانکار: {l.credit.toLocaleString()}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubView === 'fin_voucher_list' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-sm">دفتر روزنامه و بایگانی اسناد حسابداری شرکت ({erpState.vouchers.length} سند)</h3>
            <input
              type="text"
              value={voucherFilterText}
              onChange={e => setVoucherFilterText(e.target.value)}
              placeholder="جستجو در شرح سند، شماره سند یا تفصیلی..."
              className="w-64 px-3 py-1.5 rounded-xl border bg-slate-50 text-xs"
            />
          </div>
          <div className="space-y-3">
            {erpState.vouchers
              .filter(
                v =>
                  !voucherFilterText.trim() ||
                  v.description.includes(voucherFilterText) ||
                  String(v.voucherNo).includes(voucherFilterText)
              )
              .map(v => (
                <div key={v.id} className="border rounded-xl p-4 space-y-2 bg-slate-50/40">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded bg-slate-900 text-white font-mono font-black text-xs">
                        سند #{v.voucherNo}
                      </span>
                      <span className="font-bold text-xs">{v.description}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">{v.dateJalali}</span>
                  </div>
                  <table className="w-full text-right text-[11px]">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="py-1">کد حساب</th>
                        <th className="py-1">عنوان حساب</th>
                        <th className="py-1">تفصیلی</th>
                        <th className="py-1">شرح آرتیکل</th>
                        <th className="py-1">بدهکار</th>
                        <th className="py-1">بستانکار</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {v.lines.map(l => (
                        <tr key={l.id}>
                          <td className="py-1 font-mono font-bold text-indigo-600">{l.accountCode}</td>
                          <td className="py-1 font-bold">{l.accountTitle}</td>
                          <td className="py-1">{l.tafziliName}</td>
                          <td className="py-1 text-slate-500">{l.description}</td>
                          <td className="py-1 font-mono font-bold text-emerald-700">{l.debit.toLocaleString()}</td>
                          <td className="py-1 font-mono font-bold text-indigo-700">{l.credit.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
