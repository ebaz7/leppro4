import React, { useState, useMemo } from 'react';
import * as jalaali from 'jalaali-js';
import { 
  Calendar as CalendarIcon, ChevronRight, ChevronLeft, Search, Filter, 
  Eye, Coins, CheckCircle2, Clock, AlertCircle, ArrowUpRight, FileText, 
  X, Landmark, Layers, TrendingUp, Building2
} from 'lucide-react';
import { ChequeItem, ChequeReceipt } from '../types';

export interface ChequeCalendarViewProps {
  allCheques: { cheque: ChequeItem; receipt: ChequeReceipt }[];
  onSelectReceipt: (receipt: ChequeReceipt) => void;
  onOpenRealSayanDoc?: (archiveCode: string | number, docNo?: string | number) => void;
}

const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const WEEKDAY_NAMES = [
  'شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'
];

export const parseChequeDueDate = (dueDateStr?: string) => {
  if (!dueDateStr) return null;
  const clean = String(dueDateStr)
    .trim()
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  
  const parts = clean.split(/[\/\.\-]/);
  if (parts.length < 3) return null;
  
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  let d = parseInt(parts[2], 10);

  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  if (y > 1900 && y < 2100) {
    const j = jalaali.toJalaali(y, m, d);
    y = j.jy;
    m = j.jm;
    d = j.jd;
  }

  return { 
    year: y, 
    month: m, 
    day: d, 
    formatted: `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}` 
  };
};

