import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    Sparkles, 
    Search, 
    Globe, 
    ExternalLink, 
    Phone, 
    MapPin, 
    Tag, 
    CheckCircle2, 
    ShieldAlert, 
    Copy, 
    Check, 
    MessageSquare, 
    FileText, 
    X, 
    Loader2, 
    Building2, 
    Send, 
    PlusCircle, 
    ShoppingBag, 
    Zap, 
    Info,
    Smartphone,
    PhoneCall,
    Package,
    Layers,
    AlertTriangle,
    RefreshCw,
    Trash2,
    SlidersHorizontal
} from 'lucide-react';
import { searchSuppliersWithAi, sendRfqMessage, AiPurchaseSearchResult, SupplierResult } from '../services/purchaseAiService';
import { PurchaseRequest, PurchaseItem, Part } from '../types';

interface AiPurchaseAdvisorModalProps {
    request: PurchaseRequest;
    parts?: Part[];
    onClose: () => void;
    onApplyProforma?: (proformaData: { vendorName: string; vendorPhone: string; unitPrice?: number; description?: string }) => void;
    initialItemIndex?: number;
}

// Helpers for Iranian phone numbers
const cleanDigits = (val?: string) => String(val || '').replace(/[^\d+]/g, '');

const isIranianMobile = (val?: string): boolean => {
    if (!val) return false;
    const clean = cleanDigits(val);
    return /^(?:\+98|0098|98|0)?9\d{9}$/.test(clean);
};

const isIranianLandline = (val?: string): boolean => {
    if (!val) return false;
    const clean = cleanDigits(val);
    if (/^(?:\+98|0098|98|0)?9\d{9}$/.test(clean)) return false;
    return /^(?:\+98|0098|98|0)?(?:21|26|31|24|51|71|41|13|86|34|61|77|54|87|81|83|66|58|45|28|44|17|25|38|74)\d{7,8}$/.test(clean) || /^0[1-8]\d+/.test(clean);
};

const formatMobileForDisplay = (val?: string): string => {
    if (!val) return '';
    const clean = cleanDigits(val);
    const m = clean.match(/^(?:\+98|0098|98|0)?(9\d{9})$/);
    return m ? `0${m[1]}` : val;
};

