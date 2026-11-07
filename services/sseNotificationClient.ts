/**
 * Client-Side Real-Time Notification & Chat SSE Stream (سرویس کلاینت توزیع آنی و تخلیه صف نوتیفیکیشن)
 * 
 * Provides:
 * - Persistent EventSource connection with auto-reconnection and exponential backoff.
 * - Zero-latency instant reception of PV messages, group chats, and system alerts.
 * - Automatic background drain of offline/pending queue notifications upon reconnect or wake-up.
 * - Direct triggering of Android status-bar and Windows Action Center notifications.
 */

import { sendNotification, hasNotificationBeenShown, markNotificationAsShown } from './notificationService';
import { apiCall } from './apiService';
import { User } from '../types';

let eventSourceInstance: EventSource | null = null;
let reconnectTimer: any = null;
let keepAliveWatchdog: any = null;
let currentConnectedUser: string | null = null;
let activeUserRef: User | null = null;
let reconnectAttempts = 0;
let isWakeListenersRegistered = false;

function registerWakeListeners() {
    if (isWakeListenersRegistered || typeof window === 'undefined') return;
    isWakeListenersRegistered = true;

    const onAppWake = () => {
        if (!activeUserRef || !activeUserRef.username) return;
        console.log('[SSE] Window focused/wake event detected. Checking stream health...');
        if (!eventSourceInstance || eventSourceInstance.readyState === EventSource.CLOSED) {
            connectSSE(activeUserRef);
        } else {
            drainOfflineQueue(activeUserRef.username);
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) onAppWake();
        });
    }
    window.addEventListener('focus', onAppWake);
    window.addEventListener('online', onAppWake);
}

const MAX_RECONNECT_DELAY = 15000;
const KEEPALIVE_TIMEOUT_MS = 45000;

function resetWatchdog(currentUser: User) {
    if (keepAliveWatchdog) clearTimeout(keepAliveWatchdog);
    keepAliveWatchdog = setTimeout(() => {
        console.warn('[SSE] Keepalive timeout exceeded. Forcing reconnection...');
        reconnectSSE(currentUser);
    }, KEEPALIVE_TIMEOUT_MS);
}

export function initSSENotificationClient(currentUser: User | null | undefined) {
    registerWakeListeners();
    if (!currentUser || !currentUser.username) {
        disconnectSSENotificationClient();
        return;
    }

    activeUserRef = currentUser;
    if (currentConnectedUser === currentUser.username && eventSourceInstance && eventSourceInstance.readyState === EventSource.OPEN) {
        return; // Already actively connected for this user
    }

    disconnectSSENotificationClient();
    activeUserRef = currentUser;
    currentConnectedUser = currentUser.username;
    connectSSE(currentUser);
}

