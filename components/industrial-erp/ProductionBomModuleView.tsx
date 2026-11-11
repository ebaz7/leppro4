import React, { useState, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import {
  ErpSubViewId,
  IndustrialErpState,
  ErpBom,
  ErpBomComponent,
  ErpItem,
  ErpProductionOrder,
  getTodayJalali
} from './types';

interface ProductionBomModuleViewProps {
  activeSubView: ErpSubViewId;
  erpState: IndustrialErpState;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
}

export const ProductionBomModuleView: React.FC<ProductionBomModuleViewProps> = ({
  activeSubView,
  erpState,
  persistErpState
}) => {
  const finishedYarns = useMemo(() => erpState.items.filter(i => i.category === 'FINISHED_YARN'), [erpState]);

  const [selectedBomProductId, setSelectedBomProductId] = useState<string>('itm_yarn_150_w');
  const [bomWastePercent, setBomWastePercent] = useState<number>(2.5);
  const [bomLaborPerKg, setBomLaborPerKg] = useState<number>(145000);
  const [bomOverheadPerKg, setBomOverheadPerKg] = useState<number>(105000);
  const [bomComponents, setBomComponents] = useState<ErpBomComponent[]>([]);

  const [prodOrderForm, setProdOrderForm] = useState({
    machineCode: 'TMT-01',
    shift: 'شیفت صبح A',
    supervisorName: 'مهندس کریمی',
    productId: 'itm_yarn_150_w',
    lotNumber: 'L405-90',
    targetQtyKg: 2500
  });

  useEffect(() => {
    const existingBom = erpState.boms?.[0];
    if (existingBom) {
      setSelectedBomProductId(existingBom.finishedItemId);
      setBomWastePercent(existingBom.wastePercent);
      setBomLaborPerKg(existingBom.directLaborPerKg);
      setBomOverheadPerKg(existingBom.factoryOverheadPerKg);
      setBomComponents(existingBom.components);
    }
  }, [erpState.companyId]);

  const calculateBomCostPerKg = (
    components: ErpBomComponent[],
    wastePct: number,
    laborPerKg: number,
    overheadPerKg: number,
    yarnItem?: ErpItem | null
  ) => {
    let rawMaterialCostPerKg = 0;
    let packagingCostPerKg = 0;
    const avgNetPerCarton = 23.5;

    for (const comp of components) {
      const mat = erpState.items.find(i => i.id === comp.itemId);
      const unitCost = mat?.unitCost || 0;
      if (comp.category === 'RAW_MATERIAL') {
        const effectiveQty = comp.qtyPerKgOutput * (1 + wastePct / 100);
        rawMaterialCostPerKg += effectiveQty * unitCost;
      } else {
        if (comp.unit.includes('عدد')) {
          packagingCostPerKg += (comp.qtyPerKgOutput * unitCost) / avgNetPerCarton;
        } else {
          packagingCostPerKg += comp.qtyPerKgOutput * unitCost;
        }
      }
    }

    if (components.length === 0 && yarnItem) {
      return {
        rawMaterialCostPerKg: yarnItem.unitCost * 0.78,
        packagingCostPerKg: yarnItem.unitCost * 0.06,
        laborPerKg,
        overheadPerKg,
        totalCostPerKg: yarnItem.unitCost
      };
    }

    const totalCostPerKg = Math.round(rawMaterialCostPerKg + packagingCostPerKg + laborPerKg + overheadPerKg);
    return {
      rawMaterialCostPerKg: Math.round(rawMaterialCostPerKg),
      packagingCostPerKg: Math.round(packagingCostPerKg),
      laborPerKg: Math.round(laborPerKg),
      overheadPerKg: Math.round(overheadPerKg),
      totalCostPerKg
    };
  };

  return (
    <div className="space-y-5">
      {activeSubView === 'prd_bom' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h3 className="font-black text-sm">
            مهندسی فرمول تولید نخ (BOM)، ضایعات فرمول و محاسبه بهای تمام‌شده هر کیلوگرم
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="font-bold block mb-1">محصول نهایی نخ</label>
              <select
                value={selectedBomProductId}
                onChange={e => {
                  const pid = e.target.value;
                  setSelectedBomProductId(pid);
                  const b = erpState.boms.find(x => x.finishedItemId === pid);
                  if (b) {
                    setBomWastePercent(b.wastePercent);
                    setBomLaborPerKg(b.directLaborPerKg);
                    setBomOverheadPerKg(b.factoryOverheadPerKg);
                    setBomComponents(b.components);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold"
              >
                {finishedYarns.map(y => (
                  <option key={y.id} value={y.id}>
                    {y.code} — {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">درصد ضایعات فرمول (%)</label>
              <input
                type="number"
                step="0.1"
                value={bomWastePercent}
                onChange={e => setBomWastePercent(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">دستمزد مستقیم هر کیلو (ریال)</label>
              <input
                type="number"
                value={bomLaborPerKg}
                onChange={e => setBomLaborPerKg(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">سربار کارخانه هر کیلو (ریال)</label>
              <input
                type="number"
                value={bomOverheadPerKg}
                onChange={e => setBomOverheadPerKg(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            {bomComponents.map((comp, idx) => (
              <div key={comp.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-xl border text-xs">
                <div className="col-span-6 font-bold">{comp.itemName}</div>
                <div className="col-span-4 flex items-center gap-2">
                  <span>ضریب مصرف در ۱ کیلو:</span>
                  <input
                    type="number"
                    step="0.005"
                    value={comp.qtyPerKgOutput}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setBomComponents(prev => prev.map((c, i) => (i === idx ? { ...c, qtyPerKgOutput: v } : c)));
                    }}
                    className="w-24 px-2 py-1 rounded border bg-white font-mono font-bold"
                  />
                </div>
                <div className="col-span-2 text-left">
                  <button
                    onClick={() => setBomComponents(prev => prev.filter((_, i) => i !== idx))}
                    className="text-rose-500 cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={async () => {
              const prod = erpState.items.find(i => i.id === selectedBomProductId);
              if (!prod) return;
              const costRes = calculateBomCostPerKg(bomComponents, bomWastePercent, bomLaborPerKg, bomOverheadPerKg, prod);
              const newBom: ErpBom = {
                id: `bom_${prod.id}`,
                finishedItemId: prod.id,
                finishedItemName: prod.name,
                version: 'v1.1',
                wastePercent: bomWastePercent,
                directLaborPerKg: bomLaborPerKg,
                factoryOverheadPerKg: bomOverheadPerKg,
                components: bomComponents
              };
              const nextBoms = erpState.boms.some(b => b.finishedItemId === prod.id)
                ? erpState.boms.map(b => (b.finishedItemId === prod.id ? newBom : b))
                : [...erpState.boms, newBom];
              const nextItems = erpState.items.map(i =>
                i.id === prod.id ? { ...i, unitCost: costRes.totalCostPerKg } : i
              );
              await persistErpState(
                { ...erpState, boms: nextBoms, items: nextItems },
                `فرمول تولید ذخیره شد. بهای تمام‌شده هر کیلوگرم: ${costRes.totalCostPerKg.toLocaleString()} ریال`
              );
            }}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
          >
            ذخیره فرمول تولید (BOM) و بروزرسانی بهای تمام‌شده استاندارد
          </button>
        </div>
      )}

      {activeSubView === 'prd_line_perf' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h3 className="font-black text-sm">عملکرد خطوط تولید نساجی، حکم کار ماشین‌آلات و راندمان شیفت</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <input
              type="text"
              value={prodOrderForm.machineCode}
              onChange={e => setProdOrderForm({ ...prodOrderForm, machineCode: e.target.value })}
              placeholder="کد ماشین (مثلاً TMT-01)"
              className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
            />
            <input
              type="text"
              value={prodOrderForm.lotNumber}
              onChange={e => setProdOrderForm({ ...prodOrderForm, lotNumber: e.target.value })}
              placeholder="شماره لات تولید"
              className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
            />
            <input
              type="number"
              value={prodOrderForm.targetQtyKg}
              onChange={e => setProdOrderForm({ ...prodOrderForm, targetQtyKg: parseFloat(e.target.value) || 0 })}
              placeholder="تناژ هدف (کیلوگرم)"
              className="px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
            />
            <button
              onClick={async () => {
                const prod = finishedYarns.find(y => y.id === prodOrderForm.productId) || finishedYarns[0];
                const ord: ErpProductionOrder = {
                  id: `pord_${Date.now()}`,
                  orderNo: `PRD-405-${103 + (erpState.productionOrders || []).length}`,
                  dateJalali: getTodayJalali(),
                  machineCode: prodOrderForm.machineCode,
                  shift: prodOrderForm.shift,
                  supervisorName: prodOrderForm.supervisorName,
                  productId: prod?.id || '',
                  productName: prod?.name || 'نخ تکسچره',
                  lotNumber: prodOrderForm.lotNumber,
                  targetQtyKg: prodOrderForm.targetQtyKg,
                  producedQtyKg: 0,
                  wasteQtyKg: 0,
                  status: 'IN_PROGRESS'
                };
                await persistErpState(
                  { ...erpState, productionOrders: [ord, ...(erpState.productionOrders || [])] },
                  `حکم کار تولید ${ord.orderNo} صادر شد.`
                );
              }}
              className="py-2 rounded-xl bg-emerald-600 text-white font-black text-xs cursor-pointer"
            >
              ثبت حکم کار خط تولید
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 px-2">شماره حکم</th>
                  <th className="py-2 px-2">ماشین / شیفت</th>
                  <th className="py-2 px-2">محصول نخ</th>
                  <th className="py-2 px-2">لات</th>
                  <th className="py-2 px-2">هدف (Kg)</th>
                  <th className="py-2 px-2">تولیدشده (Kg)</th>
                  <th className="py-2 px-2">ضایعات (Kg)</th>
                  <th className="py-2 px-2">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(erpState.productionOrders || []).map(po => (
                  <tr key={po.id}>
                    <td className="py-2 px-2 font-mono font-bold text-indigo-600">{po.orderNo}</td>
                    <td className="py-2 px-2 font-bold">{po.machineCode} — {po.shift}</td>
                    <td className="py-2 px-2 font-bold">{po.productName}</td>
                    <td className="py-2 px-2 font-mono">{po.lotNumber}</td>
                    <td className="py-2 px-2 font-mono">{po.targetQtyKg.toLocaleString()}</td>
                    <td className="py-2 px-2 font-mono font-black text-emerald-600">{po.producedQtyKg.toLocaleString()}</td>
                    <td className="py-2 px-2 font-mono text-rose-600">{po.wasteQtyKg}</td>
                    <td className="py-2 px-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                        در حال تولید
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
