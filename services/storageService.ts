
import { MeetingMinutes, PaymentOrder, User, OrderStatus, SystemSettings, ChatMessage, ChatGroup, GroupTask, TradeRecord, TradeAttachment, ExitPermit, ExitPermitStatus, WarehouseItem, WarehouseTransaction, SecurityLog, DriverPayment, PersonnelDelay, PersonnelOvertime, SecurityIncident, TaskGroup, SystemAnnouncement, ChequeReceipt, ChequeItem, BioLinkConfig, BioLinkOrder } from '../types';
import { apiCall, getLocalData, LS_KEYS, getEffectiveApiUrl, getAuthToken } from './apiService';

// Safely return array
const safeArray = <T>(data: any): T[] => {
    return Array.isArray(data) ? (data as T[]) : [];
};

export const getPreviousPaymentOrderStatusForReject = (current: OrderStatus): OrderStatus => {
  switch (current) {
    case OrderStatus.APPROVED_MANAGER:
      // CEO rejects -> returns to Management cartable
      return OrderStatus.APPROVED_FINANCE;
    case OrderStatus.APPROVED_FINANCE:
      // Management rejects -> returns to Financial cartable
      return OrderStatus.PENDING;
    case OrderStatus.PENDING:
      // Financial rejects -> rejected back to Requester
      return OrderStatus.REJECTED;
    default:
      return OrderStatus.REJECTED;
  }
};

export const getPreviousExitPermitStatusForReject = (current: ExitPermitStatus): ExitPermitStatus => {
  switch (current) {
    case ExitPermitStatus.PENDING_FACTORY_FINAL:
      // Factory Manager rejects final exit -> returns to Security
      return ExitPermitStatus.PENDING_SECURITY;
    case ExitPermitStatus.PENDING_SECURITY:
      // Security rejects -> returns to Warehouse
      return ExitPermitStatus.PENDING_WAREHOUSE;
    case ExitPermitStatus.PENDING_WAREHOUSE:
      // Warehouse rejects -> returns to Factory Manager
      return ExitPermitStatus.PENDING_FACTORY;
    case ExitPermitStatus.PENDING_FACTORY:
      // Factory Manager rejects -> returns to CEO
      return ExitPermitStatus.PENDING_CEO;
    case ExitPermitStatus.PENDING_CEO:
    default:
      // CEO rejects -> final rejected
      return ExitPermitStatus.REJECTED;
  }
};

export const getOrders = async (): Promise<PaymentOrder[]> => { 
    const res = await apiCall<PaymentOrder[]>('/orders'); 
    return safeArray<PaymentOrder>(res);
};
export const saveOrder = async (order: PaymentOrder): Promise<PaymentOrder[]> => { 
    try {
        const cached = getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, []);
        if (cached && Array.isArray(cached)) {
            const updated = [order, ...cached.filter((o: PaymentOrder) => o.id !== order.id)];
            localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ORDER_OPTIMISTIC_APPLY', {
            detail: { orderId: order.id, targetStatus: order.status, order, isNew: true }
        }));
    }
    const res = await apiCall<PaymentOrder[]>('/orders', 'POST', order);
    const safeRes = safeArray<PaymentOrder>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('ORDER_BACKGROUND_SYNCED', {
            detail: { allOrders: safeRes, order: safeRes.find((o: PaymentOrder) => o.id === order.id) }
        }));
    }
    return safeRes;
};

export const editOrder = async (updatedOrder: PaymentOrder): Promise<PaymentOrder[]> => { 
    try {
        const cached = getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, []);
        if (cached && Array.isArray(cached)) {
            const updated = cached.map((o: PaymentOrder) => o.id === updatedOrder.id ? updatedOrder : o);
            localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ORDER_OPTIMISTIC_APPLY', {
            detail: { orderId: updatedOrder.id, targetStatus: updatedOrder.status, order: updatedOrder, updates: updatedOrder }
        }));
    }
    const res = await apiCall<PaymentOrder[]>(`/orders/${updatedOrder.id}`, 'PUT', updatedOrder); 
    const safeRes = safeArray<PaymentOrder>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('ORDER_BACKGROUND_SYNCED', {
            detail: { allOrders: safeRes, order: safeRes.find((o: PaymentOrder) => o.id === updatedOrder.id) }
        }));
    }
    return safeRes;
};

export const addOrderArchiveAttachment = async (
    orderId: string, 
    attachment: { fileName: string; fileData?: string; url?: string; type?: string; size?: number; uploadedBy?: string }
): Promise<{ success: boolean; order: PaymentOrder; orders: PaymentOrder[] }> => {
    const res = await apiCall<{ success: boolean; order: PaymentOrder; orders: PaymentOrder[] }>(`/orders/${orderId}/archive-attachments`, 'POST', attachment);
    if (res && res.orders && typeof window !== 'undefined') {
        localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(res.orders));
        window.dispatchEvent(new CustomEvent('ORDER_BACKGROUND_SYNCED', {
            detail: { allOrders: res.orders, order: res.order }
        }));
    }
    return res;
};

export const deleteOrderArchiveAttachment = async (
    orderId: string, 
    attachmentId: string
): Promise<{ success: boolean; order: PaymentOrder; orders: PaymentOrder[] }> => {
    const res = await apiCall<{ success: boolean; order: PaymentOrder; orders: PaymentOrder[] }>(`/orders/${orderId}/archive-attachments/${attachmentId}`, 'DELETE');
    if (res && res.orders && typeof window !== 'undefined') {
        localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(res.orders));
        window.dispatchEvent(new CustomEvent('ORDER_BACKGROUND_SYNCED', {
            detail: { allOrders: res.orders, order: res.order }
        }));
    }
    return res;
};

export const updateOrderStatus = async (id: string, status: OrderStatus, approverUser: User, rejectionReason?: string, isBackwardReject?: boolean): Promise<PaymentOrder[]> => {
  const updates: any = { status, updatedAt: Date.now() };

  if (isBackwardReject || rejectionReason) {
      updates.rejectionReason = rejectionReason || 'رد جهت بررسی و اصلاح در مرحله قبل';
      updates.rejectedBy = approverUser.fullName;

      if (status === OrderStatus.APPROVED_FINANCE) {
          // Returned from CEO to Management
          updates.approverCeo = null;
          updates.approverManager = null;
      } else if (status === OrderStatus.PENDING) {
          // Returned from Management to Financial
          updates.approverCeo = null;
          updates.approverManager = null;
          updates.approverFinancial = null;
      } else if (status === OrderStatus.REJECTED) {
          updates.approverCeo = null;
          updates.approverManager = null;
          updates.approverFinancial = null;
      }
  } else {
      // Forward approval
      if (status === OrderStatus.APPROVED_FINANCE) updates.approverFinancial = approverUser.fullName;
      else if (status === OrderStatus.APPROVED_MANAGER) updates.approverManager = approverUser.fullName;
      else if (status === OrderStatus.APPROVED_CEO) updates.approverCeo = approverUser.fullName;
  }
  
  // Optimistically update local cache
  try {
      const cached = getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, []);
      if (cached && Array.isArray(cached)) {
          const updated = cached.map((o: PaymentOrder) => o.id === id ? { ...o, ...updates } : o);
          localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(updated));
      }
  } catch {}

  // Dispatch optimistic event to immediately update cartable & dashboard without refresh
  if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ORDER_OPTIMISTIC_APPLY', {
          detail: { orderId: id, targetStatus: status, approverUser, updates }
      }));
  }

  const res = await apiCall<PaymentOrder[]>(`/orders/${id}`, 'PUT', updates);
  const safeRes = safeArray<PaymentOrder>(res);
  if (typeof window !== 'undefined' && safeRes.length > 0) {
      window.dispatchEvent(new CustomEvent('ORDER_BACKGROUND_SYNCED', {
          detail: { order: safeRes.find((o: PaymentOrder) => o.id === id), allOrders: safeRes }
      }));
  }
  return safeRes;
};

