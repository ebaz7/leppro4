package com.payment.system;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
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
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            Log.i(TAG, "Device boot/update detected (" + action + "). Scheduling background notification sync...");
            Context appCtx = context.getApplicationContext();
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

                WorkManager.getInstance(appCtx).enqueueUniquePeriodicWork(
                        "BackgroundDataSync",
                        ExistingPeriodicWorkPolicy.KEEP,
                        syncRequest
                );

                if (SyncWorker.hasLoggedInUser(appCtx)) {
                    OneTimeWorkRequest immediateSync = new OneTimeWorkRequest.Builder(SyncWorker.class)
                            .setConstraints(constraints)
                            .build();
                    WorkManager.getInstance(appCtx).enqueue(immediateSync);
                    SyncWorker.scheduleNextPeriodicWorkPulse(appCtx, SyncWorker.PERIODIC_PULSE_INTERVAL_SECONDS);
                    SyncWorker.scheduleNextBackgroundAlarm(appCtx, 45L);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to schedule background sync on boot/replace", e);
            }
        }
    }
}
