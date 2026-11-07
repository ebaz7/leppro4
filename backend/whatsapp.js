
import '../patch-dependencies.js';
import wwebjs from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import QRCodeLib from 'qrcode';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { ProxyAgent } from 'undici';
import { parseMessage } from './whatsapp/parser.js';
import * as Actions from './whatsapp/actions.js';
import * as dbManager from './db-manager.js';

const { Client, LocalAuth, MessageMedia } = wwebjs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let client = null;
let isReady = false;
let qrCode = null;
let qrDataUrl = null;
let clientInfo = null;
let isInitializing = false;
let lastError = null;
let connectedAt = null;
let disconnectedAt = null;
let currentAuthDir = null;
let activeProxyConfig = null;
let lastChromePath = null;

// Ring buffer of diagnostic logs (max 200 entries)
const MAX_LOGS = 200;
const diagnosticLogs = [];

export function addDiagnosticLog(level, source, message, details = null) {
    const now = new Date();
    const entry = {
        id: Math.random().toString(36).substring(2, 10),
        timestamp: now.toISOString(),
        timeStr: now.toLocaleTimeString('fa-IR', { hour12: false }) + ' - ' + now.toLocaleDateString('fa-IR'),
        level, // 'info' | 'warn' | 'error' | 'success'
        source, // 'INIT' | 'AUTH' | 'NETWORK' | 'MESSAGE' | 'PUPPETEER' | 'DIAGNOSTIC' | 'CLIENT'
        message: typeof message === 'string' ? message : JSON.stringify(message),
        details: details ? (typeof details === 'string' ? details : (details.stack || JSON.stringify(details, null, 2))) : null
    };
    diagnosticLogs.unshift(entry);
    if (diagnosticLogs.length > MAX_LOGS) {
        diagnosticLogs.pop();
    }
    if (level === 'error') {
        lastError = entry.message;
    }
    const prefix = `[WhatsApp-${source}]`;
    if (level === 'error') console.error(prefix, entry.message, details || '');
    else if (level === 'warn') console.warn(prefix, entry.message);
    else console.log(prefix, entry.message);
}

const getDb = dbManager.getDb;

function findChromeExecutable() {
    // 1. Explicit env var
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // 2. Try Puppeteer default executable
    try {
        const pPath = puppeteer.executablePath();
        if (pPath && fs.existsSync(pPath)) {
            return pPath;
        }
    } catch (e) {}

    // 3. Platform-specific standard paths
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    if (isWin) {
        const winPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft\\Edge\\Application\\msedge.exe') : null,
            process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe') : null,
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        ].filter(Boolean);

        for (const p of winPaths) {
            if (fs.existsSync(p)) return p;
        }
    } else if (isMac) {
        const macPaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ];
        for (const p of macPaths) {
            if (fs.existsSync(p)) return p;
        }
    } else {
        // Linux / Docker
        const linuxPaths = [
            '/root/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/usr/bin/brave-browser'
        ];
        for (const p of linuxPaths) {
            if (fs.existsSync(p)) return p;
        }
    }

    return null;
}

/**
 * Remove stale Chrome locks and kill orphaned Chrome browser processes
 */
export const cleanSessionLocks = (authDir = currentAuthDir, sessionName = 'session-main_session') => {
    try {
        if (!authDir) return;
        const targetDir = path.resolve(authDir);
                
        // 1. Terminate orphaned Chrome processes holding this session
        try {
            if (process.platform === 'win32') {
                const cmds = [
                    "powershell -NoProfile -NonInteractive -Command \"Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'chrome|edge' -and ($_.CommandLine -like '*" + sessionName + "*' -or $_.CommandLine -like '*wauth*') } | Stop-Process -Force -ErrorAction SilentlyContinue\"",
                    "cmd /c taskkill /F /FI \"COMMANDLINE eq *" + sessionName + "*\" >nul 2>&1",
                    "cmd /c taskkill /F /FI \"COMMANDLINE eq *wauth*\" >nul 2>&1"
                ];
                for (const cmd of cmds) {
                    try { execSync(cmd, { stdio: 'ignore', timeout: 5000 }); } catch(e) {}
                }
            } else {
                execSync('pkill -9 -f "' + sessionName + '" 2>/dev/null || true', { stdio: 'ignore', timeout: 5000 });
                execSync('pkill -9 -f "wauth" 2>/dev/null || true', { stdio: 'ignore', timeout: 5000 });
            }
        } catch (e) {}

        // 2. Remove Chrome Singleton lock symlinks and stale files
        const sessionDir = path.join(targetDir, sessionName);
        if (fs.existsSync(sessionDir)) {
            const removeLocksRecursively = (dir) => {
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            removeLocksRecursively(fullPath);
                        } else {
                            const nameLower = entry.name.toLowerCase();
                            if (
                                nameLower.includes('singleton') ||
                                nameLower === 'devtoolsactiveport' ||
                                nameLower === 'lockfile' ||
                                nameLower === 'lock' ||
                                nameLower.endsWith('.lock')
                            ) {
                                try {
                                    fs.unlinkSync(fullPath);
                                    console.log(`>>> WhatsApp: Cleaned stale browser lock: ${fullPath}`);
                                    addDiagnosticLog('info', 'INIT', `قفل قدیمی مرورگر با موفقیت پاکسازی شد: ${entry.name}`);
                                } catch (e) {}
                            }
                        }
                    }
                } catch(e) {}
            };
            removeLocksRecursively(sessionDir);
        }
    } catch (err) {
        console.warn(">>> WhatsApp cleanSessionLocks error:", err.message);
    }
};

export const recoverActivePage = async () => {
    if (!client) return null;
    try {
        if (client.pupBrowser && client.pupBrowser.isConnected()) {
            const pages = await client.pupBrowser.pages();
            if (pages && pages.length > 0) {
                const waPage = pages.find(p => {
                    try { return p.url().includes('whatsapp.com'); } catch(e) { return false; }
                }) || pages[0];
                if (waPage && !waPage.isClosed()) {
                    client.pupPage = waPage;
                    return waPage;
                }
            }
        }
    } catch (e) {
        console.warn(">>> [WhatsApp] Could not recover active page:", e.message);
    }
    return null;
};

