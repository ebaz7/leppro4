import React, { useState, useEffect, useMemo } from 'react';
import { ExitPermit, ExitPermitStatus, User, UserRole, SystemSettings } from '../types';
import { getExitPermits, updateExitPermitStatus, deleteExitPermit, editExitPermit, getPreviousExitPermitStatusForReject } from '../services/storageService';
import { exitPermitQueueService } from '../services/exitPermitQueueService';
import { getUsers, getRolePermissions } from '../services/authService';
import { apiCall, LS_KEYS, getLocalData } from '../services/apiService';
import { formatDate, formatIranianPlate } from '../constants';
import { 
    Eye, Trash2, Search, CheckCircle, Truck, XCircle, Edit, Loader2, 
    Package, Archive, RefreshCw, UserCheck, ShieldCheck, Warehouse, 
    User as UserIcon, Building2, Bell, AlertTriangle, MoreVertical, Edit3, FileText, Paperclip, Undo2, MessageSquare
} from 'lucide-react';
import PrintExitPermit from './PrintExitPermit';
import WarehouseFinalizeModal from './WarehouseFinalizeModal'; 
import SecurityFinalizeModal from './SecurityFinalizeModal';
import EditExitPermitModal from './EditExitPermitModal';
import useIsMobile from '../hooks/useIsMobile';

import { isInFinancialYear } from '../utils/dateUtils';
import { syncDriversFromRecords } from '../services/driverMemoryService';
import { backgroundAutoDetectAndAttachRemittance } from '../services/sayanExitService';

