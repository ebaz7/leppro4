package com.payment.system;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String APP_FILES_FOLDER = "DlkamFiles";
    private static final int REQ_POST_NOTIFICATIONS = 1091;
    private ScheduledExecutorService nativePollExecutor;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Log.d(TAG, "Initializing MainActivity...");

        // Ensure Android 8+ notification channels and Android 13+ runtime permission are initialized immediately
        ensureNotificationChannels(this);
        requestPostNotificationsPermissionIfNeeded();

        // Save server URL in native SharedPreferences on start so SyncWorker has immediate access to it
        saveWebServerUrlToSharedPreferences();

        // Register Native File & Gallery Bridge on WebView + DownloadListener for APK / file downloads
        try {
            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                WebView webView = this.getBridge().getWebView();
                webView.addJavascriptInterface(new DlkamAndroidBridge(this), "DlkamAndroid");
                webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                    try {
                        android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(Uri.parse(url));
                        String fileName = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype);
                        if (fileName == null || fileName.trim().isEmpty()) {
                            fileName = "dlkam-android-latest.apk";
                        }
                        if (url.toLowerCase().contains(".apk") && !fileName.toLowerCase().endsWith(".apk")) {
                            fileName = fileName + ".apk";
                        }
                        String resolvedMime = (fileName.toLowerCase().endsWith(".apk") || (mimetype != null && mimetype.contains("package-archive")))
                                ? "application/vnd.android.package-archive"
                                : mimetype;
                        if (resolvedMime != null && !resolvedMime.isEmpty()) {
                            request.setMimeType(resolvedMime);
                        }
                        if (userAgent != null) {
                            request.addRequestHeader("User-Agent", userAgent);
                        }
                        request.setTitle(fileName);
                        request.setDescription("در حال دانلود فایل بروزرسانی سامانه...");
                        request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                        android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (dm != null) {
                            dm.enqueue(request);
                            android.widget.Toast.makeText(getApplicationContext(), "دانلود فایل آغاز شد (پوشه Downloads)...", android.widget.Toast.LENGTH_LONG).show();
                            return;
                        }
                    } catch (Exception dlErr) {
                        Log.w(TAG, "DownloadManager enqueue failed, falling back to ACTION_VIEW", dlErr);
                    }
                    try {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(browserIntent);
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register DlkamAndroid JavascriptInterface", e);
        }

        // Enqueue the WorkManager background synchronization task + live background executor
        setupScheduler();
        startFastNativeNotificationPoller();
    }

    private void syncWebViewUserToNativePrefsIfNeeded() {
        try {
            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                WebView webView = this.getBridge().getWebView();
                webView.evaluateJavascript(
                        "(function(){ try { var u = localStorage.getItem('app_current_user'); var h = localStorage.getItem('app_server_host') || localStorage.getItem('sayan_remote_server_url') || localStorage.getItem('sayan_active_api_url') || ''; var lowerH = String(h).toLowerCase(); if (!h || lowerH.indexOf('localhost') !== -1 || lowerH.indexOf('127.0.0.1') !== -1 || lowerH.indexOf('capacitor://') === 0 || lowerH.indexOf('http') !== 0) { h = 'https://dlkam.ir'; } if (u && window.DlkamAndroid && window.DlkamAndroid.syncSessionCredentialsNative) { var p = JSON.parse(u); if (p && p.username) { window.DlkamAndroid.syncSessionCredentialsNative(p.username, p.role || '', h); } } } catch(e){} })();",
                        null
                );
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        syncWebViewUserToNativePrefsIfNeeded();
    }

    @Override
    public void onPause() {
        syncWebViewUserToNativePrefsIfNeeded();
        try {
            Context appCtx = getApplicationContext();
            if (SyncWorker.hasLoggedInUser(appCtx)) {
                SyncWorker.scheduleNextPeriodicWorkPulse(appCtx, 60L);
                SyncWorker.scheduleNextBackgroundAlarm(appCtx, 60L);
            }
        } catch (Exception ignored) {}
        super.onPause();
    }

    @Override
    public void onStop() {
        syncWebViewUserToNativePrefsIfNeeded();
        try {
            Context appCtx = getApplicationContext();
            if (SyncWorker.hasLoggedInUser(appCtx)) {
                SyncWorker.scheduleNextPeriodicWorkPulse(
                        appCtx,
                        SyncWorker.PERIODIC_PULSE_INTERVAL_SECONDS
                );
                SyncWorker.scheduleNextBackgroundAlarm(appCtx, 60L);
            }
        } catch (Exception ignored) {}
        super.onStop();
    }

    @Override
    public void onDestroy() {
        if (nativePollExecutor != null && !nativePollExecutor.isShutdown()) {
            nativePollExecutor.shutdownNow();
        }
        try {
            Context appCtx = getApplicationContext();
            if (SyncWorker.hasLoggedInUser(appCtx)) {
                SyncWorker.scheduleNextPeriodicWorkPulse(
                        appCtx,
                        SyncWorker.PERIODIC_PULSE_INTERVAL_SECONDS
                );
                SyncWorker.scheduleNextBackgroundAlarm(appCtx, 60L);
            }
        } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void requestPostNotificationsPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                            this,
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            REQ_POST_NOTIFICATIONS
                    );
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not request POST_NOTIFICATIONS permission", e);
            }
        }
    }

    public static void ensureNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                NotificationChannel pvChannel = nm.getNotificationChannel("chat_pv_channel");
                if (pvChannel == null) {
                    pvChannel = new NotificationChannel(
                            "chat_pv_channel",
                            "پیام‌های شخصی و گفتگو (PV)",
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    pvChannel.setDescription("اعلان فوری پیام‌های خصوصی و گفتگوهای سازمانی دلکام");
                    pvChannel.enableVibration(true);
                    pvChannel.enableLights(true);
                    pvChannel.setVibrationPattern(new long[]{0, 250, 150, 250});
                    nm.createNotificationChannel(pvChannel);
                }

                NotificationChannel defaultChannel = nm.getNotificationChannel("fcm_default_channel");
                if (defaultChannel == null) {
                    defaultChannel = new NotificationChannel(
                            "fcm_default_channel",
                            "اعلان‌های سیستم خروج و پرداخت دلکام",
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    defaultChannel.setDescription("کانال اصلی اعلان‌های دستور پرداخت، کارتابل و برگه خروج");
                    defaultChannel.enableVibration(true);
                    defaultChannel.enableLights(true);
                    defaultChannel.setVibrationPattern(new long[]{0, 250, 150, 250});
                    nm.createNotificationChannel(defaultChannel);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to create notification channels", e);
            }
        }
    }

    public static void dispatchDlkamNotification(Context context, String notifId, String title, String body, String channelId, String targetUrl) {
        try {
            ensureNotificationChannels(context);
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager == null) return;

            String resolvedChannel = (channelId != null && !channelId.trim().isEmpty())
                    ? channelId.trim()
                    : "fcm_default_channel";

            String safeId = (notifId != null && !notifId.trim().isEmpty())
                    ? notifId.trim()
                    : ("dlkam_" + System.currentTimeMillis());

            Intent intent = new Intent(context, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (targetUrl != null && !targetUrl.isEmpty()) {
                intent.putExtra("targetUrl", targetUrl);
            }
            intent.putExtra("notificationId", safeId);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, safeId.hashCode(), intent, flags);

            Bitmap largeLogo = null;
            try {
                largeLogo = BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher);
            } catch (Exception ignored) {}

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, resolvedChannel)
                    .setSmallIcon(R.drawable.ic_stat_dlkam)
                    .setColor(0xFF2563EB)
                    .setContentTitle(title != null && !title.isEmpty() ? title : "سامانه دلکام")
                    .setContentText(body != null ? body : "")
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setContentIntent(pendingIntent);

            if (largeLogo != null) {
                builder.setLargeIcon(largeLogo);
            }

            notificationManager.notify(safeId.hashCode(), builder.build());
        } catch (Exception e) {
            Log.e(TAG, "dispatchDlkamNotification error", e);
        }
    }

    private File getDedicatedAppFolder() {
        File baseDir = getExternalFilesDir(null);
        if (baseDir == null) {
            baseDir = getFilesDir();
        }
        File folder = new File(baseDir, APP_FILES_FOLDER);
        if (!folder.exists()) {
            folder.mkdirs();
        }
        return folder;
    }

    private String sanitizeFileName(String name) {
        if (name == null || name.trim().isEmpty()) {
            return "file_" + System.currentTimeMillis();
        }
        return name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
    }

    private String resolveMimeType(String fileName, String fallbackMime) {
        if (fallbackMime != null && !fallbackMime.isEmpty() && !fallbackMime.equals("application/octet-stream")) {
            return fallbackMime;
        }
        int dot = fileName.lastIndexOf('.');
        if (dot >= 0 && dot < fileName.length() - 1) {
            String ext = fileName.substring(dot + 1).toLowerCase();
            if (ext.equals("apk")) return "application/vnd.android.package-archive";
            String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (guessed != null) return guessed;
            if (ext.equals("pdf")) return "application/pdf";
            if (ext.equals("xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            if (ext.equals("xls")) return "application/vnd.ms-excel";
            if (ext.equals("jpg") || ext.equals("jpeg")) return "image/jpeg";
            if (ext.equals("png")) return "image/png";
        }
        return "application/octet-stream";
    }

    public class DlkamAndroidBridge {
        private final Context context;

        public DlkamAndroidBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean showNativeNotification(String title, String body, String notifId, String channelId, String targetUrl) {
            try {
                dispatchDlkamNotification(context, notifId, title, body, channelId, targetUrl);
                return true;
            } catch (Exception e) {
                Log.e(TAG, "showNativeNotification bridge error", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean requestNotificationPermissionNative() {
            try {
                requestPostNotificationsPermissionIfNeeded();
                ensureNotificationChannels(context);
                SyncWorker.scheduleNextPeriodicWorkPulse(
                        context.getApplicationContext(),
                        SyncWorker.PERIODIC_PULSE_INTERVAL_SECONDS
                );
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean areNotificationsEnabledNative() {
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                            == PackageManager.PERMISSION_GRANTED;
                }
                return NotificationManagerCompat.from(context).areNotificationsEnabled();
            } catch (Exception e) {
                return true;
            }
        }

        @JavascriptInterface
        public boolean syncSessionCredentialsNative(String username, String role, String serverUrl) {
            try {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                SharedPreferences.Editor editor = prefs.edit();
                if (username != null && !username.trim().isEmpty()) {
                    String cleanUser = username.trim();
                    editor.putString("user_username", cleanUser);
                    editor.putString("_cap_user_username", cleanUser);
                    editor.putString("user_logged_in", "true");
                    editor.putString("_cap_user_logged_in", "true");
                }
                if (role != null && !role.trim().isEmpty()) {
                    String cleanRole = role.trim();
                    editor.putString("user_role", cleanRole);
                    editor.putString("_cap_user_role", cleanRole);
                }
                String safeUrl = SyncWorker.sanitizeServerUrl(serverUrl);
                editor.putString("server_url", safeUrl);
                editor.putString("_cap_server_url", safeUrl);
                editor.apply();
                Context appCtx = context.getApplicationContext();
                SyncWorker.scheduleNextPeriodicWorkPulse(
                        appCtx,
                        SyncWorker.PERIODIC_PULSE_INTERVAL_SECONDS
                );
                SyncWorker.scheduleNextBackgroundAlarm(appCtx, 60L);
                return true;
            } catch (Exception e) {
                Log.e(TAG, "syncSessionCredentialsNative error", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean clearSessionCredentialsNative() {
            try {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit()
                        .remove("user_username")
                        .remove("_cap_user_username")
                        .remove("user_role")
                        .remove("_cap_user_role")
                        .remove("user_logged_in")
                        .remove("_cap_user_logged_in")
                        .remove("app_current_user_data")
                        .remove("_cap_app_current_user_data")
                        .apply();
                Context appCtx = context.getApplicationContext();
                SyncWorker.cancelBackgroundAlarm(appCtx);
                try {
                    WorkManager.getInstance(appCtx).cancelUniqueWork(SyncWorker.PERIODIC_PULSE_WORK_NAME);
                } catch (Exception ignored) {}
                return true;
            } catch (Exception e) {
                Log.e(TAG, "clearSessionCredentialsNative error", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean hasFileInAppFolder(String fileName) {
            try {
                File target = new File(getDedicatedAppFolder(), sanitizeFileName(fileName));
                return target.exists() && target.length() > 0;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String getAppFolderFilePath(String fileName) {
            try {
                File target = new File(getDedicatedAppFolder(), sanitizeFileName(fileName));
                return target.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean saveFileToAppFolder(String base64Data, String fileName, String mimeType) {
            try {
                String cleanBase64 = base64Data;
                int commaIdx = cleanBase64.indexOf(',');
                if (commaIdx >= 0) {
                    cleanBase64 = cleanBase64.substring(commaIdx + 1);
                }
                byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                String safeName = sanitizeFileName(fileName);
                File target = new File(getDedicatedAppFolder(), safeName);
                try (FileOutputStream fos = new FileOutputStream(target)) {
                    fos.write(bytes);
                    fos.flush();
                }

                // Also export a copy into public Downloads/Dlkam on Android 10+ so user can access it from File Manager too
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        ContentResolver resolver = context.getContentResolver();
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                        values.put(MediaStore.Downloads.MIME_TYPE, resolveMimeType(safeName, mimeType));
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Dlkam");
                        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri != null) {
                            try (OutputStream os = resolver.openOutputStream(uri)) {
                                if (os != null) {
                                    os.write(bytes);
                                    os.flush();
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                }
                return true;
            } catch (Exception e) {
                Log.e(TAG, "saveFileToAppFolder error", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean openFileFromAppFolder(String fileName, String mimeType) {
            try {
                String safeName = sanitizeFileName(fileName);
                File target = new File(getDedicatedAppFolder(), safeName);
                if (!target.exists() || target.length() == 0) {
                    return false;
                }
                String resolvedMime = resolveMimeType(safeName, mimeType);
                if ("application/vnd.android.package-archive".equals(resolvedMime)) {
                    return installApkFromAppFolder(safeName);
                }

                Uri contentUri = FileProvider.getUriForFile(
                        context,
                        context.getPackageName() + ".fileprovider",
                        target
                );
                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                viewIntent.setDataAndType(contentUri, resolvedMime);
                viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                try {
                    context.startActivity(viewIntent);
                    return true;
                } catch (Exception openErr) {
                    Intent chooser = Intent.createChooser(viewIntent, safeName);
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(chooser);
                    return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "openFileFromAppFolder error", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean installApkFromAppFolder(String fileName) {
            try {
                String safeName = sanitizeFileName(fileName);
                File target = new File(getDedicatedAppFolder(), safeName);
                if (!target.exists() || target.length() == 0) {
                    Log.w(TAG, "installApkFromAppFolder: target file not found: " + safeName);
                    return false;
                }

                // Check unknown app install permission on Android 8+ (Oreo, API 26+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!context.getPackageManager().canRequestPackageInstalls()) {
                        Log.i(TAG, "Dlkam requires ACTION_MANAGE_UNKNOWN_APP_SOURCES permission");
                        Intent manageIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                        manageIntent.setData(Uri.parse("package:" + context.getPackageName()));
                        manageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(manageIntent);

                        android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                        mainHandler.post(() -> {
                            android.widget.Toast.makeText(context, "لطفاً دسترسی نصب برنامه‌های ناشناخته را برای دلکام فعال فرمایید.", android.widget.Toast.LENGTH_LONG).show();
                        });
                        return true;
                    }
                }

                Uri contentUri = FileProvider.getUriForFile(
                        context,
                        context.getPackageName() + ".fileprovider",
                        target
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

                context.startActivity(installIntent);
                return true;
            } catch (Exception e) {
                Log.e(TAG, "installApkFromAppFolder failed", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean openExternalUrl(String url) {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(browserIntent);
                return true;
            } catch (Exception e) {
                Log.e(TAG, "openExternalUrl error", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean saveImageToGallery(String base64Data, String fileName, String mimeType) {
            try {
                String cleanBase64 = base64Data;
                int commaIdx = cleanBase64.indexOf(',');
                if (commaIdx >= 0) {
                    cleanBase64 = cleanBase64.substring(commaIdx + 1);
                }
                byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                String safeName = sanitizeFileName(fileName);
                if (!safeName.toLowerCase().matches(".*\\.(jpg|jpeg|png|webp|gif)$")) {
                    safeName = safeName + ".jpg";
                }
                String resolvedMime = resolveMimeType(safeName, (mimeType == null || mimeType.isEmpty()) ? "image/jpeg" : mimeType);

                // Also save in app folder so app knows it's cached locally
                try {
                    File appCopy = new File(getDedicatedAppFolder(), safeName);
                    try (FileOutputStream fos = new FileOutputStream(appCopy)) {
                        fos.write(bytes);
                        fos.flush();
                    }
                } catch (Exception ignored) {}

                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName);
                values.put(MediaStore.Images.Media.MIME_TYPE, resolvedMime);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Dlkam");
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);
                    Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return false;
                    try (OutputStream os = resolver.openOutputStream(uri)) {
                        if (os == null) return false;
                        os.write(bytes);
                        os.flush();
                    }
                    values.clear();
                    values.put(MediaStore.Images.Media.IS_PENDING, 0);
                    resolver.update(uri, values, null, null);
                    return true;
                } else {
                    File picturesDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Dlkam");
                    if (!picturesDir.exists()) picturesDir.mkdirs();
                    File imageFile = new File(picturesDir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(imageFile)) {
                        fos.write(bytes);
                        fos.flush();
                    }
                    MediaScannerConnection.scanFile(context, new String[]{imageFile.getAbsolutePath()}, new String[]{resolvedMime}, null);
                    return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "saveImageToGallery error", e);
                return false;
            }
        }
    }

    private void saveWebServerUrlToSharedPreferences() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingUrl = prefs.getString("_cap_server_url", prefs.getString("server_url", ""));
            String safeUrl = SyncWorker.sanitizeServerUrl(existingUrl);
            if (!safeUrl.equals(existingUrl)) {
                prefs.edit()
                        .putString("server_url", safeUrl)
                        .putString("_cap_server_url", safeUrl)
                        .apply();
                Log.d(TAG, "Stored sanitized server URL (" + safeUrl + ") in Capacitor SharedPreferences.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to store server URL in SharedPreferences", e);
        }
    }

    private void startFastNativeNotificationPoller() {
        try {
            if (nativePollExecutor != null && !nativePollExecutor.isShutdown()) {
                return;
            }
            nativePollExecutor = Executors.newSingleThreadScheduledExecutor();
            // Battery-friendly 45-second periodic check while activity is alive
            nativePollExecutor.scheduleWithFixedDelay(() -> {
                try {
                    SyncWorker.pollAndDispatchNotifications(getApplicationContext());
                } catch (Exception e) {
                    Log.w(TAG, "Native periodic poll iteration error", e);
                }
            }, 15, 45, TimeUnit.SECONDS);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start native notification poller", e);
        }
    }

    private void setupScheduler() {
        Log.i(TAG, "Scheduling WorkManager Background Sync Task...");
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

            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                    "BackgroundDataSync",
                    ExistingPeriodicWorkPolicy.KEEP,
                    syncRequest
            );

            // Also run an immediate one-time sync on startup + schedule periodic 90s WorkManager pulse
            OneTimeWorkRequest immediateSync = new OneTimeWorkRequest.Builder(SyncWorker.class)
                    .setConstraints(constraints)
                    .build();
            WorkManager.getInstance(this).enqueue(immediateSync);
            SyncWorker.scheduleNextPeriodicWorkPulse(
                    getApplicationContext(),
                    SyncWorker.PERIODIC_PULSE_INTERVAL_SECONDS
            );
            SyncWorker.scheduleNextBackgroundAlarm(getApplicationContext(), 60L);
            
            Log.i(TAG, "WorkManager Background Sync Task successfully registered.");
        } catch (Exception e) {
            Log.e(TAG, "Error setting up WorkManager Background Sync Task", e);
        }
    }
}
