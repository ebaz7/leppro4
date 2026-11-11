import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { apiCall } from '../../services/apiService';
import { User, PaymentOrder } from '../../types';
import {
  ErpCompanySummary,
  ErpSubViewId,
  IndustrialErpState,
  ErpBankAccount,
  ErpChequeBook,
  ErpTreasuryDoc,
  ErpVoucher,
  getTodayJalali
} from './types';

interface TreasuryBankingModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  erpState: IndustrialErpState;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser: User;
}

export const TreasuryBankingModuleView: React.FC<TreasuryBankingModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  persistErpState,
  currentUser
}) => {
  const [newBankForm, setNewBankForm] = useState({
    code: 'BNK-03',
    bankName: 'بانک صادرات',
    branchName: 'شعبه بازار',
    accountNo: '',
    shebaNo: '',
    accountType: 'JARI' as ErpBankAccount['accountType'],
    balanceRials: 0,
    tafziliCode: '13003'
  });

  const [newChequebookForm, setNewChequebookForm] = useState({
    bankAccountId: 'bnk_1',
    series: '1405/B',
    fromSerial: '985501',
    toSerial: '985525',
    leavesCount: 25
  });

  const [treasuryForm, setTreasuryForm] = useState({
    docType: 'RECEIPT_CHEQUE' as ErpTreasuryDoc['docType'],
    partyName: 'شرکت نساجی بهپود',
    partyCode: '113101',
    bankName: 'بانک ملت',
    sayadiId: '',
    chequeSerial: '',
    dueDateJalali: '1405/09/25',
    amountRials: 250000000,
    description: ''
  });

  // Live Delkam Payment Orders for cross-module bridge
  const [delkamPaymentOrders, setDelkamPaymentOrders] = useState<PaymentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  const fetchDelkamOrders = async () => {
    try {
      setLoadingOrders(true);
      const list = await apiCall<PaymentOrder[]>('/orders');
      if (Array.isArray(list)) {
        setDelkamPaymentOrders(list.slice(0, 25));
      }
    } catch {
      // ignore if user lacks permission
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (activeSubView === 'trs_archive' || activeSubView === 'trs_doc_new') {
      fetchDelkamOrders();
    }
  }, [activeSubView]);

  const handleConvertDelkamPaymentOrderToVoucher = async (order: PaymentOrder) => {
    const voucherNo = erpState.nextVoucherNo || 1002;
    const docNo = `TRS-DLK-${order.trackingNumber}`;
    const newTrs: ErpTreasuryDoc = {
      id: `trs_dlk_${order.id}_${Date.now()}`,
      docNo,
      docType: 'PAYMENT_WIRE',
      dateJalali: order.date || getTodayJalali(),
      partyName: order.payee || 'ذینفع دستور پرداخت',
      partyCode: '210101',
      bankName: order.payingCompany || selectedCompany.name,
      amountRials: Number(order.totalAmount) || 0,
      voucherNo,
      description: `سند خزانه بابت دستور پرداخت دلکام #${order.trackingNumber} — ${order.description || ''}`
    };
    const vch: ErpVoucher = {
      id: `vch_dlk_${order.id}_${Date.now()}`,
      voucherNo,
      dateJalali: getTodayJalali(),
      type: 'TREASURY',
      status: 'FINALIZED',
      description: `سند حسابداری دستور پرداخت دلکام #${order.trackingNumber} در وجه ${order.payee}`,
      referenceId: String(order.id),
      createdBy: currentUser.fullName,
      createdAt: Date.now(),
      lines: [
        {
          id: `vl_${Date.now()}_1`,
          accountCode: '210101',
          accountTitle: 'حساب‌های پرداختنی تجاری',
          tafziliName: order.payee || 'ذینفع دستور پرداخت',
          debit: Number(order.totalAmount) || 0,
          credit: 0,
          description: `تسویه بابت دستور پرداخت #${order.trackingNumber} (${order.description || ''})`
        },
        {
          id: `vl_${Date.now()}_2`,
          accountCode: '110101',
          accountTitle: 'بانک ملت - حساب جاری عامل',
          tafziliName: order.payingCompany || selectedCompany.name,
          debit: 0,
          credit: Number(order.totalAmount) || 0,
          description: `پرداخت دستور پرداخت دلکام #${order.trackingNumber}`
        }
      ]
    };

    await persistErpState(
      {
        ...erpState,
        treasuryDocs: [newTrs, ...(erpState.treasuryDocs || [])],
        vouchers: [vch, ...erpState.vouchers],
        nextVoucherNo: voucherNo + 1
      },
      `دستور پرداخت دلکام #${order.trackingNumber} به سند خزانه ${docNo} و سند حسابداری #${voucherNo} تبدیل شد.`
    );
  };

  return (
    <div className="space-y-5">
      {activeSubView === 'trs_banks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="font-black text-sm">معرفی حساب بانکی / صندوق جدید در «{selectedCompany.name}»</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                type="text"
                value={newBankForm.bankName}
                onChange={e => setNewBankForm({ ...newBankForm, bankName: e.target.value })}
                placeholder="نام بانک یا صندوق"
                className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
              />
              <input
                type="text"
                value={newBankForm.branchName}
                onChange={e => setNewBankForm({ ...newBankForm, branchName: e.target.value })}
                placeholder="نام و کد شعبه"
                className="px-3 py-2 rounded-xl border bg-slate-50"
              />
              <input
                type="text"
                value={newBankForm.accountNo}
                onChange={e => setNewBankForm({ ...newBankForm, accountNo: e.target.value })}
                placeholder="شماره حساب"
                className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
              />
              <input
                type="number"
                value={newBankForm.balanceRials}
                onChange={e => setNewBankForm({ ...newBankForm, balanceRials: parseFloat(e.target.value) || 0 })}
                placeholder="موجودی اولیه (ریال)"
                className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
              />
            </div>
            <button
              onClick={async () => {
                const nb: ErpBankAccount = {
                  id: `bnk_${Date.now()}`,
                  ...newBankForm
                };
                await persistErpState(
                  { ...erpState, bankAccounts: [...(erpState.bankAccounts || []), nb] },
                  `حساب بانکی «${nb.bankName}» ثبت شد.`
                );
              }}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-black text-xs cursor-pointer"
            >
              ثبت حساب بانکی / صندوق
            </button>
          </div>
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="font-black text-sm">بانک‌ها و صندوق‌های فعال شرکت ({(erpState.bankAccounts || []).length})</h3>
            <div className="space-y-2.5">
              {(erpState.bankAccounts || []).map(b => (
                <div key={b.id} className="p-3.5 rounded-xl border flex items-center justify-between text-xs">
                  <div>
                    <div className="font-black text-sm">{b.bankName} — {b.branchName}</div>
                    <div className="text-slate-500 font-mono mt-0.5">حساب: {b.accountNo} | تفصیلی: {b.tafziliCode}</div>
                  </div>
                  <div className="font-mono font-black text-emerald-600 text-sm">
                    {b.balanceRials.toLocaleString()} ریال
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSubView === 'trs_chequebooks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="font-black text-sm">معرفی دسته‌چک صیادی جدید</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <select
                value={newChequebookForm.bankAccountId}
                onChange={e => setNewChequebookForm({ ...newChequebookForm, bankAccountId: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-xl border bg-slate-50 font-bold"
              >
                {(erpState.bankAccounts || []).map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} ({b.accountNo})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newChequebookForm.fromSerial}
                onChange={e => setNewChequebookForm({ ...newChequebookForm, fromSerial: e.target.value })}
                placeholder="از سریال"
                className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
              />
              <input
                type="text"
                value={newChequebookForm.toSerial}
                onChange={e => setNewChequebookForm({ ...newChequebookForm, toSerial: e.target.value })}
                placeholder="تا سریال"
                className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
              />
            </div>
            <button
              onClick={async () => {
                const bnk = (erpState.bankAccounts || []).find(b => b.id === newChequebookForm.bankAccountId);
                const cb: ErpChequeBook = {
                  id: `cb_${Date.now()}`,
                  bankAccountId: newChequebookForm.bankAccountId,
                  bankName: bnk?.bankName || 'بانک ملت',
                  series: newChequebookForm.series,
                  fromSerial: newChequebookForm.fromSerial,
                  toSerial: newChequebookForm.toSerial,
                  leavesCount: newChequebookForm.leavesCount,
                  usedLeaves: 0,
                  status: 'ACTIVE'
                };
                await persistErpState(
                  { ...erpState, chequeBooks: [...(erpState.chequeBooks || []), cb] },
                  'دسته‌چک جدید ثبت گردید.'
                );
              }}
              className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-black text-xs cursor-pointer"
            >
              ثبت دسته‌چک
            </button>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="font-black text-sm">فهرست دسته‌چک‌های فعال ({(erpState.chequeBooks || []).length})</h3>
            <div className="space-y-2">
              {(erpState.chequeBooks || []).map(cb => (
                <div key={cb.id} className="p-3 rounded-xl border flex justify-between items-center text-xs">
                  <div>
                    <div className="font-black">{cb.bankName} — سری {cb.series}</div>
                    <div className="font-mono text-slate-500">از برگ {cb.fromSerial} تا {cb.toSerial} ({cb.leavesCount} برگی)</div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-700 font-bold">
                    {cb.usedLeaves} برگ مصرف‌شده
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(activeSubView === 'trs_doc_new' || activeSubView === 'trs_cheque_ops' || activeSubView === 'trs_archive') && (
        <div className="space-y-5">
          {activeSubView === 'trs_doc_new' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h3 className="font-black text-sm">صدور سند خزانه‌داری (رسید دریافت چک صیادی / واریز نقدی / پرداخت چک و حواله)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <select
                  value={treasuryForm.docType}
                  onChange={e => setTreasuryForm({ ...treasuryForm, docType: e.target.value as any })}
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                >
                  <option value="RECEIPT_CHEQUE">رسید دریافت چک از مشتری</option>
                  <option value="RECEIPT_CASH">رسید دریافت نقد / واریز بانکی</option>
                  <option value="PAYMENT_CHEQUE">صدور چک پرداختنی شرکت</option>
                  <option value="PAYMENT_WIRE">پرداخت حواله بانکی / پایا / ساتنا</option>
                </select>
                <input
                  type="text"
                  value={treasuryForm.partyName}
                  onChange={e => setTreasuryForm({ ...treasuryForm, partyName: e.target.value })}
                  placeholder="نام طرف حساب"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                />
                <input
                  type="text"
                  value={treasuryForm.sayadiId}
                  onChange={e => setTreasuryForm({ ...treasuryForm, sayadiId: e.target.value })}
                  placeholder="شناسه ۱۶ رقمی صیادی / شماره پیگیری"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                />
                <input
                  type="number"
                  value={treasuryForm.amountRials}
                  onChange={e => setTreasuryForm({ ...treasuryForm, amountRials: parseFloat(e.target.value) || 0 })}
                  placeholder="مبلغ (ریال)"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-black text-emerald-700"
                />
              </div>
              <button
                onClick={async () => {
                  const voucherNo = erpState.nextVoucherNo || 1002;
                  const docNo = `TRS-405-${302 + (erpState.treasuryDocs || []).length}`;
                  const newTrs: ErpTreasuryDoc = {
                    id: `trs_${Date.now()}`,
                    docNo,
                    docType: treasuryForm.docType,
                    dateJalali: getTodayJalali(),
                    partyName: treasuryForm.partyName,
                    partyCode: treasuryForm.partyCode,
                    bankName: treasuryForm.bankName,
                    sayadiId: treasuryForm.sayadiId,
                    chequeSerial: treasuryForm.chequeSerial || '554422',
                    dueDateJalali: treasuryForm.dueDateJalali,
                    amountRials: treasuryForm.amountRials,
                    chequeStatus: treasuryForm.docType === 'RECEIPT_CHEQUE' ? 'IN_VAULT' : 'ISSUED',
                    voucherNo,
                    description: treasuryForm.description || `سند خزانه ${docNo} — ${treasuryForm.partyName}`
                  };
                  const isReceipt = treasuryForm.docType.startsWith('RECEIPT');
                  const vch: ErpVoucher = {
                    id: `vch_${Date.now()}`,
                    voucherNo,
                    dateJalali: getTodayJalali(),
                    type: 'TREASURY',
                    status: 'FINALIZED',
                    description: `سند اتوماتیک خزانه‌داری ${docNo} (${treasuryForm.partyName})`,
                    referenceId: newTrs.id,
                    createdBy: currentUser.fullName,
                    createdAt: Date.now(),
                    lines: [
                      {
                        id: `vl_${Date.now()}_1`,
                        accountCode: isReceipt ? '110202' : '210101',
                        accountTitle: isReceipt ? 'اسناد دریافتنی نزد صندوق' : 'حساب‌های پرداختنی تجاری',
                        tafziliName: isReceipt ? 'صندوق اسناد دریافتنی' : treasuryForm.partyName,
                        debit: treasuryForm.amountRials,
                        credit: 0,
                        description: `ثبت بدهکار خزانه ${docNo}`
                      },
                      {
                        id: `vl_${Date.now()}_2`,
                        accountCode: isReceipt ? '110201' : '110101',
                        accountTitle: isReceipt ? 'حساب‌های دریافتنی تجاری' : 'بانک ملت - حساب جاری عامل',
                        tafziliName: treasuryForm.partyName,
                        debit: 0,
                        credit: treasuryForm.amountRials,
                        description: `ثبت بستانکار خزانه ${docNo}`
                      }
                    ]
                  };
                  await persistErpState(
                    {
                      ...erpState,
                      treasuryDocs: [newTrs, ...(erpState.treasuryDocs || [])],
                      vouchers: [vch, ...erpState.vouchers],
                      nextVoucherNo: voucherNo + 1
                    },
                    `سند خزانه ${docNo} و سند حسابداری #${voucherNo} صادر شد.`
                  );
                }}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-black text-xs cursor-pointer"
              >
                ثبت قطعی سند خزانه و صدور سند حسابداری
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="font-black text-sm">
              بایگانی اسناد خزانه و عملیات چک (واگذاری به بانک / وصول / خرج چک / برگشت)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 px-2">شماره سند</th>
                    <th className="py-2 px-2">نوع</th>
                    <th className="py-2 px-2">طرف حساب</th>
                    <th className="py-2 px-2">بانک / صیادی</th>
                    <th className="py-2 px-2">سررسید</th>
                    <th className="py-2 px-2">مبلغ (ریال)</th>
                    <th className="py-2 px-2">وضعیت چک</th>
                    <th className="py-2 px-2">عملیات چک</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(erpState.treasuryDocs || []).map(td => (
                    <tr key={td.id}>
                      <td className="py-2 px-2 font-mono font-bold text-indigo-600">{td.docNo}</td>
                      <td className="py-2 px-2 font-bold">{td.docType}</td>
                      <td className="py-2 px-2 font-bold">{td.partyName}</td>
                      <td className="py-2 px-2 font-mono text-[11px]">{td.bankName} ({td.sayadiId || '-'})</td>
                      <td className="py-2 px-2 font-mono">{td.dueDateJalali || td.dateJalali}</td>
                      <td className="py-2 px-2 font-mono font-black text-emerald-600">{td.amountRials.toLocaleString()}</td>
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                          {td.chequeStatus || 'قطعی'}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          {(['IN_BANK_COLLECTION', 'CLEARED', 'ENDORSED', 'BOUNCED'] as const).map(st => (
                            <button
                              key={st}
                              onClick={async () => {
                                const nextDocs = (erpState.treasuryDocs || []).map(x =>
                                  x.id === td.id ? { ...x, chequeStatus: st } : x
                                );
                                await persistErpState(
                                  { ...erpState, treasuryDocs: nextDocs },
                                  `وضعیت چک ${td.docNo} به ${st} تغییر یافت.`
                                );
                              }}
                              className="px-2 py-0.5 rounded border text-[10px] font-bold hover:bg-indigo-50 cursor-pointer"
                            >
                              {st === 'IN_BANK_COLLECTION'
                                ? 'واگذاری'
                                : st === 'CLEARED'
                                ? 'وصول'
                                : st === 'ENDORSED'
                                ? 'خرج'
                                : 'برگشت'}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* LIVE BRIDGE TO DELKAM PAYMENT ORDERS CARTABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-indigo-800 dark:text-indigo-300">
                  اتصال زنده به کارتابل دستور پرداخت‌های دلکام ({delkamPaymentOrders.length} دستور پرداخت اخیر)
                </h3>
                <p className="text-[11px] text-slate-500">
                  تبدیل مستقیم دستور پرداخت‌های تاییدشده در کارتابل دلکام به سند خزانه‌داری و سند حسابداری این شرکت
                </p>
              </div>
              <button
                onClick={fetchDelkamOrders}
                className="p-1.5 rounded-lg border hover:bg-slate-100 cursor-pointer"
              >
                <RefreshCw size={14} className={loadingOrders ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 px-2">شماره پیگیری</th>
                    <th className="py-2 px-2">ذینفع / گیرنده وجه</th>
                    <th className="py-2 px-2">شرح پرداخت</th>
                    <th className="py-2 px-2">مبلغ کل (ریال)</th>
                    <th className="py-2 px-2">وضعیت در کارتابل دلکام</th>
                    <th className="py-2 px-2">ثبت در حسابداری</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {delkamPaymentOrders.map(ord => {
                    const alreadyIssued = erpState.vouchers.some(v => v.referenceId === String(ord.id));
                    return (
                      <tr key={ord.id}>
                        <td className="py-2 px-2 font-mono font-black text-indigo-600">#{ord.trackingNumber}</td>
                        <td className="py-2 px-2 font-bold">{ord.payee}</td>
                        <td className="py-2 px-2 text-slate-500 truncate max-w-[220px]">{ord.description}</td>
                        <td className="py-2 px-2 font-mono font-black text-emerald-600">
                          {(Number(ord.totalAmount) || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-2">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                            {ord.status}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          {alreadyIssued ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-black text-[11px]">
                              <CheckCircle2 size={13} />
                              <span>سند صادر شده</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleConvertDelkamPaymentOrderToVoucher(ord)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] cursor-pointer"
                            >
                              صدور سند خزانه و حسابداری
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
