package com.payment.system;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.util.Log;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        final Context appContext = context.getApplicationContext();
        String action = intent.getAction() != null ? intent.getAction() : "";
        Log.d(TAG, "BootReceiver triggered with action: " + action);

        DlkamBackgroundService.clearLegacyStickyNotification(appContext);

        // Schedule the next periodic interval check (every 90 seconds)
        if (DlkamBackgroundService.hasLoggedInUser(appContext) || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            DlkamBackgroundService.schedulePeriodicBackgroundCheck(appContext, DlkamBackgroundService.IDLE_ALARM_INTERVAL_MS);
        }

        // Ensure WorkManager periodic job is registered on boot or package update
        if (!"com.payment.system.ACTION_KEEPALIVE_PULSE".equals(action)) {
            try {
                Constraints constraints = new Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build();

                PeriodicWorkRequest syncRequest = new PeriodicWorkRequest.Builder(
                        SyncWorker.class,
                        15, TimeUnit.MINUTES
                )
                        .setConstraints(constraints)
                        .build();

                WorkManager.getInstance(appContext).enqueueUniquePeriodicWork(
                        "BackgroundDataSync",
                        ExistingPeriodicWorkPolicy.KEEP,
                        syncRequest
                );

                OneTimeWorkRequest immediateSync = new OneTimeWorkRequest.Builder(SyncWorker.class)
                        .setConstraints(constraints)
                        .build();
                WorkManager.getInstance(appContext).enqueue(immediateSync);
            } catch (Exception e) {
                Log.w(TAG, "WorkManager enqueue notice in BootReceiver", e);
            }
        }

        // Perform a fast, lightweight asynchronous notification check without any sticky Foreground Service
        if (DlkamBackgroundService.hasLoggedInUser(appContext)) {
            final PendingResult pendingResult = goAsync();
            new Thread(() -> {
                PowerManager.WakeLock wakeLock = null;
                try {
                    PowerManager pm = (PowerManager) appContext.getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dlkam:PeriodicCheckWakeLock");
                        wakeLock.setReferenceCounted(false);
                        wakeLock.acquire(5_000L);
                    }
                    SyncWorker.pollAndDispatchNotifications(appContext);
                } catch (Exception e) {
                    Log.w(TAG, "Periodic notification check notice", e);
                } finally {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        try {
                            wakeLock.release();
                        } catch (Exception ignored) {}
                    }
                    try {
                        pendingResult.finish();
                    } catch (Exception ignored) {}
                }
            }).start();
        }
    }
}