export const initWhatsApp = (authDir) => {
    try {
        currentAuthDir = path.resolve(authDir);
        if (client && (isReady || isInitializing)) {
            console.log(">>> WhatsApp is already initialized or initializing.");
            addDiagnosticLog('info', 'INIT', 'ماژول واتساپ قبلاً راه‌اندازی شده یا در حال حاضر در حال بارگذاری است.');
            return;
        }

        console.log(">>> Initializing WhatsApp Module...");
        addDiagnosticLog('info', 'INIT', 'آغاز راه‌اندازی ماژول واتساپ (Puppeteer & LocalAuth)');
        isInitializing = true;
        lastError = null;
        const absoluteAuthDir = currentAuthDir;

        if (!fs.existsSync(absoluteAuthDir)) {
            fs.mkdirSync(absoluteAuthDir, { recursive: true });
            addDiagnosticLog('info', 'INIT', `پوشه نشست ایجاد شد: ${absoluteAuthDir}`);
        }

        // Clean any stale locks before starting puppeteer
        cleanSessionLocks(absoluteAuthDir, 'session-main_session');

        // --- PROXY CONFIG ---
        const puppeteerArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-extensions',
            '--disable-features=site-per-process,AudioServiceOutOfProcess,Translate,BackForwardCache,AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection',
            '--js-flags=--max-old-space-size=2048',
            '--no-default-browser-check'
        ];

        let db = null;
        try { db = getDb ? getDb() : null; } catch(e) {}
        const proxy = 
            (db && db.settings && (db.settings.whatsappProxy || db.settings.proxyUrl)) ||
            process.env.WHATSAPP_PROXY ||
            process.env.PROXY_URL ||
            process.env.HTTPS_PROXY ||
            process.env.HTTP_PROXY ||
            process.env.ALL_PROXY;

        if (proxy && typeof proxy === 'string' && proxy.trim()) {
            let cleanProxy = proxy.trim();
            if (!cleanProxy.startsWith('http://') && !cleanProxy.startsWith('https://') && !cleanProxy.startsWith('socks5://') && !cleanProxy.startsWith('socks5h://')) {
                cleanProxy = `http://${cleanProxy}`;
            }
            activeProxyConfig = cleanProxy;
            console.log(`>>> WhatsApp using Proxy: ${cleanProxy}`);
            addDiagnosticLog('info', 'NETWORK', `استفاده از پروکسی برای اتصال: ${cleanProxy}`);
            puppeteerArgs.push(`--proxy-server=${cleanProxy}`);
        } else {
            activeProxyConfig = null;
            addDiagnosticLog('info', 'NETWORK', 'پروکسی اختصاصی تنظیم نشده است (اتصال مستقیم)');
        }

        const executablePath = findChromeExecutable();
        lastChromePath = executablePath;
        if (executablePath) {
            console.log(`>>> WhatsApp using Chrome at: ${executablePath}`);
            addDiagnosticLog('info', 'PUPPETEER', `مرورگر در مسیر شناسایی شد: ${executablePath}`);
        } else {
            console.warn(`>>> Warning: Chrome executable not explicitly found, letting Puppeteer try default.`);
            addDiagnosticLog('warn', 'PUPPETEER', 'مسیر صریح کروم یافت نشد، پپتیر از مرورگر پیش‌فرض استفاده خواهد کرد.');
        }

        // Common realistic desktop Chrome User-Agent to prevent WhatsApp Web from dropping session
        const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

        const puppeteerConfig = {
            headless: true,
            args: puppeteerArgs,
            authTimeoutMs: 120000,
            takeoverOnConflict: true,
            takeoverTimeoutMs: 0
        };
        if (executablePath) {
            puppeteerConfig.executablePath = executablePath;
        }

        client = new Client({ 
            authStrategy: new LocalAuth({ clientId: 'main_session', dataPath: absoluteAuthDir }), 
            puppeteer: puppeteerConfig,
            userAgent: chromeUserAgent,
            takeoverOnConflict: true,
            takeoverTimeoutMs: 0,
            webVersionCache: {
                type: 'none'
            }
        });

        const toEnglishDigits = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
                .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
        };

        // Helper to normalize phone numbers (convert 989..., +989..., 09... to standard 09...)
        const normalizePhoneNumber = (phone) => {
            if (!phone) return '';
            let digits = toEnglishDigits(phone).replace(/\D/g, '');
            if (digits.startsWith('0098') && digits.length === 14) {
                digits = '0' + digits.substring(4);
            } else if (digits.startsWith('989') && digits.length === 12) {
                digits = '0' + digits.substring(2);
            } else if (digits.startsWith('9') && digits.length === 10) {
                digits = '0' + digits;
            }
            return digits;
        };

        const ensurePageReadyAndPatched = async () => {
            try {
                const page = client?.pupPage || await recoverActivePage();
                if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return false;

                const stateResult = await page.evaluate(async () => {
                    try {
                        if (typeof window.require !== 'function') return { synced: false, wwebReady: false };

                        // 1. Check if WhatsApp Web store & user session are synced
                        let hasSynced = false;
                        let meUser = null;
                        try {
                            const SocketModel = window.require('WAWebSocketModel');
                            hasSynced = !!(SocketModel && SocketModel.Socket && SocketModel.Socket.hasSynced);
                        } catch (e) {}
                        try {
                            const UserPrefs = window.require('WAWebUserPrefsMeUser');
                            const wid = UserPrefs && UserPrefs.getMaybeMePnUser ? UserPrefs.getMaybeMePnUser() : (UserPrefs && UserPrefs.getMaybeMeUser ? UserPrefs.getMaybeMeUser() : null);
                            if (wid) meUser = wid.user || wid._serialized || String(wid);
                        } catch (e) {}

                        // If synced and onAppStateHasSyncedEvent was registered by whatsapp-web.js but missed the event, trigger it
                        if ((hasSynced || meUser) && typeof window.onAppStateHasSyncedEvent === 'function' && !window.__wwebSyncedTriggered) {
                            window.__wwebSyncedTriggered = true;
                            try { window.onAppStateHasSyncedEvent(); } catch (e) {}
                        }

                        // 2. Patch window.WWebJS helpers if present
                        if (window.WWebJS) {
                            if (!window.WWebJS.__patchedFor2026) {
                                window.WWebJS.__patchedFor2026 = true;

                                // Safe sendSeen that never crashes message sending
                                window.WWebJS.sendSeen = async (chatId) => {
                                    try {
                                        const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
                                        if (chat) {
                                            try { window.require('WAWebStreamModel').Stream.markAvailable(); } catch (e) {}
                                            await window.require('WAWebUpdateUnreadChatAction').sendSeen({
                                                chat: chat,
                                                threadId: undefined,
                                            });
                                            try { window.require('WAWebStreamModel').Stream.markUnavailable(); } catch (e) {}
                                            return true;
                                        }
                                    } catch (e) {}
                                    return false;
                                };

                                // Resilient getChat for both direct contacts (@c.us / @lid) and groups (@g.us)
                                const origGetChat = window.WWebJS.getChat;
                                window.WWebJS.getChat = async (chatId, { getAsModel = true } = {}) => {
                                    try {
                                        const chatWid = window.require('WAWebWidFactory').createWid(chatId);
                                        const ChatCol = window.require('WAWebCollections').Chat;
                                        let chat = ChatCol.get(chatWid);
                                        if (!chat) {
                                            try {
                                                const found = await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid);
                                                chat = found?.chat || found;
                                            } catch (e) {}
                                        }
                                        if (!chat && typeof ChatCol.find === 'function') {
                                            try { chat = await ChatCol.find(chatWid); } catch (e) {}
                                        }
                                        if (chat && typeof chatWid.isGroup === 'function' && chatWid.isGroup()) {
                                            try { await window.require('WAWebCollections').GroupMetadata.update(chatWid); } catch (e) {}
                                        }
                                        if (chat) {
                                            return getAsModel ? await window.WWebJS.getChatModel(chat) : chat;
                                        }
                                    } catch (e) {}
                                    if (typeof origGetChat === 'function') {
                                        try { return await origGetChat(chatId, { getAsModel }); } catch (e) {}
                                    }
                                    return null;
                                };

                                // Resilient getMessageModel so serialization hiccups never fail sendMessage
                                const origGetMessageModel = window.WWebJS.getMessageModel;
                                if (typeof origGetMessageModel === 'function') {
                                    window.WWebJS.getMessageModel = (message) => {
                                        try {
                                            return origGetMessageModel(message);
                                        } catch (e) {
                                            return {
                                                id: message?.id ? (message.id._serialized ? message.id : { _serialized: String(message.id), fromMe: true }) : { _serialized: 'sent_' + Date.now(), fromMe: true },
                                                body: message?.body || '',
                                                type: message?.type || 'chat',
                                                timestamp: message?.t || Math.floor(Date.now() / 1000),
                                                fromMe: true
                                            };
                                        }
                                    };
                                }

                                // Fix PDF / document media upload crash in modern WhatsApp Web (OpaqueData.formData removal & undefined linkify)
                                try {
                                    const MediaDataUtils = window.require('WAWebMediaDataUtils');
                                    if (MediaDataUtils && typeof MediaDataUtils.shouldUseMediaCache === 'function' && !MediaDataUtils.__patchedPdfCache) {
                                        const origShouldUse = MediaDataUtils.shouldUseMediaCache.bind(MediaDataUtils);
                                        MediaDataUtils.shouldUseMediaCache = function (...args) {
                                            try {
                                                const OpaqueData = window.require('WAWebMediaOpaqueData');
                                                if (!OpaqueData?.prototype || typeof OpaqueData.prototype.formData !== 'function') {
                                                    return false;
                                                }
                                                return origShouldUse(...args);
                                            } catch (e) {
                                                return false;
                                            }
                                        };
                                        MediaDataUtils.__patchedPdfCache = true;
                                    }
                                } catch (e) {}

                                try {
                                    const WALinkify = window.require('WALinkify');
                                    if (WALinkify && !WALinkify.__patchedSafeLinkify) {
                                        if (typeof WALinkify.findLink === 'function') {
                                            const origFindLink = WALinkify.findLink.bind(WALinkify);
                                            WALinkify.findLink = function (str, ...rest) {
                                                if (typeof str !== 'string' || !str) return null;
                                                try { return origFindLink(str, ...rest); } catch (e) { return null; }
                                            };
                                        }
                                        if (typeof WALinkify.findLinks === 'function') {
                                            const origFindLinks = WALinkify.findLinks.bind(WALinkify);
                                            WALinkify.findLinks = function (str, ...rest) {
                                                if (typeof str !== 'string' || !str) return [];
                                                try { return origFindLinks(str, ...rest); } catch (e) { return []; }
                                            };
                                        }
                                        WALinkify.__patchedSafeLinkify = true;
                                    }
                                } catch (e) {}
                            }
                        }

                        return {
                            synced: hasSynced || !!meUser,
                            wwebReady: !!window.WWebJS,
                            meUser
                        };
                    } catch (e) {
                        return { synced: false, wwebReady: false, error: e.message };
                    }
                });

                if (stateResult && stateResult.wwebReady && stateResult.synced && !isReady) {
                    isReady = true;
                    qrCode = null;
                    qrDataUrl = null;
                    isInitializing = false;
                    lastError = null;
                    if (!connectedAt) connectedAt = new Date().toISOString();
                    clientInfo = (client.info && client.info.wid && client.info.wid.user) || stateResult.meUser || 'Connected';
                    console.log(`>>> WhatsApp Ready (Verified via Store Sync)! User: ${clientInfo} ✅`);
                    addDiagnosticLog('success', 'CLIENT', `واتساپ به طور کامل همگام‌سازی و آماده ارسال پیام شد (کاربر: ${clientInfo}) ✅`);
                }

                return !!(stateResult && stateResult.wwebReady);
            } catch (e) {
                return false;
            }
        };

        const monitorBrowser = () => {
            try {
                if (client?.pupBrowser && typeof client.pupBrowser.on === 'function') {
                    client.pupBrowser.removeAllListeners('disconnected');
                    client.pupBrowser.on('disconnected', () => {
                        console.warn(">>> [WhatsApp Monitor] Browser disconnected / closed.");
                        addDiagnosticLog('warn', 'CLIENT', 'ارتباط مرورگر کروم واتساپ قطع شد.');
                        isReady = false;
                        clientInfo = null;
                        setTimeout(() => {
                            if (!isReady && !isInitializing) {
                                console.log(">>> [WhatsApp Monitor] Auto-reconnecting after browser disconnection...");
                                initWhatsApp(currentAuthDir);
                            }
                        }, 5000);
                    });
                }
                if (client?.pupPage && typeof client.pupPage.on === 'function') {
                    client.pupPage.removeAllListeners('close');
                    client.pupPage.removeAllListeners('error');
                    client.pupPage.on('error', (err) => {
                        console.error(">>> [WhatsApp Monitor] Page error/crash:", err.message);
                        addDiagnosticLog('warn', 'CLIENT', `خطا در صفحه وب واتساپ: ${err.message}`);
                        recoverActivePage();
                    });
                    client.pupPage.on('close', () => {
                        console.warn(">>> [WhatsApp Monitor] WhatsApp page closed.");
                        recoverActivePage();
                    });
                }
            } catch (err) {
                console.warn("Browser monitoring setup error:", err.message);
            }
        };

        client.on('qr', async (qr) => { 
            qrCode = qr; 
            isReady = false; 
            clientInfo = null;
            isInitializing = false;
            lastError = null;
            addDiagnosticLog('info', 'AUTH', 'کد QR تولید شد و در انتظار اسکن توسط واتساپ گوشی است.');
            try {
                qrDataUrl = await QRCodeLib.toDataURL(qr, { width: 260, margin: 1 });
            } catch (err) {
                qrDataUrl = null;
            }
            console.log("\n>>> WHATSAPP QR CODE RECEIVED (Scan below):");
            qrcode.generate(qr, { small: true }); 
        });
        
        client.on('authenticated', () => { 
            console.log(">>> WhatsApp Authenticated ✅"); 
            addDiagnosticLog('success', 'AUTH', 'نشست واتساپ با موفقیت احراز هویت شد (Authenticated) ✅');
            qrCode = null; 
            qrDataUrl = null;
            isInitializing = false;
            lastError = null;
            monitorBrowser();
            setTimeout(() => { ensurePageReadyAndPatched(); }, 2500);
            setTimeout(() => { ensurePageReadyAndPatched(); }, 6500);
        });

        client.on('ready', async () => { 
            isReady = true; 
            qrCode = null; 
            qrDataUrl = null;
            isInitializing = false;
            lastError = null;
            connectedAt = new Date().toISOString();
            clientInfo = client.info && client.info.wid ? client.info.wid.user : 'Connected'; 
            console.log(`>>> WhatsApp Ready! User: ${clientInfo} ✅`); 
            addDiagnosticLog('success', 'CLIENT', `واتساپ به طور کامل متصل و آنلاین شد (کاربر: ${clientInfo}) ✅`);
            monitorBrowser();
            await ensurePageReadyAndPatched();
        });

        client.on('auth_failure', (msg) => {
            console.error(">>> WhatsApp Auth Failure:", msg);
            lastError = "خطای احراز هویت: " + msg;
            isReady = false;
            isInitializing = false;
            addDiagnosticLog('error', 'AUTH', `خطای احراز هویت واتساپ: ${msg}`, 'نشست منقضی شده یا از روی تلفن خارج شده است.');
        });

        client.on('disconnected', (reason) => {
            console.warn(">>> WhatsApp Disconnected:", reason);
            disconnectedAt = new Date().toISOString();
            isReady = false;
            qrCode = null;
            qrDataUrl = null;
            clientInfo = null;
            isInitializing = false;
            addDiagnosticLog('warn', 'CLIENT', `ارتباط واتساپ قطع شد. دلیل: ${reason}. تلاش برای اتصال مجدد خودکار در ۵ ثانیه...`);
            
            // Auto-reconnect without clearing stored session files
            setTimeout(() => {
                if (!isReady && !isInitializing) {
                    console.log(">>> Attempting auto-reconnect to preserved session...");
                    initWhatsApp(currentAuthDir);
                }
            }, 5000);
        });

        client.on('change_state', (state) => {
            addDiagnosticLog('info', 'CLIENT', `وضعیت کلاینت واتساپ به ${state} تغییر یافت.`);
            if (state === 'CONNECTED') {
                setTimeout(() => { ensurePageReadyAndPatched(); }, 1500);
            }
        });

        client.on('loading_screen', (percent, message) => {
            addDiagnosticLog('info', 'CLIENT', `بارگذاری صفحه وب واتساپ: ${percent}% ${message || ''}`);
            if (Number(percent) >= 100) {
                setTimeout(() => { ensurePageReadyAndPatched(); }, 2000);
            }
        });

        // Check if a sender is authorized to receive reports or execute commands
        const getAuthorizedUser = (db, msg) => {
            if (!db || !msg) return null;
            if (msg.fromMe) return null;

            const isGroup = msg.from && msg.from.includes('@g.us');
            const settings = db.settings || {};

            // 1. Group Whitelist Check
            if (isGroup) {
                const allowedGroupIds = [
                    settings.botAccountingGroupIdWhatsApp,
                    settings.whatsappReportsGroupId,
                    settings.botBijakGroupIdWhatsApp,
                    settings.exitPermitNotificationGroup,
                    settings.dailySalesWhatsappGroupId,
                    settings.chequeVaultWhatsappGroupId,
                    settings.dailyExitReportDedicatedWhatsAppId,
                    settings.whatsappGroupId
                ].filter(Boolean).map(id => String(id).trim().toLowerCase());

                const currentGroupId = String(msg.from).trim().toLowerCase();
                const isAllowedGroup = allowedGroupIds.some(id => 
                    currentGroupId === id || currentGroupId.includes(id) || id.includes(currentGroupId.replace('@g.us', ''))
                );

                if (!isAllowedGroup) {
                    // Group is not configured in system settings -> ignore completely!
                    return null;
                }

                // In authorized groups, commands MUST start with '!' or '/'
                const body = (msg.body || '').trim();
                if (!body.startsWith('!') && !body.startsWith('/')) {
                    return null;
                }
            }

            // 2. Identify sender phone number
            const senderJid = isGroup ? (msg.author || msg.from) : msg.from;
            if (!senderJid) return null;
            const senderRawNumber = senderJid.replace(/@.*/, '');
            const senderNormalizedPhone = normalizePhoneNumber(senderRawNumber);

            if (!senderNormalizedPhone) return null;

            // 3. Match against db.users
            const users = Array.isArray(db.users) ? db.users : [];
            const matchedUser = users.find(u => {
                if (!u) return false;
                const uPhone = normalizePhoneNumber(u.phoneNumber || u.mobile || u.phone || u.whatsappPhone);
                return uPhone && uPhone === senderNormalizedPhone;
            });

            if (matchedUser) {
                return matchedUser;
            }

            // 4. Match against admin phones configured in settings
            const adminPhones = [
                ...(Array.isArray(settings.whatsappAdminPhones) ? settings.whatsappAdminPhones : [settings.whatsappAdminPhones]),
                ...(Array.isArray(settings.botAdminPhones) ? settings.botAdminPhones : [settings.botAdminPhones]),
                settings.adminPhone
            ].filter(Boolean).map(normalizePhoneNumber);

            if (adminPhones.includes(senderNormalizedPhone)) {
                return {
                    id: 'admin_phone_' + senderNormalizedPhone,
                    username: 'admin',
                    fullName: 'مدیر سیستم (واتساپ)',
                    role: 'admin',
                    roles: ['admin']
                };
            }

            return null;
        };
        
        client.on('message', async msg => {
            try {
                if (!msg || msg.fromMe) return;
                const body = (msg.body || '').trim();
                if (!body) return;

                const currentDb = getDb();
                if (!currentDb) return;

                // STRICT AUTHENTICATION: Only registered and permitted users can trigger bot actions!
                const authorizedUser = getAuthorizedUser(currentDb, msg);
                if (!authorizedUser) {
                    // Unauthorized sender (stranger, customer, personal chat, unconfigured group)
                    // DO NOT leak any information or reply!
                    return;
                }

                const result = await parseMessage(body, currentDb, authorizedUser);
                if (!result) return;

                const { intent, args } = result;
                let replyText = '';

                switch (intent) {
                    case 'AMBIGUOUS': replyText = `⚠️ شماره ${args.number} تکراری است.`; break;
                    case 'NOT_FOUND': replyText = `❌ سندی با شماره ${args.number} یافت نشد.`; break;
                    case 'APPROVE_PAYMENT': replyText = Actions.handleApprovePayment(currentDb, args.number, authorizedUser); break;
                    case 'REJECT_PAYMENT': replyText = Actions.handleRejectPayment(currentDb, args.number, authorizedUser); break;
                    case 'APPROVE_EXIT': replyText = Actions.handleApproveExit(currentDb, args.number, authorizedUser); break;
                    case 'REJECT_EXIT': replyText = Actions.handleRejectExit(currentDb, args.number, authorizedUser); break;
                    case 'CREATE_PAYMENT': replyText = Actions.handleCreatePayment(currentDb, args, authorizedUser); break;
                    case 'CREATE_BIJAK': replyText = Actions.handleCreateBijak(currentDb, args, authorizedUser); break;
                    case 'REPORT': replyText = Actions.handleReport(currentDb, authorizedUser); break;
                    case 'HELP': replyText = `دستورات مجاز برای کاربر ${authorizedUser.fullName || authorizedUser.username}:\n!تایید [شماره]\n!رد [شماره]\n!گزارش`; break;
                }

                if (replyText) {
                    await msg.reply(replyText);
                    addDiagnosticLog('info', 'MESSAGE', `پاسخ دستور ${intent} به کاربر مجاز (${authorizedUser.username}) در ${msg.from} ارسال شد.`);
                }

            } catch (error) { 
                console.error("Message Error:", error);
                addDiagnosticLog('error', 'MESSAGE', `خطا در پردازش پیام دریافتی: ${error.message}`, error.stack);
            }
        });

        client.initialize().catch(e => {
            console.error("WA Init Fail:", e.message);
            isInitializing = false;
            lastError = e.message;
            addDiagnosticLog('error', 'INIT', `خطا در اجرای پپتیر واتساپ: ${e.message}`, e.stack);
            
            // Automatic self-healing on Chrome lock or process collision
            if (e.message.includes('already running') || e.message.includes('userDataDir') || e.message.includes('EPERM') || e.message.includes('Code: 0')) {
                console.log(">>> [WhatsApp Auto-Healing] Clearing Chrome locks and retrying initialization...");
                addDiagnosticLog('warn', 'INIT', 'تشخیص قفل مرورگر؛ پاکسازی خودکار فرآیندها و تلاش مجدد برای راه‌اندازی...');
                cleanSessionLocks(absoluteAuthDir, 'session-main_session');
                setTimeout(() => {
                    if (!isReady && !isInitializing) {
                        initWhatsApp(authDir);
                    }
                }, 3000);
            }
        });
    } catch (e) { 
        console.error("WA Module Error:", e.message);
        isInitializing = false;
        lastError = e.message;
        addDiagnosticLog('error', 'INIT', `خطا در ماژول واتساپ: ${e.message}`, e.stack);
    }
};

