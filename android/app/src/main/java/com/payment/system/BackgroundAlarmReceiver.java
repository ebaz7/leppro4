package com.payment.system;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Battery-friendly background alarm receiver that keeps notification polling alive
 * even when Android places WorkManager into Doze/App Standby deferral windows.
 * Uses standard non-exact AlarmManager.setAndAllowWhileIdle (zero extra permissions).
 */
public class BackgroundAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "BackgroundAlarmReceiver";
    private static final ExecutorService ALARM_EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        final Context appContext = context.getApplicationContext();

        if (!SyncWorker.hasLoggedInUser(appContext)) {
            SyncWorker.cancelBackgroundAlarm(appContext);
            return;
        }

        final PendingResult pendingResult = goAsync();
        ALARM_EXECUTOR.execute(() -> {
            try {
                Log.d(TAG, "Background alarm wake triggered, polling notifications...");
                SyncWorker.pollAndDispatchNotifications(appContext);
            } catch (Exception e) {
                Log.w(TAG, "Background alarm poll error", e);
            } finally {
                try {
                    if (SyncWorker.hasLoggedInUser(appContext)) {
                        SyncWorker.scheduleNextBackgroundAlarm(appContext, 60L);
                        SyncWorker.scheduleNextPeriodicWorkPulse(appContext, SyncWorker.PERIODIC_PULSE_INTERVAL_SECONDS);
                    }
                } catch (Exception ignored) {}
                try {
                    pendingResult.finish();
                } catch (Exception ignored) {}
            }
        });
    }
}