const ManageExitPermits: React.FC<{ currentUser: User, settings?: SystemSettings, statusFilter?: any, financialYear?: string, mode?: 'INVOICE' | 'EXIT' }> = ({ currentUser, settings, statusFilter, financialYear, mode = 'EXIT' }) => {
    const isMobile = useIsMobile();
    const [permits, setPermits] = useState<ExitPermit[]>(() => {
        try {
            const cached = getLocalData<ExitPermit[]>(LS_KEYS.EXIT_PERMITS, []);
            let safeData = Array.isArray(cached) ? cached : [];
            if (financialYear && financialYear !== 'all') {
                safeData = safeData.filter(p => isInFinancialYear(p.date, financialYear));
            }
            return safeData.sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)) || ((b.permitNumber || 0) - (a.permitNumber || 0)));
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState<boolean>(() => {
        try {
            const cached = getLocalData<ExitPermit[]>(LS_KEYS.EXIT_PERMITS, []);
            return !cached || cached.length === 0;
        } catch {
            return true;
        }
    });
    const [activeTab, setActiveTab] = useState<'CARTABLE' | 'PROFORMA_ARCHIVE' | 'EXIT_ARCHIVE'>('CARTABLE');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewPermit, setViewPermit] = useState<ExitPermit | null>(null);
    const [viewMode, setViewMode] = useState<'PROFORMA' | 'EXIT' | 'CUSTOMER_INVOICE'>('PROFORMA');
    const [editPermit, setEditPermit] = useState<ExitPermit | null>(null);
    const [warehouseFinalize, setWarehouseFinalize] = useState<ExitPermit | null>(null);
    const [securityFinalize, setSecurityFinalize] = useState<ExitPermit | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState<number>(40);
    const [bgSyncBanner, setBgSyncBanner] = useState<{ permitNumber: string | number; message: string } | null>(null);

    useEffect(() => {
        setVisibleCount(40);
    }, [activeTab, searchTerm]);

    useEffect(() => { 
        loadData(); 

        const handleOptimisticApply = (e: any) => {
            const { permitId, targetStatus, extra, updates, permit } = e.detail || {};
            const extraData = updates || extra || {};
            if (permitId) {
                setPermits(prev => prev.map(p => p.id === permitId ? { ...p, ...(permit || {}), ...(targetStatus ? { status: targetStatus } : {}), ...extraData } : p));
                setViewPermit(prev => prev && prev.id === permitId ? { ...prev, ...(permit || {}), ...(targetStatus ? { status: targetStatus } : {}), ...extraData } : prev);
            }
        };

        const handleBackgroundSynced = (e: any) => {
            const syncedPermit: ExitPermit | undefined = e.detail?.permit;
            if (syncedPermit && syncedPermit.id) {
                setPermits(prev => {
                    if (prev.length === 0) return [syncedPermit];
                    const exists = prev.some(p => p.id === syncedPermit.id);
                    if (exists) {
                        return prev.map(p => p.id === syncedPermit.id ? { ...p, ...syncedPermit } : p);
                    }
                    return [syncedPermit, ...prev];
                });
                setViewPermit(prev => prev && prev.id === syncedPermit.id ? { ...prev, ...syncedPermit } : prev);
                if (syncedPermit.driverName || syncedPermit.plateNumber) {
                    syncDriversFromRecords([syncedPermit]);
                }
                return;
            }
            if (e.detail?.allPermits && Array.isArray(e.detail.allPermits)) {
                let safeData = e.detail.allPermits;
                if (financialYear && financialYear !== 'all') {
                    safeData = safeData.filter((p: ExitPermit) => isInFinancialYear(p.date, financialYear));
                }
                setPermits(safeData.sort((a: ExitPermit, b: ExitPermit) => ((b.createdAt || 0) - (a.createdAt || 0)) || ((b.permitNumber || 0) - (a.permitNumber || 0))));
                syncDriversFromRecords(safeData);
                return;
            }
            // Silently refresh without showing loading spinners
            getExitPermits().then(data => {
                let safeData = Array.isArray(data) ? data : [];
                if (financialYear && financialYear !== 'all') {
                    safeData = safeData.filter(p => isInFinancialYear(p.date, financialYear));
                }
                setPermits(safeData.sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)) || ((b.permitNumber || 0) - (a.permitNumber || 0)) ));
                syncDriversFromRecords(safeData);
            }).catch(() => {});
        };

        window.addEventListener('EXIT_PERMIT_OPTIMISTIC_APPLY', handleOptimisticApply);
        window.addEventListener('EXIT_PERMIT_BACKGROUND_SYNCED', handleBackgroundSynced);

        return () => {
            window.removeEventListener('EXIT_PERMIT_OPTIMISTIC_APPLY', handleOptimisticApply);
            window.removeEventListener('EXIT_PERMIT_BACKGROUND_SYNCED', handleBackgroundSynced);
        };
    }, [financialYear]);
    
    useEffect(() => {
        if (statusFilter) {
            if (statusFilter === 'PROFORMA') setActiveTab('PROFORMA_ARCHIVE');
        }
    }, [statusFilter]);

    // Listen for custom navigation / open events from Global Search or cross-module links
    useEffect(() => {
        const handleOpenExitPermit = (e: any) => {
            const detail = e.detail;
            if (!detail) return;
            const targetId = detail.permitId || detail.id || detail.permitNumber;
            const targetSearch = detail.searchTerm;
            if (targetSearch) {
                setSearchTerm(targetSearch);
            }
            if (targetId) {
                const found = permits.find(p => 
                    p.id === targetId || 
                    p.permitNumber === targetId || 
                    String(p.permitNumber) === String(targetId) ||
                    p.sayanRemittanceNumber === targetId ||
                    p.sayanArchiveCode === targetId
                );
                if (found) {
                    setViewPermit(found);
                }
            }
        };
        window.addEventListener('OPEN_EXIT_PERMIT' as any, handleOpenExitPermit);
        window.addEventListener('NAVIGATE_EXIT_PERMIT' as any, handleOpenExitPermit);
        return () => {
            window.removeEventListener('OPEN_EXIT_PERMIT' as any, handleOpenExitPermit);
            window.removeEventListener('NAVIGATE_EXIT_PERMIT' as any, handleOpenExitPermit);
        };
    }, [permits]);

    useEffect(() => {
        if (viewPermit || editPermit || warehouseFinalize || securityFinalize) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            const mainScroll = document.getElementById('main-scroll-container');
            if (mainScroll) {
                mainScroll.scrollTo({ top: 0, behavior: 'instant' });
            }

            const handleBack = () => {
                if (viewPermit) setViewPermit(null);
                if (editPermit) setEditPermit(null);
                if (warehouseFinalize) setWarehouseFinalize(null);
                if (securityFinalize) setSecurityFinalize(null);
            };
            window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: handleBack }));
        } else {
            window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION'));
        }
        return () => { window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION')); };
    }, [viewPermit, editPermit, warehouseFinalize, securityFinalize]);

    const loadData = async (forceShowSpinner = false) => {
        if (forceShowSpinner) {
            setLoading(true);
        }
        try {
            const data = await getExitPermits();
            let safeData = Array.isArray(data) ? data : [];
            if (financialYear && financialYear !== 'all') {
                safeData = safeData.filter(p => isInFinancialYear(p.date, financialYear));
            }
            setPermits(safeData.sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)) || ((b.permitNumber || 0) - (a.permitNumber || 0)) ));
            syncDriversFromRecords(safeData);
        } catch (e) {
            console.error("Failed to load permits", e);
        } finally {
            setLoading(false);
        }
    };

    // ... (isMyTurn, getActionLabel, filtering logic remains same)
    const isMyTurn = (p: ExitPermit) => {
        if (p.status === ExitPermitStatus.REJECTED || p.status === ExitPermitStatus.EXITED || p.status === ExitPermitStatus.CANCELED) return false;
        switch (currentUser.role) {
            case UserRole.CEO: return p.status === ExitPermitStatus.PENDING_CEO;
            case UserRole.FACTORY_MANAGER: return p.status === ExitPermitStatus.PENDING_FACTORY || p.status === ExitPermitStatus.PENDING_FACTORY_FINAL;
            case UserRole.WAREHOUSE_KEEPER: return p.status === ExitPermitStatus.PENDING_WAREHOUSE;
            case UserRole.SECURITY_HEAD:
            case UserRole.SECURITY_GUARD: return p.status === ExitPermitStatus.PENDING_SECURITY;
            case UserRole.ADMIN: return true; 
            default: return false;
        }
    };

    const getActionLabel = (status: ExitPermitStatus) => {
        switch(status) {
            case ExitPermitStatus.PENDING_CEO: return 'تایید مدیرعامل';
            case ExitPermitStatus.PENDING_FACTORY: return 'تایید اولیه مدیر کارخانه (مرحله ۱)';
            case ExitPermitStatus.PENDING_WAREHOUSE: return 'توزین و تحویل انبار';
            case ExitPermitStatus.PENDING_SECURITY: return 'ثبت مشخصات راننده';
            case ExitPermitStatus.PENDING_FACTORY_FINAL: return 'تایید نهایی خروج کارخانه (مرحله ۲)';
            default: return '';
        }
    };

    const getMyCartableFiltered = () => {
        return permits.filter(p => {
            if (!isMyTurn(p)) return false;
            if (mode === 'INVOICE') return p.status === ExitPermitStatus.PENDING_CEO;
            return p.status !== ExitPermitStatus.PENDING_CEO;
        });
    };

    const myCartablePermits = getMyCartableFiltered();
    
    // Proformas: active invoices pending completion
    const proformaArchivePermits = permits.filter(p => p.status !== ExitPermitStatus.EXITED && p.status !== ExitPermitStatus.REJECTED && p.status !== ExitPermitStatus.CANCELED);
    
    // Invoices Archive: all permits shown as invoices (maybe all non-rejected ones)
    const invoiceArchivePermits = permits.filter(p => p.status !== ExitPermitStatus.REJECTED && p.status !== ExitPermitStatus.CANCELED);

    // Exited Archive: only completed factory exits
    const exitArchivePermits = permits.filter(p => p.status === ExitPermitStatus.EXITED || p.status === ExitPermitStatus.CANCELED);

    const canSeeProforma = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.CEO || currentUser?.role === UserRole.SALES_MANAGER;

    const getDisplayPermits = () => {
        let source: ExitPermit[] = [];
        if (activeTab === 'CARTABLE') source = myCartablePermits;
        else if (mode === 'INVOICE') source = invoiceArchivePermits; // For mode INVOICE, anything in archive is invoice Archive
        else if (activeTab === 'PROFORMA_ARCHIVE') source = proformaArchivePermits;
        else source = exitArchivePermits;

        const term = (searchTerm || '').trim().toLowerCase();
        if (!term) return source;

        return source.filter(p => 
            (p.permitNumber?.toString() || '').toLowerCase().includes(term) || 
            (p.recipientName || '').toLowerCase().includes(term) || 
            (p.goodsName || '').toLowerCase().includes(term) ||
            (p.driverName || '').toLowerCase().includes(term)
        );
    };

    const displayPermits = getDisplayPermits();

    const getStepStatus = (p: ExitPermit, step: 'CEO' | 'FACTORY' | 'WAREHOUSE' | 'SECURITY') => {
        if (p.status === ExitPermitStatus.EXITED) return 'done';
        if (p.status === ExitPermitStatus.REJECTED || p.status === ExitPermitStatus.CANCELED) return 'rejected';

        const statusOrder = [
            ExitPermitStatus.PENDING_CEO,
            ExitPermitStatus.PENDING_FACTORY,
            ExitPermitStatus.PENDING_WAREHOUSE,
            ExitPermitStatus.PENDING_SECURITY
        ];
        
        const currentIdx = statusOrder.indexOf(p.status);
        let stepIdx = -1;
        
        if (step === 'CEO') stepIdx = 0;
        else if (step === 'FACTORY') stepIdx = 1;
        else if (step === 'WAREHOUSE') stepIdx = 2;
        else if (step === 'SECURITY') stepIdx = 3;

        if (currentIdx === -1) return 'pending'; 

        if (currentIdx > stepIdx) return 'done';
        if (currentIdx === stepIdx) return 'current';
        return 'pending';
    };

    const handleManualNotify = async (p: ExitPermit) => {
        if (!confirm('آیا مطمئن هستید که می‌خواهید مجدداً به ربات‌ها (تلگرام و بله) ارسال کنید؟')) return;
        setProcessingId(p.id);
        try {
            await apiCall(`/exit-permits/${p.id}/bot-notify`, 'POST', {});
            alert('درخواست ارسال به ربات‌ها با موفقیت انجام شد.');
        } catch (e) {
            console.error('Manual Notify Error:', e);
            alert('خطا در ارسال به ربات‌ها');
        } finally {
            setProcessingId(null);
        }
    };

    const handleNotifyCustomer = async (p: ExitPermit) => {
        if (!confirm(`آیا مایلید مشخصات بارگیری و خروج (وزن، پلاک، مشخصات راننده و فاکتور) فقط به واتساپ و بات‌های مشتری («${p.recipientName}») ارسال شود؟`)) return;
        setProcessingId(p.id);
        try {
            const res = await apiCall<{ success: boolean; adminNotified?: boolean; result?: any; error?: string }>(`/exit-permits/${p.id}/notify-customer`, 'POST', {});
            if (res && res.success) {
                alert(`✅ پیام خروج بار با موفقیت به واتساپ و ربات‌های مشتری («${p.recipientName}») ارسال گردید.`);
            } else if (res?.adminNotified) {
                alert(`⚠️ ${res.error || `برای خریدار «${p.recipientName}» شماره‌ای ثبت نشده است و پیام هشدار به واتساپ ادمین ارسال شد.`}`);
            } else {
                alert(`⚠️ نتیجه ارسال: ${res?.error || 'شماره تماس برای این خریدار ثبت نشده است. لطفاً در لیست مخاطبین بررسی فرمایید.'}`);
            }
        } catch (e: any) {
            console.error('Customer Notify Error:', e);
            alert(`خطا در ارسال پیام به مشتری: ${e?.message || 'خطای شبکه'}`);
        } finally {
            setProcessingId(null);
        }
    };

    const handleApprove = async (p: ExitPermit) => {
        if ((p.status as ExitPermitStatus) === ExitPermitStatus.PENDING_WAREHOUSE) { 
            setWarehouseFinalize(p); 
            return; 
        }
        
        if (p.status === ExitPermitStatus.PENDING_SECURITY) {
            setSecurityFinalize(p);
            return;
        }

        let nextStatus = ExitPermitStatus.PENDING_FACTORY;
        if (p.status === ExitPermitStatus.PENDING_CEO) nextStatus = ExitPermitStatus.PENDING_FACTORY;
        else if (p.status === ExitPermitStatus.PENDING_FACTORY) nextStatus = ExitPermitStatus.PENDING_WAREHOUSE;
        else if (p.status === ExitPermitStatus.PENDING_FACTORY_FINAL) nextStatus = ExitPermitStatus.EXITED;
        else nextStatus = p.status; // Fallback

        const updatedPermit = { ...p, status: nextStatus, updatedAt: Date.now() };
        let extraUpdateData: any = {};

        if (p.status === ExitPermitStatus.PENDING_CEO) updatedPermit.approverCeo = currentUser.fullName;
        else if (p.status === ExitPermitStatus.PENDING_FACTORY) updatedPermit.approverFactory = currentUser.fullName;
        else if (p.status === ExitPermitStatus.PENDING_FACTORY_FINAL) {
            updatedPermit.approverFactoryFinal = currentUser.fullName;
            updatedPermit.exitTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
            extraUpdateData.exitTime = updatedPermit.exitTime;
        }

        // 1. Instant Optimistic UI Update: the card moves/disappears instantly with 0ms delay
        setPermits(prev => prev.map(item => item.id === p.id ? { ...item, ...updatedPermit } : item));
        if (viewPermit?.id === p.id) {
            setViewPermit(null);
        }

        // 2. Hand off to background queue (non-blocking, persistent, robust)
        exitPermitQueueService.enqueueApproval({
            permitId: p.id,
            permitNumber: p.permitNumber,
            targetStatus: nextStatus,
            prevStatus: p.status,
            approverUser: currentUser,
            extra: extraUpdateData,
            permitSnapshot: updatedPermit,
            settings: settings
        });
    };

    const handleReject = async (p: ExitPermit) => {
        const prevStatus = getPreviousExitPermitStatusForReject(p.status);
        let promptMsg = 'لطفاً دلیل رد حواله خروج کارخانه را وارد کنید:';
        if (p.status === ExitPermitStatus.PENDING_FACTORY_FINAL) {
            promptMsg = 'دلیل رد حواله خروج کارخانه را وارد کنید (حواله به مرحله قبل «انتظامات» بازگردانده می‌شود):';
        } else if (p.status === ExitPermitStatus.PENDING_SECURITY) {
            promptMsg = 'دلیل رد حواله خروج کارخانه را وارد کنید (حواله به مرحله قبل «انبار» بازگردانده می‌شود):';
        } else if (p.status === ExitPermitStatus.PENDING_WAREHOUSE) {
            promptMsg = 'دلیل رد حواله خروج کارخانه را وارد کنید (حواله به مرحله قبل «مدیر کارخانه» بازگردانده می‌شود):';
        } else if (p.status === ExitPermitStatus.PENDING_FACTORY) {
            promptMsg = 'دلیل رد حواله خروج کارخانه را وارد کنید (حواله به مرحله قبل «مدیرعامل» بازگردانده می‌شود):';
        } else if (p.status === ExitPermitStatus.PENDING_CEO) {
            promptMsg = 'دلیل رد حواله خروج کارخانه را وارد کنید (حواله خروج کارخانه کلاً رد می‌شود):';
        }

        const reason = prompt(promptMsg);
        if (!reason || !reason.trim()) return;

        const updatedPermit = {
            ...p,
            status: prevStatus,
            rejectionReason: reason.trim(),
            rejectedBy: currentUser.fullName,
            updatedAt: Date.now()
        };

        // 1. Instant optimistic update
        setPermits(prev => prev.map(item => item.id === p.id ? { ...item, ...updatedPermit } : item));
        if (viewPermit?.id === p.id) {
            setViewPermit(null);
        }

        // 2. Enqueue via persistent queue (resilient to weak connection)
        exitPermitQueueService.enqueueApproval({
            permitId: p.id,
            permitNumber: p.permitNumber,
            targetStatus: prevStatus,
            prevStatus: p.status,
            approverUser: currentUser,
            actionType: 'REJECT',
            extra: {
                rejectionReason: reason.trim(),
                isBackwardReject: true
            },
            permitSnapshot: updatedPermit,
            settings: settings
        });
    };

    const handleCancel = async (p: ExitPermit) => {
        const perms = settings ? getRolePermissions(currentUser.role, settings, currentUser) : {};
        const canCancel = currentUser.role === UserRole.ADMIN || perms.canCancelExitPermit === true;
        if (!canCancel) {
            alert('شما دسترسی لازم برای کنسل کردن برگه خروج را ندارید.');
            return;
        }

        const reason = prompt('لطفاً دلیل لغو و کنسلی این برگه خروج را وارد نمایید:');
        if (!reason || !reason.trim()) return;

        const nextStatus = ExitPermitStatus.CANCELED;
        const updatedPermit = { 
            ...p, 
            status: nextStatus,
            rejectionReason: reason.trim(),
            rejectedBy: currentUser.fullName,
            updatedAt: Date.now()
        };

        // 1. Instant Optimistic Update
        setPermits(prev => prev.map(item => item.id === p.id ? { ...item, ...updatedPermit } : item));
        if (viewPermit?.id === p.id) {
            setViewPermit(null);
        }
        
        // 2. Persistent queue
        exitPermitQueueService.enqueueApproval({
            permitId: p.id,
            permitNumber: p.permitNumber,
            targetStatus: nextStatus,
            prevStatus: p.status,
            approverUser: currentUser,
            actionType: 'CANCEL',
            extra: { rejectionReason: reason.trim() },
            permitSnapshot: updatedPermit,
            settings: settings
        });
    };

    const handleSecuritySubmit = async (data: { driverName: string; driverPhone: string; plateNumber: string; exitTime: string; attachments: {fileName: string, data: string}[] }) => {
        if (!securityFinalize) return;
        const currentPermit = securityFinalize;
        setSecurityFinalize(null);
        
        const nextStatus = ExitPermitStatus.PENDING_FACTORY_FINAL;
        const updatedPermit = { 
            ...currentPermit, 
            status: nextStatus,
            driverName: data.driverName,
            driverPhone: data.driverPhone,
            plateNumber: data.plateNumber,
            attachments: data.attachments,
            approverSecurity: currentUser.fullName,
            updatedAt: Date.now()
        };

        // 1. Optimistic instant state update
        setPermits(prev => prev.map(p => p.id === currentPermit.id ? { ...p, ...updatedPermit } : p));

        // 2. Persistent queue
        exitPermitQueueService.enqueueApproval({
            permitId: currentPermit.id,
            permitNumber: currentPermit.permitNumber,
            targetStatus: nextStatus,
            prevStatus: currentPermit.status,
            approverUser: currentUser,
            actionType: 'EDIT_PERMIT',
            permitSnapshot: updatedPermit,
            settings: settings
        });
    };

    const handleWarehouseSubmit = (finalItems: any[], sayanRemittanceData?: any, attachmentDataUrl?: string, sayanRemittanceDocs?: any[]) => {
        if (!warehouseFinalize) return;
        const currentPermit = warehouseFinalize;
        // 1. Immediately close modal on current frame (0ms delay, zero freeze)
        setWarehouseFinalize(null);
        
        const currentAttachments = [...(currentPermit.attachments || [])];
        if (attachmentDataUrl) {
            const docName = `حواله_فروش_سایان_${sayanRemittanceData?.remittanceNumber || currentPermit.permitNumber}.png`;
            currentAttachments.push({
                fileName: docName,
                data: attachmentDataUrl
            });
        }

        const totalWeight = finalItems.reduce((a, b) => a + (Number(b.weight) || 0), 0);
        const totalCartons = finalItems.reduce((a, b) => a + (Number(b.cartonCount) || 0), 0);

        const updated: ExitPermit = { 
            ...currentPermit, 
            items: finalItems, 
            approverWarehouse: currentUser.fullName, 
            status: ExitPermitStatus.PENDING_SECURITY,
            weight: totalWeight > 0 ? totalWeight : currentPermit.weight,
            cartonCount: totalCartons > 0 ? totalCartons : currentPermit.cartonCount,
            attachments: currentAttachments,
            sayanRemittanceNumber: sayanRemittanceData?.remittanceNumber || currentPermit.sayanRemittanceNumber,
            sayanSubCode: sayanRemittanceData?.subCode || currentPermit.sayanSubCode,
            sayanArchiveCode: sayanRemittanceData?.archiveCode || currentPermit.sayanArchiveCode,
            sayanSyncedAt: sayanRemittanceData ? Date.now() : currentPermit.sayanSyncedAt,
            sayanRemittanceDoc: sayanRemittanceData || currentPermit.sayanRemittanceDoc,
            sayanRemittanceDocs: sayanRemittanceDocs || currentPermit.sayanRemittanceDocs,
            updatedAt: Date.now()
        };
        
        // 2. Optimistic instant state update so the card immediately moves to Security
        setPermits(prev => prev.map(p => p.id === currentPermit.id ? { ...p, ...updated } : p));

        const hasAttachedRemittance = Boolean(sayanRemittanceData?.remittanceNumber || (sayanRemittanceDocs && sayanRemittanceDocs.length > 0));
        setBgSyncBanner({
            permitNumber: currentPermit.permitNumber,
            message: hasAttachedRemittance
                ? `توزین حواله #${currentPermit.permitNumber} با پیوست حواله سایان ثبت شد و به انتظامات ارسال گردید.`
                : `توزین حواله #${currentPermit.permitNumber} ثبت شد و به انتظامات ارسال گردید.`
        });
        setTimeout(() => {
            setBgSyncBanner(prev => prev?.permitNumber === currentPermit.permitNumber ? null : prev);
        }, 4500);

        // 3. Defer background queue & Sayan remittance attachment to next tick so browser paints closed modal first
        setTimeout(() => {
            exitPermitQueueService.enqueueApproval({
                permitId: currentPermit.id,
                permitNumber: currentPermit.permitNumber,
                targetStatus: ExitPermitStatus.PENDING_SECURITY,
                prevStatus: currentPermit.status,
                approverUser: currentUser,
                actionType: 'EDIT_PERMIT',
                permitSnapshot: updated,
                settings: settings
            });

            backgroundAutoDetectAndAttachRemittance({
                permit: updated,
                finalizedItems: finalItems,
                initialRemittance: sayanRemittanceData || null,
                initialRemittances: sayanRemittanceDocs || (sayanRemittanceData ? [sayanRemittanceData] : []),
                initialAttachmentDataUrl: attachmentDataUrl,
                companyName: currentPermit.company || '',
                approverWarehouse: currentUser.fullName,
            });
        }, 20);
    };

    const handleDelete = async (id: string) => {
        if(!confirm('حذف شود؟')) return;
        await deleteExitPermit(id);
        loadData();
    };

    const TimelineStep = ({ status, label, icon: Icon }: any) => {
        let colorClass = 'bg-gray-100 dark:bg-gray-800/40 text-gray-800 dark:text-gray-200 text-gray-400 border-gray-200/50 dark:border-white/10';
        if (status === 'current') colorClass = 'bg-blue-100 text-blue-600 border-blue-500 animate-pulse ring-2 ring-blue-200';
        if (status === 'done') colorClass = 'bg-green-500 text-white border-green-600 shadow-md';
        if (status === 'rejected') colorClass = 'bg-red-500 text-white border-red-600';

        // Simplify for mobile
        if (isMobile) {
            return (
                <div className={`w-2.5 h-2.5 rounded-full ${colorClass.includes('bg-green') ? 'bg-green-500' : colorClass.includes('bg-blue') ? 'bg-blue-500 animate-pulse' : colorClass.includes('bg-red') ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
            );
        }

        return (
            <div className="flex flex-col items-center gap-1 z-10 w-16">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${colorClass}`}>
                    <Icon size={14} />
                </div>
                <span className={`text-[9px] font-bold text-center leading-tight ${status === 'current' ? 'text-blue-700' : 'text-gray-500'}`}>{label}</span>
            </div>
        );
    };

    // Mobile Card Renderer (as helper to avoid component unmount churn on mobile)
    const renderMobilePermitCard = (p: ExitPermit, canAct: boolean) => (
        <div key={p.id} className={`glass-panel rounded-xl border p-4 mb-3 shadow-sm relative overflow-hidden ${canAct ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <span className="text-xs font-mono text-gray-400">#{p.permitNumber}</span>
                    <h3 className="font-bold text-gray-800 text-base">{p.recipientName}</h3>
                </div>
                {p.status === ExitPermitStatus.EXITED ? (
                    <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-lg font-bold">پیش‌فاکتور تکمیل شده</span>
                ) : (
                     <div className="flex gap-1.5 items-center">
                         <TimelineStep status="done" label="" icon={UserIcon} />
                         <TimelineStep status={getStepStatus(p, 'CEO')} label="" icon={UserCheck} />
                         <TimelineStep status={getStepStatus(p, 'FACTORY')} label="" icon={Building2} />
                         <TimelineStep status={getStepStatus(p, 'WAREHOUSE')} label="" icon={Warehouse} />
                         <TimelineStep status={getStepStatus(p, 'SECURITY')} label="" icon={ShieldCheck} />
                     </div>
                )}
            </div>
            
            <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-3">
                <span>📦 {p.goodsName}</span>
                <span>📅 {formatDate(p.date)}</span>
            </div>

            {p.attachments && p.attachments.length > 0 && (
                <div 
                    onClick={() => { setViewMode('EXIT'); setViewPermit(p); }}
                    className="mb-3 flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-emerald-200 w-fit cursor-pointer active:scale-95 transition-all"
                >
                    <Paperclip size={13} className="text-emerald-600" />
                    <span>فایل/تصویر پیوست انتظامات ({p.attachments.length})</span>
                </div>
            )}

            {p.status === ExitPermitStatus.PENDING_FACTORY_FINAL && (
                <div className="mb-3 text-[11px] p-2 rounded-xl font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-blue-600 shrink-0" />
                    <span className="leading-snug">اطلاعات راننده و توزین انبار/انتظامات تکمیل شد. آماده تایید نهایی خروج (مرحله ۲).</span>
                </div>
            )}

            {p.rejectionReason && (
                <div className={`mb-3 text-[11px] p-2 rounded-xl font-bold flex items-center gap-1.5 ${p.status === ExitPermitStatus.REJECTED ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                    <AlertTriangle size={14} className={p.status === ExitPermitStatus.REJECTED ? 'text-red-500 shrink-0' : 'text-amber-600 shrink-0'} />
                    <span className="leading-snug">{p.status === ExitPermitStatus.REJECTED ? `دلیل رد حواله: ${p.rejectionReason}` : `⚠️ بازگشت به این مرحله: ${p.rejectionReason}`}</span>
                </div>
            )}

            <div className="flex gap-2 mt-2">
                {canAct && (
                     <>
                         <button onClick={() => handleApprove(p)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-1 active:scale-95 transition-transform">
                             <CheckCircle size={14}/> {getActionLabel(p.status)}
                         </button>
                         <button onClick={() => handleReject(p)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg border border-red-200 transition-colors" title="رد و بازگشت به مرحله قبل">
                             <Undo2 size={16}/>
                         </button>
                     </>
                )}
                {(currentUser.role === UserRole.ADMIN || (settings ? getRolePermissions(currentUser.role, settings, currentUser).canCancelExitPermit : false)) && 
                 p.status !== ExitPermitStatus.EXITED && p.status !== ExitPermitStatus.REJECTED && p.status !== ExitPermitStatus.CANCELED && (
                     <button onClick={() => handleCancel(p)} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-xs font-bold shadow-sm">
                          کنسل کردن
                     </button>
                )}
                <button onClick={() => { setViewMode(p.status === ExitPermitStatus.EXITED ? 'EXIT' : 'PROFORMA'); setViewPermit(p); }} className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg"><Eye size={16}/></button>
                {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO) && (
                    <button onClick={() => handleDelete(p.id)} className="bg-red-50 text-red-500 px-3 py-2 rounded-lg"><Trash2 size={16}/></button>
                )}
                {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || currentUser.role === UserRole.SALES_MANAGER) && (
                    <>
                        <button onClick={() => handleNotifyCustomer(p)} title="ارسال پیام خروج بار و مشخصات راننده به مشتری (واتساپ و ربات‌ها)" className="bg-emerald-50 text-emerald-600 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors">
                            <MessageSquare size={16}/>
                        </button>
                        <button onClick={() => handleManualNotify(p)} title="ارسال مجدد دستی به ربات" className="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
                            <Bell size={16}/>
                        </button>
                    </>
                )}
            </div>
            
            {processingId === p.id && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center z-20">
                    <Loader2 className="animate-spin text-blue-600" size={24}/>
                </div>
            )}
        </div>
    );

    const renderPermitCard = (p: ExitPermit) => {
        const canAct = isMyTurn(p);
        
        if (isMobile) {
            return renderMobilePermitCard(p, canAct);
        }

        return (
            <div key={p.id} className={`glass-panel rounded-2xl border transition-all relative overflow-hidden ${canAct ? 'border-blue-400 shadow-lg scale-[1.01]' : 'border-gray-200 shadow-sm opacity-90'}`}>
                {canAct && <div className="absolute top-0 right-0 left-0 bg-blue-500 h-1.5 animate-pulse"></div>}
                {(p.status === ExitPermitStatus.REJECTED || p.status === ExitPermitStatus.CANCELED) && <div className="absolute top-0 right-0 left-0 h-1.5 bg-red-500"></div>}
                
                <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3 items-center">
                            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center font-black text-xl text-gray-700 border border-gray-200 shadow-inner">
                                {p.permitNumber}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">{p.recipientName}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-xs text-gray-500">{p.goodsName} | {formatDate(p.date)}</p>
                                    {p.attachments && p.attachments.length > 0 && (
                                        <span 
                                            onClick={() => { setViewMode('EXIT'); setViewPermit(p); }} 
                                            className="bg-emerald-50 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-lg border border-emerald-200 cursor-pointer hover:bg-emerald-100 flex items-center gap-1 transition-all"
                                        >
                                            <Paperclip size={12} className="text-emerald-600" />
                                            <span>پیوست انتظامات ({p.attachments.length})</span>
                                        </span>
                                    )}
                                </div>
                                {p.status === ExitPermitStatus.PENDING_FACTORY_FINAL && (
                                    <div className="mt-2 text-xs p-1.5 px-2.5 rounded-lg font-bold flex items-center gap-1.5 w-fit bg-blue-50 text-blue-800 border border-blue-200">
                                        <ShieldCheck size={13} className="text-blue-600 shrink-0" />
                                        <span>اطلاعات راننده و توزین توسط انبار و انتظامات تکمیل گردیده و اکنون منتظر تایید نهایی خروج است (مرحله ۲).</span>
                                    </div>
                                )}
                                {p.rejectionReason && (
                                    <div className={`mt-2 text-xs p-1.5 px-2.5 rounded-lg font-bold flex items-center gap-1.5 w-fit ${p.status === ExitPermitStatus.REJECTED ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                                        <AlertTriangle size={13} className={p.status === ExitPermitStatus.REJECTED ? 'text-red-500 shrink-0' : 'text-amber-600 shrink-0'} />
                                        <span>{p.status === ExitPermitStatus.REJECTED ? `دلیل رد حواله: ${p.rejectionReason}` : `⚠️ بازگشت به این مرحله: ${p.rejectionReason}`}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                            {canAct && (
                                <>
                                    <button onClick={() => { setViewMode(p.status === ExitPermitStatus.EXITED ? 'EXIT' : 'PROFORMA'); handleApprove(p); }} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-transform active:scale-95">
                                        <CheckCircle size={16}/> {getActionLabel(p.status)}
                                    </button>
                                    <button onClick={() => handleReject(p)} className="bg-red-50 text-red-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-red-100 border border-red-200 flex items-center gap-1.5 transition-transform active:scale-95" title="رد و بازگشت به مرحله قبل">
                                        <Undo2 size={16}/> رد / بازگشت
                                    </button>
                                </>
                            )}
                            {(currentUser.role === UserRole.ADMIN || (settings ? getRolePermissions(currentUser.role, settings, currentUser).canCancelExitPermit : false)) && 
                             p.status !== ExitPermitStatus.EXITED && p.status !== ExitPermitStatus.REJECTED && p.status !== ExitPermitStatus.CANCELED && (
                                 <button onClick={() => handleCancel(p)} className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-700 shadow-lg shadow-red-200 flex items-center gap-2 transition-transform active:scale-95" title="کنسل کردن">
                                     <XCircle size={16}/> لغو/کنسل کردن
                                 </button>
                            )}
                            <button onClick={() => { setViewMode(p.status === ExitPermitStatus.EXITED ? 'EXIT' : 'PROFORMA'); setViewPermit(p); }} className="bg-gray-100 text-gray-700 p-2 rounded-xl hover:bg-gray-200"><Eye size={18}/></button>
                            {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || (currentUser.role === UserRole.SALES_MANAGER && p.status === ExitPermitStatus.PENDING_CEO)) && (
                                <>
                                    <button onClick={() => setEditPermit(p)} className="bg-amber-50 text-amber-600 p-2 rounded-xl hover:bg-amber-100"><Edit size={18}/></button>
                                    <button onClick={() => handleDelete(p.id)} className="bg-red-50 text-red-500 p-2 rounded-xl hover:bg-red-100"><Trash2 size={18}/></button>
                                </>
                            )}
                            {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || currentUser.role === UserRole.SALES_MANAGER) && (
                                <>
                                    <button onClick={() => handleNotifyCustomer(p)} title="ارسال پیام خروج بار، وزن و مشخصات راننده به مشتری (واتساپ و ربات‌ها)" className="bg-emerald-50 text-emerald-600 p-2 rounded-xl hover:bg-emerald-100 transition-colors"><MessageSquare size={18}/></button>
                                    <button onClick={() => handleManualNotify(p)} title="ارسال مجدد به ربات" className="bg-indigo-50 text-indigo-600 p-2 rounded-xl hover:bg-indigo-100 transition-colors"><Bell size={18}/></button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="relative mt-8 px-2 pb-2">
                        <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-100 dark:bg-gray-800 -z-0"></div>
                        <div className="flex justify-between relative z-10">
                            <TimelineStep status="done" label="ثبت" icon={UserIcon} />
                            <TimelineStep status={getStepStatus(p, 'CEO')} label="مدیرعامل" icon={UserCheck} />
                            <TimelineStep status={getStepStatus(p, 'FACTORY')} label="کارخانه" icon={Building2} />
                            <TimelineStep status={getStepStatus(p, 'WAREHOUSE')} label="انبار" icon={Warehouse} />
                            <TimelineStep status={getStepStatus(p, 'SECURITY')} label="انتظامات" icon={ShieldCheck} />
                        </div>
                    </div>
                </div>

                {processingId === p.id && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center z-20">
                        <Loader2 className="animate-spin text-blue-600 mb-2" size={32}/>
                        <span className="text-xs font-bold text-blue-700 animate-pulse">در حال ثبت و ارسال پیام...</span>
                    </div>
                )}
            </div>
        );
    };

    // Statistics for Executive KPI cards
    const stats = useMemo(() => {
        const total = permits.length;
        const myCartable = myCartablePermits.length;
        const exited = permits.filter(p => p.status === ExitPermitStatus.EXITED).length;
        const inProgress = permits.filter(p => p.status !== ExitPermitStatus.EXITED && p.status !== ExitPermitStatus.REJECTED && p.status !== ExitPermitStatus.CANCELED).length;
        return { total, myCartable, exited, inProgress };
    }, [permits, myCartablePermits]);

    return (
        <div className="space-y-5 pb-20 animate-fade-in text-right dir-rtl" dir="rtl">
            {/* Executive Hero Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-teal-500/20">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-600/30 text-teal-300 rounded-2xl border border-teal-400/30">
                        {mode === 'INVOICE' ? <FileText size={26} /> : <Truck size={26} />}
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-black tracking-tight">
                            {mode === 'INVOICE' ? 'مدیریت و کارتابل فاکتورها' : 'مدیریت و کارتابل حواله‌های خروج کارخانه'}
                        </h1>
                        <p className="text-xs text-teal-200/80 mt-0.5 font-medium">
                            {mode === 'INVOICE' 
                                ? 'کنترل و نظارت بر پیش‌فاکتورها، فاکتورهای رسمی و تاییدات مربوطه' 
                                : 'گردش تاییدات فروش، مدیرعامل، مدیر کارخانه، انبارداری، باسکول و ثبت خروج انتظامات'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button 
                        onClick={() => loadData(true)} 
                        className="flex items-center gap-2 text-xs font-bold bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/15 transition-all shadow-sm active:scale-95 cursor-pointer"
                        title="بروزرسانی اطلاعات از سرور"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        <span>بروزرسانی</span>
                    </button>
                </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
                    <div>
                        <span className="text-[11px] font-bold text-gray-500 block">کل حواله‌ها / فاکتورها</span>
                        <span className="text-xl font-black text-gray-800 dark:text-gray-100">{stats.total} فقره</span>
                    </div>
                    <div className="p-3 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-xl">
                        <Truck size={20} />
                    </div>
                </div>

                <div className={`glass-panel p-4 rounded-2xl border transition-all flex items-center justify-between shadow-2xs ${
                    stats.myCartable > 0 
                        ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/30 ring-1 ring-amber-300' 
                        : 'border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80'
                }`}>
                    <div>
                        <span className="text-[11px] font-bold text-gray-500 block">در انتظار اقدام شما</span>
                        <span className={`text-xl font-black ${stats.myCartable > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-200'}`}>
                            {stats.myCartable} مورد
                        </span>
                    </div>
                    <div className="p-3 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 rounded-xl">
                        <Bell size={20} className={stats.myCartable > 0 ? 'animate-bounce text-amber-600' : ''} />
                    </div>
                </div>

                <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
                    <div>
                        <span className="text-[11px] font-bold text-gray-500 block">در جریان فرآیند</span>
                        <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{stats.inProgress} فقره</span>
                    </div>
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                        <RefreshCw size={20} />
                    </div>
                </div>

                <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
                    <div>
                        <span className="text-[11px] font-bold text-gray-500 block">خروج موفق از کارخانه</span>
                        <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{stats.exited} فقره</span>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
                        <CheckCircle size={20} />
                    </div>
                </div>
            </div>

            {/* Header / Tabs */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap md:flex-nowrap p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200/70 dark:border-gray-700 gap-1.5">
                    <button 
                        onClick={() => setActiveTab('CARTABLE')} 
                        className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                            activeTab === 'CARTABLE' 
                                ? 'bg-white dark:bg-gray-900 text-teal-700 dark:text-teal-300 shadow-md' 
                                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        <Bell size={16} className={myCartablePermits.length > 0 ? "animate-pulse text-red-500" : ""}/>
                        <span>{mode === 'INVOICE' ? 'کارتابل فاکتورها' : 'کارتابل حواله خروج'}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 font-mono">
                            {myCartablePermits.length}
                        </span>
                    </button>
                    {mode === 'INVOICE' ? (
                        <button 
                            onClick={() => { setActiveTab('PROFORMA_ARCHIVE'); setViewMode('PROFORMA'); }} 
                            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap ${
                                activeTab === 'PROFORMA_ARCHIVE' 
                                    ? 'bg-white dark:bg-gray-900 text-blue-800 dark:text-blue-300 shadow-md' 
                                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                        >
                            بایگانی فاکتورها
                        </button>
                    ) : (
                        <>
                            {canSeeProforma && (
                                <button 
                                    onClick={() => { setActiveTab('PROFORMA_ARCHIVE'); setViewMode('PROFORMA'); }} 
                                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap ${
                                        activeTab === 'PROFORMA_ARCHIVE' 
                                            ? 'bg-white dark:bg-gray-900 text-blue-800 dark:text-blue-300 shadow-md' 
                                            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                    }`}
                                >
                                    بایگانی موقت حواله خروج
                                </button>
                            )}
                            <button 
                                onClick={() => { setActiveTab('EXIT_ARCHIVE'); setViewMode('EXIT'); }} 
                                className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap ${
                                    activeTab === 'EXIT_ARCHIVE' 
                                        ? 'bg-white dark:bg-gray-900 text-emerald-800 dark:text-emerald-300 shadow-md' 
                                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                    }`}
                            >
                                بایگانی حواله خروج کارخانه
                            </button>
                        </>
                    )}
                </div>

                <div className="relative">
                    <input 
                        className="w-full glass-panel border border-gray-200/80 dark:border-gray-700 rounded-xl p-3 pr-10 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-teal-500/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all" 
                        placeholder="جستجو در لیست بر اساس شماره حواله، نام گیرنده، نام کالا، راننده..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                    />
                    <Search className="absolute right-3 top-3.5 text-gray-400" size={18}/>
                </div>
                {bgSyncBanner && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-fade-in">
                        <div className="flex items-center gap-2">
                            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                            <span>{bgSyncBanner.message}</span>
                        </div>
                        <button onClick={() => setBgSyncBanner(null)} className="text-emerald-600 hover:text-emerald-800 text-[11px] font-black px-2 py-0.5 rounded-lg">بستن</button>
                    </div>
                )}
            </div>

            {/* List */}
            {React.useMemo(() => {
                const slicedPermits = displayPermits.slice(0, visibleCount);
                return (
                    <div className={`${isMobile ? 'space-y-3' : 'space-y-4'} min-h-[300px]`}>
                        {loading && permits.length === 0 ? (
                            <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-2">
                                <Loader2 className="animate-spin text-blue-500"/> در حال بارگذاری...
                            </div>
                        ) : displayPermits.length === 0 ? (
                            <div className="text-center py-20 glass-panel rounded-2xl border border-dashed border-gray-300">
                                <div className="text-gray-400 font-bold">موردی یافت نشد.</div>
                                {activeTab === 'CARTABLE' && <div className="text-xs text-gray-300 mt-2">خوشبختانه کارتابل شما خالی است! 🎉</div>}
                            </div>
                        ) : (
                            <>
                                {slicedPermits.map(p => renderPermitCard(p))}
                                {displayPermits.length > visibleCount && (
                                    <div className="pt-2 pb-4 flex justify-center">
                                        <button
                                            onClick={() => setVisibleCount(prev => prev + 40)}
                                            className="bg-white dark:bg-gray-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
                                        >
                                            نمایش موارد بیشتر ({displayPermits.length - visibleCount} مورد باقی‌مانده)
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            }, [displayPermits, visibleCount, loading, permits.length, activeTab, isMobile, processingId])}

            {/* Modals */}
            {viewPermit && (
                <PrintExitPermit 
                    permit={viewPermit} 
                    onClose={() => setViewPermit(null)} 
                    settings={settings}
                    mode={viewMode}
                    onToggleMode={(newMode) => setViewMode(newMode)}
                    showPrice={currentUser.role === UserRole.CEO || currentUser.role === UserRole.SALES_MANAGER || currentUser.role === UserRole.ADMIN}
                    onApprove={
                        (isMyTurn(viewPermit) || currentUser.role === UserRole.ADMIN) 
                        ? () => handleApprove(viewPermit) 
                        : undefined
                    }
                    onReject={
                        (isMyTurn(viewPermit) || currentUser.role === UserRole.ADMIN) 
                        ? () => handleReject(viewPermit)
                        : undefined
                    }
                    onCancel={
                        (currentUser.role === UserRole.ADMIN || (settings ? getRolePermissions(currentUser.role, settings, currentUser).canCancelExitPermit : false)) &&
                        viewPermit.status !== ExitPermitStatus.EXITED &&
                        viewPermit.status !== ExitPermitStatus.REJECTED &&
                        viewPermit.status !== ExitPermitStatus.CANCELED
                        ? () => { handleCancel(viewPermit); setViewPermit(null); }
                        : undefined
                    }
                    onEdit={
                        (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || (currentUser.role === UserRole.SALES_MANAGER && viewPermit.status === ExitPermitStatus.PENDING_CEO)) 
                        ? () => { setEditPermit(viewPermit); setViewPermit(null); } 
                        : undefined
                    }
                />
            )}

            {editPermit && (
                <EditExitPermitModal 
                    permit={editPermit} 
                    onClose={() => setEditPermit(null)} 
                    onSave={() => { setEditPermit(null); loadData(); }} 
                />
            )}

            {warehouseFinalize && (
                <WarehouseFinalizeModal 
                    permit={warehouseFinalize} 
                    settings={settings}
                    onClose={() => setWarehouseFinalize(null)} 
                    onConfirm={handleWarehouseSubmit} 
                />
            )}

            {securityFinalize && (
                <SecurityFinalizeModal
                    permit={securityFinalize}
                    onClose={() => setSecurityFinalize(null)}
                    onConfirm={handleSecuritySubmit}
                />
            )}
        </div>
    );
};

export default ManageExitPermits;