import test from 'node:test';
import assert from 'node:assert/strict';
import { 
    initNotificationQueue, 
    enqueueNotification, 
    acknowledgeNotification, 
    getPendingNotificationsForUser,
    getQueueDiagnostics 
} from '../backend/notification-queue.js';

test('Notification Queue: initialization and enqueuing with priority', async () => {
    const mockDb = {
        notificationQueue: [],
        subscriptions: []
    };
    const mockDbManager = {
        getDb: () => mockDb,
        saveDb: (d) => { Object.assign(mockDb, d); }
    };

    initNotificationQueue(mockDbManager);

    // Enqueue a high priority PV notification
    const queued1 = await enqueueNotification({
        id: 'test_pv_101',
        type: 'chat_pv',
        title: 'پیام از احمد',
        body: 'سلام، دستور پرداخت بررسی شد؟',
        url: '/chat?pv=ahmad',
        targetUsernames: ['reza'],
        excludeUsernames: ['ahmad'],
        priority: 1
    });

    assert.ok(queued1);
    assert.equal(queued1.id, 'test_pv_101');
    assert.equal(queued1.priority, 1);
    assert.equal(queued1.type, 'chat_pv');

    // Verify deduplication
    const dupe = await enqueueNotification({
        type: 'chat_pv',
        title: 'پیام از احمد',
        body: 'سلام، دستور پرداخت بررسی شد؟',
        url: '/chat?pv=ahmad',
        targetUsernames: ['reza'],
        priority: 1
    });
    assert.equal(dupe.id, 'test_pv_101', 'Should deduplicate identical rapid notification');

    // Test offline queue drainage for recipient 'reza'
    const pendingForReza = getPendingNotificationsForUser('reza');
    assert.equal(pendingForReza.length, 1);
    assert.equal(pendingForReza[0].id, 'test_pv_101');

    // Excluded sender 'ahmad' should receive 0 pending
    const pendingForAhmad = getPendingNotificationsForUser('ahmad');
    assert.equal(pendingForAhmad.length, 0);

    // Test Acknowledgement
    const ackSuccess = acknowledgeNotification('test_pv_101', 'reza');
    assert.equal(ackSuccess, true);

    // After ack, pending queue should be empty for reza
    const pendingAfterAck = getPendingNotificationsForUser('reza');
    assert.equal(pendingAfterAck.length, 0);

    // Verify Diagnostics
    const stats = getQueueDiagnostics();
    assert.ok(stats.totalQueued >= 1);
});

test('Notification Queue: role-targeted notifications are delivered to matching users via getPendingNotificationsForUser', async () => {
    const mockDb = {
        notificationQueue: [],
        subscriptions: [],
        users: [
            { username: 'ceo_user', role: 'CEO', roles: ['CEO'] },
            { username: 'warehouse_user', role: 'WAREHOUSE_KEEPER', roles: ['USER', 'WAREHOUSE_KEEPER'] }
        ]
    };
    const mockDbManager = {
        getDb: () => mockDb,
        saveDb: (d) => { Object.assign(mockDb, d); }
    };

    initNotificationQueue(mockDbManager);

    const roleNotif = await enqueueNotification({
        id: 'test_role_201',
        type: 'order_approval',
        title: 'دستور پرداخت جدید',
        body: 'نیاز به تایید مدیرعامل',
        url: '/manage',
        targetRoles: ['ceo'],
        excludeUsernames: ['requester'],
        priority: 2
    });
    assert.ok(roleNotif);

    const ceoPending = getPendingNotificationsForUser('ceo_user', ['CEO']);
    assert.equal(ceoPending.length, 1);
    assert.equal(ceoPending[0].id, 'test_role_201');

    const warehousePending = getPendingNotificationsForUser('warehouse_user', ['USER', 'WAREHOUSE_KEEPER']);
    assert.equal(warehousePending.length, 0);

    acknowledgeNotification('test_role_201', 'ceo_user');
    assert.equal(getPendingNotificationsForUser('ceo_user', ['CEO']).length, 0);
});
