import React, { useState, useMemo } from 'react';
import {
    Cpu,
    Plus,
    Trash2,
    Edit3,
    Check,
    X,
    Save,
    Calculator,
    Calendar,
    Layers,
    Sparkles,
    RotateCcw,
    Sliders,
    ArrowDown,
    Activity,
    Info,
    CheckCircle2
} from 'lucide-react';
import { ProductionMachine, ProductionLineGroup, ProductionPlanConfig } from '../types';
import toast from 'react-hot-toast';
import { getEffectiveApiUrl } from '../services/apiService';

interface ProductionPlanManagerProps {
    dateFrom: string;
    dateTo: string;
    currentPlan: ProductionPlanConfig | null;
    availableGroups: string[]; // List of master groups from Sayan
    onPlanUpdated?: (updatedPlan: ProductionPlanConfig, newIdealTargets?: any) => void;
    className?: string;
}

/**
 * Standard Textile Capacity Formula:
 * Daily Production (kg) = (yarnCount * 60 * 24 * positionsCount * speedMpm) / 9,000,000
 * In case efficiency is provided: daily * (efficiencyPct / 100)
 */
export function calculateMachineDailyCapacity(machine: ProductionMachine): number {
    const yarn = Number(machine.yarnCount) || 0;
    const pos = Number(machine.positionsCount) || 0;
    const spd = Number(machine.speedMpm) || 0;
    const eff = Number(machine.efficiencyPct ?? 100) / 100;

    if (yarn <= 0 || pos <= 0 || spd <= 0) return 0;
    // Formula: (yarn * 60 * 24 * pos * spd) / 9,000,000
    const rawDaily = (yarn * 60 * 24 * pos * spd) / 9000000;
    return rawDaily * eff;
}

export function calculateMachinePeriodCapacity(machine: ProductionMachine, days: number = 1): number {
    const daily = calculateMachineDailyCapacity(machine);
    return daily * Math.max(1, days);
}

