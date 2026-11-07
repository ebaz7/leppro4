
export enum UserRole {
  ADMIN = 'admin',
  CEO = 'ceo',
  FINANCIAL = 'financial',
  MANAGER = 'manager',
  SALES_MANAGER = 'sales_manager',
  FACTORY_MANAGER = 'factory_manager',
  WAREHOUSE_KEEPER = 'warehouse_keeper',
  SECURITY_HEAD = 'security_head',
  SECURITY_GUARD = 'security_guard',
  USER = 'user',
  COMMERCIAL = 'commercial',
  QC = 'qc'
}

export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: UserRole | string;
  roles?: string[];
  avatar?: string;
  phoneNumber?: string;
  telegramChatId?: string;
  baleChatId?: string;
  canManageTrade?: boolean;
  canManageSales?: boolean;
  canManagePurchase?: boolean;
  canManageParts?: boolean;
  canManageArchiveAttachments?: boolean; // دسترسی به افزودن و اتچ فایل به اسناد بایگانی
  canAccessSecretariat?: boolean;
  secretariatAllowedCompanies?: string[];
  canManageSecretariatSettings?: boolean;
  receiveNotifications?: boolean;
  mobileNavOrder?: string[];
  lastSeen?: number; // New: For online status
  signatureUrl?: string; // Appended for Secretariat letter signatures
  canAccessBotReports?: boolean;
  canAccessSayanReports?: boolean;
  canAccessSayanBalances?: boolean;
  canAccessSayanPendingDocs?: boolean;
  canAccessSayanDailySales?: boolean;
  canAccessSayanCompareSales?: boolean;
  canAccessSayanRegistrations?: boolean;
  canSayanPreInvoices?: boolean;
  canSayanRegisterCheque?: boolean;
  canSayanEditReceipt?: boolean;
  canSayanApproveAccounting?: boolean;
  canSayanApproveCeo?: boolean;
  canSayanFinalApprove?: boolean;
  canSayanDeleteReceipt?: boolean;
  canAccessChequeReceipts?: boolean;
  _id?: string;
  canManageProformas?: boolean;
  canSelectProforma?: boolean;
  canApproveCommercialManager?: boolean;
  canApproveCEO?: boolean;
  canApproveFactoryDecision?: boolean;
  canApproveFactory?: boolean;
  canApproveFactoryFinal?: boolean;
  canCommercialFinalize?: boolean;
  canViewPricingAndInvoices?: boolean;
  canManageZanjanPurchasing?: boolean;
  canExecuteBuyerZanjan?: boolean;
  canCreatePurchaseRequest?: boolean;
  canView?: boolean;
  canCreate?: boolean;
  canApproveWarehouseKeeper?: boolean;
  canWarehouseFinalize?: boolean;
  canApproveTechnical?: boolean;
  canApproveShiftLeader?: boolean;
  canCheckQC?: boolean;
  canRegisterEntry?: boolean;
  scopeZanjanOnly?: boolean;
  scopeTehranOnly?: boolean;
  purchaseScope?: 'ALL' | 'TEHRAN_ONLY' | 'ZANJAN_ONLY';
  canViewSayan?: boolean;
  canViewSayanTraz?: boolean;
  canViewSayanSales?: boolean;
  canViewSayanProduction?: boolean;
  canViewSayanProdReturns?: boolean;
  canViewSayanCheques?: boolean;
  canViewSayanRemittances?: boolean;
  canViewSayanWarehouseOverview?: boolean;
  canViewSayanWarehouseWidget?: boolean;
  googleLinkedEmail?: string;
  googleLinkedAt?: number;
}

export interface WorkstationWindow {
  id: string;
  tabId: string;
  title: string;
  isMinimized: boolean;
  isFloating: boolean;
  openedAt: number;
}

export type SplitViewRatio = '50-50' | '60-40' | '40-60' | '70-30';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  url?: string;
}

export interface CompanyBank {
  id: string;
  bankName: string;
  accountNumber: string;
  sheba?: string;
  cardNumber?: string;
  formLayoutId?: string;
  internalTransferTemplateId?: string;
  enableDualPrint?: boolean;
  internalWithdrawalTemplateId?: string;
  internalDepositTemplateId?: string;
}

export interface Company {
  id: string;
  name: string;
  logo?: string;
  showInWarehouse?: boolean;
  banks?: CompanyBank[];
  letterhead?: string;
  registrationNumber?: string;
  nationalId?: string;
  address?: string;
  phone?: string;
  fax?: string;
  postalCode?: string;
  economicCode?: string;
}

export interface Contact {
  id: string;
  name: string;
  number: string;
  isGroup: boolean;
  baleId?: string;
  telegramId?: string;
}

export interface PrintField {
  id: string;
  key: string;
  label: string;
  x: number;
  y: number;
  width?: number;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  isBold?: boolean;
  letterSpacing?: number;
}

export interface PrintTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  pageSize: 'A4' | 'A5';
  orientation: 'portrait' | 'landscape';
  backgroundImage?: string;
  fields: PrintField[];
}

export interface CustomRole {
  id: string;
  label: string;
  name?: string;
}

export interface RolePermissions {
  canViewAll?: boolean;
  canEditOwn?: boolean;
  canDeleteOwn?: boolean;
  canCreatePaymentOrder?: boolean;
  canViewPaymentOrders?: boolean;
  canApproveFinancial?: boolean;
  canApproveManager?: boolean;
  canApproveCeo?: boolean;
  canManageArchiveAttachments?: boolean; // دسترسی به افزودن و اتچ فایل به بایگانی اسناد
  canEditAll?: boolean;
  canDeleteAll?: boolean;
  canManageTrade?: boolean;
  canManageTradeSettings?: boolean;
  canManageSales?: boolean;
  canManageSettings?: boolean;
  canCreateExitPermit?: boolean;
  canViewExitPermits?: boolean;
  canViewInvoices?: boolean; // NEW: Access to Invoices Cartable
  canApproveExitCeo?: boolean;
  canApproveExitFactory?: boolean;
  canApproveExitWarehouse?: boolean;
  canApproveExitSecurity?: boolean;
  canViewExitArchive?: boolean;
  canEditExitArchive?: boolean;
  canCancelExitPermit?: boolean;
  canManageWarehouse?: boolean;
  canAccessCcti?: boolean;
  canManageCctiArchive?: boolean;
  canViewWarehouseReports?: boolean;
  canApproveBijak?: boolean;
  canViewSecurity?: boolean;
  canCreateSecurityLog?: boolean;
  canApproveSecuritySupervisor?: boolean;
  canViewKnowledgeBase?: boolean;
  canManageKnowledgeBase?: boolean;
  canViewMeetings?: boolean;
  canCreateMeeting?: boolean;
  canApproveMeeting?: boolean;
  canManageMeetings?: boolean;
  canManagePurchase?: boolean;
  canManageParts?: boolean;
  canViewNotifications?: boolean;
  canCreateNotifications?: boolean;
  canCreateAnnouncements?: boolean;
  canViewCustomerBalances?: boolean;
  canImportCustomerBalances?: boolean;
  canViewSayan?: boolean;
  canViewSayanTraz?: boolean;
  canViewSayanSales?: boolean;
  canViewSayanProduction?: boolean;
  canViewSayanProdReturns?: boolean;
  canViewSayanCheques?: boolean;
  canViewSayanRemittances?: boolean;
  canViewSayanWarehouseOverview?: boolean;
  canViewSayanWarehouseWidget?: boolean;
  canAccessSayanReports?: boolean;
  canAccessSayanBalances?: boolean;
  canAccessSayanPendingDocs?: boolean;
  canAccessSayanDailySales?: boolean;
  canAccessSayanCompareSales?: boolean;
  canAccessSayanRegistrations?: boolean;
  canSayanPreInvoices?: boolean;
  canSayanRegisterCheque?: boolean;
  canSayanEditReceipt?: boolean;
  canSayanApproveAccounting?: boolean;
  canSayanApproveCeo?: boolean;
  canSayanFinalApprove?: boolean;
  canSayanDeleteReceipt?: boolean;
  canAccessSecretariat?: boolean;
  canManageSecretariatSettings?: boolean;
  canAccessChequeReceipts?: boolean;
  canAccessDigitalCard?: boolean;
  canManageDigitalCard?: boolean;
  [key: string]: boolean | undefined;
}

export interface CompanySequenceConfig {
    startTrackingNumber?: number;
    startExitPermitNumber?: number;
    startBijakNumber?: number;
    startChequeReceiptNumber?: number;
    startPoshtNomreh?: number;
}

export interface FiscalYear {
    id: string;
    label: string;
    isClosed: boolean;
    companySequences?: Record<string, CompanySequenceConfig>;
    createdAt: number;
}

export interface ExitPermitGroupConfig {
    groupId: string; // WhatsApp Group ID
    baleId?: string; // NEW: Bale Channel/Group ID
    telegramId?: string; // NEW: Telegram Chat ID
    activeStatuses: string[];
}

export interface CompanyNotificationConfig {
    salesManager?: string;
    salesManagerBale?: string;
    salesManagerTelegram?: string;
    warehouseGroup?: string;
    baleChannelId?: string; // NEW: Company specific Bale
    telegramChannelId?: string; // NEW: Company specific Telegram
}

export interface DailySecurityMeta {
    dailyDescription?: string;
    morningGuard?: { name: string; entry: string; exit: string };
    eveningGuard?: { name: string; entry: string; exit: string };
    nightGuard?: { name: string; entry: string; exit: string };
    isSupervisorDailyApproved?: boolean;
    isFactoryDailyApproved?: boolean;
    isCeoDailyApproved?: boolean;
}

