import { ExitPermit, ExitPermitStatus, User, AppSettings } from '../types';
import { updateExitPermitStatus, editExitPermit } from './storageService';
import { LS_KEYS, getLocalData } from './apiService';

export interface ExitPermitQueueTask {
    id: string;
    permitId: string;
    permitNumber: string | number;
    targetStatus?: ExitPermitStatus;
    prevStatus?: ExitPermitStatus;
    approverUser?: User;
    actionType?: 'STATUS_UPDATE' | 'EDIT_PERMIT' | 'REJECT' | 'CANCEL';
    extra?: {
        rejectionReason?: string;
        exitTime?: string;
        isReject?: boolean;
        isBackwardReject?: boolean;
        vehiclePlate?: string;
        driverName?: string;
        driverMobile?: string;
        attachments?: string[] | { fileName: string; data: string }[];
        weighbridgeKg?: number;
        weighbridgeDate?: string;
        weighbridgeTime?: string;
        items?: any[];
    };
    permitSnapshot?: ExitPermit;
    settings?: AppSettings | null;
    retryCount: number;
    nextRetryAt?: number;
    lastError?: string;
    createdAt: number;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

const QUEUE_STORAGE_KEY = 'vandar_exit_permit_queue_v2';

class ExitPermitQueueService {
    private queue: ExitPermitQueueTask[] = [];
    private runningTasks: Set<string> = new Set();
    private listeners: ((tasks: ExitPermitQueueTask[]) => void)[] = [];
    private intervalId: any = null;

    constructor() {
        this.loadQueue();
        this.setupEventListeners();
        this.startHeartbeat();
    }