export const getStatus = () => {
    let uptimeSeconds = 0;
    if (isReady && connectedAt) {
        uptimeSeconds = Math.floor((Date.now() - new Date(connectedAt).getTime()) / 1000);
    }

    let browserRunning = false;
    let browserPid = null;
    try {
        if (client && client.pupBrowser) {
            browserRunning = client.pupBrowser.isConnected ? client.pupBrowser.isConnected() : true;
            const proc = client.pupBrowser.process ? client.pupBrowser.process() : null;
            if (proc && proc.pid) browserPid = proc.pid;
        }
    } catch (e) {}

    return { 
        ready: isReady, 
        qr: qrCode, 
        qrDataUrl: qrDataUrl, 
        user: clientInfo,
        initializing: isInitializing,
        error: lastError,
        state: isReady ? 'CONNECTED' : (isInitializing ? 'INITIALIZING' : (qrCode ? 'QR_READY' : (lastError ? 'ERROR' : 'DISCONNECTED'))),
        connectedAt,
        disconnectedAt,
        uptimeSeconds,
        browserStatus: {
            running: browserRunning,
            pid: browserPid
        },
        activeProxy: activeProxyConfig,
        chromePath: lastChromePath,
        authDir: currentAuthDir
    };
};

export const logout = async () => { 
    if (client) { 
        try {
            await client.logout(); 
            addDiagnosticLog('info', 'AUTH', 'خروج از حساب کاربری واتساپ با موفقیت انجام شد.');
        } catch(e) {
            console.warn("Logout warning:", e.message);
            addDiagnosticLog('warn', 'AUTH', `هشدار در خروج از حساب: ${e.message}`);
        }
        isReady = false; 
        qrCode = null; 
        qrDataUrl = null;
        clientInfo = null;
    } 
};