export interface TicketMessage {
  id: string;
  sender: 'customer' | 'admin';
  senderName?: string;
  text: string;
  timestamp: string;
}

export interface CustomerTicket {
  id: string; // e.g. "81423"
  chatId: string | number;
  platform: string;
  customerName?: string;
  subject?: string;
  messages: TicketMessage[];
  status: 'OPEN' | 'CLOSED';
  createdAt: number;
  updatedAt: number;
}

export interface NoteTask {
  id: string;
  text: string;
  isCompleted: boolean;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  tasks?: NoteTask[];
  color?: string;
  type?: 'note' | 'list';
  reminderTime?: number;
  isPinned?: boolean;
  isPrivate?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeBaseItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnionExitBotUser {
  id: string;
  messengerId: string;
  name?: string;
  allowedCompanies: string[]; // List of company names
  allowedCommodities: string[]; // List of warehouse item IDs or names
}

export type AppSettings = SystemSettings;

export interface SystemSettings {
  salesManagerWhatsapp?: string;
  customerSurveyUrl?: string;
  customerExitTelegramBotUrl?: string; // لینک یا یوزرنیم ربات تلگرام در پیام خروج مشتری
  customerExitBaleBotUrl?: string; // لینک یا یوزرنیم ربات بله در پیام خروج مشتری
  customerExitOtherBotUrl?: string; // لینک سامانه/سایر پیام‌رسان‌ها (ایتا، روبیکا، وب) در پیام خروج مشتری
  customerExitBotInviteText?: string; // متن دعوت به ربات در پیام خروج کارخانه
  appBaseUrl?: string;
  appName?: string;
  currentTrackingNumber: number;
  currentExitPermitNumber: number;
  currentChequeReceiptNumber?: number; // شماره جاری رسید دریافت چک عمومی
  currentPoshtNomreh?: number; // شروع شماره پشت‌نمره چک سراسری
  chequeArchiveCutoffDate?: string; // تاریخ قطع نمایش چک‌های اقدام شده قدیمی
  companyNames: string[];
  companies?: Company[];
  
  // Background settings (global)
  bgMode?: string;
  bgPreset?: string;
  customBgImage?: string | null;
  customBgBlur?: number;
  customBgAdapt?: boolean;
  
  defaultCompany?: string;
  bankNames?: string[];
  operatingBankNames?: string[];
  commodityGroups: string[];
  itemCategories?: { name: string; subCategories: string[] }[]; // NEW
  rolePermissions?: Record<string, RolePermissions>;
  customRoles?: CustomRole[];
  customRoleNames?: Record<string, string>;
  savedContacts?: Contact[];
  knowledgeBaseItems?: KnowledgeBaseItem[];
  pwaIcon?: string;
  botCompanyInfo?: string; // fallback / general
  companyAddress?: string;
  companyPhone?: string;
  companyBank?: string;
  telegramBotToken?: string;
  telegramAdminId?: string;
  purchaseTelegramGroup?: string;
  baleBotToken?: string;
  autoPdfForPaymentBot?: boolean;
  paymentBotPdfAllowedUsers?: string[];
  purchaseBaleGroup?: string;
  purchaseWhatsappGroup?: string;
  smsApiKey?: string;
  smsSenderNumber?: string;
  googleCalendarId?: string;
  whatsappNumber?: string;
  whatsappProxy?: string;
  geminiApiKey?: string;
  geminiBaseUrl?: string;
  fcmServerKey?: string;
  deepseekApiKey?: string;
  botAiSource?: 'gemini' | 'deepseek' | 'hybrid';
  botAiEnabled?: boolean;
  enableAiWidget?: boolean;
  excelPriority?: boolean;
  autoPriceUpdateInterval?: number;
  supportUsername?: string;
  warehouseSequences?: Record<string, number>;
  companyNotifications?: Record<string, CompanyNotificationConfig>;
  defaultWarehouseGroup?: string; // WhatsApp Default
  exitPermitNotificationBaleId?: string; // NEW: Default Group 1 Bale
  exitPermitNotificationTelegramId?: string; // NEW: Default Group 1 Telegram
  defaultSalesManager?: string;
  insuranceCompanies?: string[];
  exitPermitNotificationGroup?: string; // Legacy field
  exitPermitFirstGroupConfig?: ExitPermitGroupConfig;
  exitPermitSecondGroupConfig?: ExitPermitGroupConfig;
  exitPermitThirdGroupConfig?: ExitPermitGroupConfig;
  sayanApiUrl?: string;
  sayanApiKey?: string;
  printTemplates?: PrintTemplate[];
  fiscalYears?: FiscalYear[];
  activeFiscalYearId?: string;
  dailySecurityMeta?: Record<string, DailySecurityMeta>;
  botAccountingGroupId?: string;
  botAccountingGroupIdTele?: string;
  botAccountingGroupIdBale?: string;
  botAccountingGroupIdWhatsApp?: string;
  botBijakGroupId?: string;
  botBijakGroupIdBale?: string;
  botBijakGroupIdWhatsApp?: string;
  botMeetingAnnouncementGroupId?: string;
  botMeetingAnnouncementTelegramId?: string;
  botMeetingAnnouncementSecondGroupIdTele?: string;
  botMeetingAnnouncementBaleId?: string;
  botMeetingAnnouncementSecondGroupIdBale?: string;
  botMeetingAnnouncementWhatsAppId?: string;
  botMeetingAnnouncementSecondGroupIdWhatsApp?: string;
  botMeetingMinutesGroupId?: string;
  botMeetingMinutesTelegramId?: string;
  botMeetingMinutesSecondGroupIdTele?: string;
  botMeetingMinutesBaleId?: string;
  botMeetingMinutesSecondGroupIdBale?: string;
  botMeetingMinutesWhatsAppId?: string;
  botMeetingMinutesSecondGroupIdWhatsApp?: string;
  botMeetingMinutesNotificationMode?: 'after_approval' | 'immediately';
  botPaymentNotificationMode?: 'after_submit' | 'after_final' | 'step_by_step';
  botDriverPaymentGroupId?: string;
  botDriverPaymentGroupIdTele?: string;
  botDriverPaymentGroupIdBale?: string;
  botDriverPaymentGroupIdWhatsApp?: string;
  botDriverPaymentAutoSendEnabled?: boolean;
  securityDriverPaymentInternalGroupId?: string;
  securityDriverPaymentInternalGroupName?: string;
  // Group 2 settings (Factory Manager / Finance approval step)
  botDriverPaymentSecondGroupIdTele?: string;
  botDriverPaymentSecondGroupIdBale?: string;
  botDriverPaymentSecondGroupIdWhatsApp?: string;
  securityDriverPaymentSecondInternalGroupId?: string;
  securityDriverPaymentSecondInternalGroupName?: string;
  disableInternalChatSharing?: boolean;
  botForceJoinChannels?: { name: string; link: string; id: string; platform?: 'telegram' | 'bale' | 'all' }[];
  botForceJoinEnabled?: boolean;
  botStoreLinks?: { title: string; url: string }[];
  unionExitBotUsers?: UnionExitBotUser[];
  
  dailyExitReportDedicatedTelegramId?: string;
  dailyExitReportDedicatedBaleId?: string;
  dailyExitReportDedicatedWhatsAppId?: string;
  dailyExitReportSendToFirstGroup?: boolean;
  dailyExitReportSendToSecondGroup?: boolean;
  dailyExitReportSendToThirdGroup?: boolean;
  dailyExitReportSendToDedicatedGroup?: boolean;
  
  dailySalesTelegramGroupId?: string;
  dailySalesBaleGroupId?: string;
  dailySalesWhatsAppGroupId?: string;
  dailySalesSendTime?: string; // e.g. "19:00"
  dailySalesSendHour?: number;
  dailySalesSendMinute?: number;
  dailySalesAutoSendEnabled?: boolean;
  
  // CHEQUES VAULT AUTOMATIC REPORT SETTINGS
  chequeVaultTelegramGroupId?: string;
  chequeVaultBaleGroupId?: string;
  chequeVaultWhatsappGroupId?: string;
  chequeVaultSendTime?: string; // e.g. "09:00" or "18:00"
  chequeVaultSendHour?: number;
  chequeVaultSendMinute?: number;
  chequeVaultAutoSendEnabled?: boolean;
  chequeVaultAttachPdf?: boolean;
  chequeVaultAttachExcel?: boolean;
  
  productionTelegramGroupId?: string;
  productionBaleGroupId?: string;
  productionWhatsappGroupId?: string;
  productionTelegramGroupId2?: string;
  productionBaleGroupId2?: string;
  productionWhatsappGroupId2?: string;
  productionCompareTelegramGroupId?: string;
  productionCompareBaleGroupId?: string;
  productionCompareWhatsappGroupId?: string;

  // WAREHOUSE & SUPPLY CHAIN OVERVIEW BOT GROUPS & AUTOMATED SCHEDULE
  warehouseTelegramGroupId?: string;
  warehouseBaleGroupId?: string;
  warehouseWhatsappGroupId?: string;
  warehouseAutoAlertEnabled?: boolean;
  warehouseDailyAutoReportEnabled?: boolean;
  warehouseDailyAutoReportTime?: string;
  warehouseDailyAutoReportPlatforms?: string[];
  warehouseDailyAutoReportScope?: 'both' | 'overview_only' | 'variance_only';
  warehouseDailyAutoReportFormat?: 'pdf_and_caption' | 'pdf_only' | 'caption_only';
  warehouseDailyInAppNotifEnabled?: boolean;
  
