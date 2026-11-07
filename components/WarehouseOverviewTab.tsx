import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    Loader2, Save, Plus, Trash2, Edit2, Check, X, FileText, 
    TrendingDown, TrendingUp, DollarSign, Calendar, RefreshCw, Settings, Eye, EyeOff,
    ChevronDown, ChevronRight, ChevronUp, AlertTriangle, AlertCircle, Send, Bell, BellRing, 
    CheckCircle2, ArrowUpRight, ArrowDownRight, ArrowUp, Sparkles, Share2, Scale, Layers, 
    Package, Boxes, Filter, FilterX, ExternalLink, Info, Download, FileDown, CheckSquare, Clock, Sliders, Navigation, Building2,
    Printer, FileSpreadsheet
} from 'lucide-react';
import { TradeStage } from '../types';
import { buildWarehouseOverviewPrintHtml } from '../utils/warehouseOverviewPrintHtml';
import { exportWarehouseOverviewToExcel, WarehouseExcelScope } from '../utils/warehouseOverviewExcel';
import { AiWarehouseAdvisorModal } from './AiWarehouseAdvisorModal';

interface WarehouseItem {
    id?: string;
    itemName: string;
    proforma?: string;
    lastYearCartons?: number;
    lastYearWeight?: number;
    lastYearContainers?: number;
    lastYearDollars?: number;
    currentCartons?: number;
    currentWeight?: number;
    currentContainers?: number;
    currentDollars?: number;
}

interface CustomCargoItem {
    id: string;
    cargoType: string;
    proforma: string;
    weight: number;
    cartons: number;
    container: number;
    dollars: number;
    statusBadge?: string;
    registrationNumber?: string;
    rialAmount?: number;
    petrochemicalName?: string;
    paymentMethod?: string;
}

interface CommercialGoodItem {
    id: string;
    itemName: string;
    category: string;
    cartons: number;
    weight: number;
    container: number;
    dollars: number;
    proforma?: string;
    registrationNumber?: string;
}

