
import { User, UserRole, SystemSettings, RolePermissions } from '../types';
import { apiCall } from './apiService';

const CURRENT_USER_KEY = 'app_current_user';

export const getUsers = async (): Promise<User[]> => {
    return await apiCall<User[]>('/users');
};

export const saveUser = async (user: User): Promise<User[]> => {
    return await apiCall<User[]>('/users', 'POST', user);
};

export const updateUser = async (user: User): Promise<User[]> => {
    const current = getCurrentUser();
    if (current && String(current.id) === String(user.id)) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('current-user-updated', { detail: user }));
        }
    }
    return await apiCall<User[]>(`/users/${user.id}`, 'PUT', user);
};

export const deleteUser = async (id: string): Promise<User[]> => {
    return await apiCall<User[]>(`/users/${id}`, 'DELETE');
};

export const login = async (username: string, password: string): Promise<User | null> => {
    const user = await apiCall<User>('/login', 'POST', { username, password });
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
};

export const logout = (): void => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const hasPermission = (user: User | null, permissionType: string): boolean => {
  if (!user) return false;
  if (permissionType === 'manage_users') {
    return user.role === UserRole.ADMIN || (Array.isArray(user.roles) && user.roles.includes(UserRole.ADMIN));
  }
  return false;
};

// --- REWRITTEN PERMISSION LOGIC (STRICT MODE & FAILSAFE) ---
export const getRolePermissions = (userRole: string, settings: SystemSettings | null, userObject?: User): RolePermissions => {
    
    // If the user has multiple roles, compile a composite set of permissions
    if (userObject && Array.isArray(userObject.roles) && userObject.roles.length > 0) {
        // If any of the roles is ADMIN, they get everything (highest priority)
        if (userObject.roles.includes(UserRole.ADMIN)) {
            return {
                canViewAll: true, canCreatePaymentOrder: true, canViewPaymentOrders: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canManageArchiveAttachments: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: true,
                canCreateExitPermit: true, canViewExitPermits: true, canApproveExitCeo: true, canApproveExitFactory: true, canApproveExitWarehouse: true, canApproveExitSecurity: true, canViewExitArchive: true, canEditExitArchive: true,
                canManageWarehouse: true, canViewWarehouseReports: true, canApproveBijak: true,
                canViewSecurity: true, canCreateSecurityLog: true, canApproveSecuritySupervisor: true, canManagePurchase: true,
                canViewNotifications: true, canCreateNotifications: true, canCreateAnnouncements: true,
                canViewCustomerBalances: true, canImportCustomerBalances: true,
                canViewSayan: true, canViewSayanTraz: true, canViewSayanSales: true, canViewSayanProduction: true, canViewSayanProdReturns: true, canViewSayanCheques: true, canViewSayanRemittances: true, canViewSayanWarehouseOverview: true, canViewSayanWarehouseWidget: true,
                canAccessSayanRegistrations: true, canSayanPreInvoices: true,
                canSayanRegisterCheque: true, canSayanEditReceipt: true, canSayanApproveAccounting: true, canSayanApproveCeo: true, canSayanDeleteReceipt: true,
                canAccessChequeReceipts: true
            };
        }

        // Get permissions for each role
        const permissionsList = userObject.roles.map(role => 
            getRolePermissions(role, settings, { ...userObject, roles: undefined })
        );

        // Merge permissions
        const mergedPerms = { ...permissionsList[0] };
        for (let i = 1; i < permissionsList.length; i++) {
            const currentPerms = permissionsList[i];
            for (const key of Object.keys(currentPerms) as Array<keyof RolePermissions>) {
                if (currentPerms[key] === true) {
                    mergedPerms[key] = true;
                }
            }
        }
        return mergedPerms;
    }

    // 1. ADMIN GETS EVERYTHING (Hard Override)
    if (userRole === UserRole.ADMIN) {
        return {
            canViewAll: true, canCreatePaymentOrder: true, canViewPaymentOrders: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canManageArchiveAttachments: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: true,
            canCreateExitPermit: true, canViewExitPermits: true, canApproveExitCeo: true, canApproveExitFactory: true, canApproveExitWarehouse: true, canApproveExitSecurity: true, canViewExitArchive: true, canEditExitArchive: true,
            canManageWarehouse: true, canViewWarehouseReports: true, canApproveBijak: true,
            canViewSecurity: true, canCreateSecurityLog: true, canApproveSecuritySupervisor: true, canManagePurchase: true,
            canViewNotifications: true, canCreateNotifications: true, canCreateAnnouncements: true,
            canViewCustomerBalances: true, canImportCustomerBalances: true,
            canViewSayan: true, canViewSayanTraz: true, canViewSayanSales: true, canViewSayanProduction: true, canViewSayanProdReturns: true, canViewSayanCheques: true, canViewSayanRemittances: true, canViewSayanWarehouseOverview: true, canViewSayanWarehouseWidget: true,
            canAccessSayanRegistrations: true, canSayanPreInvoices: true,
            canSayanRegisterCheque: true, canSayanEditReceipt: true, canSayanApproveAccounting: true, canSayanApproveCeo: true, canSayanFinalApprove: true, canSayanDeleteReceipt: true,
            canAccessChequeReceipts: true,
            canAccessDigitalCard: true,
            canManageDigitalCard: true,
            // Purchase-specific permissions hardwired for administrator:
            canView: true, canCreate: true, canApproveTechnical: true, canApproveFactory: true, canApproveCEO: true,
            canManageProformas: true, canSelectProforma: true, canRegisterEntry: true, canCheckQC: true,
            canApproveFactoryFinal: true, canWarehouseFinalize: true, canCommercialFinalize: true
        };
    }

    // 2. DEFINE DEFAULTS (Base Permissions based on Role Type)
    // Start with all false
    let perms: RolePermissions = {
        canViewAll: false,
        canEditOwn: true, 
        canDeleteOwn: true,
        canCreatePaymentOrder: false, canViewPaymentOrders: false, canApproveFinancial: false, canApproveManager: false, canApproveCeo: false, canManageArchiveAttachments: false, canEditAll: false, canDeleteAll: false,
        canManageTrade: false, canManageSettings: false,
        canCreateExitPermit: false, canViewExitPermits: false, canApproveExitCeo: false, canApproveExitFactory: false, canApproveExitWarehouse: false, canApproveExitSecurity: false, canViewExitArchive: false, canEditExitArchive: false,
        canManageWarehouse: false, canViewWarehouseReports: false, canApproveBijak: false,
        canViewSecurity: false, canCreateSecurityLog: false, canApproveSecuritySupervisor: false,
        canViewNotifications: false, canCreateNotifications: false, canCreateAnnouncements: false,
        canViewCustomerBalances: false, canImportCustomerBalances: false,
        canViewSayan: false, canViewSayanTraz: false, canViewSayanSales: false, canViewSayanProduction: false, canViewSayanProdReturns: false, canViewSayanCheques: false, canViewSayanRemittances: false, canViewSayanWarehouseOverview: false, canViewSayanWarehouseWidget: false,
        canAccessSayanRegistrations: false, canSayanPreInvoices: false,
        canSayanRegisterCheque: false, canSayanEditReceipt: false, canSayanApproveAccounting: false, canSayanApproveCeo: false, canSayanFinalApprove: false, canSayanDeleteReceipt: false,
        canAccessChequeReceipts: false,
        canAccessDigitalCard: false,
        canManageDigitalCard: false
    };

    // Apply System Defaults (Hardcoded Logic)
    switch (userRole) {
        case UserRole.CEO:
            perms.canViewAll = true;
            perms.canViewPaymentOrders = true;
            perms.canApproveCeo = true;
            perms.canManageArchiveAttachments = true;
            perms.canViewExitPermits = true;
            perms.canApproveExitCeo = true;
            perms.canManageTrade = true;
            perms.canApproveBijak = true;
            perms.canViewSecurity = true;
            perms.canViewCustomerBalances = true;
            perms.canImportCustomerBalances = true;
            perms.canManageDigitalCard = true;
            break;

        case UserRole.FINANCIAL:
            perms.canCreatePaymentOrder = true;
            perms.canViewPaymentOrders = true;
            perms.canApproveFinancial = true;
            perms.canManageArchiveAttachments = true;
            perms.canViewCustomerBalances = true;
            perms.canImportCustomerBalances = true;
            break;

        case UserRole.MANAGER:
            perms.canCreatePaymentOrder = true;
            perms.canViewPaymentOrders = true;
            perms.canApproveManager = true;
            perms.canManageArchiveAttachments = true;
            perms.canViewExitPermits = true; 
            perms.canViewCustomerBalances = true;
            perms.canManageDigitalCard = true;
            break;

        case UserRole.SALES_MANAGER:
            perms.canCreatePaymentOrder = true;
            perms.canCreateExitPermit = true; // Can create exit request
            perms.canViewExitPermits = true; // Can view status
            perms.canViewCustomerBalances = true;
            break;

        case UserRole.FACTORY_MANAGER:
            perms.canViewExitPermits = true;
            perms.canApproveExitFactory = true; // CRITICAL DEFAULT
            perms.canViewSecurity = true;
            break;

        case UserRole.WAREHOUSE_KEEPER:
            perms.canViewExitPermits = true;
            perms.canApproveExitWarehouse = true; // CRITICAL DEFAULT
            perms.canManageWarehouse = true;
            perms.canManagePurchase = true;
            perms.canManageParts = true;
            perms.canCreate = true;
            perms.canCreatePurchaseRequest = true;
            perms.canApproveWarehouseKeeper = true;
            perms.canWarehouseFinalize = true;
            break;

        case UserRole.SECURITY_HEAD:
            perms.canViewExitPermits = true;
            perms.canApproveExitSecurity = true; // CRITICAL DEFAULT
            perms.canViewSecurity = true;
            perms.canApproveSecuritySupervisor = true;
            break;
            
        case UserRole.SECURITY_GUARD:
            perms.canViewSecurity = true;
            perms.canCreateSecurityLog = true;
            break;
            
        case UserRole.USER:
            perms.canCreatePaymentOrder = true;
            break;

        case UserRole.COMMERCIAL:
            perms.canManagePurchase = true;
            perms.canViewAll = true; // Needs to view requests to see and take action
            // Assign specific default purchase-flow permissions for Commercial role
            perms.canView = true;
            perms.canCommercialFinalize = true;
            perms.canManageProformas = false; // Strictly requires explicit permission in settings
            perms.canSelectProforma = false;
            break;

        case UserRole.QC:
            perms.canView = true;
            perms.canCheckQC = true;
            break;
    }

    // 3. APPLY DATABASE SETTINGS (MERGE)
    const userRoles = Array.from(new Set([
        userRole,
        ...(userObject?.roles || []),
        ...(userObject?.role ? [userObject.role] : [])
    ])).filter(Boolean) as (UserRole | string)[];

    if (settings) {
        for (const r of userRoles) {
            if (settings.rolePermissions && settings.rolePermissions[r]) {
                perms = { ...perms, ...settings.rolePermissions[r] };
            }
            if (settings.purchaseRolePermissions && settings.purchaseRolePermissions[r]) {
                perms = { ...perms, ...settings.purchaseRolePermissions[r] };
            }
        }
    }

    // --- FIX FOR CUSTOM ROLES: ENSURE NO LEAKAGE ---
    // If not a system role, force sensitive permissions off UNLESS explicitly enabled in settings
    const systemRoleIds = Object.values(UserRole);
    if (!systemRoleIds.includes(userRole as any)) {
        const hasWarehouseRole = userRoles.some(r => r === UserRole.WAREHOUSE_KEEPER || String(r).includes('warehouse') || String(r).includes('انبار'));
        if (!settings?.rolePermissions?.[userRole]?.canManageWarehouse && !hasWarehouseRole) {
            perms.canManageWarehouse = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canAccessChequeReceipts) {
            perms.canAccessChequeReceipts = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canAccessSayanRegistrations) {
            perms.canAccessSayanRegistrations = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canSayanPreInvoices) {
            perms.canSayanPreInvoices = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canSayanRegisterCheque) {
            perms.canSayanRegisterCheque = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canSayanEditReceipt) {
            perms.canSayanEditReceipt = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canSayanDeleteReceipt) {
            perms.canSayanDeleteReceipt = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canSayanApproveAccounting) {
            perms.canSayanApproveAccounting = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canSayanApproveCeo) {
            perms.canSayanApproveCeo = false;
        }
        if (!settings?.rolePermissions?.[userRole]?.canSayanFinalApprove) {
            perms.canSayanFinalApprove = false;
        }
        if (!settings?.purchaseRolePermissions?.[userRole]?.canManageProformas && !settings?.rolePermissions?.[userRole]?.canManageProformas) {
            perms.canManageProformas = false;
        }
    }

    // 4. FORCE SYSTEM DEFAULTS AGAIN (SAFETY NET)
    // Ensure critical approvals for system roles aren't accidentally disabled by empty settings
    const hasRoleConfig = settings?.rolePermissions && settings.rolePermissions[userRole];

    if (userRole === UserRole.FACTORY_MANAGER && (!hasRoleConfig || settings.rolePermissions[userRole].canApproveExitFactory === undefined)) {
        perms.canApproveExitFactory = true;
    }
    if (userRole === UserRole.WAREHOUSE_KEEPER && (!hasRoleConfig || settings.rolePermissions[userRole].canApproveExitWarehouse === undefined)) {
        perms.canApproveExitWarehouse = true;
    }
    if (userRole === UserRole.SECURITY_HEAD && (!hasRoleConfig || settings.rolePermissions[userRole].canApproveExitSecurity === undefined)) {
        perms.canApproveExitSecurity = true;
    }
    if (userRole === UserRole.CEO) {
        if (!hasRoleConfig || settings.rolePermissions[userRole].canApproveExitCeo === undefined) {
            perms.canApproveExitCeo = true;
        }
        if (!hasRoleConfig || settings.rolePermissions[userRole].canApproveCeo === undefined) {
            perms.canApproveCeo = true;
        }
    }

    // 5. USER SPECIFIC OVERRIDES
    if (userObject) {
        if (userObject.canView !== undefined) {
            perms.canView = userObject.canView;
        }
        if (userObject.canCreate !== undefined) {
            perms.canCreate = userObject.canCreate;
        }
        if (userObject.canManageTrade !== undefined) {
            perms.canManageTrade = userObject.canManageTrade;
        }
        if (userObject.canManageSales !== undefined) {
            perms.canManageSales = userObject.canManageSales;
        }
        if (userObject.canManagePurchase !== undefined) {
            perms.canManagePurchase = userObject.canManagePurchase;
            if (userObject.canManagePurchase) perms.canView = true;
        }
        if (userObject.canManageParts !== undefined) {
            perms.canManageParts = userObject.canManageParts;
        }
        if (userObject.canCreatePurchaseRequest !== undefined) {
            perms.canCreatePurchaseRequest = userObject.canCreatePurchaseRequest;
            if (userObject.canCreatePurchaseRequest) perms.canCreate = true;
        }
        if (userObject.canApproveWarehouseKeeper !== undefined) {
            perms.canApproveWarehouseKeeper = userObject.canApproveWarehouseKeeper;
        }
        if (userObject.canWarehouseFinalize !== undefined) {
            perms.canWarehouseFinalize = userObject.canWarehouseFinalize;
        }
        if (userObject.canApproveTechnical !== undefined) {
            perms.canApproveTechnical = userObject.canApproveTechnical;
        }
        if (userObject.canApproveShiftLeader !== undefined) {
            perms.canApproveShiftLeader = userObject.canApproveShiftLeader;
        }
        if (userObject.canCheckQC !== undefined) {
            perms.canCheckQC = userObject.canCheckQC;
        }
        if (userObject.canRegisterEntry !== undefined) {
            perms.canRegisterEntry = userObject.canRegisterEntry;
        }
        if (userObject.canManageZanjanPurchasing !== undefined) {
            perms.canManageZanjanPurchasing = userObject.canManageZanjanPurchasing;
        }
        if (userObject.canExecuteBuyerZanjan !== undefined) {
            perms.canExecuteBuyerZanjan = userObject.canExecuteBuyerZanjan;
        }
        if (userObject.canApproveFactoryDecision !== undefined) {
            perms.canApproveFactoryDecision = userObject.canApproveFactoryDecision;
        }
        if (userObject.canApproveFactory !== undefined) {
            perms.canApproveFactory = userObject.canApproveFactory;
        }
        if (userObject.canApproveFactoryFinal !== undefined) {
            perms.canApproveFactoryFinal = userObject.canApproveFactoryFinal;
        }
        if (userObject.canApproveCEO !== undefined) {
            perms.canApproveCEO = userObject.canApproveCEO;
        }
        if (userObject.canApproveCommercialManager !== undefined) {
            perms.canApproveCommercialManager = userObject.canApproveCommercialManager;
        }
        if (userObject.canCommercialFinalize !== undefined) {
            perms.canCommercialFinalize = userObject.canCommercialFinalize;
        }
        if (userObject.canViewPricingAndInvoices !== undefined) {
            perms.canViewPricingAndInvoices = userObject.canViewPricingAndInvoices;
        }
        if (userObject.canManageArchiveAttachments !== undefined) {
            perms.canManageArchiveAttachments = userObject.canManageArchiveAttachments;
        }
        if (userObject.canManageProformas !== undefined) {
            perms.canManageProformas = userObject.canManageProformas;
        }
        if (userObject.canSelectProforma !== undefined) {
            perms.canSelectProforma = userObject.canSelectProforma;
        }
        if (userObject.canAccessSayanRegistrations === true) {
            perms.canAccessSayanRegistrations = true;
        }
        if (userObject.canSayanPreInvoices === true) {
            perms.canSayanPreInvoices = true;
        }
        if (userObject.canSayanRegisterCheque === true) {
            perms.canSayanRegisterCheque = true;
        }
        if (userObject.canSayanEditReceipt === true) {
            perms.canSayanEditReceipt = true;
        }
        if (userObject.canSayanDeleteReceipt === true) {
            perms.canSayanDeleteReceipt = true;
        }
        if (userObject.canSayanApproveAccounting === true) {
            perms.canSayanApproveAccounting = true;
        }
        if (userObject.canSayanApproveCeo === true) {
            perms.canSayanApproveCeo = true;
        }
        if (userObject.canSayanFinalApprove === true) {
            perms.canSayanFinalApprove = true;
        }
        // Check if user is explicitly listed in settings.sayanChequeFinalApprovalUserIds
        if (settings?.sayanChequeFinalApprovalUserIds && Array.isArray(settings.sayanChequeFinalApprovalUserIds)) {
            const userId = String(userObject.id || userObject._id || '');
            const username = String(userObject.username || '');
            if (userId && settings.sayanChequeFinalApprovalUserIds.includes(userId)) {
                perms.canSayanFinalApprove = true;
            } else if (username && settings.sayanChequeFinalApprovalUserIds.includes(username)) {
                perms.canSayanFinalApprove = true;
            }
        }
        if (userObject.canAccessChequeReceipts !== undefined) {
            perms.canAccessChequeReceipts = userObject.canAccessChequeReceipts;
        }
        if (userObject.canAccessSecretariat !== undefined) {
            perms.canAccessSecretariat = userObject.canAccessSecretariat;
        }
        if (userObject.canManageSecretariatSettings !== undefined) {
            perms.canManageSecretariatSettings = userObject.canManageSecretariatSettings;
        }
    }

    // If user has permission to manage/attach files to payment archives, they inherently need view access to payments
    if (perms.canManageArchiveAttachments) {
        perms.canViewPaymentOrders = true;
    }

    return perms;
};