export const deleteOrder = async (id: string): Promise<PaymentOrder[]> => { 
    try {
        const cached = getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, []);
        if (cached && Array.isArray(cached)) {
            const updated = cached.filter((o: PaymentOrder) => o.id !== id);
            localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ORDER_OPTIMISTIC_APPLY', {
            detail: { orderId: id, isDeleted: true }
        }));
    }
    const res = await apiCall<PaymentOrder[]>(`/orders/${id}`, 'DELETE'); 
    const safeRes = safeArray<PaymentOrder>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('ORDER_BACKGROUND_SYNCED', {
            detail: { allOrders: safeRes }
        }));
    }
    return safeRes;
};

let _exitPermitsCacheWriteTimer: any = null;
const scheduleExitPermitsCacheUpdate = (updater: (cached: ExitPermit[]) => ExitPermit[]) => {
    if (_exitPermitsCacheWriteTimer) clearTimeout(_exitPermitsCacheWriteTimer);
    _exitPermitsCacheWriteTimer = setTimeout(() => {
        try {
            const cached = getLocalData<ExitPermit[]>(LS_KEYS.EXIT_PERMITS, []);
            if (cached && Array.isArray(cached)) {
                const updated = updater(cached);
                localStorage.setItem(LS_KEYS.EXIT_PERMITS, JSON.stringify(updated));
            }
        } catch {}
    }, 150);
};

export const getExitPermits = async (): Promise<ExitPermit[]> => { 
    const res = await apiCall<ExitPermit[]>('/exit-permits'); 
    return safeArray<ExitPermit>(res);
};
export const saveExitPermit = async (permit: ExitPermit): Promise<ExitPermit[]> => { 
    scheduleExitPermitsCacheUpdate(cached => [permit, ...cached.filter((p: ExitPermit) => p.id !== permit.id)]);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_OPTIMISTIC_APPLY', {
            detail: { permitId: permit.id, targetStatus: permit.status, permit, isNew: true }
        }));
    }
    const res = await apiCall<ExitPermit[]>('/exit-permits', 'POST', permit); 
    const safeRes = safeArray<ExitPermit>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_BACKGROUND_SYNCED', {
            detail: { allPermits: safeRes, permit: safeRes.find((p: ExitPermit) => p.id === permit.id) }
        }));
    }
    return safeRes;
};

export const editExitPermit = async (updatedPermit: ExitPermit, skipOptimisticBroadcast = false): Promise<ExitPermit[]> => { 
    scheduleExitPermitsCacheUpdate(cached => cached.map((p: ExitPermit) => p.id === updatedPermit.id ? updatedPermit : p));
    if (!skipOptimisticBroadcast && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_OPTIMISTIC_APPLY', {
            detail: { permitId: updatedPermit.id, targetStatus: updatedPermit.status, permit: updatedPermit, updates: updatedPermit }
        }));
    }
    const res = await apiCall<ExitPermit[]>(`/exit-permits/${updatedPermit.id}`, 'PUT', updatedPermit); 
    const safeRes = safeArray<ExitPermit>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_BACKGROUND_SYNCED', {
            detail: { allPermits: safeRes, permit: safeRes.find((p: ExitPermit) => p.id === updatedPermit.id) }
        }));
    }
    return safeRes;
};

export const updateExitPermitStatus = async (id: string, status: ExitPermitStatus, approverUser: User, extra?: { rejectionReason?: string, exitTime?: string, isReject?: boolean, isBackwardReject?: boolean }, skipOptimisticBroadcast = false): Promise<ExitPermit[]> => {
    const updates: any = { status, updatedAt: Date.now() };
    
    if (extra?.isReject || extra?.rejectionReason) {
        updates.rejectionReason = extra.rejectionReason || 'رد جهت بازبینی و اصلاح در مرحله قبل';
        updates.rejectedBy = approverUser.fullName;

        if (status === ExitPermitStatus.PENDING_SECURITY) {
            // Returned from Factory Manager to Security
            updates.approverFactoryFinal = null;
            updates.approverSecurity = null;
        } else if (status === ExitPermitStatus.PENDING_WAREHOUSE) {
            // Returned from Security to Warehouse
            updates.approverSecurity = null;
            updates.approverWarehouse = null;
        } else if (status === ExitPermitStatus.PENDING_FACTORY) {
            // Returned from Warehouse to Factory Manager
            updates.approverWarehouse = null;
            updates.approverFactory = null;
        } else if (status === ExitPermitStatus.PENDING_CEO) {
            // Returned from Factory Manager to CEO
            updates.approverFactory = null;
            updates.approverCeo = null;
        } else if (status === ExitPermitStatus.REJECTED) {
            updates.approverCeo = null;
        }
    } else {
        // Forward approval progression
        if (status === ExitPermitStatus.PENDING_FACTORY) updates.approverCeo = approverUser.fullName;
        else if (status === ExitPermitStatus.PENDING_WAREHOUSE) updates.approverFactory = approverUser.fullName;
        else if (status === ExitPermitStatus.PENDING_SECURITY) updates.approverWarehouse = approverUser.fullName;
        else if (status === ExitPermitStatus.PENDING_FACTORY_FINAL) updates.approverSecurity = approverUser.fullName;
        else if (status === ExitPermitStatus.EXITED) {
            updates.approverFactoryFinal = approverUser.fullName;
            if (extra?.exitTime) updates.exitTime = extra.exitTime;
        }
    }

    if (status === ExitPermitStatus.CANCELED) {
        updates.rejectionReason = extra?.rejectionReason || 'کنسل شده';
        updates.rejectedBy = approverUser.fullName;
    }

    // Non-blocking background update of local cache
    scheduleExitPermitsCacheUpdate(cached => cached.map((p: ExitPermit) => p.id === id ? { ...p, ...updates } : p));

    // Dispatch optimistic broadcast so cartable and dashboard update immediately
    if (!skipOptimisticBroadcast && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_OPTIMISTIC_APPLY', {
            detail: { permitId: id, targetStatus: status, approverUser, extra, updates }
        }));
    }

    const res = await apiCall<ExitPermit[]>(`/exit-permits/${id}`, 'PUT', updates);
    const safeRes = safeArray<ExitPermit>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_BACKGROUND_SYNCED', {
            detail: { permit: safeRes.find((p: ExitPermit) => p.id === id), allPermits: safeRes }
        }));
    }
    return safeRes;
};