export const getGroups = async () => { 
    if (!client) return []; 
    try {
        if (!isReady && client.pupPage) {
            const page = client.pupPage;
            await page.evaluate(() => {
                if (typeof window.onAppStateHasSyncedEvent === 'function' && !window.__wwebSyncedTriggered) {
                    window.__wwebSyncedTriggered = true;
                    try { window.onAppStateHasSyncedEvent(); } catch (e) {}
                }
            }).catch(() => {});
        }
        if (!isReady) return [];
        const chats = await client.getChats(); 
        const groups = chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name }));
        addDiagnosticLog('info', 'CLIENT', `تعداد ${groups.length} گروه واتساپ دریافت شد.`);
        return groups;
    } catch (e) {
        console.error("Failed to get WhatsApp groups:", e.message);
        addDiagnosticLog('error', 'CLIENT', `خطا در دریافت لیست گروه‌ها: ${e.message}`, e.stack);
        return [];
    }
};

export const sendMediaMessage = async (number, caption, mediaData) => {
    return await sendMessage(number, caption, mediaData);
};

export const sendMessage = async (number, text, mediaData) => {
    // 1. Validation & Persian/Arabic digit normalization of target recipient
    if (!number || (typeof number !== 'string' && typeof number !== 'number') || String(number).trim() === '' || number === 'undefined' || number === 'null') {
        const msg = `[WhatsApp] مقصد پیام نامعتبر یا خالی است: "${number}"`;
        console.warn(msg);
        addDiagnosticLog('warn', 'MESSAGE', msg);
        return { success: false, warning: msg, skipped: true };
    }

    const toAsciiDigits = (s) => String(s)
        .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

    let chatId = toAsciiDigits(String(number).trim());
    if (!chatId.includes('@')) {
        const digits = chatId.replace(/\D/g, '');
        if (digits.length < 10) {
            const msg = `[WhatsApp] شماره مقصد نامعتبر یا بسیار کوتاه است: "${chatId}"`;
            console.warn(msg);
            addDiagnosticLog('warn', 'MESSAGE', msg);
            return { success: false, warning: msg, skipped: true };
        }
        if (digits.length > 15 || chatId.includes('-')) {
            chatId = `${digits}@g.us`;
        } else {
            let cleanDigits = digits;
            if (cleanDigits.startsWith('0098')) {
                cleanDigits = '98' + cleanDigits.substring(4);
            } else if (cleanDigits.startsWith('0')) {
                cleanDigits = '98' + cleanDigits.substring(1);
            } else if (cleanDigits.startsWith('9') && cleanDigits.length === 10) {
                cleanDigits = '98' + cleanDigits;
            }
            chatId = `${cleanDigits}@c.us`;
        }
    } else {
        const [userPart, domainPart] = chatId.split('@');
        const cleanUserPart = domainPart === 'c.us'
            ? userPart.replace(/\D/g, '').replace(/^0098/, '98').replace(/^0/, '98')
            : userPart.trim();
        chatId = `${cleanUserPart}@${domainPart}`;
    }

    // 2. Check client readiness and active browser page safely
    let page = client?.pupPage;
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
        page = await recoverActivePage();
    }

    const browserAlive = client?.pupBrowser && (typeof client.pupBrowser.isConnected === 'function' ? client.pupBrowser.isConnected() : true);

    // Self-heal if WhatsApp Web is synced in browser but ready event was missed or WWebJS needs live patching
    if (client && browserAlive && page && !(typeof page.isClosed === 'function' && page.isClosed())) {
        try {
            await page.evaluate(async () => {
                if (typeof window.require !== 'function') return;
                let hasSynced = false;
                let meUser = null;
                try {
                    const SocketModel = window.require('WAWebSocketModel');
                    hasSynced = !!(SocketModel && SocketModel.Socket && SocketModel.Socket.hasSynced);
                } catch (e) {}
                try {
                    const UserPrefs = window.require('WAWebUserPrefsMeUser');
                    const wid = UserPrefs && UserPrefs.getMaybeMePnUser ? UserPrefs.getMaybeMePnUser() : null;
                    if (wid) meUser = wid.user || wid._serialized;
                } catch (e) {}
                if ((hasSynced || meUser) && typeof window.onAppStateHasSyncedEvent === 'function' && !window.__wwebSyncedTriggered) {
                    window.__wwebSyncedTriggered = true;
                    try { window.onAppStateHasSyncedEvent(); } catch (e) {}
                }
                if (window.WWebJS && !window.WWebJS.__patchedSendSeenLive) {
                    window.WWebJS.__patchedSendSeenLive = true;
                    window.WWebJS.sendSeen = async (cId) => {
                        try {
                            const c = await window.WWebJS.getChat(cId, { getAsModel: false });
                            if (c) {
                                try { window.require('WAWebStreamModel').Stream.markAvailable(); } catch (e) {}
                                await window.require('WAWebUpdateUnreadChatAction').sendSeen({ chat: c, threadId: undefined });
                                try { window.require('WAWebStreamModel').Stream.markUnavailable(); } catch (e) {}
                                return true;
                            }
                        } catch (e) {}
                        return false;
                    };
                }
                // Live-patch WAWebMediaDataUtils & WALinkify so PDF documents never fail on OpaqueData.formData() or undefined content
                try {
                    const MediaDataUtils = window.require('WAWebMediaDataUtils');
                    if (MediaDataUtils && typeof MediaDataUtils.shouldUseMediaCache === 'function' && !MediaDataUtils.__patchedPdfCache) {
                        const origShouldUse = MediaDataUtils.shouldUseMediaCache.bind(MediaDataUtils);
                        MediaDataUtils.shouldUseMediaCache = function (...args) {
                            try {
                                const OpaqueData = window.require('WAWebMediaOpaqueData');
                                if (!OpaqueData?.prototype || typeof OpaqueData.prototype.formData !== 'function') {
                                    return false;
                                }
                                return origShouldUse(...args);
                            } catch (e) {
                                return false;
                            }
                        };
                        MediaDataUtils.__patchedPdfCache = true;
                    }
                } catch (e) {}
                try {
                    const WALinkify = window.require('WALinkify');
                    if (WALinkify && !WALinkify.__patchedSafeLinkify) {
                        if (typeof WALinkify.findLink === 'function') {
                            const origFindLink = WALinkify.findLink.bind(WALinkify);
                            WALinkify.findLink = function (str, ...rest) {
                                if (typeof str !== 'string' || !str) return null;
                                try { return origFindLink(str, ...rest); } catch (e) { return null; }
                            };
                        }
                        if (typeof WALinkify.findLinks === 'function') {
                            const origFindLinks = WALinkify.findLinks.bind(WALinkify);
                            WALinkify.findLinks = function (str, ...rest) {
                                if (typeof str !== 'string' || !str) return [];
                                try { return origFindLinks(str, ...rest); } catch (e) { return []; }
                            };
                        }
                        WALinkify.__patchedSafeLinkify = true;
                    }
                } catch (e) {}
            }).catch(() => {});

            if (!isReady) {
                const storeActive = await page.evaluate(() => {
                    return !!(window.WWebJS && typeof window.require === 'function' && window.require('WAWebCollections')?.Chat);
                }).catch(() => false);
                if (storeActive) {
                    isReady = true;
                    isInitializing = false;
                    if (!connectedAt) connectedAt = new Date().toISOString();
                }
            }
        } catch (e) {}
    }

    if (!client || !isReady || !browserAlive || !page || (typeof page.isClosed === 'function' && page.isClosed())) {
        const warningMsg = `سرویس واتساپ در حال حاضر متصل یا آماده نیست. روال سیستم و ثبت سند با موفقیت انجام شد.`;
        console.warn(`>>> [WhatsApp Soft Warning] ${warningMsg} (مقصد: ${chatId})`);
        addDiagnosticLog('warn', 'MESSAGE', warningMsg, `مقصد: ${chatId} - کلاینت آماده نیست.`);
        return { success: false, warning: warningMsg, skipped: true, error: 'WhatsApp not ready' };
    }

    // 3. For direct personal contacts (@c.us), resolve canonical JID via getNumberId if possible, but never abort on query failure
    let targetJid = chatId;
    if (chatId.endsWith('@c.us')) {
        try {
            const numberOnly = chatId.replace(/\D/g, '');
            const numId = await client.getNumberId(numberOnly).catch(() => undefined);
            if (numId && numId._serialized) {
                targetJid = numId._serialized;
            }
        } catch (e) {
            // Keep targetJid as chatId if getNumberId fails or times out
        }
    }

    // Pre-warm target chat / group metadata in WhatsApp Web Store so sendMessage has valid Chat & GroupMetadata models
    try {
        await page.evaluate(async (jid) => {
            if (typeof window.require !== 'function') return;
            const chatWid = window.require('WAWebWidFactory').createWid(jid);
            const ChatCol = window.require('WAWebCollections').Chat;
            let chat = ChatCol.get(chatWid);
            if (!chat) {
                try {
                    const found = await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid);
                    chat = found?.chat || found;
                } catch (e) {}
            }
            if (!chat && typeof ChatCol.find === 'function') {
                try { chat = await ChatCol.find(chatWid); } catch (e) {}
            }
            if (typeof chatWid.isGroup === 'function' && chatWid.isGroup()) {
                try { await window.require('WAWebCollections').GroupMetadata.update(chatWid); } catch (e) {}
            }
        }, targetJid).catch(() => {});
    } catch (e) {}

    // 4. Prepare MediaData if provided (Direct Photo with Caption standard)
    let media = null;
    if (mediaData && (mediaData.data || mediaData.buffer)) {
        try {
            let cleanBase64 = '';
            const rawMedia = mediaData.data || mediaData.buffer;
            if (Buffer.isBuffer(rawMedia)) {
                cleanBase64 = rawMedia.toString('base64');
            } else if (rawMedia instanceof Uint8Array || ArrayBuffer.isView(rawMedia)) {
                cleanBase64 = Buffer.from(rawMedia).toString('base64');
            } else if (typeof rawMedia === 'string') {
                const trimmed = rawMedia.trim();
                // Handle case where Uint8Array.toString('base64') produced comma-separated bytes "37,80,68,70,..."
                if (/^\d+(,\d+)+$/.test(trimmed.slice(0, 120))) {
                    const bytes = trimmed.split(',').map(n => Number(n));
                    cleanBase64 = Buffer.from(bytes).toString('base64');
                } else {
                    cleanBase64 = trimmed;
                    if (cleanBase64.includes(';base64,')) {
                        cleanBase64 = cleanBase64.split(';base64,')[1];
                    } else if (cleanBase64.startsWith('data:')) {
                        cleanBase64 = cleanBase64.replace(/^data:[^,]+,/, '');
                    }
                    cleanBase64 = cleanBase64.replace(/\s+/g, '');
                }
            }

            if (cleanBase64 && cleanBase64.length % 4 !== 0) {
                cleanBase64 += '='.repeat(4 - (cleanBase64.length % 4));
            }

            if (cleanBase64) {
                const mimeType = mediaData.mimetype || mediaData.mimeType || 'image/jpeg';
                const filename = mediaData.filename || 'document.jpg';
                media = new MessageMedia(mimeType, cleanBase64, filename);
            }
        } catch (mediaPrepErr) {
            console.warn("[WhatsApp] Media preparation warning:", mediaPrepErr.message);
            addDiagnosticLog('warn', 'MESSAGE', `هشدار در آماده‌سازی مدیا: ${mediaPrepErr.message}`);
        }
    }

    // 5. Tier 1 Send Attempt (Direct Media/PDF Document with Caption or Direct Text, with sendSeen: false and linkPreview: false)
    try {
        if (media) {
            const isImageMedia = (media.mimetype || '').startsWith('image/');
            await client.sendMessage(targetJid, media, {
                caption: text || '',
                sendMediaAsDocument: !isImageMedia,
                linkPreview: false,
                sendSeen: false
            });
        } else if (text) {
            await client.sendMessage(targetJid, text, { linkPreview: false, sendSeen: false });
        }
        addDiagnosticLog('success', 'MESSAGE', `پیام با موفقیت به ${targetJid} ارسال شد.`);
        return { success: true, chatId: targetJid };
    } catch (err) {
        console.warn(`[WhatsApp] Send attempt 1 failed for ${targetJid}: ${err.message}`);

        // Tier 2: Fallback via direct chat instance or direct in-page WWebJS.sendMessage evaluation
        try {
            page = await recoverActivePage();
            if (page && !page.isClosed()) {
                // 2a. Try chat instance with sendSeen: false and linkPreview: false
                try {
                    const chat = await client.getChatById(targetJid);
                    if (chat) {
                        if (media) {
                            const isImageMedia = (media.mimetype || '').startsWith('image/');
                            await chat.sendMessage(media, {
                                caption: text || '',
                                sendMediaAsDocument: !isImageMedia,
                                linkPreview: false,
                                sendSeen: false
                            });
                        } else if (text) {
                            await chat.sendMessage(text, { linkPreview: false, sendSeen: false });
                        }
                        addDiagnosticLog('success', 'MESSAGE', `پیام با موفقیت به ${targetJid} (روش Chat Object) ارسال شد.`);
                        return { success: true, chatId: targetJid };
                    }
                } catch (chatErr) {
                    console.warn(`[WhatsApp] Chat object fallback failed: ${chatErr.message}`);
                }

                // 2b. Try direct in-page WWebJS.sendMessage injection (supports both PDF/image media and text!)
                try {
                    const mediaPayload = media ? {
                        mimetype: media.mimetype,
                        data: media.data,
                        filename: media.filename || 'report.pdf'
                    } : null;

                    const evalSent = await page.evaluate(async (jid, msgText, mediaObj) => {
                        const chatWid = window.require('WAWebWidFactory').createWid(jid);
                        const ChatCol = window.require('WAWebCollections').Chat;
                        let chat = ChatCol.get(chatWid);
                        if (!chat) {
                            try {
                                const found = await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid);
                                chat = found?.chat || found;
                            } catch (e) {}
                        }
                        if (!chat && typeof ChatCol.find === 'function') {
                            try { chat = await ChatCol.find(chatWid); } catch (e) {}
                        }
                        if (!chat) throw new Error('چت مقصد در واتساپ وب یافت نشد.');
                        if (typeof chatWid.isGroup === 'function' && chatWid.isGroup()) {
                            try { await window.require('WAWebCollections').GroupMetadata.update(chatWid); } catch (e) {}
                        }

                        const opts = { linkPreview: false };
                        if (mediaObj && mediaObj.data) {
                            opts.media = mediaObj;
                            opts.caption = msgText || '';
                            opts.sendMediaAsDocument = !(mediaObj.mimetype || '').startsWith('image/');
                        }
                        await window.WWebJS.sendMessage(chat, mediaObj && mediaObj.data ? '' : (msgText || ''), opts);
                        return true;
                    }, targetJid, text || '', mediaPayload);

                    if (evalSent) {
                        addDiagnosticLog('success', 'MESSAGE', `پیام با موفقیت به ${targetJid} (روش تزریق مستقیم WWebJS) ارسال شد.`);
                        return { success: true, chatId: targetJid };
                    }
                } catch (evalErr) {
                    console.warn("[WhatsApp] Direct WWebJS.sendMessage injection failed:", evalErr.message);
                }
            }
        } catch (tier2Err) {
            console.warn("[WhatsApp] Tier 2 fallback failed:", tier2Err.message);
        }

        // Tier 3: If media failed, send text caption so recipient still receives the critical notification details!
        if (media && text) {
            try {
                console.log(`[WhatsApp] Falling back to text-only send for ${targetJid}...`);
                await client.sendMessage(targetJid, text, { sendSeen: false });
                addDiagnosticLog('success', 'MESSAGE', `متن اطلاعیه با موفقیت به ${targetJid} ارسال شد (ارسال خودکار متن به جای فایل).`);
                return { success: true, chatId: targetJid, mediaFallbackToText: true };
            } catch (textErr) {
                console.warn("[WhatsApp] Text-only fallback also failed:", textErr.message);
            }
        }

        // If completely failed, NEVER CRASH the business workflow!
        const failMsg = `عدم امکان تحویل پیام به ${targetJid}: ${err.message}. فرآیند سیستم بدون اختلال ثبت شد.`;
        addDiagnosticLog('warn', 'MESSAGE', failMsg, err.stack || err.message);
        return { success: false, warning: failMsg, error: err.message, skipped: true };
    }
};