  salesNotificationUsers?: { username: string; platforms: string[]; name?: string }[]; // Usernames and their active platforms (telegram, bale)
  salesContactMessage?: string;
  startMeetingNumber?: number | string;
  defaultMeetingAttendees?: string[];
  defaultMeetingAttendeesData?: { username: string; role: string }[];
  meetingRoles?: string[];
  mobileNavOrder?: string[];
  
  // CRM / SALES
  salesContacts?: SalesContact[];
  birthdayGreetingTemplate?: BirthdayGreetingTemplate;
  
  // SYSTEM & PWA / WEB AUTO-UPDATER SETTINGS
  systemVersion?: string;
  systemBuildNumber?: string;
  releaseTitle?: string;
  releaseNotes?: string;
  systemUpdatePublishedAt?: number | string;

  // WINDOWS DESKTOP & TAURI AUTO-UPDATER SETTINGS
  desktopUpdateUrl?: string;
  desktopAutoCheckUpdates?: boolean;
  desktopUpdateIntervalMinutes?: number;
  desktopLastCheckTime?: string;
  desktopUpdateChannel?: 'stable' | 'beta';
  desktopDirectDownloadUrl?: string;
  androidDirectDownloadUrl?: string;
  desktopLatestVersion?: string;
  androidLatestVersion?: string;
  desktopReleaseNotes?: string;
  desktopLocalServerUrl?: string;
  desktopCloudServerUrl?: string;
  desktopLogoUrl?: string;
  desktopAppName?: string;
  
  // SAYAN ONLINE EXIT PERMITS INTEGRATION
  sayanOnlineExitPermitsEnabled?: boolean;
  sayanYearClosed?: boolean;

  // SAYAN CHEQUE WORKFLOW SETTINGS
  sayanChequeDisableCeoApproval?: boolean; // غیرفعال کردن مرحله تایید مدیرعامل
  sayanChequeEnableFinalApproval?: boolean; // فعال بودن مرحله تایید نهایی پس از ثبت
  sayanChequeFinalApprovalUserIds?: string[]; // شناسه‌های کاربرانی که دسترسی تایید نهایی و ثبت در سایان دارند
  sayanChequeDirectRegisterOnSubmit?: boolean; // ثبت مستقیم در سایان بلافاصله پس از تایید حسابداری / مرحله قبل

  // MINI APPS
  miniAppCarPriceUrl?: string;
  miniAppCarEstimatorUrl?: string;
  miniAppMobilePriceUrl?: string;
  purchaseRolePermissions?: Record<string, PurchaseRolePermissions>;
  
  // PURCHASE WORKFLOW - TEHRAN & ZANJAN APPROVERS & ACCESS SETTINGS
  purchaseTehranAllowedUserIds?: string[]; // کاربران مجاز شعبه بازرگانی تهران
  purchaseTehranCeoApproverUserIds?: string[]; // افراد خاص تایید مدیرعامل تهران (مجوز استعلام و تایید نهایی)
  purchaseTehranCommercialApproverUserIds?: string[]; // افراد خاص تایید مدیر بازرگانی تهران (بررسی و تایید پیش‌فاکتورها)
  purchaseTehranProformaUserIds?: string[]; // افراد خاص ثبت پیش‌فاکتورهای بازرگانی تهران
  purchaseTehranSelectionUserIds?: string[]; // افراد خاص انتخاب گزینه نهایی خرید تهران
  purchaseTehranFinalUserIds?: string[]; // افراد خاص تایید نهایی و بایگانی بازرگانی تهران

  purchaseZanjanAllowedUserIds?: string[]; // کاربران مجاز خرید کارخانه زنجان
  purchaseZanjanDecisionApproverUserIds?: string[]; // افراد خاص تعیین مسیر خرید محلی کارخانه زنجان
  purchaseZanjanPurchasingUserIds?: string[]; // افراد خاص استعلام و پیشنهاد خرید محلی کارخانه زنجان
  purchaseZanjanManagerApproverUserIds?: string[]; // افراد خاص تایید و صدور دستور خرید مدیر کارخانه زنجان
  purchaseZanjanBuyerUserIds?: string[]; // افراد خاص اجرای خرید و تسویه فاکتور کارپرداز زنجان
  purchaseZanjanFinalApproverUserIds?: string[]; // افراد خاص تایید نهایی مدیر کارخانه زنجان

  // INITIAL FACTORY WORKFLOW APPROVERS
  purchaseLineSupervisorApproverUserIds?: string[]; // افراد خاص تایید سرپرست خط
  purchaseTechnicalApproverUserIds?: string[]; // افراد خاص بررسی و تایید فنی نت
  purchaseWarehouseApproverUserIds?: string[]; // افراد خاص بررسی موجودی انبار (انباردار قطعات / کارخانه)

