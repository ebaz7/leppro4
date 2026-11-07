import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, X } from 'lucide-react';
// @ts-ignore
import { Calendar } from "react-multi-date-picker";
// @ts-ignore
import persian from "react-date-object/calendars/persian";
// @ts-ignore
import persian_fa from "react-date-object/locales/persian_fa";
// @ts-ignore
import gregorian from "react-date-object/calendars/gregorian";
// @ts-ignore
import gregorian_en from "react-date-object/locales/gregorian_en";

interface TradeDatePickerProps {
    value: string;
    onChange: (date: string) => void;
    placeholder?: string;
    className?: string;
}

export const TradeDatePicker: React.FC<TradeDatePickerProps> = ({
    value,
    onChange,
    placeholder,
    className = ''
}) => {
    const [isGregorian, setIsGregorian] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number; positionAbove: boolean }>({
        top: 0,
        left: 0,
        positionAbove: false
    });

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Calculate popover position anchored to input
    const updatePosition = () => {
        if (!inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        const calendarHeight = 330;
        const calendarWidth = 270;

        const spaceBelow = window.innerHeight - rect.bottom;
        const positionAbove = spaceBelow < calendarHeight && rect.top > calendarHeight;

        let top = positionAbove ? rect.top - calendarHeight - 6 : rect.bottom + 6;
        let left = rect.right - calendarWidth;

        // Boundary checks
        if (left < 10) left = 10;
        if (left + calendarWidth > window.innerWidth - 10) {
            left = window.innerWidth - calendarWidth - 10;
        }

        setCoords({ top, left, positionAbove });
    };

    const handleToggle = () => {
        if (!isOpen) {
            updatePosition();
        }
        setIsOpen(prev => !prev);
    };

    // Close on click outside or escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        const handleScrollOrResize = () => {
            updatePosition();
        };

        document.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);

        return () => {
            document.removeEventListener('mousedown', handleMouseDown, true);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isOpen]);

    // Convert Persian / Arabic numerals to English ASCII digits
    const normalizeDigits = (str: string) => {
        return str
            .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
            .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
    };

    // Auto-heal corrupted year in existing records (e.g. 140411410 -> 1404)
    useEffect(() => {
        if (!value || typeof value !== 'string') return;
        const clean = normalizeDigits(value).trim();
        const parts = clean.split(/[\/\-]/);
        if (parts[0] && parts[0].length > 4) {
            const fixedYear = parts[0].slice(0, 4);
            const remaining = parts.slice(1).map(p => p.slice(0, 2)).join('/');
            const healed = remaining ? `${fixedYear}/${remaining}` : fixedYear;
            onChange(healed);
        }
    }, [value, onChange]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = normalizeDigits(e.target.value).replace(/[^0-9/]/g, '');
        
        // Strict Year / Month / Day partitioning - NEVER allow year > 4 digits
        if (raw.includes('/')) {
            const parts = raw.split('/');
            const year = (parts[0] || '').slice(0, 4);
            const month = parts[1] !== undefined ? parts[1].slice(0, 2) : undefined;
            const day = parts[2] !== undefined ? parts[2].slice(0, 2) : undefined;

            let formatted = year;
            if (month !== undefined) {
                formatted += '/' + month;
            }
            if (day !== undefined) {
                formatted += '/' + day;
            }
            onChange(formatted);
        } else {
            // Raw digits without slashes (e.g. typing or pasting 14040618)
            const digits = raw.replace(/\D/g, '').slice(0, 8);
            let formatted = digits.slice(0, 4);
            if (digits.length > 4) {
                formatted += '/' + digits.slice(4, 6);
            }
            if (digits.length > 6) {
                formatted += '/' + digits.slice(6, 8);
            }
            onChange(formatted);
        }
    };

    // Safe calendar value that NEVER passes astronomical or invalid years to react-multi-date-picker
    const safeCalendarValue = React.useMemo(() => {
        if (!value || typeof value !== 'string') return undefined;
        const clean = normalizeDigits(value).trim();
        const parts = clean.split(/[\/\-]/);
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (isNaN(y) || isNaN(m) || isNaN(d)) return undefined;

            if (isGregorian) {
                if (y >= 1900 && y <= 2150 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                    return `${parts[0].padStart(4, '0')}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
                }
            } else {
                if (y >= 1300 && y <= 1500 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                    return `${parts[0].padStart(4, '0')}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
                }
            }
        }
        return undefined;
    }, [value, isGregorian]);

    return (
        <div ref={containerRef} className="relative w-full flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1 cursor-pointer select-none">
                    <input 
                        type="checkbox" 
                        checked={isGregorian} 
                        onChange={(e) => setIsGregorian(e.target.checked)} 
                        className="rounded text-blue-500 w-3 h-3 cursor-pointer"
                    />
                    تقویم میلادی
                </label>
            </div>

            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    type="text"
                    maxLength={10}
                    value={value}
                    onChange={handleInputChange}
                    onClick={() => {
                        updatePosition();
                        setIsOpen(true);
                    }}
                    placeholder={placeholder || (isGregorian ? '2024/01/01' : '۱۴۰۳/۰۱/۰۱')}
                    className={`w-full border rounded-lg py-2 pr-2.5 pl-8 text-sm text-left dir-ltr font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-950 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-zinc-800 transition-colors shadow-2xs ${className}`}
                />
                
                <button
                    type="button"
                    onClick={handleToggle}
                    className="absolute left-1.5 p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    title="باز کردن تقویم"
                >
                    <CalendarIcon size={16} />
                </button>
            </div>

            {/* Portal-rendered Calendar Popover completely outside DOM flow */}
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popoverRef}
                    className="fixed z-[999999] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 p-2 animate-fade-in text-right select-none"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        <span>{isGregorian ? 'تقویم میلادی' : 'تقویم خورشیدی'}</span>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="بستن"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <Calendar
                        calendar={isGregorian ? gregorian : persian}
                        locale={isGregorian ? gregorian_en : persian_fa}
                        value={safeCalendarValue}
                        onChange={(date: any) => {
                            const formatted = date?.format?.('YYYY/MM/DD') || '';
                            onChange(formatted);
                            setIsOpen(false);
                        }}
                    />

                    <div className="flex items-center justify-between pt-2 px-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                setIsOpen(false);
                            }}
                            className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-bold"
                        >
                            پاک کردن تاریخ
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
                        >
                            بستن
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
