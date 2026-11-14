package com.payment.system;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.TimeUnit;

public class SyncWorker extends Worker {
    private static final String TAG = "SyncWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    public static final String DEFAULT_SERVER_URL = "https://dlkam.ir";
    public static final String PERIODIC_PULSE_WORK_NAME = "DlkamPeriodicSyncPulse";
    public static final long PERIODIC_PULSE_INTERVAL_SECONDS = 90L;
    private static final int BACKGROUND_ALARM_REQ_CODE = 44019;

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Background synchronization started...");
        Context appContext = getApplicationContext();
        if (!hasLoggedInUser(appContext)) {
            cancelBackgroundAlarm(appContext);
            return Result.success();
        }
        boolean ok = pollAndDispatchNotifications(appContext);
        scheduleNextPeriodicWorkPulse(appContext, PERIODIC_PULSE_INTERVAL_SECONDS);
        scheduleNextBackgroundAlarm(appContext, 60L);
        return ok ? Result.success() : Result.retry();
    }

    public static String sanitizeServerUrl(String url) {
        if (url == null) return DEFAULT_SERVER_URL;
        String trimmed = url.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        String lower = trimmed.toLowerCase();
        if (trimmed.isEmpty()
                || (!lower.startsWith("http://") && !lower.startsWith("https://"))
                || lower.contains("://localhost")
                || lower.contains("://127.0.0.1")
                || lower.contains("://0.0.0.0")
                || lower.startsWith("capacitor://")) {
            return DEFAULT_SERVER_URL;
        }
        if (lower.endsWith("/api")) {
            trimmed = trimmed.substring(0, trimmed.length() - 4);
        }
        return trimmed.isEmpty() ? DEFAULT_SERVER_URL : trimmed;
    }

    public static boolean hasLoggedInUser(Context context) {
        if (context == null) return false;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String u1 = prefs.getString("_cap_user_username", null);
            String u2 = prefs.getString("user_username", null);
            if ((u1 != null && !u1.trim().isEmpty()) || (u2 != null && !u2.trim().isEmpty())) {
                return true;
            }
            String rawJson = prefs.getString("_cap_app_current_user_data", prefs.getString("app_current_user_data", null));
            return rawJson != null && rawJson.contains("username");
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Uses Android's official Jetpack WorkManager (JobScheduler) to schedule the next periodic
     * notification check in 90 seconds. Completely Play-Protect safe, zero sticky notifications,
     * and battery-friendly.
     */
    public static void scheduleNextPeriodicWorkPulse(Context context, long delaySeconds) {
        if (context == null) return;
        try {
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();

            long safeDelay = Math.max(60L, delaySeconds);
            OneTimeWorkRequest nextPulse = new OneTimeWorkRequest.Builder(SyncWorker.class)
                    .setConstraints(constraints)
                    .setInitialDelay(safeDelay, TimeUnit.SECONDS)
                    .build();

            WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(
                    PERIODIC_PULSE_WORK_NAME,
                    ExistingWorkPolicy.REPLACE,
                    nextPulse
            );
        } catch (Exception e) {
            Log.w(TAG, "scheduleNextPeriodicWorkPulse notice", e);
        }
    }

    public static void scheduleNextBackgroundAlarm(Context context, long delaySeconds) {
        if (context == null) return;
        try {
            Context appCtx = context.getApplicationContext();
            if (!hasLoggedInUser(appCtx)) {
                cancelBackgroundAlarm(appCtx);
                return;
            }
            AlarmManager am = (AlarmManager) appCtx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(appCtx, BackgroundAlarmReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(appCtx, BACKGROUND_ALARM_REQ_CODE, intent, flags);

            long triggerAt = SystemClock.elapsedRealtime() + Math.max(45L, delaySeconds) * 1000L;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
            }
        } catch (Exception e) {
            Log.w(TAG, "scheduleNextBackgroundAlarm notice", e);
        }
    }

    public static void cancelBackgroundAlarm(Context context) {
        if (context == null) return;
        try {
            Context appCtx = context.getApplicationContext();
            AlarmManager am = (AlarmManager) appCtx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(appCtx, BackgroundAlarmReceiver.class);
            int flags = PendingIntent.FLAG_NO_CREATE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(appCtx, BACKGROUND_ALARM_REQ_CODE, intent, flags);
            if (pendingIntent != null) {
                am.cancel(pendingIntent);
                pendingIntent.cancel();
            }
        } catch (Exception e) {
            Log.w(TAG, "cancelBackgroundAlarm notice", e);
        }
    }

    public static synchronized boolean pollAndDispatchNotifications(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            String rawServerUrl = prefs.getString("_cap_server_url", null);
            if (rawServerUrl == null || rawServerUrl.isEmpty()) {
                rawServerUrl = prefs.getString("server_url", DEFAULT_SERVER_URL);
            }
            String serverUrl = sanitizeServerUrl(rawServerUrl);
            if (!serverUrl.equals(rawServerUrl)) {
                prefs.edit()
                        .putString("server_url", serverUrl)
                        .putString("_cap_server_url", serverUrl)
                        .apply();
            }

            String username = prefs.getString("_cap_user_username", null);
            if (username == null || username.isEmpty()) {
                username = prefs.getString("user_username", "");
            }

            String role = prefs.getString("_cap_user_role", null);
            if (role == null || role.isEmpty()) {
                role = prefs.getString("user_role", "");
            }

            // Fallback: parse JSON from app_current_user_data if direct keys were not populated yet
            if (username == null || username.isEmpty() || role == null || role.isEmpty()) {
                String rawUserJson = prefs.getString("_cap_app_current_user_data", prefs.getString("app_current_user_data", null));
                if (rawUserJson != null && !rawUserJson.isEmpty()) {
                    try {
                        JSONObject userObj = new JSONObject(rawUserJson);
                        if (username == null || username.isEmpty()) {
                            username = userObj.optString("username", "");
                        }
                        if (role == null || role.isEmpty()) {
                            role = userObj.optString("role", "");
                        }
                    } catch (Exception ignored) {}
                }
            }

            if (username == null || username.trim().isEmpty()) {
                return true;
            }
            username = username.trim();
            if (role != null) {
                role = role.trim();
            }

            int totalDisplayed = 0;

            // 1. Drain pending queue items (/api/notifications/queue-pending) for instant PV chat & role/user cartable alerts
            try {
                String queueUrl = serverUrl + "/api/notifications/queue-pending?username=" + java.net.URLEncoder.encode(username, "UTF-8") + "&device=android";
                if (role != null && !role.isEmpty()) {
                    queueUrl += "&role=" + java.net.URLEncoder.encode(role, "UTF-8");
                }
                JSONArray queueItems = fetchJsonArray(queueUrl);
                if (queueItems != null) {
                    // Iterate newest-first so fresh alerts are never starved behind old unacked items
                    for (int i = queueItems.length() - 1; i >= 0; i--) {
                        JSONObject item = queueItems.optJSONObject(i);
                        if (item == null) continue;
                        String id = item.optString("id", "");
                        String title = item.optString("title", "اعلان جدید");
                        String body = item.optString("body", "");
                        String targetUrl = item.optString("url", "");
                        String type = item.optString("type", "");
                        if (id.isEmpty()) continue;

                        if (!isAlreadyShownLocally(prefs, id)) {
                            markShownLocally(prefs, id);
                            if (totalDisplayed < 5) {
                                String channel = (type.contains("chat") || targetUrl.contains("chat")) ? "chat_pv_channel" : "fcm_default_channel";
                                MainActivity.dispatchDlkamNotification(context, id, title, body, channel, targetUrl);
                                totalDisplayed++;
                            }
                        }
                        acknowledgeQueueItemOnServer(id, serverUrl, username);
                    }
                }
            } catch (Exception qErr) {
                Log.w(TAG, "Queue pending poll error", qErr);
            }

            // 2. Check unread notifications (/api/notifications) newest-first
            String queryUrl = serverUrl + "/api/notifications?username=" + java.net.URLEncoder.encode(username, "UTF-8");
            if (role != null && !role.isEmpty()) {
                queryUrl += "&role=" + java.net.URLEncoder.encode(role, "UTF-8");
            }
            JSONArray notifications = fetchJsonArray(queryUrl);
            if (notifications != null) {
                for (int i = notifications.length() - 1; i >= 0; i--) {
                    JSONObject notif = notifications.optJSONObject(i);
                    if (notif == null) continue;
                    String id = notif.optString("id", "");
                    String title = notif.optString("title", "اعلان جدید");
                    String body = notif.optString("body", "");
                    String targetUrl = notif.optString("url", "");
                    if (id.isEmpty()) continue;

                    boolean isRead = notif.optBoolean("read", false);
                    JSONArray readBy = notif.optJSONArray("readBy");
                    if (!isRead && readBy != null) {
                        for (int j = 0; j < readBy.length(); j++) {
                            if (username.equalsIgnoreCase(readBy.optString(j, ""))) {
                                isRead = true;
                                break;
                            }
                        }
                    }
                    if (isRead) continue;

                    if (!isAlreadyShownLocally(prefs, id)) {
                        markShownLocally(prefs, id);
                        if (totalDisplayed < 5) {
                            String channel = targetUrl.contains("chat") ? "chat_pv_channel" : "fcm_default_channel";
                            MainActivity.dispatchDlkamNotification(context, id, title, body, channel, targetUrl);
                            totalDisplayed++;
                        }
                    }
                }
            }

            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error performing background synchronization", e);
            return false;
        }
    }

    private static boolean isAlreadyShownLocally(SharedPreferences prefs, String id) {
        for (String key : new String[]{"_cap_shown_" + id, "shown_" + id}) {
            try {
                String val = prefs.getString(key, null);
                if ("true".equalsIgnoreCase(val)) return true;
            } catch (Exception ignored) {
                try {
                    if (prefs.getBoolean(key, false)) return true;
                } catch (Exception ignored2) {}
            }
        }
        return false;
    }

    private static void markShownLocally(SharedPreferences prefs, String id) {
        prefs.edit()
                .putString("_cap_shown_" + id, "true")
                .putString("shown_" + id, "true")
                .apply();
    }

    private static HttpURLConnection openConnectionWithRedirects(String urlStr, String method) throws Exception {
        String currentUrl = urlStr;
        for (int redirectCount = 0; redirectCount < 4; redirectCount++) {
            URL url = new URL(currentUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod(method);
            conn.setConnectTimeout(7000);
            conn.setReadTimeout(7000);
            conn.setRequestProperty("Accept", "application/json");
            if ("POST".equals(method)) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                return conn;
            }
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER
                    || code == 307
                    || code == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new Exception("Redirect without Location header");
                }
                URL nextUrl = new URL(url, location);
                currentUrl = nextUrl.toString();
                continue;
            }
            return conn;
        }
        throw new Exception("Too many redirects");
    }

    private static JSONArray fetchJsonArray(String urlStr) {
        HttpURLConnection conn = null;
        try {
            conn = openConnectionWithRedirects(urlStr, "GET");
            if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) {
                    response.append(line);
                }
                in.close();
                return new JSONArray(response.toString());
            }
        } catch (Exception e) {
            Log.w(TAG, "fetchJsonArray failed for " + urlStr + ": " + e.getMessage());
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
        return null;
    }

    private static void acknowledgeQueueItemOnServer(String id, String serverUrl, String username) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(serverUrl + "/api/notifications/ack");
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setRequestProperty("Content-Type", "application/json");

            JSONObject body = new JSONObject();
            body.put("username", username);
            body.put("id", id);
            body.put("device", "android");

            byte[] outputBytes = body.toString().getBytes("UTF-8");
            conn.getOutputStream().write(outputBytes);
            conn.getOutputStream().flush();
            conn.getOutputStream().close();
            conn.getResponseCode();
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }
}