function connectSSE(currentUser: User) {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
        return;
    }

    const username = currentUser.username;
    // Derive base URL (relative for web, or absolute for Android/Desktop if configured)
    const streamUrl = `/api/notifications/stream?username=${encodeURIComponent(username)}`;

    try {
        console.log(`[SSE] Connecting real-time notification stream for '${username}'...`);
        eventSourceInstance = new EventSource(streamUrl);

        eventSourceInstance.onopen = () => {
            console.log(`[SSE] Real-time notification stream connected successfully for '${username}'`);
            reconnectAttempts = 0;
            resetWatchdog(currentUser);
            // Drain any pending/missed notifications from server queue
            drainOfflineQueue(username);
        };

        // Listen for ping keep-alive from server
        eventSourceInstance.addEventListener('ping', () => {
            resetWatchdog(currentUser);
        });

        eventSourceInstance.addEventListener('connected', () => {
            resetWatchdog(currentUser);
        });

        // Listen for standard notifications
        eventSourceInstance.addEventListener('notification', async (event: MessageEvent) => {
            resetWatchdog(currentUser);
            try {
                const data = JSON.parse(event.data);
                if (!data || !data.title) return;

                const notifId = data.id || '';
                if (notifId && hasNotificationBeenShown(notifId)) {
                    return; // Avoid duplicate display
                }

                if (notifId) {
                    markNotificationAsShown(notifId);
                }

                // Fire cross-platform native notification (Android top status bar / Windows Action Center / Web)
                await sendNotification(data.title, data.body || '', {
                    id: data.id,
                    url: data.url,
                    type: data.type,
                    tab: (data.type?.includes('chat') || data.url?.includes('chat')) ? 'chat' : undefined,
                    priority: data.priority
                });

                // Acknowledge receipt to the server queue
                if (data.id) {
                    apiCall('/notifications/ack', 'POST', { id: data.id, username }).catch(() => {});
                }

                // Dispatch custom DOM event for active UI components
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('REALTIME_NOTIFICATION_RECEIVED', { detail: data }));
                }
            } catch (err) {
                console.error('[SSE] Error handling incoming notification event:', err);
            }
        });

        // Listen for real-time chat messages
        eventSourceInstance.addEventListener('chat_message', async (event: MessageEvent) => {
            resetWatchdog(currentUser);
            try {
                const msg = JSON.parse(event.data);
                if (!msg || !msg.id) return;

                const currentU = username.toLowerCase();
                // Never alert the sender themselves
                if (msg.senderUsername && msg.senderUsername.toLowerCase() === currentU) {
                    return;
                }

                // Broadcast raw message to chat views immediately
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('CHAT_MESSAGE_REALTIME', { detail: msg }));
                }

                // If this is a direct private message (PV) to me
                const isDirectPV = msg.recipient && msg.recipient.toLowerCase() === currentU;
                if (isDirectPV) {
                    const notifId = `chat_pv_${msg.id}`;
                    if (!hasNotificationBeenShown(notifId)) {
                        markNotificationAsShown(notifId);
                        
                        // Check if user is currently looking at this exact chat in foreground
                        const isLooking = typeof document !== 'undefined' && 
                            !document.hidden && 
                            window.location.hash.includes('chat') && 
                            window.location.search.includes(`pv=${msg.senderUsername}`);

                        if (!isLooking) {
                            const title = `پیام از ${msg.sender || msg.senderUsername}`;
                            const body = msg.message || (msg.audioUrl ? '🎤 پیام صوتی' : '📎 فایل ضمیمه');
                            await sendNotification(title, body, {
                                id: notifId,
                                url: `/chat?pv=${msg.senderUsername}`,
                                tab: 'chat',
                                type: 'chat_pv',
                                priority: 1
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('[SSE] Error handling chat_message event:', err);
            }
        });

        eventSourceInstance.onerror = (err) => {
            console.warn('[SSE] Stream disconnected or network interrupted:', err);
            reconnectSSE(currentUser);
        };

    } catch (e) {
        console.error('[SSE] Failed to initialize EventSource:', e);
        reconnectSSE(currentUser);
    }
}

function reconnectSSE(currentUser: User) {
    if (eventSourceInstance) {
        try { eventSourceInstance.close(); } catch (_) {}
        eventSourceInstance = null;
    }
    if (keepAliveWatchdog) {
        clearTimeout(keepAliveWatchdog);
        keepAliveWatchdog = null;
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);

    // Exponential backoff reconnect: 2s, 4s, 8s, up to 15s max
    const delay = Math.min(2000 * Math.pow(1.5, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;

    reconnectTimer = setTimeout(() => {
        if (currentConnectedUser === currentUser.username) {
            connectSSE(currentUser);
        }
    }, delay);
}

/**
 * Drain missed notifications that were queued while offline or sleeping
 */
async function drainOfflineQueue(username: string) {
    try {
        const pendingItems = await apiCall<any[]>(`/notifications/queue-pending?username=${encodeURIComponent(username)}`);
        if (Array.isArray(pendingItems) && pendingItems.length > 0) {
            console.log(`[SSE] Draining ${pendingItems.length} missed notifications from queue...`);
            for (const item of pendingItems) {
                if (item.id && !hasNotificationBeenShown(item.id)) {
                    markNotificationAsShown(item.id);
                    await sendNotification(item.title, item.body || '', {
                        id: item.id,
                        url: item.url,
                        type: item.type,
                        tab: (item.type?.includes('chat') || item.url?.includes('chat')) ? 'chat' : undefined,
                        priority: item.priority
                    });
                    apiCall('/notifications/ack', 'POST', { id: item.id, username }).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.warn('[SSE] Offline queue drainage error:', err);
    }
}

export function disconnectSSENotificationClient() {
    if (keepAliveWatchdog) {
        clearTimeout(keepAliveWatchdog);
        keepAliveWatchdog = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (eventSourceInstance) {
        try {
            eventSourceInstance.close();
        } catch (_) {}
        eventSourceInstance = null;
    }
    currentConnectedUser = null;
    activeUserRef = null;
    reconnectAttempts = 0;
}
