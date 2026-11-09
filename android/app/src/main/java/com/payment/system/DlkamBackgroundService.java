package com.payment.system;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.Nullable;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Lightweight, silent periodic background notification checker (Telegram/WhatsApp style).
 * - Never runs as a noisy foreground service and never displays a sticky status-bar notification.
 * - Checks for unread notifications at battery-friendly periodic intervals (60s-90s)
 *   and only displays a notification when an actual new message or event exists.
 */
public class DlkamBackgroundService extends Service {
    private static final String TAG = "DlkamBgService";
    private static final String PREFS_NAME = "CapacitorStorage";
    public static final String LEGACY_BG_CHANNEL_ID = "dlkam_bg_service_channel";
    public static final int LEGACY_FOREGROUND_NOTIF_ID = 9901;
    private static final int ALARM_REQ_CODE = 9902;

    // Periodic check intervals (battery-friendly: 60s when service active, 90s via AlarmManager in idle/background)
    private static final long SERVICE_POLL_INTERVAL_SECONDS = 60L;
    public static final long IDLE_ALARM_INTERVAL_MS = 90_000L;

    private ScheduledExecutorService pollExecutor;

    /**
     * Removes any legacy sticky foreground notification or channel so the notification shade stays completely clean.
     */
    public static void clearLegacyStickyNotification(Context context) {
        if (context == null) return;
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(LEGACY_FOREGROUND_NOTIF_ID);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    nm.deleteNotificationChannel(LEGACY_BG_CHANNEL_ID);
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Starts the background service silently (without startForegroundService) and schedules periodic AlarmManager checks.
     */
    public static void startServiceSafely(Context context) {
        if (context == null) return;
        clearLegacyStickyNotification(context);
        schedulePeriodicBackgroundCheck(context, IDLE_ALARM_INTERVAL_MS);
        try {
            Intent serviceIntent = new Intent(context, DlkamBackgroundService.class);
            context.startService(serviceIntent);
        } catch (Exception e) {
            // On Android 8+ when app is in background, startService may be restricted;
            // the periodic AlarmManager + BootReceiver.goAsync() + WorkManager handle background checks seamlessly.
            Log.d(TAG, "Background service deferred to periodic AlarmManager & WorkManager");
        }
    }

    public static boolean hasLoggedInUser(Context context) {
        if (context == null) return false;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String u1 = prefs.getString("_cap_user_username", null);
            String u2 = prefs.getString("user_username", null);
            return (u1 != null && !u1.trim().isEmpty()) || (u2 != null && !u2.trim().isEmpty());
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        clearLegacyStickyNotification(this);
        startPeriodicPoller();
        schedulePeriodicBackgroundCheck(getApplicationContext(), IDLE_ALARM_INTERVAL_MS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        clearLegacyStickyNotification(this);
        startPeriodicPoller();
        schedulePeriodicBackgroundCheck(getApplicationContext(), IDLE_ALARM_INTERVAL_MS);
        return START_STICKY;
    }

    private synchronized void startPeriodicPoller() {
        if (pollExecutor != null && !pollExecutor.isShutdown()) {
            return;
        }
        pollExecutor = Executors.newSingleThreadScheduledExecutor();
        pollExecutor.scheduleWithFixedDelay(
                this::runLightweightPoll,
                20L,
                SERVICE_POLL_INTERVAL_SECONDS,
                TimeUnit.SECONDS
        );
    }

    private void runLightweightPoll() {
        try {
            if (!hasLoggedInUser(getApplicationContext())) {
                return;
            }
            SyncWorker.pollAndDispatchNotifications(getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "Periodic poll iteration notice", e);
        }
    }

    /**
     * Schedules a low-power periodic check using AlarmManager so notifications are checked
     * at clean intervals even when the app is closed, without keeping the CPU continuously awake.
     */
    public static void schedulePeriodicBackgroundCheck(Context context, long delayMs) {
        if (context == null) return;
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, BootReceiver.class);
            intent.setAction("com.payment.system.ACTION_KEEPALIVE_PULSE");

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(context, ALARM_REQ_CODE, intent, flags);
            long safeDelay = Math.max(60_000L, delayMs);
            long triggerAt = SystemClock.elapsedRealtime() + safeDelay;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            }
        } catch (Exception e) {
            Log.w(TAG, "schedulePeriodicBackgroundCheck error", e);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        clearLegacyStickyNotification(getApplicationContext());
        if (hasLoggedInUser(getApplicationContext())) {
            schedulePeriodicBackgroundCheck(getApplicationContext(), 60_000L);
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (pollExecutor != null && !pollExecutor.isShutdown()) {
            pollExecutor.shutdownNow();
        }
        if (hasLoggedInUser(getApplicationContext())) {
            schedulePeriodicBackgroundCheck(getApplicationContext(), IDLE_ALARM_INTERVAL_MS);
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