export const deleteExitPermit = async (id: string): Promise<ExitPermit[]> => { 
    scheduleExitPermitsCacheUpdate(cached => cached.filter((p: ExitPermit) => p.id !== id));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_OPTIMISTIC_APPLY', {
            detail: { permitId: id, isDeleted: true }
        }));
    }
    const res = await apiCall<ExitPermit[]>(`/exit-permits/${id}`, 'DELETE'); 
    const safeRes = safeArray<ExitPermit>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_BACKGROUND_SYNCED', {
            detail: { allPermits: safeRes }
        }));
    }
    return safeRes;
};
export const getNextExitPermitNumber = async (): Promise<number> => { try { const response = await apiCall<{ nextNumber: number }>(`/next-exit-permit-number?t=${Date.now()}`); return response.nextNumber; } catch(e) { return 1001; } };

export const getSecurityLogs = async (): Promise<SecurityLog[]> => { const res = await apiCall<SecurityLog[]>('/security/logs'); return safeArray(res); };
export const saveSecurityLog = async (log: SecurityLog): Promise<SecurityLog[]> => { return await apiCall<SecurityLog[]>('/security/logs', 'POST', log); };
export const updateSecurityLog = async (log: SecurityLog): Promise<SecurityLog[]> => { return await apiCall<SecurityLog[]>(`/security/logs/${log.id}`, 'PUT', log); };
export const deleteSecurityLog = async (id: string): Promise<SecurityLog[]> => { return await apiCall<SecurityLog[]>(`/security/logs/${id}`, 'DELETE'); };
export const getPersonnelDelays = async (): Promise<PersonnelDelay[]> => { const res = await apiCall<PersonnelDelay[]>('/security/delays'); return safeArray(res); };
export const savePersonnelDelay = async (delay: PersonnelDelay): Promise<PersonnelDelay[]> => { return await apiCall<PersonnelDelay[]>('/security/delays', 'POST', delay); };
export const updatePersonnelDelay = async (delay: PersonnelDelay): Promise<PersonnelDelay[]> => { return await apiCall<PersonnelDelay[]>(`/security/delays/${delay.id}`, 'PUT', delay); };
export const deletePersonnelDelay = async (id: string): Promise<PersonnelDelay[]> => { return await apiCall<PersonnelDelay[]>(`/security/delays/${id}`, 'DELETE'); };
export const getPersonnelOvertimes = async (): Promise<PersonnelOvertime[]> => { const res = await apiCall<PersonnelOvertime[]>('/security/overtimes'); return safeArray(res); };
export const savePersonnelOvertime = async (overtime: PersonnelOvertime): Promise<PersonnelOvertime[]> => { return await apiCall<PersonnelOvertime[]>('/security/overtimes', 'POST', overtime); };
export const updatePersonnelOvertime = async (overtime: PersonnelOvertime): Promise<PersonnelOvertime[]> => { return await apiCall<PersonnelOvertime[]>(`/security/overtimes/${overtime.id}`, 'PUT', overtime); };
export const deletePersonnelOvertime = async (id: string): Promise<PersonnelOvertime[]> => { return await apiCall<PersonnelOvertime[]>(`/security/overtimes/${id}`, 'DELETE'); };
export const getSecurityIncidents = async (): Promise<SecurityIncident[]> => { const res = await apiCall<SecurityIncident[]>('/security/incidents'); return safeArray(res); };
export const saveSecurityIncident = async (incident: SecurityIncident): Promise<SecurityIncident[]> => { return await apiCall<SecurityIncident[]>('/security/incidents', 'POST', incident); };
export const updateSecurityIncident = async (incident: SecurityIncident): Promise<SecurityIncident[]> => { return await apiCall<SecurityIncident[]>(`/security/incidents/${incident.id}`, 'PUT', incident); };
export const deleteSecurityIncident = async (id: string): Promise<SecurityIncident[]> => { return await apiCall<SecurityIncident[]>(`/security/incidents/${id}`, 'DELETE'); };
// Settings Cache with LocalStorage
const SETTINGS_CACHE_KEY = 'app_settings_cache';
const SETTINGS_CACHE_TTL = 300000; // 5 minutes (increased for better performance)

export const getSettings = async (): Promise<SystemSettings> => { 
    return await apiCall<SystemSettings>('/settings'); 
};
export const saveSettings = async (settings: SystemSettings): Promise<SystemSettings> => { 
    return await apiCall<SystemSettings>('/settings', 'POST', settings); 
};

// Updated: Accepts optional company parameter
export const getNextTrackingNumber = async (company?: string): Promise<number> => { 
    try { 
        const url = company 
            ? `/next-tracking-number?company=${encodeURIComponent(company)}&t=${Date.now()}` 
            : `/next-tracking-number?t=${Date.now()}`;
        const response = await apiCall<{ nextTrackingNumber: number }>(url); 
        return response.nextTrackingNumber; 
    } catch (e) { 
        return 1001; 
    } 
};

// Chat Exports
export const getMessages = async (): Promise<ChatMessage[]> => { const res = await apiCall<ChatMessage[]>('/chat'); return safeArray(res); };
export const sendMessage = async (message: ChatMessage): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>('/chat', 'POST', message); };
export const updateMessage = async (message: ChatMessage): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>(`/chat/${message.id}`, 'PUT', message); };
export const deleteMessage = async (id: string, forEveryone: boolean = false): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>(`/chat/${id}?forEveryone=${forEveryone}`, 'DELETE'); };

export const getGroups = async (): Promise<ChatGroup[]> => { const res = await apiCall<ChatGroup[]>('/groups'); return safeArray(res); };
export const createGroup = async (group: ChatGroup): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>('/groups', 'POST', group); };
export const updateGroup = async (group: ChatGroup): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>(`/groups/${group.id}`, 'PUT', group); };
export const deleteGroup = async (id: string): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>(`/groups/${id}`, 'DELETE'); };

export const getTaskGroups = async (): Promise<TaskGroup[]> => { const res = await apiCall<TaskGroup[]>('/task-groups'); return safeArray(res); };
export const createTaskGroup = async (group: TaskGroup): Promise<TaskGroup[]> => { return await apiCall<TaskGroup[]>('/task-groups', 'POST', group); };
export const updateTaskGroup = async (group: TaskGroup): Promise<TaskGroup[]> => { return await apiCall<TaskGroup[]>(`/task-groups/${group.id}`, 'PUT', group); };
export const deleteTaskGroup = async (id: string): Promise<TaskGroup[]> => { return await apiCall<TaskGroup[]>(`/task-groups/${id}`, 'DELETE'); };

