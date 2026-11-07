
// Actions for WhatsApp Bot
import * as dbManager from '../db-manager.js';
import * as utils from '../utils.js';

const saveDb = dbManager.saveDb;
const findNextGapNumber = utils.findNextGapNumber;
const generateUUID = utils.generateUUID;

const formatCurrency = (amount) => new Intl.NumberFormat('fa-IR').format(amount) + ' ریال';
const formatDate = () => new Date().toLocaleDateString('fa-IR');

// --- ACTIONS ---

export const handleCreatePayment = (db, args, user) => {
    const requesterName = user?.fullName || user?.username || 'کاربر واتساپ';
    const company = db.settings.defaultCompany || '';
    let minStart = db.settings.currentTrackingNumber || 1000;
    let activeYear = null;
    if (db.settings.activeFiscalYearId) {
        activeYear = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
        if (activeYear && company && activeYear.companySequences) {
            const target = company.trim().replace(/\s+/g, ' ');
            const foundKey = Object.keys(activeYear.companySequences).find(k => k.trim().replace(/\s+/g, ' ') === target);
            if (foundKey && activeYear.companySequences[foundKey]) {
                minStart = parseInt(String(activeYear.companySequences[foundKey].startTrackingNumber)) || minStart;
            }
        }
    }

    let yearOrders = db.orders || [];
    if (activeYear) {
        yearOrders = yearOrders.filter(o => {
            if (o.fiscalYearId) return o.fiscalYearId === activeYear.id;
            if (activeYear.label) {
                const shamsiYM = utils.toShamsiYearMonth(o.date);
                if (shamsiYM && shamsiYM.startsWith(activeYear.label + '/')) return true;
            }
            if (activeYear.startDate && activeYear.endDate && o.date) {
                return o.date >= activeYear.startDate && o.date <= activeYear.endDate;
            }
            return false;
        });
    }

    const trackingNum = findNextGapNumber(yearOrders, company, 'trackingNumber', minStart);
    
    // Duplicate check
    let finalNum = trackingNum;
    while (utils.checkForDuplicate(yearOrders, 'trackingNumber', finalNum, 'payingCompany', company)) {
        finalNum++;
    }

    const amount = typeof args.amount === 'string' ? parseInt(args.amount.replace(/[^0-9]/g, '')) : args.amount;
    
    // Create detailed payment structure exactly like UI
    const newOrder = { 
        id: generateUUID(), 
        trackingNumber: finalNum, 
        date: new Date().toISOString().split('T')[0], 
        payee: args.payee, 
        totalAmount: amount, 
        description: args.description || `ثبت از طریق واتساپ (${requesterName})`, 
        status: 'در انتظار بررسی مالی', 
        requester: requesterName, 
        payingCompany: company, 
        fiscalYearId: activeYear ? activeYear.id : undefined,
        paymentDetails: [
            {
                id: generateUUID(), 
                method: 'حواله بانکی', // Default to Transfer
                amount: amount, 
                bankName: args.bank || 'نامشخص',
                description: args.description || 'ثبت خودکار'
            }
        ], 
        createdAt: Date.now() 
    };
    
    db.orders.unshift(newOrder);
    saveDb(db);
    return `✅ *دستور پرداخت ثبت شد*\n🔹 شماره: ${finalNum}\n💰 مبلغ: ${formatCurrency(amount)}\n👤 ذینفع: ${args.payee}\n🏦 بانک: ${args.bank || '-'}\n👤 ثبت‌کننده: ${requesterName}`;
};