export const restartSession = async (authDir, clean = false) => {
    console.log(`>>> FORCE RESTARTING WHATSAPP SESSION (clean: ${clean})...`);
    addDiagnosticLog('warn', 'INIT', `درخواست راه‌اندازی مجدد نشست واتساپ (پاکسازی کامل: ${clean ? 'بله' : 'خیر'})`);
    isReady = false; 
    qrCode = null; 
    qrDataUrl = null;
    clientInfo = null;
    isInitializing = true;
    lastError = null;
    if (client) { 
        try { 
            const browser = client.pupBrowser;
            const pid = browser?.process()?.pid;
            await client.destroy(); 
            if (pid && process.platform === 'win32') {
                try { execSync(`taskkill /F /T /PID ${pid} >nul 2>&1 || exit 0`, { stdio: 'ignore', shell: true }); } catch(e) {}
            }
            addDiagnosticLog('info', 'INIT', 'کلاینت قبلی پپتیر با موفقیت نابود (destroy) شد.');
        } catch (e) {
            console.error("Destroy error:", e.message);
            addDiagnosticLog('warn', 'INIT', `هشدار در بستن کلاینت قبلی: ${e.message}`);
        } 
        client = null; 
    }
    cleanSessionLocks(authDir, 'session-main_session');
    if (clean) {
        try {
            const absoluteAuthDir = path.resolve(authDir);
            let wiped = false;
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    cleanSessionLocks(authDir, 'session-main_session');
                    if (fs.existsSync(absoluteAuthDir)) {
                        fs.rmSync(absoluteAuthDir, { recursive: true, force: true });
                        console.log(">>> Cleared WhatsApp session files:", absoluteAuthDir);
                        addDiagnosticLog('info', 'INIT', `پوشه ذخیره‌سازی نشست قبلی پاکسازی شد: ${absoluteAuthDir}`);
                        wiped = true;
                        break;
                    }
                } catch (err) {
                    console.warn(`>>> Retry ${attempt}/5 clearing auth directory (${err.message})...`);
                }
            }
            if (!wiped && fs.existsSync(absoluteAuthDir)) {
                try {
                    const sessionDir = path.join(absoluteAuthDir, 'session-main_session');
                    if (fs.existsSync(sessionDir)) {
                        cleanSessionLocks(authDir, 'session-main_session');
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                } catch(e) {}
            }
        } catch (err) {
            console.error(">>> Error clearing auth directory:", err.message);
            addDiagnosticLog('error', 'INIT', `خطا در پاکسازی پوشه نشست: ${err.message}`);
        }
    }

    setTimeout(() => { initWhatsApp(authDir); }, 2000);
};