export const getTasks = async (): Promise<GroupTask[]> => { const res = await apiCall<GroupTask[]>('/tasks'); return safeArray(res); };
export const createTask = async (task: GroupTask): Promise<GroupTask[]> => { return await apiCall<GroupTask[]>('/tasks', 'POST', task); };
export const updateTask = async (task: GroupTask): Promise<GroupTask[]> => { return await apiCall<GroupTask[]>(`/tasks/${task.id}`, 'PUT', task); };
export const deleteTask = async (id: string): Promise<GroupTask[]> => { return await apiCall<GroupTask[]>(`/tasks/${id}`, 'DELETE'); };

export const getSystemAnnouncements = async (): Promise<SystemAnnouncement[]> => { const res = await apiCall<SystemAnnouncement[]>('/announcements'); return safeArray(res); };
export const createSystemAnnouncement = async (announcement: SystemAnnouncement): Promise<SystemAnnouncement[]> => { return await apiCall<SystemAnnouncement[]>('/announcements', 'POST', announcement); };
export const deleteSystemAnnouncement = async (id: string): Promise<SystemAnnouncement[]> => { return await apiCall<SystemAnnouncement[]>(`/announcements/${id}`, 'DELETE'); };
export const updateSystemAnnouncement = async (announcement: SystemAnnouncement): Promise<SystemAnnouncement[]> => { return await apiCall<SystemAnnouncement[]>(`/announcements/${announcement.id}`, 'PUT', announcement); };

export const getTradeRecords = async (): Promise<TradeRecord[]> => { const res = await apiCall<TradeRecord[]>('/trade'); return safeArray(res); };
export const saveTradeRecord = async (record: TradeRecord): Promise<TradeRecord[]> => { return await apiCall<TradeRecord[]>('/trade', 'POST', record); };
export const updateTradeRecord = async (record: TradeRecord): Promise<TradeRecord[]> => { return await apiCall<TradeRecord[]>(`/trade/${record.id}`, 'PUT', record); };
export const deleteTradeRecord = async (id: string): Promise<TradeRecord[]> => { return await apiCall<TradeRecord[]>(`/trade/${id}`, 'DELETE'); };

// Notes Service
import { Note } from '../types';
export const getNotes = async (): Promise<Note[]> => { const res = await apiCall<Note[]>('/notes'); return safeArray(res); };
export const saveNote = async (note: Note): Promise<Note[]> => { return await apiCall<Note[]>('/notes', 'POST', note); };
export const updateNote = async (note: Note): Promise<Note[]> => { return await apiCall<Note[]>(`/notes/${note.id}`, 'PUT', note); };
export const deleteNote = async (id: string): Promise<Note[]> => { return await apiCall<Note[]>(`/notes/${id}`, 'DELETE'); };

export const uploadFile = async (fileName: string, fileData: string, category?: string): Promise<{ fileName: string, url: string }> => { 
    return await apiCall<{ fileName: string, url: string }>('/upload', 'POST', { fileName, fileData, category }); 
};

export const uploadTradeAttachment = async (
    file: File, 
    category: string = 'commercial/general',
    uploadedBy: string = 'کاربر',
    description?: string,
    subCategory?: string,
    refId?: string
): Promise<TradeAttachment> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const cleanCat = category.replace(/[^a-zA-Z0-9_\-\/]/g, '').trim() || 'commercial/general';
    const uploadUrl = getEffectiveApiUrl(`/upload-file?category=${encodeURIComponent(cleanCat)}`);
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: formData
    });
    
    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'خطا در بارگذاری فایل در سرور');
    }
    
    const result = await response.json();
    return {
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        fileName: result.fileName || file.name,
        url: result.url,
        fileSize: result.fileSize || file.size,
        fileType: result.fileType || file.type,
        category: cleanCat,
        subCategory,
        refId,
        uploadedAt: Date.now(),
        uploadedBy,
        description
    };
};

export const deleteUploadedFile = async (url: string): Promise<boolean> => {
    try {
        if (!url || !url.startsWith('/uploads/')) return false;
        const res = await apiCall<{ success: boolean }>('/delete-file', 'POST', { url });
        return !!res?.success;
    } catch (e) {
        console.warn("Could not delete file from server:", e);
        return false;
    }
};

// Helper: Direct high-speed multipart upload with granular native progress (0% - 100%)
const uploadFileDirectWithProgress = (file: File, onProgress: (p: number) => void): Promise<{ fileName: string, url: string }> => {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        const targetUrl = getEffectiveApiUrl('/upload-file');

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && e.total > 0) {
                const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
                onProgress(percent);
            }
        });

        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const res = JSON.parse(xhr.responseText);
                        if (res && res.url) {
                            onProgress(100);
                            resolve({ fileName: res.fileName || file.name, url: res.url });
                            return;
                        }
                    } catch (e) {
                        reject(new Error("پاسخ سرور در قالب نامعتبر است"));
                        return;
                    }
                }
                let errorMsg = `خطای سرور: ${xhr.status}`;
                try {
                    const errObj = JSON.parse(xhr.responseText);
                    if (errObj && (errObj.error || errObj.message)) errorMsg = errObj.error || errObj.message;
                } catch (_) {}
                reject(new Error(errorMsg));
            }
        };

        xhr.onerror = () => reject(new Error("خطای ارتباط با سرور در ارسال مستقیم فایل"));
        xhr.ontimeout = () => reject(new Error("زمان مجاز آپلود به پایان رسید"));

        xhr.open('POST', targetUrl, true);
        xhr.timeout = 300000; // 5 minutes timeout

        const token = getAuthToken();
        if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.send(formData);
    });
};