export const AiPurchaseAdvisorModal: React.FC<AiPurchaseAdvisorModalProps> = ({
    request,
    parts = [],
    onClose,
    onApplyProforma,
    initialItemIndex = 0
}) => {
    // Build items list from request.items or single item fallback
    const itemsList: (PurchaseItem | any)[] = (request.items && request.items.length > 0) 
        ? request.items 
        : [{ 
            id: '1', 
            itemName: request.itemName, 
            quantity: request.quantity, 
            unit: request.unit, 
            specifications: request.specifications,
            itemCode: (request as any).itemCode || ''
        }];

    const [selectedItemIndex, setSelectedItemIndex] = useState<number>(() => {
        if (initialItemIndex >= 0 && initialItemIndex < itemsList.length) return initialItemIndex;
        return 0;
    });

    const selectedItem = itemsList[selectedItemIndex] || itemsList[0];

    // Find linked part from coding catalog if available
    const matchedPart = parts.find(p => 
        (selectedItem.partId && p.id === selectedItem.partId) ||
        (selectedItem.itemCode && p.code === selectedItem.itemCode) ||
        (p.name && p.name.trim().toLowerCase() === selectedItem.itemName?.trim().toLowerCase())
    );

    // Results per item index (0 -> result, 1 -> result, ...)
    const [itemResults, setItemResults] = useState<Record<number, AiPurchaseSearchResult>>({});
    
    // Batch search state
    const [isBatchSearching, setIsBatchSearching] = useState<boolean>(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentItemName: string } | null>(null);

    // Search state for active view
    const [additionalNotes, setAdditionalNotes] = useState<string>('');
    const [searchLoading, setSearchLoading] = useState<boolean>(false);
    const [searchResult, setSearchResult] = useState<AiPurchaseSearchResult | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);

    // Search More & Alternative sourcing state
    const [searchMoreLoading, setSearchMoreLoading] = useState<boolean>(false);
    const [searchMoreError, setSearchMoreError] = useState<string | null>(null);
    const [searchMoreSuccessMsg, setSearchMoreSuccessMsg] = useState<string | null>(null);
    const [customMoreQuery, setCustomMoreQuery] = useState<string>('');
    const [removedSupplierNames, setRemovedSupplierNames] = useState<string[]>([]);
    const [showDirectPortals, setShowDirectPortals] = useState<boolean>(false);

    // RFQ and messaging state
    const [rfqMode, setRfqMode] = useState<'single' | 'all'>(itemsList.length > 1 ? 'all' : 'single');
    const [copiedRfq, setCopiedRfq] = useState<boolean>(false);
    const [activeRfqText, setActiveRfqText] = useState<string>('');
    
    // Quick send modal
    const [sendingSupplier, setSendingSupplier] = useState<SupplierResult | null>(null);
    const [sendPlatform, setSendPlatform] = useState<'whatsapp' | 'bale' | 'telegram'>('whatsapp');
    const [targetPhone, setTargetPhone] = useState<string>('');
    const [detectedLandline, setDetectedLandline] = useState<string>('');
    const [isSendingMsg, setIsSendingMsg] = useState<boolean>(false);
    const [sendFeedback, setSendFeedback] = useState<{ success: boolean; msg: string; directUrl?: string } | null>(null);

    // Quick suggestion chips
    const quickChips = [
        'برندهای معتبر ایرانی و خارجی',
        'موجودی فوری در انبار جهت تحویل سریع',
        'همراه با برگه آنالیز، سرتیفیکیت و ضمانت اصالت',
        'پایین‌ترین قیمت عمده و رقابتی بازار',
        'تامین‌کنندگان بازار تهران (شادآباد / لاله‌زار) و زنجان'
    ];

    const handleAddChip = (chip: string) => {
        if (!additionalNotes.includes(chip)) {
            setAdditionalNotes(prev => prev ? `${prev}، ${chip}` : chip);
        }
    };

    // Build standard multi-item RFQ template
    const generateAllItemsRfq = (): string => {
        let text = `با سلام و احترام\nاحتراماً پیرو نیاز فنی و خط تولید کارخانجات گروه صنعتی «لپان بافت»، خواهشمند است پیش‌فاکتور رسمی و قیمت همکاری اقلام ذیل را به صورت تفکیک‌شده صادر و ارسال فرمایید:\n\n`;
        itemsList.forEach((it, idx) => {
            text += `${idx + 1}. نام کالا: ${it.itemName}\n   - تعداد / مقدار: ${it.quantity} ${it.unit}\n`;
            if (it.specifications) text += `   - مشخصات فنی: ${it.specifications}\n`;
            if (it.itemCode) text += `   - کد قطعه: ${it.itemCode}\n`;
        });
        text += `\nلطفاً شرایط پرداخت، مدت اعتبار پیش‌فاکتور و کوتاه‌ترین زمان تحویل را قید بفرمایید.\nبا تشکر - واحد بازرگانی و تدارکات گروه صنعتی لپان بافت`;
        return text;
    };

    // Sync RFQ text when searchResult or rfqMode changes
    useEffect(() => {
        if (rfqMode === 'all' && itemsList.length > 1) {
            setActiveRfqText(generateAllItemsRfq());
        } else if (searchResult?.rfqTemplate) {
            setActiveRfqText(searchResult.rfqTemplate);
        } else {
            // Default single item RFQ
            setActiveRfqText(
                `با سلام و احترام\nاحتراماً پیرو نیاز فنی کارخانه «لپان بافت»، خواهشمند است پیش‌فاکتور رسمی و قیمت همکاری برای قلم زیر را صادر و ارسال فرمایید:\n\n📦 نام کالا: ${selectedItem.itemName}\n🔢 تعداد / مقدار: ${selectedItem.quantity} ${selectedItem.unit}\n📐 مشخصات فنی: ${selectedItem.specifications || 'مطابق استاندارد رایج'}\n${selectedItem.itemCode ? `🏷️ کد قطعه: ${selectedItem.itemCode}\n` : ''}\nلطفاً شرایط پرداخت و زمان تحویل را قید بفرمایید.\nبا تشکر - واحد تدارکات لپان بافت`
            );
        }
    }, [rfqMode, searchResult, selectedItemIndex]);

    // When switching item tab, switch active searchResult if already loaded
    const handleSelectItem = (idx: number) => {
        setSelectedItemIndex(idx);
        setSearchError(null);
        if (itemResults[idx]) {
            setSearchResult(itemResults[idx]);
        } else {
            setSearchResult(null);
        }
    };

    // Search single specific item
    const handleExecuteSearch = async (targetIdx: number = selectedItemIndex) => {
        const itemToSearch = itemsList[targetIdx] || itemsList[0];
        setSearchLoading(true);
        setSearchError(null);
        setSendFeedback(null);

        try {
            const linkedPart = parts.find(p => 
                (itemToSearch.partId && p.id === itemToSearch.partId) ||
                (itemToSearch.itemCode && p.code === itemToSearch.itemCode) ||
                (p.name && p.name.trim().toLowerCase() === itemToSearch.itemName?.trim().toLowerCase())
            );

            const combinedSpecs = [
                itemToSearch.specifications,
                linkedPart?.dimensions ? `ابعاد در شناسنامه: ${linkedPart.dimensions}` : '',
                linkedPart?.category ? `گروه کالا: ${linkedPart.category}` : '',
                linkedPart?.brand ? `برند متداول: ${linkedPart.brand}` : '',
                linkedPart?.technicalSpecs ? `مشخصات فنی: ${JSON.stringify(linkedPart.technicalSpecs)}` : ''
            ].filter(Boolean).join(' | ');

            const itemPayload = {
                itemName: itemToSearch.itemName,
                specifications: combinedSpecs || itemToSearch.specifications || '',
                itemCode: itemToSearch.itemCode || linkedPart?.code || '',
                quantity: itemToSearch.quantity || request.quantity || 1,
                unit: itemToSearch.unit || request.unit || 'عدد',
                category: request.category || linkedPart?.category || ''
            };

            const result = await searchSuppliersWithAi({
                item: itemPayload,
                items: itemsList,
                additionalNotes: additionalNotes.trim()
            });

            if (result && result.success) {
                // Attach item metadata to suppliers
                const enrichedResult: AiPurchaseSearchResult = {
                    ...result,
                    suppliers: (result.suppliers || []).map(s => ({
                        ...s,
                        itemIndex: targetIdx,
                        itemName: itemToSearch.itemName
                    }))
                };

                setItemResults(prev => ({
                    ...prev,
                    [targetIdx]: enrichedResult
                }));

                if (targetIdx === selectedItemIndex) {
                    setSearchResult(enrichedResult);
                }
            } else {
                setSearchError('نتیجه‌ای از موتور هوش مصنوعی دریافت نشد. لطفاً مجدداً تلاش نمایید.');
            }
        } catch (err: any) {
            console.error("AI Search Error:", err);
            setSearchError(err.message || 'خطا در برقراری ارتباط با سرویس هوش مصنوعی و جستجوی وب');
        } finally {
            setSearchLoading(false);
        }
    };

    // Search More: Search for alternative, additional or deeper supplier results
    const handleSearchMore = async (overrideQuery?: string) => {
        if (!searchResult || searchMoreLoading) return;
        setSearchMoreLoading(true);
        setSearchMoreError(null);
        setSearchMoreSuccessMsg(null);

        try {
            const itemToSearch = itemsList[selectedItemIndex] || itemsList[0];
            const linkedPart = parts.find(p => 
                (itemToSearch.partId && p.id === itemToSearch.partId) ||
                (itemToSearch.itemCode && p.code === itemToSearch.itemCode) ||
                (p.name && p.name.trim().toLowerCase() === itemToSearch.itemName?.trim().toLowerCase())
            );

            const combinedSpecs = [
                itemToSearch.specifications,
                linkedPart?.dimensions ? `ابعاد در شناسنامه: ${linkedPart.dimensions}` : '',
                linkedPart?.category ? `گروه کالا: ${linkedPart.category}` : '',
                linkedPart?.brand ? `برند متداول: ${linkedPart.brand}` : ''
            ].filter(Boolean).join(' | ');

            const itemPayload = {
                itemName: itemToSearch.itemName,
                specifications: combinedSpecs || itemToSearch.specifications || '',
                itemCode: itemToSearch.itemCode || linkedPart?.code || '',
                quantity: itemToSearch.quantity || request.quantity || 1,
                unit: itemToSearch.unit || request.unit || 'عدد',
                category: request.category || linkedPart?.category || ''
            };

            // Collect existing supplier names to exclude so AI searches for NEW and DIFFERENT ones
            const currentSuppliers = searchResult.suppliers || [];
            const existingNames = Array.from(new Set([
                ...currentSuppliers.map(s => s.name),
                ...removedSupplierNames
            ])).filter(Boolean);

            const queryToUse = overrideQuery || customMoreQuery.trim();

            const result = await searchSuppliersWithAi({
                item: itemPayload,
                items: itemsList,
                additionalNotes: additionalNotes.trim(),
                excludeSuppliers: existingNames,
                isDeepSearch: true,
                customSearchQuery: queryToUse
            });

            if (result && result.success && result.suppliers && result.suppliers.length > 0) {
                // Find newly found suppliers that aren't already in currentSuppliers
                const incomingSuppliers = (result.suppliers || []).filter(newSup => 
                    !currentSuppliers.some(cur => 
                        cur.name.trim().toLowerCase() === newSup.name.trim().toLowerCase() ||
                        (cur.website && newSup.website && cur.website === newSup.website)
                    ) && !removedSupplierNames.includes(newSup.name)
                ).map(s => ({
                    ...s,
                    itemIndex: selectedItemIndex,
                    itemName: itemToSearch.itemName,
                    isNew: true
                }));

                if (incomingSuppliers.length > 0) {
                    const updatedSuppliers = [...currentSuppliers, ...incomingSuppliers];
                    const updatedResult: AiPurchaseSearchResult = {
                        ...searchResult,
                        summary: result.summary || searchResult.summary,
                        suppliers: updatedSuppliers,
                        technicalTips: Array.from(new Set([...(searchResult.technicalTips || []), ...(result.technicalTips || [])]))
                    };

                    setItemResults(prev => ({
                        ...prev,
                        [selectedItemIndex]: updatedResult
                    }));
                    setSearchResult(updatedResult);
                    setSearchMoreSuccessMsg(`تعداد ${incomingSuppliers.length} تامین‌کننده و گزینه جدید به لیست افزوده شد.`);
                    if (queryToUse) {
                        setCustomMoreQuery('');
                    }
                } else {
                    setSearchMoreSuccessMsg('موتور هوش مصنوعی مورد جدیدی پیدا نکرد. لطفاً از میان‌برهای جستجوی مستقیم در ترب، ایمالز یا گوگل استفاده فرمایید.');
                }
            } else {
                setSearchMoreError(result?.warning || 'تامین‌کننده جدید دیگری در وب یافت نشد. می‌توانید با کلیدواژه یا برند دیگر جستجو نمایید.');
            }
        } catch (err: any) {
            console.error("AI Search More Error:", err);
            setSearchMoreError(err.message || 'خطا در جستجوی موارد بیشتر. لطفاً اتصال اینترنت یا کلید API را بررسی فرمایید.');
        } finally {
            setSearchMoreLoading(false);
        }
    };

    // Remove / Hide an unsuitable supplier from active results
    const handleRemoveSupplier = (supplierName: string) => {
        if (!searchResult) return;
        setRemovedSupplierNames(prev => [...prev, supplierName]);
        const updatedSuppliers = (searchResult.suppliers || []).filter(s => s.name !== supplierName);
        const updatedResult: AiPurchaseSearchResult = {
            ...searchResult,
            suppliers: updatedSuppliers
        };
        setItemResults(prev => ({
            ...prev,
            [selectedItemIndex]: updatedResult
        }));
        setSearchResult(updatedResult);
    };

    // Item-by-item batch search: process all items sequentially
    const handleSearchAllItems = async () => {
        if (isBatchSearching || searchLoading) return;
        setIsBatchSearching(true);
        setSearchError(null);

        const newResults: Record<number, AiPurchaseSearchResult> = { ...itemResults };

        try {
            for (let i = 0; i < itemsList.length; i++) {
                const currentItem = itemsList[i];
                setBatchProgress({
                    current: i + 1,
                    total: itemsList.length,
                    currentItemName: currentItem.itemName
                });

                const linkedPart = parts.find(p => 
                    (currentItem.partId && p.id === currentItem.partId) ||
                    (currentItem.itemCode && p.code === currentItem.itemCode) ||
                    (p.name && p.name.trim().toLowerCase() === currentItem.itemName?.trim().toLowerCase())
                );

                const combinedSpecs = [
                    currentItem.specifications,
                    linkedPart?.dimensions ? `ابعاد در شناسنامه: ${linkedPart.dimensions}` : '',
                    linkedPart?.category ? `گروه کالا: ${linkedPart.category}` : '',
                    linkedPart?.brand ? `برند متداول: ${linkedPart.brand}` : '',
                    linkedPart?.technicalSpecs ? `مشخصات فنی: ${JSON.stringify(linkedPart.technicalSpecs)}` : ''
                ].filter(Boolean).join(' | ');

                const itemPayload = {
                    itemName: currentItem.itemName,
                    specifications: combinedSpecs || currentItem.specifications || '',
                    itemCode: currentItem.itemCode || linkedPart?.code || '',
                    quantity: currentItem.quantity || 1,
                    unit: currentItem.unit || 'عدد',
                    category: request.category || linkedPart?.category || ''
                };

                const res = await searchSuppliersWithAi({
                    item: itemPayload,
                    items: itemsList,
                    additionalNotes: additionalNotes.trim()
                });

                if (res && res.success) {
                    const enriched: AiPurchaseSearchResult = {
                        ...res,
                        suppliers: (res.suppliers || []).map(s => ({
                            ...s,
                            itemIndex: i,
                            itemName: currentItem.itemName
                        }))
                    };
                    newResults[i] = enriched;
                    setItemResults(prev => ({ ...prev, [i]: enriched }));

                    // If currently viewing this item, update view
                    if (i === selectedItemIndex) {
                        setSearchResult(enriched);
                    }
                }
            }

            // After batch ends, ensure current selected item's result is in view
            if (newResults[selectedItemIndex]) {
                setSearchResult(newResults[selectedItemIndex]);
            }
        } catch (err: any) {
            console.error("Batch search error:", err);
            setSearchError(`خطا در بررسی گروهی اقلام: ${err.message || ''}`);
        } finally {
            setIsBatchSearching(false);
            setBatchProgress(null);
        }
    };

    const handleCopyRfq = () => {
        if (!activeRfqText) return;
        navigator.clipboard.writeText(activeRfqText);
        setCopiedRfq(true);
        setTimeout(() => setCopiedRfq(false), 2500);
    };

    // Smart Contact Opener: Automatically extracts and validates mobile vs landline
    const openSendDialog = (supplier: SupplierResult, defaultPlatform: 'whatsapp' | 'bale' | 'telegram' = 'whatsapp') => {
        setSendingSupplier(supplier);
        setSendPlatform(defaultPlatform);
        setSendFeedback(null);

        // 1. Check if supplier has a mobile number (09...)
        let bestMobile = '';
        if (supplier.mobile && isIranianMobile(supplier.mobile)) {
            bestMobile = supplier.mobile;
        } else if (supplier.whatsappPhone && isIranianMobile(supplier.whatsappPhone)) {
            bestMobile = supplier.whatsappPhone;
        } else if (supplier.phone && isIranianMobile(supplier.phone)) {
            bestMobile = supplier.phone;
        }

        // 2. Check if supplier has a landline (021..., 031..., etc.)
        let officePhone = '';
        if (supplier.landline) {
            officePhone = supplier.landline;
        } else if (supplier.phone && isIranianLandline(supplier.phone)) {
            officePhone = supplier.phone;
        }

        setDetectedLandline(officePhone);

        if (bestMobile) {
            setTargetPhone(formatMobileForDisplay(bestMobile));
        } else {
            // Do NOT put landline (021...) into WhatsApp target
            setTargetPhone('');
        }
    };

    const handleSendMessage = async () => {
        if (!targetPhone.trim()) {
            alert('لطفاً شماره موبایل مقصد را وارد نمایید.');
            return;
        }

        // Prevent sending to landline on WhatsApp
        if (sendPlatform === 'whatsapp' && isIranianLandline(targetPhone)) {
            setSendFeedback({
                success: false,
                msg: `شماره «${targetPhone}» تلفن ثابت دفتر است و در واتساپ فعال نیست. لطفاً شماره موبایل واحد فروش (09...) را وارد فرمایید.`
            });
            return;
        }

        setIsSendingMsg(true);
        setSendFeedback(null);

        try {
            const resp = await sendRfqMessage({
                platform: sendPlatform,
                target: targetPhone.trim(),
                message: activeRfqText,
                supplierName: sendingSupplier?.name,
                requestNumber: request.requestNumber
            });

            if (resp.sent) {
                setSendFeedback({
                    success: true,
                    msg: `✅ پیام استعلام قیمت با موفقیت از طریق ربات سرور به ${sendPlatform === 'whatsapp' ? 'واتساپ' : sendPlatform === 'bale' ? 'بله' : 'تلگرام'} ارسال گردید.`,
                    directUrl: resp.directUrl
                });
            } else if (resp.directUrl) {
                // Open direct WhatsApp/Bale link in new window automatically
                window.open(resp.directUrl, '_blank');
                setSendFeedback({
                    success: true,
                    msg: `صفحه ارسال مستقیم در ${sendPlatform === 'whatsapp' ? 'واتساپ' : sendPlatform === 'bale' ? 'بله' : 'تلگرام'} باز شد. در صورت باز نشدن، از لینک زیر استفاده نمایید:`,
                    directUrl: resp.directUrl
                });
            } else {
                setSendFeedback({
                    success: false,
                    msg: resp.errorMsg || 'خطا در ارسال پیام به تامین‌کننده'
                });
            }
        } catch (err: any) {
            setSendFeedback({
                success: false,
                msg: err.message || 'خطا در برقراری ارتباط با پیام‌رسان'
            });
        } finally {
            setIsSendingMsg(false);
        }
    };

    const handleImportToProforma = (supplier: SupplierResult) => {
        if (onApplyProforma) {
            let priceNum = 0;
            if (supplier.estimatedPrice) {
                const clean = supplier.estimatedPrice.replace(/\D/g, '');
                if (clean) priceNum = parseInt(clean, 10);
            }

            const phoneToSave = supplier.mobile || supplier.phone || supplier.landline || '';

            onApplyProforma({
                vendorName: supplier.name,
                vendorPhone: phoneToSave,
                unitPrice: priceNum,
                description: `${supplier.title || supplier.name} - ${supplier.description || ''} (${supplier.website || ''})`
            });
            onClose();
        }
    };

    // Total suppliers found across all items
    const totalFoundSuppliers = Object.values(itemResults).reduce((sum, r) => sum + (r.suppliers?.length || 0), 0);

    return createPortal(
        <div className="fixed inset-0 z-[100000010] flex items-stretch sm:items-start justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md overflow-y-auto pt-0 sm:pt-10 md:pt-12">
            <div className="bg-white dark:bg-gray-900 rounded-none sm:rounded-[2.5rem] w-full max-w-full lg:max-w-5xl xl:max-w-6xl overflow-hidden shadow-2xl border-0 sm:border border-white/20 animate-in fade-in zoom-in min-h-screen sm:min-h-[75vh] sm:max-h-[92vh] flex flex-col relative mb-0 sm:mb-8">
                
                {/* Header with AI Gradient */}
                <div className="p-4 md:p-6 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white flex justify-between items-center shrink-0 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="p-2.5 md:p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
                            <Sparkles size={24} className="text-yellow-300 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base md:text-xl font-black italic tracking-wide">
                                    دستیار هوشمند استعلام کالا و منبع‌یابی (AI Sourcing)
                                </h2>
                                <span className="bg-yellow-400/20 text-yellow-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-300/30">
                                    Google Gemini & Web Search
                                </span>
                            </div>
                            <p className="text-[10px] md:text-xs text-purple-100 font-medium opacity-90 mt-0.5">
                                جستجوی هوشمند در سایت‌های معتبر ایران، استخراج تفکیکی شماره همراه و تلفن دفتر، و ارسال استعلام قیمت به واتساپ و بله
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 md:p-2 bg-white/10 hover:bg-white/20 hover:rotate-90 rounded-xl transition-all text-white border border-white/20 shrink-0 cursor-pointer"
                        title="بستن پنجره"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Main Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/60 dark:bg-gray-950/60 no-scrollbar">
                    
                    {/* Item-by-Item Interactive Selector Bar */}
                    <div className="glass-panel p-4 md:p-5 rounded-3xl border border-indigo-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Package className="text-indigo-600 dark:text-indigo-400" size={18} />
                                <span className="text-xs font-black text-gray-800 dark:text-gray-200">
                                    اقلام درخواست خرید #{request.requestNumber} ({itemsList.length} قلم کالا)
                                </span>
                                {totalFoundSuppliers > 0 && (
                                    <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                        مجموعاً {totalFoundSuppliers} تامین‌کننده پیدا شد
                                    </span>
                                )}
                            </div>

                            {/* Batch Search Master Action */}
                            {itemsList.length > 1 && (
                                <button
                                    type="button"
                                    onClick={handleSearchAllItems}
                                    disabled={isBatchSearching || searchLoading}
                                    className="px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 dark:shadow-none flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                    title="جستجوی همزمان و تفکیکی برای تک تک اقلام"
                                >
                                    {isBatchSearching ? (
                                        <>
                                            <Loader2 size={13} className="animate-spin" />
                                            <span>در حال استعلام قلم {batchProgress?.current} از {batchProgress?.total} ({batchProgress?.currentItemName})...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={13} className="text-yellow-300 animate-pulse" />
                                            <span>⚡ بررسی و جستجوی تمام اقلام به صورت تک‌به‌تک (هر ۳ قلم کالا)</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Interactive Item Tabs Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {itemsList.map((it, idx) => {
                                const isSelected = idx === selectedItemIndex;
                                const res = itemResults[idx];
                                const hasResult = res && res.suppliers && res.suppliers.length > 0;
                                const isItemLoading = isBatchSearching && batchProgress?.current === idx + 1;

                                return (
                                    <button
                                        key={it.id || idx}
                                        type="button"
                                        onClick={() => handleSelectItem(idx)}
                                        className={`text-right p-3 rounded-2xl border transition-all relative flex flex-col justify-between gap-1.5 cursor-pointer ${
                                            isSelected 
                                                ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-400/30 shadow-sm' 
                                                : 'bg-white dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-1">
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                                    {idx + 1}
                                                </span>
                                                <span className="text-xs font-black text-gray-800 dark:text-gray-100 truncate">
                                                    {it.itemName}
                                                </span>
                                            </div>
                                            {isItemLoading ? (
                                                <span className="bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 animate-pulse">
                                                    <Loader2 size={10} className="animate-spin" /> در حال جستجو...
                                                </span>
                                            ) : hasResult ? (
                                                <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0">
                                                    ✔️ {res.suppliers.length} تامین‌کننده
                                                </span>
                                            ) : (
                                                <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0">
                                                    استعلام نشده
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100/80 dark:border-gray-700/60">
                                            <span>مقدار: <b className="text-indigo-600 dark:text-indigo-400 font-bold">{it.quantity} {it.unit}</b></span>
                                            {it.itemCode && <span className="font-mono">کد: {it.itemCode}</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Details of Current Selected Item */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2">
                            <div className="bg-indigo-50/50 dark:bg-gray-800/40 p-3 rounded-2xl border border-indigo-100/60 dark:border-gray-700">
                                <span className="text-[10px] text-gray-400 block font-bold mb-1">نام کالا / قطعه انتخابی:</span>
                                <span className="font-black text-gray-800 dark:text-gray-100 text-sm">{selectedItem.itemName}</span>
                            </div>

                            <div className="bg-indigo-50/50 dark:bg-gray-800/40 p-3 rounded-2xl border border-indigo-100/60 dark:border-gray-700">
                                <span className="text-[10px] text-gray-400 block font-bold mb-1">تعداد و واحد درخواستی:</span>
                                <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">{selectedItem.quantity} {selectedItem.unit}</span>
                            </div>

                            <div className="bg-indigo-50/50 dark:bg-gray-800/40 p-3 rounded-2xl border border-indigo-100/60 dark:border-gray-700">
                                <span className="text-[10px] text-gray-400 block font-bold mb-1">کدینگ کالا / انبار:</span>
                                <span className="font-mono font-bold text-gray-700 dark:text-gray-300 text-xs">
                                    {selectedItem.itemCode || matchedPart?.code || 'بدون کد شناسنامه'}
                                </span>
                            </div>

                            <div className="bg-indigo-50/50 dark:bg-gray-800/40 p-3 rounded-2xl border border-indigo-100/60 dark:border-gray-700">
                                <span className="text-[10px] text-gray-400 block font-bold mb-1">دسته‌بندی کلی:</span>
                                <span className="font-bold text-gray-700 dark:text-gray-300 text-xs truncate block">
                                    {request.category || matchedPart?.category || 'عمومی / صنعتی'}
                                </span>
                            </div>
                        </div>

                        {/* Existing Technical Specifications */}
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-xs space-y-1">
                            <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5">
                                <Tag size={12} className="text-indigo-500" />
                                مشخصات فنی ثبت‌شده در سیستم و شناسنامه کالا:
                            </span>
                            <p className="text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
                                {selectedItem.specifications || matchedPart?.dimensions || 'مشخصات ابعادی اولیه‌ای ثبت نشده است.'}
                                {matchedPart?.brand && ` | برند پیش‌فرض: ${matchedPart.brand}`}
                            </p>
                        </div>
                    </div>

                    {/* Additional Search Filters & Notes */}
                    <div className="glass-panel p-4 md:p-6 rounded-3xl border border-purple-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <Zap className="text-purple-600" size={16} />
                                توضیحات و شروط تکمیلی برای جستجوی «{selectedItem.itemName}» (اختیاری):
                            </label>
                            <span className="text-[10px] text-gray-400">راهنمای بهینه‌سازی جستجو</span>
                        </div>

                        <textarea
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-purple-50/20 dark:bg-gray-800/40 text-gray-800 dark:text-gray-200 leading-relaxed h-20 placeholder:text-gray-400"
                            placeholder="مثلاً: گرید صنعتی ضدسایش، تحویل فوری در تهران یا زنجان، برند معتبر، فاکتور رسمی با ارزش افزوده..."
                            value={additionalNotes}
                            onChange={(e) => setAdditionalNotes(e.target.value)}
                        />

                        {/* Quick Suggestion Chips */}
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-bold text-gray-400 block">افزودن سریع شروط جستجو:</span>
                            <div className="flex flex-wrap gap-1.5">
                                {quickChips.map((chip, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleAddChip(chip)}
                                        className="text-[11px] font-bold bg-gray-100 hover:bg-purple-100 hover:text-purple-700 text-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-purple-900/40 dark:hover:text-purple-300 px-3 py-1 rounded-xl transition-all border border-gray-200/60 dark:border-gray-700 active:scale-95 cursor-pointer"
                                    >
                                        + {chip}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Action Buttons for Searching */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => handleExecuteSearch(selectedItemIndex)}
                                disabled={searchLoading || isBatchSearching}
                                className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-black py-3.5 px-5 rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] disabled:opacity-50 text-xs sm:text-sm cursor-pointer"
                            >
                                {searchLoading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>در حال جستجوی هوشمند «{selectedItem.itemName}»...</span>
                                    </>
                                ) : (
                                    <>
                                        <Search size={16} />
                                        <span>جستجوی هوشمند برای این قلم («{selectedItem.itemName}»)</span>
                                        <Sparkles size={14} className="text-yellow-300" />
                                    </>
                                )}
                            </button>

                            {itemsList.length > 1 && (
                                <button
                                    type="button"
                                    onClick={handleSearchAllItems}
                                    disabled={isBatchSearching || searchLoading}
                                    className="w-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-black py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 text-xs sm:text-sm cursor-pointer"
                                >
                                    {isBatchSearching ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>بررسی خودکار تمام اقلام ({batchProgress?.current}/{batchProgress?.total})...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Layers size={16} />
                                            <span>بررسی و استعلام تک‌تک اقلام (همه {itemsList.length} قلم کالا)</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Search Error Notification */}
                    {searchError && (
                        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-2xl text-red-700 dark:text-red-300 text-xs flex items-center gap-3">
                            <ShieldAlert size={20} className="shrink-0 text-red-500" />
                            <span>{searchError}</span>
                        </div>
                    )}

                    {/* Non-blocking Warning Banner */}
                    {searchResult && searchResult.warning && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-800 dark:text-amber-300 text-xs flex items-center gap-3">
                            <Info size={20} className="shrink-0 text-amber-600 dark:text-amber-400" />
                            <span className="font-medium leading-relaxed">{searchResult.warning}</span>
                        </div>
                    )}

                    {/* AI Results Display */}
                    {searchResult ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            
                            {/* Summary & Market Overview */}
                            <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 dark:from-gray-800 dark:via-gray-850 dark:to-gray-900 p-5 rounded-3xl border border-indigo-100 dark:border-gray-700 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-black text-sm">
                                        <Sparkles size={18} />
                                        <span>تحلیل بازار و خلاصه منبع‌یابی برای «{selectedItem.itemName}»:</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 bg-white/70 dark:bg-gray-800 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                                        قلم {selectedItemIndex + 1} از {itemsList.length}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
                                    {searchResult.summary}
                                </p>
                                
                                {searchResult.searchKeywords && searchResult.searchKeywords.length > 0 && (
                                    <div className="flex items-center gap-2 pt-2 border-t border-indigo-100/60 dark:border-gray-700 text-[10px] text-gray-500">
                                        <span className="font-bold">کلیدواژه‌های جستجو:</span>
                                        <div className="flex flex-wrap gap-1">
                                            {searchResult.searchKeywords.map((kw, idx) => (
                                                <span key={idx} className="bg-white/80 dark:bg-gray-800 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 font-mono">
                                                    {kw}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Technical & QC Tips */}
                            {searchResult.technicalTips && searchResult.technicalTips.length > 0 && (
                                <div className="glass-panel p-4 md:p-5 rounded-3xl border border-emerald-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-3">
                                    <h3 className="text-xs font-black text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
                                        <CheckCircle2 size={16} />
                                        <span>راهنمای فنی و چک‌لیست بازرسی خرید برای «{selectedItem.itemName}»:</span>
                                    </h3>
                                    <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                        {searchResult.technicalTips.map((tip, idx) => (
                                            <li key={idx} className="flex items-start gap-2 bg-emerald-50/40 dark:bg-gray-800/40 p-2.5 rounded-xl border border-emerald-100/50 dark:border-gray-700">
                                                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">{idx + 1}</span>
                                                <span className="leading-relaxed">{tip}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Discovered Suppliers & Direct Links */}
                            <div className="space-y-4">
                                <div className="flex flex-wrap justify-between items-center gap-2">
                                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                        <Globe className="text-blue-600" size={18} />
                                        <span>تامین‌کنندگان یافته‌شده برای «{selectedItem.itemName}»</span>
                                        <span className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                                            {searchResult.suppliers.length} مورد
                                        </span>
                                    </h3>

                                    <button
                                        type="button"
                                        onClick={() => handleSearchMore()}
                                        disabled={searchMoreLoading}
                                        className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                        title="یافتن تامین‌کنندگان و گزینه‌های بیشتر بدون تکرار موارد بالا"
                                    >
                                        {searchMoreLoading ? (
                                            <Loader2 size={13} className="animate-spin text-indigo-600" />
                                        ) : (
                                            <RefreshCw size={13} className="text-indigo-600" />
                                        )}
                                        <span>جستجوی موارد بیشتر</span>
                                    </button>
                                </div>

                                {/* Verified Instant Sourcing Portals (100% active, live e-Namad sellers & real prices) */}
                                <div className="p-3.5 bg-gradient-to-r from-blue-50/80 via-indigo-50/80 to-purple-50/80 dark:from-gray-850 dark:via-gray-850 dark:to-indigo-950/50 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 shadow-xs space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                                            <Sparkles size={14} className="text-amber-500 animate-pulse" />
                                            <span>سامانه‌های زنده استعلام قیمت و فروشندگان معتبر ایران (دارای اینماد و تحویل فوری):</span>
                                        </span>
                                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full hidden sm:inline">
                                            ۱۰۰٪ فعال و تضمین باز شدن
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                                        <a 
                                            href={`https://torob.com/search/?query=${encodeURIComponent(selectedItem.itemName)}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-rose-200 dark:border-rose-900 hover:border-rose-400 text-rose-700 dark:text-rose-300 flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                                            title="مشاهده موجودی و قیمت زنده در صدها فروشگاه ترب"
                                        >
                                            <ExternalLink size={12} />
                                            <span>فروشندگان ترب (Torob)</span>
                                        </a>
                                        <a 
                                            href={`https://emalls.ir/search/?query=${encodeURIComponent(selectedItem.itemName)}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-900 hover:border-blue-400 text-blue-700 dark:text-blue-300 flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                                            title="جستجوی قطعه و استعلام مستقیم از فروشگاه‌های ایمالز"
                                        >
                                            <ExternalLink size={12} />
                                            <span>فروشگاه‌های ایمالز (Emalls)</span>
                                        </a>
                                        <a 
                                            href={`https://www.digikala.com/search/?q=${encodeURIComponent(selectedItem.itemName)}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-900 hover:border-red-400 text-red-700 dark:text-red-300 flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                                            title="بررسی قطعات، ابزارآلات و تجهیزات در دیجی‌کالا"
                                        >
                                            <ExternalLink size={12} />
                                            <span>دیجی‌کالا (Digikala)</span>
                                        </a>
                                        <a 
                                            href={`https://www.google.com/search?q=${encodeURIComponent(selectedItem.itemName + ' خرید قیمت فروشگاه لاله زار شادآباد شماره تلفن')}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-emerald-200 dark:border-emerald-900 hover:border-emerald-400 text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                                            title="جستجوی فروشگاه‌ها و دفاتر بازرگانی لاله زار و شادآباد تهران"
                                        >
                                            <ExternalLink size={12} />
                                            <span>بازار لاله زار و شادآباد</span>
                                        </a>
                                    </div>
                                </div>

                                {searchResult.suppliers.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-xs border border-dashed rounded-2xl bg-white dark:bg-gray-900">
                                        تامین‌کننده مستقیمی در این جستجو یافت نشد. می‌توانید با کلیدواژه‌های بیشتر یا شروط دیگر جستجو کنید.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {searchResult.suppliers.map((sup, idx) => {
                                            const hasMobile = !!(sup.mobile && isIranianMobile(sup.mobile)) || !!(sup.whatsappPhone && isIranianMobile(sup.whatsappPhone)) || !!(sup.phone && isIranianMobile(sup.phone));
                                            const displayMobile = sup.mobile || (isIranianMobile(sup.phone) ? sup.phone : '') || sup.whatsappPhone || '';
                                            const displayLandline = sup.landline || (!isIranianMobile(sup.phone) ? sup.phone : '');

                                            return (
                                                <div 
                                                    key={idx}
                                                    className={`glass-panel p-4 md:p-5 rounded-3xl border ${sup.isNew ? 'border-amber-300 dark:border-amber-600 ring-2 ring-amber-400/20' : 'border-gray-200 dark:border-gray-800'} bg-white dark:bg-gray-900 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600 transition-all flex flex-col justify-between space-y-4`}
                                                >
                                                    <div className="space-y-2.5">
                                                        {/* Header: Name and Location/Status */}
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <h4 className="text-sm font-black text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                                                        <Building2 size={16} className="text-indigo-600 shrink-0" />
                                                                        <span>{sup.name}</span>
                                                                    </h4>
                                                                    {sup.isNew && (
                                                                        <span className="bg-gradient-to-r from-amber-500 to-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-xs">
                                                                            ✨ مورد جدید
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {sup.title && sup.title !== sup.name && (
                                                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium line-clamp-1 mt-0.5">
                                                                        {sup.title}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                {sup.stockStatus && (
                                                                    <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                                        {sup.stockStatus}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveSupplier(sup.name)}
                                                                    title="حذف از پیشنهادات (مناسب نیست)"
                                                                    className="p-1 text-gray-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Contact Numbers: Smart Mobile vs Landline Display */}
                                                        <div className="space-y-1 bg-slate-50 dark:bg-gray-800/60 p-2.5 rounded-2xl border border-gray-100 dark:border-gray-700/80 text-[11px]">
                                                            {displayMobile ? (
                                                                <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 font-bold">
                                                                    <span className="flex items-center gap-1">
                                                                        <Smartphone size={13} className="text-emerald-600" />
                                                                        <span>شماره همراه / واتساپ:</span>
                                                                    </span>
                                                                    <span dir="ltr" className="font-mono font-black">{displayMobile}</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 font-medium text-[10px]">
                                                                    <span className="flex items-center gap-1">
                                                                        <AlertTriangle size={12} />
                                                                        <span>فاقد شماره موبایل در سایت</span>
                                                                    </span>
                                                                    <span>نیازمند استعلام دستی</span>
                                                                </div>
                                                            )}

                                                            {displayLandline && (
                                                                <div className="flex items-center justify-between text-gray-600 dark:text-gray-300 font-bold pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
                                                                    <span className="flex items-center gap-1">
                                                                        <PhoneCall size={13} className="text-indigo-500" />
                                                                        <span>تلفن ثابت دفتر:</span>
                                                                    </span>
                                                                    <a href={`tel:${displayLandline.replace(/[^\d+]/g, '')}`} className="font-mono font-black text-indigo-600 dark:text-indigo-400 hover:underline" dir="ltr">
                                                                        {displayLandline}
                                                                    </a>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Specs & Pricing Grid */}
                                                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-2xl">
                                                            <div>
                                                                <span className="text-gray-400 font-bold block text-[10px]">حدود قیمت:</span>
                                                                <span className="font-black text-indigo-700 dark:text-indigo-300">
                                                                    {sup.estimatedPrice || 'استعلام تلفنی'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-400 font-bold block text-[10px]">موقعیت / شهر:</span>
                                                                <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                                    <MapPin size={10} className="text-gray-400" />
                                                                    {sup.city || 'آنلاین'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Description & Advantages */}
                                                        {sup.description && (
                                                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
                                                                {sup.description}
                                                            </p>
                                                        )}
                                                        {sup.pros && (
                                                            <div className="text-[10px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 p-2 rounded-xl font-bold flex items-center gap-1.5">
                                                                <span>مزیت: {sup.pros}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                                        
                                                        {/* Website External Link & Google Profile Search */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                            {sup.website ? (
                                                                <a
                                                                    href={sup.website}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="py-2 px-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                                                    title="باز کردن وب‌سایت یا صفحه فروش مستقیم"
                                                                >
                                                                    <ExternalLink size={13} />
                                                                    <span className="truncate">ورود به وب‌سایت / صفحه کالا</span>
                                                                </a>
                                                            ) : (
                                                                <div />
                                                            )}

                                                            <a
                                                                href={`https://www.google.com/search?q=${encodeURIComponent(sup.name + ' ' + (sup.city || '') + ' تلفن آدرس ساعت کاری')}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="py-2 px-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                                                title="بررسی آدرس فیزیکی، نقشه و تلفن‌های این فروشگاه در گوگل"
                                                            >
                                                                <Search size={13} />
                                                                <span>بررسی فروشگاه در گوگل</span>
                                                            </a>
                                                        </div>

                                                        {/* Messaging, Phone and Proforma Actions */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                                                            {/* WhatsApp Action */}
                                                            <button
                                                                onClick={() => openSendDialog(sup, 'whatsapp')}
                                                                className={`py-2 px-2 text-white rounded-xl font-black flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer ${
                                                                    hasMobile ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-700/80 hover:bg-emerald-700'
                                                                }`}
                                                                title={hasMobile ? 'ارسال استعلام قیمت به شماره همراه واتساپ تاییدشده' : 'ارسال استعلام به واتساپ (با وارد کردن شماره همراه فروشنده)'}
                                                            >
                                                                <MessageSquare size={13} />
                                                                <span>{hasMobile ? 'واتساپ ✔' : 'استعلام واتساپ'}</span>
                                                            </button>

                                                            {/* Direct Phone Call or Bale Action */}
                                                            {displayLandline ? (
                                                                <a
                                                                    href={`tel:${displayLandline.replace(/[^\d+]/g, '')}`}
                                                                    className="py-2 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer"
                                                                    title={`تماس مستقیم تلفنی با دفتر فروش (${displayLandline})`}
                                                                >
                                                                    <PhoneCall size={13} />
                                                                    <span>تماس با دفتر</span>
                                                                </a>
                                                            ) : (
                                                                <button
                                                                    onClick={() => openSendDialog(sup, 'bale')}
                                                                    className="py-2 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer"
                                                                    title="ارسال استعلام قیمت در پیام‌رسان بله"
                                                                >
                                                                    <Send size={13} />
                                                                    <span>پیام‌رسان بله</span>
                                                                </button>
                                                            )}

                                                            {/* Apply to Proforma Action */}
                                                            {onApplyProforma && (
                                                                <button
                                                                    onClick={() => handleImportToProforma(sup)}
                                                                    className="col-span-2 sm:col-span-1 py-2 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer"
                                                                    title="ثبت این تامین‌کننده در پیش‌فاکتور"
                                                                >
                                                                    <PlusCircle size={13} />
                                                                    <span>تبدیل به پیش‌فاکتور</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Not satisfied with suggestions? Search more & show alternative options */}
                            <div className="p-5 md:p-6 rounded-3xl border border-amber-200 dark:border-amber-900/60 bg-gradient-to-br from-amber-50/70 via-white to-indigo-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-indigo-950/40 shadow-sm space-y-4">
                                <div className="flex flex-wrap justify-between items-start gap-2">
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                            <SlidersHorizontal size={18} className="text-amber-600 dark:text-amber-400" />
                                            <span>پیشنهادات بالا به کارتان نمی‌آیند؟ جستجوی موارد بیشتر و گزینه‌های جایگزین</span>
                                        </h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
                                            می‌توانید با کلیک روی دکمه زیر، از هوش مصنوعی بخواهید بدون تکرار تامین‌کنندگان قبلی، دایرکتوری‌ها، بازارهای دیگر، یا کلیدواژه‌های خاص مدنظرتان را مجدداً جستجو کند یا از لینک‌های مستقیم سامانه‌های مرجع خرید استفاده نمایید.
                                        </p>
                                    </div>

                                    {removedSupplierNames.length > 0 && (
                                        <span className="bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-[11px] font-bold px-2.5 py-1 rounded-xl">
                                            {removedSupplierNames.length} مورد نامناسب فیلتر شد
                                        </span>
                                    )}
                                </div>

                                {/* Primary "Search More" Trigger & Custom Query Input */}
                                <div className="space-y-3 pt-1">
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={customMoreQuery}
                                                onChange={(e) => setCustomMoreQuery(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleSearchMore(customMoreQuery);
                                                    }
                                                }}
                                                placeholder="جستجو با مشخصات، برند یا کلمه کلیدی خاص (مثلاً: رله فیندر، بورس لاله زار، استوک، قیمت پایین‌تر...)"
                                                className="w-full pl-3 pr-9 py-2.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-gray-800 dark:text-gray-200"
                                            />
                                            <Search size={15} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleSearchMore(customMoreQuery)}
                                            disabled={searchMoreLoading}
                                            className="px-5 py-2.5 bg-gradient-to-r from-amber-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-black text-xs rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                                        >
                                            {searchMoreLoading ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    <span>در حال جستجوی عمیق‌تر...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <RefreshCw size={14} />
                                                    <span>جستجوی موارد بیشتر (بدون تکرار)</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {/* Quick Suggestion Chips for Alternative Sourcing */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        <span className="text-[11px] text-gray-500 font-bold ml-1">شروط سریع برای موارد دیگر:</span>
                                        {[
                                            'تامین‌کنندگان بازار لاله‌زار و شادآباد',
                                            'برندهای معادل و جایگزین صنعتی',
                                            'فروشندگان عمده با قیمت ارزان‌تر',
                                            'تامین‌کنندگان دارای موجودی فوری انبار',
                                            'واردکنندگان دست اول و کارگاه‌ها'
                                        ].map((condition, cIdx) => (
                                            <button
                                                key={cIdx}
                                                type="button"
                                                onClick={() => {
                                                    setCustomMoreQuery(condition);
                                                    handleSearchMore(condition);
                                                }}
                                                disabled={searchMoreLoading}
                                                className="text-[11px] bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-amber-300 rounded-xl px-2.5 py-1 font-medium transition-colors cursor-pointer flex items-center gap-1 active:scale-95"
                                            >
                                                <span>+</span>
                                                <span>{condition}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Feedback Messages */}
                                    {searchMoreSuccessMsg && (
                                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
                                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                            <span>{searchMoreSuccessMsg}</span>
                                        </div>
                                    )}

                                    {searchMoreError && (
                                        <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 animate-in fade-in">
                                            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                                            <span>{searchMoreError}</span>
                                        </div>
                                    )}

                                    {/* 1-Click Direct Links to Iranian Industrial & General Marketplaces */}
                                    <div className="pt-2 border-t border-amber-200/50 dark:border-gray-800">
                                        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                                <ExternalLink size={14} className="text-indigo-600" />
                                                <span>جستجوی مستقیم «{selectedItem.itemName}» در سامانه‌ها و پورتال‌های مرجع بازار:</span>
                                            </span>
                                            <span className="text-[10px] text-gray-400">باز شدن با یک کلیک در تب جدید</span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                            {/* Torob */}
                                            <a
                                                href={`https://torob.com/search/?query=${encodeURIComponent(selectedItem.itemName)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-2xl font-black flex items-center justify-between transition-colors cursor-pointer"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <ShoppingBag size={14} className="text-rose-600" />
                                                    <span>موتور ترب (Torob)</span>
                                                </span>
                                                <ExternalLink size={12} className="opacity-70" />
                                            </a>

                                            {/* Emalls */}
                                            <a
                                                href={`https://emalls.ir/Search.aspx?query=${encodeURIComponent(selectedItem.itemName)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 rounded-2xl font-black flex items-center justify-between transition-colors cursor-pointer"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <Globe size={14} className="text-blue-600" />
                                                    <span>سامانه ایمالز (Emalls)</span>
                                                </span>
                                                <ExternalLink size={12} className="opacity-70" />
                                            </a>

                                            {/* Google Web Search with commercial Iranian keywords */}
                                            <a
                                                href={`https://www.google.com/search?q=${encodeURIComponent(selectedItem.itemName + ' خرید قیمت فروش تامین کننده قطعه')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl font-black flex items-center justify-between transition-colors cursor-pointer"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <Search size={14} className="text-emerald-600" />
                                                    <span>جستجوی وب در گوگل</span>
                                                </span>
                                                <ExternalLink size={12} className="opacity-70" />
                                            </a>

                                            {/* Digikala */}
                                            <a
                                                href={`https://www.digikala.com/search/?q=${encodeURIComponent(selectedItem.itemName)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50 rounded-2xl font-black flex items-center justify-between transition-colors cursor-pointer"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <Package size={14} className="text-red-600" />
                                                    <span>دیجی‌کالا و ابزار</span>
                                                </span>
                                                <ExternalLink size={12} className="opacity-70" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Formal RFQ Template Box with Single vs Combined Toggle */}
                            <div className="glass-panel p-4 md:p-6 rounded-3xl border border-indigo-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-3">
                                <div className="flex flex-wrap justify-between items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <FileText size={16} className="text-indigo-600" />
                                        <h3 className="text-xs font-black text-gray-800 dark:text-gray-200">
                                            متن رسمی استعلام قیمت و درخواست صدور پیش‌فاکتور (RFQ):
                                        </h3>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {itemsList.length > 1 && (
                                            <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-xl text-[11px] font-bold">
                                                <button
                                                    type="button"
                                                    onClick={() => setRfqMode('all')}
                                                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${rfqMode === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    استعلام کلی ({itemsList.length} قلم باهم)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setRfqMode('single')}
                                                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${rfqMode === 'single' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    فقط همین قلم («{selectedItem.itemName}»)
                                                </button>
                                            </div>
                                        )}

                                        <button
                                            onClick={handleCopyRfq}
                                            className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-gray-800 dark:text-indigo-300 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                                        >
                                            {copiedRfq ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                            <span>{copiedRfq ? 'کپی شد' : 'کپی متن استعلام'}</span>
                                        </button>
                                    </div>
                                </div>

                                <textarea
                                    className="w-full border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50 dark:bg-gray-800/40 text-gray-800 dark:text-gray-200 leading-relaxed h-36"
                                    value={activeRfqText}
                                    onChange={(e) => setActiveRfqText(e.target.value)}
                                />
                            </div>

                        </div>
                    ) : (
                        /* Empty State before search */
                        <div className="text-center py-12 px-4 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-indigo-200 dark:border-gray-800 space-y-3">
                            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/60 rounded-full flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
                                <Search size={28} />
                            </div>
                            <h3 className="text-sm font-black text-gray-800 dark:text-gray-200">
                                استعلام و جستجوی هوشمند برای «{selectedItem.itemName}»
                            </h3>
                            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
                                با فشردن دکمه «جستجوی هوشمند»، هوش مصنوعی اینترنت و دایرکتوری‌های صنعتی ایران را برای این قلم بررسی کرده، تامین‌کنندگان با شماره تماس و حدود قیمت را استخراج می‌نماید.
                            </p>
                            <div className="pt-2 flex justify-center gap-3">
                                <button
                                    onClick={() => handleExecuteSearch(selectedItemIndex)}
                                    disabled={searchLoading || isBatchSearching}
                                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                                >
                                    <Search size={14} />
                                    <span>شروع جستجو برای «{selectedItem.itemName}»</span>
                                </button>
                                {itemsList.length > 1 && (
                                    <button
                                        onClick={handleSearchAllItems}
                                        disabled={isBatchSearching || searchLoading}
                                        className="px-5 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                    >
                                        ⚡ استعلام همزمان هر {itemsList.length} قلم کالا
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <span className="text-[11px] text-gray-400 font-medium">
                        پشتیبانی از تفکیک هوشمند شماره‌های همراه (واتساپ/بله) و خطوط ثابت کارخانه و دفاتر فروش
                    </span>
                    <div className="flex items-center gap-2">
                        {searchResult && (
                            <button
                                type="button"
                                onClick={() => handleSearchMore()}
                                disabled={searchMoreLoading || searchLoading}
                                className="px-4 py-2 bg-gradient-to-r from-amber-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                                {searchMoreLoading ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>در حال جستجوی موارد بیشتر...</span>
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw size={14} />
                                        <span>جستجوی موارد بیشتر و گزینه‌های دیگر</span>
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                            بستن
                        </button>
                    </div>
                </div>
            </div>

            {/* Submodal: Send RFQ to WhatsApp / Bale Dialog with Smart Validation */}
            {sendingSupplier && (
                <div className="fixed inset-0 z-[100000020] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4 text-right">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h4 className="text-sm font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <Send size={16} className="text-emerald-600" />
                                ارسال استعلام به {sendingSupplier.name}
                            </h4>
                            <button onClick={() => setSendingSupplier(null)} className="p-1 hover:bg-gray-100 rounded-full cursor-pointer">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Platform Selector */}
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-black">
                            <button
                                onClick={() => setSendPlatform('whatsapp')}
                                className={`flex-1 py-2.5 rounded-xl transition-all cursor-pointer ${sendPlatform === 'whatsapp' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500'}`}
                            >
                                واتساپ (WhatsApp)
                            </button>
                            <button
                                onClick={() => setSendPlatform('bale')}
                                className={`flex-1 py-2.5 rounded-xl transition-all cursor-pointer ${sendPlatform === 'bale' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500'}`}
                            >
                                بله (Bale)
                            </button>
                            <button
                                onClick={() => setSendPlatform('telegram')}
                                className={`flex-1 py-2.5 rounded-xl transition-all cursor-pointer ${sendPlatform === 'telegram' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500'}`}
                            >
                                تلگرام
                            </button>
                        </div>

                        {/* If office landline was detected, show info box & phone call button */}
                        {detectedLandline && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-800 dark:text-amber-300 text-xs space-y-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                                    <span>
                                        تلفن ثبت‌شده در سیستم <b>{detectedLandline}</b> شماره ثابت دفتر است و واتساپ ندارد.
                                    </span>
                                </div>
                                <div className="flex justify-end">
                                    <a
                                        href={`tel:${detectedLandline.replace(/[^\d+]/g, '')}`}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-bold shadow-sm transition-all"
                                    >
                                        <PhoneCall size={12} />
                                        <span>تماس تلفنی مستقیم با دفتر ({detectedLandline})</span>
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* Target Mobile Phone input */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                    <Smartphone size={14} className="text-emerald-600" />
                                    <span>شماره همراه مسئول فروش (جهت واتساپ / بله):</span>
                                </label>
                            </div>
                            <input
                                type="text"
                                dir="ltr"
                                placeholder="مثال: 09121234567"
                                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                                value={targetPhone}
                                onChange={(e) => setTargetPhone(e.target.value)}
                            />

                            {/* Real-time Mobile vs Landline Indicator */}
                            {targetPhone && isIranianLandline(targetPhone) && (
                                <p className="mt-1.5 text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                                    ❌ این شماره تلفن ثابت دفتر است و واتساپ ندارد. لطفاً شماره موبایل 09... وارد نمایید.
                                </p>
                            )}
                            {targetPhone && isIranianMobile(targetPhone) && (
                                <p className="mt-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    ✔️ شماره همراه معتبر (پشتیبانی از دریافت پیام در واتساپ و بله)
                                </p>
                            )}
                        </div>

                        {/* Feedback message if any */}
                        {sendFeedback && (
                            <div className={`p-3 rounded-xl text-xs ${sendFeedback.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                                <p className="font-bold">{sendFeedback.msg}</p>
                                {sendFeedback.directUrl && (
                                    <a
                                        href={sendFeedback.directUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-1 text-emerald-700 font-black underline cursor-pointer"
                                    >
                                        <ExternalLink size={12} />
                                        <span>کلیک جهت باز کردن مستقیم گفتگو در {sendPlatform === 'whatsapp' ? 'واتساپ' : sendPlatform === 'bale' ? 'بله' : 'تلگرام'}</span>
                                    </a>
                                )}
                            </div>
                        )}

                        {/* Modal Action Buttons */}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleSendMessage}
                                disabled={isSendingMsg || (sendPlatform === 'whatsapp' && isIranianLandline(targetPhone))}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-3 rounded-xl shadow-lg transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isSendingMsg ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                <span>ارسال استعلام</span>
                            </button>
                            <button
                                onClick={() => setSendingSupplier(null)}
                                className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-xs cursor-pointer"
                            >
                                انصراف
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};