  prodReturnsTelegramGroupId?: string;
  prodReturnsBaleGroupId?: string;
  prodReturnsWhatsappGroupId?: string;
}

export interface PurchaseRolePermissions {
  canView?: boolean;
  canCreate?: boolean;
  canApproveTechnical?: boolean;
  canApproveShiftLeader?: boolean;
  canApproveWarehouseKeeper?: boolean;
  canApproveFactoryDecision?: boolean;
  canApproveFactory?: boolean;
  canApproveCEO?: boolean;
  canApproveCommercialManager?: boolean;
  canManageProformas?: boolean;
  canSelectProforma?: boolean;
  canRegisterEntry?: boolean;
  canCheckQC?: boolean;
  canApproveFactoryFinal?: boolean;
  canWarehouseFinalize?: boolean;
  canCommercialFinalize?: boolean;
  canManageParts?: boolean;
  canViewPricingAndInvoices?: boolean; // دسترسی به دیدن فی، مبالغ ریالی و پیش‌فاکتورها/فاکتورها
  canManageZanjanPurchasing?: boolean; // ثبت استعلام و فاکتور خرید محلی کارخانه (زنجان)
  canExecuteBuyerZanjan?: boolean; // ثبت و خرید نهایی توسط کارپرداز زنجان (کارخانه)
  scopeZanjanOnly?: boolean; // محدودیت مشاهده: فقط خریدهای محلی کارخانه (زنجان)
  scopeTehranOnly?: boolean; // محدودیت مشاهده: فقط خریدهای بازرگانی تهران
}

export interface BirthdayGreetingTemplate {
    text: string;
    isActive: boolean;
}

export interface SalesContact {
    id: string;
    name: string;
    mobile: string;
    telegramId?: string;
    baleId?: string;
    birthday?: string; // Gregorian YYYY-MM-DD
    sendBirthdayGreeting: boolean;
    accountCode?: string;
    sayanPersonCode?: string;
    sayanTafsiliCode?: string;
    sayanPersonName?: string;
    sayanMobile?: string;
    autoNotifyOnExit?: boolean;
}


export enum PaymentMethod {
  TRANSFER = 'حواله بانکی',
  CHEQUE = 'چک',
  CASH = 'نقد',
  POS = 'کارتخوان',
  SHEBA = 'شبا',
  SATNA = 'ساتنا',
  PAYA = 'پایا',
  INTERNAL_TRANSFER = 'حواله داخلی'
}

export interface PaymentDetail {
  id: string;
  method: PaymentMethod;
  amount: number;
  chequeNumber?: string;
  bankName?: string;
  description?: string;
  chequeDate?: string;
  sheba?: string;
  recipientBank?: string;
  paymentId?: string;
  destinationAccount?: string;
  destinationOwner?: string;
  destinationBranch?: string;
}

export enum OrderStatus {
  PENDING = 'در انتظار بررسی مالی',
  APPROVED_FINANCE = 'تایید مالی / در انتظار مدیریت',
  APPROVED_MANAGER = 'تایید مدیریت / در انتظار مدیرعامل',
  APPROVED_CEO = 'تایید نهایی',
  PAID = 'پرداخت شده',
  REJECTED = 'رد شده',
  REVOCATION_PENDING_FINANCE = 'درخواست ابطال (مالی)',
  REVOCATION_PENDING_MANAGER = 'تایید ابطال (مدیریت)',
  REVOCATION_PENDING_CEO = 'تایید ابطال (مدیرعامل)',
  REVOKED = 'باطل شده'
}

export interface PaymentOrderAttachment {
  id?: string;
  fileName: string;
  name?: string;
  data?: string;
  url?: string;
  type?: string;
  size?: number;
  uploadedAt?: number;
  uploadedBy?: string;
}

export interface PaymentOrder {
  id: string;
  trackingNumber: number;
  date: string;
  payee: string;
  totalAmount: number;
  description: string;
  status: OrderStatus;
  requester: string;
  createdAt: number;
  updatedAt?: number;
  paymentDetails: PaymentDetail[];
  attachments?: PaymentOrderAttachment[];
  archiveAttachments?: PaymentOrderAttachment[];
  payingCompany?: string;
  paymentPlace?: string;
  approverFinancial?: string;
  approverManager?: string;
  approverCeo?: string;
  rejectionReason?: string;
  rejectedBy?: string;
  payDate?: string;
  fiscalYearId?: string;
  isEdit?: boolean;
}

export enum ExitPermitStatus {
  PENDING_CEO = 'در انتظار تایید مدیرعامل',
  PENDING_FACTORY = 'در انتظار مدیر کارخانه',
  PENDING_WAREHOUSE = 'در انتظار تایید انبار',
  PENDING_SECURITY = 'در انتظار خروج (انتظامات)',
  PENDING_FACTORY_FINAL = 'در انتظار تایید نهایی مدیر کارخانه',
  EXITED = 'خارج شده (بایگانی)',
  REJECTED = 'رد شده',
  CANCELED = 'کنسل شده'
}

export interface ExitPermitItem {
  id: string;
  goodsName: string;
  cartonCount: number;
  weight: number;
  deliveredCartonCount?: number;
  deliveredWeight?: number;
  price?: number;
  bobbinCount?: number;
  grossWeight?: number;
  grade?: string;
  twistDirection?: string;
  itemCode?: string;
  description?: string;
}

export interface ExitPermitDestination {
  id: string;
  recipientName: string;
  address: string;
  phone: string;
  sayanPersonCode?: string;
  sayanTafsiliCode?: string;
}

export interface ExitPermit {
  id: string;
  permitNumber: number;
  date: string;
  company?: string;
  requester: string;
  items: ExitPermitItem[];
  destinations: ExitPermitDestination[];
  goodsName?: string;
  recipientName?: string;
  cartonCount?: number;
  weight?: number;
  destinationAddress?: string;
  plateNumber?: string;
  driverName?: string;
  driverPhone?: string;
  description?: string;
  status: ExitPermitStatus;
  attachments?: { fileName: string, data: string }[];
  createdAt: number;
  updatedAt?: number;
  approverCeo?: string;
  approverFactory?: string;
  approverWarehouse?: string;
  approverSecurity?: string;
  approverFactoryFinal?: string;
  exitTime?: string;
  rejectionReason?: string;
  rejectedBy?: string;
  isEdit?: boolean;
  price?: number;
  sayanPersonCode?: string;
  sayanTafsiliCode?: string;
  sayanRemittanceNumber?: string;
  sayanSubCode?: string;
  sayanArchiveCode?: string;
  sayanSyncedAt?: number;
  sayanRemittanceDoc?: any;
  sayanRemittanceDocs?: any[];
  customerSurvey?: {
    sentAt?: number;
    submittedAt?: number;
    qualityRating?: number; // 1 to 5
    deliveryRating?: number; // 1 to 5
    supportRating?: number; // 1 to 5
    comment?: string;
  };
}

export interface WarehouseItem {
  id: string;
  name: string;
  code?: string;
  unit: string;
  containerCapacity?: number;
}

export interface WarehouseTransactionItem {
  itemId: string;
  itemName: string;
  quantity: number;
  weight: number;
  unitPrice?: number;
}

export interface WarehouseTransaction {
  id: string;
  type: 'IN' | 'OUT';
  date: string;
  time?: string;
  company: string;
  number: number;
  items: WarehouseTransactionItem[];
  createdAt: number;
  createdBy: string;
  proformaNumber?: string;
  recipientName?: string;
  driverName?: string;
  plateNumber?: string;
  destination?: string;
  description?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  rejectionReason?: string;
  rejectedBy?: string;
  updatedAt?: number;
  isEdit?: boolean;
  transferId?: string;
  isTransfer?: boolean;
  adjustmentId?: string;
  isAdjustment?: boolean;
}

export enum SecurityStatus {
    PENDING_SUPERVISOR = 'در انتظار تایید سرپرست',
    PENDING_FACTORY = 'در انتظار تایید مدیر کارخانه',
    PENDING_CEO = 'در انتظار تایید مدیرعامل',
    ARCHIVED = 'بایگانی شده',
    REJECTED = 'رد شده'
}

export interface SecurityGoodsItem {
    name: string;
    quantity: string;
    unit?: string;
}

export interface SecurityLog {
    id: string;
    rowNumber: number;
    date: string;
    shift: string;
    origin: string;
    entryTime: string;
    exitTime: string;
    driverName: string;
    driverPhone?: string;
    plateNumber: string;
    goodsName: string;
    quantity: string;
    goodsItems?: SecurityGoodsItem[];
    destination: string;
    receiver: string;
    workDescription: string;
    permitProvider: string;
    registrant: string;
    status: SecurityStatus;
    createdAt: number;
    approverSupervisor?: string;
    approverFactory?: string;
    approverCeo?: string;
    attachment?: string;
    rejectionReason?: string;
    hasDriverPayment?: boolean;
}

export interface DriverPayment {
    id: string;
    date: string;
    driverName: string;
    driverPhone?: string;
    plateNumber: string;
    amount?: string;
    paymentType?: string;
    cardNumber?: string;
    shebaNumber?: string;
    accountNumber?: string;
    bankName?: string;
    accountHolder?: string;
    origin?: string;
    destination?: string;
    goodsName?: string;
    quantity?: string;
    permitProvider?: string;
    registrant: string;
    createdAt: number;
    description?: string;
    attachments?: { fileName: string; url: string }[];
    status?: string;
    supervisorApproved?: boolean;
    supervisorApproverName?: string;
    supervisorApprovedAt?: number;
    supervisorComment?: string;
    factoryApproved?: boolean;
    factoryApproverName?: string;
    factoryApprovedAt?: number;
    factoryComment?: string;
    rejectionReason?: string;
    rejectedBy?: string;
    rejectedAt?: number;
    sentToGroup1At?: number;
    sentToGroup2At?: number;
}

export interface PersonnelDelay {
    id: string;
    date: string;
    personnelName: string;
    unit: string;
    arrivalTime: string;
    delayAmount: string;
    repeatCount: string;
    instruction: string;
    managementInstruction?: string;
    registrant: string;
    status: SecurityStatus;
    createdAt: number;
    approverSupervisor?: string;
    approverFactory?: string;
    approverCeo?: string;
    rejectionReason?: string;
}

export interface PersonnelOvertime {
    id: string;
    date: string;
    personnelName: string;
    unit: string;
    startTime: string;
    endTime: string;
    duration: string;
    reason?: string;
    registrant: string;
    status: SecurityStatus;
    createdAt: number;
    approverSupervisor?: string;
    approverFactory?: string;
    approverCeo?: string;
    managementInstruction?: string;
    rejectionReason?: string;
}

export interface SecurityIncident {
    id: string;
    reportNumber: string;
    date: string;
    subject: string;
    description: string;
    shift: string;
    witnesses: string;
    registrant: string;
    status: SecurityStatus;
    createdAt: number;
    approverSupervisor?: string;
    approverFactory?: string;
    approverCeo?: string;
    shiftManagerOpinion?: string;
    hrAction?: string;
    safetyAction?: string;
    rejectionReason?: string;
}

export interface ChatMessage {
    id: string;
    sender: string;
    senderUsername: string;
    role: string;
    message: string;
    timestamp: number;
    recipient?: string;
    groupId?: string;
    attachment?: { fileName: string, url: string };
    audioUrl?: string;
    audioDuration?: number;
    replyTo?: { id: string, sender: string, message: string };
    isEdited?: boolean;
    isForwarded?: boolean;
    forwardFrom?: string;
    readBy?: string[]; // Array of usernames who read it
    isDeleted?: boolean; // Logical delete
    isPending?: boolean;
    uploadProgress?: number;
    reactions?: Record<string, string[]>; // e.g. { "👍": ["admin", "reza"], "❤️": ["ali"] }
    sticker?: {
        packId: string;
        stickerId: string;
        url?: string;
        emoji?: string;
        name?: string;
        preview?: string;
    };
}

export interface ChatGroup {
    id: string;
    name: string;
    members: string[];
    createdBy: string;
    admins?: string[];
    avatar?: string | null;
    description?: string;
    createdAt?: number;
    isTaskGroup?: boolean;
}

export interface TaskGroup {
    id: string;
    name: string;
    members: string[];
    createdBy: string;
    createdAt: number;
    isTaskGroup?: boolean;
    avatar?: string | null;
    description?: string;
}

export interface SystemAnnouncement {
    id: string;
    message: string;
    createdBy: string;
    createdAt: number;
    targetUsers?: string[]; // Empty means all users
    isCompleted?: boolean;
    completedAt?: number;
    completedBy?: string;
    type?: 'task' | 'general';
}

export interface TaskReply {
    id: string;
    sender: string;
    senderUsername: string;
    message: string;
    timestamp: number;
}

export interface GroupTask {
    id: string;
    groupId: string;
    title: string;
    description?: string;
    assignee?: string;
    assignedTo?: string[];
    dueDate?: string;
    isCompleted?: boolean;
    status: 'pending' | 'completed';
    createdBy: string;
    createdAt: number;
    completedBy?: string;
    completedAt?: number;
    replies?: TaskReply[];
    recurringReminder?: boolean;
    reminderIntervalMinutes?: number;
    lastRemindedAt?: number;
}

export enum TradeStage {
    LICENSES = 'مجوزها و پروفرما',
    INSURANCE = 'بیمه',
    ALLOCATION_QUEUE = 'در صف تخصیص ارز',
    ALLOCATION_APPROVED = 'تخصیص یافته',
    CURRENCY_PURCHASE = 'خرید ارز',
    SHIPPING_DOCS = 'اسناد حمل',
    INSPECTION = 'گواهی بازرسی',
    CLEARANCE_DOCS = 'ترخیصیه و قبض انبار',
    GREEN_LEAF = 'برگ سبز',
    INTERNAL_SHIPPING = 'حمل داخلی',
    AGENT_FEES = 'هزینه‌های ترخیص'
}

export interface TradeStageData {
    stage: TradeStage;
    isCompleted: boolean;
    description: string;
    costRial: number;
    costCurrency: number;
    currencyType: string;
    attachments: { fileName: string, url: string }[];
    updatedAt: number;
    updatedBy: string;
    queueDate?: string;
    allocationDate?: string;
    allocationCode?: string;
    allocationExpiry?: string;
    payments?: any[];
}

export interface CurrencyDelivery {
    id: string;
    amount: number;
    date: string;
    recipientName?: string;
    description?: string;
}

export interface CurrencyTranche {
    id: string;
    amount: number;
    currencyType: string;
    date: string;
    exchangeName?: string;
    brokerName?: string;
    rate?: number;
    rialAmount?: number;
    currencyFee?: number;
    isDelivered?: boolean;
    deliveryDate?: string;
    returnAmount?: number;
    returnDate?: string;
    receivedAmount?: number;
    deliveries?: CurrencyDelivery[];
}

export interface GuaranteeCheque {
    amount: number;
    bank: string;
    chequeNumber: string;
    dueDate: string;
    isDelivered?: boolean;
}

export interface CurrencyPurchaseData {
    payments: any[];
    purchasedAmount: number;
    purchasedCurrencyType: string;
    tranches?: CurrencyTranche[];
    isDelivered?: boolean;
    deliveredAmount?: number;
    remittedAmount?: number;
    guaranteeCheque?: GuaranteeCheque;
    guaranteeCheques?: GuaranteeCheque[];
    purchaseDate?: string;
    brokerName?: string;
    exchangeName?: string;
    deliveryDate?: string;
    recipientName?: string;
    deliveredCurrencyType?: string;
    allocationDate?: string;
    queueEntryDate?: string;
    allocationExpiryDate?: string;
    allocationCode?: string;
}

export interface InsuranceEndorsement {
    id: string;
    date: string;
    amount: number;
    description: string;
}

export interface TradeItem {
    id: string;
    name: string;
    hsCode?: string;
    weight: number; // وزن خالص (Net Weight)
    grossWeight?: number; // وزن ناخالص (Gross Weight)
    unitPrice: number;
    totalPrice: number;
}

export type ShippingDocType = 'Commercial Invoice' | 'Packing List' | 'Bill of Lading' | 'Certificate of Origin';
export type DocStatus = 'Draft' | 'Final';

export interface InvoiceItem {
    id: string;
    name: string;
    weight: number; // وزن خالص (Net Weight)
    grossWeight?: number; // وزن ناخالص (Gross Weight)
    unitPrice: number;
    totalPrice: number;
    part: string;
}

export interface PackingItem {
    id: string;
    description: string;
    netWeight: number;
    grossWeight: number;
    packageCount: number;
    part: string;
}

export interface ShippingDocument {
    id: string;
    type: ShippingDocType;
    status: DocStatus;
    documentNumber: string;
    documentDate: string;
    attachments: { fileName: string, url: string }[];
    createdAt: number;
    createdBy: string;
    invoiceItems?: InvoiceItem[];
    packingItems?: PackingItem[];
    freightCost?: number;
    currency?: string;
    netWeight?: number;
    grossWeight?: number;
    packagesCount?: number;
    vesselName?: string;
    portOfLoading?: string;
    portOfDischarge?: string;
    description?: string;
    shippingCompany?: string;
    cartonCount?: number;
    containerCount?: number;
}

export interface InspectionCertificate {
    id: string;
    part: string;
    company: string;
    certificateNumber: string;
    amount: number;
    description?: string;
}

export interface InspectionPayment {
    id: string;
    part: string;
    amount: number;
    date: string;
    bank: string;
    description?: string;
}

export interface InspectionData {
    certificates: InspectionCertificate[];
    payments: InspectionPayment[];
    totalInvoiceAmount?: number;
    certificateNumber?: string;
    inspectionCompany?: string;
}

// Added missing trade-related interfaces
export interface TradeTransaction {
    id: string;
    date: string;
    amount: number;
    bank: string;
    description: string;
}

export interface WarehouseReceipt {
    id: string;
    number: string;
    part: string;
    issueDate: string;
}

export interface ClearancePayment {
    id: string;
    amount: number;
    part: string;
    bank: string;
    date: string;
    payingBank?: string;
}

export interface ClearanceData {
    receipts: WarehouseReceipt[];
    payments: ClearancePayment[];
}

export interface GreenLeafCustomsDuty {
    id: string;
    cottageNumber: string;
    part: string;
    amount: number;
    paymentMethod: 'Bank' | 'Guarantee';
    bank?: string;
    date?: string;
}

export interface GreenLeafGuarantee {
    id: string;
    relatedDutyId: string;
    guaranteeNumber: string;
    sepamNumber?: string;
    chequeNumber?: string;
    chequeBank?: string;
    chequeDate?: string;
    chequeAmount?: number;
    isDelivered: boolean;
    cashAmount?: number;
    cashBank?: string;
    cashDate?: string;
    dueDate?: string;
    part?: string;
    guaranteeBank?: string;
    guaranteeType?: 'cheque' | 'credit';
    guaranteeAmount?: number;
    dutyCashAmount?: number;
}

export interface GreenLeafTax {
    id: string;
    amount: number;
    part: string;
    bank: string;
    date: string;
    }

export interface GreenLeafRoadToll {
    id: string;
    amount: number;
    part: string;
    bank: string;
    date: string;
}

export interface GreenLeafData {
    duties: GreenLeafCustomsDuty[];
    guarantees: GreenLeafGuarantee[];
    taxes: GreenLeafTax[];
    roadTolls: GreenLeafRoadToll[];
}

export interface ShippingPayment {
    id: string;
    part: string;
    amount: number;
    date: string;
    bank: string;
    description: string;
}

export interface InternalShippingData {
    payments: ShippingPayment[];
}

export interface AgentPayment {
    id: string;
    agentName: string;
    amount: number;
    bank: string;
    date: string;
    part: string;
    description: string;
}

export interface AgentData {
    payments: AgentPayment[];
}

export interface TradeComment {
    id: string;
    text: string;
    createdAt: number;
    createdBy: string;
    creatorName?: string;
    role?: string;
}

export interface ProformaHistoryEntry {
    id: string;
    items: TradeItem[];
    freightCost: number;
    updatedAt: number;
    updatedBy: string;
    description?: string;
    proformaNumber?: string;
    orderNumber?: string;
    fileNumber?: string;
    registrationNumber?: string;
    registrationDate?: string;
    goodsName?: string;
    commodityGroup?: string;
    sellerName?: string;
    company?: string;
    mainCurrency?: string;
    operatingBank?: string;
    startDate?: string;
    sourceRecordId?: string;
    attachments?: Array<{ fileName: string; url: string; data?: string }>;
    recordSnapshot?: any;
}

export interface TradeAttachment {
    id: string;
    fileName: string;
    url: string; // File URL path in /uploads/commercial/...
    fileSize?: number;
    fileType?: string;
    category: string; // 'general' | 'timeline' | 'proforma' | 'insurance' | 'allocation' | 'currency' | 'shipping' | 'inspection' | 'clearance' | 'green_leaf' | 'internal_shipping' | 'agent_fees' | 'petrochemical'
    subCategory?: string;
    refId?: string;
    uploadedAt: number;
    uploadedBy: string;
    description?: string;
}

export interface TradeRecord {
    id: string;
    fileNumber: string; // شماره پرونده
    proformaNumber?: string; // شماره پروفرم / پروفرما
    orderNumber?: string; // شماره سفارش
    goodsName: string;
    sellerName: string;
    commodityGroup: string;
    mainCurrency: string;
    company: string;
    items: TradeItem[];
    freightCost: number;
    status: 'Active' | 'Completed';
    isArchived?: boolean;
    isInTransit?: boolean;
    isInCustoms?: boolean;
    stages: Record<string, TradeStageData>;
    startDate: string;
    createdAt: number;
    createdBy: string;
    registrationNumber?: string;
    registrationDate?: string;
    registrationExpiry?: string;
    currencyAllocationType?: string;
    allocationCurrencyRank?: 'Type1' | 'Type2';
    operatingBank?: string;
    isPriority?: boolean;
    licenseData?: { transactions: TradeTransaction[] };
    insuranceData?: {
        policyNumber: string;
        company: string;
        agencyName?: string; // نام نمایندگی بیمه
        agencyCode?: string; // کد نمایندگی بیمه
        cost: number;
        bank: string;
        endorsements: InsuranceEndorsement[];
        isPaid: boolean;
        paymentDate: string;
        attachments?: TradeAttachment[];
    };
    comments?: TradeComment[];
    currencyPurchaseData?: CurrencyPurchaseData;
    shippingDocuments?: ShippingDocument[];
    inspectionData?: InspectionData;
    clearanceData?: ClearanceData;
    greenLeafData?: GreenLeafData;
    internalShippingData?: InternalShippingData;
    agentData?: AgentData;
    isCommitmentFulfilled?: boolean;
    exchangeRate?: number;
    transferredFrom?: {
        fileNumber: string;
        goodsName: string;
        commodityGroup: string;
        recordId?: string;
        proformaNumber?: string;
        registrationNumber?: string;
        sellerName?: string;
        mainCurrency?: string;
    };
    transferredTo?: {
        fileNumber: string;
        goodsName: string;
        commodityGroup: string;
        recordId?: string;
        proformaNumber?: string;
        registrationNumber?: string;
    };
    proformaHistory?: ProformaHistoryEntry[];
    attachments?: TradeAttachment[];
    purchaseType?: 'import' | 'domestic_bourse'; // نوع خرید: وارداتی ارزی یا خرید داخلی پتروشیمی / بورس کالا
    petrochemicalData?: PetrochemicalPurchaseData; // مشخصات و مراحل خرید داخلی پتروشیمی و بورس کالا
}

export interface PetrochemicalPurchaseData {
    petrochemicalName: string; // نام پتروشیمی (تندگویان، شازند، اروند، تبریز، جم، امیرکبیر و...)
    brokerName?: string; // کارگزاری بورس کالا (کاریزما، آگاه، مفید، مبین سرمایه، صبا جهاد و...)
    contractNumber?: string; // شماره قرارداد / اطلاعیه خرید بورس کالا / شناسه معامله
    offeringCode?: string; // کد عرضه بورس کالا
    proformaNumber?: string; // شماره پیش‌فاکتور داخلی پتروشیمی
    proformaDate?: string; // تاریخ پیش‌فاکتور
    paymentMethod: 'cash' | 'internal_lc' | 'draft_barat' | 'bourse_salaf'; // روش تسویه: نقدی / ال‌سی داخلی / برات الکترونیک / سلف
    gradeName?: string; // گرید کالایی پتروشیمی (مثلاً چیپس پلی استر نساجی TG642، چیپس بطری BG821...)
    quantityKg: number; // وزن / تناژ به کیلوگرم
    basePricePerKg: number; // قیمت پایه یا معامله شده هر کیلوگرم (ریال)
    competitionPercent?: number; // درصد رقابت بورس کالا (%)
    totalGoodsPrice: number; // مبلغ خالص کالا (ریال)
    vatAmount: number; // مالیات بر ارزش افزوده (۱۰٪ یا مقدار معین)
    brokerageFee: number; // کارمزد کارگزاری و بورس
    otherFees?: number; // سایر هزینه‌ها و عوارض
    totalInvoiceAmount: number; // مبلغ کل پیش‌فاکتور و فاکتور نهایی (ریال)
    bourseSettlementDeadline?: string; // مهلت تسویه در بورس کالا
    
