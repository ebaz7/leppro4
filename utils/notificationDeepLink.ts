/**
 * Universal Notification Deep-Link Parser & Dispatcher
 * Resolves any notification URL, title, or body into an exact target module tab
 * AND extracts specific record identifiers (meetingId, orderId, permitId, requestId,
 * letterId, txId, pv, group, task, etc.) so tapping a notification on Android/Web/Desktop
 * opens the exact record modal directly.
 */

export interface ParsedNotificationDeepLink {
  tab: string;
  rawUrl: string;
  meetingId?: string;
  meetingNumber?: string;
  orderId?: string;
  trackingNumber?: string;
  permitId?: string;
  permitNumber?: string;
  requestId?: string;
  requestNumber?: string;
  letterId?: string;
  letterNumber?: string;
  txId?: string;
  txNumber?: string;
  tradeId?: string;
  chequeId?: string;
  pv?: string;
  group?: string;
  task?: string;
  subTab?: string;
  filterStatus?: string;
  exitStatus?: string;
  warehouseFilter?: string;
  filter?: string;
}

/**
 * Normalizes Persian/Arabic digits to English digits
 */
export function normalizeDigitsToEnglish(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

/**
 * Maps any notification path/URL or title/body hint to the exact app tab ID.
 * Fixes ordering bugs where `/manage-exit` or `/manage-invoices` previously matched `manage`.
 */
export function mapNotificationUrlToTab(rawUrl?: string | null, fallbackText?: string | null): string {
  const combined = `${rawUrl || ''} ${fallbackText || ''}`.trim();
  if (!combined) return 'dashboard';

  const clean = (rawUrl || '').trim().replace(/^\/+/, '');
  const [basePath, queryStr] = clean.split('?');
  const path = (basePath || '').toLowerCase();

  if (queryStr) {
    try {
      const params = new URLSearchParams(queryStr);
      const tabParam = params.get('tab');
      if (tabParam) {
        return mapNotificationUrlToTab(tabParam, fallbackText);
      }
      if (params.get('meetingId') || params.get('meetingNumber')) return 'meetings';
      if (params.get('permitId') || params.get('permitNumber')) return 'manage-exit';
      if (params.get('orderId') || params.get('trackingNumber')) return 'manage';
      if (params.get('requestId') || params.get('requestNumber')) return 'purchase';
      if (params.get('letterId') || params.get('letterNumber')) return 'secretariat';
      if (params.get('txId') || params.get('bijakNumber')) return 'warehouse';
      if (params.get('pv') || params.get('group') || params.get('task')) return 'chat';
    } catch {}
  }

  // Exact or specific hyphenated matches FIRST (before substring matches like 'manage' or 'sayan')
  if (path === 'manage-exit' || path.includes('manage-exit') || path.includes('exit-permit') || path.includes('exit_permit')) {
    return 'manage-exit';
  }
  if (path === 'create-exit' || path.includes('create-exit')) {
    return 'create-exit';
  }
  if (path === 'manage-invoices' || path.includes('manage-invoices') || path.includes('invoice')) {
    return 'manage-invoices';
  }
  if (path === 'sayan-operations' || path.includes('sayan-operations')) {
    return 'sayan-operations';
  }
  if (path === 'cheque-receipts' || path.includes('cheque-receipt') || path.includes('cheque')) {
    return 'cheque-receipts';
  }
  if (path === 'digital-card' || path.includes('digital-card')) {
    return 'digital-card';
  }
  if (path === 'industrial-erp' || path.includes('industrial-erp')) {
    return 'industrial-erp';
  }
  if (path === 'meetings' || path.includes('meeting') || path.includes('production-meetings')) {
    return 'meetings';
  }
  if (path === 'secretariat' || path.includes('secretariat') || path.includes('letter')) {
    return 'secretariat';
  }
  if (path === 'purchase' || path.includes('purchase')) {
    return 'purchase';
  }
  if (path === 'warehouse' || path.includes('warehouse') || path.includes('bijak')) {
    return 'warehouse';
  }
  if (path === 'security' || path.includes('security')) {
    return 'security';
  }
  if (path === 'chat' || path.includes('chat')) {
    return 'chat';
  }
  if (path === 'trade' || path.includes('trade')) {
    return 'trade';
  }
  if (path === 'sayan' || path.includes('sayan')) {
    return 'sayan';
  }
  if (path === 'balances' || path.includes('balance')) {
    return 'balances';
  }
  if (path === 'manage' || path.includes('manage') || path.includes('order') || path.includes('payment')) {
    return 'manage';
  }
  if (path === 'create' || path.includes('create')) {
    return 'create';
  }
  if (path === 'knowledge' || path.includes('knowledge') || path.includes('note')) {
    return 'knowledge';
  }
  if (path === 'sales' || path.includes('sales')) {
    return 'sales';
  }
  if (path === 'products' || path.includes('product')) {
    return 'products';
  }
  if (path === 'users' || path.includes('user')) {
    return 'users';
  }
  if (path === 'settings' || path.includes('setting')) {
    return 'settings';
  }
  if (path === 'ccti' || path.includes('ccti')) {
    return 'ccti';
  }
  if (path === 'tickets' || path.includes('ticket')) {
    return 'tickets';
  }

  // Fallback heuristics from Persian notification title/body
  const text = normalizeDigitsToEnglish(fallbackText || '').toLowerCase();
  if (text.includes('صورتجلسه') || text.includes('جلسه تولید') || /\bm-\d+\b/i.test(text)) {
    return 'meetings';
  }
  if (text.includes('برگه خروج') || text.includes('حواله خروج کالا') || text.includes('مجوز خروج')) {
    return 'manage-exit';
  }
  if (text.includes('دستور پرداخت') || text.includes('پیوست جدید دستور پرداخت') || text.includes('پیوست سند')) {
    return 'manage';
  }
  if (text.includes('درخواست خرید') || text.includes('تایید خرید') || text.includes('پیش‌فاکتور')) {
    return 'purchase';
  }
  if (text.includes('نامه اداری') || text.includes('دبیرخانه')) {
    return 'secretariat';
  }
  if (text.includes('بیجک') || text.includes('حواله ورود انبار') || text.includes('حواله خروج انبار')) {
    return 'warehouse';
  }
  if (text.includes('تسک') || text.includes('پیام از') || text.includes('منشن جدید')) {
    return 'chat';
  }

  return path || 'dashboard';
}

/**
 * Extracts both the target tab AND any specific record IDs from a notification URL + title/body.
 * Even if an older notification only has `url: 'meetings'` and `title: 'تایید صورتجلسه M-1037'`,
 * this parser extracts `meetingNumber: 'M-1037'` so the exact record modal opens!
 */
export function parseNotificationDeepLink(
  rawUrl?: string | null,
  title?: string | null,
  body?: string | null,
  extraData?: Record<string, any> | null
): ParsedNotificationDeepLink {
  const effectiveUrl = (rawUrl || extraData?.targetUrl || extraData?.url || '').trim();
  const clean = effectiveUrl.replace(/^\/+/, '');
  const [, queryStr] = clean.split('?');

  let queryTitle = '';
  let queryBody = '';
  if (queryStr) {
    try {
      const p = new URLSearchParams(queryStr);
      queryTitle = p.get('_nt') || '';
      queryBody = p.get('_nb') || '';
    } catch {}
  }

  const combinedText = normalizeDigitsToEnglish(
    `${title || ''} ${body || ''} ${queryTitle} ${queryBody}`
  ).trim();
  const tab = mapNotificationUrlToTab(effectiveUrl, combinedText);

  const result: ParsedNotificationDeepLink = {
    tab,
    rawUrl: effectiveUrl,
  };

  // 1. Parse query string parameters from URL
  if (queryStr) {
    try {
      const params = new URLSearchParams(queryStr);
      const getParam = (...keys: string[]) => {
        for (const k of keys) {
          const val = params.get(k);
          if (val && val.trim()) return val.trim();
        }
        return undefined;
      };

      result.meetingId = getParam('meetingId', 'meeting');
      result.meetingNumber = getParam('meetingNumber', 'meetingNo');
      result.orderId = getParam('orderId', 'order');
      result.trackingNumber = getParam('trackingNumber', 'orderNumber');
      result.permitId = getParam('permitId', 'permit');
      result.permitNumber = getParam('permitNumber', 'permitNo');
      result.requestId = getParam('requestId', 'purchaseId');
      result.requestNumber = getParam('requestNumber');
      result.letterId = getParam('letterId', 'letter');
      result.letterNumber = getParam('letterNumber');
      result.txId = getParam('txId', 'transactionId');
      result.txNumber = getParam('txNumber', 'bijakNumber');
      result.tradeId = getParam('tradeId', 'dossierId');
      result.chequeId = getParam('chequeId', 'receiptId');
      result.pv = getParam('pv');
      result.group = getParam('group', 'groupId');
      result.task = getParam('task', 'taskId');
      result.subTab = getParam('subTab');
      result.filterStatus = getParam('filterStatus');
      result.exitStatus = getParam('exitStatus');
      result.warehouseFilter = getParam('filter');
      result.filter = getParam('filter');

      // Generic `id` parameter mapped according to target tab
      const genericId = getParam('id', 'recordId');
      if (genericId) {
        if (tab === 'meetings' && !result.meetingId) result.meetingId = genericId;
        else if (tab === 'manage' && !result.orderId) result.orderId = genericId;
        else if (tab === 'manage-exit' && !result.permitId) result.permitId = genericId;
        else if (tab === 'purchase' && !result.requestId) result.requestId = genericId;
        else if (tab === 'secretariat' && !result.letterId) result.letterId = genericId;
        else if (tab === 'warehouse' && !result.txId) result.txId = genericId;
        else if (tab === 'trade' && !result.tradeId) result.tradeId = genericId;
        else if (tab === 'cheque-receipts' && !result.chequeId) result.chequeId = genericId;
      }
    } catch {}
  }

  // 2. Merge explicit fields from extraData (e.g. FCM data payload or notification metadata)
  if (extraData && typeof extraData === 'object') {
    if (extraData.meetingId && !result.meetingId) result.meetingId = String(extraData.meetingId);
    if (extraData.meetingNumber && !result.meetingNumber) result.meetingNumber = String(extraData.meetingNumber);
    if (extraData.orderId && !result.orderId) result.orderId = String(extraData.orderId);
    if (extraData.trackingNumber && !result.trackingNumber) result.trackingNumber = String(extraData.trackingNumber);
    if (extraData.permitId && !result.permitId) result.permitId = String(extraData.permitId);
    if (extraData.permitNumber && !result.permitNumber) result.permitNumber = String(extraData.permitNumber);
    if (extraData.requestId && !result.requestId) result.requestId = String(extraData.requestId);
    if (extraData.letterId && !result.letterId) result.letterId = String(extraData.letterId);
    if (extraData.txId && !result.txId) result.txId = String(extraData.txId);
    if (extraData.pv && !result.pv) result.pv = String(extraData.pv);
    if (extraData.group && !result.group) result.group = String(extraData.group);
    if (extraData.task && !result.task) result.task = String(extraData.task);
  }

  // 3. Smart fallback extraction from notification Title / Body when URL lacks IDs
  if (combinedText) {
    if (tab === 'meetings' && !result.meetingId && !result.meetingNumber) {
      const mMatch = combinedText.match(/\b(M-\d+)\b/i) || combinedText.match(/#([A-Za-z0-9\-_\/]+)/);
      if (mMatch && mMatch[1]) {
        result.meetingNumber = mMatch[1];
      }
    } else if (tab === 'manage' && !result.orderId && !result.trackingNumber) {
      const oMatch =
        combinedText.match(/#(\d+)/) ||
        combinedText.match(/شماره\s*(\d+)/) ||
        combinedText.match(/سند\s*#?(\d+)/);
      if (oMatch && oMatch[1]) {
        result.trackingNumber = oMatch[1];
      }
    } else if (tab === 'manage-exit' && !result.permitId && !result.permitNumber) {
      const pMatch =
        combinedText.match(/#(\d+)/) ||
        combinedText.match(/شماره\s*(\d+)/) ||
        combinedText.match(/حواله\s*#?(\d+)/);
      if (pMatch && pMatch[1]) {
        result.permitNumber = pMatch[1];
      }
    } else if (tab === 'purchase' && !result.requestId && !result.requestNumber) {
      const rMatch = combinedText.match(/#([A-Za-z0-9\-_\/]+)/) || combinedText.match(/شماره\s*([A-Za-z0-9\-_\/]+)/);
      if (rMatch && rMatch[1]) {
        result.requestId = rMatch[1];
      }
    } else if (tab === 'secretariat' && !result.letterId && !result.letterNumber) {
      const lMatch = combinedText.match(/#([A-Za-z0-9\-_\/]+)/) || combinedText.match(/شماره\s*([A-Za-z0-9\-_\/]+)/);
      if (lMatch && lMatch[1]) {
        result.letterNumber = lMatch[1];
      }
    } else if (tab === 'warehouse' && !result.txId && !result.txNumber) {
      const wMatch = combinedText.match(/#(\d+)/) || combinedText.match(/شماره\s*(\d+)/);
      if (wMatch && wMatch[1]) {
        result.txNumber = wMatch[1];
      }
    }
  }

  return result;
}
