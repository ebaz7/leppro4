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
