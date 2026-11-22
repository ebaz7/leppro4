package com.payment.system;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.util.DisplayMetrics;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
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
    private static final int REQ_CAMERA_PERMISSION = 1092;
    private ScheduledExecutorService nativePollExecutor;
    private volatile String pendingNotificationTargetUrl = null;
    private PermissionRequest pendingWebViewPermissionRequest = null;
    private BroadcastReceiver hardwareBarcodeReceiver = null;
    private boolean isBarcodeReceiverRegistered = false;
    private String lastNativeBarcodeValue = "";
    private long lastNativeBarcodeAt = 0L;

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
                configureAdaptiveDisplayAndInsets(webView);
                configureCameraWebChromeClient(webView);
                webView.addJavascriptInterface(new DlkamAndroidBridge(this), "DlkamAndroid");
                webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                    try {
                        String guessedName = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype);
                        if (guessedName == null || guessedName.trim().isEmpty() || guessedName.equals("downloadfile.bin")) {
                            guessedName = "dlkam-file";
                        }
                        if (url != null && url.startsWith("data:")) {
                            byte[] decoded = decodeBase64Payload(url);
                            if (decoded != null && decoded.length > 0) {
                                String resolvedMime = resolveMimeType(guessedName, mimetype);
                                final String finalName = ensureExtensionForMime(sanitizeFileName(guessedName), resolvedMime);
                                PublicSaveResult res = saveBytesToPublicDownloadsAndCache(getApplicationContext(), decoded, finalName, resolvedMime);
                                if (res.ok) {
                                    android.widget.Toast.makeText(getApplicationContext(), "فایل در پوشه Downloads/Dlkam ذخیره شد: " + res.fileName, android.widget.Toast.LENGTH_LONG).show();
                                    openSavedFileInternal(getApplicationContext(), res.fileName, resolvedMime, res.uri);
                                    return;
                                }
                            }
                            android.widget.Toast.makeText(getApplicationContext(), "خطا در ذخیره فایل در حافظه گوشی", android.widget.Toast.LENGTH_SHORT).show();
                            return;
                        }
                        if (url != null && url.startsWith("blob:")) {
                            final String safeBlobName = sanitizeFileName(guessedName);
                            final String safeMime = resolveMimeType(safeBlobName, mimetype);
                            final String qUrl = org.json.JSONObject.quote(url);
                            final String qName = org.json.JSONObject.quote(safeBlobName);
                            final String qMime = org.json.JSONObject.quote(safeMime);
                            webView.evaluateJavascript(
                                "(function(){try{" +
                                "fetch(" + qUrl + ").then(function(r){return r.blob();}).then(function(b){" +
                                "var reader=new FileReader();" +
                                "reader.onloadend=function(){" +
                                "var b64=String(reader.result||'');" +
                                "var m=b.type||" + qMime + ";" +
                                "if(window.DlkamAndroid&&window.DlkamAndroid.saveFileToPublicDownloads){" +
                                "var raw=window.DlkamAndroid.saveFileToPublicDownloads(b64," + qName + ",m);" +
                                "var p={};try{p=JSON.parse(raw||'{}');}catch(e){}" +
                                "if(p.ok&&window.DlkamAndroid.openFileFromAppFolder){window.DlkamAndroid.openFileFromAppFolder(p.fileName||" + qName + ",m);}" +
                                "}" +
                                "};" +
                                "reader.readAsDataURL(b);" +
                                "}).catch(function(){});" +
                                "}catch(e){}})();",
                                null
                            );
                            android.widget.Toast.makeText(getApplicationContext(), "در حال ذخیره فایل در پوشه Downloads/Dlkam...", android.widget.Toast.LENGTH_SHORT).show();
                            return;
                        }
                        if (url == null || url.trim().isEmpty()) {
                            return;
                        }
                        String targetHttpUrl = url.trim();
                        if (!targetHttpUrl.startsWith("http://") && !targetHttpUrl.startsWith("https://")) {
                            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                            String baseServer = SyncWorker.sanitizeServerUrl(prefs.getString("_cap_server_url", prefs.getString("server_url", "")));
                            targetHttpUrl = baseServer.replaceAll("/+$", "") + (targetHttpUrl.startsWith("/") ? "" : "/") + targetHttpUrl;
                        }
                        String fileName = sanitizeFileName(guessedName);
                        if (targetHttpUrl.toLowerCase().contains(".apk") && !fileName.toLowerCase().endsWith(".apk")) {
                            fileName = fileName + ".apk";
                        }
                        String resolvedMime = (fileName.toLowerCase().endsWith(".apk") || (mimetype != null && mimetype.contains("package-archive")))
                                ? "application/vnd.android.package-archive"
                                : resolveMimeType(fileName, mimetype);
                        fileName = ensureExtensionForMime(fileName, resolvedMime);
                        android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(Uri.parse(targetHttpUrl));
                        if (resolvedMime != null && !resolvedMime.isEmpty()) {
                            request.setMimeType(resolvedMime);
                        }
                        if (userAgent != null) {
                            request.addRequestHeader("User-Agent", userAgent);
                        }
                        try {
                            String cookies = android.webkit.CookieManager.getInstance().getCookie(targetHttpUrl);
                            if (cookies != null && !cookies.isEmpty()) {
                                request.addRequestHeader("Cookie", cookies);
                            }
                        } catch (Exception ignored) {}
                        request.setTitle(fileName);
                        request.setDescription("در حال دانلود فایل...");
                        request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        String destFolderLabel = "Downloads/Dlkam";
                        try {
                            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                                File publicDlkam = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Dlkam");
                                if (!publicDlkam.exists()) {
                                    publicDlkam.mkdirs();
                                }
                            }
                            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Dlkam/" + fileName);
                        } catch (Exception subDirErr) {
                            Log.w(TAG, "Subfolder destination failed, using Downloads root", subDirErr);
                            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                            destFolderLabel = "Downloads";
                        }
                        android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (dm != null) {
                            dm.enqueue(request);
                            android.widget.Toast.makeText(getApplicationContext(), "دانلود فایل در پوشه " + destFolderLabel + " آغاز شد...", android.widget.Toast.LENGTH_LONG).show();
                            return;
                        }
                    } catch (Exception dlErr) {
                        Log.w(TAG, "DownloadManager enqueue failed", dlErr);
                    }
                    android.widget.Toast.makeText(getApplicationContext(), "خطا در دانلود مستقیم فایل؛ لطفاً مجدداً تلاش کنید.", android.widget.Toast.LENGTH_SHORT).show();
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register DlkamAndroid JavascriptInterface", e);
        }

        // Capture deep-link targetUrl if launched via tapping a notification (cold start)
        extractNotificationTargetUrl(getIntent());

        // Enqueue the WorkManager background synchronization task + live background executor
        setupScheduler();
        startFastNativeNotificationPoller();
    }

    /**
     * Ensures the Capacitor WebView fits strictly within every Android device's exact visible bounds
     * (from 4-inch industrial barcode PDAs to tablets & Android 15 edge-to-edge screens) without
     * clipping behind the top status bar, bottom navigation bar, or soft keyboard.
     */
    private void configureAdaptiveDisplayAndInsets(WebView webView) {
        try {
            // Keep decor fitting system windows so Android 15+ edge-to-edge never pushes UI under bars
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

            View rootContent = findViewById(android.R.id.content);
            if (rootContent != null) {
                ViewCompat.setOnApplyWindowInsetsListener(rootContent, (view, windowInsets) -> {
                    Insets bars = windowInsets.getInsets(
                            WindowInsetsCompat.Type.systemBars()
                                    | WindowInsetsCompat.Type.displayCutout()
                                    | WindowInsetsCompat.Type.ime()
                    );
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                    return WindowInsetsCompat.CONSUMED;
                });
                ViewCompat.requestApplyInsets(rootContent);
            }
        } catch (Exception insetErr) {
            Log.w(TAG, "WindowInsets adaptive setup warning", insetErr);
        }

        try {
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                if (settings != null) {
                    settings.setUseWideViewPort(true);
                    settings.setLoadWithOverviewMode(true);
                    // Normalize Android OS display/font zoom so small PDA screens never overflow modals
                    settings.setTextZoom(100);
                    settings.setSupportZoom(false);
                    settings.setBuiltInZoomControls(false);
                    settings.setDisplayZoomControls(false);
                }
                webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            }
        } catch (Exception webSettingsErr) {
            Log.w(TAG, "WebView adaptive settings warning", webSettingsErr);
        }
    }

    /**
     * Wraps Capacitor's BridgeWebChromeClient so WebView getUserMedia() camera requests
     * automatically trigger Android runtime CAMERA permission and grant RESOURCE_VIDEO_CAPTURE
     * across all Android 7-15+ phones and rugged barcode PDAs.
     */
    private void configureCameraWebChromeClient(WebView webView) {
        try {
            if (webView == null || this.getBridge() == null) return;
            webView.setWebChromeClient(new BridgeWebChromeClient(this.getBridge()) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    if (request == null) return;
                    runOnUiThread(() -> {
                        try {
                            String[] resources = request.getResources();
                            boolean needsCamera = false;
                            if (resources != null) {
                                for (String res : resources) {
                                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                                        needsCamera = true;
                                        break;
                                    }
                                }
                            }
                            if (needsCamera) {
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                        == PackageManager.PERMISSION_GRANTED) {
                                    request.grant(resources);
                                } else {
                                    if (pendingWebViewPermissionRequest != null) {
                                        try { pendingWebViewPermissionRequest.deny(); } catch (Exception ignored) {}
                                    }
                                    pendingWebViewPermissionRequest = request;
                                    ActivityCompat.requestPermissions(
                                            MainActivity.this,
                                            new String[]{Manifest.permission.CAMERA},
                                            REQ_CAMERA_PERMISSION
                                    );
                                }
                            } else {
                                super.onPermissionRequest(request);
                            }
                        } catch (Exception e) {
                            Log.w(TAG, "WebChromeClient onPermissionRequest error", e);
                            try { super.onPermissionRequest(request); } catch (Exception ignored) {}
                        }
                    });
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "configureCameraWebChromeClient warning", e);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA_PERMISSION) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            final PermissionRequest pending = pendingWebViewPermissionRequest;
            pendingWebViewPermissionRequest = null;
            if (pending != null) {
                try {
                    if (granted) {
                        pending.grant(pending.getResources());
                    } else {
                        pending.deny();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Pending WebView permission resolution error", e);
                }
            }
            try {
                if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                    final WebView wv = this.getBridge().getWebView();
                    wv.post(() -> wv.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('dlkam-camera-permission',{detail:{granted:" + (granted ? "true" : "false") + "}}));",
                            null
                    ));
                }
            } catch (Exception ignored) {}
        }
    }

    /**
     * Registers a universal BroadcastReceiver for industrial Android barcode PDAs
     * (Urovo, Chainway, Seuic, Newland, Zebra DataWedge, Honeywell, Sunmi, iData, Unitech, etc.)
     * so pressing the hardware SCAN key works even when the PDA is configured in Broadcast/Intent mode.
     */
    private void registerHardwareBarcodeReceiver() {
        if (isBarcodeReceiverRegistered) return;
        try {
            if (hardwareBarcodeReceiver == null) {
                hardwareBarcodeReceiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (intent == null) return;
                        String decoded = extractBarcodeFromIntent(intent);
                        if (decoded == null || decoded.isEmpty()) return;
                        long now = System.currentTimeMillis();
                        // Deduplicate identical double-broadcasts within 250ms
                        if (decoded.equals(lastNativeBarcodeValue) && (now - lastNativeBarcodeAt) < 250L) {
                            return;
                        }
                        lastNativeBarcodeValue = decoded;
                        lastNativeBarcodeAt = now;
                        dispatchHardwareBarcodeToWebView(decoded);
                    }
                };
            }
            IntentFilter filter = new IntentFilter();
            String[] actions = new String[]{
                    "android.intent.ACTION_DECODE_DATA",
                    "android.intent.action.SCANRESULT",
                    "scan.rcv.message",
                    "com.scanner.broadcast",
                    "com.scan.broadcast",
                    "com.android.decodewedge.decode_action",
                    "com.android.scanner.service_settings",
                    "com.android.server.scannerservice.broadcast",
                    "nlscan.action.SCANNER_RESULT",
                    "com.symbol.datawedge.api.RESULT_ACTION",
                    "com.motorolasolutions.emdk.datawedge.api.RESULT_ACTION",
                    "com.honeywell.decode.intent.action.EDIT_DATA",
                    "com.honeywell.ezpairing.SCAN_RESULT",
                    "com.honeywell.intent.action.SCAN_RESULT",
                    "com.seuic.scanner.action.BARCODE",
                    "com.seuic.scanner.action.BARCODE_DATA",
                    "com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED",
                    "com.urovo.scan.ACTION_DECODE_RESULT",
                    "urovo.rcv.message",
                    "com.idata.scan.action.DATA_RECEIVED",
                    "com.barcode.sendBroadcast",
                    "com.rscja.scanner.action.scanner.data",
                    "com.unitech.scanner.ACTION_BARCODE_DATA",
                    "com.cilico.scanner.ACTION_BARCODE_DATA",
                    "com.m3.scanner.ACTION_BARCODE_DATA",
                    "com.pda.scan.ACTION",
                    "com.chc.scanner.broadcast",
                    "com.xcheng.scanner.action.BARCODE_DECODING_BROADCAST",
                    "device.scanner.EVENT"
            };
            for (String act : actions) {
                filter.addAction(act);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(hardwareBarcodeReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(hardwareBarcodeReceiver, filter);
            }
            isBarcodeReceiverRegistered = true;
        } catch (Exception e) {
            Log.w(TAG, "registerHardwareBarcodeReceiver warning", e);
        }
    }

    private void unregisterHardwareBarcodeReceiver() {
        if (!isBarcodeReceiverRegistered || hardwareBarcodeReceiver == null) return;
        try {
            unregisterReceiver(hardwareBarcodeReceiver);
        } catch (Exception ignored) {
        } finally {
            isBarcodeReceiverRegistered = false;
        }
    }

    private String extractBarcodeFromIntent(Intent intent) {
        try {
            Bundle extras = intent.getExtras();
            if (extras == null) return null;
            String[] stringKeys = new String[]{
                    "barcode_string",
                    "com.symbol.datawedge.data_string",
                    "SCAN_BARCODE1",
                    "scannerdata",
                    "data",
                    "value",
                    "barcode",
                    "code",
                    "decode_rslt",
                    "result",
                    "text",
                    "barCode",
                    "EXTRA_BARCODE_DECODING_DATA",
                    "scan_result",
                    "barcodeData",
                    "strBarcode"
            };
            for (String key : stringKeys) {
                Object val = extras.get(key);
                if (val instanceof String) {
                    String s = ((String) val).replaceAll("[\\r\\n\\t]+", "").trim();
                    if (!s.isEmpty()) return s;
                } else if (val instanceof byte[]) {
                    String s = new String((byte[]) val).replaceAll("[\\r\\n\\t\\u0000]+", "").trim();
                    if (!s.isEmpty()) return s;
                }
            }
            // Urovo / Chainway legacy byte[] key ("barocode" typo is intentional in vendor SDK!)
            Object legacyBytes = extras.get("barocode");
            if (legacyBytes instanceof byte[]) {
                int len = extras.getInt("length", ((byte[]) legacyBytes).length);
                int safeLen = Math.min(len, ((byte[]) legacyBytes).length);
                String s = new String((byte[]) legacyBytes, 0, safeLen).replaceAll("[\\r\\n\\t\\u0000]+", "").trim();
                if (!s.isEmpty()) return s;
            }
            // Fallback: scan any remaining String extra from unknown vendor scanner service
            for (String key : extras.keySet()) {
                Object val = extras.get(key);
                if (val instanceof String) {
                    String s = ((String) val).replaceAll("[\\r\\n\\t]+", "").trim();
                    if (s.length() >= 3 && s.length() <= 128 && !s.startsWith("com.") && !s.startsWith("android.")) {
                        return s;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "extractBarcodeFromIntent error", e);
        }
        return null;
    }

    private void dispatchHardwareBarcodeToWebView(final String barcode) {
        try {
            if (this.getBridge() == null || this.getBridge().getWebView() == null) return;
            final WebView webView = this.getBridge().getWebView();
            final String quoted = org.json.JSONObject.quote(barcode);
            webView.post(() -> {
                try {
                    webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('dlkam-hardware-barcode',{detail:{barcode:" + quoted + ",source:'android-broadcast'}}));",
                            null
                    );
                } catch (Exception ignored) {}
            });
        } catch (Exception e) {
            Log.w(TAG, "dispatchHardwareBarcodeToWebView error", e);
        }
    }

    /**
     * Captures Android PDA hardware scanner bursts delivered as KeyEvent.ACTION_MULTIPLE
     * (used by Urovo, Chainway, Seuic, iData, Newland in KeyEvent/Simulate mode)
     * so barcode scans work even if no input element is focused.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        try {
            if (event != null && event.getAction() == KeyEvent.ACTION_MULTIPLE) {
                String chars = event.getCharacters();
                if (chars != null) {
                    String cleaned = chars.replaceAll("[\\r\\n\\t\\u0000]+", "").trim();
                    if (cleaned.length() >= 3) {
                        long now = System.currentTimeMillis();
                        if (!cleaned.equals(lastNativeBarcodeValue) || (now - lastNativeBarcodeAt) >= 250L) {
                            lastNativeBarcodeValue = cleaned;
                            lastNativeBarcodeAt = now;
                            dispatchHardwareBarcodeToWebView(cleaned);
                        }
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "dispatchKeyEvent barcode capture warning", e);
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        extractNotificationTargetUrl(intent);
    }

    private void extractNotificationTargetUrl(Intent intent) {
        if (intent == null) return;
        try {
            android.os.Bundle extras = intent.getExtras();
            if (extras == null) return;

            String rawTarget = intent.getStringExtra("targetUrl");
            if (rawTarget == null || rawTarget.trim().isEmpty()) {
                rawTarget = intent.getStringExtra("url");
            }
            if (rawTarget == null || rawTarget.trim().isEmpty()) {
                rawTarget = intent.getStringExtra("link");
            }

            String title = intent.getStringExtra("notifTitle");
            if (title == null || title.trim().isEmpty()) {
                title = intent.getStringExtra("title");
                if (title == null || title.trim().isEmpty()) {
                    title = intent.getStringExtra("gcm.notification.title");
                }
            }
            String body = intent.getStringExtra("notifBody");
            if (body == null || body.trim().isEmpty()) {
                body = intent.getStringExtra("body");
                if (body == null || body.trim().isEmpty()) {
                    body = intent.getStringExtra("gcm.notification.body");
                }
            }

            // Synthesize targetUrl from FCM data keys if url was not explicitly provided
            if (rawTarget == null || rawTarget.trim().isEmpty()) {
                String tab = intent.getStringExtra("tab");
                String meetingId = intent.getStringExtra("meetingId");
                String orderId = intent.getStringExtra("orderId");
                String permitId = intent.getStringExtra("permitId");
                String requestId = intent.getStringExtra("requestId");
                String letterId = intent.getStringExtra("letterId");
                String pv = intent.getStringExtra("pv");
                String group = intent.getStringExtra("group");
                String task = intent.getStringExtra("task");

                String txId = intent.getStringExtra("txId");
                String permitNumber = intent.getStringExtra("permitNumber");
                String orderNumber = intent.getStringExtra("trackingNumber");
                String meetingNumber = intent.getStringExtra("meetingNumber");

                if (meetingId != null && !meetingId.isEmpty()) {
                    rawTarget = "/meetings?meetingId=" + Uri.encode(meetingId);
                } else if (meetingNumber != null && !meetingNumber.isEmpty()) {
                    rawTarget = "/meetings?meetingNumber=" + Uri.encode(meetingNumber);
                } else if (orderId != null && !orderId.isEmpty()) {
                    rawTarget = "/manage?orderId=" + Uri.encode(orderId);
                } else if (orderNumber != null && !orderNumber.isEmpty()) {
                    rawTarget = "/manage?trackingNumber=" + Uri.encode(orderNumber);
                } else if (permitId != null && !permitId.isEmpty()) {
                    rawTarget = "/manage-exit?permitId=" + Uri.encode(permitId);
                } else if (permitNumber != null && !permitNumber.isEmpty()) {
                    rawTarget = "/manage-exit?permitNumber=" + Uri.encode(permitNumber);
                } else if (requestId != null && !requestId.isEmpty()) {
                    rawTarget = "/purchase?requestId=" + Uri.encode(requestId);
                } else if (letterId != null && !letterId.isEmpty()) {
                    rawTarget = "/secretariat?letterId=" + Uri.encode(letterId);
                } else if (txId != null && !txId.isEmpty()) {
                    rawTarget = "/warehouse?txId=" + Uri.encode(txId);
                } else if (pv != null && !pv.isEmpty()) {
                    rawTarget = "/chat?pv=" + Uri.encode(pv);
                } else if (group != null && !group.isEmpty()) {
                    rawTarget = "/chat?group=" + Uri.encode(group) + (task != null && !task.isEmpty() ? "&task=" + Uri.encode(task) : "");
                } else if (tab != null && !tab.isEmpty()) {
                    rawTarget = "/" + tab.replaceFirst("^/+", "");
                }
            }

            if ((rawTarget == null || rawTarget.trim().isEmpty()) && (title == null || title.trim().isEmpty()) && (body == null || body.trim().isEmpty())) {
                return;
            }

            String cleanTarget = rawTarget != null ? rawTarget.trim() : "";
            if (!cleanTarget.contains("_nt=") && ((title != null && !title.isEmpty()) || (body != null && !body.isEmpty()))) {
                StringBuilder sb = new StringBuilder(cleanTarget.isEmpty() ? "/dashboard" : cleanTarget);
                sb.append(cleanTarget.contains("?") ? "&" : "?");
                boolean addedAny = false;
                if (title != null && !title.isEmpty()) {
                    sb.append("_nt=").append(Uri.encode(title));
                    addedAny = true;
                }
                if (body != null && !body.isEmpty()) {
                    if (addedAny) sb.append("&");
                    sb.append("_nb=").append(Uri.encode(body));
                }
                cleanTarget = sb.toString();
            }

            final String finalTarget = cleanTarget;
            pendingNotificationTargetUrl = finalTarget;
            intent.removeExtra("targetUrl");
            intent.removeExtra("url");
            intent.removeExtra("notifTitle");
            intent.removeExtra("notifBody");

            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                final WebView webView = this.getBridge().getWebView();
                final String quotedUrl = org.json.JSONObject.quote(finalTarget);
                final String quotedTitle = org.json.JSONObject.quote(title != null ? title : "");
                final String quotedBody = org.json.JSONObject.quote(body != null ? body : "");
                webView.postDelayed(() -> {
                    try {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('dlkam-notification-tap', { detail: { url: " + quotedUrl + ", title: " + quotedTitle + ", body: " + quotedBody + " } }));",
                            null
                        );
                    } catch (Exception ignored) {}
                }, 180);
            }
        } catch (Exception e) {
            Log.w(TAG, "extractNotificationTargetUrl error", e);
        }
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
        registerHardwareBarcodeReceiver();
        syncWebViewUserToNativePrefsIfNeeded();
    }

    @Override
    public void onPause() {
        unregisterHardwareBarcodeReceiver();
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
            intent.setAction("com.payment.system.OPEN_NOTIFICATION." + safeId);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (targetUrl != null && !targetUrl.isEmpty()) {
                intent.putExtra("targetUrl", targetUrl);
                intent.putExtra("url", targetUrl);
            }
            if (title != null && !title.isEmpty()) {
                intent.putExtra("notifTitle", title);
            }
            if (body != null && !body.isEmpty()) {
                intent.putExtra("notifBody", body);
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

    private static class PublicSaveResult {
        boolean ok;
        boolean publicSaved;
        String folder = "Downloads/Dlkam";
        String fileName = "";
        String uri = "";
    }

    private byte[] decodeBase64Payload(String base64OrDataUrl) {
        if (base64OrDataUrl == null) return new byte[0];
        String cleanBase64 = base64OrDataUrl;
        int commaIdx = cleanBase64.indexOf(',');
        if (commaIdx >= 0) {
            cleanBase64 = cleanBase64.substring(commaIdx + 1);
        }
        return Base64.decode(cleanBase64, Base64.DEFAULT);
    }

    private String ensureExtensionForMime(String safeName, String mimeType) {
        if (safeName.contains(".")) return safeName;
        if (mimeType == null) return safeName;
        if (mimeType.contains("pdf")) return safeName + ".pdf";
        if (mimeType.contains("spreadsheetml") || mimeType.contains("excel")) return safeName + ".xlsx";
        if (mimeType.contains("wordprocessingml")) return safeName + ".docx";
        if (mimeType.contains("csv")) return safeName + ".csv";
        if (mimeType.contains("png")) return safeName + ".png";
        if (mimeType.contains("jpeg") || mimeType.contains("jpg")) return safeName + ".jpg";
        return safeName;
    }

    private File resolveUniquePublicFile(File dir, String safeName) {
        File candidate = new File(dir, safeName);
        if (!candidate.exists()) return candidate;
        int dot = safeName.lastIndexOf('.');
        String stem = dot > 0 ? safeName.substring(0, dot) : safeName;
        String ext = dot > 0 ? safeName.substring(dot) : "";
        for (int i = 1; i < 500; i++) {
            File alt = new File(dir, stem + " (" + i + ")" + ext);
            if (!alt.exists()) return alt;
        }
        return new File(dir, stem + "_" + System.currentTimeMillis() + ext);
    }

    private String addSuffixBeforeExt(String fileName, String suffix) {
        int dot = fileName.lastIndexOf('.');
        if (dot > 0) {
            return fileName.substring(0, dot) + suffix + fileName.substring(dot);
        }
        return fileName + suffix;
    }

    private PublicSaveResult saveBytesToPublicDownloadsAndCache(Context ctx, byte[] bytes, String rawFileName, String mimeType) {
        PublicSaveResult result = new PublicSaveResult();
        if (bytes == null || bytes.length == 0) {
            return result;
        }
        String safeName = sanitizeFileName(rawFileName);
        String resolvedMime = resolveMimeType(safeName, mimeType);
        safeName = ensureExtensionForMime(safeName, resolvedMime);
        String savedFileName = safeName;

        // 1. Write copy to app-dedicated folder so FileProvider & local open always succeed instantly
        File cacheTarget = new File(getDedicatedAppFolder(), savedFileName);
        try (FileOutputStream fos = new FileOutputStream(cacheTarget)) {
            fos.write(bytes);
            fos.flush();
        } catch (Exception e) {
            Log.w(TAG, "App cache copy write warning", e);
        }

        // 2. Write directly into public Downloads/Dlkam folder visible in Android File Manager ("My Files" / "Downloads/Dlkam")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = ctx.getContentResolver();
            String[] candidateNames = new String[]{
                    savedFileName,
                    addSuffixBeforeExt(savedFileName, "_" + (System.currentTimeMillis() % 100000))
            };
            for (String candName : candidateNames) {
                Uri insertedUri = null;
                try {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, candName);
                    values.put(MediaStore.Downloads.MIME_TYPE, resolvedMime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Dlkam");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);

                    insertedUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (insertedUri != null) {
                        try (OutputStream os = resolver.openOutputStream(insertedUri)) {
                            if (os != null) {
                                os.write(bytes);
                                os.flush();
                            }
                        }
                        ContentValues updateVals = new ContentValues();
                        updateVals.put(MediaStore.Downloads.IS_PENDING, 0);
                        resolver.update(insertedUri, updateVals, null, null);

                        savedFileName = candName;
                        result.publicSaved = true;
                        result.uri = insertedUri.toString();
                        break;
                    }
                } catch (Exception mediaErr) {
                    Log.w(TAG, "MediaStore.Downloads save attempt failed for " + candName, mediaErr);
                    if (insertedUri != null) {
                        try { resolver.delete(insertedUri, null, null); } catch (Exception ignored) {}
                    }
                }
            }
        } else {
            try {
                File publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File dlkamDir = new File(publicDownloads, "Dlkam");
                if (!dlkamDir.exists()) {
                    dlkamDir.mkdirs();
                }
                File publicFile = resolveUniquePublicFile(dlkamDir, savedFileName);
                try (FileOutputStream fos = new FileOutputStream(publicFile)) {
                    fos.write(bytes);
                    fos.flush();
                }
                savedFileName = publicFile.getName();
                result.publicSaved = true;
                result.uri = Uri.fromFile(publicFile).toString();
                MediaScannerConnection.scanFile(ctx, new String[]{publicFile.getAbsolutePath()}, new String[]{resolvedMime}, null);
            } catch (Exception legacyErr) {
                Log.w(TAG, "Legacy public Downloads/Dlkam write failed", legacyErr);
            }
        }

        if (!savedFileName.equals(cacheTarget.getName())) {
            try {
                File renamedCache = new File(getDedicatedAppFolder(), savedFileName);
                try (FileOutputStream fos = new FileOutputStream(renamedCache)) {
                    fos.write(bytes);
                    fos.flush();
                }
            } catch (Exception ignored) {}
        }

        result.ok = result.publicSaved || (cacheTarget.exists() && cacheTarget.length() > 0);
        result.fileName = savedFileName;
        result.folder = result.publicSaved ? "Downloads/Dlkam" : APP_FILES_FOLDER;
        if (result.uri.isEmpty() && cacheTarget.exists()) {
            result.uri = Uri.fromFile(cacheTarget).toString();
        }
        return result;
    }

    private boolean openSavedFileInternal(Context ctx, String fileName, String mimeType, String fallbackUriStr) {
        try {
            String safeName = sanitizeFileName(fileName);
            String resolvedMime = resolveMimeType(safeName, mimeType);
            File target = new File(getDedicatedAppFolder(), safeName);

            if ("application/vnd.android.package-archive".equals(resolvedMime) && target.exists() && target.length() > 0) {
                return installApkByFile(ctx, target);
            }

            Uri contentUri = null;
            if (target.exists() && target.length() > 0) {
                contentUri = FileProvider.getUriForFile(
                        ctx,
                        ctx.getPackageName() + ".fileprovider",
                        target
                );
            } else if (fallbackUriStr != null && !fallbackUriStr.isEmpty()) {
                contentUri = Uri.parse(fallbackUriStr);
            }
            if (contentUri == null) {
                return false;
            }

            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(contentUri, resolvedMime);
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            try {
                ctx.startActivity(viewIntent);
                return true;
            } catch (Exception openErr) {
                Intent chooser = Intent.createChooser(viewIntent, safeName);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(chooser);
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "openSavedFileInternal error", e);
            return false;
        }
    }

    private boolean installApkByFile(Context ctx, File target) {
        try {
            if (!target.exists() || target.length() == 0) {
                return false;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!ctx.getPackageManager().canRequestPackageInstalls()) {
                    Intent manageIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    manageIntent.setData(Uri.parse("package:" + ctx.getPackageName()));
                    manageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(manageIntent);
                    new android.os.Handler(android.os.Looper.getMainLooper()).post(() ->
                        android.widget.Toast.makeText(ctx, "لطفاً دسترسی نصب برنامه‌های ناشناخته را برای دلکام فعال فرمایید.", android.widget.Toast.LENGTH_LONG).show()
                    );
                    return true;
                }
            }
            Uri contentUri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", target);
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            ctx.startActivity(installIntent);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "installApkByFile failed", e);
            return false;
        }
    }

    public class DlkamAndroidBridge {
        private final Context context;

        public DlkamAndroidBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean showNativeNotification(String title, String body, String notifId, String channelId) {
            return showNativeNotification(title, body, notifId, channelId, "");
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
        public String consumePendingNotificationUrl() {
            String url = pendingNotificationTargetUrl;
            pendingNotificationTargetUrl = null;
            return url != null ? url : "";
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
        public String saveFileToPublicDownloads(String base64Data, String fileName, String mimeType) {
            org.json.JSONObject json = new org.json.JSONObject();
            try {
                byte[] bytes = decodeBase64Payload(base64Data);
                PublicSaveResult res = saveBytesToPublicDownloadsAndCache(context, bytes, fileName, mimeType);
                json.put("ok", res.ok);
                json.put("publicSaved", res.publicSaved);
                json.put("folder", res.folder);
                json.put("fileName", res.fileName);
                json.put("uri", res.uri);
            } catch (Exception e) {
                Log.e(TAG, "saveFileToPublicDownloads error", e);
                try {
                    json.put("ok", false);
                    json.put("publicSaved", false);
                    json.put("error", e.getMessage());
                } catch (Exception ignored) {}
            }
            return json.toString();
        }

        @JavascriptInterface
        public boolean saveFileToAppFolder(String base64Data, String fileName, String mimeType) {
            try {
                byte[] bytes = decodeBase64Payload(base64Data);
                PublicSaveResult res = saveBytesToPublicDownloadsAndCache(context, bytes, fileName, mimeType);
                return res.ok;
            } catch (Exception e) {
                Log.e(TAG, "saveFileToAppFolder error", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean openFileFromAppFolder(String fileName, String mimeType) {
            return openSavedFileInternal(context, fileName, mimeType, "");
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

        @JavascriptInterface
        public String getDeviceDisplayInfo() {
            try {
                DisplayMetrics dm = context.getResources().getDisplayMetrics();
                float density = dm.density > 0 ? dm.density : 1f;
                int dpWidth = Math.round(dm.widthPixels / density);
                int dpHeight = Math.round(dm.heightPixels / density);
                return "{\"widthPx\":" + dm.widthPixels +
                        ",\"heightPx\":" + dm.heightPixels +
                        ",\"dpWidth\":" + dpWidth +
                        ",\"dpHeight\":" + dpHeight +
                        ",\"density\":" + density + "}";
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public boolean hasCameraPermission() {
            try {
                return ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean requestCameraPermission() {
            try {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    return true;
                }
                if (context instanceof android.app.Activity) {
                    android.app.Activity act = (android.app.Activity) context;
                    act.runOnUiThread(() -> ActivityCompat.requestPermissions(
                            act,
                            new String[]{Manifest.permission.CAMERA},
                            REQ_CAMERA_PERMISSION
                    ));
                }
                return false;
            } catch (Exception e) {
                Log.w(TAG, "requestCameraPermission error", e);
                return false;
            }
        }

        @JavascriptInterface
        public void hideSoftKeyboard() {
            try {
                if (context instanceof android.app.Activity) {
                    android.app.Activity act = (android.app.Activity) context;
                    act.runOnUiThread(() -> {
                        try {
                            InputMethodManager imm = (InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE);
                            if (imm == null) return;
                            View focusView = act.getCurrentFocus();
                            if (focusView == null && getBridge() != null) {
                                focusView = getBridge().getWebView();
                            }
                            if (focusView != null) {
                                imm.hideSoftInputFromWindow(focusView.getWindowToken(), 0);
                            }
                        } catch (Exception ignored) {}
                    });
                }
            } catch (Exception e) {
                Log.w(TAG, "hideSoftKeyboard warning", e);
            }
        }

        @JavascriptInterface
        public void showSoftKeyboard() {
            try {
                if (context instanceof android.app.Activity) {
                    android.app.Activity act = (android.app.Activity) context;
                    act.runOnUiThread(() -> {
                        try {
                            InputMethodManager imm = (InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE);
                            if (imm == null) return;
                            View focusView = act.getCurrentFocus();
                            if (focusView == null && getBridge() != null) {
                                focusView = getBridge().getWebView();
                            }
                            if (focusView != null) {
                                imm.showSoftInput(focusView, InputMethodManager.SHOW_IMPLICIT);
                            }
                        } catch (Exception ignored) {}
                    });
                }
            } catch (Exception e) {
                Log.w(TAG, "showSoftKeyboard warning", e);
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
            // Battery-friendly 20-second periodic check while activity is alive
            nativePollExecutor.scheduleWithFixedDelay(() -> {
                try {
                    SyncWorker.pollAndDispatchNotifications(getApplicationContext());
                } catch (Exception e) {
                    Log.w(TAG, "Native periodic poll iteration error", e);
                }
            }, 10, 20, TimeUnit.SECONDS);
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