export const getDiagnostics = async () => {
    const status = getStatus();
    
    // Check session directory stats
    let sessionStats = { exists: false, fileCount: 0, totalSizeBytes: 0 };
    if (currentAuthDir && fs.existsSync(currentAuthDir)) {
        sessionStats.exists = true;
        try {
            const getDirStats = (dirPath) => {
                let size = 0;
                let count = 0;
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        const sub = getDirStats(full);
                        size += sub.size;
                        count += sub.count;
                    } else {
                        try {
                            const stat = fs.statSync(full);
                            size += stat.size;
                            count++;
                        } catch (e) {}
                    }
                }
                return { size, count };
            };
            const s = getDirStats(currentAuthDir);
            sessionStats.totalSizeBytes = s.size;
            sessionStats.fileCount = s.count;
        } catch (e) {
            sessionStats.error = e.message;
        }
    }

    return {
        success: true,
        status,
        system: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            uptimeSeconds: Math.floor(process.uptime()),
            chromePath: lastChromePath,
            activeProxy: activeProxyConfig,
            authDir: currentAuthDir,
            sessionStats
        },
        logs: diagnosticLogs,
        timestamp: new Date().toISOString()
    };
};

export const runDiagnosticTest = async (customProxy = null) => {
    addDiagnosticLog('info', 'DIAGNOSTIC', 'اجرای تست جامع عیب‌یابی ارتباط واتساپ...');
    const results = {
        timestamp: new Date().toISOString(),
        overallHealthy: true,
        summary: '',
        steps: []
    };

    // Step 1: Chrome / Chromium Executable
    const chrome = findChromeExecutable();
    lastChromePath = chrome;
    if (chrome && fs.existsSync(chrome)) {
        results.steps.push({
            name: 'مرورگر وب پپتیر (Chrome / Chromium)',
            key: 'chrome',
            passed: true,
            status: 'ok',
            message: `فایل اجرایی مرورگر شناسایی شد (${path.basename(chrome)})`,
            detail: chrome
        });
    } else {
        results.overallHealthy = false;
        results.steps.push({
            name: 'مرورگر وب پپتیر (Chrome / Chromium)',
            key: 'chrome',
            passed: false,
            status: 'warning',
            message: 'مسیر صریح مرورگر کروم شناسایی نشد.',
            detail: 'پپتیر ممکن است از نسخه داخلی استفاده کند یا در صورت اجرا روی سرور لینوکس نیاز به نصب chromium داشته باشد.'
        });
    }

    // Step 2: Session Storage & Write Permissions
    const authDir = currentAuthDir || path.resolve('wauth');
    try {
        if (!fs.existsSync(authDir)) {
            fs.mkdirSync(authDir, { recursive: true });
        }
        const testFile = path.join(authDir, `_test_write_${Date.now()}.tmp`);
        fs.writeFileSync(testFile, 'ok', 'utf8');
        fs.unlinkSync(testFile);
        results.steps.push({
            name: 'پوشه نشست و مجوزهای دیسک (Session Storage)',
            key: 'storage',
            passed: true,
            status: 'ok',
            message: 'دسترسی خواندن و نوشتن در پوشه نشست wauth معتبر است.',
            detail: authDir
        });
    } catch (err) {
        results.overallHealthy = false;
        results.steps.push({
            name: 'پوشه نشست و مجوزهای دیسک (Session Storage)',
            key: 'storage',
            passed: false,
            status: 'error',
            message: `عدم امکان نوشتن در پوشه نشست: ${err.message}`,
            detail: err.message
        });
    }

    // Step 3: Network & Proxy Reachability to WhatsApp Web
    let db = null;
    try { db = getDb ? getDb() : null; } catch(e) {}
    const proxy = customProxy ||
        (db && db.settings && (db.settings.whatsappProxy || db.settings.proxyUrl)) ||
        process.env.WHATSAPP_PROXY ||
        process.env.PROXY_URL ||
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY;

    const pingStart = Date.now();
    let latencyMs = 0;

    try {
        let cleanProxy = null;
        let fetchOptions = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(8000)
        };

        if (proxy && typeof proxy === 'string' && proxy.trim()) {
            cleanProxy = proxy.trim();
            if (!cleanProxy.startsWith('http://') && !cleanProxy.startsWith('https://') && !cleanProxy.startsWith('socks5://') && !cleanProxy.startsWith('socks5h://')) {
                cleanProxy = `http://${cleanProxy}`;
            }
            try {
                fetchOptions.dispatcher = new ProxyAgent(cleanProxy);
            } catch (err) {
                console.warn("ProxyAgent setup warning:", err.message);
            }
        }

        const res = await fetch('https://web.whatsapp.com', fetchOptions);
        latencyMs = Date.now() - pingStart;
        const httpStatus = res.status;
        const networkReachable = res.status >= 200 && res.status < 400;

        if (networkReachable) {
            results.steps.push({
                name: 'دسترسی شبکه به سرورهای واتساپ (web.whatsapp.com)',
                key: 'network',
                passed: true,
                status: 'ok',
                message: `ارتباط برقرار شد (پاسخ HTTP ${httpStatus} - تاخیر: ${latencyMs}ms)`,
                latencyMs,
                detail: cleanProxy ? `مسیردهی از پروکسی: ${cleanProxy}` : 'اتصال مستقیم شبکه'
            });
            addDiagnosticLog('success', 'DIAGNOSTIC', `پینگ سرور واتساپ موفق بود: ${latencyMs}ms (HTTP ${httpStatus})`);
        } else {
            results.overallHealthy = false;
            results.steps.push({
                name: 'دسترسی شبکه به سرورهای واتساپ (web.whatsapp.com)',
                key: 'network',
                passed: false,
                status: 'warning',
                message: `پاسخ غیرمنتظره از web.whatsapp.com (کد: ${httpStatus})`,
                latencyMs,
                detail: 'ممکن است فایروال یا کلودفلر درخواست را محدود کرده باشد.'
            });
            addDiagnosticLog('warn', 'DIAGNOSTIC', `پاسخ غیرمنتظره از web.whatsapp.com: HTTP ${httpStatus}`);
        }
    } catch (err) {
        latencyMs = Date.now() - pingStart;
        results.overallHealthy = false;
        let solutionTip = 'اتصال اینترنت، فیلترشکن یا پروکسی را بررسی کنید.';
        if (err.message.includes('ECONNREFUSED')) {
            solutionTip = 'پورت پروکسی باز نیست! اگر از v2rayN یا فیلترشکن استفاده می‌کنید، از روشن بودن نرم‌افزار و پورت آن مطمئن شوید.';
        } else if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout') || err.name === 'TimeoutError') {
            solutionTip = 'مهلت اتصال پایان یافت (Timeout). ممکن است فیلترشکن قطع باشد یا آی‌پی مسدود باشد.';
        } else if (err.message.includes('ENOTFOUND')) {
            solutionTip = 'خطای عدم یافتن آدرس دامنه (DNS). ارتباط شبکه برقرار نیست.';
        }

        results.steps.push({
            name: 'دسترسی شبکه به سرورهای واتساپ (web.whatsapp.com)',
            key: 'network',
            passed: false,
            status: 'error',
            message: `خطای ارتباط با سرورهای واتساپ: ${err.message}`,
            latencyMs,
            detail: solutionTip
        });
        addDiagnosticLog('error', 'DIAGNOSTIC', `خطا در ارتباط با web.whatsapp.com: ${err.message}`, solutionTip);
    }

    // Step 4: WhatsApp Puppeteer Client State
    let clientStatus = 'ok';
    let clientMsg = 'کلاینت واتساپ متصل و فعال است.';
    let clientDetail = `شناسه کاربر: ${clientInfo || 'نامشخص'}`;

    if (isReady) {
        clientStatus = 'ok';
        clientMsg = `کلاینت واتساپ به طور کامل متصل و آنلاین است (کاربر: ${clientInfo})`;
    } else if (isInitializing) {
        clientStatus = 'warning';
        clientMsg = 'کلاینت واتساپ در حال راه‌اندازی مرورگر و بارگذاری صفحه وب است...';
        clientDetail = 'لطفاً چند لحظه صبر کنید تا صفحه وب بارگذاری شود.';
    } else if (qrCode) {
        clientStatus = 'warning';
        clientMsg = 'کد QR آماده است و منتظر اسکن توسط دوربین تلفن همراه است.';
        clientDetail = 'در واتساپ گوشی به بخش Linked Devices رفته و اسکن نمایید.';
    } else if (lastError) {
        clientStatus = 'error';
        clientMsg = `خطا در آخرین اتصال: ${lastError}`;
        clientDetail = 'می‌توانید دکمه «تولید مجدد QR کد» یا «پاکسازی نشست» را بزنید.';
    } else {
        clientStatus = 'warning';
        clientMsg = 'کلاینت واتساپ هنوز راه‌اندازی نشده یا نشست قطع است.';
        clientDetail = 'جهت شروع روی دکمه «تولید مجدد QR کد» کلیک کنید.';
    }

    results.steps.push({
        name: 'وضعیت اجرای ماژول واتساپ (WhatsApp Client State)',
        key: 'client',
        passed: isReady,
        status: clientStatus,
        message: clientMsg,
        detail: clientDetail
    });

    if (isReady && results.overallHealthy) {
        results.summary = 'تمامی مؤلفه‌ها فعال بوده و ارتباط با سرورهای واتساپ کاملاً پایدار است.';
    } else if (qrCode) {
        results.summary = 'ماژول با موفقیت اجرا شد و منتظر اسکن کد QR توسط اپلیکیشن واتساپ گوشی است.';
    } else if (!results.overallHealthy) {
        results.summary = 'اشکال در ارتباط شبکه یا پروکسی شناسایی شد. لطفاً وضعیت VPN یا پروکسی تنظیمی را بررسی کنید.';
    } else {
        results.summary = 'سرویس واتساپ در حال راه‌اندازی یا منتظر اتصال است.';
    }

    return results;
};

export const clearDiagnosticLogs = () => {
    diagnosticLogs.length = 0;
    addDiagnosticLog('info', 'DIAGNOSTIC', 'تاریخچه لاگ‌های عیب‌یابی توسط کاربر پاکسازی شد.');
    return true;
};
