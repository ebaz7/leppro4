import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNotificationUrlToTab, parseNotificationDeepLink, normalizeDigitsToEnglish } from '../utils/notificationDeepLink.ts';
import { getAppNavItems } from '../utils/navigationItems.ts';
import { UserRole } from '../types.ts';
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
    assert.equal(mapNotificationUrlToTab('/trade?tradeId=tr-12'), 'trade');
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

test('parseNotificationDeepLink extracts payment order, exit permit (including Persian digits), chat sender, purchase request, secretariat letter, trade, and warehouse bijak', () => {
    assert.equal(normalizeDigitsToEnglish('۱۰۸۸'), '1088');

    const orderLink = parseNotificationDeepLink(
        '/manage',
        '💸 دستور پرداخت جدید #۱۰۸۸',
        'شرکت: لیان بافت | مبلغ: 50,000,000 ریال'
    );
    assert.equal(orderLink.tab, 'manage');
    assert.equal(orderLink.trackingNumber, '1088');

    const orderByQuery = parseNotificationDeepLink('/manage?orderId=ord-77&trackingNumber=۱۰۹۰');
    assert.equal(orderByQuery.tab, 'manage');
    assert.equal(orderByQuery.orderId, 'ord-77');
    assert.equal(orderByQuery.trackingNumber, '1090');

    const permitLink = parseNotificationDeepLink(
        '/manage-exit',
        '🚛 برگه خروج کالا از کارخانه #۱۰',
        'گیرنده: مشتری تهران'
    );
    assert.equal(permitLink.tab, 'manage-exit');
    assert.equal(permitLink.permitNumber, '10');

    const permitTitleOnly = parseNotificationDeepLink(
        '',
        'برگه خروج شماره ۱۰ ثبت شد',
        'تایید مدیر کارخانه'
    );
    assert.equal(permitTitleOnly.tab, 'manage-exit');
    assert.equal(permitTitleOnly.permitNumber, '10');

    const permitQuery = parseNotificationDeepLink('/manage-exit?permitId=perm-10&permitNumber=10');
    assert.equal(permitQuery.tab, 'manage-exit');
    assert.equal(permitQuery.permitId, 'perm-10');
    assert.equal(permitQuery.permitNumber, '10');

    const chatByUrl = parseNotificationDeepLink('/chat?pv=ahmadi', 'پیام جدید از احمدی', 'سلام');
    assert.equal(chatByUrl.tab, 'chat');
    assert.equal(chatByUrl.pv, 'ahmadi');

    const chatByTitleOnly = parseNotificationDeepLink('/chat', '💬 پیام جدید از احمدی', 'لطفا فاکتور را بررسی کنید');
    assert.equal(chatByTitleOnly.tab, 'chat');
    assert.equal(chatByTitleOnly.pv, 'احمدی');

    const chatMention = parseNotificationDeepLink('/chat', '🔔 منشن جدید: احمدی در گفتگو', 'سلام');
    assert.equal(chatMention.tab, 'chat');
    assert.equal(chatMention.pv, 'احمدی');

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

    const tradeLink = parseNotificationDeepLink('/trade?tradeId=tr-555', 'بروزرسانی پرونده بازرگانی');
    assert.equal(tradeLink.tab, 'trade');
    assert.equal(tradeLink.tradeId, 'tr-555');
});

test('getAppNavItems allows manage-exit and authorized modules even when settings is null (cold start)', () => {
    const rolesWithExitAccess = [
        UserRole.ADMIN,
        UserRole.CEO,
        UserRole.FACTORY_MANAGER,
        UserRole.WAREHOUSE_KEEPER,
        UserRole.SECURITY_HEAD,
        UserRole.SECURITY_GUARD,
        UserRole.SALES_MANAGER
    ];

    for (const role of rolesWithExitAccess) {
        const items = getAppNavItems({
            id: `u-${role}`,
            username: `user_${role}`,
            fullName: `Test ${role}`,
            role
        }, null);
        const ids = items.map(i => i.id);
        assert.ok(ids.includes('manage-exit'), `Expected role ${role} to include manage-exit when settings is null`);
        assert.ok(ids.includes('chat'), `Expected role ${role} to include chat when settings is null`);
    }
});

test('touchZoomPan computes 2-finger pinch zoom and 4-directional pan accurately', () => {
    assert.equal(clampZoom(0.1), 0.5);
    assert.equal(clampZoom(10), 8);
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
    // even when the image is narrower than the viewport
    const panRightDown = clampPanOffsets(180, 220, 2.5, {
        viewportWidth: 400,
        viewportHeight: 700,
        contentWidth: 280,
        contentHeight: 500
    });
    assert.equal(panRightDown.panX, 180);
    assert.equal(panRightDown.panY, 220);

    const panLeftUp = clampPanOffsets(-180, -220, 2.5, {
        viewportWidth: 400,
        viewportHeight: 700,
        contentWidth: 280,
        contentHeight: 500
    });
    assert.equal(panLeftUp.panX, -180);
    assert.equal(panLeftUp.panY, -220);
});
