package com.payment.system;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class DlkamBackgroundService extends Service {
    private static final String TAG = "DlkamBgService";
    private static final String PREFS_NAME = "CapacitorStorage";
    public static final String BG_CHANNEL_ID = "dlkam_bg_service_channel";
    public static final int FOREGROUND_NOTIF_ID = 9901;
    private static final int ALARM_REQ_CODE = 9902;

    private ScheduledExecutorService pollExecutor;

    public static void startServiceSafely(Context context) {
        if (context == null) return;
        try {
            Intent serviceIntent = new Intent(context, DlkamBackgroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.w(TAG, "startServiceSafely fallback to regular startService", e);
            try {
                Intent serviceIntent = new Intent(context, DlkamBackgroundService.class);
                context.startService(serviceIntent);
            } catch (Exception ignored) {}
        }
    }

    public static boolean hasLoggedInUser(Context context) {
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
        ensureBackgroundChannel();
        startForegroundSafely();
        startContinuousPoller();
        scheduleDozeWakeupAlarm(getApplicationContext(), 90_000L);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureBackgroundChannel();
        startForegroundSafely();
        startContinuousPoller();
        scheduleDozeWakeupAlarm(getApplicationContext(), 90_000L);

        // Execute an immediate background poll on every service command/alarm wakeup
        if (pollExecutor != null && !pollExecutor.isShutdown()) {
            pollExecutor.execute(this::runSinglePollWithWakeLock);
        }

        return START_STICKY;
    }

    private void ensureBackgroundChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                NotificationChannel channel = nm.getNotificationChannel(BG_CHANNEL_ID);
                if (channel == null) {
                    channel = new NotificationChannel(
                            BG_CHANNEL_ID,
                            "سرویس دریافت آنی اعلان‌های دلکام",
                            NotificationManager.IMPORTANCE_LOW
                    );
                    channel.setDescription("حفظ اتصال پس‌زمینه برای دریافت بدون تاخیر پیام‌ها و اعلان‌های کارتابل");
                    channel.setSound(null, null);
                    channel.enableVibration(false);
                    channel.enableLights(false);
                    channel.setShowBadge(false);
                    nm.createNotificationChannel(channel);
                }
            } catch (Exception e) {
                Log.w(TAG, "ensureBackgroundChannel error", e);
            }
        }
    }

    private void startForegroundSafely() {
        try {
            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openIntent, piFlags);

            Notification notification = new NotificationCompat.Builder(this, BG_CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_dlkam)
                    .setColor(0xFF2563EB)
                    .setContentTitle("سامانه هوشمند دلکام")
                    .setContentText("دریافت آنی اعلان‌ها در پس‌زمینه فعال است")
                    .setOngoing(true)
                    .setSilent(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setCategory(NotificationCompat.CATEGORY_SERVICE)
                    .setContentIntent(pendingIntent)
                    .build();

            if (Build.VERSION.SDK_INT >= 34) {
                try {
                    startForeground(
                            FOREGROUND_NOTIF_ID,
                            notification,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    );
                } catch (Exception e34) {
                    startForeground(FOREGROUND_NOTIF_ID, notification);
                }
            } else {
                startForeground(FOREGROUND_NOTIF_ID, notification);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForegroundSafely notice", e);
        }
    }

    private synchronized void startContinuousPoller() {
        if (pollExecutor != null && !pollExecutor.isShutdown()) {
            return;
        }
        pollExecutor = Executors.newSingleThreadScheduledExecutor();
        pollExecutor.scheduleWithFixedDelay(this::runSinglePollWithWakeLock, 3, 10, TimeUnit.SECONDS);
    }

    private void runSinglePollWithWakeLock() {
        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dlkam:BgPollWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(10_000L);
            }
            SyncWorker.pollAndDispatchNotifications(getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "Background poll iteration error", e);
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try {
                    wakeLock.release();
                } catch (Exception ignored) {}
            }
        }
    }

    public static void scheduleDozeWakeupAlarm(Context context, long delayMs) {
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
            long triggerAt = SystemClock.elapsedRealtime() + Math.max(30_000L, delayMs);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            }
        } catch (Exception e) {
            Log.w(TAG, "scheduleDozeWakeupAlarm error", e);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // When user swipes the app away from Recents, keep background notifications alive
        scheduleDozeWakeupAlarm(getApplicationContext(), 3_000L);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (pollExecutor != null && !pollExecutor.isShutdown()) {
            pollExecutor.shutdownNow();
        }
        if (hasLoggedInUser(getApplicationContext())) {
            scheduleDozeWakeupAlarm(getApplicationContext(), 4_000L);
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
