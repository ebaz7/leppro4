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
        String action = intent.getAction() != null ? intent.getAction() : "";
        Log.i(TAG, "BootReceiver triggered with action: " + action);

        try {
            if (DlkamBackgroundService.hasLoggedInUser(context) || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
                DlkamBackgroundService.startServiceSafely(context);
            }

            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();

            PeriodicWorkRequest syncRequest = new PeriodicWorkRequest.Builder(
                    SyncWorker.class,
                    15, TimeUnit.MINUTES
            )
            .setConstraints(constraints)
            .build();

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    "BackgroundDataSync",
                    ExistingPeriodicWorkPolicy.KEEP,
                    syncRequest
            );

            OneTimeWorkRequest immediateSync = new OneTimeWorkRequest.Builder(SyncWorker.class)
                    .setConstraints(constraints)
                    .build();
            WorkManager.getInstance(context).enqueue(immediateSync);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start background sync from BootReceiver", e);
        }
    }
}