    // مشخصات تسویه نقدی بورس
    cashSettlement?: {
        isSettled: boolean;
        settlementDate?: string;
        payments: Array<{
            id: string;
            trackingNumber: string;
            bankName: string;
            destinationAccount?: string;
            amount: number;
            paymentDate: string;
            receiptUrl?: string;
            description?: string;
        }>;
    };

    // مشخصات اعتبار اسنادی داخلی ریالی (LC)
    internalLc?: {
        lcNumber: string; // شماره اعتبار اسنادی
        issuingBank: string; // بانک گشایش‌کننده
        branch: string; // شعبه
        branchCode?: string; // کد شعبه
        lcType?: 'sight' | 'usance'; // نوع LC: دیداری یا مدت‌دار/یوزانس
        usanceDays?: number; // مدت یوزانس (مثلاً ۳۰، ۶۰، ۹۰، ۱۸۰ روز)
        issueDate: string; // تاریخ گشایش
        dueDate: string; // تاریخ سررسید پرداخت
        expiryDate?: string; // تاریخ انقضای اعتبار
        latestShipmentDate?: string; // آخرین مهلت بارگیری
        lcAmount: number; // مبلغ اعتبار (ریال)
        prepaymentAmount?: number; // پیش‌پرداخت / سپرده نقدی
        prepaymentPercent?: number; // درصد پیش‌پرداخت
        collateralDesc?: string; // وثایق تودیع شده
        commissionFee?: number; // کارمزد گشایش
        extensionFee?: number; // کارمزد تمدید یا اصلاحیه
        taxStampFee?: number; // هزینه تمبر مالیاتی
        notificationNumber?: string; // شماره ابلاغیه اعتبار به پتروشیمی
        notificationDate?: string; // تاریخ ابلاغیه
        settlementDate?: string; // تاریخ تسویه نهایی
        status: 'draft' | 'opened' | 'notified' | 'negotiated' | 'settled'; // وضعیت LC
    };

