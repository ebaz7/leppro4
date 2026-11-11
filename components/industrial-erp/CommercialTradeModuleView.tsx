import React, { useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';
import { apiCall } from '../../services/apiService';
import { User } from '../../types';
import {
  ErpCompanySummary,
  ErpSubViewId,
  IndustrialErpState,
  ErpRemittance,
  ErpSalesOrder,
  ErpTradeDoc,
  ErpVoucher,
  getTodayJalali
} from './types';

interface CommercialTradeModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  erpState: IndustrialErpState;
  setErpState: React.Dispatch<React.SetStateAction<IndustrialErpState | null>>;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser: User;
  showToast: (type: 'success' | 'error', text: string) => void;
  canCreateSalesFromRemittance: boolean;
  canViewFinancialAmounts: boolean;
}

export const CommercialTradeModuleView: React.FC<CommercialTradeModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  setErpState,
  persistErpState,
  currentUser,
  showToast,
  canCreateSalesFromRemittance,
  canViewFinancialAmounts
}) => {
  // Tehran Pricing state
  const [selectedRemittanceForTehran, setSelectedRemittanceForTehran] = useState<ErpRemittance | null>(null);
  const [tehranPricesMap, setTehranPricesMap] = useState<Record<string, number>>({});
  const [savingLocal, setSavingLocal] = useState(false);

  // Sales & Purchase Orders state
  const [orderForm, setOrderForm] = useState({
    orderType: 'SALES_ORDER' as 'SALES_ORDER' | 'PURCHASE_ORDER',
    partyName: 'شرکت نساجی بهپود',
    partyCode: '113101',
    deliveryDueDate: '1405/08/30',
    itemId: 'itm_yarn_150_w',
    qtyKg: 500,
    estimatedUnitPrice: 2180000,
    notes: ''
  });

  // Direct Trade Docs state
  const [tradeDocType, setTradeDocType] = useState<'PURCHASE' | 'PURCHASE_RETURN' | 'SALES' | 'SALES_RETURN'>('SALES');
  const [tradePartyName, setTradePartyName] = useState<string>('شرکت بازرگانی الیاف نوین');
  const [tradePartyCode, setTradePartyCode] = useState<string>('210105');
  const [tradeSelectedItemId, setTradeSelectedItemId] = useState<string>('itm_poy_150');
  const [tradeQty, setTradeQty] = useState<number>(1000);
  const [tradeUnitPrice, setTradeUnitPrice] = useState<number>(1150000);
  const [tradeDiscount, setTradeDiscount] = useState<number>(0);

  const handleOpenTehranPricingModal = (rem: ErpRemittance) => {
    if (!canCreateSalesFromRemittance) {
      showToast('error', 'شما مجوز قیمت‌گذاری دفتر تهران و صدور فاکتور فروش را ندارید.');
      return;
    }
    const initPrices: Record<string, number> = {};
    for (const it of rem.items) {
      const prod = erpState.items.find(p => p.id === it.productId);
      initPrices[it.productId] = it.unitPrice > 0 ? it.unitPrice : prod?.salesPrice || 2180000;
    }
    setTehranPricesMap(initPrices);
    setSelectedRemittanceForTehran(rem);
  };

  const handleConfirmTehranPriceAndInvoice = async () => {
    if (!selectedRemittanceForTehran) return;
    try {
      setSavingLocal(true);
      const res = await apiCall<any>('/industrial-erp/tehran-price-and-invoice', 'POST', {
        companyId: selectedCompany.id,
        remittanceId: selectedRemittanceForTehran.id,
        itemPrices: tehranPricesMap,
        issuedBy: currentUser.fullName
      });
      if (res?.state) setErpState(res.state);
      setSelectedRemittanceForTehran(null);
      showToast('success', res?.message || 'فاکتور نهایی فروش و سند حسابداری در دفتر تهران صادر گردید.');
    } catch (err: any) {
      showToast('error', err?.message || 'خطا در ثبت فی و صدور فاکتور نهایی');
    } finally {
      setSavingLocal(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. TEHRAN OFFICE PRICING & INVOICING (com_tehran_pricing) */}
      {activeSubView === 'com_tehran_pricing' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                کارتابل دفتر مرکزی تهران — تعیین فی روی حواله‌های خروج کارخانه و تبدیل به فاکتور نهایی
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                حواله‌هایی که کارخانه بدون فی خارج کرده است در این کارتابل قرار می‌گیرند تا پس از ثبت فی، به فاکتور فروش و سند حسابداری تبدیل شوند.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {erpState.remittances.map(rem => (
              <div
                key={rem.id}
                className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-xs text-indigo-600">{rem.remittanceNo}</span>
                    {rem.exitPermitNumber && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono font-bold">
                        مجوز خروج کارخانه #{rem.exitPermitNumber}
                      </span>
                    )}
                    <span className="font-black text-sm text-slate-900 dark:text-white">{rem.customerName}</span>
                    <span className="text-xs text-slate-400">({rem.dateJalali})</span>
                  </div>
                  {rem.items.map((it, idx) => (
                    <div key={idx} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-4">
                      <span className="font-bold">{it.productName}</span>
                      <span className="font-mono">{it.cartonsCount} کارتن ({it.netWeightKg} Kg خالص)</span>
                      {canViewFinancialAmounts && it.unitPrice > 0 && (
                        <span className="font-mono font-bold text-indigo-600">
                          فی: {it.unitPrice.toLocaleString()} ریال
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {rem.status !== 'INVOICED' ? (
                  <button
                    onClick={() => handleOpenTehranPricingModal(rem)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <ShoppingCart size={15} />
                    <span>ثبت فی در دفتر تهران و تبدیل به فاکتور نهایی</span>
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-black text-xs border border-emerald-200">
                    فاکتور نهایی و سند صادر شد
                  </span>
                )}
              </div>
            ))}
          </div>

          {selectedRemittanceForTehran && (
            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="font-black text-sm">
                    تعیین فی فروش در دفتر تهران — حواله {selectedRemittanceForTehran.remittanceNo} ({selectedRemittanceForTehran.customerName})
                  </h3>
                  <button onClick={() => setSelectedRemittanceForTehran(null)} className="cursor-pointer">
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-3">
                  {selectedRemittanceForTehran.items.map(it => {
                    const p = Number(tehranPricesMap[it.productId] || 0);
                    return (
                      <div key={it.productId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border space-y-2 text-xs">
                        <div className="flex justify-between font-bold">
                          <span>{it.productName}</span>
                          <span className="font-mono text-emerald-600">{it.netWeightKg} Kg خالص</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 items-center">
                          <div>
                            <label className="text-[11px] font-bold block mb-1">فی واحد فروش (ریال)</label>
                            <input
                              type="number"
                              value={p}
                              onChange={e =>
                                setTehranPricesMap(prev => ({
                                  ...prev,
                                  [it.productId]: parseFloat(e.target.value) || 0
                                }))
                              }
                              className="w-full px-3 py-1.5 rounded-lg border bg-white font-mono font-black text-indigo-700"
                            />
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">مبلغ کل ردیف:</span>
                            <span className="font-mono font-black text-sm text-emerald-600">
                              {Math.round(it.netWeightKg * p).toLocaleString()} ریال
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setSelectedRemittanceForTehran(null)}
                    className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={handleConfirmTehranPriceAndInvoice}
                    disabled={savingLocal}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
                  >
                    ثبت قطعی فی، صدور فاکتور نهایی و سند حسابداری
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. ORDERS & COMMERCE (ord_new, ord_cartable, com_sales, com_purchases, com_returns) */}
      {(activeSubView === 'ord_new' ||
        activeSubView === 'ord_cartable' ||
        activeSubView === 'com_sales' ||
        activeSubView === 'com_purchases' ||
        activeSubView === 'com_returns') && (
        <div className="space-y-5">
          {(activeSubView === 'ord_new' || activeSubView === 'ord_cartable') && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h3 className="font-black text-sm">مدیریت و ثبت سفارشات فروش نخ / سفارش خرید مواد اولیه</h3>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
                <select
                  value={orderForm.orderType}
                  onChange={e => setOrderForm({ ...orderForm, orderType: e.target.value as any })}
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                >
                  <option value="SALES_ORDER">پیش‌فاکتور / سفارش فروش نخ</option>
                  <option value="PURCHASE_ORDER">سفارش خرید مواد اولیه</option>
                </select>
                <input
                  type="text"
                  value={orderForm.partyName}
                  onChange={e => setOrderForm({ ...orderForm, partyName: e.target.value })}
                  placeholder="نام مشتری / تامین‌کننده"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                />
                <select
                  value={orderForm.itemId}
                  onChange={e => setOrderForm({ ...orderForm, itemId: e.target.value })}
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                >
                  {erpState.items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={orderForm.qtyKg}
                  onChange={e => setOrderForm({ ...orderForm, qtyKg: parseFloat(e.target.value) || 0 })}
                  placeholder="مقدار سفارش (Kg)"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
                />
                <button
                  onClick={async () => {
                    const itm = erpState.items.find(i => i.id === orderForm.itemId);
                    const newOrd: ErpSalesOrder = {
                      id: `so_${Date.now()}`,
                      orderNo: `ORD-405-${202 + (erpState.salesOrders || []).length}`,
                      orderType: orderForm.orderType,
                      dateJalali: getTodayJalali(),
                      partyName: orderForm.partyName,
                      partyCode: orderForm.partyCode,
                      deliveryDueDate: orderForm.deliveryDueDate,
                      status: 'APPROVED_FOR_WAREHOUSE',
                      items: [
                        {
                          itemId: itm?.id || '',
                          itemName: itm?.name || '',
                          qtyKg: orderForm.qtyKg,
                          estimatedUnitPrice: orderForm.estimatedUnitPrice
                        }
                      ]
                    };
                    await persistErpState(
                      { ...erpState, salesOrders: [newOrd, ...(erpState.salesOrders || [])] },
                      `سفارش ${newOrd.orderNo} ثبت و به کارتابل انبار ارسال شد.`
                    );
                  }}
                  className="py-2 rounded-xl bg-amber-600 text-white font-black text-xs cursor-pointer"
                >
                  ثبت سفارش در کارتابل
                </button>
              </div>

              <div className="space-y-2">
                {(erpState.salesOrders || []).map(so => (
                  <div key={so.id} className="p-3 rounded-xl border bg-slate-50 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-black text-indigo-600">{so.orderNo}</span>
                      <span className="mx-2">|</span>
                      <span className="font-bold">{so.partyName}</span>
                      <span className="mx-2 text-slate-400">({so.dateJalali})</span>
                    </div>
                    <div className="font-mono font-bold">
                      {so.items.map(i => `${i.itemName}: ${i.qtyKg} Kg`).join(' ، ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activeSubView === 'com_sales' || activeSubView === 'com_purchases' || activeSubView === 'com_returns') && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h3 className="font-black text-sm">
                صدور مستقیم فاکتور خرید، فروش و برگشتی با ثبت خودکار سند حسابداری و انبار
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs">
                <select
                  value={tradeDocType}
                  onChange={e => setTradeDocType(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                >
                  <option value="SALES">فاکتور فروش قطعی</option>
                  <option value="PURCHASE">فاکتور خرید مواد و ملزومات</option>
                  <option value="SALES_RETURN">فاکتور برگشت از فروش</option>
                  <option value="PURCHASE_RETURN">فاکتور برگشت از خرید</option>
                </select>
                <input
                  type="text"
                  value={tradePartyName}
                  onChange={e => setTradePartyName(e.target.value)}
                  placeholder="نام طرف حساب"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                />
                <select
                  value={tradeSelectedItemId}
                  onChange={e => setTradeSelectedItemId(e.target.value)}
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                >
                  {erpState.items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={tradeQty}
                  onChange={e => setTradeQty(parseFloat(e.target.value) || 0)}
                  placeholder="مقدار"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
                />
                <input
                  type="number"
                  value={tradeUnitPrice}
                  onChange={e => setTradeUnitPrice(parseFloat(e.target.value) || 0)}
                  placeholder="فی واحد (ریال)"
                  className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
                />
                <button
                  onClick={async () => {
                    const item = erpState.items.find(i => i.id === tradeSelectedItemId);
                    if (!item || tradeQty <= 0) return;
                    const gross = Math.round(tradeQty * tradeUnitPrice);
                    const net = Math.max(0, gross - tradeDiscount);
                    const voucherNo = erpState.nextVoucherNo || 1002;
                    const docNo = `INV-405-${202 + erpState.tradeDocs.length}`;
                    const newDoc: ErpTradeDoc = {
                      id: `trd_${Date.now()}`,
                      docNo,
                      docType: tradeDocType,
                      dateJalali: getTodayJalali(),
                      partyName: tradePartyName,
                      partyCode: tradePartyCode,
                      warehouseId: item.warehouseId,
                      items: [
                        {
                          itemId: item.id,
                          itemName: item.name,
                          qty: tradeQty,
                          unit: item.unit,
                          unitPrice: tradeUnitPrice,
                          totalPrice: gross,
                          costPrice: item.unitCost
                        }
                      ],
                      discountAmount: tradeDiscount,
                      taxAmount: 0,
                      netTotalAmount: net,
                      notes: '',
                      createdAt: Date.now(),
                      createdBy: currentUser.fullName
                    };
                    const newVoucher: ErpVoucher = {
                      id: `vch_${Date.now()}`,
                      voucherNo,
                      dateJalali: getTodayJalali(),
                      type: tradeDocType.includes('PURCHASE') ? 'PURCHASE' : 'SALES',
                      status: 'FINALIZED',
                      description: `سند اتوماتیک ${docNo} — ${tradePartyName} (${item.name})`,
                      referenceId: newDoc.id,
                      createdBy: currentUser.fullName,
                      createdAt: Date.now(),
                      lines: [
                        {
                          id: `vl_${Date.now()}_1`,
                          accountCode: tradeDocType === 'SALES' ? '110201' : '110401',
                          accountTitle: tradeDocType === 'SALES' ? 'حساب‌های دریافتنی تجاری' : 'موجودی انبار',
                          tafziliName: tradePartyName,
                          debit: net,
                          credit: 0,
                          description: `ثبت بدهکار فاکتور ${docNo}`
                        },
                        {
                          id: `vl_${Date.now()}_2`,
                          accountCode: tradeDocType === 'SALES' ? '4101' : '210101',
                          accountTitle: tradeDocType === 'SALES' ? 'فروش محصول نهایی نخ' : 'حساب‌های پرداختنی تجاری',
                          tafziliName: item.name,
                          debit: 0,
                          credit: net,
                          description: `ثبت بستانکار فاکتور ${docNo}`
                        }
                      ]
                    };
                    await persistErpState(
                      {
                        ...erpState,
                        tradeDocs: [newDoc, ...erpState.tradeDocs],
                        vouchers: [newVoucher, ...erpState.vouchers],
                        nextVoucherNo: voucherNo + 1
                      },
                      `فاکتور ${docNo} و سند حسابداری #${voucherNo} ثبت گردید.`
                    );
                  }}
                  className="py-2 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
                >
                  صدور فاکتور و سند
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2 px-2">شماره فاکتور</th>
                      <th className="py-2 px-2">نوع</th>
                      <th className="py-2 px-2">طرف حساب</th>
                      <th className="py-2 px-2">تاریخ</th>
                      <th className="py-2 px-2">مبلغ خالص (ریال)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {erpState.tradeDocs.map(doc => (
                      <tr key={doc.id}>
                        <td className="py-2 px-2 font-mono font-bold text-indigo-600">{doc.docNo}</td>
                        <td className="py-2 px-2 font-bold">{doc.docType}</td>
                        <td className="py-2 px-2 font-bold">{doc.partyName}</td>
                        <td className="py-2 px-2 font-mono">{doc.dateJalali}</td>
                        <td className="py-2 px-2 font-mono font-black text-emerald-600">
                          {canViewFinancialAmounts ? doc.netTotalAmount.toLocaleString() : 'محرمانه'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