export const handleCreateBijak = (db, args, user) => {
    const creatorName = user?.fullName || user?.username || 'کاربر واتساپ';
    const company = db.settings.defaultCompany || '';
    let minStart = 1000;
    if (db.settings.activeFiscalYearId && company) {
        const year = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
        if (year && year.companySequences && year.companySequences[company]) {
            minStart = year.companySequences[company].startBijakNumber || 1000;
        }
    }
    const nextSeq = findNextGapNumber(db.warehouseTransactions, company, 'number', minStart);
    
    // Duplicate check
    let finalSeq = nextSeq;
    while (utils.checkForDuplicate(db.warehouseTransactions, 'number', finalSeq, 'company', company)) {
        finalSeq++;
    }

    const newTx = { 
        id: generateUUID(), 
        type: 'OUT', 
        date: new Date().toISOString(), 
        company: company, 
        number: finalSeq, 
        recipientName: args.recipient,
        driverName: args.driver || '',   // Capture Driver
        plateNumber: args.plate || '',   // Capture Plate
        destination: args.destination || '', // Capture Destination if provided
        items: [
            {
                itemId: generateUUID(), 
                itemName: args.itemName, 
                quantity: Number(args.count), 
                weight: 0,
                unitPrice: 0
            }
        ], 
        createdAt: Date.now(), 
        createdBy: creatorName 
    };
    
    db.warehouseTransactions.unshift(newTx);
    saveDb(db);
    
    let msg = `📦 *حواله خروج (بیجک) صادر شد*\n🔹 شماره: ${finalSeq}\n📦 کالا: ${args.count} عدد ${args.itemName}\n👤 گیرنده: ${args.recipient}\n👤 صادرکننده: ${creatorName}`;
    if (args.driver) msg += `\n🚛 راننده: ${args.driver}`;
    if (args.plate) msg += `\n🔢 پلاک: ${args.plate}`;
    return msg;
};

// NEW: Create Exit Permit (Sales Order)
export const handleCreateExitPermit = (db, args, user) => {
    const requesterName = user?.fullName || user?.username || 'کاربر واتساپ';
    const company = db.settings.defaultCompany || '';
    let minStart = db.settings.currentExitPermitNumber || 1000;
    if (db.settings.activeFiscalYearId && company) {
        const year = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
        if (year && year.companySequences && year.companySequences[company]) {
            minStart = year.companySequences[company].startExitPermitNumber || minStart;
        }
    }
    const nextPermitNum = findNextGapNumber(db.exitPermits, company, 'permitNumber', minStart);
    
    // Duplicate check
    let finalNum = nextPermitNum;
    while (utils.checkForDuplicate(db.exitPermits, 'permitNumber', finalNum, 'company', company)) {
        finalNum++;
    }

    const newPermit = {
        id: generateUUID(),
        permitNumber: finalNum,
        date: new Date().toISOString().split('T')[0],
        company: company,
        requester: requesterName,
        items: [{
            id: generateUUID(),
            goodsName: args.itemName,
            cartonCount: Number(args.count) || 0,
            weight: 0
        }],
        destinations: [{
            id: generateUUID(),
            recipientName: args.recipient,
            address: 'ثبت شده توسط واتساپ',
            phone: ''
        }],
        goodsName: args.itemName, 
        recipientName: args.recipient, 
        cartonCount: Number(args.count) || 0,
        status: 'در انتظار تایید مدیرعامل',
        createdAt: Date.now()
    };

    db.exitPermits.push(newPermit);
    saveDb(db);

    return `🚛 *درخواست خروج (حواله فروش) ثبت شد*\n🔹 شماره مجوز: ${finalNum}\n📦 کالا: ${args.itemName} (${args.count})\n👤 گیرنده: ${args.recipient}\n👤 درخواست‌دهنده: ${requesterName}\n⏳ وضعیت: در انتظار تایید`;
};

// NEW: Trade Report
export const handleTradeReport = (db) => {
    const records = db.tradeRecords || [];
    const activeRecords = records.filter(r => r.status !== 'Completed');

    if (activeRecords.length === 0) return "✅ هیچ پرونده بازرگانی فعالی وجود ندارد.";

    let report = `🌍 *گزارش پرونده‌های بازرگانی فعال*\n---------------------------\n`;
    
    activeRecords.forEach(r => {
        // Determine current stage
        const stages = ['مجوزها و پروفرما', 'بیمه', 'در صف تخصیص ارز', 'تخصیص یافته', 'خرید ارز', 'اسناد حمل', 'گواهی بازرسی', 'ترخیصیه و قبض انبار', 'برگ سبز', 'حمل داخلی', 'هزینه‌های ترخیص', 'قیمت تمام شده'];
        const completedStages = stages.filter(s => r.stages && r.stages[s] && r.stages[s].isCompleted);
        const currentStage = completedStages.length > 0 ? completedStages[completedStages.length - 1] : 'شروع نشده';

        report += `📁 *پرونده: ${r.fileNumber}*\n`;
        report += `📦 کالا: ${r.goodsName}\n`;
        report += `🏢 شرکت: ${r.company || '-'}\n`;
        report += `🔄 مرحله: ${currentStage}\n`;
        report += `💰 ارز پایه: ${r.mainCurrency}\n`;
        report += `---------------------------\n`;
    });

    return report;
};