    // مشخصات برات / برات الکترونیکی ریالی (Draft / Barat via SEPAM)
    draftBarat?: {
        baratNumber: string; // شماره برات
        sepamCode?: string; // شناسه سپام / برات الکترونیک (۱۶ رقمی)
        bankName: string; // بانک عامل
        branchName?: string; // نام و کد شعبه
        issueDate: string; // تاریخ صدور
        dueDate: string; // تاریخ سررسید
        tenorDays?: number; // مدت برات (روز)
        amount: number; // مبلغ اصل برات (ریال)
        interestRatePercent?: number; // نرخ کارمزد یا سود اعتباری (%)
        interestAmount?: number; // مبلغ کارمزد اعتباری (ریال)
        sepamFee?: number; // کارمزد صدور سامانه سپام
        collateralDesc?: string; // وثایق و تضامین تودیعی
        drawerName: string; // برات‌کش / متعهد (شرکت خریدار)
        draweeName: string; // برات‌گیر (بانک/پتروشیمی)
        beneficiaryName?: string; // ذینفع (شرکت پتروشیمی)
        settlementDate?: string; // تاریخ تسویه در سررسید
        status: 'draft' | 'issued' | 'bank_accepted' | 'beneficiary_accepted' | 'settled'; // وضعیت برات
    };

    // اعلامیه بارگیری و حواله فروش پتروشیمی
    loadingNotice?: {
        remittanceNumber?: string; // شماره حواله فروش پتروشیمی
        remittanceDate?: string; // تاریخ حواله پتروشیمی
        behenyabCode?: string; // کد سهمیه بهین‌یاب
        loadingTerminal?: string; // پایانه / مخزن بارگیری پتروشیمی
        loadingDeadline?: string; // مهلت بارگیری
        transportCompany?: string; // شرکت حمل و نقل / باربری
        driverName?: string; // نام راننده
        driverPhone?: string; // شماره تماس راننده
        driverNationalCode?: string; // کد ملی راننده
        truckPlate?: string; // پلاک کامیون
        waybillNumber?: string; // شماره بارنامه تمبردار
        freightCostRial?: number; // کل کرایه حمل توافق شده
        prepaidFreight?: number; // پیش‌کرایه پرداختی
        remainingFreight?: number; // پس‌کرایه انبار
        weighbridgeCostOrigin?: number; // هزینه باسکول مبدا
        cargoInsuranceCost?: number; // بیمه باربری
        loadingDate?: string; // تاریخ بارگیری
        deliveryStatus: 'pending_loading' | 'loaded' | 'dispatched' | 'delivered_warehouse'; // وضعیت بارگیری و تحویل
    };

    // رسید انبار تحویل کارخانه و باسکول
    warehouseReceipt?: {
        receiptNumber?: string; // شماره رسید انبار
        weighbridgeSlipNumber?: string; // شماره قبض باسکول
        grossWeightKg?: number; // وزن ناخالص (پر) باسکول کارخانه
        tareWeightKg?: number; // وزن تار (خالی) کامیون
        receivedWeightKg?: number; // وزن خالص باسکول کارخانه (KG)
        weighbridgeVarianceKg?: number; // اختلاف وزن باسکول با فاکتور پتروشیمی
        variancePercent?: number; // درصد اختلاف
        varianceAction?: 'acceptable_tolerance' | 'deduct_from_driver' | 'claim_petrochemical'; // نحوه برخورد با کسری بار
        receiptDate?: string; // تاریخ تحویل به انبار
        warehouseName?: string; // انبار مقصد
        receiverName?: string; // نام انباردار تحویل‌گیرنده
        qcBatchNumber?: string; // شماره بچ/پارت کیفی
        qcStatus?: 'pending' | 'approved' | 'conditional' | 'rejected'; // وضعیت کنترل کیفی
        qcMfi?: string; // شاخص MFI
        qcIv?: string; // ویسکوزیته ذاتی IV
        qcMoisture?: string; // رطوبت %
        qcNotes?: string; // توضیحات کیفی
        isConfirmed?: boolean; // تایید ورود به انبار
    };

    // سایر هزینه‌های جانبی
    otherCosts?: Array<{
        id: string;
        title: string;
        amount: number;
        description?: string;
    }>;

    overallStatus?: 'draft' | 'bourse_awarded' | 'settling' | 'loading' | 'weighed' | 'finalized';
}

export enum MeetingStatus {
    DRAFT = 'پیش‌نویس',
    PENDING_APPROVAL = 'در انتظار تایید',
    PENDING_CEO = 'در انتظار تایید مدیرعامل',
    APPROVED = 'تایید شده',
    REJECTED = 'رد شده'
}

export interface MeetingAttendee {
    userId?: string;
    username?: string;
    fullName: string;
    role: string;
    isPresent: boolean;
    isAbsenceAuthorized?: boolean;
}

export interface MeetingItem {
    id: string;
    description: string;
    responsiblePerson: string;
    duration: string;
}

export interface MeetingComment {
    id: string;
    username: string;
    fullName: string;
    text: string;
    timestamp: number;
}

export interface MeetingMinutes {
    id: string;
    meetingNumber: string;
    date: string;
    time: string;
    location: string;
    chairman: string;
    secretary: string;
    attendees: MeetingAttendee[];
    guestAttendees?: string[];
    absentees: string[];
    items: MeetingItem[];
    status: MeetingStatus;
    createdAt: number;
    updatedAt: number;
    createdBy: string;
    announcementSent?: boolean;
    minutesSent?: boolean;
    approvals?: Record<string, { approved: boolean, date: number, comment?: string }>;
    comments?: MeetingComment[];
    imageAttachments?: { fileName: string, url: string }[];
    pdfAttachments?: { fileName: string, url: string }[];
}

export enum PurchaseRequestStatus {
    PENDING_REPAIR_INSPECTION = 'در انتظار بررسی واحد نت/تعمیرات',
    PENDING_WAREHOUSE_CHECK = 'در انتظار بررسی موجودی انبار (سرشیفت)',
    PENDING_TECHNICAL = 'در انتظار تایید فنی واحد نت',
    PENDING_SHIFT_LEADER = 'در انتظار تایید سرپرست خط',
    PENDING_WAREHOUSE_KEEPER = 'در انتظار بررسی انباردار کارخانه',
    PENDING_FACTORY = 'در انتظار مدیر کارخانه',
    PENDING_FACTORY_DECISION = 'در انتظار تصمیم مدیر کارخانه (تعیین مسیر خرید)',
    PENDING_COMMERCIAL_DECISION = 'در انتظار تعیین مسیر خرید (مدیر کارخانه)',
    