export const uploadFileChunked = async (file: File, onProgress: (p: number) => void): Promise<{ fileName: string, url: string }> => {
    // Strategy 1: Direct High-Speed Multipart Upload (Fastest, zero base64 memory inflation, streams directly)
    // Supports files up to 90MB (within multer 100MB limit). Covers 99.9% of user files.
    if (file.size <= 90 * 1024 * 1024) {
        try {
            const directRes = await uploadFileDirectWithProgress(file, onProgress);
            if (directRes && directRes.url) {
                return directRes;
            }
        } catch (directErr: any) {
            console.warn("Direct upload fallback to chunked upload:", directErr.message || directErr);
            // If direct upload returned 404 or connection issue, proceed to chunked fallback
        }
    }

    // Strategy 2: Resilient Chunked Upload
    const uploadId = Date.now().toString() + '_' + Math.floor(Math.random() * 1000);
    const chunkSize = 2 * 1024 * 1024; // 2MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        // Convert chunk to base64
        const chunkBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(chunk);
        });
        
        // Chunk upload with retry
        let success = false;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!success && attempts < maxAttempts) {
            try {
                attempts++;
                await apiCall('/upload-chunk', 'POST', {
                    uploadId,
                    chunkIndex: i,
                    chunkData: chunkBase64
                });
                success = true;
            } catch (err) {
                console.warn(`Upload chunk ${i} failed (Attempt ${attempts}/${maxAttempts})`, err);
                if (attempts >= maxAttempts) throw err;
                await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempts), 5000)));
            }
        }
        
        onProgress(Math.min(95, Math.round(((i + 1) / totalChunks) * 92)));
    }
    
    // Finish upload with retry
    let finishResponse: any = null;
    let finishAttempts = 0;
    while (!finishResponse && finishAttempts < 4) {
        try {
            finishAttempts++;
            finishResponse = await apiCall<{ fileName: string, url: string }>('/upload-finish', 'POST', {
                uploadId,
                fileName: file.name,
                totalChunks
            });
        } catch (err: any) {
            console.warn(`Finish upload failed (Attempt ${finishAttempts})`, err);
            // Also try fallback endpoint without /api prefix or via direct fetch
            try {
                const altUrl = getEffectiveApiUrl('/upload-finish');
                const altRes = await fetch(altUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(getAuthToken() ? { 'Authorization': `Bearer ${getAuthToken()}` } : {})
                    },
                    body: JSON.stringify({ uploadId, fileName: file.name, totalChunks })
                });
                if (altRes.ok) {
                    finishResponse = await altRes.json();
                    break;
                }
            } catch (_) {}

            if (finishAttempts >= 4) {
                // If chunked finish failed and file is reasonably sized (< 20MB), attempt Strategy 3
                if (file.size <= 20 * 1024 * 1024) {
                    try {
                        const base64Data = await new Promise<string>((resolve, reject) => {
                            const r = new FileReader();
                            r.onload = () => resolve(r.result as string);
                            r.onerror = reject;
                            r.readAsDataURL(file);
                        });
                        const b64Res = await apiCall<{ fileName: string, url: string }>('/upload', 'POST', {
                            fileName: file.name,
                            fileData: base64Data
                        });
                        if (b64Res && b64Res.url) {
                            onProgress(100);
                            return b64Res;
                        }
                    } catch (_) {}
                }
                throw err;
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    
    onProgress(100);
    return finishResponse;
};
export const getWarehouseItems = async (): Promise<WarehouseItem[]> => { const res = await apiCall<WarehouseItem[]>('/warehouse/items'); return safeArray(res); };
export const saveWarehouseItem = async (item: WarehouseItem): Promise<WarehouseItem[]> => { return await apiCall<WarehouseItem[]>('/warehouse/items', 'POST', item); };
export const updateWarehouseItem = async (item: WarehouseItem): Promise<WarehouseItem[]> => { return await apiCall<WarehouseItem[]>(`/warehouse/items/${item.id}`, 'PUT', item); };
export const deleteWarehouseItem = async (id: string): Promise<WarehouseItem[]> => { return await apiCall<WarehouseItem[]>(`/warehouse/items/${id}`, 'DELETE'); };
export const getWarehouseTransactions = async (): Promise<WarehouseTransaction[]> => { const res = await apiCall<WarehouseTransaction[]>('/warehouse/transactions'); return safeArray<WarehouseTransaction>(res); };
export const saveWarehouseTransaction = async (tx: WarehouseTransaction): Promise<WarehouseTransaction[]> => { 
    try {
        const cached = getLocalData<WarehouseTransaction[]>(LS_KEYS.WH_TX, []);
        if (cached && Array.isArray(cached)) {
            const updated = [tx, ...cached.filter((t: WarehouseTransaction) => t.id !== tx.id)];
            localStorage.setItem(LS_KEYS.WH_TX, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('WAREHOUSE_TX_OPTIMISTIC_APPLY', {
            detail: { txId: tx.id, tx, isNew: true }
        }));
    }
    const res = await apiCall<WarehouseTransaction[]>('/warehouse/transactions', 'POST', tx); 
    const safeRes = safeArray<WarehouseTransaction>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('WAREHOUSE_TX_BACKGROUND_SYNCED', {
            detail: { allTxs: safeRes, tx: safeRes.find((t: WarehouseTransaction) => t.id === tx.id) }
        }));
    }
    return safeRes;
};
export const updateWarehouseTransaction = async (tx: WarehouseTransaction): Promise<WarehouseTransaction[]> => { 
    try {
        const cached = getLocalData<WarehouseTransaction[]>(LS_KEYS.WH_TX, []);
        if (cached && Array.isArray(cached)) {
            const updated = cached.map((t: WarehouseTransaction) => t.id === tx.id ? tx : t);
            localStorage.setItem(LS_KEYS.WH_TX, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('WAREHOUSE_TX_OPTIMISTIC_APPLY', {
            detail: { txId: tx.id, tx, updates: tx }
        }));
    }
    const res = await apiCall<WarehouseTransaction[]>(`/warehouse/transactions/${tx.id}`, 'PUT', tx); 
    const safeRes = safeArray<WarehouseTransaction>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('WAREHOUSE_TX_BACKGROUND_SYNCED', {
            detail: { allTxs: safeRes, tx: safeRes.find((t: WarehouseTransaction) => t.id === tx.id) }
        }));
    }
    return safeRes;
};
export const deleteWarehouseTransaction = async (id: string): Promise<WarehouseTransaction[]> => { 
    try {
        const cached = getLocalData<WarehouseTransaction[]>(LS_KEYS.WH_TX, []);
        if (cached && Array.isArray(cached)) {
            const updated = cached.filter((t: WarehouseTransaction) => t.id !== id);
            localStorage.setItem(LS_KEYS.WH_TX, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('WAREHOUSE_TX_OPTIMISTIC_APPLY', {
            detail: { txId: id, isDeleted: true }
        }));
    }
    const res = await apiCall<WarehouseTransaction[]>(`/warehouse/transactions/${id}`, 'DELETE'); 
    const safeRes = safeArray<WarehouseTransaction>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('WAREHOUSE_TX_BACKGROUND_SYNCED', {
            detail: { allTxs: safeRes }
        }));
    }
    return safeRes;
};

export const getNextBijakNumber = async (company?: string): Promise<number> => { 
    try { 
        const url = company 
            ? `/next-bijak-number?company=${encodeURIComponent(company)}&t=${Date.now()}` 
            : `/next-bijak-number?t=${Date.now()}`;
        const response = await apiCall<{ nextNumber: number }>(url); 
        return response.nextNumber; 
    } catch (e) { 
        return 1001; 
    } 
};