export const ChequeCalendarView: React.FC<ChequeCalendarViewProps> = ({
  allCheques,
  onSelectReceipt,
  onOpenRealSayanDoc
}) => {
  const todayJalali = useMemo(() => {
    const now = new Date();
    const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return { year: j.jy, month: j.jm, day: j.jd };
  }, []);

  const [currentYear, setCurrentYear] = useState<number>(todayJalali.year);
  const [currentMonth, setCurrentMonth] = useState<number>(todayJalali.month);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Selected Day Modal State
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Available Years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([todayJalali.year, 1402, 1403, 1404, 1405, 1406]);
    allCheques.forEach(item => {
      const parsed = parseChequeDueDate(item.cheque.dueDate);
      if (parsed && parsed.year >= 1395 && parsed.year <= 1420) {
        yearsSet.add(parsed.year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => a - b);
  }, [allCheques, todayJalali]);

  // Navigate Months
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const handleGoToday = () => {
    setCurrentYear(todayJalali.year);
    setCurrentMonth(todayJalali.month);
  };

  // Month Calendar Grid Data Calculation
  const monthGrid = useMemo(() => {
    const length = jalaali.jalaaliMonthLength(currentYear, currentMonth);
    const gFirst = jalaali.toGregorian(currentYear, currentMonth, 1);
    const gDate = new Date(gFirst.gy, gFirst.gm - 1, gFirst.gd);
    const startWeekdayOffset = (gDate.getDay() + 1) % 7; // Saturday = 0

    return {
      monthLength: length,
      startWeekdayOffset
    };
  }, [currentYear, currentMonth]);

  // Filtered Cheques for Current Month
  const monthCheques = useMemo(() => {
    return allCheques.filter(item => {
      const parsed = parseChequeDueDate(item.cheque.dueDate);
      if (!parsed) return false;
      if (parsed.year !== currentYear || parsed.month !== currentMonth) return false;

      const st = item.cheque.chequeStatus || 'box';
      if (statusFilter !== 'all') {
        if (statusFilter === 'box' && st !== 'box') return false;
        if (statusFilter === 'cashed' && st !== 'cashed' && st !== 'deposited') return false;
        if (statusFilter === 'returned' && st !== 'returned') return false;
        if (statusFilter === 'spent' && st !== 'spent') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const customer = (item.receipt.customerName || '').toLowerCase();
        const chequeNo = (item.cheque.chequeNumber || '').toLowerCase();
        const sayad = (item.cheque.sayyadId || '').toLowerCase();
        const bank = (item.cheque.bankName || '').toLowerCase();
        return customer.includes(q) || chequeNo.includes(q) || sayad.includes(q) || bank.includes(q);
      }

      return true;
    });
  }, [allCheques, currentYear, currentMonth, statusFilter, searchQuery]);

  // Group Cheques by Day of Month
  const chequesByDay = useMemo(() => {
    const map = new Map<number, { cheque: ChequeItem; receipt: ChequeReceipt }[]>();
    monthCheques.forEach(item => {
      const parsed = parseChequeDueDate(item.cheque.dueDate);
      if (parsed) {
        const day = parsed.day;
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(item);
      }
    });
    return map;
  }, [monthCheques]);

  // Month Statistics Summary
  const monthStats = useMemo(() => {
    let totalCount = 0;
    let totalAmount = 0;
    let boxCount = 0;
    let boxAmount = 0;
    let cashedCount = 0;
    let cashedAmount = 0;

    monthCheques.forEach(item => {
      totalCount++;
      const amt = item.cheque.amount || 0;
      totalAmount += amt;

      const st = item.cheque.chequeStatus || 'box';
      if (st === 'box') {
        boxCount++;
        boxAmount += amt;
      } else if (st === 'cashed' || st === 'deposited') {
        cashedCount++;
        cashedAmount += amt;
      }
    });

    return { totalCount, totalAmount, boxCount, boxAmount, cashedCount, cashedAmount };
  }, [monthCheques]);

  // Cheques for Selected Day Modal
  const selectedDayCheques = useMemo(() => {
    if (!selectedDay) return [];
    return chequesByDay.get(selectedDay) || [];
  }, [selectedDay, chequesByDay]);

  const getStatusBadge = (status?: string) => {
    const st = status || 'box';
    switch (st) {
      case 'box':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">موجود در صندوق</span>;
      case 'deposited':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">واگذار به بانک</span>;
      case 'cashed':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">وصول شده</span>;
      case 'returned':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">برگشت خورده</span>;
      case 'spent':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">خرج شده</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-50 text-gray-700 border border-gray-200">{st}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER CONTROLS & NAVIGATION */}
      <div className="glass-panel p-4 md:p-5 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Month/Year Title & Controls */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-200 transition-all active:scale-95"
              title="ماه قبل"
            >
              <ChevronRight size={18} />
            </button>
            <div className="px-3 font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <CalendarIcon size={18} className="text-emerald-500" />
              <span>{JALALI_MONTH_NAMES[currentMonth - 1]}</span>
              <span>{currentYear}</span>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-200 transition-all active:scale-95"
              title="ماه بعد"
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          <button
            onClick={handleGoToday}
            className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            امروز
          </button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Select Year */}
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>سال {y}</option>
            ))}
          </select>

          {/* Select Month */}
          <select
            value={currentMonth}
            onChange={(e) => setCurrentMonth(Number(e.target.value))}
            className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {JALALI_MONTH_NAMES.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>{name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="box">موجود در صندوق 📦</option>
            <option value="cashed">وصول شده / واگذار ✅</option>
            <option value="returned">برگشتی ❌</option>
            <option value="spent">خرج شده 🔄</option>
          </select>

          {/* Search Box */}
          <div className="relative flex-1 md:w-48">
            <input
              type="text"
              placeholder="جستجو در چک‌ها..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white outline-none"
            />
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* MONTHLY SUMMARY STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-gray-200/50 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-bold">کل چک‌های سررسید ماه</span>
            <div className="text-lg md:text-xl font-black text-blue-600 dark:text-blue-400 font-mono mt-1">
              {Number(monthStats.totalAmount).toLocaleString('fa-IR')} <span className="text-xs font-normal text-gray-400">ریال</span>
            </div>
            <div className="text-[11px] text-gray-500 font-bold mt-0.5">
              تعداد: {monthStats.totalCount.toLocaleString('fa-IR')} فقره
            </div>
          </div>
          <div className="bg-blue-500/10 p-3 rounded-xl text-blue-600 dark:text-blue-400">
            <CalendarIcon size={24} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-amber-800 dark:text-amber-300 font-bold">چک‌های آماده وصول (صندوق)</span>
            <div className="text-lg md:text-xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
              {Number(monthStats.boxAmount).toLocaleString('fa-IR')} <span className="text-xs font-normal text-gray-400">ریال</span>
            </div>
            <div className="text-[11px] text-amber-700 dark:text-amber-400 font-bold mt-0.5">
              تعداد: {monthStats.boxCount.toLocaleString('fa-IR')} فقره
            </div>
          </div>
          <div className="bg-amber-500/10 p-3 rounded-xl text-amber-600">
            <Coins size={24} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-bold">وصول شده / واگذار بانک</span>
            <div className="text-lg md:text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              {Number(monthStats.cashedAmount).toLocaleString('fa-IR')} <span className="text-xs font-normal text-gray-400">ریال</span>
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold mt-0.5">
              تعداد: {monthStats.cashedCount.toLocaleString('fa-IR')} فقره
            </div>
          </div>
          <div className="bg-emerald-500/10 p-3 rounded-xl text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
        </div>
      </div>

      {/* CALENDAR GRID */}
      <div className="glass-panel rounded-2xl border border-gray-200/60 dark:border-white/10 overflow-hidden shadow-sm">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 bg-gray-100/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-center text-xs font-black py-3 text-gray-700 dark:text-gray-300">
          {WEEKDAY_NAMES.map((dayName, idx) => (
            <div key={dayName} className={idx === 6 ? 'text-red-500' : ''}>
              {dayName}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-100 dark:divide-gray-800/60 bg-white/50 dark:bg-gray-900/50">
          {/* Empty Lead Cells */}
          {Array.from({ length: monthGrid.startWeekdayOffset }).map((_, idx) => (
            <div key={`empty-lead-${idx}`} className="min-h-[90px] md:min-h-[110px] bg-gray-50/40 dark:bg-gray-900/20" />
          ))}

          {/* Month Days */}
          {Array.from({ length: monthGrid.monthLength }).map((_, idx) => {
            const dayNum = idx + 1;
            const isToday = 
              todayJalali.year === currentYear && 
              todayJalali.month === currentMonth && 
              todayJalali.day === dayNum;

            const dayCheques = chequesByDay.get(dayNum) || [];
            const dayTotalAmt = dayCheques.reduce((sum, item) => sum + (item.cheque.amount || 0), 0);
            const boxCount = dayCheques.filter(item => (item.cheque.chequeStatus || 'box') === 'box').length;
            const cashedCount = dayCheques.filter(item => item.cheque.chequeStatus === 'cashed' || item.cheque.chequeStatus === 'deposited').length;

            const isFriday = (monthGrid.startWeekdayOffset + idx) % 7 === 6;

            return (
              <div
                key={`day-${dayNum}`}
                onClick={() => {
                  if (dayCheques.length > 0) {
                    setSelectedDay(dayNum);
                  }
                }}
                className={`min-h-[95px] md:min-h-[115px] p-2 flex flex-col justify-between transition-all relative ${
                  dayCheques.length > 0 ? 'cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20' : ''
                } ${isToday ? 'bg-amber-50/60 dark:bg-amber-950/20 ring-2 ring-amber-400/80 ring-inset' : ''} ${
                  isFriday ? 'bg-red-50/20 dark:bg-red-950/10' : ''
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                      isToday
                        ? 'bg-amber-500 text-white shadow-sm'
                        : isFriday
                        ? 'text-red-500 font-bold'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {dayNum}
                  </span>

                  {dayCheques.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-sm">
                      {dayCheques.length} فقره
                    </span>
                  )}
                </div>

                {/* Day Content / Cheque Summary */}
                {dayCheques.length > 0 ? (
                  <div className="mt-1.5 space-y-1">
                    <div className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 font-mono truncate" title={`${Number(dayTotalAmt).toLocaleString('fa-IR')} ریال`}>
                      {Number(dayTotalAmt).toLocaleString('fa-IR')} <span className="text-[9px] font-normal text-gray-400">ریال</span>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      {boxCount > 0 && (
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                          📦 {boxCount}
                        </span>
                      )}
                      {cashedCount > 0 && (
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                          ✅ {cashedCount}
                        </span>
                      )}
                    </div>

                    <div className="text-[9px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {dayCheques[0].receipt.customerName || '---'}
                      {dayCheques.length > 1 && ` (+${dayCheques.length - 1})`}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center opacity-20">
                    <span className="text-[10px] text-gray-400">-</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SELECTED DAY CHEQUES MODAL */}
      {selectedDay !== null && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md">
                  <CalendarIcon size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white">
                    چک‌های سررسید {selectedDay} {JALALI_MONTH_NAMES[currentMonth - 1]} {currentYear}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-semibold">
                    تعداد: {selectedDayCheques.length} فقره | جمع کل: {Number(selectedDayCheques.reduce((sum, i) => sum + (i.cheque.amount || 0), 0)).toLocaleString('fa-IR')} ریال
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDay(null)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl text-gray-500 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body - Cheque List */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {selectedDayCheques.map((item, idx) => (
                <div
                  key={`day-chq-${idx}`}
                  className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 hover:border-emerald-500 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-gray-900 dark:text-white text-sm">
                        شماره چک: #{item.cheque.chequeNumber || '---'}
                      </span>
                      {getStatusBadge(item.cheque.chequeStatus)}
                    </div>

                    <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2 flex-wrap">
                      <span>مشتری / تحویل‌دهنده: <b>{item.receipt.customerName || '---'}</b></span>
                      <span>•</span>
                      <span>بانک: <b>{item.cheque.bankName || '---'}</b></span>
                    </div>

                    {item.cheque.sayyadId && (
                      <div className="text-[11px] font-mono text-gray-500">
                        شناسه صیاد: {item.cheque.sayyadId}
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-end justify-between sm:justify-center w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-gray-200 dark:border-gray-700">
                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {Number(item.cheque.amount || 0).toLocaleString('fa-IR')} <span className="text-xs font-normal text-gray-400">ریال</span>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedDay(null);
                        onSelectReceipt(item.receipt);
                      }}
                      className="mt-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-sm active:scale-95"
                    >
                      <Eye size={14} />
                      مشاهده رسید
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end">
              <button
                onClick={() => setSelectedDay(null)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-all"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
