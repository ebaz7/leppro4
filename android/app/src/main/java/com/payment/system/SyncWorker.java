package com.payment.system;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class SyncWorker extends Worker {
    private static final String TAG = "SyncWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String DEFAULT_SERVER_URL = "https://dlkam.ir";

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Background synchronization started...");
        boolean ok = pollAndDispatchNotifications(getApplicationContext());
        return ok ? Result.success() : Result.retry();
    }

    public static synchronized boolean pollAndDispatchNotifications(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            String serverUrl = prefs.getString("_cap_server_url", null);
            if (serverUrl == null || serverUrl.isEmpty()) {
                serverUrl = prefs.getString("server_url", DEFAULT_SERVER_URL);
            }
            if (serverUrl == null || serverUrl.isEmpty()) {
                serverUrl = DEFAULT_SERVER_URL;
            }
            if (serverUrl.endsWith("/")) {
                serverUrl = serverUrl.substring(0, serverUrl.length() - 1);
            }

            String username = prefs.getString("_cap_user_username", null);
            if (username == null || username.isEmpty()) {
                username = prefs.getString("user_username", "");
            }

            String role = prefs.getString("_cap_user_role", null);
            if (role == null || role.isEmpty()) {
                role = prefs.getString("user_role", "");
            }

            if (username == null || username.isEmpty()) {
                return true;
            }

            int totalDisplayed = 0;

            // 1. Drain pending queue items (/api/notifications/queue-pending) for instant PV chat & cartable alerts
            try {
                String queueUrl = serverUrl + "/api/notifications/queue-pending?username=" + java.net.URLEncoder.encode(username, "UTF-8");
                JSONArray queueItems = fetchJsonArray(queueUrl);
                if (queueItems != null) {
                    for (int i = 0; i < queueItems.length(); i++) {
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
                            if (totalDisplayed < 4) {
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

            // 2. Check unread notifications (/api/notifications)
            if (role != null && !role.isEmpty()) {
                String queryUrl = serverUrl + "/api/notifications?username=" + java.net.URLEncoder.encode(username, "UTF-8")
                        + "&role=" + java.net.URLEncoder.encode(role, "UTF-8");
                JSONArray notifications = fetchJsonArray(queryUrl);
                if (notifications != null) {
                    for (int i = 0; i < notifications.length(); i++) {
                        JSONObject notif = notifications.optJSONObject(i);
                        if (notif == null) continue;
                        String id = notif.optString("id", "");
                        String title = notif.optString("title", "اعلان جدید");
                        String body = notif.optString("body", "");
                        String targetUrl = notif.optString("url", "");
                        if (id.isEmpty()) continue;

                        boolean isRead = false;
                        JSONArray readBy = notif.optJSONArray("readBy");
                        if (readBy != null) {
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
                            if (totalDisplayed < 4) {
                                String channel = targetUrl.contains("chat") ? "chat_pv_channel" : "fcm_default_channel";
                                MainActivity.dispatchDlkamNotification(context, id, title, body, channel, targetUrl);
                                totalDisplayed++;
                            }
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

    private static JSONArray fetchJsonArray(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Accept", "application/json");
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
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setRequestProperty("Content-Type", "application/json");

            JSONObject body = new JSONObject();
            body.put("username", username);
            body.put("id", id);

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
