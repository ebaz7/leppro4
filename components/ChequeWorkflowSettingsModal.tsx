import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, 
    Settings2, 
    ShieldCheck, 
    CheckCircle2, 
    Users, 
    Layers, 
    Zap, 
    AlertCircle, 
    Lock, 
    UserCheck,
    Save,
    RotateCcw
} from 'lucide-react';
import { getEffectiveApiUrl, getAuthToken } from '../services/apiService';
const toPersianDigits = (n: number | string) => String(n ?? '').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);

export interface ChequeWorkflowConfig {
    requireCeoApproval: boolean;
    autoRegisterAfterAccounting: boolean;
    allowAccountingFinalApproval: boolean;
    allowedFinalApproverUserIds: string[];
    allowedFinalApproverRoles: string[];
}

interface ChequeWorkflowSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentConfig: ChequeWorkflowConfig;
    systemUsers: Array<{ id: string; name: string; username: string; role: string; roles?: string[] }>;
    onSaveSuccess: (updated: ChequeWorkflowConfig) => void;
}

export const ChequeWorkflowSettingsModal: React.FC<ChequeWorkflowSettingsModalProps> = ({
    isOpen,
    onClose,
    currentConfig,
    systemUsers,
    onSaveSuccess
}) => {
    const [config, setConfig] = useState<ChequeWorkflowConfig>({
        requireCeoApproval: currentConfig?.requireCeoApproval ?? false,
        autoRegisterAfterAccounting: currentConfig?.autoRegisterAfterAccounting ?? true,
        allowAccountingFinalApproval: currentConfig?.allowAccountingFinalApproval ?? true,
        allowedFinalApproverUserIds: currentConfig?.allowedFinalApproverUserIds || [],
        allowedFinalApproverRoles: currentConfig?.allowedFinalApproverRoles || ['ADMIN', 'CEO', 'FINANCIAL', 'ACCOUNTANT']
    });

    useEffect(() => {
        if (currentConfig) {
            setConfig({
                requireCeoApproval: currentConfig.requireCeoApproval ?? false,
                autoRegisterAfterAccounting: currentConfig.autoRegisterAfterAccounting ?? true,
                allowAccountingFinalApproval: currentConfig.allowAccountingFinalApproval ?? true,
                allowedFinalApproverUserIds: currentConfig.allowedFinalApproverUserIds || [],
                allowedFinalApproverRoles: currentConfig.allowedFinalApproverRoles || ['ADMIN', 'CEO', 'FINANCIAL', 'ACCOUNTANT']
            });
        }
    }, [currentConfig, isOpen]);

    const [saving, setSaving] = useState(false);
    const [savedNotice, setSavedNotice] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [userSearchTerm, setUserSearchTerm] = useState('');

    if (!isOpen || typeof document === 'undefined') return null;

    const handleToggleCeoApproval = (required: boolean) => {
        setConfig(prev => ({
            ...prev,
            requireCeoApproval: required,
            // If CEO approval is disabled, default auto-register to true for instant seamless registration
            autoRegisterAfterAccounting: !required ? (prev.autoRegisterAfterAccounting ?? true) : false
        }));
    };

    const handleToggleUser = (userId: string) => {
        setConfig(prev => {
            const exists = prev.allowedFinalApproverUserIds.includes(userId);
            const nextList = exists
                ? prev.allowedFinalApproverUserIds.filter(id => id !== userId)
                : [...prev.allowedFinalApproverUserIds, userId];
            return { ...prev, allowedFinalApproverUserIds: nextList };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setErrorMessage(null);
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(getEffectiveApiUrl('/api/sayan/cheque-receipts/workflow-config'), {
                method: 'POST',
                headers,
                body: JSON.stringify(config)
            });

            let data: any = {};
            try {
                data = await res.json();
            } catch (jsonErr) {
                const text = await res.text().catch(() => '');
                throw new Error(text || `خطای سرور (${res.status})`);
            }

            if (!res.ok) {
                throw new Error(data.error || `خطای سرور (${res.status})`);
            }

            if (data.success && data.config) {
                setSavedNotice(true);
                onSaveSuccess(data.config);
                setTimeout(() => {
                    setSavedNotice(false);
                    onClose();
                }, 1000);
            } else {
                setErrorMessage(data.error || 'خطا در ذخیره تنظیمات');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در برقراری ارتباط با سرور');
        } finally {
            setSaving(false);
        }
    };

    const filteredUsers = systemUsers.filter(u => 
        u.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.username?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.role?.toLowerCase().includes(userSearchTerm.toLowerCase())
    );

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] my-auto overflow-hidden animate-scale-in">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                            <Settings2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                                تنظیمات جریان کار، تایید نهایی و ثبت در سایان
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                تعیین روال تایید مدیرعامل، ثبت خودکار و واگذاری اختیارات به کاربران عادی
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 overflow-y-auto text-xs">
                    
                    {savedNotice && (
                        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>تنظیمات با موفقیت ذخیره شد.</span>
                        </div>
                    )}

                    {errorMessage && (
                        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 font-bold flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Section 1: Workflow Strategy Mode */}
                    <div className="space-y-3">
                        <label className="font-black text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-500" />
                            <span>مراحل تایید رسید و روال ثبت در سایان:</span>
                        </label>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Mode A: 2-Step Approval (CEO Required) */}
                            <div 
                                onClick={() => handleToggleCeoApproval(true)}
                                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all space-y-2 ${
                                    config.requireCeoApproval
                                        ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-500 text-slate-900 dark:text-white shadow-sm'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                            config.requireCeoApproval ? 'border-amber-600 bg-amber-600' : 'border-slate-300'
                                        }`}>
                                            {config.requireCeoApproval && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                        <span className="font-black text-xs">تایید دو مرحله‌ای (مدیرعامل + حسابداری)</span>
                                    </div>
                                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                                </div>
                                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                    پس از تایید اولیه حسابداری، رسید در کارتابل مدیرعامل (یا کاربران مجاز تعیین شده) قرار می‌گیرد و با تایید نهایی در سایان صادر می‌گردد.
                                </p>
                            </div>

                            {/* Mode B: 1-Step Approval (CEO Disabled) */}
                            <div 
                                onClick={() => handleToggleCeoApproval(false)}
                                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all space-y-2 ${
                                    !config.requireCeoApproval
                                        ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-500 text-slate-900 dark:text-white shadow-sm'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                            !config.requireCeoApproval ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                                        }`}>
                                            {!config.requireCeoApproval && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                        <span className="font-black text-xs">غیرفعال‌سازی تایید مدیرعامل (تایید مستقیم)</span>
                                    </div>
                                    <Zap className="w-4 h-4 text-emerald-600" />
                                </div>
                                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                    تایید مدیرعامل حذف می‌شود؛ رسیدها بلافاصله پس از تایید حسابداری یا توسط کاربران مجاز، مستقیماً در سایان ثبت می‌شوند.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Automation & Accounting Final Approval Options */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="font-bold text-slate-900 dark:text-white">
                                    ثبت خودکار در سایان بلافاصله پس از تایید حسابداری
                                </h4>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    با فعال بودن این گزینه، به محض تایید حسابدار، رسید مستقیماً در صف صدور سند سایان قرار گرفته و نیازی به کلیک مجدد تایید نهایی نیست.
                                </p>
                            </div>
                            <input
                                type="checkbox"
                                checked={config.autoRegisterAfterAccounting}
                                onChange={e => setConfig(prev => ({ ...prev, autoRegisterAfterAccounting: e.target.checked }))}
                                className="w-5 h-5 accent-emerald-600 cursor-pointer rounded shrink-0 mt-0.5"
                            />
                        </div>

                        <div className="h-px bg-slate-200 dark:bg-slate-700" />

                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="font-bold text-slate-900 dark:text-white">
                                    مجاز بودن پرسنل حسابداری و مالی برای تایید نهایی و ثبت در سایان
                                </h4>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    کاربران با نقش مالی/حسابداری می‌توانند علاوه بر بررسی اولیه، دکمه «تایید نهایی و ثبت در سایان» را نیز بزنند.
                                </p>
                            </div>
                            <input
                                type="checkbox"
                                checked={config.allowAccountingFinalApproval}
                                onChange={e => setConfig(prev => ({ ...prev, allowAccountingFinalApproval: e.target.checked }))}
                                className="w-5 h-5 accent-emerald-600 cursor-pointer rounded shrink-0 mt-0.5"
                            />
                        </div>
                    </div>

                    {/* Section 3: Whitelist Specific Normal Users */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="font-black text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-emerald-600" />
                                <span>تعیین کاربران عادی مجاز جهت تایید نهایی و ثبت سایان (به جای مدیرعامل):</span>
                            </label>
                            <span className="text-[11px] font-mono text-slate-400">
                                {toPersianDigits(config.allowedFinalApproverUserIds.length)} کاربر انتخاب شده
                            </span>
                        </div>

                        <div className="relative">
                            <input
                                type="text"
                                value={userSearchTerm}
                                onChange={e => setUserSearchTerm(e.target.value)}
                                placeholder="جستجوی نام، نام کاربری یا نقش..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 p-1">
                            {filteredUsers.length === 0 ? (
                                <div className="p-4 text-center text-slate-400 text-xs">
                                    کاربری با این مشخصات یافت نشد.
                                </div>
                            ) : (
                                filteredUsers.map(user => {
                                    const isSelected = config.allowedFinalApproverUserIds.includes(user.id);
                                    const isDefaultCeoOrAdmin = user.role === 'ADMIN' || user.role === 'CEO' || (user.roles || []).includes('admin') || (user.roles || []).includes('ceo');

                                    return (
                                        <div
                                            key={user.id}
                                            onClick={() => handleToggleUser(user.id)}
                                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                                                isSelected 
                                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200' 
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}} // handled by parent div
                                                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                                                />
                                                <div>
                                                    <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                                                        <span>{user.name}</span>
                                                        <span className="font-mono text-[10px] text-slate-400 font-normal">(@{user.username})</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        نقش: {user.role} {isDefaultCeoOrAdmin && '(دسترسی پیش‌فرض مدیرعامل/ادمین)'}
                                                    </div>
                                                </div>
                                            </div>

                                            {isSelected && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                                                    مجاز به تایید نهایی
                                                </span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => {
                            setConfig({
                                requireCeoApproval: true,
                                autoRegisterAfterAccounting: false,
                                allowAccountingFinalApproval: false,
                                allowedFinalApproverUserIds: [],
                                allowedFinalApproverRoles: []
                            });
                        }}
                        className="px-3 py-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-bold flex items-center gap-1.5"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>بازنشانی به حالت پیش‌فرض</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-bold hover:bg-slate-300"
                        >
                            انصراف
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                        >
                            <Save className="w-4 h-4" />
                            <span>{saving ? 'در حال ذخیره‌سازی...' : 'ذخیره تنظیمات جریان کار'}</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};
