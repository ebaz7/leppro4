
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, TradeRecord, TradeAttachment, ProformaHistoryEntry, TradeStage, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPurchaseData, TradeTransaction, CurrencyTranche, CurrencyDelivery, TradeStageData, ShippingDocument, ShippingDocType, DocStatus, InvoiceItem, InspectionData, InspectionPayment, InspectionCertificate, ClearanceData, WarehouseReceipt, ClearancePayment, GreenLeafData, GreenLeafCustomsDuty, GreenLeafGuarantee, GreenLeafTax, GreenLeafRoadToll, InternalShippingData, ShippingPayment, AgentData, AgentPayment, PackingItem, UserRole, GuaranteeCheque } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, getSettings, uploadFile, uploadTradeAttachment, deleteUploadedFile } from '../services/storageService';
import { getUsers } from '../services/authService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, parsePersianDate, formatDate, calculateDaysDiff, calculateDaysBetween, getStatusLabel } from '../constants';
import FormattedNumberInput from './FormattedNumberInput';
import { Container, Plus, Search, CheckCircle2, Save, Trash2, X, Package, ArrowRight, History, Banknote, Coins, Wallet, FileSpreadsheet, Shield, LayoutDashboard, Printer, FileDown, Paperclip, Building2, FolderOpen, Home, Calculator, FileText, Microscope, ListFilter, Warehouse, Calendar as CalendarIcon, PieChart, BarChart, Clock, Leaf, Scale, ShieldCheck, Percent, Truck, CheckSquare, Square, ToggleLeft, ToggleRight, DollarSign, UserCheck, Check, Archive, AlertCircle, RefreshCw, Box, Loader2, Share2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ExternalLink, CalendarDays, Info, ArrowLeftRight, ArrowRightLeft, Edit2, Edit, Undo2, Eye, EyeOff, Copy, Layers } from 'lucide-react';
import { apiCall, LS_KEYS, getLocalData } from '../services/apiService';
import { downloadAndOpenFile } from '../services/fileService';
import AllocationReport from './AllocationReport';
import CurrencyReport from './reports/CurrencyReport';
import CompanyPerformanceReport from './reports/CompanyPerformanceReport';
import PrintFinalCostReport from './print/PrintFinalCostReport';
import PrintClearanceDeclaration from './print/PrintClearanceDeclaration';
import PrintProforma from './print/PrintProforma';
import PrintShippingDoc from './print/PrintShippingDoc';
import InsuranceLedgerReport from './reports/InsuranceLedgerReport';
import GuaranteeReport from './reports/GuaranteeReport';
import InsuranceTab from './InsuranceTab';
import AllocationTab, { AllocationFormData } from './AllocationTab';
import CurrencyGuaranteeSection from './trade/CurrencyGuaranteeSection';
import { GeneralTradeListReport } from './reports/GeneralTradeListReport';
import { FileViewerModal } from './FileViewerModal';
import { SendToChatModal } from './SendToChatModal';
import { TradeDatePicker } from './TradeDatePicker';
import { matchesTradeRecord, getTradeRecordMatchHighlights, normalizeSearchText } from '../utils/tradeSearch';
import { extractAllClearancePayments, prepareRecordWithClearancePayments, getStageRecordedClearanceCost } from '../utils/tradeClearanceHelper';
import GuaranteeAlertBanner from './trade/GuaranteeAlertBanner';
import { checkAndNotifyGuaranteeDueDates, getGuaranteeDueStatus } from '../utils/guaranteeAlertUtils';
import DomesticPetrochemicalTab from './trade/DomesticPetrochemicalTab';
import { TradeAttachmentSection } from './trade/TradeAttachmentSection';
import { TradeAllAttachmentsTab } from './trade/TradeAllAttachmentsTab';

interface TradeModuleProps {
    currentUser: User;
}

const STAGES = Object.values(TradeStage);
const CURRENCIES = [
    { code: 'EUR', label: 'یورو (€)' },
    { code: 'USD', label: 'دلار ($)' },
    { code: 'AED', label: 'درهم (AED)' },
    { code: 'CNY', label: 'یوان (¥)' },
    { code: 'TRY', label: 'لیر (₺)' },
];

type ReportType = 'general' | 'allocation_queue' | 'allocated' | 'currency' | 'insurance' | 'shipping' | 'inspection' | 'clearance' | 'green_leaf' | 'company_performance' | 'insurance_ledger' | 'guarantee';

const TradeModule: React.FC<TradeModuleProps> = ({ currentUser }) => {
    const [records, setRecords] = useState<TradeRecord[]>(() => {
        try {
            const cached = getLocalData<TradeRecord[]>(LS_KEYS.TRADE, []);
            return Array.isArray(cached) ? cached : [];
        } catch {
            return [];
        }
    });
    const [selectedRecord, setSelectedRecord] = useState<TradeRecord | null>(null);
    const [commodityGroups, setCommodityGroups] = useState<string[]>([]);
    const [availableBanks, setAvailableBanks] = useState<string[]>([]);
    const [operatingBanks, setOperatingBanks] = useState<string[]>([]);
    const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
    const [settings, setSettingsData] = useState<SystemSettings | null>(null);

    const [navLevel, setNavLevel] = useState<'ROOT' | 'COMPANY' | 'GROUP'>('ROOT');
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const [viewMode, setViewMode] = useState<'dashboard' | 'details' | 'reports'>('dashboard');
    const [activeReport, setActiveReport] = useState<ReportType>('general');
    const [reportFilterCompany, setReportFilterCompany] = useState<string>('');
    const [reportSearchTerm, setReportSearchTerm] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form States
    const [showNewModal, setShowNewModal] = useState(false);
    const [newFileNumber, setNewFileNumber] = useState('');
    const [newProformaNumber, setNewProformaNumber] = useState('');
    const [newOrderNumber, setNewOrderNumber] = useState('');
    const [newFileNumberDirect, setNewFileNumberDirect] = useState('');
    const [newRegistrationNumber, setNewRegistrationNumber] = useState('');
    const [newGoodsName, setNewGoodsName] = useState('');
    const [newSellerName, setNewSellerName] = useState('');
    const [newCommodityGroup, setNewCommodityGroup] = useState('');
    const [newMainCurrency, setNewMainCurrency] = useState('EUR');
    const [newRecordCompany, setNewRecordCompany] = useState('');
    const [newPurchaseType, setNewPurchaseType] = useState<'import' | 'domestic_bourse'>('import');
    const [purchaseTypeFilter, setPurchaseTypeFilter] = useState<'all' | 'import' | 'domestic_bourse'>('all');

    // Domestic Petrochemical / Bourse specific modal fields
    const [newDomesticContractNumber, setNewDomesticContractNumber] = useState('');
    const [newDomesticRemittanceNumber, setNewDomesticRemittanceNumber] = useState('');
    const [newDomesticProformaNumber, setNewDomesticProformaNumber] = useState('');
    const [newDomesticBroker, setNewDomesticBroker] = useState('کارگزاری بورس کالا');
    const [newDomesticQuantityKgStr, setNewDomesticQuantityKgStr] = useState('50,000');
    const [newDomesticPaymentMethod, setNewDomesticPaymentMethod] = useState<'internal_lc' | 'cash' | 'draft_barat' | 'bourse_salaf'>('internal_lc');
    const [newDomesticDealDate, setNewDomesticDealDate] = useState('');
    const [newDomesticUnitPriceStr, setNewDomesticUnitPriceStr] = useState('');

    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferForm, setTransferForm] = useState({ targetCommodityGroup: '', newFileNumber: '', newGoodsName: '', newSellerName: '', description: '' });
    
    const [activeTab, setActiveTab] = useState<'timeline' | 'proforma' | 'domestic_petrochemical' | 'insurance' | 'allocation' | 'currency_purchase' | 'shipping_docs' | 'inspection' | 'clearance_docs' | 'green_leaf' | 'internal_shipping' | 'agent_fees' | 'final_calculation' | 'all_attachments'>('timeline');
    
    const [showEditMetadataModal, setShowEditMetadataModal] = useState(false);
    const [editMetadataForm, setEditMetadataForm] = useState<Partial<TradeRecord>>({});

    const [editingStage, setEditingStage] = useState<TradeStage | null>(null);
    const [stageFormData, setStageFormData] = useState<Partial<TradeStageData>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingStageFile, setUploadingStageFile] = useState(false);

    const [newItem, setNewItem] = useState<Partial<TradeItem> & { weightStr?: string, grossWeightStr?: string, unitPriceStr?: string }>({ name: '', weight: 0, grossWeight: 0, unitPrice: 0, totalPrice: 0, hsCode: '', weightStr: '', grossWeightStr: '', unitPriceStr: '' });
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    const [insuranceForm, setInsuranceForm] = useState<NonNullable<TradeRecord['insuranceData']>>({ policyNumber: '', company: '', agencyName: '', agencyCode: '', cost: 0, bank: '', endorsements: [], isPaid: false, paymentDate: '' });
    const [newEndorsement, setNewEndorsement] = useState<Partial<InsuranceEndorsement>>({ amount: 0, description: '', date: '' });
    const [endorsementType, setEndorsementType] = useState<'increase' | 'refund'>('increase');
    
    const [inspectionForm, setInspectionForm] = useState<InspectionData>({ certificates: [], payments: [] });
    const [newInspectionCertificate, setNewInspectionCertificate] = useState<Partial<InspectionCertificate>>({ part: '', company: '', certificateNumber: '', amount: 0 });
    const [newInspectionPayment, setNewInspectionPayment] = useState<Partial<InspectionPayment>>({ part: '', amount: 0, date: '', bank: '' });

    const [clearanceForm, setClearanceForm] = useState<ClearanceData>({ receipts: [], payments: [] });
    const [newWarehouseReceipt, setNewWarehouseReceipt] = useState<Partial<WarehouseReceipt>>({ number: '', part: '', issueDate: '' });
    const [newClearancePayment, setNewClearancePayment] = useState<Partial<ClearancePayment>>({ amount: 0, part: '', bank: '', date: '', payingBank: '' });

    const [greenLeafForm, setGreenLeafForm] = useState<GreenLeafData>({ duties: [], guarantees: [], taxes: [], roadTolls: [] });
    const [newCustomsDuty, setNewCustomsDuty] = useState<Partial<GreenLeafCustomsDuty>>({ cottageNumber: '', part: '', amount: 0, paymentMethod: 'Bank', bank: '', date: '' });
    const [newGuaranteeDetails, setNewGuaranteeDetails] = useState<Partial<GreenLeafGuarantee>>({ guaranteeNumber: '', sepamNumber: '', guaranteeBank: '', chequeNumber: '', chequeBank: '', chequeDate: '', cashAmount: 0, dutyCashAmount: 0, cashBank: '', cashDate: '', chequeAmount: 0, dueDate: '' });
    const [selectedDutyForGuarantee, setSelectedDutyForGuarantee] = useState<string>('');
    const [newTax, setNewTax] = useState<Partial<GreenLeafTax>>({ part: '', amount: 0, bank: '', date: '' });
    const [newRoadToll, setNewRoadToll] = useState<Partial<GreenLeafRoadToll>>({ part: '', amount: 0, bank: '', date: '' });

    const [internalShippingForm, setInternalShippingForm] = useState<InternalShippingData>({ payments: [] });
    const [newShippingPayment, setNewShippingPayment] = useState<Partial<ShippingPayment>>({ part: '', amount: 0, date: '', bank: '', description: '' });

    const [agentForm, setAgentForm] = useState<AgentData>({ payments: [] });
    const [newAgentPayment, setNewAgentPayment] = useState<Partial<AgentPayment>>({ agentName: '', amount: 0, bank: '', date: '', part: '', description: '' });

    const [newLicenseTx, setNewLicenseTx] = useState<Partial<TradeTransaction>>({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
    const [editingLicenseTxId, setEditingLicenseTxId] = useState<string | null>(null);
    const [editingShippingDocId, setEditingShippingDocId] = useState<string | null>(null);
    const [editingWarehouseReceiptId, setEditingWarehouseReceiptId] = useState<string | null>(null);
    const [editingClearancePaymentId, setEditingClearancePaymentId] = useState<string | null>(null);
    const [editingCustomsDutyId, setEditingCustomsDutyId] = useState<string | null>(null);
    const [editingGuaranteeId, setEditingGuaranteeId] = useState<string | null>(null);
    const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
    const [editingRoadTollId, setEditingRoadTollId] = useState<string | null>(null);
    const [editingShippingPaymentId, setEditingShippingPaymentId] = useState<string | null>(null);
    const [editingAgentPaymentId, setEditingAgentPaymentId] = useState<string | null>(null);
    const [editingInspectionCertificateId, setEditingInspectionCertificateId] = useState<string | null>(null);
    const [editingInspectionPaymentId, setEditingInspectionPaymentId] = useState<string | null>(null);
    const [editingEndorsementId, setEditingEndorsementId] = useState<string | null>(null);

    const [currencyForm, setCurrencyForm] = useState<CurrencyPurchaseData>({
        payments: [], purchasedAmount: 0, purchasedCurrencyType: '', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: '', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: [], guaranteeCheque: undefined, guaranteeCheques: []
    });
    
    // Using Omit to avoid type conflict with returnAmount (number vs string for input)
    const [newCurrencyTranche, setNewCurrencyTranche] = useState<Omit<Partial<CurrencyTranche>, 'returnAmount'> & { returnAmount?: string, returnDate?: string, amountStr?: string, rialAmountStr?: string, receivedAmountStr?: string, currencyFeeStr?: string }>({ 
        amount: 0, 
        currencyType: 'EUR', 
        date: '', 
        exchangeName: '', 
        brokerName: '', 
        isDelivered: false, 
        deliveryDate: '',
        returnAmount: '',
        returnDate: '',
        receivedAmount: 0,
        amountStr: '',
        rialAmountStr: '',
        receivedAmountStr: '',
        currencyFeeStr: ''
    });
    const [editingTrancheId, setEditingTrancheId] = useState<string | null>(null);
    const [selectedTrancheForDeliveries, setSelectedTrancheForDeliveries] = useState<string | null>(null);
    const [newDeliveryForm, setNewDeliveryForm] = useState<{
        amount: string | number;
        date: string;
        recipientName: string;
        description: string;
    }>({
        amount: '',
        date: '',
        recipientName: '',
        description: ''
    });
    // We now use multiple currency guarantees array in currencyForm.guaranteeCheques

    const [activeShippingSubTab, setActiveShippingSubTab] = useState<ShippingDocType>('Commercial Invoice');
    const [shippingDocForm, setShippingDocForm] = useState<Partial<ShippingDocument>>({
        status: 'Draft',
        documentNumber: '',
        documentDate: '',
        attachments: [],
        invoiceItems: [],
        packingItems: [],
        freightCost: 0
    });
    const [newInvoiceItem, setNewInvoiceItem] = useState<Partial<InvoiceItem>>({ name: '', weight: 0, grossWeight: 0, unitPrice: 0, totalPrice: 0, part: '' });
    const [newPackingItem, setNewPackingItem] = useState<Partial<PackingItem>>({ description: '', netWeight: 0, grossWeight: 0, packageCount: 0, part: '' });
    const [uploadingDocFile, setUploadingDocFile] = useState(false);
    const docFileInputRef = useRef<HTMLInputElement>(null);

    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerUrl, setViewerUrl] = useState('');
    const [viewerName, setViewerName] = useState('');

    const [sendToChatOpen, setSendToChatOpen] = useState(false);
    const [sendToChatAttachment, setSendToChatAttachment] = useState<{ fileName: string; url: string } | undefined>(undefined);
    const [sendToChatDefaultMsg, setSendToChatDefaultMsg] = useState('');

    const calculateRecordCostPerKg = (record: TradeRecord) => {
        if (!record) return 0;
        const totalItemsCurrency = record.items?.reduce((a, b) => a + b.totalPrice, 0) || 0;
        const totalFreightCurrency = record.freightCost || 0;
        const totalProformaCurrency = totalItemsCurrency + totalFreightCurrency;

        const currencyTranches = record.currencyPurchaseData?.tranches || [];
        const netCurrencyRialCost = currencyTranches.reduce((acc, t) => {
            const paid = t.rialAmount || 0;
            const ret = t.returnAmount || 0;
            return acc + (paid - ret);
        }, 0);

        const overheadStages = [
            TradeStage.LICENSES, TradeStage.INSURANCE, TradeStage.INSPECTION,
            TradeStage.CLEARANCE_DOCS, TradeStage.GREEN_LEAF,
            TradeStage.INTERNAL_SHIPPING, TradeStage.AGENT_FEES
        ];
        const totalOverheadsRial = overheadStages.reduce((sum, stage) => 
            sum + (record.stages?.[stage]?.costRial || 0), 0);

        const grandTotalRialProject = netCurrencyRialCost + totalOverheadsRial;
        const totalWeight = record.items?.reduce((sum, item) => sum + item.weight, 0) || 0;

        return totalWeight > 0 ? grandTotalRialProject / totalWeight : 0;
    };

    const [calcExchangeRate, setCalcExchangeRate] = useState<number>(0);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [showFinalReportPrint, setShowFinalReportPrint] = useState(false);
    
    const [showClearancePrint, setShowClearancePrint] = useState(false);
    const [showProformaPrint, setShowProformaPrint] = useState(false);
    const [proformaPrintTarget, setProformaPrintTarget] = useState<{
        record: TradeRecord;
        isHistorical?: boolean;
        historyTitle?: string;
        historySubtitle?: string;
    } | null>(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const [selectedShippingDocForPrint, setSelectedShippingDocForPrint] = useState<ShippingDocument | null>(null);
    const [expandedShippingDocIds, setExpandedShippingDocIds] = useState<Record<string, boolean>>({});

    const toggleShippingDocExpand = (docId: string) => {
        setExpandedShippingDocIds(prev => ({
            ...prev,
            [docId]: !prev[docId]
        }));
    };
    const [showQuickDocsPanel, setShowQuickDocsPanel] = useState(false);
    const [showMobileStageDrawer, setShowMobileStageDrawer] = useState(false);
    const [showMobileDocsModal, setShowMobileDocsModal] = useState(false);
    const [showMobileMoreOptions, setShowMobileMoreOptions] = useState(false);
    const [sharePlatform, setSharePlatform] = useState<'whatsapp' | 'bale' | 'telegram' | null>(null);
    const [contactSearch, setContactSearch] = useState('');
    const [allContacts, setAllContacts] = useState<any[]>([]);

    // Filter banks based on the selected company
    const companySpecificBanks = useMemo(() => {
        const bankSet = new Set<string>();
        const fallbacks = ['بانک ملی', 'بانک ملت', 'بانک تجارت', 'بانک صادرات', 'بانک سپه', 'بانک سامان', 'بانک پارسیان', 'بانک پاسارگاد', 'بانک کارآفرین', 'بانک سینا', 'بانک شهر', 'بانک مسکن', 'بانک کشاورزی', 'بانک توسعه صادرات', 'بانک صنعت و معدن', 'بانک خاورمیانه', 'بانک رفاه'];

        if (selectedRecord && settings) {
            const targetCompany = settings.companies?.find(c => c.name === selectedRecord.company);
            if (targetCompany && targetCompany.banks && targetCompany.banks.length > 0) {
                targetCompany.banks.forEach(b => {
                    if (b && b.bankName) {
                        const label = `${b.bankName}${b.accountNumber ? ` - ${b.accountNumber}` : ''}`;
                        bankSet.add(label);
                        bankSet.add(b.bankName);
                    }
                });
            }
        }

        if (settings?.companies) {
            settings.companies.forEach(c => {
                if (c.banks && c.banks.length > 0) {
                    c.banks.forEach(b => {
                        if (b && b.bankName) {
                            const label = `${b.bankName}${b.accountNumber ? ` - ${b.accountNumber}` : ''}`;
                            bankSet.add(label);
                            bankSet.add(b.bankName);
                        }
                    });
                }
            });
        }

        if (settings?.operatingBankNames) {
            settings.operatingBankNames.forEach(b => { if (b && typeof b === 'string' && b.trim()) bankSet.add(b.trim()); });
        }
        if (settings?.bankNames) {
            settings.bankNames.forEach(b => { if (b && typeof b === 'string' && b.trim()) bankSet.add(b.trim()); });
        }
        if (settings?.companyBank && typeof settings.companyBank === 'string' && settings.companyBank.trim()) {
            bankSet.add(settings.companyBank.trim());
        }

        if (availableBanks && availableBanks.length > 0) {
            availableBanks.forEach(b => { if (b && typeof b === 'string' && b.trim()) bankSet.add(b.trim()); });
        }

        if (bankSet.size === 0) {
            fallbacks.forEach(f => bankSet.add(f));
        }

        return Array.from(bankSet);
    }, [selectedRecord, settings, availableBanks]);

    useEffect(() => {
        const hasActiveModal = showNewModal || showEditMetadataModal || !!editingStage || !!selectedTrancheForDeliveries || showTransferModal || showProformaPrint || !!proformaPrintTarget || showFinalReportPrint || showClearancePrint || !!selectedShippingDocForPrint || showMobileStageDrawer || showMobileDocsModal || showMobileMoreOptions;
        const needsCustomBack = hasActiveModal || viewMode !== 'dashboard' || navLevel !== 'ROOT';

        if (needsCustomBack) {
            const handleBack = () => {
                if (showMobileStageDrawer) {
                    setShowMobileStageDrawer(false);
                } else if (showMobileDocsModal) {
                    setShowMobileDocsModal(false);
                } else if (showMobileMoreOptions) {
                    setShowMobileMoreOptions(false);
                } else if (showTransferModal) {
                    setShowTransferModal(false);
                } else if (showProformaPrint || proformaPrintTarget) {
                    setShowProformaPrint(false);
                    setProformaPrintTarget(null);
                } else if (selectedShippingDocForPrint) {
                    setSelectedShippingDocForPrint(null);
                } else if (showFinalReportPrint) {
                    setShowFinalReportPrint(false);
                } else if (showClearancePrint) {
                    setShowClearancePrint(false);
                } else if (selectedTrancheForDeliveries) {
                    setSelectedTrancheForDeliveries(null);
                } else if (showNewModal) {
                    setShowNewModal(false);
                } else if (showEditMetadataModal) {
                    setShowEditMetadataModal(false);
                } else if (editingStage) {
                    setEditingStage(null);
                } else if (viewMode !== 'dashboard') {
                    setViewMode('dashboard');
                } else if (navLevel === 'GROUP') {
                    setNavLevel('COMPANY');
                    setSelectedGroup(null);
                } else if (navLevel === 'COMPANY') {
                    setNavLevel('ROOT');
                    setSelectedCompany(null);
                    setSelectedGroup(null);
                }
            };
            window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: handleBack }));
        } else {
            window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION'));
        }
        return () => {
            window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION'));
        };
    }, [showNewModal, showEditMetadataModal, editingStage, viewMode, navLevel, selectedCompany, selectedTrancheForDeliveries, showTransferModal, showProformaPrint, proformaPrintTarget, showFinalReportPrint, showClearancePrint, selectedShippingDocForPrint, showMobileStageDrawer, showMobileDocsModal, showMobileMoreOptions]);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        const mainScroll = document.getElementById('main-scroll-container');
        if (mainScroll) {
            mainScroll.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [viewMode, activeTab, selectedRecord?.id]);

    useEffect(() => {
        loadRecords();
        getSettings().then(s => {
            setSettingsData(s);
            setCommodityGroups(s.commodityGroups || []);
            setAvailableBanks(s.bankNames || []);
            setOperatingBanks(s.operatingBankNames || []);
            setAvailableCompanies(s.companyNames || []);
            setNewRecordCompany(s.defaultCompany || '');
            
            // Load contacts for sharing (Settings + CRM + System Users)
            const c = s.savedContacts || [];
            const sales = s.salesContacts || [];
            getUsers().then(usersList => {
                const userContacts = (usersList || []).filter(u => u.baleChatId || u.telegramChatId || u.phoneNumber).map(u => ({
                    id: u.id,
                    name: u.fullName || u.username,
                    number: u.phoneNumber || '',
                    chatId: u.baleChatId || u.telegramChatId || '',
                    platform: u.baleChatId ? 'Bale' : 'Telegram',
                    type: 'Staff / User'
                }));

                setAllContacts([
                    ...userContacts,
                    ...c.map(x => ({ ...x, type: 'Technical' })),
                    ...sales.map(x => ({ id: x.id, name: x.name, number: x.mobile, chatId: x.baleId || x.telegramId, platform: x.baleId ? 'Bale' : 'Telegram', type: 'Customer' }))
                ]);
            }).catch(() => {
                setAllContacts([
                    ...c.map(x => ({ ...x, type: 'Technical' })),
                    ...sales.map(x => ({ id: x.id, name: x.name, number: x.mobile, chatId: x.baleId || x.telegramId, platform: x.baleId ? 'Bale' : 'Telegram', type: 'Customer' }))
                ]);
            });
        });
    }, []);

    useEffect(() => {
        if (selectedRecord) {
            const insData = selectedRecord.insuranceData || { policyNumber: '', company: '', agencyName: '', agencyCode: '', cost: 0, bank: '', endorsements: [], isPaid: false, paymentDate: '' };
            setInsuranceForm({
                policyNumber: insData.policyNumber || '',
                company: insData.company || '',
                agencyName: insData.agencyName || '',
                agencyCode: insData.agencyCode || '',
                cost: insData.cost || 0,
                bank: insData.bank || '',
                endorsements: insData.endorsements || [],
                isPaid: !!insData.isPaid,
                paymentDate: insData.paymentDate || ''
            });

            const inspData = selectedRecord.inspectionData || { certificates: [], payments: [] };
            const certificates = inspData.certificates || [];
            if (certificates.length === 0 && inspData.certificateNumber) {
                 certificates.push({ id: generateUUID(), part: 'Original', certificateNumber: inspData.certificateNumber, company: inspData.inspectionCompany || '', amount: inspData.totalInvoiceAmount || 0 });
            }
            setInspectionForm({
                certificates: certificates,
                payments: inspData.payments || []
            });

            const clrData = selectedRecord.clearanceData || { receipts: [], payments: [] };
            setClearanceForm({
                receipts: clrData.receipts || [],
                payments: clrData.payments || []
            });

            const glData = selectedRecord.greenLeafData || { duties: [], guarantees: [], taxes: [], roadTolls: [] };
            setGreenLeafForm({
                duties: glData.duties || [],
                guarantees: glData.guarantees || [],
                taxes: glData.taxes || [],
                roadTolls: glData.roadTolls || []
            });

            const isData = selectedRecord.internalShippingData || { payments: [] };
            setInternalShippingForm({
                payments: isData.payments || []
            });

            // Comprehensive extraction of agent payments from all sources, snapshots, and stage reconciliation
            const clearanceExtraction = extractAllClearancePayments(selectedRecord, records);
            setAgentForm({
                payments: clearanceExtraction.payments
            });

            const curData = (selectedRecord.currencyPurchaseData || {}) as CurrencyPurchaseData;
            setCurrencyForm({
                payments: curData.payments || [],
                purchasedAmount: curData.purchasedAmount || 0,
                purchasedCurrencyType: curData.purchasedCurrencyType || selectedRecord.mainCurrency || 'EUR',
                tranches: curData.tranches || [],
                isDelivered: !!curData.isDelivered,
                deliveredAmount: curData.deliveredAmount || 0,
                remittedAmount: curData.remittedAmount || 0,
                guaranteeCheque: curData.guaranteeCheque,
                guaranteeCheques: curData.guaranteeCheques || (curData.guaranteeCheque ? [curData.guaranteeCheque] : []),
                purchaseDate: curData.purchaseDate || '',
                brokerName: curData.brokerName || '',
                exchangeName: curData.exchangeName || '',
                deliveryDate: curData.deliveryDate || '',
                recipientName: curData.recipientName || '',
                deliveredCurrencyType: curData.deliveredCurrencyType || ''
            });
            
            setCalcExchangeRate(selectedRecord.exchangeRate || 0);
            
            setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
            setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, returnAmount: '', returnDate: '', receivedAmount: 0, amountStr: '', rialAmountStr: '', receivedAmountStr: '', currencyFeeStr: '' });
            setEditingTrancheId(null);
            setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0, hsCode: '', weightStr: '', unitPriceStr: '' });
            setEditingItemId(null);
            setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' });
            setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 });
            setNewWarehouseReceipt({ number: '', part: '', issueDate: '' });
            setNewClearancePayment({ amount: 0, part: '', bank: '', date: '', payingBank: '' });
            setNewCustomsDuty({ cottageNumber: '', part: '', amount: 0, paymentMethod: 'Bank', bank: '', date: '' });
            setNewGuaranteeDetails({ guaranteeNumber: '', sepamNumber: '', guaranteeBank: '', chequeNumber: '', chequeBank: '', chequeDate: '', cashAmount: 0, cashBank: '', cashDate: '', chequeAmount: 0 });
            setNewTax({ part: '', amount: 0, bank: '', date: '' });
            setNewRoadToll({ part: '', amount: 0, bank: '', date: '' });
            setNewShippingPayment({ part: '', amount: 0, date: '', bank: '', description: '' });
            setNewAgentPayment({ agentName: '', amount: 0, bank: '', date: '', part: '', description: '' });
            setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], currency: selectedRecord.mainCurrency || 'EUR', invoiceItems: [], packingItems: [], freightCost: 0 });
            setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0, part: '' });
            setNewPackingItem({ description: '', netWeight: 0, grossWeight: 0, packageCount: 0, part: '' });
        }
    }, [selectedRecord]);

    const sanitizeTradeDate = (val?: string): string => {
        if (!val || typeof val !== 'string') return '';
        const clean = val.replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
                         .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]).trim();
        const parts = clean.split(/[\/\-]/);
        if (parts.length >= 1 && parts[0].length > 4) {
            const fixedYear = parts[0].slice(0, 4);
            const remaining = parts.slice(1).map(p => p.slice(0, 2)).join('/');
            return remaining ? `${fixedYear}/${remaining}` : fixedYear;
        }
        return val;
    };

    const loadRecords = async () => { 
        try {
            const data = await getTradeRecords(); 
            // Safety Check: Ensure records is always an array and auto-heal invalid year formats
            const rawList = Array.isArray(data) ? data : [];

            // Purge any old records that were transferred out so they NEVER linger in the old group or in archive
            const transferredOut = rawList.filter(r => !!r.transferredTo);
            if (transferredOut.length > 0) {
                transferredOut.forEach(r => {
                    deleteTradeRecord(r.id).catch(err => console.error("Error purging transferred record", err));
                });
            }

            const activeList = rawList.filter(r => !r.transferredTo);
            const sanitizedList = activeList.map(r => {
                let changed = false;
                let regDate = r.registrationDate;
                let expDate = r.registrationExpiry;
                if (regDate && typeof regDate === 'string') {
                    const clean = sanitizeTradeDate(regDate);
                    if (clean !== regDate) { regDate = clean; changed = true; }
                }
                if (expDate && typeof expDate === 'string') {
                    const clean = sanitizeTradeDate(expDate);
                    if (clean !== expDate) { expDate = clean; changed = true; }
                }
                return changed ? { ...r, registrationDate: regDate, registrationExpiry: expDate } : r;
            });
            setRecords(sanitizedList); 
            checkAndNotifyGuaranteeDueDates(sanitizedList, currentUser);
        } catch (e) {
            console.error("Error loading trade records", e);
            setRecords([]);
        }
    };

    // Listen for custom navigation / open events from Global Search or cross-module links
    useEffect(() => {
        const handleOpenTradeRecord = (e: any) => {
            const detail = e.detail;
            if (!detail) return;
            const targetId = detail.recordId || detail.id;
            const targetTab = detail.tab || 'timeline';
            const targetSearch = detail.searchTerm;
            if (targetSearch) {
                setSearchTerm(targetSearch);
            }
            if (targetId) {
                const found = records.find(r => 
                    r.id === targetId || 
                    r.fileNumber === targetId || 
                    r.registrationNumber === targetId || 
                    r.orderNumber === targetId || 
                    r.proformaNumber === targetId ||
                    (r.greenLeafData?.duties && r.greenLeafData.duties.some(d => d.cottageNumber === targetId)) ||
                    (r.shippingDocuments && r.shippingDocuments.some(s => s.documentNumber === targetId))
                );
                if (found) {
                    setSelectedRecord(found);
                    setViewMode('details');
                    setActiveTab(targetTab);
                }
            }
        };
        window.addEventListener('OPEN_TRADE_RECORD' as any, handleOpenTradeRecord);
        window.addEventListener('NAVIGATE_TRADE_RECORD' as any, handleOpenTradeRecord);
        return () => {
            window.removeEventListener('OPEN_TRADE_RECORD' as any, handleOpenTradeRecord);
            window.removeEventListener('NAVIGATE_TRADE_RECORD' as any, handleOpenTradeRecord);
        };
    }, [records]);

    useEffect(() => {
        if (selectedRecord) {
            const isDomestic = selectedRecord.purchaseType === 'domestic_bourse' || Boolean(selectedRecord.petrochemicalData);
            if (isDomestic && activeTab !== 'domestic_petrochemical') {
                setActiveTab('domestic_petrochemical');
            }
        }
    }, [selectedRecord]);

    const goRoot = () => { setNavLevel('ROOT'); setSelectedCompany(null); setSelectedGroup(null); setSearchTerm(''); };
    const goCompany = (company: string) => { setSelectedCompany(company); setNavLevel('COMPANY'); setSelectedGroup(null); setSearchTerm(''); };
    const goGroup = (group: string) => { setSelectedGroup(group); setNavLevel('GROUP'); setSearchTerm(''); };

    // SAFE RECORDS ACCESS - strictly exclude transferred-out records so they NEVER appear in the old group or in archive
    const safeRecords = useMemo(() => {
        const list = Array.isArray(records) ? records : [];
        return list.filter(r => !r.transferredTo);
    }, [records]);

    const groupedData = useMemo(() => {
        const currentRecords = safeRecords.filter(r => showArchived ? r.isArchived : !r.isArchived);
        if (navLevel === 'ROOT') {
            const companies: Record<string, number> = {};
            currentRecords.forEach(r => { const c = r.company || 'بدون شرکت'; companies[c] = (companies[c] || 0) + 1; });
            return Object.entries(companies).map(([name, count]) => ({ name, count, type: 'company' }));
        } else if (navLevel === 'COMPANY') {
            const groups: Record<string, number> = {};
            currentRecords.filter(r => (r.company || 'بدون شرکت') === selectedCompany).forEach(r => { const g = r.commodityGroup || 'سایر'; groups[g] = (groups[g] || 0) + 1; });
            return Object.entries(groups).map(([name, count]) => ({ name, count, type: 'group' }));
        }
        return [];
    }, [safeRecords, showArchived, navLevel, selectedCompany]);

    const getStageData = (record: TradeRecord | null, stage: TradeStage): TradeStageData => {
        if (!record || !record.stages) return { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
        return record.stages[stage] || { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
    };

    // --- PERSISTENCE & NAVIGATION HELPERS ---
    const persistRecordUpdate = async (updatedRecord: TradeRecord) => {
        setSelectedRecord(updatedRecord);
        setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
        try {
            const serverRecords = await updateTradeRecord(updatedRecord);
            if (Array.isArray(serverRecords) && serverRecords.length > 0) {
                setRecords(serverRecords);
                const fresh = serverRecords.find(r => r.id === updatedRecord.id);
                if (fresh) {
                    setSelectedRecord(fresh);
                }
            }
        } catch (err) {
            console.error("Failed to persist trade record:", err);
        }
    };

    const handleUpdateRecordAttachments = async (category: string, newCategoryAttachments: TradeAttachment[], subCategory?: string) => {
        if (!selectedRecord) return;
        const currentAtts = selectedRecord.attachments || [];
        const otherAtts = currentAtts.filter(a => {
            if (subCategory) {
                return !(a.category === category && a.subCategory === subCategory);
            }
            return a.category !== category;
        });
        const merged = [...otherAtts, ...newCategoryAttachments];
        const updated = { ...selectedRecord, attachments: merged };
        await persistRecordUpdate(updated);
    };

    const handleOpenDossier = (record: TradeRecord, tab: any = 'timeline') => {
        const fresh = records.find(r => r.id === record.id) || record;
        setSelectedRecord(fresh);
        setViewMode('details');
        setActiveTab(tab);
    };

    // --- HANDLERS ---
    const isDuplicateTradeRecord = (company: string, fileNumber: string, registrationNumber: string, goodsName: string, excludeId?: string, proformaNumber?: string) => {
        const safeCompany = (company || '').trim().toLowerCase();
        const safeFileNumber = (fileNumber || '').trim().toLowerCase();
        const safeProformaNumber = (proformaNumber || '').trim().toLowerCase();
        const safeRegistrationNumber = (registrationNumber || '').trim().toLowerCase();
        const safeGoodsName = (goodsName || '').trim().toLowerCase();
        
        return (records || []).some(r => {
            if (excludeId && r.id === excludeId) return false;
            if ((r.company || '').trim().toLowerCase() !== safeCompany) return false;
            if ((r.goodsName || '').trim().toLowerCase() !== safeGoodsName) return false;

            const rFile = (r.fileNumber || '').trim().toLowerCase();
            const rProf = (r.proformaNumber || '').trim().toLowerCase();
            const rReg = (r.registrationNumber || '').trim().toLowerCase();

            // Match if either fileNumber (when both present), proformaNumber (when both present), or registrationNumber (when both present) match
            const fileMatches = !!(safeFileNumber && rFile && safeFileNumber === rFile);
            const profMatches = !!(safeProformaNumber && rProf && safeProformaNumber === rProf);
            const regMatches = !!(safeRegistrationNumber && rReg && safeRegistrationNumber === rReg);

            return fileMatches || profMatches || regMatches;
        });
    };

    const handleCreateRecord = async () => { 
        if (newPurchaseType === 'domestic_bourse') {
            const contractNo = (newDomesticContractNumber || '').trim();
            const remitNo = (newDomesticRemittanceNumber || '').trim();
            const petroProfNo = (newDomesticProformaNumber || '').trim();
            const fileNo = (newFileNumberDirect || '').trim();
            const goods = (newGoodsName || '').trim();
            const seller = (newSellerName || '').trim() || 'پتروشیمی شهید تندگویان';
            const company = (newRecordCompany || '').trim();
            const quantityKg = deformatNumberString(newDomesticQuantityKgStr) || 50000;
            const unitPrice = deformatNumberString(newDomesticUnitPriceStr) || 0;

            if (!goods || !company) {
                alert('لطفاً نام کالا و شرکت مربوطه را انتخاب و وارد نمایید.');
                return;
            }

            if (!contractNo && !petroProfNo && !fileNo) {
                alert('لطفاً شماره قرارداد / معامله بورس کالا یا شماره پیش‌فاکتور را وارد نمایید.');
                return;
            }

            const primaryNumber = contractNo || petroProfNo || fileNo || generateUUID().slice(0, 8);
            const finalFileNumber = fileNo || `DOM-${primaryNumber}`;

            if (isDuplicateTradeRecord(company, finalFileNumber, contractNo, goods, undefined, petroProfNo)) {
                alert('خطا: پرونده دیگری با همین مشخصات (نام شرکت، شماره قرارداد یا پروفرما و نام کالا) قبلاً ثبت شده است.');
                return;
            }

            const totalGoodsPrice = quantityKg * unitPrice;
            const vatAmount = Math.round(totalGoodsPrice * 0.1);
            const brokerageFee = Math.round(totalGoodsPrice * 0.003);
            const totalInvoiceAmount = totalGoodsPrice + vatAmount + brokerageFee;

            const newRecord: TradeRecord = {
                id: generateUUID(),
                company: company,
                fileNumber: finalFileNumber,
                proformaNumber: petroProfNo || contractNo,
                orderNumber: contractNo,
                goodsName: goods,
                registrationNumber: contractNo,
                sellerName: seller,
                commodityGroup: newCommodityGroup || 'مواد اولیه پتروشیمی',
                mainCurrency: 'IRR',
                purchaseType: 'domestic_bourse',
                items: [{
                    id: generateUUID(),
                    name: goods,
                    weight: quantityKg,
                    grossWeight: quantityKg,
                    unitPrice: unitPrice,
                    totalPrice: totalGoodsPrice
                }],
                freightCost: 0,
                startDate: newDomesticDealDate || new Date().toISOString().split('T')[0],
                status: 'Active',
                isInTransit: false,
                isInCustoms: false,
                stages: {},
                createdAt: Date.now(),
                createdBy: currentUser.fullName,
                licenseData: { transactions: [] },
                shippingDocuments: [],
                petrochemicalData: {
                    petrochemicalName: seller,
                    brokerName: newDomesticBroker || 'کارگزاری بورس کالا',
                    contractNumber: contractNo,
                    offeringCode: '',
                    proformaNumber: petroProfNo || contractNo,
                    proformaDate: newDomesticDealDate || new Date().toISOString().split('T')[0],
                    paymentMethod: newDomesticPaymentMethod || 'internal_lc',
                    gradeName: goods,
                    quantityKg: quantityKg,
                    basePricePerKg: unitPrice,
                    competitionPercent: 0,
                    totalGoodsPrice: totalGoodsPrice,
                    vatAmount: vatAmount,
                    brokerageFee: brokerageFee,
                    otherFees: 0,
                    totalInvoiceAmount: totalInvoiceAmount,
                    bourseSettlementDeadline: '',
                    cashSettlement: {
                        isSettled: newDomesticPaymentMethod === 'cash',
                        settlementDate: '',
                        payments: []
                    },
                    internalLc: {
                        lcNumber: '',
                        issuingBank: 'بانک تجارت',
                        branch: 'شعبه مرکزی',
                        branchCode: '',
                        lcType: 'sight',
                        usanceDays: 90,
                        issueDate: '',
                        dueDate: '',
                        lcAmount: totalInvoiceAmount,
                        prepaymentAmount: 0,
                        prepaymentPercent: 10,
                        collateralDesc: '',
                        commissionFee: 0,
                        status: 'draft'
                    },
                    draftBarat: {
                        baratNumber: '',
                        sepamCode: '',
                        bankName: 'بانک ملت',
                        branchName: '',
                        issueDate: '',
                        dueDate: '',
                        tenorDays: 90,
                        amount: totalInvoiceAmount,
                        drawerName: company,
                        draweeName: seller,
                        beneficiaryName: seller,
                        status: 'draft'
                    },
                    loadingNotice: {
                        remittanceNumber: remitNo,
                        remittanceDate: '',
                        behenyabCode: '',
                        loadingTerminal: '',
                        transportCompany: '',
                        driverName: '',
                        driverPhone: '',
                        driverNationalCode: '',
                        truckPlate: '',
                        waybillNumber: '',
                        freightCostRial: 0,
                        loadingDate: '',
                        deliveryStatus: 'pending_loading'
                    },
                    warehouseReceipt: {
                        receiptNumber: '',
                        weighbridgeSlipNumber: '',
                        receivedWeightKg: 0,
                        receiptDate: '',
                        warehouseName: 'انبار مرکزی مواد اولیه کارخانه',
                        qcStatus: 'pending'
                    }
                }
            };

            STAGES.forEach(stage => { 
                newRecord.stages[stage] = { 
                    stage, 
                    isCompleted: false, 
                    description: '', 
                    costRial: 0, 
                    costCurrency: 0, 
                    currencyType: 'IRR', 
                    attachments: [], 
                    updatedAt: Date.now(), 
                    updatedBy: '' 
                }; 
            });

            await saveTradeRecord(newRecord); 
            await loadRecords(); 
            setShowNewModal(false); 
            // Reset Domestic fields
            setNewDomesticContractNumber('');
            setNewDomesticRemittanceNumber('');
            setNewDomesticProformaNumber('');
            setNewDomesticBroker('کارگزاری بورس کالا');
            setNewDomesticQuantityKgStr('50,000');
            setNewDomesticUnitPriceStr('');
            setNewGoodsName(''); 
            setNewSellerName('');
            setNewCommodityGroup('');
            setNewRecordCompany('');
            setNewFileNumberDirect('');
            setSelectedRecord(newRecord); 
            setActiveTab('domestic_petrochemical'); 
            setViewMode('details'); 
            return;
        }

        const proformaNo = (newProformaNumber || '').trim();
        const fileNo = (newFileNumberDirect || newFileNumber || '').trim();
        const regNo = (newRegistrationNumber || '').trim();
        const orderNo = (newOrderNumber || '').trim();

        if (!newGoodsName || !newRecordCompany) {
            alert('لطفاً نام کالا و شرکت را وارد نمایید.');
            return;
        }

        if (!proformaNo && !fileNo) {
            alert('لطفاً شماره پروفرم یا شماره پرونده را وارد نمایید.');
            return;
        }
        
        // Ensure fileNumber and proformaNumber are decoupled
        const finalFileNumber = fileNo || (regNo ? regNo : (proformaNo ? `${proformaNo}-F` : generateUUID().slice(0, 8)));
        
        if (isDuplicateTradeRecord(newRecordCompany, finalFileNumber, regNo, newGoodsName, undefined, proformaNo)) {
            alert('خطا: پرونده دیگری با همین مشخصات (نام شرکت، شماره پرونده یا پروفرما و نام کالا) قبلاً ثبت شده است.');
            return;
        }

        const newRecord: TradeRecord = { 
            id: generateUUID(), 
            company: newRecordCompany, 
            fileNumber: finalFileNumber, 
            proformaNumber: proformaNo,
            orderNumber: orderNo, 
            goodsName: newGoodsName, 
            registrationNumber: regNo, 
            sellerName: newSellerName, 
            commodityGroup: newCommodityGroup, 
            mainCurrency: newMainCurrency, 
            purchaseType: 'import',
            items: [], 
            freightCost: 0, 
            startDate: new Date().toISOString(), 
            status: 'Active', 
            isInTransit: false,
            isInCustoms: false,
            stages: {}, 
            createdAt: Date.now(), 
            createdBy: currentUser.fullName, 
            licenseData: { transactions: [] }, 
            shippingDocuments: [] 
        }; 

        STAGES.forEach(stage => { 
            newRecord.stages[stage] = { 
                stage, 
                isCompleted: false, 
                description: '', 
                costRial: 0, 
                costCurrency: 0, 
                currencyType: newMainCurrency, 
                attachments: [], 
                updatedAt: Date.now(), 
                updatedBy: '' 
            }; 
        }); 
        
        await saveTradeRecord(newRecord); 
        await loadRecords(); 
        setShowNewModal(false); 
        setNewFileNumber(''); 
        setNewProformaNumber('');
        setNewOrderNumber('');
        setNewFileNumberDirect('');
        setNewRegistrationNumber('');
        setNewGoodsName(''); 
        setNewSellerName('');
        setNewCommodityGroup('');
        setNewRecordCompany('');
        setNewPurchaseType('import');
        setSelectedRecord(newRecord); 
        setActiveTab('proforma'); 
        setViewMode('details'); 
    };

    const handleDeleteRecord = async (id: string, e: React.MouseEvent) => { 
        e.stopPropagation(); 
        if (confirm("آیا از حذف این پرونده بازرگانی اطمینان دارید؟")) { 
            await deleteTradeRecord(id); 
            if (selectedRecord?.id === id) setSelectedRecord(null); 
            loadRecords(); 
        } 
    };

    const handleDuplicateRecord = async (record: TradeRecord, e: React.MouseEvent) => {
        e.stopPropagation();
        const suffix = ' - کپی';
        let newFileNumber = (record.fileNumber || '') + suffix;
        
        let attempts = 1;
        while (records.some(r => r.fileNumber === newFileNumber)) {
            newFileNumber = `${record.fileNumber}${suffix} (${attempts})`;
            attempts++;
        }

        const newId = 'TR-' + Date.now() + Math.random().toString(36).substring(2, 7);
        const duplicatedRecord: TradeRecord = {
            ...record,
            id: newId,
            fileNumber: newFileNumber,
            createdAt: Date.now(),
            createdBy: currentUser.fullName,
            status: 'Active',
            isArchived: false,
        };

        try {
            await saveTradeRecord(duplicatedRecord);
            await loadRecords();
            alert(`پرونده بازرگانی با شماره جدید «${newFileNumber}» با موفقیت کپی شد.`);
        } catch (err) {
            console.error("Error duplicating record", err);
            alert("خطا در کپی پرونده بازرگانی");
        }
    };

    const handleUpdateProforma = async (field: keyof TradeRecord, value: string | number) => { 
        if (!selectedRecord) return; 
        
        if (['company', 'fileNumber', 'proformaNumber', 'goodsName', 'registrationNumber'].includes(field as string)) {
            const companyName = (field === 'company' ? value : (selectedRecord.company || '')) as string;
            const fileNo = (field === 'fileNumber' ? value : (selectedRecord.fileNumber || '')) as string;
            const profNo = (field === 'proformaNumber' ? value : (selectedRecord.proformaNumber || '')) as string;
            const regNo = (field === 'registrationNumber' ? value : (selectedRecord.registrationNumber || '')) as string;
            const gName = (field === 'goodsName' ? value : (selectedRecord.goodsName || '')) as string;
            
            if (isDuplicateTradeRecord(companyName, fileNo, regNo, gName, selectedRecord.id, profNo)) {
                alert("خطا: امکان ذخیره وجود ندارد. پرونده دیگری با همین مشخصات (نام شرکت، شماره پرونده یا پروفرما و نام کالا) قبلاً ثبت شده است.");
                return;
            }
        }

        const updatedRecord = { ...selectedRecord, [field]: value }; 
        await persistRecordUpdate(updatedRecord); 
    };
    
    const handleAddItem = async () => { 
        if (!selectedRecord || !newItem.name) return; 
        const weightVal = newItem.weightStr ? deformatNumberString(newItem.weightStr) : (newItem.weight || 0); 
        const grossWeightVal = newItem.grossWeightStr ? deformatNumberString(newItem.grossWeightStr) : (newItem.grossWeight || weightVal);
        
        // Use unitPriceStr as "FOB Amount" (Total Price) if provided, otherwise use unitPrice * weight
        const fobVal = newItem.unitPriceStr ? deformatNumberString(newItem.unitPriceStr) : (newItem.totalPrice || 0);
        
        const unitPriceVal = weightVal > 0 ? fobVal / weightVal : 0;
        const totalVal = fobVal;

        const item: TradeItem = { 
            id: editingItemId || generateUUID(), 
            name: newItem.name, 
            weight: weightVal, 
            grossWeight: grossWeightVal, 
            unitPrice: unitPriceVal, 
            totalPrice: totalVal, 
            hsCode: newItem.hsCode 
        }; 
        
        let updatedItems = []; 
        if (editingItemId) 
            updatedItems = selectedRecord.items.map(i => i.id === editingItemId ? item : i); 
        else 
            updatedItems = [...selectedRecord.items, item]; 
        
        const updatedRecord = { ...selectedRecord, items: updatedItems }; 
        await persistRecordUpdate(updatedRecord); 
        setNewItem({ name: '', weight: 0, grossWeight: 0, unitPrice: 0, totalPrice: 0, hsCode: '', weightStr: '', grossWeightStr: '', unitPriceStr: '' }); 
        setEditingItemId(null); 
    };
    const handleEditItem = (item: TradeItem) => { 
        setNewItem({ 
            name: item.name, 
            weight: item.weight, 
            weightStr: formatNumberString(item.weight), 
            grossWeight: item.grossWeight || item.weight, 
            grossWeightStr: formatNumberString(item.grossWeight || item.weight), 
            unitPrice: item.unitPrice, 
            unitPriceStr: formatNumberString(item.totalPrice || (item.weight * item.unitPrice)), 
            totalPrice: item.totalPrice, 
            hsCode: item.hsCode || '' 
        }); 
        setEditingItemId(item.id); 
    };
    const handleRemoveItem = async (id: string) => { 
        if (!selectedRecord) return; 
        const updatedItems = selectedRecord.items.filter(i => i.id !== id); 
        const updatedRecord = { ...selectedRecord, items: updatedItems }; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleEditLicenseTx = (tx: TradeTransaction) => {
        setEditingLicenseTxId(tx.id);
        setNewLicenseTx({
            amount: tx.amount,
            bank: tx.bank || '',
            date: tx.date || '',
            description: tx.description || 'هزینه ثبت سفارش'
        });
    };
    const handleCancelEditLicenseTx = () => {
        setEditingLicenseTxId(null);
        setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
    };
    const handleAddLicenseTx = async () => { 
        if (!selectedRecord || !newLicenseTx.amount) return; 
        const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; 
        let updatedTransactions: TradeTransaction[] = [];
        if (editingLicenseTxId) {
            updatedTransactions = (currentLicenseData.transactions || []).map(t =>
                t.id === editingLicenseTxId ? {
                    ...t,
                    date: newLicenseTx.date || '',
                    amount: Number(newLicenseTx.amount),
                    bank: newLicenseTx.bank || '',
                    description: newLicenseTx.description || ''
                } : t
            );
        } else {
            const tx: TradeTransaction = { 
                id: generateUUID(), 
                date: newLicenseTx.date || '', 
                amount: Number(newLicenseTx.amount), 
                bank: newLicenseTx.bank || '', 
                description: newLicenseTx.description || '' 
            }; 
            updatedTransactions = [...(currentLicenseData.transactions || []), tx]; 
        }
        const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; 
        const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); 
        if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); 
        updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; 
        updatedRecord.stages[TradeStage.LICENSES].isCompleted = totalCost > 0; 
        await persistRecordUpdate(updatedRecord); 
        setEditingLicenseTxId(null);
        setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' }); 
    };
    const handleRemoveLicenseTx = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingLicenseTxId === id) handleCancelEditLicenseTx();
        const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; 
        const updatedTransactions = (currentLicenseData.transactions || []).filter(t => t.id !== id); 
        const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; 
        const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); 
        if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); 
        updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleSaveInsurance = async () => { 
        if (!selectedRecord) return; 
        const updatedRecord: TradeRecord = { ...selectedRecord, insuranceData: { ...insuranceForm } }; 
        const totalCost = (Number(insuranceForm.cost) || 0) + (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); 
        if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStageData(updatedRecord, TradeStage.INSURANCE); 
        updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; 
        updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!insuranceForm.policyNumber; 
        await persistRecordUpdate(updatedRecord); 
        alert("اطلاعات بیمه و نمایندگی با موفقیت ذخیره شد."); 
    };
    const handleEditEndorsement = (e: InsuranceEndorsement) => {
        setEditingEndorsementId(e.id);
        setEndorsementType(e.amount >= 0 ? 'increase' : 'refund');
        setNewEndorsement({
            amount: Math.abs(e.amount),
            date: e.date,
            description: e.description
        });
    };
    const handleCancelEditEndorsement = () => {
        setEditingEndorsementId(null);
        setNewEndorsement({ amount: 0, description: '', date: '' });
        setEndorsementType('increase');
    };
    const handleAddEndorsement = async () => { 
        if (!selectedRecord || !newEndorsement.amount) return; 
        const amount = endorsementType === 'increase' ? Number(newEndorsement.amount) : -Number(newEndorsement.amount); 
        let updatedEndorsements = [...(insuranceForm.endorsements || [])];
        if (editingEndorsementId) {
            updatedEndorsements = updatedEndorsements.map(e => e.id === editingEndorsementId ? {
                ...e,
                date: newEndorsement.date || '',
                amount: amount,
                description: newEndorsement.description || ''
            } : e);
        } else {
            const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: amount, description: newEndorsement.description || '' }; 
            updatedEndorsements.push(endorsement);
        }
        const updatedForm = { ...insuranceForm, endorsements: updatedEndorsements }; 
        setInsuranceForm(updatedForm); 
        setEditingEndorsementId(null);
        setNewEndorsement({ amount: 0, description: '', date: '' }); 
        const updatedRecord: TradeRecord = { ...selectedRecord, insuranceData: updatedForm }; 
        const totalCost = (Number(updatedForm.cost) || 0) + (updatedForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); 
        if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStageData(updatedRecord, TradeStage.INSURANCE); 
        updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; 
        updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!updatedForm.policyNumber; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleDeleteEndorsement = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingEndorsementId === id) handleCancelEditEndorsement();
        const updatedEndorsements = (insuranceForm.endorsements || []).filter(e => e.id !== id); 
        const updatedForm = { ...insuranceForm, endorsements: updatedEndorsements }; 
        setInsuranceForm(updatedForm); 
        const updatedRecord: TradeRecord = { ...selectedRecord, insuranceData: updatedForm }; 
        const totalCost = (Number(updatedForm.cost) || 0) + (updatedForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); 
        if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStageData(updatedRecord, TradeStage.INSURANCE); 
        updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; 
        updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!updatedForm.policyNumber; 
        await persistRecordUpdate(updatedRecord); 
    };

    const handleSaveAllocation = async (formData: AllocationFormData) => {
        if (!selectedRecord) return;
        const updatedRecord: TradeRecord = { ...selectedRecord };

        // 1. ALLOCATION_QUEUE stage
        if (!updatedRecord.stages[TradeStage.ALLOCATION_QUEUE]) {
            updatedRecord.stages[TradeStage.ALLOCATION_QUEUE] = getStageData(updatedRecord, TradeStage.ALLOCATION_QUEUE);
        }
        updatedRecord.stages[TradeStage.ALLOCATION_QUEUE] = {
            ...updatedRecord.stages[TradeStage.ALLOCATION_QUEUE],
            queueDate: formData.queueDate,
            isCompleted: Boolean(formData.isQueueCompleted),
            costRial: formData.costRial || 0,
            costCurrency: formData.costCurrency || 0,
            currencyType: formData.currencyType || updatedRecord.mainCurrency,
            description: formData.description || '',
            attachments: formData.attachments || [],
            updatedAt: Date.now(),
            updatedBy: currentUser.fullName
        };

        // 2. ALLOCATION_APPROVED stage
        if (!updatedRecord.stages[TradeStage.ALLOCATION_APPROVED]) {
            updatedRecord.stages[TradeStage.ALLOCATION_APPROVED] = getStageData(updatedRecord, TradeStage.ALLOCATION_APPROVED);
        }
        updatedRecord.stages[TradeStage.ALLOCATION_APPROVED] = {
            ...updatedRecord.stages[TradeStage.ALLOCATION_APPROVED],
            allocationCode: formData.allocationCode,
            allocationDate: formData.allocationDate,
            allocationExpiry: formData.allocationExpiry,
            isCompleted: Boolean(formData.isAllocated),
            costRial: formData.costRial || 0,
            costCurrency: formData.costCurrency || 0,
            currencyType: formData.currencyType || updatedRecord.mainCurrency,
            description: formData.description || '',
            attachments: formData.attachments || [],
            updatedAt: Date.now(),
            updatedBy: currentUser.fullName
        };

        // 3. Update currencyPurchaseData for reports and other modules
        if (!updatedRecord.currencyPurchaseData) {
            updatedRecord.currencyPurchaseData = {
                payments: [],
                purchasedAmount: 0,
                purchasedCurrencyType: updatedRecord.mainCurrency || 'EUR'
            };
        }
        updatedRecord.currencyPurchaseData = {
            ...updatedRecord.currencyPurchaseData,
            queueEntryDate: formData.queueDate || updatedRecord.currencyPurchaseData.queueEntryDate,
            allocationDate: formData.allocationDate || updatedRecord.currencyPurchaseData.allocationDate,
            allocationExpiryDate: formData.allocationExpiry || updatedRecord.currencyPurchaseData.allocationExpiryDate,
            allocationCode: formData.allocationCode || updatedRecord.currencyPurchaseData.allocationCode
        };

        // 4. Update currency origin & rank & priority
        if (formData.currencyAllocationType) {
            updatedRecord.currencyAllocationType = formData.currencyAllocationType;
        }
        if (formData.allocationCurrencyRank) {
            updatedRecord.allocationCurrencyRank = formData.allocationCurrencyRank;
        }
        if (formData.isPriority !== undefined) {
            updatedRecord.isPriority = formData.isPriority;
        }

        await persistRecordUpdate(updatedRecord);
    };

    const handleEditInspectionCertificate = (c: InspectionCertificate) => {
        setEditingInspectionCertificateId(c.id);
        setNewInspectionCertificate({
            company: c.company,
            certificateNumber: c.certificateNumber,
            amount: c.amount,
            part: c.part
        });
    };
    const handleCancelEditInspectionCertificate = () => {
        setEditingInspectionCertificateId(null);
        setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 });
    };
    const handleAddInspectionCertificate = async () => { 
        if (!selectedRecord || !newInspectionCertificate.amount) return; 
        let updatedCertificates = [...(inspectionForm.certificates || [])];
        if (editingInspectionCertificateId) {
            updatedCertificates = updatedCertificates.map(c => c.id === editingInspectionCertificateId ? {
                ...c,
                part: newInspectionCertificate.part || 'Part',
                company: newInspectionCertificate.company || '',
                certificateNumber: newInspectionCertificate.certificateNumber || '',
                amount: Number(newInspectionCertificate.amount)
            } : c);
        } else {
            const cert: InspectionCertificate = { id: generateUUID(), part: newInspectionCertificate.part || 'Part', company: newInspectionCertificate.company || '', certificateNumber: newInspectionCertificate.certificateNumber || '', amount: Number(newInspectionCertificate.amount), description: '' }; 
            updatedCertificates.push(cert);
        }
        const updatedData = { ...inspectionForm, certificates: updatedCertificates }; 
        setInspectionForm(updatedData); 
        setEditingInspectionCertificateId(null);
        setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 }); 
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; 
        if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); 
        updatedRecord.stages[TradeStage.INSPECTION].isCompleted = updatedCertificates.length > 0; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleDeleteInspectionCertificate = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingInspectionCertificateId === id) handleCancelEditInspectionCertificate();
        const updatedCertificates = (inspectionForm.certificates || []).filter(c => c.id !== id); 
        const updatedData = { ...inspectionForm, certificates: updatedCertificates }; 
        setInspectionForm(updatedData); 
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleEditInspectionPayment = (p: InspectionPayment) => {
        setEditingInspectionPaymentId(p.id);
        setNewInspectionPayment({
            bank: p.bank,
            amount: p.amount,
            date: p.date,
            part: p.part
        });
    };
    const handleCancelEditInspectionPayment = () => {
        setEditingInspectionPaymentId(null);
        setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' });
    };
    const handleAddInspectionPayment = async () => { 
        if (!selectedRecord || !newInspectionPayment.amount) return; 
        let updatedPayments = [...(inspectionForm.payments || [])];
        if (editingInspectionPaymentId) {
            updatedPayments = updatedPayments.map(p => p.id === editingInspectionPaymentId ? {
                ...p,
                part: newInspectionPayment.part || 'Part',
                amount: Number(newInspectionPayment.amount),
                date: newInspectionPayment.date || '',
                bank: newInspectionPayment.bank || '',
                description: ''
            } : p);
        } else {
            const payment: InspectionPayment = { id: generateUUID(), part: newInspectionPayment.part || 'Part', amount: Number(newInspectionPayment.amount), date: newInspectionPayment.date || '', bank: newInspectionPayment.bank || '', description: '' }; 
            updatedPayments.push(payment);
        }
        const updatedData = { ...inspectionForm, payments: updatedPayments }; 
        setInspectionForm(updatedData); 
        setEditingInspectionPaymentId(null);
        setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' }); 
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; 
        if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); 
        updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleDeleteInspectionPayment = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingInspectionPaymentId === id) handleCancelEditInspectionPayment();
        const updatedPayments = (inspectionForm.payments || []).filter(p => p.id !== id); 
        const updatedData = { ...inspectionForm, payments: updatedPayments }; 
        setInspectionForm(updatedData); 
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; 
        if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); 
        updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleEditWarehouseReceipt = (r: WarehouseReceipt) => {
        setEditingWarehouseReceiptId(r.id);
        setNewWarehouseReceipt({
            number: r.number,
            part: r.part,
            issueDate: r.issueDate
        });
    };
    const handleCancelEditWarehouseReceipt = () => {
        setEditingWarehouseReceiptId(null);
        setNewWarehouseReceipt({ number: '', part: '', issueDate: '' });
    };
    const handleAddWarehouseReceipt = async () => { 
        if (!selectedRecord || !newWarehouseReceipt.number) return; 
        let updatedReceipts = [...(clearanceForm.receipts || [])];
        if (editingWarehouseReceiptId) {
            updatedReceipts = updatedReceipts.map(r => r.id === editingWarehouseReceiptId ? {
                ...r,
                number: newWarehouseReceipt.number || '',
                part: newWarehouseReceipt.part || '',
                issueDate: newWarehouseReceipt.issueDate || ''
            } : r);
        } else {
            const receipt: WarehouseReceipt = { id: generateUUID(), number: newWarehouseReceipt.number || '', part: newWarehouseReceipt.part || '', issueDate: newWarehouseReceipt.issueDate || '' }; 
            updatedReceipts.push(receipt);
        }
        const updatedData = { ...clearanceForm, receipts: updatedReceipts }; 
        setClearanceForm(updatedData); 
        setEditingWarehouseReceiptId(null);
        setNewWarehouseReceipt({ number: '', part: '', issueDate: '' }); 
        const updatedRecord = { 
            ...selectedRecord, 
            clearanceData: updatedData,
            isInCustoms: true,
            isInTransit: false
        }; 
        if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); 
        updatedRecord.stages[TradeStage.CLEARANCE_DOCS].isCompleted = updatedReceipts.length > 0; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleDeleteWarehouseReceipt = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingWarehouseReceiptId === id) handleCancelEditWarehouseReceipt();
        const updatedReceipts = (clearanceForm.receipts || []).filter(r => r.id !== id); 
        const updatedData = { ...clearanceForm, receipts: updatedReceipts }; 
        setClearanceForm(updatedData); 
        const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleEditClearancePayment = (p: ClearancePayment) => {
        setEditingClearancePaymentId(p.id);
        setNewClearancePayment({
            amount: p.amount,
            bank: p.bank,
            date: p.date,
            part: p.part,
            payingBank: p.payingBank
        });
    };
    const handleCancelEditClearancePayment = () => {
        setEditingClearancePaymentId(null);
        setNewClearancePayment({ amount: 0, part: '', bank: '', date: '', payingBank: '' });
    };
    const handleAddClearancePayment = async () => { 
        if (!selectedRecord || !newClearancePayment.amount) return; 
        let updatedPayments = [...(clearanceForm.payments || [])];
        if (editingClearancePaymentId) {
            updatedPayments = updatedPayments.map(p => p.id === editingClearancePaymentId ? {
                ...p,
                amount: Number(newClearancePayment.amount),
                part: newClearancePayment.part || '',
                bank: newClearancePayment.bank || '',
                date: newClearancePayment.date || '',
                payingBank: newClearancePayment.payingBank
            } : p);
        } else {
            const payment: ClearancePayment = { id: generateUUID(), amount: Number(newClearancePayment.amount), part: newClearancePayment.part || '', bank: newClearancePayment.bank || '', date: newClearancePayment.date || '', payingBank: newClearancePayment.payingBank }; 
            updatedPayments.push(payment);
        }
        const updatedData = { ...clearanceForm, payments: updatedPayments }; 
        setClearanceForm(updatedData); 
        setEditingClearancePaymentId(null);
        setNewClearancePayment({ amount: 0, part: '', bank: '', date: '', payingBank: '' }); 
        const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0); 
        const updatedRecord = { ...selectedRecord, clearanceData: updatedData, isInCustoms: true, isInTransit: false }; 
        if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); 
        updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleDeleteClearancePayment = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingClearancePaymentId === id) handleCancelEditClearancePayment();
        const updatedPayments = (clearanceForm.payments || []).filter(p => p.id !== id); 
        const updatedData = { ...clearanceForm, payments: updatedPayments }; 
        setClearanceForm(updatedData); 
        const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0); 
        const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; 
        if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); 
        updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost; 
        await persistRecordUpdate(updatedRecord); 
    };
    // Calculate total Green Leaf cost (Duties + Taxes + Road Tolls).
    // Note: dutyCashAmount is the 10% cash prepayment of the customs duty/cottage (پیش‌پرداخت حقوق ورودی) 
    // and is already part of the total duty amount (d.amount), so it is NOT added as an extra/additional expense.
    const calculateGreenLeafTotal = (data: GreenLeafData) => { let total = 0; total += data.duties.reduce((acc, d) => acc + d.amount, 0); total += data.taxes.reduce((acc, t) => acc + t.amount, 0); total += data.roadTolls.reduce((acc, r) => acc + r.amount, 0); return total; };
    const updateGreenLeafRecord = async (newData: GreenLeafData) => { 
        if (!selectedRecord) return; 
        setGreenLeafForm(newData); 
        const totalCost = calculateGreenLeafTotal(newData); 
        const hasDuties = (newData.duties && newData.duties.length > 0) || (newData.guarantees && newData.guarantees.length > 0);
        const updatedRecord = { 
            ...selectedRecord, 
            greenLeafData: newData,
            ...(hasDuties ? { isInCustoms: true, isInTransit: false } : {})
        }; 
        if (!updatedRecord.stages[TradeStage.GREEN_LEAF]) updatedRecord.stages[TradeStage.GREEN_LEAF] = getStageData(updatedRecord, TradeStage.GREEN_LEAF); 
        updatedRecord.stages[TradeStage.GREEN_LEAF].costRial = totalCost; 
        updatedRecord.stages[TradeStage.GREEN_LEAF].isCompleted = (newData.duties.length > 0); 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleEditCustomsDuty = (d: GreenLeafCustomsDuty) => {
        setEditingCustomsDutyId(d.id);
        setNewCustomsDuty({
            cottageNumber: d.cottageNumber,
            part: d.part,
            amount: d.amount,
            paymentMethod: d.paymentMethod,
            bank: d.bank,
            date: d.date
        });
    };
    const handleCancelEditCustomsDuty = () => {
        setEditingCustomsDutyId(null);
        setNewCustomsDuty({ cottageNumber: '', part: '', amount: 0, paymentMethod: 'Bank', bank: '', date: '' });
    };
    const handleAddCustomsDuty = async () => { 
        if (!newCustomsDuty.cottageNumber || !newCustomsDuty.amount) return; 
        let updatedDuties = [...greenLeafForm.duties];
        if (editingCustomsDutyId) {
            updatedDuties = updatedDuties.map(d => d.id === editingCustomsDutyId ? {
                ...d,
                cottageNumber: newCustomsDuty.cottageNumber || '',
                part: newCustomsDuty.part || '',
                amount: Number(newCustomsDuty.amount),
                paymentMethod: (newCustomsDuty.paymentMethod as 'Bank' | 'Guarantee') || 'Bank',
                bank: newCustomsDuty.bank,
                date: newCustomsDuty.date
            } : d);
        } else {
            const duty: GreenLeafCustomsDuty = { id: generateUUID(), cottageNumber: newCustomsDuty.cottageNumber, part: newCustomsDuty.part || '', amount: Number(newCustomsDuty.amount), paymentMethod: (newCustomsDuty.paymentMethod as 'Bank' | 'Guarantee') || 'Bank', bank: newCustomsDuty.bank, date: newCustomsDuty.date }; 
            updatedDuties.push(duty);
        }
        await updateGreenLeafRecord({ ...greenLeafForm, duties: updatedDuties }); 
        handleCancelEditCustomsDuty();
    };
    const handleDeleteCustomsDuty = async (id: string) => { 
        if (editingCustomsDutyId === id) handleCancelEditCustomsDuty();
        const updatedDuties = greenLeafForm.duties.filter(d => d.id !== id); 
        const updatedGuarantees = greenLeafForm.guarantees.filter(g => g.relatedDutyId !== id); 
        await updateGreenLeafRecord({ ...greenLeafForm, duties: updatedDuties, guarantees: updatedGuarantees }); 
    };

    const handleEditGuarantee = (g: GreenLeafGuarantee) => {
        setEditingGuaranteeId(g.id);
        setSelectedDutyForGuarantee(g.relatedDutyId || '');
        setNewGuaranteeDetails({
            guaranteeNumber: g.guaranteeNumber,
            sepamNumber: g.sepamNumber,
            guaranteeBank: g.guaranteeBank,
            guaranteeType: g.guaranteeType,
            guaranteeAmount: g.guaranteeAmount,
            dutyCashAmount: g.dutyCashAmount,
            chequeNumber: g.chequeNumber,
            chequeBank: g.chequeBank,
            chequeDate: g.chequeDate,
            cashAmount: g.cashAmount,
            cashBank: g.cashBank,
            cashDate: g.cashDate,
            chequeAmount: g.chequeAmount,
            dueDate: g.dueDate || g.chequeDate || g.cashDate || ''
        });
    };
    const handleCancelEditGuarantee = () => {
        setEditingGuaranteeId(null);
        setSelectedDutyForGuarantee('');
        setNewGuaranteeDetails({ 
            guaranteeNumber: '', 
            sepamNumber: '',
            guaranteeBank: '',
            guaranteeType: 'cheque',
            guaranteeAmount: 0,
            dutyCashAmount: 0,
            chequeNumber: '', 
            chequeBank: '', 
            chequeDate: '', 
            cashAmount: 0, 
            cashBank: '', 
            cashDate: '', 
            chequeAmount: 0,
            dueDate: ''
        });
    };
    const handleAddGuarantee = async () => { 
        if (!selectedDutyForGuarantee || !newGuaranteeDetails.guaranteeNumber) return; 
        const duty = greenLeafForm.duties.find(d => d.id === selectedDutyForGuarantee); 
        const rawGuaranteeAmt = Number(newGuaranteeDetails.guaranteeAmount) || 0;
        const rawCashAmt = Number(newGuaranteeDetails.cashAmount) || 0;
        const rawDutyCashAmt = Number(newGuaranteeDetails.dutyCashAmount) || 0;
        
        let updatedGuarantees = [...greenLeafForm.guarantees];
        if (editingGuaranteeId) {
            updatedGuarantees = updatedGuarantees.map(g => g.id === editingGuaranteeId ? {
                ...g,
                relatedDutyId: selectedDutyForGuarantee,
                guaranteeNumber: newGuaranteeDetails.guaranteeNumber || '',
                sepamNumber: newGuaranteeDetails.sepamNumber || '',
                guaranteeBank: newGuaranteeDetails.guaranteeBank || '',
                guaranteeType: newGuaranteeDetails.guaranteeType || 'cheque',
                guaranteeAmount: rawGuaranteeAmt,
                dutyCashAmount: rawDutyCashAmt,
                chequeNumber: newGuaranteeDetails.chequeNumber || '',
                chequeBank: newGuaranteeDetails.chequeBank || '',
                chequeDate: newGuaranteeDetails.chequeDate || '',
                chequeAmount: newGuaranteeDetails.guaranteeType === 'credit' ? 0 : rawGuaranteeAmt,
                cashAmount: rawCashAmt,
                cashBank: newGuaranteeDetails.cashBank || '',
                cashDate: newGuaranteeDetails.cashDate || '',
                dueDate: newGuaranteeDetails.dueDate || newGuaranteeDetails.chequeDate || newGuaranteeDetails.cashDate || '',
                part: duty?.part
            } : g);
        } else {
            const guarantee: GreenLeafGuarantee = { 
                id: generateUUID(), 
                relatedDutyId: selectedDutyForGuarantee, 
                guaranteeNumber: newGuaranteeDetails.guaranteeNumber, 
                sepamNumber: newGuaranteeDetails.sepamNumber || '',
                guaranteeBank: newGuaranteeDetails.guaranteeBank || '',
                guaranteeType: newGuaranteeDetails.guaranteeType || 'cheque',
                guaranteeAmount: rawGuaranteeAmt,
                dutyCashAmount: rawDutyCashAmt,
                chequeNumber: newGuaranteeDetails.chequeNumber || '', 
                chequeBank: newGuaranteeDetails.chequeBank || '', 
                chequeDate: newGuaranteeDetails.chequeDate || '', 
                chequeAmount: newGuaranteeDetails.guaranteeType === 'credit' ? 0 : rawGuaranteeAmt, 
                isDelivered: false, 
                cashAmount: rawCashAmt, 
                cashBank: newGuaranteeDetails.cashBank || '', 
                cashDate: newGuaranteeDetails.cashDate || '', 
                dueDate: newGuaranteeDetails.dueDate || newGuaranteeDetails.chequeDate || newGuaranteeDetails.cashDate || '',
                part: duty?.part 
            }; 
            updatedGuarantees.push(guarantee);
        }
        await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees }); 
        handleCancelEditGuarantee();
    };
    const handleDeleteGuarantee = async (id: string) => { 
        if (editingGuaranteeId === id) handleCancelEditGuarantee();
        const updatedGuarantees = greenLeafForm.guarantees.filter(g => g.id !== id); 
        await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees }); 
    };
    const handleToggleGuaranteeDelivery = async (id: string) => { const updatedGuarantees = greenLeafForm.guarantees.map(g => g.id === id ? { ...g, isDelivered: !g.isDelivered } : g); await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees }); };
    
    const handleEditTax = (t: GreenLeafTax) => {
        setEditingTaxId(t.id);
        setNewTax({ amount: t.amount, part: t.part, bank: t.bank, date: t.date });
    };
    const handleCancelEditTax = () => {
        setEditingTaxId(null);
        setNewTax({ part: '', amount: 0, bank: '', date: '' });
    };
    const handleAddTax = async () => { 
        if (!newTax.amount) return; 
        let updatedTaxes = [...greenLeafForm.taxes];
        if (editingTaxId) {
            updatedTaxes = updatedTaxes.map(t => t.id === editingTaxId ? {
                ...t,
                amount: Number(newTax.amount),
                part: newTax.part || '',
                bank: newTax.bank || '',
                date: newTax.date || ''
            } : t);
        } else {
            const tax: GreenLeafTax = { id: generateUUID(), amount: Number(newTax.amount), part: newTax.part || '', bank: newTax.bank || '', date: newTax.date || '' }; 
            updatedTaxes.push(tax);
        }
        await updateGreenLeafRecord({ ...greenLeafForm, taxes: updatedTaxes }); 
        handleCancelEditTax();
    };
    const handleDeleteTax = async (id: string) => { 
        if (editingTaxId === id) handleCancelEditTax();
        const updatedTaxes = greenLeafForm.taxes.filter(t => t.id !== id); 
        await updateGreenLeafRecord({ ...greenLeafForm, taxes: updatedTaxes }); 
    };

    const handleEditRoadToll = (r: GreenLeafRoadToll) => {
        setEditingRoadTollId(r.id);
        setNewRoadToll({ amount: r.amount, part: r.part, bank: r.bank, date: r.date });
    };
    const handleCancelEditRoadToll = () => {
        setEditingRoadTollId(null);
        setNewRoadToll({ part: '', amount: 0, bank: '', date: '' });
    };
    const handleAddRoadToll = async () => { 
        if (!newRoadToll.amount) return; 
        let updatedTolls = [...greenLeafForm.roadTolls];
        if (editingRoadTollId) {
            updatedTolls = updatedTolls.map(t => t.id === editingRoadTollId ? {
                ...t,
                amount: Number(newRoadToll.amount),
                part: newRoadToll.part || '',
                bank: newRoadToll.bank || '',
                date: newRoadToll.date || ''
            } : t);
        } else {
            const toll: GreenLeafRoadToll = { id: generateUUID(), amount: Number(newRoadToll.amount), part: newRoadToll.part || '', bank: newRoadToll.bank || '', date: newRoadToll.date || '' }; 
            updatedTolls.push(toll);
        }
        await updateGreenLeafRecord({ ...greenLeafForm, roadTolls: updatedTolls }); 
        handleCancelEditRoadToll();
    };
    const handleDeleteRoadToll = async (id: string) => { 
        if (editingRoadTollId === id) handleCancelEditRoadToll();
        const updatedTolls = greenLeafForm.roadTolls.filter(t => t.id !== id); 
        await updateGreenLeafRecord({ ...greenLeafForm, roadTolls: updatedTolls }); 
    };

    const handleEditShippingPayment = (p: ShippingPayment) => {
        setEditingShippingPaymentId(p.id);
        setNewShippingPayment({
            part: p.part,
            amount: p.amount,
            date: p.date,
            bank: p.bank,
            description: p.description
        });
    };
    const handleCancelEditShippingPayment = () => {
        setEditingShippingPaymentId(null);
        setNewShippingPayment({ part: '', amount: 0, date: '', bank: '', description: '' });
    };
    const handleAddShippingPayment = async () => { 
        if (!selectedRecord || !newShippingPayment.amount) return; 
        let updatedPayments = [...(internalShippingForm.payments || [])];
        if (editingShippingPaymentId) {
            updatedPayments = updatedPayments.map(p => p.id === editingShippingPaymentId ? {
                ...p,
                part: newShippingPayment.part || '',
                amount: Number(newShippingPayment.amount),
                date: newShippingPayment.date || '',
                bank: newShippingPayment.bank || '',
                description: newShippingPayment.description || ''
            } : p);
        } else {
            const payment: ShippingPayment = { id: generateUUID(), part: newShippingPayment.part || '', amount: Number(newShippingPayment.amount), date: newShippingPayment.date || '', bank: newShippingPayment.bank || '', description: newShippingPayment.description || '' }; 
            updatedPayments.push(payment);
        }
        const updatedData = { ...internalShippingForm, payments: updatedPayments }; 
        setInternalShippingForm(updatedData); 
        setEditingShippingPaymentId(null);
        setNewShippingPayment({ part: '', amount: 0, date: '', bank: '', description: '' }); 
        const updatedRecord = { ...selectedRecord, internalShippingData: updatedData }; 
        if (!updatedRecord.stages[TradeStage.INTERNAL_SHIPPING]) updatedRecord.stages[TradeStage.INTERNAL_SHIPPING] = getStageData(updatedRecord, TradeStage.INTERNAL_SHIPPING); 
        updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); 
        updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].isCompleted = updatedPayments.length > 0; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleDeleteShippingPayment = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingShippingPaymentId === id) handleCancelEditShippingPayment();
        const updatedPayments = (internalShippingForm.payments || []).filter(p => p.id !== id); 
        const updatedData = { ...internalShippingForm, payments: updatedPayments }; 
        setInternalShippingForm(updatedData); 
        const updatedRecord = { ...selectedRecord, internalShippingData: updatedData }; 
        if (!updatedRecord.stages[TradeStage.INTERNAL_SHIPPING]) updatedRecord.stages[TradeStage.INTERNAL_SHIPPING] = getStageData(updatedRecord, TradeStage.INTERNAL_SHIPPING); 
        updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); 
        await persistRecordUpdate(updatedRecord); 
    };

    const handleEditAgentPayment = (p: AgentPayment) => {
        setEditingAgentPaymentId(p.id);
        setNewAgentPayment({
            agentName: p.agentName,
            amount: p.amount,
            bank: p.bank,
            date: p.date,
            part: p.part,
            description: p.description
        });
    };
    const handleCancelEditAgentPayment = () => {
        setEditingAgentPaymentId(null);
        setNewAgentPayment({ agentName: '', amount: 0, bank: '', date: '', part: '', description: '' });
    };
    const handleAddAgentPayment = async () => { 
        if (!selectedRecord) return; 
        const amountNum = Number(newAgentPayment.amount) || 0;
        if (amountNum <= 0) {
            alert('لطفاً مبلغ هزینه را به ریال وارد نمایید.');
            return;
        }
        const agentNameClean = (newAgentPayment.agentName || newAgentPayment.description || newAgentPayment.part || 'سایر هزینه‌های ترخیص').trim();

        let updatedPayments = [...(agentForm.payments || [])];
        if (editingAgentPaymentId) {
            updatedPayments = updatedPayments.map(p => p.id === editingAgentPaymentId ? {
                ...p,
                agentName: agentNameClean,
                amount: amountNum,
                bank: newAgentPayment.bank || '',
                date: newAgentPayment.date || '',
                part: newAgentPayment.part || '',
                description: newAgentPayment.description || ''
            } : p);
        } else {
            const payment: AgentPayment = { 
                id: generateUUID(), 
                agentName: agentNameClean, 
                amount: amountNum, 
                bank: newAgentPayment.bank || '', 
                date: newAgentPayment.date || '', 
                part: newAgentPayment.part || '', 
                description: newAgentPayment.description || '' 
            }; 
            updatedPayments.push(payment);
        }
        const updatedData = { ...agentForm, payments: updatedPayments }; 
        setAgentForm(updatedData); 
        setEditingAgentPaymentId(null);
        setNewAgentPayment({ agentName: '', amount: 0, bank: '', date: '', part: '', description: '' }); 
        const updatedRecord = prepareRecordWithClearancePayments(selectedRecord, updatedPayments, currentUser.fullName);
        await persistRecordUpdate(updatedRecord); 
    };
    const handleDeleteAgentPayment = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingAgentPaymentId === id) handleCancelEditAgentPayment();
        const updatedPayments = (agentForm.payments || []).filter(p => p.id !== id); 
        const updatedData = { ...agentForm, payments: updatedPayments }; 
        setAgentForm(updatedData); 
        const updatedRecord = prepareRecordWithClearancePayments(selectedRecord, updatedPayments, currentUser.fullName);
        await persistRecordUpdate(updatedRecord); 
    };

    const handleRestoreClearanceBalance = async () => {
        if (!selectedRecord) return;
        const currentSum = (agentForm.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
        const stageCost = getStageRecordedClearanceCost(selectedRecord);
        const diff = stageCost - currentSum;
        if (diff <= 0) {
            alert('مجموع ردیف‌های جدول در حال حاضر برابر یا بیشتر از مبلغ کل ثبت‌شده در پرونده است.');
            return;
        }
        const newBalancePayment: AgentPayment = {
            id: generateUUID(),
            agentName: 'هزینه‌های قبلی و اولیه ترخیص (ثبت‌شده در پرونده)',
            amount: diff,
            bank: '',
            date: selectedRecord.startDate || '',
            part: 'تسویه قبلی',
            description: 'مابه‌التفاوت هزینه‌های قبلی ثبت‌شده در پرونده و محاسبه نهایی (جهت تطابق کامل با محاسبه نهایی)'
        };
        const updatedPayments = [...(agentForm.payments || []), newBalancePayment];
        setAgentForm({ payments: updatedPayments });
        const updatedRecord = prepareRecordWithClearancePayments(selectedRecord, updatedPayments, currentUser.fullName);
        await persistRecordUpdate(updatedRecord);
    };

    const handleDeepScanClearanceHistory = async () => {
        if (!selectedRecord) return;
        const scan = extractAllClearancePayments(selectedRecord, records);
        if (scan.payments.length > (agentForm.payments?.length || 0)) {
            setAgentForm({ payments: scan.payments });
            const updatedRecord = prepareRecordWithClearancePayments(selectedRecord, scan.payments, currentUser.fullName);
            await persistRecordUpdate(updatedRecord);
            alert(`تعداد ${scan.payments.length - (agentForm.payments?.length || 0)} ردیف هزینه ترخیص از سوابق، پروفرم‌های قبلی و بایگانی پرونده بازیابی شد.`);
        } else {
            const currentSum = (agentForm.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            if (scan.stageRecordedCost > currentSum) {
                await handleRestoreClearanceBalance();
            } else {
                alert('تمام ردیف‌های ترخیص پرونده و سوابق در حال حاضر به صورت کامل بارگذاری شده‌اند.');
            }
        }
    };

    const handleSyncStageCostWithRows = async () => {
        if (!selectedRecord) return;
        const currentSum = (agentForm.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
        const updatedRecord = prepareRecordWithClearancePayments(selectedRecord, agentForm.payments || [], currentUser.fullName);
        await persistRecordUpdate(updatedRecord);
        alert(`مبلغ مرحله هزینه‌های ترخیص در محاسبه نهایی با مجموع ردیف‌های فعلی (${formatCurrency(currentSum)} ریال) همگام‌سازی شد.`);
    };

    const handleOpenEditAgentStage = () => {
        handleStageClick(TradeStage.AGENT_FEES);
    };
    const handleAddCurrencyTranche = async () => { 
        if (!selectedRecord || !newCurrencyTranche.amountStr || !newCurrencyTranche.rialAmountStr) return; 
        
        let updatedTranches = [...(currencyForm.tranches || [])]; 
        const rawAmount = deformatNumberString(newCurrencyTranche.amountStr); 
        const rawRialAmount = deformatNumberString(newCurrencyTranche.rialAmountStr); 
        const rawCurrencyFee = newCurrencyTranche.currencyFeeStr ? deformatNumberString(newCurrencyTranche.currencyFeeStr) : 0; 
        const rawReceived = newCurrencyTranche.receivedAmountStr ? deformatNumberString(newCurrencyTranche.receivedAmountStr) : 0; 
        const rawReturnAmount = newCurrencyTranche.returnAmount ? deformatNumberString(newCurrencyTranche.returnAmount.toString()) : undefined;

        const trancheData: any = { 
            date: newCurrencyTranche.date || '', 
            amount: rawAmount, 
            currencyType: newCurrencyTranche.currencyType || selectedRecord.mainCurrency || 'EUR', 
            brokerName: newCurrencyTranche.brokerName || '', 
            exchangeName: newCurrencyTranche.exchangeName || '', 
            rate: 0, 
            rialAmount: rawRialAmount, 
            currencyFee: rawCurrencyFee, 
            isDelivered: newCurrencyTranche.isDelivered, 
            deliveryDate: newCurrencyTranche.deliveryDate, 
            returnAmount: rawReturnAmount, 
            returnDate: newCurrencyTranche.returnDate, 
            receivedAmount: rawReceived 
        }; 

        if (editingTrancheId) { 
            updatedTranches = updatedTranches.map(t => t.id === editingTrancheId ? { ...t, ...trancheData } : t); 
        } else { 
            updatedTranches.push({ ...trancheData, id: generateUUID() }); 
        } 

        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); 
        const totalDelivered = updatedTranches.reduce((acc, t) => {
            const deliveriesSum = t.deliveries && t.deliveries.length > 0 ? t.deliveries.reduce((sum: number, d) => sum + d.amount, 0) : 0;
            return acc + (deliveriesSum || t.receivedAmount || (t.isDelivered ? t.amount : 0));
        }, 0); 
        const totalRialCost = updatedTranches.reduce((acc, t) => { 
            return acc + ((t.rialAmount || 0) - (t.returnAmount || 0)); 
        }, 0); 

        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; 
        setCurrencyForm(updatedForm); 

        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; 
        if (!updatedRecord.stages[TradeStage.CURRENCY_PURCHASE]) updatedRecord.stages[TradeStage.CURRENCY_PURCHASE] = getStageData(updatedRecord, TradeStage.CURRENCY_PURCHASE); 
        updatedRecord.stages[TradeStage.CURRENCY_PURCHASE].costCurrency = totalPurchased; 
        updatedRecord.stages[TradeStage.CURRENCY_PURCHASE].costRial = totalRialCost; 

        await persistRecordUpdate(updatedRecord); 
        
        setNewCurrencyTranche({ 
            amount: 0, 
            currencyType: selectedRecord.mainCurrency || 'EUR', 
            date: '', 
            exchangeName: '', 
            brokerName: '', 
            isDelivered: false, 
            returnAmount: '', 
            returnDate: '', 
            receivedAmount: 0, 
            amountStr: '', 
            rialAmountStr: '', 
            receivedAmountStr: '', 
            currencyFeeStr: '' 
        }); 
        setEditingTrancheId(null); 
    };
    const handleEditTranche = (tranche: any) => { setNewCurrencyTranche({ amount: tranche.amount, amountStr: tranche.amount.toString(), currencyType: tranche.currencyType, date: tranche.date, exchangeName: tranche.exchangeName, brokerName: tranche.brokerName, isDelivered: tranche.isDelivered, deliveryDate: tranche.deliveryDate, rate: tranche.rate, rialAmountStr: formatNumberString(tranche.rialAmount || 0), currencyFeeStr: tranche.currencyFee ? tranche.currencyFee.toString() : '', returnAmount: tranche.returnAmount ? formatNumberString(tranche.returnAmount) : '', returnDate: tranche.returnDate, receivedAmount: tranche.receivedAmount, receivedAmountStr: tranche.receivedAmount ? tranche.receivedAmount.toString() : '' }); setEditingTrancheId(tranche.id); };
    const handleCancelEditTranche = () => { setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord?.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, returnAmount: '', returnDate: '', receivedAmount: 0, amountStr: '', rialAmountStr: '', receivedAmountStr: '', currencyFeeStr: '' }); setEditingTrancheId(null); };

    const handleShareProforma = async (targetId: string) => {
        if (!selectedRecord) return;
        try {
            const platform = sharePlatform || 'bale';
            const totalAmount = selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0);
            const totalWeight = selectedRecord.items.reduce((a, b) => a + b.weight, 0);
            
            const message = `📄 *پیش‌فاکتور جدید*\n\n` +
                `🏢 شرکت: ${selectedRecord.company}\n` +
                `📦 کالا: ${selectedRecord.goodsName}\n` +
                `🔢 شماره پرونده: ${selectedRecord.fileNumber}\n` +
                `👤 فروشنده: ${selectedRecord.sellerName}\n` +
                `⚖️ وزن کل: ${formatNumberString(totalWeight)} KG\n` +
                `💰 ارزش کل: ${formatNumberString(totalAmount)} ${selectedRecord.mainCurrency}\n\n` +
                `نمایش آنلاین:\n${window.location.origin}/share/proforma/${selectedRecord.id}`;

            const response: any = await apiCall(`/share/${platform}`, 'POST', {
                targetId,
                message,
                documentId: selectedRecord.id,
                documentType: 'PROFORMA'
            });

            if (response.success) {
                alert('پیش‌فاکتور با موفقیت ارسال شد.');
                setSharePlatform(null);
            } else {
                throw new Error(response.error || 'خطا در ارسال');
            }
        } catch (error: any) {
            alert('خطا در ارسال: ' + error.message);
        }
    };

    const handleRemoveTranche = async (id: string) => { 
        if (!selectedRecord) return; 
        if (!confirm('آیا از حذف این پارت مطمئن هستید؟')) return; 
        const updatedTranches = (currencyForm.tranches || []).filter(t => t.id !== id); 
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); 
        const totalDelivered = updatedTranches.reduce((acc, t) => {
            const deliveriesSum = t.deliveries && t.deliveries.length > 0 ? t.deliveries.reduce((sum: number, d) => sum + d.amount, 0) : 0;
            return acc + (deliveriesSum || t.receivedAmount || (t.isDelivered ? t.amount : 0));
        }, 0); 
        const totalRialCost = updatedTranches.reduce((acc, t) => { return acc + ((t.rialAmount || 0) - (t.returnAmount || 0)); }, 0); 
        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; 
        setCurrencyForm(updatedForm); 
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; 
        if (!updatedRecord.stages[TradeStage.CURRENCY_PURCHASE]) updatedRecord.stages[TradeStage.CURRENCY_PURCHASE] = getStageData(updatedRecord, TradeStage.CURRENCY_PURCHASE); 
        updatedRecord.stages[TradeStage.CURRENCY_PURCHASE].costCurrency = totalPurchased; 
        updatedRecord.stages[TradeStage.CURRENCY_PURCHASE].costRial = totalRialCost; 
        await persistRecordUpdate(updatedRecord); 
    };

    const handleToggleTrancheDelivery = async (id: string) => { 
        if (!selectedRecord) return; 
        const updatedTranches = (currencyForm.tranches || []).map(t => { 
            if (t.id === id) {
                const isDel = !t.isDelivered;
                const receivedAmt = isDel ? (t.receivedAmount || t.amount) : 0;
                return { ...t, isDelivered: isDel, receivedAmount: receivedAmt }; 
            }
            return t; 
        }); 
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); 
        const totalDelivered = updatedTranches.reduce((acc, t) => {
            const deliveriesSum = t.deliveries && t.deliveries.length > 0 ? t.deliveries.reduce((sum: number, d) => sum + d.amount, 0) : 0;
            return acc + (deliveriesSum || t.receivedAmount || (t.isDelivered ? t.amount : 0));
        }, 0); 
        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; 
        setCurrencyForm(updatedForm); 
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; 
        await persistRecordUpdate(updatedRecord); 
    };

    const handleAddTrancheDelivery = async () => {
        if (!selectedRecord || !selectedTrancheForDeliveries || !newDeliveryForm.amount) return;
        const rawAmt = deformatNumberString(String(newDeliveryForm.amount));
        if (rawAmt <= 0) return;

        const newDelivery: CurrencyDelivery = {
            id: generateUUID(),
            amount: rawAmt,
            date: newDeliveryForm.date || '',
            recipientName: newDeliveryForm.recipientName || '',
            description: newDeliveryForm.description || ''
        };

        const updatedTranches = (currencyForm.tranches || []).map(t => {
            if (t.id === selectedTrancheForDeliveries) {
                const currentDeliveries = t.deliveries || [];
                const updatedD = [...currentDeliveries, newDelivery];
                const sum = updatedD.reduce((acc, d) => acc + d.amount, 0);
                return {
                    ...t,
                    deliveries: updatedD,
                    receivedAmount: sum,
                    isDelivered: sum >= t.amount
                };
            }
            return t;
        });

        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const totalDelivered = updatedTranches.reduce((acc, t) => {
            const deliveriesSum = t.deliveries && t.deliveries.length > 0 ? t.deliveries.reduce((sum: number, d) => sum + d.amount, 0) : 0;
            return acc + (deliveriesSum || t.receivedAmount || (t.isDelivered ? t.amount : 0));
        }, 0);

        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };

        await persistRecordUpdate(updatedRecord);
        setNewDeliveryForm({ amount: '', date: '', recipientName: '', description: '' });
    };

    const handleRemoveTrancheDelivery = async (trancheId: string, deliveryId: string) => {
        if (!selectedRecord) return;
        if (!confirm('آیا از حذف این ردیف تحویل مطمئن هستید؟')) return;

        const updatedTranches = (currencyForm.tranches || []).map(t => {
            if (t.id === trancheId) {
                const updatedD = (t.deliveries || []).filter(d => d.id !== deliveryId);
                const sum = updatedD.reduce((acc, d) => acc + d.amount, 0);
                return {
                    ...t,
                    deliveries: updatedD,
                    receivedAmount: sum,
                    isDelivered: sum >= t.amount
                };
            }
            return t;
        });

        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const totalDelivered = updatedTranches.reduce((acc, t) => {
            const deliveriesSum = t.deliveries && t.deliveries.length > 0 ? t.deliveries.reduce((sum: number, d) => sum + d.amount, 0) : 0;
            return acc + (deliveriesSum || t.receivedAmount || (t.isDelivered ? t.amount : 0));
        }, 0);

        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };

        await persistRecordUpdate(updatedRecord);
    };
    const handleAddCurrencyGuarantee = async (newG: GuaranteeCheque) => {
        if (!selectedRecord) return;
        const currentGuarantees = currencyForm.guaranteeCheques || (currencyForm.guaranteeCheque ? [currencyForm.guaranteeCheque] : []);
        const updatedGuarantees = [...currentGuarantees, newG];
        const updatedForm: CurrencyPurchaseData = { 
            ...currencyForm, 
            guaranteeCheques: updatedGuarantees,
            guaranteeCheque: currencyForm.guaranteeCheque || newG 
        };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await persistRecordUpdate(updatedRecord);
        alert("چک ضمانت ارزی جدید با موفقیت ثبت شد.");
    };

    const handleDeleteCurrencyGuarantee = async (idx: number) => {
        if (!selectedRecord) return;
        if (!confirm('آیا قصد حذف این چک ضمانت ارزی را دارید؟')) return;
        const currentGuarantees = currencyForm.guaranteeCheques || (currencyForm.guaranteeCheque ? [currencyForm.guaranteeCheque] : []);
        const updatedGuarantees = currentGuarantees.filter((_, i) => i !== idx);
        const updatedForm: CurrencyPurchaseData = { 
            ...currencyForm, 
            guaranteeCheques: updatedGuarantees,
            guaranteeCheque: updatedGuarantees.length > 0 ? updatedGuarantees[0] : undefined
        };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await persistRecordUpdate(updatedRecord);
        alert("چک ضمانت ارزی مورد نظر حذف شد.");
    };

    const handleToggleCurrencyGuaranteeDelivery = async (idx?: number) => {
        if (!selectedRecord) return;
        const currentGuarantees = currencyForm.guaranteeCheques || (currencyForm.guaranteeCheque ? [currencyForm.guaranteeCheque] : []);
        if (currentGuarantees.length === 0) return;
        
        const targetIdx = typeof idx === 'number' ? idx : 0;
        const updatedGuarantees = currentGuarantees.map((item, i) => 
            i === targetIdx ? { ...item, isDelivered: !item.isDelivered } : item
        );
        const updatedForm: CurrencyPurchaseData = { 
            ...currencyForm, 
            guaranteeCheques: updatedGuarantees,
            guaranteeCheque: updatedGuarantees.length > 0 ? updatedGuarantees[0] : undefined
        };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await persistRecordUpdate(updatedRecord);
    };
    const handleAddInvoiceItem = () => { 
        if (!newInvoiceItem.name) return; 
        const weight = Number(newInvoiceItem.weight) || 0;
        const grossWeight = Number(newInvoiceItem.grossWeight) || weight;
        const unitPrice = Number(newInvoiceItem.unitPrice) || 0;
        const totalPrice = Number(newInvoiceItem.totalPrice) || (weight * unitPrice);
        const newItem: InvoiceItem = { 
            id: generateUUID(), 
            name: newInvoiceItem.name, 
            weight: weight, 
            grossWeight: grossWeight, 
            unitPrice: unitPrice, 
            totalPrice: totalPrice, 
            part: newInvoiceItem.part || '' 
        }; 
        setShippingDocForm(prev => ({ ...prev, invoiceItems: [...(prev.invoiceItems || []), newItem] })); 
        setNewInvoiceItem({ name: '', weight: 0, grossWeight: 0, unitPrice: 0, totalPrice: 0, part: '' }); 
    };
    const handleRemoveInvoiceItem = (id: string) => { setShippingDocForm(prev => ({ ...prev, invoiceItems: (prev.invoiceItems || []).filter(i => i.id !== id) })); };
    const handleAddPackingItem = () => { if (!newPackingItem.description) return; const item: PackingItem = { id: generateUUID(), description: newPackingItem.description, netWeight: Number(newPackingItem.netWeight), grossWeight: Number(newPackingItem.grossWeight), packageCount: Number(newPackingItem.packageCount), part: newPackingItem.part || '' }; setShippingDocForm(prev => ({ ...prev, packingItems: [...(prev.packingItems || []), item] })); setNewPackingItem({ description: '', netWeight: 0, grossWeight: 0, packageCount: 0, part: '' }); };
    const handleRemovePackingItem = (id: string) => { setShippingDocForm(prev => ({ ...prev, packingItems: (prev.packingItems || []).filter(i => i.id !== id) })); };
    const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingDocFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setShippingDocForm(prev => ({ ...prev, attachments: [...(prev.attachments || []), { fileName: result.fileName, url: result.url }] })); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploadingDocFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleSaveShippingDoc = async () => {
        if (!selectedRecord || !shippingDocForm.documentNumber) return;

        let currentInvoiceItems = [...(shippingDocForm.invoiceItems || [])];
        let currentPackingItems = [...(shippingDocForm.packingItems || [])];

        // Auto-add active inputs if user filled them but didn't click "+"
        if (activeShippingSubTab === 'Commercial Invoice' && newInvoiceItem.name?.trim()) {
            const weight = Number(newInvoiceItem.weight) || 0;
            const grossWeight = Number(newInvoiceItem.grossWeight) || weight;
            const unitPrice = Number(newInvoiceItem.unitPrice) || 0;
            const totalPrice = Number(newInvoiceItem.totalPrice) || (weight * unitPrice);
            const newItem: InvoiceItem = { 
                id: generateUUID(), 
                name: newInvoiceItem.name.trim(), 
                weight: weight, 
                grossWeight: grossWeight, 
                unitPrice: unitPrice, 
                totalPrice: totalPrice, 
                part: newInvoiceItem.part || '' 
            };
            currentInvoiceItems.push(newItem);
            setNewInvoiceItem({ name: '', weight: 0, grossWeight: 0, unitPrice: 0, totalPrice: 0, part: '' });
        } else if (activeShippingSubTab === 'Packing List' && newPackingItem.description?.trim()) {
            const item: PackingItem = { 
                id: generateUUID(), 
                description: newPackingItem.description.trim(), 
                netWeight: Number(newPackingItem.netWeight) || 0, 
                grossWeight: Number(newPackingItem.grossWeight) || 0, 
                packageCount: Number(newPackingItem.packageCount) || 0, 
                part: newPackingItem.part || '' 
            };
            currentPackingItems.push(item);
            setNewPackingItem({ description: '', netWeight: 0, grossWeight: 0, packageCount: 0, part: '' });
        }

        let totalNet = shippingDocForm.netWeight;
        let totalGross = shippingDocForm.grossWeight;
        let totalPackages = shippingDocForm.packagesCount;

        if (activeShippingSubTab === 'Commercial Invoice' && currentInvoiceItems.length > 0) {
            totalNet = currentInvoiceItems.reduce((acc, i) => acc + (i.weight || 0), 0);
            totalGross = currentInvoiceItems.reduce((acc, i) => acc + (i.grossWeight || i.weight || 0), 0);
        } else if (activeShippingSubTab === 'Packing List' && currentPackingItems.length > 0) {
            totalNet = currentPackingItems.reduce((acc, i) => acc + i.netWeight, 0);
            totalGross = currentPackingItems.reduce((acc, i) => acc + i.grossWeight, 0);
            totalPackages = currentPackingItems.reduce((acc, i) => acc + i.packageCount, 0);
        }

        const newDoc: ShippingDocument = {
            id: generateUUID(),
            type: activeShippingSubTab,
            status: shippingDocForm.status || 'Draft',
            documentNumber: shippingDocForm.documentNumber,
            documentDate: shippingDocForm.documentDate || '',
            createdAt: Date.now(),
            createdBy: currentUser.fullName,
            attachments: shippingDocForm.attachments || [],
            invoiceItems: activeShippingSubTab === 'Commercial Invoice' ? currentInvoiceItems : undefined,
            packingItems: activeShippingSubTab === 'Packing List' ? currentPackingItems : undefined,
            freightCost: activeShippingSubTab === 'Commercial Invoice' ? Number(shippingDocForm.freightCost) : undefined,
            currency: shippingDocForm.currency,
            netWeight: totalNet,
            grossWeight: totalGross,
            packagesCount: totalPackages,
            vesselName: shippingDocForm.vesselName,
            portOfLoading: shippingDocForm.portOfLoading,
            portOfDischarge: shippingDocForm.portOfDischarge,
            description: shippingDocForm.description
        };

        let updatedDocs = [...(selectedRecord.shippingDocuments || [])];
        if (editingShippingDocId) {
            updatedDocs = updatedDocs.map(d => d.id === editingShippingDocId ? {
                ...d,
                ...newDoc,
                id: editingShippingDocId,
                createdAt: d.createdAt || Date.now(),
                createdBy: d.createdBy || currentUser.fullName
            } : d);
        } else {
            updatedDocs.push(newDoc);
        }
        const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs };

        if (!updatedRecord.stages[TradeStage.SHIPPING_DOCS]) {
            updatedRecord.stages[TradeStage.SHIPPING_DOCS] = getStageData(updatedRecord, TradeStage.SHIPPING_DOCS);
        }

        if (activeShippingSubTab === 'Commercial Invoice') {
            updatedRecord.stages[TradeStage.SHIPPING_DOCS].costCurrency = updatedDocs
                .filter(d => d.type === 'Commercial Invoice')
                .reduce((acc, d) => acc + (d.invoiceItems?.reduce((sum, i) => sum + i.totalPrice, 0) || 0) + (d.freightCost || 0), 0);
        }

        await persistRecordUpdate(updatedRecord);
        setEditingShippingDocId(null);
        setShippingDocForm({
            status: 'Draft',
            documentNumber: '',
            documentDate: '',
            attachments: [],
            invoiceItems: [],
            packingItems: [],
            freightCost: 0
        });
    };
    const handleEditShippingDoc = (doc: ShippingDocument) => {
        setEditingShippingDocId(doc.id);
        setActiveShippingSubTab(doc.type);
        setShippingDocForm({
            status: doc.status || 'Draft',
            documentNumber: doc.documentNumber || '',
            documentDate: doc.documentDate || '',
            attachments: doc.attachments || [],
            invoiceItems: doc.invoiceItems || [],
            packingItems: doc.packingItems || [],
            freightCost: doc.freightCost || 0,
            currency: doc.currency,
            netWeight: doc.netWeight,
            grossWeight: doc.grossWeight,
            packagesCount: doc.packagesCount,
            vesselName: doc.vesselName,
            portOfLoading: doc.portOfLoading,
            portOfDischarge: doc.portOfDischarge,
            description: doc.description
        });
    };
    const handleCancelEditShippingDoc = () => {
        setEditingShippingDocId(null);
        setShippingDocForm({
            status: 'Draft',
            documentNumber: '',
            documentDate: '',
            attachments: [],
            invoiceItems: [],
            packingItems: [],
            freightCost: 0
        });
    };
    const handleDeleteShippingDoc = async (id: string) => { 
        if (!selectedRecord) return; 
        if (editingShippingDocId === id) handleCancelEditShippingDoc();
        const updatedDocs = (selectedRecord.shippingDocuments || []).filter(d => d.id !== id); 
        const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs }; 
        await persistRecordUpdate(updatedRecord); 
    };
    const handleSyncInvoiceToProforma = async () => { 
        if (!selectedRecord) return; 
        if (!confirm('آیا مطمئن هستید؟ این عملیات اقلام و هزینه حمل پروفرما را با مقادیر این اینویس جایگزین می‌کند و نسخه فعلی به عنوان سابقه و بایگانی در پرونده ذخیره خواهد شد.')) return; 
        
        const historyEntry: ProformaHistoryEntry = {
            id: generateUUID(),
            items: JSON.parse(JSON.stringify(selectedRecord.items || [])),
            freightCost: selectedRecord.freightCost || 0,
            updatedAt: Date.now(),
            updatedBy: currentUser.fullName,
            description: 'جایگزینی اقلام پروفرما با اینویس حمل',
            proformaNumber: selectedRecord.proformaNumber,
            orderNumber: selectedRecord.orderNumber,
            fileNumber: selectedRecord.fileNumber,
            registrationNumber: selectedRecord.registrationNumber,
            registrationDate: selectedRecord.registrationDate,
            goodsName: selectedRecord.goodsName,
            commodityGroup: selectedRecord.commodityGroup,
            sellerName: selectedRecord.sellerName,
            company: selectedRecord.company,
            mainCurrency: selectedRecord.mainCurrency,
            operatingBank: selectedRecord.operatingBank,
            startDate: selectedRecord.startDate,
            sourceRecordId: selectedRecord.id,
            attachments: selectedRecord.attachments ? [...selectedRecord.attachments] : [],
            recordSnapshot: JSON.parse(JSON.stringify(selectedRecord))
        };
        const existingHistory = selectedRecord.proformaHistory || [];

        const invoiceItems = shippingDocForm.invoiceItems || []; 
        const aggregatedMap = new Map<string, { weight: number, grossWeight: number, totalPrice: number }>(); 
        for (const item of invoiceItems) { 
            const name = item.name.trim(); 
            const current = aggregatedMap.get(name) || { weight: 0, grossWeight: 0, totalPrice: 0 }; 
            aggregatedMap.set(name, { 
                weight: current.weight + (item.weight || 0), 
                grossWeight: current.grossWeight + (item.grossWeight || item.weight || 0),
                totalPrice: current.totalPrice + (item.totalPrice || 0) 
            }); 
        } 
        const newItems: TradeItem[] = []; 
        aggregatedMap.forEach((val, name) => { 
            newItems.push({ 
                id: generateUUID(), 
                name: name, 
                weight: val.weight, 
                grossWeight: val.grossWeight,
                unitPrice: val.weight > 0 ? val.totalPrice / val.weight : 0, 
                totalPrice: val.totalPrice, 
                hsCode: '' 
            }); 
        }); 
        const updatedRecord = { 
            ...selectedRecord, 
            items: newItems, 
            freightCost: Number(shippingDocForm.freightCost) || 0,
            proformaHistory: [historyEntry, ...existingHistory]
        }; 
        await persistRecordUpdate(updatedRecord); 
        alert('پروفرما با موفقیت بروزرسانی شد و نسخه قبلی در تاریخچه و بایگانی پرونده ذخیره گردید.'); 
    };

    const handleExecuteTransferProforma = async () => {
        if (!selectedRecord) return;
        if (!transferForm.targetCommodityGroup || !transferForm.newFileNumber || !transferForm.newGoodsName) {
            alert('لطفاً گروه کالایی مقصد، شماره پرونده جدید و نام کالای جدید را وارد نمایید.');
            return;
        }

        const newGoodsNameClean = transferForm.newGoodsName.trim();
        
        const historicalProformaSnapshot: ProformaHistoryEntry = {
            id: generateUUID(),
            items: JSON.parse(JSON.stringify(selectedRecord.items || [])),
            freightCost: selectedRecord.freightCost || 0,
            updatedAt: Date.now(),
            updatedBy: currentUser.fullName,
            description: `انتقال ثبت سفارش از پرونده ${selectedRecord.fileNumber} (${selectedRecord.goodsName} - گروه ${selectedRecord.commodityGroup}) به این پرونده جدید (${newGoodsNameClean} - گروه ${transferForm.targetCommodityGroup})`,
            proformaNumber: selectedRecord.proformaNumber,
            orderNumber: selectedRecord.orderNumber,
            fileNumber: selectedRecord.fileNumber,
            registrationNumber: selectedRecord.registrationNumber,
            registrationDate: selectedRecord.registrationDate,
            goodsName: selectedRecord.goodsName,
            commodityGroup: selectedRecord.commodityGroup,
            sellerName: selectedRecord.sellerName,
            company: selectedRecord.company,
            mainCurrency: selectedRecord.mainCurrency,
            operatingBank: selectedRecord.operatingBank,
            startDate: selectedRecord.startDate,
            sourceRecordId: selectedRecord.id,
            attachments: selectedRecord.attachments ? [...selectedRecord.attachments] : [],
            recordSnapshot: JSON.parse(JSON.stringify(selectedRecord))
        };

        const newRecord: TradeRecord = {
            ...selectedRecord,
            id: generateUUID(),
            fileNumber: transferForm.newFileNumber.trim(),
            goodsName: newGoodsNameClean,
            sellerName: transferForm.newSellerName?.trim() || selectedRecord.sellerName,
            commodityGroup: transferForm.targetCommodityGroup.trim(),
            startDate: new Date().toLocaleDateString('fa-IR'),
            createdAt: Date.now(),
            createdBy: currentUser.fullName,
            transferredFrom: {
                fileNumber: selectedRecord.fileNumber,
                goodsName: selectedRecord.goodsName,
                commodityGroup: selectedRecord.commodityGroup,
                recordId: selectedRecord.id,
                proformaNumber: selectedRecord.proformaNumber,
                registrationNumber: selectedRecord.registrationNumber,
                sellerName: selectedRecord.sellerName,
                mainCurrency: selectedRecord.mainCurrency
            },
            proformaHistory: [
                historicalProformaSnapshot,
                ...(selectedRecord.proformaHistory || [])
            ]
        };

        // Delete the previous record from database completely so it NEVER remains in the old group or in archive!
        const oldRecordId = selectedRecord.id;
        try {
            await deleteTradeRecord(oldRecordId);
        } catch (err) {
            console.error("Failed to delete transferred old record:", err);
        }
        await saveTradeRecord(newRecord);

        // Update local state immediately
        setRecords(prev => prev.filter(r => r.id !== oldRecordId && !r.transferredTo).concat(newRecord));

        setShowTransferModal(false);
        alert('پرونده با موفقیت به گروه جدید منتقل شد و پروفرم جدید ثبت گردید. پرونده قبلی از گروه و بایگانی گذشته حذف شد.');
        setSelectedRecord(newRecord);
        setSelectedGroup(transferForm.targetCommodityGroup.trim());
        setNavLevel('GROUP');
        setShowArchived(false);
        setViewMode('dashboard');
        await loadRecords();
    };
    const handleStageClick = (stage: TradeStage) => { 
        if (stage === TradeStage.ALLOCATION_QUEUE || stage === TradeStage.ALLOCATION_APPROVED) {
            setActiveTab('allocation');
            return;
        }
        const data = getStageData(selectedRecord, stage); 
        setEditingStage(stage); 
        setStageFormData(data); 
    };
    const handleStageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingStageFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setStageFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), { fileName: result.fileName, url: result.url }] })); } catch (error) { alert('خطا در آپلود'); } finally { setUploadingStageFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleSaveStage = async () => { 
        if (!selectedRecord || !editingStage) return; 
        const updatedRecord = { ...selectedRecord }; 
        updatedRecord.stages[editingStage] = { ...getStageData(selectedRecord, editingStage), ...stageFormData, updatedAt: Date.now(), updatedBy: currentUser.fullName }; 
        if (editingStage === TradeStage.ALLOCATION_QUEUE && stageFormData.queueDate) { 
            updatedRecord.stages[TradeStage.ALLOCATION_QUEUE].queueDate = stageFormData.queueDate; 
            if (!updatedRecord.currencyPurchaseData) {
                updatedRecord.currencyPurchaseData = { payments: [], purchasedAmount: 0, purchasedCurrencyType: updatedRecord.mainCurrency || 'EUR' };
            }
            updatedRecord.currencyPurchaseData.queueEntryDate = stageFormData.queueDate;
        } 
        if (editingStage === TradeStage.ALLOCATION_APPROVED) { 
            updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationDate = stageFormData.allocationDate; 
            updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationCode = stageFormData.allocationCode; 
            updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationExpiry = stageFormData.allocationExpiry; 
            if (!updatedRecord.currencyPurchaseData) {
                updatedRecord.currencyPurchaseData = { payments: [], purchasedAmount: 0, purchasedCurrencyType: updatedRecord.mainCurrency || 'EUR' };
            }
            updatedRecord.currencyPurchaseData.allocationDate = stageFormData.allocationDate;
            updatedRecord.currencyPurchaseData.allocationCode = stageFormData.allocationCode;
            updatedRecord.currencyPurchaseData.allocationExpiryDate = stageFormData.allocationExpiry;
        } 
        await persistRecordUpdate(updatedRecord); 
        setEditingStage(null); 
    };
    const toggleCommitment = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, isCommitmentFulfilled: !selectedRecord.isCommitmentFulfilled }; await persistRecordUpdate(updatedRecord); };
    const handleArchiveRecord = async () => { if (!selectedRecord) return; if (!confirm('آیا از انتقال این پرونده به بایگانی (ترخیص شده) اطمینان دارید؟')) return; const updatedRecord = { ...selectedRecord, isArchived: true, status: 'Completed' as const }; await persistRecordUpdate(updatedRecord); alert('پرونده با موفقیت بایگانی شد.'); setViewMode('dashboard'); loadRecords(); };
    const handleUnarchiveRecord = async () => { if (!selectedRecord) return; if (!confirm('آیا از بازگرداندن این پرونده به جریان کاری اطمینان دارید؟')) return; const updatedRecord = { ...selectedRecord, isArchived: false, status: 'Active' as const }; await persistRecordUpdate(updatedRecord); alert('پرونده بازیابی شد.'); };
    const getAllGuarantees = () => {
        const list: any[] = [];
        if (selectedRecord && selectedRecord.currencyPurchaseData) {
            const currencyGuarantees = selectedRecord.currencyPurchaseData.guaranteeCheques || 
                (selectedRecord.currencyPurchaseData.guaranteeCheque ? [selectedRecord.currencyPurchaseData.guaranteeCheque] : []);
            currencyGuarantees.forEach((g, idx) => {
                list.push({
                    id: `currency_g_${idx}`,
                    type: 'ارزی',
                    number: g.chequeNumber,
                    bank: g.bank,
                    amount: g.amount,
                    dueDate: g.dueDate || '',
                    isDelivered: g.isDelivered,
                    toggleFunc: () => handleToggleCurrencyGuaranteeDelivery(idx)
                });
            });
        }
        if (selectedRecord && selectedRecord.greenLeafData?.guarantees) {
            selectedRecord.greenLeafData.guarantees.forEach(g => {
                list.push({
                    id: g.id,
                    type: 'گمرکی',
                    number: g.guaranteeNumber + (g.sepamNumber ? ` / سپام: ${g.sepamNumber}` : '') + (g.guaranteeType === 'credit' ? ' (حد اعتبار)' : (g.chequeNumber ? ` / چک: ${g.chequeNumber}` : '')),
                    bank: g.guaranteeBank || (g.guaranteeType === 'credit' ? 'حد اعتبار بانکی' : (g.chequeBank || 'مشخص‌نشده')),
                    amount: g.guaranteeAmount || g.chequeAmount || 0,
                    dueDate: g.dueDate || g.chequeDate || g.cashDate || '',
                    isDelivered: g.isDelivered,
                    toggleFunc: () => handleToggleGuaranteeDelivery(g.id)
                });
            });
        }
        return list;
    };

    const openEditMetadata = () => {
        if (!selectedRecord) return;
        setEditMetadataForm({
            fileNumber: selectedRecord.fileNumber || '',
            proformaNumber: selectedRecord.proformaNumber || '',
            orderNumber: selectedRecord.orderNumber || '',
            goodsName: selectedRecord.goodsName,
            sellerName: selectedRecord.sellerName,
            mainCurrency: selectedRecord.mainCurrency,
            commodityGroup: selectedRecord.commodityGroup,
            company: selectedRecord.company,
            registrationNumber: selectedRecord.registrationNumber || '',
            operatingBank: selectedRecord.operatingBank || '',
            isInTransit: selectedRecord.isInTransit || false,
            isInCustoms: selectedRecord.isInCustoms || false
        });
        setShowEditMetadataModal(true);
    };

    const saveMetadata = async () => {
        if (!selectedRecord) return;

        const isGoodsOrRegChanged = 
            (editMetadataForm.goodsName && editMetadataForm.goodsName.trim() !== (selectedRecord.goodsName || '').trim()) ||
            (editMetadataForm.registrationNumber !== undefined && editMetadataForm.registrationNumber.trim() !== (selectedRecord.registrationNumber || '').trim()) ||
            (editMetadataForm.proformaNumber !== undefined && editMetadataForm.proformaNumber.trim() !== (selectedRecord.proformaNumber || '').trim()) ||
            (editMetadataForm.commodityGroup && editMetadataForm.commodityGroup.trim() !== (selectedRecord.commodityGroup || '').trim());

        let updatedHistory = selectedRecord.proformaHistory ? [...selectedRecord.proformaHistory] : [];
        
        if (isGoodsOrRegChanged) {
            const historyEntry: ProformaHistoryEntry = {
                id: generateUUID(),
                items: JSON.parse(JSON.stringify(selectedRecord.items || [])),
                freightCost: selectedRecord.freightCost || 0,
                updatedAt: Date.now(),
                updatedBy: currentUser.fullName,
                description: `تغییر مشخصات پرونده/ثبت سفارش: از «${selectedRecord.goodsName || '---'}» (ثبت: ${selectedRecord.registrationNumber || '---'} / گروه: ${selectedRecord.commodityGroup || '---'}) به «${editMetadataForm.goodsName}» (ثبت: ${editMetadataForm.registrationNumber || '---'} / گروه: ${editMetadataForm.commodityGroup || '---'})`,
                proformaNumber: selectedRecord.proformaNumber,
                orderNumber: selectedRecord.orderNumber,
                fileNumber: selectedRecord.fileNumber,
                registrationNumber: selectedRecord.registrationNumber,
                registrationDate: selectedRecord.registrationDate,
                goodsName: selectedRecord.goodsName,
                commodityGroup: selectedRecord.commodityGroup,
                sellerName: selectedRecord.sellerName,
                company: selectedRecord.company,
                mainCurrency: selectedRecord.mainCurrency,
                operatingBank: selectedRecord.operatingBank,
                startDate: selectedRecord.startDate,
                sourceRecordId: selectedRecord.id,
                attachments: selectedRecord.attachments ? [...selectedRecord.attachments] : [],
                recordSnapshot: JSON.parse(JSON.stringify(selectedRecord))
            };
            updatedHistory = [historyEntry, ...updatedHistory];
        }

        const updatedRecord = { 
            ...selectedRecord, 
            ...editMetadataForm,
            proformaHistory: updatedHistory
        };
        await persistRecordUpdate(updatedRecord);
        setShowEditMetadataModal(false);
        alert('مشخصات پرونده بروزرسانی شد و سابقه تغییرات در بخش بایگانی پروفرما ثبت گردید.');
    };

    const handlePrintReport = () => {
        window.print();
    };

    const handlePrintTrade = () => {
        setShowFinalReportPrint(true);
    };

    const handleDownloadFinalReportPDF = () => {
        setShowFinalReportPrint(true);
    };

    const renderReportContent = useMemo(() => {
        const safeSettings = settings || { currentTrackingNumber: 1000, currentExitPermitNumber: 1000, companyNames: [], companies: [], defaultCompany: '', bankNames: [], operatingBankNames: [], commodityGroups: [], rolePermissions: {}, savedContacts: [], warehouseSequences: {}, companyNotifications: {}, insuranceCompanies: [] };

        const currentList = (Array.isArray(records) ? records : []).filter(r => !r.transferredTo);
        const searchedList = reportSearchTerm.trim()
            ? currentList.filter(r => matchesTradeRecord(r, reportSearchTerm))
            : currentList;

        switch (activeReport) {
            case 'general':
                return (
                    <GeneralTradeListReport 
                        records={searchedList.filter(r => !reportFilterCompany || r.company === reportFilterCompany)}
                        currentUser={currentUser}
                        settings={safeSettings}
                        onUpdateRecord={async (updated) => {
                            await updateTradeRecord(updated);
                            setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
                            if (selectedRecord?.id === updated.id) {
                                setSelectedRecord(updated);
                            }
                        }}
                        onNavigateToDetails={(rec, tab) => {
                            setSelectedRecord(rec);
                            setViewMode('details');
                            if (tab) setActiveTab(tab as any);
                        }}
                    />
                );
            case 'allocation_queue':
                return <AllocationReport records={searchedList.filter(r => !reportFilterCompany || r.company === reportFilterCompany)} onUpdateRecord={async (r, u) => { const updated = {...r, ...u}; await updateTradeRecord(updated); setRecords(prev => prev.map(rec => rec.id === updated.id ? updated : rec)); }} settings={safeSettings} />;
            case 'currency':
                return (
                    <CurrencyReport 
                        records={searchedList.filter(r => !reportFilterCompany || r.company === reportFilterCompany)} 
                        onSelectTranche={(recordId, trancheId) => {
                            const rec = records.find(r => r.id === recordId);
                            if (rec) {
                                setSelectedRecord(rec);
                                setViewMode('details');
                                setActiveTab('currency_purchase');
                                if (trancheId && trancheId !== 'main') {
                                    setTimeout(() => {
                                        setSelectedTrancheForDeliveries(trancheId);
                                        setNewDeliveryForm({ amount: '', date: '', recipientName: '', description: '' });
                                    }, 150);
                                }
                            }
                        }}
                    />
                );
            case 'company_performance':
                return <CompanyPerformanceReport records={searchedList} />;
            case 'insurance_ledger':
                return <InsuranceLedgerReport records={searchedList.filter(r => !reportFilterCompany || r.company === reportFilterCompany)} settings={safeSettings} />; 
            case 'guarantee':
                return <GuaranteeReport records={searchedList.filter(r => !reportFilterCompany || r.company === reportFilterCompany)} />;
            default:
                return <div className="p-8 text-center text-gray-500">گزارش در حال تکمیل است...</div>;
        }
    }, [activeReport, records, reportFilterCompany, reportSearchTerm, settings]);

    if (viewMode === 'reports') {
        return (
            <div className="flex flex-col md:h-[calc(100vh-100px)] bg-gray-50 md:rounded-2xl md:overflow-hidden md:border touch-pan-y">
                
                {/* --- RESPONSIVE HEADER NAV FOR MOBILE --- */}
                <div className="md:hidden sticky top-0 glass-panel border-b p-3 flex flex-wrap gap-2 justify-center shadow-sm z-20">
                    <button type="button" onClick={() => setViewMode('dashboard')} className="p-2 bg-gray-100 rounded-lg"><ChevronRight size={20}/></button>
                    <button type="button" onClick={() => setActiveReport('general')} className={`px-3 py-1.5 rounded-lg text-xs border ${activeReport === 'general' ? 'bg-blue-600 text-white' : 'glass-panel text-gray-700'}`}>لیست کلی</button>
                    <button type="button" onClick={() => setActiveReport('allocation_queue')} className={`px-3 py-1.5 rounded-lg text-xs border ${activeReport === 'allocation_queue' ? 'bg-blue-600 text-white' : 'glass-panel text-gray-700'}`}>صف تخصیص</button>
                    <button type="button" onClick={() => setActiveReport('currency')} className={`px-3 py-1.5 rounded-lg text-xs border ${activeReport === 'currency' ? 'bg-blue-600 text-white' : 'glass-panel text-gray-700'}`}>خرید ارز</button>
                    <button type="button" onClick={() => setActiveReport('guarantee')} className={`px-3 py-1.5 rounded-lg text-xs border ${activeReport === 'guarantee' ? 'bg-blue-600 text-white' : 'glass-panel text-gray-700'}`}>تضامین</button>
                    <button type="button" onClick={() => setActiveReport('insurance_ledger')} className={`px-3 py-1.5 rounded-lg text-xs border ${activeReport === 'insurance_ledger' ? 'bg-blue-600 text-white' : 'glass-panel text-gray-700'}`}>بیمه</button>
                    <button type="button" onClick={() => setActiveReport('company_performance')} className={`px-3 py-1.5 rounded-lg text-xs border ${activeReport === 'company_performance' ? 'bg-blue-600 text-white' : 'glass-panel text-gray-700'}`}>عملکرد</button>
                </div>

                <div className="flex flex-1 md:overflow-hidden">
                    {/* Desktop Sidebar (Hidden on Mobile) */}
                    <div className="hidden md:flex w-64 glass-panel border-l p-4 flex-col gap-2 flex-shrink-0 h-full overflow-y-auto z-10">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FileSpreadsheet size={20}/> گزارشات بازرگانی</h3>
                        
                        <div className="mb-2 relative">
                            <input 
                                className="w-full border rounded p-2 text-sm pl-8" 
                                placeholder="جستجو..." 
                                value={reportSearchTerm} 
                                onChange={e => setReportSearchTerm(e.target.value)}
                            />
                            <Search size={16} className="absolute left-2 top-2.5 text-gray-400"/>
                        </div>

                        <div className="mb-4"><label className="text-xs font-bold text-gray-500 mb-1 block">فیلتر شرکت</label><select className="w-full border rounded p-1 text-sm" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}><option value="">همه شرکت‌ها</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        <div className="flex flex-col gap-2">
                            <button type="button" onClick={() => setActiveReport('general')} className={`p-2 rounded text-right text-sm ${activeReport === 'general' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>📄 لیست کلی پرونده‌ها</button>
                            <button type="button" onClick={() => setActiveReport('allocation_queue')} className={`p-2 rounded text-right text-sm ${activeReport === 'allocation_queue' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>⏳ در صف تخصیص</button>
                            <button type="button" onClick={() => setActiveReport('currency')} className={`p-2 rounded text-right text-sm ${activeReport === 'currency' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>💰 وضعیت خرید ارز</button>
                            <button type="button" onClick={() => setActiveReport('guarantee')} className={`p-2 rounded text-right text-sm ${activeReport === 'guarantee' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>🛡️ گزارش چک‌های تضمین</button>
                            <button type="button" onClick={() => setActiveReport('insurance_ledger')} className={`p-2 rounded text-right text-sm ${activeReport === 'insurance_ledger' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>📑 صورتحساب بیمه</button>
                            <button type="button" onClick={() => setActiveReport('company_performance')} className={`p-2 rounded text-right text-sm ${activeReport === 'company_performance' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>📊 عملکرد شرکت‌ها</button>
                        </div>
                        <div className="mt-auto pt-4">
                            <button type="button" onClick={handlePrintReport} className="w-full flex items-center justify-center gap-2 border p-2 rounded hover:bg-gray-50 text-gray-600"><Printer size={16}/> چاپ گزارش</button>
                            <button type="button" onClick={() => setViewMode('dashboard')} className="w-full mt-2 flex items-center justify-center gap-2 bg-gray-800 text-white p-2 rounded hover:bg-gray-900">بازگشت به داشبورد</button>
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 p-2 md:p-6 md:overflow-y-auto flex flex-col w-full min-h-0 bg-gray-50 dark:bg-zinc-900 custom-scrollbar overscroll-y-auto touch-pan-y pb-24 md:pb-6">
                        <h2 className="text-xl font-bold mb-4 hidden md:block">
                            {activeReport === 'general' ? 'لیست کلی پرونده‌ها' : 
                            activeReport === 'allocation_queue' ? 'گزارش صف تخصیص' : 
                            activeReport === 'currency' ? 'گزارش وضعیت خرید ارز' : 
                            activeReport === 'company_performance' ? 'خلاصه عملکرد شرکت‌ها' : 
                            activeReport === 'insurance_ledger' ? 'صورتحساب و مانده بیمه' :
                            activeReport === 'guarantee' ? 'گزارش جامع چک‌های تضمین' :
                            'گزارش'}
                        </h2>
                        <div className="w-full flex-1">
                            {renderReportContent}
                        </div>
                    </div>
                </div>
            </div>
        );
    }


    const renderTrancheDeliveriesModal = () => {
        if (!selectedTrancheForDeliveries) return null;
        const tr = (selectedRecord?.currencyPurchaseData?.tranches || []).find((t) => t.id === selectedTrancheForDeliveries) || 
                   currencyForm.tranches?.find(t => t.id === selectedTrancheForDeliveries);
        if (!tr) return null;
        const deliveries = tr.deliveries || [];
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4">
                <div className="glass-panel rounded-2xl shadow-xl w-full max-w-2xl bg-white p-6 animate-scale-in max-h-[90vh] overflow-y-auto text-right" dir="rtl">
                    <div className="flex justify-between items-center mb-6 border-b pb-3">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                            <Coins size={22} className="text-green-600"/>
                            ثبت و مدیریت تحویل‌های پارت
                        </h3>
                        <button type="button" onClick={() => setSelectedTrancheForDeliveries(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400 hover:text-red-500" /></button>
                    </div>

                    {/* Tranche Specs Card */}
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div><span className="text-gray-500 block">مبلغ کل پارت:</span><span className="font-bold font-mono text-amber-800 text-sm">{formatNumberString(tr.amount)} {tr.currencyType}</span></div>
                        <div><span className="text-gray-500 block">کل هزینه ریالی:</span><span className="font-bold font-mono text-gray-800">{formatNumberString(tr.rialAmount || 0)} ریال</span></div>
                        <div><span className="text-gray-500 block">صرافی/کارگزار:</span><span className="font-bold">{tr.exchangeName || '-'} {tr.brokerName ? `(${tr.brokerName})` : ''}</span></div>
                        <div><span className="text-gray-500 block">تاریخ خرید:</span><span className="font-bold">{tr.date || '-'}</span></div>
                    </div>

                    {/* Add Delivery Form */}
                    <div className="border p-4 rounded-xl mb-6 bg-gray-50 text-right">
                        <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-1">افزودن تحویل جدید</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">مقدار تحویلی *</label>
                                <FormattedNumberInput 
                                    className="w-full border rounded-lg p-2 text-sm dir-ltr font-bold text-green-700 bg-white" 
                                    value={newDeliveryForm.amount} 
                                    onChange={() => {}}
                                    onChangeString={str => setNewDeliveryForm({...newDeliveryForm, amount: str})}
                                    placeholder="مقدار ارز..." 
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">تاریخ تحویل</label>
                                <TradeDatePicker 
                                    value={newDeliveryForm.date} 
                                    onChange={val => setNewDeliveryForm({...newDeliveryForm, date: val})} 
                                    placeholder="۱۴۰۳/۰۱/۰۱" 
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600 font-sans">تحویل‌گیرنده</label>
                                <input 
                                    className="w-full border rounded-lg p-2 text-sm bg-white" 
                                    value={newDeliveryForm.recipientName} 
                                    onChange={e => setNewDeliveryForm({...newDeliveryForm, recipientName: e.target.value})} 
                                    placeholder="نام شخص..." 
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600 font-sans">توضیحات</label>
                                <input 
                                    className="w-full border rounded-lg p-2 text-sm bg-white" 
                                    value={newDeliveryForm.description} 
                                    onChange={e => setNewDeliveryForm({...newDeliveryForm, description: e.target.value})} 
                                    placeholder="توضیحات..." 
                                />
                            </div>
                        </div>
                        <button type="button" 
                            onClick={handleAddTrancheDelivery} 
                            className="mt-4 w-full bg-green-600 text-white rounded-lg p-2 font-bold hover:bg-green-700 text-sm transition-all flex items-center justify-center gap-1"
                        >
                            <Plus size={16}/> ثبت تحویل
                        </button>
                    </div>

                    {/* Deliveries List */}
                    <h4 className="font-bold text-sm text-gray-700 mb-3">تحویل‌های ثبت شده</h4>
                    {deliveries.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">تحویلی برای این پارت ثبت نشده است.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-right mt-1">
                                <thead className="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th className="p-3">تاریخ</th>
                                        <th className="p-3">مقدار تحویلی</th>
                                        <th className="p-3">تحویل‌گیرنده</th>
                                        <th className="p-3">توضیحات</th>
                                        <th className="p-3">حذف</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deliveries.map((delivery) => (
                                        <tr key={delivery.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 font-mono">{delivery.date || '-'}</td>
                                            <td className="p-3 font-mono font-bold text-green-705">{formatNumberString(delivery.amount)} {tr.currencyType}</td>
                                            <td className="p-3">{delivery.recipientName || '-'}</td>
                                            <td className="p-3 text-gray-500">{delivery.description || '-'}</td>
                                            <td className="p-3">
                                                <button type="button" 
                                                    onClick={() => handleRemoveTrancheDelivery(tr.id, delivery.id)} 
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-green-50 font-bold">
                                    <tr>
                                        <td className="p-3">مجموع تحویل‌ها</td>
                                        <td className="p-3 font-mono text-green-800">{formatNumberString(deliveries.reduce((sum, d) => sum + d.amount, 0))} {tr.currencyType}</td>
                                        <td colSpan={3}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderTransferModal = () => {
        if (!showTransferModal) return null;
        return createPortal(
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-xl p-6 md:p-8 border border-gray-200 dark:border-gray-800 text-right max-h-[90vh] overflow-y-auto my-auto animate-scale-in" dir="rtl">
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                        <div>
                            <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">انتقال پروفرم به گروه کالایی دیگر</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">انتقال این پرونده به گروه جدید همراه با مشخصات و پروفرم جدید</p>
                        </div>
                        <button type="button" onClick={() => setShowTransferModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"><X size={22} className="text-gray-400 hover:text-red-500" /></button>
                    </div>
                    <div className="space-y-4 text-gray-800 dark:text-gray-200">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">گروه کالایی مقصد *</label>
                            <input list="commodity-groups-transfer" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-500 outline-none" value={transferForm.targetCommodityGroup} onChange={e => setTransferForm({...transferForm, targetCommodityGroup: e.target.value})} placeholder="مثلا: چیپس..." />
                            <datalist id="commodity-groups-transfer">{commodityGroups.map(g => <option key={g} value={g} />)}</datalist>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شماره پرونده / پروفرم جدید *</label>
                            <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm outline-none" value={transferForm.newFileNumber} onChange={e => setTransferForm({...transferForm, newFileNumber: e.target.value})} placeholder="File No..." />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">نام و مشخصات کالای جدید *</label>
                            <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none" value={transferForm.newGoodsName} onChange={e => setTransferForm({...transferForm, newGoodsName: e.target.value})} placeholder="نام مشخصات پروفرم جدید..." />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">فروشنده جدید (اختیاری)</label>
                            <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none" value={transferForm.newSellerName} onChange={e => setTransferForm({...transferForm, newSellerName: e.target.value})} placeholder="نام فروشنده..." />
                        </div>
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                            <button type="button" onClick={() => setShowTransferModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">انصراف</button>
                            <button type="button" onClick={handleExecuteTransferProforma} disabled={!transferForm.targetCommodityGroup || !transferForm.newFileNumber || !transferForm.newGoodsName} className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 shadow-lg shadow-amber-600/20 disabled:opacity-50 transition-all">تایید و انتقال</button>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    const buildHistoricalProformaRecord = (
        hist: ProformaHistoryEntry, 
        currentRecord: TradeRecord,
        recordsList: TradeRecord[]
    ): TradeRecord => {
        // 1. If hist.recordSnapshot exists and has items
        if (hist.recordSnapshot && hist.recordSnapshot.items && hist.recordSnapshot.items.length > 0) {
            return {
                ...hist.recordSnapshot,
                items: (hist.items && hist.items.length > 0) ? hist.items : hist.recordSnapshot.items,
                freightCost: hist.freightCost !== undefined ? hist.freightCost : (hist.recordSnapshot.freightCost || 0)
            };
        }

        // 2. Look for source record in recordsList
        const sourceRec = recordsList.find(r => 
            (hist.sourceRecordId && r.id === hist.sourceRecordId) ||
            (hist.fileNumber && r.fileNumber === hist.fileNumber && r.id !== currentRecord.id)
        );
        if (sourceRec) {
            return {
                ...sourceRec,
                items: (hist.items && hist.items.length > 0) ? hist.items : (sourceRec.items || []),
                freightCost: hist.freightCost !== undefined ? hist.freightCost : (sourceRec.freightCost || 0),
                goodsName: hist.goodsName || sourceRec.goodsName,
                proformaNumber: hist.proformaNumber || sourceRec.proformaNumber,
                orderNumber: hist.orderNumber || sourceRec.orderNumber,
                registrationNumber: hist.registrationNumber || sourceRec.registrationNumber,
                commodityGroup: hist.commodityGroup || sourceRec.commodityGroup
            };
        }

        // 3. Fallback: virtual record with fallback to currentRecord attributes
        return {
            ...currentRecord,
            id: hist.id || `hist-${Date.now()}`,
            fileNumber: hist.fileNumber || currentRecord.transferredFrom?.fileNumber || currentRecord.fileNumber,
            proformaNumber: hist.proformaNumber || (currentRecord.transferredFrom ? '' : currentRecord.proformaNumber) || '',
            orderNumber: hist.orderNumber || currentRecord.orderNumber || '',
            registrationNumber: hist.registrationNumber || (currentRecord.transferredFrom ? '---' : currentRecord.registrationNumber) || '',
            registrationDate: hist.registrationDate || currentRecord.registrationDate || '',
            goodsName: hist.goodsName || currentRecord.transferredFrom?.goodsName || currentRecord.goodsName,
            commodityGroup: hist.commodityGroup || currentRecord.transferredFrom?.commodityGroup || currentRecord.commodityGroup,
            sellerName: hist.sellerName || currentRecord.sellerName,
            company: hist.company || currentRecord.company,
            mainCurrency: hist.mainCurrency || currentRecord.mainCurrency || 'USD',
            operatingBank: hist.operatingBank || currentRecord.operatingBank || '',
            startDate: hist.startDate || (hist.updatedAt ? new Date(hist.updatedAt).toLocaleDateString('fa-IR') : currentRecord.startDate),
            freightCost: hist.freightCost !== undefined ? hist.freightCost : (currentRecord.freightCost || 0),
            items: hist.items || []
        };
    };

    const getAllPreviousProformas = (record: TradeRecord | null, recordsList: TradeRecord[]) => {
        if (!record) return [];
        const list: Array<{
            key: string;
            source: 'history' | 'transferredFrom';
            historyEntry?: ProformaHistoryEntry;
            proformaRecord: TradeRecord;
            goodsName: string;
            commodityGroup: string;
            fileNumber: string;
            registrationNumber?: string;
            proformaNumber?: string;
            sellerName: string;
            dateLabel: string;
            userLabel?: string;
            description: string;
            itemsCount: number;
            totalWeight: number;
            totalGrossWeight: number;
            totalFob: number;
            freightCost: number;
            totalGrand: number;
            currency: string;
            canOpenSourceRecord?: boolean;
            sourceRecordId?: string;
        }> = [];

        // 1. Process proformaHistory
        if (record.proformaHistory && record.proformaHistory.length > 0) {
            record.proformaHistory.forEach((hist, idx) => {
                const profRec = buildHistoricalProformaRecord(hist, record, recordsList);
                const totalW = (profRec.items || []).reduce((s, i) => s + (i.weight || 0), 0);
                const totalGW = (profRec.items || []).reduce((s, i) => s + (i.grossWeight || i.weight || 0), 0);
                const totalFob = (profRec.items || []).reduce((s, i) => s + (i.totalPrice || (i.weight * i.unitPrice) || 0), 0);
                const freight = Number(profRec.freightCost) || 0;
                const sourceRec = recordsList.find(r => 
                    (hist.sourceRecordId && r.id === hist.sourceRecordId) ||
                    (hist.fileNumber && r.fileNumber === hist.fileNumber && r.id !== record.id)
                );

                list.push({
                    key: hist.id || `hist-${idx}`,
                    source: 'history',
                    historyEntry: hist,
                    proformaRecord: profRec,
                    goodsName: profRec.goodsName || hist.goodsName || '---',
                    commodityGroup: profRec.commodityGroup || hist.commodityGroup || '---',
                    fileNumber: profRec.fileNumber || hist.fileNumber || '---',
                    registrationNumber: profRec.registrationNumber || hist.registrationNumber,
                    proformaNumber: profRec.proformaNumber || hist.proformaNumber,
                    sellerName: profRec.sellerName || '---',
                    dateLabel: hist.updatedAt ? new Date(hist.updatedAt).toLocaleDateString('fa-IR') : (profRec.startDate || '---'),
                    userLabel: hist.updatedBy,
                    description: hist.description || `نسخه بایگانی پروفرما ثبت شده در تاریخ ${hist.updatedAt ? new Date(hist.updatedAt).toLocaleDateString('fa-IR') : '---'}`,
                    itemsCount: (profRec.items || []).length,
                    totalWeight: totalW,
                    totalGrossWeight: totalGW,
                    totalFob: totalFob,
                    freightCost: freight,
                    totalGrand: totalFob + freight,
                    currency: profRec.mainCurrency || record.mainCurrency || 'USD',
                    canOpenSourceRecord: !!sourceRec,
                    sourceRecordId: sourceRec?.id
                });
            });
        }

        // 2. Ensure transferredFrom is represented if present
        if (record.transferredFrom) {
            const tf = record.transferredFrom;
            const alreadyRepresented = list.some(item => 
                (tf.fileNumber && (item.fileNumber === tf.fileNumber || item.description?.includes(tf.fileNumber))) ||
                (tf.recordId && item.sourceRecordId === tf.recordId)
            );

            if (!alreadyRepresented) {
                const sourceRec = recordsList.find(r => 
                    (tf.recordId && r.id === tf.recordId) ||
                    (tf.fileNumber && r.fileNumber === tf.fileNumber && r.id !== record.id)
                );

                const fallbackProfRec: TradeRecord = sourceRec ? sourceRec : {
                    ...record,
                    id: tf.recordId || `tf-${Date.now()}`,
                    fileNumber: tf.fileNumber || '---',
                    goodsName: tf.goodsName || '---',
                    commodityGroup: tf.commodityGroup || '---',
                    proformaNumber: tf.proformaNumber || '',
                    registrationNumber: tf.registrationNumber || '---',
                    sellerName: tf.sellerName || record.sellerName,
                    mainCurrency: tf.mainCurrency || record.mainCurrency,
                    items: [],
                    freightCost: 0
                };

                const totalW = (fallbackProfRec.items || []).reduce((s, i) => s + (i.weight || 0), 0);
                const totalGW = (fallbackProfRec.items || []).reduce((s, i) => s + (i.grossWeight || i.weight || 0), 0);
                const totalFob = (fallbackProfRec.items || []).reduce((s, i) => s + (i.totalPrice || (i.weight * i.unitPrice) || 0), 0);
                const freight = Number(fallbackProfRec.freightCost) || 0;

                list.unshift({
                    key: `transferredFrom-${tf.fileNumber || Date.now()}`,
                    source: 'transferredFrom',
                    proformaRecord: fallbackProfRec,
                    goodsName: tf.goodsName || fallbackProfRec.goodsName || '---',
                    commodityGroup: tf.commodityGroup || fallbackProfRec.commodityGroup || '---',
                    fileNumber: tf.fileNumber || fallbackProfRec.fileNumber || '---',
                    registrationNumber: tf.registrationNumber || fallbackProfRec.registrationNumber,
                    proformaNumber: tf.proformaNumber || fallbackProfRec.proformaNumber,
                    sellerName: fallbackProfRec.sellerName || '---',
                    dateLabel: fallbackProfRec.startDate || '---',
                    description: `پرونده و ثبت سفارش مبدا قبل از انتقال به این پرونده (${record.goodsName})`,
                    itemsCount: (fallbackProfRec.items || []).length,
                    totalWeight: totalW,
                    totalGrossWeight: totalGW,
                    totalFob: totalFob,
                    freightCost: freight,
                    totalGrand: totalFob + freight,
                    currency: fallbackProfRec.mainCurrency || record.mainCurrency || 'USD',
                    canOpenSourceRecord: !!sourceRec,
                    sourceRecordId: sourceRec?.id
                });
            }
        }

        return list;
    };

    const handleOpenHistoricalProforma = (
        profRecord: TradeRecord,
        title?: string,
        subtitle?: string
    ) => {
        setProformaPrintTarget({
            record: profRecord,
            isHistorical: true,
            historyTitle: title || `پروفرم قبلی: ${profRecord.goodsName || '---'} (پرونده: ${profRecord.fileNumber || '---'})`,
            historySubtitle: subtitle
        });
    };

    if (selectedRecord && viewMode === 'details') {
        const totalItemsCurrency = selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0);
        const totalFreightCurrency = selectedRecord.freightCost || 0;
        const totalProformaCurrency = totalItemsCurrency + totalFreightCurrency;

        const currencyTranches = selectedRecord.currencyPurchaseData?.tranches || [];
        const netCurrencyRialCost = currencyTranches.reduce((acc, t) => {
            const paid = t.rialAmount || 0;
            const ret = t.returnAmount || 0;
            return acc + (paid - ret);
        }, 0);

        const overheadStages = [
            TradeStage.LICENSES, TradeStage.INSURANCE, TradeStage.INSPECTION,
            TradeStage.CLEARANCE_DOCS, TradeStage.GREEN_LEAF,
            TradeStage.INTERNAL_SHIPPING, TradeStage.AGENT_FEES
        ];
        const guaranteeDepositsTotal = selectedRecord.greenLeafData?.guarantees?.reduce((acc: number, g: any) => acc + (g.cashAmount || 0), 0) || 0;
        const totalOverheadsRialWithoutDeposits = overheadStages.reduce((sum, stage) => 
            sum + (selectedRecord.stages[stage]?.costRial || 0), 0);
        const totalOverheadsRial = totalOverheadsRialWithoutDeposits; // Guarantee deposits are part of the guarantee amount, not an extra overhead

        const grandTotalRialProject = netCurrencyRialCost + totalOverheadsRial;
        const totalWeight = selectedRecord.items.reduce((sum, item) => sum + item.weight, 0);
        const effectiveRate = totalProformaCurrency > 0 ? grandTotalRialProject / totalProformaCurrency : 0;
        const freightPerKgCurrency = totalWeight > 0 ? totalFreightCurrency / totalWeight : 0;
        const costPerKg = totalWeight > 0 ? grandTotalRialProject / totalWeight : 0;

        const tradeTabs = [
            ...(selectedRecord?.purchaseType === 'domestic_bourse' || Boolean(selectedRecord?.petrochemicalData)
                ? [
                    { id: 'domestic_petrochemical', label: 'خرید پتروشیمی و بورس کالا', icon: Building2 },
                    { id: 'all_attachments', label: 'همه پیوست‌ها و مدارک', icon: Paperclip, count: selectedRecord?.attachments?.length || 0 }
                ]
                : [
                    { id: 'timeline', label: 'تایم‌لاین', icon: Clock },
                    { id: 'proforma', label: 'پروفرما', icon: FileText },
                    { id: 'insurance', label: 'بیمه', icon: Shield },
                    { id: 'allocation', label: 'صف و تخصیص ارز', icon: AlertCircle },
                    { id: 'currency_purchase', label: 'خرید ارز', icon: DollarSign },
                    { id: 'shipping_docs', label: 'اسناد حمل', icon: Truck },
                    { id: 'inspection', label: 'بازرسی', icon: Search },
                    { id: 'clearance_docs', label: 'ترخیصیه و انبار', icon: Warehouse },
                    { id: 'green_leaf', label: 'برگ سبز', icon: CheckSquare },
                    { id: 'internal_shipping', label: 'حمل داخلی', icon: Package },
                    { id: 'agent_fees', label: 'هزینه‌های ترخیص', icon: Coins },
                    { id: 'final_calculation', label: 'محاسبه نهایی', icon: Calculator },
                    { id: 'all_attachments', label: 'همه پیوست‌ها و مدارک', icon: Paperclip, count: selectedRecord?.attachments?.length || 0 }
                ])
        ];

        const currentTabIndex = tradeTabs.findIndex(t => t.id === activeTab);
        const safeTabIndex = currentTabIndex >= 0 ? currentTabIndex : 0;
        const currentTabObj = tradeTabs[safeTabIndex];

        const handlePrevTab = () => {
            if (safeTabIndex > 0) {
                setActiveTab(tradeTabs[safeTabIndex - 1].id as any);
            }
        };

        const handleNextTab = () => {
            if (safeTabIndex < tradeTabs.length - 1) {
                setActiveTab(tradeTabs[safeTabIndex + 1].id as any);
            }
        };

        const stageToTabMap: Record<string, string> = {
            [TradeStage.LICENSES]: 'proforma',
            [TradeStage.INSURANCE]: 'insurance',
            [TradeStage.ALLOCATION_QUEUE]: 'allocation',
            [TradeStage.ALLOCATION_APPROVED]: 'allocation',
            [TradeStage.CURRENCY_PURCHASE]: 'currency_purchase',
            [TradeStage.SHIPPING_DOCS]: 'shipping_docs',
            [TradeStage.INSPECTION]: 'inspection',
            [TradeStage.CLEARANCE_DOCS]: 'clearance_docs',
            [TradeStage.GREEN_LEAF]: 'green_leaf',
            [TradeStage.INTERNAL_SHIPPING]: 'internal_shipping',
            [TradeStage.AGENT_FEES]: 'agent_fees',
        };

        return (
            <div className="flex flex-col flex-1 min-h-0 md:h-[calc(100vh-100px)] animate-fade-in relative touch-pan-y trade-dossier-view">
                
                {/* Final Cost Report Print Overlay */}
                {showFinalReportPrint && (
                    <PrintFinalCostReport 
                        record={selectedRecord} 
                        totalRial={totalOverheadsRial} 
                        totalCurrency={totalProformaCurrency} 
                        exchangeRate={effectiveRate}
                        grandTotalRial={grandTotalRialProject}
                        onClose={() => setShowFinalReportPrint(false)} 
                    />
                )}

                {/* Clearance Declaration Print Overlay (NEW) */}
                {showClearancePrint && (
                    <PrintClearanceDeclaration 
                        record={selectedRecord}
                        settings={settings || { companies: [] } as any}
                        onClose={() => setShowClearancePrint(false)}
                    />
                )}

                {/* Proforma Print Overlay (Current or Historical) */}
                {(showProformaPrint || proformaPrintTarget) && (selectedRecord || proformaPrintTarget?.record) && (
                    <PrintProforma 
                        record={proformaPrintTarget?.record || selectedRecord!} 
                        settings={settings} 
                        onClose={() => {
                            setShowProformaPrint(false);
                            setProformaPrintTarget(null);
                        }}
                        isHistorical={proformaPrintTarget?.isHistorical}
                        historyTitle={proformaPrintTarget?.historyTitle}
                        historySubtitle={proformaPrintTarget?.historySubtitle}
                    />
                )}

                {/* Shipping Doc Print Overlay */}
                {selectedShippingDocForPrint && selectedRecord && (
                    <PrintShippingDoc 
                        record={selectedRecord}
                        doc={selectedShippingDocForPrint}
                        settings={settings}
                        onClose={() => setSelectedShippingDocForPrint(null)}
                    />
                )}

                {/* Transfer Modal Overlay */}
                {renderTransferModal()}

                {/* EDIT METADATA MODAL */}
                {showEditMetadataModal && createPortal(
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 md:p-8 border border-gray-200 dark:border-gray-800 text-right max-h-[90vh] overflow-y-auto my-auto animate-scale-in" dir="rtl">
                            <div className="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-800">
                                <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">ویرایش مشخصات پرونده</h3>
                                <button type="button" onClick={() => setShowEditMetadataModal(false)}><X size={24} className="text-gray-400 hover:text-red-500 transition-colors"/></button>
                            </div>
                            <div className="space-y-4 text-gray-800 dark:text-gray-200">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">شماره پروفرم</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.proformaNumber || ''} onChange={e => setEditMetadataForm({...editMetadataForm, proformaNumber: e.target.value})} placeholder="شماره پروفرم..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">شماره سفارش</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.orderNumber || ''} onChange={e => setEditMetadataForm({...editMetadataForm, orderNumber: e.target.value})} placeholder="شماره سفارش..." />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">شماره پرونده</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.fileNumber || ''} onChange={e => setEditMetadataForm({...editMetadataForm, fileNumber: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">شماره ثبت سفارش</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.registrationNumber || ''} onChange={e => setEditMetadataForm({...editMetadataForm, registrationNumber: e.target.value})} />
                                    </div>
                                </div>
                                <div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">نام کالا (شرح کلی)</label><input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.goodsName || ''} onChange={e => setEditMetadataForm({...editMetadataForm, goodsName: e.target.value})} /></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">فروشنده</label><input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.sellerName || ''} onChange={e => setEditMetadataForm({...editMetadataForm, sellerName: e.target.value})} /></div><div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">ارز پایه</label><select className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.mainCurrency || ''} onChange={e => setEditMetadataForm({...editMetadataForm, mainCurrency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">گروه کالایی</label><select className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.commodityGroup || ''} onChange={e => setEditMetadataForm({...editMetadataForm, commodityGroup: e.target.value})}><option value="">انتخاب...</option>{commodityGroups.map(g => <option key={g} value={g}>{g}</option>)}</select></div><div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">شرکت</label><select className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.company || ''} onChange={e => setEditMetadataForm({...editMetadataForm, company: e.target.value})}><option value="">انتخاب...</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div></div>
                                <div className="space-y-1.5"><div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">بانک عامل</label><select className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={editMetadataForm.operatingBank || ''} onChange={e => setEditMetadataForm({...editMetadataForm, operatingBank: e.target.value})}><option value="">انتخاب...</option>{operatingBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                                    <label className="flex items-center gap-3 cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={editMetadataForm.isInTransit || false} 
                                            onChange={e => setEditMetadataForm({...editMetadataForm, isInTransit: e.target.checked})} 
                                            className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                        /> 
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">بار در راه (ترانزیت)</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={editMetadataForm.isInCustoms || false} 
                                            onChange={e => setEditMetadataForm({...editMetadataForm, isInCustoms: e.target.checked})} 
                                            className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                        /> 
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">بار در گمرک</span>
                                    </label>
                                </div>
                                <button type="button" onClick={saveMetadata} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 mt-4 transition-all">ذخیره تغییرات</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Stage Edit Modal */}
                {editingStage && createPortal(
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 md:p-8 border border-gray-200 dark:border-gray-800 text-right max-h-[90vh] overflow-y-auto my-auto animate-scale-in" dir="rtl">
                            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-800"><h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">ویرایش مرحله: {editingStage}</h3><button type="button" onClick={() => setEditingStage(null)}><X size={20} className="text-gray-400 hover:text-red-500"/></button></div>
                            <div className="space-y-4 text-gray-800 dark:text-gray-200">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={stageFormData.isCompleted} onChange={e => setStageFormData({...stageFormData, isCompleted: e.target.checked})} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"/> <span className="font-bold text-sm">مرحله تکمیل شده است</span></label>
                                 {(editingStage === TradeStage.ALLOCATION_QUEUE || editingStage === TradeStage.ALLOCATION_APPROVED) && (
                                     <div className="space-y-3">
                                         <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
                                             <div className="font-bold text-xs text-amber-800 dark:text-amber-300">۱. در صف تخصیص ارز</div>
                                             <div>
                                                 <label className="text-xs font-bold block mb-1">تاریخ ورود به صف</label>
                                                 <TradeDatePicker 
                                                     value={stageFormData.queueDate || ''} 
                                                     onChange={val => setStageFormData({...stageFormData, queueDate: val})} 
                                                 />
                                             </div>
                                             {stageFormData.queueDate && (
                                                 <div className="text-xs text-amber-700 dark:text-amber-400 font-bold">
                                                     مدت انتظار: {calculateDaysDiff(stageFormData.queueDate)} روز
                                                 </div>
                                             )}
                                         </div>

                                         <div className="bg-green-50 dark:bg-green-950/40 p-3 rounded-xl border border-green-200 dark:border-green-800 space-y-2">
                                             <div className="font-bold text-xs text-green-800 dark:text-green-300">۲. تخصیص یافته</div>
                                             <div>
                                                 <label className="text-xs font-bold block mb-1">شماره فیش/تخصیص</label>
                                                 <input 
                                                     type="text" 
                                                     className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono font-bold" 
                                                     value={stageFormData.allocationCode || ''} 
                                                     onChange={e => setStageFormData({...stageFormData, allocationCode: e.target.value})} 
                                                 />
                                             </div>
                                             <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                 <div>
                                                     <label className="text-xs font-bold block mb-1">تاریخ تخصیص</label>
                                                     <TradeDatePicker 
                                                         value={stageFormData.allocationDate || ''} 
                                                         onChange={val => setStageFormData({...stageFormData, allocationDate: val})} 
                                                     />
                                                 </div>
                                                 <div>
                                                     <label className="text-xs font-bold block mb-1">مهلت انقضا</label>
                                                     <TradeDatePicker 
                                                         value={stageFormData.allocationExpiry || ''} 
                                                         onChange={val => setStageFormData({...stageFormData, allocationExpiry: val})} 
                                                         placeholder="۱۴۰۳/۰۲/۰۱"
                                                     />
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                 )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold block mb-1">هزینه ریالی</label>
                                        <FormattedNumberInput className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold" value={stageFormData.costRial} onChange={val => setStageFormData({...stageFormData, costRial: val})} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">هزینه ارزی</label>
                                        <FormattedNumberInput className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold" value={stageFormData.costCurrency} onChange={val => setStageFormData({...stageFormData, costCurrency: val})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">توضیحات</label>
                                    <textarea className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 h-20" value={stageFormData.description || ''} onChange={e => setStageFormData({...stageFormData, description: e.target.value})} />
                                </div>
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                    <TradeAttachmentSection
                                        attachments={(stageFormData.attachments || []) as any}
                                        onAttachmentsChange={(updated) => setStageFormData(prev => ({ ...prev, attachments: updated as any }))}
                                        category={`commercial/timeline/${editingStage || 'general'}`}
                                        title="پیوست‌های این مرحله (عکس و PDF)"
                                        description="تصاویر اسناد، فیش‌ها و فایل‌های PDF مربوط به این مرحله"
                                        currentUser={currentUser}
                                        compact={true}
                                    />
                                </div>
                                <button type="button" onClick={handleSaveStage} className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md">ذخیره تغییرات</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Mobile Stage Drawer Bottom Sheet */}
                {showMobileStageDrawer && createPortal(
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setShowMobileStageDrawer(false)}>
                        <div 
                            className="bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg p-5 border border-gray-200 dark:border-zinc-800 text-right max-h-[85vh] flex flex-col animate-slide-up" 
                            dir="rtl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                                    <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">انتخاب مرحله پرونده</h3>
                                </div>
                                <button type="button" onClick={() => setShowMobileStageDrawer(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="overflow-y-auto space-y-1.5 custom-scrollbar pr-1 flex-1 py-1">
                                {tradeTabs.map((tab, idx) => {
                                    const TabIcon = tab.icon;
                                    const isActive = tab.id === activeTab;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => {
                                                setActiveTab(tab.id as any);
                                                setShowMobileStageDrawer(false);
                                            }}
                                            className={`w-full flex items-center justify-between p-3 rounded-2xl text-right transition-all cursor-pointer active:scale-98 ${
                                                isActive 
                                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-black' 
                                                    : 'bg-gray-50 hover:bg-gray-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200 font-bold border border-gray-100 dark:border-zinc-800'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                                                    isActive ? 'bg-white text-blue-600' : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                                }`}>
                                                    {idx + 1}
                                                </span>
                                                {TabIcon && <TabIcon size={16} className={isActive ? 'text-white' : 'text-blue-600 dark:text-blue-400'} />}
                                                <span className="text-xs sm:text-sm">{tab.label}</span>
                                            </div>
                                            {tab.count !== undefined && tab.count > 0 && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                                    isActive ? 'bg-white/20 text-white' : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                                                }`}>
                                                    {tab.count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Mobile Documents Bottom Sheet */}
                {showMobileDocsModal && createPortal(
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setShowMobileDocsModal(false)}>
                        <div 
                            className="bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg p-5 border border-gray-200 dark:border-zinc-800 text-right max-h-[85vh] flex flex-col animate-slide-up" 
                            dir="rtl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                                <div className="flex items-center gap-2">
                                    <FileText size={18} className="text-blue-600" />
                                    <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">اسناد و مدارک استاندارد پرونده</h3>
                                </div>
                                <button type="button" onClick={() => setShowMobileDocsModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="overflow-y-auto space-y-2 custom-scrollbar py-2 flex-1">
                                <button 
                                    type="button" 
                                    onClick={() => { setShowMobileDocsModal(false); setShowProformaPrint(true); }}
                                    className="w-full flex items-center justify-between p-3.5 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-900 rounded-2xl font-bold text-xs hover:bg-blue-100 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Printer size={16} className="text-blue-600" />
                                        <span>مشاهده پروفرما استاندارد</span>
                                    </div>
                                    <ChevronLeft size={16} />
                                </button>

                                <button 
                                    type="button" 
                                    onClick={() => { setShowMobileDocsModal(false); setShowClearancePrint(true); }}
                                    className="w-full flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900 rounded-2xl font-bold text-xs hover:bg-emerald-100 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Printer size={16} className="text-emerald-600" />
                                        <span>مشاهده اعلامیه ورود و ترخیصیه</span>
                                    </div>
                                    <ChevronLeft size={16} />
                                </button>

                                <button 
                                    type="button" 
                                    onClick={() => { setShowMobileDocsModal(false); setShowFinalReportPrint(true); }}
                                    className="w-full flex items-center justify-between p-3.5 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900 rounded-2xl font-bold text-xs hover:bg-rose-100 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Calculator size={16} className="text-rose-600" />
                                        <span>گزارش چاپی بهای تمام‌شده نهایی</span>
                                    </div>
                                    <ChevronLeft size={16} />
                                </button>

                                {selectedRecord.shippingDocuments && selectedRecord.shippingDocuments.length > 0 && (
                                    <div className="pt-2">
                                        <span className="text-[11px] font-bold text-gray-500 block mb-2">اسناد حمل ثبت‌شده:</span>
                                        <div className="space-y-1.5">
                                            {selectedRecord.shippingDocuments.map(doc => (
                                                <button
                                                    key={doc.id}
                                                    type="button"
                                                    onClick={() => { setShowMobileDocsModal(false); setSelectedShippingDocForPrint(doc); }}
                                                    className="w-full flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900 rounded-xl font-bold text-xs hover:bg-amber-100 transition-all cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Printer size={14} className="text-amber-600" />
                                                        <span>سند حمل: {doc.documentNumber || doc.type}</span>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-gray-500">{doc.documentDate || ''}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Mobile More Options Bottom Sheet */}
                {showMobileMoreOptions && createPortal(
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setShowMobileMoreOptions(false)}>
                        <div 
                            className="bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg p-5 border border-gray-200 dark:border-zinc-800 text-right animate-slide-up" 
                            dir="rtl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100 dark:border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <Edit size={18} className="text-blue-600" />
                                    <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">عملیات و مدیریت پرونده</h3>
                                </div>
                                <button type="button" onClick={() => setShowMobileMoreOptions(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-2 py-1">
                                <button 
                                    type="button" 
                                    onClick={() => { setShowMobileMoreOptions(false); openEditMetadata(); }}
                                    className="w-full flex items-center justify-between p-3.5 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-900 rounded-2xl font-bold text-xs hover:bg-blue-100 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Edit size={16} className="text-blue-600" />
                                        <span>ویرایش مشخصات اصلی پرونده (کالا، شرکت، فروشنده)</span>
                                    </div>
                                    <ChevronLeft size={16} />
                                </button>

                                <button 
                                    type="button" 
                                    onClick={(e) => { setShowMobileMoreOptions(false); handleDuplicateRecord(selectedRecord, e); }}
                                    className="w-full flex items-center justify-between p-3.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-900 rounded-2xl font-bold text-xs hover:bg-indigo-100 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Copy size={16} className="text-indigo-600" />
                                        <span>کپی آنی و ایجاد پرونده جدید از این پرونده</span>
                                    </div>
                                    <ChevronLeft size={16} />
                                </button>

                                <button 
                                    type="button" 
                                    onClick={() => { setShowMobileMoreOptions(false); setShowTransferModal(true); }}
                                    className="w-full flex items-center justify-between p-3.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 rounded-2xl font-bold text-xs hover:bg-amber-100 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <ArrowRightLeft size={16} className="text-amber-600" />
                                        <span>انتقال به گروه کالایی دیگر</span>
                                    </div>
                                    <ChevronLeft size={16} />
                                </button>

                                <button 
                                    type="button" 
                                    onClick={() => { setShowMobileMoreOptions(false); setViewMode('dashboard'); }}
                                    className="w-full flex items-center justify-between p-3.5 bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-zinc-700 rounded-2xl font-bold text-xs hover:bg-gray-200 transition-all cursor-pointer mt-2"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <ArrowRight size={16} />
                                        <span>بازگشت به لیست پرونده‌ها</span>
                                    </div>
                                    <ChevronLeft size={16} />
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Mobile Unified Sticky Header (Header + Stage Switcher) */}
                <div className="md:hidden sticky top-0 z-30 shrink-0 shadow-2xs backdrop-blur-md" data-html2canvas-ignore>
                    {/* Top Row: Goods Name, File Number, Cost per Kg, Docs, Edit */}
                    <div className="glass-panel border-b border-gray-200 dark:border-zinc-800 px-2.5 py-2 flex flex-col gap-1 bg-white/95 dark:bg-zinc-900/95">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <button 
                                    type="button" 
                                    data-subtab-back="true" 
                                    onClick={() => setViewMode('dashboard')} 
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full shrink-0 text-gray-700 dark:text-gray-300 active:scale-90 transition-transform cursor-pointer"
                                    title="بازگشت به لیست پرونده‌ها"
                                >
                                    <ArrowRight size={18} />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-black text-sm text-gray-900 dark:text-white truncate max-w-[130px] sm:max-w-none">{selectedRecord.goodsName}</span>
                                        <span className="text-[10px] font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 px-1.5 py-0.2 rounded-md font-bold">
                                            {selectedRecord.fileNumber ? `#${selectedRecord.fileNumber}` : 'بدون پرونده'}
                                        </span>
                                        {selectedRecord.proformaNumber && (
                                            <span className="text-[10px] font-mono text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 px-1.5 py-0.2 rounded-md font-bold">
                                                {selectedRecord.proformaNumber}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                        {selectedRecord.company} {selectedRecord.sellerName ? `| ${selectedRecord.sellerName}` : ''}
                                    </div>
                                </div>
                            </div>

                            {/* Quick Mobile Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                {/* Cost per kg badge */}
                                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-2 py-1 rounded-lg text-left font-mono">
                                    <span className="text-[8px] font-bold text-rose-600 dark:text-rose-400 block leading-none">کیلو:</span>
                                    <span className="font-black text-rose-700 dark:text-rose-300 text-xs leading-none">
                                        {formatCurrency(costPerKg)}
                                    </span>
                                </div>

                                {/* Quick Docs Button */}
                                <button 
                                    type="button" 
                                    onClick={() => setShowMobileDocsModal(true)} 
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 rounded-lg relative active:scale-95 transition-all cursor-pointer"
                                    title="مشاهده فرم‌ها و اسناد استاندارد"
                                >
                                    <FileText size={17} />
                                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full text-[9px] font-bold w-4 h-4 flex items-center justify-center">
                                        {2 + (selectedRecord.shippingDocuments?.length || 0)}
                                    </span>
                                </button>

                                {/* More Options */}
                                <button 
                                    type="button" 
                                    onClick={() => setShowMobileMoreOptions(true)} 
                                    className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg active:scale-95 cursor-pointer"
                                    title="عملیات و ویرایش مشخصات"
                                >
                                    <Edit size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row: Stage Navigation (Prev / Current Stage Picker / Next) */}
                    <div className="bg-slate-50/95 dark:bg-zinc-900/95 border-b border-gray-200 dark:border-zinc-800 px-2.5 py-1.5 flex items-center justify-between gap-1">
                        <button 
                            type="button" 
                            onClick={handlePrevTab}
                            disabled={safeTabIndex === 0}
                            className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${safeTabIndex === 0 ? 'opacity-30 cursor-not-allowed text-gray-400' : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 shadow-2xs'}`}
                        >
                            <ChevronRight size={14} />
                            <span>قبلی</span>
                        </button>

                        <button 
                            type="button" 
                            onClick={() => setShowMobileStageDrawer(true)} 
                            className="flex-1 max-w-[240px] mx-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 rounded-xl font-bold text-xs shadow-2xs active:scale-98 transition-all cursor-pointer"
                        >
                            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-mono font-bold shrink-0">
                                {safeTabIndex + 1}
                            </span>
                            <span className="truncate">{currentTabObj?.label || 'انتخاب مرحله'}</span>
                            <ChevronDown size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                        </button>

                        <button 
                            type="button" 
                            onClick={handleNextTab}
                            disabled={safeTabIndex === tradeTabs.length - 1}
                            className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${safeTabIndex === tradeTabs.length - 1 ? 'opacity-30 cursor-not-allowed text-gray-400' : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 shadow-2xs'}`}
                        >
                            <span>بعدی</span>
                            <ChevronLeft size={14} />
                        </button>
                    </div>
                </div>

                {/* Desktop Header & Tab Bar (Hidden on Mobile) */}
                <div className="hidden md:flex glass-panel border-b p-3.5 flex-col gap-3 shadow-xs z-10 shrink-0">
                    <div className="flex flex-row items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                            <button type="button" data-subtab-back="true" onClick={() => setViewMode('dashboard')} className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full shrink-0"><ArrowRight size={18} /></button>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-sm sm:text-xl font-black flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                    <span className="truncate">{selectedRecord.goodsName}</span>
                                    <span className="text-[10px] sm:text-xs font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full" title="شماره پرونده">پرونده: {selectedRecord.fileNumber || '---'}</span>
                                    {selectedRecord.proformaNumber && (
                                        <span className="text-[10px] sm:text-xs font-mono text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full" title="شماره پروفرم">پروفرم: {selectedRecord.proformaNumber}</span>
                                    )}
                                    <button type="button" onClick={openEditMetadata} className="text-gray-400 hover:text-blue-600 transition-colors p-0.5" title="ویرایش مشخصات پرونده"><Edit size={14}/></button>
                                    <button type="button" onClick={(e) => handleDuplicateRecord(selectedRecord, e)} className="text-gray-400 hover:text-indigo-600 transition-colors p-0.5" title="کپی آنی پرونده"><Copy size={14}/></button>
                                </h1>
                                <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">{selectedRecord.company} | {selectedRecord.sellerName}</p>
                                {selectedRecord.transferredFrom && (
                                    <div className="mt-1 flex items-center gap-1.5 text-[10px] sm:text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-lg w-fit font-medium flex-wrap">
                                        <ArrowRightLeft size={12} className="shrink-0 text-amber-600 dark:text-amber-400" />
                                        <span>انتقال یافته از ثبت سفارش/کالای قبلی: <strong className="font-bold">{selectedRecord.transferredFrom.goodsName}</strong> (پرونده {selectedRecord.transferredFrom.fileNumber})</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const prevs = getAllPreviousProformas(selectedRecord, records);
                                                if (prevs.length > 0) {
                                                    handleOpenHistoricalProforma(
                                                        prevs[0].proformaRecord,
                                                        `پروفرم قبلی: ${prevs[0].goodsName} (پرونده: ${prevs[0].fileNumber})`,
                                                        prevs[0].dateLabel
                                                    );
                                                } else {
                                                    setActiveTab('proforma');
                                                }
                                            }}
                                            className="mr-1 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-950 dark:text-amber-100 rounded text-[10px] font-black cursor-pointer transition-colors shadow-2xs"
                                            title="مشاهده و باز کردن پروفرم قبلی با تمام جزئیات"
                                        >
                                            <Eye size={11} />
                                            <span>مشاهده پروفرم قبلی</span>
                                        </button>
                                    </div>
                                )}
                                {selectedRecord.transferredTo && (
                                    <div className="mt-1 flex items-center gap-1 text-[10px] sm:text-xs text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-lg w-fit font-medium">
                                        <ArrowRightLeft size={11} className="shrink-0 text-blue-600 dark:text-blue-400" />
                                        <span>منتقل شده به پروفرم {selectedRecord.transferredTo.fileNumber} ({selectedRecord.transferredTo.goodsName})</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* MINI COST PER KG BOX */}
                        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-1.5 rounded-xl text-right shrink-0">
                            <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 block mb-0.5 leading-none">قیمت تمام‌شده (کیلو)</span>
                            <span className="font-mono font-black text-rose-700 dark:text-rose-300 text-sm leading-none">{formatCurrency(calculateRecordCostPerKg(selectedRecord))} <span className="text-[9px] font-normal">ریال</span></span>
                        </div>
                    </div>

                    <div className="flex gap-1.5 sm:gap-2 overflow-x-auto py-0.5 custom-scrollbar scrollbar-none">
                        {(selectedRecord?.purchaseType === 'domestic_bourse' || Boolean(selectedRecord?.petrochemicalData)) ? (
                            <button type="button" onClick={() => setActiveTab('domestic_petrochemical')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'domestic_petrochemical' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'}`}>
                                🏢 خرید پتروشیمی و بورس کالا
                            </button>
                        ) : (
                            <>
                                <button type="button" onClick={() => setActiveTab('timeline')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'timeline' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>تایم‌لاین</button>
                                <button type="button" onClick={() => setActiveTab('proforma')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'proforma' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>پروفرما</button>
                                <button type="button" onClick={() => setActiveTab('insurance')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'insurance' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>بیمه</button>
                                <button type="button" onClick={() => setActiveTab('allocation')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'allocation' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>صف و تخصیص ارز</button>
                                <button type="button" onClick={() => setActiveTab('currency_purchase')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'currency_purchase' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>خرید ارز</button>
                                <button type="button" onClick={() => setActiveTab('shipping_docs')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'shipping_docs' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>اسناد حمل</button>
                                <button type="button" onClick={() => setActiveTab('inspection')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'inspection' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>بازرسی</button>
                                <button type="button" onClick={() => setActiveTab('clearance_docs')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'clearance_docs' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>ترخیصیه و انبار</button>
                                <button type="button" onClick={() => setActiveTab('green_leaf')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'green_leaf' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>برگ سبز</button>
                                <button type="button" onClick={() => setActiveTab('internal_shipping')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'internal_shipping' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>حمل داخلی</button>
                                <button type="button" onClick={() => setActiveTab('agent_fees')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'agent_fees' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>هزینه‌های ترخیص</button>
                                <button type="button" onClick={() => setActiveTab('final_calculation')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'final_calculation' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>محاسبه نهایی</button>
                                <button type="button" onClick={() => setActiveTab('all_attachments')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeTab === 'all_attachments' ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100'}`}>
                                    <Paperclip size={14} />
                                    <span>همه پیوست‌ها و مدارک</span>
                                    {(selectedRecord?.attachments?.length || 0) > 0 && (
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === 'all_attachments' ? 'bg-white/20 text-white' : 'bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-100'}`}>
                                            {selectedRecord?.attachments?.length}
                                        </span>
                                    )}
                                </button>
                            </>
                        )}
                        {(selectedRecord?.purchaseType === 'domestic_bourse' || Boolean(selectedRecord?.petrochemicalData)) && (
                            <button type="button" onClick={() => setActiveTab('all_attachments')} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeTab === 'all_attachments' ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100'}`}>
                                <Paperclip size={14} />
                                <span>همه پیوست‌ها و مدارک</span>
                                {(selectedRecord?.attachments?.length || 0) > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === 'all_attachments' ? 'bg-white/20 text-white' : 'bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-100'}`}>
                                        {selectedRecord?.attachments?.length}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 md:overflow-y-auto md:overflow-x-hidden bg-gray-50 dark:bg-zinc-900 pb-28 md:pb-12 custom-scrollbar touch-pan-y overscroll-y-auto trade-dossier-content">
                    
                    {activeTab === 'domestic_petrochemical' && (
                        <DomesticPetrochemicalTab
                            record={selectedRecord}
                            onUpdateRecord={persistRecordUpdate}
                            currentUser={currentUser}
                        />
                    )}

                    {activeTab === 'timeline' && (
                        <div className="p-2.5 sm:p-6 max-w-4xl mx-auto">
                            <div className="relative border-r-2 border-gray-200/50 dark:border-white/10 mr-2 sm:mr-4 space-y-3.5 sm:space-y-6 pr-4 sm:pr-8">
                                {STAGES.filter(s => s !== TradeStage.ALLOCATION_APPROVED).map((stage) => {
                                    const isAllocation = stage === TradeStage.ALLOCATION_QUEUE;
                                    const queueData = getStageData(selectedRecord, TradeStage.ALLOCATION_QUEUE);
                                    const approvedData = getStageData(selectedRecord, TradeStage.ALLOCATION_APPROVED);
                                    
                                    const title = isAllocation ? 'صف و تخصیص ارز' : stage;
                                    const isCompleted = isAllocation 
                                        ? (approvedData.isCompleted || (queueData.isCompleted && Boolean(selectedRecord.currencyPurchaseData?.allocationCode)))
                                        : getStageData(selectedRecord, stage).isCompleted;
                                    
                                    const description = isAllocation
                                        ? (approvedData.allocationCode || selectedRecord.currencyPurchaseData?.allocationCode
                                            ? `تخصیص یافته (شماره فیش/تخصیص: ${approvedData.allocationCode || selectedRecord.currencyPurchaseData?.allocationCode || '-'})`
                                            : queueData.queueDate || selectedRecord.currencyPurchaseData?.queueEntryDate
                                                ? `در صف تخصیص ارز (تاریخ: ${queueData.queueDate || selectedRecord.currencyPurchaseData?.queueEntryDate})`
                                                : 'بدون ثبت تاریخ صف یا تخصیص')
                                        : (getStageData(selectedRecord, stage).description || 'بدون توضیحات');

                                    const totalCostRial = isAllocation 
                                        ? (queueData.costRial || 0) + (approvedData.costRial || 0)
                                        : (getStageData(selectedRecord, stage).costRial || 0);

                                    const totalCostCurrency = isAllocation
                                        ? (queueData.costCurrency || 0) + (approvedData.costCurrency || 0)
                                        : (getStageData(selectedRecord, stage).costCurrency || 0);

                                    return (
                                        <div key={stage} className="relative">
                                            <div className={`absolute -right-[22px] sm:-right-[41px] top-2 w-3.5 h-3.5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 ${isCompleted ? 'bg-green-500 border-green-100' : 'bg-gray-300 border-gray-100'}`}></div>
                                            <div className="glass-panel p-3 sm:p-4 rounded-xl shadow-xs border border-gray-100 dark:border-zinc-800 hover:shadow-md transition-shadow cursor-pointer" onClick={() => isAllocation ? setActiveTab('allocation') : handleStageClick(stage)}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 text-xs sm:text-sm">{title}</h3>
                                                        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
                                                    </div>
                                                    {isCompleted && <CheckCircle2 size={16} className="text-green-500 shrink-0"/>}
                                                </div>
                                                <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
                                                    {totalCostRial > 0 && <span className="bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-lg">هزینه ریالی: {formatCurrency(totalCostRial)} ریال</span>}
                                                    {totalCostCurrency > 0 && <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-lg font-mono">هزینه ارزی: {formatNumberString(totalCostCurrency)} {selectedRecord.mainCurrency}</span>}
                                                </div>
                                                <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 flex-wrap">
                                                    {stageToTabMap[stage] && (
                                                        <button 
                                                            type="button" 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveTab(stageToTabMap[stage] as any);
                                                            }} 
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 transition-all active:scale-95"
                                                        >
                                                            <span>ورود به برگه اختصاصی</span>
                                                            <ArrowRight size={12} className="rotate-180" />
                                                        </button>
                                                    )}
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (isAllocation) {
                                                                setActiveTab('allocation');
                                                            } else {
                                                                handleStageClick(stage);
                                                            }
                                                        }} 
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-zinc-800 dark:text-gray-300 transition-all active:scale-95"
                                                    >
                                                        <Edit2 size={12} />
                                                        <span>ویرایش وضعیت و هزینه</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'proforma' && (
                        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                            {/* Proforma Content */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border">
                                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">اطلاعات کلی پروفرما</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">شماره پروفرم</label>
                                        <input className="w-full border rounded p-2 text-sm font-mono" value={selectedRecord.proformaNumber || ''} onChange={e => handleUpdateProforma('proformaNumber', e.target.value)} placeholder="شماره پروفرم..."/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">شماره سفارش</label>
                                        <input className="w-full border rounded p-2 text-sm font-mono" value={selectedRecord.orderNumber || ''} onChange={e => handleUpdateProforma('orderNumber', e.target.value)} placeholder="شماره سفارش..."/>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-bold text-gray-700">شماره پرونده</label>
                                            {selectedRecord.registrationNumber && (
                                                <button 
                                                    type="button"
                                                    onClick={() => handleUpdateProforma('fileNumber', selectedRecord.registrationNumber || '')}
                                                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold"
                                                >
                                                    دریافت از ثبت سفارش
                                                </button>
                                            )}
                                        </div>
                                        <input 
                                            className="w-full border rounded p-2 text-sm bg-blue-50/40 font-mono" 
                                            value={selectedRecord.fileNumber || ''} 
                                            onChange={e => handleUpdateProforma('fileNumber', e.target.value)}
                                            placeholder="شماره پرونده..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">شماره ثبت سفارش</label>
                                        <input 
                                            className="w-full border rounded p-2 text-sm font-mono" 
                                            value={selectedRecord.registrationNumber || ''} 
                                            onChange={e => handleUpdateProforma('registrationNumber', e.target.value)}
                                            placeholder="شماره ثبت سفارش..."
                                        />
                                    </div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">فروشنده</label><input className="w-full border rounded p-2 text-sm" value={selectedRecord.sellerName} onChange={e => handleUpdateProforma('sellerName', e.target.value)}/></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">ارز پایه</label><select className="w-full border rounded p-2 text-sm" value={selectedRecord.mainCurrency} onChange={e => handleUpdateProforma('mainCurrency', e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">تاریخ ثبت سفارش</label>
                                        <TradeDatePicker 
                                            value={selectedRecord.registrationDate || ''} 
                                            onChange={val => handleUpdateProforma('registrationDate', val)} 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">تاریخ انقضا</label>
                                        <TradeDatePicker 
                                            value={selectedRecord.registrationExpiry || ''} 
                                            onChange={val => handleUpdateProforma('registrationExpiry', val)} 
                                            placeholder="۱۴۰۳/۰۶/۰۱"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">منشا ارز</label>
                                        <select 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={selectedRecord.currencyAllocationType || ''} 
                                            onChange={e => handleUpdateProforma('currencyAllocationType', e.target.value)}
                                        >
                                            <option value="">انتخاب کنید...</option>
                                            <option value="Bank">بانکی</option>
                                            <option value="Export">ارز حاصل از صادرات خود</option>
                                            <option value="ExportOther">ارز حاصل از صادرات دیگران</option>
                                            <option value="Free">متقاضی (آزاد)</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">نوع ارز (رتبه)</label>
                                        <select 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={selectedRecord.allocationCurrencyRank || ''} 
                                            onChange={e => handleUpdateProforma('allocationCurrencyRank', e.target.value as any)}
                                        >
                                            <option value="">انتخاب کنید...</option>
                                            <option value="Type1">نوع اول</option>
                                            <option value="Type2">نوع دوم</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">بانک عامل</label>
                                        <select 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={selectedRecord.operatingBank || ''} 
                                            onChange={e => handleUpdateProforma('operatingBank', e.target.value)}
                                        >
                                            <option value="">انتخاب کنید...</option>
                                            {operatingBanks.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Previous Proformas & Order Registration History Section */}
                            {(() => {
                                const previousProformas = getAllPreviousProformas(selectedRecord, records);
                                if (previousProformas.length === 0) return null;

                                return (
                                    <div className="glass-panel p-5 sm:p-6 rounded-2xl shadow-sm border border-amber-200/90 dark:border-amber-900/60 bg-gradient-to-b from-amber-50/70 to-orange-50/40 dark:from-amber-950/20 dark:to-zinc-900/40 space-y-4">
                                        <div className="flex justify-between items-center flex-wrap gap-2 border-b border-amber-200 dark:border-amber-800/60 pb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                                                    <History size={18} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base flex items-center gap-2">
                                                        <span>پروفرم‌های قبلی و سوابق تغییر ثبت سفارش</span>
                                                        <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-xs rounded-full font-bold">
                                                            {previousProformas.length} نسخه بایگانی
                                                        </span>
                                                    </h3>
                                                    <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                                                        پیش‌فاکتورها و اقلام ثبت سفارش قبلی (مانند تغییر کالا از {previousProformas[0]?.goodsName || 'POY'} به {selectedRecord.goodsName}) با جزئیات کامل و قابلیت باز کردن، مشاهده، چاپ و دانلود در دسترس هستند.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {previousProformas.map((prev) => {
                                                const isExpanded = expandedHistoryId === prev.key;
                                                return (
                                                    <div 
                                                        key={prev.key} 
                                                        className="bg-white dark:bg-zinc-900 rounded-xl border border-amber-200 dark:border-zinc-800 p-4 shadow-xs hover:shadow-md transition-all space-y-3"
                                                    >
                                                        {/* Header row */}
                                                        <div className="flex justify-between items-start flex-wrap gap-3">
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                                                        کالای قبلی: {prev.goodsName}
                                                                    </span>
                                                                    <span className="text-xs text-gray-600 dark:text-gray-300 font-bold">
                                                                        گروه کالایی: {prev.commodityGroup}
                                                                    </span>
                                                                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                                                        پرونده: {prev.fileNumber}
                                                                    </span>
                                                                    {prev.registrationNumber && (
                                                                        <span className="text-xs font-mono bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                                                            ثبت سفارش: {prev.registrationNumber}
                                                                        </span>
                                                                    )}
                                                                    {prev.proformaNumber && (
                                                                        <span className="text-xs font-mono bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                                                                            پروفرم: {prev.proformaNumber}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {prev.description}
                                                                </p>
                                                                <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500 flex-wrap">
                                                                    <span>تاریخ: {prev.dateLabel}</span>
                                                                    {prev.userLabel && <span>توسط: {prev.userLabel}</span>}
                                                                    <span>فروشنده: {prev.sellerName}</span>
                                                                </div>
                                                            </div>

                                                            {/* Action buttons */}
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenHistoricalProforma(
                                                                        prev.proformaRecord, 
                                                                        `پروفرم قبلی: ${prev.goodsName} (پرونده: ${prev.fileNumber})`,
                                                                        `تاریخ نسخه: ${prev.dateLabel}${prev.userLabel ? ` | توسط: ${prev.userLabel}` : ''}`
                                                                    )}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer active:scale-95"
                                                                    title="باز کردن و مشاهده کامل پروفرم قبلی مشابه پروفرماهای جدید"
                                                                >
                                                                    <Eye size={14} />
                                                                    <span>مشاهده و باز کردن پروفرما</span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExpandedHistoryId(isExpanded ? null : prev.key)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                                                    title="مشاهده اقلام در همین صفحه"
                                                                >
                                                                    <FileText size={14} />
                                                                    <span>{isExpanded ? 'بستن اقلام' : `اقلام (${prev.itemsCount})`}</span>
                                                                    {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                                                </button>

                                                                {prev.canOpenSourceRecord && prev.sourceRecordId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const sourceRec = records.find(r => r.id === prev.sourceRecordId);
                                                                            if (sourceRec) {
                                                                                setSelectedRecord(sourceRec);
                                                                                setActiveTab('proforma');
                                                                            }
                                                                        }}
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                                                        title="رفتن به پرونده اصلی این کالا"
                                                                    >
                                                                        <ExternalLink size={14} />
                                                                        <span>رفتن به پرونده {prev.goodsName}</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Summary Metrics Bar */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800 text-xs">
                                                            <div className="bg-gray-50 dark:bg-zinc-800/60 p-2 rounded-lg">
                                                                <span className="text-[11px] text-gray-400 block">تعداد اقلام / وزن خالص:</span>
                                                                <span className="font-bold text-gray-800 dark:text-gray-200 font-mono">
                                                                    {prev.itemsCount} قلم | {formatNumberString(prev.totalWeight)} kg
                                                                </span>
                                                            </div>
                                                            <div className="bg-gray-50 dark:bg-zinc-800/60 p-2 rounded-lg">
                                                                <span className="text-[11px] text-gray-400 block">وزن ناخالص:</span>
                                                                <span className="font-bold text-gray-800 dark:text-gray-200 font-mono">
                                                                    {formatNumberString(prev.totalGrossWeight)} kg
                                                                </span>
                                                            </div>
                                                            <div className="bg-gray-50 dark:bg-zinc-800/60 p-2 rounded-lg">
                                                                <span className="text-[11px] text-gray-400 block">مبلغ اقلام (FOB):</span>
                                                                <span className="font-bold text-gray-800 dark:text-gray-200 font-mono">
                                                                    {formatNumberString(prev.totalFob)} {prev.currency}
                                                                </span>
                                                            </div>
                                                            <div className="bg-amber-50/80 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                                                                <span className="text-[11px] text-amber-800 dark:text-amber-300 block font-medium">جمع کل پروفرما (+حمل):</span>
                                                                <span className="font-black text-amber-950 dark:text-amber-100 font-mono text-xs sm:text-sm">
                                                                    {formatNumberString(prev.totalGrand)} {prev.currency}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Collapsible detailed items table */}
                                                        {isExpanded && (
                                                            <div className="pt-2 border-t border-dashed border-gray-200 dark:border-zinc-800 space-y-2 animate-in fade-in">
                                                                {prev.proformaRecord.items && prev.proformaRecord.items.length > 0 ? (
                                                                    <div className="overflow-x-auto border rounded-xl dark:border-zinc-800">
                                                                        <table className="w-full text-right text-xs">
                                                                            <thead className="bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 font-bold border-b dark:border-zinc-700">
                                                                                <tr>
                                                                                    <th className="p-2 text-center w-10">#</th>
                                                                                    <th className="p-2">شرح کالا</th>
                                                                                    <th className="p-2 text-center">تعرفه (HS)</th>
                                                                                    <th className="p-2 text-center">وزن خالص (kg)</th>
                                                                                    <th className="p-2 text-center">وزن ناخالص (kg)</th>
                                                                                    <th className="p-2 text-center">قیمت واحد ({prev.currency})</th>
                                                                                    <th className="p-2 text-center">مبلغ کل ({prev.currency})</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
                                                                                {prev.proformaRecord.items.map((item, idx) => (
                                                                                    <tr key={item.id || idx} className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/40">
                                                                                        <td className="p-2 text-center font-mono text-gray-500">{idx + 1}</td>
                                                                                        <td className="p-2 font-medium text-gray-800 dark:text-gray-200">{item.name}</td>
                                                                                        <td className="p-2 text-center font-mono text-gray-600 dark:text-gray-400">{item.hsCode || '---'}</td>
                                                                                        <td className="p-2 text-center font-mono">{formatNumberString(item.weight)}</td>
                                                                                        <td className="p-2 text-center font-mono">{formatNumberString(item.grossWeight || item.weight)}</td>
                                                                                        <td className="p-2 text-center font-mono">{formatNumberString(item.unitPrice)}</td>
                                                                                        <td className="p-2 text-center font-mono font-bold text-gray-900 dark:text-gray-100">{formatNumberString(item.totalPrice || (item.weight * item.unitPrice))}</td>
                                                                                    </tr>
                                                                                ))}
                                                                                {prev.freightCost > 0 && (
                                                                                    <tr className="bg-gray-50 dark:bg-zinc-800/50 font-bold">
                                                                                        <td colSpan={6} className="p-2 text-left pl-4">هزینه حمل کل (Freight):</td>
                                                                                        <td className="p-2 text-center font-mono text-blue-700 dark:text-blue-300">+{formatNumberString(prev.freightCost)} {prev.currency}</td>
                                                                                    </tr>
                                                                                )}
                                                                                <tr className="bg-amber-50 dark:bg-amber-950/40 font-black text-amber-950 dark:text-amber-200">
                                                                                    <td colSpan={6} className="p-2 text-left pl-4">جمع کل نهایی پروفرما:</td>
                                                                                    <td className="p-2 text-center font-mono text-sm">{formatNumberString(prev.totalGrand)} {prev.currency}</td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                ) : (
                                                                    <div className="p-3 text-center text-xs text-gray-500 bg-gray-50 dark:bg-zinc-800/50 rounded-lg">
                                                                        اقلام کالایی به صورت مجزا برای این نسخه ثبت نشده است. برای مشاهده مشخصات کامل روی دکمه «مشاهده و باز کردن پروفرما» کلیک فرمایید.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="glass-panel p-6 rounded-xl shadow-sm border">
                                <div className="flex justify-between items-center mb-4 border-b pb-2">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-gray-800">اقلام پروفرما</h3>
                                        <button type="button" 
                                            onClick={() => {
                                                setTransferForm({
                                                    targetCommodityGroup: commodityGroups.find(g => g !== selectedRecord.commodityGroup) || 'چیپس',
                                                    newFileNumber: selectedRecord.fileNumber + '-TR',
                                                    newGoodsName: selectedRecord.goodsName,
                                                    newSellerName: selectedRecord.sellerName,
                                                    description: ''
                                                });
                                                setShowTransferModal(true);
                                            }} 
                                            className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-black hover:bg-amber-100 transition-all active:scale-95"
                                            title="انتقال پروفرم به گروه کالایی دیگر"
                                        >
                                            <ArrowRightLeft size={14}/> انتقال به گروه دیگر
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setShowProformaPrint(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-black hover:bg-blue-100 transition-all active:scale-95"><Printer size={14}/> مشاهده و چاپ</button>
                                        <div className="flex items-center gap-1">
                                            <button type="button" onClick={() => setSharePlatform('bale')} className="p-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100" title="ارسال به بله"><Share2 size={14}/></button>
                                            <button type="button" onClick={() => setSharePlatform('whatsapp')} className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600" title="ارسال به واتساپ"><Share2 size={14}/></button>
                                        </div>
                                    </div>
                                </div>

                                {sharePlatform && (
                                    <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-black text-gray-700">انتخاب گیرنده ({sharePlatform === 'bale' ? 'بله' : sharePlatform === 'whatsapp' ? 'واتساپ' : 'تلگرام'})</span>
                                            <button type="button" onClick={() => setSharePlatform(null)} className="text-red-500 hover:bg-red-50 p-1 rounded-lg"><X size={16}/></button>
                                        </div>
                                        <div className="relative mb-3">
                                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14}/>
                                            <input type="text" placeholder="جستجوی مخاطب..." className="w-full pr-9 pl-4 py-2 bg-white border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20" value={contactSearch} onChange={e => setContactSearch(e.target.value)}/>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                                            {allContacts.filter(c => c.name.includes(contactSearch) || c.number.includes(contactSearch)).map(c => (
                                                <button type="button" key={c.id} onClick={() => handleShareProforma(c.chatId || c.number)} className="w-full flex justify-between items-center p-2.5 hover:bg-blue-50/50 rounded-lg text-xs transition-colors group">
                                                    <div className="flex flex-col text-right">
                                                        <span className="font-bold text-gray-800">{c.name}</span>
                                                        <span className="text-[10px] text-gray-400 font-mono">{c.number}</span>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all text-blue-600 font-black">ارسال</div>
                                                </button>
                                            ))}
                                            {allContacts.filter(c => c.name.includes(contactSearch) || c.number.includes(contactSearch)).length === 0 && <div className="p-4 text-center text-gray-400 text-[10px]">مخاطبی یافت نشد</div>}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2 items-end mb-4 bg-gray-50 p-3 rounded-lg flex-wrap">
                                    <div className="flex-1 min-w-[150px] space-y-1"><label className="text-xs text-gray-500">شرح کالا</label><input className="w-full border rounded p-2 text-sm" placeholder="نام کالا" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})}/></div>
                                    <div className="w-28 space-y-1"><label className="text-xs text-gray-500">HS Code</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="کد تعرفه" value={newItem.hsCode || ''} onChange={e => setNewItem({...newItem, hsCode: e.target.value})}/></div>
                                    <div className="w-28 space-y-1">
                                        <label className="text-xs text-gray-500">وزن خالص (KG)</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr font-bold" 
                                            placeholder="0" 
                                            value={newItem.weightStr} 
                                            onChange={val => setNewItem({...newItem, weightStr: formatNumberString(val), weight: val})}
                                        />
                                    </div>
                                    <div className="w-28 space-y-1">
                                        <label className="text-xs text-gray-500">وزن ناخالص (KG)</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr font-bold" 
                                            placeholder="0" 
                                            value={newItem.grossWeightStr} 
                                            onChange={val => setNewItem({...newItem, grossWeightStr: formatNumberString(val), grossWeight: val})}
                                        />
                                    </div>
                                    <div className="w-32 space-y-1">
                                        <label className="text-xs text-gray-500">مبلغ فوب (FOB)</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr font-bold text-blue-700" 
                                            placeholder="0" 
                                            value={newItem.unitPriceStr} 
                                            onChange={val => setNewItem({...newItem, unitPriceStr: formatNumberString(val), unitPrice: val})}
                                        />
                                    </div>
                                    <div className="w-28 space-y-1"><label className="text-xs text-gray-500">فی محاسبه شده</label><div className="w-full border rounded p-2 text-sm dir-ltr bg-gray-100 font-mono text-center h-[38px] flex items-center justify-center">
                                        {formatNumberString(deformatNumberString(newItem.weightStr || '0') > 0 ? deformatNumberString(newItem.unitPriceStr || '0') / deformatNumberString(newItem.weightStr || '0') : 0)}
                                    </div></div>
                                    <button type="button" onClick={handleAddItem} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 h-[38px] min-w-[40px] flex items-center justify-center">{editingItemId ? <Save size={18}/> : <Plus size={18}/>}</button>
                                    {editingItemId && <button type="button" onClick={() => { setEditingItemId(null); setNewItem({ name: '', weight: 0, grossWeight: 0, unitPrice: 0, totalPrice: 0, hsCode: '', weightStr: '', grossWeightStr: '', unitPriceStr: '' }); }} className="bg-gray-200 text-gray-700 p-2 rounded-lg hover:bg-gray-300 h-[38px]"><X size={18}/></button>}
                                </div>
                                <div className="hidden lg:block overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرح</th><th className="p-3">HS Code</th><th className="p-3">وزن خالص (KG)</th><th className="p-3">وزن ناخالص (KG)</th><th className="p-3">فی</th><th className="p-3">قیمت کل</th><th className="p-3">عملیات</th></tr></thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {selectedRecord.items.map((item) => (
                                                <tr key={item.id} className={editingItemId === item.id ? 'bg-blue-50' : ''}>
                                                    <td className="p-3">{item.name}</td>
                                                    <td className="p-3 font-mono">{item.hsCode || '-'}</td>
                                                    <td className="p-3 font-mono">{formatNumberString(item.weight)}</td>
                                                    <td className="p-3 font-mono">{formatNumberString(item.grossWeight || item.weight)}</td>
                                                    <td className="p-3 font-mono">{formatNumberString(item.unitPrice)}</td>
                                                    <td className="p-3 font-mono font-bold">{formatNumberString(item.totalPrice)}</td>
                                                    <td className="p-3 flex gap-2">
                                                        <button type="button" onClick={() => handleEditItem(item)} className="text-amber-500 hover:text-amber-700"><Edit size={16}/></button>
                                                        <button type="button" onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-blue-50 font-bold border-t-2 border-blue-200">
                                            <tr className="border-b border-blue-100">
                                                <td className="p-3">جمع اقلام (FOB)</td>
                                                <td></td>
                                                <td className="p-3 font-mono">{formatNumberString(selectedRecord.items.reduce((a,b)=>a+b.weight,0))}</td>
                                                <td className="p-3 font-mono">{formatNumberString(selectedRecord.items.reduce((a,b)=>a+(b.grossWeight || b.weight),0))}</td>
                                                <td></td>
                                                <td className="p-3 font-mono text-blue-700">{formatNumberString(selectedRecord.items.reduce((a,b)=>a+b.totalPrice,0))} {selectedRecord.mainCurrency}</td>
                                                <td></td>
                                            </tr>
                                            {Number(selectedRecord.freightCost) > 0 && (
                                                <tr className="border-b border-blue-100 text-slate-700 bg-blue-50/70">
                                                    <td className="p-3">هزینه حمل کل (Freight)</td>
                                                    <td colSpan={4}></td>
                                                    <td className="p-3 font-mono text-indigo-700">+{formatNumberString(selectedRecord.freightCost)} {selectedRecord.mainCurrency}</td>
                                                    <td></td>
                                                </tr>
                                            )}
                                            <tr className="bg-blue-100/80 text-blue-950 font-black">
                                                <td className="p-3">جمع نهایی پروفرما (FOB + Freight)</td>
                                                <td colSpan={4}></td>
                                                <td className="p-3 font-mono text-blue-900 text-base">{formatNumberString(selectedRecord.items.reduce((a,b)=>a+b.totalPrice,0) + (Number(selectedRecord.freightCost) || 0))} {selectedRecord.mainCurrency}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Mobile Items View */}
                                <div className="lg:hidden space-y-3">
                                    {selectedRecord.items.map((item) => (
                                        <div key={item.id} className={`glass-panel p-4 rounded-xl border border-gray-100 shadow-sm relative ${editingItemId === item.id ? 'border-blue-400 ring-2 ring-blue-100' : ''}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="font-bold text-gray-800">{item.name}</div>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => handleEditItem(item)} className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Edit size={16}/></button>
                                                    <button type="button" onClick={() => handleRemoveItem(item.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={16}/></button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                <div className="bg-gray-50 p-2 rounded-lg"><span className="text-gray-500 block mb-0.5">HS Code:</span> <span className="font-mono font-bold">{item.hsCode || '-'}</span></div>
                                                <div className="bg-gray-50 p-2 rounded-lg"><span className="text-gray-500 block mb-0.5">وزن خالص:</span> <span className="font-mono font-bold">{formatNumberString(item.weight)} KG</span></div>
                                                <div className="bg-gray-50 p-2 rounded-lg"><span className="text-gray-500 block mb-0.5">وزن ناخالص:</span> <span className="font-mono font-bold">{formatNumberString(item.grossWeight || item.weight)} KG</span></div>
                                                <div className="bg-gray-50 p-2 rounded-lg"><span className="text-gray-500 block mb-0.5">فی ارزی:</span> <span className="font-mono font-bold text-blue-600">{formatNumberString(item.unitPrice)}</span></div>
                                                <div className="bg-blue-50 p-2 rounded-lg border border-blue-100 col-span-2"><span className="text-blue-500 block mb-0.5">قیمت کل:</span> <span className="font-mono font-bold text-blue-700 text-sm">{formatNumberString(item.totalPrice)} {selectedRecord.mainCurrency}</span></div>
                                            </div>
                                        </div>
                                    ))}
                                    {(() => {
                                        const fobTotal = selectedRecord.items.reduce((a, b) => a + (b.totalPrice || 0), 0);
                                        const freight = Number(selectedRecord.freightCost) || 0;
                                        const grandTotal = fobTotal + freight;
                                        return (
                                            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-xl shadow-lg shadow-blue-600/20 flex flex-wrap justify-between items-center gap-3">
                                                <div>
                                                    <div className="text-xs font-bold opacity-80 uppercase tracking-wider">Total Summary</div>
                                                    <div className="text-[11px] opacity-75 mt-0.5">
                                                        اقلام (FOB): {formatNumberString(fobTotal)} | کرایه حمل: {formatNumberString(freight)}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] opacity-80 font-medium">جمع کل پروفرما (فوب + حمل)</div>
                                                    <div className="text-lg font-black font-mono">{formatNumberString(grandTotal)} {selectedRecord.mainCurrency}</div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl">
                                    <div>
                                        <label className="text-xs font-bold text-gray-700 block mb-1">هزینه حمل کل (Freight)</label>
                                        <div className="flex gap-2 items-center">
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                className="w-48 border rounded-lg p-2 text-sm dir-ltr font-mono font-bold bg-white" 
                                                value={selectedRecord.freightCost || ''} 
                                                onChange={e => handleUpdateProforma('freightCost', parseFloat(e.target.value) || 0)} 
                                            />
                                            <span className="text-sm font-bold text-gray-500">{selectedRecord.mainCurrency}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-gray-500">مجموع ارزش پروفرما (FOB + Freight)</div>
                                        <div className="text-xl font-black text-blue-700 font-mono">
                                            {formatNumberString(selectedRecord.items.reduce((a, b) => a + (b.totalPrice || 0), 0) + (Number(selectedRecord.freightCost) || 0))} {selectedRecord.mainCurrency}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="glass-panel p-6 rounded-xl shadow-sm border">
                                 <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2"><Banknote size={20} className="text-purple-600"/> هزینه‌های ثبت سفارش (کارمزد بانکی و...)</h3>
                                 <div className="flex gap-2 items-end mb-4 bg-purple-50 p-3 rounded-lg">
                                     <div className="flex-1 space-y-1"><label className="text-xs text-gray-500">شرح هزینه</label><input className="w-full border rounded p-2 text-sm" value={newLicenseTx.description} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})}/></div>
                                     <div className="w-32 space-y-1">
                                         <label className="text-xs text-gray-500">مبلغ (ریال)</label>
                                         <FormattedNumberInput className="w-full border rounded p-2 text-sm dir-ltr font-bold text-gray-800" value={newLicenseTx.amount} onChange={val => setNewLicenseTx({...newLicenseTx, amount: val})}/>
                                     </div>
                                     <div className="w-32 space-y-1">
                                         <label className="text-xs text-gray-500">تاریخ</label>
                                         <TradeDatePicker 
                                             value={newLicenseTx.date || ''} 
                                             onChange={val => setNewLicenseTx({...newLicenseTx, date: val})} 
                                             placeholder="۱۴۰۳/xx/xx"
                                         />
                                     </div>
                                     <div className="flex gap-1 items-center">
                                         <button type="button" onClick={handleAddLicenseTx} className={`${editingLicenseTxId ? 'bg-amber-600 hover:bg-amber-700 text-xs px-3 font-bold' : 'bg-purple-600 hover:bg-purple-700'} text-white p-2 rounded-lg h-[38px] flex items-center justify-center gap-1 shadow-sm transition-all`} title={editingLicenseTxId ? 'ذخیره تغییرات هزینه' : 'افزودن هزینه'}>
                                             {editingLicenseTxId ? <><Save size={16}/><span>ذخیره</span></> : <Plus size={18}/>}
                                         </button>
                                         {editingLicenseTxId && (
                                             <button type="button" onClick={handleCancelEditLicenseTx} className="bg-gray-200 text-gray-700 px-3 p-2 rounded-lg hover:bg-gray-300 h-[38px] text-xs font-bold transition-all" title="انصراف">
                                                 انصراف
                                             </button>
                                         )}
                                     </div>
                                 </div>
                                 <div className="space-y-1">
                                     {selectedRecord.licenseData?.transactions.map(tx => (
                                         <div key={tx.id} className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm border hover:bg-gray-100/60 transition-colors">
                                             <div className="flex gap-4 items-center">
                                                 <span className="font-medium text-gray-800">{tx.description}</span>
                                                 {tx.date && <span className="text-gray-500 text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{tx.date}</span>}
                                                 {tx.bank && <span className="text-purple-700 text-xs font-bold bg-purple-50 px-2 py-0.5 rounded">{tx.bank}</span>}
                                             </div>
                                             <div className="flex gap-2 items-center">
                                                 <span className="font-bold text-purple-700 font-mono ml-2">{formatCurrency(tx.amount)}</span>
                                                 <button type="button" onClick={() => handleEditLicenseTx(tx)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded transition-colors" title="ویرایش هزینه"><Edit size={15}/></button>
                                                 <button type="button" onClick={() => handleRemoveLicenseTx(tx.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors" title="حذف هزینه"><Trash2 size={15}/></button>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                            </div>

                            {/* Proforma & Licensing Attachments */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800">
                                <TradeAttachmentSection
                                    attachments={selectedRecord.attachments?.filter(a => a.category?.includes('proforma') || a.subCategory === 'proforma') || []}
                                    onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/proforma', updated, 'proforma')}
                                    category="commercial/proforma"
                                    title="پیوست‌ها و اسناد پروفرما و مجوزها (تصویر و PDF)"
                                    description="تصویر پیش‌فاکتور، تاییدیه ثبت سفارش، فرم‌های گواهی استاندارد، مدارک فروشنده و فیش‌های کارمزد"
                                    currentUser={currentUser}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'insurance' && (
                        <InsuranceTab 
                            form={insuranceForm} 
                            setForm={setInsuranceForm} 
                            companies={settings?.insuranceCompanies || []} 
                            banks={companySpecificBanks} 
                            onSave={handleSaveInsurance}
                            newEndorsement={newEndorsement}
                            setNewEndorsement={setNewEndorsement}
                            endorsementType={endorsementType}
                            setEndorsementType={setEndorsementType}
                            onAddEndorsement={handleAddEndorsement}
                            onDeleteEndorsement={handleDeleteEndorsement}
                            editingEndorsementId={editingEndorsementId}
                            onEditEndorsement={handleEditEndorsement}
                            onCancelEditEndorsement={handleCancelEditEndorsement}
                            attachments={(selectedRecord.insuranceData?.attachments && selectedRecord.insuranceData.attachments.length > 0) ? selectedRecord.insuranceData.attachments : (selectedRecord.attachments?.filter(a => a.category?.includes('insurance')) || [])}
                            onAttachmentsChange={async (updated) => {
                                const updatedInsuranceData = { ...selectedRecord.insuranceData, attachments: updated };
                                const otherAtts = (selectedRecord.attachments || []).filter(a => !a.category?.includes('insurance'));
                                const updatedRecord = { 
                                    ...selectedRecord, 
                                    insuranceData: updatedInsuranceData as any,
                                    attachments: [...otherAtts, ...updated]
                                };
                                await persistRecordUpdate(updatedRecord);
                            }}
                            currentUser={currentUser}
                        />
                    )}

                    {activeTab === 'allocation' && selectedRecord && (
                        <AllocationTab 
                            record={selectedRecord}
                            onSave={handleSaveAllocation}
                            uploadFile={uploadFile}
                            onOpenAttachment={(url, name) => {
                                setViewerUrl(url);
                                setViewerName(name);
                                setViewerOpen(true);
                            }}
                            onSendToChat={(attachment, msg) => {
                                setSendToChatAttachment(attachment);
                                setSendToChatDefaultMsg(msg);
                                setSendToChatOpen(true);
                            }}
                        />
                    )}

                    {activeTab === 'currency_purchase' && (
                        /* ... Currency Purchase Logic ... */
                        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                            {/* Tranches Section */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Coins size={20} className="text-amber-600"/> پارت‌های خرید ارز</h3>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-amber-50 p-4 rounded-lg">
                                    <div className="col-span-1 space-y-1">
                                        <label className="text-xs font-bold text-gray-700">نوع ارز</label>
                                        <select 
                                            className="w-full border rounded p-2 text-sm glass-panel" 
                                            value={newCurrencyTranche.currencyType} 
                                            onChange={e => setNewCurrencyTranche({...newCurrencyTranche, currencyType: e.target.value})}
                                        >
                                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-1 space-y-1">
                                        <label className="text-xs font-bold text-gray-700">مقدار ارز</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr font-bold text-blue-700" 
                                            value={newCurrencyTranche.amountStr} 
                                            onChange={() => {}}
                                            onChangeString={str => setNewCurrencyTranche({...newCurrencyTranche, amountStr: str})}
                                            placeholder="مثال: 12,500.5"
                                        />
                                    </div>
                                    <div className="col-span-1 space-y-1">
                                        <label className="text-xs font-bold text-gray-700">مبلغ کل پرداختی (ریال)</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr font-bold" 
                                            value={newCurrencyTranche.rialAmountStr} 
                                            onChange={() => {}}
                                            onChangeString={str => setNewCurrencyTranche({...newCurrencyTranche, rialAmountStr: str})} 
                                            placeholder="مبلغ پرداختی..."
                                        />
                                    </div>
                                    <div className="col-span-1 space-y-1">
                                        <label className="text-xs font-bold text-gray-700">کارمزد ارزی</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr font-medium text-purple-700" 
                                            value={newCurrencyTranche.currencyFeeStr} 
                                            onChange={() => {}}
                                            onChangeString={str => setNewCurrencyTranche({...newCurrencyTranche, currencyFeeStr: str})} 
                                            placeholder="اختیاری..."
                                        />
                                    </div>
                                    <div className="col-span-1 space-y-1"><label className="text-xs font-bold text-gray-700">صرافی</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.exchangeName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})} /></div>
                                    <div className="col-span-1 space-y-1"><label className="text-xs font-bold text-gray-700">کارگزار</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.brokerName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, brokerName: e.target.value})} /></div>
                                    <div className="col-span-1 space-y-1">
                                        <label className="text-xs font-bold text-gray-700">تاریخ خرید</label>
                                        <TradeDatePicker 
                                            value={newCurrencyTranche.date || ''} 
                                            onChange={val => setNewCurrencyTranche({...newCurrencyTranche, date: val})} 
                                            placeholder="۱۴۰۳/۰۱/۰۱"
                                        />
                                    </div>
                                    {/* Added Return Fields */}
                                    <div className="col-span-1 space-y-1">
                                        <label className="text-xs font-bold text-red-700">مبلغ عودت (ریال)</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr text-red-700" 
                                            value={newCurrencyTranche.returnAmount} 
                                            onChange={() => {}}
                                            onChangeString={str => setNewCurrencyTranche({...newCurrencyTranche, returnAmount: str})} 
                                            placeholder="اختیاری" 
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-xs font-bold text-red-700">تاریخ عودت</label>
                                        <TradeDatePicker 
                                            value={newCurrencyTranche.returnDate || ''} 
                                            onChange={val => setNewCurrencyTranche({...newCurrencyTranche, returnDate: val})} 
                                            placeholder="۱۴۰۳/..."
                                        />
                                    </div>
                                    
                                    <div className="col-span-1 space-y-1">
                                        <label className="text-xs font-bold text-green-700">مقدار تحویلی</label>
                                        <FormattedNumberInput 
                                            className="w-full border rounded p-2 text-sm dir-ltr font-bold text-green-700" 
                                            value={newCurrencyTranche.receivedAmountStr} 
                                            onChange={() => {}}
                                            onChangeString={str => setNewCurrencyTranche({...newCurrencyTranche, receivedAmountStr: str})} 
                                            placeholder="اختیاری" 
                                        />
                                    </div>

                                    <div className="col-span-2 flex justify-end mt-2 gap-2">
                                        {editingTrancheId && <button type="button" onClick={handleCancelEditTranche} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>}
                                        <button type="button" onClick={handleAddCurrencyTranche} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-700 flex items-center gap-1"><Plus size={16} /> {editingTrancheId ? 'ویرایش و ذخیره' : 'افزودن پارت'}</button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">تاریخ</th><th className="p-3">مقدار</th><th className="p-3">کل پرداختی (ریال)</th><th className="p-3">کارمزد ارزی</th><th className="p-3">صرافی / کارگزار</th><th className="p-3 text-green-700">تحویل شده</th><th className="p-3 text-red-700">عودت (ریال)</th><th className="p-3 text-center">وضعیت تحویل</th><th className="p-3 bg-indigo-50 text-indigo-800">نرخ تمام شده</th><th className="p-3">عملیات</th></tr></thead>
                                        <tbody>
                                            {currencyForm.tranches?.map((t) => {
                                                // Check for return amount field, handle if missing in type definition (runtime check)
                                                // @ts-ignore
                                                const retAmt = t.returnAmount;
                                                // @ts-ignore
                                                const retDate = t.returnDate;
                                                // @ts-ignore
                                                const recvAmt = t.receivedAmount;
                                                
                                                // Calculate Effective Rate for Display: (Paid - Return) / Delivered
                                                const netPaid = (t.rialAmount || 0) - (retAmt || 0);
                                                const actualDelivered = recvAmt || (t.isDelivered ? t.amount : 0);
                                                const effectiveRateDisplay = actualDelivered > 0 ? netPaid / actualDelivered : 0;
                                                
                                                return (
                                                <tr key={t.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3">{t.date}</td>
                                                    <td className="p-3 font-mono font-bold text-blue-600">{formatNumberString(t.amount)} {t.currencyType}</td>
                                                    <td className="p-3 font-mono">{formatNumberString(t.rialAmount || 0)}</td>
                                                    <td className="p-3 font-mono">{t.currencyFee ? t.currencyFee : '-'}</td>
                                                    <td className="p-3 text-xs">{t.exchangeName} {t.brokerName ? `(${t.brokerName})` : ''}</td>
                                                    <td className="p-3 text-xs font-bold text-green-600 font-mono">{(((t.deliveries && t.deliveries.length > 0) ? t.deliveries.reduce((sum: number, d) => sum + d.amount, 0) : recvAmt) ? formatNumberString((t.deliveries && t.deliveries.length > 0) ? t.deliveries.reduce((sum: number, d) => sum + d.amount, 0) : recvAmt) : '-')}{t.deliveries && t.deliveries.length > 0 && <span className="text-[10px] text-gray-500 font-sans block">({t.deliveries.length} تحویل)</span>}</td>
                                                    <td className="p-3 text-xs text-red-600 font-mono">{retAmt ? `${formatNumberString(retAmt)} (${retDate || '-'})` : '-'}</td>
                                                    <td className="p-3 text-center">
                                                        <button type="button" onClick={() => handleToggleTrancheDelivery(t.id)} className={`px-2 py-1 rounded text-xs font-bold ${t.isDelivered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                            {t.isDelivered ? 'تکمیل' : 'ناقص'}
                                                        </button>
                                                    </td>
                                                    <td className="p-3 font-mono font-bold text-indigo-700 bg-indigo-50">{effectiveRateDisplay > 0 ? formatCurrency(effectiveRateDisplay) : '-'}</td>
                                                    <td className="p-3 flex gap-1">
                                                        <button type="button" onClick={() => { setSelectedTrancheForDeliveries(t.id); setNewDeliveryForm({ amount: '', date: '', recipientName: '', description: '' }); }} className="text-green-600 hover:text-green-800 p-1 flex items-center" title="مدیریت تحویل‌ها"><Coins size={16} className="ml-1"/></button><button type="button" onClick={() => handleEditTranche(t)} className="text-amber-500 hover:text-amber-700 p-1"><Edit2 size={16}/></button>
                                                        <button type="button" onClick={() => handleRemoveTranche(t.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16}/></button>
                                                    </td>
                                                </tr>
                                            )})}
                                            {(() => {
                                                const totalPaid = currencyForm.tranches?.reduce((acc, t) => acc + (t.rialAmount || 0), 0) || 0;
                                                const totalReturn = currencyForm.tranches?.reduce((acc, t:any) => acc + (t.returnAmount || 0), 0) || 0;
                                                const totalNet = totalPaid - totalReturn;
                                                const totalDelivered = currencyForm.deliveredAmount || 0;
                                                const avgRate = totalDelivered > 0 ? totalNet / totalDelivered : 0;

                                                return (
                                                    <tr className="bg-amber-50 font-bold border-t-2 border-amber-200">
                                                        <td className="p-3">جمع کل</td>
                                                        <td className="p-3 font-mono text-amber-800">{formatNumberString(currencyForm.purchasedAmount)}</td>
                                                        <td className="p-3 font-mono">{formatNumberString(totalPaid)}</td>
                                                        <td colSpan={2}></td>
                                                        <td className="p-3 font-mono text-green-800">{formatNumberString(currencyForm.deliveredAmount)}</td>
                                                        <td className="p-3 font-mono text-red-800">{formatNumberString(totalReturn)}</td>
                                                        <td></td>
                                                        <td className="p-3 font-mono text-indigo-800 text-sm bg-indigo-100">{formatCurrency(avgRate)}</td>
                                                        <td></td>
                                                    </tr>
                                                );
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Guarantee Cheque Section */}
                            <CurrencyGuaranteeSection 
                                guarantees={currencyForm.guaranteeCheques || (currencyForm.guaranteeCheque ? [currencyForm.guaranteeCheque] : [])} 
                                onAdd={handleAddCurrencyGuarantee}
                                onDelete={handleDeleteCurrencyGuarantee}
                                onToggleDelivery={handleToggleCurrencyGuaranteeDelivery}
                                companyBanks={companySpecificBanks}
                            />

                            {/* Currency Purchase Attachments */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800">
                                <TradeAttachmentSection
                                    attachments={selectedRecord.attachments?.filter(a => a.category?.includes('currency') || a.subCategory === 'currency') || []}
                                    onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/currency', updated, 'currency')}
                                    category="commercial/currency"
                                    title="پیوست‌ها و اسناد خرید ارز و صرافی (تصویر و PDF)"
                                    description="رسید حواله ارزی، سوئیفت، تاییدیه صرافی، فیش‌های واریزی ریالی و چک‌های تعهد ارزی"
                                    currentUser={currentUser}
                                />
                            </div>
                        </div>
                    )}

                    {/* ... (Other tabs kept same - Shipping Docs, Inspection, etc.) ... */}
                    {activeTab === 'shipping_docs' && (
                        /* ... Shipping Docs Logic ... */
                        <div className="p-3 sm:p-6 max-w-5xl mx-auto flex flex-col md:flex-row gap-3 sm:gap-6">
                            {/* Responsive Sub-tabs: Horizontal pill row on mobile, vertical sidebar on desktop */}
                            <div className="flex md:flex-col overflow-x-auto no-scrollbar gap-1.5 sm:gap-2 shrink-0 md:w-48 pb-1">
                                <button type="button" onClick={() => setActiveShippingSubTab('Commercial Invoice')} className={`px-3 py-2 sm:p-3 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap text-center md:text-right shrink-0 transition-all ${activeShippingSubTab === 'Commercial Invoice' ? 'bg-blue-600 text-white shadow-md' : 'glass-panel bg-white dark:bg-zinc-800 hover:bg-gray-50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700'}`}>اینویس</button>
                                <button type="button" onClick={() => setActiveShippingSubTab('Packing List')} className={`px-3 py-2 sm:p-3 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap text-center md:text-right shrink-0 transition-all ${activeShippingSubTab === 'Packing List' ? 'bg-blue-600 text-white shadow-md' : 'glass-panel bg-white dark:bg-zinc-800 hover:bg-gray-50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700'}`}>پکینگ لیست</button>
                                <button type="button" onClick={() => setActiveShippingSubTab('Bill of Lading')} className={`px-3 py-2 sm:p-3 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap text-center md:text-right shrink-0 transition-all ${activeShippingSubTab === 'Bill of Lading' ? 'bg-blue-600 text-white shadow-md' : 'glass-panel bg-white dark:bg-zinc-800 hover:bg-gray-50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700'}`}>بارنامه</button>
                                <button type="button" onClick={() => setActiveShippingSubTab('Certificate of Origin')} className={`px-3 py-2 sm:p-3 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap text-center md:text-right shrink-0 transition-all ${activeShippingSubTab === 'Certificate of Origin' ? 'bg-blue-600 text-white shadow-md' : 'glass-panel bg-white dark:bg-zinc-800 hover:bg-gray-50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700'}`}>گواهی مبدا</button>
                            </div>
                            <div className="flex-1 glass-panel p-3.5 sm:p-6 rounded-2xl shadow-xs border border-gray-200 dark:border-zinc-800 space-y-4 sm:space-y-6 min-w-0">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 border-b pb-2 mb-3 text-sm sm:text-base">{activeShippingSubTab === 'Commercial Invoice' ? 'سیاهه تجاری (Invoice)' : activeShippingSubTab === 'Packing List' ? 'لیست عدل‌بندی (Packing List)' : activeShippingSubTab}</h3>
                                {/* Document Form */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">شماره سند</label><input className="w-full border rounded-xl p-2 text-sm dir-ltr bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700" value={shippingDocForm.documentNumber} onChange={e => setShippingDocForm({...shippingDocForm, documentNumber: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">پارت / دوره</label><input className="w-full border rounded-xl p-2 text-sm bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700" placeholder="مثلا: پارت اول" value={shippingDocForm.description || ''} onChange={e => setShippingDocForm({...shippingDocForm, description: e.target.value})} /></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">تاریخ سند</label>
                                        <TradeDatePicker 
                                            value={shippingDocForm.documentDate || ''} 
                                            onChange={val => setShippingDocForm({...shippingDocForm, documentDate: val})} 
                                        />
                                    </div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">وضعیت</label><select className="w-full border rounded-xl p-2 text-sm bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700" value={shippingDocForm.status} onChange={e => setShippingDocForm({...shippingDocForm, status: e.target.value as DocStatus})}><option value="Draft">پیش‌نویس</option><option value="Final">نهایی</option></select></div>
                                </div>

                                {activeShippingSubTab === 'Commercial Invoice' && (
                                    <div className="bg-blue-50/70 dark:bg-blue-950/30 p-3 sm:p-4 rounded-xl space-y-3 sm:space-y-4 border border-blue-200/50 dark:border-blue-900/40">
                                        <div className="flex justify-between items-center flex-wrap gap-2">
                                            <h4 className="font-bold text-xs sm:text-sm text-blue-800 dark:text-blue-300">اقلام اینویس</h4>
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <select className="border rounded-lg p-1 text-xs bg-white dark:bg-zinc-800 border-blue-200 dark:border-zinc-700" value={shippingDocForm.currency} onChange={e => setShippingDocForm({...shippingDocForm, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
                                                <button type="button" onClick={handleSyncInvoiceToProforma} className="bg-orange-500 hover:bg-orange-600 text-white text-[11px] sm:text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer" title="جایگزینی اقلام اینویس در پروفرما"><RefreshCw size={13}/> جایگزینی در پروفرما</button>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-end flex-wrap">
                                            <input className="flex-1 min-w-[130px] border rounded-lg p-2 text-xs sm:text-sm bg-white dark:bg-zinc-800" placeholder="نام کالا" value={newInvoiceItem.name} onChange={e => setNewInvoiceItem({...newInvoiceItem, name: e.target.value})} />
                                            <input className="w-20 border rounded-lg p-2 text-xs sm:text-sm dir-ltr bg-white dark:bg-zinc-800" placeholder="وزن خالص" value={newInvoiceItem.weight || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, weight: Number(e.target.value)})} type="number" step="0.001" />
                                            <input className="w-20 border rounded-lg p-2 text-xs sm:text-sm dir-ltr bg-white dark:bg-zinc-800" placeholder="وزن ناخالص" value={newInvoiceItem.grossWeight || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, grossWeight: Number(e.target.value)})} type="number" step="0.001" />
                                            <input className="w-20 border rounded-lg p-2 text-xs sm:text-sm dir-ltr bg-white dark:bg-zinc-800" placeholder="فی (Unit)" value={newInvoiceItem.unitPrice || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, unitPrice: Number(e.target.value)})} type="number" step="0.0001" />
                                            <input className="w-16 border rounded-lg p-2 text-xs sm:text-sm bg-white dark:bg-zinc-800" placeholder="پارت" value={newInvoiceItem.part} onChange={e => setNewInvoiceItem({...newInvoiceItem, part: e.target.value})} />
                                            <input className="w-24 border rounded-lg p-2 text-xs sm:text-sm dir-ltr bg-gray-100 dark:bg-zinc-900" placeholder="قیمت کل" value={newInvoiceItem.totalPrice || ((newInvoiceItem.weight || 0) * (newInvoiceItem.unitPrice || 0))} readOnly />
                                            <button type="button" onClick={handleAddInvoiceItem} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg cursor-pointer shrink-0"><Plus size={16}/></button>
                                        </div>
                                        <div className="space-y-1">{shippingDocForm.invoiceItems?.map(i => (<div key={i.id} className="flex justify-between glass-panel p-2 rounded-lg text-xs border items-center flex-wrap gap-2"><span>{i.name}</span><div className="flex gap-2 items-center flex-wrap"><span className="bg-gray-100 dark:bg-zinc-800 px-1 rounded text-gray-500">Part: {i.part}</span><span className="font-mono text-gray-700 dark:text-gray-300">خالص: {formatNumberString(i.weight)} kg</span><span className="font-mono text-gray-700 dark:text-gray-300">ناخالص: {formatNumberString(i.grossWeight || i.weight)} kg</span><span className="font-mono">@{i.unitPrice}</span><span className="font-mono font-bold text-blue-700 dark:text-blue-400">{formatNumberString(i.totalPrice)}</span><button type="button" onClick={()=>handleRemoveInvoiceItem(i.id)} className="text-red-500 hover:text-red-700 p-1"><X size={14}/></button></div></div>))}</div>
                                        <div className="flex justify-between items-center pt-2 border-t border-blue-200 dark:border-blue-900/60"><span className="font-bold text-xs text-gray-700 dark:text-gray-300">هزینه حمل (Freight)</span><input className="w-28 sm:w-32 border rounded-lg p-1.5 text-xs sm:text-sm dir-ltr bg-white dark:bg-zinc-800" value={shippingDocForm.freightCost} onChange={e => setShippingDocForm({...shippingDocForm, freightCost: Number(e.target.value)})} type="number" step="0.01" /></div>
                                    </div>
                                )}

                                {activeShippingSubTab === 'Packing List' && (
                                    <div className="bg-orange-50/70 dark:bg-orange-950/30 p-3 sm:p-4 rounded-xl space-y-3 sm:space-y-4 border border-orange-200/50 dark:border-orange-900/40">
                                        <h4 className="font-bold text-xs sm:text-sm text-orange-800 dark:text-orange-300 flex items-center gap-2"><Box size={16}/> اقلام پکینگ لیست</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 items-end">
                                            <div className="md:col-span-2 space-y-1"><label className="text-[10px] text-gray-500">شرح کالا</label><input className="w-full border rounded-lg p-1.5 text-xs sm:text-sm bg-white dark:bg-zinc-800" placeholder="نام کالا" value={newPackingItem.description} onChange={e => setNewPackingItem({...newPackingItem, description: e.target.value})} /></div>
                                            <div className="space-y-1"><label className="text-[10px] text-gray-500">پارت</label><input className="w-full border rounded-lg p-1.5 text-xs sm:text-sm bg-white dark:bg-zinc-800" placeholder="Part No" value={newPackingItem.part} onChange={e => setNewPackingItem({...newPackingItem, part: e.target.value})} /></div>
                                            <div className="space-y-1"><label className="text-[10px] text-gray-500">وزن خالص</label><input className="w-full border rounded-lg p-1.5 text-xs sm:text-sm dir-ltr bg-white dark:bg-zinc-800" placeholder="NW" value={newPackingItem.netWeight || ''} onChange={e => setNewPackingItem({...newPackingItem, netWeight: Number(e.target.value)})} type="number" /></div>
                                            <div className="space-y-1"><label className="text-xs text-gray-500">وزن ناخالص</label><input className="w-full border rounded-lg p-1.5 text-xs sm:text-sm dir-ltr bg-white dark:bg-zinc-800" placeholder="GW" value={newPackingItem.grossWeight || ''} onChange={e => setNewPackingItem({...newPackingItem, grossWeight: Number(e.target.value)})} type="number" /></div>
                                            <div className="flex gap-2">
                                                <div className="space-y-1 flex-1"><label className="text-[10px] text-gray-500">تعداد بسته</label><input className="w-full border rounded-lg p-1.5 text-xs sm:text-sm dir-ltr bg-white dark:bg-zinc-800" placeholder="Count" value={newPackingItem.packageCount || ''} onChange={e => setNewPackingItem({...newPackingItem, packageCount: Number(e.target.value)})} type="number" /></div>
                                                <button type="button" onClick={handleAddPackingItem} className="bg-orange-600 hover:bg-orange-700 text-white p-1.5 rounded-lg h-[34px] mt-auto w-10 flex items-center justify-center shrink-0 cursor-pointer"><Plus size={16}/></button>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs text-right glass-panel rounded border border-orange-200 dark:border-orange-900/60">
                                                <thead className="bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-200"><tr><th className="p-2">شرح</th><th className="p-2">پارت</th><th className="p-2">وزن خالص</th><th className="p-2">وزن ناخالص</th><th className="p-2">تعداد</th><th className="p-2"></th></tr></thead>
                                                <tbody>
                                                    {shippingDocForm.packingItems?.map(item => (
                                                        <tr key={item.id} className="border-t hover:bg-orange-50 dark:hover:bg-orange-950/20">
                                                            <td className="p-2 font-bold">{item.description}</td>
                                                            <td className="p-2">{item.part}</td>
                                                            <td className="p-2 font-mono">{item.netWeight}</td>
                                                            <td className="p-2 font-mono">{item.grossWeight}</td>
                                                            <td className="p-2 font-mono">{item.packageCount}</td>
                                                            <td className="p-2 text-center"><button type="button" onClick={() => handleRemovePackingItem(item.id)} className="text-red-500 hover:text-red-700 p-1"><X size={14}/></button></td>
                                                        </tr>
                                                    ))}
                                                    <tr className="bg-orange-50 dark:bg-orange-950/40 font-bold border-t-2 border-orange-200 dark:border-orange-900/60">
                                                        <td colSpan={2} className="p-2 text-center text-orange-800 dark:text-orange-300">جمع کل</td>
                                                        <td className="p-2 font-mono text-orange-700 dark:text-orange-300">{shippingDocForm.packingItems?.reduce((s,i)=>s+i.netWeight,0)}</td>
                                                        <td className="p-2 font-mono text-orange-700 dark:text-orange-300">{shippingDocForm.packingItems?.reduce((s,i)=>s+i.grossWeight,0)}</td>
                                                        <td className="p-2 font-mono text-orange-700 dark:text-orange-300">{shippingDocForm.packingItems?.reduce((s,i)=>s+i.packageCount,0)}</td>
                                                        <td></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <TradeAttachmentSection
                                        attachments={(shippingDocForm.attachments || []) as any}
                                        onAttachmentsChange={(updated) => setShippingDocForm(prev => ({ ...prev, attachments: updated as any }))}
                                        category="commercial/shipping"
                                        subCategory={activeShippingSubTab}
                                        title={`پیوست‌ها و مدارک ${activeShippingSubTab} (عکس و PDF)`}
                                        description={`بارگذاری اسناد، تصاویر و فایل‌های PDF مربوط به ${activeShippingSubTab}`}
                                        currentUser={currentUser}
                                        compact={false}
                                    />
                                </div>

                                <div className="flex justify-end items-center gap-2 pt-3 pb-1 border-t sticky bottom-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm -mx-3.5 -mb-3.5 sm:-mx-6 sm:-mb-6 px-4 py-3 rounded-b-2xl z-10 shadow-xs">
                                    {editingShippingDocId && (
                                        <button type="button" onClick={handleCancelEditShippingDoc} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer">
                                            انصراف از ویرایش
                                        </button>
                                    )}
                                    <button type="button" onClick={handleSaveShippingDoc} className={`${editingShippingDocId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-5 sm:px-7 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer active:scale-95`}>
                                        {editingShippingDocId ? 'بروزرسانی سند' : 'ثبت سند'}
                                    </button>
                                </div>
                                
                                <div className="mt-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2">
                                            <FolderOpen size={16} className="text-blue-600"/>
                                            اسناد ثبت شده ({selectedRecord.shippingDocuments?.filter(d => d.type === activeShippingSubTab).length || 0})
                                        </h4>
                                    </div>
                                    <div className="space-y-3">
                                        {!selectedRecord.shippingDocuments || selectedRecord.shippingDocuments.filter(d => d.type === activeShippingSubTab).length === 0 ? (
                                            <div className="p-4 bg-gray-50 border border-dashed rounded-xl text-center text-xs text-gray-400">
                                                هنوز سندی در این بخش ثبت نشده است.
                                            </div>
                                        ) : (
                                            selectedRecord.shippingDocuments.filter(d => d.type === activeShippingSubTab).map(doc => {
                                                const isExpanded = !!expandedShippingDocIds[doc.id];
                                                const totalNet = doc.type === 'Commercial Invoice'
                                                    ? (doc.invoiceItems?.reduce((s, i) => s + (i.weight || 0), 0) || doc.netWeight || 0)
                                                    : (doc.packingItems?.reduce((s, i) => s + (i.netWeight || 0), 0) || doc.netWeight || 0);
                                                const totalGross = doc.type === 'Commercial Invoice'
                                                    ? (doc.invoiceItems?.reduce((s, i) => s + (i.grossWeight || i.weight || 0), 0) || doc.grossWeight || totalNet)
                                                    : (doc.packingItems?.reduce((s, i) => s + (i.grossWeight || i.netWeight || 0), 0) || doc.grossWeight || totalNet);
                                                const totalAmount = doc.invoiceItems?.reduce((s, i) => s + (i.totalPrice || 0), 0) || 0;
                                                const grandTotal = totalAmount + (doc.freightCost || 0);

                                                return (
                                                    <div key={doc.id} className={`border rounded-xl overflow-hidden transition-all duration-200 shadow-sm ${isExpanded ? 'border-blue-400 bg-white ring-2 ring-blue-100' : 'border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300'}`}>
                                                        {/* Header Bar / Summary */}
                                                        <div 
                                                            onClick={() => toggleShippingDocExpand(doc.id)}
                                                            className="p-3.5 flex justify-between items-center cursor-pointer select-none gap-3 flex-wrap"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-blue-600 text-white rotate-180 shadow-sm' : 'bg-gray-200 text-gray-700'}`}>
                                                                    <ChevronDown size={16} />
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="font-mono font-bold text-gray-900 text-sm tracking-wide">{doc.documentNumber}</span>
                                                                        {doc.documentDate && (
                                                                            <span className="text-xs text-gray-500 font-medium">({doc.documentDate})</span>
                                                                        )}
                                                                        {doc.status && (
                                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${doc.status === 'Final' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                                {doc.status === 'Final' ? 'نهایی' : 'پیش‌نویس'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                                                                        {doc.type === 'Commercial Invoice' && (
                                                                            <>
                                                                                <span>اقلام: <strong className="text-gray-700 font-mono">{doc.invoiceItems?.length || 0}</strong> ردیف</span>
                                                                                <span>وزن خالص: <strong className="text-gray-700 font-mono">{formatNumberString(totalNet)}</strong> KG</span>
                                                                                <span>وزن ناخالص: <strong className="text-gray-700 font-mono">{formatNumberString(totalGross)}</strong> KG</span>
                                                                                <span>مبلغ کل: <strong className="text-blue-700 font-mono">{formatNumberString(grandTotal)}</strong> {doc.currency || selectedRecord.mainCurrency}</span>
                                                                            </>
                                                                        )}
                                                                        {doc.type === 'Packing List' && (
                                                                            <>
                                                                                <span>بسته‌ها: <strong className="text-gray-700 font-mono">{formatNumberString(doc.packingItems?.reduce((s,i)=>s+(i.packageCount||0),0) || doc.packagesCount || 0)}</strong></span>
                                                                                <span>وزن خالص: <strong className="text-gray-700 font-mono">{formatNumberString(totalNet)}</strong> KG</span>
                                                                                <span>وزن ناخالص: <strong className="text-gray-700 font-mono">{formatNumberString(totalGross)}</strong> KG</span>
                                                                            </>
                                                                        )}
                                                                        {(doc.type === 'Bill of Lading' || doc.type === 'Certificate of Origin') && (
                                                                            <>
                                                                                {doc.vesselName && <span>کشتی: <strong className="text-gray-700">{doc.vesselName}</strong></span>}
                                                                                {totalNet > 0 && <span>وزن: <strong className="text-gray-700 font-mono">{formatNumberString(totalNet)}</strong> KG</span>}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                <button type="button" 
                                                                    onClick={() => toggleShippingDocExpand(doc.id)} 
                                                                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${isExpanded ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                                                                    title={isExpanded ? 'بستن منو' : 'مشاهده در همین صفحه'}
                                                                >
                                                                    <Eye size={14}/>
                                                                    {isExpanded ? 'بستن منو' : 'مشاهده'}
                                                                </button>
                                                                <button type="button" 
                                                                    onClick={() => setSelectedShippingDocForPrint(doc)} 
                                                                    className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-bold transition-all active:scale-95"
                                                                    title="چاپ سند استاندارد / PDF"
                                                                >
                                                                    <Printer size={14}/>
                                                                    چاپ
                                                                </button>
                                                                <button type="button" 
                                                                    onClick={() => handleEditShippingDoc(doc)} 
                                                                    className="flex items-center gap-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg font-bold transition-all active:scale-95"
                                                                    title="ویرایش سند"
                                                                >
                                                                    <Edit size={14}/>
                                                                    ویرایش
                                                                </button>
                                                                <button type="button" 
                                                                    onClick={() => handleDeleteShippingDoc(doc.id)} 
                                                                    className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                                                    title="حذف سند"
                                                                >
                                                                    <Trash2 size={16}/>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Expandable Document Menu / Inline View */}
                                                        {isExpanded && (
                                                            <div className="p-4 border-t border-gray-200 bg-white space-y-4">
                                                                {/* Summary Meta Grid */}
                                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg text-xs">
                                                                    <div><span className="text-gray-400 block mb-0.5">نوع سند:</span> <span className="font-bold text-gray-800">{doc.type}</span></div>
                                                                    <div><span className="text-gray-400 block mb-0.5">شماره سند:</span> <span className="font-bold font-mono text-gray-800">{doc.documentNumber}</span></div>
                                                                    <div><span className="text-gray-400 block mb-0.5">تاریخ سند:</span> <span className="font-bold text-gray-800">{doc.documentDate || '---'}</span></div>
                                                                    <div><span className="text-gray-400 block mb-0.5">وضعیت سند:</span> <span className="font-bold text-gray-800">{doc.status === 'Final' ? 'نهایی' : 'پیش‌نویس'}</span></div>
                                                                    {doc.vesselName && <div><span className="text-gray-400 block mb-0.5">نام شناور / کشتی:</span> <span className="font-bold text-gray-800">{doc.vesselName}</span></div>}
                                                                    {doc.portOfLoading && <div><span className="text-gray-400 block mb-0.5">بندر بارگیری:</span> <span className="font-bold text-gray-800">{doc.portOfLoading}</span></div>}
                                                                    {doc.portOfDischarge && <div><span className="text-gray-400 block mb-0.5">بندر تخلیه:</span> <span className="font-bold text-gray-800">{doc.portOfDischarge}</span></div>}
                                                                    {doc.createdBy && <div><span className="text-gray-400 block mb-0.5">ثبت‌کننده:</span> <span className="font-bold text-gray-800">{doc.createdBy}</span></div>}
                                                                </div>

                                                                {/* Invoice Items Table */}
                                                                {doc.type === 'Commercial Invoice' && (
                                                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                                                        <div className="bg-blue-50 px-3 py-2 border-b border-blue-100 flex justify-between items-center text-xs font-bold text-blue-900">
                                                                            <span>اقلام سیاهه تجاری (Commercial Invoice)</span>
                                                                            <span>ارز: {doc.currency || selectedRecord.mainCurrency}</span>
                                                                        </div>
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-xs text-right">
                                                                                <thead className="bg-gray-100 text-gray-700">
                                                                                    <tr>
                                                                                        <th className="p-2 w-10 text-center">ردیف</th>
                                                                                        <th className="p-2">شرح کالا</th>
                                                                                        <th className="p-2 w-16 text-center">پارت</th>
                                                                                        <th className="p-2 text-center font-mono">وزن خالص (kg)</th>
                                                                                        <th className="p-2 text-center font-mono">وزن ناخالص (kg)</th>
                                                                                        <th className="p-2 text-center font-mono">فی واحد</th>
                                                                                        <th className="p-2 text-center font-mono">مبلغ کل ({doc.currency || selectedRecord.mainCurrency})</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-gray-100">
                                                                                    {doc.invoiceItems && doc.invoiceItems.length > 0 ? (
                                                                                        doc.invoiceItems.map((item, idx) => (
                                                                                            <tr key={item.id || idx} className="hover:bg-gray-50">
                                                                                                <td className="p-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                                                                                                <td className="p-2 font-medium text-gray-800">{item.name}</td>
                                                                                                <td className="p-2 text-center text-gray-600 font-mono">{item.part || '-'}</td>
                                                                                                <td className="p-2 text-center font-mono">{formatNumberString(item.weight)}</td>
                                                                                                <td className="p-2 text-center font-mono">{formatNumberString(item.grossWeight || item.weight)}</td>
                                                                                                <td className="p-2 text-center font-mono">{formatNumberString(item.unitPrice)}</td>
                                                                                                <td className="p-2 text-center font-mono font-bold text-gray-900">{formatNumberString(item.totalPrice)}</td>
                                                                                            </tr>
                                                                                        ))
                                                                                    ) : (
                                                                                        <tr>
                                                                                            <td colSpan={7} className="p-3 text-center text-gray-400">هیچ قلمی ثبت نشده است</td>
                                                                                        </tr>
                                                                                    )}
                                                                                    {doc.freightCost ? (
                                                                                        <tr className="bg-gray-50/80 font-bold border-t">
                                                                                            <td colSpan={6} className="p-2 text-left pl-4 text-gray-600">هزینه حمل (Freight):</td>
                                                                                            <td className="p-2 text-center font-mono text-gray-900">{formatNumberString(doc.freightCost)} {doc.currency || selectedRecord.mainCurrency}</td>
                                                                                        </tr>
                                                                                    ) : null}
                                                                                    <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                                                                                        <td colSpan={3} className="p-2 text-left pl-4 text-blue-900">جمع کل:</td>
                                                                                        <td className="p-2 text-center font-mono text-blue-900">{formatNumberString(totalNet)}</td>
                                                                                        <td className="p-2 text-center font-mono text-blue-900">{formatNumberString(totalGross)}</td>
                                                                                        <td></td>
                                                                                        <td className="p-2 text-center font-mono text-blue-800 text-sm">{formatNumberString(grandTotal)} {doc.currency || selectedRecord.mainCurrency}</td>
                                                                                    </tr>
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Packing List Items Table */}
                                                                {doc.type === 'Packing List' && (
                                                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                                                        <div className="bg-orange-50 px-3 py-2 border-b border-orange-100 text-xs font-bold text-orange-900">
                                                                            اقلام پکینگ لیست (Packing List)
                                                                        </div>
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-xs text-right">
                                                                                <thead className="bg-gray-100 text-gray-700">
                                                                                    <tr>
                                                                                        <th className="p-2 w-10 text-center">ردیف</th>
                                                                                        <th className="p-2">شرح بسته / کالا</th>
                                                                                        <th className="p-2 w-16 text-center">پارت</th>
                                                                                        <th className="p-2 text-center font-mono">تعداد بسته</th>
                                                                                        <th className="p-2 text-center font-mono">وزن خالص (kg)</th>
                                                                                        <th className="p-2 text-center font-mono">وزن ناخالص (kg)</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-gray-100">
                                                                                    {doc.packingItems && doc.packingItems.length > 0 ? (
                                                                                        doc.packingItems.map((item, idx) => (
                                                                                            <tr key={item.id || idx} className="hover:bg-gray-50">
                                                                                                <td className="p-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                                                                                                <td className="p-2 font-medium text-gray-800">{item.description}</td>
                                                                                                <td className="p-2 text-center text-gray-600 font-mono">{item.part || '-'}</td>
                                                                                                <td className="p-2 text-center font-mono">{formatNumberString(item.packageCount)}</td>
                                                                                                <td className="p-2 text-center font-mono">{formatNumberString(item.netWeight)}</td>
                                                                                                <td className="p-2 text-center font-mono">{formatNumberString(item.grossWeight)}</td>
                                                                                            </tr>
                                                                                        ))
                                                                                    ) : (
                                                                                        <tr>
                                                                                            <td colSpan={6} className="p-3 text-center text-gray-400">هیچ قلمی ثبت نشده است</td>
                                                                                        </tr>
                                                                                    )}
                                                                                    <tr className="bg-orange-50 font-bold border-t-2 border-orange-200">
                                                                                        <td colSpan={3} className="p-2 text-left pl-4 text-orange-900">جمع کل:</td>
                                                                                        <td className="p-2 text-center font-mono text-orange-900">{formatNumberString(doc.packingItems?.reduce((s,i)=>s+(i.packageCount||0),0) || doc.packagesCount || 0)}</td>
                                                                                        <td className="p-2 text-center font-mono text-orange-900">{formatNumberString(totalNet)}</td>
                                                                                        <td className="p-2 text-center font-mono text-orange-900">{formatNumberString(totalGross)}</td>
                                                                                    </tr>
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Attachments & Notes */}
                                                                {((doc.attachments && doc.attachments.length > 0) || doc.description) && (
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                                                        {doc.attachments && doc.attachments.length > 0 && (
                                                                            <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                                                                                <span className="text-[11px] font-bold text-gray-600 block mb-1.5 flex items-center gap-1"><Paperclip size={13}/> فایل‌های ضمیمه</span>
                                                                                <div className="space-y-1">
                                                                                    {doc.attachments.map((att, i) => (
                                                                                        <div key={i} className="flex items-center justify-between text-xs bg-white p-1.5 rounded border border-gray-100 hover:border-blue-200">
                                                                                            <button type="button" 
                                                                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewerUrl(att.url); setViewerName(att.fileName); setViewerOpen(true); }}
                                                                                                className="text-blue-600 hover:text-blue-800 hover:underline text-right truncate max-w-[180px] flex items-center gap-1 font-medium"
                                                                                            >
                                                                                                <Eye size={12}/> {att.fileName}
                                                                                            </button>
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                <button type="button" 
                                                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadAndOpenFile(att.url, att.fileName); }} 
                                                                                                    className="text-gray-500 hover:text-gray-700 p-0.5"
                                                                                                    title="دانلود"
                                                                                                >
                                                                                                    <FileDown size={14}/>
                                                                                                </button>
                                                                                                <button type="button" 
                                                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSendToChatAttachment({ fileName: att.fileName, url: att.url }); setSendToChatDefaultMsg(`سند ثبت شده مربوط به پرونده ${selectedRecord.goodsName} (${selectedRecord.fileNumber}) - نوع سند: ${doc.type}`); setSendToChatOpen(true); }}
                                                                                                    className="text-blue-500 hover:text-blue-700 p-0.5"
                                                                                                    title="ارسال به گفتگو"
                                                                                                >
                                                                                                    <Share2 size={13}/>
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {doc.description && (
                                                                            <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-xs">
                                                                                <span className="text-[11px] font-bold text-gray-600 block mb-1">توضیحات و یادداشت</span>
                                                                                <p className="text-gray-700 leading-relaxed">{doc.description}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Action Buttons inside Expanded View */}
                                                                <div className="flex items-center justify-between pt-3 border-t border-gray-100 flex-wrap gap-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <button type="button" 
                                                                            onClick={() => setSelectedShippingDocForPrint(doc)} 
                                                                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                                                                        >
                                                                            <Printer size={15}/>
                                                                            چاپ رسمی سند (PDF)
                                                                        </button>
                                                                    </div>
                                                                    <button type="button" 
                                                                        onClick={() => toggleShippingDocExpand(doc.id)} 
                                                                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-1 transition-all"
                                                                    >
                                                                        <ChevronUp size={14}/>
                                                                        بستن منو
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'inspection' && (
                        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Microscope size={20} className="text-blue-600"/> گواهی‌های بازرسی (COI)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-blue-50 p-4 rounded-lg">
                                    <div className="space-y-1 md:col-span-2"><label className="text-xs font-bold text-gray-700">شرکت بازرسی</label><input className="w-full border rounded p-2 text-sm" value={newInspectionCertificate.company} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, company: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره گواهی</label><input className="w-full border rounded p-2 text-sm" value={newInspectionCertificate.certificateNumber} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, certificateNumber: e.target.value})} /></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">هزینه بازرسی (ریال)</label>
                                        <FormattedNumberInput className="w-full border rounded p-2 text-sm dir-ltr font-bold text-gray-800" value={newInspectionCertificate.amount} onChange={val => setNewInspectionCertificate({...newInspectionCertificate, amount: val})} />
                                    </div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت / توضیحات</label><div className="flex gap-1"><input className="w-full border rounded p-2 text-sm" value={newInspectionCertificate.part} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, part: e.target.value})} /><button type="button" onClick={handleAddInspectionCertificate} className={`${editingInspectionCertificateId ? "bg-amber-600 hover:bg-amber-700 px-3" : "bg-blue-600 hover:bg-blue-700"} text-white p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-all`} title={editingInspectionCertificateId ? "ذخیره گواهی" : "افزودن گواهی"}>{editingInspectionCertificateId ? <><Save size={15}/><span>ذخیره</span></> : <Plus size={16}/>}</button>{editingInspectionCertificateId && (<button type="button" onClick={handleCancelEditInspectionCertificate} className="bg-gray-200 text-gray-700 px-2 rounded-lg hover:bg-gray-300 text-xs font-bold transition-all" title="انصراف"><X size={15}/></button>)}</div></div>
                                </div>
                                <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرکت</th><th className="p-3">شماره گواهی</th><th className="p-3">هزینه</th><th className="p-3">پارت</th><th className="p-3 text-center">عملیات</th></tr></thead><tbody>{inspectionForm.certificates?.map(c => (<tr key={c.id} className="border-b hover:bg-gray-50"><td className="p-3">{c.company}</td><td className="p-3 font-mono">{c.certificateNumber}</td><td className="p-3 font-mono">{formatCurrency(c.amount)}</td><td className="p-3">{c.part}</td><td className="p-3 text-center"><div className="flex justify-center gap-2 items-center"><button type="button" onClick={()=>handleEditInspectionCertificate(c)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded" title="ویرایش"><Edit size={16}/></button><button type="button" onClick={()=>handleDeleteInspectionCertificate(c.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" title="حذف"><Trash2 size={16}/></button></div></td></tr>))}</tbody><tfoot className="bg-blue-50 font-bold"><tr><td colSpan={2} className="p-3 text-center">جمع کل هزینه‌های بازرسی</td><td className="p-3 font-mono text-blue-700">{formatCurrency(inspectionForm.certificates?.reduce((acc, c) => acc + c.amount, 0) || 0)}</td><td colSpan={2}></td></tr></tfoot></table></div>
                            </div>
                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800">پرداخت‌های بازرسی</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-gray-50 p-4 rounded-lg">
                                    <div className="space-y-1 md:col-span-2"><label className="text-xs font-bold text-gray-700">بانک پرداخت کننده</label><select className="w-full border rounded p-2 text-sm" value={newInspectionPayment.bank} onChange={e => setNewInspectionPayment({...newInspectionPayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{companySpecificBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label>
                                        <FormattedNumberInput className="w-full border rounded p-2 text-sm dir-ltr font-bold text-gray-800" value={newInspectionPayment.amount} onChange={val => setNewInspectionPayment({...newInspectionPayment, amount: val})} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">تاریخ</label>
                                        <TradeDatePicker 
                                            value={newInspectionPayment.date || ''} 
                                            onChange={val => setNewInspectionPayment({...newInspectionPayment, date: val})} 
                                            placeholder="۱۴۰۳/xx/xx"
                                        />
                                    </div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت</label><div className="flex gap-1"><input className="w-full border rounded p-2 text-sm" value={newInspectionPayment.part} onChange={e => setNewInspectionPayment({...newInspectionPayment, part: e.target.value})} /><button type="button" onClick={handleAddInspectionPayment} className={`${editingInspectionPaymentId ? "bg-amber-600 hover:bg-amber-700 px-3" : "bg-green-600 hover:bg-green-700"} text-white p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-all`} title={editingInspectionPaymentId ? "ذخیره پرداخت" : "افزودن پرداخت"}>{editingInspectionPaymentId ? <><Save size={15}/><span>ذخیره</span></> : <Plus size={16}/>}</button>{editingInspectionPaymentId && (<button type="button" onClick={handleCancelEditInspectionPayment} className="bg-gray-200 text-gray-700 px-2 rounded-lg hover:bg-gray-300 text-xs font-bold transition-all" title="انصراف"><X size={15}/></button>)}</div></div>
                                </div>
                                <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">بانک</th><th className="p-3">مبلغ</th><th className="p-3">تاریخ</th><th className="p-3">پارت</th><th className="p-3">حذف</th></tr></thead><tbody>{inspectionForm.payments?.map(p => (<tr key={p.id} className="border-b hover:bg-gray-50"><td className="p-3">{p.bank}</td><td className="p-3 font-mono">{formatCurrency(p.amount)}</td><td className="p-3">{p.date}</td><td className="p-3">{p.part}</td><td className="p-3 text-center"><div className="flex justify-center gap-2 items-center"><button type="button" onClick={()=>handleEditInspectionPayment(p)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded" title="ویرایش"><Edit size={16}/></button><button type="button" onClick={()=>handleDeleteInspectionPayment(p.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" title="حذف"><Trash2 size={16}/></button></div></td></tr>))}</tbody></table></div>
                            </div>

                            {/* Inspection Attachments */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800">
                                <TradeAttachmentSection
                                    attachments={selectedRecord.attachments?.filter(a => a.category?.includes('inspection') || a.subCategory === 'inspection') || []}
                                    onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/inspection', updated, 'inspection')}
                                    category="commercial/inspection"
                                    title="پیوست‌ها و اسناد گواهی بازرسی و آزمایشگاه (تصویر و PDF)"
                                    description="تصویر اصل گواهی بازرسی کالا (COI)، گزارش آزمایشگاه، تاییدیه انطباق استاندارد و فیش‌های پرداخت"
                                    currentUser={currentUser}
                                />
                            </div>
                        </div>
                    )}

                    {/* CLEARANCE DOCS TAB */}
                    {activeTab === 'clearance_docs' && (
                        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                            
                            {/* NEW: Button to open the Clearance Declaration Form */}
                            <div className="flex justify-end">
                                <button type="button" 
                                    onClick={() => setShowClearancePrint(true)} 
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 flex items-center gap-2 font-bold"
                                >
                                    <Printer size={18}/> چاپ اعلامیه ورود کالا (ترخیصیه)
                                </button>
                            </div>

                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Warehouse size={20} className="text-indigo-600"/> قبض انبار و ترخیصیه</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-indigo-50 p-4 rounded-lg">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره قبض انبار</label><input className="w-full border rounded p-2 text-sm" value={newWarehouseReceipt.number} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, number: e.target.value})} /></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">تاریخ صدور</label>
                                        <TradeDatePicker 
                                            value={newWarehouseReceipt.issueDate || ''} 
                                            onChange={val => setNewWarehouseReceipt({...newWarehouseReceipt, issueDate: val})} 
                                        />
                                    </div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت / توضیحات</label><input className="w-full border rounded p-2 text-sm" value={newWarehouseReceipt.part} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, part: e.target.value})} /></div>
                                    <div className="flex gap-1"><button type="button" onClick={handleAddWarehouseReceipt} className={`flex-1 ${editingWarehouseReceiptId ? "bg-amber-600 hover:bg-amber-700 text-xs px-2" : "bg-indigo-600 hover:bg-indigo-700"} text-white p-2 rounded-lg h-[38px] font-bold flex items-center justify-center gap-1 shadow-sm transition-all`} title={editingWarehouseReceiptId ? "ذخیره قبض انبار" : "افزودن قبض انبار"}>{editingWarehouseReceiptId ? <><Save size={15}/><span>ذخیره</span></> : <Plus size={16} className="mx-auto"/>}</button>{editingWarehouseReceiptId && (<button type="button" onClick={handleCancelEditWarehouseReceipt} className="bg-gray-200 text-gray-700 px-2 rounded-lg hover:bg-gray-300 h-[38px] text-xs font-bold transition-all" title="انصراف"><X size={15}/></button>)}</div>
                                </div>
                                <div className="space-y-2">{clearanceForm.receipts?.map(r => (<div key={r.id} className="flex justify-between items-center border p-3 rounded-lg bg-gray-50"><div><span className="font-bold text-sm">شماره: {r.number}</span> <span className="text-xs text-gray-500 mx-2">تاریخ: {r.issueDate}</span> <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{r.part}</span></div><div className="flex gap-2 items-center"><button type="button" onClick={()=>handleEditWarehouseReceipt(r)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded" title="ویرایش"><Edit size={16}/></button><button type="button" onClick={()=>handleDeleteWarehouseReceipt(r.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" title="حذف"><Trash2 size={16}/></button></div></div>))}</div>
                            </div>
                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800">هزینه‌های ترخیصیه ( کشتیرانی / ایجنت )</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-gray-50 p-4 rounded-lg">
                                    <div className="space-y-1 md:col-span-2"><label className="text-xs font-bold text-gray-700">بانک پرداخت کننده</label><select className="w-full border rounded p-2 text-sm" value={newClearancePayment.bank} onChange={e => setNewClearancePayment({...newClearancePayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{companySpecificBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label>
                                        <FormattedNumberInput className="w-full border rounded p-2 text-sm dir-ltr font-bold text-gray-800" value={newClearancePayment.amount} onChange={val => setNewClearancePayment({...newClearancePayment, amount: val})} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">تاریخ</label>
                                        <TradeDatePicker 
                                            value={newClearancePayment.date || ''} 
                                            onChange={val => setNewClearancePayment({...newClearancePayment, date: val})} 
                                        />
                                    </div>
                                    <div className="flex gap-1"><button type="button" onClick={handleAddClearancePayment} className={`flex-1 ${editingClearancePaymentId ? "bg-amber-600 hover:bg-amber-700 text-xs px-2" : "bg-green-600 hover:bg-green-700"} text-white p-2 rounded-lg h-[38px] font-bold flex items-center justify-center gap-1 shadow-sm transition-all`} title={editingClearancePaymentId ? "ذخیره پرداخت ترخیصیه" : "افزودن پرداخت ترخیصیه"}>{editingClearancePaymentId ? <><Save size={15}/><span>ذخیره</span></> : <Plus size={16} className="mx-auto"/>}</button>{editingClearancePaymentId && (<button type="button" onClick={handleCancelEditClearancePayment} className="bg-gray-200 text-gray-700 px-2 rounded-lg hover:bg-gray-300 h-[38px] text-xs font-bold transition-all" title="انصراف"><X size={15}/></button>)}</div>
                                </div>
                                <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">بانک</th><th className="p-3">مبلغ</th><th className="p-3">تاریخ</th><th className="p-3">حذف</th></tr></thead><tbody>{clearanceForm.payments?.map(p => (<tr key={p.id} className="border-b hover:bg-gray-50"><td className="p-3">{p.bank}</td><td className="p-3 font-mono">{formatCurrency(p.amount)}</td><td className="p-3">{p.date}</td><td className="p-3 text-center"><div className="flex justify-center gap-2 items-center"><button type="button" onClick={()=>handleEditClearancePayment(p)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded" title="ویرایش"><Edit size={16}/></button><button type="button" onClick={()=>handleDeleteClearancePayment(p.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" title="حذف"><Trash2 size={16}/></button></div></td></tr>))}</tbody></table></div>
                            </div>

                            {/* Clearance & Warehouse Receipt Attachments */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800">
                                <TradeAttachmentSection
                                    attachments={selectedRecord.attachments?.filter(a => a.category?.includes('clearance') || a.subCategory === 'clearance') || []}
                                    onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/clearance', updated, 'clearance')}
                                    category="commercial/clearance"
                                    title="پیوست‌ها و اسناد ترخیصیه و قبض انبار (تصویر و PDF)"
                                    description="تصویر قبض انبار گمرک، ترخیصیه خط کشتیرانی، اعلامیه ورود کالا و نامه‌های تحویل"
                                    currentUser={currentUser}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'green_leaf' && (
                        /* ... Green Leaf Logic ... */
                        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Leaf size={20} className="text-green-600"/> اظهارنامه و کوتاژ (حقوق ورودی)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-green-50 p-4 rounded-lg">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره کوتاژ</label><input className="w-full border rounded p-2 text-sm" value={newCustomsDuty.cottageNumber} onChange={e => setNewCustomsDuty({...newCustomsDuty, cottageNumber: e.target.value})} /></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">مبلغ کل (ریال)</label>
                                        <FormattedNumberInput className="w-full border rounded p-2 text-sm dir-ltr font-bold text-gray-800" value={newCustomsDuty.amount} onChange={val => setNewCustomsDuty({...newCustomsDuty, amount: val})} />
                                    </div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">روش پرداخت</label><select className="w-full border rounded p-2 text-sm" value={newCustomsDuty.paymentMethod} onChange={e => setNewCustomsDuty({...newCustomsDuty, paymentMethod: e.target.value as 'Bank' | 'Guarantee'})}><option value="Bank">نقدی (بانک)</option><option value="Guarantee">ضمانت‌نامه</option></select></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت</label><input className="w-full border rounded p-2 text-sm" value={newCustomsDuty.part} onChange={e => setNewCustomsDuty({...newCustomsDuty, part: e.target.value})} /></div>
                                    <div className="flex gap-1"><button type="button" onClick={handleAddCustomsDuty} className={`flex-1 ${editingCustomsDutyId ? "bg-amber-600 hover:bg-amber-700 text-xs px-2" : "bg-green-600 hover:bg-green-700"} text-white p-2 rounded-lg h-[38px] font-bold flex items-center justify-center gap-1 shadow-sm transition-all`} title={editingCustomsDutyId ? "ذخیره کوتاژ" : "افزودن کوتاژ"}>{editingCustomsDutyId ? <><Save size={15}/><span>ذخیره</span></> : <Plus size={16} className="mx-auto"/>}</button>{editingCustomsDutyId && (<button type="button" onClick={handleCancelEditCustomsDuty} className="bg-gray-200 text-gray-700 px-2 rounded-lg hover:bg-gray-300 h-[38px] text-xs font-bold transition-all" title="انصراف"><X size={15}/></button>)}</div>
                                </div>
                                <div className="space-y-2">{greenLeafForm.duties?.map(d => (<div key={d.id} className="flex justify-between items-center border p-3 rounded-lg bg-gray-50"><div><span className="font-bold text-sm">کوتاژ: {d.cottageNumber}</span> <span className="text-xs bg-gray-200 px-2 py-0.5 rounded mx-2">{d.paymentMethod === 'Bank' ? 'نقدی' : 'ضمانت‌نامه'}</span> <span className="font-mono font-bold text-green-700">{formatCurrency(d.amount)}</span></div><div className="flex gap-2 items-center"><button type="button" onClick={()=>handleEditCustomsDuty(d)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded" title="ویرایش"><Edit size={16}/></button><button type="button" onClick={()=>handleDeleteCustomsDuty(d.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" title="حذف"><Trash2 size={16}/></button></div></div>))}</div>
                            </div>

                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShieldCheck size={20} className="text-orange-600"/> ضمانت‌نامه‌های گمرکی</h3>
                                <div className="bg-orange-50 p-4 rounded-lg space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مربوط به کوتاژ</label><select className="w-full border rounded p-2 text-sm glass-panel" value={selectedDutyForGuarantee} onChange={e => setSelectedDutyForGuarantee(e.target.value)}><option value="">انتخاب کوتاژ</option>{greenLeafForm.duties.map(d => <option key={d.id} value={d.id}>{d.cottageNumber} ({formatCurrency(d.amount)})</option>)}</select></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره ضمانت‌نامه</label><input className="w-full border rounded p-2 text-sm dir-ltr text-center font-mono font-bold" value={newGuaranteeDetails.guaranteeNumber} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, guaranteeNumber: e.target.value})} /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شناسه سپام (سامانه سپام)</label><input className="w-full border rounded p-2 text-sm dir-ltr text-center font-mono placeholder:font-sans" value={newGuaranteeDetails.sepamNumber || ''} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, sepamNumber: e.target.value})} placeholder="شماره سپام..." /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">بانک صادرکننده ضمانت‌نامه</label><select className="w-full border rounded p-2 text-sm glass-panel text-center font-bold" value={newGuaranteeDetails.guaranteeBank || ''} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, guaranteeBank: e.target.value})}><option value="">انتخاب بانک...</option>{companySpecificBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    </div>

                                    {/* Guarantee Type selection and Amount */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-700">نوع ضمانت‌نامه</label>
                                            <select 
                                                className="w-full border rounded p-2 text-sm glass-panel" 
                                                value={newGuaranteeDetails.guaranteeType || 'cheque'} 
                                                onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, guaranteeType: e.target.value as 'cheque' | 'credit'})}
                                            >
                                                <option value="cheque">چک ضمانت‌نامه</option>
                                                <option value="credit">حد اعتبار</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-700">مبلغ ضمانت‌نامه (ریال)</label>
                                            <FormattedNumberInput 
                                                className="w-full border rounded p-2 text-sm dir-ltr font-bold text-gray-800" 
                                                value={newGuaranteeDetails.guaranteeAmount} 
                                                onChange={val => {
                                                    setNewGuaranteeDetails({...newGuaranteeDetails, guaranteeAmount: val, chequeAmount: newGuaranteeDetails.guaranteeType === 'credit' ? 0 : val});
                                                }} 
                                                placeholder="وارد کنید..."
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-purple-700">بخش نقدی کوتاژ (به گمرک)</label>
                                            <FormattedNumberInput 
                                                className="w-full border rounded p-2 text-sm dir-ltr bg-purple-50 border-purple-200 font-bold" 
                                                value={newGuaranteeDetails.dutyCashAmount} 
                                                onChange={val => setNewGuaranteeDetails({...newGuaranteeDetails, dutyCashAmount: val})} 
                                                placeholder="پرداخت نقدی کوتاژ..."
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-green-700">سپرده نقدی ضمانت‌نامه (به بانک)</label>
                                            <FormattedNumberInput 
                                                className="w-full border rounded p-2 text-sm dir-ltr bg-green-50 border-green-200 font-bold" 
                                                value={newGuaranteeDetails.cashAmount} 
                                                onChange={val => setNewGuaranteeDetails({...newGuaranteeDetails, cashAmount: val})} 
                                                placeholder="سپرده نقدی به بانک..."
                                            />
                                            <span className="text-[9px] text-gray-500 block leading-tight mt-1">جزئی از خود ضمانت‌نامه است و هزینه مجزا محاسبه نمی‌شود.</span>
                                        </div>
                                    </div>

                                    {/* Cheque specific details (hidden if type is credit) + Due Date */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white dark:bg-gray-800/80 p-3 rounded-xl border border-orange-200 dark:border-orange-900/40">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-orange-900 dark:text-orange-300 flex items-center gap-1">
                                                <span>📅 تاریخ سررسید ضمانت‌نامه *</span>
                                                <span className="text-[10px] text-amber-600 font-normal">(هشدار تامین موجودی ۲-۳ روز قبل)</span>
                                            </label>
                                            <TradeDatePicker
                                                value={newGuaranteeDetails.dueDate || ''}
                                                onChange={val => setNewGuaranteeDetails({...newGuaranteeDetails, dueDate: val})}
                                                placeholder="انتخاب سررسید..."
                                                className="w-full text-xs"
                                            />
                                        </div>
                                        {(newGuaranteeDetails.guaranteeType || 'cheque') === 'cheque' && (
                                            <>
                                                <div className="space-y-1"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">شماره چک تضمین</label><input className="w-full border border-gray-300 dark:border-gray-700 rounded p-1.5 text-xs dir-ltr bg-white dark:bg-gray-800" value={newGuaranteeDetails.chequeNumber || ''} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeNumber: e.target.value})} placeholder="شماره چک..." /></div>
                                                <div className="space-y-1"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">بانک صادرکننده چک</label><select className="w-full border border-gray-300 dark:border-gray-700 rounded p-1.5 text-xs glass-panel bg-white dark:bg-gray-800" value={newGuaranteeDetails.chequeBank || ''} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeBank: e.target.value})}><option value="">انتخاب بانک</option>{companySpecificBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                            </>
                                        )}
                                    </div>

                                    {/* Real-time Validation Warning Indicator */}
                                    {selectedDutyForGuarantee && (() => {
                                        const duty = greenLeafForm.duties.find(d => d.id === selectedDutyForGuarantee);
                                        if (!duty) return null;
                                        const totalAllocated = (Number(newGuaranteeDetails.guaranteeAmount) || 0) + (Number(newGuaranteeDetails.dutyCashAmount) || 0);
                                        const diff = duty.amount - totalAllocated;
                                        return (
                                            <div className={`text-xs p-2.5 rounded-lg font-bold flex justify-between items-center transition-all ${diff === 0 ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                                                <span>مبلغ کوتاژ: <span className="font-mono">{formatNumberString(duty.amount)}</span></span>
                                                <span>مجموع مبالغ ثبت‌شده (ضمانت + نقدی گمرک): <span className="font-mono">{formatNumberString(totalAllocated)}</span></span>
                                                <span>باقیمانده: <span className={`font-mono ${diff !== 0 ? 'text-red-700' : ''}`}>{formatNumberString(diff)}</span></span>
                                            </div>
                                        );
                                    })()}

                                    <div className="flex gap-2"><button type="button" onClick={handleAddGuarantee} className={`flex-1 ${editingGuaranteeId ? "bg-amber-600 hover:bg-amber-700" : "bg-orange-600 hover:bg-orange-700"} text-white p-2 rounded-lg font-bold flex items-center justify-center gap-1 shadow-sm transition-all`}>{editingGuaranteeId ? <><Save size={16}/><span>بروزرسانی ضمانت‌نامه</span></> : "ثبت ضمانت‌نامه"}</button>{editingGuaranteeId && (<button type="button" onClick={handleCancelEditGuarantee} className="bg-gray-200 text-gray-700 px-4 p-2 rounded-lg hover:bg-gray-300 text-xs font-bold transition-all" title="انصراف">انصراف</button>)}</div>
                                </div>
                                <div className="space-y-2">
                                    {greenLeafForm.guarantees?.map(g => {
                                        const effectiveDue = g.dueDate || g.chequeDate || g.cashDate || '';
                                        const dueStatus = getGuaranteeDueStatus(effectiveDue, g.isDelivered);
                                        return (
                                        <div key={g.id} className={`border p-3.5 rounded-xl transition-all flex justify-between items-center text-sm ${dueStatus.bgClass} ${dueStatus.needsFundAlert && !g.isDelivered ? 'border-amber-300 dark:border-amber-700/60 shadow-sm' : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40'}`}>
                                            <div className="space-y-1.5">
                                                <div className="font-bold text-gray-800 dark:text-gray-100 flex flex-wrap gap-x-3 items-center gap-y-1">
                                                    <span>شماره ضمانت‌نامه: <span className="font-mono bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 px-2 py-0.5 rounded border border-orange-200 dark:border-orange-800">{g.guaranteeNumber}</span></span>
                                                    {g.sepamNumber && <span className="text-xs text-blue-600 dark:text-blue-400 font-sans font-medium">(شناسه سپام: <span className="font-mono bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">{g.sepamNumber}</span>)</span>}
                                                    {g.guaranteeBank && <span className="text-xs text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded border border-orange-200 dark:border-orange-800 font-bold">بانک صادرکننده: {g.guaranteeBank}</span>}
                                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${dueStatus.badgeClass}`}>
                                                        {dueStatus.statusLabel}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                                                    <span>نوع: {g.guaranteeType === 'credit' ? '💡 حد اعتبار بانکی' : '🎫 چک ضمانت‌نامه'}</span>
                                                    {effectiveDue && <span>سررسید: <strong className="font-mono text-gray-800 dark:text-gray-200 dir-ltr">{effectiveDue}</strong></span>}
                                                    {g.guaranteeAmount ? <span>مبلغ ضمانت: <span className="font-mono font-bold text-orange-700 dark:text-orange-400">{formatCurrency(g.guaranteeAmount)}</span></span> : null}
                                                    {g.dutyCashAmount ? <span>نقدی گمرک: <span className="font-mono font-bold text-purple-700 dark:text-purple-400">{formatCurrency(g.dutyCashAmount)}</span></span> : null}
                                                    {g.cashAmount && g.cashAmount > 0 ? <span>سپرده بانک: <span className="font-mono font-bold text-green-700 dark:text-green-400">{formatCurrency(g.cashAmount)}</span></span> : null}
                                                </div>
                                                {g.guaranteeType !== 'credit' && g.chequeNumber && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">شماره چک: {g.chequeNumber} {g.chequeBank ? `(${g.chequeBank})` : ''}</div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 items-center shrink-0">
                                                <button type="button" onClick={() => handleToggleGuaranteeDelivery(g.id)} className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${g.isDelivered ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                                                    {g.isDelivered ? '✓ عودت شد' : '⏳ نزد سازمان'}
                                                </button>
                                                <button type="button" onClick={()=>handleEditGuarantee(g)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded" title="ویرایش ضمانت‌نامه"><Edit size={16}/></button>
                                                <button type="button" onClick={()=>handleDeleteGuarantee(g.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 dark:hover:bg-red-950/30 rounded" title="حذف">
                                                    <Trash2 size={16}/>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                    <h3 className="font-bold text-gray-800">مالیات بر ارزش افزوده</h3>
                                    <div className="flex gap-2 items-end">
                                        <FormattedNumberInput className="flex-1 border rounded p-2 text-sm dir-ltr font-bold text-gray-800" placeholder="مبلغ (ریال)" value={newTax.amount} onChange={val => setNewTax({...newTax, amount: val})} />
                                        <button type="button" onClick={handleAddTax} className={`${editingTaxId ? "bg-amber-600 hover:bg-amber-700 px-3 text-xs" : "bg-blue-600 hover:bg-blue-700"} text-white p-2 rounded h-[38px] min-w-[38px] flex items-center justify-center font-bold`} title={editingTaxId ? "ذخیره مالیات" : "افزودن مالیات"}>{editingTaxId ? <Save size={15}/> : <Plus size={16}/>}</button>{editingTaxId && (<button type="button" onClick={handleCancelEditTax} className="bg-gray-200 text-gray-700 px-2 rounded hover:bg-gray-300 h-[38px] text-xs font-bold" title="انصراف"><X size={15}/></button>)}
                                    </div>
                                    <div className="space-y-1">{greenLeafForm.taxes?.map(t => (<div key={t.id} className="flex justify-between bg-gray-50 p-2 rounded text-sm"><span className="font-mono">{formatCurrency(t.amount)}</span><div className="flex gap-1 items-center"><button type="button" onClick={()=>handleEditTax(t)} className="text-amber-600 hover:text-amber-800 p-0.5" title="ویرایش"><Edit size={14}/></button><button type="button" onClick={()=>handleDeleteTax(t.id)} className="text-red-500 hover:text-red-700 p-0.5" title="حذف"><X size={14}/></button></div></div>))}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                    <h3 className="font-bold text-gray-800">عوارض راهداری / هلال احمر</h3>
                                    <div className="flex gap-2 items-end">
                                        <FormattedNumberInput className="flex-1 border rounded p-2 text-sm dir-ltr font-bold text-gray-800" placeholder="مبلغ (ریال)" value={newRoadToll.amount} onChange={val => setNewRoadToll({...newRoadToll, amount: val})} />
                                        <button type="button" onClick={handleAddRoadToll} className={`${editingRoadTollId ? "bg-amber-600 hover:bg-amber-700 px-3 text-xs" : "bg-blue-600 hover:bg-blue-700"} text-white p-2 rounded h-[38px] min-w-[38px] flex items-center justify-center font-bold`} title={editingRoadTollId ? "ذخیره عوارض" : "افزودن عوارض"}>{editingRoadTollId ? <Save size={15}/> : <Plus size={16}/>}</button>{editingRoadTollId && (<button type="button" onClick={handleCancelEditRoadToll} className="bg-gray-200 text-gray-700 px-2 rounded hover:bg-gray-300 h-[38px] text-xs font-bold" title="انصراف"><X size={15}/></button>)}
                                    </div>
                                    <div className="space-y-1">{greenLeafForm.roadTolls?.map(t => (<div key={t.id} className="flex justify-between bg-gray-50 p-2 rounded text-sm"><span className="font-mono">{formatCurrency(t.amount)}</span><div className="flex gap-1 items-center"><button type="button" onClick={()=>handleEditRoadToll(t)} className="text-amber-600 hover:text-amber-800 p-0.5" title="ویرایش"><Edit size={14}/></button><button type="button" onClick={()=>handleDeleteRoadToll(t.id)} className="text-red-500 hover:text-red-700 p-0.5" title="حذف"><X size={14}/></button></div></div>))}</div>
                                </div>
                            </div>
                            <div className="bg-green-100 p-4 rounded-lg flex justify-between items-center font-bold text-green-900 border border-green-200"><span>جمع کل هزینه‌های گمرکی (نقدی + سپرده + مالیات + عوارض)</span><span className="font-mono text-lg">{formatCurrency(calculateGreenLeafTotal(greenLeafForm))}</span></div>

                            {/* Green Leaf & Customs Attachments */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800">
                                <TradeAttachmentSection
                                    attachments={selectedRecord.attachments?.filter(a => a.category?.includes('green_leaf') || a.subCategory === 'green_leaf') || []}
                                    onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/green_leaf', updated, 'green_leaf')}
                                    category="commercial/green_leaf"
                                    title="پیوست‌ها و اسناد برگ سبز، کوتاژ و ضمانت‌نامه‌ها (تصویر و PDF)"
                                    description="تصویر برگ سبز گمرکی، اظهارنامه کوتاژ، ضمانت‌نامه‌های بانکی گمرک و فیش‌های مالیات و عوارض"
                                    currentUser={currentUser}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'internal_shipping' && (
                        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
                            <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Truck size={20} className="text-indigo-600"/> هزینه‌های حمل داخلی</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-indigo-50 p-4 rounded-lg">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شرح / پارت</label><input className="w-full border rounded p-2 text-sm" placeholder="مثال: کرایه حمل تا انبار" value={newShippingPayment.part} onChange={e => setNewShippingPayment({...newShippingPayment, part: e.target.value})} /></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label>
                                        <FormattedNumberInput className="w-full border rounded p-2 text-sm dir-ltr font-bold text-gray-800" value={newShippingPayment.amount} onChange={val => setNewShippingPayment({...newShippingPayment, amount: val})} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">تاریخ پرداخت</label>
                                        <TradeDatePicker 
                                            value={newShippingPayment.date || ''} 
                                            onChange={val => setNewShippingPayment({...newShippingPayment, date: val})} 
                                            placeholder="۱۴۰۳/۰۱/۰۱"
                                        />
                                    </div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">بانک</label><select className="w-full border rounded p-2 text-sm" value={newShippingPayment.bank} onChange={e => setNewShippingPayment({...newShippingPayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{companySpecificBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="md:col-span-4 space-y-1"><label className="text-xs font-bold text-gray-700">توضیحات تکمیلی</label><input className="w-full border rounded p-2 text-sm" placeholder="توضیحات..." value={newShippingPayment.description} onChange={e => setNewShippingPayment({...newShippingPayment, description: e.target.value})} /></div>
                                    <div className="md:col-span-4 flex justify-end gap-2">{editingShippingPaymentId && (<button type="button" onClick={handleCancelEditShippingPayment} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300 transition-all">انصراف</button>)}<button type="button" onClick={handleAddShippingPayment} className={`${editingShippingPaymentId ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"} text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-all`}>{editingShippingPaymentId ? <><Save size={16}/> بروزرسانی پرداخت</> : <><Plus size={16}/> افزودن پرداخت</>}</button></div>
                                </div>
                                
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرح / پارت</th><th className="p-3">مبلغ (ریال)</th><th className="p-3">تاریخ</th><th className="p-3">بانک</th><th className="p-3">توضیحات</th><th className="p-3">حذف</th></tr></thead>
                                        <tbody>
                                            {internalShippingForm.payments?.map((p) => (
                                                <tr key={p.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-bold">{p.part}</td>
                                                    <td className="p-3 font-mono">{formatCurrency(p.amount)}</td>
                                                    <td className="p-3">{p.date}</td>
                                                    <td className="p-3">{p.bank}</td>
                                                    <td className="p-3 text-gray-500 text-xs">{p.description}</td>
                                                    <td className="p-3 text-center"><div className="flex justify-center gap-2 items-center"><button type="button" onClick={() => handleEditShippingPayment(p)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded" title="ویرایش"><Edit size={16}/></button><button type="button" onClick={() => handleDeleteShippingPayment(p.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" title="حذف"><Trash2 size={16}/></button></div></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-indigo-50 font-bold border-t-2 border-indigo-200">
                                                <td className="p-3">جمع کل حمل داخلی</td>
                                                <td className="p-3 font-mono text-indigo-700">{formatCurrency(internalShippingForm.payments?.reduce((acc, p) => acc + p.amount, 0) || 0)}</td>
                                                <td colSpan={4}></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Internal Shipping Attachments */}
                            <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800">
                                <TradeAttachmentSection
                                    attachments={selectedRecord.attachments?.filter(a => a.category?.includes('internal_shipping') || a.subCategory === 'internal_shipping') || []}
                                    onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/internal_shipping', updated, 'internal_shipping')}
                                    category="commercial/internal_shipping"
                                    title="پیوست‌ها و اسناد حمل داخلی، بارنامه و باسکول (تصویر و PDF)"
                                    description="تصویر بارنامه‌های جاده‌ای، حواله‌های بارگیری، قبوض باسکول مبدا و مقصد و رسیدهای تسویه رانندگان"
                                    currentUser={currentUser}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'agent_fees' && (() => {
                        const currentPaymentsTotal = agentForm.payments?.reduce((acc, p) => acc + (Number(p.amount) || 0), 0) || 0;
                        const stageRegisteredCost = getStageRecordedClearanceCost(selectedRecord);
                        const costDiff = stageRegisteredCost - currentPaymentsTotal;

                        return (
                            <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
                                {/* Summary Overview Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/60 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">جمع کل ردیف‌های جدول هزینه‌های ترخیص:</span>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-lg font-black font-mono text-teal-700 dark:text-teal-400">{formatCurrency(currentPaymentsTotal)}</span>
                                                <span className="text-xs text-gray-500">ریال</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono font-bold text-gray-600 dark:text-gray-400">{formatCurrency(Math.round(currentPaymentsTotal / 10))} تومان</span>
                                                <span className="text-[11px] text-gray-400">• {agentForm.payments?.length || 0} ردیف ثبت‌شده</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="glass-panel p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/60 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">مبلغ ثبت‌شده در پرونده (محاسبه نهایی):</span>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-lg font-black font-mono text-gray-900 dark:text-gray-100">{formatCurrency(stageRegisteredCost)}</span>
                                                <span className="text-xs text-gray-500">ریال</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono font-bold text-gray-600 dark:text-gray-400">{formatCurrency(Math.round(stageRegisteredCost / 10))} تومان</span>
                                                {costDiff === 0 ? (
                                                    <span className="text-[11px] bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                        <CheckCircle2 size={11} /> منطبق
                                                    </span>
                                                ) : costDiff > 0 ? (
                                                    <span className="text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                        <AlertCircle size={11} /> {formatCurrency(Math.round(costDiff / 10))} تومان مابه‌التفاوت
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
                                                        بروزرسانی جدید
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Reconcile Alert Banner if Discrepancy Exists */}
                                {costDiff > 0 && (
                                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 text-amber-900 dark:text-amber-100">
                                        <div className="flex items-start gap-3">
                                            <AlertCircle size={22} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                            <div className="text-xs space-y-1">
                                                <p className="font-bold text-sm">مابه‌التفاوت هزینه‌های قبلی با جدول تفکیکی:</p>
                                                <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                                                    مبلغ ثبت‌شده در پرونده و محاسبه نهایی (<span className="font-bold font-mono">{formatCurrency(stageRegisteredCost)}</span> ریال) بیشتر از ردیف‌های جدول است.
                                                    مبلغ <span className="font-bold font-mono text-amber-950 dark:text-amber-100">{formatCurrency(costDiff)}</span> ریال ({formatCurrency(Math.round(costDiff / 10))} تومان) به عنوان هزینه‌های قبلی یا کلی ترخیص در سوابق پرونده موجود است.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={handleRestoreClearanceBalance}
                                                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                                            >
                                                <Plus size={15} />
                                                <span>بازیابی مابه‌التفاوت به جدول</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDeepScanClearanceHistory}
                                                className="px-3.5 py-2 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <History size={15} />
                                                <span>بررسی سوابق و آرشیو</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {costDiff < 0 && (
                                    <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700/60 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 text-blue-900 dark:text-blue-100">
                                        <div className="flex items-start gap-3">
                                            <Info size={22} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                                            <div className="text-xs space-y-1">
                                                <p className="font-bold text-sm">ردیف‌های جدید ثبت‌شده بیشتر از رقم قبلی پرونده است:</p>
                                                <p className="text-blue-800 dark:text-blue-300">
                                                    مجموع ردیف‌ها (<span className="font-bold font-mono">{formatCurrency(currentPaymentsTotal)}</span> ریال) نسبت به ثبت قبلی افزایش یافته است.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSyncStageCostWithRows}
                                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                                        >
                                            <RefreshCw size={15} />
                                            <span>همگام‌سازی محاسبه نهایی</span>
                                        </button>
                                    </div>
                                )}

                                <div className="glass-panel p-6 rounded-xl shadow-sm border space-y-4">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                            <UserCheck size={20} className="text-teal-600"/> ردیف‌های هزینه ترخیص
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleDeepScanClearanceHistory}
                                                className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                                                title="اسکن و بازیابی ردیف‌ها از سوابق و آرشیو"
                                            >
                                                <History size={14} className="text-teal-600" />
                                                <span>بازیابی از سوابق</span>
                                            </button>
                                            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg font-mono font-bold">
                                                تعداد ردیف: {agentForm.payments?.length || 0}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-teal-50/70 dark:bg-teal-950/20 p-4 rounded-xl border border-teal-100 dark:border-teal-900/40">
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">محل هزینه یا نام هزینه</label><input className="w-full border rounded-lg p-2 text-sm bg-white dark:bg-gray-800" placeholder="مثال: آزمایشگاه، ترخیص‌کار، انبارداری" value={newAgentPayment.agentName} onChange={e => setNewAgentPayment({...newAgentPayment, agentName: e.target.value})} /></div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">مبلغ هزینه (ریال)</label>
                                            <FormattedNumberInput className="w-full border rounded-lg p-2 text-sm dir-ltr font-bold text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800" value={newAgentPayment.amount} onChange={val => setNewAgentPayment({...newAgentPayment, amount: val})} />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">تاریخ پرداخت</label>
                                            <TradeDatePicker 
                                                value={newAgentPayment.date || ''} 
                                                onChange={val => setNewAgentPayment({...newAgentPayment, date: val})} 
                                                placeholder="۱۴۰۳/۰۱/۰۱"
                                            />
                                        </div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">بانک</label><select className="w-full border rounded-lg p-2 text-sm bg-white dark:bg-gray-800" value={newAgentPayment.bank} onChange={e => setNewAgentPayment({...newAgentPayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{companySpecificBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                        <div className="md:col-span-2 space-y-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">پارت / مرحله</label><input className="w-full border rounded-lg p-2 text-sm bg-white dark:bg-gray-800" placeholder="مثال: پیش پرداخت" value={newAgentPayment.part} onChange={e => setNewAgentPayment({...newAgentPayment, part: e.target.value})} /></div>
                                        <div className="md:col-span-2 space-y-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">توضیحات</label><input className="w-full border rounded-lg p-2 text-sm bg-white dark:bg-gray-800" placeholder="..." value={newAgentPayment.description} onChange={e => setNewAgentPayment({...newAgentPayment, description: e.target.value})} /></div>
                                        <div className="md:col-span-4 flex justify-end gap-2">{editingAgentPaymentId && (<button type="button" onClick={handleCancelEditAgentPayment} className="bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300 transition-all">انصراف</button>)}<button type="button" onClick={handleAddAgentPayment} className={`${editingAgentPaymentId ? "bg-amber-600 hover:bg-amber-700" : "bg-teal-600 hover:bg-teal-700"} text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-all`}>{editingAgentPaymentId ? <><Save size={16}/> بروزرسانی پرداخت</> : <><Plus size={16}/> ثبت پرداخت</>}</button></div>
                                    </div>
                                    
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-right">
                                            <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"><tr><th className="p-3">محل هزینه یا نام هزینه</th><th className="p-3">مبلغ (ریال)</th><th className="p-3">معادل تومان</th><th className="p-3">بانک</th><th className="p-3">تاریخ</th><th className="p-3">پارت</th><th className="p-3">توضیحات</th><th className="p-3">عملیات</th></tr></thead>
                                            <tbody>
                                                {agentForm.payments?.map((p) => {
                                                    const isReconciledBalance = p.id.startsWith('reconciled-clearance-balance-') || (p.agentName && p.agentName.includes('قبلی'));
                                                    return (
                                                        <tr key={p.id} className={`border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isReconciledBalance ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
                                                            <td className="p-3 font-bold">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span>{p.agentName}</span>
                                                                    {isReconciledBalance && (
                                                                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded font-normal">
                                                                            بازیابی از سوابق پرونده
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="p-3 font-mono font-bold text-gray-900 dark:text-gray-100">{formatCurrency(p.amount)}</td>
                                                            <td className="p-3 font-mono text-xs text-gray-500">{formatCurrency(Math.round(p.amount / 10))} تومان</td>
                                                            <td className="p-3">{p.bank || '---'}</td>
                                                            <td className="p-3 font-mono text-xs">{p.date || '---'}</td>
                                                            <td className="p-3">{p.part || '---'}</td>
                                                            <td className="p-3 text-gray-500 text-xs max-w-xs truncate">{p.description || '---'}</td>
                                                            <td className="p-3 text-center"><div className="flex justify-center gap-2 items-center"><button type="button" onClick={() => handleEditAgentPayment(p)} className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded cursor-pointer" title="ویرایش"><Edit size={16}/></button><button type="button" onClick={() => handleDeleteAgentPayment(p.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded cursor-pointer" title="حذف"><Trash2 size={16}/></button></div></td>
                                                        </tr>
                                                    );
                                                })}
                                                {(!agentForm.payments || agentForm.payments.length === 0) && (
                                                    <tr>
                                                        <td colSpan={8} className="p-6 text-center text-gray-400 text-sm">
                                                            هنوز ردیف تفکیک‌شده‌ای ثبت نشده است. (مبلغ کل هزینه ترخیص پرونده بر اساس رقم صورت کلی {formatCurrency(Math.round(stageRegisteredCost / 10))} تومان محاسبه می‌شود)
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className="bg-teal-50 dark:bg-teal-950/40 font-bold border-t-2 border-teal-200 dark:border-teal-800">
                                                    <td className="p-3">جمع کل ردیف‌های ثبت‌شده</td>
                                                    <td className="p-3 font-mono text-teal-700 dark:text-teal-400 text-base">{formatCurrency(currentPaymentsTotal)}</td>
                                                    <td className="p-3 font-mono text-teal-700 dark:text-teal-400">{formatCurrency(Math.round(currentPaymentsTotal / 10))} تومان</td>
                                                    <td colSpan={5}></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Agent / Clearance Fees Attachments */}
                                <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800">
                                    <TradeAttachmentSection
                                        attachments={selectedRecord.attachments?.filter(a => a.category?.includes('agent_fees') || a.subCategory === 'agent_fees') || []}
                                        onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/agent_fees', updated, 'agent_fees')}
                                        category="commercial/agent_fees"
                                        title="پیوست‌ها و فاکتورهای هزینه‌های ترخیص و ایجنت (تصویر و PDF)"
                                        description="تصویر صورتحساب حق‌العمل‌کار، فیش‌های انبارداری، خدمات بندری، فیش‌های آزمایشگاه و رسیدهای تسویه"
                                        currentUser={currentUser}
                                    />
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'final_calculation' && (
                        /* ... Final Calculation Logic ... */
                        <div id="print-trade-final" className="p-6 max-w-6xl mx-auto space-y-8">
                            <div className="glass-panel p-6 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
                                <div><h3 className="font-bold text-gray-800 text-lg mb-1">وضعیت نهایی پرونده</h3><p className="text-xs text-gray-500">مدیریت تعهدات و بایگانی پرونده</p></div>
                                <div className="flex gap-2 flex-wrap justify-end">
                                    <button type="button" onClick={toggleCommitment} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border transition-colors ${selectedRecord.isCommitmentFulfilled ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-green-50'}`}>{selectedRecord.isCommitmentFulfilled ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}{selectedRecord.isCommitmentFulfilled ? 'رفع تعهد شده' : 'رفع تعهد نشده'}</button>
                                    
                                    {!selectedRecord.isArchived ? (
                                        <button type="button" onClick={handleArchiveRecord} className="px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors bg-blue-600 text-white hover:bg-blue-700 shadow-md">
                                            <Archive size={18}/> ترخیص شد (بایگانی)
                                        </button>
                                    ) : (
                                        <button type="button" onClick={handleUnarchiveRecord} className="px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors bg-amber-500 text-white hover:bg-amber-600 shadow-md">
                                            <Undo2 size={18}/> بازگشت به جریان
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {/* ACTIVATED PRINT/PDF BUTTONS */}
                            <div className="flex justify-end gap-2" data-html2canvas-ignore>
                                <button type="button" onClick={handlePrintTrade} className="glass-panel border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm"><Printer size={16}/> چاپ گزارش</button>
                                <button type="button" onClick={handleDownloadFinalReportPDF} disabled={isGeneratingPdf} className="glass-panel border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm">{isGeneratingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>} دانلود PDF (صورتحساب)</button>
                                <button type="button" 
                                    onClick={() => {
                                        const costPerKg = calculateRecordCostPerKg(selectedRecord);
                                        const totalWeight = selectedRecord.items?.reduce((sum, item) => sum + item.weight, 0) || 0;
                                        setSendToChatAttachment(undefined);
                                        setSendToChatDefaultMsg(`📋 گزارش محاسبه نهایی و قیمت تمام‌شده پرونده ${selectedRecord.goodsName} (${selectedRecord.fileNumber})\n• وزن کل بار: ${formatNumberString(totalWeight)} کیلوگرم\n• قیمت تمام‌شده هر کیلو: ${formatCurrency(costPerKg)} ریال\n• ذینفع/شرکت: ${selectedRecord.company}`);
                                        setSendToChatOpen(true);
                                    }} 
                                    className="glass-panel border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
                                >
                                    <Share2 size={16}/> 
                                    ارسال به گفتگو
                                </button>
                            </div>

                            {/* --- NEW CALCULATION LOGIC IMPLEMENTATION (WEIGHT BASED + EFFECTIVE RATE) --- */}
                            {(() => {
                                // 1. Calculate Total Proforma Currency (Items + Freight)
                                const totalItemsCurrency = selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0);
                                const totalFreightCurrency = selectedRecord.freightCost || 0;
                                const totalProformaCurrency = totalItemsCurrency + totalFreightCurrency;

                                // 2. Calculate Net Rial Cost of Currency Purchase (Rial Paid - Return)
                                // REPLACED OLD RATE LOGIC
                                const currencyTranches = selectedRecord.currencyPurchaseData?.tranches || [];
                                const netCurrencyRialCost = currencyTranches.reduce((acc, t) => {
                                    const paid = t.rialAmount || 0;
                                    const ret = t.returnAmount || 0;
                                    return acc + (paid - ret);
                                }, 0);

                                // 3. Calculate Other Rial Overheads
                                const overheadStages = [
                                    TradeStage.LICENSES, TradeStage.INSURANCE, TradeStage.INSPECTION,
                                    TradeStage.CLEARANCE_DOCS, TradeStage.GREEN_LEAF,
                                    TradeStage.INTERNAL_SHIPPING, TradeStage.AGENT_FEES
                                ];
                                const totalOverheadsRial = overheadStages.reduce((sum, stage) => 
                                    sum + (selectedRecord.stages[stage]?.costRial || 0), 0);

                                // 4. Grand Total Rial Cost (Total Project Cost)
                                const grandTotalRialProject = netCurrencyRialCost + totalOverheadsRial;

                                // 5. Total Weight
                                const totalWeight = selectedRecord.items.reduce((sum, item) => sum + item.weight, 0);

                                // 6. Calculation Core:
                                // Effective Rate = Total Project Cost (Rial) / Total Proforma Currency (Items + Freight)
                                const effectiveRate = totalProformaCurrency > 0 ? grandTotalRialProject / totalProformaCurrency : 0;
                                
                                // NEW Calculation: Finished Rate of Currency (Purely for Currency Purchase)
                                const totalPurchasedCurrency = currencyTranches.reduce((sum, t) => sum + t.amount, 0);
                                const finishedCurrencyRate = totalPurchasedCurrency > 0 ? netCurrencyRialCost / totalPurchasedCurrency : 0;

                                // Freight per KG (Currency) = Total Freight (Currency) / Total Weight
                                const freightPerKgCurrency = totalWeight > 0 ? totalFreightCurrency / totalWeight : 0;

                                const costPerKg = totalWeight > 0 ? grandTotalRialProject / totalWeight : 0;

                                return (
                                    <>
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                            {/* Cost Statement Card */}
                                            <div className="lg:col-span-4 glass-panel p-6 rounded-2xl shadow-sm border h-fit">
                                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Calculator size={20} className="text-rose-600"/> صورت کلی هزینه‌ها</h3>
                                                <div className="overflow-hidden rounded-xl border">
                                                    <table className="w-full text-sm text-right">
                                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرح هزینه</th><th className="p-3">مبلغ ریالی</th></tr></thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            <tr>
                                                                <td className="p-3 text-gray-600">هزینه خرید ارز (خالص ریالی)</td>
                                                                <td className="p-3 font-mono">{formatCurrency(netCurrencyRialCost)}</td>
                                                            </tr>
                                                            {STAGES.map(stage => {
                                                                // Skip currency stage as we added it manually above
                                                                if (stage === TradeStage.CURRENCY_PURCHASE) return null;
                                                                const data = selectedRecord.stages[stage];
                                                                if (!data || data.costRial === 0) return null;
                                                                return (<tr key={stage}><td className="p-3 text-gray-600">{stage}</td><td className="p-3 font-mono">{formatCurrency(data.costRial)}</td></tr>);
                                                            })}
                                                            <tr className="bg-rose-50 font-bold border-t-2 border-rose-200">
                                                                <td className="p-3">جمع کل هزینه نهایی پروژه (ریالی)</td>
                                                                <td className="p-3 font-mono dir-ltr">{formatCurrency(grandTotalRialProject)}</td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                                
                                                <div className="mt-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-bold text-gray-600">مبلغ کل پروفرما (کالا + حمل):</span>
                                                        <span className="text-sm font-bold text-blue-700 dir-ltr font-mono">{formatNumberString(totalProformaCurrency)} {selectedRecord.mainCurrency}</span>
                                                    </div>
                                                    
                                                    <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                                        <span className="text-sm font-bold text-gray-700">میانگین موزون نرخ ارز (خرید):</span>
                                                        <span className="text-lg font-black text-rose-700 dir-ltr">{formatCurrency(finishedCurrencyRate)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-xs font-bold text-gray-500">نرخ نهایی ارز (با سربار):</span>
                                                        <span className="text-sm font-bold text-blue-700 dir-ltr">{formatCurrency(effectiveRate)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-xs font-bold text-gray-500">هزینه حمل ارزی هر کیلو:</span>
                                                        <span className="text-sm font-bold text-gray-700 dir-ltr">{formatNumberString(freightPerKgCurrency)} {selectedRecord.mainCurrency}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Guarantees List Card - Roomy 5-column space */}
                                            <div className="lg:col-span-5 glass-panel p-6 rounded-2xl shadow-sm border h-fit">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                                        <ShieldCheck size={20} className="text-blue-600"/> چک‌ها و ضمانت‌های تعهد ارزی و گمرکی
                                                    </h3>
                                                    <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-lg">
                                                        {getAllGuarantees().length} مورد
                                                    </span>
                                                </div>
                                                {getAllGuarantees().length === 0 ? (
                                                    <div className="text-center py-8 text-gray-400 text-xs">
                                                        هیچ چک یا ضمانت‌نامه‌ای برای این پرونده ثبت نشده است.
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {getAllGuarantees().map((g, i) => {
                                                            const dueStatus = getGuaranteeDueStatus(g.dueDate, g.isDelivered);
                                                            return (
                                                            <div key={i} className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${dueStatus.bgClass} ${dueStatus.needsFundAlert && !g.isDelivered ? 'border-amber-300 dark:border-amber-700 shadow-sm' : 'border-gray-200/80 hover:bg-white bg-gray-50/80'}`}>
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${g.type === 'ارزی' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'}`}>
                                                                            {g.type}
                                                                        </span>
                                                                        <span className="text-xs font-bold text-gray-800 dark:text-gray-100 font-mono">
                                                                            {g.number}
                                                                        </span>
                                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${dueStatus.badgeClass}`}>
                                                                            {dueStatus.statusLabel}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-3 flex-wrap">
                                                                        <span>بانک: <strong className="text-gray-700 dark:text-gray-200 font-medium">{g.bank}</strong></span>
                                                                        {g.dueDate && <span>سررسید: <strong className="font-mono text-gray-700 dark:text-gray-200 dir-ltr">{g.dueDate}</strong></span>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200/60">
                                                                    <div className="text-left">
                                                                        <div className="text-xs font-bold text-gray-900 dark:text-gray-100 font-mono dir-ltr">{formatCurrency(g.amount)}</div>
                                                                        <div className="text-[9px] text-gray-400">ریال</div>
                                                                    </div>
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={g.toggleFunc} 
                                                                        className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all shrink-0 ${g.isDelivered ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}
                                                                    >
                                                                        {g.isDelivered ? '✓ عودت شد' : '⏳ نزد سازمان'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Final Summary Card */}
                                            <div className="lg:col-span-3 glass-panel bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg border-0 h-fit">
                                                <h3 className="font-bold text-slate-200 mb-6 flex items-center gap-2"><PieChart size={20} className="text-emerald-400"/> خلاصه نهایی پرونده</h3>
                                                <div className="space-y-6">
                                                    <div>
                                                        <span className="text-slate-400 text-sm block mb-1">جمع کل هزینه نهایی:</span>
                                                        <div className="text-2xl font-black text-white dir-ltr text-left flex items-baseline justify-end gap-1">
                                                            <span className="text-sm font-normal text-slate-400">ریال</span>
                                                            {formatCurrency(grandTotalRialProject)} 
                                                        </div>
                                                    </div>
                                                    <div className="border-t border-slate-700 pt-4">
                                                        <span className="text-slate-400 text-sm block mb-1">وزن نهایی خالص:</span>
                                                        <div className="text-2xl font-black text-white dir-ltr text-left flex items-baseline justify-end gap-1">
                                                            <span className="text-sm font-normal text-slate-400">KG</span>
                                                            {formatNumberString(totalWeight)} 
                                                        </div>
                                                    </div>
                                                    <div className="border-t border-slate-700 pt-4">
                                                        <span className="text-slate-400 text-sm block mb-1">بهای تمام شده هر کیلو:</span>
                                                        <div className="text-3xl font-black text-emerald-400 dir-ltr text-left flex items-baseline justify-end gap-1">
                                                            <span className="text-sm font-normal text-emerald-600">ریال</span>
                                                            {formatCurrency(costPerKg)} 
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="glass-panel p-6 rounded-xl shadow-sm border mt-6">
                                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChart size={20} className="text-green-600"/> قیمت تمام شده به تفکیک کالا</h3>
                                            <div className="hidden lg:block overflow-x-auto">
                                                <table className="w-full text-sm text-right">
                                                    <thead className="bg-gray-100 text-gray-700">
                                                        <tr>
                                                            <th className="p-3">ردیف</th>
                                                            <th className="p-3">شرح کالا</th>
                                                            <th className="p-3">وزن (KG)</th>
                                                            <th className="p-3">فی ارزی (خرید)</th>
                                                            <th className="p-3 text-blue-800 bg-blue-50">فی ارزی نهایی (با حمل)</th>
                                                            <th className="p-3 font-bold">قیمت تمام شده (ریال)</th>
                                                            <th className="p-3 bg-gray-50 font-bold">فی تمام شده (هر کیلو)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {selectedRecord.items.map((item, idx) => {
                                                            // 1. Calculate Item Share of Freight in Currency based on weight
                                                            const itemFreightShareCurrency = item.weight * freightPerKgCurrency;
                                                            
                                                            // 2. Adjusted Item Total Price in Currency
                                                            const itemAdjustedTotalPriceCurrency = item.totalPrice + itemFreightShareCurrency;
                                                            
                                                            // 3. Final Cost in Rial = Adjusted Currency Total * Effective Rate
                                                            const itemFinalCostRial = itemAdjustedTotalPriceCurrency * effectiveRate;
                                                            
                                                            // 4. Per Kg
                                                            const itemFinalCostPerKg = item.weight > 0 ? itemFinalCostRial / item.weight : 0;
                                                            
                                                            // Display: Unit Price Adjusted
                                                            const itemAdjustedUnitPriceCurrency = item.weight > 0 ? itemAdjustedTotalPriceCurrency / item.weight : 0;

                                                            return (
                                                                <tr key={item.id} className="border-b hover:bg-gray-50">
                                                                    <td className="p-3 text-center">{idx + 1}</td>
                                                                    <td className="p-3 font-bold">{item.name}</td>
                                                                    <td className="p-3 font-mono">{formatNumberString(item.weight)}</td>
                                                                    <td className="p-3 font-mono">{formatNumberString(item.unitPrice)}</td>
                                                                    <td className="p-3 font-mono text-blue-800 bg-blue-50/30 font-bold">{formatNumberString(itemAdjustedUnitPriceCurrency)}</td>
                                                                    <td className="p-3 font-mono font-bold text-rose-700">{formatCurrency(itemFinalCostRial)}</td>
                                                                    <td className="p-3 font-mono font-bold bg-gray-50">{formatCurrency(itemFinalCostPerKg)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Mobile Final Cost Cards */}
                                            <div className="lg:hidden space-y-4">
                                                {selectedRecord.items.map((item, idx) => {
                                                    const itemFreightShareCurrency = item.weight * freightPerKgCurrency;
                                                    const itemAdjustedTotalPriceCurrency = item.totalPrice + itemFreightShareCurrency;
                                                    const itemFinalCostRial = itemAdjustedTotalPriceCurrency * effectiveRate;
                                                    const itemFinalCostPerKg = item.weight > 0 ? itemFinalCostRial / item.weight : 0;
                                                    const itemAdjustedUnitPriceCurrency = item.weight > 0 ? itemAdjustedTotalPriceCurrency / item.weight : 0;

                                                    return (
                                                        <div key={item.id} className="glass-panel p-4 rounded-xl border border-gray-100 shadow-sm">
                                                            <div className="flex justify-between items-center mb-3">
                                                                <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                                                                <div className="font-bold text-gray-800 text-right pr-2 truncate">{item.name}</div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                                    <span className="text-gray-500 block mb-1">وزن:</span>
                                                                    <span className="font-mono font-bold text-gray-800">{formatNumberString(item.weight)} KG</span>
                                                                </div>
                                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                                    <span className="text-gray-500 block mb-1">فی پایه (ارزی):</span>
                                                                    <span className="font-mono font-bold text-gray-800">{formatNumberString(item.unitPrice)}</span>
                                                                </div>
                                                                <div className="bg-blue-50 p-2 rounded-lg col-span-2 border border-blue-100">
                                                                    <span className="text-blue-500 block mb-1">فی نهایی با حمل (ارزی):</span>
                                                                    <span className="font-mono font-bold text-blue-700 text-sm">{formatNumberString(itemAdjustedUnitPriceCurrency)} {selectedRecord.mainCurrency}</span>
                                                                </div>
                                                            </div>
                                                            <div className="border-t border-dashed border-gray-200 pt-3 flex flex-col gap-2">
                                                                <div className="flex justify-between items-center bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                                                                    <span className="text-rose-600 font-bold">قیمت تمام شده:</span>
                                                                    <span className="font-mono font-black text-rose-700">{formatCurrency(itemFinalCostRial)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center bg-gray-100 p-2.5 rounded-lg border border-gray-200">
                                                                    <span className="text-gray-600 font-bold">فی تمام شده (هر کیلو):</span>
                                                                    <span className="font-mono font-black text-gray-800">{formatCurrency(itemFinalCostPerKg)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Final Calculation & Settlement Attachments */}
                                        <div className="glass-panel p-6 rounded-xl shadow-sm border bg-white dark:bg-gray-800 mt-6" data-html2canvas-ignore>
                                            <TradeAttachmentSection
                                                attachments={selectedRecord.attachments?.filter(a => a.category?.includes('final_calculation') || a.subCategory === 'final_calculation' || a.category === 'commercial/settlement') || []}
                                                onAttachmentsChange={(updated) => handleUpdateRecordAttachments('commercial/final_calculation', updated, 'final_calculation')}
                                                category="commercial/final_calculation"
                                                title="پیوست‌ها و اسناد تسویه و محاسبه نهایی (تصویر و PDF)"
                                                description="صورتحساب تسویه حساب نهایی، فیش‌های واریز سود بازرگانی، گزارش‌های حسابرسی و اسناد تکمیلی پرونده"
                                                currentUser={currentUser}
                                            />
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {activeTab === 'all_attachments' && (
                        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
                            <TradeAllAttachmentsTab
                                record={selectedRecord}
                                onUpdateRecord={persistRecordUpdate}
                                currentUser={currentUser}
                            />
                        </div>
                    )}
                </div>

                {/* Standard Documents Quick Display Panel (Desktop Only) */}
                <div className="hidden md:block bg-slate-50 border-t border-slate-200 dark:bg-zinc-900 dark:border-zinc-800" data-html2canvas-ignore>
                    <div className="max-w-5xl mx-auto px-6 py-4">
                        <button type="button" 
                            onClick={() => setShowQuickDocsPanel(!showQuickDocsPanel)}
                            className="w-full flex items-center justify-between text-slate-800 hover:text-blue-700 transition-colors focus:outline-none"
                        >
                            <div className="flex items-center gap-2">
                                <FileText size={18} className="text-slate-600" />
                                <span className="text-sm font-black">اسناد و فرم‌های استاندارد پرونده (نمایش سریع)</span>
                                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                    {2 + (selectedRecord.shippingDocuments?.length || 0)} سند
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                                <span>{showQuickDocsPanel ? 'بستن منو' : 'مشاهده اسناد'}</span>
                                {showQuickDocsPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                        </button>

                        {showQuickDocsPanel && (
                            <div className="mt-4 pt-4 border-t border-slate-200/60 flex flex-wrap gap-3 animate-fade-in">
                                {/* Proforma View */}
                                <button type="button" 
                                    onClick={() => setShowProformaPrint(true)}
                                    className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2.5 rounded-xl font-bold border border-blue-200 transition-all active:scale-95"
                                >
                                    <Printer size={14} />
                                    مشاهده پروفرما استاندارد
                                </button>

                                {/* Clearance view */}
                                <button type="button" 
                                    onClick={() => setShowClearancePrint(true)}
                                    className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2.5 rounded-xl font-bold border border-emerald-200 transition-all active:scale-95"
                                >
                                    <Printer size={14} />
                                    مشاهده اعلامیه ورود و ترخیصیه
                                </button>

                                {/* Registered Shipping Documents */}
                                {selectedRecord.shippingDocuments && selectedRecord.shippingDocuments.length > 0 ? (
                                    selectedRecord.shippingDocuments.map(doc => (
                                        <button type="button" 
                                            key={doc.id}
                                            onClick={() => setSelectedShippingDocForPrint(doc)}
                                            className="flex items-center gap-2 text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 px-4 py-2.5 rounded-xl font-bold border border-orange-200 transition-all active:scale-95"
                                        >
                                            <Printer size={14} />
                                            سند حمل استاندارد ({doc.documentNumber})
                                        </button>
                                    ))
                                ) : (
                                    <span className="text-[11px] text-gray-400 flex items-center bg-gray-100 px-3 py-2 rounded-xl">
                                        هنوز هیچ سند حملی ثبت نشده است.
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            {renderTrancheDeliveriesModal()}
            </div>
        );
    }

    // Default Dashboard View
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Container className="text-blue-600" /> پرونده‌های بازرگانی
                    </h1>
                    <div className="text-sm text-gray-500 mt-1 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-2 no-scrollbar scroll-smooth">
                        <button type="button" onClick={goRoot} className="hover:text-blue-600 flex items-center gap-1 shrink-0 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full transition-colors active:scale-95"><Home size={14}/> خانه</button>
                        {selectedCompany && <><ChevronLeft size={14} className="shrink-0 text-gray-400"/> <button type="button" onClick={() => goCompany(selectedCompany)} className="hover:text-blue-600 shrink-0 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full transition-colors active:scale-95">{selectedCompany}</button></>}
                        {selectedGroup && <><ChevronLeft size={14} className="shrink-0 text-gray-400"/> <span className="shrink-0 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-full font-bold">{selectedGroup}</span></>}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                    <div className="relative flex-1 sm:flex-none min-w-[120px]">
                        <input className="w-full border rounded-xl pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="جستجو..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
                    </div>
                    <button type="button" 
                        onClick={() => setShowArchived(!showArchived)} 
                        className={`p-2 sm:px-4 sm:py-2 rounded-xl flex items-center gap-2 font-bold transition-colors border ${showArchived ? 'bg-amber-100 text-amber-700 border-amber-200' : 'glass-panel text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                        title={showArchived ? 'نمایش جاری' : 'نمایش بایگانی'}
                    >
                        <Archive size={20} />
                        <span className="hidden sm:inline">{showArchived ? 'نمایش جاری' : 'نمایش بایگانی'}</span>
                    </button>
                    <button type="button" onClick={() => setViewMode('reports')} className="glass-panel border border-gray-300 text-gray-700 p-2 sm:px-4 sm:py-2 rounded-xl flex items-center gap-2 hover:bg-gray-50 font-bold transition-colors" title="گزارشات">
                        <FileSpreadsheet size={20} /> <span className="hidden sm:inline">گزارشات</span>
                    </button>
                    <button type="button" onClick={() => setShowNewModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white p-2 sm:px-4 sm:py-2 rounded-xl flex items-center gap-2 font-bold transition-colors shadow-lg shadow-blue-600/20" title="ثبت پرونده جدید">
                        <Plus size={20} /> <span className="hidden sm:inline">جدید</span>
                    </button>
                </div>
            </div>

            {/* Guarantee Due Dates Alert Banner */}
            <GuaranteeAlertBanner 
                records={records} 
                currentUser={currentUser} 
                onNavigateToRecord={(recordId, tab) => {
                    const target = records.find(r => r.id === recordId);
                    if (target) {
                        setSelectedRecord(target);
                        setViewMode('details');
                        if (tab) setActiveTab(tab as any);
                    }
                }}
            />

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {searchTerm.trim() === '' && navLevel !== 'GROUP' ? (
                    groupedData.map((item: any) => (
                        <div key={item.name} onClick={() => item.type === 'company' ? goCompany(item.name) : goGroup(item.name)} className="glass-panel p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-2 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="flex justify-between items-center mb-4">
                                <div className="bg-blue-50 p-3 rounded-xl text-blue-600 group-hover:scale-110 transition-transform">
                                    {item.type === 'company' ? <Building2 size={24} /> : <Package size={24} />}
                                </div>
                                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">{item.count} پرونده</span>
                            </div>
                            <h3 className="font-bold text-gray-800 text-lg mb-1">{item.name}</h3>
                            <p className="text-xs text-gray-500">کلیک برای مشاهده جزئیات</p>
                        </div>
                    ))
                ) : (
                    safeRecords
                        .filter(r => {
                            // Transferred-out records MUST NEVER be shown anywhere in the grid (not in active, not in archive)
                            if (r.transferredTo) return false;

                            const isSearching = searchTerm.trim() !== '';
                            const matchSearch = !isSearching || matchesTradeRecord(r, searchTerm);

                            if (!matchSearch) return false;

                            // When searching: show matching records across all groups/companies, including archived
                            if (isSearching) {
                                return true;
                            }

                            // When not searching: respect standard drill-down navigation and archived toggle
                            return (showArchived ? r.isArchived : !r.isArchived) && 
                                   ((r.company || 'بدون شرکت') === selectedCompany) && 
                                   ((r.commodityGroup || 'سایر') === selectedGroup);
                        })
                        .map(record => {
                            const matchHighlights = searchTerm.trim() !== '' ? getTradeRecordMatchHighlights(record, searchTerm) : [];
                            return (
                            <div key={record.id} onClick={() => { 
                                setSelectedRecord(record); 
                                setViewMode('details'); 
                                setActiveTab(record.purchaseType === 'domestic_bourse' ? 'domestic_petrochemical' : 'timeline'); 
                            }} className="glass-panel p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group border-l-4 border-l-transparent hover:border-l-blue-500 relative">
                                {/* ACTIONS: COPY & DELETE BUTTONS - Moved to Right to avoid status overlap */}
                                <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                                    <button type="button" 
                                        onClick={(e) => handleDuplicateRecord(record, e)} 
                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                        title="کپی آنی پرونده"
                                    >
                                        <Copy size={18}/>
                                    </button>
                                    <button type="button" 
                                        onClick={(e) => handleDeleteRecord(record.id, e)} 
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="حذف پرونده"
                                    >
                                        <Trash2 size={18}/>
                                    </button>
                                </div>

                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-bold text-gray-800 line-clamp-1 pr-8" title={record.goodsName}>{record.goodsName}</h3>
                                    <div className="flex items-center gap-1">
                                        {record.purchaseType === 'domestic_bourse' && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1">
                                                🏢 پتروشیمی/بورس
                                            </span>
                                        )}
                                        {record.isArchived && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 font-bold flex items-center gap-1">
                                                <Archive size={10} /> بایگانی
                                            </span>
                                        )}
                                        <span className={`text-[10px] px-2 py-1 rounded-lg ${record.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                                            {record.status === 'Completed' ? 'تکمیل شده' : 'جاری'}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1.5 text-xs text-gray-500">
                                    <div className="flex items-center gap-1"><span className="text-[11px] text-gray-400">شماره پرونده:</span> <span className="font-mono text-gray-700 dark:text-gray-200 font-bold">{record.fileNumber || '---'}</span></div>
                                    {record.proformaNumber && <div className="flex items-center gap-1"><FolderOpen size={12} /> پروفرم: <span className="font-mono text-gray-700 dark:text-gray-200 font-bold">{record.proformaNumber}</span></div>}
                                    {record.orderNumber && <div className="flex items-center gap-1"><span className="text-[11px] text-gray-400">سفارش:</span> <span className="font-mono text-gray-700 dark:text-gray-300 font-semibold">{record.orderNumber}</span></div>}
                                    {record.registrationNumber && <div className="flex items-center gap-1"><span className="text-[11px] text-gray-400">ثبت سفارش:</span> <span className="font-mono text-blue-700 dark:text-blue-300 font-semibold">{record.registrationNumber}</span></div>}
                                    <div className="flex items-center gap-1"><Building2 size={12} /> فروشنده: <span className="text-gray-700 dark:text-gray-300">{record.sellerName}</span></div>
                                    <div className="flex items-center gap-1"><History size={12} /> شروع: <span>{new Date(record.startDate).toLocaleDateString('fa-IR')}</span></div>
                                    
                                    {/* Match Badges / Highlights */}
                                    {matchHighlights.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-blue-100 dark:border-blue-900/40">
                                            {matchHighlights.slice(0, 3).map((hl, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80 px-2 py-0.5 rounded-md font-medium">
                                                    <span className="opacity-75">{hl.label}:</span>
                                                    <span className="font-bold font-mono">{hl.value}</span>
                                                </span>
                                            ))}
                                            {matchHighlights.length > 3 && (
                                                <span className="text-[10px] text-blue-600 self-center">+{matchHighlights.length - 3} مورد دیگر</span>
                                            )}
                                        </div>
                                    )}

                                    {searchTerm.trim() !== '' && (
                                        <div className="text-[10px] text-blue-600 bg-blue-50/60 p-1 rounded-md mt-1">
                                            <span>{record.company || 'بدون شرکت'}</span> • <span>گروه {record.commodityGroup || 'سایر'}</span>
                                        </div>
                                    )}
                                </div>
                                {record.transferredFrom && (
                                    <div className="mt-3 pt-2.5 border-t border-amber-200/80 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 p-2 rounded-xl flex items-center gap-1.5 font-medium">
                                        <ArrowRightLeft size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                                        <span className="line-clamp-2">انتقال از پروفرم {record.transferredFrom.fileNumber} (گروه {record.transferredFrom.commodityGroup}) به این پروفرم</span>
                                    </div>
                                )}

                            </div>
                        );
                    })
                )}
            </div>
            
            {/* New Record Modal */}
            {showNewModal && createPortal(
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-xl p-6 md:p-8 border border-gray-200 dark:border-gray-800 text-right max-h-[90vh] overflow-y-auto my-auto animate-scale-in" dir="rtl">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                            <div>
                                <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100">ثبت پرونده جدید</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">نوع پرونده تجاری و مشخصات اولیه را وارد کنید</p>
                            </div>
                            <button type="button" onClick={() => setShowNewModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"><X size={22} className="text-gray-400 hover:text-red-500" /></button>
                        </div>

                        {/* Purchase Type Selector */}
                        <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100 dark:bg-gray-800/80 rounded-2xl mb-4 text-xs font-bold">
                            <button
                                type="button"
                                onClick={() => {
                                    setNewPurchaseType('import');
                                    setNewMainCurrency('EUR');
                                }}
                                className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                    newPurchaseType === 'import'
                                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-300 shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400'
                                }`}
                            >
                                <span>🌐 واردات خارجی (ارزی)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setNewPurchaseType('domestic_bourse');
                                    setNewMainCurrency('IRR');
                                    if (!newSellerName) setNewSellerName('پتروشیمی شهید تندگویان');
                                    if (!newGoodsName) setNewGoodsName('چیپس نساجی TG642');
                                }}
                                className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                    newPurchaseType === 'domestic_bourse'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400'
                                }`}
                            >
                                <span>🏢 خرید داخلی پتروشیمی (بورس/LC)</span>
                            </button>
                        </div>

                        {newPurchaseType === 'domestic_bourse' ? (
                            <div className="space-y-4 text-gray-800 dark:text-gray-200">
                                <div className="bg-emerald-50/90 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-300">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                        <span className="font-bold">ثبت مشخصات برگه خرید و حواله پتروشیمی / بورس کالا</span>
                                    </div>
                                    <span className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2.5 py-0.5 rounded-lg text-[10px] font-black">ریالی (IRR)</span>
                                </div>

                                {/* Row 1: Contract Number & Remittance Number */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                                            <span>شماره قرارداد / شناسه معامله بورس *</span>
                                        </label>
                                        <input 
                                            className="w-full border border-emerald-300 dark:border-emerald-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none" 
                                            value={newDomesticContractNumber} 
                                            onChange={e => setNewDomesticContractNumber(e.target.value)} 
                                            placeholder="مثال: 1403/B-9842 یا 872145..." 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                                            <span>شماره حواله / تخصیص بارگیری پتروشیمی</span>
                                        </label>
                                        <input 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none" 
                                            value={newDomesticRemittanceNumber} 
                                            onChange={e => setNewDomesticRemittanceNumber(e.target.value)} 
                                            placeholder="مثال: REM-88421 یا 984512..." 
                                        />
                                    </div>
                                </div>

                                {/* Row 2: Petrochemical Proforma / Invoice No & Internal File Number */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شماره پیش‌فاکتور / فاکتور پتروشیمی</label>
                                        <input 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none" 
                                            value={newDomesticProformaNumber} 
                                            onChange={e => setNewDomesticProformaNumber(e.target.value)} 
                                            placeholder="مثال: PI-1403/PETRO یا 54120..." 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شماره پرونده داخلی (اختیاری)</label>
                                        <input 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none" 
                                            value={newFileNumberDirect} 
                                            onChange={e => setNewFileNumberDirect(e.target.value)} 
                                            placeholder="شماره پرونده مجزا در سیستم..." 
                                        />
                                    </div>
                                </div>

                                {/* Row 3: Goods Name (Grade) & Quantity (Kg) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">نام و گرید کالا (شرح کالا) *</label>
                                        <input 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none font-bold" 
                                            value={newGoodsName} 
                                            onChange={e => setNewGoodsName(e.target.value)} 
                                            placeholder="مثال: چیپس نساجی TG642..." 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">مقدار / تناژ خرید (کیلوگرم) *</label>
                                        <FormattedNumberInput 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono text-left dir-ltr focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none font-bold text-emerald-700 dark:text-emerald-400" 
                                            value={newDomesticQuantityKgStr} 
                                            onChange={val => setNewDomesticQuantityKgStr(val !== undefined && val !== null ? String(val) : '')} 
                                            placeholder="۵۰,۰۰۰" 
                                        />
                                    </div>
                                </div>

                                {/* Row 4: Petrochemical (Seller) & Broker */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">نام شرکت پتروشیمی (فروشنده) *</label>
                                        <input 
                                            list="petrochemical-suppliers" 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none" 
                                            value={newSellerName} 
                                            onChange={e => setNewSellerName(e.target.value)} 
                                            placeholder="انتخاب یا ورود نام پتروشیمی..." 
                                        />
                                        <datalist id="petrochemical-suppliers">
                                            <option value="پتروشیمی شهید تندگویان" />
                                            <option value="پتروشیمی شازند (اراک)" />
                                            <option value="پتروشیمی اروند" />
                                            <option value="پتروشیمی تبریز" />
                                            <option value="پتروشیمی جم" />
                                            <option value="پتروشیمی امیرکبیر" />
                                            <option value="پتروشیمی رجال" />
                                            <option value="پتروشیمی مارون" />
                                            <option value="پتروشیمی بوعلی سینا" />
                                            <option value="پتروشیمی پلی‌نار" />
                                            <option value="پتروشیمی قائد بصیر" />
                                        </datalist>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">کارگزاری بورس کالا</label>
                                        <input 
                                            list="bourse-brokers" 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none" 
                                            value={newDomesticBroker} 
                                            onChange={e => setNewDomesticBroker(e.target.value)} 
                                            placeholder="نام کارگزاری بورس..." 
                                        />
                                        <datalist id="bourse-brokers">
                                            <option value="کارگزاری بورس کالا" />
                                            <option value="کارگزاری کاریزما" />
                                            <option value="کارگزاری مفید" />
                                            <option value="کارگزاری آگاه" />
                                            <option value="کارگزاری مبین سرمایه" />
                                            <option value="کارگزاری صبا جهاد" />
                                            <option value="کارگزاری بورسیران" />
                                            <option value="کارگزاری سهم آشنا" />
                                            <option value="کارگزاری رضوی" />
                                        </datalist>
                                    </div>
                                </div>

                                {/* Row 5: Payment Method & Deal Date */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">نحوه تسویه / پرداخت</label>
                                        <select 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none font-bold" 
                                            value={newDomesticPaymentMethod} 
                                            onChange={e => setNewDomesticPaymentMethod(e.target.value as any)}
                                        >
                                            <option value="internal_lc">🏦 اعتبار اسنادی داخلی (LC ریالی)</option>
                                            <option value="cash">💵 پرداخت نقدی بورس کالا</option>
                                            <option value="draft_barat">📜 برات الکترونیک (سامانه سپام)</option>
                                            <option value="bourse_salaf">⏳ خرید سلف بورس کالا</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">تاریخ معامله / قرارداد</label>
                                        <TradeDatePicker 
                                            value={newDomesticDealDate} 
                                            onChange={val => setNewDomesticDealDate(val)} 
                                            placeholder="انتخاب تاریخ معامله..." 
                                        />
                                    </div>
                                </div>

                                {/* Row 6: Company */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شرکت خریدار *</label>
                                    <select 
                                        className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none font-bold" 
                                        value={newRecordCompany} 
                                        onChange={e => setNewRecordCompany(e.target.value)}
                                    >
                                        <option value="">انتخاب شرکت خریدار...</option>
                                        {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>

                                <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                                    <button type="button" onClick={() => setShowNewModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">انصراف</button>
                                    <button 
                                        type="button" 
                                        onClick={handleCreateRecord} 
                                        disabled={(!newDomesticContractNumber && !newDomesticProformaNumber && !newFileNumberDirect) || !newGoodsName || !newRecordCompany} 
                                        className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Check className="w-4 h-4" />
                                        <span>ثبت و ایجاد پرونده پتروشیمی</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 text-gray-800 dark:text-gray-200">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شماره پروفرم</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newProformaNumber} onChange={e => setNewProformaNumber(e.target.value)} placeholder="مثال: PI-1403-01 یا 2024-99..." />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شماره سفارش</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newOrderNumber} onChange={e => setNewOrderNumber(e.target.value)} placeholder="مثال: ORD-1403-01..." />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شماره پرونده</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newFileNumberDirect} onChange={e => setNewFileNumberDirect(e.target.value)} placeholder="شماره پرونده (مستقل از پروفرما)..." />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شماره ثبت سفارش</label>
                                        <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-left dir-ltr text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newRegistrationNumber} onChange={e => setNewRegistrationNumber(e.target.value)} placeholder="شماره ۸ رقمی ثبت سفارش..." />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">نام کالا (شرح کلی) *</label>
                                    <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newGoodsName} onChange={e => setNewGoodsName(e.target.value)} placeholder="مثال: ۲۵۰ تن چیپس پلی استر نساجی..." />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">فروشنده</label>
                                    <input className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} placeholder="نام شرکت فروشنده..." />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">گروه کالایی</label>
                                        <input list="commodity-groups" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newCommodityGroup} onChange={e => setNewCommodityGroup(e.target.value)} placeholder="انتخاب یا ورود گروه..." />
                                        <datalist id="commodity-groups">{commodityGroups.map(g => <option key={g} value={g} />)}</datalist>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">ارز پایه</label>
                                        <select className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>
                                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">شرکت *</label>
                                    <select className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none" value={newRecordCompany} onChange={e => setNewRecordCompany(e.target.value)}>
                                        <option value="">انتخاب شرکت مربوطه...</option>
                                        {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                                    <button type="button" onClick={() => setShowNewModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">انصراف</button>
                                    <button type="button" onClick={handleCreateRecord} disabled={(!newProformaNumber && !newFileNumberDirect && !newFileNumber) || !newGoodsName || !newRecordCompany} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all">ایجاد پرونده</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Transfer Proforma Modal */}
            {renderTransferModal()}
            {/* Tranche Deliveries Modal */}
            {selectedTrancheForDeliveries && (() => {
                const tr = (selectedRecord?.currencyPurchaseData?.tranches || []).find((t: any) => t.id === selectedTrancheForDeliveries) || 
                           currencyForm.tranches?.find(t => t.id === selectedTrancheForDeliveries);
                if (!tr) return null;
                const deliveries = tr.deliveries || [];
                return createPortal(
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl p-6 md:p-8 border border-gray-200 dark:border-gray-800 text-right max-h-[90vh] overflow-y-auto my-auto animate-scale-in" dir="rtl">
                            <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-100 dark:border-gray-800">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    <Coins size={22} className="text-green-600"/>
                                    ثبت و مدیریت تحویل‌های پارت
                                </h3>
                                <button type="button" onClick={() => setSelectedTrancheForDeliveries(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X size={20} className="text-gray-400 hover:text-red-500" /></button>
                            </div>

                            {/* Tranche Specs Card */}
                            <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-xl border border-amber-200 dark:border-amber-800 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div><span className="text-gray-500 dark:text-gray-400 block">مبلغ کل پارت:</span><span className="font-bold font-mono text-amber-800 dark:text-amber-300 text-sm">{formatNumberString(tr.amount)} {tr.currencyType}</span></div>
                                <div><span className="text-gray-500 dark:text-gray-400 block">کل هزینه ریالی:</span><span className="font-bold font-mono text-gray-800 dark:text-gray-200">{formatNumberString(tr.rialAmount || 0)} ریال</span></div>
                                <div><span className="text-gray-500 dark:text-gray-400 block">صرافی/کارگزار:</span><span className="font-bold text-gray-800 dark:text-gray-200">{tr.exchangeName || '-'} {tr.brokerName ? `(${tr.brokerName})` : ''}</span></div>
                                <div><span className="text-gray-500 dark:text-gray-400 block">تاریخ خرید:</span><span className="font-bold text-gray-800 dark:text-gray-200">{tr.date || '-'}</span></div>
                            </div>

                            {/* Add Delivery Form */}
                            <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-xl mb-6 bg-gray-50 dark:bg-gray-800/50 text-right">
                                <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1">افزودن تحویل جدید</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">مقدار تحویلی *</label>
                                        <input 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-sm dir-ltr font-bold text-green-700 dark:text-green-400 bg-white dark:bg-gray-900" 
                                            value={newDeliveryForm.amount} 
                                            onChange={e => setNewDeliveryForm({...newDeliveryForm, amount: formatNumberString(e.target.value)})} 
                                            placeholder="مقدار ارز..." 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">تاریخ تحویل</label>
                                        <TradeDatePicker 
                                            value={newDeliveryForm.date} 
                                            onChange={val => setNewDeliveryForm({...newDeliveryForm, date: val})} 
                                            placeholder="۱۴۰۳/۰۱/۰۱" 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 font-sans">تحویل‌گیرنده</label>
                                        <input 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" 
                                            value={newDeliveryForm.recipientName} 
                                            onChange={e => setNewDeliveryForm({...newDeliveryForm, recipientName: e.target.value})} 
                                            placeholder="نام شخص..." 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 font-sans">توضیحات</label>
                                        <input 
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" 
                                            value={newDeliveryForm.description} 
                                            onChange={e => setNewDeliveryForm({...newDeliveryForm, description: e.target.value})} 
                                            placeholder="توضیحات..." 
                                        />
                                    </div>
                                </div>
                                <button type="button" 
                                    onClick={handleAddTrancheDelivery} 
                                    className="mt-4 w-full bg-green-600 text-white rounded-lg p-2 font-bold hover:bg-green-700 text-sm transition-all flex items-center justify-center gap-1 shadow-md"
                                >
                                    <Plus size={16}/> ثبت تحویل
                                </button>
                            </div>

                            {/* Deliveries List */}
                            <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-3">تحویل‌های ثبت شده</h4>
                            {deliveries.length === 0 ? (
                                <div className="text-center py-6 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">تحویلی برای این پارت ثبت نشده است.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-right mt-1">
                                        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                            <tr>
                                                <th className="p-3">تاریخ</th>
                                                <th className="p-3">مقدار تحویلی</th>
                                                <th className="p-3">تحویل‌گیرنده</th>
                                                <th className="p-3">توضیحات</th>
                                                <th className="p-3">حذف</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-800 dark:text-gray-200">
                                            {deliveries.map((delivery) => (
                                                <tr key={delivery.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                    <td className="p-3 font-mono">{delivery.date || '-'}</td>
                                                    <td className="p-3 font-mono font-bold text-green-700 dark:text-green-400">{formatNumberString(delivery.amount)} {tr.currencyType}</td>
                                                    <td className="p-3">{delivery.recipientName || '-'}</td>
                                                    <td className="p-3 text-gray-500 dark:text-gray-400">{delivery.description || '-'}</td>
                                                    <td className="p-3">
                                                        <button type="button" 
                                                            onClick={() => handleRemoveTrancheDelivery(tr.id, delivery.id)} 
                                                            className="text-red-500 hover:text-red-700"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-green-50 dark:bg-green-950/40 font-bold text-gray-900 dark:text-gray-100">
                                            <tr>
                                                <td className="p-3">مجموع تحویل‌ها</td>
                                                <td className="p-3 font-mono text-green-800 dark:text-green-300">{formatNumberString(deliveries.reduce((sum: number, d) => sum + d.amount, 0))} {tr.currencyType}</td>
                                                <td colSpan={3}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                );
            })()}

            {/* Subtab Back Trigger */}
            {viewMode === 'details' ? (
                <button type="button" data-subtab-back="true" onClick={() => { setViewMode('dashboard'); setSelectedRecord(null); }} className="hidden" />
            ) : (
                viewMode !== 'dashboard' && (
                    <button type="button" data-subtab-back="true" onClick={() => setViewMode('dashboard')} className="hidden" />
                )
            )}

            <FileViewerModal 
                isOpen={viewerOpen}
                onClose={() => setViewerOpen(false)}
                fileUrl={viewerUrl}
                fileName={viewerName}
            />

            <SendToChatModal
                isOpen={sendToChatOpen}
                onClose={() => setSendToChatOpen(false)}
                attachment={sendToChatAttachment}
                defaultMessage={sendToChatDefaultMsg}
            />
        </div>
    );
};

export default TradeModule;
