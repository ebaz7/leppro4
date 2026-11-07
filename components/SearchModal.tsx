import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, X, Loader2, ArrowRight, ExternalLink, User, CreditCard, 
    Truck, ClipboardList, Package, Container, Coins, FileSpreadsheet,
    Building2, FileText, CheckCircle2, ChevronRight, Hash, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiCall } from '../services/apiService';

export interface SearchResult {
    type: 'trade' | 'payment_order' | 'exit_permit' | 'cheque_receipt' | 'warehouse_item' | 'warehouse_tx' | 'purchase_request' | 'meeting' | 'user' | 'customer_balance' | 'letter';
    id: string;
    title: string;
    subtitle: string;
    data: any;
    url: string;
}

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (tab: string, data?: any) => void;
    currentUser?: any;
    settings?: any;
}

export const SearchModal: React.FC<SearchModalProps> = ({ 
    isOpen, 
    onClose, 
    onNavigate,
    currentUser,
    settings 
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 80);
        } else {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
        }
    }, [isOpen]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim().length >= 2) {
                handleSearch();
            } else {
                setResults([]);
                setSelectedIndex(0);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    // Keyboard navigation (Arrow Up, Down, Enter, Escape)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (results.length > 0 ? (prev + 1) % results.length : 0));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (results.length > 0 && results[selectedIndex]) {
                    handleSelectResult(results[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex]);

    const handleSearch = async () => {
        setLoading(true);
        try {
            const userParam = currentUser?.id ? `&userId=${encodeURIComponent(currentUser.id)}` : '';
            const roleParam = currentUser?.role ? `&role=${encodeURIComponent(currentUser.role)}` : '';
            const data = await apiCall<{results: SearchResult[]}>(`/api/search-everything?query=${encodeURIComponent(query.trim())}${userParam}${roleParam}`);
            if (data && Array.isArray(data.results)) {
                setResults(data.results);
                setSelectedIndex(0);
            } else {
                setResults([]);
            }
        } catch (e) {
            console.error("Search failed", e);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectResult = (result: SearchResult) => {
        onNavigate(result.url, result.data);
        onClose();

        // Deep-link triggers - dispatch immediately and also with small timeouts in case module is mounting
        const dispatchEvents = () => {
            if (result.type === 'trade') {
                window.dispatchEvent(new CustomEvent('OPEN_TRADE_RECORD', { detail: result.data }));
            } else if (result.type === 'payment_order') {
                window.dispatchEvent(new CustomEvent('OPEN_PAYMENT_ORDER', { detail: result.data }));
            } else if (result.type === 'exit_permit') {
                window.dispatchEvent(new CustomEvent('OPEN_EXIT_PERMIT', { detail: result.data }));
            } else if (result.type === 'cheque_receipt') {
                window.dispatchEvent(new CustomEvent('OPEN_CHEQUE_RECEIPT', { detail: result.data }));
            } else if (result.type === 'warehouse_item') {
                window.dispatchEvent(new CustomEvent('OPEN_WAREHOUSE_ITEM', { detail: result.data }));
            } else if (result.type === 'warehouse_tx') {
                window.dispatchEvent(new CustomEvent('OPEN_WAREHOUSE_TX', { detail: result.data }));
            }
        };

        dispatchEvents();
        setTimeout(dispatchEvents, 80);
        setTimeout(dispatchEvents, 250);
    };

    const getTypeDetails = (type: string) => {
        switch (type) {
            case 'trade':
                return {
                    label: 'بازرگانی',
                    color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
                    icon: <Container className="text-blue-600" size={18} />
                };
            case 'payment_order':
                return {
                    label: 'دستور پرداخت',
                    color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
                    icon: <CreditCard className="text-emerald-600" size={18} />
                };
            case 'exit_permit':
                return {
                    label: 'مجوز خروج / فاکتور',
                    color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
                    icon: <Truck className="text-amber-600" size={18} />
                };
            case 'cheque_receipt':
                return {
                    label: 'رسید چک صیادی',
                    color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
                    icon: <Coins className="text-purple-600" size={18} />
                };
            case 'warehouse_item':
            case 'warehouse_tx':
                return {
                    label: 'انبار و کالا',
                    color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
                    icon: <Package className="text-indigo-600" size={18} />
                };
            case 'meeting':
                return {
                    label: 'جلسات',
                    color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
                    icon: <ClipboardList className="text-rose-600" size={18} />
                };
            case 'user':
                return {
                    label: 'کاربران',
                    color: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
                    icon: <User className="text-cyan-600" size={18} />
                };
            case 'customer_balance':
                return {
                    label: 'طرف حساب',
                    color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
                    icon: <Building2 className="text-teal-600" size={18} />
                };
            default:
                return {
                    label: 'سایر',
                    color: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
                    icon: <Search className="text-gray-500" size={18} />
                };
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 px-4 sm:pt-24" dir="rtl">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md"
            />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.96, y: -16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -16 }}
                transition={{ duration: 0.15 }}
                className="relative w-full max-w-3xl glass-panel rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-white/10 flex flex-col max-h-[80vh] bg-white/95 dark:bg-zinc-900/95"
            >
                {/* Search Input Bar */}
                <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-3 bg-white/80 dark:bg-zinc-900/80">
                    <Search className="text-blue-600 dark:text-blue-400 shrink-0" size={22} />
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="جستجوی جامع در کل سیستم (کوتاژ، پرونده، ثبت سفارش، چک، فاکتور، کالا و...)"
                        className="flex-1 bg-transparent border-none outline-none text-gray-800 dark:text-gray-100 font-bold placeholder:text-gray-400 text-base"
                    />
                    {loading ? (
                        <Loader2 className="animate-spin text-blue-500 shrink-0" size={20} />
                    ) : query ? (
                        <button 
                            type="button"
                            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} 
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            title="پاک کردن"
                        >
                            <X size={18} className="text-gray-400" />
                        </button>
                    ) : (
                         <div className="text-[11px] font-mono font-bold text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">ESC</div>
                    )}
                </div>

                {/* Results List */}
                <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5 min-h-[220px]">
                    {query.trim().length < 2 ? (
                        <div className="py-14 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
                            <div className="p-4 rounded-full bg-gray-50 dark:bg-zinc-800/50 text-gray-300 dark:text-zinc-600">
                                <Search size={40} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-600 dark:text-gray-300">جستجوی هوشمند و یکپارچه در تمام بخش‌ها</p>
                                <p className="text-xs text-gray-400 mt-1">شماره کوتاژ گمرکی، پرونده، چک صیادی، فاکتور، نام کالا یا تامین‌کننده را تایپ کنید</p>
                            </div>
                        </div>
                    ) : results.length === 0 && !loading ? (
                        <div className="py-14 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
                            <div className="p-4 rounded-full bg-gray-50 dark:bg-zinc-800/50 text-gray-300 dark:text-zinc-600">
                                <X size={40} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-600 dark:text-gray-300">نتیجه‌ای با عبارت «{query}» یافت نشد</p>
                                <p className="text-xs text-gray-400 mt-1">املا یا کلمات کلیدی دیگر را امتحان نمایید</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {results.map((result, idx) => {
                                const details = getTypeDetails(result.type);
                                const isSelected = idx === selectedIndex;
                                return (
                                    <button 
                                        key={`${result.type}-${result.id}-${idx}`}
                                        type="button"
                                        onClick={() => handleSelectResult(result)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`w-full text-right p-3.5 rounded-2xl transition-all flex items-center gap-3 group border ${
                                            isSelected 
                                                ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 shadow-sm' 
                                                : 'bg-white dark:bg-zinc-800/60 border-gray-100 dark:border-zinc-800/80 hover:bg-gray-50/80 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        <div className={`p-2.5 rounded-xl border shrink-0 transition-transform ${details.color} ${isSelected ? 'scale-105 shadow-sm' : ''}`}>
                                            {details.icon}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${details.color}`}>
                                                    {details.label}
                                                </span>
                                                <span className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
                                                    {result.title}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                                                {result.subtitle}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-bold shrink-0 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                                            <span>مشاهده</span>
                                            <ArrowRight size={16} className="rotate-180" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Controls & Stats */}
                <div className="p-3 bg-gray-50/90 dark:bg-zinc-950/60 border-t border-gray-100 dark:border-zinc-800 flex justify-between items-center text-xs">
                    <div className="text-gray-400 font-medium flex items-center gap-4">
                         <span className="flex items-center gap-1"><kbd className="bg-gray-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-gray-600 dark:text-gray-300">↵ Enter</kbd> مشاهده مورد</span>
                         <span className="flex items-center gap-1"><kbd className="bg-gray-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-gray-600 dark:text-gray-300">↑ ↓</kbd> جابجایی</span>
                         <span className="flex items-center gap-1"><kbd className="bg-gray-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-gray-600 dark:text-gray-300">ESC</kbd> بستن</span>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 font-bold">
                        {results.length > 0 ? `${results.length} نتیجه منطبق یافت شد` : ''}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
