import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNotificationUrlToTab, parseNotificationDeepLink } from '../utils/notificationDeepLink.ts';
import {
    clampZoom,
    getTouchDistance,
    getTouchMidpoint,
    clampPanOffsets,
    computePinchZoomPan
} from '../utils/touchZoomPan.ts';

test('mapNotificationUrlToTab routes manage-exit and manage-invoices before manage', () => {
    assert.equal(mapNotificationUrlToTab('/manage-exit'), 'manage-exit');
    assert.equal(mapNotificationUrlToTab('/manage-exit?permitId=p1&permitNumber=205'), 'manage-exit');
    assert.equal(mapNotificationUrlToTab('/manage-invoices'), 'manage-invoices');
    assert.equal(mapNotificationUrlToTab('/manage?orderId=o1&trackingNumber=1042'), 'manage');
    assert.equal(mapNotificationUrlToTab('/production-meetings'), 'meetings');
    assert.equal(mapNotificationUrlToTab('meetings'), 'meetings');
    assert.equal(mapNotificationUrlToTab('/secretariat?letterId=l1'), 'secretariat');
});

test('parseNotificationDeepLink extracts exact meetingId and meetingNumber from URL or Persian title/body', () => {
    const fromQuery = parseNotificationDeepLink('/meetings?meetingId=uuid-1&meetingNumber=M-1037');
    assert.equal(fromQuery.tab, 'meetings');
    assert.equal(fromQuery.meetingId, 'uuid-1');
    assert.equal(fromQuery.meetingNumber, 'M-1037');

    // Legacy notification with bare URL 'meetings' and Persian title/body
    const fromLegacyText = parseNotificationDeepLink(
        'meetings',
        '📌 ارجاع مصوبه در صورتجلسه M-1037',
        'مصوباتی در صورتجلسه شماره M-1037 به شما ارجاع گردید'
    );
    assert.equal(fromLegacyText.tab, 'meetings');
    assert.equal(fromLegacyText.meetingNumber, 'M-1037');

    // Native Android MainActivity _nt / _nb query injection
    const fromNativeIntent = parseNotificationDeepLink(
        '/production-meetings?_nt=' +
            encodeURIComponent('تایید نهایی صورتجلسه M-1037') +
            '&_nb=' +
            encodeURIComponent('مدیرعامل صورتجلسه شماره M-1037 را تایید نهایی کرد.')
    );
    assert.equal(fromNativeIntent.tab, 'meetings');
    assert.equal(fromNativeIntent.meetingNumber, 'M-1037');
});

test('parseNotificationDeepLink extracts payment order, exit permit, purchase request, secretariat letter, and warehouse bijak', () => {
    const orderLink = parseNotificationDeepLink(
        '/manage',
        '💸 دستور پرداخت جدید #1088',
        'شرکت: لیان بافت | مبلغ: 50,000,000 ریال'
    );
    assert.equal(orderLink.tab, 'manage');
    assert.equal(orderLink.trackingNumber, '1088');

    const permitLink = parseNotificationDeepLink(
        '/manage-exit',
        '🚛 برگه خروج کالا از کارخانه #412',
        'گیرنده: مشتری تهران'
    );
    assert.equal(permitLink.tab, 'manage-exit');
    assert.equal(permitLink.permitNumber, '412');

    const purchaseLink = parseNotificationDeepLink(
        '/purchase?requestId=req-99&subTab=comments',
        '💬 نظر جدید در درخواست خرید #PR-99',
        'تایید شد'
    );
    assert.equal(purchaseLink.tab, 'purchase');
    assert.equal(purchaseLink.requestId, 'req-99');
    assert.equal(purchaseLink.subTab, 'comments');

    const secretariatLink = parseNotificationDeepLink(
        '/secretariat?letterId=let-55&letterNumber=HQ-1404/0021',
        '✉️ نامه اداری جدید #HQ-1404/0021',
        'موضوع: قرارداد'
    );
    assert.equal(secretariatLink.tab, 'secretariat');
    assert.equal(secretariatLink.letterId, 'let-55');
    assert.equal(secretariatLink.letterNumber, 'HQ-1404/0021');

    const warehouseLink = parseNotificationDeepLink(
        '/warehouse',
        '🚨 حواله خروج انبار (بیجک) #709',
        'شرکت: لیان بافت'
    );
    assert.equal(warehouseLink.tab, 'warehouse');
    assert.equal(warehouseLink.txNumber, '709');
});

test('touchZoomPan computes 2-finger pinch zoom and 4-directional pan accurately', () => {
    assert.equal(clampZoom(0.1), 0.5);
    assert.equal(clampZoom(10), 6);
    assert.equal(clampZoom(2.25), 2.25);

    const p1 = { x: 100, y: 100 };
    const p2 = { x: 200, y: 100 };
    assert.equal(getTouchDistance(p1, p2), 100);
    assert.deepEqual(getTouchMidpoint(p1, p2), { x: 150, y: 100 });

    // Pinch-out (zoom in 2x from 1x when fingers spread from 100px to 200px)
    const pinchResult = computePinchZoomPan({
        initialScale: 1,
        initialPanX: 0,
        initialPanY: 0,
        initialDistance: 100,
        currentDistance: 200,
        initialMidpoint: { x: 200, y: 300 },
        currentMidpoint: { x: 215, y: 285 },
        viewportCenter: { x: 200, y: 300 },
        bounds: {
            viewportWidth: 400,
            viewportHeight: 600,
            contentWidth: 400,
            contentHeight: 600
        }
    });
    assert.equal(pinchResult.scale, 2);
    // Midpoint moved +15 in X and -15 in Y while zooming around center
    assert.equal(pinchResult.panX, 15);
    assert.equal(pinchResult.panY, -15);

    // 4-directional pan clamping allows left, right, up, and down movement when zoomed in
    const panRightDown = clampPanOffsets(180, 220, 2.5, { viewportWidth: 400, viewportHeight: 600 });
    assert.equal(panRightDown.panX, 180);
    assert.equal(panRightDown.panY, 220);

    const panLeftUp = clampPanOffsets(-180, -220, 2.5, { viewportWidth: 400, viewportHeight: 600 });
    assert.equal(panLeftUp.panX, -180);
    assert.equal(panLeftUp.panY, -220);
});
