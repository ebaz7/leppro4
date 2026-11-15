import React, { useState } from 'react';
import { PartMasterData } from '../types';
import { resolveImageUrl } from '../services/apiService';
import { ChevronRight, ChevronLeft, Copy, Check } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';
import toast from 'react-hot-toast';

interface PrintPartDataSheetProps {
    part: PartMasterData;
    extraSpecifications?: string;
    activeImageIndex?: number;
    onSelectImageIndex?: (idx: number) => void;
}

const PrintPartDataSheet: React.FC<PrintPartDataSheetProps> = ({
    part,
    extraSpecifications,
    activeImageIndex,
    onSelectImageIndex
}) => {
    const allImages = React.useMemo(() => {
        const list = Array.isArray(part.images) && part.images.length > 0
            ? part.images.filter(Boolean)
            : (part.image ? [part.image] : []);
        return Array.from(new Set(list));
    }, [part.images, part.image]);

    const [internalIdx, setInternalIdx] = useState(0);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const currentIdx = activeImageIndex !== undefined ? activeImageIndex : internalIdx;
    const setIdx = (next: number) => {
        if (onSelectImageIndex) onSelectImageIndex(next);
        else setInternalIdx(next);
    };

    const safeIdx = allImages.length > 0 ? Math.min(currentIdx, allImages.length - 1) : 0;
    const currentImageUrl = allImages.length > 0 ? resolveImageUrl(allImages[safeIdx]) : '';

    const normalizedDims = (part.dimensions || '').trim();
    const normalizedExtra = (extraSpecifications || '').trim();
    const showRequestSpecsRow = Boolean(normalizedExtra && normalizedExtra !== normalizedDims);

    const handleCopy = async (fieldKey: string, value: string, label: string) => {
        const clean = (value || '').trim();
        if (!clean || clean === '-') return;
        const ok = await copyTextToClipboard(clean);
        if (ok) {
            setCopiedField(fieldKey);
            toast.success(`${label} کپی شد ✓`);
            setTimeout(() => {
                setCopiedField(prev => (prev === fieldKey ? null : prev));
            }, 1800);
        } else {
            toast.error('امکان کپی خودکار فراهم نشد — متن را انتخاب کرده و Ctrl+C بزنید.');
        }
    };

    return (
        <div className="p-8 bg-white text-black font-sans dir-rtl text-right print-p-0 select-text">
            {/* Header */}
            <div className="border-4 border-black p-4 mb-6 flex justify-between items-center bg-gray-50">
                <div className="flex-1 select-text">
                    <h1 className="text-2xl font-black mb-1">شناسنامه کالا / قطعه (Data Sheet)</h1>
                    <p className="text-xs font-bold text-gray-600 tracking-widest uppercase">M.S.G Industrial Group - Technical Specification</p>
                </div>
                {/* Barcode inside Printed Card */}
                <div className="flex flex-col items-center bg-white border border-black p-1.5 ml-4">
                    <div className="flex items-stretch h-8 bg-white px-1 gap-[1px]">
                        {Array.from({ length: 40 }).map((_, idx) => {
                            const isBlack = ((part.id.charCodeAt(idx % part.id.length) || 0) >> (idx % 8)) & 1;
                            return (
                                <div 
                                    key={idx} 
                                    className={`w-[2px] h-full ${isBlack ? 'bg-black' : 'bg-transparent'}`} 
                                />
                            );
                        })}
                    </div>
                    <span className="text-[8px] font-mono tracking-wider font-bold mt-1 text-black uppercase select-text cursor-text">{part.id.slice(0, 16).toUpperCase()}</span>
                </div>
                <div className="w-24 h-24 border-2 border-black flex items-center justify-center bg-white p-1 relative">
                    {currentImageUrl ? (
                        <img src={currentImageUrl} className="max-w-full max-h-full object-contain" alt={part.name || 'part'} referrerPolicy="no-referrer" />
                    ) : (
                        <span className="text-[10px] font-bold text-gray-300">NO IMAGE</span>
                    )}
                    {allImages.length > 1 && (
                        <span className="absolute bottom-0.5 left-0.5 bg-black/80 text-white text-[8px] font-black px-1 rounded print:hidden">
                            {safeIdx + 1}/{allImages.length}
                        </span>
                    )}
                </div>
            </div>

            {/* Main Info Table */}
            <div className="grid grid-cols-2 border-2 border-black select-text">
                <div className="border-b border-l border-black p-3 bg-gray-100 font-bold text-sm">نام کالا / قطعه</div>
                <div className="border-b border-black p-3 text-sm font-black flex items-center justify-between gap-2 select-text cursor-text">
                    <span className="select-text cursor-text">{part.name}</span>
                    {part.name && (
                        <button
                            type="button"
                            onClick={() => handleCopy('name', part.name, 'نام کالا')}
                            className="print:hidden shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-300 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-300 text-[11px] font-bold text-gray-600 hover:text-indigo-700 cursor-pointer transition-colors"
                            title="کپی نام کالا"
                        >
                            {copiedField === 'name' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            <span>{copiedField === 'name' ? 'کپی شد' : 'کپی'}</span>
                        </button>
                    )}
                </div>
                
                <div className="border-b border-l border-black p-3 bg-gray-100 font-bold text-sm">نوع / دسته‌بندی</div>
                <div className="border-b border-black p-3 text-sm select-text cursor-text">{part.type} / {part.category}</div>
                
                <div className="border-b border-l border-black p-3 bg-gray-100 font-bold text-sm">زیر گروه</div>
                <div className="border-b border-black p-3 text-sm select-text cursor-text">{part.subCategory || '-'}</div>

                <div className="border-b border-l border-black p-3 bg-gray-100 font-bold text-sm">نام دستگاه</div>
                <div className="border-b border-black p-3 text-sm font-black select-text cursor-text">{part.machineName || '-'}</div>
                
                <div className="border-b border-l border-black p-3 bg-gray-100 font-bold text-sm">مشخصات ابعادی / فنی</div>
                <div className="border-b border-black p-3 text-sm font-mono flex items-start justify-between gap-2 select-text cursor-text">
                    <span className="select-text cursor-text whitespace-pre-wrap break-words flex-1">{normalizedDims || normalizedExtra || '-'}</span>
                    {(normalizedDims || normalizedExtra) && (
                        <button
                            type="button"
                            onClick={() => handleCopy('dimensions', normalizedDims || normalizedExtra, 'مشخصات فنی و ابعاد')}
                            className="print:hidden shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-300 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-300 text-[11px] font-sans font-bold text-gray-600 hover:text-indigo-700 cursor-pointer transition-colors"
                            title="کپی مشخصات ابعادی و فنی"
                        >
                            {copiedField === 'dimensions' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            <span>{copiedField === 'dimensions' ? 'کپی شد' : 'کپی'}</span>
                        </button>
                    )}
                </div>

                {showRequestSpecsRow && (
                    <>
                        <div className="border-b border-l border-black p-3 bg-gray-100 font-bold text-sm">مشخصات فنی در درخواست</div>
                        <div className="border-b border-black p-3 text-sm flex items-start justify-between gap-2 select-text cursor-text">
                            <span className="select-text cursor-text whitespace-pre-wrap break-words flex-1">{normalizedExtra}</span>
                            <button
                                type="button"
                                onClick={() => handleCopy('reqSpecs', normalizedExtra, 'مشخصات فنی درخواست')}
                                className="print:hidden shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-300 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-300 text-[11px] font-bold text-gray-600 hover:text-indigo-700 cursor-pointer transition-colors"
                                title="کپی مشخصات درخواست"
                            >
                                {copiedField === 'reqSpecs' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                <span>{copiedField === 'reqSpecs' ? 'کپی شد' : 'کپی'}</span>
                            </button>
                        </div>
                    </>
                )}
                
                <div className="border-b border-l border-black p-3 bg-gray-100 font-bold text-sm">واحد اندازه‌گیری</div>
                <div className="border-b border-black p-3 text-sm select-text cursor-text">{part.unit}</div>
                
                <div className="border-l border-black p-3 bg-gray-100 font-bold text-sm">حداقل موجودی (نقطه سفارش)</div>
                <div className="p-3 text-sm font-black text-red-600 select-text cursor-text">{part.minStock} {part.unit}</div>
            </div>

            {/* Visuals & QR Section */}
            <div className="mt-6 flex flex-col gap-3">
                <div className="flex gap-6 h-64">
                    <div className="flex-1 border-2 border-black p-2 flex items-center justify-center bg-gray-50 relative overflow-hidden group">
                        {currentImageUrl ? (
                            <img src={currentImageUrl} className="max-w-full max-h-full object-contain transition-all duration-200" alt={part.name || 'part'} referrerPolicy="no-referrer" />
                        ) : (
                            <div className="text-gray-300 text-sm font-bold italic">تصویر فنی بارگذاری نشده است</div>
                        )}
                        <div className="absolute top-0 right-0 p-2 bg-black text-white text-[10px] font-black uppercase">
                            Product Visual {allImages.length > 1 ? `(${safeIdx + 1}/${allImages.length})` : ''}
                        </div>

                        {allImages.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIdx((safeIdx - 1 + allImages.length) % allImages.length);
                                    }}
                                    className="print:hidden absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer transition-all"
                                    title="تصویر قبلی"
                                >
                                    <ChevronRight size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIdx((safeIdx + 1) % allImages.length);
                                    }}
                                    className="print:hidden absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer transition-all"
                                    title="تصویر بعدی"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Thumbnail Strip when multiple images exist */}
                {allImages.length > 1 && (
                    <div className="print:hidden flex items-center justify-center gap-2 py-1 overflow-x-auto">
                        {allImages.map((imgUrl, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                                className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition-all cursor-pointer ${
                                    i === safeIdx ? 'border-indigo-600 ring-2 ring-indigo-300 scale-105' : 'border-gray-300 opacity-70 hover:opacity-100'
                                }`}
                            >
                                <img src={resolveImageUrl(imgUrl)} className="w-full h-full object-cover" alt={`thumb-${i + 1}`} referrerPolicy="no-referrer" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer / QC Area */}
            <div className="mt-8 grid grid-cols-3 gap-4">
                <div className="border-2 border-dashed border-black p-10 flex flex-col items-center justify-between text-[10px]">
                    <span className="font-bold">تاییدیه واحد فنی</span>
                </div>
                <div className="border-2 border-dashed border-black p-10 flex flex-col items-center justify-between text-[10px]">
                    <span className="font-bold">تاییدیه انبارداری</span>
                </div>
                <div className="border-2 border-dashed border-black p-10 flex flex-col items-center justify-between text-[10px]">
                    <span className="font-bold">تاییدیه کنترل کیفیت</span>
                </div>
            </div>

            <div className="mt-4 text-[9px] text-gray-400 flex justify-between font-mono select-text">
                <span>SYSTEM ID: {part.id}</span>
                <span>PRINT DATE: {new Date().toLocaleString('fa-IR')}</span>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { size: A4 portrait; margin: 15mm; }
                    body { visibility: hidden; background: white !important; }
                    .printable-datasheet, .printable-datasheet * { visibility: visible; }
                    .printable-datasheet { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 210mm;
                        padding: 0;
                        margin: 0;
                        background: white !important;
                        z-index: 99999;
                    }
                }
            `}} />
        </div>
    );
};

export default PrintPartDataSheet;