export const ProductionPlanManager: React.FC<ProductionPlanManagerProps> = ({
    dateFrom,
    dateTo,
    currentPlan,
    availableGroups,
    onPlanUpdated,
    className = ''
}) => {
    // Days calculation based on date range or user preference
    const calculatedDays = useMemo(() => {
        if (!dateFrom || !dateTo) return 1;
        if (dateFrom === dateTo) return 1;
        // Standard Persian day difference estimation or fallback
        try {
            const p1 = dateFrom.split('/').map(Number);
            const p2 = dateTo.split('/').map(Number);
            if (p1.length === 3 && p2.length === 3) {
                const diffDays = (p2[0] - p1[0]) * 365 + (p2[1] - p1[1]) * 30 + (p2[2] - p1[2]) + 1;
                return Math.max(1, diffDays);
            }
        } catch (_) {}
        return 1;
    }, [dateFrom, dateTo]);

    // Local state for plan configuration
    const [planDays, setPlanDays] = useState<number>(() => currentPlan?.daysCount || calculatedDays || 1);
    const [planScope, setPlanScope] = useState<'daily' | 'monthly' | 'custom'>(() => {
        if (currentPlan?.scopeType === 'monthly') return 'monthly';
        if (currentPlan?.scopeType === 'custom') return 'custom';
        return calculatedDays > 1 ? 'custom' : 'daily';
    });

    const [lineGroups, setLineGroups] = useState<ProductionLineGroup[]>(() => {
        if (currentPlan && Array.isArray(currentPlan.lineGroups) && currentPlan.lineGroups.length > 0) {
            return JSON.parse(JSON.stringify(currentPlan.lineGroups));
        }
        return [
            {
                groupName: 'dty یا پلی استر',
                machines: [
                    { id: 'm_dty_1', code: 'DTY-01', name: 'دستگاه DTY شماره ۱ (بارمگ)', yarnCount: 150, positionsCount: 288, speedMpm: 800, active: true },
                    { id: 'm_dty_2', code: 'DTY-02', name: 'دستگاه DTY شماره ۲ (بارمگ)', yarnCount: 150, positionsCount: 288, speedMpm: 800, active: true },
                    { id: 'm_dty_3', code: 'DTY-03', name: 'دستگاه DTY شماره ۳ (تکستچره)', yarnCount: 75, positionsCount: 240, speedMpm: 750, active: true },
                    { id: 'm_dty_4', code: 'DTY-04', name: 'دستگاه DTY شماره ۴ (تکستچره)', yarnCount: 300, positionsCount: 216, speedMpm: 700, active: true }
                ]
            },
            {
                groupName: 'POY',
                machines: [
                    { id: 'm_poy_1', code: 'POY-01', name: 'خط ریسندگی POY شماره ۱', yarnCount: 250, positionsCount: 144, speedMpm: 2800, active: true },
                    { id: 'm_poy_2', code: 'POY-02', name: 'خط ریسندگی POY شماره ۲', yarnCount: 130, positionsCount: 144, speedMpm: 3000, active: true }
                ]
            },
            {
                groupName: 'کش',
                machines: [
                    { id: 'm_el_1', code: 'EL-01', name: 'دستگاه بافت کش شماره ۱', yarnCount: 150, positionsCount: 120, speedMpm: 450, active: true },
                    { id: 'm_el_2', code: 'EL-02', name: 'دستگاه بافت کش شماره ۲', yarnCount: 150, positionsCount: 120, speedMpm: 450, active: true }
                ]
            },
            {
                groupName: 'اسپاندکس (کاور)',
                machines: [
                    { id: 'm_sp_1', code: 'SP-01', name: 'دستگاه کاورینگ اسپاندکس ۱', yarnCount: 70, positionsCount: 128, speedMpm: 550, active: true },
                    { id: 'm_sp_2', code: 'SP-02', name: 'دستگاه کاورینگ اسپاندکس ۲', yarnCount: 140, positionsCount: 128, speedMpm: 500, active: true }
                ]
            },
            {
                groupName: 'پلی استر شوایتر',
                machines: [
                    { id: 'm_sch_1', code: 'SCH-01', name: 'دستگاه شوایتر شماره ۱', yarnCount: 150, positionsCount: 48, speedMpm: 600, active: true }
                ]
            }
        ];
    });

    const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);
    const [newGroupNameInput, setNewGroupNameInput] = useState('');
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);

    // Currently active group
    const currentGroup = lineGroups[selectedGroupIndex] || lineGroups[0];

    // Grand Totals Calculation
    const overallPlanStats = useMemo(() => {
        let totalDailyKg = 0;
        let totalPeriodKg = 0;
        let activeMachinesCount = 0;
        let totalMachinesCount = 0;

        const groupBreakdown: { [grp: string]: { dailyKg: number; periodKg: number; machinesCount: number } } = {};

        lineGroups.forEach(grp => {
            let grpDaily = 0;
            let grpCount = 0;
            (grp.machines || []).forEach(m => {
                totalMachinesCount += 1;
                if (m.active !== false) {
                    activeMachinesCount += 1;
                    grpCount += 1;
                    const d = calculateMachineDailyCapacity(m);
                    grpDaily += d;
                }
            });
            const grpPeriod = grpDaily * planDays;
            totalDailyKg += grpDaily;
            totalPeriodKg += grpPeriod;
            groupBreakdown[grp.groupName] = {
                dailyKg: grpDaily,
                periodKg: grpPeriod,
                machinesCount: grpCount
            };
        });

        return {
            totalDailyKg,
            totalPeriodKg,
            activeMachinesCount,
            totalMachinesCount,
            groupBreakdown
        };
    }, [lineGroups, planDays]);

    // Handle updating a single machine field
    const handleUpdateMachine = (grpIdx: number, machineId: string, field: keyof ProductionMachine, value: any) => {
        setLineGroups(prev => {
            const next = [...prev];
            const grp = { ...next[grpIdx] };
            grp.machines = grp.machines.map(m => {
                if (m.id === machineId) {
                    return { ...m, [field]: value };
                }
                return m;
            });
            next[grpIdx] = grp;
            return next;
        });
    };

    // Add new machine to current group
    const handleAddMachine = (grpIdx: number) => {
        const grp = lineGroups[grpIdx];
        if (!grp) return;
        const newNum = (grp.machines?.length || 0) + 1;
        const newMachine: ProductionMachine = {
            id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            code: `${grp.groupName.substring(0, 3).toUpperCase()}-${String(newNum).padStart(2, '0')}`,
            name: `دستگاه جدید شماره ${newNum}`,
            yarnCount: 150,
            positionsCount: 240,
            speedMpm: 750,
            efficiencyPct: 100,
            active: true
        };
        setLineGroups(prev => {
            const next = [...prev];
            next[grpIdx] = {
                ...next[grpIdx],
                machines: [...(next[grpIdx].machines || []), newMachine]
            };
            return next;
        });
        toast.success(`دستگاه جدید به خط ${grp.groupName} افزوده شد.`);
    };

    // Delete a machine
    const handleDeleteMachine = (grpIdx: number, machineId: string) => {
        setLineGroups(prev => {
            const next = [...prev];
            next[grpIdx] = {
                ...next[grpIdx],
                machines: next[grpIdx].machines.filter(m => m.id !== machineId)
            };
            return next;
        });
        toast('دستگاه حذف شد.');
    };

    // Add new line group
    const handleAddNewGroup = () => {
        const cleanName = newGroupNameInput.trim();
        if (!cleanName) {
            toast.error('لطفاً نام گروه کالایی یا خط تولید را وارد نمایید.');
            return;
        }
        if (lineGroups.some(g => g.groupName.toLowerCase() === cleanName.toLowerCase())) {
            toast.error('این گروه کالایی قبلاً در لیست وجود دارد.');
            return;
        }

        const newGroup: ProductionLineGroup = {
            groupName: cleanName,
            machines: [
                {
                    id: `m_${Date.now()}_1`,
                    code: `${cleanName.substring(0, 3).toUpperCase()}-01`,
                    name: `دستگاه شماره ۱ (${cleanName})`,
                    yarnCount: 150,
                    positionsCount: 216,
                    speedMpm: 700,
                    efficiencyPct: 100,
                    active: true
                }
            ]
        };

        setLineGroups(prev => [...prev, newGroup]);
        setSelectedGroupIndex(lineGroups.length);
        setNewGroupNameInput('');
        setShowAddGroupModal(false);
        toast.success(`گروه کالایی «${cleanName}» به پلن تولید اضافه شد.`);
    };

    // Delete an entire group
    const handleDeleteGroup = (grpIdx: number) => {
        const grp = lineGroups[grpIdx];
        if (!grp) return;
        if (!window.confirm(`آیا از حذف کامل خط و گروه کالایی «${grp.groupName}» اطمینان دارید؟`)) return;

        setLineGroups(prev => prev.filter((_, idx) => idx !== grpIdx));
        setSelectedGroupIndex(0);
        toast.success(`گروه «${grp.groupName}» حذف گردید.`);
    };

    // Save Plan to server and apply ideal targets
    const handleSavePlan = async (isDefaultOnly = false) => {
        setIsSaving(true);
        try {
            const planPayload: ProductionPlanConfig = {
                scopeType: planScope,
                dateFrom: dateFrom || '',
                dateTo: dateTo || dateFrom || '',
                daysCount: planDays,
                title: isDefaultOnly
                    ? 'تنظیمات پیش‌فرض خطوط و ماشین‌آلات تولید'
                    : `پلن تولید دوره ${dateFrom || ''} تا ${dateTo || dateFrom || ''} (${planDays} روزه)`,
                lineGroups
            };

            const res = await fetch(getEffectiveApiUrl('/api/sayan/production-plan/save'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: planPayload,
                    dateFrom: isDefaultOnly ? null : dateFrom,
                    dateTo: isDefaultOnly ? null : (dateTo || dateFrom),
                    isDefault: isDefaultOnly,
                    applyToIdealTargets: true // Sync directly into productionIdealTargets
                })
            });

            const data = await res.json();
            if (data.success) {
                toast.success('پلن تولید و ظرفیت‌های ایده‌آل با موفقیت ذخیره و اعمال گردید ✓', { duration: 5000 });
                if (onPlanUpdated) {
                    onPlanUpdated(data.plan, data.idealTargets);
                }
            } else {
                toast.error(data.error || 'خطا در ذخیره پلن تولید');
            }
        } catch (e: any) {
            console.error('Save production plan error:', e);
            toast.error('خطا در برقراری ارتباط با سرور: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={`space-y-4 ${className}`} dir="rtl">
            {/* Top Concept & Formula Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-4 sm:p-5 border border-indigo-500/30 shadow-md">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-500/20 border border-indigo-400/40 rounded-xl text-indigo-300">
                                <Cpu size={22} className="animate-pulse" />
                            </div>
                            <div>
                                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                                    پلن و ظرفیت‌سنجی مهندسی ماشین‌آلات تولید (Production Plan)
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                                        فرمول ۹٬۰۰۰٬۰۰۰
                                    </span>
                                </h3>
                                <p className="text-xs text-indigo-200/90 leading-relaxed font-medium">
                                    تعریف مستقل دستگاه‌های هر گروه کالایی (DTY، کش، POY، اسپاندکس و...) و محاسبه دقیق ظرفیت ایده‌آل خطوط
                                </p>
                            </div>
                        </div>

                        {/* Visual Formula Display */}
                        <div className="mt-2.5 inline-flex flex-wrap items-center gap-1.5 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl text-[11px] font-mono text-amber-300">
                            <span className="text-slate-300 font-sans font-bold">فرمول هر دستگاه (kg/روز):</span>
                            <span>(نمره نخ × ۶۰ × ۲۴ × پوزیشن × سرعت) ÷ ۹٬۰۰۰٬۰۰۰</span>
                            <span className="text-emerald-400 text-[10px] mr-1">× ضریب بازدهی</span>
                        </div>
                    </div>

                    {/* Scope Selector & Quick Days Configuration */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 bg-white/5 p-2.5 rounded-xl border border-white/10">
                        <div className="flex items-center gap-1.5">
                            <Calendar size={15} className="text-indigo-300" />
                            <span className="text-xs font-bold text-slate-200">مبنای دوره محاسباتی:</span>
                        </div>

                        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
                            <button
                                type="button"
                                onClick={() => { setPlanScope('daily'); setPlanDays(1); }}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${planScope === 'daily' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'}`}
                            >
                                روزانه (۱ روز)
                            </button>
                            <button
                                type="button"
                                onClick={() => { setPlanScope('monthly'); setPlanDays(30); }}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${planScope === 'monthly' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'}`}
                            >
                                ماهانه (۳۰ روز)
                            </button>
                            <button
                                type="button"
                                onClick={() => { setPlanScope('custom'); setPlanDays(calculatedDays || 7); }}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${planScope === 'custom' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'}`}
                            >
                                بازه فعال ({dateFrom || '---'} تا {dateTo || '---'})
                            </button>
                        </div>

                        <div className="flex items-center gap-1.5 mr-1">
                            <span className="text-xs text-slate-300 font-bold">تعداد روز:</span>
                            <input
                                type="number"
                                min="1"
                                max="365"
                                value={planDays}
                                onChange={(e) => setPlanDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                className="w-14 bg-black/50 border border-white/20 rounded px-1.5 py-1 text-center font-mono text-xs font-bold text-amber-300 outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                        </div>
                    </div>
                </div>

                {/* Overall Capacity Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3 border-t border-white/10">
                    <div className="bg-white/10 rounded-xl p-2.5 border border-white/10">
                        <span className="text-[11px] text-slate-300 block font-medium">تعداد کل دستگاه‌های فعال</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-base sm:text-lg font-black font-mono text-white">
                                {overallPlanStats.activeMachinesCount}
                            </span>
                            <span className="text-[10px] text-slate-400">از {overallPlanStats.totalMachinesCount} دستگاه</span>
                        </div>
                    </div>

                    <div className="bg-white/10 rounded-xl p-2.5 border border-white/10">
                        <span className="text-[11px] text-slate-300 block font-medium">تولید ایده‌آل روزانه کل کارخانه</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
                                {Math.round(overallPlanStats.totalDailyKg).toLocaleString('fa-IR')}
                            </span>
                            <span className="text-[10px] text-slate-300">kg / روز</span>
                        </div>
                    </div>

                    <div className="bg-white/10 rounded-xl p-2.5 border border-white/10">
                        <span className="text-[11px] text-slate-300 block font-medium">تولید ایده‌آل دوره ({planDays} روزه)</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-base sm:text-lg font-black font-mono text-amber-300">
                                {Math.round(overallPlanStats.totalPeriodKg).toLocaleString('fa-IR')}
                            </span>
                            <span className="text-[10px] text-slate-300">کیلوگرم</span>
                        </div>
                    </div>

                    <div className="bg-gradient-to-r from-emerald-950/80 to-teal-950/80 rounded-xl p-2.5 border border-emerald-500/30 flex items-center justify-between">
                        <div>
                            <span className="text-[11px] text-emerald-300 block font-medium">خط جاری: {currentGroup?.groupName}</span>
                            <span className="text-sm sm:text-base font-black font-mono text-white mt-0.5 block">
                                {Math.round(overallPlanStats.groupBreakdown[currentGroup?.groupName]?.periodKg || 0).toLocaleString('fa-IR')} kg
                            </span>
                        </div>
                        <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
                    </div>
                </div>
            </div>

            {/* Line Groups Tabs (DTY, POY, Rubber, Spandex, etc.) */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full custom-scrollbar">
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 shrink-0 ml-1">
                            انتخاب خط / گروه کالایی:
                        </span>
                        {lineGroups.map((grp, idx) => {
                            const isSelected = idx === selectedGroupIndex;
                            const stats = overallPlanStats.groupBreakdown[grp.groupName];
                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setSelectedGroupIndex(idx)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                                        isSelected
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                                            : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    <span>{grp.groupName}</span>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-slate-400'
                                    }`}>
                                        {grp.machines?.length || 0} دستگاه
                                    </span>
                                </button>
                            );
                        })}

                        {/* Add Group Button */}
                        <button
                            type="button"
                            onClick={() => setShowAddGroupModal(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 transition-all cursor-pointer whitespace-nowrap shrink-0"
                            title="تعریف خط یا گروه کالایی جدید"
                        >
                            <Plus size={14} />
                            <span>خط جدید</span>
                        </button>
                    </div>

                    {/* Action buttons: Save Plan & Sync with Ideal Targets */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleSavePlan(false)}
                            disabled={isSaving}
                            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                            title="ذخیره این پلن برای دوره زمانی مشخص شده و جایگذاری در ستون تولید ایده‌آل جدول آمار تولید"
                        >
                            <Save size={15} />
                            <span>{isSaving ? 'در حال ثبت...' : 'ذخیره و اعمال در جدول آمار تولید'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSavePlan(true)}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            title="ذخیره این پلن به عنوان مقادیر استاندارد و پیش‌فرض سیستم"
                        >
                            <span>ذخیره به عنوان پیش‌فرض</span>
                        </button>
                    </div>
                </div>

                {/* Selected Group Header & Machines Controls */}
                {currentGroup && (
                    <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-slate-200 dark:border-zinc-700 gap-2">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                                <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                                    لیست دستگاه‌های خط: <span className="text-blue-600 dark:text-blue-400 font-black">{currentGroup.groupName}</span>
                                </h4>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    ({currentGroup.machines?.length || 0} دستگاه تعریف شده)
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-zinc-900 px-3 py-1 rounded-lg border border-slate-200 dark:border-zinc-700">
                                    تولید ایده‌آل این خط ({planDays} روزه):{' '}
                                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-black text-sm">
                                        {Math.round(overallPlanStats.groupBreakdown[currentGroup.groupName]?.periodKg || 0).toLocaleString('fa-IR')}{' '}
                                        kg
                                    </strong>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleAddMachine(selectedGroupIndex)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                                >
                                    <Plus size={14} />
                                    <span>افزودن دستگاه</span>
                                </button>

                                {lineGroups.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteGroup(selectedGroupIndex)}
                                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-1.5 rounded-lg transition-all"
                                        title="حذف کل این خط تولید"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Machines Table with Live Editable Parameter Inputs */}
                        <div className="border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-center text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-slate-200 font-black border-b border-slate-200 dark:border-zinc-700">
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-12">ردیف</th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-24">کد / شماره</th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 text-right min-w-[160px]">نام / عنوان دستگاه</th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-28 bg-amber-50/70 dark:bg-amber-950/30 text-amber-950 dark:text-amber-300">
                                                نمره نخ (Denier)
                                            </th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-28 bg-blue-50/70 dark:bg-blue-950/30 text-blue-950 dark:text-blue-300">
                                                تعداد پوزیشن
                                            </th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-32 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-300">
                                                سرعت (متر/دقیقه)
                                            </th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-20">بازدهی (%)</th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-28 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-300 font-black">
                                                ایده‌آل روزانه (kg)
                                            </th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-32 bg-emerald-100/70 dark:bg-emerald-950/70 text-emerald-950 dark:text-emerald-200 font-black">
                                                ایده‌آل دوره ({planDays} روز)
                                            </th>
                                            <th className="p-2.5 border-r border-slate-200 dark:border-zinc-700 w-20">وضعیت</th>
                                            <th className="p-2.5 w-16">عملیات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-zinc-700 text-slate-800 dark:text-slate-200 font-medium">
                                        {(!currentGroup.machines || currentGroup.machines.length === 0) ? (
                                            <tr>
                                                <td colSpan={11} className="py-8 text-center text-slate-400">
                                                    هیچ دستگاهی برای این خط ثبت نشده است. روی دکمه «افزودن دستگاه» کلیک کنید.
                                                </td>
                                            </tr>
                                        ) : (
                                            currentGroup.machines.map((m, mIdx) => {
                                                const dailyKg = calculateMachineDailyCapacity(m);
                                                const periodKg = dailyKg * planDays;

                                                return (
                                                    <tr
                                                        key={m.id || mIdx}
                                                        className={`transition-colors ${m.active === false ? 'opacity-50 bg-slate-100 dark:bg-zinc-800/40' : (mIdx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-slate-50/50 dark:bg-zinc-900/60')}`}
                                                    >
                                                        {/* Index */}
                                                        <td className="p-2 border-r border-slate-200 dark:border-zinc-700 font-mono text-xs">
                                                            {mIdx + 1}
                                                        </td>

                                                        {/* Code / Number */}
                                                        <td className="p-1 border-r border-slate-200 dark:border-zinc-700">
                                                            <input
                                                                type="text"
                                                                value={m.code || ''}
                                                                onChange={(e) => handleUpdateMachine(selectedGroupIndex, m.id, 'code', e.target.value)}
                                                                className="w-full text-center bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 rounded px-1.5 py-1 font-mono font-bold text-xs text-blue-900 dark:text-blue-300 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                placeholder="M-01"
                                                            />
                                                        </td>

                                                        {/* Name / Description */}
                                                        <td className="p-1 border-r border-slate-200 dark:border-zinc-700 text-right">
                                                            <input
                                                                type="text"
                                                                value={m.name || ''}
                                                                onChange={(e) => handleUpdateMachine(selectedGroupIndex, m.id, 'name', e.target.value)}
                                                                className="w-full text-right bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 rounded px-2 py-1 font-bold text-xs text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                placeholder="نام یا مدل دستگاه..."
                                                            />
                                                        </td>

                                                        {/* Yarn Count (Denier) */}
                                                        <td className="p-1 border-r border-slate-200 dark:border-zinc-700 bg-amber-50/30 dark:bg-amber-950/20">
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                min="1"
                                                                value={m.yarnCount ?? ''}
                                                                onChange={(e) => handleUpdateMachine(selectedGroupIndex, m.id, 'yarnCount', parseFloat(e.target.value) || 0)}
                                                                className="w-full text-center bg-white dark:bg-zinc-800 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-1 font-mono font-black text-xs text-amber-950 dark:text-amber-300 focus:ring-1 focus:ring-amber-500 outline-none"
                                                                placeholder="150"
                                                                title="نمره نخ بر حسب دنییر"
                                                            />
                                                        </td>

                                                        {/* Positions Count */}
                                                        <td className="p-1 border-r border-slate-200 dark:border-zinc-700 bg-blue-50/30 dark:bg-blue-950/20">
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                min="1"
                                                                value={m.positionsCount ?? ''}
                                                                onChange={(e) => handleUpdateMachine(selectedGroupIndex, m.id, 'positionsCount', parseInt(e.target.value, 10) || 0)}
                                                                className="w-full text-center bg-white dark:bg-zinc-800 border border-blue-300 dark:border-blue-700 rounded px-1.5 py-1 font-mono font-black text-xs text-blue-950 dark:text-blue-300 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                placeholder="240"
                                                                title="تعداد پوزیشن فعال دستگاه"
                                                            />
                                                        </td>

                                                        {/* Speed (mpm) */}
                                                        <td className="p-1 border-r border-slate-200 dark:border-zinc-700 bg-indigo-50/30 dark:bg-indigo-950/20">
                                                            <input
                                                                type="number"
                                                                step="10"
                                                                min="1"
                                                                value={m.speedMpm ?? ''}
                                                                onChange={(e) => handleUpdateMachine(selectedGroupIndex, m.id, 'speedMpm', parseFloat(e.target.value) || 0)}
                                                                className="w-full text-center bg-white dark:bg-zinc-800 border border-indigo-300 dark:border-indigo-700 rounded px-1.5 py-1 font-mono font-black text-xs text-indigo-950 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                placeholder="800"
                                                                title="سرعت دستگاه بر حسب متر بر دقیقه"
                                                            />
                                                        </td>

                                                        {/* Efficiency (%) */}
                                                        <td className="p-1 border-r border-slate-200 dark:border-zinc-700">
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                min="10"
                                                                max="100"
                                                                value={m.efficiencyPct ?? 100}
                                                                onChange={(e) => handleUpdateMachine(selectedGroupIndex, m.id, 'efficiencyPct', parseFloat(e.target.value) || 100)}
                                                                className="w-full text-center bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 rounded px-1 py-1 font-mono text-xs font-bold text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                placeholder="100"
                                                                title="ضریب راندمان یا بازدهی کاری دستگاه (درصد)"
                                                            />
                                                        </td>

                                                        {/* Daily Calculated Ideal (kg) */}
                                                        <td
                                                            className="p-2 border-r border-slate-200 dark:border-zinc-700 font-mono font-black text-xs bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 cursor-help"
                                                            title={dailyKg > 0 ? `محاسبه روزانه:\n(${m.yarnCount || 0} × 60 × 24 × ${m.positionsCount || 0} × ${m.speedMpm || 0}) ÷ 9,000,000\n= ${dailyKg.toFixed(1)} کیلوگرم در روز` : 'اطلاعات دستگاه را وارد کنید'}
                                                        >
                                                            {dailyKg > 0 ? Math.round(dailyKg).toLocaleString('fa-IR') : '۰'}
                                                        </td>

                                                        {/* Period Calculated Ideal (kg) */}
                                                        <td
                                                            className="p-2 border-r border-slate-200 dark:border-zinc-700 font-mono font-black text-xs bg-emerald-100/50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-200 cursor-help"
                                                            title={periodKg > 0 ? `محاسبه دوره (${planDays} روزه):\n${dailyKg.toFixed(1)} kg/روز × ${planDays} روز\n= ${Math.round(periodKg).toLocaleString('fa-IR')} کیلوگرم` : '۰'}
                                                        >
                                                            {periodKg > 0 ? Math.round(periodKg).toLocaleString('fa-IR') : '۰'}
                                                        </td>

                                                        {/* Active / Inactive Checkbox */}
                                                        <td className="p-2 border-r border-slate-200 dark:border-zinc-700">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateMachine(selectedGroupIndex, m.id, 'active', m.active === false ? true : false)}
                                                                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                                                    m.active !== false
                                                                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300'
                                                                        : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-slate-400 border border-slate-300'
                                                                }`}
                                                            >
                                                                {m.active !== false ? 'فعال' : 'خاموش'}
                                                            </button>
                                                        </td>

                                                        {/* Action Delete */}
                                                        <td className="p-1.5 text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteMachine(selectedGroupIndex, m.id)}
                                                                className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-all cursor-pointer"
                                                                title="حذف این دستگاه"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    {/* Group Footer Summary */}
                                    {currentGroup.machines && currentGroup.machines.length > 0 && (
                                        <tfoot>
                                            <tr className="bg-slate-100 dark:bg-zinc-800/90 font-black border-t-2 border-slate-300 dark:border-zinc-700">
                                                <td colSpan={7} className="p-2.5 text-right pr-4 text-xs font-black text-slate-800 dark:text-slate-200">
                                                    جمع کل ظرفیت ایده‌آل خط {currentGroup.groupName}:
                                                </td>
                                                <td className="p-2.5 font-mono text-xs text-emerald-900 dark:text-emerald-300 font-black bg-emerald-100/60 dark:bg-emerald-950/60">
                                                    {Math.round(overallPlanStats.groupBreakdown[currentGroup.groupName]?.dailyKg || 0).toLocaleString('fa-IR')} kg
                                                </td>
                                                <td className="p-2.5 font-mono text-sm text-emerald-950 dark:text-emerald-200 font-black bg-emerald-200/60 dark:bg-emerald-900/60">
                                                    {Math.round(overallPlanStats.groupBreakdown[currentGroup.groupName]?.periodKg || 0).toLocaleString('fa-IR')} kg
                                                </td>
                                                <td colSpan={2} className="p-2 text-[10px] text-slate-500 text-center font-medium">
                                                    مبنای ستون ایده‌آل
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal for Adding New Product Line / Group */}
            {showAddGroupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-300 dark:border-zinc-700 shadow-2xl p-5 w-full max-w-md space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                            <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <Plus size={18} className="text-blue-600" />
                                تعریف خط یا گروه کالایی جدید
                            </h4>
                            <button
                                type="button"
                                onClick={() => setShowAddGroupModal(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                                نام خط تولید یا گروه کالایی:
                            </label>
                            <input
                                type="text"
                                value={newGroupNameInput}
                                onChange={(e) => setNewGroupNameInput(e.target.value)}
                                placeholder="مثلاً: FDY، پلی استر اسپان، نایلون و..."
                                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {availableGroups && availableGroups.length > 0 && (
                                <div className="mt-2">
                                    <span className="text-[11px] text-slate-500 block mb-1">انتخاب سریع از گروه‌های موجود سایان:</span>
                                    <div className="flex flex-wrap gap-1">
                                        {availableGroups.slice(0, 10).map((gName, gIdx) => (
                                            <button
                                                key={gIdx}
                                                type="button"
                                                onClick={() => setNewGroupNameInput(gName)}
                                                className="text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-blue-50 hover:text-blue-600 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-zinc-700 transition-colors"
                                            >
                                                {gName}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setShowAddGroupModal(false)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800"
                            >
                                انصراف
                            </button>
                            <button
                                type="button"
                                onClick={handleAddNewGroup}
                                className="px-4 py-1.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20"
                            >
                                ایجاد خط
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductionPlanManager;
