import React, { useState } from 'react';
import { Sliders } from 'lucide-react';
import { User } from '../../types';
import {
  ErpCompanySummary,
  ErpSubViewId,
  IndustrialErpState,
  ErpEmployee,
  ErpPayrollSlip,
  ErpVoucher,
  ErpCutoverConfig,
  getTodayJalali
} from './types';

interface PayrollAssetsMasterModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  companies: ErpCompanySummary[];
  setSelectedCompany: React.Dispatch<React.SetStateAction<ErpCompanySummary | null>>;
  erpState: IndustrialErpState;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser: User;
  cutoffDateInput: string;
  setCutoffDateInput: React.Dispatch<React.SetStateAction<string>>;
  importingTrialBalance: boolean;
  handleImportSayanTrialBalance: () => Promise<void>;
  handleToggleCutoverStage: (stageKey: keyof ErpCutoverConfig) => Promise<void>;
}

export const PayrollAssetsMasterModuleView: React.FC<PayrollAssetsMasterModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  companies,
  setSelectedCompany,
  erpState,
  persistErpState,
  currentUser,
  cutoffDateInput,
  setCutoffDateInput,
  importingTrialBalance,
  handleImportSayanTrialBalance,
  handleToggleCutoverStage
}) => {
  const [newEmployeeForm, setNewEmployeeForm] = useState({
    personnelCode: 'PRS-1005',
    fullName: '',
    nationalId: '',
    department: 'تولید و تکسچرایزینگ',
    jobTitle: 'اپراتور خط تولید',
    baseSalaryRials: 115000000,
    housingAllowanceRials: 18000000,
    childAllowanceRials: 14000000,
    bankSheba: ''
  });

  const [payrollMonth, setPayrollMonth] = useState<string>('1405/08');

  return (
    <div className="space-y-5">
      {/* 1. PAYROLL & HR (pay_employees & pay_slips) */}
      {(activeSubView === 'pay_employees' || activeSubView === 'pay_slips') && (
        <div className="space-y-5">
          {activeSubView === 'pay_employees' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-3">
                <h3 className="font-black text-sm">تشکیل پرونده پرسنلی و حکم کارگزینی</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <input
                    type="text"
                    value={newEmployeeForm.personnelCode}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, personnelCode: e.target.value })}
                    placeholder="کد پرسنلی"
                    className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                  />
                  <input
                    type="text"
                    value={newEmployeeForm.fullName}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, fullName: e.target.value })}
                    placeholder="نام و نام خانوادگی"
                    className="px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                  />
                  <input
                    type="text"
                    value={newEmployeeForm.department}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, department: e.target.value })}
                    placeholder="مرکز هزینه / واحد"
                    className="px-3 py-2 rounded-xl border bg-slate-50"
                  />
                  <input
                    type="number"
                    value={newEmployeeForm.baseSalaryRials}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, baseSalaryRials: parseFloat(e.target.value) || 0 })}
                    placeholder="حقوق پایه (ریال)"
                    className="px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!newEmployeeForm.fullName) return;
                    const emp: ErpEmployee = { id: `emp_${Date.now()}`, ...newEmployeeForm };
                    await persistErpState(
                      { ...erpState, employees: [...(erpState.employees || []), emp] },
                      `پرونده پرسنلی «${emp.fullName}» ثبت شد.`
                    );
                  }}
                  className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-black text-xs cursor-pointer"
                >
                  ثبت پرونده پرسنل
                </button>
              </div>
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-3">
                <h3 className="font-black text-sm">لیست پرسنل و مراکز هزینه ({(erpState.employees || []).length})</h3>
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2 px-2">کد</th>
                      <th className="py-2 px-2">نام و نام خانوادگی</th>
                      <th className="py-2 px-2">مرکز هزینه</th>
                      <th className="py-2 px-2">حقوق پایه (ریال)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(erpState.employees || []).map(emp => (
                      <tr key={emp.id}>
                        <td className="py-2 px-2 font-mono font-bold">{emp.personnelCode}</td>
                        <td className="py-2 px-2 font-bold">{emp.fullName}</td>
                        <td className="py-2 px-2">{emp.department}</td>
                        <td className="py-2 px-2 font-mono font-bold">{emp.baseSalaryRials.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSubView === 'pay_slips' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm">محاسبه لیست حقوق و دستمزد ماهانه، بیمه تامین اجتماعی (۷٪ و ۲۳٪) و صدور سند حقوق</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={payrollMonth}
                    onChange={e => setPayrollMonth(e.target.value)}
                    className="w-28 px-3 py-1.5 rounded-xl border font-mono text-xs text-center font-bold"
                  />
                  <button
                    onClick={async () => {
                      const voucherNo = erpState.nextVoucherNo || 1002;
                      const slips: ErpPayrollSlip[] = (erpState.employees || []).map(emp => {
                        const gross = emp.baseSalaryRials + emp.housingAllowanceRials + emp.childAllowanceRials;
                        const insEmp = Math.round(gross * 0.07);
                        const insEr = Math.round(gross * 0.23);
                        const tax = Math.round(gross * 0.03);
                        return {
                          id: `slp_${emp.id}_${Date.now()}`,
                          yearMonth: payrollMonth,
                          employeeId: emp.id,
                          employeeName: emp.fullName,
                          personnelCode: emp.personnelCode,
                          workedDays: 30,
                          overtimeHours: 15,
                          grossPayRials: gross,
                          insuranceEmployeeRials: insEmp,
                          insuranceEmployerRials: insEr,
                          taxRials: tax,
                          netPayableRials: gross - insEmp - tax,
                          voucherNo
                        };
                      });
                      const totalGross = slips.reduce((s, x) => s + x.grossPayRials, 0);
                      const totalNet = slips.reduce((s, x) => s + x.netPayableRials, 0);
                      const totalInsTax = totalGross - totalNet;
                      const vch: ErpVoucher = {
                        id: `vch_${Date.now()}`,
                        voucherNo,
                        dateJalali: getTodayJalali(),
                        type: 'PAYROLL',
                        status: 'FINALIZED',
                        description: `سند حقوق و دستمزد ماه ${payrollMonth} پرسنل کارخانه و دفتر`,
                        createdBy: currentUser.fullName,
                        createdAt: Date.now(),
                        lines: [
                          {
                            id: `vl_${Date.now()}_1`,
                            accountCode: '5102',
                            accountTitle: 'دستمزد مستقیم و حقوق کارخانه',
                            tafziliName: `لیست حقوق ${payrollMonth}`,
                            debit: totalGross,
                            credit: 0,
                            description: `ناخالص حقوق و مزایا ماه ${payrollMonth}`
                          },
                          {
                            id: `vl_${Date.now()}_2`,
                            accountCode: '210201',
                            accountTitle: 'حقوق و دستمزد پرداختنی (خالص پرسنل)',
                            tafziliName: 'پرسنل شرکت',
                            debit: 0,
                            credit: totalNet,
                            description: `خالص پرداختنی حقوق ${payrollMonth}`
                          },
                          {
                            id: `vl_${Date.now()}_3`,
                            accountCode: '210202',
                            accountTitle: 'سازمان تامین اجتماعی و مالیات حقوق',
                            tafziliName: 'بیمه و دارایی',
                            debit: 0,
                            credit: totalInsTax,
                            description: `کسور بیمه و مالیات حقوق ${payrollMonth}`
                          }
                        ]
                      };
                      await persistErpState(
                        {
                          ...erpState,
                          payrollSlips: [...slips, ...(erpState.payrollSlips || [])],
                          vouchers: [vch, ...erpState.vouchers],
                          nextVoucherNo: voucherNo + 1
                        },
                        `فیش‌های حقوقی ماه ${payrollMonth} و سند حسابداری حقوق (#${voucherNo}) صادر شد.`
                      );
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-600 text-white font-black text-xs cursor-pointer"
                  >
                    محاسبه فیش‌های حقوقی و صدور اتوماتیک سند حقوق
                  </button>
                </div>
              </div>

              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 px-2">ماه</th>
                    <th className="py-2 px-2">نام پرسنل</th>
                    <th className="py-2 px-2">ناخالص حقوق</th>
                    <th className="py-2 px-2">بیمه سهم کارگر (۷٪)</th>
                    <th className="py-2 px-2">مالیات</th>
                    <th className="py-2 px-2">خالص پرداختنی (ریال)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(erpState.payrollSlips || []).map(sl => (
                    <tr key={sl.id}>
                      <td className="py-2 px-2 font-mono">{sl.yearMonth}</td>
                      <td className="py-2 px-2 font-bold">{sl.employeeName}</td>
                      <td className="py-2 px-2 font-mono">{sl.grossPayRials.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono text-amber-600">{sl.insuranceEmployeeRials.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono text-rose-600">{sl.taxRials.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono font-black text-emerald-600">{sl.netPayableRials.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. FIXED ASSETS & DEPRECIATION (ast_management) */}
      {activeSubView === 'ast_management' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-sm">پلاک‌گذاری دارایی‌های ثابت، ماشین‌آلات ریسندگی و محاسبه استهلاک</h3>
            <button
              onClick={async () => {
                const voucherNo = erpState.nextVoucherNo || 1002;
                const totalDep = (erpState.fixedAssets || []).reduce(
                  (s, a) => s + Math.round((a.costRials * (a.annualRatePercent / 100)) / 12),
                  0
                );
                const vch: ErpVoucher = {
                  id: `vch_${Date.now()}`,
                  voucherNo,
                  dateJalali: getTodayJalali(),
                  type: 'GENERAL',
                  status: 'FINALIZED',
                  description: 'سند هزینه استهلاک ماهانه دارایی‌های ثابت و ماشین‌آلات تولید',
                  createdBy: currentUser.fullName,
                  createdAt: Date.now(),
                  lines: [
                    {
                      id: `vl_${Date.now()}_1`,
                      accountCode: '5103',
                      accountTitle: 'سربار ساخت - هزینه استهلاک ماشین‌آلات',
                      tafziliName: 'سالن تولید',
                      debit: totalDep,
                      credit: 0,
                      description: 'ثبت هزینه استهلاک دوره'
                    },
                    {
                      id: `vl_${Date.now()}_2`,
                      accountCode: '1202',
                      accountTitle: 'استهلاک انباشته دارایی‌های ثابت',
                      tafziliName: 'ماشین‌آلات تولید',
                      debit: 0,
                      credit: totalDep,
                      description: 'ثبت استهلاک انباشته دوره'
                    }
                  ]
                };
                await persistErpState(
                  { ...erpState, vouchers: [vch, ...erpState.vouchers], nextVoucherNo: voucherNo + 1 },
                  `سند استهلاک دارایی‌های ثابت (#${voucherNo}) صادر گردید.`
                );
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white font-black text-xs cursor-pointer"
            >
              محاسبه استهلاک دوره و صدور سند هزینه استهلاک
            </button>
          </div>
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 px-2">پلاک اموال</th>
                <th className="py-2 px-2">شرح دارایی / ماشین</th>
                <th className="py-2 px-2">مستقر در</th>
                <th className="py-2 px-2">بهای تمام‌شده (ریال)</th>
                <th className="py-2 px-2">نرخ استهلاک</th>
                <th className="py-2 px-2">ارزش دفتری (ریال)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(erpState.fixedAssets || []).map(ast => (
                <tr key={ast.id}>
                  <td className="py-2 px-2 font-mono font-bold text-indigo-600">{ast.assetCode}</td>
                  <td className="py-2 px-2 font-bold">{ast.title}</td>
                  <td className="py-2 px-2">{ast.location}</td>
                  <td className="py-2 px-2 font-mono">{ast.costRials.toLocaleString()}</td>
                  <td className="py-2 px-2 font-mono">{ast.annualRatePercent}% ({ast.depreciationMethod})</td>
                  <td className="py-2 px-2 font-mono font-black text-emerald-600">{ast.bookValueRials.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. MASTER COMPANIES & SAYAN CUTOVER (mst_companies & mst_sayan_cutover) */}
      {activeSubView === 'mst_sayan_cutover' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 p-5 space-y-5">
          <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders size={18} className="text-indigo-600" />
            <span>پنل فعال‌سازی مرحله‌به‌مرحله جایگزینی سایان و انتقال تراز افتتاحیه در «{selectedCompany.name}»</span>
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

      {activeSubView === 'mst_companies' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-sm">مدیریت شرکت‌های مستقل در سامانه حسابداری و ERP</h3>
            <button
              onClick={() => setSelectedCompany(null)}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
            >
              بازگشت به درگاه انتخاب شرکت / افزودن شرکت جدید
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companies.map(c => (
              <div key={c.id} className="p-4 rounded-xl border flex items-center justify-between">
                <div>
                  <div className="font-black text-sm">{c.name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    شناسه ملی: {c.nationalId} | سال مالی فعال: {c.activeFiscalYear}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCompany(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    c.id === selectedCompany.id ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {c.id === selectedCompany.id ? 'شرکت فعال فعلی' : 'ورود به این شرکت'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