    private setupEventListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('[ExitPermitQueue] Device came online. Triggering immediate queue sync.');
                this.processQueue(true);
            });
            window.addEventListener('focus', () => {
                this.processQueue();
            });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.processQueue();
                }
            });
        }
    }

    private startHeartbeat() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => {
            if (this.queue.length > 0) {
                this.processQueue();
            }
        }, 5000);
    }

    private loadQueue() {
        try {
            const raw = localStorage.getItem(QUEUE_STORAGE_KEY) || localStorage.getItem('vandar_exit_permit_queue_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.queue = parsed.filter(t => t.status === 'QUEUED' || t.status === 'PROCESSING');
                    // Reset any stale processing tasks back to queued
                    this.queue.forEach(t => { 
                        t.status = 'QUEUED'; 
                        t.nextRetryAt = 0;
                    });
                }
            }
        } catch (e) {
            console.error('Error loading exit permit queue from storage:', e);
            this.queue = [];
        }
    }

    private saveQueueTimer: any = null;

    private saveQueue() {
        this.notifyListeners();
        if (this.saveQueueTimer) clearTimeout(this.saveQueueTimer);
        this.saveQueueTimer = setTimeout(() => {
            try {
                // Strip heavy base64 data from localStorage queue persistence so JSON.stringify is <1ms and never hits QuotaExceededError
                const lightweightQueue = this.queue.map(t => ({
                    ...t,
                    permitSnapshot: t.permitSnapshot ? {
                        ...t.permitSnapshot,
                        attachments: Array.isArray(t.permitSnapshot.attachments)
                            ? t.permitSnapshot.attachments.map((a: any) => typeof a === 'object' && a?.data?.length > 1024 ? { ...a, data: '' } : a)
                            : t.permitSnapshot.attachments
                    } : undefined
                }));
                localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(lightweightQueue));
            } catch (e) {
                console.error('Error saving exit permit queue:', e);
            }
        }, 60);
    }

    public subscribe(listener: (tasks: ExitPermitQueueTask[]) => void) {
        this.listeners.push(listener);
        listener([...this.queue]);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => {
            try { l([...this.queue]); } catch (e) {}
        });
    }

    /**
     * Enqueues an exit permit approval or rejection in the background
     * without blocking the UI thread.
     */
    public enqueueApproval(taskParams: {
        permitId: string;
        permitNumber: string | number;
        targetStatus: ExitPermitStatus;
        prevStatus?: ExitPermitStatus;
        approverUser: User;
        extra?: ExitPermitQueueTask['extra'];
        permitSnapshot?: ExitPermit;
        settings?: AppSettings | null;
        actionType?: 'STATUS_UPDATE' | 'EDIT_PERMIT' | 'REJECT' | 'CANCEL';
    }): string {
        const taskId = `task_exit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newTask: ExitPermitQueueTask = {
            id: taskId,
            permitId: taskParams.permitId,
            permitNumber: taskParams.permitNumber,
            targetStatus: taskParams.targetStatus,
            prevStatus: taskParams.prevStatus,
            approverUser: taskParams.approverUser,
            actionType: taskParams.actionType || 'STATUS_UPDATE',
            extra: taskParams.extra,
            permitSnapshot: taskParams.permitSnapshot,
            settings: taskParams.settings,
            retryCount: 0,
            nextRetryAt: 0,
            createdAt: Date.now(),
            status: 'QUEUED'
        };

        // 1. Add to in-memory queue immediately (0ms) and schedule non-blocking storage persist
        this.queue.push(newTask);
        this.saveQueue();

        // 2. Defer localStorage EXIT_PERMITS cache update to background timer so UI never freezes
        setTimeout(() => {
            try {
                const cached = getLocalData<ExitPermit[]>(LS_KEYS.EXIT_PERMITS, []);
                if (Array.isArray(cached) && cached.length > 0) {
                    const updatedPermits = cached.map(p => {
                        if (p.id !== taskParams.permitId) return p;
                        const merged = taskParams.permitSnapshot
                            ? { ...p, ...taskParams.permitSnapshot }
                            : { ...p, status: taskParams.targetStatus, updatedAt: Date.now() };
                        return {
                            ...merged,
                            attachments: Array.isArray(merged.attachments)
                                ? merged.attachments.map((a: any) => typeof a === 'object' && a?.data?.length > 1024 ? { ...a, data: '' } : a)
                                : merged.attachments
                        };
                    });
                    localStorage.setItem(LS_KEYS.EXIT_PERMITS, JSON.stringify(updatedPermits));
                }
            } catch (e) {
                console.warn('Could not update LS_KEYS.EXIT_PERMITS in background:', e);
            }
        }, 120);

        // 3. Dispatch optimistic broadcast asynchronously so the active modal closes in the current frame first
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('EXIT_PERMIT_OPTIMISTIC_APPLY', {
                    detail: {
                        permitId: taskParams.permitId,
                        targetStatus: taskParams.targetStatus,
                        approverUser: taskParams.approverUser,
                        extra: taskParams.extra,
                        permit: taskParams.permitSnapshot,
                        taskId
                    }
                }));
            }, 0);
        }

        // 4. Kick off background network worker after browser paints modal close
        setTimeout(() => {
            this.processQueue(true);
        }, 35);

        return taskId;
    }

    public getPendingCount(): number {
        return this.queue.filter(t => t.status === 'QUEUED' || t.status === 'PROCESSING').length;
    }

    public async processQueue(forceNow = false) {
        const now = Date.now();
        const queuedTasks = this.queue.filter(t => 
            t.status === 'QUEUED' && 
            !this.runningTasks.has(t.id) &&
            (forceNow || !t.nextRetryAt || t.nextRetryAt <= now)
        );

        if (queuedTasks.length === 0) return;

        // Process queued tasks in parallel background workers
        await Promise.allSettled(
            queuedTasks.map(async (task) => {
                this.runningTasks.add(task.id);
                task.status = 'PROCESSING';
                this.saveQueue();

                let success = false;
                try {
                    let updatedPermits: ExitPermit[] = [];

                    if (task.actionType === 'EDIT_PERMIT' && task.permitSnapshot) {
                        updatedPermits = await editExitPermit(task.permitSnapshot, true);
                    } else if (task.targetStatus && task.approverUser) {
                        updatedPermits = await updateExitPermitStatus(
                            task.permitId,
                            task.targetStatus,
                            task.approverUser,
                            task.extra,
                            true
                        );
                    }

                    const updatedPermit = updatedPermits.find(p => p.id === task.permitId) || task.permitSnapshot;

                    // Trigger sync event with updated permit (lightweight single-item update preferred)
                    if (updatedPermit && typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('EXIT_PERMIT_BACKGROUND_SYNCED', {
                            detail: {
                                permit: updatedPermit,
                                allPermits: updatedPermits.length > 0 ? updatedPermits : undefined,
                                prevStatus: task.prevStatus || task.permitSnapshot?.status,
                                taskId: task.id
                            }
                        }));
                    }

                    success = true;
                } catch (err: any) {
                    console.error(`[ExitPermitQueue] Background Task error for #${task.permitNumber}:`, err);
                    task.retryCount = (task.retryCount || 0) + 1;
                    task.lastError = err?.message || 'Network error';

                    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, max 60s
                    const delayMs = Math.min(60000, 2000 * Math.pow(1.8, Math.min(task.retryCount, 6)));
                    task.nextRetryAt = Date.now() + delayMs;
                    task.status = 'QUEUED'; // NEVER drop unconfirmed tasks! Keep in queue until confirmed.
                } finally {
                    this.runningTasks.delete(task.id);
                }

                if (success) {
                    task.status = 'COMPLETED';
                    this.queue = this.queue.filter(t => t.id !== task.id);
                }

                this.saveQueue();
            })
        );
    }
}

export const exitPermitQueueService = new ExitPermitQueueService();
