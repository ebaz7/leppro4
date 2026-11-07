
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    PurchaseRequest, PurchaseRequestStatus, User, UserRole, 
    SystemSettings, PurchaseProforma, PartMasterData, PartKardex,
    PurchaseRequestItem, PurchaseProformaItem, PurchaseAttachment, PurchaseAuditLog, PurchaseComment 
} from '../types';
import { 
    getPurchaseRequests, savePurchaseRequest, updatePurchaseRequest, 
    deletePurchaseRequest, getNextPurchaseRequestNumber, 
    getPartMasterData, savePartMasterData, updatePartMasterData, 
    deletePartMasterData, getPartKardex, uploadFileChunked,
    matchSayanPart, syncSayanFactoryParts
} from '../services/storageService';
import { 
    ShoppingCart, Plus, Search, Filter, Eye, Edit, Trash2, 
    CheckCircle, XCircle, FileText, Package, Truck, 
    ShieldCheck, Shield, ClipboardCheck, Warehouse, History, 
    Image as ImageIcon, MoreVertical, Loader2, ArrowRight,
    Ruler, Layers, Tag, Upload, Info, FileUp, UploadCloud, Settings, Printer, FileDown, AlertCircle, X,
    GitFork, Clock, CornerUpLeft, UserCheck, FileCode, AlertTriangle, Check, ExternalLink, Paperclip, Wrench,
    FileSpreadsheet, Container, ArrowDownCircle, ArrowUpCircle, MessageSquare, Sparkles, Bot, ChevronUp, ChevronDown,
    Crown, Briefcase, ShoppingBag, Lock, ShieldAlert, RotateCcw, RefreshCw, Users, CheckSquare, Sliders,
    ChevronRight, ChevronLeft, Download
} from 'lucide-react';
import { shareElementToChat, openSendToChat } from '../services/chatShareService';
import { formatDate, formatCurrency, generateUUID, getCurrentShamsiDate } from '../constants';
import useIsMobile from '../hooks/useIsMobile';
import * as XLSX from 'xlsx';
import PrintPurchaseRequest from './PrintPurchaseRequest';
import PrintPurchaseProforma from './PrintPurchaseProforma';
import PrintWarehouseReceipt from './PrintWarehouseReceipt';
import PrintPartDataSheet from './PrintPartDataSheet';
import PrintPurchaseBarcode from './PrintPurchaseBarcode';
import { PinchZoomContainer } from './PinchZoomContainer';
import { generatePdf } from '../utils/pdfGenerator';
import { getRolePermissions } from '../services/authService';
import { AiPurchaseAdvisorModal } from './AiPurchaseAdvisorModal';
import { FileViewerModal } from './FileViewerModal';
import { LS_KEYS, getLocalData, resolveImageUrl } from '../services/apiService';
import { downloadAndOpenFile, saveImageToGallery } from '../services/fileService';
import { useCachedAsset } from '../hooks/useCachedAsset';

export function fixMojibake(str: string): string {
    if (!str || typeof str !== 'string') return str || '';
    if (/[\u00C0-\u00FF]/.test(str)) {
        try {
            const bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                bytes[i] = str.charCodeAt(i) & 0xFF;
            }
            const decoded = new TextDecoder('utf-8').decode(bytes);
            if (decoded && !decoded.includes('')) {
                return decoded;
            }
        } catch (e) {
            // fallback
        }
    }
    return str;
}

const CachedImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({ src, alt, className, ...props }) => {
    const cachedSrc = useCachedAsset(src);
    return <img src={cachedSrc || src} alt={alt} className={className} {...props} />;
};

/**
 * Access Control Rule for Proformas and Quotes in Purchase Requests:
 * 1. Admin, Commercial Manager, CEO, and Financial Manager can view proformas for ALL requests.
 * 2. In Factory/Zanjan purchases, Factory Manager and Factory Buyer can view proformas.
 * 3. All other roles (requesters, shift leaders, technicians, warehouse keepers, etc.) cannot view proformas or financial quotes.
 */
export const canUserViewProformas = (
    user: User | null | undefined,
    request?: PurchaseRequest | null,
    settings?: SystemSettings | null
): boolean => {
    if (!user) return false;

    // Collect all active roles for the user (normalized to lowercase)
    const roles: string[] = [];
    if (user.role) roles.push(String(user.role).toLowerCase());
    if (Array.isArray(user.roles)) {
        user.roles.forEach(r => {
            if (r) {
                const normalized = String(r).toLowerCase();
                if (!roles.includes(normalized)) roles.push(normalized);
            }
        });
    }

    const checkRole = (roleKey: string) => roles.includes(roleKey.toLowerCase());

    // 1. Admin always has full access
    if (checkRole(UserRole.ADMIN) || checkRole('admin') || checkRole('ادمین') || checkRole('مدیر سیستم')) {
        return true;
    }

    // Check direct user override or role permission for canViewPricingAndInvoices
    if (user.canViewPricingAndInvoices === true || checkPurchasePermission(user, 'canViewPricingAndInvoices', settings)) {
        return true;
    }

    // 2. Unconditional Senior Managers: Commercial Manager, CEO, Financial Manager
    if (
        checkRole(UserRole.COMMERCIAL) || checkRole('commercial') || checkRole('بازرگانی') || checkRole('مدیر بازرگانی') ||
        checkRole(UserRole.CEO) || checkRole('ceo') || checkRole('مدیرعامل') ||
        checkRole(UserRole.FINANCIAL) || checkRole('financial') || checkRole('مدیر مالی') || checkRole('مالی')
    ) {
        return true;
    }

    // Check custom permissions in settings for senior management
    for (const r of roles) {
        const perms = (settings?.purchaseRolePermissions as any)?.[r] || {};
        if (perms.canApproveCEO || perms.canApproveCommercialManager || perms.canCommercialFinalize) {
            return true;
        }
    }

    // 3. Factory Purchase condition:
    // Factory Manager and Factory Buyer can view proformas ONLY if the purchase is in Factory/Zanjan scope
    const isFactoryScope = !request || 
        request.location === 'Factory' || 
        request.location === 'Zanjan' || 
        (typeof request.status === 'string' && (
            request.status.includes('FACTORY') || 
            request.status.includes('ZANJAN')
        ));

    if (isFactoryScope) {
        // Factory Manager
        if (
            checkRole(UserRole.FACTORY_MANAGER) || 
            checkRole('factory_manager') || 
            checkRole('مدیر کارخانه')
        ) {
            return true;
        }

        // Factory Buyer / Purchasing Officer
        if (
            checkRole('factory_purchasing') || 
            checkRole('purchasing') || 
            checkRole('مسئول خرید') || 
            checkRole('کارپرداز') ||
            checkRole('خرید کارخانه')
        ) {
            return true;
        }

        // Check if role has canManageProformas, canManageZanjanPurchasing, canExecuteBuyerZanjan, or canApproveFactory in settings
        for (const r of roles) {
            const perms = (settings?.purchaseRolePermissions as any)?.[r] || {};
            if (perms.canManageProformas || perms.canManageZanjanPurchasing || perms.canExecuteBuyerZanjan || perms.canApproveFactory) {
                return true;
            }
        }

        // Check if user has direct factory purchasing/approval permissions
        if (
            user.canManageZanjanPurchasing || 
            user.canExecuteBuyerZanjan || 
            user.canApproveFactory || 
            user.canApproveFactoryDecision || 
            user.canApproveFactoryFinal
        ) {
            return true;
        }

        // Check if user is in Zanjan allowed or purchasing user IDs
        if (
            (settings?.purchaseZanjanAllowedUserIds || []).includes(user.id) ||
            (settings?.purchaseZanjanPurchasingUserIds || []).includes(user.id) ||
            (settings?.purchaseZanjanManagerApproverUserIds || []).includes(user.id) ||
            (settings?.purchaseZanjanBuyerUserIds || []).includes(user.id)
        ) {
            return true;
        }
    }

    // 4. Tehran Purchase condition:
    const isTehranScope = !request || request.location === 'Tehran' || 
        (typeof request.status === 'string' && (
            request.status.includes('TEHRAN') || 
            request.status.includes('CEO') || 
            request.status.includes('COMMERCIAL')
        ));

    if (isTehranScope) {
        if (
            (settings?.purchaseTehranAllowedUserIds || []).includes(user.id) ||
            (settings?.purchaseTehranProformaUserIds || []).includes(user.id) ||
            (settings?.purchaseTehranCeoApproverUserIds || []).includes(user.id) ||
            (settings?.purchaseTehranCommercialApproverUserIds || []).includes(user.id) ||
            (settings?.purchaseTehranSelectionUserIds || []).includes(user.id)
        ) {
            return true;
        }
        if (user.canManageProformas || user.canSelectProforma || user.canApproveCommercialManager || user.canApproveCEO) {
            return true;
        }
    }

    // All others: strictly restricted (proformas are confidential)
    return false;
};

export const normalizePurchaseStatus = (status: any): PurchaseRequestStatus | string => {
    if (!status) return '';
    const s = String(status).trim();
    if (
        s === PurchaseRequestStatus.PENDING_SHIFT_LEADER ||
        s === 'در انتظار تایید سرپرست خط' ||
        s === 'در انتظار تایید سرشیفت' ||
        s === 'در انتظار تایید سرپرست' ||
        s === 'PENDING_SHIFT_LEADER'
    ) {
        return PurchaseRequestStatus.PENDING_SHIFT_LEADER;
    }
    if (
        s === PurchaseRequestStatus.PENDING_TECHNICAL ||
        s === 'در انتظار تایید فنی واحد نت' ||
        s === 'در انتظار بررسی واحد نت/تعمیرات' ||
        s === 'در انتظار تایید فنی نت' ||
        s === 'PENDING_TECHNICAL'
    ) {
        return PurchaseRequestStatus.PENDING_TECHNICAL;
    }
    if (
        s === PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER ||
        s === 'در انتظار بررسی انباردار کارخانه' ||
        s === 'در انتظار بررسی موجودی انباردار کارخانه' ||
        s === 'در انتظار بررسی موجودی انبار (سرشیفت)' ||
        s === 'در انتظار بررسی انباردار' ||
        s === 'در انتظار بررسی موجودی' ||
        s === 'در انتظار مدیر کارخانه' ||
        s === 'PENDING_WAREHOUSE_KEEPER' ||
        s === 'PENDING_FACTORY'
    ) {
        return PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER;
    }
    if (
        s === PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION ||
        s === 'در انتظار تعیین مسیر خرید (مدیر کارخانه)' ||
        s === 'در انتظار تصمیم مدیر کارخانه (تعیین مسیر خرید)' ||
        s === 'PENDING_COMMERCIAL_DECISION' ||
        s === 'PENDING_FACTORY_DECISION'
    ) {
        return PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION;
    }
    return s;
};

export const checkPurchasePermission = (
    user: User,
    permKey: string,
    settings?: SystemSettings | null,
    request?: PurchaseRequest | null
): boolean => {
    if (!user) return false;

    // 1. Admin always has full access across the system
    const isAdmin = user.role === UserRole.ADMIN || (user.roles && user.roles.includes(UserRole.ADMIN));
    if (isAdmin) return true;

    // 2. Direct user-level boolean permission explicitly configured on user object (highest individual priority)
    const directUserVal = (user as any)[permKey] ?? (user as any).permissions?.[permKey] ?? (user as any).rolePermissions?.[permKey];
    if (directUserVal === false) return false; // Explicit user revocation
    if (directUserVal === true) return true;  // Explicit user grant

    if (permKey === 'canCreate' && (user.canCreatePurchaseRequest === false || (user as any).canCreate === false)) return false;
    if (permKey === 'canCreate' && (user.canCreatePurchaseRequest === true || (user as any).canCreate === true)) return true;

    if (permKey === 'canView' && (user.canManagePurchase === false || (user as any).canView === false)) return false;
    if (permKey === 'canView' && (user.canManagePurchase === true || (user as any).canView === true)) return true;

    // Check specific approver user lists configured in SystemSettings
    if (permKey === 'canApproveWarehouseKeeper' && (settings?.purchaseWarehouseApproverUserIds || []).includes(user.id)) return true;
    if (permKey === 'canApproveShiftLeader' && (settings?.purchaseLineSupervisorApproverUserIds || []).includes(user.id)) return true;
    if (permKey === 'canApproveTechnical' && (settings?.purchaseTechnicalApproverUserIds || []).includes(user.id)) return true;

    // Collect all role identifiers for this user
    const rolesList: string[] = [];
    if (user.role) {
        rolesList.push(String(user.role));
        rolesList.push(String(user.role).toLowerCase());
    }
    if (user.roles && Array.isArray(user.roles)) {
        user.roles.forEach(r => {
            if (r) {
                rolesList.push(String(r));
                rolesList.push(String(r).toLowerCase());
            }
        });
    }

    if (settings?.customRoles && Array.isArray(settings.customRoles)) {
        settings.customRoles.forEach(cr => {
            const matchesId = rolesList.some(r => r.toLowerCase() === cr.id.toLowerCase());
            const matchesLabel = rolesList.some(r => r.toLowerCase() === cr.label?.toLowerCase() || (cr.name && r.toLowerCase() === cr.name.toLowerCase()));
            if (matchesId || matchesLabel) {
                if (!rolesList.includes(cr.id)) rolesList.push(cr.id);
                if (!rolesList.includes(cr.id.toLowerCase())) rolesList.push(cr.id.toLowerCase());
                if (cr.label && !rolesList.includes(cr.label.toLowerCase())) rolesList.push(cr.label.toLowerCase());
                if (cr.name && !rolesList.includes(cr.name.toLowerCase())) rolesList.push(cr.name.toLowerCase());
            }
        });
    }

    // 3. Settings Configured Role Permissions (strictly respects toggles in Settings)
    let hasRoleConfiguredInSettings = false;
    let isExplicitlyGrantedInSettings = false;
    let isExplicitlyDeniedInSettings = false;

    for (const r of rolesList) {
        const pPerms = settings?.purchaseRolePermissions?.[r] || 
            (settings?.purchaseRolePermissions ? Object.entries(settings.purchaseRolePermissions).find(([k]) => k.toLowerCase() === r.toLowerCase())?.[1] : undefined);
        const gPerms = settings?.rolePermissions?.[r] ||
            (settings?.rolePermissions ? Object.entries(settings.rolePermissions).find(([k]) => k.toLowerCase() === r.toLowerCase())?.[1] : undefined);

        if (pPerms && (pPerms as any)[permKey] !== undefined) {
            hasRoleConfiguredInSettings = true;
            if ((pPerms as any)[permKey] === true) isExplicitlyGrantedInSettings = true;
            if ((pPerms as any)[permKey] === false) isExplicitlyDeniedInSettings = true;
        }

        if (gPerms && (gPerms as any)[permKey] !== undefined) {
            hasRoleConfiguredInSettings = true;
            if ((gPerms as any)[permKey] === true) isExplicitlyGrantedInSettings = true;
            if ((gPerms as any)[permKey] === false) isExplicitlyDeniedInSettings = true;
        }
    }

    if (isExplicitlyGrantedInSettings) return true;
    if (isExplicitlyDeniedInSettings) return false;

    // 4. Default Fallbacks (apply ONLY for general view/create, NEVER auto-grant approval permissions without ticks!)
    const checkRoleMatch = (snippet: string) => {
        const target = snippet.toLowerCase();
        return rolesList.some(r => r.includes(target));
    };

    switch (permKey) {
        case 'canView':
        case 'canCreate':
            if (checkRoleMatch('warehouse') || checkRoleMatch('انبار') || checkRoleMatch('factory') || checkRoleMatch('کارخانه') || checkRoleMatch('shift') || checkRoleMatch('سرشیفت')) return true;
            break;

        case 'scopeTehranOnly':
            if (user.scopeTehranOnly || user.purchaseScope === 'TEHRAN_ONLY') return true;
            break;

        case 'scopeZanjanOnly':
            if (user.scopeZanjanOnly || user.purchaseScope === 'ZANJAN_ONLY') return true;
            break;

        case 'canViewPricingAndInvoices':
            if (checkRoleMatch('ceo') || checkRoleMatch('commercial') || checkRoleMatch('financial') || checkRoleMatch('مدیرعامل') || checkRoleMatch('بازرگانی')) return true;
            break;
    }

    // All approval permissions strictly require a tick in settings or user permissions!
    return false;
};

export const canUserAccessTehranBranch = (user: User, settings?: SystemSettings | null): boolean => {
    if (!user) return false;
    const isAdmin = user.role === UserRole.ADMIN || (user.roles && user.roles.includes(UserRole.ADMIN));
    if (isAdmin) return true;
    if (user.scopeZanjanOnly || user.purchaseScope === 'ZANJAN_ONLY') return false;
    if (user.scopeTehranOnly || user.purchaseScope === 'TEHRAN_ONLY') return true;

    if (
        checkPurchasePermission(user, 'canApproveCEO', settings) ||
        checkPurchasePermission(user, 'canApproveCommercialManager', settings) ||
        checkPurchasePermission(user, 'canManageProformas', settings) ||
        checkPurchasePermission(user, 'canSelectProforma', settings) ||
        checkPurchasePermission(user, 'canCommercialFinalize', settings) ||
        checkPurchasePermission(user, 'canViewPricingAndInvoices', settings)
    ) return true;

    const rolesList: string[] = [];
    if (user.role) rolesList.push(String(user.role).toLowerCase());
    if (user.roles && Array.isArray(user.roles)) {
        user.roles.forEach(r => r && rolesList.push(String(r).toLowerCase()));
    }
    const checkRoleMatch = (snippet: string) => rolesList.some(r => r.includes(snippet.toLowerCase()));

    if (checkRoleMatch('ceo') || checkRoleMatch('مدیرعامل') || checkRoleMatch('commercial') || checkRoleMatch('بازرگانی') || checkRoleMatch('financial') || checkRoleMatch('مالی')) return true;
    if ((settings?.purchaseTehranAllowedUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseTehranCeoApproverUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseTehranCommercialApproverUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseTehranProformaUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseTehranSelectionUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseTehranFinalUserIds || []).includes(user.id)) return true;

    if (user.canApproveCEO || user.canApproveCommercialManager || user.canManageProformas || user.canSelectProforma || user.canCommercialFinalize) return true;

    return false;
};

export const canUserAccessZanjanBranch = (user: User, settings?: SystemSettings | null): boolean => {
    if (!user) return false;
    const isAdmin = user.role === UserRole.ADMIN || (user.roles && user.roles.includes(UserRole.ADMIN));
    if (isAdmin) return true;
    if (user.scopeTehranOnly || user.purchaseScope === 'TEHRAN_ONLY') return false;
    if (user.scopeZanjanOnly || user.purchaseScope === 'ZANJAN_ONLY') return true;

    // Check if user has ANY factory or common purchase permissions
    if (
        checkPurchasePermission(user, 'canApproveFactoryDecision', settings) ||
        checkPurchasePermission(user, 'canManageZanjanPurchasing', settings) ||
        checkPurchasePermission(user, 'canApproveFactory', settings) ||
        checkPurchasePermission(user, 'canExecuteBuyerZanjan', settings) ||
        checkPurchasePermission(user, 'canApproveFactoryFinal', settings) ||
        checkPurchasePermission(user, 'canApproveWarehouseKeeper', settings) ||
        checkPurchasePermission(user, 'canWarehouseFinalize', settings) ||
        checkPurchasePermission(user, 'canApproveTechnical', settings) ||
        checkPurchasePermission(user, 'canApproveShiftLeader', settings) ||
        checkPurchasePermission(user, 'canCheckQC', settings) ||
        checkPurchasePermission(user, 'canRegisterEntry', settings) ||
        checkPurchasePermission(user, 'canManageParts', settings) ||
        checkPurchasePermission(user, 'canManagePurchase', settings) ||
        checkPurchasePermission(user, 'canCreate', settings) ||
        checkPurchasePermission(user, 'canView', settings)
    ) return true;

    const rolesList: string[] = [];
    if (user.role) rolesList.push(String(user.role).toLowerCase());
    if (user.roles && Array.isArray(user.roles)) {
        user.roles.forEach(r => r && rolesList.push(String(r).toLowerCase()));
    }
    const checkRoleMatch = (snippet: string) => rolesList.some(r => r.includes(snippet.toLowerCase()));

    // Any Factory role (Factory Manager, Purchasing, Warehouse, Technical, Shift Leader, QC, Guard) belongs to Factory/Zanjan
    if (
        checkRoleMatch('factory') || checkRoleMatch('کارخانه') ||
        checkRoleMatch('warehouse') || checkRoleMatch('انبار') ||
        checkRoleMatch('purchasing') || checkRoleMatch('کارپرداز') || checkRoleMatch('خرید') ||
        checkRoleMatch('technical') || checkRoleMatch('فنی') || checkRoleMatch('نت') ||
        checkRoleMatch('shift') || checkRoleMatch('سرشیفت') ||
        checkRoleMatch('qc') || checkRoleMatch('کنترل کیفی') ||
        checkRoleMatch('security') || checkRoleMatch('انتظامات')
    ) return true;

    if ((settings?.purchaseZanjanAllowedUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseZanjanDecisionApproverUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseZanjanPurchasingUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseZanjanManagerApproverUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseZanjanBuyerUserIds || []).includes(user.id)) return true;
    if ((settings?.purchaseZanjanFinalApproverUserIds || []).includes(user.id)) return true;

    if (
        user.canApproveFactoryDecision || user.canManageZanjanPurchasing || 
        user.canApproveFactory || user.canExecuteBuyerZanjan || 
        user.canApproveFactoryFinal || user.canApproveWarehouseKeeper || 
        user.canWarehouseFinalize || user.canApproveTechnical || 
        user.canApproveShiftLeader || user.canCheckQC || 
        user.canRegisterEntry || user.canManageParts || user.canManagePurchase ||
        user.canCreatePurchaseRequest
    ) return true;

    return false;
};

