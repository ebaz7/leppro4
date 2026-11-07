import { MeetingMinutes, MeetingStatus, User } from '../types';
import { updateMeeting, sendMeetingMinutes } from './storageService';
import { LS_KEYS, getLocalData, apiCall } from './apiService';
import { sendMessage } from './storageService';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'mq_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
};

export interface MeetingQueueTask {
    id: string;
    meetingId: string;
    meetingNumber: string;
    meetingSnapshot: MeetingMinutes;
    actionType: 'APPROVE_FACTORY' | 'APPROVE_CEO' | 'SIGN' | 'STATUS_CHANGE' | 'UPDATE';
    user: User;
    retryCount: number;
    nextRetryAt?: number;
    lastError?: string;
    createdAt: number;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

const MEETING_QUEUE_STORAGE_KEY = 'vandar_meeting_queue_v1';

class MeetingQueueService {
    private queue: MeetingQueueTask[] = [];
    private runningTasks: Set<string> = new Set();
    private listeners: ((tasks: MeetingQueueTask[]) => void)[] = [];
    private intervalId: any = null;

    constructor() {
        this.loadQueue();
        this.setupEventListeners();
        this.startHeartbeat();
    }

    private setupEventListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('[MeetingQueue] Device came online. Triggering immediate queue sync.');
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
            const raw = localStorage.getItem(MEETING_QUEUE_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.queue = parsed.filter(t => t.status === 'QUEUED' || t.status === 'PROCESSING');
                    this.queue.forEach(t => { 
                        t.status = 'QUEUED'; 
                        t.nextRetryAt = 0;
                    });
                }
            }
        } catch (e) {
            console.error('Error loading meeting queue from storage:', e);
            this.queue = [];
        }
    }

    private saveQueue() {
        try {
            localStorage.setItem(MEETING_QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.error('Error saving meeting queue:', e);
        }
        this.notifyListeners();
    }

    public subscribe(listener: (tasks: MeetingQueueTask[]) => void) {
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
     * Enqueues a meeting approval or update, locks it into local storage,
     * fires optimistic event immediately, and kicks off background network worker.
     */
    public enqueueMeetingUpdate(params: {
        meeting: MeetingMinutes;
        actionType: MeetingQueueTask['actionType'];
        user: User;
    }): string {
        const taskId = `task_meet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newTask: MeetingQueueTask = {
            id: taskId,
            meetingId: params.meeting.id,
            meetingNumber: params.meeting.meetingNumber || '',
            meetingSnapshot: params.meeting,
            actionType: params.actionType,
            user: params.user,
            retryCount: 0,
            nextRetryAt: 0,
            createdAt: Date.now(),
            status: 'QUEUED'
        };

        // 1. Instantly lock into localStorage cache
        try {
            const cached = getLocalData<MeetingMinutes[]>(LS_KEYS.MEETINGS, []);
            if (Array.isArray(cached)) {
                const updatedMeetings = [
                    params.meeting,
                    ...cached.filter(m => m.id !== params.meeting.id)
                ];
                localStorage.setItem(LS_KEYS.MEETINGS, JSON.stringify(updatedMeetings));
            }
        } catch (e) {
            console.warn('Could not update LS_KEYS.MEETINGS immediately:', e);
        }

        // 2. Add to persistent queue
        this.queue.push(newTask);
        this.saveQueue();

        // 3. Dispatch optimistic broadcast for immediate UI rendering in all views
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('MEETING_OPTIMISTIC_APPLY', {
                detail: {
                    meetingId: params.meeting.id,
                    meeting: params.meeting,
                    actionType: params.actionType,
                    taskId
                }
            }));
        }

        // 4. Kick off background worker
        setTimeout(() => {
            this.processQueue(true);
        }, 10);

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

        await Promise.allSettled(
            queuedTasks.map(async (task) => {
                this.runningTasks.add(task.id);
                task.status = 'PROCESSING';
                this.saveQueue();

                let success = false;
                try {
                    // Step 1: Update meeting on server
                    const allMeetings = await updateMeeting(task.meetingSnapshot);

                    const updatedMeeting = (allMeetings || []).find(m => m.id === task.meetingId) || task.meetingSnapshot;

                    // Step 2: Trigger broadcast sync
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('MEETING_BACKGROUND_SYNCED', {
                            detail: {
                                meeting: updatedMeeting,
                                allMeetings: allMeetings,
                                taskId: task.id
                            }
                        }));
                    }

                    success = true;
                } catch (err: any) {
                    console.error(`[MeetingQueue] Background error for Meeting #${task.meetingNumber}:`, err);
                    task.retryCount = (task.retryCount || 0) + 1;
                    task.lastError = err?.message || 'Network error';

                    const delayMs = Math.min(60000, 2000 * Math.pow(1.8, Math.min(task.retryCount, 6)));
                    task.nextRetryAt = Date.now() + delayMs;
                    task.status = 'QUEUED'; // Keep in queue until confirmed
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

    private async dispatchBackgroundSideEffects(_task: MeetingQueueTask) {
        // Deprecated side effects to prevent duplicate notifications during background sync
    }
}

export const meetingQueueService = new MeetingQueueService();