export const WarehouseOverviewTab: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Bot Alert & Dispatch States
    const [isBotModalOpen, setIsBotModalOpen] = useState(false);
    const [isSendingBot, setIsSendingBot] = useState(false);
    const [botDestinationType, setBotDestinationType] = useState<'default' | 'production' | 'custom'>('default');
    const [customTargetId, setCustomTargetId] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['telegram', 'bale', 'whatsapp']);
    const [botReportScope, setBotReportScope] = useState<'both' | 'overview_only' | 'variance_only'>('both');
    const [botSendFormat, setBotSendFormat] = useState<'pdf_and_caption' | 'pdf_only' | 'caption_only'>('pdf_and_caption');
    const [botNotifyInApp, setBotNotifyInApp] = useState<boolean>(true);
    const [botSendSuccessMessage, setBotSendSuccessMessage] = useState<string | null>(null);
    const [botSendErrorMessage, setBotSendErrorMessage] = useState<string | null>(null);

    // PDF Direct Download States
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [pdfScopeMenuOpen, setPdfScopeMenuOpen] = useState(false);
    const [excelMenuOpen, setExcelMenuOpen] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [isAiAdvisorOpen, setIsAiAdvisorOpen] = useState(false);

    // Variance Filter State
    const [varianceFilter, setVarianceFilter] = useState<'all' | 'negative' | 'positive'>('all');
    const [showVarianceDetails, setShowVarianceDetails] = useState(true);

    // Live Sayan Data States
    const [sayanLastYear, setSayanLastYear] = useState<any[]>([]);
    const [sayanCurrent, setSayanCurrent] = useState<any[]>([]);
    const [isSayanLive, setIsSayanLive] = useState<boolean>(true);
    const [isFromBenchmark, setIsFromBenchmark] = useState<boolean>(false);

    // Overrides & Extra tables saved in our local DB
    const [lastYearOverrides, setLastYearOverrides] = useState<Record<string, Partial<WarehouseItem>>>({});
    const [currentOverrides, setCurrentOverrides] = useState<Record<string, Partial<WarehouseItem>>>({});

    // Custom tables
    const [goodsInTransit, setGoodsInTransit] = useState<CustomCargoItem[]>([]);
    const [goodsInCustoms, setGoodsInCustoms] = useState<CustomCargoItem[]>([]);
    const [purchasingGoods, setPurchasingGoods] = useState<CustomCargoItem[]>([]);
    const [domesticPurchases, setDomesticPurchases] = useState<CustomCargoItem[]>([]);
    const [commercialGoods, setCommercialGoods] = useState<CommercialGoodItem[]>([]);

    // Excluded Order Registrations / Cargo Items State
    const [excludedRegistrationNumbers, setExcludedRegistrationNumbers] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('SAYAN_EXCLUDED_REGISTRATION_NUMBERS');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [isExcludeManagerOpen, setIsExcludeManagerOpen] = useState(false);
    const [excludeSearchTerm, setExcludeSearchTerm] = useState('');
    const [excludeCategoryFilter, setExcludeCategoryFilter] = useState<'all' | 'customs' | 'purchasing' | 'domestic' | 'transit' | 'commercial'>('all');
    const [excludeStatusFilter, setExcludeStatusFilter] = useState<'all' | 'excluded' | 'active'>('all');

    useEffect(() => {
        try {
            localStorage.setItem('SAYAN_EXCLUDED_REGISTRATION_NUMBERS', JSON.stringify(excludedRegistrationNumbers));
        } catch (e) {
            console.error('Failed to save excluded registrations:', e);
        }
    }, [excludedRegistrationNumbers]);

    const isItemExcluded = (item: { id?: string; registrationNumber?: string; proforma?: string }) => {
        if (!item || excludedRegistrationNumbers.length === 0) return false;
        const reg = item.registrationNumber ? String(item.registrationNumber).trim() : '';
        const prof = item.proforma ? String(item.proforma).trim() : '';
        const id = item.id ? String(item.id).trim() : '';

        return (
            (reg !== '' && excludedRegistrationNumbers.includes(reg)) ||
            (prof !== '' && excludedRegistrationNumbers.includes(prof)) ||
            (id !== '' && excludedRegistrationNumbers.includes(id))
        );
    };

    const toggleExcludeRegistration = (identifier: string, label?: string) => {
        if (!identifier) return;
        const cleanId = String(identifier).trim();
        if (!cleanId) return;

        setExcludedRegistrationNumbers(prev => {
            const exists = prev.includes(cleanId);
            if (exists) {
                return prev.filter(x => x !== cleanId);
            } else {
                return [...prev, cleanId];
            }
        });
    };

    const toggleExcludeItem = (item: { id?: string; registrationNumber?: string; proforma?: string }) => {
        if (!item) return;
        const reg = item.registrationNumber ? String(item.registrationNumber).trim() : '';
        const prof = item.proforma ? String(item.proforma).trim() : '';
        const id = item.id ? String(item.id).trim() : '';
        const cleanKey = reg || prof || id;
        if (!cleanKey) return;

        setExcludedRegistrationNumbers(prev => {
            const isCurrentlyExcluded = (reg !== '' && prev.includes(reg)) ||
                                        (prof !== '' && prev.includes(prof)) ||
                                        (id !== '' && prev.includes(id));
            if (isCurrentlyExcluded) {
                return prev.filter(x => x !== reg && x !== prof && x !== id && x !== cleanKey);
            } else {
                return [...prev, cleanKey];
            }
        });
    };

    const clearAllExclusions = () => {
        setExcludedRegistrationNumbers([]);
    };

    // Filtered visible arrays for Customs, Purchasing, Domestic, Transit and Commercial tables
    const visibleGoodsInTransit = useMemo(() => {
        return goodsInTransit.filter(item => !isItemExcluded(item));
    }, [goodsInTransit, excludedRegistrationNumbers]);

    const visibleGoodsInCustoms = useMemo(() => {
        return goodsInCustoms.filter(item => !isItemExcluded(item));
    }, [goodsInCustoms, excludedRegistrationNumbers]);

    const visiblePurchasingGoods = useMemo(() => {
        return purchasingGoods.filter(item => !isItemExcluded(item));
    }, [purchasingGoods, excludedRegistrationNumbers]);

    const visibleDomesticPurchases = useMemo(() => {
        return domesticPurchases.filter(item => !isItemExcluded(item));
    }, [domesticPurchases, excludedRegistrationNumbers]);

    const visibleCommercialGoods = useMemo(() => {
        return commercialGoods.filter(item => !isItemExcluded(item));
    }, [commercialGoods, excludedRegistrationNumbers]);

    // All excludable items collected across all supply chain pipeline tables
    const allExcludableItems = useMemo(() => {
        const items: Array<{
            id: string;
            registrationNumber: string;
            proforma: string;
            cargoType: string;
            weight: number;
            dollars: number;
            rialAmount?: number;
            categoryLabel: string;
            categoryKey: 'customs' | 'purchasing' | 'domestic' | 'transit' | 'commercial';
        }> = [];

        goodsInCustoms.forEach(item => {
            items.push({
                id: item.id,
                registrationNumber: item.registrationNumber || '',
                proforma: item.proforma || '',
                cargoType: item.cargoType || 'بار در گمرک',
                weight: item.weight || 0,
                dollars: item.dollars || 0,
                categoryLabel: 'بارهای در گمرک',
                categoryKey: 'customs'
            });
        });

        purchasingGoods.forEach(item => {
            items.push({
                id: item.id,
                registrationNumber: item.registrationNumber || '',
                proforma: item.proforma || '',
                cargoType: item.cargoType || 'بار در حال خرید و در راه',
                weight: item.weight || 0,
                dollars: item.dollars || 0,
                categoryLabel: 'بارهای در حال خرید و در راه',
                categoryKey: 'purchasing'
            });
        });

        domesticPurchases.forEach(item => {
            items.push({
                id: item.id,
                registrationNumber: item.registrationNumber || '',
                proforma: item.proforma || '',
                cargoType: item.cargoType || (item.petrochemicalName ? `پتروشیمی ${item.petrochemicalName}` : 'خرید پتروشیمی'),
                weight: item.weight || 0,
                dollars: 0,
                rialAmount: item.rialAmount || 0,
                categoryLabel: 'خریدهای داخلی پتروشیمی',
                categoryKey: 'domestic'
            });
        });

        goodsInTransit.forEach(item => {
            items.push({
                id: item.id,
                registrationNumber: item.registrationNumber || '',
                proforma: item.proforma || '',
                cargoType: item.cargoType || 'بار در ترانزیت',
                weight: item.weight || 0,
                dollars: item.dollars || 0,
                categoryLabel: 'بارهای ترانزیت',
                categoryKey: 'transit'
            });
        });

        commercialGoods.forEach(item => {
            items.push({
                id: item.id,
                registrationNumber: item.registrationNumber || '',
                proforma: item.proforma || '',
                cargoType: item.itemName || 'کالای تجاری',
                weight: item.weight || 0,
                dollars: item.dollars || 0,
                categoryLabel: 'کالای تجاری و متفرقه',
                categoryKey: 'commercial'
            });
        });

        return items;
    }, [goodsInCustoms, purchasingGoods, domesticPurchases, goodsInTransit, commercialGoods]);

    const filteredExcludableItems = useMemo(() => {
        return allExcludableItems.filter(item => {
            if (excludeCategoryFilter !== 'all' && item.categoryKey !== excludeCategoryFilter) {
                return false;
            }
            const excluded = isItemExcluded(item);
            if (excludeStatusFilter === 'excluded' && !excluded) return false;
            if (excludeStatusFilter === 'active' && excluded) return false;

            if (excludeSearchTerm.trim()) {
                const term = excludeSearchTerm.trim().toLowerCase();
                const matches = (item.cargoType && item.cargoType.toLowerCase().includes(term)) ||
                                (item.registrationNumber && item.registrationNumber.toLowerCase().includes(term)) ||
                                (item.proforma && item.proforma.toLowerCase().includes(term)) ||
                                (item.categoryLabel && item.categoryLabel.toLowerCase().includes(term)) ||
                                (item.id && item.id.toLowerCase().includes(term));
                if (!matches) return false;
            }
            return true;
        });
    }, [allExcludableItems, excludeSearchTerm, excludeCategoryFilter, excludeStatusFilter, excludedRegistrationNumbers]);

    const excludeAllFiltered = () => {
        const keysToAdd = filteredExcludableItems.map(item => item.registrationNumber || item.proforma || item.id).filter(Boolean);
        setExcludedRegistrationNumbers(prev => {
            const next = new Set([...prev, ...keysToAdd]);
            return Array.from(next);
        });
    };

    const includeAllFiltered = () => {
        const keysToRemove = new Set(
            filteredExcludableItems.flatMap(item => [item.registrationNumber, item.proforma, item.id]).filter(Boolean)
        );
        setExcludedRegistrationNumbers(prev => prev.filter(key => !keysToRemove.has(key)));
    };

    // Dynamic category overrides for Sayan items
    const [itemCategories, setItemCategories] = useState<Record<string, 'raw' | 'factory' | 'other'>>({});

    // Collapsible group state for Manufactured Yarns
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Metadata & Configurable Reporting Dates
    const [reportDate, setReportDate] = useState("۱۴۰۵/۰۵/۳۱");
    const [signature, setSignature] = useState(() => {
        try {
            const savedUser = JSON.parse(localStorage.getItem('app_user') || '{}');
            return savedUser?.fullName || savedUser?.name || '';
        } catch {
            return '';
        }
    });

    // Configurable Labels and Query Dates
    const [report1Label, setReport1Label] = useState("منتهی به سال ۱۴۰۴");
    const [report1Jalali, setReport1Jalali] = useState("۱۴۰۴/۱۲/۲۹");
    const [report1Miladi, setReport1Miladi] = useState("2026-03-20");

    const [report2Label, setReport2Label] = useState("وضعیت فعلی سال ۱۴۰۵");
    const [report2Jalali, setReport2Jalali] = useState("۱۴۰۵/۰۵/۳۱");
    const [report2Miladi, setReport2Miladi] = useState("2026-08-22");

    const [cumulativeFromLastYear, setCumulativeFromLastYear] = useState<boolean>(true);

    // Allowed commercial companies for warehouse overview integration
    const [allowedCompanies, setAllowedCompanies] = useState<string[]>([]);
    const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
    
    // Persistent refs for trade records and base custom table items
    const rawTradeRecordsRef = useRef<any[]>([]);
    const baseTransitRef = useRef<CustomCargoItem[]>([]);
    const baseCustomsRef = useRef<CustomCargoItem[]>([]);
    const basePurchaseRef = useRef<CustomCargoItem[]>([]);
    const baseDomesticRef = useRef<CustomCargoItem[]>([]);

    // Warehouse Bot Group Configurations from AppSettings
    const [warehouseTelegramGroupId, setWarehouseTelegramGroupId] = useState<string>('');
    const [warehouseBaleGroupId, setWarehouseBaleGroupId] = useState<string>('');
    const [warehouseWhatsappGroupId, setWarehouseWhatsappGroupId] = useState<string>('');

    // Search filter for Sayan items
    const [itemFilterText, setItemFilterText] = useState("");

    // Active Section State for Navigator
    const [activeSectionId, setActiveSectionId] = useState<string>('section-sayan-tables');

    // Scroll lock for Bot Modal to strictly prevent background page scrolling / jumping
    useEffect(() => {
        if (isBotModalOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isBotModalOpen]);

    // Smooth scroll helper to navigate effortlessly between sections without tiring scroll
    const scrollToSection = (sectionId: string) => {
        setActiveSectionId(sectionId);
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const containers = document.querySelectorAll('.overflow-y-auto, .custom-scrollbar');
        containers.forEach(c => c.scrollTo({ top: 0, behavior: 'smooth' }));
    };

    // Company name normalization and matching helpers
    const normalizeCompanyName = (name: string): string => {
        if (!name) return '';
        return String(name)
            .trim()
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/ي/g, 'ی')
            .replace(/ك/g, 'ک')
            .replace(/آ/g, 'ا')
            .replace(/\s+/g, ' ')
            .toLowerCase();
    };

    const isCompanyMatching = (recordCompany: string, allowedComps: string[]): boolean => {
        if (!allowedComps || allowedComps.length === 0) return true;
        const normRec = normalizeCompanyName(recordCompany);
        if (!normRec || normRec === 'بدون شرکت') {
            return allowedComps.some(c => {
                const normC = normalizeCompanyName(c);
                return normC === 'بدون شرکت' || normC === '';
            });
        }

        return allowedComps.some(allowed => {
            const normAllowed = normalizeCompanyName(allowed);
            if (!normAllowed) return false;
            if (normRec === normAllowed) return true;

            const cleanRec = normRec.replace(/^شرکت\s+/, '').trim();
            const cleanAllowed = normAllowed.replace(/^شرکت\s+/, '').trim();
            if (cleanRec === cleanAllowed) return true;

            if (cleanAllowed.length >= 5 && cleanRec.includes(cleanAllowed)) return true;
            if (cleanRec.length >= 5 && cleanAllowed.includes(cleanRec)) return true;

            return false;
        });
    };

    const getRecordWeight = (rec: any): number => {
        if (rec.shippingDocuments && rec.shippingDocuments.length > 0) {
            const commDocs = rec.shippingDocuments.filter((d: any) => d.type === 'Commercial Invoice');
            let commW = 0;
            for (const doc of commDocs) {
                if (doc.invoiceItems && doc.invoiceItems.length > 0) {
                    commW += doc.invoiceItems.reduce((sum: number, item: any) => sum + (Number(item.weight) || 0), 0);
                } else if (doc.netWeight) {
                    commW += Number(doc.netWeight) || 0;
                }
            }
            if (commW > 0) return commW;
        }
        return rec.items ? rec.items.reduce((sum: number, item: any) => sum + (Number(item.weight) || 0), 0) : 0;
    };

    const getRecordCartons = (rec: any): number => {
        if (!rec.shippingDocuments) return 0;
        const commDocs = rec.shippingDocuments.filter((d: any) => d.type === 'Commercial Invoice');
        let cartons = 0;
        for (const doc of commDocs) {
            if (doc.packagesCount) {
                cartons += Number(doc.packagesCount) || 0;
            } else if (doc.packingItems && doc.packingItems.length > 0) {
                cartons += doc.packingItems.reduce((sum: number, item: any) => sum + (Number(item.packageCount) || 0), 0);
            }
        }
        return cartons;
    };

    const getRecordDollars = (rec: any): number => {
        if (rec.shippingDocuments && rec.shippingDocuments.length > 0) {
            const commDocs = rec.shippingDocuments.filter((d: any) => d.type === 'Commercial Invoice');
            let dol = 0;
            for (const doc of commDocs) {
                if (doc.invoiceItems && doc.invoiceItems.length > 0) {
                    dol += doc.invoiceItems.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0);
                }
            }
            if (dol > 0) return dol;
        }
        return rec.items ? rec.items.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0) : 0;
    };

    const applyCommercialFilterAndMerge = (
        trades: any[],
        targetAllowedCompanies: string[],
        baseTransit: CustomCargoItem[],
        baseCustoms: CustomCargoItem[],
        basePurchase: CustomCargoItem[],
        baseDomestic?: CustomCargoItem[]
    ) => {
        const activeTradeRecords = (trades || []).filter((r: any) => !r.isArchived && isCompanyMatching(r.company, targetAllowedCompanies));

        const parsedCommercialCustoms: CustomCargoItem[] = [];
        const parsedCommercialPurchaseAndTransit: CustomCargoItem[] = [];
        const parsedCommercialDomesticPurchases: CustomCargoItem[] = [];

        for (const record of activeTradeRecords) {
            const isCompleted = record.status === 'Completed' || Boolean(record.isArchived);

            // Check if record is domestic petrochemical bourse purchase
            const isDomestic = record.purchaseType === 'domestic_bourse' || Boolean(record.petrochemicalData);

            if (isDomestic) {
                // If warehouse receipt confirmed or fully delivered to factory warehouse, exclude from pending pipeline
                const isDelivered = Boolean(
                    record.petrochemicalData?.warehouseReceipt?.isConfirmed ||
                    record.petrochemicalData?.loadingNotice?.deliveryStatus === 'delivered_warehouse' ||
                    isCompleted
                );

                if (isDelivered) {
                    continue;
                }

                let badge = 'خرید نقدی بورس';
                const pMethod = record.petrochemicalData?.paymentMethod;
                if (pMethod === 'internal_lc') {
                    badge = `LC داخلی (${record.petrochemicalData?.internalLc?.issuingBank || 'بانک'})`;
                } else if (pMethod === 'draft_barat') {
                    badge = `برات (${record.petrochemicalData?.draftBarat?.bankName || 'بانک'})`;
                } else if (pMethod === 'bourse_salaf') {
                    badge = 'سلف بورس کالا';
                }

                const loadingStatus = record.petrochemicalData?.loadingNotice?.deliveryStatus;
                if (loadingStatus === 'dispatched' || loadingStatus === 'loaded') {
                    badge += ' (بارگیری شده در راه)';
                } else if (loadingStatus === 'draft') {
                    badge += ' (صدور مجوز بارگیری)';
                }

                const petroWeight = Number(record.petrochemicalData?.quantityKg) || getRecordWeight(record) || 0;
                const petroRial = Number(record.petrochemicalData?.totalInvoiceAmount) || (petroWeight * (Number(record.petrochemicalData?.basePricePerKg) || 0)) || 0;

                parsedCommercialDomesticPurchases.push({
                    id: `com_${record.id}`,
                    cargoType: record.goodsName || record.petrochemicalData?.gradeName || 'خرید پتروشیمی',
                    proforma: record.petrochemicalData?.proformaNumber || record.fileNumber || '',
                    registrationNumber: record.petrochemicalData?.contractNumber || record.orderNumber || '',
                    weight: petroWeight,
                    cartons: getRecordCartons(record) || (petroWeight > 0 ? Math.round(petroWeight / 25) : 0),
                    container: 0,
                    dollars: 0,
                    rialAmount: petroRial,
                    statusBadge: badge,
                    petrochemicalName: record.petrochemicalData?.petrochemicalName || record.sellerName || 'پتروشیمی',
                    paymentMethod: pMethod
                });
                continue;
            }

            // Check if record has Truck Freight Cost (هزینه حمل کامیون / تحویل به انبار)
            const hasTruckFreight = Boolean(
                (record.internalShippingData?.payments && record.internalShippingData.payments.length > 0) ||
                (record.stages?.[TradeStage.INTERNAL_SHIPPING]?.costRial > 0) ||
                record.stages?.[TradeStage.INTERNAL_SHIPPING]?.isCompleted ||
                (record.stages?.['حمل داخلی']?.costRial > 0) ||
                record.stages?.['حمل داخلی']?.isCompleted
            );

            // Rule 4: "و وقتی هم هزینه حمل کامیون و یا بایگانی شد باید از تراز وزنی خارج بشه"
            if (isCompleted || hasTruckFreight) {
                continue;
            }

            // Rule 3: "و وقتی هم اعلامیه ورود ثبت میشه یا کوتاژ اتومات بره در گمرک"
            // Cottage (کوتاژ):
            const hasCottage = Boolean(
                (record.cottageNumber && String(record.cottageNumber).trim() !== '') ||
                (record.greenLeafData?.duties && record.greenLeafData.duties.length > 0) ||
                (record.greenLeafData?.guarantees && record.greenLeafData.guarantees.length > 0) ||
                (record.stages?.[TradeStage.GREEN_LEAF]?.costRial > 0 || record.stages?.[TradeStage.GREEN_LEAF]?.isCompleted) ||
                (record.stages?.['برگ سبز']?.costRial > 0 || record.stages?.['برگ سبز']?.isCompleted) ||
                (record.greenLeafData?.duties?.some((d: any) => d.cottageNumber && String(d.cottageNumber).trim() !== ''))
            );

            // Arrival Notice (اعلامیه ورود / ترخیصیه / قبض انبار):
            const hasArrivalNotice = Boolean(
                (record.clearanceData?.receipts && record.clearanceData.receipts.length > 0) ||
                (record.clearanceData?.payments && record.clearanceData.payments.length > 0) ||
                (record.stages?.[TradeStage.CLEARANCE_DOCS]?.costRial > 0 || record.stages?.[TradeStage.CLEARANCE_DOCS]?.isCompleted) ||
                (record.stages?.['ترخیصیه و قبض انبار']?.costRial > 0 || record.stages?.['ترخیصیه و قبض انبار']?.isCompleted) ||
                record.isInCustoms
            );

            const isInCustoms = hasCottage || hasArrivalNotice;

            // Currency Purchase registered (خرید ارز ثبت شده):
            const hasCurrencyPurchase = Boolean(
                (record.currencyPurchaseData && (
                    (record.currencyPurchaseData.purchasedAmount || 0) > 0 || 
                    (record.currencyPurchaseData.tranches && record.currencyPurchaseData.tranches.length > 0)
                )) ||
                (record.stages?.[TradeStage.CURRENCY_PURCHASE]?.costCurrency > 0 || record.stages?.[TradeStage.CURRENCY_PURCHASE]?.costRial > 0 || record.stages?.[TradeStage.CURRENCY_PURCHASE]?.isCompleted) ||
                (record.stages?.['خرید ارز']?.costCurrency > 0 || record.stages?.['خرید ارز']?.costRial > 0 || record.stages?.['خرید ارز']?.isCompleted)
            );

            // Allocation Approved (تخصیص یافته):
            const hasAllocationApproved = Boolean(
                record.currencyPurchaseData?.allocationDate ||
                record.stages?.[TradeStage.ALLOCATION_APPROVED]?.isCompleted ||
                record.stages?.['تخصیص یافته']?.isCompleted
            );

            if (isInCustoms) {
                let badge = 'ترخیصی گمرک';
                if (hasCottage) badge = 'دارای کوتاژ';
                else if (hasArrivalNotice) badge = 'دارای اعلامیه ورود';

                parsedCommercialCustoms.push({
                    id: `com_${record.id}`,
                    cargoType: record.goodsName || 'کالای بازرگانی',
                    proforma: record.fileNumber || '',
                    registrationNumber: record.registrationNumber || '',
                    weight: getRecordWeight(record),
                    cartons: getRecordCartons(record),
                    container: 0,
                    dollars: getRecordDollars(record),
                    statusBadge: badge
                });
            } else if (hasCurrencyPurchase || hasAllocationApproved) {
                // Rule 5: Merged "در حال خرید و در راه"
                let badge = hasCurrencyPurchase ? 'خرید ارز ثبت شده' : 'تخصیص یافته';
                if (record.isInTransit || (record.shippingDocuments && record.shippingDocuments.length > 0)) {
                    badge = hasCurrencyPurchase ? 'خرید ارز / در راه' : 'در راه (تخصیص یافته)';
                }

                parsedCommercialPurchaseAndTransit.push({
                    id: `com_${record.id}`,
                    cargoType: record.goodsName || 'کالای بازرگانی',
                    proforma: record.fileNumber || '',
                    registrationNumber: record.registrationNumber || '',
                    weight: getRecordWeight(record),
                    cartons: getRecordCartons(record),
                    container: 0,
                    dollars: getRecordDollars(record),
                    statusBadge: badge
                });
            }
            // Rule 1: Records that are only order-registered and in allocation queue without allocation and without currency purchase
            // are explicitly excluded from the weight balance!
        }

        const clearedFileNumbers = new Set(
            (trades || [])
                .filter((r: any) => {
                    const hasTruck = Boolean(
                        (r.internalShippingData?.payments && r.internalShippingData.payments.length > 0) ||
                        (r.stages?.[TradeStage.INTERNAL_SHIPPING]?.costRial > 0) ||
                        r.stages?.[TradeStage.INTERNAL_SHIPPING]?.isCompleted ||
                        (r.stages?.['حمل داخلی']?.costRial > 0) ||
                        r.stages?.['حمل داخلی']?.isCompleted
                    );
                    return r.status === 'Completed' || r.isArchived || hasTruck;
                })
                .map((r: any) => r.fileNumber)
                .filter(Boolean)
        );

        setGoodsInCustoms([
            ...(baseCustoms || []).filter((x: any) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma))),
            ...parsedCommercialCustoms
        ]);

        const mergedBasePurchaseAndTransit = [
            ...(basePurchase || []).filter((x: any) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma))),
            ...(baseTransit || []).filter((x: any) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma)))
        ];

        setPurchasingGoods([
            ...mergedBasePurchaseAndTransit,
            ...parsedCommercialPurchaseAndTransit
        ]);

        const effectiveBaseDomestic = baseDomestic || baseDomesticRef.current || [];
        setDomesticPurchases([
            ...effectiveBaseDomestic.filter((x: any) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma))),
            ...parsedCommercialDomesticPurchases
        ]);

        setGoodsInTransit([]);
    };

    // Helper to extract Jalali year
    const getJalaliYear = (jalaliStr: string) => {
        const clean = String(jalaliStr || '').trim()
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
        const match = clean.match(/^(\d{4})/);
        return match ? parseInt(match[1]) : 1404;
    };

    // Helper to approximate Gregorian start date of Jalali year
    const getJalaliYearStartMiladi = (year: number) => {
        if (year <= 1403) return '2024-03-20';
        if (year === 1404) return '2025-03-21';
        if (year === 1405) return '2026-03-21';
        return `${year + 621}-03-21`;
    };

    // Helper to fetch Sayan warehouse inventory using dynamic start and end dates
    const fetchSayanData = async (r1Miladi: string, r2Miladi: string, r1Jalali: string, r2Jalali: string, isCumulative: boolean, forceRefresh = false) => {
        try {
            const y1 = getJalaliYear(r1Jalali);
            const y2 = getJalaliYear(r2Jalali);
            
            const r1From = getJalaliYearStartMiladi(y1);
            const r2From = isCumulative ? getJalaliYearStartMiladi(y1) : getJalaliYearStartMiladi(y2);
            
            const url = `/api/sayan/warehouse-inventory?lastYearDateFrom=${r1From}&lastYearDateTo=${r1Miladi}&currentYearDateFrom=${r2From}&currentYearDateTo=${r2Miladi}${forceRefresh ? '&refresh=1&force=1' : ''}`;
            const sayanRes = await fetch(url);
            if (!sayanRes.ok) {
                console.error("Sayan API response not ok:", sayanRes.status);
                return;
            }
            const sayanData = await sayanRes.json();
            if (sayanData && sayanData.success) {
                setIsSayanLive(!!sayanData.isLive);
                setIsFromBenchmark(!!sayanData.fromBenchmark);
                if (Array.isArray(sayanData.lastYearStock) && sayanData.lastYearStock.length > 0) {
                    setSayanLastYear(sayanData.lastYearStock);
                }
                if (Array.isArray(sayanData.currentStock) && sayanData.currentStock.length > 0) {
                    setSayanCurrent(sayanData.currentStock);
                }
            }
        } catch (e) {
            console.error("Error in fetchSayanData:", e);
        }
    };

    // Load everything on mount
    useEffect(() => {
        loadSavedData(false);
    }, []);

    const loadSavedData = async (forceRefresh = false) => {
        setIsLoading(true);
        try {
            // 1. Fetch our custom DB data first to read labels/dates and allowed companies
            const dbRes = await fetch('/api/warehouse-overview/data');
            const dbData = await dbRes.json();

            let currentAllowedComps: string[] = [];
            if (dbData && dbData.meta && Array.isArray(dbData.meta.allowedCompanies)) {
                currentAllowedComps = dbData.meta.allowedCompanies;
                setAllowedCompanies(currentAllowedComps);
            }

            // Fetch main system settings to dynamically compute defaults based on active fiscal year if there's no saved config
            let activeYearLabel = "1405"; // Default fallback
            try {
                const settingsRes = await fetch('/api/settings');
                const settingsData = await settingsRes.json();
                if (settingsData) {
                    if (settingsData.warehouseTelegramGroupId) setWarehouseTelegramGroupId(settingsData.warehouseTelegramGroupId);
                    if (settingsData.warehouseBaleGroupId) setWarehouseBaleGroupId(settingsData.warehouseBaleGroupId);
                    if (settingsData.warehouseWhatsappGroupId) setWarehouseWhatsappGroupId(settingsData.warehouseWhatsappGroupId);
                    
                    if (settingsData.fiscalYears && settingsData.activeFiscalYearId) {
                        const activeYearObj = settingsData.fiscalYears.find((y: any) => y.id === settingsData.activeFiscalYearId);
                        if (activeYearObj && activeYearObj.label) {
                            activeYearLabel = activeYearObj.label;
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to fetch settings for active fiscal year", e);
            }

            // Dynamic defaults based on system's active fiscal year and real-time today date
            const nowObj = new Date();
            const todayMiladi = nowObj.toISOString().split('T')[0];
            const todayJalali = nowObj.toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });

            let r1Date = '2026-03-20'; // Default for previous fiscal year end (1404/12/29)
            let r2Date = todayMiladi; // Real-time live date for current fiscal year (1405 today)

            if (activeYearLabel === "1405") {
                r1Date = '2026-03-20'; // 1404/12/29
                r2Date = todayMiladi;
                
                setReport1Label("منتهی به سال ۱۴۰۴");
                setReport1Jalali("۱۴۰۴/۱۲/۲۹");
                setReport1Miladi("2026-03-20");

                setReport2Label("وضعیت فعلی سال ۱۴۰۵");
                setReport2Jalali(todayJalali);
                setReport2Miladi(todayMiladi);
                setReportDate(todayJalali);
            } else if (activeYearLabel === "1404") {
                r1Date = '2025-03-20'; // 1403/12/30
                r2Date = todayMiladi;
                
                setReport1Label("منتهی به سال ۱۴۰۳");
                setReport1Jalali("۱۴۰۳/۱۲/۳۰");
                setReport1Miladi("2025-03-20");

                setReport2Label("وضعیت فعلی سال ۱۴۰۴");
                setReport2Jalali(todayJalali);
                setReport2Miladi(todayMiladi);
                setReportDate(todayJalali);
            } else {
                // Generalized mathematical solar-to-miladi mapping fallback for any active year
                const yr = parseInt(activeYearLabel) || 1405;
                const prevYr = yr - 1;
                const miladiYear = yr + 621;
                
                r1Date = `${miladiYear}-03-20`;
                r2Date = todayMiladi;

                setReport1Label(`منتهی به سال ${prevYr.toLocaleString('fa-IR', {useGrouping: false})}`);
                setReport1Jalali(`${prevYr.toLocaleString('fa-IR', {useGrouping: false})}/۱۲/۲۹`);
                setReport1Miladi(`${miladiYear}-03-20`);

                setReport2Label(`وضعیت فعلی سال ${yr.toLocaleString('fa-IR', {useGrouping: false})}`);
                setReport2Jalali(todayJalali);
                setReport2Miladi(todayMiladi);
                setReportDate(todayJalali);
            }

            // Fetch trade records to dynamically compute commercial goods in transit, in customs, and purchased
            let tradeRecords: any[] = [];
            try {
                const tradeRes = await fetch('/api/trade');
                if (tradeRes.ok) {
                    tradeRecords = await tradeRes.json();
                }
            } catch (err) {
                console.error("Failed to fetch trade records", err);
            }

            rawTradeRecordsRef.current = tradeRecords;
            const uniqueComps = Array.from(new Set(tradeRecords.filter((r: any) => !r.isArchived).map((r: any) => r.company || 'بدون شرکت'))).sort();
            setAvailableCompanies(uniqueComps);

            if (dbData) {
                setLastYearOverrides(dbData.lastYearOverrides || {});
                setCurrentOverrides(dbData.currentOverrides || {});
                
                const loadedTransit: CustomCargoItem[] = (dbData.goodsInTransit || []).filter((x: any) => !x.id.startsWith('com_'));
                const loadedCustoms: CustomCargoItem[] = (dbData.goodsInCustoms || []).filter((x: any) => !x.id.startsWith('com_'));
                const loadedPurchase: CustomCargoItem[] = (dbData.purchasingGoods || []).filter((x: any) => !x.id.startsWith('com_'));
                const loadedDomestic: CustomCargoItem[] = (dbData.domesticPurchases || []).filter((x: any) => !x.id.startsWith('com_'));

                const mergedLoadedPurchaseAndTransit = [...loadedPurchase, ...loadedTransit];
                baseTransitRef.current = [];
                baseCustomsRef.current = loadedCustoms;
                basePurchaseRef.current = mergedLoadedPurchaseAndTransit;
                baseDomesticRef.current = loadedDomestic;

                applyCommercialFilterAndMerge(tradeRecords, currentAllowedComps, [], loadedCustoms, mergedLoadedPurchaseAndTransit, loadedDomestic);

                setCommercialGoods(dbData.commercialGoods || []);
                setItemCategories(dbData.itemCategories || {});
                
                if (dbData.meta) {
                    if (dbData.meta.reportDate) setReportDate(dbData.meta.reportDate);
                    if (dbData.meta.signature) setSignature(dbData.meta.signature);
                    
                    if (dbData.meta.report1Label) setReport1Label(dbData.meta.report1Label);
                    if (dbData.meta.report1Jalali) setReport1Jalali(dbData.meta.report1Jalali);
                    if (dbData.meta.report1Miladi) {
                        setReport1Miladi(dbData.meta.report1Miladi);
                        r1Date = dbData.meta.report1Miladi;
                    }
                    
                    if (dbData.meta.report2Label) setReport2Label(dbData.meta.report2Label);
                    // report2Jalali kept as live today date
                    r2Date = todayMiladi; setReport2Miladi(todayMiladi); setReport2Jalali(todayJalali);

                    if (dbData.meta.cumulativeFromLastYear !== undefined) {
                        setCumulativeFromLastYear(dbData.meta.cumulativeFromLastYear);
                    }
                    if (Array.isArray(dbData.meta.allowedCompanies)) {
                        setAllowedCompanies(dbData.meta.allowedCompanies);
                    }
                }
            } else {
                applyCommercialFilterAndMerge(tradeRecords, currentAllowedComps, [], [], []);
            }

            // 2. Fetch Sayan Live stock with correct dates
            const finalR1Jalali = dbData?.meta?.report1Jalali || (activeYearLabel === "1405" ? "۱۴۰۴/۱۲/۲۹" : "۱۴۰۳/۱۲/۳۰");
            const finalR2Jalali = dbData?.meta?.report2Jalali || (activeYearLabel === "1405" ? "۱۴۰۵/۰۵/۳۱" : "۱۴۰۴/۰۸/۲۲");
            const finalCumulative = dbData?.meta?.cumulativeFromLastYear !== undefined ? dbData.meta.cumulativeFromLastYear : true;

            await fetchSayanData(r1Date, r2Date, finalR1Jalali, finalR2Jalali, finalCumulative, forceRefresh);
            
            if (forceRefresh) {
                try {
                    await fetch('/api/warehouse-overview/live-status?force=true');
                } catch (e) {
                    console.error("Failed to refresh live status widget:", e);
                }
            }
        } catch (err) {
            console.error("Failed to load warehouse overview data", err);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to sync dates directly with system's active fiscal year inside settings
    const handleSyncWithActiveYear = async () => {
        setIsLoading(true);
        try {
            const settingsRes = await fetch('/api/settings');
            const settingsData = await settingsRes.json();
            let activeYearLabel = "1405";
            if (settingsData && settingsData.fiscalYears && settingsData.activeFiscalYearId) {
                const activeYearObj = settingsData.fiscalYears.find((y: any) => y.id === settingsData.activeFiscalYearId);
                if (activeYearObj && activeYearObj.label) {
                    activeYearLabel = activeYearObj.label;
                }
            }

            const nowObj = new Date();
            const todayMiladi = nowObj.toISOString().split('T')[0];
            const todayJalali = nowObj.toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });

            if (activeYearLabel === "1405") {
                setReport1Label("منتهی به سال ۱۴۰۴");
                setReport1Jalali("۱۴۰۴/۱۲/۲۹");
                setReport1Miladi("2026-03-20");

                setReport2Label("وضعیت فعلی سال ۱۴۰۵");
                setReport2Jalali(todayJalali);
                setReport2Miladi(todayMiladi);
                setReportDate(todayJalali);
            } else if (activeYearLabel === "1404") {
                setReport1Label("منتهی به سال ۱۴۰۳");
                setReport1Jalali("۱۴۰۳/۱۲/۳۰");
                setReport1Miladi("2025-03-20");

                setReport2Label("وضعیت فعلی سال ۱۴۰۴");
                setReport2Jalali(todayJalali);
                setReport2Miladi(todayMiladi);
                setReportDate(todayJalali);
            } else {
                // Generalized mathematical solar-to-miladi mapping fallback for any active year
                const yr = parseInt(activeYearLabel) || 1405;
                const prevYr = yr - 1;
                const miladiYear = yr + 621;
                
                setReport1Label(`منتهی به سال ${prevYr.toLocaleString('fa-IR', {useGrouping: false})}`);
                setReport1Jalali(`${prevYr.toLocaleString('fa-IR', {useGrouping: false})}/۱۲/۲۹`);
                setReport1Miladi(`${miladiYear}-03-20`);

                setReport2Label(`وضعیت فعلی سال ${yr.toLocaleString('fa-IR', {useGrouping: false})}`);
                setReport2Jalali(todayJalali);
                setReport2Miladi(todayMiladi);
                setReportDate(todayJalali);
            }
            alert(`تاریخ‌ها بر اساس سال مالی فعال سیستم (${activeYearLabel}) بازنشانی شدند. جهت ذخیره به عنوان پیش‌فرض دائم، دکمه «ثبت دائم و استعلام جدید» را بزنید.`);
        } catch (err) {
            console.error("Failed to sync with active year", err);
            alert("خطا در همگام‌سازی با سال مالی فعال سیستم.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (silent = false) => {
        setIsSaving(true);
        try {
            const totalNegativeWeight = negativeItems.reduce((sum, item) => sum + item.diffWeight, 0);
            const totalPositiveWeight = growthItems.reduce((sum, item) => sum + item.diffWeight, 0);

            const payload = {
                lastYearOverrides,
                currentOverrides,
                goodsInTransit: [],
                goodsInCustoms: goodsInCustoms.filter(r => !r.id.startsWith('com_')),
                purchasingGoods: purchasingGoods.filter(r => !r.id.startsWith('com_')),
                domesticPurchases: domesticPurchases.filter(r => !r.id.startsWith('com_')),
                commercialGoods,
                itemCategories,
                excludedRegistrationNumbers,
                meta: {
                    reportDate,
                    signature,
                    report1Label,
                    report1Jalali,
                    report1Miladi,
                    report2Label,
                    report2Jalali,
                    report2Miladi,
                    cumulativeFromLastYear,
                    allowedCompanies,
                    totalCurrentAllWeight,
                    diffAllWeight,
                    ratioAllWeight,
                    totalCurrentYarnsWeight,
                    totalLastYearYarnsWeight,
                    totalCurrentRawWeight,
                    totalLastYearRawWeight,
                    totalNegativeWeight,
                    totalPositiveWeight,
                    excludedRegistrationNumbers
                }
            };

            const res = await fetch('/api/warehouse-overview/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (!silent) {
                    setIsEditMode(false);
                    alert("تغییرات با موفقیت ذخیره شد.");
                }
            } else {
                if (!silent) alert("خطا در ذخیره تغییرات روی سرور.");
            }
        } catch (err) {
            console.error(err);
            if (!silent) alert("خطا در ذخیره اطلاعات.");
        } finally {
            setIsSaving(false);
        }
    };

    // Apply custom dates and trigger fresh data query from Sayan
    const handleApplySettingsAndFetch = async () => {
        setIsLoading(true);
        try {
            // Save bot group settings to main system settings
            try {
                const settingsRes = await fetch('/api/settings');
                const existingSettings = await settingsRes.json();
                await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...existingSettings,
                        warehouseTelegramGroupId,
                        warehouseBaleGroupId,
                        warehouseWhatsappGroupId
                    })
                });
            } catch (e) {
                console.error("Failed to update bot group settings", e);
            }

            // First save overrides and config
            await handleSave(true);

            // Refetch live stock with newly updated Miladi dates & cumulative configurations
            const nowToday = new Date().toISOString().split("T")[0]; const nowTodayJalali = new Date().toLocaleDateString("fa-IR-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }); setReport2Miladi(nowToday); setReport2Jalali(nowTodayJalali); setReportDate(nowTodayJalali); await fetchSayanData(report1Miladi, nowToday, report1Jalali, nowTodayJalali, cumulativeFromLastYear, true);
            
            setShowSettings(false);
            alert("تنظیمات با موفقیت ذخیره شد و به عنوان پیش‌فرض دائم گزارش ثبت گردید.");
        } catch (err) {
            console.error("Failed to refetch Sayan data", err);
            alert("خطا در استعلام اطلاعات جدید از سایان.");
        } finally {
            setIsLoading(false);
        }
    };

    // Sayan Group definitions (predefined 4-digit prefixes exactly matching Sayan ERP)
    const MANUFACTURED_GROUPS = [
        { code: '0401', name: 'اسپاندکس (کاور)' },
        { code: '0402', name: 'کش' },
        { code: '0403', name: 'اسپاندکس جوشی ( ساپورت )' },
        { code: '0405', name: 'پلی استر شوایتر' },
        { code: '0407', name: 'نایلون' },
        { code: '0408', name: 'نخ ملت' },
        { code: '0409', name: 'الیاف' },
        { code: '0410', name: 'FDY' }
    ];

    const RAW_MATERIAL_GROUPS = [
        { code: '0101', name: 'چیپس' },
        { code: '0102', name: 'POY' },
        { code: '0103', name: 'dty یا پلی استر' },
        { code: '0104', name: 'لاستیک' },
        { code: '0105', name: 'لاکرا' },
        { code: '0106', name: 'پلی استر اسپان' },
        { code: '0107', name: 'مستر بچ' },
        { code: '0108', name: 'نایلون' }
    ];

    // Helper function to classify Sayan items based on keywords and database group name
    const classifyItem = (r: any): 'lycra' | 'spun' | 'rubber' | 'melt' | 'nylon' | 'chips' | 'oil' | 'yarn' => {
        const code = String(r.itemCode || r.ItemCode || '');
        if (code.startsWith('04')) {
            return 'yarn';
        }
        if (code.startsWith('0104')) {
            return 'rubber';
        }
        if (code.startsWith('0105')) {
            return 'lycra';
        }
        if (code.startsWith('0106')) {
            return 'spun';
        }
        if (code.startsWith('0101')) {
            return 'chips';
        }

        const name = String(r.itemName || '').toLowerCase();
        const grp = String(r.groupName || '').toLowerCase();

        if (name.includes('لاکرا') || name.includes('اسپاندکس') || grp.includes('لاکرا') || grp.includes('اسپاندکس') || name.includes('spandex') || name.includes('lycra')) {
            return 'lycra';
        }
        if (name.includes('اسپان') || grp.includes('اسپان') || name.includes('spunbond') || name.includes('spun')) {
            return 'spun';
        }
        if (name.includes('لاستیک') || name.includes('الستیک') || grp.includes('لاستیک') || grp.includes('الستیک') || name.includes('rubber') || name.includes('elastic')) {
            return 'rubber';
        }
        if (name.includes('ملت') || grp.includes('ملت') || name.includes('meltblown') || name.includes('melt')) {
            return 'melt';
        }
        if (name.includes('نایلون') || grp.includes('نایلون') || name.includes('nylon')) {
            return 'nylon';
        }
        if (name.includes('چیپس') || grp.includes('چیپس') || name.includes('chips')) {
            return 'chips';
        }
        if (name.includes('روغن') || grp.includes('روغن') || name.includes('oil')) {
            return 'oil';
        }

        return 'yarn';
    };

    // Helper function to get all groups for a section dynamically, falling back to discovered ones if not predefined
    const getSectionGroups = (isProduction: boolean, predefinedGroups: { code: string; name: string }[]) => {
        const set = new Set<string>();
        predefinedGroups.forEach(g => set.add(g.code));

        const otherPredefined = isProduction ? RAW_MATERIAL_GROUPS : MANUFACTURED_GROUPS;
        const otherPredefinedCodes = new Set(otherPredefined.map(g => g.code));

        const matchesSection = (code: string) => {
            const prefix4 = code.substring(0, 4);
            if (set.has(prefix4)) return true;
            if (otherPredefinedCodes.has(prefix4)) return false;
            if (isProduction) {
                return code.startsWith('04');
            } else {
                return code.startsWith('01');
            }
        };

        sayanLastYear.forEach(r => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.length >= 4 && matchesSection(code)) {
                set.add(code.substring(0, 4));
            }
        });
        sayanCurrent.forEach(r => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.length >= 4 && matchesSection(code)) {
                set.add(code.substring(0, 4));
            }
        });

        const list = Array.from(set).map(prefix => {
            const predefined = predefinedGroups.find(g => g.code === prefix);
            if (predefined) return predefined;

            let discoveredName = '';
            const found = [...sayanCurrent, ...sayanLastYear].find(r => {
                const c = String(r.itemCode || r.ItemCode || '');
                return c.startsWith(prefix) && (r.groupName || r.itemName);
            });
            if (found) {
                discoveredName = found.groupName || found.itemName || '';
            }
            return {
                code: prefix,
                name: discoveredName || `گروه ${prefix}`
            };
        });

        return list.sort((a, b) => a.code.localeCompare(b.code));
    };

    // Helper function to get all child items of a group prefix across both periods
    const getGroupChildItems = (groupCode: string) => {
        const map: Record<string, { itemName: string; itemCode: string }> = {};
        sayanLastYear.forEach(r => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.startsWith(groupCode)) {
                const name = r.itemName || code || 'کالای بدون نام';
                map[code] = { itemName: name, itemCode: code };
            }
        });
        sayanCurrent.forEach(r => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.startsWith(groupCode)) {
                const name = r.itemName || code || 'کالای بدون نام';
                map[code] = { itemName: name, itemCode: code };
            }
        });
        return Object.values(map).sort((a, b) => a.itemName.localeCompare(b.itemName));
    };

    const toggleGroup = (groupCode: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupCode]: !prev[groupCode]
        }));
    };

    const getCategoryPersianLabel = (cat: string) => {
        switch (cat) {
            case 'lycra': return 'نخ لاکرا و اسپاندکس';
            case 'spun': return 'اسپان باند';
            case 'rubber': return 'لاستیک و کش';
            case 'melt': return 'ملت بلون';
            case 'nylon': return 'نایلون وارداتی';
            case 'chips': return 'چیپس پلیمر (پتروشیمی)';
            case 'oil': return 'روغن‌های کمکی و ریسندگی';
            default: return 'سایر اقلام انبار';
        }
    };

    // Aligned list of Manufactured Yarn Groups (Starting with 04 by default, plus DTY)
    const alignedYarns = useMemo(() => {
        const groups = getSectionGroups(true, MANUFACTURED_GROUPS);
        return groups.filter(g => itemCategories[g.code] !== 'other' && !isItemExcluded({ id: g.code, registrationNumber: g.code, proforma: g.code }));
    }, [sayanLastYear, sayanCurrent, itemCategories, excludedRegistrationNumbers]);

    // Aligned list of Raw Material Groups (Starting with 01 by default, plus FDY, الیاف, نخ ملت)
    const alignedImported = useMemo(() => {
        const groups = getSectionGroups(false, RAW_MATERIAL_GROUPS);
        return groups.filter(g => itemCategories[g.code] !== 'other' && !isItemExcluded({ id: g.code, registrationNumber: g.code, proforma: g.code }));
    }, [sayanLastYear, sayanCurrent, itemCategories, excludedRegistrationNumbers]);

    // Filters based on search input
    const filteredYarns = useMemo(() => {
        if (!itemFilterText.trim()) return alignedYarns;
        const search = itemFilterText.trim().toLowerCase();
        return alignedYarns.filter(g => 
            g.name.toLowerCase().includes(search) || 
            g.code.toLowerCase().includes(search)
        );
    }, [alignedYarns, itemFilterText]);

    const filteredImported = useMemo(() => {
        if (!itemFilterText.trim()) return alignedImported;
        const search = itemFilterText.trim().toLowerCase();
        return alignedImported.filter(g => 
            g.name.toLowerCase().includes(search) || 
            g.code.toLowerCase().includes(search)
        );
    }, [alignedImported, itemFilterText]);

    // Retrieve Sayan direct stock quantities for yarn groups or individual items
    
    // Sayan Accounting Breakdown Helpers
    const getSayanGroupOpening = (groupCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.startsWith(groupCode)) {
                return sum + (Number(r.openingQty) || 0);
            }
            return sum;
        }, 0);
    };

    const getSayanGroupInflow = (groupCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.startsWith(groupCode)) {
                return sum + (Number(r.inflowQty) || 0);
            }
            return sum;
        }, 0);
    };

    const getSayanGroupOutflow = (groupCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.startsWith(groupCode)) {
                return sum + (Number(r.outflowQty) || 0);
            }
            return sum;
        }, 0);
    };

    const getSayanGroupEnding = (groupCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.startsWith(groupCode)) {
                return sum + (Number(r.stockQty) || 0);
            }
            return sum;
        }, 0);
    };

    const getSayanItemOpening = (itemCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        const found = list.find(r => String(r.itemCode || r.ItemCode || '') === itemCode);
        return found ? (Number(found.openingQty) || 0) : 0;
    };

    const getSayanItemInflow = (itemCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        const found = list.find(r => String(r.itemCode || r.ItemCode || '') === itemCode);
        return found ? (Number(found.inflowQty) || 0) : 0;
    };

    const getSayanItemOutflow = (itemCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        const found = list.find(r => String(r.itemCode || r.ItemCode || '') === itemCode);
        return found ? (Number(found.outflowQty) || 0) : 0;
    };

    const getSayanItemEnding = (itemCode: string, isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        const found = list.find(r => String(r.itemCode || r.ItemCode || '') === itemCode);
        return found ? (Number(found.stockQty) || 0) : 0;
    };

    const calculateTotalSayanOpeningSum = (isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => sum + (Number(r.openingQty) || 0), 0);
    };

    const calculateTotalSayanInflowSum = (isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => sum + (Number(r.inflowQty) || 0), 0);
    };

    const calculateTotalSayanOutflowSum = (isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => sum + (Number(r.outflowQty) || 0), 0);
    };

    const calculateTotalSayanEndingSum = (isLastYear: boolean): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => sum + (Number(r.stockQty) || 0), 0);
    };