const PurchaseModule: React.FC<{ currentUser: User, settings?: SystemSettings, initialTab?: 'DASHBOARD' | 'REQUESTS' | 'RECEIPTS' | 'PARTS' | 'KARDEX' | 'ARCHIVE' }> = ({ currentUser, settings, initialTab = 'REQUESTS' }) => {
    const isMobile = useIsMobile();
    const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'REQUESTS' | 'RECEIPTS' | 'PARTS' | 'KARDEX' | 'ARCHIVE'>(initialTab);
    const [loading, setLoading] = useState(false);
    
    const perms = React.useMemo(() => {
        return getRolePermissions(currentUser.role, settings || null, currentUser);
    }, [currentUser, settings]);
    
    // Requests State - Initialize from cache for instant 0ms rendering
    const [requests, setRequests] = useState<PurchaseRequest[]>(() => {
        try {
            const cached = getLocalData<PurchaseRequest[]>(LS_KEYS.PURCHASE_REQS, []);
            const arr = Array.isArray(cached) ? cached : [];
            const sanitized = arr.map(r => {
                if (r.status === 'در انتظار تصمیم بازرگانی (محل خرید)' as any) {
                    return { ...r, status: PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION };
                }
                return r;
            });
            return sanitized.sort((a, b) => b.createdAt - a.createdAt);
        } catch {
            return [];
        }
    });
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [requestSearch, setRequestSearch] = useState('');
    const [viewRequest, setViewRequest] = useState<PurchaseRequest | null>(null);
    const [initialModalTab, setInitialModalTab] = useState<'DETAILS' | 'COMMENTS'>('DETAILS');
    const [pendingDeepLink, setPendingDeepLink] = useState<{ requestId: string; subTab?: 'DETAILS' | 'COMMENTS' } | null>(null);

    // Parts State - Initialize from cache for instant 0ms rendering
    const [parts, setParts] = useState<PartMasterData[]>(() => {
        try {
            const cached = getLocalData<PartMasterData[]>('app_data_parts', []);
            return Array.isArray(cached) ? cached : [];
        } catch {
            return [];
        }
    });
    const [showPartModal, setShowPartModal] = useState(false);
    const [partSearch, setPartSearch] = useState('');
    const [editingPart, setEditingPart] = useState<PartMasterData | null>(null);

    // Kardex State
    const [selectedPartKardex, setSelectedPartKardex] = useState<PartMasterData | null>(null);
    const [kardexEntries, setKardexEntries] = useState<PartKardex[]>([]);

    useEffect(() => {
        loadRequests();
        loadParts();
    }, []);

    // Listen for notification deep-links to open a specific PurchaseRequest and its COMMENTS tab
    useEffect(() => {
        const checkPendingDeepLink = () => {
            try {
                const raw = sessionStorage.getItem('pending_purchase_deep_link');
                if (raw) {
                    sessionStorage.removeItem('pending_purchase_deep_link');
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.requestId) {
                        setPendingDeepLink({
                            requestId: String(parsed.requestId),
                            subTab: parsed.subTab === 'comments' || parsed.subTab === 'COMMENTS' ? 'COMMENTS' : 'DETAILS'
                        });
                    }
                }
            } catch {}

            try {
                const params = new URLSearchParams(window.location.search);
                const reqId = params.get('requestId');
                const subTab = params.get('subTab');
                if (reqId) {
                    setPendingDeepLink({
                        requestId: reqId,
                        subTab: subTab?.toLowerCase() === 'comments' ? 'COMMENTS' : 'DETAILS'
                    });
                }
            } catch {}
        };

        checkPendingDeepLink();

        const handleOpenPurchaseDetails = (e: any) => {
            const detail = e?.detail;
            if (detail && detail.requestId) {
                setPendingDeepLink({
                    requestId: String(detail.requestId),
                    subTab: detail.subTab === 'comments' || detail.subTab === 'COMMENTS' ? 'COMMENTS' : 'DETAILS'
                });
            }
        };

        window.addEventListener('OPEN_PURCHASE_REQUEST_DETAILS', handleOpenPurchaseDetails);
        return () => window.removeEventListener('OPEN_PURCHASE_REQUEST_DETAILS', handleOpenPurchaseDetails);
    }, []);

    useEffect(() => {
        if (!pendingDeepLink || requests.length === 0) return;
        const found = requests.find(
            r => String(r.id) === String(pendingDeepLink.requestId) || String(r.requestNumber) === String(pendingDeepLink.requestId)
        );
        if (found) {
            if (found.status === PurchaseRequestStatus.COMPLETED || found.status === PurchaseRequestStatus.REJECTED) {
                setActiveTab('ARCHIVE');
            } else {
                setActiveTab('REQUESTS');
            }
            setInitialModalTab(pendingDeepLink.subTab || 'COMMENTS');
            setViewRequest(found);
            setPendingDeepLink(null);
        }
    }, [pendingDeepLink, requests]);

    useEffect(() => {
        if (viewRequest || editingPart || selectedPartKardex || showCreateModal || showPartModal) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            const mainScroll = document.getElementById('main-scroll-container');
            if (mainScroll) {
                mainScroll.scrollTo({ top: 0, behavior: 'instant' });
            }

            const handleBack = () => {
                if (viewRequest) setViewRequest(null);
                if (editingPart) setEditingPart(null);
                if (selectedPartKardex) setSelectedPartKardex(null);
                if (showCreateModal) setShowCreateModal(false);
                if (showPartModal) setShowPartModal(false);
            };
            window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: handleBack }));
        } else if (activeTab !== 'DASHBOARD') {
            const handleBack = () => {
                setActiveTab('DASHBOARD');
            };
            window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: handleBack }));
        } else {
            window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION'));
        }
        return () => { window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION')); };
    }, [viewRequest, editingPart, selectedPartKardex, showCreateModal, showPartModal, activeTab]);

    const loadRequests = async () => {
        if (requests.length === 0) {
            setLoading(true);
        }
        try {
            const data = await getPurchaseRequests();
            const arr = Array.isArray(data) ? data : [];
            const sanitized = arr.map(r => {
                if (r.status === 'در انتظار تصمیم بازرگانی (محل خرید)' as any) {
                    return { ...r, status: PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION };
                }
                return r;
            });
            setRequests(sanitized.sort((a, b) => b.createdAt - a.createdAt));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const loadParts = async () => {
        try {
            const data = await getPartMasterData();
            if (Array.isArray(data) && data.length > 0) {
                setParts(data);
            } else {
                // Auto-sync factory parts from Sayan if local catalog is empty
                try {
                    const syncRes = await syncSayanFactoryParts(60);
                    if (syncRes && syncRes.parts && syncRes.parts.length > 0) {
                        setParts(syncRes.parts);
                        return;
                    }
                } catch {}
                setParts(data || []);
            }
        } catch (e) { console.error(e); }
    };

    const loadKardex = async (partId: string) => {
        try {
            const data = await getPartKardex(partId);
            setKardexEntries(data);
        } catch (e) { console.error(e); }
    };

    const hasPurchasePerm = (perm: string) => {
        return checkPurchasePermission(currentUser, perm, settings);
    };

    // Components for each tab will go here
    return (
        <div className="space-y-3 sm:space-y-6 pb-20 animate-fade-in">
            <div className="flex flex-col gap-2.5 sm:gap-4">
                <div className="flex flex-wrap justify-between items-center glass-panel px-3.5 py-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 gap-2">
                    <h1 className="text-base sm:text-xl font-black text-gray-800 flex items-center gap-2">
                        <ShoppingCart size={20} className="text-indigo-600 shrink-0"/> مدیریت خرید و کالا
                    </h1>
                </div>
                
                <div className="grid grid-cols-3 md:flex p-1 bg-gray-200/90 dark:bg-gray-800 rounded-xl gap-1">
                    <button 
                        onClick={() => setActiveTab('DASHBOARD')} 
                        className={`md:flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${activeTab === 'DASHBOARD' ? 'glass-panel bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-sm font-black' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                        داشبورد کارتابل
                    </button>
                    <button 
                        onClick={() => setActiveTab('REQUESTS')} 
                        className={`md:flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${activeTab === 'REQUESTS' ? 'glass-panel bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-sm font-black' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                        درخواست‌های فعال
                    </button>
                    <button 
                        onClick={() => setActiveTab('RECEIPTS')} 
                        className={`md:flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${activeTab === 'RECEIPTS' ? 'glass-panel bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-sm font-black' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                        رسیدهای انبار
                    </button>
                    <button 
                        onClick={() => setActiveTab('PARTS')} 
                        className={`md:flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${activeTab === 'PARTS' ? 'glass-panel bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-sm font-black' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                        کدینگ کالا
                    </button>
                    <button 
                        onClick={() => setActiveTab('KARDEX')} 
                        className={`md:flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${activeTab === 'KARDEX' ? 'glass-panel bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-sm font-black' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                        کاردکس موجودی
                    </button>
                    <button 
                        onClick={() => setActiveTab('ARCHIVE')} 
                        className={`md:flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${activeTab === 'ARCHIVE' ? 'glass-panel bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-sm font-black' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                        بایگانی نهایی
                    </button>
                </div>
            </div>

            <div className="w-full">
                {activeTab === 'DASHBOARD' && (
                    <PurchaseDashboard 
                        requests={requests} 
                        setActiveTab={setActiveTab} 
                        currentUser={currentUser}
                        settings={settings}
                    />
                )}
                {activeTab === 'REQUESTS' && (
                    <PurchaseRequestsTab 
                        requests={requests.filter(r => r.status !== PurchaseRequestStatus.COMPLETED && r.status !== PurchaseRequestStatus.REJECTED)} 
                        currentUser={currentUser} 
                        onRequestUpdate={loadRequests} 
                        parts={parts}
                        settings={settings}
                    />
                )}
                {activeTab === 'RECEIPTS' && (
                    <WarehouseReceiptsTab 
                        requests={requests} 
                        currentUser={currentUser} 
                        onRequestUpdate={loadRequests} 
                        parts={parts}
                        settings={settings}
                    />
                )}
                {activeTab === 'ARCHIVE' && (
                    <PurchaseRequestsTab 
                        requests={requests.filter(r => r.status === PurchaseRequestStatus.COMPLETED || r.status === PurchaseRequestStatus.REJECTED)} 
                        currentUser={currentUser} 
                        onRequestUpdate={loadRequests} 
                        parts={parts}
                        isArchive={true}
                        settings={settings}
                    />
                )}
                {activeTab === 'PARTS' && (
                    <PartsTab 
                        parts={parts} 
                        currentUser={currentUser} 
                        onPartUpdate={loadParts}
                        settings={settings}
                    />
                )}
                {activeTab === 'KARDEX' && (
                   <KardexTab 
                        parts={parts} 
                        selectedPart={selectedPartKardex} 
                        setSelectedPart={setSelectedPartKardex}
                        kardexEntries={kardexEntries}
                        loadKardex={loadKardex}
                        onPartUpdate={loadParts}
                   />
                )}
            </div>

            {/* Subtab Back Trigger */}
            {activeTab !== 'DASHBOARD' && (
                <button 
                    data-subtab-back="true" 
                    onClick={() => setActiveTab('DASHBOARD')} 
                    className="hidden"
                />
            )}

            {/* Deep-linked Purchase Request Modal (e.g. from Comment Notification) */}
            {viewRequest && (
                <ViewRequestModal
                    request={requests.find(r => r.id === viewRequest.id) || viewRequest}
                    onClose={() => {
                        setViewRequest(null);
                        setInitialModalTab('DETAILS');
                    }}
                    currentUser={currentUser}
                    onSuccess={loadRequests}
                    settings={settings}
                    parts={parts}
                    initialTab={initialModalTab}
                />
            )}
        </div>
    );
};

// --- BPMN WORKFLOW DIAGRAM COMPONENT ---
const BpmnWorkflowDiagram: React.FC<{ currentStatus?: PurchaseRequestStatus; location?: string; request?: PurchaseRequest }> = ({ currentStatus, location, request }) => {
    const isStepActive = (status: PurchaseRequestStatus) => {
        const normActual = normalizePurchaseStatus(currentStatus);
        const normTarget = normalizePurchaseStatus(status);
        return normActual === normTarget;
    };

    // Grouping steps into logical phases to be extremely precise and compact
    const phases = [
        {
            title: '۱. ثبت و بررسی‌های اولیه کارخانه',
            steps: [
                { status: PurchaseRequestStatus.PENDING_SHIFT_LEADER, title: request?.shiftLeader ? `تایید سرشیفت (${request.shiftLeader})` : 'تایید سرپرست خط', role: 'سرپرست خط / سرشیفت' },
                { status: PurchaseRequestStatus.PENDING_TECHNICAL, title: 'تایید فنی و نت', role: 'واحد نت' },
                { status: PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER, title: 'بررسی موجودی انبار', role: 'انباردار قطعات' },
                { status: PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION, title: 'تعیین مسیر تامین', role: 'مدیر کارخانه' },
            ]
        },
        {
            title: location === 'Tehran' ? '۲. شعبه تهران (بازرگانی مرکزی)' : '۲. تامین محلی (زنجان/کارخانه)',
            isBranch: true,
            steps: location === 'Tehran' ? [
                { status: PurchaseRequestStatus.PENDING_CEO_INITIAL, title: 'مجوز استعلام', role: 'مدیرعامل' },
                { status: PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA, title: 'ثبت پروفرما', role: 'بازرگانی تهران' },
                { status: PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER, title: 'بررسی بازرگانی', role: 'مدیر بازرگانی' },
                { status: PurchaseRequestStatus.PENDING_CEO_SELECTION, title: 'انتخاب نهایی', role: 'مدیرعامل' },
            ] : [
                { status: PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING, title: 'پیشنهاد خرید', role: 'خرید زنجان' },
                { status: PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL, title: 'دستور خرید', role: 'مدیر کارخانه' },
                { status: PurchaseRequestStatus.PENDING_BUYER_EXECUTION, title: 'اجرای خرید', role: 'کارپرداز' },
            ]
        },
        {
            title: '۳. تحویل و ثبت نهایی کارخانه',
            steps: [
                { status: PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL, title: 'تایید فنی و کیفی', role: 'نت / QC' },
                { status: PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL, title: 'تایید ورود', role: 'مدیر کارخانه' },
                { status: PurchaseRequestStatus.PENDING_SECURITY_ENTRY, title: 'ورود انتظامات', role: 'انتظامات' },
                { status: PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT, title: 'رسید انبار', role: 'انباردار' },
                { status: PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN, title: 'تایید نهایی و امضا', role: 'مدیر کارخانه' },
                { status: PurchaseRequestStatus.COMPLETED, title: 'بایگانی شده', role: 'سیستم' },
            ]
        }
    ];

    return (
        <div className="bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm text-right dir-rtl">
            <div className="flex flex-wrap justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2 mb-3 gap-2">
                <div className="flex items-center gap-2">
                    <GitFork className="text-indigo-600 dark:text-indigo-400" size={14} />
                    <span className="text-xs font-black text-gray-800 dark:text-gray-200">رهگیری الکترونیک فرآیند خرید (BPMN Workflow Tracker)</span>
                </div>
                {request && (
                    <div className="flex items-center gap-3 text-[10px] bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 px-3 py-1 rounded-xl border border-indigo-100 dark:border-indigo-900">
                        <span>ثبت‌کننده: <strong className="font-black text-gray-900 dark:text-gray-100">{request.requester}</strong></span>
                        <span>|</span>
                        <span>سرشیفت: <strong className="font-black text-indigo-700 dark:text-indigo-300">{request.shiftLeader || 'ثبت نشده'}</strong></span>
                    </div>
                )}
                {currentStatus && (
                    <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 px-2 py-0.5 rounded-full text-[9px] font-black">
                        مرحله فعلی: {currentStatus}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {phases.map((phase, pIdx) => (
                    <div key={pIdx} className="space-y-2 bg-gray-50/50 dark:bg-gray-800/40 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                        <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 block border-b pb-1 border-gray-200 dark:border-gray-700">{phase.title}</span>
                        <div className="space-y-1.5">
                            {phase.steps.map((step, sIdx) => {
                                const active = isStepActive(step.status);
                                return (
                                    <div key={sIdx} className={`p-1.5 rounded-lg border flex items-center justify-between transition-all ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm scale-[1.01]' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
                                        <div className="flex items-center gap-1">
                                            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white animate-ping' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                                            <span className="text-[10px] font-bold">{step.title}</span>
                                        </div>
                                        <span className={`text-[8px] px-1 py-0.2 rounded font-black ${active ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'}`}>{step.role}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- DASHBOARD TAB ---
const PurchaseDashboard = ({ requests, setActiveTab, currentUser, settings }: any) => {
    const isRole = (roleName: string) => {
        if (currentUser.role === roleName) return true;
        if (currentUser.roles && currentUser.roles.includes(roleName)) return true;
        return false;
    };

    const isAdmin = isRole(UserRole.ADMIN);

    const perms = React.useMemo(() => {
        return getRolePermissions(currentUser.role, settings || null, currentUser);
    }, [currentUser, settings]);

    const hasPurchasePerm = (perm: string) => {
        return checkPurchasePermission(currentUser, perm, settings);
    };

    const ceoCount = requests.filter((r: any) => 
        r.status === PurchaseRequestStatus.PENDING_CEO_INITIAL || 
        r.status === PurchaseRequestStatus.PENDING_CEO_SELECTION
    ).length;

    const commercialCount = requests.filter((r: any) => 
        r.status === PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER || 
        r.status === PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA ||
        r.status === PurchaseRequestStatus.PENDING_TEHRAN_PURCHASING ||
        r.status === PurchaseRequestStatus.PENDING_BUYER_EXECUTION
    ).length;

    const tehranTotalCount = requests.filter((r: any) => 
        r.location === 'Tehran' || (typeof r.status === 'string' && (r.status.includes('TEHRAN') || r.status.includes('CEO') || r.status.includes('COMMERCIAL')))
    ).length;

    const zanjanTotalCount = requests.filter((r: any) => 
        r.location === 'Factory' || r.location === 'Zanjan' || (typeof r.status === 'string' && (r.status.includes('FACTORY') || r.status.includes('ZANJAN')))
    ).length;

    const stats = [
        { label: 'کل درخواست‌ها', count: requests.length, color: 'indigo', icon: ShoppingCart, tab: 'REQUESTS', bg: 'border-indigo-100 bg-indigo-50/30' },
        { label: '🏢 بازرگانی تهران', count: tehranTotalCount, color: 'sky', icon: Briefcase, tab: 'REQUESTS', bg: 'border-sky-300 bg-sky-50/70 text-sky-900', highlightIcon: 'bg-sky-500 text-white shadow-xs' },
        { label: '🏭 کارخانه زنجان', count: zanjanTotalCount, color: 'teal', icon: Warehouse, tab: 'REQUESTS', bg: 'border-teal-300 bg-teal-50/70 text-teal-900', highlightIcon: 'bg-teal-600 text-white shadow-xs' },
        { label: 'منتظر تایید مدیرعامل', count: ceoCount, color: 'sky', icon: Crown, tab: 'REQUESTS', bg: 'border-sky-200 bg-sky-50/40 text-sky-800', highlightIcon: 'bg-sky-100 text-sky-600' },
        { label: 'منتظر بررسی بازرگانی', count: commercialCount, color: 'purple', icon: Briefcase, tab: 'REQUESTS', bg: 'border-purple-200 bg-purple-50/40 text-purple-800', highlightIcon: 'bg-purple-100 text-purple-600' },
        { label: 'ورود و کنترل کیفی', count: requests.filter((r: any) => r.status === PurchaseRequestStatus.PENDING_SECURITY_ENTRY || r.status === PurchaseRequestStatus.PENDING_QC).length, color: 'orange', icon: Truck, tab: 'REQUESTS', bg: 'border-orange-100 bg-orange-50/30 text-orange-800', highlightIcon: 'bg-orange-100 text-orange-600' },
        { label: 'تکمیل و بایگانی شده', count: requests.filter((r: any) => r.status === PurchaseRequestStatus.COMPLETED).length, color: 'green', icon: CheckCircle, tab: 'ARCHIVE', bg: 'border-green-100 bg-green-50/30 text-green-800', highlightIcon: 'bg-green-100 text-green-600' }
    ];

    const myTasks = requests.filter((r: any) => {
        if (isAdmin) return r.status !== PurchaseRequestStatus.COMPLETED && r.status !== PurchaseRequestStatus.REJECTED;
        
        const normSt = normalizePurchaseStatus(r.status);
        switch (normSt) {
            case PurchaseRequestStatus.PENDING_SHIFT_LEADER: return hasPurchasePerm('canApproveShiftLeader');
            case PurchaseRequestStatus.PENDING_TECHNICAL: return hasPurchasePerm('canApproveTechnical');
            case PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER:
            case PurchaseRequestStatus.PENDING_FACTORY:
                return hasPurchasePerm('canApproveWarehouseKeeper') || hasPurchasePerm('canManageParts');
            case PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION:
            case PurchaseRequestStatus.PENDING_FACTORY_DECISION:
                return hasPurchasePerm('canApproveFactoryDecision') || hasPurchasePerm('canApproveFactory');
            
            case PurchaseRequestStatus.PENDING_TEHRAN_PURCHASING: 
            case PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA:
                return hasPurchasePerm('canManageProformas') && (r.location === 'Tehran' || !r.location);

            case PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER:
                return (hasPurchasePerm('canApproveCommercialManager') || hasPurchasePerm('canCommercialFinalize')) && (r.location === 'Tehran' || !r.location);
            
            case PurchaseRequestStatus.PENDING_CEO_INITIAL:
            case PurchaseRequestStatus.PENDING_CEO_SELECTION:
                return hasPurchasePerm('canApproveCEO') || hasPurchasePerm('canSelectProforma');
                
            case PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING:
            case PurchaseRequestStatus.PENDING_FACTORY_PURCHASING:
            case PurchaseRequestStatus.PENDING_FACTORY_PROFORMA:
                return hasPurchasePerm('canManageZanjanPurchasing') && (r.location === 'Factory' || r.location === 'Zanjan');
                
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL:
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_SELECTION:
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE:
            case PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL:
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN:
                return hasPurchasePerm('canApproveFactory') || hasPurchasePerm('canApproveFactoryFinal');

            case PurchaseRequestStatus.PENDING_BUYER_EXECUTION:
                return hasPurchasePerm('canExecuteBuyerZanjan') || hasPurchasePerm('canManageZanjanPurchasing');

            case PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL:
                return hasPurchasePerm('canApproveTechnical');
            
            case PurchaseRequestStatus.PENDING_SECURITY_ENTRY: return hasPurchasePerm('canRegisterEntry');
            case PurchaseRequestStatus.PENDING_QC: return hasPurchasePerm('canCheckQC');
            case PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT: return hasPurchasePerm('canWarehouseFinalize');
            
            default: return false;
        }
    });

    const getRoleBadgeForStatus = (status: PurchaseRequestStatus) => {
        switch (status) {
            case PurchaseRequestStatus.PENDING_CEO_INITIAL:
            case PurchaseRequestStatus.PENDING_CEO_SELECTION:
                return {
                    title: 'مدیرعامل',
                    icon: Crown,
                    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300'
                };
            case PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION:
            case PurchaseRequestStatus.PENDING_FACTORY_DECISION:
                return {
                    title: 'مدیر کارخانه (تعیین مسیر)',
                    icon: Warehouse,
                    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300'
                };
            case PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER:
            case PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA:
            case PurchaseRequestStatus.PENDING_TEHRAN_PURCHASING:
                return {
                    title: 'مدیر بازرگانی',
                    icon: Briefcase,
                    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300'
                };
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL:
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_SELECTION:
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE:
            case PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL:
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN:
                return {
                    title: 'مدیر کارخانه',
                    icon: Warehouse,
                    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300'
                };
            case PurchaseRequestStatus.PENDING_TECHNICAL:
            case PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL:
                return {
                    title: 'نت و فنی',
                    icon: Wrench,
                    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300'
                };
            case PurchaseRequestStatus.PENDING_QC:
                return {
                    title: 'کنترل کیفیت QC',
                    icon: ShieldCheck,
                    badgeClass: 'bg-green-100 text-green-800 border-green-300'
                };
            case PurchaseRequestStatus.PENDING_SECURITY_ENTRY:
                return {
                    title: 'انتظامات',
                    icon: Shield,
                    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300'
                };
            case PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER:
            case PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT:
                return {
                    title: 'انبار کارخانه',
                    icon: Package,
                    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300'
                };
            default:
                return null;
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
            {/* High-visibility role-separated stats tiles - Compact 2-col on mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
                {stats.map((s, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => setActiveTab(s.tab)} 
                        className={`glass-panel p-3 sm:p-5 rounded-2xl sm:rounded-[2rem] border-2 cursor-pointer active:scale-95 sm:hover:scale-105 transition-all text-center flex flex-col items-center justify-center gap-1.5 sm:gap-2 shadow-sm ${idx === stats.length - 1 && stats.length % 2 === 1 ? 'col-span-2 sm:col-span-1' : ''} ${s.bg || 'border-indigo-100 bg-indigo-50/30'}`}
                    >
                        <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl ${s.highlightIcon || 'bg-indigo-100 text-indigo-600'} shadow-sm`}>
                            <s.icon size={20} className="sm:hidden" />
                            <s.icon size={26} className="hidden sm:block" />
                        </div>
                        <div className="text-lg sm:text-2xl font-black text-gray-800 leading-none">{s.count}</div>
                        <div className="text-[10px] font-bold text-gray-600 leading-tight">{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="glass-panel p-3.5 sm:p-6 rounded-2xl sm:rounded-[2.5rem] border border-gray-100 bg-white shadow-sm mb-4 sm:mb-6">
                <div className="flex justify-between items-center border-b pb-3 sm:pb-4 mb-3 sm:mb-4">
                    <h3 className="text-sm sm:text-base font-black text-indigo-900 flex items-center gap-2">
                        <ClipboardCheck size={18} /> 
                        <span>کارتابل وظایف من</span>
                    </h3>
                    <span className="text-[11px] sm:text-xs bg-indigo-50 text-indigo-700 font-black px-2.5 py-1 rounded-full border border-indigo-100">
                        {myTasks.length} وظیفه اقدام‌نشده
                    </span>
                </div>

                {myTasks.length === 0 ? (
                    <div className="py-6 sm:py-8 text-center text-gray-300 italic text-xs">موردی جهت اقدام شما یافت نشد.</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                        {myTasks.slice(0, 9).map((req: any) => {
                            const roleInfo = getRoleBadgeForStatus(req.status);
                            const RoleIcon = roleInfo?.icon;

                            return (
                                <div key={req.id} onClick={() => setActiveTab('REQUESTS')} className="p-3 sm:p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/70 transition-all cursor-pointer group flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start mb-1.5 sm:mb-2">
                                            <span className="text-[9px] font-mono font-bold text-gray-400">#{req.requestNumber}</span>
                                            <div className="flex items-center gap-1.5">
                                                {roleInfo && (
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-xs ${roleInfo.badgeClass}`}>
                                                        {RoleIcon && <RoleIcon size={11} />}
                                                        {roleInfo.title}
                                                    </span>
                                                )}
                                                <span className="text-[9px] font-bold text-gray-500 bg-white px-2 py-0.5 rounded-full shadow-sm">{formatDate(req.date)}</span>
                                            </div>
                                        </div>
                                        <h4 className="font-black text-gray-800 text-xs sm:text-sm group-hover:text-indigo-700 transition-colors uppercase tracking-tight line-clamp-1">{req.itemName}</h4>
                                    </div>
                                    <div className="mt-2.5 pt-2 border-t border-gray-200/60 flex items-center justify-between">
                                        <span className="text-[10px] font-black text-indigo-600 truncate max-w-[200px]">{req.status}</span>
                                        <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-indigo-600 shadow-sm shrink-0"><ArrowRight size={14}/></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="glass-panel p-3.5 sm:p-6 rounded-2xl sm:rounded-[2.5rem] border border-gray-100 bg-gray-50 shadow-inner">
                <h3 className="text-sm sm:text-base font-black text-gray-700 border-b pb-3 sm:pb-4 mb-3 sm:mb-4 flex items-center gap-2"><ShoppingCart className="text-gray-400" size={18}/> درخواست‌های اخیراً ثبت شده من</h3>
                {requests.filter((r: any) => r.requester === currentUser.fullName).length === 0 ? (
                    <div className="py-6 sm:py-8 text-center text-gray-400 italic text-xs">شما هنوز درخواستی ثبت نکرده‌اید.</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                        {requests.filter((r: any) => r.requester === currentUser.fullName).slice(0, 3).map((req: any) => (
                            <div key={req.id} onClick={() => setActiveTab('REQUESTS')} className="p-3 sm:p-4 bg-white rounded-2xl border border-gray-200 hover:shadow-md transition-all cursor-pointer">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[8px] font-mono text-gray-400">{req.requestNumber}</span>
                                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded ${req.status === PurchaseRequestStatus.REJECTED ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                                        {req.status}
                                    </span>
                                </div>
                                <h4 className="font-black text-gray-800 text-xs line-clamp-1">{req.itemName}</h4>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- REQUESTS TAB ---
const PurchaseRequestsTab = ({ requests, currentUser, onRequestUpdate, parts, isArchive, settings }: any) => {
    const isAdmin = currentUser.role === UserRole.ADMIN || (currentUser.roles && currentUser.roles.includes(UserRole.ADMIN));
    const [searchTerm, setSearchTerm] = useState('');
    
    const hasPurchasePerm = (perm: string) => {
        return checkPurchasePermission(currentUser, perm, settings);
    };

    const isZanjanScopedUser = !isAdmin && (hasPurchasePerm('scopeZanjanOnly') || currentUser.purchaseScope === 'ZANJAN_ONLY' || (!canUserAccessTehranBranch(currentUser, settings) && canUserAccessZanjanBranch(currentUser, settings)));
    const isTehranScopedUser = !isAdmin && (hasPurchasePerm('scopeTehranOnly') || currentUser.purchaseScope === 'TEHRAN_ONLY' || (canUserAccessTehranBranch(currentUser, settings) && !canUserAccessZanjanBranch(currentUser, settings)));

    const [locationFilter, setLocationFilter] = useState<'ALL' | 'TEHRAN' | 'ZANJAN'>(() => {
        if (isZanjanScopedUser) return 'ZANJAN';
        if (isTehranScopedUser) return 'TEHRAN';
        return 'ALL';
    });
    const [showCreate, setShowCreate] = useState(false);
    const [viewingRequest, setViewingRequest] = useState<PurchaseRequest | null>(null);

    const isInitialPhaseRequest = (r: PurchaseRequest) => {
        const norm = normalizePurchaseStatus(r.status);
        return (
            norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_SHIFT_LEADER) ||
            norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_TECHNICAL) ||
            norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER) ||
            norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_WAREHOUSE_CHECK) ||
            norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY) ||
            norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION) ||
            norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_REPAIR_INSPECTION)
        );
    };

    const tehranCount = requests.filter((r: any) => isInitialPhaseRequest(r) || r.location === 'Tehran' || (typeof r.status === 'string' && (r.status.includes('TEHRAN') || r.status.includes('CEO') || r.status.includes('COMMERCIAL')))).length;
    const zanjanCount = requests.filter((r: any) => isInitialPhaseRequest(r) || r.location === 'Factory' || r.location === 'Zanjan' || (typeof r.status === 'string' && (r.status.includes('FACTORY') || r.status.includes('ZANJAN')))).length;

    const filtered = requests.filter((r: PurchaseRequest) => {
        const search = searchTerm.toLowerCase();
        const itemsText = (r.items || []).map(it => `${it.itemName || ''} ${it.specifications || ''} ${it.unit || ''}`).join(' ');
        const logsText = (r.auditLogs || []).map(l => `${l.action || ''} ${l.comment || ''} ${l.performedBy || ''}`).join(' ');
        
        const matchesSearch = 
            (r.itemName?.toLowerCase() || '').includes(search) || 
            (r.requestNumber?.toLowerCase() || '').includes(search) ||
            (r.requester?.toLowerCase() || '').includes(search) ||
            (r.specifications?.toLowerCase() || '').includes(search) ||
            (r.purchaseReason?.toLowerCase() || '').includes(search) ||
            (r.warehouseReceiptNumber?.toLowerCase() || '').includes(search) ||
            itemsText.toLowerCase().includes(search) ||
            logsText.toLowerCase().includes(search);

        if (!matchesSearch) return false;

        // Phase 1 requests (Registration, Shift Leader, Technical, Inventory Check, Route Decision)
        // MUST NOT be categorized / hidden by Tehran or Zanjan branch tabs!
        if (isInitialPhaseRequest(r)) {
            return true;
        }

        // Enforce user role hard scope restrictions for branch specific requests
        if (!isAdmin) {
            if (isZanjanScopedUser) {
                const isFactoryReq = r.location === 'Factory' || r.location === 'Zanjan' || 
                                     (typeof r.status === 'string' && (r.status.includes('FACTORY') || r.status.includes('ZANJAN') || r.status.includes('WAREHOUSE') || r.status.includes('SECURITY') || r.status.includes('QC')));
                if (!isFactoryReq) return false;
            } else if (isTehranScopedUser) {
                const isTehranReq = r.location === 'Tehran' || 
                                    (typeof r.status === 'string' && (r.status.includes('TEHRAN') || r.status.includes('CEO') || r.status.includes('COMMERCIAL')));
                if (!isTehranReq) return false;
            }
        }

        // Apply interactive location filter button for branch-specific requests
        if (locationFilter === 'TEHRAN') {
            const isTehran = r.location === 'Tehran' || (typeof r.status === 'string' && (r.status.includes('TEHRAN') || r.status.includes('CEO') || r.status.includes('COMMERCIAL')));
            if (!isTehran) return false;
        } else if (locationFilter === 'ZANJAN') {
            const isZanjan = r.location === 'Factory' || r.location === 'Zanjan' || (typeof r.status === 'string' && (r.status.includes('FACTORY') || r.status.includes('ZANJAN') || r.status.includes('BUYER')));
            if (!isZanjan) return false;
        }

        return true;
    });

    const canCreate = hasPurchasePerm('canCreate') || !!currentUser.canCreatePurchaseRequest || !!currentUser.canManagePurchase || currentUser.role === UserRole.WAREHOUSE_KEEPER;

    return (
        <div className="space-y-4">
            {/* Top Branch Selector Tabs & Search Bar */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                {/* Branch Switcher (Tehran vs Zanjan vs All) */}
                <div className="flex items-center p-1.5 bg-gray-200/70 dark:bg-gray-800 rounded-2xl gap-1.5 shrink-0 border border-gray-300 dark:border-gray-700 shadow-xs">
                    {!isZanjanScopedUser && !isTehranScopedUser && (
                        <button
                            onClick={() => setLocationFilter('ALL')}
                            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${locationFilter === 'ALL' ? 'bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 shadow-md font-black' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                        >
                            <span>همه شاخه‌ها</span>
                            <span className="text-[10px] bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded-full font-bold">{requests.length}</span>
                        </button>
                    )}
                    {!isZanjanScopedUser && (
                        <button
                            onClick={() => setLocationFilter('TEHRAN')}
                            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${locationFilter === 'TEHRAN' ? 'bg-sky-600 text-white shadow-md shadow-sky-500/30' : 'text-gray-600 dark:text-gray-300 hover:bg-sky-50 hover:text-sky-700'}`}
                            title="گردش کار و تاییدات بازرگانی تهران (مدیر بازرگانی و مدیرعامل)"
                        >
                            <Briefcase size={14} />
                            <span>🏢 بازرگانی تهران</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${locationFilter === 'TEHRAN' ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800'}`}>{tehranCount}</span>
                        </button>
                    )}
                    {!isTehranScopedUser && (
                        <button
                            onClick={() => setLocationFilter('ZANJAN')}
                            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${locationFilter === 'ZANJAN' ? 'bg-teal-600 text-white shadow-md shadow-teal-500/30' : 'text-gray-600 dark:text-gray-300 hover:bg-teal-50 hover:text-teal-700'}`}
                            title="گردش کار و تاییدات کارخانه زنجان (مدیران زنجان و کارپرداز)"
                        >
                            <Warehouse size={14} />
                            <span>🏭 کارخانه زنجان</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${locationFilter === 'ZANJAN' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800'}`}>{zanjanCount}</span>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-1 w-full">
                    <div className="relative flex-1 w-full">
                        <input className="w-full glass-panel border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 pr-10 text-xs md:text-sm outline-none focus:ring-2 focus:ring-indigo-100" placeholder="جستجو در کالا، شماره درخواست یا متقاضی..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <Search className="absolute right-3 top-3 text-gray-400" size={16}/>
                    </div>

                    {canCreate && !isArchive && (
                        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 px-5 rounded-xl shadow-md shadow-indigo-100 dark:shadow-none flex items-center justify-center gap-1.5 font-bold text-xs md:text-sm transition-all cursor-pointer shrink-0">
                            <Plus size={18}/> ثبت درخواست جدید
                        </button>
                    )}
                </div>
            </div>

            {/* Branch Context Info Banner */}
            {locationFilter === 'TEHRAN' && (
                <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 p-3 rounded-2xl flex items-center justify-between text-xs text-sky-900 dark:text-sky-200 shadow-2xs">
                    <div className="flex items-center gap-2">
                        <Briefcase size={16} className="text-sky-600 shrink-0" />
                        <span><strong>کارتابل بازرگانی تهران:</strong> بررسی و صدور پیش‌فاکتورها توسط بازرگانی تهران، تایید نهایی و انتخاب تامین‌کننده توسط مدیرعامل و مدیر بازرگانی تهران.</span>
                    </div>
                    <span className="text-[10px] bg-sky-200/60 dark:bg-sky-900/80 px-2 py-0.5 rounded-md font-bold shrink-0">{filtered.length} مورد</span>
                </div>
            )}
            {locationFilter === 'ZANJAN' && (
                <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 p-3 rounded-2xl flex items-center justify-between text-xs text-teal-900 dark:text-teal-200 shadow-2xs">
                    <div className="flex items-center gap-2">
                        <Warehouse size={16} className="text-teal-600 shrink-0" />
                        <span><strong>کارتابل کارخانه زنجان:</strong> فرآیند خرید محلی، استعلام قیمت توسط تدارکات زنجان و صدور دستور خرید و تاییدات توسط مدیران کارخانه زنجان.</span>
                    </div>
                    <span className="text-[10px] bg-teal-200/60 dark:bg-teal-900/80 px-2 py-0.5 rounded-md font-bold shrink-0">{filtered.length} مورد</span>
                </div>
            )}

            {filtered.length === 0 ? (
                <div className="glass-panel p-12 text-center border-2 border-dashed border-gray-200 rounded-[2.5rem]">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                        <ShoppingCart size={40} />
                    </div>
                    <h3 className="text-lg font-black text-gray-400">موردی یافت نشد</h3>
                    <p className="text-xs text-gray-300 mt-2">هیچ درخواست خریدی در این بخش وجود ندارد</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((req: PurchaseRequest) => (
                        <RequestCard key={req.id} req={req} currentUser={currentUser} settings={settings} onClick={() => setViewingRequest(req)} />
                    ))}
                </div>
            )}

            {showCreate && <CreateRequestModal onClose={() => setShowCreate(false)} currentUser={currentUser} onSuccess={onRequestUpdate} parts={parts} />}
            {viewingRequest && <ViewRequestModal request={requests.find((r: PurchaseRequest) => r.id === viewingRequest.id) || viewingRequest} onClose={() => setViewingRequest(null)} currentUser={currentUser} onSuccess={onRequestUpdate} settings={settings} parts={parts} />}
        </div>
    );
};

const RequestCard = ({ req, currentUser, onClick, settings }: { req: PurchaseRequest, currentUser: User, onClick: () => void, settings?: SystemSettings }) => {
    const isRole = (roleName: string) => {
        if (currentUser.role === roleName) return true;
        if (currentUser.roles && currentUser.roles.includes(roleName)) return true;
        return false;
    };

    const isAdmin = isRole(UserRole.ADMIN);

    const hasPurchasePerm = (perm: string) => {
        return checkPurchasePermission(currentUser, perm, settings, req);
    };

    const isMyTurn = (r: PurchaseRequest) => {
        if (r.status === PurchaseRequestStatus.COMPLETED || r.status === PurchaseRequestStatus.REJECTED) return false;
        if (isAdmin) return true;

        const isTehranReq = r.location === 'Tehran' || (typeof r.status === 'string' && (r.status.includes('TEHRAN') || r.status.includes('CEO') || r.status.includes('COMMERCIAL')));
        const isZanjanReq = r.location === 'Factory' || r.location === 'Zanjan' || (typeof r.status === 'string' && (r.status.includes('FACTORY') || r.status.includes('ZANJAN')));

        if (isTehranReq && !canUserAccessTehranBranch(currentUser, settings)) return false;
        if (isZanjanReq && !canUserAccessZanjanBranch(currentUser, settings)) return false;

        const normSt = normalizePurchaseStatus(r.status);
        switch (normSt) {
            case PurchaseRequestStatus.PENDING_SHIFT_LEADER: return hasPurchasePerm('canApproveShiftLeader');
            case PurchaseRequestStatus.PENDING_TECHNICAL: return hasPurchasePerm('canApproveTechnical');
            case PurchaseRequestStatus.PENDING_FACTORY:
            case PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER:
                return hasPurchasePerm('canApproveWarehouseKeeper') || hasPurchasePerm('canManageParts');
            case PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION:
            case PurchaseRequestStatus.PENDING_FACTORY_DECISION:
                return hasPurchasePerm('canApproveFactoryDecision') || hasPurchasePerm('canApproveFactory');
            
            // Tehran Commercial Branch Stages
            case PurchaseRequestStatus.PENDING_CEO_INITIAL:
                return hasPurchasePerm('canApproveCEO');
            case PurchaseRequestStatus.PENDING_TEHRAN_PURCHASING: 
            case PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA:
                return hasPurchasePerm('canManageProformas');
            case PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER:
                return hasPurchasePerm('canApproveCommercialManager') || hasPurchasePerm('canCommercialFinalize');
            case PurchaseRequestStatus.PENDING_CEO_SELECTION:
                return hasPurchasePerm('canSelectProforma') || hasPurchasePerm('canApproveCEO');
            
            // Zanjan Factory Branch Stages
            case PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING:
            case PurchaseRequestStatus.PENDING_FACTORY_PURCHASING:
            case PurchaseRequestStatus.PENDING_FACTORY_PROFORMA:
                return hasPurchasePerm('canManageZanjanPurchasing') || hasPurchasePerm('canManageProformas');
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL:
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_SELECTION:
                return hasPurchasePerm('canApproveFactory');
            case PurchaseRequestStatus.PENDING_BUYER_EXECUTION:
                return hasPurchasePerm('canExecuteBuyerZanjan') || hasPurchasePerm('canManageProformas');
            case PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL:
                return hasPurchasePerm('canApproveTechnical');
            case PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL:
                return hasPurchasePerm('canApproveFactory');
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE:
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN:
                return hasPurchasePerm('canApproveFactoryFinal') || hasPurchasePerm('canApproveFactory');

            // Common Stages
            case PurchaseRequestStatus.PENDING_SECURITY_ENTRY: return hasPurchasePerm('canRegisterEntry');
            case PurchaseRequestStatus.PENDING_QC: return hasPurchasePerm('canCheckQC');
            case PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT: return hasPurchasePerm('canWarehouseFinalize');
            default: return false;
        }
    };

    const getRoleBadgeForCard = (status: PurchaseRequestStatus) => {
        switch (status) {
            case PurchaseRequestStatus.PENDING_CEO_INITIAL:
            case PurchaseRequestStatus.PENDING_CEO_SELECTION:
                return { title: 'تایید مدیرعامل', icon: Crown, cls: 'bg-sky-100 text-sky-800 border-sky-200' };
            case PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION:
            case PurchaseRequestStatus.PENDING_FACTORY_DECISION:
                return { title: 'مدیر کارخانه (تعیین مسیر)', icon: Warehouse, cls: 'bg-amber-100 text-amber-800 border-amber-200' };
            case PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER:
                return { title: 'مدیر بازرگانی تهران', icon: Briefcase, cls: 'bg-purple-100 text-purple-800 border-purple-200' };
            case PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA:
            case PurchaseRequestStatus.PENDING_TEHRAN_PURCHASING:
                return { title: 'تدارکات بازرگانی تهران', icon: ShoppingBag, cls: 'bg-sky-100 text-sky-800 border-sky-200' };
            case PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING:
            case PurchaseRequestStatus.PENDING_FACTORY_PURCHASING:
                return { title: 'تدارکات زنجان', icon: ShoppingBag, cls: 'bg-teal-100 text-teal-800 border-teal-200' };
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL:
            case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_SELECTION:
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE:
            case PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL:
            case PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN:
                return { title: 'مدیر کارخانه زنجان', icon: Warehouse, cls: 'bg-teal-100 text-teal-800 border-teal-200' };
            case PurchaseRequestStatus.PENDING_BUYER_EXECUTION:
                return { title: 'کارپرداز زنجان', icon: ShoppingBag, cls: 'bg-amber-100 text-amber-800 border-amber-200' };
            case PurchaseRequestStatus.PENDING_TECHNICAL:
            case PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL:
                return { title: 'واحد نت / فنی', icon: Wrench, cls: 'bg-blue-100 text-blue-800 border-blue-200' };
            case PurchaseRequestStatus.PENDING_SHIFT_LEADER:
                return { title: 'سرشیفت کارخانه', icon: Users, cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
            case PurchaseRequestStatus.PENDING_QC:
                return { title: 'کنترل کیفیت QC', icon: ShieldCheck, cls: 'bg-green-100 text-green-800 border-green-200' };
            case PurchaseRequestStatus.PENDING_SECURITY_ENTRY:
                return { title: 'انتظامات', icon: Shield, cls: 'bg-orange-100 text-orange-800 border-orange-200' };
            case PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER:
            case PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT:
                return { title: 'انبار کارخانه', icon: Package, cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
            default:
                return null;
        }
    };

    const roleBadge = getRoleBadgeForCard(req.status);
    const CardRoleIcon = roleBadge?.icon;

    return (
        <div onClick={onClick} className={`glass-panel border rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md relative overflow-hidden flex flex-col justify-between ${isMyTurn(req) ? 'border-indigo-400 ring-1 ring-indigo-50' : 'border-gray-200'}`}>
            {isMyTurn(req) && <div className="absolute top-0 right-0 left-0 h-1 bg-indigo-500 animate-pulse"></div>}
            <div>
                <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-mono text-gray-400">#{req.requestNumber}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        req.status === PurchaseRequestStatus.COMPLETED ? 'bg-green-100 text-green-700' : 
                        req.status === PurchaseRequestStatus.REJECTED ? 'bg-red-100 text-red-700' : 
                        'bg-indigo-50 text-indigo-600'
                    }`}>
                        {req.status}
                    </span>
                </div>
                <h3 className="font-bold text-gray-800 text-base mb-1">{req.itemName}</h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span>📦 {req.quantity} {req.unit}</span>
                    <span>📅 {formatDate(req.date)}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                        (req.comments && req.comments.length > 0)
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                            : 'bg-gray-50 text-gray-400 border-gray-100 dark:bg-gray-800/60 dark:text-gray-500 dark:border-gray-700'
                    }`}>
                        <MessageSquare size={11} />
                        <span>{req.comments?.length || 0} نظر</span>
                    </span>
                </div>

                {/* Sayan Warehouse Inventory Status */}
                {(req.sayanStock !== undefined || req.sayanStockSummary || (req.items && req.items.some((it: any) => it.sayanStock !== undefined))) && (
                    <div className="mt-2.5 pt-2 border-t border-dashed border-gray-100 dark:border-gray-800">
                        {(() => {
                            const totalStock = req.sayanStock !== undefined
                                ? req.sayanStock
                                : (req.items || []).reduce((acc: number, it: any) => acc + (it.sayanStock || 0), 0);
                            const isAvail = totalStock > 0;
                            return (
                                <div className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center justify-between gap-1 ${
                                    isAvail 
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60' 
                                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                                }`}>
                                    <span className="flex items-center gap-1">
                                        <Package size={11} className={isAvail ? "text-emerald-600" : "text-amber-600"} />
                                        <span>موجودی انبار سایان:</span>
                                    </span>
                                    <span className="font-black font-mono">
                                        {isAvail ? `${totalStock.toLocaleString('fa-IR')} ${req.unit || 'عدد'} ✅` : 'عدم موجودی (۰) ⚠️'}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                )}
                {req.image && (
                    <div className="mt-3 rounded-lg overflow-hidden h-12 bg-gray-100 border">
                        <CachedImage src={req.image} className="w-full h-full object-cover" alt="part" referrerPolicy="no-referrer" />
                    </div>
                )}
            </div>
            {roleBadge && (
                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-xs ${roleBadge.cls}`}>
                        {CardRoleIcon && <CardRoleIcon size={11} />}
                        اقدام: {roleBadge.title}
                    </span>
                    {req.location === 'Tehran' || (typeof req.status === 'string' && (req.status.includes('TEHRAN') || req.status.includes('CEO') || req.status.includes('COMMERCIAL'))) ? (
                        <span className="text-[9px] font-black text-sky-700 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                            <Briefcase size={10} /> بازرگانی تهران
                        </span>
                    ) : req.location === 'Factory' || req.location === 'Zanjan' || (typeof req.status === 'string' && (req.status.includes('FACTORY') || req.status.includes('ZANJAN'))) ? (
                        <span className="text-[9px] font-black text-teal-700 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                            <Warehouse size={10} /> کارخانه زنجان
                        </span>
                    ) : (
                        <span className="text-[9px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md border border-gray-100">
                            در انتظار تعیین مسیر
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// --- MODALS ---
const CreateRequestModal = ({ onClose, currentUser, onSuccess, parts }: any) => {
    const [loading, setLoading] = useState(false);
    const [requesterName, setRequesterName] = useState(currentUser?.fullName || '');
    const [shiftLeader, setShiftLeader] = useState('');
    const [requestingUnit, setRequestingUnit] = useState('واحد نت و فنی');
    const [urgency, setUrgency] = useState<'عادی' | 'فوری' | 'اضطراری'>('عادی');
    const [targetBranch, setTargetBranch] = useState<'AUTO' | 'Tehran' | 'Factory'>(() => {
        if (currentUser.scopeTehranOnly || currentUser.purchaseScope === 'TEHRAN_ONLY') return 'Tehran';
        if (currentUser.scopeZanjanOnly || currentUser.purchaseScope === 'ZANJAN_ONLY') return 'Factory';
        return 'AUTO';
    });
    const [machinery, setMachinery] = useState('');
    const [installationLocation, setInstallationLocation] = useState('');
    const [breakdownDescription, setBreakdownDescription] = useState('');
    const [purchaseReason, setPurchaseReason] = useState('');
    const [repairRequestNumber, setRepairRequestNumber] = useState(() => {
        const shamsi = getCurrentShamsiDate();
        const randomNum = Math.floor(100 + Math.random() * 900);
        return `REPAIR-${shamsi.year}/${randomNum}`;
    });

    const [items, setItems] = useState<PurchaseRequestItem[]>([
        { id: generateUUID(), itemName: '', itemCode: '', suggestedBrand: '', quantity: 1, unit: 'عدد', specifications: '' }
    ]);

    const [attachments, setAttachments] = useState<PurchaseAttachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const [previewAttachment, setPreviewAttachment] = useState<{ url: string; fileName: string } | null>(null);

    // Live Sayan Part Matching & Warehouse Stock State
    const [sayanMatches, setSayanMatches] = useState<Record<string, { loading: boolean; matched: boolean; part?: any; stock?: number }>>({});
    const debounceTimers = React.useRef<Record<string, any>>({});

    const triggerSayanPartMatch = (rowId: string, name: string) => {
        const cleanName = (name || '').trim();
        if (!cleanName || cleanName.length < 2) {
            setSayanMatches(prev => ({ ...prev, [rowId]: { loading: false, matched: false, stock: 0 } }));
            return;
        }

        if (debounceTimers.current[rowId]) {
            clearTimeout(debounceTimers.current[rowId]);
        }

        setSayanMatches(prev => ({ ...prev, [rowId]: { loading: true, matched: false, stock: 0 } }));

        debounceTimers.current[rowId] = setTimeout(async () => {
            try {
                const res = await matchSayanPart(cleanName);
                setSayanMatches(prev => ({
                    ...prev,
                    [rowId]: {
                        loading: false,
                        matched: res.matched,
                        part: res.part,
                        stock: res.stock
                    }
                }));

                if (res.matched && res.part) {
                    setItems(prevItems => prevItems.map(it => {
                        if (it.id !== rowId) return it;
                        return {
                            ...it,
                            itemCode: it.itemCode || res.part.code || '',
                            unit: it.unit || res.part.unit || 'عدد',
                            sayanItemCode: res.part.code,
                            sayanMatchedItem: res.part.name,
                            sayanStock: res.stock,
                            warehouseStock: res.stock,
                            isAvailableInWarehouse: res.stock > 0,
                            sayanWarehouseName: res.part.warehouseName || 'انبار ملزومات و قطعات'
                        };
                    }));
                }
            } catch (err) {
                setSayanMatches(prev => ({ ...prev, [rowId]: { loading: false, matched: false, stock: 0 } }));
            }
        }, 350);
    };

    const handleAddItemRow = () => {
        setItems([...items, { id: generateUUID(), itemName: '', itemCode: '', suggestedBrand: '', quantity: 1, unit: 'عدد', specifications: '' }]);
    };

    const handleRemoveItemRow = (id: string) => {
        if (items.length <= 1) return;
        if (debounceTimers.current[id]) {
            clearTimeout(debounceTimers.current[id]);
            delete debounceTimers.current[id];
        }
        setSayanMatches(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        setItems(items.filter(it => it.id !== id));
    };

    const handleItemChange = (id: string, field: keyof PurchaseRequestItem, value: any) => {
        if (field === 'itemName') {
            triggerSayanPartMatch(id, String(value));
            if (parts && parts.length > 0) {
                const trimmedVal = String(value).trim().toLowerCase();
                const matchedPart = parts.find((p: any) => p.name.trim().toLowerCase() === trimmedVal);
                if (matchedPart) {
                    setItems(items.map(it => it.id === id ? {
                        ...it,
                        partId: matchedPart.id,
                        itemName: matchedPart.name,
                        itemCode: matchedPart.code || matchedPart.id.slice(0, 8),
                        unit: matchedPart.unit || 'عدد',
                        specifications: matchedPart.dimensions || '',
                    } : it));
                    return;
                }
            }
        }
        setItems(items.map(it => it.id === id ? { ...it, [field]: value } : it));
    };

    const handleSelectPart = (id: string, partId: string) => {
        const p = parts.find((pt: any) => pt.id === partId);
        if (!p) return;
        triggerSayanPartMatch(id, p.name);
        setItems(items.map(it => it.id === id ? {
            ...it,
            partId: p.id,
            itemName: p.name,
            itemCode: p.code || p.id.slice(0, 8),
            unit: p.unit || 'عدد',
            specifications: p.dimensions || ''
        } : it));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            const newAtts: PurchaseAttachment[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileType = file.name.endsWith('.pdf') ? 'PDF' :
                                file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'EXCEL' :
                                file.type.startsWith('image/') ? 'IMAGE' : 'WORD';
                
                const url = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                newAtts.push({
                    id: generateUUID(),
                    fileName: file.name,
                    fileType,
                    fileUrl: url,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: currentUser.fullName
                });
            }
            setAttachments([...attachments, ...newAtts]);
        } catch (err) {
            alert('خطا در بارگذاری فایل');
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const initialValidItems = items.filter(it => it.itemName.trim().length > 0);
        if (initialValidItems.length === 0) return alert('لطفاً حداقل یک کالا یا قطعه با نام مشخص وارد کنید');

        // Auto-link any items that match existing part names in the catalog or Sayan ERP
        const validItems = initialValidItems.map(it => {
            const sm = sayanMatches[it.id];
            let enriched = { ...it };

            if (sm && sm.matched && sm.part) {
                enriched.itemCode = enriched.itemCode || sm.part.code;
                enriched.sayanItemCode = sm.part.code;
                enriched.sayanMatchedItem = sm.part.name;
                enriched.sayanStock = sm.stock || 0;
                enriched.warehouseStock = sm.stock || 0;
                enriched.isAvailableInWarehouse = (sm.stock || 0) > 0;
                enriched.sayanWarehouseName = sm.part.warehouseName || 'انبار ملزومات و قطعات';
                enriched.unit = enriched.unit || sm.part.unit || 'عدد';
            } else if (!it.partId && parts && parts.length > 0) {
                const trimmedName = it.itemName.trim().toLowerCase();
                const matchedPart = parts.find((p: any) => p.name.trim().toLowerCase() === trimmedName);
                if (matchedPart) {
                    enriched.partId = matchedPart.id;
                    enriched.itemName = matchedPart.name;
                    enriched.itemCode = matchedPart.code || matchedPart.id.slice(0, 8);
                    enriched.unit = matchedPart.unit || 'عدد';
                    enriched.specifications = matchedPart.dimensions || '';
                    enriched.warehouseStock = matchedPart.currentStock || 0;
                    enriched.sayanStock = matchedPart.currentStock || 0;
                    enriched.isAvailableInWarehouse = (matchedPart.currentStock || 0) > 0;
                    enriched.sayanWarehouseName = matchedPart.warehouseName || 'انبار ملزومات و قطعات';
                    enriched.sayanMatchedItem = matchedPart.name;
                    enriched.sayanItemCode = matchedPart.code;
                }
            }
            return enriched;
        });

        setLoading(true);
        try {
            const nextNum = await getNextPurchaseRequestNumber();
            const nowIso = new Date().toISOString();

            const primaryItem = validItems[0];
            const sayanSummaryList = validItems.map(it => {
                if (it.sayanMatchedItem || it.sayanStock !== undefined) {
                    return (it.sayanStock && it.sayanStock > 0)
                        ? `✅ ${it.itemName}: ${it.sayanStock.toLocaleString('fa-IR')} ${it.unit} در انبار سایان`
                        : `⚠️ ${it.itemName}: عدم موجودی در انبار سایان (۰ ${it.unit})`;
                }
                return null;
            }).filter(Boolean);

            const newAuditLog: PurchaseAuditLog = {
                id: generateUUID(),
                stage: PurchaseRequestStatus.PENDING_SHIFT_LEADER,
                action: 'ثبت اولیه درخواست خرید توسط سرشیفت',
                performedBy: requesterName || currentUser.fullName,
                role: currentUser.role,
                timestamp: nowIso,
                comment: `ثبت درخواست توسط ${requesterName || currentUser.fullName}${shiftLeader ? ` (سرشیفت: ${shiftLeader})` : ''} با ${validItems.length} قلم کالا (${urgency})${sayanSummaryList.length > 0 ? ` [موجودی سایان: ${sayanSummaryList.join(' | ')}]` : ''}`
            };

            const newRequest: PurchaseRequest = {
                id: generateUUID(),
                requestNumber: nextNum,
                date: nowIso.split('T')[0],
                requester: requesterName || currentUser.fullName,
                shiftLeader: shiftLeader.trim() || undefined,
                requestingUnit,
                urgency,
                location: targetBranch === 'Tehran' ? 'Tehran' : targetBranch === 'Factory' ? 'Factory' : undefined,
                machinery,
                installationLocation,
                breakdownDescription,
                purchaseReason,
                repairRequestNumber,
                
                itemName: validItems.length === 1 ? primaryItem.itemName : `${primaryItem.itemName} (+${validItems.length - 1} قلم دیگر)`,
                category: 'قطعات و ماشین‌آلات',
                quantity: primaryItem.quantity,
                unit: primaryItem.unit,
                specifications: primaryItem.specifications || breakdownDescription,
                sayanStock: primaryItem.sayanStock,
                sayanMatchedItem: primaryItem.sayanMatchedItem,
                sayanStockSummary: sayanSummaryList.length > 0 ? sayanSummaryList.join(' | ') : undefined,
                
                items: validItems,
                attachments,
                auditLogs: [newAuditLog],

                status: PurchaseRequestStatus.PENDING_SHIFT_LEADER,
                proformas: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await savePurchaseRequest(newRequest);
            onSuccess();
            onClose();
        } catch (e) { 
            alert('خطا در ثبت درخواست خرید'); 
            console.error(e);
        } finally { 
            setLoading(false); 
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000000] flex items-stretch sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-xl animate-fade-in overflow-hidden dir-rtl">
            <div className="bg-white dark:bg-gray-900 rounded-none sm:rounded-[2.5rem] w-full max-w-5xl h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92vh] animate-scale-in relative shadow-2xl border-0 sm:border-4 border-indigo-500/20 text-right flex flex-col overflow-hidden">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 px-3.5 py-2.5 sm:px-6 sm:py-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-10 shrink-0">
                    <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                        <div className="w-8 h-8 sm:w-12 sm:h-12 bg-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none shrink-0">
                            <ShoppingCart size={18} className="sm:hidden" />
                            <ShoppingCart size={28} className="hidden sm:block" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm sm:text-xl md:text-2xl font-black text-gray-800 dark:text-gray-100 truncate">ثبت فرم مهندسی درخواست خرید</h2>
                            <p className="hidden sm:block text-xs text-gray-400 font-bold">ماژول خریدهای صنعتی، قطعات یدکی و ماشین‌آلات (تفکیک شعب بازرگانی تهران و کارخانه زنجان)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-red-50 hover:text-red-500 rounded-xl sm:rounded-2xl transition-all bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 shrink-0"><X size={18} className="sm:hidden"/><X size={24} className="hidden sm:block"/></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 sm:p-6 md:p-8">
                    <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                            <div>
                                <label className="text-xs font-black text-indigo-900 dark:text-indigo-200 block mb-1">ثبت‌کننده درخواست *</label>
                                <input className="w-full border border-indigo-200 dark:border-indigo-800 rounded-xl p-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={requesterName} onChange={e => setRequesterName(e.target.value)} placeholder="نام ثبت‌کننده" required />
                            </div>
                            <div>
                                <label className="text-xs font-black text-indigo-900 dark:text-indigo-200 block mb-1">سرشیفت / سرپرست خط *</label>
                                <input className="w-full border border-indigo-200 dark:border-indigo-800 rounded-xl p-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={shiftLeader} onChange={e => setShiftLeader(e.target.value)} placeholder="نام سرشیفت مربوطه" required />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">واحد درخواست‌کننده</label>
                                <input className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={requestingUnit} onChange={e => setRequestingUnit(e.target.value)} required />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">شاخه تامین و فرآیند خرید</label>
                                <select className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs font-black bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={targetBranch} onChange={e => setTargetBranch(e.target.value as any)}>
                                    <option value="AUTO">⚖️ تعیین مسیر (مدیر کارخانه)</option>
                                    <option value="Tehran">🏢 بازرگانی تهران</option>
                                    <option value="Factory">🏭 کارخانه زنجان</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">درجه فوریت تامین</label>
                                <select className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs font-black bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={urgency} onChange={e => setUrgency(e.target.value as any)}>
                                    <option value="عادی">🟢 عادی</option>
                                    <option value="فوری">🟡 فوری</option>
                                    <option value="اضطراری">🔴 اضطراری</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">دستگاه / ماشین‌آلات</label>
                                <input className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={machinery} onChange={e => setMachinery(e.target.value)} placeholder="دستگاه مربوطه" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">شماره درخواست تعمیر (تولید خودکار)</label>
                                <input className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs font-mono font-bold bg-gray-100 dark:bg-gray-800 cursor-not-allowed text-gray-500 dark:text-gray-400" value={repairRequestNumber} readOnly />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">شرح خرابی / علت نیاز</label>
                                <input className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={breakdownDescription} onChange={e => setBreakdownDescription(e.target.value)} placeholder="مثلاً: شکستگی بلبرینگ شفت اصلی" />
                            </div>
                            <div className="sm:col-span-2 md:col-span-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">توجیه لزوم خرید</label>
                                <input className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" value={purchaseReason} onChange={e => setPurchaseReason(e.target.value)} placeholder="عدم وجود در انبار و خطر توقف تولید" />
                            </div>
                        </div>

                        {/* Requested Items Section */}
                        <div className="border border-gray-200 dark:border-gray-700 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm bg-white dark:bg-gray-850">
                            <div className="bg-gradient-to-r from-gray-800 to-indigo-900 text-white p-3 px-3.5 sm:px-4 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <Package size={16} className="text-indigo-300"/>
                                    <span className="text-xs font-black">اقلام درخواستی ({items.length} قلم کالا)</span>
                                </div>
                                <button type="button" onClick={handleAddItemRow} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5 transition-all">
                                    <Plus size={14}/> افزودن ردیف کالا
                                </button>
                            </div>

                            {/* Mobile View: Vertical Card-Based Layout (Zero horizontal scrolling) */}
                            <div className="block md:hidden divide-y divide-gray-100 dark:divide-gray-800 p-2.5 sm:p-3 space-y-3">
                                {items.map((it, index) => (
                                    <div key={it.id} className="pt-3 first:pt-0 space-y-2.5 bg-gray-50/70 dark:bg-gray-800/60 p-3 rounded-2xl border border-gray-200/80 dark:border-gray-700">
                                        <div className="flex items-center justify-between pb-1 border-b border-gray-200/60 dark:border-gray-700/60">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-mono font-black text-xs flex items-center justify-center shadow-sm">
                                                    {index + 1}
                                                </span>
                                                <span className="text-xs font-black text-gray-800 dark:text-gray-200">
                                                    قلم شماره {index + 1}
                                                </span>
                                            </div>
                                            {items.length > 1 && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => handleRemoveItemRow(it.id)} 
                                                    className="text-red-500 hover:text-red-700 p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs font-bold flex items-center gap-1 border border-red-200 dark:border-red-900/50"
                                                >
                                                    <Trash2 size={13}/>
                                                    <span>حذف این قلم</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Part Name & Catalog */}
                                        <div className="space-y-1.5">
                                            {parts && parts.length > 0 && (
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-0.5">انتخاب از کاتالوگ انبار (اختیاری):</label>
                                                    <select 
                                                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-[11px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                        onChange={e => handleSelectPart(it.id, e.target.value)}
                                                    >
                                                        <option value="">-- انتخاب از کاتالوگ انبار (اختیاری) --</option>
                                                        {parts.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
                                                    </select>
                                                </div>
                                            )}
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-0.5">نام دقیق کالا / قطعه *</label>
                                                <input 
                                                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs font-black text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                    value={it.itemName} 
                                                    onChange={e => handleItemChange(it.id, 'itemName', e.target.value)} 
                                                    placeholder="مثلاً: بلبرینگ ۶۲۰۴ دور بالا" 
                                                    required 
                                                />
                                            </div>

                                            {/* Sayan Part Match & Warehouse Stock Status Banner */}
                                            {sayanMatches[it.id]?.loading ? (
                                                <div className="flex items-center gap-2 p-2 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 animate-pulse">
                                                    <Loader2 size={13} className="animate-spin text-indigo-600" />
                                                    <span className="font-bold text-[11px]">در حال استعلام تطابق با قطعات کارخانه و موجودی انبار سایان...</span>
                                                </div>
                                            ) : sayanMatches[it.id]?.matched && sayanMatches[it.id]?.part ? (
                                                <div className={`p-2.5 rounded-xl border space-y-1 transition-all ${
                                                    (sayanMatches[it.id]?.stock || 0) > 0 
                                                        ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200' 
                                                        : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                                                }`}>
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="font-black flex items-center gap-1.5">
                                                            <Package size={14} className={(sayanMatches[it.id]?.stock || 0) > 0 ? "text-emerald-600" : "text-amber-600"} />
                                                            <span>تطابق با قطعات سایان: {sayanMatches[it.id]?.part?.name}</span>
                                                        </span>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                            (sayanMatches[it.id]?.stock || 0) > 0 
                                                                ? 'bg-emerald-600 text-white shadow-xs' 
                                                                : 'bg-amber-500 text-white shadow-xs'
                                                        }`}>
                                                            {(sayanMatches[it.id]?.stock || 0) > 0 ? '✅ موجود در انبار' : '⚠️ فاقد موجودی'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-[11px] font-bold opacity-90 pt-0.5">
                                                        <span>کد کالا در سایان: <span className="font-mono">{sayanMatches[it.id]?.part?.code}</span></span>
                                                        <span>موجودی فعلی انبار: <b className="font-black font-mono text-xs">{(sayanMatches[it.id]?.stock || 0).toLocaleString('fa-IR')} {it.unit || 'عدد'}</b></span>
                                                    </div>
                                                </div>
                                            ) : it.itemName && it.itemName.trim().length >= 2 ? (
                                                <div className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400 text-[10px] font-bold flex items-center gap-1.5">
                                                    <Info size={12} className="text-gray-400" />
                                                    <span>این کالا در سیستم قطعات کارخانه سایان ثبت نیست (ثبت به عنوان قلم جدید)</span>
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Qty and Unit */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-0.5">تعداد درخواستی *</label>
                                                <input 
                                                    type="number" 
                                                    min="1" 
                                                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs text-center font-black text-indigo-700 dark:text-indigo-400 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                    value={it.quantity} 
                                                    onChange={e => handleItemChange(it.id, 'quantity', +e.target.value)} 
                                                    required 
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-0.5">واحد سنجش</label>
                                                <select 
                                                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs font-bold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                    value={it.unit} 
                                                    onChange={e => handleItemChange(it.id, 'unit', e.target.value)}
                                                >
                                                    <option value="عدد">عدد</option>
                                                    <option value="کیلوگرم">کیلوگرم</option>
                                                    <option value="متر">متر</option>
                                                    <option value="دستگاه">دستگاه</option>
                                                    <option value="پک/بسته">پک/بسته</option>
                                                    <option value="لیتر">لیتر</option>
                                                    <option value="شاخه">شاخه</option>
                                                    <option value="جفت">جفت</option>
                                                    <option value="طاقه">طاقه</option>
                                                    <option value="ست">ست</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Part code & Suggested Brand */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-0.5">کد فنی کالا</label>
                                                <input 
                                                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                    value={it.itemCode || ''} 
                                                    onChange={e => handleItemChange(it.id, 'itemCode', e.target.value)} 
                                                    placeholder="مثلاً: PN-1002" 
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-0.5">برند / سازنده پیشنهادی</label>
                                                <input 
                                                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                    value={it.suggestedBrand || ''} 
                                                    onChange={e => handleItemChange(it.id, 'suggestedBrand', e.target.value)} 
                                                    placeholder="مثلاً: SKF, Siemens" 
                                                />
                                            </div>
                                        </div>

                                        {/* Specifications */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-0.5">مشخصات فنی، ابعاد و نقشه</label>
                                            <input 
                                                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-2 text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                                value={it.specifications || ''} 
                                                onChange={e => handleItemChange(it.id, 'specifications', e.target.value)} 
                                                placeholder="ابعاد، ولتاژ، توان، استاندارد یا نقشه ساخت..." 
                                            />
                                        </div>
                                    </div>
                                ))}

                                <button 
                                    type="button" 
                                    onClick={handleAddItemRow} 
                                    className="w-full py-3 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black border-2 border-dashed border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-2 transition shadow-sm active:scale-[0.98]"
                                >
                                    <Plus size={16}/>
                                    <span>افزودن قلم کالای دیگر به درخواست</span>
                                </button>
                            </div>

                            {/* Desktop View: Full Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-xs text-right dir-rtl">
                                    <thead className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold">
                                        <tr>
                                            <th className="p-2.5 w-10 text-center">#</th>
                                            <th className="p-2.5 min-w-[200px]">انتخاب از انبار یا نام کالا</th>
                                            <th className="p-2.5 w-28">کد فنی کالا</th>
                                            <th className="p-2.5 w-32">برند / سازنده پیشنهاد</th>
                                            <th className="p-2.5 w-20 text-center">تعداد</th>
                                            <th className="p-2.5 w-24">واحد</th>
                                            <th className="p-2.5 w-36 text-center">موجودی انبار سایان</th>
                                            <th className="p-2.5">مشخصات فنی و نقشه</th>
                                            <th className="p-2.5 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {items.map((it, index) => (
                                            <tr key={it.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50">
                                                <td className="p-2 text-center font-mono font-bold text-gray-400">{index + 1}</td>
                                                <td className="p-2">
                                                    <div className="space-y-1">
                                                        {parts && parts.length > 0 && (
                                                            <select className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-1.5 text-[10px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800" onChange={e => handleSelectPart(it.id, e.target.value)}>
                                                                <option value="">-- انتخاب از کاتالوگ انبار (اختیاری) --</option>
                                                                {parts.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
                                                            </select>
                                                        )}
                                                        <input className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-xs font-black text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800" value={it.itemName} onChange={e => handleItemChange(it.id, 'itemName', e.target.value)} placeholder="نام دقیق کالا / قطعه" required />
                                                        {sayanMatches[it.id]?.matched && sayanMatches[it.id]?.part && (
                                                            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[260px]" title={`نام قطعه در سایان: ${sayanMatches[it.id]?.part?.name}`}>
                                                                <Package size={11} className="shrink-0" />
                                                                <span className="truncate">سایان: {sayanMatches[it.id]?.part?.name}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-2"><input className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-xs font-mono bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100" value={it.itemCode || ''} onChange={e => handleItemChange(it.id, 'itemCode', e.target.value)} placeholder="PN-1002" /></td>
                                                <td className="p-2"><input className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100" value={it.suggestedBrand || ''} onChange={e => handleItemChange(it.id, 'suggestedBrand', e.target.value)} placeholder="مثلاً: SKF, Siemens" /></td>
                                                <td className="p-2"><input type="number" min="1" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-xs text-center font-black text-indigo-700 dark:text-indigo-400 bg-white dark:bg-gray-800" value={it.quantity} onChange={e => handleItemChange(it.id, 'quantity', +e.target.value)} required /></td>
                                                <td className="p-2">
                                                    <select className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100" value={it.unit} onChange={e => handleItemChange(it.id, 'unit', e.target.value)}>
                                                        <option value="عدد">عدد</option>
                                                        <option value="کیلوگرم">کیلوگرم</option>
                                                        <option value="متر">متر</option>
                                                        <option value="دستگاه">دستگاه</option>
                                                        <option value="پک/بسته">پک/بسته</option>
                                                        <option value="لیتر">لیتر</option>
                                                        <option value="شاخه">شاخه</option>
                                                        <option value="جفت">جفت</option>
                                                        <option value="طاقه">طاقه</option>
                                                        <option value="ست">ست</option>
                                                    </select>
                                                </td>
                                                {/* Sayan Warehouse Stock Cell */}
                                                <td className="p-2 text-center">
                                                    {sayanMatches[it.id]?.loading ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 rounded-lg animate-pulse font-bold">
                                                            <Loader2 size={12} className="animate-spin" />
                                                            <span>بررسی...</span>
                                                        </span>
                                                    ) : sayanMatches[it.id]?.matched && sayanMatches[it.id]?.part ? (
                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                                                                (sayanMatches[it.id]?.stock || 0) > 0 
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' 
                                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                                            }`}>
                                                                {(sayanMatches[it.id]?.stock || 0) > 0 ? (
                                                                    <>
                                                                        <Check size={11} className="text-emerald-600 font-black" />
                                                                        <span>{(sayanMatches[it.id]?.stock || 0).toLocaleString('fa-IR')} {it.unit || 'عدد'}</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <AlertTriangle size={11} className="text-amber-600" />
                                                                        <span>عدم موجودی (۰)</span>
                                                                    </>
                                                                )}
                                                            </span>
                                                            <span className="text-[9px] text-gray-400 font-bold truncate max-w-[120px]" title={sayanMatches[it.id]?.part?.warehouseName || 'انبار ملزومات و قطعات'}>
                                                                {sayanMatches[it.id]?.part?.warehouseName || 'انبار ملزومات'}
                                                            </span>
                                                        </div>
                                                    ) : it.itemName && it.itemName.trim().length >= 2 ? (
                                                        <span className="text-[9px] text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700" title="در قطعات سایان یافت نشد">
                                                            قلم جدید
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-300">---</span>
                                                    )}
                                                </td>
                                                <td className="p-2"><input className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100" value={it.specifications || ''} onChange={e => handleItemChange(it.id, 'specifications', e.target.value)} placeholder="ابعاد، ولتاژ، استاندارد و..." /></td>
                                                <td className="p-2 text-center">
                                                    {items.length > 1 && (
                                                        <button type="button" onClick={() => handleRemoveItemRow(it.id)} className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={16}/></button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Attachments */}
                        <div className="bg-slate-50 dark:bg-gray-800/60 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                            <div className="flex flex-wrap justify-between items-center gap-2">
                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <Paperclip size={16} className="text-indigo-500"/> پیوست مدارک، نقشه یا عکس خرابی
                                </span>
                                <label className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all flex items-center gap-1.5">
                                    <UploadCloud size={16}/> آپلود فایل
                                    <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                                </label>
                            </div>
                            {attachments.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                                    {attachments.map(att => (
                                        <div key={att.id} className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <FileText size={16} className="text-indigo-500 shrink-0" />
                                                <span className="font-bold text-gray-700 dark:text-gray-200 truncate">{att.fileName}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setPreviewAttachment({ url: att.fileUrl || att.url || '', fileName: att.fileName || 'پیوست' })} 
                                                    className="text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 p-1 rounded-lg transition-colors"
                                                    title="پیش‌نمایش فایل"
                                                >
                                                    <Eye size={14}/>
                                                </button>
                                                <button type="button" onClick={() => setAttachments(attachments.filter(a => a.id !== att.id))} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 p-1 rounded-lg"><X size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Submit Footer */}
                        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-100 dark:border-gray-800">
                            <button type="button" onClick={onClose} className="w-full sm:w-auto px-6 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl sm:rounded-2xl text-xs transition-all text-center">انصراف</button>
                            <button type="submit" disabled={loading || uploading} className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl sm:rounded-2xl text-xs shadow-xl shadow-indigo-100 dark:shadow-none transition-all flex items-center justify-center gap-2">
                                {loading ? <Loader2 className="animate-spin" size={18}/> : <CheckCircle size={18}/>}
                                ثبت درخواست (ارسال به سرپرست خط کارخانه)
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            {previewAttachment && (
                <FileViewerModal 
                    isOpen={!!previewAttachment} 
                    onClose={() => setPreviewAttachment(null)} 
                    fileUrl={previewAttachment.url} 
                    fileName={previewAttachment.fileName} 
                />
            )}
        </div>,
        document.body
    );
};

// --- SUBMODALS FOR NEW WORKFLOW STAGES ---

const ReturnModal = ({ onClose, onConfirm, currentStatus }: { onClose: () => void, onConfirm: (prevStage: PurchaseRequestStatus, reason: string) => void, currentStatus: PurchaseRequestStatus }) => {
    const [reason, setReason] = useState('');
    const [targetStage, setTargetStage] = useState<PurchaseRequestStatus>(PurchaseRequestStatus.PENDING_TECHNICAL);

    const availableStages = [
        { status: PurchaseRequestStatus.PENDING_TECHNICAL, label: 'مرحله ۱: بررسی و تایید فنی نت' },
        { status: PurchaseRequestStatus.PENDING_SHIFT_LEADER, label: 'مرحله ۱.۵: تایید سرشیفت کارخانه' },
        { status: PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER, label: 'مرحله ۲: بررسی موجودی انباردار کارخانه' },
        { status: PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION, label: 'مرحله ۳: تصمیم‌گیری مسیر خرید' },
        { status: PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA, label: 'مرحله استعلام / ثبت پروفرما' },
        { status: PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER, label: 'مرحله بررسی مدیر بازرگانی' },
        { status: PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL, label: 'مرحله دستور خرید مدیر کارخانه' },
        { status: PurchaseRequestStatus.PENDING_BUYER_EXECUTION, label: 'مرحله اجرای خرید کارپرداز' },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-in text-right dir-rtl">
                <div className="flex items-center gap-3 mb-6 text-amber-600 border-b pb-4">
                    <CornerUpLeft size={28} />
                    <div>
                        <h3 className="font-black text-xl text-gray-800">عودت درخواست جهت اصلاح</h3>
                        <p className="text-xs text-gray-500 mt-0.5">بازگشت به مرحله قبلی با ثبت دلایل فنی یا اداری</p>
                    </div>
                </div>
                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-700 block mb-2">مرحله مقصد جهت عودت:</label>
                        <select className="w-full border rounded-xl p-3 text-xs font-bold bg-gray-50 outline-none focus:ring-2 focus:ring-amber-200" value={targetStage} onChange={e => setTargetStage(e.target.value as PurchaseRequestStatus)}>
                            {availableStages.map(s => (
                                <option key={s.status} value={s.status}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-700 block mb-2">علت و توضیحات عودت <span className="text-red-500">*</span>:</label>
                        <textarea className="w-full border rounded-xl p-3 text-xs h-28 focus:ring-2 focus:ring-amber-200 outline-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="علت بازگشت و اصلاحات لازم را بنویسید..." />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => { if(!reason.trim()) return alert('ثبت علت عودت الزامی است'); onConfirm(targetStage, reason); }} className="flex-1 bg-amber-600 text-white font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs">تایید و عودت پرونده</button>
                        <button onClick={onClose} className="px-6 bg-gray-100 text-gray-600 font-bold text-xs rounded-2xl">انصراف</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const RejectModal = ({ onClose, onConfirm }: { onClose: () => void, onConfirm: (reason: string) => void }) => {
    const [reason, setReason] = useState('');

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-in text-right dir-rtl">
                <div className="flex items-center gap-3 mb-6 text-red-600 border-b pb-4">
                    <AlertTriangle size={28} />
                    <div>
                        <h3 className="font-black text-xl text-gray-800">رد و توقف کلی فرآیند خرید</h3>
                        <p className="text-xs text-gray-500 mt-0.5">ثبت دلیل رد و خاتمه درخواست در سامانه</p>
                    </div>
                </div>
                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-700 block mb-2">علت رد درخواست <span className="text-red-500">*</span>:</label>
                        <textarea className="w-full border rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-red-200 outline-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="دلایل عدم موافقت با این درخواست خرید را وارد کنید..." />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => { if(!reason.trim()) return alert('ثبت علت رد الزامی است'); onConfirm(reason); }} className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs">تایید و رد درخواست</button>
                        <button onClick={onClose} className="px-6 bg-gray-100 text-gray-600 font-bold text-xs rounded-2xl">انصراف</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const WarehouseCheckModal = ({ 
    request, 
    parts, 
    onClose, 
    onConfirm,
    onRegisterPart 
}: { 
    request: any, 
    parts: any[], 
    onClose: () => void, 
    onConfirm: (inStock: boolean, data: any) => void,
    onRegisterPart: (item: any) => void
}) => {
    const [inStock, setInStock] = useState(false);
    const [exitNumber, setExitNumber] = useState(() => {
        const shamsi = getCurrentShamsiDate();
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        return `OUT-${shamsi.year}/${randomNum}`;
    });
    const [recipient, setRecipient] = useState(request.requester || '');
    const [notes, setNotes] = useState('');

    const manualItems = request.items?.filter((it: any) => !it.partId) || [];

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-in text-right dir-rtl">
                <div className="flex items-center gap-3 mb-6 text-indigo-600 border-b dark:border-gray-800 pb-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl">
                        <Warehouse size={28} />
                    </div>
                    <div>
                        <h3 className="font-black text-lg text-gray-800 dark:text-gray-100">بررسی موجودی توسط انباردار کارخانه</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">تایید وجود موجودی و تحویل مستقیم، یا تایید عدم موجودی و ارجاع به فرآیند خرید</p>
                    </div>
                </div>
                <div className="space-y-5">
                    {/* Choice Tabs */}
                    <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                        <button 
                            type="button"
                            onClick={() => setInStock(true)} 
                            className={`py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${inStock ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                        >
                            <span>✅ تحویل مستقیم از انبار</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => setInStock(false)} 
                            className={`py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${!inStock ? 'bg-amber-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                        >
                            <span>❌ عدم موجودی (خرید)</span>
                        </button>
                    </div>

                    {inStock ? (
                        <div className="space-y-3 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                            <p className="text-xs text-emerald-800 dark:text-emerald-300 font-bold leading-relaxed">
                                📦 اقلام در انبار موجود است و مستقیماً به تحویل‌گیرنده تحویل داده می‌شود (نیازی به خرید جدید نیست).
                            </p>
                            <div>
                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-1">شماره حواله خروج انبار (تولید خودکار):</label>
                                <input className="w-full border dark:border-gray-700 rounded-xl p-2.5 text-xs font-mono font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" value={exitNumber} onChange={e => setExitNumber(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-1">نام تحویل‌گیرنده:</label>
                                <input className="w-full border dark:border-gray-700 rounded-xl p-2.5 text-xs font-bold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="نام واحد یا فرد تحویل‌گیرنده" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 block mb-1">توضیحات انباردار (اختیاری):</label>
                                <input className="w-full border dark:border-gray-700 rounded-xl p-2.5 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" value={notes} onChange={e => setNotes(e.target.value)} placeholder="یادداشت محل نگهداری، قفسه یا تحویل..." />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 bg-amber-50/70 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800">
                            <p className="text-xs text-amber-800 dark:text-amber-300 font-bold leading-relaxed">
                                🛒 کالا در انبار موجود نیست و درخواست جهت تعیین مسیر تامین و خرید به مدیر کارخانه ارجاع می‌گردد.
                            </p>
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">ملاحظات انبارداری و دلایل کسری:</label>
                                <textarea className="w-full border dark:border-gray-700 rounded-xl p-3 text-xs h-24 focus:ring-2 focus:ring-amber-200 outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" value={notes} onChange={e => setNotes(e.target.value)} placeholder="توضیحات عدم وجود در انبار، حداقل موجودی یا ضرورت خرید فوری..." />
                            </div>
                        </div>
                    )}

                    {manualItems.length > 0 && inStock ? (
                        <div className="space-y-2.5 bg-blue-50 dark:bg-blue-950/30 p-3.5 rounded-2xl border border-blue-200 dark:border-blue-800">
                            <p className="text-[11px] font-bold text-blue-800 dark:text-blue-300 leading-relaxed">
                                💡 راهنما: {manualItems.length} قلم کالا دارای کد سیستم نیست. در صورت تمایل می‌توانید آن‌ها را در شناسنامه کالا تعریف کنید (اختیاری):
                            </p>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                {manualItems.map((it: any) => (
                                    <div key={it.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-xl border border-blue-100 dark:border-blue-900 text-[10px]">
                                        <div className="font-bold text-gray-800 dark:text-gray-200 truncate pl-2 max-w-[200px]">
                                            {it.itemName}
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => onRegisterPart(it)}
                                            className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-black text-[9px] cursor-pointer"
                                        >
                                            ➕ تعریف کالا
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className="flex gap-3 pt-2">
                        <button 
                            type="button"
                            onClick={() => onConfirm(inStock, { warehouseExitVoucherNumber: exitNumber, warehouseRecipient: recipient, warehouseNotes: notes })} 
                            className={`flex-1 font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs cursor-pointer ${inStock ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200' : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200'}`}
                        >
                            {inStock ? '✅ تایید داشتن موجودی و تحویل از انبار' : '❌ تایید عدم موجودی و ارسال به فرآیند خرید'}
                        </button>
                        <button type="button" onClick={onClose} className="px-6 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 dark:text-gray-300 font-bold text-xs rounded-2xl cursor-pointer">انصراف</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const FactoryBranchModal = ({ onClose, onConfirm }: { onClose: () => void, onConfirm: (location: 'Tehran' | 'Factory', notes: string) => void }) => {
    const [selectedBranch, setSelectedBranch] = useState<'Tehran' | 'Factory'>('Tehran');
    const [notes, setNotes] = useState('');

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-in text-right dir-rtl">
                <div className="flex items-center gap-3 mb-6 text-amber-600 border-b pb-4">
                    <GitFork size={28} />
                    <div>
                        <h3 className="font-black text-lg text-gray-800">تعیین مسیر تامین و خرید</h3>
                        <p className="text-xs text-gray-500">انتخاب شاخه خرید از بازرگانی تهران یا تامین محلی کارخانه</p>
                    </div>
                </div>
                <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div onClick={() => setSelectedBranch('Tehran')} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedBranch === 'Tehran' ? 'border-sky-500 bg-sky-50 shadow-md ring-2 ring-sky-200' : 'border-gray-200 hover:border-sky-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-black text-xs text-sky-800">مسیر ۱: خرید از تهران</span>
                                <span className="w-3 h-3 rounded-full bg-sky-500"></span>
                            </div>
                            <p className="text-[10px] text-gray-500 leading-relaxed">ارسال پرونده به دفتر مرکزی تهران جهت استعلامات کلی و تایید مدیرعامل</p>
                        </div>
                        <div onClick={() => setSelectedBranch('Factory')} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedBranch === 'Factory' ? 'border-teal-500 bg-teal-50 shadow-md ring-2 ring-teal-200' : 'border-gray-200 hover:border-teal-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-black text-xs text-teal-800">مسیر ۲: خرید کارخانه (زنجان)</span>
                                <span className="w-3 h-3 rounded-full bg-teal-500"></span>
                            </div>
                            <p className="text-[10px] text-gray-500 leading-relaxed">تامین سریع و خرید محلی قطعات توسط انبار و کارپرداز کارخانه زنجان</p>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">دستور و ملاحظات مدیر کارخانه:</label>
                        <textarea className="w-full border rounded-xl p-3 text-xs h-24 focus:ring-2 focus:ring-amber-200 outline-none" value={notes} onChange={e => setNotes(e.target.value)} placeholder="توضیحات و نکات الزام‌آور خرید..." />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => onConfirm(selectedBranch, notes)} className="flex-1 bg-amber-600 text-white font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs">تایید و ارجاع شاخه</button>
                        <button onClick={onClose} className="px-6 bg-gray-100 text-gray-600 font-bold text-xs rounded-2xl">انصراف</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const TechnicalApprovalModal = ({ onClose, onConfirm }: { onClose: () => void, onConfirm: (data: any) => void }) => {
    const [specsOk, setSpecsOk] = useState(true);
    const [brandOk, setBrandOk] = useState(true);
    const [equipmentOk, setEquipmentOk] = useState(true);
    const [techReport, setTechReport] = useState('');
    
    // Quality Control Fields
    const [qcStatus, setQcStatus] = useState<'تایید' | 'مشروط' | 'رد'>('تایید');
    const [qcNotes, setQcNotes] = useState('');
    const [inspectorName, setInspectorName] = useState('');

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-in text-right dir-rtl">
                <div className="flex items-center gap-3 mb-6 text-indigo-600 border-b pb-4">
                    <Wrench size={28} />
                    <div>
                        <h3 className="font-black text-lg text-gray-800">فرم یکپارچه تایید فنی و کنترل کیفی (QC/Net)</h3>
                        <p className="text-xs text-gray-500">بررسی همزمان تطابق فنی، کنترل کیفی و سلامت فیزیکی قطعات</p>
                    </div>
                </div>
                <div className="space-y-6">
                    {/* Section 1: Technical specs Check */}
                    <div>
                        <h4 className="text-xs font-black text-indigo-600 mb-2.5 flex items-center gap-1.5 border-r-4 border-indigo-500 pr-2">۱. تایید مشخصات فنی و تطابق سفارش</h4>
                        <div className="space-y-2 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                            <label className="flex items-center gap-3 text-xs font-bold text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={specsOk} onChange={e => setSpecsOk(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-300" />
                                تطابق مشخصات فنی، ابعاد، گام، رزوه و شفت قطعه
                            </label>
                            <label className="flex items-center gap-3 text-xs font-bold text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={brandOk} onChange={e => setBrandOk(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-300" />
                                تایید اصالت برند، کاتالوگ و گواهی مبدا سازنده
                            </label>
                            <label className="flex items-center gap-3 text-xs font-bold text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={equipmentOk} onChange={e => setEquipmentOk(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-300" />
                                تست و تطابق کامل با ماشین‌آلات هدف و خطوط تولید
                            </label>
                        </div>
                    </div>

                    {/* Section 2: QC Check */}
                    <div>
                        <h4 className="text-xs font-black text-emerald-600 mb-2.5 flex items-center gap-1.5 border-r-4 border-emerald-500 pr-2">۲. ارزیابی کنترل کیفی و بازرسی فیزیکی</h4>
                        <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100 space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">نتیجه بازرسی کیفی:</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button 
                                        type="button" 
                                        onClick={() => setQcStatus('تایید')} 
                                        className={`py-2 text-xs font-black rounded-xl border transition-all ${qcStatus === 'تایید' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        تایید کامل کیفی
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setQcStatus('مشروط')} 
                                        className={`py-2 text-xs font-black rounded-xl border transition-all ${qcStatus === 'مشروط' ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        تایید مشروط / اصلاحی
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setQcStatus('رد')} 
                                        className={`py-2 text-xs font-black rounded-xl border transition-all ${qcStatus === 'رد' ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        مردود / عودت کالا
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">نام بازرس یا تایید کننده کیفی:</label>
                                <input className="w-full border rounded-xl p-2.5 text-xs font-black text-gray-800 outline-none focus:ring-2 focus:ring-emerald-200" value={inspectorName} onChange={e => setInspectorName(e.target.value)} placeholder="مثلاً: مهندس احمدی" />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Technical report Text area */}
                    <div>
                        <label className="text-xs font-black text-gray-700 block mb-1">گزارش کارشناسی نهایی واحد فنی و QC:</label>
                        <textarea className="w-full border rounded-xl p-3 text-xs h-24 focus:ring-2 focus:ring-indigo-100 outline-none" value={techReport} onChange={e => setTechReport(e.target.value)} placeholder="نتایج دقیق تست فیزیکی، مرغوبیت، ابعاد اندازه‌گیری شده و انحرافات احتمالی..." />
                    </div>

                    {/* Submit and Close Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button 
                            onClick={() => onConfirm({ 
                                technicalReport: techReport, 
                                specsApproved: specsOk, 
                                brandApproved: brandOk, 
                                equipmentMatchApproved: equipmentOk,
                                qcResult: qcStatus,
                                qcDescription: qcNotes || techReport,
                                qcInspector: inspectorName
                            })} 
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs"
                        >
                            تایید نهایی فرم و ارجاع به مدیر کارخانه
                        </button>
                        <button onClick={onClose} className="px-6 bg-gray-100 text-gray-600 font-bold text-xs rounded-2xl hover:bg-gray-200 transition">انصراف</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const PurchasingAgentModal = ({ onClose, onConfirm }: { onClose: () => void, onConfirm: (data: any) => void }) => {
    const [vendor, setVendor] = useState('');
    const [invoiceNum, setInvoiceNum] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [buyerName, setBuyerName] = useState('');

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl animate-scale-in text-right dir-rtl">
                <div className="flex items-center gap-3 mb-6 text-teal-600 border-b pb-4">
                    <ShoppingCart size={28} />
                    <div>
                        <h3 className="font-black text-lg text-gray-800">ثبت فاکتور و خرید کارپرداز</h3>
                        <p className="text-xs text-gray-500">ورود مشخصات فاکتور و صورت‌حساب خرید</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">نام فروشنده / تامین‌کننده:</label>
                        <input className="w-full border rounded-xl p-3 text-xs font-bold" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="نام فروشگاه یا شرکت تامین کننده" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-gray-700 block mb-1">شماره فاکتور خرید:</label>
                            <input className="w-full border rounded-xl p-3 text-xs font-bold" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="مثلاً: 1402/904" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-700 block mb-1">مامور خرید / کارپرداز:</label>
                            <input className="w-full border rounded-xl p-3 text-xs font-bold" value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="نام کارپرداز" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">مبلغ کل فاکتور (ریال):</label>
                        <input type="number" className="w-full border rounded-xl p-3 text-sm font-black text-indigo-600" value={amount} onChange={e => setAmount(+e.target.value)} />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => onConfirm({ vendorName: vendor, invoiceNumber: invoiceNum, totalPaidAmount: amount, purchasingAgentName: buyerName })} className="flex-1 bg-teal-600 text-white font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs">ثبت فاکتور و ارجاع به ورود کالا</button>
                        <button onClick={onClose} className="px-6 bg-gray-100 text-gray-600 font-bold text-xs rounded-2xl">انصراف</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const DataSheetModal = ({ part, onClose }: { part: PartMasterData, onClose: () => void }) => {
    const [isSharing, setIsSharing] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string; fileName: string } | null>(null);
    const [activeImgIdx, setActiveImgIdx] = useState(0);
    const [activePdfIdx, setActivePdfIdx] = useState(0);
    const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

    const allImages = React.useMemo(() => {
        const list = Array.isArray(part.images) && part.images.length > 0
            ? part.images.filter(Boolean)
            : (part.image ? [part.image] : []);
        return Array.from(new Set(list));
    }, [part.images, part.image]);

    const allPdfs = React.useMemo(() => {
        const list = Array.isArray(part.pdfAttachments) && part.pdfAttachments.length > 0
            ? part.pdfAttachments.filter(Boolean)
            : (part.pdfAttachment ? [part.pdfAttachment] : []);
        return Array.from(new Set(list));
    }, [part.pdfAttachments, part.pdfAttachment]);

    const safeImgIdx = allImages.length > 0 ? Math.min(activeImgIdx, allImages.length - 1) : 0;
    const safePdfIdx = allPdfs.length > 0 ? Math.min(activePdfIdx, allPdfs.length - 1) : 0;

    const currentImgUrl = allImages[safeImgIdx] || '';
    const currentPdfUrl = allPdfs[safePdfIdx] || '';

    const handleDownloadFile = async (url: string, fileName: string, isImg: boolean) => {
        if (!url || downloadingFile) return;
        setDownloadingFile(url);
        try {
            const resolved = resolveImageUrl(url);
            if (isImg) {
                await saveImageToGallery(resolved, fileName);
            } else {
                await downloadAndOpenFile(resolved, fileName);
            }
        } catch (err) {
            console.error('Download error:', err);
        } finally {
            setDownloadingFile(null);
        }
    };

    const handleSendToChat = async () => {
        setIsSharing(true);
        try {
            const el = document.getElementById('datasheet-print-area');
            if (!el) throw new Error('المان چاپ یافت نشد');
            await shareElementToChat(
                el,
                `DataSheet_${part.id}.jpg`,
                {
                    defaultMessage: `📋 شناسنامه فنی کالا: ${part.name} - گروه: ${part.category || 'عمومی'}`,
                    title: 'ارسال شناسنامه کالا به گفتگو'
                }
            );
        } catch (e) {
            console.error(e);
            alert('خطا در آماده‌سازی سند جهت ارسال به گفتگو');
        } finally {
            setIsSharing(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md overflow-hidden dir-rtl">
            <div className="bg-white rounded-none sm:rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-2xl border-0 sm:border border-white/20 animate-in fade-in zoom-in h-[100dvh] max-h-[100dvh] sm:h-[92vh] sm:max-h-[92vh] flex flex-col">
                <div className="px-3.5 py-2.5 sm:p-5 border-b flex justify-between items-center bg-gray-900 text-white shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Info size={20} className="text-yellow-400 shrink-0 sm:w-6 sm:h-6" />
                        <div>
                            <h2 className="text-sm sm:text-xl font-black">شناسنامه کالا (Data Sheet)</h2>
                            <p className="text-[9px] sm:text-[10px] opacity-80 font-mono tracking-widest">{part.id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-white/20 rounded-full transition-colors cursor-pointer"><XCircle size={22} /></button>
                </div>

                {/* Multi-Image & Multi-PDF Attachments Bar with Flip/Carousel (ورق زدن), Open & Download */}
                {(allImages.length > 0 || allPdfs.length > 0) && (
                    <div className="bg-indigo-50/95 px-4 sm:px-6 py-3 border-b border-indigo-100 flex flex-col gap-2.5 shrink-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                                <Paperclip size={14} className="text-indigo-600" />
                                فایل‌ها و مستندات فنی کالا (مشاهده، ورق زدن و دانلود):
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Images Control Group */}
                                {allImages.length > 0 && (
                                    <div className="flex items-center gap-1 bg-white border border-indigo-200 rounded-xl p-1 shadow-2xs">
                                        {allImages.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveImgIdx((safeImgIdx - 1 + allImages.length) % allImages.length)}
                                                className="p-1 hover:bg-indigo-50 text-indigo-700 rounded-lg transition-colors cursor-pointer"
                                                title="تصویر قبلی"
                                            >
                                                <ChevronRight size={15} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setPreviewFile({ url: resolveImageUrl(currentImgUrl), fileName: `تصویر_${safeImgIdx + 1}_${part.name}.jpg` })}
                                            className="px-2.5 py-1 text-indigo-700 hover:bg-indigo-50 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                                            title="مشاهده بزرگنمایی تصویر"
                                        >
                                            <ImageIcon size={14} className="text-indigo-500" />
                                            <span>مشاهده تصویر {allImages.length > 1 ? `(${safeImgIdx + 1} از ${allImages.length})` : 'کالا'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadFile(currentImgUrl, `تصویر_${safeImgIdx + 1}_${part.name}.jpg`, true)}
                                            disabled={downloadingFile === currentImgUrl}
                                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-black flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                            title="دانلود و ذخیره تصویر"
                                        >
                                            {downloadingFile === currentImgUrl ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                            <span>دانلود</span>
                                        </button>
                                        {allImages.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveImgIdx((safeImgIdx + 1) % allImages.length)}
                                                className="p-1 hover:bg-indigo-50 text-indigo-700 rounded-lg transition-colors cursor-pointer"
                                                title="تصویر بعدی"
                                            >
                                                <ChevronLeft size={15} />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* PDFs Control Group */}
                                {allPdfs.length > 0 && (
                                    <div className="flex items-center gap-1 bg-white border border-red-200 rounded-xl p-1 shadow-2xs">
                                        {allPdfs.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setActivePdfIdx((safePdfIdx - 1 + allPdfs.length) % allPdfs.length)}
                                                className="p-1 hover:bg-red-50 text-red-700 rounded-lg transition-colors cursor-pointer"
                                                title="فایل PDF قبلی"
                                            >
                                                <ChevronRight size={15} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setPreviewFile({ url: resolveImageUrl(currentPdfUrl), fileName: `کاتالوگ_${safePdfIdx + 1}_${part.name}.pdf` })}
                                            className="px-2.5 py-1 text-red-700 hover:bg-red-50 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                                            title="مشاهده و ورق زدن PDF"
                                        >
                                            <FileText size={14} className="text-red-500" />
                                            <span>مشاهده PDF {allPdfs.length > 1 ? `(${safePdfIdx + 1} از ${allPdfs.length})` : 'کاتالوگ'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadFile(currentPdfUrl, `کاتالوگ_${safePdfIdx + 1}_${part.name}.pdf`, false)}
                                            disabled={downloadingFile === currentPdfUrl}
                                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-black flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                            title="دانلود و ذخیره فایل PDF"
                                        >
                                            {downloadingFile === currentPdfUrl ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                            <span>دانلود PDF</span>
                                        </button>
                                        {allPdfs.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setActivePdfIdx((safePdfIdx + 1) % allPdfs.length)}
                                                className="p-1 hover:bg-red-50 text-red-700 rounded-lg transition-colors cursor-pointer"
                                                title="فایل PDF بعدی"
                                            >
                                                <ChevronLeft size={15} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto bg-gray-50 p-2 sm:p-4 md:p-8">
                    <PinchZoomContainer contentWidth={760} autoFitMobile={true} showToolbar={true}>
                        <div id="datasheet-print-area" className="bg-white p-4 md:p-12 shadow-sm rounded-2xl mx-auto max-w-3xl border border-gray-200 printable-datasheet">
                             <PrintPartDataSheet
                                 part={part}
                                 activeImageIndex={safeImgIdx}
                                 onSelectImageIndex={setActiveImgIdx}
                             />
                        </div>
                    </PinchZoomContainer>
                </div>

                <div className="p-4 sm:p-6 border-t flex flex-wrap justify-end gap-2.5 sm:gap-3 bg-white shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 sm:px-6 sm:py-3 border-2 border-gray-200 rounded-2xl font-bold text-gray-500 text-xs sm:text-sm cursor-pointer">بستن</button>
                    <button 
                        onClick={handleSendToChat} 
                        disabled={isSharing}
                        className="px-5 py-2.5 sm:px-6 sm:py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-emerald-100 transition-colors cursor-pointer text-xs sm:text-sm"
                        title="ارسال شناسنامه کالا به گفتگو"
                    >
                        {isSharing ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18}/>}
                        ارسال به گفتگو
                    </button>
                    <button onClick={() => window.print()} className="px-6 py-2.5 sm:px-8 sm:py-3 bg-indigo-600 text-white rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-indigo-100 text-xs sm:text-sm cursor-pointer">
                        <Printer size={18}/> چاپ شناسنامه
                    </button>
                </div>

                {previewFile && (
                    <FileViewerModal
                        isOpen={!!previewFile}
                        onClose={() => setPreviewFile(null)}
                        fileUrl={previewFile.url}
                        fileName={previewFile.fileName}
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

const ViewProformaDetailsModal = ({ 
    proforma, 
    onClose, 
    setPreviewFile,
    currentUser,
    request,
    settings
}: { 
    proforma: PurchaseProforma; 
    onClose: () => void; 
    setPreviewFile: (file: { url: string; fileName: string } | null) => void;
    currentUser?: User;
    request?: PurchaseRequest;
    settings?: SystemSettings;
}) => {
    const isAllowed = currentUser ? canUserViewProformas(currentUser, request, settings) : true;
    if (!isAllowed) {
        return createPortal(
            <div className="fixed inset-0 z-[100000008] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
                <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl border border-amber-200 dark:border-amber-900">
                    <div className="p-3 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                        <ShieldAlert size={28} />
                    </div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">دسترسی به پیش‌فاکتور مسدود است</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        مشاهده پیش‌فاکتورها، فایل‌های استعلام و مبالغ خرید منحصراً در اختیار مدیریت (مدیر بازرگانی، مدیرعامل و مدیر مالی) و در خریدهای کارخانه در اختیار مسئول خرید و مدیر کارخانه است.
                    </p>
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                        متوجه شدم
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <div className="bg-white dark:bg-gray-900 rounded-[2rem] w-full max-w-3xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[90vh]">
                <div className="p-5 border-b dark:border-gray-800 flex justify-between items-center bg-indigo-900 text-white">
                    <div className="flex items-center gap-3">
                        <FileText size={24} className="text-indigo-200" />
                        <div>
                            <h2 className="text-sm font-black">جزئیات و سند پیش‌فاکتور (استعلام)</h2>
                            <p className="text-[10px] opacity-85 font-bold">{proforma.vendorName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 flex-1 no-scrollbar text-right" dir="rtl">
                    {/* Basic Vendor Info & Terms */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs"><span className="text-gray-500 font-bold">تأمین‌کننده:</span> <span className="font-black text-gray-900 dark:text-gray-100">{proforma.vendorName}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-gray-500 font-bold">شماره تماس:</span> <span className="font-mono text-gray-800 dark:text-gray-200" dir="ltr">{proforma.vendorPhone || 'ثبت نشده'}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-gray-500 font-bold">شماره پیش‌فاکتور:</span> <span className="font-mono text-indigo-700 dark:text-indigo-400 font-bold">{proforma.number || 'بدون شماره'}</span></div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs"><span className="text-gray-500 font-bold">تاریخ ثبت:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{formatDate(proforma.date)}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-gray-500 font-bold">مدت زمان تحویل:</span> <span className="font-bold text-orange-600 dark:text-orange-400">{proforma.deliveryTime || 'مشخص نشده'}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-gray-500 font-bold">شرایط پرداخت:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{proforma.paymentConditions || 'مشخص نشده'}</span></div>
                        </div>
                    </div>

                    {/* Proforma Items */}
                    {proforma.items && proforma.items.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><Package size={14} className="text-indigo-500" /> لیست اقلام استعلام‌شده</h3>
                            <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 text-gray-500 font-bold">
                                            <th className="p-2.5 text-center w-12">ردیف</th>
                                            <th className="p-2.5 text-right">شرح کالا / قطعه</th>
                                            <th className="p-2.5 text-center w-24">تعداد / مقدار</th>
                                            <th className="p-2.5 text-left w-32">قیمت واحد (ریال)</th>
                                            <th className="p-2.5 text-left w-36">قیمت کل (ریال)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                        {proforma.items.map((item, idx) => (
                                            <tr key={item.id || idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                                                <td className="p-2.5 text-center font-mono text-gray-400">{idx + 1}</td>
                                                <td className="p-2.5 font-bold text-gray-800 dark:text-gray-200">{item.description}</td>
                                                <td className="p-2.5 text-center font-bold text-gray-700 dark:text-gray-300">{item.quantity} {item.unit}</td>
                                                <td className="p-2.5 text-left font-mono text-gray-600 dark:text-gray-400">{formatCurrency(item.unitPrice)}</td>
                                                <td className="p-2.5 text-left font-mono font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(item.totalPrice)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Financial Summary */}
                    <div className="border-t dark:border-gray-800 pt-4 flex flex-col items-end space-y-2">
                        {proforma.taxAmount !== undefined && proforma.taxAmount > 0 && (
                            <div className="flex justify-between w-64 text-xs text-gray-500"><span className="font-bold">مالیات و عوارض:</span> <span className="font-mono">{formatCurrency(proforma.taxAmount)} ریال</span></div>
                        )}
                        {proforma.discountAmount !== undefined && proforma.discountAmount > 0 && (
                            <div className="flex justify-between w-64 text-xs text-red-500"><span className="font-bold">تخفیف پیش‌فاکتور:</span> <span className="font-mono">({formatCurrency(proforma.discountAmount)}) ریال</span></div>
                        )}
                        <div className="flex justify-between w-64 text-sm font-black border-t dark:border-gray-800 pt-2 text-indigo-700 dark:text-indigo-400">
                            <span>مبلغ نهایی:</span>
                            <span className="font-mono">{formatCurrency(proforma.totalAmount)} ریال</span>
                        </div>
                    </div>

                    {/* Attachments Section */}
                    <div className="border-t dark:border-gray-800 pt-5 space-y-3">
                        <h3 className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><Paperclip size={14} className="text-indigo-500" /> فایل‌های پیوست پیش‌فاکتور</h3>
                        {proforma.attachments && proforma.attachments.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {proforma.attachments.map((att: any, attIdx: number) => (
                                    <div key={att.id || attIdx} className="flex items-center justify-between p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
                                        <div className="flex items-center gap-2 truncate">
                                            <Paperclip size={16} className="text-indigo-500 flex-shrink-0" />
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate" title={att.fileName || att.name}>{att.fileName || att.name || 'سند ضمیمه'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPreviewFile({ url: att.url, fileName: att.fileName || att.name || `پیش‌فاکتور_${proforma.vendorName}` });
                                            }}
                                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black flex items-center gap-1 shadow-sm transition-all"
                                        >
                                            <Eye size={12} />
                                            <span>مشاهده سند</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl text-center text-gray-400 dark:text-gray-500 text-xs italic">
                                فایل اسکن‌شده یا پی‌دی‌اف برای این پیش‌فاکتور ضمیمه نشده است.
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-black text-xs rounded-xl transition-all">
                        بستن پنجره
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

interface PurchaseCommentsSectionProps {
    request: PurchaseRequest;
    currentUser: User;
    onSuccess: () => void;
    settings?: SystemSettings;
}

const PurchaseCommentsSection: React.FC<PurchaseCommentsSectionProps> = ({ request, currentUser, onSuccess, settings }) => {
    const [comments, setComments] = useState<PurchaseComment[]>(request.comments || []);
    const [newCommentText, setNewCommentText] = useState('');
    const [replyTo, setReplyTo] = useState<PurchaseComment | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const getRoleLabel = (roleId?: string) => {
        if (!roleId) return '';
        if (settings?.customRoleNames?.[roleId]) return settings.customRoleNames[roleId];
        const custom = settings?.customRoles?.find((r: any) => r.id === roleId || r.name === roleId);
        if (custom) return settings?.customRoleNames?.[custom.id] || custom.label || custom.name;
        const standardRoles: Record<string, string> = {
            'admin': 'مدیر سیستم',
            'ceo': 'مدیر عامل',
            'financial': 'مالی',
            'manager': 'مدیر بخش',
            'sales_manager': 'مدیر فروش',
            'factory_manager': 'مدیر کارخانه',
            'warehouse_keeper': 'انباردار',
            'security_head': 'رئیس انتظامات',
            'security_guard': 'نگهبان انتظامات',
            'commercial': 'بازرگانی',
            'qc': 'کنترل کیفیت',
            'user': 'کاربر'
        };
        return standardRoles[roleId.toLowerCase()] || roleId;
    };

    useEffect(() => {
        setComments(request.comments || []);
    }, [request.comments]);

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCommentText.trim()) return;

        setSubmitting(true);
        try {
            const newComment: PurchaseComment = {
                id: generateUUID(),
                userId: currentUser.id || currentUser.fullName,
                userName: currentUser.fullName,
                userRole: currentUser.role,
                text: newCommentText.trim(),
                createdAt: Date.now(),
                replyToId: replyTo ? replyTo.id : undefined
            };

            const updatedComments = [...comments, newComment];
            const updatedRequest = {
                ...request,
                comments: updatedComments
            };

            await updatePurchaseRequest(updatedRequest);
            setComments(updatedComments);
            setNewCommentText('');
            setReplyTo(null);
            onSuccess();
        } catch (err) {
            console.error('Failed to save comment:', err);
            alert('خطا در ثبت نظر');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!confirm('آیا از حذف این نظر مطمئن هستید؟')) return;

        try {
            const deleteIds = new Set<string>([commentId]);
            let checked = true;
            while (checked) {
                const beforeSize = deleteIds.size;
                comments.forEach(c => {
                    if (c.replyToId && deleteIds.has(c.replyToId)) {
                        deleteIds.add(c.id);
                    }
                });
                if (deleteIds.size === beforeSize) {
                    checked = false;
                }
            }

            const updatedComments = comments.filter(c => !deleteIds.has(c.id));
            const updatedRequest = {
                ...request,
                comments: updatedComments
            };

            await updatePurchaseRequest(updatedRequest);
            setComments(updatedComments);
            onSuccess();
        } catch (err) {
            console.error('Failed to delete comment:', err);
            alert('خطا در حذف نظر');
        }
    };

    const rootComments = comments.filter(c => !c.replyToId);
    const getRepliesFor = (parentId: string) => comments.filter(c => c.replyToId === parentId);

    const renderCommentCard = (c: PurchaseComment, isReply = false) => {
        const canDelete = currentUser.role === UserRole.ADMIN || c.userId === currentUser.id || c.userName === currentUser.fullName;
        const formattedDate = new Date(c.createdAt).toLocaleDateString('fa-IR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return (
            <div key={c.id} className={`p-4 rounded-2xl border transition-all ${isReply ? 'bg-gray-50/50 border-gray-150 mr-6 sm:mr-8' : 'bg-white border-gray-200'} space-y-2 shadow-sm`}>
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                            {c.userName ? c.userName.charAt(0) : 'U'}
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-gray-800 dark:text-gray-200">{c.userName}</span>
                                {c.userRole && (
                                    <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-md">
                                        {getRoleLabel(c.userRole)}
                                    </span>
                                )}
                            </div>
                            <span className="text-[9px] text-gray-400 font-medium block mt-0.5">{formattedDate}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {!isReply && (
                            <button
                                onClick={() => setReplyTo(c)}
                                className="p-1 px-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                                title="پاسخ به این نظر"
                            >
                                <CornerUpLeft size={12} />
                                <span>پاسخ</span>
                            </button>
                        )}
                        {canDelete && (
                            <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-all cursor-pointer"
                                title="حذف نظر"
                            >
                                <Trash2 size={13} />
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed pr-10 whitespace-pre-line font-medium">
                    {c.text}
                </p>
            </div>
        );
    };

    return (
        <div className="glass-panel p-4 md:p-6 rounded-3xl border border-gray-200 bg-white shadow-sm space-y-4">
            <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                <MessageSquare className="text-indigo-500" size={18} />
                <span>گفتگو و نظرات پیرامون درخواست</span>
                {comments.length > 0 && (
                    <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                        {comments.length}
                    </span>
                )}
            </h3>

            <form onSubmit={handleAddComment} className="space-y-3">
                {replyTo && (
                    <div className="flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-950/30 p-2.5 px-4 rounded-xl border border-indigo-100 text-xs text-indigo-800 dark:text-indigo-300">
                        <div className="flex items-center gap-2 font-bold">
                            <CornerUpLeft size={14} className="text-indigo-500" />
                            <span>در حال پاسخ به: <strong className="text-indigo-900 dark:text-indigo-200">{replyTo.userName}</strong></span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReplyTo(null)}
                            className="p-1 text-gray-400 hover:text-gray-600 font-bold"
                        >
                            انصراف
                        </button>
                    </div>
                )}
                <div className="relative">
                    <textarea
                        value={newCommentText}
                        onChange={e => setNewCommentText(e.target.value)}
                        placeholder={replyTo ? "پاسخ خود را بنویسید..." : "نظری یا یادداشتی درباره این درخواست ثبت کنید..."}
                        rows={3}
                        className="w-full glass-panel border border-gray-200 rounded-2xl p-3 text-xs outline-none focus:ring-2 focus:ring-indigo-100 placeholder-gray-400 resize-none leading-relaxed"
                    />
                    <button
                        type="submit"
                        disabled={submitting || !newCommentText.trim()}
                        className="absolute left-3 bottom-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-xl text-[11px] font-black shadow-md shadow-indigo-100 flex items-center gap-1 transition-all cursor-pointer"
                    >
                        {submitting ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Plus size={14} />
                        )}
                        <span>{replyTo ? 'ثبت پاسخ' : 'ثبت نظر'}</span>
                    </button>
                </div>
            </form>

            {comments.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                    <MessageSquare size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">هنوز هیچ نظری ثبت نشده است. اولین گفتگو را شما آغاز کنید!</p>
                </div>
            ) : (
                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1 no-scrollbar">
                    {rootComments.map(rootComment => (
                        <div key={rootComment.id} className="space-y-3">
                            {renderCommentCard(rootComment)}
                            {getRepliesFor(rootComment.id).map(reply => renderCommentCard(reply, true))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ViewRequestModal = ({ request, onClose, currentUser, onSuccess, settings, parts, initialTab = 'DETAILS' }: { request: PurchaseRequest, onClose: () => void, currentUser: User, onSuccess: () => void, settings?: SystemSettings, parts: PartMasterData[], initialTab?: 'DETAILS' | 'COMMENTS' }) => {
    const [modalTab, setModalTab] = useState<'DETAILS' | 'COMMENTS'>(initialTab);
    useEffect(() => {
        if (initialTab) setModalTab(initialTab);
    }, [initialTab]);
    const [actionLoading, setActionLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [showProformaModal, setShowProformaModal] = useState(false);
    const [showAiAdvisorModal, setShowAiAdvisorModal] = useState(false);
    const [aiAdvisorInitialIndex, setAiAdvisorInitialIndex] = useState<number>(0);
    const [prefilledProformaData, setPrefilledProformaData] = useState<any>(null);
    const [showSecurityModal, setShowSecurityModal] = useState(false);
    const [showQCModal, setShowQCModal] = useState(false);
    const [showWarehouseModal, setShowWarehouseModal] = useState(false);
    const [showAdminEditModal, setShowAdminEditModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showWarehouseCheckModal, setShowWarehouseCheckModal] = useState(false);
    const [showFactoryBranchModal, setShowFactoryBranchModal] = useState(false);
    const [showTechnicalApprovalModal, setShowTechnicalApprovalModal] = useState(false);
    const [showPurchasingAgentModal, setShowPurchasingAgentModal] = useState(false);
    const [printingProforma, setPrintingProforma] = useState<PurchaseProforma | null>(null);
    const [printType, setPrintType] = useState<'REQUEST' | 'PROFORMA' | 'RECEIPT' | 'BARCODE'>('REQUEST');
    const [definingItem, setDefiningItem] = useState<any>(null);
    const [viewingPartDataSheet, setViewingPartDataSheet] = useState<PartMasterData | null>(null);
    const [viewingProformaDetails, setViewingProformaDetails] = useState<PurchaseProforma | null>(null);
    const [previewFile, setPreviewFile] = useState<{ url: string; fileName: string } | null>(null);
    const [isPrintDropdownOpen, setIsPrintDropdownOpen] = useState(false);
    const [isShareDropdownOpen, setIsShareDropdownOpen] = useState(false);
    const [isSharingDoc, setIsSharingDoc] = useState(false);
    const [sharingType, setSharingType] = useState<'REQUEST' | 'PROFORMA' | 'RECEIPT' | null>(null);
    const [sharingProforma, setSharingProforma] = useState<PurchaseProforma | null>(null);

    // Live Sayan Warehouse Stock Check State
    const [refreshingSayanStock, setRefreshingSayanStock] = useState(false);
    const [liveRequest, setLiveRequest] = useState<PurchaseRequest>(request);
    const autoCheckedRef = React.useRef<string | null>(null);

    useEffect(() => {
        setLiveRequest(request);
        // Automatically check live Sayan warehouse stock when request is opened
        if (request && request.id && autoCheckedRef.current !== request.id) {
            autoCheckedRef.current = request.id;
            handleRefreshSayanStock(true);
        }
    }, [request]);

    const handleRefreshSayanStock = async (isSilent: boolean = false) => {
        if (refreshingSayanStock) return;
        setRefreshingSayanStock(true);
        try {
            const rawItems = liveRequest.items && liveRequest.items.length > 0
                ? liveRequest.items
                : [{ id: '1', itemName: liveRequest.itemName, quantity: liveRequest.quantity, unit: liveRequest.unit }];

            const updatedItems = [];
            for (const it of rawItems) {
                const queryName = it.itemName || liveRequest.itemName || '';
                const itemCode = it.sayanItemCode || it.itemCode || '';
                const matchRes = await matchSayanPart(queryName, itemCode);
                if (matchRes && matchRes.matched && matchRes.part) {
                    updatedItems.push({
                        ...it,
                        sayanStock: matchRes.stock,
                        warehouseStock: matchRes.stock,
                        isAvailableInWarehouse: matchRes.stock > 0,
                        sayanMatchedItem: matchRes.part.name,
                        sayanItemCode: matchRes.part.code,
                        sayanWarehouseName: matchRes.part.warehouseName || 'انبار ملزومات و قطعات'
                    });
                } else {
                    updatedItems.push({
                        ...it,
                        sayanStock: undefined,
                        warehouseStock: undefined,
                        isAvailableInWarehouse: false,
                        sayanMatchedItem: undefined,
                        sayanItemCode: undefined,
                        sayanWarehouseName: undefined
                    });
                }
            }

            const sayanSummaryList = updatedItems.map(it => {
                if (it.sayanMatchedItem || it.sayanStock !== undefined) {
                    return (it.sayanStock && it.sayanStock > 0)
                        ? `✅ ${it.itemName}: ${it.sayanStock.toLocaleString('fa-IR')} ${it.unit} در انبار سایان`
                        : `⚠️ ${it.itemName}: عدم موجودی در انبار سایان (۰ ${it.unit})`;
                }
                return null;
            }).filter(Boolean);

            const updatedReq: PurchaseRequest = {
                ...liveRequest,
                items: updatedItems,
                sayanStock: updatedItems[0]?.sayanStock,
                sayanMatchedItem: updatedItems[0]?.sayanMatchedItem,
                sayanStockSummary: sayanSummaryList.length > 0 ? sayanSummaryList.join(' | ') : liveRequest.sayanStockSummary
            };

            setLiveRequest(updatedReq);
            await updatePurchaseRequest(updatedReq);
            onSuccess();
        } catch (err) {
            console.error("Refresh Sayan stock error:", err);
            if (!isSilent) {
                console.warn('خطا در برقراری ارتباط با وب‌سرویس انبار سایان');
            }
        } finally {
            setRefreshingSayanStock(false);
        }
    };

    const handleSharePurchaseDoc = (type: 'REQUEST' | 'PROFORMA' | 'RECEIPT') => {
        setIsSharingDoc(true);
        setSharingType(type);
        setTimeout(async () => {
            try {
                const el = document.getElementById('chat-share-purchase-doc-area');
                if (!el) throw new Error('المان چاپ یافت نشد');
                const titles = {
                    REQUEST: `درخواست خرید ${request.requestNumber}`,
                    PROFORMA: `پیش‌فاکتور منتخب درخواست ${request.requestNumber}`,
                    RECEIPT: `رسید انبار نهایی درخواست ${request.requestNumber}`
                };
                await shareElementToChat(
                    el,
                    `Purchase_${type}_${request.requestNumber}.jpg`,
                    {
                        defaultMessage: `📋 ${titles[type]} - کالا: ${request.itemName} (تعداد: ${request.quantity} ${request.unit})`,
                        title: `ارسال ${titles[type]} به گفتگو`
                    }
                );
            } catch (err) {
                console.error(err);
                alert('خطا در آماده‌سازی سند جهت ارسال به گفتگو');
            } finally {
                setIsSharingDoc(false);
                setSharingType(null);
            }
        }, 400);
    };

    const handleShareSpecificProforma = (p: PurchaseProforma) => {
        setIsSharingDoc(true);
        setSharingProforma(p);
        setTimeout(async () => {
            try {
                const el = document.getElementById('chat-share-proforma-area');
                if (!el) throw new Error('المان پیش‌فاکتور یافت نشد');
                await shareElementToChat(
                    el,
                    `Proforma_${p.number || p.id}.jpg`,
                    {
                        defaultMessage: `پیش‌فاکتور خرید کالا - تامین‌کننده: ${p.vendorName} (${formatCurrency(p.totalAmount)} ریال) مربوط به درخواست ${request.requestNumber}`,
                        title: 'ارسال پیش‌فاکتور به گفتگو'
                    }
                );
            } catch (err) {
                console.error(err);
                alert('خطا در آماده‌سازی پیش‌فاکتور جهت ارسال به گفتگو');
            } finally {
                setIsSharingDoc(false);
                setSharingProforma(null);
            }
        }, 400);
    };

    const handleAction = async (nextStatus: PurchaseRequestStatus, extra: any = {}, actionLabel?: string) => {
        setActionLoading(true);
        try {
            const nowIso = new Date().toISOString();
            const newAuditLog: PurchaseAuditLog = {
                id: generateUUID(),
                stage: nextStatus,
                action: actionLabel || extra.actionName || `انتقال به مرحله ${nextStatus}`,
                performedBy: currentUser.fullName,
                role: currentUser.role,
                timestamp: nowIso,
                comment: extra.comment || extra.returnReason || extra.notes || extra.technicalReport || extra.qcDescription || ''
            };

            const updated = { 
                ...request, 
                status: nextStatus, 
                updatedAt: Date.now(), 
                auditLogs: [...(request.auditLogs || []), newAuditLog],
                ...extra 
            };
            
            // Approval Trails logic
            if (nextStatus === PurchaseRequestStatus.PENDING_FACTORY) updated.approverTechnical = currentUser.fullName;
            if (nextStatus === PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION) updated.approverFactory = currentUser.fullName;
            
            if (nextStatus === PurchaseRequestStatus.PENDING_TEHRAN_PURCHASING) updated.approverCommercial = currentUser.fullName;
            if (nextStatus === PurchaseRequestStatus.PENDING_FACTORY_PURCHASING) updated.approverCommercial = currentUser.fullName;
            
            if (nextStatus === PurchaseRequestStatus.PENDING_CEO_INITIAL) updated.approverCommercial = currentUser.fullName;
            if (nextStatus === PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA) updated.approverCeoInitial = currentUser.fullName;
            if (nextStatus === PurchaseRequestStatus.PENDING_SECURITY_ENTRY) {
                if (request.status === PurchaseRequestStatus.PENDING_CEO_SELECTION) updated.approverCeoSelection = currentUser.fullName;
                if (request.status === PurchaseRequestStatus.PENDING_FACTORY_MANAGER_SELECTION) updated.approverFactorySelection = currentUser.fullName;
            }
            
            if (nextStatus === PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE) updated.approverQc = currentUser.fullName;
            if (nextStatus === PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT) updated.approverFactoryFinal = currentUser.fullName;
            if (nextStatus === PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN) updated.approverWarehouseReceipt = currentUser.fullName;
            if (nextStatus === PurchaseRequestStatus.COMPLETED) updated.approverFactoryArchive = currentUser.fullName;
            
            await updatePurchaseRequest(updated);
            onSuccess();
            onClose();
        } catch (e) { alert('خطا در عملیات'); console.error(e); }
        finally { setActionLoading(false); }
    };

    const handleDelete = async () => {
        if (!confirm('آیا از حذف این درخواست اطمینان دارید؟ این عمل غیرقابل بازگشت است.')) return;
        setActionLoading(true);
        try {
            await deletePurchaseRequest(request.id);
            onSuccess();
            onClose();
        } catch (e) {
            alert('خطا در حذف درخواست');
            console.error(e);
        } finally {
            setActionLoading(false);
        }
    };

    const isCurrentStep = (step: PurchaseRequestStatus) => {
        const normActual = normalizePurchaseStatus(request.status);
        const normTarget = normalizePurchaseStatus(step);
        return normActual === normTarget;
    };

    const isRole = (roleName: string) => {
        if (currentUser.role === roleName) return true;
        if (currentUser.roles && currentUser.roles.includes(roleName)) return true;
        return false;
    };

    const isAdmin = isRole(UserRole.ADMIN);
    const canViewProformas = canUserViewProformas(currentUser, request, settings);

    const hasPurchasePerm = (perm: string) => {
        return checkPurchasePermission(currentUser, perm, settings, request);
    };

    const canUserApproveCurrentStep = (): boolean => {
        if (!request || !currentUser) return false;
        if (isAdmin) return true;

        const norm = normalizePurchaseStatus(request.status);

        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_SHIFT_LEADER)) {
            return hasPurchasePerm('canApproveShiftLeader');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_TECHNICAL) || norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_REPAIR_INSPECTION)) {
            return hasPurchasePerm('canApproveTechnical');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER) || norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_WAREHOUSE_CHECK)) {
            return hasPurchasePerm('canApproveWarehouseKeeper') || hasPurchasePerm('canManageParts');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION) || norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY) || norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_DECISION)) {
            return hasPurchasePerm('canApproveFactoryDecision') || hasPurchasePerm('canApproveFactory');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_CEO_INITIAL)) {
            return hasPurchasePerm('canApproveCEO');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA)) {
            return hasPurchasePerm('canManageProformas') || hasPurchasePerm('canApproveTehranPurchasing') || hasPurchasePerm('canApproveCommercialManager');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER)) {
            return hasPurchasePerm('canApproveCommercialManager') || hasPurchasePerm('canCommercialFinalize');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_CEO_SELECTION)) {
            return hasPurchasePerm('canSelectProforma') || hasPurchasePerm('canApproveCEO');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING) || norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_PURCHASING) || norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_PROFORMA)) {
            return hasPurchasePerm('canManageZanjanPurchasing') || hasPurchasePerm('canManageProformas');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL) || norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_MANAGER_SELECTION)) {
            return hasPurchasePerm('canApproveFactory');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_BUYER_EXECUTION)) {
            return hasPurchasePerm('canExecuteBuyerZanjan') || hasPurchasePerm('canManageProformas');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL)) {
            return hasPurchasePerm('canApproveTechnical');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL)) {
            return hasPurchasePerm('canApproveFactory');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_SECURITY_ENTRY)) {
            return hasPurchasePerm('canRegisterEntry');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_QC)) {
            return hasPurchasePerm('canCheckQC');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE)) {
            return hasPurchasePerm('canApproveFactory') || hasPurchasePerm('canApproveFactoryFinal');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT)) {
            return hasPurchasePerm('canWarehouseFinalize') || hasPurchasePerm('canApproveWarehouseKeeper');
        }
        if (norm === normalizePurchaseStatus(PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN)) {
            return hasPurchasePerm('canApproveFactory') || hasPurchasePerm('canApproveFactoryFinal');
        }

        return false;
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000005] flex items-stretch sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-white dark:bg-gray-900 rounded-none sm:rounded-[2rem] w-full max-w-full lg:max-w-6xl xl:max-w-7xl overflow-hidden shadow-2xl border-0 sm:border border-white/20 animate-in fade-in zoom-in h-[100dvh] max-h-[100dvh] sm:h-auto sm:min-h-[60vh] sm:max-h-[92vh] flex flex-col relative">
                {/* Ultra-Compact Mobile Header */}
                <div className="px-3 py-2 sm:p-4 md:p-5 border-b flex justify-between items-center bg-gradient-to-r from-indigo-700 via-indigo-800 to-purple-900 text-white shrink-0 z-20 shadow-md gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="p-1.5 sm:p-2.5 bg-white/10 rounded-xl shrink-0">
                             <ShoppingCart size={18} className="sm:hidden" />
                             <ShoppingCart size={24} className="hidden sm:block" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xs sm:text-base md:text-xl font-black truncate">گردش کار درخواست خرید</h2>
                                <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-md font-mono font-bold shrink-0">{request.requestNumber}</span>
                            </div>
                            <p className="text-[10px] opacity-90 truncate font-bold mt-0.5">{request.status}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && (
                            <button 
                                onClick={() => setShowAdminEditModal(true)}
                                className="p-1.5 sm:p-2 bg-blue-500/20 hover:bg-blue-500/40 text-white rounded-xl transition-all flex items-center gap-1.5 text-[10px] md:text-xs font-bold ring-1 ring-white/20"
                                title="ویرایش مدیریت"
                            >
                                <Edit size={15} />
                                <span className="hidden md:inline">ویرایش مدیریت</span>
                            </button>
                        )}
                        <button 
                            onClick={handleDelete} 
                            disabled={actionLoading}
                            className="p-1.5 sm:p-2 bg-red-500/20 hover:bg-red-500/40 text-white rounded-xl transition-all flex items-center gap-1.5 text-[10px] md:text-xs font-bold ring-1 ring-white/20"
                            title="حذف درخواست"
                        >
                            <Trash2 size={15} />
                            <span className="hidden md:inline">حذف</span>
                        </button>
                        <button onClick={onClose} className="p-1.5 sm:p-2 bg-red-500/30 hover:bg-red-500 rounded-xl transition-all text-white border border-white/20"><X size={18} strokeWidth={2.5} /></button>
                    </div>
                </div>
                
                {showAdminEditModal && (
                    <AdminEditRequestModal 
                        request={request} 
                        onClose={() => setShowAdminEditModal(false)} 
                        onSuccess={() => { onSuccess(); onClose(); }}
                        parts={parts}
                    />
                )}

                {/* Ultra-Compact Single-Line Sub-header Navigation Tabs */}
                <div className="grid grid-cols-2 sm:flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-2 sm:px-6 gap-1 sm:gap-2 pt-1 sm:pt-2 shrink-0 z-20">
                    <button
                        type="button"
                        onClick={() => setModalTab('DETAILS')}
                        className={`py-2 px-2 sm:px-4 text-[11px] sm:text-xs md:text-sm font-black border-b-2 transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer whitespace-nowrap ${
                            modalTab === 'DETAILS'
                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        <Package size={14} className="shrink-0" />
                        <span className="truncate">مشخصات، اقلام و گردش کار</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setModalTab('COMMENTS')}
                        className={`py-2 px-2 sm:px-4 text-[11px] sm:text-xs md:text-sm font-black border-b-2 transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer whitespace-nowrap relative ${
                            modalTab === 'COMMENTS'
                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        <MessageSquare size={14} className="shrink-0" />
                        <span className="truncate">نظرات و کامنت‌ها</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                            (request.comments?.length || 0) > 0 
                                ? 'bg-indigo-600 text-white shadow-xs' 
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        }`}>
                            {request.comments?.length || 0}
                        </span>
                    </button>
                </div>

                {modalTab === 'COMMENTS' ? (
                    <div 
                        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 bg-gray-50/50 dark:bg-gray-950/40 custom-scrollbar overscroll-y-auto space-y-3 sm:space-y-4"
                        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                    >
                        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
                            <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-900/40 p-3 sm:p-4 rounded-2xl sm:rounded-3xl flex flex-wrap justify-between items-center gap-2 sm:gap-3 shadow-xs">
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400">درخواست خرید شماره:</div>
                                    <div className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400">{request.requestNumber} - {request.itemName}</div>
                                </div>
                                <div className="text-[11px] sm:text-xs text-gray-500 flex flex-wrap items-center gap-2 sm:gap-3">
                                    <span>متقاضی: <strong className="text-gray-800 dark:text-gray-200 font-black">{request.requester || '---'}</strong></span>
                                    <span>تاریخ: <strong className="font-bold">{formatDate(request.date)}</strong></span>
                                    <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-indigo-100 dark:border-indigo-900">
                                        {request.status}
                                    </span>
                                </div>
                            </div>
                            <PurchaseCommentsSection request={request} currentUser={currentUser} onSuccess={onSuccess} settings={settings} />
                        </div>
                    </div>
                ) : (
                <div 
                    className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2.5 sm:p-4 md:p-6 space-y-3 sm:space-y-5 bg-gray-50/50 dark:bg-gray-950/40 custom-scrollbar overscroll-y-auto"
                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
                        <div className="lg:col-span-2 space-y-3 sm:space-y-6">
                            {/* Core Info & Items List */}
                            <div className="glass-panel p-3 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2.5 mb-3 sm:mb-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="text-xs sm:text-sm font-black text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                            <Package className="text-indigo-500 shrink-0" size={16}/> 
                                            <span>مشخصات و اقلام درخواستی</span>
                                            {request.items && request.items.length > 0 && (
                                                <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                    {request.items.length} قلم کالا
                                                </span>
                                            )}
                                        </h3>
                                        <span className="sm:hidden text-[10px] font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-gray-500 font-bold">{request.requestNumber}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <button 
                                            type="button"
                                            onClick={() => handleRefreshSayanStock(false)} 
                                            disabled={refreshingSayanStock}
                                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl transition-all flex items-center gap-1 text-[10px] font-bold shadow-2xs active:scale-95 cursor-pointer border border-emerald-200 dark:border-emerald-800 whitespace-nowrap"
                                            title="استعلام لحظه‌ای و مجدد موجودی قطعات این درخواست از انبار سایان"
                                        >
                                            <RefreshCw size={12} className={`text-emerald-600 dark:text-emerald-400 shrink-0 ${refreshingSayanStock ? 'animate-spin' : ''}`} />
                                            <span>{refreshingSayanStock ? 'در حال استعلام...' : 'استعلام موجودی سایان'}</span>
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setModalTab('COMMENTS')} 
                                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl transition-all flex items-center gap-1 text-[10px] font-bold shadow-2xs active:scale-95 cursor-pointer border border-indigo-200 dark:border-indigo-800 whitespace-nowrap"
                                            title="مشاهده بخش کامنت‌ها و نظرات این درخواست"
                                        >
                                            <MessageSquare size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                                            <span>نظرات ({request.comments?.length || 0})</span>
                                        </button>
                                        <button 
                                            onClick={() => setShowAiAdvisorModal(true)} 
                                            className="px-2.5 py-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl transition-all flex items-center gap-1 text-[10px] font-bold shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                                            title="استعلام هوشمند قیمت و تامین‌کنندگان با هوش مصنوعی"
                                        >
                                            <Sparkles size={12} className="text-yellow-300 animate-pulse shrink-0" />
                                            <span>استعلام هوشمند (AI)</span>
                                        </button>
                                        <span className="hidden sm:inline-block text-[10px] font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-gray-500 font-bold uppercase">{request.requestNumber}</span>
                                    </div>
                                </div>

                                {/* General Details Header */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 dark:bg-gray-800/40 p-3 rounded-2xl mb-4 text-xs border border-gray-100 dark:border-gray-800">
                                    <div>
                                        <span className="text-[10px] text-gray-400 block font-bold">متقاضی:</span>
                                        <span className="font-black text-gray-800 dark:text-gray-200">{request.requester || '---'}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-gray-400 block font-bold">تاریخ ثبت:</span>
                                        <span className="font-bold text-gray-700 dark:text-gray-300">{formatDate(request.date)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-gray-400 block font-bold">اولویت:</span>
                                        <span className={`font-black ${((request as any).priority || request.urgency) === 'فوری' ? 'text-red-500' : 'text-blue-600'}`}>
                                            {(request as any).priority || request.urgency || 'عادی'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-gray-400 block font-bold">دسته بندی کلی:</span>
                                        <span className="font-bold text-gray-700 dark:text-gray-300 truncate block">{request.category || 'عمومی'}</span>
                                    </div>
                                </div>

                                {/* Items: Mobile Card Layout (No horizontal scrolling) */}
                                {(liveRequest.items || request.items) && (liveRequest.items || request.items).length > 0 ? (
                                    <div className="space-y-3">
                                        <div className="block md:hidden space-y-2.5">
                                            {(liveRequest.items || request.items).map((it: any, idx: number) => {
                                                const matchedPart = parts.find(p => (it.partId && p.id === it.partId) || (p.name && it.itemName && p.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()) || (it.itemCode && (p.id === it.itemCode || (p as any).code === it.itemCode)));
                                                const partForSheet: PartMasterData = matchedPart || {
                                                    id: it.partId || it.itemCode || generateUUID(),
                                                    name: it.itemName,
                                                    unit: it.unit || request.unit || 'عدد',
                                                    dimensions: it.specifications || '',
                                                    type: 'قطعات',
                                                    category: request.category || 'عمومی',
                                                    subCategory: '',
                                                    currentStock: it.sayanStock || it.warehouseStock || 0,
                                                    minStock: 0
                                                };

                                                return (
                                                    <div key={it.id || idx} className="p-3 bg-indigo-50/40 dark:bg-gray-800/60 border border-indigo-100 dark:border-gray-700 rounded-2xl space-y-2">
                                                        <div className="flex justify-between items-center border-b border-indigo-100/60 dark:border-gray-700 pb-1.5">
                                                            <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                                                                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-mono">{idx + 1}</span>
                                                                <span className="text-gray-800 dark:text-gray-200">{it.itemName}</span>
                                                            </span>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-xs font-black text-indigo-600 bg-white dark:bg-gray-900 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-gray-700">
                                                                    {it.quantity} {it.unit}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Sayan Live Stock Banner in Mobile */}
                                                        {(it.sayanStock !== undefined || it.warehouseStock !== undefined) && (
                                                            <div className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                                                                (it.sayanStock || it.warehouseStock || 0) > 0 
                                                                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200' 
                                                                    : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                                                            }`}>
                                                                <span className="text-[11px] font-bold flex items-center gap-1.5">
                                                                    <Package size={13} className={(it.sayanStock || it.warehouseStock || 0) > 0 ? "text-emerald-600" : "text-amber-600"} />
                                                                    <span>موجودی انبار سایان:</span>
                                                                </span>
                                                                <span className={`font-black text-xs px-2 py-0.5 rounded-lg border ${
                                                                    (it.sayanStock || it.warehouseStock || 0) > 0 
                                                                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' 
                                                                        : 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                                                }`}>
                                                                    {(it.sayanStock || it.warehouseStock || 0) > 0 
                                                                        ? `${(it.sayanStock || it.warehouseStock || 0).toLocaleString('fa-IR')} ${it.unit} ✅` 
                                                                        : `عدم موجودی (۰ ${it.unit}) ⚠️`}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {it.specifications && (
                                                            <div className="text-[11px] text-gray-600 dark:text-gray-400 bg-white/70 dark:bg-gray-900/60 p-2 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                                                <span className="font-bold text-gray-400 text-[10px] block mb-0.5">مشخصات فنی / ابعاد:</span>
                                                                <p className="leading-relaxed">{it.specifications}</p>
                                                            </div>
                                                        )}
                                                        {it.itemCode && (
                                                            <div className="text-[10px] font-mono text-gray-400">کد کالا: {it.itemCode}</div>
                                                        )}
                                                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-indigo-100/40 dark:border-gray-700">
                                                            <button 
                                                                type="button" 
                                                                onClick={() => setViewingPartDataSheet(partForSheet)}
                                                                className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 px-2.5 py-1 rounded-lg flex items-center gap-1 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer"
                                                                title="مشاهده شناسنامه فنی، مشخصات، ابعاد و پیوست‌های کالا"
                                                            >
                                                                <Info size={11} className="text-indigo-600 dark:text-indigo-400" />
                                                                <span>جزئیات و شناسنامه کالا</span>
                                                            </button>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => {
                                                                    setAiAdvisorInitialIndex(idx);
                                                                    setShowAiAdvisorModal(true);
                                                                }}
                                                                className="text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 px-2 py-1 rounded-lg flex items-center gap-1 border border-purple-200 dark:border-purple-800 transition-all cursor-pointer"
                                                                title="استعلام هوشمند برای این قلم"
                                                            >
                                                                <Sparkles size={11} className="text-yellow-500" />
                                                                <span>استعلام AI</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Desktop Table View */}
                                        <div className="hidden md:block overflow-hidden border border-gray-200 dark:border-gray-800 rounded-2xl">
                                            <table className="w-full text-xs text-right">
                                                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-black">
                                                    <tr>
                                                        <th className="p-3 w-12 text-center">ردیف</th>
                                                        <th className="p-3">نام قطعه / کالا</th>
                                                        <th className="p-3 w-24 text-center">تعداد / مقدار</th>
                                                        <th className="p-3 w-36 text-center">موجودی انبار سایان</th>
                                                        <th className="p-3">مشخصات فنی و ابعاد</th>
                                                        <th className="p-3 w-32 text-center">شناسنامه کالا</th>
                                                        <th className="p-3 w-32 text-center">استعلام و تامین‌کننده</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {(liveRequest.items || request.items).map((it: any, idx: number) => {
                                                        const matchedPart = parts.find(p => (it.partId && p.id === it.partId) || (p.name && it.itemName && p.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()) || (it.itemCode && (p.id === it.itemCode || (p as any).code === it.itemCode)));
                                                        const partForSheet: PartMasterData = matchedPart || {
                                                            id: it.partId || it.itemCode || generateUUID(),
                                                            name: it.itemName,
                                                            unit: it.unit || request.unit || 'عدد',
                                                            dimensions: it.specifications || '',
                                                            type: 'قطعات',
                                                            category: request.category || 'عمومی',
                                                            subCategory: '',
                                                            currentStock: it.sayanStock || it.warehouseStock || 0,
                                                            minStock: 0
                                                        };

                                                        const stockVal = it.sayanStock !== undefined ? it.sayanStock : it.warehouseStock;

                                                        return (
                                                            <tr key={it.id || idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                                                                <td className="p-3 text-center font-mono font-bold text-gray-400">{idx + 1}</td>
                                                                <td className="p-3 font-black text-gray-800 dark:text-gray-200">
                                                                    <div>{it.itemName}</div>
                                                                    {it.itemCode && <div className="text-[10px] font-mono text-gray-400 font-normal">کد: {it.itemCode}</div>}
                                                                </td>
                                                                <td className="p-3 text-center font-black text-indigo-600">{it.quantity} {it.unit}</td>
                                                                {/* Sayan Stock Column */}
                                                                <td className="p-3 text-center">
                                                                    {stockVal !== undefined && stockVal !== null ? (
                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border ${
                                                                                stockVal > 0 
                                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' 
                                                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                                                            }`}>
                                                                                {stockVal > 0 ? (
                                                                                    <>
                                                                                        <Check size={12} className="text-emerald-600 font-black" />
                                                                                        <span>{stockVal.toLocaleString('fa-IR')} {it.unit}</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <AlertTriangle size={12} className="text-amber-600" />
                                                                                        <span>عدم موجودی (۰)</span>
                                                                                    </>
                                                                                )}
                                                                            </span>
                                                                            <span className="text-[9px] text-gray-400 font-bold truncate max-w-[130px]" title={it.sayanWarehouseName || 'انبار ملزومات و قطعات'}>
                                                                                {it.sayanMatchedItem ? `سایان: ${it.sayanMatchedItem}` : (it.sayanWarehouseName || 'انبار ملزومات')}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => handleRefreshSayanStock(false)}
                                                                            className="text-[10px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 font-bold"
                                                                        >
                                                                            استعلام سایان
                                                                        </button>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 text-gray-600 dark:text-gray-400">{it.specifications || '---'}</td>
                                                                <td className="p-3 text-center">
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={() => setViewingPartDataSheet(partForSheet)}
                                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-all active:scale-95 cursor-pointer shadow-2xs"
                                                                        title="مشاهده شناسنامه فنی، مشخصات، ابعاد و پیوست‌های کالا"
                                                                    >
                                                                        <Info size={12} className="text-indigo-600 dark:text-indigo-400" />
                                                                        <span>نمایش جزئیات کالا</span>
                                                                    </button>
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={() => {
                                                                            setAiAdvisorInitialIndex(idx);
                                                                            setShowAiAdvisorModal(true);
                                                                        }}
                                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-black text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 rounded-xl border border-purple-200 dark:border-purple-800 transition-all active:scale-95 cursor-pointer"
                                                                        title="استعلام هوشمند قیمت و تامین‌کنندگان این قلم"
                                                                    >
                                                                        <Sparkles size={12} className="text-yellow-500" />
                                                                        <span>استعلام این قلم</span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="text-[10px] font-bold text-gray-400 block mb-1">نام قطعه / کالا:</label><p className="text-sm font-black text-gray-800 dark:text-gray-200">{request.itemName}</p></div>
                                        <div><label className="text-[10px] font-bold text-gray-400 block mb-1">تعداد درخواستی:</label><p className="text-lg font-black text-indigo-600">{request.quantity} {request.unit}</p></div>
                                        <div className="col-span-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-gray-400 block mb-1">مشخصات فنی و ملاحظات:</label>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium leading-relaxed">{request.specifications || '---'}</p>
                                            </div>
                                            {(() => {
                                                const matchedPart = parts.find(p => (p.name && request.itemName && p.name.trim().toLowerCase() === request.itemName.trim().toLowerCase()));
                                                const partForSheet: PartMasterData = matchedPart || {
                                                    id: generateUUID(),
                                                    name: request.itemName,
                                                    unit: request.unit || 'عدد',
                                                    dimensions: request.specifications || '',
                                                    type: 'قطعات',
                                                    category: request.category || 'عمومی',
                                                    subCategory: '',
                                                    currentStock: 0,
                                                    minStock: 0
                                                };
                                                return (
                                                    <button 
                                                        type="button"
                                                        onClick={() => setViewingPartDataSheet(partForSheet)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-indigo-700 bg-white dark:bg-gray-900 hover:bg-indigo-50 dark:hover:bg-gray-800 rounded-xl border border-indigo-200 dark:border-gray-700 transition-all shadow-sm shrink-0 cursor-pointer"
                                                        title="مشاهده شناسنامه فنی، ابعاد و پیوست‌های کالا"
                                                    >
                                                        <Info size={14} className="text-indigo-600 dark:text-indigo-400" />
                                                        <span>نمایش جزئیات کالا</span>
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {/* Request-Level Attachments Preview & Download */}
                                {((request.attachments && request.attachments.length > 0) || (request as any).attachment || request.pdfAttachment) && (
                                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                                        <label className="text-[10px] font-black text-gray-400 block mb-2 flex items-center gap-1.5">
                                            <Paperclip size={12} className="text-indigo-500" />
                                            <span>فایل‌ها و مدارک پیوست این درخواست (مشاهده و دانلود):</span>
                                        </label>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {request.attachments?.map((att: any, attIdx: number) => {
                                                const attUrl = att.url || att.fileUrl || '';
                                                const attName = att.name || att.fileName || `پیوست_${attIdx + 1}_${request.requestNumber}`;
                                                return (
                                                    <div key={att.id || attIdx} className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 rounded-xl p-1 shadow-2xs">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewFile({ url: resolveImageUrl(attUrl), fileName: attName })}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                                            title="مشاهده و پیش‌نمایش فایل پیوست"
                                                        >
                                                            <Eye size={13} />
                                                            <span className="max-w-[160px] truncate">{attName}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => downloadAndOpenFile(resolveImageUrl(attUrl), attName)}
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                                                            title="دانلود فایل پیوست"
                                                        >
                                                            <Download size={12} />
                                                            <span>دانلود</span>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {(request as any).attachment && !request.attachments?.some((a: any) => (a.url || a.fileUrl) === (request as any).attachment) && (
                                                <div className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 rounded-xl p-1 shadow-2xs">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewFile({ url: resolveImageUrl((request as any).attachment!), fileName: `پیوست_${request.requestNumber}` })}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                                    >
                                                        <Eye size={13} />
                                                        <span>مشاهده فایل اصلی پیوست</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => downloadAndOpenFile(resolveImageUrl((request as any).attachment!), `پیوست_${request.requestNumber}`)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                                                    >
                                                        <Download size={12} />
                                                        <span>دانلود</span>
                                                    </button>
                                                </div>
                                            )}
                                            {request.pdfAttachment && (
                                                <div className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 rounded-xl p-1 shadow-2xs">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewFile({ url: resolveImageUrl(request.pdfAttachment!), fileName: `کاتالوگ_${request.requestNumber}.pdf` })}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 hover:bg-red-100 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                                    >
                                                        <FileText size={13} />
                                                        <span>مشاهده کاتالوگ فنی</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => downloadAndOpenFile(resolveImageUrl(request.pdfAttachment!), `کاتالوگ_${request.requestNumber}.pdf`)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                                                    >
                                                        <Download size={12} />
                                                        <span>دانلود PDF</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Proformas */}
                            {!canViewProformas ? (
                                <div className="glass-panel p-6 rounded-3xl border border-amber-200/80 dark:border-amber-900/60 bg-gradient-to-br from-amber-50/60 via-white to-gray-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-850 shadow-sm overflow-hidden relative">
                                    <div className="flex items-start sm:items-center gap-3.5 text-right" dir="rtl">
                                        <div className="p-3 bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 rounded-2xl shrink-0 border border-amber-200/50 dark:border-amber-900/50">
                                            <ShieldAlert size={26} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-black text-amber-900 dark:text-amber-200">
                                                    محدودیت دسترسی به پیش‌فاکتورها و مبالغ استعلام
                                                </h4>
                                                <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                                                    <Lock size={10} />
                                                    محرمانه
                                                </span>
                                            </div>
                                            <p className="text-xs text-amber-800/80 dark:text-amber-400/80 mt-1.5 leading-relaxed">
                                                مشاهده پیش‌فاکتورها، فایل‌های استعلام قیمت و مبالغ خرید منحصراً در اختیار مدیریت (مدیر بازرگانی، مدیرعامل و مدیر مالی) و در خریدهای کارخانه در اختیار مسئول خرید و مدیر کارخانه است.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                            <div className="glass-panel p-6 rounded-3xl border border-indigo-100 bg-white shadow-sm overflow-hidden relative">
                                <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                                    <h3 className="text-sm font-black text-gray-800 flex items-center gap-2"><FileText className="text-indigo-500" size={18}/> پیش‌فاکتورها و استعلام‌ها</h3>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setShowAiAdvisorModal(true)} 
                                            className="text-xs font-black bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-xl shadow-md shadow-purple-500/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                                            title="استعلام هوشمند قیمت و تامین‌کنندگان با هوش مصنوعی"
                                        >
                                            <Sparkles size={14} className="text-yellow-300 animate-pulse" />
                                            <span>استعلام هوشمند با AI</span>
                                        </button>
                                        {(
                                            isCurrentStep(PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA) || 
                                            isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_PROFORMA) || 
                                            isCurrentStep(PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING) ||
                                            isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_PURCHASING) ||
                                            isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL) ||
                                            isCurrentStep(PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER)
                                        ) && (
                                            isAdmin || 
                                            hasPurchasePerm('canManageProformas') || 
                                            hasPurchasePerm('canManageZanjanPurchasing') || 
                                            hasPurchasePerm('canExecuteBuyerZanjan') ||
                                            hasPurchasePerm('canApproveFactory')
                                        ) && (
                                            <button 
                                                onClick={() => { setPrefilledProformaData(null); setShowProformaModal(true); }} 
                                                className="text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all cursor-pointer"
                                            >
                                                <Plus size={14}/> ثبت پیش‌فاکتور جدید
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                {request.proformas.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-300 gap-2 border-2 border-dashed border-gray-100 rounded-2xl">
                                        <FileText size={40} className="opacity-20" />
                                        <p className="text-xs font-bold italic">هنوز پیش‌فاکتوری ثبت نشده است</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {request.proformas.map((p: PurchaseProforma) => (
                                            <div key={p.id} className={`p-4 rounded-2xl border-2 transition-all ${p.isChosen ? 'border-green-500 bg-green-50/50 shadow-md ring-2 ring-green-200 dark:ring-green-900/40' : 'border-gray-100 hover:border-indigo-100 bg-gray-50/30'}`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="text-xs font-black text-gray-800 dark:text-gray-200">{p.vendorName}</p>
                                                        <p className="text-[10px] text-gray-500 font-bold">{p.number || 'بدون شماره'} | {formatDate(p.date)}</p>
                                                    </div>
                                                    {p.isChosen && (
                                                        <span className="bg-green-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                                                            <CheckCircle size={10} />
                                                            پیش‌فاکتور منتخب
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Proforma Attachments Preview */}
                                                {p.attachments && p.attachments.length > 0 && (
                                                    <div className="mb-3 p-2 bg-white/80 dark:bg-gray-800/80 rounded-xl border border-indigo-100 dark:border-gray-700 flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                                                            <Paperclip size={11} className="text-indigo-500" />
                                                            <span>فایل پیش‌فاکتور:</span>
                                                        </span>
                                                        {p.attachments.map((att: any, attIdx: number) => (
                                                            <button
                                                                key={att.id || attIdx}
                                                                type="button"
                                                                onClick={() => setPreviewFile({ url: att.url, fileName: att.name || `پیش‌فاکتور_${p.vendorName}` })}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                                                                title="مشاهده و پیش‌نمایش فایل پیش‌فاکتور"
                                                            >
                                                                <Eye size={11}/>
                                                                <span className="max-w-[120px] truncate">{att.name || 'مشاهده پیش‌فاکتور'}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-800 pt-3">
                                                    <span className="text-sm font-black text-indigo-700 dark:text-indigo-300">{formatCurrency(p.totalAmount)} <span className="text-[9px]">ریال</span></span>
                                                    <div className="flex gap-1 items-center">
                                                        <button 
                                                            onClick={() => setViewingProformaDetails(p)}
                                                            className="p-2 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50" 
                                                            title="مشاهده جزئیات و سند پیش‌فاکتور"
                                                        >
                                                            <Eye size={14}/>
                                                        </button>
                                                        {(
                                                            isCurrentStep(PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA) || 
                                                            isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_PROFORMA) || 
                                                            isCurrentStep(PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING) ||
                                                            isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_PURCHASING) ||
                                                            isAdmin
                                                        ) && (
                                                            <button 
                                                                onClick={() => {
                                                                    setPrefilledProformaData(p);
                                                                    setShowProformaModal(true);
                                                                }}
                                                                className="p-2 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-50" 
                                                                title="ویرایش پیش‌فاکتور"
                                                            >
                                                                <Edit size={14}/>
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => {
                                                                setPrintingProforma(p);
                                                                setTimeout(() => window.print(), 300);
                                                            }}
                                                            className="p-2 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50" title="چاپ پیش‌فاکتور"
                                                        >
                                                            <Printer size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleShareSpecificProforma(p)}
                                                            className="p-2 border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-50" 
                                                            title="ارسال پیش‌فاکتور به گفتگو"
                                                        >
                                                            <MessageSquare size={14}/>
                                                        </button>
                                                        {(
                                                            isAdmin || 
                                                            hasPurchasePerm('canSelectProforma') || 
                                                            hasPurchasePerm('canApproveFactory') ||
                                                            hasPurchasePerm('canApproveCommercialManager')
                                                        ) && !p.isChosen && (
                                                            <button 
                                                                onClick={() => {
                                                                    const isZanjanRoute = request.location === 'Factory' || request.location === 'Zanjan' || 
                                                                        (typeof request.status === 'string' && (request.status.includes('FACTORY') || request.status.includes('ZANJAN')));
                                                                    
                                                                    if(confirm(`آیا پیش‌فاکتور «${p.vendorName}» را به عنوان گزینه منتخب تعیین می‌فرمایید؟`)) {
                                                                        const updated = request.proformas.map(x => ({ ...x, isChosen: x.id === p.id }));
                                                                        
                                                                        // If currently in Factory manager review, update proformas directly
                                                                        if (isZanjanRoute) {
                                                                            handleAction(request.status, { proformas: updated }, `تایید و انتخاب پیش‌فاکتور منتخب (${p.vendorName}) توسط مدیر کارخانه`);
                                                                        } else {
                                                                            // Tehran flow
                                                                            handleAction(request.status, { proformas: updated }, `تایید و انتخاب پیش‌فاکتور منتخب (${p.vendorName})`);
                                                                        }
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1"
                                                                title="تایید و انتخاب این پیش‌فاکتور به عنوان گزینه نهایی"
                                                            >
                                                                <Check size={12} />
                                                                تایید و انتخاب
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}

                            {/* Arrival & QC Details */}
                            {(request.entryQuantity || request.qcResult) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="glass-panel p-6 rounded-3xl border border-orange-100 bg-white">
                                        <h3 className="text-sm font-black text-gray-800 mb-4 flex items-center gap-2"><Truck className="text-orange-500" size={18}/> اطلاعات ورود (انتظامات)</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-xs border-b pb-2"><span className="text-gray-500">تعداد ورودی:</span> <span className="font-black text-orange-700">{request.entryQuantity} {request.unit}</span></div>
                                            <div className="flex justify-between text-xs border-b pb-2"><span className="text-gray-500">وزن ورودی:</span> <span className="font-bold">{request.entryWeight || '-'} کیلوگرم</span></div>
                                            <div className="flex justify-between text-xs"><span className="text-gray-500">زمان ورود:</span> <span className="font-bold">{request.entryDate} {request.entryTime}</span></div>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-6 rounded-3xl border border-green-100 bg-white">
                                        <h3 className="text-sm font-black text-gray-800 mb-4 flex items-center gap-2"><ShieldCheck className="text-green-500" size={18}/> کنترل کیفی (QC)</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-xs border-b pb-2"><span className="text-gray-500">نتیجه بررسی:</span> <span className={`font-black ${request.qcResult === 'تایید' ? 'text-green-600' : 'text-red-500'}`}>{request.qcResult || 'در انتظار'}</span></div>
                                            <div className="flex flex-col gap-1 text-xs"><span className="text-gray-500">ملاحظات کیفی:</span> <p className="text-[10px] bg-gray-50 p-2 rounded-lg italic">{request.qcDescription || 'فاقد ملاحظات'}</p></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-6">
                                <PurchaseCommentsSection request={request} currentUser={currentUser} onSuccess={onSuccess} settings={settings} />
                            </div>
                        </div>

                        {/* Sidebar Approvals */}
                        <div className="space-y-6">
                             <div className="glass-panel p-6 rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                                <h3 className="text-sm font-black text-gray-800 mb-6 border-b pb-3 border-gray-100 flex items-center gap-2"><ClipboardCheck className="text-indigo-500" size={18}/> تاریخچه و لاگ‌های سیستم</h3>
                                <div className="space-y-6 relative before:absolute before:right-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 max-h-96 overflow-y-auto pl-2 no-scrollbar">
                                    {(request.auditLogs && request.auditLogs.length > 0 ? request.auditLogs : [
                                        { stage: request.status, action: 'ثبت درخواست اولیه', performedBy: request.requester, role: 'انبار / متقاضی', timestamp: request.date }
                                    ]).map((log: any, idx: number) => (
                                        <div key={idx} className="flex gap-4 relative pr-8">
                                            <div className="absolute right-0 w-6 h-6 rounded-lg flex items-center justify-center text-white shadow-sm z-10 bg-indigo-600">
                                                <CheckCircle size={14}/>
                                            </div>
                                            <div className="flex-1 bg-gray-50/80 p-3 rounded-2xl border border-gray-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <p className="text-[10px] font-black text-gray-800">{log.action}</p>
                                                    <span className="text-[8px] font-mono text-gray-400">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                </div>
                                                <p className="text-[9px] text-indigo-600 font-bold">{log.performedBy} ({log.role})</p>
                                                {log.comment && <p className="text-[9px] text-gray-600 mt-1 bg-white p-2 rounded-xl border border-dashed border-gray-200 italic">{log.comment}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             </div>

                             {request.image && (
                                <div className="rounded-3xl overflow-hidden border-2 border-gray-100 shadow-md group relative h-64">
                                     <CachedImage src={request.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="part" referrerPolicy="no-referrer" />
                                     <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                                         <p className="text-white text-[10px] font-bold opacity-80 line-clamp-2">{request.itemName}</p>
                                     </div>
                                </div>
                             )}
                        </div>
                    </div>

                    {/* Compact BPMN tracker placed at the bottom of the request info */}
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                        <BpmnWorkflowDiagram currentStatus={request.status} location={request.location} request={request} />
                    </div>

                    {/* Current Stage & Role Authority Notification Banner — Inside Scrollable Area so it never blocks the viewport */}
                    {(() => {
                        const getRoleInfo = (st: any) => {
                            const normSt = normalizePurchaseStatus(st);
                            switch (normSt) {
                                case PurchaseRequestStatus.PENDING_SHIFT_LEADER:
                                    return {
                                        title: 'تایید سرپرست خط و ارجاع به واحد فنی نت',
                                        roleName: 'سرپرست خط',
                                        icon: CheckSquare,
                                        badgeClass: 'bg-indigo-600 text-white',
                                        borderClass: 'border-indigo-300 bg-indigo-50/80 text-indigo-950',
                                        isCeoRole: false,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_TECHNICAL:
                                    return {
                                        title: 'بررسی و تایید فنی واحد نت',
                                        roleName: 'واحد فنی و نت',
                                        icon: Sliders,
                                        badgeClass: 'bg-indigo-700 text-white',
                                        borderClass: 'border-indigo-300 bg-indigo-50/80 text-indigo-950',
                                        isCeoRole: false,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER:
                                    return {
                                        title: 'بررسی موجودی انبار کارخانه و امکان تحویل کالا',
                                        roleName: 'انباردار قطعات / کارخانه',
                                        icon: Package,
                                        badgeClass: 'bg-emerald-600 text-white',
                                        borderClass: 'border-emerald-300 bg-emerald-50/80 text-emerald-950',
                                        isCeoRole: false,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_CEO_INITIAL:
                                    return {
                                        title: 'تایید اولیه و مجوز اخذ استعلام',
                                        roleName: 'مدیرعامل',
                                        icon: Crown,
                                        badgeClass: 'bg-sky-500 text-white',
                                        borderClass: 'border-sky-300 bg-sky-50/80 text-sky-950',
                                        isCeoRole: true,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_CEO_SELECTION:
                                    return {
                                        title: 'تایید و انتخاب نهایی تامین‌کننده / پیش‌فاکتور',
                                        roleName: 'مدیرعامل',
                                        icon: Crown,
                                        badgeClass: 'bg-sky-600 text-white',
                                        borderClass: 'border-sky-300 bg-sky-50/80 text-sky-950',
                                        isCeoRole: true,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER:
                                    return {
                                        title: 'بررسی و تایید پیش‌فاکتورها و پیشنهاد بازرگانی',
                                        roleName: 'مدیر بازرگانی',
                                        icon: Briefcase,
                                        badgeClass: 'bg-purple-600 text-white',
                                        borderClass: 'border-purple-300 bg-purple-50/80 text-purple-950',
                                        isCeoRole: false,
                                        isCommercialRole: true
                                    };
                                case PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION:
                                    return {
                                        title: 'تعیین مسیر خرید (تهران یا کارخانه زنجان)',
                                        roleName: 'مدیر کارخانه',
                                        icon: Warehouse,
                                        badgeClass: 'bg-amber-600 text-white',
                                        borderClass: 'border-amber-300 bg-amber-50/80 text-amber-950',
                                        isCeoRole: false,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA:
                                    return {
                                        title: 'اخذ و ثبت پیش‌فاکتورها',
                                        roleName: 'تدارکات بازرگانی تهران',
                                        icon: ShoppingBag,
                                        badgeClass: 'bg-indigo-600 text-white',
                                        borderClass: 'border-indigo-300 bg-indigo-50/80 text-indigo-950',
                                        isCeoRole: false,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING:
                                    return {
                                        title: 'استعلام و پیشنهاد خرید محلی',
                                        roleName: 'تدارکات کارخانه زنجان',
                                        icon: ShoppingBag,
                                        badgeClass: 'bg-teal-600 text-white',
                                        borderClass: 'border-teal-300 bg-teal-50/80 text-teal-950',
                                        isCeoRole: false,
                                        isCommercialRole: false
                                    };
                                case PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL:
                                case PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL:
                                case PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE:
                                case PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN:
                                    return {
                                        title: 'دستور خرید و تاییدات نهایی کارخانه',
                                        roleName: 'مدیر کارخانه',
                                        icon: Warehouse,
                                        badgeClass: 'bg-teal-700 text-white',
                                        borderClass: 'border-teal-300 bg-teal-50/80 text-teal-950',
                                        isCeoRole: false,
                                        isCommercialRole: false
                                    };
                                default:
                                    return null;
                            }
                        };

                        const roleInfo = getRoleInfo(request.status);
                        if (!roleInfo) return null;
                        const RoleIcon = roleInfo.icon;

                        return (
                            <div className={`p-3 sm:p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-2 sm:gap-3 ${roleInfo.borderClass} shadow-xs`}>
                                <div className="flex items-center gap-2.5 sm:gap-3">
                                    <div className={`p-2 rounded-xl ${roleInfo.badgeClass} shadow-sm shrink-0`}>
                                        <RoleIcon size={16} />
                                    </div>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${roleInfo.badgeClass}`}>
                                                جایگاه مجاز: {roleInfo.roleName}
                                            </span>
                                            {isAdmin && (
                                                <span className="text-[9px] font-black bg-gray-900 text-amber-300 px-2 py-0.5 rounded-md">
                                                    دسترسی مدیر ارشد (Admin)
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] sm:text-xs font-black mt-1">
                                            مرحله جاری: <span className="underline decoration-2">{roleInfo.title}</span>
                                        </p>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="text-[10px] sm:text-[11px] font-bold text-gray-600 dark:text-gray-300 bg-white/70 dark:bg-gray-800/70 px-2.5 py-1 rounded-xl border border-gray-200">
                                        💡 توجه مدیر محترم: این تاییدیه مختص جایگاه <strong className="text-gray-900 dark:text-white font-black">{roleInfo.roleName}</strong> می‌باشد.
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
                )}

                {/* Ultra-Compact Mobile Actions Footer */}
                <div className="px-2.5 py-2 sm:p-4 md:p-5 border-t glass-panel flex flex-col md:flex-row justify-between items-stretch md:items-center gap-2 bg-gray-50/95 dark:bg-gray-900/95 shrink-0 z-20">
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center md:justify-start items-center">
                        {/* Universal Return & Reject Buttons (Only visible to authorized approvers/managers of the CURRENT step) */}
                        {request.status !== PurchaseRequestStatus.COMPLETED && request.status !== PurchaseRequestStatus.REJECTED && canUserApproveCurrentStep() && (
                            <>
                                <button onClick={() => setShowReturnModal(true)} className="bg-amber-500/10 text-amber-700 border border-amber-300 hover:bg-amber-500 hover:text-white px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs transition-all flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap" disabled={actionLoading}>
                                    <CornerUpLeft size={14}/> عودت جهت اصلاح
                                </button>
                                <button onClick={() => setShowRejectModal(true)} className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs transition-all flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap" disabled={actionLoading}>
                                    <XCircle size={14}/> رد / توقف فرآیند
                                </button>
                            </>
                        )}

                        {/* Step 1: Line Supervisor Approval */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_SHIFT_LEADER) && (isAdmin || hasPurchasePerm('canApproveShiftLeader')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.PENDING_TECHNICAL, {}, 'تایید سرپرست خط و ارجاع به واحد فنی نت')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black shadow-md transition-all text-[11px] sm:text-xs cursor-pointer" disabled={actionLoading}>تایید سرپرست خط و ارسال به واحد فنی نت</button>
                        )}

                        {/* Step 2: NET / Maintenance Technical Unit Approval */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_TECHNICAL) && (isAdmin || hasPurchasePerm('canApproveTechnical')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER, {}, 'تایید فنی نت و ارجاع به انباردار کارخانه')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black shadow-md transition-all text-[11px] sm:text-xs cursor-pointer" disabled={actionLoading}>تایید فنی نت و ارسال به انباردار کارخانه</button>
                        )}
                        
                        {/* Step 3: Factory Warehouse Keeper Stock Check */}
                        {(isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY) || isCurrentStep(PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER)) && (isAdmin || hasPurchasePerm('canApproveWarehouseKeeper') || hasPurchasePerm('canManageParts')) && (
                            <button onClick={() => setShowWarehouseCheckModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black transition-all text-[11px] sm:text-xs shadow-md cursor-pointer" disabled={actionLoading}>بررسی موجودی انبار (انباردار کارخانه)</button>
                        )}

                        {/* Step 4: Factory Manager Purchase Route Decision */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION) && (isAdmin || hasPurchasePerm('canApproveFactoryDecision') || hasPurchasePerm('canApproveFactory')) && (
                            <button onClick={() => setShowFactoryBranchModal(true)} className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black shadow-md text-[11px] sm:text-xs transition-all cursor-pointer" disabled={actionLoading}>تعیین و تایید مسیر تامین (مدیر کارخانه)</button>
                        )}

                        {/* Tehran Branch: CEO Initial Approval */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_CEO_INITIAL) && (isAdmin || hasPurchasePerm('canApproveCEO')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA, {}, 'تایید اولیه و مجوز اخذ استعلام')} className="bg-sky-600 hover:bg-sky-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md ring-1 ring-sky-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer" disabled={actionLoading}>
                                <Crown size={15} className="text-amber-300 shrink-0" />
                                <span>👑 تایید اولیه و مجوز استعلام (مدیرعامل)</span>
                            </button>
                        )}

                        {/* Tehran Branch: Proforma Entry */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA) && request.proformas.length > 0 && (isAdmin || hasPurchasePerm('canManageProformas')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER, {}, 'ارسال پروفرماها به مدیر بازرگانی')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md flex items-center gap-1.5 transition-all" disabled={actionLoading}>
                                <Briefcase size={14} className="text-indigo-200 shrink-0" />
                                <span>ارسال لیست پیش‌فاکتورها به مدیر بازرگانی</span>
                            </button>
                        )}

                        {/* Tehran Branch: Commercial Manager Selection */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER) && (isAdmin || hasPurchasePerm('canApproveCommercialManager') || hasPurchasePerm('canCommercialFinalize')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.PENDING_CEO_SELECTION, {}, 'بررسی بازرگانی و ارسال به مدیرعامل')} className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md ring-1 ring-purple-300 flex items-center gap-1.5 transition-all cursor-pointer" disabled={actionLoading}>
                                <Briefcase size={15} className="text-amber-300 shrink-0" />
                                <span>💼 تایید مدیر بازرگانی و ارجاع به مدیرعامل</span>
                            </button>
                        )}

                        {/* Tehran Branch: CEO Final Selection & Approval */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_CEO_SELECTION) && (isAdmin || hasPurchasePerm('canSelectProforma') || hasPurchasePerm('canApproveCEO')) && (
                            <button 
                                onClick={() => {
                                    const chosenProforma = request.proformas?.find((p: any) => p.isChosen);
                                    if (!chosenProforma && (request.proformas || []).length > 1) {
                                        alert('لطفاً ابتدا یکی از گزینه‌های پیش‌فاکتور را با زدن دکمه سبز رنگ «تایید و انتخاب» تعیین فرمایید.');
                                        return;
                                    }
                                    const updatedProformas = (request.proformas || []).length === 1 && !chosenProforma 
                                        ? [{ ...request.proformas[0], isChosen: true }] 
                                        : request.proformas;
                                    handleAction(
                                        PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL, 
                                        { proformas: updatedProformas }, 
                                        `تایید و تصویب نهایی خرید توسط مدیرعامل${chosenProforma ? ` (${chosenProforma.vendorName})` : ''}`
                                    );
                                }} 
                                className="bg-sky-600 hover:bg-sky-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md ring-1 ring-sky-300 flex items-center gap-1.5 transition-all cursor-pointer" 
                                disabled={actionLoading}
                            >
                                <Crown size={15} className="text-amber-300 shrink-0" />
                                <span>👑 تایید و تصویب نهایی خرید (مدیرعامل)</span>
                            </button>
                        )}

                        {/* Zanjan Branch: Proposal & Purchasing */}
                        {(isCurrentStep(PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING) || isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_PURCHASING)) && (isAdmin || hasPurchasePerm('canManageZanjanPurchasing') || hasPurchasePerm('canManageProformas')) && (
                            <button 
                                onClick={() => {
                                    const actionText = (request.proformas || []).length > 0 
                                        ? `ارسال ${request.proformas.length} پیش‌فاکتور و پیشنهاد خرید به مدیر کارخانه` 
                                        : 'ارسال پیشنهاد خرید به مدیر کارخانه';
                                    handleAction(PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL, {}, actionText);
                                }} 
                                className="bg-teal-600 hover:bg-teal-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md cursor-pointer transition-all flex items-center gap-1.5" 
                                disabled={actionLoading}
                            >
                                <Warehouse size={15} className="text-teal-200 shrink-0" />
                                <span>ارسال استعلام و پیش‌فاکتورها به مدیر کارخانه</span>
                            </button>
                        )}

                        {/* Zanjan Branch: Factory Manager Approval & Proforma Choice */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL) && (isAdmin || hasPurchasePerm('canApproveFactory')) && (
                            <button 
                                onClick={() => {
                                    const chosenProforma = request.proformas?.find((p: any) => p.isChosen);
                                    if (!chosenProforma && (request.proformas || []).length > 1) {
                                        alert('لطفاً ابتدا پیش‌فاکتور مورد نظر را با دکمه سبز «تایید و انتخاب» تعیین فرمایید، یا در صورت تایید پیش‌فرض ادامه دهید.');
                                    }
                                    const updatedProformas = (request.proformas || []).length === 1 && !chosenProforma 
                                        ? [{ ...request.proformas[0], isChosen: true }] 
                                        : request.proformas;
                                    handleAction(
                                        PurchaseRequestStatus.PENDING_BUYER_EXECUTION, 
                                        { proformas: updatedProformas }, 
                                        `تایید پیش‌فاکتور و صدور دستور خرید محلی توسط مدیر کارخانه${chosenProforma ? ` (${chosenProforma.vendorName})` : ''}`
                                    );
                                }} 
                                className="bg-teal-700 hover:bg-teal-800 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md ring-1 ring-teal-400 flex items-center gap-1.5 cursor-pointer transition-all" 
                                disabled={actionLoading}
                            >
                                <Warehouse size={15} className="text-amber-300 shrink-0" />
                                <span>✅ تایید پیش‌فاکتور و صدور دستور خرید (مدیر کارخانه)</span>
                            </button>
                        )}

                        {/* Zanjan Branch: Purchasing Agent Execution */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_BUYER_EXECUTION) && (isAdmin || hasPurchasePerm('canExecuteBuyerZanjan') || hasPurchasePerm('canManageProformas')) && (
                            <button onClick={() => setShowPurchasingAgentModal(true)} className="bg-teal-600 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md transition-all cursor-pointer">ثبت خرید کارپرداز و صدور فاکتور</button>
                        )}

                        {/* Common: Technical Specs Approval */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL) && (isAdmin || hasPurchasePerm('canApproveTechnical')) && (
                            <button onClick={() => setShowTechnicalApprovalModal(true)} className="bg-indigo-600 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md transition-all">تایید فنی و تطابق سفارش (QC/Net)</button>
                        )}

                        {/* Common: Factory Manager Entry Approval */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL) && (isAdmin || hasPurchasePerm('canApproveFactory')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.PENDING_SECURITY_ENTRY, {}, 'صدور مجوز ورود کالا به کارخانه')} className="bg-emerald-600 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs shadow-md flex items-center gap-1.5" disabled={actionLoading}>
                                <Warehouse size={15} className="text-emerald-200 shrink-0" />
                                <span>مجوز ورود کالا به کارخانه (مدیر کارخانه)</span>
                            </button>
                        )}

                        {/* Security Entry */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_SECURITY_ENTRY) && (isAdmin || hasPurchasePerm('canRegisterEntry')) && (
                            <button onClick={() => setShowSecurityModal(true)} className="bg-orange-600 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black transition-all shadow-md text-[11px] sm:text-xs">ثبت ورود کالا (انتظامات)</button>
                        )}

                        {/* Quality Control (QC) */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_QC) && (isAdmin || hasPurchasePerm('canCheckQC')) && (
                            <button onClick={() => setShowQCModal(true)} className="bg-green-600 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black shadow-md transition-all text-[11px] sm:text-xs">بررسی و تایید کنترل کیفی (QC)</button>
                        )}

                        {/* Factory Manager Final Approve */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE) && (isAdmin || hasPurchasePerm('canApproveFactory') || hasPurchasePerm('canApproveFactoryFinal')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT, {}, 'تایید نهایی تحویل و ارسال به انبار')} className="bg-indigo-600 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs flex items-center gap-1.5" disabled={actionLoading}>
                                <Warehouse size={15} className="text-indigo-200 shrink-0" />
                                <span>تایید نهایی تحویل و ارسال به انبار (مدیر کارخانه)</span>
                            </button>
                        )}

                        {/* Warehouse Receipt */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT) && (isAdmin || hasPurchasePerm('canWarehouseFinalize')) && (
                            <button onClick={() => setShowWarehouseModal(true)} className="bg-indigo-700 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black shadow-md transition-all text-[11px] sm:text-xs">صدور رسید انبار نهایی</button>
                        )}

                        {/* Factory Manager Final Sign */}
                        {isCurrentStep(PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN) && (isAdmin || hasPurchasePerm('canApproveFactory') || hasPurchasePerm('canApproveFactoryFinal')) && (
                            <button onClick={() => handleAction(PurchaseRequestStatus.COMPLETED, {}, 'امضای الکترونیکی و بایگانی پرونده')} className="bg-indigo-900 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black shadow-md transition-all hover:bg-black text-[11px] sm:text-xs flex items-center gap-1.5">
                                <Warehouse size={15} className="text-amber-400 shrink-0" />
                                <span>امضا، تکمیل و بایگانی نهایی پرونده (مدیر کارخانه)</span>
                            </button>
                        )}

                        {isCurrentStep(PurchaseRequestStatus.REJECTED) && (
                            <span className="text-red-600 font-bold bg-red-50 px-3 py-1.5 rounded-xl border border-red-200 italic text-[11px]">این درخواست رد شده است</span>
                        )}
                        {isCurrentStep(PurchaseRequestStatus.DELIVERED_FROM_WAREHOUSE) && (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 italic text-[11px]">کالا مستقیماً از موجودی انبار تحویل گردید</span>
                        )}
                    </div>

                    <div className="flex gap-2 justify-center md:justify-end md:border-r md:pr-4 border-gray-200">
                         {/* Robust Clickable Print Menu with Backdrop */}
                         <div className="relative flex-1 md:flex-initial">
                            {isPrintDropdownOpen && (
                                <div 
                                    className="fixed inset-0 z-40" 
                                    onClick={() => setIsPrintDropdownOpen(false)} 
                                />
                            )}
                            <button 
                                type="button"
                                onClick={() => {
                                    setIsPrintDropdownOpen(!isPrintDropdownOpen);
                                    setIsShareDropdownOpen(false);
                                }}
                                className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 sm:p-2.5 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 active:scale-95 transition-all shadow-2xs font-black text-[11px] sm:text-xs cursor-pointer relative z-50 whitespace-nowrap"
                            >
                                <Printer size={14} /> 
                                <span>چاپ اسناد</span>
                                <ChevronDown size={13} className={`transition-transform duration-200 ${isPrintDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isPrintDropdownOpen && (
                                <div 
                                    className="absolute bottom-full mb-2 right-0 sm:right-auto sm:left-0 w-52 bg-white rounded-2xl shadow-2xl border border-gray-200 p-2 z-50 animate-in slide-in-from-bottom-2 fade-in"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button 
                                        onClick={() => { 
                                            setIsPrintDropdownOpen(false);
                                            setPrintType('REQUEST'); 
                                            setTimeout(() => window.print(), 300); 
                                        }} 
                                        className="w-full text-right p-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl text-xs font-bold border-b border-gray-100 mb-1 transition-colors flex items-center justify-between cursor-pointer"
                                    >
                                        <span>چاپ فرم درخواست (A5)</span>
                                        <FileText size={13} className="text-gray-400"/>
                                    </button>
                                    <button 
                                        onClick={() => { 
                                            setIsPrintDropdownOpen(false);
                                            setPrintType('BARCODE'); 
                                            setTimeout(() => window.print(), 300); 
                                        }} 
                                        className="w-full text-right p-2.5 hover:bg-indigo-50 rounded-xl text-xs font-black text-indigo-700 border-b border-gray-100 mb-1 transition-colors flex items-center justify-between cursor-pointer"
                                    >
                                        <span>چاپ برچسب بارکد (Barcode)</span>
                                        <Tag size={13} className="text-indigo-600"/>
                                    </button>
                                    {request.proformas.find(p => p.isChosen) && canViewProformas && (
                                        <button 
                                            onClick={() => { 
                                                setIsPrintDropdownOpen(false);
                                                setPrintType('PROFORMA'); 
                                                setTimeout(() => window.print(), 300); 
                                            }} 
                                            className="w-full text-right p-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl text-xs font-bold border-b border-gray-100 mb-1 transition-colors flex items-center justify-between cursor-pointer"
                                        >
                                            <span>چاپ پیش‌فاکتور منتخب (A5)</span>
                                            <Printer size={13} className="text-gray-400"/>
                                        </button>
                                    )}
                                    {request.warehouseReceiptNumber && (
                                        <button 
                                            onClick={() => { 
                                                setIsPrintDropdownOpen(false);
                                                setPrintType('RECEIPT'); 
                                                setTimeout(() => window.print(), 300); 
                                            }} 
                                            className="w-full text-right p-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer"
                                        >
                                            <span>چاپ رسید انبار نهایی (A5)</span>
                                            <Warehouse size={13} className="text-gray-400"/>
                                        </button>
                                    )}
                                </div>
                            )}
                         </div>

                         {/* Robust Clickable Share Menu with Backdrop */}
                         <div className="relative flex-1 md:flex-initial">
                            {isShareDropdownOpen && (
                                <div 
                                    className="fixed inset-0 z-40" 
                                    onClick={() => setIsShareDropdownOpen(false)} 
                                />
                            )}
                            <button 
                                type="button"
                                disabled={isSharingDoc}
                                onClick={() => {
                                    setIsShareDropdownOpen(!isShareDropdownOpen);
                                    setIsPrintDropdownOpen(false);
                                }}
                                className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 sm:p-2.5 text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all shadow-2xs font-black text-[11px] sm:text-xs disabled:opacity-50 cursor-pointer relative z-50 whitespace-nowrap"
                                title="ارسال اسناد درخواست به گفتگو"
                            >
                                {isSharingDoc ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />} 
                                <span>ارسال به گفتگو</span>
                                <ChevronDown size={13} className={`transition-transform duration-200 ${isShareDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isShareDropdownOpen && (
                                <div 
                                    className="absolute bottom-full mb-2 left-0 w-56 bg-white rounded-2xl shadow-2xl border border-gray-200 p-2 z-50 animate-in slide-in-from-bottom-2 fade-in"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button 
                                        onClick={() => {
                                            setIsShareDropdownOpen(false);
                                            handleSharePurchaseDoc('REQUEST');
                                        }} 
                                        className="w-full text-right p-2.5 hover:bg-emerald-50 text-gray-800 rounded-xl text-xs font-bold border-b border-gray-100 mb-1 flex items-center justify-between transition-colors cursor-pointer"
                                    >
                                        <span>ارسال فرم درخواست (A5)</span>
                                        <MessageSquare size={13} className="text-emerald-600"/>
                                    </button>
                                    {request.proformas.find(p => p.isChosen) && canViewProformas && (
                                        <button 
                                            onClick={() => {
                                                setIsShareDropdownOpen(false);
                                                handleSharePurchaseDoc('PROFORMA');
                                            }} 
                                            className="w-full text-right p-2.5 hover:bg-emerald-50 text-gray-800 rounded-xl text-xs font-bold border-b border-gray-100 mb-1 flex items-center justify-between transition-colors cursor-pointer"
                                        >
                                            <span>ارسال پیش‌فاکتور منتخب</span>
                                            <MessageSquare size={13} className="text-emerald-600"/>
                                        </button>
                                    )}
                                    {request.warehouseReceiptNumber && (
                                        <button 
                                            onClick={() => {
                                                setIsShareDropdownOpen(false);
                                                handleSharePurchaseDoc('RECEIPT');
                                            }} 
                                            className="w-full text-right p-2.5 hover:bg-emerald-50 text-gray-800 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
                                        >
                                            <span>ارسال رسید انبار نهایی</span>
                                            <MessageSquare size={13} className="text-emerald-600"/>
                                        </button>
                                    )}
                                </div>
                            )}
                         </div>
                    </div>
                </div>

                {/* Offscreen Area for Capturing Chat Images */}
                {sharingType && (
                    <div 
                        id="chat-share-purchase-doc-area" 
                        style={{ 
                            position: 'fixed', 
                            left: '-9999px', 
                            top: 0, 
                            width: '850px', 
                            backgroundColor: '#ffffff', 
                            zIndex: -999,
                            padding: '24px'
                        }}
                    >
                        {sharingType === 'REQUEST' && <PrintPurchaseRequest request={request} />}
                        {sharingType === 'PROFORMA' && <PrintPurchaseProforma request={request} proforma={request.proformas.find(p => p.isChosen) || request.proformas[0]} />}
                        {sharingType === 'RECEIPT' && <PrintWarehouseReceipt request={request} />}
                    </div>
                )}
                {sharingProforma && (
                    <div 
                        id="chat-share-proforma-area"
                        style={{ 
                            position: 'fixed', 
                            left: '-9999px', 
                            top: 0, 
                            width: '850px', 
                            backgroundColor: '#ffffff', 
                            zIndex: -999,
                            padding: '24px'
                        }}
                    >
                        <PrintPurchaseProforma request={request} proforma={sharingProforma} />
                    </div>
                )}

                {/* Print Sections */}
                <div className="print-render-wrapper opacity-0 pointer-events-none absolute -z-50 overflow-hidden h-0 w-0" aria-hidden="true">
                    <div id="print-purchase-request-section">
                        {printType === 'REQUEST' && <PrintPurchaseRequest request={request} />}
                        {printType === 'BARCODE' && <PrintPurchaseBarcode request={request} />}
                        {printType === 'PROFORMA' && <PrintPurchaseProforma request={request} proforma={request.proformas.find(p => p.isChosen) || request.proformas[0]} />}
                        {printType === 'RECEIPT' && <PrintWarehouseReceipt request={request} />}
                    </div>
                    {/* Multi-print for custom proforma */}
                    {printingProforma && (
                        <div id="print-specific-proforma">
                            <PrintPurchaseProforma request={request} proforma={printingProforma} />
                        </div>
                    )}
                </div>

                {/* Submodals */}
                {showReturnModal && <ReturnModal 
                    currentStatus={request.status}
                    onClose={() => setShowReturnModal(false)}
                    onConfirm={(stage: PurchaseRequestStatus, reason: string) => {
                        handleAction(stage, { returnReason: reason }, 'عودت پرونده جهت اصلاح');
                        setShowReturnModal(false);
                    }}
                />}

                {showRejectModal && <RejectModal 
                    onClose={() => setShowRejectModal(false)}
                    onConfirm={(reason: string) => {
                        handleAction(PurchaseRequestStatus.REJECTED, { rejectionReason: reason }, 'رد و توقف کلی فرآیند');
                        setShowRejectModal(false);
                    }}
                />}

                {showWarehouseCheckModal && <WarehouseCheckModal 
                    request={request}
                    parts={parts}
                    onClose={() => setShowWarehouseCheckModal(false)}
                    onRegisterPart={(item) => setDefiningItem(item)}
                    onConfirm={(inStock: boolean, data: any) => {
                        if (inStock) {
                            handleAction(PurchaseRequestStatus.DELIVERED_FROM_WAREHOUSE, data, 'تحویل مستقیم از انبار');
                        } else {
                            handleAction(PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION, data, 'عدم موجودی - ارسال به مدیر کارخانه جهت تصمیم مسیر');
                        }
                        setShowWarehouseCheckModal(false);
                    }}
                />}

                {definingItem && (
                    <PartModal 
                        onClose={() => setDefiningItem(null)} 
                        onSuccess={async (newPart: any) => {
                            if (definingItem && newPart) {
                                const updatedItems = (request.items || []).map((it: any) => {
                                    if (it.id === definingItem.id) {
                                        return {
                                            ...it,
                                            partId: newPart.id,
                                            itemCode: newPart.code || newPart.id.slice(0, 8),
                                            itemName: newPart.name
                                        };
                                    }
                                    return it;
                                });
                                
                                const updatedRequest = {
                                    ...request,
                                    items: updatedItems,
                                    itemName: updatedItems.length === 1 ? updatedItems[0].itemName : `${updatedItems[0].itemName} (+${updatedItems.length - 1} قلم دیگر)`,
                                    quantity: updatedItems[0]?.quantity || request.quantity,
                                    unit: updatedItems[0]?.unit || request.unit,
                                    specifications: updatedItems[0]?.specifications || request.specifications
                                };
                                
                                try {
                                    await updatePurchaseRequest(updatedRequest);
                                    onSuccess();
                                    alert('کالا با موفقیت در شناسنامه تعریف و به این درخواست متصل شد.');
                                } catch (err) {
                                    console.error(err);
                                    alert('خطا در بروزرسانی درخواست خرید با کالا جدید');
                                }
                            }
                            setDefiningItem(null);
                        }}
                        initialData={{ name: definingItem.itemName, unit: definingItem.unit, dimensions: definingItem.specifications || '', isVirtualForPurchase: true }}
                        parts={parts}
                    />
                )}

                {showFactoryBranchModal && <FactoryBranchModal 
                    onClose={() => setShowFactoryBranchModal(false)}
                    onConfirm={(location: 'Tehran' | 'Factory', notes: string) => {
                        if (location === 'Tehran') {
                            handleAction(PurchaseRequestStatus.PENDING_CEO_INITIAL, { location: 'Tehran', factoryNotes: notes }, 'تعیین مسیر خرید از تهران');
                        } else {
                            handleAction(PurchaseRequestStatus.PENDING_ZANJAN_PURCHASING, { location: 'Factory', factoryNotes: notes }, 'تعیین مسیر خرید از کارخانه زنجان');
                        }
                        setShowFactoryBranchModal(false);
                    }}
                />}

                {showTechnicalApprovalModal && <TechnicalApprovalModal 
                    onClose={() => setShowTechnicalApprovalModal(false)}
                    onConfirm={(data: any) => {
                        handleAction(PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL, data, 'تایید فنی و تطابق کالا');
                        setShowTechnicalApprovalModal(false);
                    }}
                />}

                {showPurchasingAgentModal && <PurchasingAgentModal 
                    onClose={() => setShowPurchasingAgentModal(false)}
                    onConfirm={(data: any) => {
                        handleAction(PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL, data, 'ثبت فاکتور توسط کارپرداز');
                        setShowPurchasingAgentModal(false);
                    }}
                />}

                {showProformaModal && <ProfessionalProformaModal 
                    request={request} 
                    initialVendorData={prefilledProformaData}
                    parts={parts}
                    onClose={() => {
                        setShowProformaModal(false);
                        setPrefilledProformaData(null);
                    }}
                    onSuccess={(updatedProformas: any) => {
                        handleAction(request.status, { proformas: updatedProformas }, 'ثبت پیش‌فاکتور جدید');
                        setShowProformaModal(false);
                        setPrefilledProformaData(null);
                    }}
                    currentUser={currentUser}
                />}

                {showAiAdvisorModal && (
                    <AiPurchaseAdvisorModal
                        request={request}
                        parts={parts}
                        initialItemIndex={aiAdvisorInitialIndex}
                        onClose={() => setShowAiAdvisorModal(false)}
                        onApplyProforma={(data) => {
                            setPrefilledProformaData(data);
                            setShowAiAdvisorModal(false);
                            setShowProformaModal(true);
                        }}
                    />
                )}

                {showSecurityModal && <SecurityEntryModal 
                    onClose={() => setShowSecurityModal(false)}
                    onConfirm={(data: any) => handleAction(PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT, data, 'ثبت ورود انتظامات')}
                />}
                
                {showQCModal && <QCApprovalModal 
                    onClose={() => setShowQCModal(false)}
                    onConfirm={(data: any) => handleAction(PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE, data, 'گزارش و تایید کیفی QC')}
                />}

                {showWarehouseModal && <WarehouseReceiptModal 
                   onClose={() => setShowWarehouseModal(false)}
                   onConfirm={(data: any) => handleAction(PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN, data, 'صدور رسید انبار')}
                />}

                {viewingPartDataSheet && (
                    <DataSheetModal 
                        part={viewingPartDataSheet} 
                        onClose={() => setViewingPartDataSheet(null)} 
                    />
                )}

                {viewingProformaDetails && (
                    <ViewProformaDetailsModal 
                        proforma={viewingProformaDetails} 
                        onClose={() => setViewingProformaDetails(null)} 
                        setPreviewFile={setPreviewFile}
                        currentUser={currentUser}
                        request={request}
                        settings={settings}
                    />
                )}

                {previewFile && (
                    <FileViewerModal 
                        isOpen={!!previewFile} 
                        onClose={() => setPreviewFile(null)} 
                        fileUrl={previewFile.url} 
                        fileName={previewFile.fileName} 
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

const ProfessionalProformaModal = ({ request, onClose, onSuccess, currentUser, initialVendorData, parts }: any) => {
    const [vendor, setVendor] = useState(initialVendorData?.vendorName || '');
    const [phone, setPhone] = useState(initialVendorData?.vendorPhone || '');
    const [num, setNum] = useState(initialVendorData?.number || '');

    const getInitialItems = () => {
        if (initialVendorData?.items && Array.isArray(initialVendorData.items) && initialVendorData.items.length > 0) {
            return initialVendorData.items;
        }
        if (request?.items && Array.isArray(request.items) && request.items.length > 0) {
            return request.items.map((it: any) => ({
                id: generateUUID(),
                description: it.itemName + (it.specifications ? ` (${it.specifications})` : ''),
                quantity: it.quantity !== undefined ? it.quantity : 1,
                unit: it.unit || 'عدد',
                unitPrice: initialVendorData?.unitPrice || 0,
                totalPrice: (it.quantity !== undefined ? it.quantity : 1) * (initialVendorData?.unitPrice || 0)
            }));
        }
        return [{
            id: generateUUID(),
            description: initialVendorData?.description || request?.itemName || '',
            quantity: request?.quantity !== undefined ? request.quantity : 1,
            unit: request?.unit || 'عدد',
            unitPrice: initialVendorData?.unitPrice || 0,
            totalPrice: (request?.quantity !== undefined ? request.quantity : 1) * (initialVendorData?.unitPrice || 0)
        }];
    };

    const [items, setItems] = useState<PurchaseProformaItem[]>(getInitialItems);
    const [tax, setTax] = useState(initialVendorData?.taxAmount || 0);
    const [discount, setDiscount] = useState(initialVendorData?.discountAmount || 0);
    const [attachments, setAttachments] = useState<PurchaseAttachment[]>(initialVendorData?.attachments || []);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [previewAttachmentFile, setPreviewAttachmentFile] = useState<{ url: string; fileName: string } | null>(null);
    const [showAiAdvisor, setShowAiAdvisor] = useState(false);

    useEffect(() => {
        if (initialVendorData) {
            if (initialVendorData.vendorName) setVendor(initialVendorData.vendorName);
            if (initialVendorData.vendorPhone) setPhone(initialVendorData.vendorPhone);
            if (initialVendorData.number) setNum(initialVendorData.number);
            if (initialVendorData.taxAmount !== undefined) setTax(initialVendorData.taxAmount);
            if (initialVendorData.discountAmount !== undefined) setDiscount(initialVendorData.discountAmount);
            if (initialVendorData.items && Array.isArray(initialVendorData.items) && initialVendorData.items.length > 0) {
                setItems(initialVendorData.items);
            } else if (request?.items && Array.isArray(request.items) && request.items.length > 0) {
                setItems(request.items.map((it: any) => ({
                    id: generateUUID(),
                    description: it.itemName + (it.specifications ? ` (${it.specifications})` : ''),
                    quantity: it.quantity !== undefined ? it.quantity : 1,
                    unit: it.unit || 'عدد',
                    unitPrice: initialVendorData.unitPrice || 0,
                    totalPrice: (it.quantity !== undefined ? it.quantity : 1) * (initialVendorData.unitPrice || 0)
                })));
            } else if (initialVendorData.unitPrice !== undefined) {
                setItems(prev => prev.map((it, idx) => idx === 0 ? {
                    ...it,
                    description: initialVendorData.description || it.description,
                    unitPrice: initialVendorData.unitPrice || 0,
                    totalPrice: (it.quantity || 1) * (initialVendorData.unitPrice || 0)
                } : it));
            }
            if (initialVendorData.attachments) {
                setAttachments(initialVendorData.attachments);
            }
        }
    }, [initialVendorData]);

    const handleResetToRequestItems = () => {
        if (request?.items && Array.isArray(request.items) && request.items.length > 0) {
            setItems(request.items.map((it: any) => ({
                id: generateUUID(),
                description: it.itemName + (it.specifications ? ` (${it.specifications})` : ''),
                quantity: it.quantity !== undefined ? it.quantity : 1,
                unit: it.unit || 'عدد',
                unitPrice: 0,
                totalPrice: 0
            })));
        } else {
            setItems([{
                id: generateUUID(),
                description: request?.itemName || '',
                quantity: request?.quantity !== undefined ? request.quantity : 1,
                unit: request?.unit || 'عدد',
                unitPrice: 0,
                totalPrice: 0
            }]);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingAttachment(true);
        try {
            const res = await uploadFileChunked(file, () => {});
            const newAtt: PurchaseAttachment = {
                id: generateUUID(),
                fileName: file.name,
                url: res.url,
                fileUrl: res.url,
                fileType: file.type.includes('image') ? 'image' : file.type.includes('pdf') ? 'pdf' : 'other',
                uploadedAt: new Date().toISOString(),
                uploadedBy: currentUser.fullName
            };
            setAttachments(prev => [...prev, newAtt]);
        } catch (err) {
            console.error('File upload error', err);
            alert('خطا در بارگذاری فایل پیش‌فاکتور');
        } finally {
            setUploadingAttachment(false);
            if (e.target) e.target.value = '';
        }
    };

    const removeAttachment = (attId: string) => {
        setAttachments(prev => prev.filter(a => a.id !== attId));
    };

    const updateItem = (id: string, field: string, val: any) => {
        setItems(items.map(it => {
            if (it.id === id) {
                const updated = { ...it, [field]: val };
                if (field === 'quantity' || field === 'unitPrice') {
                    updated.totalPrice = updated.quantity * updated.unitPrice;
                }
                return updated;
            }
            return it;
        }));
    };

    const addItem = () => setItems([...items, { id: generateUUID(), description: '', quantity: 1, unit: 'عدد', unitPrice: 0, totalPrice: 0 }]);
    const removeItem = (id: string) => setItems(items.filter(it => it.id !== id));

    const totalItems = items.reduce((sum, it) => sum + it.totalPrice, 0);
    const finalTotal = totalItems + tax - discount;

    const handleAdd = () => {
        const newP: PurchaseProforma = {
            id: initialVendorData?.id || generateUUID(),
            vendorName: vendor,
            vendorPhone: phone,
            number: num,
            date: initialVendorData?.date || new Date().toISOString().split('T')[0],
            items: items,
            totalAmount: finalTotal,
            taxAmount: tax,
            discountAmount: discount,
            attachments: attachments,
            registeredBy: initialVendorData?.registeredBy || currentUser.fullName,
            isChosen: initialVendorData?.isChosen || false
        };
        if (initialVendorData?.id && request.proformas.some((p: any) => p.id === initialVendorData.id)) {
            const updated = request.proformas.map((p: any) => p.id === initialVendorData.id ? newP : p);
            onSuccess(updated);
        } else {
            onSuccess([...request.proformas, newP]);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm shadow-2xl">
            <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
                <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-xl text-gray-800">
                            {initialVendorData?.id ? 'ویرایش پیش‌فاکتور حرفه‌ای' : 'ثبت پیش‌فاکتور حرفه‌ای'}
                        </h3>
                        <p className="text-xs text-gray-500 font-bold mt-0.5">
                            درخواست شماره: {request.requestNumber} - کالا: {request.items && request.items.length > 1 ? `${request.items[0]?.itemName || request.itemName} (+${request.items.length - 1} قلم دیگر)` : (request.itemName || '')}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full cursor-pointer"><XCircle/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                    {/* AI Advisor Banner */}
                    <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 dark:bg-gray-800 p-4 rounded-2xl border border-purple-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-xl shadow-md">
                                <Sparkles size={18} className="text-yellow-300" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                    جستجوی هوشمند در اینترنت و استعلام بازار با هوش مصنوعی
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    جستجوی خودکار در بازار، استخراج لینک‌ها و قیمت‌ها و ارسال مستقیم پیام استعلام در واتساپ و بله
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAiAdvisor(true)}
                            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-purple-500/20 active:scale-95 transition-all shrink-0 cursor-pointer"
                        >
                            <Sparkles size={14} className="text-yellow-300 animate-pulse" />
                            <span>استعلام بازار با AI</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div><label className="text-xs font-bold text-gray-500 block mb-1">نام فروشنده/تامین کننده</label><input className="w-full border rounded-xl p-3 text-sm" value={vendor} onChange={e=>setVendor(e.target.value)} placeholder="نام شرکت یا تامین کننده" /></div>
                        <div><label className="text-xs font-bold text-gray-500 block mb-1">تلفن تماس / واتساپ</label><input className="w-full border rounded-xl p-3 text-sm" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0912..." /></div>
                        <div><label className="text-xs font-bold text-gray-500 block mb-1">شماره پیش‌فاکتور</label><input className="w-full border rounded-xl p-3 text-sm" value={num} onChange={e=>setNum(e.target.value)} placeholder="اختیاری" /></div>
                    </div>

                    <div className="border rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 flex flex-wrap justify-between items-center gap-2">
                            <div className="flex items-center gap-2">
                                <Package size={16} className="text-indigo-600 dark:text-indigo-400" />
                                <span className="text-xs font-black text-gray-800 dark:text-gray-200">
                                    اقلام و ردیف‌های پیش‌فاکتور ({items.length} ردیف)
                                </span>
                            </div>
                            {request?.items && request.items.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleResetToRequestItems}
                                    className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
                                    title="بارگذاری مجدد اقلام از فرم درخواست خرید"
                                >
                                    <RotateCcw size={12} />
                                    <span>بارگذاری مجدد اقلام درخواست ({request.items.length} قلم)</span>
                                </button>
                            )}
                        </div>

                        {items.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                        <tr>
                                            <th className="p-3 w-10 text-center">#</th>
                                            <th className="p-3 text-right">شرح کالا/خدمات</th>
                                            <th className="p-3 w-24 text-center">تعداد</th>
                                            <th className="p-3 w-24 text-center">واحد</th>
                                            <th className="p-3 w-36 text-center">فی (ریال)</th>
                                            <th className="p-3 w-36 text-center">جمع کل (ریال)</th>
                                            <th className="p-3 w-12 text-center"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {items.map((it, idx) => (
                                            <tr key={it.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                                                <td className="p-2 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                                                <td className="p-2">
                                                    <input 
                                                        className="w-full p-2 bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded-lg focus:bg-white dark:focus:bg-gray-800 transition-all text-xs font-bold" 
                                                        value={it.description} 
                                                        placeholder="شرح و مشخصات کالا..."
                                                        onChange={e => updateItem(it.id, 'description', e.target.value)} 
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input 
                                                        type="number" 
                                                        className="w-full p-2 bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded-lg focus:bg-white dark:focus:bg-gray-800 text-center font-bold text-xs" 
                                                        value={it.quantity} 
                                                        min="0"
                                                        step="any"
                                                        onChange={e => updateItem(it.id, 'quantity', +e.target.value)} 
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input 
                                                        className="w-full p-2 bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded-lg focus:bg-white dark:focus:bg-gray-800 text-center text-xs" 
                                                        value={it.unit} 
                                                        placeholder="واحد"
                                                        onChange={e => updateItem(it.id, 'unit', e.target.value)} 
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input 
                                                        type="number" 
                                                        className="w-full p-2 bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded-lg focus:bg-white dark:focus:bg-gray-800 text-center font-bold text-indigo-600 dark:text-indigo-400 text-xs" 
                                                        value={it.unitPrice} 
                                                        min="0"
                                                        onChange={e => updateItem(it.id, 'unitPrice', +e.target.value)} 
                                                    />
                                                </td>
                                                <td className="p-2 text-center font-black text-indigo-700 dark:text-indigo-300 font-mono text-xs">
                                                    {formatCurrency(it.totalPrice)}
                                                </td>
                                                <td className="p-2 text-center">
                                                    <button 
                                                        type="button"
                                                        onClick={() => removeItem(it.id)} 
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer"
                                                        title="حذف این ردیف"
                                                    >
                                                        <Trash2 size={16}/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-6 text-center text-gray-400 text-xs">
                                <p className="mb-2">ردیفی برای پیش‌فاکتور ثبت نشده است.</p>
                                <button
                                    type="button"
                                    onClick={addItem}
                                    className="px-4 py-1.5 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition-colors"
                                >
                                    + افزودن ردیف اول
                                </button>
                            </div>
                        )}

                        <button 
                            type="button"
                            onClick={addItem} 
                            className="w-full py-3 bg-gray-50 dark:bg-gray-800/60 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-t border-dashed border-gray-200 dark:border-gray-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                        >
                            <Plus size={15} />
                            <span>افزودن ردیف جدید</span>
                        </button>
                    </div>

                    {/* Proforma File Attachment & Preview Section */}
                    <div className="p-4 bg-indigo-50/50 dark:bg-gray-800/60 rounded-2xl border border-indigo-100 dark:border-gray-700 space-y-3">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <label className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <Paperclip size={16} className="text-indigo-600" />
                                <span>پیوست فایل اصلی پیش‌فاکتور (PDF / عکس)</span>
                            </label>
                            <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 ${uploadingAttachment ? 'opacity-50 pointer-events-none' : ''}`}>
                                {uploadingAttachment ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                <span>{uploadingAttachment ? 'در حال بارگذاری...' : 'انتخاب و آپلود فایل'}</span>
                                <input 
                                    type="file" 
                                    accept="image/*,application/pdf" 
                                    className="hidden" 
                                    onChange={handleFileUpload} 
                                    disabled={uploadingAttachment}
                                />
                            </label>
                        </div>

                        {attachments.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                                {attachments.map((att) => {
                                    const isPdf = att.fileType?.toLowerCase().includes('pdf') || att.fileName?.toLowerCase().endsWith('.pdf');
                                    const fileLink = att.url || att.fileUrl || '';

                                    return (
                                        <div key={att.id} className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-xs">
                                            <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                                {isPdf ? <FileText size={16} className="text-red-500 shrink-0" /> : <ImageIcon size={16} className="text-blue-500 shrink-0" />}
                                                <span className="font-bold text-gray-800 dark:text-gray-200 truncate">{att.fileName}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0 mr-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewAttachmentFile({ url: fileLink, fileName: att.fileName })}
                                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors cursor-pointer"
                                                    title="پیش‌نمایش فایل"
                                                >
                                                    <Eye size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachment(att.id)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors cursor-pointer"
                                                    title="حذف پیوست"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-[11px] text-gray-400 italic">فایلی پیوست نشده است. می‌توانید تصویر یا فایل PDF پیش‌فاکتور دریافتی را برای بررسی و پیش‌نمایش بارگذاری نمایید.</p>
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-3 pt-4 border-t">
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-500">جمع ردیف‌ها:</span>
                            <span className="text-sm font-black">{formatCurrency(totalItems)} ریال</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-500">مالیات / عوارض:</span>
                            <input type="number" className="w-32 border rounded-lg p-2 text-xs font-bold" value={tax} onChange={e=>setTax(+e.target.value)} />
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-red-400">تخفیف:</span>
                            <input type="number" className="w-32 border rounded-lg p-2 text-xs font-bold text-red-500" value={discount} onChange={e=>setDiscount(+e.target.value)} />
                        </div>
                        <div className="flex items-center gap-4 bg-indigo-50 px-6 py-4 rounded-2xl border border-indigo-200">
                            <span className="text-sm font-black text-indigo-900">مبلغ نهایی قابل پرداخت:</span>
                            <span className="text-xl font-black text-indigo-700">{formatCurrency(finalTotal)} ریال</span>
                        </div>
                    </div>
                </div>
                <div className="p-6 bg-gray-50 flex gap-3">
                    <button onClick={handleAdd} className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 transition-all cursor-pointer">
                        {initialVendorData?.id ? 'ذخیره تغییرات پیش‌فاکتور' : 'تایید و ثبت نهایی پیش‌فاکتور'}
                    </button>
                    <button onClick={onClose} className="px-8 bg-white border border-gray-300 text-gray-600 font-bold rounded-2xl hover:bg-gray-100 transition-all cursor-pointer">انصراف</button>
                </div>

                {showAiAdvisor && (
                    <AiPurchaseAdvisorModal
                        request={request}
                        parts={parts}
                        onClose={() => setShowAiAdvisor(false)}
                        onApplyProforma={(data) => {
                            if (data.vendorName) setVendor(data.vendorName);
                            if (data.vendorPhone) setPhone(data.vendorPhone);
                            if (data.unitPrice !== undefined) {
                                setItems(prev => prev.map((it, idx) => idx === 0 ? {
                                    ...it,
                                    description: data.description || it.description,
                                    unitPrice: data.unitPrice || 0,
                                    totalPrice: (it.quantity || 1) * (data.unitPrice || 0)
                                } : it));
                            }
                            setShowAiAdvisor(false);
                        }}
                    />
                )}

                {previewAttachmentFile && (
                    <FileViewerModal 
                        isOpen={!!previewAttachmentFile} 
                        onClose={() => setPreviewAttachmentFile(null)} 
                        fileUrl={previewAttachmentFile.url} 
                        fileName={previewAttachmentFile.fileName} 
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

const QCApprovalModal = ({ onClose, onConfirm }: any) => {
    const [result, setResult] = useState<'تایید' | 'مشروط' | 'رد'>('تایید');
    const [desc, setDesc] = useState('');

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-scale-in text-right">
                <h3 className="font-black text-xl mb-6 text-gray-800 flex items-center gap-2"><ShieldCheck className="text-green-600"/> بررسی کیفی (QC)</h3>
                <div className="space-y-6">
                    <div className="flex p-1 bg-gray-100 rounded-2xl">
                        {(['تایید', 'مشروط', 'رد'] as any[]).map(r => (
                            <button key={r} onClick={()=>setResult(r)} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${result === r ? 'bg-white text-indigo-600 shadow-md scale-105' : 'text-gray-400'}`}>{r}</button>
                        ))}
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-2">ملاحظات و گزارش کیفی</label>
                        <textarea className="w-full border rounded-xl p-4 text-sm h-32 focus:ring-2 focus:ring-indigo-100 outline-none" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="شرح وضعیت ظاهری، فنی و تطابق با استانداردهای کارخانه..."/>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button onClick={() => onConfirm({ qcResult: result, qcDescription: desc })} className="flex-1 bg-green-600 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all">تایید گزارش QC</button>
                        <button onClick={onClose} className="px-6 bg-white border border-gray-300 text-gray-500 font-bold rounded-2xl">انصراف</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const WarehouseReceiptModal = ({ request, onClose, onConfirm }: any) => {
    const shamsi = getCurrentShamsiDate();
    const [num, setNum] = useState(() => {
        if (request?.warehouseReceiptNumber) return request.warehouseReceiptNumber;
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        return `RI-${shamsi.year}/${randomNum}`;
    });
    const [date, setDate] = useState(request?.warehouseReceiptDate || `${shamsi.year}/${shamsi.month}/${shamsi.day}`);
    const [warehouseName, setWarehouseName] = useState(request?.warehouseName || 'انبار قطعات و تجهیزات کارخانه زنجان');
    const [receiverName, setReceiverName] = useState(request?.receiverName || request?.approverWarehouseReceipt || '');
    const [delivererName, setDelivererName] = useState(request?.delivererName || request?.proformas?.find((p: any) => p.isChosen)?.vendorName || '');
    const [waybillNumber, setWaybillNumber] = useState(request?.waybillNumber || '');
    const [notes, setNotes] = useState(request?.warehouseNotes || 'کالا با سلامت فیزیکی کامل و تطابق مشخصات تحویل انبار گردید.');

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-10 md:pt-16 pb-20 overflow-y-auto justify-center p-4 bg-black/60 backdrop-blur-sm text-right dir-rtl">
            <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-in">
                <div className="flex justify-between items-center border-b pb-4 mb-5 border-gray-100">
                    <h3 className="font-black text-lg md:text-xl text-gray-800 flex items-center gap-2">
                        <Warehouse className="text-indigo-600"/> 
                        <span>صدور رسید انبار رسمی ورود کالا</span>
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                        <X size={20} />
                    </button>
                </div>

                {request && (
                    <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100 mb-5 text-xs font-bold space-y-1">
                        <div className="flex justify-between text-indigo-900">
                            <span>درخواست خرید: <strong className="font-mono">{request.requestNumber}</strong></span>
                            <span>نام کالا: <strong>{request.itemName}</strong></span>
                        </div>
                        <div className="text-gray-600 text-[11px]">
                            مقدار ورودی: <strong>{request.entryQuantity || request.quantity} {request.unit}</strong> | تامین‌کننده: <strong>{request.proformas?.find((p: any) => p.isChosen)?.vendorName || 'نامشخص'}</strong>
                        </div>
                    </div>
                )}

                <div className="space-y-4 text-xs font-bold">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-600 block mb-1">شماره رسید انبار</label>
                            <input className="w-full border rounded-xl p-3 text-xs font-mono font-black bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none text-indigo-700" value={num} onChange={e=>setNum(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-gray-600 block mb-1">تاریخ ثبت رسید</label>
                            <input className="w-full border rounded-xl p-3 text-xs font-mono font-black text-center focus:ring-2 focus:ring-indigo-500 outline-none" value={date} onChange={e=>setDate(e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className="text-gray-600 block mb-1">انبار مقصد</label>
                        <select className="w-full border rounded-xl p-3 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={warehouseName} onChange={e=>setWarehouseName(e.target.value)}>
                            <option value="انبار قطعات و تجهیزات کارخانه زنجان">انبار قطعات و تجهیزات کارخانه زنجان</option>
                            <option value="انبار مواد اولیه و ملزومات">انبار مواد اولیه و ملزومات</option>
                            <option value="انبار ابزارآلات و ایمنی">انبار ابزارآلات و ایمنی</option>
                            <option value="انبار عمومی کارخانه">انبار عمومی کارخانه</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-600 block mb-1">نام تحویل‌گیرنده (انباردار)</label>
                            <input className="w-full border rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="نام انباردار" value={receiverName} onChange={e=>setReceiverName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-gray-600 block mb-1">نام تحویل‌دهنده (باربری / راننده)</label>
                            <input className="w-full border rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="نام تحویل‌دهنده" value={delivererName} onChange={e=>setDelivererName(e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className="text-gray-600 block mb-1">شماره فاکتور / بارنامه</label>
                        <input className="w-full border rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="شماره فاکتور یا بارنامه خرید" value={waybillNumber} onChange={e=>setWaybillNumber(e.target.value)} />
                    </div>

                    <div>
                        <label className="text-gray-600 block mb-1">ملاحظات و وضعیت سلامت فیزیکی کالا</label>
                        <textarea className="w-full border rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none h-20" placeholder="توضیحات و ملاحظات تحویل کالا..." value={notes} onChange={e=>setNotes(e.target.value)} />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button 
                            onClick={() => onConfirm({ 
                                warehouseReceiptNumber: num, 
                                warehouseReceiptDate: date,
                                warehouseName,
                                receiverName,
                                delivererName,
                                waybillNumber,
                                warehouseNotes: notes 
                            })} 
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <CheckCircle size={16} />
                            <span>ثبت و ارسال جهت تایید مدیریت</span>
                        </button>
                        <button onClick={onClose} className="px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs cursor-pointer">
                            انصراف
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- WAREHOUSE RECEIPTS TAB ---
const WarehouseReceiptsTab = ({ requests, currentUser, onRequestUpdate, parts, settings }: any) => {
    const [subTab, setSubTab] = useState<'PENDING' | 'REGISTER'>('PENDING');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedReqForModal, setSelectedReqForModal] = useState<any>(null);
    const [selectedReqForView, setSelectedReqForView] = useState<any>(null);
    const [printingReq, setPrintingReq] = useState<any>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const hasPurchasePerm = (perm: string) => {
        return checkPurchasePermission(currentUser, perm, settings);
    };

    const isAdmin = currentUser.role === UserRole.ADMIN || (currentUser.roles && currentUser.roles.includes(UserRole.ADMIN));
    const canWarehouseFinalize = isAdmin || hasPurchasePerm('canWarehouseFinalize');
    const canApproveFactory = isAdmin || hasPurchasePerm('canApproveFactory');

    // Pending requests for warehouse receipt or manager approval
    const pendingReceiptRequests = requests.filter((r: PurchaseRequest) => 
        r.status === PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT ||
        r.status === PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN
    );

    // Registered/Archived warehouse receipts
    const registeredReceipts = requests.filter((r: PurchaseRequest) => 
        !!r.warehouseReceiptNumber || r.status === PurchaseRequestStatus.COMPLETED
    );

    const counts = {
        total: registeredReceipts.length,
        pendingIssue: requests.filter((r: PurchaseRequest) => r.status === PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT).length,
        pendingSign: requests.filter((r: PurchaseRequest) => r.status === PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN).length,
        completed: requests.filter((r: PurchaseRequest) => r.status === PurchaseRequestStatus.COMPLETED && !!r.warehouseReceiptNumber).length
    };

    const handleIssueReceipt = async (reqId: string, receiptData: any) => {
        setActionLoading(true);
        try {
            const targetReq = requests.find((r: any) => r.id === reqId);
            if (!targetReq) return;
            const updated = {
                ...targetReq,
                ...receiptData,
                approverWarehouseReceipt: currentUser.fullName,
                status: PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN,
                updatedAt: Date.now(),
                auditLogs: [
                    ...(targetReq.auditLogs || []),
                    {
                        id: generateUUID(),
                        user: currentUser.fullName,
                        role: currentUser.role,
                        action: 'صدور رسید انبار',
                        timestamp: Date.now(),
                        details: `رسید انبار شماره ${receiptData.warehouseReceiptNumber} صادر و جهت تایید مدیریت ارسال شد.`
                    }
                ]
            };
            await updatePurchaseRequest(updated);
            alert(`رسید انبار شماره ${receiptData.warehouseReceiptNumber} با موفقیت صادر و جهت امضای مدیریت ارسال گردید.`);
            setSelectedReqForModal(null);
            if (onRequestUpdate) onRequestUpdate();
        } catch (e) {
            console.error(e);
            alert('خطا در ثبت رسید انبار');
        } finally {
            setActionLoading(false);
        }
    };

    const handleApproveReceiptByManager = async (req: any) => {
        if (!confirm(`آیا از تایید، امضای دیجیتال و بایگانی رسید انبار شماره ${req.warehouseReceiptNumber || req.requestNumber} اطمینان دارید؟`)) return;
        setActionLoading(true);
        try {
            const updated = {
                ...req,
                approverFactoryArchive: currentUser.fullName,
                approverFactoryFinal: currentUser.fullName,
                status: PurchaseRequestStatus.COMPLETED,
                completedAt: Date.now(),
                updatedAt: Date.now(),
                auditLogs: [
                    ...(req.auditLogs || []),
                    {
                        id: generateUUID(),
                        user: currentUser.fullName,
                        role: currentUser.role,
                        action: 'تایید نهایی و بایگانی رسید انبار',
                        timestamp: Date.now(),
                        details: `رسید انبار شماره ${req.warehouseReceiptNumber || '-'} توسط مدیریت کارخانه تایید، امضا و بایگانی گردید.`
                    }
                ]
            };
            await updatePurchaseRequest(updated);
            alert('رسید انبار با موفقیت توسط مدیریت تایید و در بایگانی دائم ثبت گردید.');
            if (onRequestUpdate) onRequestUpdate();
        } catch (e) {
            console.error(e);
            alert('خطا در تایید مدیریت');
        } finally {
            setActionLoading(false);
        }
    };

    const filteredList = (subTab === 'PENDING' ? pendingReceiptRequests : registeredReceipts).filter((r: any) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (r.requestNumber || '').toLowerCase().includes(q) ||
               (r.warehouseReceiptNumber || '').toLowerCase().includes(q) ||
               (r.itemName || '').toLowerCase().includes(q) ||
               (r.purchaseReason || '').toLowerCase().includes(q);
    });

    return (
        <div className="space-y-6 text-right dir-rtl">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white p-5 rounded-2xl shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-xs text-indigo-100 font-bold">کل رسیدهای صادر شده</p>
                        <h3 className="text-2xl font-black mt-1">{counts.total}</h3>
                    </div>
                    <Warehouse size={32} className="text-indigo-200 opacity-80" />
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-amber-700 text-white p-5 rounded-2xl shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-xs text-amber-100 font-bold">در انتظار صدور رسید</p>
                        <h3 className="text-2xl font-black mt-1">{counts.pendingIssue}</h3>
                    </div>
                    <Clock size={32} className="text-amber-200 opacity-80" />
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white p-5 rounded-2xl shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-xs text-purple-100 font-bold">در انتظار تایید مدیریت</p>
                        <h3 className="text-2xl font-black mt-1">{counts.pendingSign}</h3>
                    </div>
                    <ShieldCheck size={32} className="text-purple-200 opacity-80" />
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-5 rounded-2xl shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-xs text-emerald-100 font-bold">بایگانی نهایی رسیدها</p>
                        <h3 className="text-2xl font-black mt-1">{counts.completed}</h3>
                    </div>
                    <CheckCircle size={32} className="text-emerald-200 opacity-80" />
                </div>
            </div>

            {/* Controls & Search */}
            <div className="glass-panel p-4 rounded-2xl border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex bg-gray-200 p-1 rounded-xl w-full md:w-auto">
                    <button 
                        onClick={() => setSubTab('PENDING')}
                        className={`flex-1 md:flex-none px-5 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${subTab === 'PENDING' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600'}`}
                    >
                        <Clock size={14} />
                        <span>کارتابل درخواست‌های رسید انبار ({pendingReceiptRequests.length})</span>
                    </button>
                    <button 
                        onClick={() => setSubTab('REGISTER')}
                        className={`flex-1 md:flex-none px-5 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${subTab === 'REGISTER' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600'}`}
                    >
                        <Warehouse size={14} />
                        <span>دفتر ثبت و بایگانی رسیدهای انبار ({registeredReceipts.length})</span>
                    </button>
                </div>

                <div className="relative w-full md:w-80">
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="جستجوی شماره رسید، درخواست یا نام کالا..."
                        className="w-full bg-white border border-gray-300 rounded-xl py-2.5 pr-10 pl-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Search size={16} className="absolute right-3 top-3 text-gray-400" />
                </div>
            </div>

            {/* List Table */}
            <div className="glass-panel rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-gray-100/80 text-gray-700 text-xs font-black border-b border-gray-200">
                                <th className="p-4">شماره رسید انبار</th>
                                <th className="p-4">شماره درخواست</th>
                                <th className="p-4">شرح کالا / قطعه</th>
                                <th className="p-4 text-center">مقدار</th>
                                <th className="p-4">تاریخ رسید</th>
                                <th className="p-4">وضعیت فرآیند رسید</th>
                                <th className="p-4 text-center">عملیات مدیریت و انبار</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-800">
                            {filteredList.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-10 text-center text-gray-400">
                                        هیچ سند یا درخواستی در این بخش یافت نشد.
                                    </td>
                                </tr>
                            ) : (
                                filteredList.map((req: any) => (
                                    <tr key={req.id} className="hover:bg-indigo-50/40 transition-colors">
                                        <td className="p-4 font-mono font-black text-indigo-700">
                                            {req.warehouseReceiptNumber || <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">در انتظار صدور</span>}
                                        </td>
                                        <td className="p-4 font-mono font-bold text-gray-600">
                                            {req.requestNumber}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-black text-gray-900">{req.itemName}</div>
                                            <div className="text-[10px] text-gray-500 line-clamp-1">{req.purchaseReason || req.specifications || '-'}</div>
                                        </td>
                                        <td className="p-4 text-center font-black">
                                            {req.entryQuantity || req.quantity} {req.unit}
                                        </td>
                                        <td className="p-4 font-mono text-gray-600">
                                            {req.warehouseReceiptDate || formatDate(req.updatedAt || req.createdAt)}
                                        </td>
                                        <td className="p-4">
                                            {req.status === PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT && (
                                                <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-[10px] font-black border border-amber-200 inline-flex items-center gap-1">
                                                    <Clock size={12}/> منتظر صدور توسط انباردار
                                                </span>
                                            )}
                                            {req.status === PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN && (
                                                <span className="bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full text-[10px] font-black border border-purple-200 inline-flex items-center gap-1">
                                                    <ShieldCheck size={12}/> منتظر تایید و امضای مدیریت
                                                </span>
                                            )}
                                            {req.status === PurchaseRequestStatus.COMPLETED && (
                                                <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-[10px] font-black border border-emerald-200 inline-flex items-center gap-1">
                                                    <CheckCircle size={12}/> تایید شده و بایگانی نهایی
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                {/* Issue Receipt Button */}
                                                {req.status === PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT && canWarehouseFinalize && (
                                                    <button 
                                                        onClick={() => setSelectedReqForModal(req)}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Warehouse size={13} />
                                                        <span>صدور رسید</span>
                                                    </button>
                                                )}

                                                {/* Approve Receipt Button */}
                                                {req.status === PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN && canApproveFactory && (
                                                    <button 
                                                        onClick={() => handleApproveReceiptByManager(req)}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                                                        disabled={actionLoading}
                                                    >
                                                        <CheckCircle size={13} />
                                                        <span>تایید مدیریت</span>
                                                    </button>
                                                )}

                                                {/* Print Receipt Button */}
                                                {req.warehouseReceiptNumber && (
                                                    <button 
                                                        onClick={() => {
                                                            setPrintingReq(req);
                                                            setTimeout(() => window.print(), 300);
                                                        }}
                                                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                                        title="چاپ رسید انبار (A5)"
                                                    >
                                                        <Printer size={13} />
                                                        <span>چاپ</span>
                                                    </button>
                                                )}

                                                {/* View Request Details */}
                                                <button 
                                                    onClick={() => setSelectedReqForView(req)}
                                                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                                >
                                                    <Eye size={13} />
                                                    <span>جزئیات</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Warehouse Receipt Creation Modal */}
            {selectedReqForModal && (
                <WarehouseReceiptModal 
                    request={selectedReqForModal}
                    onClose={() => setSelectedReqForModal(null)}
                    onConfirm={(data: any) => handleIssueReceipt(selectedReqForModal.id, data)}
                />
            )}

            {/* View Request Modal */}
            {selectedReqForView && (
                <ViewRequestModal 
                    request={selectedReqForView} 
                    onClose={() => setSelectedReqForView(null)} 
                    currentUser={currentUser} 
                    onSuccess={() => {
                        setSelectedReqForView(null);
                        if (onRequestUpdate) onRequestUpdate();
                    }} 
                    settings={settings} 
                    parts={parts} 
                />
            )}

            {/* Print Hidden Render Section */}
            {printingReq && (
                <div className="print-render-wrapper opacity-0 pointer-events-none absolute -z-50 overflow-hidden h-0 w-0" aria-hidden="true">
                    <div id="print-purchase-receipt-standalone">
                        <PrintWarehouseReceipt request={printingReq} />
                    </div>
                </div>
            )}
        </div>
    );
};

const SecurityEntryModal = ({ onClose, onConfirm }: any) => {
    const [qty, setQty] = useState(0);
    const [weight, setWeight] = useState(0);

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/50 shadow-2xl">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                <h3 className="font-black text-lg mb-4">ثبت ورود کالا (انتظامات)</h3>
                <div className="space-y-4">
                    <div><label className="text-xs font-bold text-gray-500 mb-1">تعداد واقعی ورود</label><input type="number" className="w-full border rounded-xl p-3" value={qty} onChange={e=>setQty(+e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-gray-500 mb-1">وزن واقعی ورود</label><input type="number" className="w-full border rounded-xl p-3" value={weight} onChange={e=>setWeight(+e.target.value)} /></div>
                    <button onClick={() => onConfirm({ entryQuantity: qty, entryWeight: weight, entryTime: new Date().toLocaleTimeString('fa-IR') })} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl shadow-lg">تایید و ثبت ورود</button>
                    <button onClick={onClose} className="w-full text-gray-500 font-bold border rounded-xl py-2 mt-2">انصراف</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- PARTS TAB ---
const PartsTab = ({ parts, currentUser, onPartUpdate, settings }: any) => {
    const perms = React.useMemo(() => {
        return getRolePermissions(currentUser.role, settings || null, currentUser);
    }, [currentUser, settings]);

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showDataSheet, setShowDataSheet] = useState<PartMasterData | null>(null);
    const [editingPart, setEditingPart] = useState<PartMasterData | null>(null);
    const [previewPdf, setPreviewPdf] = useState<{ url: string; fileName: string } | null>(null);

    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);

    const hasPurchasePerm = (perm: string) => {
        if (currentUser.role === UserRole.ADMIN) return true;
        if (currentUser.roles && currentUser.roles.includes(UserRole.ADMIN)) return true;
        if ((currentUser as any)[perm] === true) return true;
        
        const rolesList = currentUser.roles && currentUser.roles.length > 0 ? currentUser.roles : [currentUser.role];
        for (const r of rolesList) {
            if (r === UserRole.ADMIN) return true;
            const rolePerms = settings?.purchaseRolePermissions?.[r] || {};
            if (!!(rolePerms as any)[perm]) return true;
            const generalRolePerms = settings?.rolePermissions?.[r] || {};
            if (!!(generalRolePerms as any)[perm]) return true;
        }
        return false;
    };

    const canManageParts = hasPurchasePerm('canManageParts') || 
                           hasPurchasePerm('canManageWarehouse') || 
                           hasPurchasePerm('canWarehouseFinalize') || 
                           currentUser.role === UserRole.ADMIN || 
                           currentUser.role === UserRole.WAREHOUSE_KEEPER ||
                           (currentUser.roles && (currentUser.roles.includes(UserRole.ADMIN) || currentUser.roles.includes(UserRole.WAREHOUSE_KEEPER))) ||
                           !!currentUser.canManageParts;

    const filtered = parts.filter((p: PartMasterData) => 
        p.name.includes(searchTerm) || 
        p.category.includes(searchTerm) || 
        (p.subCategory && p.subCategory.includes(searchTerm)) ||
        (p.dimensions && p.dimensions.includes(searchTerm)) ||
        (p.machineName && p.machineName.includes(searchTerm))
    );

    const categories = Array.from(new Set(parts.map((p: PartMasterData) => p.category)));
    const subCategories = selectedCategory ? Array.from(new Set(parts.filter((p: PartMasterData) => p.category === selectedCategory && p.subCategory).map((p: PartMasterData) => p.subCategory))) : [];

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const buffer = evt.target?.result;
                const wb = XLSX.read(buffer, { type: 'array', codepage: 65001 });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                
                let successCount = 0;
                for (const row of data as any[]) {
                    const itemName = fixMojibake(row['نام کالا'] || row['نام'] || '');
                    if (!itemName) continue;
                    const newPart: PartMasterData = {
                        id: generateUUID(),
                        name: itemName,
                        type: fixMojibake(row['نوع'] || 'قطعات'),
                        category: fixMojibake(row['گروه'] || 'عمومی'),
                        subCategory: fixMojibake(row['زیرگروه'] || ''),
                        dimensions: fixMojibake(row['ابعاد یا مشخصات'] || ''),
                        machineName: fixMojibake(row['نام دستگاه'] || ''),
                        unit: fixMojibake(row['واحد'] || 'عدد'),
                        minStock: parseInt(row['حداقل موجودی']) || 0,
                        currentStock: parseInt(row['موجودی اولیه']) || 0
                    };
                    await savePartMasterData(newPart);
                    successCount++;
                }
                alert(`${successCount} کالا با موفقیت از اکسل وارد شد.`);
                onPartUpdate();
            } catch (err) {
                alert('خطا در خواندن فایل اکسل');
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2 items-center">
                <div className="relative flex-1 w-full">
                    <input className="w-full glass-panel border border-gray-200 rounded-xl p-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-indigo-100" placeholder="جستجوی کالا، گروه یا زیرگروه..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setSelectedCategory(null); setSelectedSubCategory(null); }} />
                    <Search className="absolute right-3 top-3.5 text-gray-400" size={18}/>
                </div>
                {canManageParts && (
                    <div className="flex gap-2 w-full md:w-auto">
                        <label className="bg-green-600 text-white p-3 rounded-xl shadow-lg shadow-green-100 flex justify-center items-center gap-2 font-bold text-sm cursor-pointer hover:bg-green-700 transition">
                            <UploadCloud size={20}/> اکسل
                            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                        </label>
                        <button onClick={() => { setEditingPart(null); setShowModal(true); }} className="flex-1 md:flex-none justify-center bg-indigo-600 text-white p-3 rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-2 font-bold text-sm transition hover:bg-indigo-700">
                            <Plus size={20}/> تعریف جدید
                        </button>
                    </div>
                )}            </div>

            {!searchTerm && selectedCategory && (
                 <div className="flex items-center gap-2 text-sm font-bold text-gray-600 bg-gray-100 p-3 rounded-xl shadow-inner">
                    <button onClick={() => { setSelectedCategory(null); setSelectedSubCategory(null); }} className="hover:text-indigo-600">گروه‌ها</button>
                    <span>/</span>
                    <button onClick={() => setSelectedSubCategory(null)} className={`hover:text-indigo-600 ${!selectedSubCategory ? 'text-indigo-600' : ''}`}>{selectedCategory}</button>
                    {selectedSubCategory && (
                        <>
                            <span>/</span>
                            <span className="text-indigo-600">{selectedSubCategory}</span>
                        </>
                    )}
                 </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {searchTerm ? (
                    filtered.map((p: PartMasterData) => (
                        <div key={p.id} className="glass-panel border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group">
                            <div className="h-40 bg-gray-100 relative overflow-hidden cursor-pointer" onClick={() => setShowDataSheet(p)}>
                                {p.image ? (
                                    <CachedImage src={p.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={p.name} referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                        <ImageIcon size={48} />
                                        <span className="text-[10px] font-bold uppercase mt-2">No Image</span>
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full backdrop-blur-sm">{p.type || 'کالا'} | {p.category}</div>
                            </div>
                            <div className="p-4">
                                <h3 className="font-black text-gray-800 text-sm mb-1">{p.name}</h3>
                                <p className="text-[10px] text-gray-500 line-clamp-1 mb-3">{p.subCategory ? `زیرگروه: ${p.subCategory}` : 'فاقد زیرگروه'} | {p.dimensions || 'فاقد مشخصات ابعادی'}{p.machineName ? ` | دستگاه: ${p.machineName}` : ''}</p>
                                
                                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Stock Balance</span>
                                        <span className={`text-sm font-black ${p.currentStock <= (p.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-green-600'}`}>
                                            {p.currentStock} {p.unit}
                                        </span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => setShowDataSheet(p)} className="p-2 bg-gray-50 text-indigo-600 rounded-lg hover:bg-indigo-100" title="مشاهده شناسنامه فنی"><Info size={16}/></button>
                                        {p.pdfAttachment && (
                                            <>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setPreviewPdf({ url: p.pdfAttachment, fileName: `کاتالوگ_${p.name}.pdf` })} 
                                                    className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors" 
                                                    title="پیش‌نمایش کاتالوگ/PDF"
                                                >
                                                    <FileText size={16}/>
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => openSendToChat({
                                                        fileUrl: p.pdfAttachment,
                                                        fileName: `Catalog_${p.name}.pdf`,
                                                        title: `ارسال کاتالوگ ${p.name} به گفتگو`,
                                                        defaultMessage: `📄 کاتالوگ فنی و فایل پیوست کالا: ${p.name} (کد: ${p.id})`
                                                    })}
                                                    className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" 
                                                    title="ارسال کاتالوگ به گفتگو"
                                                >
                                                    <MessageSquare size={16}/>
                                                </button>
                                            </>
                                        )}
                                        {canManageParts && (
                                            <>
                                                <button onClick={() => { setEditingPart(p); setShowModal(true); }} className="p-2 bg-gray-50 text-emerald-600 rounded-lg hover:bg-indigo-100" title="ویرایش کالا"><Edit size={16}/></button>
                                                <button onClick={async () => { if(confirm('حذف شود؟')) { await deletePartMasterData(p.id); onPartUpdate(); } }} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100" title="حذف کالا"><Trash2 size={16}/></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : !selectedCategory ? (
                     categories.map((cat: any) => (
                         <div key={cat} onClick={() => setSelectedCategory(cat)} className="glass-panel border-2 border-indigo-100 rounded-3xl p-8 text-center cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-indigo-300 transition-all flex flex-col items-center gap-4 bg-gradient-to-b from-white to-indigo-50/30">
                              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                                  <Layers size={32} />
                              </div>
                              <div>
                                  <h3 className="text-xl font-black text-gray-800 mb-1">{cat}</h3>
                                  <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full">{parts.filter((p: any) => p.category === cat).length} کالا</span>
                              </div>
                         </div>
                     ))
                ) : selectedCategory && !selectedSubCategory && subCategories.length > 0 ? (
                     subCategories.map((sub: any) => (
                         <div key={sub} onClick={() => setSelectedSubCategory(sub)} className="glass-panel border-2 border-teal-100 rounded-3xl p-8 text-center cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-teal-300 transition-all flex flex-col items-center gap-4 bg-gradient-to-b from-white to-teal-50/30">
                              <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center text-teal-600 shadow-inner">
                                  <Tag size={32} />
                              </div>
                              <div>
                                  <h3 className="text-xl font-black text-gray-800 mb-1">{sub}</h3>
                                  <span className="text-xs font-bold text-teal-500 bg-teal-50 px-3 py-1 rounded-full">{parts.filter((p: any) => p.category === selectedCategory && p.subCategory === sub).length} کالا</span>
                              </div>
                         </div>
                     )).concat(
                         // Parts that don't have subcategory
                         parts.filter((p: any) => p.category === selectedCategory && !p.subCategory).map((p: any) => (
                             <div key={p.id} className="glass-panel border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group">
                                <div className="h-40 bg-gray-100 relative overflow-hidden cursor-pointer" onClick={() => setShowDataSheet(p)}>
                                    {p.image ? (
                                        <CachedImage src={p.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={p.name} referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                            <ImageIcon size={48} />
                                            <span className="text-[10px] font-bold uppercase mt-2">No Image</span>
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full backdrop-blur-sm">{p.type || 'کالا'} | {p.category}</div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-black text-gray-800 text-sm mb-1">{p.name}</h3>
                                    <p className="text-[10px] text-gray-500 line-clamp-1 mb-3">{p.subCategory ? `زیرگروه: ${p.subCategory}` : 'فاقد زیرگروه'} | {p.dimensions || 'فاقد مشخصات ابعادی'}{p.machineName ? ` | دستگاه: ${p.machineName}` : ''}</p>
                                    
                                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Stock Balance</span>
                                            <span className={`text-sm font-black ${p.currentStock <= (p.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-green-600'}`}>
                                                {p.currentStock} {p.unit}
                                            </span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => setShowDataSheet(p)} className="p-2 bg-gray-50 text-indigo-600 rounded-lg hover:bg-indigo-100" title="مشاهده شناسنامه فنی"><Info size={16}/></button>
                                            {p.pdfAttachment && (
                                                <>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setPreviewPdf({ url: p.pdfAttachment, fileName: `کاتالوگ_${p.name}.pdf` })} 
                                                        className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors" 
                                                        title="پیش‌نمایش کاتالوگ/PDF"
                                                    >
                                                        <FileText size={16}/>
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => openSendToChat({
                                                            fileUrl: p.pdfAttachment,
                                                            fileName: `Catalog_${p.name}.pdf`,
                                                            title: `ارسال کاتالوگ ${p.name} به گفتگو`,
                                                            defaultMessage: `📄 کاتالوگ فنی و فایل پیوست کالا: ${p.name} (کد: ${p.id})`
                                                        })}
                                                        className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" 
                                                        title="ارسال کاتالوگ به گفتگو"
                                                    >
                                                        <MessageSquare size={16}/>
                                                    </button>
                                                </>
                                            )}
                                            {canManageParts && (
                                                <>
                                                    <button onClick={() => { setEditingPart(p); setShowModal(true); }} className="p-2 bg-gray-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="ویرایش کالا"><Edit size={16}/></button>
                                                    <button onClick={async () => { if(confirm('حذف شود؟')) { await deletePartMasterData(p.id); onPartUpdate(); } }} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100" title="حذف کالا"><Trash2 size={16}/></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                         ))
                     )
                ) : (
                       parts.filter((p: any) => p.category === selectedCategory && (!selectedSubCategory || p.subCategory === selectedSubCategory)).map((p: any) => (
                        <div key={p.id} className="glass-panel border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group">
                            <div className="h-40 bg-gray-100 relative overflow-hidden cursor-pointer" onClick={() => setShowDataSheet(p)}>
                                {p.image ? (
                                    <CachedImage src={p.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={p.name} referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                        <ImageIcon size={48} />
                                        <span className="text-[10px] font-bold uppercase mt-2">No Image</span>
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full backdrop-blur-sm">{p.type || 'کالا'} | {p.category}</div>
                            </div>
                            <div className="p-4">
                                <h3 className="font-black text-gray-800 text-sm mb-1">{p.name}</h3>
                                <p className="text-[10px] text-gray-500 line-clamp-1 mb-3">{p.subCategory ? `زیرگروه: ${p.subCategory}` : 'فاقد زیرگروه'} | {p.dimensions || 'فاقد مشخصات ابعادی'}{p.machineName ? ` | دستگاه: ${p.machineName}` : ''}</p>
                                
                                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Stock Balance</span>
                                        <span className={`text-sm font-black ${p.currentStock <= (p.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-green-600'}`}>
                                            {p.currentStock} {p.unit}
                                        </span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => setShowDataSheet(p)} className="p-2 bg-gray-50 text-indigo-600 rounded-lg hover:bg-indigo-100" title="مشاهده شناسنامه فنی"><Info size={16}/></button>
                                        {p.pdfAttachment && (
                                            <>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setPreviewPdf({ url: p.pdfAttachment, fileName: `کاتالوگ_${p.name}.pdf` })} 
                                                    className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors" 
                                                    title="پیش‌نمایش کاتالوگ/PDF"
                                                >
                                                    <FileText size={16}/>
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => openSendToChat({
                                                        fileUrl: p.pdfAttachment,
                                                        fileName: `Catalog_${p.name}.pdf`,
                                                        title: `ارسال کاتالوگ ${p.name} به گفتگو`,
                                                        defaultMessage: `📄 کاتالوگ فنی و فایل پیوست کالا: ${p.name} (کد: ${p.id})`
                                                    })}
                                                    className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" 
                                                    title="ارسال کاتالوگ به گفتگو"
                                                >
                                                    <MessageSquare size={16}/>
                                                </button>
                                            </>
                                        )}
                                        {canManageParts && (
                                            <>
                                                <button onClick={() => { setEditingPart(p); setShowModal(true); }} className="p-2 bg-gray-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="ویرایش کالا"><Edit size={16}/></button>
                                                <button onClick={async () => { if(confirm('حذف شود؟')) { await deletePartMasterData(p.id); onPartUpdate(); } }} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100" title="حذف کالا"><Trash2 size={16}/></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                     ))
                )}
            </div>

            {showModal && <PartModal onClose={() => setShowModal(false)} onSuccess={onPartUpdate} initialData={editingPart} parts={parts} />}
            {showDataSheet && <DataSheetModal part={showDataSheet} onClose={() => setShowDataSheet(null)} />}
            {previewPdf && (
                <FileViewerModal 
                    isOpen={!!previewPdf} 
                    onClose={() => setPreviewPdf(null)} 
                    fileUrl={previewPdf.url} 
                    fileName={previewPdf.fileName} 
                />
            )}
        </div>
    );
};

const PartModal = ({ onClose, onSuccess, initialData, parts }: any) => {
    const [loading, setLoading] = useState(false);
    const [uploadingImg, setUploadingImg] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [previewPdf, setPreviewPdf] = useState<{ url: string; fileName: string } | null>(null);
    const [activeImgSlide, setActiveImgSlide] = useState(0);
    const [activePdfSlide, setActivePdfSlide] = useState(0);

    const [formData, setFormData] = useState<Partial<PartMasterData>>(() => {
        const base = initialData || {
            name: '',
            type: 'قطعات',
            category: '',
            subCategory: '',
            dimensions: '',
            machineName: '',
            unit: 'عدد',
            minStock: 0,
            currentStock: 0,
            image: '',
            images: [],
            pdfAttachment: '',
            pdfAttachments: []
        };
        const initImages = Array.isArray(base.images) && base.images.length > 0
            ? base.images.filter(Boolean)
            : (base.image ? [base.image] : []);
        const initPdfs = Array.isArray(base.pdfAttachments) && base.pdfAttachments.length > 0
            ? base.pdfAttachments.filter(Boolean)
            : (base.pdfAttachment ? [base.pdfAttachment] : []);
        return {
            ...base,
            images: initImages,
            image: initImages[0] || '',
            pdfAttachments: initPdfs,
            pdfAttachment: initPdfs[0] || ''
        };
    });

    const imageList = formData.images || (formData.image ? [formData.image] : []);
    const pdfList = formData.pdfAttachments || (formData.pdfAttachment ? [formData.pdfAttachment] : []);

    const safeImgSlide = imageList.length > 0 ? Math.min(activeImgSlide, imageList.length - 1) : 0;
    const safePdfSlide = pdfList.length > 0 ? Math.min(activePdfSlide, pdfList.length - 1) : 0;

    const categories = Array.from(new Set(parts.map((p: any) => p.category).filter(Boolean)));
    const subCategories = Array.from(new Set(parts.filter((p: any) => p.category === formData.category).map((p: any) => p.subCategory).filter(Boolean)));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!formData.name || !formData.category) return alert('نام و گروه‌بندی الزامی است');
        setLoading(true);
        try {
            const syncedData: Partial<PartMasterData> = {
                ...formData,
                images: imageList,
                image: imageList[0] || '',
                pdfAttachments: pdfList,
                pdfAttachment: pdfList[0] || ''
            };
            const finalPart = { ...syncedData };
            if (initialData?.id && !initialData.isVirtualForPurchase) {
                await updatePartMasterData({ ...initialData, ...syncedData } as PartMasterData);
            } else {
                const newId = generateUUID();
                finalPart.id = newId;
                await savePartMasterData({ ...syncedData, id: newId } as PartMasterData);
            }
            onSuccess(finalPart);
            onClose();
        } catch (e) { 
            console.error('Save Part error', e); 
            alert('خطا در ذخیره: ' + (e as any).message); 
        }
        finally { setLoading(false); }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploadingImg(true);
        try {
            const uploadedUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const res = await uploadFileChunked(files[i], () => {});
                if (res?.url) uploadedUrls.push(res.url);
            }
            if (uploadedUrls.length > 0) {
                const nextImages = [...imageList, ...uploadedUrls];
                setFormData(prev => ({
                    ...prev,
                    images: nextImages,
                    image: nextImages[0] || ''
                }));
                setActiveImgSlide(nextImages.length - 1);
            }
        } catch (err) {
            console.error('Image upload error:', err);
            alert('خطا در بارگذاری تصویر');
        } finally {
            setUploadingImg(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleRemoveImage = (idxToRemove: number) => {
        const nextImages = imageList.filter((_, idx) => idx !== idxToRemove);
        setFormData(prev => ({
            ...prev,
            images: nextImages,
            image: nextImages[0] || ''
        }));
        setActiveImgSlide(Math.max(0, Math.min(safeImgSlide, nextImages.length - 1)));
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploadingPdf(true);
        try {
            const uploadedUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const res = await uploadFileChunked(files[i], () => {});
                if (res?.url) uploadedUrls.push(res.url);
            }
            if (uploadedUrls.length > 0) {
                const nextPdfs = [...pdfList, ...uploadedUrls];
                setFormData(prev => ({
                    ...prev,
                    pdfAttachments: nextPdfs,
                    pdfAttachment: nextPdfs[0] || ''
                }));
                setActivePdfSlide(nextPdfs.length - 1);
            }
        } catch (err) {
            console.error('PDF upload error:', err);
            alert('خطا در بارگذاری فایل PDF');
        } finally {
            setUploadingPdf(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleRemovePdf = (idxToRemove: number) => {
        const nextPdfs = pdfList.filter((_, idx) => idx !== idxToRemove);
        setFormData(prev => ({
            ...prev,
            pdfAttachments: nextPdfs,
            pdfAttachment: nextPdfs[0] || ''
        }));
        setActivePdfSlide(Math.max(0, Math.min(safePdfSlide, nextPdfs.length - 1)));
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000008] flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm overflow-hidden dir-rtl">
            <div className="bg-white rounded-none sm:rounded-[2.5rem] w-full max-w-2xl p-4 sm:p-8 animate-scale-in h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto custom-scrollbar relative text-right">
                <div className="flex justify-between items-center mb-4 sm:mb-6 pb-2.5 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-10">
                    <h2 className="text-base sm:text-2xl font-black text-gray-800 flex items-center gap-2"><Layers size={20} className="text-indigo-600"/> {initialData ? 'ویرایش کالا / قطعه' : 'معرفی کالا جدید'}</h2>
                    <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"><XCircle size={24} className="text-gray-400"/></button>
                </div>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">اطلاعات پایه</label>
                            <div className="space-y-3">
                                <div className="relative"><input className="w-full border-2 border-gray-100 rounded-2xl p-3 pr-10 text-sm focus:border-indigo-400 outline-none" placeholder="نام دقیق کالا..." value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} /><Tag className="absolute right-3 top-3.5 text-gray-300" size={18}/></div>
                                
                                <div className="relative">
                                    <select className="w-full border-2 border-gray-100 rounded-2xl p-3 pr-10 text-sm focus:border-indigo-400 outline-none appearance-none" value={formData.type} onChange={e=>setFormData({...formData, type: e.target.value})}>
                                        <option value="قطعات">قطعات</option>
                                        <option value="مواد اولیه">مواد اولیه</option>
                                        <option value="ملزومات">ملزومات</option>
                                    </select>
                                    <Package className="absolute right-3 top-3.5 text-gray-300" size={18}/>
                                </div>

                                <div className="relative"><input className="w-full border-2 border-gray-100 rounded-2xl p-3 pr-10 text-sm focus:border-indigo-400 outline-none" placeholder="گروه (برقی، روانکار، و ...)" value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})} list="category-list" /><Layers className="absolute right-3 top-3.5 text-gray-300" size={18}/></div>
                                <datalist id="category-list">{categories.map((c: any) => <option key={c} value={c} />)}</datalist>

                                <div className="relative"><input className="w-full border-2 border-gray-100 rounded-2xl p-3 pr-10 text-sm focus:border-indigo-400 outline-none" placeholder="زیر مجموعه..." value={formData.subCategory} onChange={e=>setFormData({...formData, subCategory: e.target.value})} list="subcategory-list" /><Layers className="absolute right-3 top-3.5 text-gray-300" size={14}/></div>
                                <datalist id="subcategory-list">{subCategories.map((c: any) => <option key={c} value={c} />)}</datalist>

                                <div className="relative"><input className="w-full border-2 border-gray-100 rounded-2xl p-3 pr-10 text-sm focus:border-indigo-400 outline-none" placeholder="ابعاد و مشخصات ابعادی..." value={formData.dimensions} onChange={e=>setFormData({...formData, dimensions: e.target.value})} /><Ruler className="absolute right-3 top-3.5 text-gray-300" size={18}/></div>

                                <div className="relative"><input className="w-full border-2 border-gray-100 rounded-2xl p-3 pr-10 text-sm focus:border-indigo-400 outline-none" placeholder="نام دستگاه (مثلا: دستگاه استرچ)..." value={formData.machineName || ''} onChange={e=>setFormData({...formData, machineName: e.target.value})} /><Settings className="absolute right-3 top-3.5 text-gray-300" size={18}/></div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">موجودی، تصاویر و کاتالوگ‌ها (چندتایی با قابلیت ورق زدن)</label>
                            <div className="space-y-3">
                                <div className="flex gap-4">
                                    <div className="flex-1"><label className="text-[10px] font-bold text-gray-400 mb-1 block">واحد</label><input className="w-full border-2 border-gray-100 rounded-2xl p-3 text-sm" value={formData.unit} onChange={e=>setFormData({...formData, unit: e.target.value})} /></div>
                                    <div className="flex-1"><label className="text-[10px] font-bold text-gray-400 mb-1 block">حداقل موجودی</label><input type="number" className="w-full border-2 border-gray-100 rounded-2xl p-3 text-sm font-bold text-red-500" value={formData.minStock} onChange={e=>setFormData({...formData, minStock: +e.target.value})} /></div>
                                </div>

                                {/* Multi-Image Carousel & Uploader */}
                                <div className="bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-black text-gray-700 flex items-center gap-1.5">
                                            <ImageIcon size={14} className="text-indigo-600" />
                                            <span>تصاویر کالا ({imageList.length} تصویر)</span>
                                        </span>
                                        <label className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black flex items-center gap-1 cursor-pointer shadow-xs transition-all">
                                            {uploadingImg ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                            <span>افزودن عکس‌ها</span>
                                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                                        </label>
                                    </div>

                                    {imageList.length > 0 ? (
                                        <div className="space-y-2">
                                            <div className="relative h-36 bg-white rounded-2xl border border-gray-200 overflow-hidden flex items-center justify-center">
                                                <img
                                                    src={resolveImageUrl(imageList[safeImgSlide])}
                                                    className="max-w-full max-h-full object-contain"
                                                    alt={`part-${safeImgSlide + 1}`}
                                                    referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-black px-2 py-0.5 rounded-lg">
                                                    {safeImgSlide + 1} از {imageList.length}
                                                </div>
                                                <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewPdf({ url: resolveImageUrl(imageList[safeImgSlide]), fileName: `تصویر_${safeImgSlide + 1}_${formData.name || 'part'}.jpg` })}
                                                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md cursor-pointer"
                                                        title="مشاهده تصویر"
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveImage(safeImgSlide)}
                                                        className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md cursor-pointer"
                                                        title="حذف این تصویر"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>

                                                {imageList.length > 1 && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveImgSlide((safeImgSlide - 1 + imageList.length) % imageList.length)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer"
                                                            title="تصویر قبلی"
                                                        >
                                                            <ChevronRight size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveImgSlide((safeImgSlide + 1) % imageList.length)}
                                                            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer"
                                                            title="تصویر بعدی"
                                                        >
                                                            <ChevronLeft size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            {imageList.length > 1 && (
                                                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                                                    {imageList.map((imgUrl, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setActiveImgSlide(idx)}
                                                            className={`w-10 h-10 rounded-lg border-2 overflow-hidden shrink-0 cursor-pointer transition-all ${
                                                                idx === safeImgSlide ? 'border-indigo-600 scale-105' : 'border-gray-200 opacity-65'
                                                            }`}
                                                        >
                                                            <img src={resolveImageUrl(imgUrl)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <label className="h-28 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100/80 rounded-2xl transition-all">
                                            <Upload className="text-gray-300" size={28}/>
                                            <p className="text-[10px] font-black text-gray-400 mt-1.5">کلیک جهت بارگذاری یک یا چند تصویر کالا</p>
                                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                                        </label>
                                    )}
                                </div>

                                {/* Multi-PDF Carousel & Uploader */}
                                <div className="p-3.5 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                                                <FileUp size={18} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-gray-700">کاتالوگ‌ها و نقشه‌های PDF ({pdfList.length} فایل)</p>
                                                <p className="text-[10px] text-gray-400">امکان آپلود چند فایل PDF و ورق زدن</p>
                                            </div>
                                        </div>
                                        <label className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black flex items-center gap-1 cursor-pointer shadow-xs transition-all shrink-0">
                                            {uploadingPdf ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                            <span>افزودن PDF</span>
                                            <input type="file" accept="application/pdf" multiple className="hidden" onChange={handlePdfUpload} />
                                        </label>
                                    </div>

                                    {pdfList.length > 0 && (
                                        <div className="bg-white border border-red-100 rounded-xl p-2.5 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5">
                                                {pdfList.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setActivePdfSlide((safePdfSlide - 1 + pdfList.length) % pdfList.length)}
                                                        className="p-1 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg cursor-pointer"
                                                        title="فایل PDF قبلی"
                                                    >
                                                        <ChevronRight size={15} />
                                                    </button>
                                                )}
                                                <span className="text-xs font-black text-red-700 flex items-center gap-1">
                                                    <FileText size={14} />
                                                    <span>فایل PDF شماره {safePdfSlide + 1} از {pdfList.length}</span>
                                                </span>
                                                {pdfList.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setActivePdfSlide((safePdfSlide + 1) % pdfList.length)}
                                                        className="p-1 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg cursor-pointer"
                                                        title="فایل PDF بعدی"
                                                    >
                                                        <ChevronLeft size={15} />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewPdf({ url: resolveImageUrl(pdfList[safePdfSlide]), fileName: `Catalog_${safePdfSlide + 1}_${formData.name || 'part'}.pdf` })}
                                                    className="px-2 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-[11px] font-black flex items-center gap-1 transition-colors cursor-pointer"
                                                    title="مشاهده PDF"
                                                >
                                                    <Eye size={13} />
                                                    <span>مشاهده</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => downloadAndOpenFile(resolveImageUrl(pdfList[safePdfSlide]), `Catalog_${safePdfSlide + 1}_${formData.name || 'part'}.pdf`)}
                                                    className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[11px] font-black flex items-center gap-1 transition-colors cursor-pointer"
                                                    title="دانلود PDF"
                                                >
                                                    <Download size={13} />
                                                    <span>دانلود</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePdf(safePdfSlide)}
                                                    className="p-1 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                                                    title="حذف این PDF"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="md:col-span-2 pt-4">
                        <button disabled={loading || uploadingImg || uploadingPdf} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-800 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-70 cursor-pointer">
                            {loading ? <Loader2 className="animate-spin"/> : <ClipboardCheck size={20}/>} {initialData ? 'ثبت تغییرات' : 'معرفی نهایی کالا'}
                        </button>
                    </div>
                </form>

                {previewPdf && (
                    <FileViewerModal 
                        isOpen={!!previewPdf} 
                        onClose={() => setPreviewPdf(null)} 
                        fileUrl={previewPdf.url} 
                        fileName={previewPdf.fileName} 
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

// Barcode Generator Component (SVG-based Code 128 / stripes)
const BarcodeVisual = ({ value }: { value: string }) => {
    const s = value || 'PART-9999';
    const lines: boolean[] = [];
    
    // Deterministic visual stripes generation based on characters ASCII
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        for (let j = 0; j < 8; j++) {
            lines.push(((code >> j) & 1) === 1);
        }
    }
    
    return (
        <div className="flex flex-col items-center bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-stretch h-10 bg-white px-1 gap-[1px]">
                {lines.slice(0, 50).map((isBlack, idx) => (
                    <div 
                        key={idx} 
                        className={`w-[2px] h-full ${isBlack ? 'bg-black' : 'bg-gray-100'}`} 
                    />
                ))}
            </div>
            <span className="text-[10px] font-mono tracking-widest text-gray-400 font-bold mt-1.5 uppercase select-all">{s.slice(0, 16).toUpperCase()}</span>
        </div>
    );
};

// --- KARDEX TAB ---
const KardexTab = ({ parts, selectedPart, setSelectedPart, kardexEntries, loadKardex, onPartUpdate }: any) => {
    const getShamsiString = (shamsi: any = getCurrentShamsiDate()) => {
        if (!shamsi) return '';
        return `${shamsi.year}/${String(shamsi.month).padStart(2, '0')}/${String(shamsi.day).padStart(2, '0')}`;
    };

    // Manual Transaction Form State
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualType, setManualType] = useState<'IN' | 'OUT'>('IN');
    const [manualPartId, setManualPartId] = useState('');
    const [manualQty, setManualQty] = useState<number>(1);
    const [manualPrice, setManualPrice] = useState<number>(0);
    const [manualRef, setManualRef] = useState('');
    const [manualDesc, setManualDesc] = useState('');
    const [manualDate, setManualDate] = useState(getShamsiString());
    const [actionLoading, setActionLoading] = useState(false);

    // Stocktaking (انبارگردانی) State
    const [isStocktaking, setIsStocktaking] = useState(false);
    const [stocktakeItems, setStocktakeItems] = useState<any[]>([]);
    const [stocktakeDate, setStocktakeDate] = useState(getShamsiString());
    const [stocktakeDesc, setStocktakeDesc] = useState('انبارگردانی میان‌دوره');
    const [scanBuffer, setScanBuffer] = useState('');
    const [filterDiscrepancy, setFilterDiscrepancy] = useState(false);
    const [isSharingKardex, setIsSharingKardex] = useState(false);

    const handleShareKardexToChat = async () => {
        if (!selectedPart) return;
        setIsSharingKardex(true);
        try {
            const el = document.getElementById('part-kardex-report-area');
            if (!el) throw new Error('المان گزارش کاردکس یافت نشد');
            await shareElementToChat(
                el,
                `Kardex_${selectedPart.name.replace(/\s+/g, '_')}.jpg`,
                {
                    defaultMessage: `📊 گردش کاردکس کالا: ${selectedPart.name} - موجودی فعلی: ${selectedPart.currentStock} ${selectedPart.unit}`,
                    title: 'ارسال کاردکس کالا به گفتگو'
                }
            );
        } catch (e) {
            console.error(e);
            alert('خطا در آماده‌سازی گزارش جهت ارسال به گفتگو');
        } finally {
            setIsSharingKardex(false);
        }
    };

    // Global barcode listener/quick action state
    const [generalScanInput, setGeneralScanInput] = useState('');
    const [scanMessage, setScanMessage] = useState('');

    useEffect(() => {
        if (selectedPart?.id) {
            setManualPartId(selectedPart.id);
        }
    }, [selectedPart]);

    // Handle Manual IN / OUT Submission
    const handleManualTransactionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualPartId) return alert('لطفاً قطعه را انتخاب کنید.');
        if (manualQty <= 0) return alert('تعداد وارد شده باید بزرگتر از صفر باشد.');

        setActionLoading(true);
        try {
            const response = await fetch('/api/part-kardex/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    partId: manualPartId,
                    type: manualType,
                    quantity: manualQty,
                    referenceNumber: manualRef || (manualType === 'IN' ? 'MANUAL-IN' : 'MANUAL-OUT'),
                    unitPrice: manualPrice,
                    description: manualDesc,
                    date: manualDate
                })
            });

            if (!response.ok) throw new Error('Failed to register transaction');
            const resData = await response.json();
            
            alert('تراکنش با موفقیت ثبت و کاردکس قطعه بروزرسانی شد.');
            setShowManualModal(false);
            setManualQty(1);
            setManualPrice(0);
            setManualRef('');
            setManualDesc('');
            
            // Reload master parts and select part again
            if (onPartUpdate) await onPartUpdate();
            
            const reselected = parts.find((p: any) => p.id === manualPartId);
            if (reselected) {
                setSelectedPart(reselected);
                loadKardex(manualPartId);
            }
        } catch (err) {
            alert('خطا در ثبت تراکنش');
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    // Excel Export for Single Kardex
    const exportKardexToExcel = () => {
        if (!selectedPart) return;
        try {
            const excelData = kardexEntries.map((k: any) => ({
                'کالا': selectedPart.name,
                'تاریخ': k.date,
                'مرجع': k.referenceNumber,
                'نوع تراکنش': k.type === 'IN' ? 'ورود' : 'خروج',
                'مقدار': k.quantity,
                'موجودی مانده': k.balance,
                'قیمت واحد': k.unitPrice || 0,
                'توضیحات': k.description
            }));

            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'کاردکس');
            XLSX.writeFile(wb, `Kardex_${selectedPart.name.replace(/\s+/g, '_')}.xlsx`);
        } catch (e) {
            alert('خطا در خروجی اکسل');
        }
    };

    // Excel Export for All Parts Inventory List
    const exportInventoryToExcel = () => {
        try {
            const excelData = parts.map((p: any) => ({
                'شناسه قطعه': p.id,
                'کد کالا': p.code || p.id.slice(0, 8),
                'نام کالا': p.name,
                'نوع': p.type || 'قطعات',
                'گروه': p.category,
                'زیرگروه': p.subCategory || '-',
                'ابعاد / مشخصات': p.dimensions || '-',
                'نام دستگاه': p.machineName || '-',
                'واحد سنجش': p.unit || 'عدد',
                'موجودی فعلی': p.currentStock || 0,
                'حداقل موجودی': p.minStock || 0,
                'وضعیت سفارش‌دهی': (p.currentStock || 0) <= (p.minStock || 0) ? 'نیاز به خرید فوری' : 'نرمال'
            }));

            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'موجودی انبار قطعات');
            XLSX.writeFile(wb, `Inventory_Report_${getShamsiString().replace(/\//g, '-')}.xlsx`);
        } catch (e) {
            alert('خطا در خروجی اکسل کل قطعات');
        }
    };

    // Hardware Scanner simulation input search
    const handleBarcodeSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = generalScanInput.trim();
        if (!code) return;

        // Try matching part by exact ID or short ID or code or barcode
        const found = parts.find((p: any) => 
            p.id.toLowerCase() === code.toLowerCase() || 
            p.id.split('_')[1]?.toLowerCase() === code.toLowerCase() ||
            p.code?.toLowerCase() === code.toLowerCase() ||
            p.name.toLowerCase().includes(code.toLowerCase())
        );

        if (found) {
            setSelectedPart(found);
            loadKardex(found.id);
            setScanMessage(`قطعه پیدا شد: ${found.name}`);
            setTimeout(() => setScanMessage(''), 4000);
        } else {
            setScanMessage('❌ قطعه‌ای با این کد یا بارکد یافت نشد.');
            setTimeout(() => setScanMessage(''), 4000);
        }
        setGeneralScanInput('');
    };

    // Periodic Stocktaking Setup
    const handleStartStocktaking = () => {
        const initItems = parts.map((p: any) => ({
            partId: p.id,
            name: p.name,
            category: p.category,
            systemQty: p.currentStock || 0,
            countedQty: p.currentStock || 0, // default starts at current stock
            unit: p.unit || 'عدد'
        }));
        setStocktakeItems(initItems);
        setIsStocktaking(true);
    };

    // Increments count by scanning in Stocktaking
    const handleStocktakeBarcodeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = scanBuffer.trim();
        if (!code) return;

        const partIdx = stocktakeItems.findIndex((it: any) => 
            it.partId.toLowerCase() === code.toLowerCase() || 
            it.partId.split('_')[1]?.toLowerCase() === code.toLowerCase() ||
            it.name.toLowerCase().includes(code.toLowerCase())
        );

        if (partIdx > -1) {
            const newItems = [...stocktakeItems];
            newItems[partIdx].countedQty += 1; // scanned, increment by 1!
            setStocktakeItems(newItems);
            setScanMessage(`تعداد ${newItems[partIdx].name} افزایش یافت.`);
            setTimeout(() => setScanMessage(''), 3000);
        } else {
            setScanMessage('⚠️ بارکد در انبارگردانی یافت نشد.');
            setTimeout(() => setScanMessage(''), 3000);
        }
        setScanBuffer('');
    };

    // Save Stocktaking Results
    const handleSaveStocktaking = async () => {
        if (!confirm('آیا مطمئن هستید که می‌خواهید نتایج انبارگردانی را نهایی و موجودی سیستم را اصلاح کنید؟')) return;

        setActionLoading(true);
        try {
            const response = await fetch('/api/part-kardex/stocktake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: stocktakeItems.map(it => ({ partId: it.partId, countedQty: it.countedQty })),
                    date: stocktakeDate,
                    description: stocktakeDesc
                })
            });

            if (!response.ok) throw new Error('Failed to commit stocktaking');
            
            alert('انبارگردانی اصولی با موفقیت پایان یافت. مغایرت‌ها اصلاح و در کاردکس ثبت گردید.');
            setIsStocktaking(false);
            if (onPartUpdate) await onPartUpdate();
            
            // Reload selected part if any
            if (selectedPart) {
                loadKardex(selectedPart.id);
            }
        } catch (err) {
            alert('خطا در نهایی‌سازی انبارگردانی');
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const displayedStocktakeItems = filterDiscrepancy 
        ? stocktakeItems.filter(it => it.countedQty !== it.systemQty)
        : stocktakeItems;

    return (
        <div className="space-y-6 text-right dir-rtl">
            {/* Header / Setup Box */}
            <div className="glass-panel p-6 rounded-3xl border-2 border-indigo-100 shadow-sm bg-white">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                            <History size={28} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-800">سامانه کاردکس و انبارگردانی بارکدی قطعات</h2>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Dynamic Spare Parts Kardex & Cycle Counting</p>
                        </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                        <button 
                            onClick={exportInventoryToExcel} 
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                        >
                            <FileSpreadsheet size={16}/> خروجی اکسل کل انبار
                        </button>
                        <button 
                            onClick={() => { setManualType('IN'); setShowManualModal(true); }} 
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                        >
                            <Plus size={16}/> ثبت ورود دستی
                        </button>
                        <button 
                            onClick={() => { setManualType('OUT'); setShowManualModal(true); }} 
                            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                        >
                            <Trash2 size={16}/> ثبت خروج دستی
                        </button>
                        {!isStocktaking ? (
                            <button 
                                onClick={handleStartStocktaking} 
                                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                            >
                                <CheckCircle size={16}/> شروع انبارگردانی دوره‌ای
                            </button>
                        ) : (
                            <button 
                                onClick={() => setIsStocktaking(false)} 
                                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                            >
                                <X size={16}/> لغو انبارگردانی
                            </button>
                        )}
                    </div>
                </div>

                <hr className="my-5 border-gray-100" />

                {/* Barcode Lookup & Fast Scan Input */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <form onSubmit={handleBarcodeSearchSubmit} className="space-y-1">
                        <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-1">خوانش و شبیه‌ساز بارکدخوان (USB Scanner/Manual Lookup)</label>
                        <div className="relative">
                            <input 
                                className="w-full border-2 border-indigo-100 rounded-2xl p-3 pr-10 text-xs font-bold outline-none focus:border-indigo-500 bg-indigo-50/20" 
                                placeholder="بارکد کالا را اسکن کنید یا شناسه/نام آن را وارد کرده و Enter بزنید..." 
                                value={generalScanInput} 
                                onChange={e => setGeneralScanInput(e.target.value)} 
                            />
                            <Search className="absolute right-3 top-3.5 text-indigo-400" size={16}/>
                        </div>
                        {scanMessage && (
                            <p className="text-[10px] font-black text-emerald-600 animate-pulse mt-1">{scanMessage}</p>
                        )}
                    </form>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">انتخاب سنتی قطعه جهت کاردکس</label>
                        <select 
                            className="w-full border-2 border-gray-100 rounded-2xl p-3 text-xs font-black bg-white focus:border-indigo-400 outline-none text-gray-800"
                            value={selectedPart?.id || ''} 
                            onChange={e => { 
                                const p = parts.find((x: any) => x.id === e.target.value); 
                                setSelectedPart(p); 
                                if(p) loadKardex(p.id);
                            }}
                        >
                            <option value="">-- برای نمایش گردش موجودی کالا را انتخاب کنید --</option>
                            {parts.map((p: any) => <option key={p.id} value={p.id}>{p.name} (موجودی: {p.currentStock} {p.unit})</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* IF STOCKTAKING MODULE IS ACTIVE */}
            {isStocktaking && (
                <div className="glass-panel p-6 rounded-3xl border-2 border-amber-200 shadow-xl bg-gradient-to-r from-amber-50/20 to-white animate-fade-in space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-amber-100 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shadow-inner">
                                <CheckCircle size={22} />
                            </div>
                            <div>
                                <h3 className="font-black text-gray-800 text-base">بخش مدیریت و مغایرت‌گیری انبارگردانی اصولی</h3>
                                <p className="text-[10px] text-gray-500 font-bold">موجود به صورت لحظه‌ای با امکان ثبت شمارش با بارکدخوان</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3 w-full md:w-auto">
                            <form onSubmit={handleStocktakeBarcodeSubmit} className="relative w-full md:w-64">
                                <input 
                                    className="w-full border-2 border-amber-300 rounded-xl py-2 px-3 pr-8 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-200" 
                                    placeholder="برای شمارش بارکد اسکن کنید..."
                                    value={scanBuffer}
                                    onChange={e => setScanBuffer(e.target.value)}
                                    autoFocus
                                />
                                <Container className="absolute right-2 top-2.5 text-amber-500" size={14} />
                            </form>
                            <button 
                                onClick={handleSaveStocktaking} 
                                className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-amber-100 transition"
                            >
                                ثبت نهایی و اصلاح مغایرت‌ها
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 block mb-1">عنوان دوره انبارگردانی:</label>
                            <input className="w-full border rounded-xl p-2.5 text-xs font-bold" value={stocktakeDesc} onChange={e => setStocktakeDesc(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 block mb-1">تاریخ انبارگردانی:</label>
                            <input className="w-full border rounded-xl p-2.5 text-xs font-bold text-center" value={stocktakeDate} onChange={e => setStocktakeDate(e.target.value)} />
                        </div>
                        <div className="flex items-end pb-1.5">
                            <label className="flex items-center gap-2.5 text-xs font-black text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5 cursor-pointer w-full select-none justify-center">
                                <input type="checkbox" checked={filterDiscrepancy} onChange={e => setFilterDiscrepancy(e.target.checked)} className="w-4 h-4 rounded text-amber-600" />
                                فقط نمایش اقلام دارای مغایرت انبارداری
                            </label>
                        </div>
                    </div>

                    <div className="border rounded-2xl overflow-hidden bg-white max-h-[450px] overflow-y-auto">
                        <table className="w-full text-right">
                            <thead>
                                <tr className="bg-amber-50/50 border-b border-amber-100 text-gray-700">
                                    <th className="p-3 text-xs font-black">ردیف</th>
                                    <th className="p-3 text-xs font-black">نام کالا / قطعه</th>
                                    <th className="p-3 text-xs font-black">گروه کالا</th>
                                    <th className="p-3 text-xs font-black text-center">موجودی سیستمی (دفتر)</th>
                                    <th className="p-3 text-xs font-black text-center">تعداد شمارش شده (انبار)</th>
                                    <th className="p-3 text-xs font-black text-center">مغایرت</th>
                                    <th className="p-3 text-xs font-black text-center">عملیات دستی</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y text-xs font-bold text-gray-800">
                                {displayedStocktakeItems.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">موردی یافت نشد.</td></tr>
                                ) : (
                                    displayedStocktakeItems.map((it, idx) => {
                                        const diff = it.countedQty - it.systemQty;
                                        return (
                                            <tr key={it.partId} className={`hover:bg-amber-50/20 ${diff !== 0 ? 'bg-red-50/30' : ''}`}>
                                                <td className="p-3 text-gray-400 font-mono">{idx + 1}</td>
                                                <td className="p-3 font-black">{it.name}</td>
                                                <td className="p-3 text-gray-500">{it.category}</td>
                                                <td className="p-3 text-center font-mono text-gray-600">{it.systemQty} {it.unit}</td>
                                                <td className="p-3 text-center">
                                                    <input 
                                                        type="number" 
                                                        className="w-20 text-center font-mono font-black border-2 border-gray-200 rounded-lg p-1 focus:border-amber-500 outline-none text-indigo-700" 
                                                        value={it.countedQty} 
                                                        onChange={e => {
                                                            const newItems = [...stocktakeItems];
                                                            const targetIdx = newItems.findIndex(x => x.partId === it.partId);
                                                            newItems[targetIdx].countedQty = Number(e.target.value) || 0;
                                                            setStocktakeItems(newItems);
                                                        }}
                                                    />
                                                </td>
                                                <td className="p-3 text-center">
                                                    {diff === 0 ? (
                                                        <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-black text-[10px]">بدون مغایرت</span>
                                                    ) : (
                                                        <span className={`px-2 py-1 rounded font-black text-[10px] ${diff > 0 ? 'text-green-700 bg-green-50' : 'text-rose-700 bg-rose-50'}`}>
                                                            {diff > 0 ? `+${diff}` : diff}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button 
                                                        onClick={() => {
                                                            const newItems = [...stocktakeItems];
                                                            const targetIdx = newItems.findIndex(x => x.partId === it.partId);
                                                            newItems[targetIdx].countedQty += 1;
                                                            setStocktakeItems(newItems);
                                                        }}
                                                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded p-1 text-[10px] px-2.5 transition"
                                                    >
                                                        شمارش +۱
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MAIN KARDEX TRANSACTIONS REPORT */}
            {selectedPart ? (
                <div id="part-kardex-report-area" className="animate-fade-in space-y-4 bg-white p-4 rounded-3xl border border-gray-100">
                    {/* Part Details & Visual Barcode Header */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <span className="text-[10px] font-black tracking-widest text-indigo-200 bg-indigo-800/50 px-3 py-1 rounded-full uppercase">اطلاعات کاتالوگ قطعه</span>
                                <h3 className="text-2xl font-black mt-3">{selectedPart.name}</h3>
                                <p className="text-xs text-indigo-100 font-bold mt-1.5 flex gap-4">
                                    <span>دسته: {selectedPart.category}</span>
                                    {selectedPart.subCategory && <span>زیرگروه: {selectedPart.subCategory}</span>}
                                    <span>مشخصات: {selectedPart.dimensions || 'فاقد ابعاد ثبت شده'}</span>
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button 
                                    onClick={exportKardexToExcel}
                                    className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl px-4 py-2.5 text-xs font-black transition flex items-center gap-1.5"
                                >
                                    <FileSpreadsheet size={16}/> خروجی اکسل کاردکس
                                </button>
                                <button 
                                    onClick={handleShareKardexToChat}
                                    disabled={isSharingKardex}
                                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 border border-emerald-500 text-white rounded-xl px-4 py-2.5 text-xs font-black transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    title="ارسال گردش کاردکس کالا به گفتگو"
                                >
                                    {isSharingKardex ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16}/>}
                                    ارسال به گفتگو
                                </button>
                            </div>
                        </div>

                        {/* Barcode Display */}
                        <div className="bg-white p-4 rounded-3xl border shadow-sm flex flex-col items-center justify-center">
                            <span className="text-[9px] font-black text-gray-400 mb-1.5">بارکد سازمانی کالا (جهت انبارگردانی و خروج)</span>
                            <BarcodeVisual value={selectedPart.id} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass-panel p-4 rounded-2xl bg-white border border-gray-100 flex flex-col items-center justify-center text-center">
                            <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest">موجودی فعلی (سیستم)</span>
                            <span className="text-2xl font-black text-indigo-600">{selectedPart.currentStock}</span>
                            <span className="text-[10px] font-bold text-indigo-400">{selectedPart.unit}</span>
                        </div>
                        <div className="glass-panel p-4 rounded-2xl bg-white border border-gray-100 flex flex-col items-center justify-center text-center">
                            <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest">کل ورودی به انبار</span>
                            <span className="text-2xl font-black text-green-600">
                                {kardexEntries.filter((k: any) => k.type === 'IN').reduce((a: any, b: any) => a + b.quantity, 0)}
                            </span>
                        </div>
                        <div className="glass-panel p-4 rounded-2xl bg-white border border-gray-100 flex flex-col items-center justify-center text-center">
                            <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest">کل خروجی از انبار</span>
                            <span className="text-2xl font-black text-red-500">
                                {kardexEntries.filter((k: any) => k.type === 'OUT').reduce((a: any, b: any) => a + b.quantity, 0)}
                            </span>
                        </div>
                        <div className="glass-panel p-4 rounded-2xl bg-white border border-gray-100 flex flex-col items-center justify-center text-center">
                            <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest">آستانه سفارش دهی</span>
                            <span className="text-2xl font-black text-amber-600">{selectedPart.minStock || 0}</span>
                            <span className="text-[9px] font-black text-red-500">
                                {(selectedPart.currentStock || 0) <= (selectedPart.minStock || 0) ? '⚠️ نیاز به خرید فوری' : 'کافی'}
                            </span>
                        </div>
                    </div>

                    {/* Ledgers table */}
                    <div className="glass-panel rounded-3xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="py-4 px-6 text-xs font-black text-gray-500 text-right">تاریخ</th>
                                        <th className="py-4 px-6 text-xs font-black text-gray-500 text-right">شماره سند / مرجع</th>
                                        <th className="py-4 px-6 text-xs font-black text-gray-500 text-center">نوع تراکنش</th>
                                        <th className="py-4 px-6 text-xs font-black text-gray-500 text-center">مقدار</th>
                                        <th className="py-4 px-6 text-xs font-black text-gray-500 text-center">فی/قیمت واحد (ریال)</th>
                                        <th className="py-4 px-6 text-xs font-black text-gray-500 text-center">مانده انبار</th>
                                        <th className="py-4 px-6 text-xs font-black text-gray-500 text-right">توضیحات تراکنش</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {kardexEntries.length === 0 ? (
                                        <tr><td colSpan={7} className="py-20 text-center text-gray-400 italic font-bold">تراکنشی یافت نشد.</td></tr>
                                    ) : (
                                        kardexEntries.map((k: any) => (
                                            <tr key={k.id} className="border-b border-gray-50 hover:bg-indigo-50/20 transition-colors">
                                                <td className="py-4 px-6 text-xs font-bold text-gray-600">{formatDate(k.date)}</td>
                                                <td className="py-4 px-6 text-xs font-mono font-bold text-gray-400">#{k.referenceNumber}</td>
                                                <td className="py-4 px-6 text-center">
                                                    <span className={`text-[9px] px-3 py-1 rounded-full font-black ${k.type === 'IN' ? 'bg-green-100 text-green-700 font-black' : 'bg-red-100 text-red-700 font-black'}`}>
                                                        {k.type === 'IN' ? 'ورود' : 'خروج'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6 text-center text-sm font-black">{k.quantity}</td>
                                                <td className="py-4 px-6 text-center text-sm font-black text-blue-600">{k.unitPrice ? Number(k.unitPrice).toLocaleString() : '-'}</td>
                                                <td className="py-4 px-6 text-center text-sm font-black text-indigo-700">{k.balance}</td>
                                                <td className="py-4 px-6 text-xs text-gray-500">{k.description}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="py-32 flex flex-col items-center justify-center text-gray-300 bg-white border border-gray-100 rounded-3xl">
                    <History size={64} className="mb-4 opacity-25 text-indigo-400 animate-pulse" />
                    <p className="font-bold text-gray-500 text-sm">لطفاً برای مشاهده گردش موجودی، یک قطعه انتخاب کنید یا بارکد آن را اسکن کنید.</p>
                </div>
            )}

            {/* MANUAL TRANSACTION DIALOG */}
            {showManualModal && (
                <div className="fixed inset-0 z-[100000008] flex items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl animate-scale-in text-right">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="font-black text-lg text-gray-800 flex items-center gap-2">
                                {manualType === 'IN' ? <ArrowDownCircle className="text-green-600"/> : <ArrowUpCircle className="text-rose-600"/>}
                                {manualType === 'IN' ? 'ثبت ورود دستی قطعه به انبار' : 'ثبت خروج دستی قطعه از انبار'}
                            </h3>
                            <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-600"><XCircle size={22}/></button>
                        </div>
                        <form onSubmit={handleManualTransactionSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-gray-700 block mb-1">قطعه هدف:</label>
                                <select 
                                    className="w-full border rounded-xl p-3 text-xs font-bold" 
                                    value={manualPartId} 
                                    onChange={e => setManualPartId(e.target.value)}
                                    required
                                >
                                    <option value="">-- انتخاب کالا --</option>
                                    {parts.map((p: any) => <option key={p.id} value={p.id}>{p.name} (موجودی: {p.currentStock})</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-black text-gray-700 block mb-1">تعداد/مقدار:</label>
                                    <input type="number" min="1" className="w-full border rounded-xl p-3 text-xs font-black text-center" value={manualQty} onChange={e => setManualQty(Number(e.target.value))} required />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-gray-700 block mb-1">قیمت واحد (ریال):</label>
                                    <input type="number" min="0" className="w-full border rounded-xl p-3 text-xs font-black text-center" value={manualPrice} onChange={e => setManualPrice(Number(e.target.value))} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-black text-gray-700 block mb-1">شماره سند/مرجع:</label>
                                    <input className="w-full border rounded-xl p-3 text-xs font-bold text-center" value={manualRef} onChange={e => setManualRef(e.target.value)} placeholder="مثلاً: RI-1402-12" />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-gray-700 block mb-1">تاریخ تراکنش:</label>
                                    <input className="w-full border rounded-xl p-3 text-xs font-bold text-center" value={manualDate} onChange={e => setManualDate(e.target.value)} required />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-black text-gray-700 block mb-1">توضیحات تراکنش:</label>
                                <textarea className="w-full border rounded-xl p-2.5 text-xs h-20" value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="دلیل خروج یا ورود کالا، نام تحویل گیرنده یا حواله مصرف..." required />
                            </div>
                            <button 
                                type="submit" 
                                disabled={actionLoading} 
                                className={`w-full text-white font-black text-xs py-3.5 rounded-2xl shadow-lg transition ${manualType === 'IN' ? 'bg-green-600 hover:bg-green-700 shadow-green-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'}`}
                            >
                                {actionLoading ? <Loader2 className="animate-spin mx-auto"/> : 'ثبت قطعی تراکنش'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const AdminEditRequestModal = ({ request, onClose, onSuccess, parts }: any) => {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<any[]>(request.items && request.items.length > 0 ? request.items : [{
        id: '1',
        itemName: request.itemName || '',
        quantity: request.quantity || 1,
        unit: request.unit || 'عدد',
        specifications: request.specifications || ''
    }]);
    const [status, setStatus] = useState(request.status);

    const handleItemChange = (itemId: string, field: string, val: any) => {
        setItems(prev => prev.map(it => it.id === itemId ? { ...it, [field]: val } : it));
    };

    const handleAddItem = () => {
        setItems(prev => [...prev, {
            id: Date.now().toString(),
            itemName: '',
            quantity: 1,
            unit: 'عدد',
            specifications: ''
        }]);
    };

    const handleDeleteItem = (itemId: string) => {
        if (items.length <= 1) {
            alert('درخواست خرید باید حداقل دارای یک قلم کالا باشد.');
            return;
        }
        setItems(prev => prev.filter(it => it.id !== itemId));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const primaryItem = items[0] || {};
            const updated = { 
                ...request, 
                items,
                itemName: items.length === 1 ? primaryItem.itemName : `${primaryItem.itemName} (+${items.length - 1} قلم دیگر)`,
                quantity: primaryItem.quantity,
                unit: primaryItem.unit,
                specifications: primaryItem.specifications,
                status,
                updatedAt: Date.now() 
            };
            await updatePurchaseRequest(updated);
            onSuccess();
            onClose();
        } catch (e) {
            alert('خطا در بروزرسانی');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000010] flex items-start justify-center p-4 bg-black/90 backdrop-blur-2xl transition-all pt-10 md:pt-16 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-3xl p-6 md:p-10 animate-scale-in shadow-2xl border-4 border-indigo-600/30 relative mb-10 text-right" dir="rtl">
                <div className="absolute -top-3 -right-3">
                    <button onClick={onClose} className="w-12 h-12 bg-red-600 text-white rounded-2xl shadow-xl flex items-center justify-center hover:rotate-90 transition-all hover:bg-red-700 cursor-pointer">
                        <X size={28} strokeWidth={3} />
                    </button>
                </div>
                
                <div className="flex items-center gap-4 mb-8 border-b border-slate-100 dark:border-slate-800 pb-6">
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-2xl italic font-black text-xl shadow-inner">
                        ADM
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">ویرایش خط‌به‌خط اقلام و وضعیت درخواست</h2>
                        <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">شماره: {request.requestNumber}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Package size={16} className="text-indigo-600" />
                                <span>اقلام کالای درخواست خرید (ویرایش مجزای هر سطر)</span>
                            </label>
                            <button
                                type="button"
                                onClick={handleAddItem}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                            >
                                <Plus size={14} />
                                <span>افزودن قلم جدید</span>
                            </button>
                        </div>

                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                            {items.map((it, idx) => (
                                <div key={it.id || idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3 relative group">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-0.5 rounded-lg">
                                            قلم #{idx + 1}
                                        </span>
                                        {items.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteItem(it.id)}
                                                className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                                title="حذف این قلم"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                        <div className="md:col-span-6">
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">نام و مشخصات کالا *</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                                                value={it.itemName}
                                                onChange={e => handleItemChange(it.id, 'itemName', e.target.value)}
                                                placeholder="مثال: بلبرینگ 6204"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">تعداد *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                required
                                                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black text-center bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 outline-none focus:border-indigo-500"
                                                value={it.quantity}
                                                onChange={e => handleItemChange(it.id, 'quantity', Number(e.target.value))}
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">واحد</label>
                                            <input
                                                type="text"
                                                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-center bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                                                value={it.unit || 'عدد'}
                                                onChange={e => handleItemChange(it.id, 'unit', e.target.value)}
                                                placeholder="عدد / کیلو / متر"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">مشخصات فنی و توضیحات این قلم</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                                            value={it.specifications || ''}
                                            onChange={e => handleItemChange(it.id, 'specifications', e.target.value)}
                                            placeholder="توضیحات تکمیلی یا ابعاد..."
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-2">
                            تعیین مرحله و وضعیت جاری گردش کار
                        </label>
                        <select
                            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            value={status}
                            onChange={e => setStatus(e.target.value as PurchaseRequestStatus)}
                        >
                            {Object.values(PurchaseRequestStatus).map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <ShieldCheck size={20} />}
                        <span>ذخیره تغییرات خط‌به‌خط اقلام و وضعیت</span>
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default PurchaseModule;