// --- MEETINGS ---
export const getMeetings = async (): Promise<MeetingMinutes[]> => {
    try {
        const res = await apiCall<MeetingMinutes[]>('/meetings');
        const safeRes = safeArray<MeetingMinutes>(res);
        if (safeRes.length > 0) {
            try { localStorage.setItem(LS_KEYS.MEETINGS, JSON.stringify(safeRes)); } catch {}
        }
        return safeRes;
    } catch (e) {
        const cached = getLocalData<MeetingMinutes[]>(LS_KEYS.MEETINGS, []);
        return safeArray<MeetingMinutes>(cached);
    }
};

export const saveMeeting = async (meeting: MeetingMinutes): Promise<MeetingMinutes[]> => {
    try {
        const cached = getLocalData<MeetingMinutes[]>(LS_KEYS.MEETINGS, []);
        if (Array.isArray(cached)) {
            const updated = [meeting, ...cached.filter((m: MeetingMinutes) => m.id !== meeting.id)];
            localStorage.setItem(LS_KEYS.MEETINGS, JSON.stringify(updated));
        }
    } catch {}

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('MEETING_OPTIMISTIC_APPLY', {
            detail: { meetingId: meeting.id, meeting, isNew: true }
        }));
    }

    const res = await apiCall<MeetingMinutes[]>('/meetings', 'POST', meeting);
    const safeRes = safeArray<MeetingMinutes>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('MEETING_BACKGROUND_SYNCED', {
            detail: { allMeetings: safeRes, meeting: safeRes.find(m => m.id === meeting.id) }
        }));
    }
    return safeRes;
};

export const updateMeeting = async (meeting: MeetingMinutes): Promise<MeetingMinutes[]> => {
    try {
        const cached = getLocalData<MeetingMinutes[]>(LS_KEYS.MEETINGS, []);
        if (Array.isArray(cached)) {
            const updated = cached.map((m: MeetingMinutes) => m.id === meeting.id ? { ...m, ...meeting } : m);
            localStorage.setItem(LS_KEYS.MEETINGS, JSON.stringify(updated));
        }
    } catch {}

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('MEETING_OPTIMISTIC_APPLY', {
            detail: { meetingId: meeting.id, meeting, isUpdate: true }
        }));
    }

    const res = await apiCall<MeetingMinutes[]>(`/meetings/${meeting.id}`, 'PUT', meeting);
    const safeRes = safeArray<MeetingMinutes>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('MEETING_BACKGROUND_SYNCED', {
            detail: { allMeetings: safeRes, meeting: safeRes.find(m => m.id === meeting.id) }
        }));
    }
    return safeRes;
};

export const deleteMeeting = async (id: string): Promise<MeetingMinutes[]> => {
    try {
        const cached = getLocalData<MeetingMinutes[]>(LS_KEYS.MEETINGS, []);
        if (Array.isArray(cached)) {
            const updated = cached.filter((m: MeetingMinutes) => m.id !== id);
            localStorage.setItem(LS_KEYS.MEETINGS, JSON.stringify(updated));
        }
    } catch {}

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('MEETING_OPTIMISTIC_APPLY', {
            detail: { meetingId: id, isDeleted: true }
        }));
    }

    const res = await apiCall<MeetingMinutes[]>(`/meetings/${id}`, 'DELETE');
    const safeRes = safeArray<MeetingMinutes>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('MEETING_BACKGROUND_SYNCED', {
            detail: { allMeetings: safeRes }
        }));
    }
    return safeRes;
};

export const getNextMeetingNumber = async (): Promise<string> => {
    try {
        const response = await apiCall<{ nextNumber: string }>(`/next-meeting-number?t=${Date.now()}`);
        return response.nextNumber;
    } catch (e) {
        return 'M-' + Date.now();
    }
};

export const sendMeetingAnnouncement = async (meetingId: string): Promise<{ success: boolean }> => {
    return await apiCall<{ success: boolean }>(`/meetings/${meetingId}/announce`, 'POST');
};

export const sendMeetingMinutes = async (meetingId: string): Promise<{ success: boolean }> => {
    return await apiCall<{ success: boolean }>(`/meetings/${meetingId}/send-minutes`, 'POST');
};

// --- PURCHASE REQUESTS ---
import { PurchaseRequest, PurchaseRequestStatus, PartMasterData, PartKardex } from '../types';

export const getPurchaseRequests = async (): Promise<PurchaseRequest[]> => {
    try {
        const res = await apiCall<PurchaseRequest[]>('/purchase-requests');
        const safeRes = safeArray<PurchaseRequest>(res);
        if (safeRes.length > 0) {
            try {
                localStorage.setItem(LS_KEYS.PURCHASE_REQS, JSON.stringify(safeRes));
            } catch {}
        }
        return safeRes;
    } catch (e) {
        const cached = getLocalData<PurchaseRequest[]>(LS_KEYS.PURCHASE_REQS, []);
        if (cached && Array.isArray(cached) && cached.length > 0) {
            return cached;
        }
        throw e;
    }
};

export const savePurchaseRequest = async (req: PurchaseRequest): Promise<PurchaseRequest[]> => {
    try {
        const cached = getLocalData<PurchaseRequest[]>(LS_KEYS.PURCHASE_REQS, []);
        if (cached && Array.isArray(cached)) {
            const updated = [req, ...cached.filter((p: PurchaseRequest) => p.id !== req.id)];
            localStorage.setItem(LS_KEYS.PURCHASE_REQS, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('PURCHASE_REQ_OPTIMISTIC_APPLY', {
            detail: { reqId: req.id, targetStatus: req.status, request: req, isNew: true }
        }));
    }
    const res = await apiCall<PurchaseRequest[]>('/purchase-requests', 'POST', req);
    const safeRes = safeArray<PurchaseRequest>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('PURCHASE_REQ_BACKGROUND_SYNCED', {
            detail: { allPurchases: safeRes, request: safeRes.find((p: PurchaseRequest) => p.id === req.id) }
        }));
    }
    return safeRes;
};

export const updatePurchaseRequest = async (req: PurchaseRequest): Promise<PurchaseRequest[]> => {
    try {
        const cached = getLocalData<PurchaseRequest[]>(LS_KEYS.PURCHASE_REQS, []);
        if (cached && Array.isArray(cached)) {
            const updated = cached.map((p: PurchaseRequest) => p.id === req.id ? req : p);
            localStorage.setItem(LS_KEYS.PURCHASE_REQS, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('PURCHASE_REQ_OPTIMISTIC_APPLY', {
            detail: { reqId: req.id, targetStatus: req.status, request: req, updates: req }
        }));
    }
    const res = await apiCall<PurchaseRequest[]>(`/purchase-requests/${req.id}`, 'PUT', req);
    const safeRes = safeArray<PurchaseRequest>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('PURCHASE_REQ_BACKGROUND_SYNCED', {
            detail: { allPurchases: safeRes, request: safeRes.find((p: PurchaseRequest) => p.id === req.id) }
        }));
    }
    return safeRes;
};

