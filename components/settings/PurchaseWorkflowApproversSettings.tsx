import React, { useState, useEffect } from 'react';
import { SystemSettings, User } from '../../types';
import { getUsers } from '../../services/authService';
import { 
    Briefcase, Warehouse, Crown, CheckSquare, 
    ShieldCheck, Users, Search, X, Check, Building2, ShoppingBag, Info
} from 'lucide-react';

interface Props {
    settings: SystemSettings;
    onUpdateSettings: (newSettings: SystemSettings) => void;
    users?: User[];
}

const UserSelectorList: React.FC<{
    title: string;
    description: string;
    icon: any;
    color: 'sky' | 'purple' | 'teal' | 'indigo' | 'emerald' | 'amber';
    selectedUserIds: string[];
    allUsers: User[];
    onChange: (newUserIds: string[]) => void;
}> = ({ title, description, icon: Icon, color, selectedUserIds = [], allUsers, onChange }) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const colorClasses = {
        sky: {
            badge: 'bg-sky-50 text-sky-700 border-sky-200',
            active: 'bg-sky-500 text-white',
            ring: 'focus:ring-sky-200 border-sky-200',
            bg: 'bg-sky-50/50'
        },
        purple: {
            badge: 'bg-purple-50 text-purple-700 border-purple-200',
            active: 'bg-purple-600 text-white',
            ring: 'focus:ring-purple-200 border-purple-200',
            bg: 'bg-purple-50/50'
        },
        teal: {
            badge: 'bg-teal-50 text-teal-700 border-teal-200',
            active: 'bg-teal-600 text-white',
            ring: 'focus:ring-teal-200 border-teal-200',
            bg: 'bg-teal-50/50'
        },
        indigo: {
            badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            active: 'bg-indigo-600 text-white',
            ring: 'focus:ring-indigo-200 border-indigo-200',
            bg: 'bg-indigo-50/50'
        },
        emerald: {
            badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            active: 'bg-emerald-600 text-white',
            ring: 'focus:ring-emerald-200 border-emerald-200',
            bg: 'bg-emerald-50/50'
        },
        amber: {
            badge: 'bg-amber-50 text-amber-700 border-amber-200',
            active: 'bg-amber-600 text-white',
            ring: 'focus:ring-amber-200 border-amber-200',
            bg: 'bg-amber-50/50'
        }
    }[color];

    const toggleUser = (userId: string) => {
        if (selectedUserIds.includes(userId)) {
            onChange(selectedUserIds.filter(id => id !== userId));
        } else {
            onChange([...selectedUserIds, userId]);
        }
    };

    const filteredUsers = allUsers.filter(u => 
        (u.fullName || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(search.toLowerCase())
    );

    const selectedUsers = allUsers.filter(u => selectedUserIds.includes(u.id));

    return (
        <div className="bg-white dark:bg-gray-800/80 rounded-2xl p-4 border border-gray-200/80 dark:border-gray-700 shadow-xs transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg border ${colorClasses.badge}`}>
                        <Icon size={16} />
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-gray-800 dark:text-gray-100">{title}</h4>
                        <p className="text-[10px] text-gray-400 dark:text-gray-400">{description}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${colorClasses.badge}`}>
                        {selectedUserIds.length} کاربر منتخب
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold px-2 py-1 rounded bg-indigo-50/60 hover:bg-indigo-100 transition-all cursor-pointer"
                    >
                        {isOpen ? 'بستن لیست' : 'ویرایش / انتخاب افراد'}
                    </button>
                </div>
            </div>

            {/* Selected Users Chips */}
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {selectedUsers.length === 0 ? (
                    <span className="text-[11px] text-gray-400 italic py-0.5">هیچ کاربری اختصاص نیافته است (فقط نقش‌های پیش‌فرض مدیران).</span>
                ) : (
                    selectedUsers.map(u => (
                        <span 
                            key={u.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs ${colorClasses.badge}`}
                        >
                            <span>{u.fullName || u.username}</span>
                            <span className="text-[9px] opacity-70">({u.username})</span>
                            <button
                                type="button"
                                onClick={() => toggleUser(u.id)}
                                className="hover:bg-black/10 rounded-full p-0.5 transition-colors cursor-pointer"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))
                )}
            </div>

            {/* Collapsible Selector Panel */}
            {isOpen && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-1">
                    <div className="relative mb-2">
                        <input
                            type="text"
                            placeholder="جستجوی نام یا نام کاربری..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full text-xs p-2 pr-8 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 bg-gray-50/50 dark:bg-gray-900"
                        />
                        <Search size={14} className="absolute right-2.5 top-2.5 text-gray-400" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                        {filteredUsers.map(u => {
                            const isSelected = selectedUserIds.includes(u.id);
                            return (
                                <div
                                    key={u.id}
                                    onClick={() => toggleUser(u.id)}
                                    className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                                        isSelected 
                                            ? `${colorClasses.badge} font-bold shadow-2xs` 
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="truncate flex-1">
                                        <div className="truncate">{u.fullName || u.username}</div>
                                        <div className="text-[10px] text-gray-400 font-mono truncate">{u.username} • {u.role}</div>
                                    </div>
                                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${isSelected ? colorClasses.active : 'border-gray-300 bg-white'}`}>
                                        {isSelected && <Check size={11} strokeWidth={3} />}
                                    </div>
                                </div>
                            );
                        })}
                        {filteredUsers.length === 0 && (
                            <div className="col-span-full text-center py-4 text-xs text-gray-400">
                                کاربری با این مشخصات یافت نشد.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export const PurchaseWorkflowApproversSettings: React.FC<Props> = ({ settings, onUpdateSettings, users: propUsers }) => {
    const [allUsers, setAllUsers] = useState<User[]>(propUsers || []);

    useEffect(() => {
        if (!propUsers || propUsers.length === 0) {
            getUsers().then(u => setAllUsers(u || [])).catch(() => {});
        } else {
            setAllUsers(propUsers);
        }
    }, [propUsers]);

    const updateField = (key: keyof SystemSettings, value: any) => {
        onUpdateSettings({
            ...settings,
            [key]: value
        });
    };

    return (
        <div className="space-y-6 text-right dir-rtl">
            {/* Top Overview Banner */}
            <div className="bg-gradient-to-r from-indigo-900 via-sky-900 to-indigo-800 text-white p-5 rounded-3xl shadow-lg border border-indigo-700/50">
                <div className="flex items-start gap-3">
                    <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                        <Building2 size={28} className="text-sky-300" />
                    </div>
                    <div>
                        <h3 className="text-base font-black flex items-center gap-2">
                            <span>تفکیک فرآیند و تعیین افراد مجاز تایید درخواست خرید</span>
                            <span className="text-[10px] bg-sky-400/20 text-sky-200 border border-sky-300/30 px-2 py-0.5 rounded-full font-normal">
                                تهران و زنجان
                            </span>
                        </h3>
                        <p className="text-xs text-sky-100/90 leading-relaxed mt-1">
                            فرآیند خرید به دو حوزه کاملاً مجزا تفکیک شده است: <strong>بازرگانی تهران</strong> و <strong>کارخانه زنجان</strong>. 
                            مدیران تهران (مدیرعامل و مدیر بازرگانی) به صورت خودکار تاییدهای تهران، و مدیران زنجان (مدیر کارخانه و کارپرداز) تاییدهای زنجان را انجام می‌دهند. علاوه بر نقش‌های اصلی، می‌توانید افراد خاص دیگری را برای هر بخش و مرحله مشخص کنید.
                        </p>
                    </div>
                </div>
            </div>

            {/* INITIAL FACTORY WORKFLOW STEPS (Line Supervisor, Technical NET, Warehouse Stock Check) */}
            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 rounded-3xl p-5 border-2 border-indigo-200 dark:border-indigo-800/80 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-200 dark:border-indigo-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-sm">
                            <CheckSquare size={22} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                                <span>۰. مراحل اولیه کارخانه (سرپرست خط، واحد فنی نت، انباردار قطعات)</span>
                                <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full border border-indigo-300">
                                    تاییدات قبل از خرید
                                </span>
                            </h3>
                            <p className="text-[11px] text-indigo-800 dark:text-indigo-300">
                                تعیین افراد مجاز جهت تایید سرپرست خط، تایید فنی نت، و بررسی موجودی توسط انباردار قطعات
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-indigo-900 dark:text-indigo-200 bg-indigo-100/70 dark:bg-indigo-900/40 px-3 py-1 rounded-xl border border-indigo-200">
                        <ShieldCheck size={14} className="text-indigo-600" />
                        <span>طبق تیک‌های تنظیمات و کاربران منتخب</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <UserSelectorList
                        title="👷 افراد خاص تایید سرپرست خط (مرحله ۱)"
                        description="تایید درخواست ثبت‌شده توسط سرشیفت و ارجاع به واحد فنی نت."
                        icon={Users}
                        color="indigo"
                        selectedUserIds={settings.purchaseLineSupervisorApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseLineSupervisorApproverUserIds', ids)}
                    />

                    <UserSelectorList
                        title="🔧 افراد خاص تایید فنی و نت (مرحله ۲)"
                        description="بررسی فنی درخواست قطعه و ارجاع به انباردار جهت بررسی موجودی."
                        icon={CheckSquare}
                        color="purple"
                        selectedUserIds={settings.purchaseTechnicalApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseTechnicalApproverUserIds', ids)}
                    />

                    <UserSelectorList
                        title="📦 افراد خاص بررسی موجودی انباردار قطعات (مرحله ۳)"
                        description="تایید وجود کالا در انبار یا اعلام عدم موجودی و نیاز به خرید."
                        icon={Warehouse}
                        color="emerald"
                        selectedUserIds={settings.purchaseWarehouseApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseWarehouseApproverUserIds', ids)}
                    />
                </div>
            </div>

            {/* TEHRAN COMMERCIAL BRANCH */}
            <div className="bg-sky-50/50 dark:bg-sky-950/20 rounded-3xl p-5 border-2 border-sky-200 dark:border-sky-800/80 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-200 dark:border-sky-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-sky-600 text-white rounded-2xl shadow-sm">
                            <Briefcase size={22} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-sky-950 dark:text-sky-100 flex items-center gap-2">
                                <span>۱. شعبه بازرگانی تهران (دفتر مرکزی)</span>
                                <span className="bg-sky-100 text-sky-800 text-[10px] px-2 py-0.5 rounded-full border border-sky-300">
                                    تایید توسط مدیران تهران
                                </span>
                            </h3>
                            <p className="text-[11px] text-sky-800 dark:text-sky-300">
                                فرآیند استعلامات عمده، پروفرماهای بازرگانی مرکزی و تاییدات مدیرعامل
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-sky-900 dark:text-sky-200 bg-sky-100/70 dark:bg-sky-900/40 px-3 py-1 rounded-xl border border-sky-200">
                        <Crown size={14} className="text-amber-500" />
                        <span>مدیرعامل و مدیر بازرگانی پیش‌فرض مجاز هستند</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UserSelectorList
                        title="👥 کاربران مجاز دسترسی به کارتابل بازرگانی تهران"
                        description="کاربران خاصی که حق مشاهده و ورود به کارتابل خریدهای تهران را دارند."
                        icon={Users}
                        color="sky"
                        selectedUserIds={settings.purchaseTehranAllowedUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseTehranAllowedUserIds', ids)}
                    />

                    <UserSelectorList
                        title="👑 افراد خاص تایید اولیه مدیرعامل تهران"
                        description="تایید اولیه و صدور مجوز اخذ استعلام در تهران (جانشینان مدیرعامل)."
                        icon={Crown}
                        color="sky"
                        selectedUserIds={settings.purchaseTehranCeoApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseTehranCeoApproverUserIds', ids)}
                    />

                    <UserSelectorList
                        title="👔 افراد خاص تایید مدیر بازرگانی تهران"
                        description="بررسی و تایید پیش‌فاکتورها و استعلامات واصله (جانشینان مدیر بازرگانی)."
                        icon={Briefcase}
                        color="purple"
                        selectedUserIds={settings.purchaseTehranCommercialApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseTehranCommercialApproverUserIds', ids)}
                    />

                    <UserSelectorList
                        title="💼 افراد خاص ثبت پیش‌فاکتورهای بازرگانی تهران"
                        description="پرسنل بازرگانی تهران مجاز جهت بارگذاری پیش‌فاکتور و استعلام قیمت."
                        icon={ShoppingBag}
                        color="indigo"
                        selectedUserIds={settings.purchaseTehranProformaUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseTehranProformaUserIds', ids)}
                    />

                    <UserSelectorList
                        title="🎯 افراد خاص انتخاب گزینه نهایی خرید تهران"
                        description="تصویب و انتخاب تامین‌کننده نهایی از میان پیش‌فاکتورهای بازرگانی تهران."
                        icon={CheckSquare}
                        color="sky"
                        selectedUserIds={settings.purchaseTehranSelectionUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseTehranSelectionUserIds', ids)}
                    />

                    <UserSelectorList
                        title="📁 افراد خاص تایید نهایی و بایگانی بازرگانی تهران"
                        description="بایگانی و اتمام نهایی پرونده بازرگانی پس از ورود کالا به انبار کارخانه."
                        icon={ShieldCheck}
                        color="indigo"
                        selectedUserIds={settings.purchaseTehranFinalUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseTehranFinalUserIds', ids)}
                    />
                </div>
            </div>

            {/* ZANJAN FACTORY BRANCH */}
            <div className="bg-teal-50/50 dark:bg-teal-950/20 rounded-3xl p-5 border-2 border-teal-200 dark:border-teal-800/80 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-teal-200 dark:border-teal-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-teal-600 text-white rounded-2xl shadow-sm">
                            <Warehouse size={22} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-teal-950 dark:text-teal-100 flex items-center gap-2">
                                <span>۲. کارخانه زنجان (تامین محلی و فوری)</span>
                                <span className="bg-teal-100 text-teal-800 text-[10px] px-2 py-0.5 rounded-full border border-teal-300">
                                    تایید توسط مدیران زنجان
                                </span>
                            </h3>
                            <p className="text-[11px] text-teal-800 dark:text-teal-300">
                                فرآیند خرید سریع قطعات، کارپرداز کارخانه و تاییدات مدیر کارخانه زنجان
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-teal-900 dark:text-teal-200 bg-teal-100/70 dark:bg-teal-900/40 px-3 py-1 rounded-xl border border-teal-200">
                        <Warehouse size={14} className="text-teal-600" />
                        <span>مدیر کارخانه و کارپرداز زنجان پیش‌فرض مجاز هستند</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UserSelectorList
                        title="👥 کاربران مجاز دسترسی به کارتابل کارخانه زنجان"
                        description="کاربران خاصی که حق مشاهده و ورود به کارتابل خریدهای کارخانه زنجان را دارند."
                        icon={Users}
                        color="teal"
                        selectedUserIds={settings.purchaseZanjanAllowedUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseZanjanAllowedUserIds', ids)}
                    />

                    <UserSelectorList
                        title="🏭 افراد خاص تصمیم‌گیری و تعیین مسیر خرید محلی"
                        description="تعیین مسیر تامین کالا (تصمیم به ارجاع به زنجان به جای تهران)."
                        icon={Warehouse}
                        color="teal"
                        selectedUserIds={settings.purchaseZanjanDecisionApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseZanjanDecisionApproverUserIds', ids)}
                    />

                    <UserSelectorList
                        title="📝 افراد خاص پیشنهاد و استعلام خرید محلی زنجان"
                        description="ثبت استعلام، قیمت‌ها و پیش‌فاکتورهای خرید محلی کارخانه زنجان."
                        icon={ShoppingBag}
                        color="emerald"
                        selectedUserIds={settings.purchaseZanjanPurchasingUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseZanjanPurchasingUserIds', ids)}
                    />

                    <UserSelectorList
                        title="✅ افراد خاص صدور دستور خرید محلی (مدیر کارخانه زنجان)"
                        description="تایید نهایی پیشنهاد قیمت و صدور دستور خرید قطعه برای کارپرداز."
                        icon={CheckSquare}
                        color="teal"
                        selectedUserIds={settings.purchaseZanjanManagerApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseZanjanManagerApproverUserIds', ids)}
                    />

                    <UserSelectorList
                        title="🛍️ افراد خاص ثبت خرید و تسویه فاکتور کارپرداز زنجان"
                        description="ثبت خرید عملیاتی، شماره فاکتور، مبلغ پرداختی و پیوست فاکتور کارپرداز."
                        icon={ShoppingBag}
                        color="amber"
                        selectedUserIds={settings.purchaseZanjanBuyerUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseZanjanBuyerUserIds', ids)}
                    />

                    <UserSelectorList
                        title="🏁 افراد خاص تایید نهایی مدیر کارخانه زنجان"
                        description="تایید نهایی و امضای برگه پس از رسید انبار و تحویل کالا در کارخانه."
                        icon={ShieldCheck}
                        color="emerald"
                        selectedUserIds={settings.purchaseZanjanFinalApproverUserIds || []}
                        allUsers={allUsers}
                        onChange={(ids) => updateField('purchaseZanjanFinalApproverUserIds', ids)}
                    />
                </div>
            </div>
        </div>
    );
};

export default PurchaseWorkflowApproversSettings;