    // Tehran Branch
    PENDING_TEHRAN_PURCHASING = 'در انتظار مسئول خرید تهران',
    PENDING_CEO_INITIAL = 'در انتظار تایید اولیه مدیرعامل (تهران)',
    PENDING_TEHRAN_PROFORMA = 'در انتظار ثبت پیش‌فاکتور (بازرگانی تهران)',
    PENDING_COMMERCIAL_MANAGER = 'در انتظار بررسی و انتخاب مدیر بازرگانی',
    PENDING_CEO_SELECTION = 'در انتظار انتخاب پیش‌فاکتور (مدیرعامل)',
    
    // Factory/Zanjan Branch
    PENDING_ZANJAN_PURCHASING = 'در انتظار مسئول خرید و نت (زنجان)',
    PENDING_FACTORY_PURCHASING = 'در انتظار مسئول خرید و نت (زنجان)',
    PENDING_FACTORY_PROFORMA = 'در انتظار ثبت پیش‌فاکتور (زنجان/کارخانه)',
    PENDING_FACTORY_MANAGER_SELECTION = 'در انتظار انتخاب پیش‌فاکتور (مدیر کارخانه)',
    PENDING_FACTORY_MANAGER_APPROVAL = 'در انتظار تایید سفارش (مدیر کارخانه)',
    PENDING_BUYER_EXECUTION = 'در انتظار انجام خرید توسط کارپرداز',
    
    // Common Arrival Flow
    PENDING_TECHNICAL_APPROVAL = 'در انتظار تایید فنی و کنترل کیفیت',
    PENDING_FACTORY_ENTRY_APPROVAL = 'در انتظار تایید ورود کالا (مدیر کارخانه)',
    PENDING_SECURITY_ENTRY = 'در انتظار ورود کالا (انتظامات)',
    PENDING_QC = 'در انتظار کنترل کیفی',
    PENDING_FACTORY_FINAL_APPROVE = 'در انتظار تایید نهایی مدیر کارخانه',
    PENDING_WAREHOUSE_RECEIPT = 'در انتظار شمارش و صدور رسید انبار',
    PENDING_FACTORY_FINAL_SIGN = 'در انتظار امضا و بایگانی نهایی (مدیر کارخانه)',
    
    DELIVERED_FROM_WAREHOUSE = 'تحویل شده از انبار (تکمیل بدون خرید)',
    RETURNED_FOR_CORRECTION = 'عودت داده شده جهت اصلاح',
    COMPLETED = 'تکمیل و بایگانی شده',
    REJECTED = 'رد شده / متوقف شده'
}

export interface PurchaseRequestItem {
    id: string;
    itemCode?: string;
    itemName: string;
    quantity: number;
    unit: string;
    suggestedBrand?: string;
    specifications?: string;
    remarks?: string;
    warehouseStock?: number;
    isAvailableInWarehouse?: boolean;
    partId?: string;
    sayanStock?: number; // موجودی لحظه‌ای داخل انبار سایان
    sayanMatchedItem?: string; // نام تطبیق‌یافته در انبار قطعات کارخانه سایان
    sayanItemCode?: string; // کد کالای مربوطه در سایان
    sayanWarehouseName?: string; // نام انبار در سایان (مثلا: انبار ملزومات و قطعات)
}

export interface PurchaseAttachment {
    id: string;
    fileName: string;
    fileType?: string; // 'pdf' | 'word' | 'excel' | 'image' | 'other'
    fileUrl?: string;
    url?: string;
    uploadedBy?: string;
    uploadedAt?: number | string;
    stepName?: string;
}

export interface PurchaseAuditLog {
    id: string;
    stage?: string;
    stepName?: string;
    action: string;
    actionLabel?: string;
    performedBy: string;
    role?: string;
    userRole?: string;
    timestamp: number | string;
    comment?: string;
    signatureUrl?: string;
    durationMinutes?: number;
}

export interface PurchaseProformaItem {
    id: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
}

export interface PurchaseProforma {
    id: string;
    vendorName: string;
    vendorPhone?: string;
    number: string;
    date: string;
    items?: PurchaseProformaItem[]; // Professional details
    totalAmount: number;
    taxAmount?: number;
    discountAmount?: number;
    attachments: PurchaseAttachment[];
    isChosen?: boolean;
    registeredBy?: string;
    deliveryTime?: string; // مدت زمان تحویل
    paymentConditions?: string; // شرایط پرداخت
}

export interface PurchaseRequest {
    id: string;
    requestNumber: string;
    date: string;
    requester: string;
    shiftLeader?: string; // نام سرشیفت / سرپرست خط
    requestingUnit?: string; // واحد درخواست‌کننده
    machinery?: string; // دستگاه یا ماشین‌آلات
    installationLocation?: string; // محل نصب
    urgency?: 'عادی' | 'فوری' | 'اضطراری'; // درجه فوریت
    breakdownDescription?: string; // شرح خرابی
    purchaseReason?: string; // علت درخواست خرید
    repairRequestNumber?: string; // شماره فرم درخواست تعمیر/گزارش خرابی نت
    
    // Main Item or Multi-items list
    itemName: string;
    category?: string;
    subCategory?: string;
    dimensions?: string;
    specifications?: string;
    image?: string;
    images?: string[];
    pdfAttachment?: string;
    pdfAttachments?: string[];
    quantity: number;
    unit: string;
    items?: PurchaseRequestItem[]; // Multiple items in single request
    attachments?: PurchaseAttachment[]; // General attachments (PDF, Word, Excel, images)
    auditLogs?: PurchaseAuditLog[]; // Complete step history & time tracking
    sayanStockSummary?: string; // خلاصه وضعیت موجودی اقلام در انبار سایان
    sayanStock?: number; // موجودی قلم اصلی در انبار سایان
    sayanMatchedItem?: string; // نام تطبیق‌یافته قلم اصلی در انبار سایان
    
    status: PurchaseRequestStatus;
    proformas: PurchaseProforma[];
    
    // Approval trails
    approverRepair?: string;
    approverWarehouseCheck?: string;
    approverTechnical?: string;
    approverFactory?: string;
    approverCommercial?: string;
    approverCeoInitial?: string;
    approverCeoSelection?: string;
    approverFactorySelection?: string;
    approverBuyer?: string;
    approverQc?: string;
    approverFactoryFinal?: string;
    approverWarehouseReceipt?: string;
    approverFactoryArchive?: string;
    
    // Entry data from security (انتظامات)
    entryQuantity?: number;
    entryWeight?: number;
    entryDate?: string;
    entryTime?: string;
    entryRegistrant?: string;
    driverName?: string;
    driverPhone?: string;
    plateNumber?: string;
    waybillNumber?: string; // شماره بارنامه
    transportInfo?: string;
    
    // QC details
    qcResult?: 'تایید' | 'مشروط' | 'رد';
    qcDescription?: string;

    // Warehouse Receipt details & Stock intake
    warehouseReceiptNumber?: string;
    warehouseReceiptDate?: string;
    warehouseLocationSlot?: string; // محل نگهداری در انبار
    serialNumber?: string;
    barcode?: string;
    itemCodeAssigned?: string;

    // Warehouse Delivery (Direct exit from stock)
    warehouseVoucherNumber?: string;
    warehouseRecipient?: string;
    warehouseKeeperName?: string;

    // Technical Approval Form details
    technicalReport?: string;
    technicalBrandApproved?: boolean;
    technicalQualityApproved?: boolean;
    technicalMatchApproved?: boolean;

    // Purchasing Agent (کارپرداز) execution details
    buyerName?: string;
    buyerVendorName?: string;
    buyerPurchaseAmount?: number;
    buyerInvoiceNumber?: string;

    location?: 'Tehran' | 'Factory' | 'Zanjan';
    rejectionReason?: string;
    returnReason?: string;
    createdAt: number;
    updatedAt: number;
    comments?: PurchaseComment[];
}

export interface PurchaseComment {
    id: string;
    userId: string;
    userName: string;
    userRole?: string;
    text: string;
    createdAt: number;
    replyToId?: string; // ID of the comment this is replying to (for nested comments/replies)
}

export interface PartMasterData {
    id: string;
    code?: string;
    name: string; // Used for item name
    brand?: string;
    technicalSpecs?: string;
    type?: string; // e.g. 'قطعه', 'مواد اولیه', 'ملزومات'
    category: string;
    subCategory?: string;
    dimensions?: string;
    machineName?: string; // e.g. 'دستگاه استرچ'
    unit: string;
    image?: string;
    images?: string[];
    pdfAttachment?: string; // NEW
    pdfAttachments?: string[];
    minStock?: number;
    currentStock: number;
}

export type PurchaseItem = PurchaseRequestItem;
export type Part = PartMasterData;

export interface PartKardex {
    id: string;
    partId: string;
    date: string;
    referenceNumber: string;
    type: 'IN' | 'OUT';
    quantity: number;
    balance: number;
    unitPrice?: number;
    description?: string;
}

export interface SecretariatLetterAttachment {
  fileName: string;
  url: string;
}

export interface SecretariatLetterComment {
  id: string;
  userId: string;
  username: string;
  comment: string;
  createdAt: number;
}

export enum SecretariatLetterStatus {
  DRAFT = 'پیش‌نویس',
  PENDING = 'در انتظار اقدام',
  APPROVED = 'تایید شده',
  REJECTED = 'رد شده',
  ARCHIVED = 'بایگانی شده'
}

export interface CompanyStampItem {
    id: string;
    name: string;             // نام مهر (مانند: مهر اصلی شرکت، مهر مالی، مهر مدیرعامل)
    title?: string;           // عنوان/نام مهر
    url: string;              // آدرس تصویر مهر
    imageUrl?: string;        // آدرس تصویر مهر
    size?: number;            // اندازه پیش‌فرض مهر (پیکسل)
    width?: number;           // عرض مهر (پیکسل)
    opacity?: number;         // شفافیت پیش‌فرض مهر (درصد)
    position?: 'bottom_left' | 'bottom_center' | 'bottom_right';
    isDefault?: boolean;      // پیش‌فرض برای نامه‌های جدید
}

export interface SecretariatLetter {
    id: string;
    companyId: string; // The company this letter belongs to
    section: 'headquarters' | 'factory'; // دفتر مرکزی یا کارخانه
    letterNumber: string;
    date: string;
    subject: string;
    content: string;
    sender: string; // From whom
    receiver: string; // To whom
    type: 'internal' | 'incoming' | 'outgoing';
    status: SecretariatLetterStatus;
    