export const deletePurchaseRequest = async (id: string): Promise<PurchaseRequest[]> => {
    try {
        const cached = getLocalData<PurchaseRequest[]>(LS_KEYS.PURCHASE_REQS, []);
        if (cached && Array.isArray(cached)) {
            const updated = cached.filter((p: PurchaseRequest) => p.id !== id);
            localStorage.setItem(LS_KEYS.PURCHASE_REQS, JSON.stringify(updated));
        }
    } catch {}
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('PURCHASE_REQ_OPTIMISTIC_APPLY', {
            detail: { reqId: id, isDeleted: true }
        }));
    }
    const res = await apiCall<PurchaseRequest[]>(`/purchase-requests/${id}`, 'DELETE');
    const safeRes = safeArray<PurchaseRequest>(res);
    if (typeof window !== 'undefined' && safeRes.length > 0) {
        window.dispatchEvent(new CustomEvent('PURCHASE_REQ_BACKGROUND_SYNCED', {
            detail: { allPurchases: safeRes }
        }));
    }
    return safeRes;
};

export const getNextPurchaseRequestNumber = async (): Promise<string> => {
    try {
        const response = await apiCall<{ nextNumber: string }>('/next-purchase-request-number');
        return response.nextNumber;
    } catch (e) {
        return 'PR-' + Date.now();
    }
};

// --- PART MASTER DATA & KARDEX ---
const PARTS_CACHE_KEY = 'app_data_parts';

export const getPartMasterData = async (): Promise<PartMasterData[]> => {
    try {
        const res = await apiCall<PartMasterData[]>('/part-master-data');
        const safe = safeArray<PartMasterData>(res);
        if (safe.length > 0) {
            try {
                localStorage.setItem(PARTS_CACHE_KEY, JSON.stringify(safe));
            } catch {}
        }
        return safe;
    } catch (e) {
        const cached = getLocalData<PartMasterData[]>(PARTS_CACHE_KEY, []);
        if (cached && Array.isArray(cached) && cached.length > 0) {
            return cached;
        }
        throw e;
    }
};

export const savePartMasterData = async (part: PartMasterData): Promise<PartMasterData[]> => {
    try {
        const cached = getLocalData<PartMasterData[]>(PARTS_CACHE_KEY, []);
        if (cached && Array.isArray(cached)) {
            const updated = [part, ...cached.filter((p: PartMasterData) => p.id !== part.id)];
            localStorage.setItem(PARTS_CACHE_KEY, JSON.stringify(updated));
        }
    } catch {}
    const res = await apiCall<PartMasterData[]>('/part-master-data', 'POST', part);
    const safe = safeArray<PartMasterData>(res);
    try {
        if (safe.length > 0) localStorage.setItem(PARTS_CACHE_KEY, JSON.stringify(safe));
    } catch {}
    return safe;
};

export const updatePartMasterData = async (part: PartMasterData): Promise<PartMasterData[]> => {
    try {
        const cached = getLocalData<PartMasterData[]>(PARTS_CACHE_KEY, []);
        if (cached && Array.isArray(cached)) {
            const updated = cached.map((p: PartMasterData) => p.id === part.id ? part : p);
            localStorage.setItem(PARTS_CACHE_KEY, JSON.stringify(updated));
        }
    } catch {}
    const res = await apiCall<PartMasterData[]>(`/part-master-data/${part.id}`, 'PUT', part);
    const safe = safeArray<PartMasterData>(res);
    try {
        if (safe.length > 0) localStorage.setItem(PARTS_CACHE_KEY, JSON.stringify(safe));
    } catch {}
    return safe;
};

export const deletePartMasterData = async (id: string): Promise<PartMasterData[]> => {
    return await apiCall<PartMasterData[]>(`/part-master-data/${id}`, 'DELETE');
};

export const getPartKardex = async (partId: string): Promise<PartKardex[]> => {
    const res = await apiCall<PartKardex[]>(`/part-kardex/${partId}`);
    return safeArray(res);
};

export interface SayanPartMatchResult {
    matched: boolean;
    part: {
        id: string;
        code: string;
        name: string;
        category?: string;
        unit?: string;
        type?: string;
        warehouseName?: string;
        warehouseCode?: string;
        stock: number;
    } | null;
    stock: number;
    confidence: number;
}

export const matchSayanPart = async (itemName: string, itemCode?: string): Promise<SayanPartMatchResult> => {
    try {
        if (!itemName?.trim() && !itemCode?.trim()) {
            return { matched: false, part: null, stock: 0, confidence: 0 };
        }
        return await apiCall<SayanPartMatchResult>('/sayan/match-part', 'POST', { 
            itemName: (itemName || '').trim(),
            itemCode: (itemCode || '').trim()
        });
    } catch (e) {
        return { matched: false, part: null, stock: 0, confidence: 0 };
    }
};

export const batchMatchSayanParts = async (items: Array<{ id?: string; itemName?: string; itemCode?: string; sayanItemCode?: string }>): Promise<Array<{ id?: string; itemName: string; matchResult: SayanPartMatchResult }>> => {
    try {
        if (!items || items.length === 0) return [];
        const res = await apiCall<{ success: boolean; results: Array<{ id?: string; itemName: string; matchResult: SayanPartMatchResult }> }>('/sayan/batch-match-parts', 'POST', { items });
        return res.results || [];
    } catch (e) {
        return [];
    }
};

export const enrichPurchaseRequestWithSayanStock = async (request: PurchaseRequest): Promise<PurchaseRequest> => {
    try {
        if (!request) return request;
        const res = await apiCall<{ success: boolean; request: PurchaseRequest }>('/sayan/enrich-purchase-request', 'POST', { request });
        return res.request || request;
    } catch (e) {
        return request;
    }
};

export const syncSayanFactoryParts = async (limit: number = 150): Promise<{ success: boolean; count: number; parts: PartMasterData[] }> => {
    return await apiCall<{ success: boolean; count: number; parts: PartMasterData[] }>('/sayan/sync-parts', 'POST', { limit });
};

// --- SECRETARIAT ---
import { SecretariatLetter, SecretariatCompanySettings, SecretariatTemplate } from '../types';

export const getSecretariatLetters = async (): Promise<SecretariatLetter[]> => {
    const res = await apiCall<SecretariatLetter[]>('/secretariat-letters');
    return safeArray(res);
};
export const saveSecretariatLetter = async (letter: SecretariatLetter): Promise<SecretariatLetter[]> => {
    return await apiCall<SecretariatLetter[]>('/secretariat-letters', 'POST', letter);
};
export const updateSecretariatLetter = async (letter: SecretariatLetter): Promise<SecretariatLetter[]> => {
    return await apiCall<SecretariatLetter[]>(`/secretariat-letters/${letter.id}`, 'PUT', letter);
};
export const deleteSecretariatLetter = async (id: string): Promise<SecretariatLetter[]> => {
    return await apiCall<SecretariatLetter[]>(`/secretariat-letters/${id}`, 'DELETE');
};