export const handleApprovePayment = (db, number, user) => {
    // Check if user has permission to approve payments
    const canApprove = user && (
        user.role === 'admin' || 
        user.role === 'ceo' || 
        user.role === 'manager' || 
        user.role === 'financial_manager' ||
        (Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('financial_manager') || user.roles.includes('ceo')))
    );
    if (!canApprove) {
        return "⛔ شما دسترسی مجاز برای تایید دستور پرداخت را ندارید.";
    }

    const order = db.orders.find(o => o.trackingNumber == number);
    if (!order) return "❌ دستور پرداخت یافت نشد.";
    
    let oldStatus = order.status;
    if (order.status === 'در انتظار بررسی مالی') order.status = 'تایید مالی / در انتظار مدیریت';
    else if (order.status === 'تایید مالی / در انتظار مدیریت') order.status = 'تایید مدیریت / در انتظار مدیرعامل';
    else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل') order.status = 'تایید نهایی';
    else if (order.status === 'تایید نهایی') return "ℹ️ این سند قبلاً تایید نهایی شده است.";
    
    saveDb(db);
    return `✅ *تایید شد*\nدستور پرداخت: ${number}\nوضعیت قبلی: ${oldStatus}\nوضعیت جدید: ${order.status}\n👤 تاییدکننده: ${user?.fullName || user?.username || 'مدیر'}`;
};

export const handleRejectPayment = (db, number, user) => {
    // Check if user has permission to reject payments
    const canReject = user && (
        user.role === 'admin' || 
        user.role === 'ceo' || 
        user.role === 'manager' || 
        user.role === 'financial_manager' ||
        (Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('financial_manager') || user.roles.includes('ceo')))
    );
    if (!canReject) {
        return "⛔ شما دسترسی مجاز برای رد دستور پرداخت را ندارید.";
    }

    const order = db.orders.find(o => o.trackingNumber == number);
    if (!order) return "❌ دستور پرداخت یافت نشد.";
    
    order.status = 'رد شده';
    saveDb(db);
    return `🚫 دستور پرداخت ${number} رد شد.\n👤 ثبت‌کننده رد: ${user?.fullName || user?.username || 'مدیر'}`;
};

export const handleApproveExit = (db, number, user) => {
    const canApprove = user && (
        user.role === 'admin' || 
        user.role === 'ceo' || 
        user.role === 'sales_manager' || 
        user.role === 'manager' || 
        (Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('sales_manager') || user.roles.includes('ceo')))
    );
    if (!canApprove) {
        return "⛔ شما دسترسی مجاز برای تایید مجوز خروج را ندارید.";
    }

    const permit = db.exitPermits.find(p => p.permitNumber == number);
    if (!permit) return "❌ مجوز خروج یافت نشد.";
    
    let oldStatus = permit.status;
    if (permit.status === 'در انتظار تایید مدیرعامل') permit.status = 'تایید مدیرعامل / در انتظار خروج (کارخانه)';
    else if (permit.status === 'تایید مدیرعامل / در انتظار خروج (کارخانه)') permit.status = 'خارج شده (بایگانی)';
    else return "ℹ️ وضعیت این مجوز قابل تغییر نیست.";
    
    saveDb(db);
    return `✅ *تایید شد*\nمجوز خروج: ${number}\nوضعیت جدید: ${permit.status}\n👤 تاییدکننده: ${user?.fullName || user?.username || 'مدیر'}`;
};