    // Referral (ارجاع)
    referredTo?: string[]; // Array of User IDs
    referredBy?: string;
    
    // Approval/Signature
    approvedBy?: string[]; // Array of User IDs who approved/signed
    signatureImageUrls?: string[]; // Captured signatures
    
    comments: SecretariatLetterComment[];
    attachments: SecretariatLetterAttachment[];
    hasAttachment?: boolean; // پیوست دارد یا ندارد
    attachmentDescription?: string; // شرح یا تعداد برگ پیوست (مثلا: ۲ برگ یا تصویر قرارداد)
    addCompanyStamp?: boolean; // تیک درج مهر شرکت پای نامه
    selectedStampIds?: string[]; // شناسه‌های مهرهای انتخاب شده
    selectedStamps?: CompanyStampItem[]; // آرایه مهرهای اختصاصی انتخاب شده
    isPrivate?: boolean; // تیک خصوصی بودن نامه
    signOffText?: string; // متن با تشکر / با احترام
    signers?: { name: string; title: string; userId?: string; }[]; // لیست امضاکنندگان و سمت‌ها
    paperSize?: 'A4' | 'A5';
    orientation?: 'portrait' | 'landscape';
    signaturePosition?: 'bottom_left' | 'bottom_center' | 'bottom_right';
    hideSubjectInLetter?: boolean;
    hideSalutationInLetter?: boolean;
    createdAt: number;
    updatedAt: number;
    createdBy: string;
}

export interface SecretariatCompanySettings {
    companyId: string;
    headquartersAccessTokens: string[]; // List of user IDs with access
    factoryAccessTokens: string[];     // List of user IDs with access
    editAccessTokens?: string[];       // List of user IDs with edit access
    deleteAccessTokens?: string[];     // List of user IDs with delete access
    
    // Auto-numbering Configuration
    autoNumberingEnabled?: boolean;          // فعال/غیرفعال بودن شماره‌گذاری خودکار
    numberingPrefixHeadquarters?: string;    // پیشوند شماره‌گذاری دفتر مرکزی (مثلا HQ یا د-م)
    numberingPrefixFactory?: string;         // پیشوند شماره‌گذاری کارخانه (مثلا FAC یا ک-ت)
    numberingFormat?: string;                // الگوی شماره‌گذاری (مثلا {PREFIX}-{YEAR}/{NUM})
    numberingStartCounter?: number;          // شماره شروع شمارنده (مثلا ۱ یا ۱۰۰۱)
    numberingPadLength?: number;             // طول ارقام با صفر (مثلا ۴ رقم: ۰۰۰۱)

    // Letterhead Calibration & Margins (All in mm)
    letterheadUrl?: string;            // تصویر سربرگ
    wordLetterheadUrl?: string;        // سربرگ اختصاصی فایل ورد
    pdfLetterheadUrl?: string;         // سربرگ اختصاصی فایل PDF
    marginTop?: number;                // حاشیه شروع متن از بالای سربرگ (میلی‌متر)
    marginBottom?: number;             // حاشیه پایین صفحه (میلی‌متر)
    marginLeft?: number;               // حاشیه سمت چپ صفحه (میلی‌متر)
    marginRight?: number;              // حاشیه سمت راست صفحه (میلی‌متر)
    
    // Header Metadata Block Calibration (شماره، تاریخ، پیوست)
    metadataTop?: number;              // فاصله از بالای سربرگ (میلی‌متر)
    metadataLeft?: number;             // فاصله از چپ سربرگ (میلی‌متر)
    metadataFontSize?: number;         // اندازه قلم اطلاعات سربرگ (پیکسل)
    metadataOpacity?: number;          // میزان پررنگی اطلاعات سربرگ (درصد، از ۱۰ تا ۱۰۰)
    metadataFontWeight?: 'normal' | 'bold' | 'bolder' | 'black'; // میزان ضخامت متون سربرگ
    metadataColor?: string;            // رنگ متن مشخصات سربرگ (کد رنگ)
    metadataLineHeight?: number;       // فاصله بین خطوط مشخصات سربرگ (مثلا 1.8)
    
    // Stamp Settings
    companyStampUrl?: string;          // تصویر مهر رسمی شرکت
    companyStampSize?: number;         // اندازه مهر رسمی (پیکسل)
    companyStampOpacity?: number;      // شفافیت مهر رسمی (درصد)
    companyStampPosition?: 'bottom_left' | 'bottom_center' | 'bottom_right'; // جایگاه پیش‌فرض مهر
    stamps?: CompanyStampItem[];       // لیست چندگانه مهرهای شرکت با امکان نام‌گذاری و تغییر نام
    
    // General Letter Styles & Templates
    meetingMinutesTemplate?: string;   // قالب صورتجلسه
    hideAutoFooter?: boolean;          // عدم نمایش خودکار پاورقی در صورت داشتن سربرگ
    letterheadFontFamily?: string;     // نوع فونت بدنه نامه
    defaultSignOffText?: string;       // عبارت پایانی پیش‌فرض (با احترام / با تشکر)
}

export interface SecretariatTemplate {
    id: string;
    title: string;       // عنوان قالب
    category?: string;   // دسته‌بندی قالب (مانند: اداری، مالی، فنی، عمومی)
    subject?: string;    // موضوع پیش‌فرض نامه
    content: string;     // متن خام قالب (HTML/Quill compatible)
    createdAt: number;
}

export interface ChequeItem {
    id: string;
    chequeNumber: string; // شماره چک
    sayyadId: string;     // شناسه صیادی ۱۶ رقمی
    bankName: string;     // نام بانک صادرکننده
    dueDate: string;      // تاریخ سررسید (مثال: ۱۴۰۳/۰۵/۲۰)
    amount: number;       // مبلغ چک به ریال
    drawerName: string;   // صادرکننده چک / صاحب حساب
    chequeStatus?: 'box' | 'cashed' | 'deposited' | 'spent' | 'returned'; // وضعیت چک: صندوق، وصول شده، به حساب خوابانده شده، خرج شده، برگشتی
}

export interface ChequeReceipt {
    id: string;
    customerName: string;    // نام مشتری
    registrationDate: string;// تاریخ ثبت رسید (شمسی)
    totalAmount: number;     // جمع کل مبالغ چک‌ها به ریال
    serialNumber: string;    // پشت نمره (شناسه پیگیری متوالی)
    company?: string;        // نام شرکت
    attachedFile?: {
        name: string;
        url: string;
    };
    cheques: ChequeItem[];
    status?: 'draft' | 'pending_sales' | 'pending_ceo' | 'approved' | 'archived';
    salesManagerApprovedBy?: string;
    salesManagerApprovedAt?: number;
    ceoApprovedBy?: string;
    ceoApprovedAt?: number;
    archivedBy?: string;
    archivedAt?: number;
    createdAt: number;
    createdBy: string;
}

export interface BioLinkBlock {
    id: string;
    category: 'maps' | 'phones' | 'emails' | 'socials' | 'bots' | 'links' | 'catalog' | 'order_form' | 'survey' | 'custom';
    title: string;
    subtitle?: string;
    value: string; // URL, Phone Number, Address, Email
    iconName?: string; // 'neshan', 'balad', 'google_maps', 'phone', 'mobile', 'email', 'instagram', 'telegram_bot', 'bale_bot', 'telegram', 'bale', 'whatsapp', 'website', 'file', 'order', 'globe'
    badge?: string;
    colorTheme?: 'emerald' | 'blue' | 'indigo' | 'amber' | 'rose' | 'slate' | 'purple';
    isActive: boolean;
    order: number;
}

export interface BioLinkOrder {
    id: string;
    customerName: string;
    customerPhone: string;
    productTitle?: string;
    quantity?: string;
    notes?: string;
    status: 'pending' | 'contacted' | 'completed' | 'cancelled';
    createdAt: number;
}

export interface BioLinkConfig {
    slug: string; // e.g. "lepanbaft"
    companyTitle: string; // "شرکت تولیدی لیان بافت"
    companySubtitle: string; // "تولید انواع نخ پلی استر ، کش ، اسپندکس ، POY و ساپورت"
    avatarUrl: string; // Logo
    coverUrl: string; // Banner
    theme: 'lepan_light' | 'zilink_light' | 'dark' | 'gradient_blue' | 'emerald_pro';
    primaryColor?: string;
    addressText?: string;
    blocks: BioLinkBlock[];
    orders?: BioLinkOrder[];
    surveys?: {
        id: string;
        customerName?: string;
        customerPhone?: string;
        qualityRating: number;
        deliveryRating: number;
        supportRating: number;
        comment?: string;
        createdAt: number;
    }[];
    updatedAt?: number;
}