export const getSecretariatSettings = async (): Promise<SecretariatCompanySettings[]> => {
    const res = await apiCall<SecretariatCompanySettings[]>('/secretariat-settings');
    return safeArray(res);
};
export const saveSecretariatSettings = async (settings: SecretariatCompanySettings): Promise<SecretariatCompanySettings[]> => {
    return await apiCall<SecretariatCompanySettings[]>('/secretariat-settings', 'POST', settings);
};

export const getNextSecretariatLetterNumber = async (params: {
    companyId: string;
    section?: 'headquarters' | 'factory';
    year?: string;
}): Promise<{ nextNumber: string; sequence: number; prefix?: string; year?: string }> => {
    return await apiCall<{ nextNumber: string; sequence: number; prefix?: string; year?: string }>(
        `/secretariat/next-number?companyId=${params.companyId}&section=${params.section || 'headquarters'}${params.year ? `&year=${params.year}` : ''}`
    );
};

// Secretariat Templates & Word Import APIs
export const getSecretariatTemplates = async (): Promise<SecretariatTemplate[]> => {
    const res = await apiCall<SecretariatTemplate[]>('/secretariat-templates');
    return safeArray(res);
};

export const saveSecretariatTemplate = async (template: SecretariatTemplate): Promise<SecretariatTemplate[]> => {
    return await apiCall<SecretariatTemplate[]>('/secretariat-templates', 'POST', template);
};

export const deleteSecretariatTemplate = async (id: string): Promise<SecretariatTemplate[]> => {
    return await apiCall<SecretariatTemplate[]>(`/secretariat-templates/${id}`, 'DELETE');
};

export const importDocx = async (fileData: string): Promise<{ success: boolean; html: string; warnings?: any }> => {
    return await apiCall<{ success: boolean; html: string; warnings?: any }>('/secretariat/import-docx', 'POST', { fileData });
};

// --- CHEQUE RECEIPTS ---
export const getChequeReceipts = async (): Promise<ChequeReceipt[]> => {
    const res = await apiCall<ChequeReceipt[]>('/cheque-receipts');
    return safeArray(res);
};

export const saveChequeReceipt = async (receipt: ChequeReceipt): Promise<ChequeReceipt[]> => {
    return await apiCall<ChequeReceipt[]>('/cheque-receipts', 'POST', receipt);
};

export const updateChequeReceipt = async (receipt: ChequeReceipt): Promise<ChequeReceipt[]> => {
    return await apiCall<ChequeReceipt[]>(`/cheque-receipts/${receipt.id}`, 'PUT', receipt);
};

export const deleteChequeReceipt = async (id: string): Promise<ChequeReceipt[]> => {
    return await apiCall<ChequeReceipt[]>(`/cheque-receipts/${id}`, 'DELETE');
};

export const getNextChequeReceiptNumber = async (company?: string): Promise<string> => {
    try {
        const queryParam = company ? `&company=${encodeURIComponent(company)}` : '';
        const response = await apiCall<{ nextNumber: string }>(`/next-cheque-receipt-number?t=${Date.now()}${queryParam}`);
        return response.nextNumber;
    } catch (e) {
        return 'CR-' + Date.now();
    }
};

export const parseChequesFromDocument = async (fileData: string, fileName: string): Promise<{ cheques: ChequeItem[] }> => {
    return await apiCall<{ cheques: ChequeItem[] }>('/cheque-receipts/parse-cheques', 'POST', { fileData, fileName });
};

// --- DRIVER PAYMENTS ---
export const getDriverPayments = async (): Promise<DriverPayment[]> => {
    const res = await apiCall<DriverPayment[]>('/security/driver-payments');
    return safeArray(res);
};

export const saveDriverPayment = async (payment: DriverPayment): Promise<DriverPayment[]> => {
    return await apiCall<DriverPayment[]>('/security/driver-payments', 'POST', payment);
};

export const updateDriverPayment = async (payment: DriverPayment): Promise<DriverPayment[]> => {
    return await apiCall<DriverPayment[]>(`/security/driver-payments/${payment.id}`, 'PUT', payment);
};

export const deleteDriverPayment = async (id: string): Promise<DriverPayment[]> => {
    return await apiCall<DriverPayment[]>(`/security/driver-payments/${id}`, 'DELETE');
};

export const notifyDriverPaymentToBots = async (
    payment: DriverPayment,
    options?: { stage?: 'supervisor' | 'factory' | 'manual' | 'initial'; targetGroupId?: string; platform?: string }
): Promise<{ success: boolean; message?: string; count?: number }> => {
    return await apiCall<{ success: boolean; message?: string; count?: number }>('/security/driver-payments/notify', 'POST', {
        payment,
        stage: options?.stage,
        targetGroupId: options?.targetGroupId,
        platform: options?.platform,
        options
    });
};

// --- BIO-LINK & DIGITAL CARD (LEPAN LINK) SERVICES ---
export const getBioLinkConfig = async (isAdmin: boolean = false): Promise<BioLinkConfig> => {
    try {
        const query = isAdmin ? '?scope=admin' : '';
        const res = await apiCall<{ success: boolean; config: BioLinkConfig }>(`/bio-link${query}`);
        if (res && res.config) return res.config;
    } catch (e) {
        console.error("Failed to fetch BioLinkConfig:", e);
    }
    return {
        slug: 'lepanbaft',
        companyTitle: 'شرکت تولیدی لپان بافت',
        companySubtitle: 'تولید انواع نخ پلی استر ، کش ، اسپندکس ، POY و ساپورت',
        avatarUrl: '/lepan-logo.png',
        coverUrl: '/lepan-logo.svg',
        theme: 'lepan_light',
        blocks: []
    };
};

export const saveBioLinkConfig = async (config: Partial<BioLinkConfig>): Promise<BioLinkConfig> => {
    const res = await apiCall<{ success: boolean; config: BioLinkConfig }>('/bio-link', 'POST', config);
    return res.config;
};

export const submitBioLinkOrder = async (orderData: {
    customerName: string;
    customerPhone: string;
    productTitle?: string;
    quantity?: string;
    notes?: string;
}): Promise<{ success: boolean; message?: string; error?: string; order?: BioLinkOrder }> => {
    return await apiCall<{ success: boolean; message?: string; error?: string; order?: BioLinkOrder }>('/bio-link/order', 'POST', orderData);
};

export const submitBioLinkSurvey = async (surveyData: {
    customerName?: string;
    customerPhone?: string;
    qualityRating: number;
    deliveryRating: number;
    supportRating: number;
    comment?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> => {
    return await apiCall<{ success: boolean; message?: string; error?: string }>('/bio-link/survey', 'POST', surveyData);
};