const getSayanGroupSum = (groupCode: string, isLastYear: boolean, field: 'weight' | 'cartons'): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        return list.reduce((sum, r) => {
            const code = String(r.itemCode || r.ItemCode || '');
            if (code.startsWith(groupCode)) {
                const qty = field === 'weight' ? (r.stockQty || 0) : (r.cartonsQty || 0);
                return sum + qty;
            }
            return sum;
        }, 0);
    };

    const getSayanItemValue = (itemCode: string, isLastYear: boolean, field: 'weight' | 'cartons'): number => {
        const list = isLastYear ? sayanLastYear : sayanCurrent;
        const found = list.find(r => String(r.itemCode || r.ItemCode || '') === itemCode);
        if (found) {
            return field === 'weight' ? (found.stockQty || 0) : (found.cartonsQty || 0);
        }
        return 0;
    };

    // Smart value getter supporting local overrides with Sayan database fallback
    const getItemValue = (
        itemKey: string, 
        isLastYear: boolean, 
        field: 'proforma' | 'cartons' | 'weight' | 'containers' | 'dollars',
        isGroup = false
    ): any => {
        // For weight and cartons, directly return live Sayan ERP inventory stock when available
        if (field === 'weight' || field === 'cartons') {
            const liveList = isLastYear ? sayanLastYear : sayanCurrent;
            const liveStockVal = isGroup ? getSayanGroupSum(itemKey, isLastYear, field) : getSayanItemValue(itemKey, isLastYear, field);
            if (liveList && liveList.length > 0) {
                return liveStockVal;
            }
        }
        const overrides = isLastYear ? lastYearOverrides : currentOverrides;
        let itemOverride = overrides[itemKey];
        if (!itemOverride) {
            const allItems = [...sayanLastYear, ...sayanCurrent];
            const foundItem = allItems.find(r => String(r.itemCode || r.ItemCode || '') === itemKey);
            if (foundItem && foundItem.itemName) {
                itemOverride = overrides[foundItem.itemName];
            }
        }
        if (itemOverride && itemOverride[field] !== undefined && itemOverride[field] !== '') {
            return itemOverride[field];
        }
        if (field === 'weight' || field === 'cartons') {
            return isGroup ? getSayanGroupSum(itemKey, isLastYear, field) : getSayanItemValue(itemKey, isLastYear, field);
        }
        return '';
    };

        const calculateCustomTableSum = (items: any[], field: string) => {
        if (!items || !Array.isArray(items)) return 0;
        return items.reduce((sum, item) => {
            let val = item[field];
            if (val === undefined && field === 'container') val = item['containers'];
            if (val === undefined && field === 'containers') val = item['container'];
            const num = parseFloat(String(val || 0));
            return sum + (isNaN(num) ? 0 : num);
        }, 0);
    };

    const getItemCategory = (code: string) => {
        return itemCategories[code] || 'raw';
    };

    const handleCategoryChange = (code: string, cat: any) => {
        setItemCategories(prev => ({ ...prev, [code]: cat }));
    };

    const handleCellChange = (itemName: string, isLastYear: boolean, field: string, value: string) => {
        const numVal = parseFloat(value) || 0;
        if (isLastYear) {
            setLastYearOverrides(prev => ({
                ...prev,
                [itemName]: {
                    ...(prev[itemName] || {}),
                    [field]: numVal
                }
            }));
        } else {
            setCurrentOverrides(prev => ({
                ...prev,
                [itemName]: {
                    ...(prev[itemName] || {}),
                    [field]: numVal
                }
            }));
        }
    };

    const allActiveRawItems = useMemo(() => alignedImported || [], [alignedImported]);
    const allActiveFactoryItems = useMemo(() => alignedYarns || [], [alignedYarns]);

    const calculateTotalSayanSum = (isLastYear: boolean, field: 'cartons' | 'weight' | 'containers' | 'dollars') => {
        const sumYarns = alignedYarns.reduce((sum, item) => sum + getItemValue(item.code, isLastYear, field, true), 0);
        const sumImported = alignedImported.reduce((sum, item) => sum + getItemValue(item.code, isLastYear, field, true), 0);
        return sumYarns + sumImported;
    };

    // Total calculations using grouped yarns + detail imported
    const totalLastYearContainers = useMemo(() => {
        return calculateTotalSayanSum(true, 'containers');
    }, [lastYearOverrides, alignedYarns, alignedImported]);

    const totalCurrentContainers = useMemo(() => {
        const bg = calculateTotalSayanSum(false, 'containers');
        const transit = calculateCustomTableSum(visibleGoodsInTransit, 'container');
        const customs = calculateCustomTableSum(visibleGoodsInCustoms, 'container');
        const purchase = calculateCustomTableSum(visiblePurchasingGoods, 'container');
        const domestic = calculateCustomTableSum(visibleDomesticPurchases, 'container');
        const commercial = calculateCustomTableSum(visibleCommercialGoods, 'container');
        return bg + transit + customs + purchase + domestic + commercial;
    }, [visibleGoodsInTransit, visibleGoodsInCustoms, visiblePurchasingGoods, visibleDomesticPurchases, visibleCommercialGoods, currentOverrides, alignedYarns, alignedImported]);

    const totalLastYearDollars = useMemo(() => {
        return calculateTotalSayanSum(true, 'dollars');
    }, [lastYearOverrides, alignedYarns, alignedImported]);

    const totalCurrentDollars = useMemo(() => {
        const bg = calculateTotalSayanSum(false, 'dollars');
        const transit = calculateCustomTableSum(visibleGoodsInTransit, 'dollars');
        const customs = calculateCustomTableSum(visibleGoodsInCustoms, 'dollars');
        const purchase = calculateCustomTableSum(visiblePurchasingGoods, 'dollars');
        const domestic = calculateCustomTableSum(visibleDomesticPurchases, 'dollars');
        const commercial = calculateCustomTableSum(visibleCommercialGoods, 'dollars');
        return bg + transit + customs + purchase + domestic + commercial;
    }, [visibleGoodsInTransit, visibleGoodsInCustoms, visiblePurchasingGoods, visibleDomesticPurchases, visibleCommercialGoods, currentOverrides, alignedYarns, alignedImported]);

    // Difference and ratio formulas matching the PDF
    const diffContainers = totalCurrentContainers - totalLastYearContainers;
    const ratioContainers = totalLastYearContainers > 0 ? (diffContainers / totalLastYearContainers) * 100 : 0;

    const diffDollars = totalCurrentDollars - totalLastYearDollars;
    const ratioDollars = totalLastYearDollars > 0 ? (diffDollars / totalLastYearDollars) * 100 : 0;

    const isDownwardTrend = diffContainers < 0;

    // TOTAL WEIGHTS COMPARISON CALCULATIONS (مجموعه مقایسه‌های جامع وزنی)
    // 1. Factory Manufactured Yarns (نخ‌های تولیدی کارخانه)
    const totalLastYearYarnsWeight = useMemo(() => {
        return alignedYarns.reduce((sum, item) => sum + getItemValue(item.code, true, 'weight', true), 0);
    }, [alignedYarns, lastYearOverrides, sayanLastYear]);

    const totalCurrentYarnsWeight = useMemo(() => {
        return alignedYarns.reduce((sum, item) => sum + getItemValue(item.code, false, 'weight', true), 0);
    }, [alignedYarns, currentOverrides, sayanCurrent]);

    const diffYarnsWeight = totalCurrentYarnsWeight - totalLastYearYarnsWeight;
    const ratioYarnsWeight = totalLastYearYarnsWeight > 0 ? (diffYarnsWeight / totalLastYearYarnsWeight) * 100 : 0;
    const isYarnsDownward = diffYarnsWeight < 0;

    // 2. Raw Materials & Imported Goods (مواد اولیه و واردات شامل انبار + گمرک + ترانزیت + خرید داخلی و خارجی)
    const totalLastYearRawWeight = useMemo(() => {
        return alignedImported.reduce((sum, item) => sum + getItemValue(item.code, true, 'weight', true), 0);
    }, [alignedImported, lastYearOverrides, sayanLastYear]);

    const totalCurrentRawWeight = useMemo(() => {
        const bg = alignedImported.reduce((sum, item) => sum + getItemValue(item.code, false, 'weight', true), 0);
        const transit = calculateCustomTableSum(visibleGoodsInTransit, 'weight');
        const customs = calculateCustomTableSum(visibleGoodsInCustoms, 'weight');
        const purchase = calculateCustomTableSum(visiblePurchasingGoods, 'weight');
        const domestic = calculateCustomTableSum(visibleDomesticPurchases, 'weight');
        const commercial = calculateCustomTableSum(visibleCommercialGoods, 'weight');
        return bg + transit + customs + purchase + domestic + commercial;
    }, [alignedImported, visibleGoodsInTransit, visibleGoodsInCustoms, visiblePurchasingGoods, visibleDomesticPurchases, visibleCommercialGoods, currentOverrides, sayanCurrent]);

    const diffRawWeight = totalCurrentRawWeight - totalLastYearRawWeight;
    const ratioRawWeight = totalLastYearRawWeight > 0 ? (diffRawWeight / totalLastYearRawWeight) * 100 : 0;
    const isRawDownward = diffRawWeight < 0;

    // 3. Total Enterprise Inventory & Inflow (سرجمع کل زنجیره تامین و انبار)
    const totalLastYearAllWeight = totalLastYearYarnsWeight + totalLastYearRawWeight;
    const totalCurrentAllWeight = totalCurrentYarnsWeight + totalCurrentRawWeight;
    const diffAllWeight = totalCurrentAllWeight - totalLastYearAllWeight;
    const ratioAllWeight = totalLastYearAllWeight > 0 ? (diffAllWeight / totalLastYearAllWeight) * 100 : 0;
    const isAllWeightDownward = diffAllWeight < 0;

    // 4. Comparative matrix of all items (and detection of negative items)
    const allComparedItems = useMemo(() => {
        const list: Array<{
            code: string;
            name: string;
            category: 'factory' | 'raw' | 'transit' | 'customs' | 'purchasing' | 'commercial' | 'domestic';
            categoryLabel: string;
            lastYearWeight: number;
            currentWeight: number;
            diffWeight: number;
            ratio: number;
            isNegative: boolean;
        }> = [];

        // Add Yarns (Factory Production)
        alignedYarns.forEach(group => {
            const wLast = getItemValue(group.code, true, 'weight', true);
            const wCurr = getItemValue(group.code, false, 'weight', true);
            const diff = wCurr - wLast;
            const ratio = wLast > 0 ? (diff / wLast) * 100 : (wCurr < 0 ? -100 : 0);
            list.push({
                code: group.code,
                name: group.name,
                category: 'factory',
                categoryLabel: 'تولیدی کارخانه',
                lastYearWeight: wLast,
                currentWeight: wCurr,
                diffWeight: diff,
                ratio,
                isNegative: diff < 0 || wCurr < 0
            });
        });

        // Add Raw Materials & Imports
        alignedImported.forEach(group => {
            const wLast = getItemValue(group.code, true, 'weight', true);
            const wCurr = getItemValue(group.code, false, 'weight', true);
            const diff = wCurr - wLast;
            const ratio = wLast > 0 ? (diff / wLast) * 100 : (wCurr < 0 ? -100 : 0);
            list.push({
                code: group.code,
                name: group.name,
                category: 'raw',
                categoryLabel: 'مواد اولیه / وارداتی',
                lastYearWeight: wLast,
                currentWeight: wCurr,
                diffWeight: diff,
                ratio,
                isNegative: diff < 0 || wCurr < 0
            });
        });

        // Add Goods In Customs (بارهای در گمرک)
        visibleGoodsInCustoms.forEach((item, idx) => {
            const wCurr = parseFloat(String(item.weight || 0)) || 0;
            const wLast = 0; // Current pipeline cargo
            const diff = wCurr - wLast;
            const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
            list.push({
                code: item.proforma ? `CUST-${item.proforma}` : `CUST-${idx + 1}`,
                name: `${item.cargoType || 'بار در گمرک'}${item.statusBadge ? ` [${item.statusBadge}]` : ''}${item.proforma ? ` (${item.proforma})` : ''}`,
                category: 'customs',
                categoryLabel: 'بارهای در گمرک',
                lastYearWeight: wLast,
                currentWeight: wCurr,
                diffWeight: diff,
                ratio,
                isNegative: diff < 0 || wCurr < 0
            });
        });

        // Add Purchasing & In-Transit Goods (بارهای در حال خرید و در راه)
        visiblePurchasingGoods.forEach((item, idx) => {
            const wCurr = parseFloat(String(item.weight || 0)) || 0;
            const wLast = 0; // Current pipeline cargo
            const diff = wCurr - wLast;
            const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
            list.push({
                code: item.proforma ? `PUR-${item.proforma}` : `PUR-${idx + 1}`,
                name: `${item.cargoType || 'بار در حال خرید و در راه'}${item.statusBadge ? ` [${item.statusBadge}]` : ''}${item.proforma ? ` (${item.proforma})` : ''}`,
                category: 'purchasing',
                categoryLabel: 'بارهای در حال خرید و در راه',
                lastYearWeight: wLast,
                currentWeight: wCurr,
                diffWeight: diff,
                ratio,
                isNegative: diff < 0 || wCurr < 0
            });
        });

        // Add Domestic & Petrochemical Bourse Purchases (خریدهای داخلی پتروشیمی و بورس کالا)
        visibleDomesticPurchases.forEach((item, idx) => {
            const wCurr = parseFloat(String(item.weight || 0)) || 0;
            const wLast = 0;
            const diff = wCurr - wLast;
            const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
            list.push({
                code: item.proforma ? `PETRO-${item.proforma}` : `PETRO-${idx + 1}`,
                name: `${item.cargoType || 'خرید پتروشیمی'}${item.petrochemicalName ? ` - ${item.petrochemicalName}` : ''}${item.statusBadge ? ` [${item.statusBadge}]` : ''}`,
                category: 'domestic',
                categoryLabel: 'خریدهای داخلی پتروشیمی و بورس',
                lastYearWeight: wLast,
                currentWeight: wCurr,
                diffWeight: diff,
                ratio,
                isNegative: diff < 0 || wCurr < 0
            });
        });

        // Add Commercial Warehouse Goods (کالای تجاری / متفرقه)
        visibleCommercialGoods.forEach((item, idx) => {
            const wCurr = parseFloat(String(item.weight || 0)) || 0;
            const wLast = 0;
            const diff = wCurr - wLast;
            const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
            list.push({
                code: `COM-${idx + 1}`,
                name: `${item.itemName || 'کالای تجاری'}${item.category ? ` (${item.category})` : ''}`,
                category: 'commercial',
                categoryLabel: 'کالای تجاری / متفرقه',
                lastYearWeight: wLast,
                currentWeight: wCurr,
                diffWeight: diff,
                ratio,
                isNegative: diff < 0 || wCurr < 0
            });
        });

        return list;
    }, [alignedYarns, alignedImported, visibleGoodsInTransit, visibleGoodsInCustoms, visiblePurchasingGoods, visibleDomesticPurchases, visibleCommercialGoods, lastYearOverrides, currentOverrides, sayanLastYear, sayanCurrent]);

    // Negative Items (کالاهای منفی / دارای کاهش وزنی یا موجودی منفی)
    const negativeItems = useMemo(() => {
        return allComparedItems
            .filter(item => item.isNegative)
            .sort((a, b) => a.diffWeight - b.diffWeight); // sorted by largest negative deficit first
    }, [allComparedItems]);

    // Growth Items (کالاهای دارای رشد وزنی مثبت)
    const growthItems = useMemo(() => {
        return allComparedItems
            .filter(item => !item.isNegative && item.diffWeight > 0)
            .sort((a, b) => b.diffWeight - a.diffWeight); // sorted by highest positive growth first
    }, [allComparedItems]);

    // Filtered variance items for table display
    const filteredVarianceItems = useMemo(() => {
        if (varianceFilter === 'negative') return allComparedItems.filter(item => item.isNegative);
        if (varianceFilter === 'positive') return allComparedItems.filter(item => !item.isNegative);
        return allComparedItems;
    }, [allComparedItems, varianceFilter]);

    // Structured Dataset Extractor for PDF and Bot Dispatch
    const getExportDataset = () => {
        const yarnItems = filteredYarns.map(g => ({
            code: g.code,
            name: g.name,
            lastYearCartons: getItemValue(g.code, true, 'cartons', true),
            lastYearWeight: getItemValue(g.code, true, 'weight', true),
            lastYearContainers: getItemValue(g.code, true, 'containers', true),
            lastYearDollars: getItemValue(g.code, true, 'dollars', true),
            currentCartons: getItemValue(g.code, false, 'cartons', true),
            currentWeight: getItemValue(g.code, false, 'weight', true),
            currentContainers: getItemValue(g.code, false, 'containers', true),
            currentDollars: getItemValue(g.code, false, 'dollars', true)
        }));

        const rawItems = filteredImported.map(g => ({
            code: g.code,
            name: g.name,
            category: getItemCategory(g.code),
            proforma: getItemValue(g.code, false, 'proforma', true) || getItemValue(g.code, true, 'proforma', true),
            lastYearCartons: getItemValue(g.code, true, 'cartons', true),
            lastYearWeight: getItemValue(g.code, true, 'weight', true),
            lastYearContainers: getItemValue(g.code, true, 'containers', true),
            lastYearDollars: getItemValue(g.code, true, 'dollars', true),
            currentCartons: getItemValue(g.code, false, 'cartons', true),
            currentWeight: getItemValue(g.code, false, 'weight', true),
            currentContainers: getItemValue(g.code, false, 'containers', true),
            currentDollars: getItemValue(g.code, false, 'dollars', true)
        }));

        const logisticsItems = [
            ...visibleGoodsInCustoms.map(r => ({
                ...r,
                name: r.cargoType,
                containers: r.container,
                proforma: r.proforma || '',
                registrationNumber: r.registrationNumber || '',
                currentValue: r.weight ? `${r.weight.toLocaleString('fa-IR')} kg` : `${r.dollars.toLocaleString('fa-IR')} $`,
                currency: r.dollars > 0 ? 'USD' : 'IRR',
                category: 'customs',
                categoryLabel: 'بارهای در گمرک',
                status: r.statusBadge || 'در گمرک'
            })),
            ...visiblePurchasingGoods.map(r => ({
                ...r,
                name: r.cargoType,
                containers: r.container,
                proforma: r.proforma || '',
                registrationNumber: r.registrationNumber || '',
                currentValue: r.weight ? `${r.weight.toLocaleString('fa-IR')} kg` : `${r.dollars.toLocaleString('fa-IR')} $`,
                currency: r.dollars > 0 ? 'USD' : 'IRR',
                category: 'purchasing',
                categoryLabel: 'بارهای در حال خرید و در راه',
                status: r.statusBadge || 'در حال خرید / در راه'
            })),
            ...visibleDomesticPurchases.map(r => ({
                ...r,
                name: `${r.cargoType}${r.petrochemicalName ? ` (${r.petrochemicalName})` : ''}`,
                containers: r.container,
                proforma: r.proforma || '',
                registrationNumber: r.registrationNumber || '',
                currentValue: r.weight ? `${r.weight.toLocaleString('fa-IR')} kg` : `${(r.rialAmount || 0).toLocaleString('fa-IR')} ریال`,
                currency: 'IRR',
                category: 'domestic',
                categoryLabel: 'خریدهای داخلی پتروشیمی و بورس',
                status: r.statusBadge || 'خرید پتروشیمی'
            })),
            ...visibleCommercialGoods.map(r => ({
                ...r,
                name: r.itemName,
                containers: r.container,
                proforma: r.proforma || '',
                registrationNumber: r.registrationNumber || '',
                currentValue: r.weight ? `${r.weight.toLocaleString('fa-IR')} kg` : `${r.dollars.toLocaleString('fa-IR')} $`,
                currency: r.dollars > 0 ? 'USD' : 'IRR',
                category: 'commercial',
                categoryLabel: 'کالای تجاری / متفرقه',
                status: 'انبار تجاری'
            }))
        ];

        const summary = {
            reportDate,
            report1Label,
            report2Label,
            signature,
            lastYearYarnsWeight: totalLastYearYarnsWeight,
            currentYarnsWeight: totalCurrentYarnsWeight,
            yarnsDiffWeight: diffYarnsWeight,
            yarnsRatio: ratioYarnsWeight,
            lastYearRawWeight: totalLastYearRawWeight,
            currentRawWeight: totalCurrentRawWeight,
            rawDiffWeight: diffRawWeight,
            rawRatio: ratioRawWeight,
            lastYearTotalWeight: totalLastYearAllWeight,
            currentTotalWeight: totalCurrentAllWeight,
            totalDiffWeight: diffAllWeight,
            totalRatio: ratioAllWeight,
            containersTotal: totalCurrentContainers,
            dollarsTotal: totalCurrentDollars
        };

        return {
            summary,
            yarnItems,
            rawItems,
            logisticsItems,
            growthItems,
            negativeItems,
            signature
        };
    };

    // Synchronize current live data to global window object and server meta
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const dataset = getExportDataset();
                (window as any).__WAREHOUSE_OVERVIEW_LIVE_DATA__ = dataset;
                (window as any).__SAYAN_LIVE_DATA__ = {
                    ...dataset,
                    lastUpdated: new Date().toISOString()
                };

                const metaUpdate = {
                    reportDate,
                    signature,
                    report1Label,
                    report1Jalali,
                    report1Miladi,
                    report2Label,
                    report2Jalali,
                    report2Miladi,
                    cumulativeFromLastYear,
                    allowedCompanies,
                    totalCurrentAllWeight,
                    diffAllWeight,
                    ratioAllWeight,
                    totalCurrentYarnsWeight,
                    totalLastYearYarnsWeight,
                    totalCurrentRawWeight,
                    totalLastYearRawWeight,
                    totalNegativeWeight: negativeItems.reduce((sum, item) => sum + item.diffWeight, 0),
                    totalPositiveWeight: growthItems.reduce((sum, item) => sum + item.diffWeight, 0),
                    excludedRegistrationNumbers
                };

                // Dispatch global event immediately so Dashboard widgets update in real-time
                window.dispatchEvent(new CustomEvent('warehouse_overview_updated', {
                    detail: {
                        meta: metaUpdate,
                        excludedRegistrationNumbers
                    }
                }));

                // Sync live computed meta to server if real weights exist
                if (totalCurrentAllWeight > 0 || totalLastYearAllWeight > 0) {
                    fetch('/api/warehouse-overview/data')
                        .then(r => r.json())
                        .then(currentDb => {
                            const updatedPayload = {
                                ...(currentDb || {}),
                                excludedRegistrationNumbers,
                                meta: {
                                    ...(currentDb?.meta || {}),
                                    ...metaUpdate
                                }
                            };
                            fetch('/api/warehouse-overview/data', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(updatedPayload)
                            }).catch(() => {});
                        })
                        .catch(() => {});
                }
            } catch (e) {
                console.warn("Could not sync live dataset to window or server:", e);
            }
        }
    }, [filteredYarns, filteredImported, visibleGoodsInTransit, visibleGoodsInCustoms, visiblePurchasingGoods, visibleDomesticPurchases, visibleCommercialGoods, growthItems, negativeItems, reportDate, totalCurrentAllWeight, totalLastYearAllWeight, diffAllWeight, excludedRegistrationNumbers]);

    // Direct Browser Print function (100% reliable, opens native print/PDF dialog)
    const handlePrintReport = (scope: 'both' | 'overview_only' | 'variance_only' = 'both') => {
        setPdfScopeMenuOpen(false);
        try {
            const data = getExportDataset();
            const html = buildWarehouseOverviewPrintHtml(data, scope);

            // Create dedicated invisible iframe for isolated printing
            const printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0px';
            printFrame.style.height = '0px';
            printFrame.style.border = '0';
            document.body.appendChild(printFrame);

            const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
            if (!frameDoc) {
                throw new Error('امکان دسترسی به پنجره چاپ مرورگر وجود ندارد');
            }

            frameDoc.open();
            frameDoc.write(html);
            frameDoc.close();

            setTimeout(() => {
                try {
                    if (printFrame.contentWindow) {
                        printFrame.contentWindow.focus();
                        printFrame.contentWindow.print();
                    }
                } catch (printErr: any) {
                    console.error('Frame print failed, opening print window:', printErr);
                    const win = window.open('', '_blank');
                    if (win) {
                        win.document.write(html);
                        win.document.close();
                        win.focus();
                        win.print();
                    }
                } finally {
                    setTimeout(() => {
                        if (document.body.contains(printFrame)) {
                            document.body.removeChild(printFrame);
                        }
                    }, 4000);
                }
            }, 600);
        } catch (err: any) {
            console.error('Print generation error:', err);
            alert('خطا در آماده‌سازی پیش‌نمایش چاپ: ' + (err.message || ''));
        }
    };

    // PDF Download function (Server-side with direct browser PDF/Print fallback)
    const handleDownloadPdf = async (scope: 'both' | 'overview_only' | 'variance_only' = 'both') => {
        setIsDownloadingPdf(true);
        setPdfScopeMenuOpen(false);
        try {
            const data = getExportDataset();
            const payload = {
                ...data,
                mode: scope
            };

            const res = await fetch('/api/warehouse-overview/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `پاسخ ناموفق سرور (${res.status})`);
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const scopeSuffix = scope === 'both' ? 'Full_2Pages' : (scope === 'overview_only' ? 'Page1_Overview' : 'Page2_Variance');
            a.download = `Warehouse_Overview_${reportDate.replace(/[\/\\]/g, '-')}_${scopeSuffix}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            console.warn("Server PDF error, opening browser print/save:", err);
            const userChoice = confirm(
                `دریافت فایل PDF از سرور با خطا مواجه شد:\n(${err.message || 'پاسخ ناموفق'})\n\nآیا مایلید پنجره چاپ و ذخیره مستقیم PDF مرورگر برای شما باز شود؟`
            );
            if (userChoice) {
                handlePrintReport(scope);
            }
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    // Excel Export function (Instant, multi-sheet, fully formatted with RTL)
    const handleExportExcel = (scope: WarehouseExcelScope = 'all') => {
        setIsExportingExcel(true);
        setExcelMenuOpen(false);
        try {
            const rawExport = getExportDataset();
            const dataset = {
                summary: {
                    ...rawExport.summary,
                    report1Jalali,
                    report2Jalali,
                    totalLastYearContainers,
                    diffContainers,
                    totalLastYearDollars,
                    diffDollars
                },
                yarnItems: rawExport.yarnItems,
                rawItems: rawExport.rawItems,
                purchasingGoods: visiblePurchasingGoods,
                domesticPurchases: visibleDomesticPurchases,
                goodsInCustoms: visibleGoodsInCustoms,
                commercialGoods,
                growthItems,
                negativeItems,
                allComparedItems,
                getGroupChildItems
            };

            exportWarehouseOverviewToExcel(dataset, scope);
        } catch (err: any) {
            console.error("Failed to export Excel:", err);
            alert("خطا در ایجاد خروجی اکسل: " + (err.message || ""));
        } finally {
            setIsExportingExcel(false);
        }
    };

    // Bot dispatch function
    const handleSendNegativeAlert = async () => {
        setIsSendingBot(true);
        setBotSendSuccessMessage(null);
        setBotSendErrorMessage(null);
        try {
            let targetGroup = null;
            if (botDestinationType === 'custom' && customTargetId.trim()) {
                targetGroup = customTargetId.trim();
            }

            const data = getExportDataset();
            const payload = {
                ...data,
                mode: botReportScope,
                sendFormat: botSendFormat,
                notifyInApp: botNotifyInApp,
                targetGroup,
                platforms: selectedPlatforms
            };

            const res = await fetch('/api/warehouse-overview/send-negative-alert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const respData = await res.json();
            if (res.ok && respData.success) {
                const scopeLabel = botReportScope === 'both' ? 'جامع ۲ صفحه‌ای' : (botReportScope === 'overview_only' ? 'صفحه ۱ (جداول کل)' : 'صفحه ۲ (تحلیل روند و کسری)');
                const formatLabel = botSendFormat === 'pdf_and_caption' ? 'PDF رسمی + خلاصه متنی' : (botSendFormat === 'pdf_only' ? 'فایل PDF' : 'پیام متنی');
                setBotSendSuccessMessage(`✅ گزارش (${scopeLabel} با فرمت ${formatLabel}) با موفقیت به ${respData.sentCount || 1} گروه ارسال شد${botNotifyInApp ? ' و نوتیفیکیشن هشدار به مدیرعامل مخابره گردید.' : '.'}`);
            } else {
                setBotSendErrorMessage(respData.error || 'خطا در ارسال گزارش به ربات');
            }
        } catch (err: any) {
            setBotSendErrorMessage(err.message || 'خطا در برقراری ارتباط با سرور');
        } finally {
            setIsSendingBot(false);
        }
    };

    // Helper to render editable/static cell
    const renderCell = (itemName: string, isLastYear: boolean, field: 'proforma' | 'cartons' | 'weight' | 'containers' | 'dollars', format = 'number', isGroup = false) => {
        const val = getItemValue(itemName, isLastYear, field, isGroup);
        if (isEditMode) {
            return (
                <input 
                    type={format === 'number' ? 'number' : 'text'}
                    value={val}
                    onChange={(e) => handleCellChange(itemName, isLastYear, field, e.target.value)}
                    className="w-full text-center py-1 px-1 bg-blue-50 border border-blue-200 rounded text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none font-semibold"
                />
            );
        }

        if (format === 'dollar') {
            return val !== 0 ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '-';
        }
        if (format === 'number') {
            return val !== 0 ? val.toLocaleString('fa-IR', { maximumFractionDigits: 3 }) : '-';
        }
        return val || '-';
    };

    // CRUD custom tables helpers
    const addCustomRow = (type: 'transit' | 'customs' | 'purchase' | 'domestic') => {
        const newRow: CustomCargoItem = {
            id: 'cargo_' + Date.now() + Math.random().toString(36).substr(2, 4),
            cargoType: type === 'domestic' ? 'پلی‌پروپیلن / چیپس نساجی' : 'نخ جدید',
            proforma: '',
            registrationNumber: '',
            weight: 0,
            cartons: 0,
            container: 0,
            dollars: 0,
            rialAmount: 0,
            petrochemicalName: type === 'domestic' ? 'پتروشیمی' : '',
            statusBadge: type === 'domestic' ? 'خرید بورس' : ''
        };
        if (type === 'transit' || type === 'purchase') {
            const next = [...purchasingGoods, newRow];
            setPurchasingGoods(next);
            basePurchaseRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
        if (type === 'customs') {
            const next = [...goodsInCustoms, newRow];
            setGoodsInCustoms(next);
            baseCustomsRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
        if (type === 'domestic') {
            const next = [...domesticPurchases, newRow];
            setDomesticPurchases(next);
            baseDomesticRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
    };

    const deleteCustomRow = (type: 'transit' | 'customs' | 'purchase' | 'domestic', id: string) => {
        if (type === 'transit' || type === 'purchase') {
            const next = purchasingGoods.filter(r => r.id !== id);
            setPurchasingGoods(next);
            basePurchaseRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
        if (type === 'customs') {
            const next = goodsInCustoms.filter(r => r.id !== id);
            setGoodsInCustoms(next);
            baseCustomsRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
        if (type === 'domestic') {
            const next = domesticPurchases.filter(r => r.id !== id);
            setDomesticPurchases(next);
            baseDomesticRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
    };

    const updateCustomCell = (type: 'transit' | 'customs' | 'purchase' | 'domestic', id: string, field: string, value: any) => {
        const list = type === 'customs' ? goodsInCustoms : (type === 'domestic' ? domesticPurchases : purchasingGoods);
        const stringFields = ['cargoType', 'proforma', 'registrationNumber', 'petrochemicalName', 'statusBadge', 'paymentMethod'];
        const next = list.map(r => r.id === id ? { ...r, [field]: stringFields.includes(field) ? value : parseFloat(value || '0') } : r);

        if (type === 'transit' || type === 'purchase') {
            setPurchasingGoods(next);
            basePurchaseRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
        if (type === 'customs') {
            setGoodsInCustoms(next);
            baseCustomsRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
        if (type === 'domestic') {
            setDomesticPurchases(next);
            baseDomesticRef.current = next.filter(r => !r.id.startsWith('com_'));
        }
    };

    // CRUD Commercial Warehouse Goods
    const addCommercialRow = () => {
        const newRow: CommercialGoodItem = {
            id: 'com_' + Date.now() + Math.random().toString(36).substr(2, 4),
            itemName: 'کالای تجاری جدید',
            category: 'منسوجات',
            cartons: 0,
            weight: 0,
            container: 0,
            dollars: 0
        };
        setCommercialGoods([...commercialGoods, newRow]);
    };

    const deleteCommercialRow = (id: string) => {
        setCommercialGoods(commercialGoods.filter(r => r.id !== id));
    };

    const updateCommercialCell = (id: string, field: string, value: any) => {
        setCommercialGoods(commercialGoods.map(r => r.id === id ? { ...r, [field]: field === 'itemName' || field === 'category' ? value : parseFloat(value || '0') } : r));
    };

    const renderTableBody = (isLastYear: boolean) => {
        return (
            <tbody className="divide-y divide-slate-100">
                {/* 1. MANUFACTURED GOODS */}
                <tr className="bg-slate-50 text-slate-700 font-extrabold text-right">
                    <td colSpan={7} className="py-2.5 px-3 text-[11px] text-blue-900 bg-blue-50/80 border-y border-blue-100/60 font-bold">
                        ۱. کالاهای تولیدی (ادغام شده در سطح گروه کالا)
                    </td>
                </tr>
                {filteredYarns.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="py-4 text-center text-slate-400">موردی یافت نشد.</td>
                    </tr>
                ) : (
                    filteredYarns.map((group, idx) => {
                        const isExpanded = !!expandedGroups[group.code];
                        const childItems = getGroupChildItems(group.code);

                        return (
                            <React.Fragment key={`group-yarn-${isLastYear ? 'ly' : 'curr'}-${group.code}`}>
                                <tr className="hover:bg-slate-50 text-slate-700 border-b border-slate-100 transition-colors">
                                    <td 
                                        className="py-2.5 px-3 text-right font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors select-none"
                                        onClick={() => toggleGroup(group.code)}
                                    >
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 transition-colors">
                                            {isExpanded ? (
                                                <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                                            ) : (
                                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            )}
                                        </span>
                                        <span className="font-mono text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold mr-1">{group.code}</span>
                                        <span className="font-bold text-slate-900">{group.name}</span>
                                        <span className="text-[10px] text-slate-400 font-normal mr-1">({childItems.length} کالا)</span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleExcludeRegistration(group.code, group.name);
                                            }}
                                            className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer mr-auto"
                                            title="حذف/مخفی‌سازی این گروه کالا از گزارش و تراز وزنی"
                                        >
                                            <EyeOff className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                    <td className="py-2 px-1">
                                        {isEditMode ? (
                                            <select
                                                value={getItemCategory(group.code)}
                                                onChange={(e) => handleCategoryChange(group.code, e.target.value as any)}
                                                className="text-[10px] p-1 border rounded bg-white text-slate-700 focus:outline-none"
                                            >
                                                <option value="raw">تولیدی (نمایش)</option>
                                                <option value="other">پنهان کردن</option>
                                            </select>
                                        ) : (
                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">تولیدی</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-2">{renderCell(group.code, isLastYear, 'proforma', 'text', true)}</td>
                                    <td className="py-2 px-2 font-mono font-medium">{renderCell(group.code, isLastYear, 'cartons', 'number', true)}</td>
                                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{renderCell(group.code, isLastYear, 'weight', 'number', true)}</td>
                                    <td className="py-2 px-2 font-mono font-medium">{renderCell(group.code, isLastYear, 'containers', 'number', true)}</td>
                                    <td className="py-2 px-2 font-mono font-bold text-emerald-600">{renderCell(group.code, isLastYear, 'dollars', 'dollar', true)}</td>
                                </tr>
                                
                                {isExpanded && childItems.map((child, cIdx) => (
                                    <tr 
                                        key={`child-yarn-${isLastYear ? 'ly' : 'curr'}-${group.code}-${child.itemCode}`} 
                                        className="bg-slate-50/40 hover:bg-slate-100/60 transition-colors text-slate-600 text-[11px] border-b border-dashed border-slate-100/80"
                                    >
                                        <td className="py-2 px-3 pr-8 text-right font-normal text-slate-700 flex items-center gap-1.5">
                                            <span className="text-slate-300 font-bold select-none">↳</span>
                                            <span className="font-mono text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded mr-1 select-all">{child.itemCode}</span>
                                            <span className="font-semibold text-slate-800">{child.itemName}</span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleExcludeRegistration(child.itemCode, child.itemName);
                                                }}
                                                className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer mr-auto"
                                                title="حذف/مخفی‌سازی این کالا از گزارش و تراز وزنی"
                                            >
                                                <EyeOff className="w-3 h-3" />
                                            </button>
                                        </td>
                                        <td className="py-2 px-1">
                                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold select-none">کالا</span>
                                        </td>
                                        <td className="py-2 px-2 font-mono text-slate-500">{renderCell(child.itemCode, isLastYear, 'proforma', 'text', false)}</td>
                                        <td className="py-2 px-2 font-mono text-slate-500">{renderCell(child.itemCode, isLastYear, 'cartons', 'number', false)}</td>
                                        <td className="py-2 px-2 font-mono font-semibold text-slate-700">{renderCell(child.itemCode, isLastYear, 'weight', 'number', false)}</td>
                                        <td className="py-2 px-2 font-mono text-slate-500">{renderCell(child.itemCode, isLastYear, 'containers', 'number', false)}</td>
                                        <td className="py-2 px-2 font-mono font-semibold text-slate-600">{renderCell(child.itemCode, isLastYear, 'dollars', 'dollar', false)}</td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        );
                    })
                )}

                {/* 2. IMPORTED & RAW MATERIALS */}
                <tr className="bg-slate-50 text-slate-700 font-extrabold text-right">
                    <td colSpan={7} className="py-2.5 px-3 text-[11px] text-teal-900 bg-teal-50/80 border-y border-teal-100/60 font-bold">
                        ۲. مواد اولیه وارداتی و کمکی (تفکیک شده بر اساس گروه کالا)
                    </td>
                </tr>
                {filteredImported.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="py-4 text-center text-slate-400">موردی یافت نشد.</td>
                    </tr>
                ) : (
                    filteredImported.map((group, idx) => {
                        const isExpanded = !!expandedGroups[group.code];
                        const childItems = getGroupChildItems(group.code);

                        return (
                            <React.Fragment key={`group-imp-${isLastYear ? 'ly' : 'curr'}-${group.code}`}>
                                <tr className="hover:bg-slate-50 text-slate-700 border-b border-slate-100 transition-colors">
                                    <td 
                                        className="py-2.5 px-3 text-right font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer hover:text-teal-600 transition-colors select-none"
                                        onClick={() => toggleGroup(group.code)}
                                    >
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 transition-colors">
                                            {isExpanded ? (
                                                <ChevronDown className="w-3.5 h-3.5 text-teal-600" />
                                            ) : (
                                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            )}
                                        </span>
                                        <span className="font-mono text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded font-bold mr-1">{group.code}</span>
                                        <span className="font-bold text-slate-900">{group.name}</span>
                                        <span className="text-[10px] text-slate-400 font-normal mr-1">({childItems.length} کالا)</span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleExcludeRegistration(group.code, group.name);
                                            }}
                                            className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer mr-auto"
                                            title="حذف/مخفی‌سازی این گروه کالا از گزارش و تراز وزنی"
                                        >
                                            <EyeOff className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                    <td className="py-2 px-1">
                                        {isEditMode ? (
                                            <select
                                                value={getItemCategory(group.code)}
                                                onChange={(e) => handleCategoryChange(group.code, e.target.value as any)}
                                                className="text-[10px] p-1 border rounded bg-white text-slate-700 focus:outline-none"
                                            >
                                                <option value="raw">وارداتی (نمایش)</option>
                                                <option value="other">پنهان کردن</option>
                                            </select>
                                        ) : (
                                            <span className="text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded font-bold">وارداتی</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-2">{renderCell(group.code, isLastYear, 'proforma', 'text', true)}</td>
                                    <td className="py-2 px-2 font-mono font-medium">{renderCell(group.code, isLastYear, 'cartons', 'number', true)}</td>
                                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{renderCell(group.code, isLastYear, 'weight', 'number', true)}</td>
                                    <td className="py-2 px-2 font-mono font-medium">{renderCell(group.code, isLastYear, 'containers', 'number', true)}</td>
                                    <td className="py-2 px-2 font-mono font-bold text-emerald-600">{renderCell(group.code, isLastYear, 'dollars', 'dollar', true)}</td>
                                </tr>
                                
                                {isExpanded && childItems.map((child, cIdx) => (
                                    <tr 
                                        key={`child-imp-${isLastYear ? 'ly' : 'curr'}-${group.code}-${child.itemCode}`} 
                                        className="bg-slate-50/40 hover:bg-slate-100/60 transition-colors text-slate-600 text-[11px] border-b border-dashed border-slate-100/80"
                                    >
                                        <td className="py-2 px-3 pr-8 text-right font-normal text-slate-700 flex items-center gap-1.5">
                                            <span className="text-slate-300 font-bold select-none">↳</span>
                                            <span className="font-mono text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded mr-1 select-all">{child.itemCode}</span>
                                            <span className="font-semibold text-slate-800">{child.itemName}</span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleExcludeRegistration(child.itemCode, child.itemName);
                                                }}
                                                className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer mr-auto"
                                                title="حذف/مخفی‌سازی این کالا از گزارش و تراز وزنی"
                                            >
                                                <EyeOff className="w-3 h-3" />
                                            </button>
                                        </td>
                                        <td className="py-2 px-1">
                                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold select-none">کالا</span>
                                        </td>
                                        <td className="py-2 px-2 font-mono text-slate-500">{renderCell(child.itemCode, isLastYear, 'proforma', 'text', false)}</td>
                                        <td className="py-2 px-2 font-mono text-slate-500">{renderCell(child.itemCode, isLastYear, 'cartons', 'number', false)}</td>
                                        <td className="py-2 px-2 font-mono font-semibold text-slate-700">{renderCell(child.itemCode, isLastYear, 'weight', 'number', false)}</td>
                                        <td className="py-2 px-2 font-mono text-slate-500">{renderCell(child.itemCode, isLastYear, 'containers', 'number', false)}</td>
                                        <td className="py-2 px-2 font-mono font-semibold text-slate-600">{renderCell(child.itemCode, isLastYear, 'dollars', 'dollar', false)}</td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        );
                    })
                )}
            </tbody>
        );
    };

    return (
        <div className="p-0 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-transparent sm:bg-slate-50 rounded-none sm:rounded-2xl select-text w-full max-w-full" dir="rtl">
            {/* Sticky Action & Navigation Bar */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md p-2 sm:p-4 rounded-none sm:rounded-2xl border-b sm:border border-slate-200/90 shadow-sm space-y-2 sm:space-y-3 transition-all">
                {/* Top Row: Title and Primary Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shadow-xs">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2 flex-wrap">
                                <span>سامانه نمای کلی موجودی و مغایرت سالانه انبار</span>
                                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">داشبورد هوشمند</span>
                                {isSayanLive ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span>سایان: استخراج زنده (Live)</span>
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                        <span>سایان: داده‌های معیار</span>
                                    </span>
                                )}
                            </h2>
                            <p className="text-[11px] text-slate-500 font-medium hidden sm:block">پایش همزمان موجودی‌های سایان، انبارهای تجاری، بارهای در راه و ترخیصی گمرک</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Order Registration Exclusion Manager Button */}
                        <button
                            type="button"
                            onClick={() => setIsExcludeManagerOpen(true)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer relative"
                            title="مدیریت و حذف/مخفی‌سازی ثبت‌سفارش‌های خاص از لیست و محاسبات گزارش"
                        >
                            <FilterX className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>حذف ثبت سفارش‌ها</span>
                            {excludedRegistrationNumbers.length > 0 && (
                                <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono font-extrabold mr-0.5 shadow-xs">
                                    {excludedRegistrationNumbers.length.toLocaleString('fa-IR')}
                                </span>
                            )}
                        </button>

                        {/* Direct 1-Click Excel Export Button */}
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); handleExportExcel('all'); }}
                            disabled={isExportingExcel}
                            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl px-4 py-2 text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-emerald-600/25 cursor-pointer"
                            title="دانلود مستقیم فایل اکسل رسمی و دقیقاً مشابه گزارش چاپی انبار"
                        >
                            {isExportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-white" />}
                            <span>خروجی اکسل (Excel)</span>
                            <Download className="w-3.5 h-3.5 text-emerald-200 mr-0.5" />
                        </button>

                        {/* Direct Print Button */}
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); handlePrintReport('both'); }}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-2 text-xs font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                            title="چاپ و پرینت مستقیم گزارش انبار با پنجره پرینت استاندارد مرورگر"
                        >
                            <Printer className="w-3.5 h-3.5 text-emerald-600" />
                            <span>چاپ گزارش</span>
                        </button>

                        {/* PDF & Print Dropdown */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPdfScopeMenuOpen(!pdfScopeMenuOpen); setExcelMenuOpen(false); }}
                                disabled={isDownloadingPdf}
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl px-3.5 py-2 text-xs font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                                title="دانلود فایل PDF رسمی گزارش انبار و تحلیل روندها"
                            >
                                {isDownloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 text-indigo-600" />}
                                <span>خروجی PDF و چاپ رسمی</span>
                                <ChevronDown className="w-3 h-3 text-indigo-500 mr-0.5" />
                            </button>

                            {pdfScopeMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setPdfScopeMenuOpen(false)} />
                                    <div className="absolute left-0 sm:left-0 sm:right-auto mt-1.5 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-3 space-y-2.5 text-right animate-fade-in" dir="rtl">
                                        <div className="text-[11px] font-black text-slate-600 px-1 py-1 border-b border-slate-100 flex items-center justify-between">
                                            <span>انتخاب محدوده گزارش، دریافت PDF یا پرینت:</span>
                                            <button type="button" onClick={() => setPdfScopeMenuOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                    
                                    {/* Option 1: Full 2 Pages */}
                                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-colors">
                                        <div className="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
                                            <span>📑 گزارش جامع ۲ صفحه‌ای (کل زنجیره + تحلیل)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadPdf('both')}
                                                className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <Download className="w-3 h-3" />
                                                <span>دانلود PDF</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handlePrintReport('both')}
                                                className="py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <Printer className="w-3 h-3" />
                                                <span>چاپ</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Option 2: Page 1 Only */}
                                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors">
                                        <div className="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
                                            <span>🏢 فقط صفحه ۱ (کل جداول زنجیره تامین)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadPdf('overview_only')}
                                                className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <Download className="w-3 h-3" />
                                                <span>دانلود PDF</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handlePrintReport('overview_only')}
                                                className="py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <Printer className="w-3 h-3" />
                                                <span>چاپ</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Option 3: Page 2 Only */}
                                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-amber-200 transition-colors">
                                        <div className="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
                                            <span>⚠️ فقط صفحه ۲ (تحلیل روند و کسری منفی)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadPdf('variance_only')}
                                                className="flex-1 py-1.5 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <Download className="w-3 h-3" />
                                                <span>دانلود PDF</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handlePrintReport('variance_only')}
                                                className="py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <Printer className="w-3 h-3" />
                                                <span>چاپ</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Direct Print All Quick Action */}
                                    <button
                                        type="button"
                                        onClick={() => handlePrintReport('both')}
                                        className="w-full text-center py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                                    >
                                        <Printer className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>🖨️ باز کردن پیش‌نمایش و چاپ مستقیم (مرورگر)</span>
                                    </button>
                                </div>
                            </>
                        )}
                        </div>

                        {/* AI Strategic Warehouse Advisor */}
                        <button
                            type="button"
                            onClick={() => setIsAiAdvisorOpen(true)}
                            className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-xl px-3.5 py-2 text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-indigo-500/20 cursor-pointer"
                            title="مشاور استراتژیک هوش مصنوعی انبار و زنجیره تامین"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                            <span>تحلیل هوشمند انبار (AI)</span>
                        </button>

                        {/* Bot Modal Trigger */}
                        {negativeItems.length > 0 ? (
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsBotModalOpen(true); }}
                                className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-3.5 py-2 text-xs font-black transition-all flex items-center gap-1.5 animate-pulse shadow-md shadow-red-500/20 cursor-pointer"
                                title="مشاهده اقلام منفی و ارسال گزارش هشدار به ربات"
                            >
                                <BellRing className="w-3.5 h-3.5 text-white animate-bounce" />
                                <span>🚨 ارسال هشدار کسری ({negativeItems.length.toLocaleString('fa-IR')} کالا)</span>
                                <Send className="w-3 h-3 text-white/90 mr-0.5" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsBotModalOpen(true); }}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-3.5 py-2 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                title="ارسال گزارش وضعیت کلی انبار به ربات"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>تراز وزنی مثبت (ارسال به بات)</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowSettings(!showSettings)}
                            className={`rounded-xl px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                                showSettings 
                                ? 'bg-blue-50 text-blue-800 border-blue-200' 
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <Settings className="w-3.5 h-3.5 text-slate-500" />
                            <span className="hidden sm:inline">تنظیمات دوره</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => loadSavedData(true)}
                            disabled={isLoading}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">بروزرسانی</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                                isEditMode 
                                ? 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-300' 
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>{isEditMode ? "لغو ویرایش" : "ویرایش دستی"}</span>
                        </button>

                        {isEditMode && (
                            <button
                                type="button"
                                onClick={() => handleSave(false)}
                                disabled={isSaving}
                                className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-2 text-xs font-black transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                            >
                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                <span>ذخیره</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Bottom Row: Quick Section Navigation Ribbon */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold border-t border-slate-100 pt-2 custom-scrollbar">
                    <span className="text-[10px] text-slate-400 font-black pl-1 whitespace-nowrap flex items-center gap-1">
                        <Navigation className="w-3 h-3 text-blue-500" />
                        <span>دسترسی سریع:</span>
                    </span>

                    <button
                        type="button"
                        onClick={() => scrollToSection('section-summary')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <Scale className="w-3 h-3 text-blue-600" />
                        <span>📊 خلاصه تراز کل</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToSection('section-sayan-tables')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <Package className="w-3 h-3 text-indigo-600" />
                        <span>🧵 تولیدات و مواد سایان</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToSection('section-commercial')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <Boxes className="w-3 h-3 text-emerald-600" />
                        <span>🏬 کالای تجاری</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToSection('section-customs')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <Layers className="w-3 h-3 text-sky-600" />
                        <span>🏢 ترخیصی گمرک</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToSection('section-purchasing')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <Layers className="w-3 h-3 text-indigo-600" />
                        <span>🚢🛒 در حال خرید و در راه</span>
                    </button>

                    {negativeItems.length > 0 && (
                        <button
                            type="button"
                            onClick={() => scrollToSection('section-negative-alert')}
                            className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer animate-pulse font-black"
                        >
                            <BellRing className="w-3 h-3 text-red-600" />
                            <span>🚨 هشدار کسری منفی ({negativeItems.length.toLocaleString('fa-IR')})</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => scrollToSection('section-variance-matrix')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <TrendingUp className="w-3 h-3 text-amber-600" />
                        <span>📈 ماتریس تحلیل روندها</span>
                    </button>
                </div>
            </div>

            {/* Excluded Items Active Alert Banner */}
            {excludedRegistrationNumbers.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>
                            تعداد <strong>{excludedRegistrationNumbers.length.toLocaleString('fa-IR')}</strong> ثبت‌سفارش/پرونده از این گزارش استثنا شده‌اند و از تمامی جداول، محاسبات تراز کل و خروجی اکسل/PDF حذف گردیده‌اند.
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsExcludeManagerOpen(true)}
                            className="bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-900 dark:text-amber-100 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer"
                        >
                            مدیریت لیست
                        </button>
                        <button
                            type="button"
                            onClick={clearAllExclusions}
                            className="text-amber-700 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 font-bold underline transition-all text-[11px] cursor-pointer"
                        >
                            بازیابی همه (نمایش مجدد)
                        </button>
                    </div>
                </div>
            )}

            {/* Dynamic Date & Period Settings Control (User Requested) */}
            {showSettings && (
                <div className="bg-white p-3 sm:p-6 rounded-none sm:rounded-2xl border-y sm:border-2 border-blue-100 shadow-sm sm:shadow-md space-y-4 sm:space-y-6 w-full max-w-5xl mx-auto animation-fade-in">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <Settings className="w-5 h-5 text-blue-600" />
                        <h4 className="font-extrabold text-slate-800 text-sm sm:text-base">تنظیمات پویای دوره‌های مالی و تاریخ استعلام سایان</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Period 1 Settings */}
                        <div className="p-4 bg-slate-50 rounded-xl space-y-4 border border-slate-100">
                            <h5 className="font-bold text-xs text-blue-900 border-b border-blue-100 pb-1.5">ستون گزارش ۱ (مثلاً سال گذشته)</h5>
                            
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[11px] text-slate-500 font-bold mb-1">برچسب ستون جدول</label>
                                    <input 
                                        type="text"
                                        value={report1Label}
                                        onChange={(e) => setReport1Label(e.target.value)}
                                        className="w-full text-xs font-bold p-2 bg-white border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="مانند: منتهی به سال ۱۴۰۳"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] text-slate-500 font-bold mb-1">تاریخ شمسی (نمایش)</label>
                                        <input 
                                            type="text"
                                            value={report1Jalali}
                                            onChange={(e) => setReport1Jalali(e.target.value)}
                                            className="w-full text-xs font-semibold p-2 bg-white border rounded text-center focus:outline-none"
                                            placeholder="۱۴۰۳/۱۲/۳۰"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] text-slate-500 font-bold mb-1">تاریخ میلادی (سایان)</label>
                                        <input 
                                            type="date"
                                            value={report1Miladi}
                                            onChange={(e) => setReport1Miladi(e.target.value)}
                                            className="w-full text-xs font-semibold p-2 bg-white border rounded text-center focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Period 2 Settings */}
                        <div className="p-4 bg-slate-50 rounded-xl space-y-4 border border-slate-100">
                            <h5 className="font-bold text-xs text-blue-900 border-b border-blue-100 pb-1.5">ستون گزارش ۲ (مثلاً سال جاری)</h5>
                            
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[11px] text-slate-500 font-bold mb-1">برچسب ستون جدول</label>
                                    <input 
                                        type="text"
                                        value={report2Label}
                                        onChange={(e) => setReport2Label(e.target.value)}
                                        className="w-full text-xs font-bold p-2 bg-white border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="مانند: وضعیت فعلی سال ۱۴۰۴"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] text-slate-500 font-bold mb-1">تاریخ شمسی (نمایش)</label>
                                        <input 
                                            type="text"
                                            value={report2Jalali}
                                            onChange={(e) => setReport2Jalali(e.target.value)}
                                            className="w-full text-xs font-semibold p-2 bg-white border rounded text-center focus:outline-none"
                                            placeholder="۱۴۰۴/۰۴/۱۷"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] text-slate-500 font-bold mb-1">تاریخ میلادی (سایان)</label>
                                        <input 
                                            type="date"
                                            value={report2Miladi}
                                            onChange={(e) => setReport2Miladi(e.target.value)}
                                            className="w-full text-xs font-semibold p-2 bg-white border rounded text-center focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cumulative balance option */}
                    <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100 flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <h5 className="font-extrabold text-xs text-blue-900">محاسبه مانده تجمعی سال قبل در ستون سال جاری (۱۴۰۵)</h5>
                            <p className="text-[10px] text-slate-500 font-medium">در صورت فعال بودن، مانده واقعی سال ۱۴۰۵ از ابتدای سال ۱۴۰۴ تا امروز محاسبه می‌شود (تضمین نمایش دقیق موجودی بر اساس تراکنش‌های تجمعی).</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={cumulativeFromLastYear} 
                                onChange={(e) => setCumulativeFromLastYear(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Warehouse Bot Groups Configuration */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Send className="w-4 h-4 text-blue-600" />
                                <h5 className="font-extrabold text-xs text-slate-800">تنظیم شناسه گروه‌های ربات انبار و زنجیره تامین</h5>
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium">جهت ارسال خودکار و دستی هشدارهای تراز منفی</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">شناسه گروه تلگرام (Telegram Group ID):</label>
                                <input
                                    type="text"
                                    value={warehouseTelegramGroupId}
                                    onChange={(e) => setWarehouseTelegramGroupId(e.target.value)}
                                    placeholder="مثال: -100123456789 یا @warehouse_group"
                                    className="w-full text-xs font-mono p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    dir="ltr"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">شناسه گروه بله (Bale Group ID):</label>
                                <input
                                    type="text"
                                    value={warehouseBaleGroupId}
                                    onChange={(e) => setWarehouseBaleGroupId(e.target.value)}
                                    placeholder="مثال: -123456789@g.bale.ai"
                                    className="w-full text-xs font-mono p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    dir="ltr"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">شناسه گروه واتساپ (WhatsApp Group ID):</label>
                                <input
                                    type="text"
                                    value={warehouseWhatsappGroupId}
                                    onChange={(e) => setWarehouseWhatsappGroupId(e.target.value)}
                                    placeholder="مثال: 12036302488888@g.us"
                                    className="w-full text-xs font-mono p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    dir="ltr"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Commercial Companies Filter Configuration */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-blue-600" />
                                <h5 className="font-extrabold text-xs text-slate-800">انتخاب شرکت‌های بخش بازرگانی (ارتباط با گزارش انبار)</h5>
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium">فقط پرونده‌های شرکت‌های انتخاب‌شده در محاسبات و گزارش انبار اعمال می‌شوند</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-1">
                            {availableCompanies.length === 0 ? (
                                <span className="text-xs text-slate-400">هیچ شرکتی در پرونده‌های بازرگانی یافت نشد.</span>
                            ) : (
                                availableCompanies.map(comp => {
                                    const isSelected = allowedCompanies.some(c => normalizeCompanyName(c) === normalizeCompanyName(comp));
                                    return (
                                        <button
                                            key={comp}
                                            type="button"
                                            onClick={() => {
                                                let newAllowed: string[];
                                                if (isSelected) {
                                                    newAllowed = allowedCompanies.filter(c => normalizeCompanyName(c) !== normalizeCompanyName(comp));
                                                } else {
                                                    newAllowed = [...allowedCompanies, comp];
                                                }
                                                setAllowedCompanies(newAllowed);
                                                applyCommercialFilterAndMerge(
                                                    rawTradeRecordsRef.current,
                                                    newAllowed,
                                                    baseTransitRef.current,
                                                    baseCustomsRef.current,
                                                    basePurchaseRef.current
                                                );
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                                isSelected 
                                                    ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400' 
                                                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            <span>{comp}</span>
                                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                            <span className="text-[11px] text-blue-700 font-bold">
                                {allowedCompanies.length === 0 ? 'وضعیت: اعمال تمام شرکت‌ها (بدون فیلتر)' : `شرکت‌های فعال: ${allowedCompanies.join(', ')}`}
                            </span>
                            {allowedCompanies.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAllowedCompanies([]);
                                        applyCommercialFilterAndMerge(
                                            rawTradeRecordsRef.current,
                                            [],
                                            baseTransitRef.current,
                                            baseCustomsRef.current,
                                            basePurchaseRef.current
                                        );
                                    }}
                                    className="text-xs text-red-600 hover:text-red-800 font-bold underline cursor-pointer"
                                >
                                    پاک کردن فیلتر (انتخاب همه)
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-4">
                        <button
                            type="button"
                            onClick={handleSyncWithActiveYear}
                            disabled={isLoading}
                            className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg px-4 py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        >
                            <RefreshCw className="w-3.5 h-3.5 animate-pulse" />
                            <span>همگام‌سازی هوشمند با سال مالی فعال سیستم</span>
                        </button>
                        
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowSettings(false)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-4 py-2 text-xs font-bold transition-all"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleApplySettingsAndFetch}
                                disabled={isLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                            >
                                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                <span>ثبت دائم و استعلام جدید از سایان</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Letter Header Box */}
            <div className="bg-white p-3.5 sm:p-6 rounded-none sm:rounded-2xl border-y sm:border border-slate-200 shadow-sm space-y-3 sm:space-y-4 w-full max-w-5xl mx-auto">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="text-xs font-bold text-slate-400">گزارش مدیریتی مقایسه‌ای وضعیت انبارها</div>
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-slate-500 font-bold">تاریخ گزارش:</span>
                        {isEditMode ? (
                            <input 
                                type="text"
                                value={reportDate}
                                onChange={(e) => setReportDate(e.target.value)}
                                className="w-24 text-center bg-transparent border-b border-blue-400 font-bold focus:outline-none"
                            />
                        ) : (
                            <span className="font-mono font-bold text-slate-800">{reportDate}</span>
                        )}
                    </div>
                </div>

                <div className="space-y-1">
                    <h3 className="font-extrabold text-slate-800 text-base">مدیریت محترم لیان بافت جناب آقای محمد امین فتوت احمدی</h3>
                    <p className="text-xs text-slate-500 font-medium">
                        با سلام، احتراما گزارش موجودی {report1Label} (مورخ {report1Jalali}) و مقایسه آن با {report2Label} (مورخ {report2Jalali}) مستخرج از سامانه یکپارچه سایان به همراه جزئیات بارهای در راه و گمرک به شرح ذیل تقدیم حضور می‌گردد:
                    </p>
                </div>
            </div>

            {/* TOP WEIGHT BALANCE & SUMMARY WIDGET (خلاصه تراز وزنی و عملکرد سالانه در بالای صفحه) */}
            <div id="section-summary" className="bg-white p-3.5 sm:p-6 rounded-none sm:rounded-2xl border-y sm:border border-slate-200 shadow-sm space-y-4 w-full max-w-5xl mx-auto scroll-mt-28">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                            <Scale className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="font-black text-slate-800 text-sm sm:text-base flex items-center gap-2">
                                <span>داشبورد تراز وزنی کل زنجیره تامین و انبارها</span>
                                {excludedRegistrationNumbers.length > 0 && (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                                        با احتساب {excludedRegistrationNumbers.length.toLocaleString('fa-IR')} مورد استثنا
                                    </span>
                                )}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-medium">پایش لحظه‌ای تراز وزنی سال جاری ({report2Label}) نسبت به سال گذشته ({report1Label})</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => scrollToSection('section-variance-matrix')}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 hover:underline"
                    >
                        <span>مشاهده ماتریس تفصیلی</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* 4 Comprehensive Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* 1. Factory Production Yarns Weight */}
                    <div className="p-3.5 bg-gradient-to-br from-blue-50/60 to-slate-50 rounded-xl border border-blue-100/80 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-blue-600" />
                                <span>نخ‌های تولیدی کارخانه</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isYarnsDownward ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isYarnsDownward ? '🔻 تراز منفی' : '📈 تراز مثبت'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>پارسال: {(totalLastYearYarnsWeight / 1000).toFixed(2)} تن</span>
                                <span>امسال: {(totalCurrentYarnsWeight / 1000).toFixed(2)} تن</span>
                            </div>
                            <div className="text-lg font-black text-slate-800 font-mono mt-0.5" dir="ltr">
                                {diffYarnsWeight >= 0 ? `+${(diffYarnsWeight / 1000).toFixed(2)}` : (diffYarnsWeight / 1000).toFixed(2)} <span className="text-xs font-normal text-slate-500">تن</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                            <span className="text-slate-500 font-medium text-[11px]">درصد تغییر:</span>
                            <span className={`font-mono font-bold flex items-center gap-0.5 text-xs ${ratioYarnsWeight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioYarnsWeight < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                {ratioYarnsWeight >= 0 ? `+${ratioYarnsWeight.toFixed(1)}%` : `${ratioYarnsWeight.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>

                    {/* 2. Raw & Imported Materials Weight */}
                    <div className="p-3.5 bg-gradient-to-br from-teal-50/60 to-slate-50 rounded-xl border border-teal-100/80 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                                <Boxes className="w-3.5 h-3.5 text-teal-600" />
                                <span>مواد اولیه و واردات</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isRawDownward ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isRawDownward ? '🔻 تراز منفی' : '📈 تراز مثبت'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>پارسال: {(totalLastYearRawWeight / 1000).toFixed(2)} تن</span>
                                <span>امسال: {(totalCurrentRawWeight / 1000).toFixed(2)} تن</span>
                            </div>
                            <div className="text-lg font-black text-slate-800 font-mono mt-0.5" dir="ltr">
                                {diffRawWeight >= 0 ? `+${(diffRawWeight / 1000).toFixed(2)}` : (diffRawWeight / 1000).toFixed(2)} <span className="text-xs font-normal text-slate-500">تن</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                            <span className="text-slate-500 font-medium text-[11px]">درصد تغییر:</span>
                            <span className={`font-mono font-bold flex items-center gap-0.5 text-xs ${ratioRawWeight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioRawWeight < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                {ratioRawWeight >= 0 ? `+${ratioRawWeight.toFixed(1)}%` : `${ratioRawWeight.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>

                    {/* 3. Total Enterprise Supply Chain Weight */}
                    <div className="p-3.5 bg-gradient-to-br from-indigo-50/60 to-slate-50 rounded-xl border border-indigo-100/80 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                <span>سرجمع کل وزن زنجیره</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isAllWeightDownward ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isAllWeightDownward ? '🔻 تراز منفی' : '📈 تراز مثبت'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>پارسال: {(totalLastYearAllWeight / 1000).toFixed(2)} تن</span>
                                <span>امسال: {(totalCurrentAllWeight / 1000).toFixed(2)} تن</span>
                            </div>
                            <div className="text-lg font-black text-slate-800 font-mono mt-0.5" dir="ltr">
                                {diffAllWeight >= 0 ? `+${(diffAllWeight / 1000).toFixed(2)}` : (diffAllWeight / 1000).toFixed(2)} <span className="text-xs font-normal text-slate-500">تن</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                            <span className="text-slate-500 font-medium text-[11px]">تغییر کل:</span>
                            <span className={`font-mono font-bold flex items-center gap-0.5 text-xs ${ratioAllWeight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioAllWeight < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                {ratioAllWeight >= 0 ? `+${ratioAllWeight.toFixed(1)}%` : `${ratioAllWeight.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>

                    {/* 4. Containers & Dollars Import Metrics */}
                    <div className="p-3.5 bg-gradient-to-br from-amber-50/60 to-slate-50 rounded-xl border border-amber-100/80 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                                <span>کانتینر و ارزش دلاری</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ratioContainers < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {ratioContainers < 0 ? '🔻 نزولی' : '📈 صعودی'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>کانتینر: {diffContainers > 0 ? `+${diffContainers.toFixed(1)}` : diffContainers.toFixed(1)}</span>
                                <span>ارزش: {diffDollars >= 0 ? `+$${(diffDollars / 1000).toFixed(0)}k` : `-$${(Math.abs(diffDollars) / 1000).toFixed(0)}k`}</span>
                            </div>
                            <div className="text-lg font-black text-slate-800 font-mono mt-0.5" dir="ltr">
                                {ratioContainers >= 0 ? `+${ratioContainers.toFixed(1)}%` : `${ratioContainers.toFixed(1)}%`}
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                            <span className="text-slate-500 font-medium text-[11px]">تغییر ارزی:</span>
                            <span className={`font-mono font-bold text-xs ${ratioDollars < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioDollars >= 0 ? `+${ratioDollars.toFixed(1)}%` : `${ratioDollars.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sayan Items Filters */}
            <div className="bg-white p-2.5 sm:p-4 rounded-none sm:rounded-xl border-y sm:border border-slate-200 w-full max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded">تعداد کل اقلام سایان: {(allActiveRawItems.length + allActiveFactoryItems.length).toLocaleString('fa-IR')} قلم</span>
                    <span className="px-2 py-1 bg-green-50 text-green-600 rounded">مواد اولیه: {allActiveRawItems.length.toLocaleString('fa-IR')} قلم</span>
                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded">در کارخانه: {allActiveFactoryItems.length.toLocaleString('fa-IR')} قلم</span>
                </div>
                <div className="w-full md:w-72">
                    <input 
                        type="text"
                        value={itemFilterText}
                        onChange={(e) => setItemFilterText(e.target.value)}
                        placeholder="جستجو در بین اقلام انبار سایان..."
                        className="w-full text-xs p-2 bg-slate-50 border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                </div>
            </div>

            {/* Main Grid: Sayan Items - Left (Report 1) vs Right (Report 2) comparison */}
            <div id="section-sayan-tables" className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-6 scroll-mt-28 w-full">
                
                {/* 1. REPORT 1 END OF FISCAL INVENTORY TABLE */}
                <div className="bg-white rounded-none sm:rounded-2xl border-y sm:border border-slate-200 overflow-hidden shadow-sm flex flex-col w-full">
                    <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse"></span>
                            <h4 className="font-extrabold text-sm sm:text-base">موجودی انبارها ({report1Label})</h4>
                        </div>
                        <span className="text-xs bg-slate-800 px-2.5 py-1 rounded text-slate-300 font-bold font-mono">{report1Jalali}</span>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full min-w-[600px] text-xs text-center border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <th className="py-3 px-2 text-right whitespace-nowrap">نوع کالا / نخ</th>
                                    <th className="py-3 px-2 whitespace-nowrap">دسته‌بندی</th>
                                    <th className="py-3 px-2 whitespace-nowrap">پروفرم</th>
                                    <th className="py-3 px-2 whitespace-nowrap">کارتن</th>
                                    <th className="py-3 px-2 font-bold text-slate-900 whitespace-nowrap">وزن (kg)</th>
                                    <th className="py-3 px-2 whitespace-nowrap">کانتینر</th>
                                    <th className="py-3 px-2 whitespace-nowrap">ارزش دلاری</th>
                                </tr>
                            </thead>
                            {renderTableBody(true)}
                            <tfoot>
                                <tr className="bg-slate-900 !text-white font-extrabold border-t-2 border-slate-700" style={{ backgroundColor: '#0f172a' }}>
                                    <td className="py-3 px-3 text-right font-extrabold !text-white" style={{ color: '#ffffff', fontWeight: 900 }} colSpan={3}>جمع کل انبارها (سایان)</td>
                                    <td className="py-3 px-2 font-mono text-center !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>
                                        {calculateTotalSayanSum(true, 'cartons').toLocaleString('fa-IR')}
                                    </td>
                                    <td className="py-3 px-2 font-mono text-center !text-amber-300 font-bold" style={{ color: '#fcd34d', fontWeight: 900 }}>
                                        {calculateTotalSayanSum(true, 'weight').toLocaleString('fa-IR')}
                                    </td>
                                    <td className="py-3 px-2 font-mono text-center !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>
                                        {calculateTotalSayanSum(true, 'containers').toLocaleString('fa-IR')}
                                    </td>
                                    <td className="py-3 px-2 font-mono text-center !text-emerald-300 font-bold" style={{ color: '#6ee7b7', fontWeight: 900 }}>
                                        ${calculateTotalSayanSum(true, 'dollars').toLocaleString('en-US')}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* 2. REPORT 2 CURRENT ACTIVE INVENTORY TABLE */}
                <div className="bg-white rounded-none sm:rounded-2xl border-y sm:border border-slate-200 overflow-hidden shadow-sm flex flex-col w-full">
                    <div className="p-4 bg-blue-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></span>
                            <h4 className="font-extrabold text-sm sm:text-base">موجودی انبارها ({report2Label})</h4>
                        </div>
                        <span className="text-xs bg-blue-800 px-2.5 py-1 rounded text-blue-200 font-bold font-mono">{report2Jalali}</span>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full min-w-[600px] text-xs text-center border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <th className="py-3 px-2 text-right whitespace-nowrap">نوع کالا / نخ</th>
                                    <th className="py-3 px-2 whitespace-nowrap">دسته‌بندی</th>
                                    <th className="py-3 px-2 whitespace-nowrap">پروفرم</th>
                                    <th className="py-3 px-2 whitespace-nowrap">کارتن</th>
                                    <th className="py-3 px-2 font-bold text-slate-900 whitespace-nowrap">وزن (kg)</th>
                                    <th className="py-3 px-2 whitespace-nowrap">کانتینر</th>
                                    <th className="py-3 px-2 whitespace-nowrap">ارزش دلاری</th>
                                </tr>
                            </thead>
                            {renderTableBody(false)}
                            <tfoot>
                                <tr className="bg-blue-950 !text-white font-extrabold border-t-2 border-blue-700" style={{ backgroundColor: '#172554' }}>
                                    <td className="py-3 px-3 text-right font-extrabold !text-white" style={{ color: '#ffffff', fontWeight: 900 }} colSpan={3}>جمع کل انبارها (سایان)</td>
                                    <td className="py-3 px-2 font-mono text-center !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>
                                        {calculateTotalSayanSum(false, 'cartons').toLocaleString('fa-IR')}
                                    </td>
                                    <td className="py-3 px-2 font-mono text-center !text-amber-300 font-bold" style={{ color: '#fcd34d', fontWeight: 900 }}>
                                        {calculateTotalSayanSum(false, 'weight').toLocaleString('fa-IR')}
                                    </td>
                                    <td className="py-3 px-2 font-mono text-center !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>
                                        {calculateTotalSayanSum(false, 'containers').toLocaleString('fa-IR')}
                                    </td>
                                    <td className="py-3 px-2 font-mono text-center !text-emerald-300 font-bold" style={{ color: '#6ee7b7', fontWeight: 900 }}>
                                        ${calculateTotalSayanSum(false, 'dollars').toLocaleString('en-US')}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

            </div>

            {/* 3. COMMERCIAL WAREHOUSE GOODS TABLE */}
            <div id="section-commercial" className="bg-white rounded-none sm:rounded-2xl border-y sm:border border-slate-200 overflow-hidden shadow-sm scroll-mt-28 w-full">
                <div className="p-4 bg-emerald-800 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm sm:text-base">کالای انبار تجاری (مخصوص سرمایه در گردش و بازرگانی)</h4>
                    </div>
                    {isEditMode && (
                        <button
                            onClick={addCommercialRow}
                            className="bg-emerald-700 hover:bg-emerald-600 text-white rounded px-3 py-1 text-xs font-bold transition-all flex items-center gap-1"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>افزودن کالای تجاری</span>
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-xs text-center border-collapse">
                        <thead>
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                <th className="py-3 px-3 text-right whitespace-nowrap">نام کالا</th>
                                <th className="py-3 px-2 whitespace-nowrap">دسته‌بندی</th>
                                <th className="py-3 px-2 whitespace-nowrap">تعداد کارتن</th>
                                <th className="py-3 px-2 whitespace-nowrap">وزن ناخالص/خالص (kg)</th>
                                <th className="py-3 px-2 whitespace-nowrap">کانتینر</th>
                                <th className="py-3 px-2 whitespace-nowrap">ارزش دلاری</th>
                                {isEditMode && <th className="py-3 px-2 whitespace-nowrap">عملیات</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visibleCommercialGoods.length === 0 ? (
                                <tr>
                                    <td colSpan={isEditMode ? 7 : 6} className="py-6 text-center text-slate-400 font-medium">هیچ کالایی در انبار تجاری ثبت نشده است.</td>
                                </tr>
                            ) : (
                                visibleCommercialGoods.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50 text-slate-700">
                                        <td className="py-2.5 px-3 text-right font-bold flex items-center justify-between gap-1.5">
                                            {isEditMode ? (
                                                <input 
                                                    type="text" 
                                                    value={item.itemName} 
                                                    onChange={(e) => updateCommercialCell(item.id, 'itemName', e.target.value)}
                                                    className="w-full py-1 px-2 border rounded border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                                                />
                                            ) : (
                                                <span>{item.itemName}</span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => toggleExcludeRegistration(item.itemName || item.id, item.itemName)}
                                                className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer shrink-0"
                                                title="حذف/مخفی‌سازی این قلم از گزارش و تراز وزنی"
                                            >
                                                <EyeOff className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                        <td className="py-2.5 px-2">
                                            {isEditMode ? (
                                                <input 
                                                    type="text" 
                                                    value={item.category} 
                                                    onChange={(e) => updateCommercialCell(item.id, 'category', e.target.value)}
                                                    className="w-full text-center py-1 px-2 border rounded border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                />
                                            ) : item.category}
                                        </td>
                                        <td className="py-2.5 px-2 font-mono">
                                            {isEditMode ? (
                                                <input 
                                                    type="number" 
                                                    value={item.cartons} 
                                                    onChange={(e) => updateCommercialCell(item.id, 'cartons', e.target.value)}
                                                    className="w-24 text-center py-1 px-2 border rounded border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                                />
                                            ) : item.cartons.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="py-2.5 px-2 font-mono">
                                            {isEditMode ? (
                                                <input 
                                                    type="number" 
                                                    value={item.weight} 
                                                    onChange={(e) => updateCommercialCell(item.id, 'weight', e.target.value)}
                                                    className="w-28 text-center py-1 px-2 border rounded border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                                />
                                            ) : item.weight.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="py-2.5 px-2 font-mono">
                                            {isEditMode ? (
                                                <input 
                                                    type="number" 
                                                    value={item.container} 
                                                    onChange={(e) => updateCommercialCell(item.id, 'container', e.target.value)}
                                                    className="w-20 text-center py-1 px-2 border rounded border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                                />
                                            ) : item.container.toLocaleString('fa-IR')}
                                        </td>
                                        <td className="py-2.5 px-2 font-mono font-bold text-emerald-600">
                                            {isEditMode ? (
                                                <input 
                                                    type="number" 
                                                    value={item.dollars} 
                                                    onChange={(e) => updateCommercialCell(item.id, 'dollars', e.target.value)}
                                                    className="w-28 text-center py-1 px-2 border rounded border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                                />
                                            ) : `$${item.dollars.toLocaleString('en-US')}`}
                                        </td>
                                        {isEditMode && (
                                            <td className="py-2.5 px-2">
                                                <button 
                                                    onClick={() => deleteCommercialRow(item.id)}
                                                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {visibleCommercialGoods.length > 0 && (
                            <tfoot>
                                <tr className="bg-emerald-950 !text-white font-extrabold border-t-2 border-emerald-700" style={{ backgroundColor: '#064e3b' }}>
                                    <td className="py-3 px-3 text-right !text-white font-bold" style={{ color: '#ffffff', fontWeight: 900 }} colSpan={2}>جمع کل انبار تجاری</td>
                                    <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleCommercialGoods, 'cartons').toLocaleString('fa-IR')}</td>
                                    <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleCommercialGoods, 'weight').toLocaleString('fa-IR')}</td>
                                    <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleCommercialGoods, 'container').toLocaleString('fa-IR')}</td>
                                    <td className="py-3 px-2 font-mono !text-emerald-300 font-bold" style={{ color: '#6ee7b7', fontWeight: 900 }}>${calculateCustomTableSum(visibleCommercialGoods, 'dollars').toLocaleString('en-US')}</td>
                                    {isEditMode && <td></td>}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* INTERACTIVE CARGO TABLES: Customs, and Merged Purchasing & In-Transit */}
            <div className="space-y-4 sm:space-y-6 w-full">
                
                {/* A. GOODS IN CUSTOMS (بارهای در گمرک - دارای اعلامیه ورود یا کوتاژ) */}
                <div id="section-customs" className="bg-white rounded-none sm:rounded-2xl border-y sm:border border-slate-200 overflow-hidden shadow-sm scroll-mt-28 w-full">
                    <div className="p-4 bg-sky-800 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm sm:text-base">بارهای در گمرک (دارای اعلامیه ورود یا کوتاژ)</h4>
                            <span className="text-[11px] bg-sky-700/80 px-2 py-0.5 rounded text-sky-100 hidden sm:inline">
                                شامل پرونده‌های دارای کوتاژ یا اعلامیه ورود / ترخیصیه
                            </span>
                        </div>
                        {isEditMode && (
                            <button
                                onClick={() => addCustomRow('customs')}
                                className="bg-sky-700 hover:bg-sky-600 text-white rounded px-3 py-1 text-xs font-bold transition-all flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>افزودن بار در گمرک</span>
                            </button>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-xs text-center border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <th className="py-3 px-3 text-right whitespace-nowrap">نوع بار</th>
                                    <th className="py-3 px-2 whitespace-nowrap">پروفرم / حواله</th>
                                    <th className="py-3 px-2 whitespace-nowrap">ثبت سفارش</th>
                                    <th className="py-3 px-2 whitespace-nowrap">وزن (kg)</th>
                                    <th className="py-3 px-2 whitespace-nowrap">تعداد کارتن</th>
                                    <th className="py-3 px-2 whitespace-nowrap">کانتینر</th>
                                    <th className="py-3 px-2 whitespace-nowrap">ارزش دلاری ($)</th>
                                    {isEditMode && <th className="py-3 px-2 whitespace-nowrap">عملیات</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleGoodsInCustoms.length === 0 ? (
                                    <tr>
                                        <td colSpan={isEditMode ? 8 : 7} className="py-6 text-center text-slate-400 font-medium">هیچ بار دارای کوتاژ یا اعلامیه ورود در گمرک ثبت نشده است.</td>
                                    </tr>
                                ) : (
                                    visibleGoodsInCustoms.map((item) => {
                                        const isCommercial = item.id.startsWith('com_');
                                        const cleanReg = item.registrationNumber || item.proforma || item.id;
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50 text-slate-700">
                                                <td className="py-2.5 px-3 text-right font-bold flex items-center gap-1.5 flex-wrap">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.cargoType} 
                                                            onChange={(e) => updateCustomCell('customs', item.id, 'cargoType', e.target.value)}
                                                            className="w-full py-1 px-2 border rounded border-slate-200 focus:outline-none"
                                                        />
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 flex-wrap">
                                                            {item.cargoType}
                                                            {item.statusBadge && (
                                                                <span className="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 text-[10px] px-1.5 py-0.5 rounded-md border border-sky-200 dark:border-sky-900 font-bold font-sans">
                                                                    {item.statusBadge}
                                                                </span>
                                                            )}
                                                            {isCommercial && !item.statusBadge && (
                                                                <span className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 text-[10px] px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-900 font-bold font-sans">
                                                                    سیستم بازرگانی
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.proforma} 
                                                            onChange={(e) => updateCustomCell('customs', item.id, 'proforma', e.target.value)}
                                                            className="w-full text-center py-1 px-2 border rounded border-slate-200 focus:outline-none"
                                                        />
                                                    ) : item.proforma || '-'}
                                                </td>
                                                <td className="py-2.5 px-2">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.registrationNumber || ''} 
                                                            onChange={(e) => updateCustomCell('customs', item.id, 'registrationNumber', e.target.value)}
                                                            className="w-full text-center py-1 px-2 border rounded border-slate-200 focus:outline-none"
                                                            placeholder="ثبت سفارش"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <span className="font-mono font-bold">{item.registrationNumber || '-'}</span>
                                                            {cleanReg && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExcludeRegistration(cleanReg, item.cargoType)}
                                                                    className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                                                                    title="حذف/مخفی‌سازی این ثبت سفارش از گزارش"
                                                                >
                                                                    <EyeOff className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.weight} 
                                                            onChange={(e) => updateCustomCell('customs', item.id, 'weight', e.target.value)}
                                                            className="w-28 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.weight.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.cartons} 
                                                            onChange={(e) => updateCustomCell('customs', item.id, 'cartons', e.target.value)}
                                                            className="w-24 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.cartons.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.container} 
                                                            onChange={(e) => updateCustomCell('customs', item.id, 'container', e.target.value)}
                                                            className="w-20 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.container.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono font-bold text-emerald-600">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.dollars} 
                                                            onChange={(e) => updateCustomCell('customs', item.id, 'dollars', e.target.value)}
                                                            className="w-28 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : `$${item.dollars.toLocaleString('en-US')}`}
                                                </td>
                                                {isEditMode && (
                                                    <td className="py-2.5 px-2">
                                                        {!isCommercial && (
                                                            <button 
                                                                onClick={() => deleteCustomRow('customs', item.id)}
                                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-all"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            {visibleGoodsInCustoms.length > 0 && (
                                <tfoot>
                                    <tr className="bg-sky-950 !text-white font-extrabold border-t-2 border-sky-700" style={{ backgroundColor: '#082f49' }}>
                                        <td className="py-3 px-3 text-right !text-white font-bold" style={{ color: '#ffffff', fontWeight: 900 }} colSpan={3}>جمع بارهای در گمرک</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleGoodsInCustoms, 'weight').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleGoodsInCustoms, 'cartons').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleGoodsInCustoms, 'container').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-emerald-300 font-bold" style={{ color: '#6ee7b7', fontWeight: 900 }}>${calculateCustomTableSum(visibleGoodsInCustoms, 'dollars').toLocaleString('en-US')}</td>
                                        {isEditMode && <td></td>}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Anchor for any old transit scroll link */}
                <div id="section-transit" className="scroll-mt-28" />

                {/* B. MERGED PURCHASING & IN-TRANSIT (بارهای در حال خرید و در راه - خرید ارز ثبت شده یا تخصیص یافته) */}
                <div id="section-purchasing" className="bg-white rounded-none sm:rounded-2xl border-y sm:border border-slate-200 overflow-hidden shadow-sm scroll-mt-28 w-full">
                    <div className="p-4 bg-indigo-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm sm:text-base">بارهای در حال خرید و در راه (تخصیص یافته یا دارای خرید ارز)</h4>
                            <span className="text-[11px] bg-indigo-800/80 px-2 py-0.5 rounded text-indigo-200 hidden sm:inline">
                                ادغام در حال خرید و در راه (فقط بارهای دارای خرید ارز یا تخصیص یافته)
                            </span>
                        </div>
                        {isEditMode && (
                            <button
                                onClick={() => addCustomRow('purchase')}
                                className="bg-indigo-700 hover:bg-indigo-600 text-white rounded px-3 py-1 text-xs font-bold transition-all flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>افزودن بار جدید</span>
                            </button>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-xs text-center border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <th className="py-3 px-3 text-right whitespace-nowrap">نوع بار</th>
                                    <th className="py-3 px-2 whitespace-nowrap">پروفرم / حواله</th>
                                    <th className="py-3 px-2 whitespace-nowrap">ثبت سفارش</th>
                                    <th className="py-3 px-2 whitespace-nowrap">وزن (kg)</th>
                                    <th className="py-3 px-2 whitespace-nowrap">تعداد کارتن</th>
                                    <th className="py-3 px-2 whitespace-nowrap">کانتینر</th>
                                    <th className="py-3 px-2 whitespace-nowrap">ارزش دلاری ($)</th>
                                    {isEditMode && <th className="py-3 px-2 whitespace-nowrap">عملیات</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visiblePurchasingGoods.length === 0 ? (
                                    <tr>
                                        <td colSpan={isEditMode ? 8 : 7} className="py-6 text-center text-slate-400 font-medium">هیچ بار در حال خرید یا در راه با شرایط خرید ارز/تخصیص ثبت نشده است.</td>
                                    </tr>
                                ) : (
                                    visiblePurchasingGoods.map((item) => {
                                        const isCommercial = item.id.startsWith('com_');
                                        const cleanReg = item.registrationNumber || item.proforma || item.id;
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50 text-slate-700">
                                                <td className="py-2.5 px-3 text-right font-bold flex items-center gap-1.5 flex-wrap">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.cargoType} 
                                                            onChange={(e) => updateCustomCell('purchase', item.id, 'cargoType', e.target.value)}
                                                            className="w-full py-1 px-2 border rounded border-slate-200 focus:outline-none"
                                                        />
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 flex-wrap">
                                                            {item.cargoType}
                                                            {item.statusBadge && (
                                                                <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-[10px] px-1.5 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 font-bold font-sans">
                                                                    {item.statusBadge}
                                                                </span>
                                                            )}
                                                            {isCommercial && !item.statusBadge && (
                                                                <span className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 text-[10px] px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-900 font-bold font-sans">
                                                                    سیستم بازرگانی
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.proforma} 
                                                            onChange={(e) => updateCustomCell('purchase', item.id, 'proforma', e.target.value)}
                                                            className="w-full text-center py-1 px-2 border rounded border-slate-200 focus:outline-none"
                                                        />
                                                    ) : item.proforma || '-'}
                                                </td>
                                                <td className="py-2.5 px-2">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.registrationNumber || ''} 
                                                            onChange={(e) => updateCustomCell('purchase', item.id, 'registrationNumber', e.target.value)}
                                                            className="w-full text-center py-1 px-2 border rounded border-slate-200 focus:outline-none"
                                                            placeholder="ثبت سفارش"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <span className="font-mono font-bold">{item.registrationNumber || '-'}</span>
                                                            {cleanReg && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExcludeRegistration(cleanReg, item.cargoType)}
                                                                    className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                                                                    title="حذف/مخفی‌سازی این ثبت سفارش از گزارش"
                                                                >
                                                                    <EyeOff className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.weight} 
                                                            onChange={(e) => updateCustomCell('purchase', item.id, 'weight', e.target.value)}
                                                            className="w-28 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.weight.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.cartons} 
                                                            onChange={(e) => updateCustomCell('purchase', item.id, 'cartons', e.target.value)}
                                                            className="w-24 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.cartons.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.container} 
                                                            onChange={(e) => updateCustomCell('purchase', item.id, 'container', e.target.value)}
                                                            className="w-20 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.container.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono font-bold text-emerald-600">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.dollars} 
                                                            onChange={(e) => updateCustomCell('purchase', item.id, 'dollars', e.target.value)}
                                                            className="w-28 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : `$${item.dollars.toLocaleString('en-US')}`}
                                                </td>
                                                {isEditMode && (
                                                    <td className="py-2.5 px-2">
                                                        {!isCommercial && (
                                                            <button 
                                                                onClick={() => deleteCustomRow('purchase', item.id)}
                                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-all"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            {visiblePurchasingGoods.length > 0 && (
                                <tfoot>
                                    <tr className="bg-indigo-950 !text-white font-extrabold border-t-2 border-indigo-800" style={{ backgroundColor: '#1e1b4b' }}>
                                        <td className="py-3 px-3 text-right !text-white font-bold" style={{ color: '#ffffff', fontWeight: 900 }} colSpan={3}>جمع کل بارهای در حال خرید و در راه</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visiblePurchasingGoods, 'weight').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visiblePurchasingGoods, 'cartons').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visiblePurchasingGoods, 'container').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-emerald-300 font-bold" style={{ color: '#6ee7b7', fontWeight: 900 }}>${calculateCustomTableSum(visiblePurchasingGoods, 'dollars').toLocaleString('en-US')}</td>
                                        {isEditMode && <td></td>}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* C. DOMESTIC & PETROCHEMICAL BOURSE PURCHASES (خریدهای داخلی پتروشیمی و بورس کالا - ال‌سی داخلی / برات / نقدی) */}
                <div id="section-domestic" className="bg-white rounded-none sm:rounded-2xl border-y sm:border border-slate-200 overflow-hidden shadow-sm scroll-mt-28 w-full">
                    <div className="p-4 bg-emerald-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm sm:text-base">خریدهای داخلی، پتروشیمی و بورس کالا (LC داخلی / برات / نقدی)</h4>
                            <span className="text-[11px] bg-emerald-800/80 px-2 py-0.5 rounded text-emerald-200 hidden sm:inline">
                                بارهای خریداری شده از بورس کالا و پتروشیمی‌ها (تسهیلات ال‌سی، برات یا نقدی در راه انبار کارخانه)
                            </span>
                        </div>
                        {isEditMode && (
                            <button
                                onClick={() => addCustomRow('domestic')}
                                className="bg-emerald-700 hover:bg-emerald-600 text-white rounded px-3 py-1 text-xs font-bold transition-all flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>افزودن خرید جدید</span>
                            </button>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-xs text-center border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <th className="py-3 px-3 text-right whitespace-nowrap">گرید کالا / پتروشیمی</th>
                                    <th className="py-3 px-2 whitespace-nowrap">پیش‌فاکتور / قرارداد بورس</th>
                                    <th className="py-3 px-2 whitespace-nowrap">شناسه عرضه / پیگیری</th>
                                    <th className="py-3 px-2 whitespace-nowrap">وزن (kg)</th>
                                    <th className="py-3 px-2 whitespace-nowrap">کارتن / کیسه</th>
                                    <th className="py-3 px-2 whitespace-nowrap">روش تسویه (LC / برات / نقدی)</th>
                                    <th className="py-3 px-2 whitespace-nowrap">ارزش ریالی (ریال)</th>
                                    {isEditMode && <th className="py-3 px-2 whitespace-nowrap">عملیات</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleDomesticPurchases.length === 0 ? (
                                    <tr>
                                        <td colSpan={isEditMode ? 8 : 7} className="py-6 text-center text-slate-400 font-medium">هیچ خرید داخلی پتروشیمی در حال جریان ثبت نشده است.</td>
                                    </tr>
                                ) : (
                                    visibleDomesticPurchases.map((item) => {
                                        const isCommercial = item.id.startsWith('com_');
                                        const cleanReg = item.registrationNumber || item.proforma || item.id;
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50 text-slate-700">
                                                <td className="py-2.5 px-3 text-right font-bold flex items-center gap-1.5 flex-wrap">
                                                    {isEditMode && !isCommercial ? (
                                                        <div className="w-full space-y-1">
                                                            <input 
                                                                type="text" 
                                                                value={item.cargoType} 
                                                                onChange={(e) => updateCustomCell('domestic', item.id, 'cargoType', e.target.value)}
                                                                className="w-full py-1 px-2 border rounded border-slate-200 focus:outline-none"
                                                                placeholder="نام کالا / گرید"
                                                            />
                                                            <input 
                                                                type="text" 
                                                                value={item.petrochemicalName || ''} 
                                                                onChange={(e) => updateCustomCell('domestic', item.id, 'petrochemicalName', e.target.value)}
                                                                className="w-full py-0.5 px-2 text-[11px] border rounded border-slate-200 focus:outline-none text-emerald-800"
                                                                placeholder="پتروشیمی / کارگزاری"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-slate-900">{item.cargoType}</span>
                                                            {item.petrochemicalName && (
                                                                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-bold">
                                                                    {item.petrochemicalName}
                                                                </span>
                                                            )}
                                                            {item.statusBadge && (
                                                                <span className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-md border border-blue-200 font-bold font-sans">
                                                                    {item.statusBadge}
                                                                </span>
                                                            )}
                                                            {isCommercial && !item.statusBadge && (
                                                                <span className="bg-teal-50 text-teal-700 text-[10px] px-1.5 py-0.5 rounded-md border border-teal-200 font-bold font-sans">
                                                                    پرونده بازرگانی
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.proforma} 
                                                            onChange={(e) => updateCustomCell('domestic', item.id, 'proforma', e.target.value)}
                                                            className="w-full text-center py-1 px-2 border rounded border-slate-200 focus:outline-none font-mono"
                                                            placeholder="پیش‌فاکتور"
                                                        />
                                                    ) : item.proforma || '-'}
                                                </td>
                                                <td className="py-2.5 px-2">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.registrationNumber || ''} 
                                                            onChange={(e) => updateCustomCell('domestic', item.id, 'registrationNumber', e.target.value)}
                                                            className="w-full text-center py-1 px-2 border rounded border-slate-200 focus:outline-none font-mono"
                                                            placeholder="شماره قرارداد/عرضه"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <span className="font-mono font-bold">{item.registrationNumber || '-'}</span>
                                                            {cleanReg && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExcludeRegistration(cleanReg, item.cargoType)}
                                                                    className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                                                                    title="حذف/مخفی‌سازی این ثبت سفارش از گزارش"
                                                                >
                                                                    <EyeOff className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono font-bold">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.weight} 
                                                            onChange={(e) => updateCustomCell('domestic', item.id, 'weight', e.target.value)}
                                                            className="w-28 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.weight.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.cartons} 
                                                            onChange={(e) => updateCustomCell('domestic', item.id, 'cartons', e.target.value)}
                                                            className="w-24 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                        />
                                                    ) : item.cartons.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="py-2.5 px-2">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="text" 
                                                            value={item.statusBadge || ''} 
                                                            onChange={(e) => updateCustomCell('domestic', item.id, 'statusBadge', e.target.value)}
                                                            className="w-28 text-center py-1 px-2 border rounded border-slate-200 text-xs"
                                                            placeholder="LC / برات / نقدی"
                                                        />
                                                    ) : (
                                                        <span className="font-medium text-slate-600">{item.statusBadge || 'نقدی بورس'}</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-2 font-mono font-bold text-emerald-700">
                                                    {isEditMode && !isCommercial ? (
                                                        <input 
                                                            type="number" 
                                                            value={item.rialAmount || 0} 
                                                            onChange={(e) => updateCustomCell('domestic', item.id, 'rialAmount', e.target.value)}
                                                            className="w-32 text-center py-1 px-2 border rounded border-slate-200 font-mono"
                                                            placeholder="مبلغ کل ریالی"
                                                        />
                                                    ) : `${(item.rialAmount || 0).toLocaleString('fa-IR')} ریال`}
                                                </td>
                                                {isEditMode && (
                                                    <td className="py-2.5 px-2">
                                                        {!isCommercial && (
                                                            <button 
                                                                onClick={() => deleteCustomRow('domestic', item.id)}
                                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-all"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            {visibleDomesticPurchases.length > 0 && (
                                <tfoot>
                                    <tr className="bg-emerald-950 !text-white font-extrabold border-t-2 border-emerald-800" style={{ backgroundColor: '#064e3b' }}>
                                        <td className="py-3 px-3 text-right !text-white font-bold" style={{ color: '#ffffff', fontWeight: 900 }} colSpan={3}>جمع کل خریدهای داخلی و پتروشیمی (بورس کالا)</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleDomesticPurchases, 'weight').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>{calculateCustomTableSum(visibleDomesticPurchases, 'cartons').toLocaleString('fa-IR')}</td>
                                        <td className="py-3 px-2 font-mono !text-white" style={{ color: '#ffffff', fontWeight: 800 }}>-</td>
                                        <td className="py-3 px-2 font-mono !text-emerald-300 font-bold" style={{ color: '#6ee7b7', fontWeight: 900 }}>{(visibleDomesticPurchases.reduce((s, r) => s + (r.rialAmount || 0), 0)).toLocaleString('fa-IR')} ریال</td>
                                        {isEditMode && <td></td>}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

            </div>

            {/* COMPARATIVE ANALYSIS SUMMARY (تفاضل و مقایسه جامع وزنی، تولید، واردات و آمار سالانه) */}
            <div className="bg-white p-3 sm:p-8 rounded-none sm:rounded-3xl border-y sm:border border-slate-200 shadow-sm sm:shadow-md space-y-4 sm:space-y-8 w-full max-w-5xl mx-auto">
                <div className="border-b border-slate-100 pb-4 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold mb-2">
                        <Scale className="w-3.5 h-3.5" />
                        <span>تحلیل مقایسه‌ای تراز وزنی و عملکرد سالانه</span>
                    </div>
                    <h4 className="font-black text-slate-800 text-lg sm:text-xl">مقایسه تراز وزنی تولیدات، واردات و موجودی زنجیره تامین</h4>
                    <p className="text-xs text-slate-500 mt-1">پایش لحظه‌ای تراز وزنی سال جاری ({report2Label}) نسبت به سال گذشته ({report1Label}) و تفکیک رشد یا افت</p>
                </div>

                {/* 4 Comprehensive Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 1. Factory Production Yarns Weight */}
                    <div className="p-4 bg-gradient-to-br from-blue-50/50 to-slate-50 rounded-2xl border border-blue-100/80 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-blue-600" />
                                <span>نخ‌های تولیدی کارخانه</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isYarnsDownward ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isYarnsDownward ? '🔻 تراز منفی' : '📈 تراز مثبت'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>پارسال: {(totalLastYearYarnsWeight / 1000).toFixed(2)} تن</span>
                                <span>امسال: {(totalCurrentYarnsWeight / 1000).toFixed(2)} تن</span>
                            </div>
                            <div className="text-xl font-black text-slate-800 font-mono mt-1" dir="ltr">
                                {diffYarnsWeight >= 0 ? `+${(diffYarnsWeight / 1000).toFixed(2)}` : (diffYarnsWeight / 1000).toFixed(2)} <span className="text-xs font-normal text-slate-500">تن</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-500 font-medium">درصد تغییرات:</span>
                            <span className={`font-mono font-bold flex items-center gap-0.5 ${ratioYarnsWeight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioYarnsWeight < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                                {ratioYarnsWeight >= 0 ? `+${ratioYarnsWeight.toFixed(1)}%` : `${ratioYarnsWeight.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>

                    {/* 2. Raw & Imported Materials Weight */}
                    <div className="p-4 bg-gradient-to-br from-teal-50/50 to-slate-50 rounded-2xl border border-teal-100/80 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                                <Boxes className="w-3.5 h-3.5 text-teal-600" />
                                <span>مواد اولیه و واردات</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isRawDownward ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isRawDownward ? '🔻 تراز منفی' : '📈 تراز مثبت'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>پارسال: {(totalLastYearRawWeight / 1000).toFixed(2)} تن</span>
                                <span>امسال: {(totalCurrentRawWeight / 1000).toFixed(2)} تن</span>
                            </div>
                            <div className="text-xl font-black text-slate-800 font-mono mt-1" dir="ltr">
                                {diffRawWeight >= 0 ? `+${(diffRawWeight / 1000).toFixed(2)}` : (diffRawWeight / 1000).toFixed(2)} <span className="text-xs font-normal text-slate-500">تن</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-500 font-medium">درصد تغییرات:</span>
                            <span className={`font-mono font-bold flex items-center gap-0.5 ${ratioRawWeight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioRawWeight < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                                {ratioRawWeight >= 0 ? `+${ratioRawWeight.toFixed(1)}%` : `${ratioRawWeight.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>

                    {/* 3. Total Enterprise Supply Chain Weight */}
                    <div className="p-4 bg-gradient-to-br from-indigo-50/50 to-slate-50 rounded-2xl border border-indigo-100/80 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                <span>سرجمع کل وزن زنجیره</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isAllWeightDownward ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isAllWeightDownward ? '🔻 تراز منفی' : '📈 تراز مثبت'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>پارسال: {(totalLastYearAllWeight / 1000).toFixed(2)} تن</span>
                                <span>امسال: {(totalCurrentAllWeight / 1000).toFixed(2)} تن</span>
                            </div>
                            <div className="text-xl font-black text-slate-800 font-mono mt-1" dir="ltr">
                                {diffAllWeight >= 0 ? `+${(diffAllWeight / 1000).toFixed(2)}` : (diffAllWeight / 1000).toFixed(2)} <span className="text-xs font-normal text-slate-500">تن</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-500 font-medium">تغییر کل:</span>
                            <span className={`font-mono font-bold flex items-center gap-0.5 ${ratioAllWeight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioAllWeight < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                                {ratioAllWeight >= 0 ? `+${ratioAllWeight.toFixed(1)}%` : `${ratioAllWeight.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>

                    {/* 4. Containers & Dollars Import Metrics */}
                    <div className="p-4 bg-gradient-to-br from-amber-50/50 to-slate-50 rounded-2xl border border-amber-100/80 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                                <span>کانتینر و ارزش دلاری</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ratioContainers < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {ratioContainers < 0 ? '🔻 نزولی' : '📈 صعودی'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between">
                                <span>کانتینر: {diffContainers > 0 ? `+${diffContainers.toFixed(1)}` : diffContainers.toFixed(1)}</span>
                                <span>ارزش: {diffDollars >= 0 ? `+$${(diffDollars / 1000).toFixed(0)}k` : `-$${(Math.abs(diffDollars) / 1000).toFixed(0)}k`}</span>
                            </div>
                            <div className="text-xl font-black text-slate-800 font-mono mt-1" dir="ltr">
                                {ratioContainers >= 0 ? `+${ratioContainers.toFixed(1)}%` : `${ratioContainers.toFixed(1)}%`}
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-500 font-medium">تغییر ارزی:</span>
                            <span className={`font-mono font-bold ${ratioDollars < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {ratioDollars >= 0 ? `+${ratioDollars.toFixed(1)}%` : `${ratioDollars.toFixed(1)}%`}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 🚨 NEGATIVE ITEMS ALERT CENTER */}
                {negativeItems.length > 0 ? (
                    <div id="section-negative-alert" className="p-2.5 sm:p-5 rounded-none sm:rounded-2xl bg-red-50/90 border-y sm:border-2 border-red-200 space-y-3 sm:space-y-4 shadow-sm scroll-mt-28 w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-red-200/80 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-red-600 text-white rounded-xl shadow animate-bounce shrink-0">
                                    <BellRing className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className="font-extrabold text-red-900 text-sm sm:text-base flex items-center gap-2 flex-wrap">
                                        <span>هشدار فوری: شناسایی {negativeItems.length.toLocaleString('fa-IR')} قلم کالا با تراز منفی و افت وزنی</span>
                                        <span className="px-2 py-0.5 bg-red-200 text-red-800 rounded-full text-[10px] font-mono font-bold">ALARM ACTIVE</span>
                                    </h5>
                                    <p className="text-xs text-red-700 mt-0.5">
                                        این اقلام در مقایسه با سال گذشته کاهش موجودی داشته یا مانده فعلی آن‌ها منفی است و نیازمند بررسی و صدور گزارش به مدیران می‌باشند.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setIsBotModalOpen(true)}
                                className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg self-stretch sm:self-auto shrink-0 cursor-pointer"
                            >
                                <Send className="w-4 h-4" />
                                <span>ارسال فوری گزارش منفی‌ها به بات</span>
                            </button>
                        </div>

                        {/* List of Negative Items Mini Table */}
                        <div className="overflow-x-auto rounded-none sm:rounded-xl border-y sm:border border-red-200 bg-white w-full">
                            <table className="w-full min-w-[620px] text-xs text-center border-collapse">
                                <thead>
                                    <tr className="bg-red-100/70 text-red-900 font-bold border-b border-red-200">
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">کد و نام کالا / گروه</th>
                                        <th className="py-2.5 px-2 whitespace-nowrap">دسته‌بندی</th>
                                        <th className="py-2.5 px-2 font-mono whitespace-nowrap">وزن پارسال ({report1Label})</th>
                                        <th className="py-2.5 px-2 font-mono whitespace-nowrap">وزن امسال ({report2Label})</th>
                                        <th className="py-2.5 px-2 font-mono text-red-700 font-extrabold whitespace-nowrap">میزان کسری و افت (Δ kg)</th>
                                        <th className="py-2.5 px-2 font-mono whitespace-nowrap">درصد افت</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {negativeItems.map((item, idx) => (
                                        <tr key={`neg-${item.code}-${idx}`} className="border-b border-red-100 hover:bg-red-50/50 transition-colors">
                                            <td className="py-2 px-3 text-right font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                                <span className="font-mono text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold shrink-0">{item.code}</span>
                                                <span className="break-words">{item.name}</span>
                                            </td>
                                            <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                                    {item.categoryLabel}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 font-mono text-slate-600 whitespace-nowrap">
                                                {item.lastYearWeight.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-2 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                                                {item.currentWeight.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-2 px-2 font-mono font-extrabold text-red-600 bg-red-50/50 whitespace-nowrap" dir="ltr">
                                                {item.diffWeight.toLocaleString('fa-IR', { maximumFractionDigits: 2 })} kg
                                                <span className="text-[10px] text-red-500 font-normal mr-1">({(item.diffWeight / 1000).toFixed(2)} تن)</span>
                                            </td>
                                            <td className="py-2 px-2 font-mono font-bold text-red-600 whitespace-nowrap">
                                                {item.ratio.toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                            <div>
                                <h5 className="font-extrabold text-emerald-900 text-xs sm:text-sm">تراز وزنی کلیه اقلام مثبت است</h5>
                                <p className="text-[11px] text-emerald-700">هیچ قلم کالایی با کاهش یا تراز منفی نسبت به سال گذشته شناسایی نشد.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsBotModalOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                        >
                            <Send className="w-3.5 h-3.5" />
                            <span>ارسال گزارش به ربات</span>
                        </button>
                    </div>
                )}

                {/* DETAILED VARIANCE & WEIGHT CHANGE MATRIX */}
                <div className="space-y-4 pt-2 border-t border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h5 className="font-extrabold text-slate-800 text-sm sm:text-base">جدول مقایسه مستقیم و ماتریس تراز وزنی تمام اقلام</h5>
                            <button
                                onClick={() => setShowVarianceDetails(!showVarianceDetails)}
                                className="text-xs text-blue-600 hover:underline font-bold"
                            >
                                {showVarianceDetails ? '(پنهان کردن)' : '(نمایش جزئیات)'}
                            </button>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                            <button
                                onClick={() => setVarianceFilter('all')}
                                className={`px-3 py-1.5 rounded-lg transition-all ${varianceFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                همه اقلام ({allComparedItems.length})
                            </button>
                            <button
                                onClick={() => setVarianceFilter('negative')}
                                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${varianceFilter === 'negative' ? 'bg-red-600 text-white shadow-sm' : 'text-red-600 hover:bg-red-50'}`}
                            >
                                <TrendingDown className="w-3.5 h-3.5" />
                                <span>دارای افت وزنی ({negativeItems.length})</span>
                            </button>
                            <button
                                onClick={() => setVarianceFilter('positive')}
                                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${varianceFilter === 'positive' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-600 hover:bg-emerald-50'}`}
                            >
                                <TrendingUp className="w-3.5 h-3.5" />
                                <span>دارای رشد وزنی ({allComparedItems.length - negativeItems.length})</span>
                            </button>
                        </div>
                    </div>

                    {showVarianceDetails && (
                        <div className="overflow-x-auto rounded-none sm:rounded-2xl border-y sm:border border-slate-200 bg-white w-full">
                            <table className="w-full min-w-[700px] text-xs text-center border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">کد و عنوان کالا / گروه</th>
                                        <th className="py-2.5 px-2 whitespace-nowrap">دسته‌بندی</th>
                                        <th className="py-2.5 px-2 font-mono whitespace-nowrap">وزن سال قبل ({report1Label})</th>
                                        <th className="py-2.5 px-2 font-mono whitespace-nowrap">وزن سال جاری ({report2Label})</th>
                                        <th className="py-2.5 px-2 font-mono font-bold whitespace-nowrap">اختلاف وزنی (Δ kg)</th>
                                        <th className="py-2.5 px-2 font-mono whitespace-nowrap">درصد تغییر</th>
                                        <th className="py-2.5 px-2 whitespace-nowrap">وضعیت تراز</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredVarianceItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-4 text-center text-slate-400">موردی مطابق با فیلتر یافت نشد.</td>
                                        </tr>
                                    ) : (
                                        filteredVarianceItems.map((item, idx) => (
                                            <tr key={`var-${item.code}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                                                <td className="py-2.5 px-3 text-right font-bold text-slate-800 flex items-center gap-1.5">
                                                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{item.code}</span>
                                                    <span>{item.name}</span>
                                                </td>
                                                <td className="py-2 px-2 text-slate-500">
                                                    <span className="text-[10px] bg-slate-50 border px-1.5 py-0.5 rounded font-medium">
                                                        {item.categoryLabel}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-2 font-mono text-slate-600">
                                                    {item.lastYearWeight.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="py-2 px-2 font-mono font-bold text-slate-900">
                                                    {item.currentWeight.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}
                                                </td>
                                                <td className={`py-2 px-2 font-mono font-extrabold ${item.isNegative ? 'text-red-600 bg-red-50/40' : 'text-emerald-600 bg-emerald-50/40'}`} dir="ltr">
                                                    {item.diffWeight >= 0 ? `+${item.diffWeight.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}` : item.diffWeight.toLocaleString('fa-IR', { maximumFractionDigits: 2 })} kg
                                                </td>
                                                <td className={`py-2 px-2 font-mono font-bold ${item.isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {item.ratio >= 0 ? `+${item.ratio.toFixed(1)}%` : `${item.ratio.toFixed(1)}%`}
                                                </td>
                                                <td className="py-2 px-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.isNegative ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                        {item.isNegative ? '🔻 منفی' : '🟢 مثبت'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Signature Box */}
                <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center text-xs text-slate-500 font-bold">
                    <div className="flex flex-col gap-1">
                        <div>تهیه و تنظیم گزارش: انبارداری مرکزی و تامین خارجی</div>
                        <div className="flex items-center gap-1 text-slate-800 mt-1">
                            <span>تنظیم‌کننده:</span>
                            {isEditMode ? (
                                <input 
                                    type="text"
                                    value={signature}
                                    onChange={(e) => setSignature(e.target.value)}
                                    placeholder="نام تنظیم‌کننده..."
                                    className="bg-transparent border-b border-blue-400 font-bold focus:outline-none w-44 text-right"
                                />
                            ) : (
                                <span className="font-black text-slate-900">{signature || '—'}</span>
                            )}
                        </div>
                    </div>
                    
                    
                </div>
            </div>

            {/* 🤖 BOT DISPATCH & ALARM NOTIFICATION MODAL */}
            {isBotModalOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 md:p-6 pb-16 sm:pb-20 bg-slate-900/75 backdrop-blur-md animate-fade-in" dir="rtl">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 max-h-[82vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-red-50 text-red-600 rounded-2xl">
                                    <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-sm sm:text-base md:text-lg">ارسال گزارش انبار، هشدار کسری و مغایرت به ربات و مدیریت</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">ارسال فایل PDF رسمی، کپشن تحلیلی و نوتیفیکیشن اختصاصی به مدیرعامل</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsBotModalOpen(false)}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Status / Alert feedback */}
                        {botSendSuccessMessage && (
                            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 shrink-0">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                <span>{botSendSuccessMessage}</span>
                            </div>
                        )}

                        {botSendErrorMessage && (
                            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2 shrink-0">
                                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                <span>{botSendErrorMessage}</span>
                            </div>
                        )}

                        <div className="overflow-y-auto flex-1 space-y-4 pr-1 pl-1 custom-scrollbar min-h-0">
                            {/* 1. Scope Selection (محدوده گزارش ارسالی) */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                                    <FileText className="w-4 h-4 text-indigo-600" />
                                    <span>۱. انتخاب محدوده و صفحات گزارش (Scope)</span>
                                </label>
                                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setBotReportScope('both')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botReportScope === 'both'
                                            ? 'bg-white shadow text-indigo-950 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        📑 گزارش جامع (۲ صفحه)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBotReportScope('overview_only')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botReportScope === 'overview_only'
                                            ? 'bg-white shadow text-blue-950 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        🏢 فقط صفحه ۱
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBotReportScope('variance_only')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botReportScope === 'variance_only'
                                            ? 'bg-white shadow text-amber-950 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        ⚠️ فقط صفحه ۲ (تحلیل کسری)
                                    </button>
                                </div>
                            </div>

                            {/* 2. Format Selection (نوع و قالب ارسال) */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                                    <Sliders className="w-4 h-4 text-emerald-600" />
                                    <span>۲. قالب و فرمت ارسال گزارش (Format)</span>
                                </label>
                                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setBotSendFormat('pdf_and_caption')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botSendFormat === 'pdf_and_caption'
                                            ? 'bg-white shadow text-emerald-950 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        📎 PDF + متن کپشن
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBotSendFormat('pdf_only')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botSendFormat === 'pdf_only'
                                            ? 'bg-white shadow text-emerald-950 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        📄 فقط فایل PDF
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBotSendFormat('caption_only')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botSendFormat === 'caption_only'
                                            ? 'bg-white shadow text-emerald-950 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        💬 فقط پیام متنی
                                    </button>
                                </div>
                            </div>

                            {/* 3. In-App Notification to CEO / Management */}
                            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                                            <BellRing className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                            <span className="text-[11px] font-black text-amber-900 block">
                                                ارسال نوتیفیکیشن درون‌برنامه‌ای به مدیرعامل و مدیران ارشد
                                            </span>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={botNotifyInApp}
                                        onChange={(e) => setBotNotifyInApp(e.target.checked)}
                                        className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                                    />
                                </label>
                            </div>

                            {/* 4. Destination Selection */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-extrabold text-slate-700">۳. انتخاب گروه یا مخاطب مقصد</label>
                                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setBotDestinationType('default')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botDestinationType === 'default'
                                            ? 'bg-white shadow text-blue-900 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        👥 گروه‌های پیش‌فرض انبار
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBotDestinationType('custom')}
                                        className={`flex-1 py-1.5 text-center text-[10.5px] font-black rounded-lg transition-all ${
                                            botDestinationType === 'custom'
                                            ? 'bg-white shadow text-blue-900 font-extrabold'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                        }`}
                                    >
                                        👤 شناسه سفارشی (Chat ID)
                                    </button>
                                </div>

                                {botDestinationType === 'custom' && (
                                    <div className="mt-1">
                                        <input
                                            type="text"
                                            value={customTargetId}
                                            onChange={(e) => setCustomTargetId(e.target.value)}
                                            placeholder="مثال: -100123456789 یا @my_warehouse_group"
                                            className="w-full text-xs font-mono p-2 bg-slate-50 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            dir="ltr"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* 5. Platforms Checkbox */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-extrabold text-slate-700">۴. پلتفرم‌های پیام‌رسان فعال</label>
                                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={selectedPlatforms.includes('telegram')}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedPlatforms([...selectedPlatforms, 'telegram']);
                                                else setSelectedPlatforms(selectedPlatforms.filter(p => p !== 'telegram'));
                                            }}
                                            className="w-4 h-4 text-blue-600 rounded border-slate-300"
                                        />
                                        <span>تلگرام (Telegram)</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={selectedPlatforms.includes('bale')}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedPlatforms([...selectedPlatforms, 'bale']);
                                                else setSelectedPlatforms(selectedPlatforms.filter(p => p !== 'bale'));
                                            }}
                                            className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                                        />
                                        <span>بله (Bale)</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={selectedPlatforms.includes('whatsapp')}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedPlatforms([...selectedPlatforms, 'whatsapp']);
                                                else setSelectedPlatforms(selectedPlatforms.filter(p => p !== 'whatsapp'));
                                            }}
                                            className="w-4 h-4 text-green-600 rounded border-slate-300"
                                        />
                                        <span>واتساپ (WhatsApp)</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                            <button
                                onClick={() => setIsBotModalOpen(false)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-5 py-2.5 text-xs font-bold transition-all cursor-pointer"
                            >
                                انصراف و بستن
                            </button>
                            <button
                                onClick={handleSendNegativeAlert}
                                disabled={isSendingBot || selectedPlatforms.length === 0}
                                className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-6 py-2.5 text-xs font-black transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
                            >
                                {isSendingBot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                <span>{isSendingBot ? 'در حال ارسال و تولید فایل PDF...' : 'تایید و ارسال به گروه و مدیریت'}</span>
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* AI Warehouse Strategic Advisor Modal */}
            <AiWarehouseAdvisorModal
                isOpen={isAiAdvisorOpen}
                onClose={() => setIsAiAdvisorOpen(false)}
                warehouseData={getExportDataset()}
                report1Label={report1Label}
                report2Label={report2Label}
                reportDate={reportDate}
            />

            {/* Excluded Orders & Cargo Filter Manager Modal */}
            {isExcludeManagerOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 animation-fade-in" dir="rtl">
                    <div 
                        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 text-white flex items-center justify-between shadow-md shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
                                    <FilterX className="w-5 h-5 sm:w-6 sm:h-6 text-amber-200" />
                                </div>
                                <div>
                                    <h3 className="font-black text-sm sm:text-base flex items-center gap-2">
                                        <span>مدیریت و حذف ثبت‌سفارش‌ها و سفارش‌های خرید از تراز انبار</span>
                                        <span className="text-[10px] bg-white/20 text-white font-bold px-2 py-0.5 rounded-full">تولست هوشمند</span>
                                    </h3>
                                    <p className="text-[11px] text-amber-100 font-medium mt-0.5">
                                        سفارش‌های خارجی و ایرانی حذف‌شده بلافاصله به صورت پویا از تراز وزنی، جداول و ویجت داشبورد کسر می‌شوند.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsExcludeManagerOpen(false)}
                                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                                title="بستن پنجره"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Search & Category Filter Toolbar */}
                        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
                            {/* Search bar & Bulk actions */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={excludeSearchTerm}
                                        onChange={(e) => setExcludeSearchTerm(e.target.value)}
                                        placeholder="جستجو در شرح کالا، شماره ثبت‌سفارش، کوتاژ، پروفرما یا دسته‌بندی..."
                                        className="w-full text-xs font-bold py-2 pr-9 pl-8 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                                    />
                                    <Filter className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                                    {excludeSearchTerm && (
                                        <button 
                                            type="button" 
                                            onClick={() => setExcludeSearchTerm('')}
                                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={excludeAllFiltered}
                                        disabled={filteredExcludableItems.length === 0}
                                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                        title="حذف کلیه موارد نتایج فعلی از تراز انبار"
                                    >
                                        <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                                        <span>حذف همه فیلترشده‌ها</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={includeAllFiltered}
                                        disabled={filteredExcludableItems.length === 0}
                                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                        title="افزودن و محاسبه مجدد همه موارد نتایج فعلی در تراز انبار"
                                    >
                                        <Eye className="w-3.5 h-3.5 text-emerald-700" />
                                        <span>فعال‌سازی همه فیلترشده‌ها</span>
                                    </button>

                                    {excludedRegistrationNumbers.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={clearAllExclusions}
                                            className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                                            title="پاکسازی تمام استثناها و بازگردانی همه به تراز"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5 text-red-700" />
                                            <span>بازیابی کلیه سفارش‌ها</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Category Filter Tabs */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold custom-scrollbar">
                                <button
                                    type="button"
                                    onClick={() => setExcludeCategoryFilter('all')}
                                    className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                        excludeCategoryFilter === 'all'
                                            ? 'bg-amber-600 text-white shadow-xs font-black'
                                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                    }`}
                                >
                                    <span>همه بخش‌ها</span>
                                    <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded-full font-mono">
                                        {allExcludableItems.length.toLocaleString('fa-IR')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setExcludeCategoryFilter('customs')}
                                    className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                        excludeCategoryFilter === 'customs'
                                            ? 'bg-sky-600 text-white shadow-xs font-black'
                                            : 'bg-white text-slate-600 hover:bg-sky-50 border border-slate-200'
                                    }`}
                                >
                                    <span>🏢 بارهای در گمرک</span>
                                    <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded-full font-mono">
                                        {goodsInCustoms.length.toLocaleString('fa-IR')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setExcludeCategoryFilter('purchasing')}
                                    className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                        excludeCategoryFilter === 'purchasing'
                                            ? 'bg-indigo-600 text-white shadow-xs font-black'
                                            : 'bg-white text-slate-600 hover:bg-indigo-50 border border-slate-200'
                                    }`}
                                >
                                    <span>🚢 در حال خرید و در راه</span>
                                    <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded-full font-mono">
                                        {purchasingGoods.length.toLocaleString('fa-IR')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setExcludeCategoryFilter('domestic')}
                                    className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                        excludeCategoryFilter === 'domestic'
                                            ? 'bg-emerald-600 text-white shadow-xs font-black'
                                            : 'bg-white text-slate-600 hover:bg-emerald-50 border border-slate-200'
                                    }`}
                                >
                                    <span>⛽ خریدهای پتروشیمی/داخلی</span>
                                    <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded-full font-mono">
                                        {domesticPurchases.length.toLocaleString('fa-IR')}
                                    </span>
                                </button>

                                {commercialGoods.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setExcludeCategoryFilter('commercial')}
                                        className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                            excludeCategoryFilter === 'commercial'
                                                ? 'bg-teal-600 text-white shadow-xs font-black'
                                                : 'bg-white text-slate-600 hover:bg-teal-50 border border-slate-200'
                                        }`}
                                    >
                                        <span>🏬 کالای تجاری</span>
                                        <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded-full font-mono">
                                            {commercialGoods.length.toLocaleString('fa-IR')}
                                        </span>
                                    </button>
                                )}

                                {/* Status Filters (All / Excluded / Active) */}
                                <div className="mr-auto flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-xl shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setExcludeStatusFilter('all')}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                            excludeStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        همه
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExcludeStatusFilter('excluded')}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                                            excludeStatusFilter === 'excluded' ? 'bg-amber-500 text-white shadow-xs font-black' : 'text-amber-800 hover:text-amber-950'
                                        }`}
                                    >
                                        <span>🚫 حذف‌شده</span>
                                        <span className="font-mono">({allExcludableItems.filter(isItemExcluded).length})</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExcludeStatusFilter('active')}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                                            excludeStatusFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-emerald-800 hover:text-emerald-950'
                                        }`}
                                    >
                                        <span>✅ فعال</span>
                                        <span className="font-mono">({allExcludableItems.filter(item => !isItemExcluded(item)).length})</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar p-3 sm:p-4">
                            <table className="w-full text-xs text-center border-collapse min-w-[760px]">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                                        <th className="py-2.5 px-2 text-right">#</th>
                                        <th className="py-2.5 px-2.5 text-right">دسته / منبع</th>
                                        <th className="py-2.5 px-3 text-right">شرح سفارش / کالا</th>
                                        <th className="py-2.5 px-2.5">شماره ثبت سفارش</th>
                                        <th className="py-2.5 px-2.5">پروفرما / کوتاژ</th>
                                        <th className="py-2.5 px-2.5">وزن (kg)</th>
                                        <th className="py-2.5 px-2.5">ارزش مالی</th>
                                        <th className="py-2.5 px-2.5">وضعیت در تراز و ویجت</th>
                                        <th className="py-2.5 px-2.5">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredExcludableItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                                                هیچ سفارشی با شرایط جستجو و فیلترهای انتخابی یافت نشد.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredExcludableItems.map((item, idx) => {
                                            const excluded = isItemExcluded(item);
                                            return (
                                                <tr 
                                                    key={item.id || idx} 
                                                    className={`transition-colors ${
                                                        excluded 
                                                            ? 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 text-slate-400' 
                                                            : 'hover:bg-slate-50 text-slate-700'
                                                    }`}
                                                >
                                                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-400">
                                                        {(idx + 1).toLocaleString('fa-IR')}
                                                    </td>
                                                    <td className="py-2.5 px-2.5 text-right">
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 ${
                                                            item.categoryKey === 'customs' ? 'bg-sky-50 text-sky-800 border border-sky-200' :
                                                            item.categoryKey === 'purchasing' ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                                                            item.categoryKey === 'domestic' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                                            item.categoryKey === 'transit' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                                                            'bg-teal-50 text-teal-800 border border-teal-200'
                                                        }`}>
                                                            {item.categoryLabel}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-bold">
                                                        <span className={excluded ? 'line-through text-slate-400' : 'text-slate-800'}>
                                                            {item.cargoType}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-2.5 font-mono font-bold">
                                                        {item.registrationNumber ? (
                                                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                                                                {item.registrationNumber}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-2.5 font-mono">
                                                        {item.proforma ? (
                                                            <span className="text-[11px] text-slate-600 font-bold">
                                                                {item.proforma}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-2.5 font-mono font-bold">
                                                        <span className={excluded ? 'text-slate-400' : 'text-slate-900'}>
                                                            {(item.weight || 0).toLocaleString('fa-IR')}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-2.5 font-mono">
                                                        {item.dollars > 0 ? (
                                                            <span className="text-emerald-600 font-bold">${item.dollars.toLocaleString('en-US')}</span>
                                                        ) : item.rialAmount && item.rialAmount > 0 ? (
                                                            <span className="text-slate-600">{(item.rialAmount / 10).toLocaleString('fa-IR')} ت</span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-2.5">
                                                        {excluded ? (
                                                            <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-300 inline-flex items-center gap-1">
                                                                <EyeOff className="w-3 h-3 text-amber-700" />
                                                                <span>🚫 حذف از تراز و ویجت</span>
                                                            </span>
                                                        ) : (
                                                            <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 inline-flex items-center gap-1">
                                                                <Check className="w-3 h-3 text-emerald-600" />
                                                                <span>✅ محاسبه در تراز</span>
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-2.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExcludeItem(item)}
                                                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 mx-auto cursor-pointer ${
                                                                excluded
                                                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                                                    : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                                                            }`}
                                                            title={excluded ? 'بازگردانی به تراز انبار و ویجت' : 'حذف و عدم محاسبه در تراز و ویجت'}
                                                        >
                                                            {excluded ? (
                                                                <>
                                                                    <Eye className="w-3.5 h-3.5" />
                                                                    <span>افزودن به تراز</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <EyeOff className="w-3.5 h-3.5" />
                                                                    <span>حذف از تراز</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Summary Bar */}
                        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-700 flex-wrap">
                                <div>
                                    <span>کل سفارش‌ها: </span>
                                    <strong className="font-mono text-slate-900">{allExcludableItems.length.toLocaleString('fa-IR')}</strong>
                                </div>
                                <div className="text-amber-800">
                                    <span>حذف شده از تراز: </span>
                                    <strong className="font-mono text-amber-900">{allExcludableItems.filter(isItemExcluded).length.toLocaleString('fa-IR')}</strong>
                                </div>
                                <div className="text-red-700">
                                    <span>تناژ کسر شده از آمار: </span>
                                    <strong className="font-mono text-red-800">
                                        {(allExcludableItems.filter(isItemExcluded).reduce((sum, it) => sum + (it.weight || 0), 0) / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} تن
                                    </strong>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsExcludeManagerOpen(false)}
                                className="w-full sm:w-auto px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
                            >
                                تایید و بستن
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
};
export default WarehouseOverviewTab;
