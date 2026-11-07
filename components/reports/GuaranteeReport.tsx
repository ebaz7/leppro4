
import React, { useState, useMemo } from 'react';
import { TradeRecord } from '../../types';
import { formatCurrency } from '../../constants';
import { Printer, Search, Filter, ShieldCheck, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import PrintGuaranteeReport from '../print/PrintGuaranteeReport';
import { getGuaranteeDueStatus } from '../../utils/guaranteeAlertUtils';

interface Props {
    records: TradeRecord[];
}

interface GuaranteeItem {
    id: string; // Unique ID composed of recordId + index
    fileNumber: string;
    company: string;
    section: string; // 'Currency' or 'Customs'
    bank: string;
    chequeNumber: string;
    amount: number;
    dueDate: string;
    isDelivered: boolean; // Status
    description: string;
    needsFundAlert: boolean;
    dueStatusLabel: string;
    dueStatusBadgeClass: string;
    dueStatusBgClass: string;
    daysRemaining: number | null;
}

const GuaranteeReport: React.FC<Props> = ({ records }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'urgent' | 'delivered' | 'pending'>('all');
    const [sectionFilter, setSectionFilter] = useState<'all' | 'Currency' | 'Customs'>('all');
    const [showPrintModal, setShowPrintModal] = useState(false); // State for Print Modal

    // 1. Extract and Flatten Data
    const guaranteeData = useMemo(() => {
        const list: GuaranteeItem[] = [];

        records.forEach(r => {
            // A. Currency Purchase Guarantees
            if (r.currencyPurchaseData) {
                const currencyGuarantees = r.currencyPurchaseData.guaranteeCheques || 
                    (r.currencyPurchaseData.guaranteeCheque ? [r.currencyPurchaseData.guaranteeCheque] : []);

                currencyGuarantees.forEach((g, idx) => {
                    if (g.chequeNumber || g.amount) {
                        const dueStatus = getGuaranteeDueStatus(g.dueDate, g.isDelivered);
                        list.push({
                            id: `${r.id}_currency_${idx}`,
                            fileNumber: r.fileNumber || '-',
                            company: r.company || '-',
                            section: 'ارزی (رفع تعهد)',
                            bank: g.bank || '-',
                            chequeNumber: g.chequeNumber || '-',
                            amount: g.amount || 0,
                            dueDate: g.dueDate || '-',
                            isDelivered: !!g.isDelivered,
                            description: 'ضمانت خرید ارز',
                            needsFundAlert: dueStatus.needsFundAlert,
                            dueStatusLabel: dueStatus.statusLabel,
                            dueStatusBadgeClass: dueStatus.badgeClass,
                            dueStatusBgClass: dueStatus.bgClass,
                            daysRemaining: dueStatus.daysRemaining
                        });
                    }
                });
            }

            // B. Customs (Green Leaf) Guarantees
            if (r.greenLeafData?.guarantees) {
                r.greenLeafData.guarantees.forEach((g) => {
                    // Only process if it has a cheque number or guarantee number or amount
                    if (g.chequeNumber || g.guaranteeNumber || g.guaranteeAmount) {
                        const effectiveDueDate = g.dueDate || g.chequeDate || g.cashDate || '';
                        const dueStatus = getGuaranteeDueStatus(effectiveDueDate, g.isDelivered);
                        const duty = r.greenLeafData?.duties?.find(d => d.id === g.relatedDutyId);

                        list.push({
                            id: `${r.id}_customs_${g.id}`,
                            fileNumber: r.fileNumber || '-',
                            company: r.company || '-',
                            section: 'گمرک (برگ سبز)',
                            bank: g.guaranteeBank || (g.guaranteeType === 'credit' ? 'حد اعتبار بانکی' : (g.chequeBank || '-')),
                            chequeNumber: (g.guaranteeNumber || g.chequeNumber || '-') + (g.sepamNumber ? ` [سپام: ${g.sepamNumber}]` : ''),
                            amount: (g.guaranteeAmount || g.chequeAmount || 0) + (g.cashAmount || 0),
                            dueDate: effectiveDueDate || '-',
                            isDelivered: !!g.isDelivered,
                            description: duty ? `ضمانت کوتاژ ${duty.cottageNumber}` : 'ضمانت گمرکی',
                            needsFundAlert: dueStatus.needsFundAlert,
                            dueStatusLabel: dueStatus.statusLabel,
                            dueStatusBadgeClass: dueStatus.badgeClass,
                            dueStatusBgClass: dueStatus.bgClass,
                            daysRemaining: dueStatus.daysRemaining
                        });
                    }
                });
            }
        });

        return list;
    }, [records]);

    // 2. Filter Data
    const filteredData = useMemo(() => {
        return guaranteeData.filter(item => {
            const matchesSearch = 
                item.fileNumber.includes(searchTerm) || 
                item.chequeNumber.includes(searchTerm) || 
                item.bank.includes(searchTerm) ||
                item.company.includes(searchTerm);
            
            const matchesStatus = 
                statusFilter === 'all' ? true : 
                statusFilter === 'urgent' ? (!item.isDelivered && item.needsFundAlert) :
                statusFilter === 'delivered' ? item.isDelivered : 
                !item.isDelivered;

            const matchesSection = 
                sectionFilter === 'all' ? true : 
                sectionFilter === 'Currency' ? item.section.includes('ارزی') :
                item.section.includes('گمرک');

            return matchesSearch && matchesStatus && matchesSection;
        });
    }, [guaranteeData, searchTerm, statusFilter, sectionFilter]);

    // 3. Totals & Stats
    const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0);
    const urgentCount = guaranteeData.filter(i => !i.isDelivered && i.needsFundAlert).length;

    return (
        <div className="glass-panel p-4 rounded-lg shadow-sm border h-full flex flex-col">
            
            {/* Show Print Modal when active */}
            {showPrintModal && (
                <PrintGuaranteeReport 
                    data={filteredData} 
                    totalAmount={totalAmount} 
                    onClose={() => setShowPrintModal(false)} 
                />
            )}

            {/* Header / Filters */}
            <div className="bg-gray-100 dark:bg-gray-800/40 text-gray-800 dark:text-gray-200 p-3 rounded-xl mb-4 border border-gray-200/50 dark:border-white/10 flex flex-col md:flex-row gap-4 justify-between items-end md:items-center">
                <div className="flex flex-wrap gap-3 flex-1 w-full items-center">
                    <div className="relative">
                        <Search className="absolute right-2.5 top-2.5 text-gray-400" size={16}/>
                        <input 
                            className="w-48 pl-2 pr-8 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800" 
                            placeholder="جستجو (شماره چک، پرونده...)" 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 glass-panel border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 bg-white dark:bg-gray-800">
                        <Filter size={16} className="text-gray-500"/>
                        <select className="bg-transparent text-sm outline-none font-medium" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                            <option value="all">همه وضعیت‌ها</option>
                            <option value="urgent">⚠️ نیاز به تامین موجودی (سررسید نزدیک)</option>
                            <option value="pending">نزد سازمان (در جریان)</option>
                            <option value="delivered">عودت شده (آزاد شده)</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 glass-panel border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 bg-white dark:bg-gray-800">
                        <ShieldCheck size={16} className="text-gray-500"/>
                        <select className="bg-transparent text-sm outline-none font-medium" value={sectionFilter} onChange={e => setSectionFilter(e.target.value as any)}>
                            <option value="all">همه بخش‌ها</option>
                            <option value="Currency">ارزی (رفع تعهد)</option>
                            <option value="Customs">گمرکی (برگ سبز)</option>
                        </select>
                    </div>

                    {urgentCount > 0 && (
                        <button 
                            type="button" 
                            onClick={() => setStatusFilter(statusFilter === 'urgent' ? 'all' : 'urgent')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${statusFilter === 'urgent' ? 'bg-amber-600 text-white border-amber-700 shadow-sm' : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'}`}
                        >
                            <AlertTriangle size={14} className="text-amber-700 shrink-0"/>
                            <span>{urgentCount} مورد هشدار سررسید</span>
                        </button>
                    )}
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setShowPrintModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 flex items-center gap-2 text-sm font-bold shadow-sm transition-transform active:scale-95">
                        <Printer size={16}/> چاپ / PDF
                    </button>
                </div>
            </div>

            {/* Interactive Table (View Mode) */}
            <div className="flex-1 overflow-auto glass-panel border border-gray-200 dark:border-gray-800 rounded-xl">
                <table className="w-full border-collapse text-center text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-800 dark:text-gray-200 sticky top-0 z-10 shadow-xs">
                        <tr>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">ردیف</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">شماره پرونده</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">شرکت</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">بخش</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">بانک</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">شماره چک/سند</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">سررسید</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">مبلغ (ریال)</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">وضعیت تسویه</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">وضعیت سررسید / هشدار</th>
                            <th className="p-3 text-gray-600 dark:text-gray-400 font-bold border-b">توضیحات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {filteredData.length === 0 ? (
                            <tr><td colSpan={11} className="p-8 text-center text-gray-400">موردی یافت نشد</td></tr>
                        ) : (
                            filteredData.map((item, idx) => (
                                <tr key={item.id} className={`hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors ${item.needsFundAlert && !item.isDelivered ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
                                    <td className="p-3 text-gray-500">{idx + 1}</td>
                                    <td className="p-3 font-bold text-gray-800 dark:text-gray-100">{item.fileNumber}</td>
                                    <td className="p-3 text-gray-700 dark:text-gray-300">{item.company}</td>
                                    <td className="p-3">
                                        <span className={`text-xs px-2 py-1 rounded-md border ${item.section.includes('ارزی') ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' : 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800'}`}>
                                            {item.section}
                                        </span>
                                    </td>
                                    <td className="p-3 text-gray-700 dark:text-gray-300">{item.bank}</td>
                                    <td className="p-3 font-mono font-bold dir-ltr text-gray-800 dark:text-gray-200">{item.chequeNumber}</td>
                                    <td className="p-3 dir-ltr font-mono font-bold text-gray-700 dark:text-gray-300">{item.dueDate}</td>
                                    <td className="p-3 font-mono dir-ltr font-bold text-blue-600 dark:text-blue-400">{formatCurrency(item.amount)}</td>
                                    <td className="p-3">
                                        <div className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${item.isDelivered ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                                            {item.isDelivered ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                                            {item.isDelivered ? 'عودت شده' : 'نزد سازمان'}
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-md border ${item.dueStatusBadgeClass}`}>
                                            {item.dueStatusLabel}
                                        </span>
                                    </td>
                                    <td className="p-3 text-gray-500 dark:text-gray-400 text-xs">{item.description}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-800 sticky bottom-0">
                        <tr>
                            <td colSpan={7} className="p-3 text-left font-bold text-gray-700 dark:text-gray-300 pl-6">جمع کل مبلغ تضمین:</td>
                            <td className="p-3 font-mono font-black text-lg text-blue-800 dark:text-blue-400 dir-ltr">{formatCurrency(totalAmount)}</td>
                            <td colSpan={3}></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default GuaranteeReport;