export const handleRejectExit = (db, number, user) => {
    const canReject = user && (
        user.role === 'admin' || 
        user.role === 'ceo' || 
        user.role === 'sales_manager' || 
        user.role === 'manager' || 
        (Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('sales_manager') || user.roles.includes('ceo')))
    );
    if (!canReject) {
        return "⛔ شما دسترسی مجاز برای رد مجوز خروج را ندارید.";
    }

    const permit = db.exitPermits.find(p => p.permitNumber == number);
    if (!permit) return "❌ مجوز خروج یافت نشد.";
    
    permit.status = 'رد شده';
    saveDb(db);
    return `🚫 مجوز خروج ${number} رد شد.\n👤 ثبت‌کننده رد: ${user?.fullName || user?.username || 'مدیر'}`;
};

export const handleReport = (db, user) => {
    const role = user?.role || '';
    const roles = Array.isArray(user?.roles) ? user.roles : [role];
    
    const isGlobalAdmin = roles.includes('admin') || role === 'admin' || role === 'ceo';
    const canViewFinancials = isGlobalAdmin || role === 'accounting' || role === 'financial_manager' || roles.includes('accounting') || user?.canViewFinancials;
    const canViewWarehouse = isGlobalAdmin || role === 'sales_manager' || role === 'warehouse' || roles.includes('warehouse') || roles.includes('sales_manager');

    if (!canViewFinancials && !canViewWarehouse) {
        return "⛔ شما دسترسی لازم برای دریافت گزارشات کارتابل سیستم را ندارید.";
    }

    const pendingOrders = canViewFinancials ? (db.orders || []).filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده') : [];
    const pendingExits = canViewWarehouse ? (db.exitPermits || []).filter(p => p.status !== 'خارج شده (بایگانی)' && p.status !== 'رد شده') : [];
    const recentBijaks = canViewWarehouse ? (db.warehouseTransactions || []).filter(t => t.type === 'OUT').slice(0, 5) : [];
    
    let report = `📊 *گزارش کارتابل سیستم*\n`;
    report += `📅 تاریخ: ${formatDate()}\n`;
    report += `👤 گیرنده گزارش: ${user?.fullName || user?.username || 'کاربر مجاز'}\n`;
    report += `---------------------------\n`;
    
    // Payments Detail (ONLY IF PERMITTED)
    if (canViewFinancials) {
        report += `💰 *کارتابل دستور پرداخت‌ها:*\n`;
        if (pendingOrders.length > 0) {
            pendingOrders.forEach(o => {
                report += `🔹 شماره: ${o.trackingNumber}\n`;
                report += `👤 ذینفع: ${o.payee}\n`;
                report += `💰 مبلغ: ${formatCurrency(o.totalAmount)}\n`;
                report += `📝 بابت: ${o.description || '-'}\n`;
                report += `👤 ثبت‌کننده: ${o.requester}\n`;
                report += `⏳ وضعیت: ${o.status}\n`;
                report += `---------------------------\n`;
            });
        } else {
            report += "هیچ دستور پرداخت بازی وجود ندارد.\n---------------------------\n";
        }
    }
    
    // Warehouse & Logistics Detail (ONLY IF PERMITTED)
    if (canViewWarehouse) {
        report += `🚛 *گزارش حواله و خروج کالا:*\n`;
        if (pendingExits.length > 0) {
            report += `🔴 مجوزهای خروج در انتظار:\n`;
            pendingExits.forEach(p => {
                const items = p.items?.map(i => i.goodsName).join('، ') || p.goodsName || 'کالا';
                report += `🔸 مجوز #${p.permitNumber} | گیرنده: ${p.recipientName}\n`;
                report += `   وضعیت: ${p.status}\n`;
            });
            report += `---------------------------\n`;
        }

        // Recent Bijaks
        if (recentBijaks.length > 0) {
            report += `📦 آخرین بیجک‌های صادر شده:\n`;
            recentBijaks.forEach(b => {
                const itemsSummary = (b.items || []).map(i => `${i.quantity} ${i.itemName}`).join('، ');
                report += `🔹 بیجک #${b.number} | ${itemsSummary}\n`;
                report += `   گیرنده: ${b.recipientName}\n`;
            });
        }
    }

    return report;
};
