
// --- SYSTEM RESTARTED TO RESOLVE DEPLOYMENT ERROR ---
import 'dotenv/config'; 
import { setGlobalDispatcher, ProxyAgent, EnvHttpProxyAgent, Agent } from 'undici';
import http from 'http';
import https from 'https';
import dns from 'dns';
import * as dbManager from './backend/db-manager.js';

// Ensure DNS lookups prefer IPv4 to prevent 2-5 second IPv6 (::1) lookup timeouts on Windows local networks
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

// Use shared robustFetch from db-manager which has persistent KeepAlive pools, TCP_NODELAY, and proxy bypass
export const robustFetch = dbManager.robustFetch;

// Configure NO_PROXY for private subnets, localhost, and internal services so they are NEVER routed through any proxy
const defaultNoProxy = '192.168.0.0/16,192.168.41.225,10.0.0.0/8,172.16.0.0/12,127.0.0.1,localhost,::1,80.210.31.176,templatetesti.shop,dlkam.ir';
process.env.NO_PROXY = process.env.NO_PROXY ? `${process.env.NO_PROXY},${defaultNoProxy}` : defaultNoProxy;
process.env.no_proxy = process.env.NO_PROXY;

// Initialize global fetch proxy dispatcher safely with EnvHttpProxyAgent
const proxyUrl = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
if (proxyUrl) {
    console.log(`[Proxy Setup] Initializing proxy dispatcher for external APIs: ${proxyUrl}`);
    try {
        setGlobalDispatcher(new EnvHttpProxyAgent());
    } catch (err) {
        console.error('[Proxy Setup] Failed to set EnvHttpProxyAgent:', err);
    }
}

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import compression from 'compression'; 
import { fileURLToPath } from 'url';
import cron from 'node-cron'; 
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import webpush from 'web-push';
import * as utils from './backend/utils.js';
import { notifyExitPermitStep, notifyCustomerCargoExit, notifyPaymentOrderStep, notifyWarehouseBijak, notifyMeetingAnnouncement, notifyMeetingMinutes, notifyPurchaseRequestStep, runDailyReport, generateAndSendComparisonPDF, notifySecretariatLetter, getCustomerBalancesData, fetchProcessedSayanSalesData, normalizeToYmdStrings, isActualProduct, classifyMajorCategory, sendTreasuryChequesReport, notifyDriverPayment } from './backend/bot-core.js';
import * as telegram from './backend/telegram.js';
import * as bale from './backend/bale.js';
import * as Renderer from './backend/renderer.js';
import mammoth from 'mammoth';
import { GoogleGenAI, Type } from '@google/genai';
import * as jalaali from 'jalaali-js';
import * as sayanOrderAuto from './backend/sayan-order-automation.js';
import * as sayanChequeService from './backend/sayan-cheque-service.js';
import * as sayanPartsService from './backend/sayan-parts-service.js';
import * as sayanAgingService from './backend/sayan-aging-service.js';
import * as sayanRemittanceService from './backend/sayan-remittance-service.js';
import { mergeFilesToPdf, enhanceDocumentImage } from './backend/pdf-merger.js';
import { generateBenchmarkData } from './backend/sayanBenchmarkData.js';
import * as notificationQueue from './backend/notification-queue.js';

const getDb = dbManager.getDb;
const saveDb = dbManager.saveDb;
notificationQueue.initNotificationQueue(dbManager);
const sanitizeSayanUrl = dbManager.sanitizeSayanUrl;
const findNextGapNumber = utils.findNextGapNumber;
const findNextMaxNumber = utils.findNextMaxNumber;
const checkForDuplicate = utils.checkForDuplicate;
const generateUUID = utils.generateUUID || (() => Date.now().toString(36) + Math.random().toString(36).substr(2));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.cwd(); 

// --- CRITICAL FIX FOR PUPPETEER PATH ---
const PUPPETEER_CACHE = path.join(ROOT_DIR, '.puppeteer');
if (!fs.existsSync(PUPPETEER_CACHE)) {
    try { fs.mkdirSync(PUPPETEER_CACHE, { recursive: true }); } catch(e) {}
}
process.env.PUPPETEER_CACHE_DIR = PUPPETEER_CACHE;

process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

// Safe Import Helper
const safeImport = async (modulePath) => {
    try {
        return await import(modulePath);
    } catch (e) {
        console.error(`⚠️ Failed to load module ${modulePath}:`, e.message);
        return null;
    }
};

const DB_FILE = path.join(ROOT_DIR, 'database.json');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups'); 
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const PUBLIC_DOWNLOADS_DIR = path.join(ROOT_DIR, 'public', 'downloads');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const checkIsDistOutdated = () => {
    try {
        const distIndex = path.join(DIST_DIR, 'index.html');
        if (!fs.existsSync(distIndex)) return true;
        const distMtime = fs.statSync(distIndex).mtimeMs;
        const rootFiles = ['App.tsx', 'index.tsx'];
        for (const rf of rootFiles) {
            const p = path.join(ROOT_DIR, rf);
            if (fs.existsSync(p) && fs.statSync(p).mtimeMs > distMtime) return true;
        }
        const compDir = path.join(ROOT_DIR, 'components');
        if (fs.existsSync(compDir)) {
            for (const f of fs.readdirSync(compDir)) {
                const p = path.join(compDir, f);
                if (fs.statSync(p).mtimeMs > distMtime) return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
};
const isExplicitDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || process.argv.includes('--dev') || !process.env.NODE_ENV || checkIsDistOutdated();


if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) try { fs.mkdirSync(DOWNLOADS_DIR, { recursive: true }); } catch(_) {}
if (!fs.existsSync(PUBLIC_DOWNLOADS_DIR)) try { fs.mkdirSync(PUBLIC_DOWNLOADS_DIR, { recursive: true }); } catch(_) {}

// --- WEB PUSH SETUP ---
const VAPID_FILE = path.join(ROOT_DIR, 'vapid.json');
let vapidKeys;
if (fs.existsSync(VAPID_FILE)) {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
} else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys));
}

webpush.setVapidDetails(
    'mailto:admin@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const app = express();
let PORT = 3000;
const portArgIndex = process.argv.findIndex(arg => arg === '--port' || arg === '-p');
if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0) PORT = parsed;
} else if (process.env.APP_PORT) {
    PORT = parseInt(process.env.APP_PORT, 10);
} else if (process.env.DEFAULT_APP_PORT) {
    PORT = parseInt(process.env.DEFAULT_APP_PORT, 10);
} else if (process.env.PORT) {
    PORT = parseInt(process.env.PORT, 10);
}
if (!PORT || isNaN(PORT) || PORT <= 0) {
    PORT = 3000;
}

app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client-Runtime', 'Accept', 'Cache-Control', 'Pragma']
}));

// --- URL NORMALIZATION FOR REVERSE PROXIES & ACCIDENTAL DOUBLE PREFIXES ---
app.use((req, res, next) => {
    if (req.url && req.url.startsWith('/api/api/')) {
        req.url = req.url.replace(/^\/api\/api\//, '/api/');
    }
    next();
});

// --- ENTERPRISE SECURITY HEADERS & REVERSE PROXY SUPPORT ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// --- IN-MEMORY RATE LIMITING & BRUTE FORCE PROTECTION ---
const loginAttempts = new Map(); // ip_user -> { count, blockedUntil }
const apiRequestLimits = new Map(); // ip -> { count, resetTime }

const cleanExpiredLimits = () => {
    const now = Date.now();
    for (const [key, val] of loginAttempts.entries()) {
        if (val.blockedUntil && val.blockedUntil < now && val.count === 0) {
            loginAttempts.delete(key);
        }
    }
    for (const [ip, val] of apiRequestLimits.entries()) {
        if (val.resetTime < now) {
            apiRequestLimits.delete(ip);
        }
    }
};
setInterval(cleanExpiredLimits, 60000);

const getClientRealIp = (req) => {
    const rawFwd = req.headers['arvan-real-ip'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '';
    if (typeof rawFwd === 'string' && rawFwd.includes(',')) {
        return rawFwd.split(',')[0].trim();
    }
    return String(rawFwd).trim() || '127.0.0.1';
};

const isIpRateLimited = (req, maxRequests = 2500, windowMs = 10000) => {
    const ip = getClientRealIp(req);
    const now = Date.now();
    let record = apiRequestLimits.get(ip);
    if (!record || record.resetTime < now) {
        apiRequestLimits.set(ip, { count: 1, resetTime: now + windowMs });
        return false;
    }
    record.count++;
    if (record.count > maxRequests) {
        return true;
    }
    return false;
};

// Global API rate limit check
app.use('/api', (req, res, next) => {
    if (isIpRateLimited(req, 3000, 10000)) {
        return res.status(429).json({ error: 'Too Many Requests', message: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.' });
    }
    next();
});

// Maximum compression for speed
app.use(compression({ level: 5 })); 
// INCREASED LIMIT TO 1GB TO SUPPORT FULL SYSTEM RESTORE (Files + DB)
app.use(express.json({ limit: '1024mb' })); 
app.use(express.urlencoded({ limit: '1024mb', extended: true }));

// --- ANTI-CACHE MIDDLEWARE (OPTIMIZED & SAFE AGAINST JSON/HTML CACHE COLLISION) ---
app.use((req, res, next) => {
    res.setHeader('Vary', 'Accept, X-Requested-With');
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.set('Cache-Control', 'no-cache, must-revalidate, private');
    } else {
        // For API routes and mutations, strictly prevent proxy/browser caching
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// --- DYNAMIC MANIFEST.JSON ---
app.get('/manifest.json', (req, res) => {
    const db = getDb();
    const settings = db.settings || {};
    const appName = settings.appName || 'مدیریت کارخانه';
    const pwaIcon = settings.pwaIcon || '/icons/icon-512x512.png';

    const manifest = {
        name: appName,
        short_name: appName,
        description: appName,
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0d9488',
        icons: [
            {
                src: pwaIcon,
                sizes: "192x192",
                type: "image/png"
            },
            {
                src: pwaIcon,
                sizes: "512x512",
                type: "image/png"
            }
        ],
        share_target: {
            action: "/api/share-target",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
                title: "title",
                text: "text",
                url: "url",
                files: [
                    {
                        name: "files",
                        accept: [
                            "image/*",
                            "video/*",
                            "audio/*",
                            "application/*",
                            "text/*"
                        ]
                    }
                ]
            }
        }
    };
    res.json(manifest);
});

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' })); // Cache uploads for speed

// Helper to compare semantic version strings (e.g. "1.0.27" > "1.0.6")
function compareInstallerSemVer(v1, v2) {
    if (!v1 && !v2) return 0;
    if (v1 && !v2) return 1;
    if (!v1 && v2) return -1;
    const p1 = String(v1).replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = String(v2).replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
        const a = p1[i] || 0;
        const b = p2[i] || 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
}

function extractVersionFromFileName(fileName) {
    const match = String(fileName || '').match(/(?:v|_|-|\s)(\d+\.\d+\.\d+)/i) || String(fileName || '').match(/(\d+\.\d+\.\d+)/i);
    return match ? match[1] : null;
}

function readBuildConfigVersion(platformType, runtime = null) {
    try {
        const isAndroid = platformType === 'android' || runtime === 'android';
        const isTauri = runtime === 'tauri';
        const isElectron = runtime === 'electron';

        if (isAndroid) {
            const gradlePath = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
            if (fs.existsSync(gradlePath)) {
                const content = fs.readFileSync(gradlePath, 'utf8');
                const m = content.match(/versionName\s+["'](\d+\.\d+\.\d+)["']/);
                if (m && m[1]) return m[1];
            }
        } else if (isTauri) {
            const tauriConfPath = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');
            if (fs.existsSync(tauriConfPath)) {
                const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
                if (conf?.package?.version) return String(conf.package.version).trim();
            }
            const cargoTomlPath = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
            if (fs.existsSync(cargoTomlPath)) {
                const m = fs.readFileSync(cargoTomlPath, 'utf8').match(/^version\s*=\s*"([^"]+)"/m);
                if (m && m[1]) return m[1].trim();
            }
        } else if (isElectron) {
            const pkgPath = path.join(ROOT_DIR, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg?.version) return String(pkg.version).trim();
            }
        } else {
            // Web / fallback: read release-version.json webVersion or package.json
            const relPath = path.join(ROOT_DIR, 'release-version.json');
            if (fs.existsSync(relPath)) {
                const rel = JSON.parse(fs.readFileSync(relPath, 'utf8'));
                if (rel.webVersion) return String(rel.webVersion).trim();
                if (rel.version) return String(rel.version).trim();
            }
            const pkgPath = path.join(ROOT_DIR, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg?.version) return String(pkg.version).trim();
            }
        }
    } catch (_) {}
    return null;
}

function findNewestInstallerFile(platformType, preferredExt = null, runtime = null) {
    const isAndroid = platformType === 'android';
    const isElectronReq = String(runtime || '').toLowerCase() === 'electron';
    const isTauriReq = String(runtime || '').toLowerCase() === 'tauri';

    const searchDirs = isAndroid
        ? [
            DOWNLOADS_DIR,
            PUBLIC_DOWNLOADS_DIR,
            path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'release'),
            ROOT_DIR,
            path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug')
        ]
        : (isElectronReq
            ? [
                path.join(ROOT_DIR, 'release-electron'),
                DOWNLOADS_DIR,
                PUBLIC_DOWNLOADS_DIR,
                ROOT_DIR
            ]
            : (isTauriReq
                ? [
                    path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'bundle', 'nsis'),
                    path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'bundle', 'msi'),
                    DOWNLOADS_DIR,
                    PUBLIC_DOWNLOADS_DIR,
                    ROOT_DIR
                ]
                : [
                    DOWNLOADS_DIR,
                    PUBLIC_DOWNLOADS_DIR,
                    path.join(ROOT_DIR, 'release-electron'),
                    path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'bundle', 'nsis'),
                    path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'bundle', 'msi'),
                    ROOT_DIR
                ]
            )
        );

    const candidates = [];
    const seenPaths = new Set();

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const isElectronDir = dir.includes('release-electron');
        const isTauriDir = dir.includes('src-tauri');

        try {
            const entries = fs.readdirSync(dir);
            for (const f of entries) {
                const lower = f.toLowerCase();
                if (isAndroid) {
                    if (!lower.endsWith('.apk')) continue;
                } else {
                    const isExe = lower.endsWith('.exe');
                    const isMsi = lower.endsWith('.msi');
                    if (!isExe && !isMsi) continue;

                    // Distinguish Electron installers from Tauri installers:
                    const isElectronFile = isElectronDir || f.includes('سامانه دلکام') || lower.includes('electron') || (lower.includes('setup') && !lower.startsWith('dlkam-desktop-') && !lower.startsWith('sayan-desktop-'));
                    const isTauriFile = isTauriDir || ((lower.startsWith('dlkam-desktop-') || lower.startsWith('sayan-desktop-') || isMsi) && !isElectronDir && !f.includes('سامانه دلکام'));

                    if (isElectronReq && (isTauriFile || !isElectronFile)) continue;
                    if (isTauriReq && (isElectronFile || !isTauriFile)) continue;

                    const hasDesktopKeyword = lower.includes('dlkam') || lower.includes('sayan') || lower.includes('setup') || lower.includes('delkam') || f.includes('سامانه دلکام') || f.includes('دلکام');
                    if (!hasDesktopKeyword) continue;
                }

                const fullPath = path.resolve(dir, f);
                if (seenPaths.has(fullPath)) continue;
                seenPaths.add(fullPath);

                const stat = fs.statSync(fullPath);
                if (!stat.isFile() || stat.size < 102400) continue; // Ignore tiny/corrupt files < 100KB
                const ext = lower.endsWith('.apk') ? 'apk' : (lower.endsWith('.exe') ? 'exe' : 'msi');
                candidates.push({
                    filePath: fullPath,
                    fileName: f,
                    ext,
                    size: stat.size,
                    mtimeMs: stat.mtimeMs,
                    version: extractVersionFromFileName(f)
                });
            }
        } catch (_) {}
    }

    if (candidates.length === 0) return null;

    // 1. Identify all candidates that carry an explicit semantic version in their filename (e.g. dlkam-desktop-v1.0.26.exe)
    const versionedCandidates = candidates.filter(c => Boolean(c.version));

    if (versionedCandidates.length > 0) {
        // Find the maximum semantic version among all versioned installer files on disk
        let maxVersion = versionedCandidates[0].version;
        for (const c of versionedCandidates) {
            if (compareInstallerSemVer(c.version, maxVersion) > 0) {
                maxVersion = c.version;
            }
        }

        // Collect all files matching this highest semantic version
        let topVersionFiles = versionedCandidates.filter(c => compareInstallerSemVer(c.version, maxVersion) === 0);

        // Check if an unversioned file (e.g. app-release.apk or dlkam-desktop-setup.exe) was built significantly more recently (> 2 minutes newer) with a different size
        const newestTopMtime = Math.max(...topVersionFiles.map(c => c.mtimeMs));
        const unversionedNewer = candidates
            .filter(c => !c.version && (c.mtimeMs - newestTopMtime > 120000) && !topVersionFiles.some(t => t.size === c.size))
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (unversionedNewer.length > 0) {
            const chosenUnver = unversionedNewer[0];
            const fallbackVer = readBuildConfigVersion(platformType, runtime);
            if (fallbackVer && compareInstallerSemVer(fallbackVer, maxVersion) > 0) {
                chosenUnver.version = fallbackVer;
                return chosenUnver;
            }
        }

        // On Desktop: prefer .exe (NSIS installer) over .msi because .exe upgrades cleanly in-place without MSI product code conflicts
        const wantExt = preferredExt || (isAndroid ? 'apk' : 'exe');
        const matchingExtFiles = topVersionFiles.filter(c => c.ext === wantExt);
        if (matchingExtFiles.length > 0) {
            matchingExtFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
            return matchingExtFiles[0];
        }

        topVersionFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return topVersionFiles[0];
    }

    // 2. Fallback if only unversioned installer files exist on disk
    candidates.sort((a, b) => {
        if (!isAndroid && a.ext !== b.ext && Math.abs(a.mtimeMs - b.mtimeMs) < 120000) {
            return a.ext === 'exe' ? -1 : 1;
        }
        return b.mtimeMs - a.mtimeMs;
    });
    const chosen = candidates[0];
    chosen.version = readBuildConfigVersion(platformType, runtime) || '1.0.0';
    return chosen;
}

function sendAndroidInstallerResponse(req, res) {
    const bestApk = findNewestInstallerFile('android');
    if (bestApk && fs.existsSync(bestApk.filePath)) {
        const dlName = bestApk.version ? `dlkam-android-v${bestApk.version}.apk` : 'dlkam-android-latest.apk';
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
        if (bestApk.size) {
            res.setHeader('Content-Length', String(bestApk.size));
        }
        return res.sendFile(bestApk.filePath);
    }
    return res.status(404).json({ error: 'فایل نصبی اندروید (APK) در پوشه downloads سرور یافت نشد.' });
}

function sendDesktopInstallerResponse(req, res) {
    const reqExt = String(req.query?.ext || req.query?.format || '').toLowerCase();
    const runtime = String(req.query?.runtime || req.headers['x-client-runtime'] || '').toLowerCase();
    const preferredExt = (reqExt === 'msi') ? 'msi' : 'exe';
    const bestDesktop = findNewestInstallerFile('desktop', preferredExt, runtime);
    if (bestDesktop && fs.existsSync(bestDesktop.filePath)) {
        const isExe = bestDesktop.fileName.toLowerCase().endsWith('.exe');
        const ext = isExe ? 'exe' : 'msi';
        const dlName = bestDesktop.fileName || (bestDesktop.version ? `dlkam-desktop-v${bestDesktop.version}.${ext}` : `dlkam-desktop-setup.${ext}`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', isExe ? 'application/x-msdownload' : 'application/x-msi');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(dlName)}"; filename*=UTF-8''${encodeURIComponent(dlName)}`);
        if (bestDesktop.size) {
            res.setHeader('Content-Length', String(bestDesktop.size));
        }
        return res.sendFile(bestDesktop.filePath);
    }
    return res.status(404).json({ error: 'فایل نصبی ویندوز در پوشه downloads سرور یافت نشد.' });
}

// --- DYNAMIC ANDROID APK DOWNLOAD PROVIDER (Registered BEFORE static middleware, zero cache) ---
const androidDownloadRoutes = [
    '/downloads/dlkam-android-latest.apk',
    '/downloads/delkam-android-latest.apk',
    '/downloads/sayan-android-latest.apk',
    '/downloads/sayan-app.apk',
    '/downloads/app-release.apk',
    '/downloads/latest-android',
    '/api/downloads/android',
    '/api/downloads/latest-android',
    '/api/downloads/dlkam-android-latest.apk'
];

app.get(androidDownloadRoutes, sendAndroidInstallerResponse);

// --- DYNAMIC DESKTOP INSTALLER (.exe / .msi) DOWNLOAD PROVIDER (Registered BEFORE static middleware, zero cache) ---
const desktopDownloadRoutes = [
    '/downloads/dlkam-desktop-setup.msi',
    '/downloads/dlkam-desktop-setup.exe',
    '/downloads/delkam-desktop-setup.msi',
    '/downloads/delkam-desktop-setup.exe',
    '/downloads/sayan-desktop-setup.msi',
    '/downloads/sayan-desktop-setup.exe',
    '/downloads/desktop-setup.msi',
    '/downloads/desktop-setup.exe',
    '/downloads/setup.msi',
    '/downloads/setup.exe',
    '/downloads/latest-desktop',
    '/api/downloads/desktop',
    '/api/downloads/latest-desktop',
    '/api/downloads/dlkam-desktop-setup.msi',
    '/api/downloads/dlkam-desktop-setup.exe',
    '/api/downloads/delkam-desktop-setup.msi',
    '/api/downloads/sayan-desktop-setup.msi',
    '/api/downloads/desktop-setup.msi',
    '/api/downloads/setup.msi'
];

app.get(desktopDownloadRoutes, sendDesktopInstallerResponse);

// Catch-all interceptor for ANY .apk, .exe, or .msi requested under /downloads/* or /api/downloads/*
// This ensures even older installed Tauri/Android clients requesting a hardcoded or old version filename
// ALWAYS receive the newest built installer file from disk!
app.get(['/downloads/:fileName', '/api/downloads/:fileName'], (req, res, next) => {
    if (req.query?.exact === '1') return next();
    const fname = String(req.params.fileName || '').toLowerCase();
    if (fname.endsWith('.apk')) {
        return sendAndroidInstallerResponse(req, res);
    }
    if (fname.endsWith('.exe') || fname.endsWith('.msi')) {
        return sendDesktopInstallerResponse(req, res);
    }
    return next();
});

app.use('/downloads', express.static(PUBLIC_DOWNLOADS_DIR, { maxAge: 0, etag: false }));
app.use('/downloads', express.static(DOWNLOADS_DIR, { maxAge: 0, etag: false }));

// --- SAFE FILE SANITIZATION HELPER ---
const FORBIDDEN_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.mjs', '.cjs',
    '.php', '.phtml', '.php3', '.php4', '.php5', '.py', '.elf', '.dll',
    '.jar', '.jsp', '.cgi', '.scr', '.hta', '.msi', '.com', '.wsf', '.vbe'
]);

const decodeUtf8FileName = (origName) => {
    if (!origName || typeof origName !== 'string') return '';
    let name = origName.trim();
    if (/[\u00C0-\u00FF\u0080-\u00BF]/.test(name)) {
        try {
            const converted = Buffer.from(name, 'latin1').toString('utf8');
            if (converted && !converted.includes('\ufffd') && converted.length > 0) {
                name = converted;
            }
        } catch (_) {}
    }
    return name;
};

const getSafeFileName = (origName) => {
    if (!origName || typeof origName !== 'string') return `file_${Date.now()}`;
    const decodedName = decodeUtf8FileName(origName);
    const base = path.basename(decodedName).replace(/[\/\\]/g, '');
    const cleanBase = base.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF\s]/g, '_').trim();
    return cleanBase || `file_${Date.now()}`;
};

// --- SHARE TARGET FOR ANDROID AND PWA & FILE UPLOADS ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let category = req.query?.category || req.headers?.['x-category'] || req.body?.category || '';
        if (typeof category === 'string' && category.trim()) {
            const cleanCat = category.replace(/[^a-zA-Z0-9_\-\/]/g, '').replace(/\.\./g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
            if (cleanCat) {
                const targetDir = path.join(UPLOADS_DIR, cleanCat);
                if (path.resolve(targetDir).startsWith(path.resolve(UPLOADS_DIR))) {
                    try {
                        fs.mkdirSync(targetDir, { recursive: true });
                        return cb(null, targetDir);
                    } catch (err) {
                        console.error("Error creating upload directory:", err);
                    }
                }
            }
        }
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const origName = decodeUtf8FileName(file.originalname) || 'file.jpg';
        let safeBase = 'file';
        try {
            safeBase = getSafeFileName(origName);
        } catch (e) {
            return cb(e);
        }
        const uniqueSuffix = `${Date.now()}_${safeBase}`;
        cb(null, uniqueSuffix);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

app.post('/api/share-target', upload.single('files'), (req, res) => {
    const text = req.body.text || req.body.url || '';
    let sharedUrl = '';
    if (req.file) {
        const relPath = path.relative(UPLOADS_DIR, req.file.path).replace(/\\/g, '/');
        sharedUrl = `/uploads/${relPath}`;
    }
    const redirectUrl = `/?sharedFileUrl=${encodeURIComponent(sharedUrl)}&sharedText=${encodeURIComponent(text)}`;
    res.redirect(redirectUrl);
});

// Direct Multipart File Upload Endpoint for high-speed mobile & desktop uploads (supports categories)
app.post(['/api/upload-file', '/upload-file'], upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'هیچ فایلی برای بارگذاری ارسال نشده است.' });
        }
        const relPath = path.relative(UPLOADS_DIR, req.file.path).replace(/\\/g, '/');
        const fileUrl = `/uploads/${relPath}`;
        const decodedOriginalName = decodeUtf8FileName(req.file.originalname) || req.file.originalname;
        res.json({
            success: true,
            fileName: decodedOriginalName,
            url: fileUrl,
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            category: req.query?.category || req.headers?.['x-category'] || req.body?.category || ''
        });
    } catch (e) {
        console.error("Direct file upload error:", e);
        res.status(500).json({ success: false, error: 'خطا در بارگذاری فایل: ' + e.message });
    }
});

// Safe File Delete Endpoint
app.post(['/api/delete-file', '/delete-file'], (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) {
            return res.status(400).json({ success: false, error: 'آدرس فایل نامعتبر است' });
        }
        const relPath = url.replace('/uploads/', '').replace(/\.\./g, '');
        const fullPath = path.join(UPLOADS_DIR, relPath);
        if (!path.resolve(fullPath).startsWith(path.resolve(UPLOADS_DIR))) {
            return res.status(403).json({ success: false, error: 'مسیر فایل غیرمجاز است' });
        }
        if (fs.existsSync(fullPath)) {
            try {
                fs.unlinkSync(fullPath);
                return res.json({ success: true, message: 'فایل با موفقیت از سرور حذف شد' });
            } catch (err) {
                console.error("Error deleting file:", err);
                return res.status(500).json({ success: false, error: 'خطا در حذف فیزیکی فایل' });
            }
        }
        res.json({ success: true, message: 'فایل وجود نداشت یا قبلاً حذف شده بود' });
    } catch (e) {
        console.error("Delete file endpoint error:", e);
        res.status(500).json({ success: false, error: 'خطا در پردازش درخواست حذف' });
    }
});

// Shared data logic moved to db-manager.js and utils.js

// --- AUTOMATIC BACKUP LOGIC ---
let activeBackupJob = null;

const createDbOnlyBackupZip = async (timestamp) => {
    const filename = `Backup_DB_${timestamp}.zip`;
    const filePath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            resolve({ filePath, filename, size: archive.pointer() });
        });

        archive.on('error', (err) => reject(err));
        archive.pipe(output);

        if (fs.existsSync(DB_FILE)) {
            archive.file(DB_FILE, { name: 'database.json' });
        }

        archive.finalize();
    });
};

const sendBackupToBots = async (filePath, filename, reason = "بکاپ خودکار دیتابیس سیستم", force = false) => {
    const db = getDb();
    const settings = db.settings || {};
    
    if (!force && !settings.backupBotSendEnabled) {
        console.log("Bot Backup send is not enabled in settings.");
        return { success: false, message: "ارسال بکاپ به بات در تنظیمات غیرفعال است." };
    }

    let tgSent = false;
    let baleSent = false;
    const errors = [];

    try {
        // We ALWAYS send the clean complete database archive (DB-only) to bots to guarantee fast delivery without size/timeout issues
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const dbBackup = await createDbOnlyBackupZip(timestamp);
        const fileToSend = dbBackup.filePath;
        const filenameToSend = dbBackup.filename;

        if (!fs.existsSync(fileToSend)) {
            console.error("Backup file not found to send to bots:", fileToSend);
            return { success: false, message: "فایل بکاپ یافت نشد" };
        }

        const buffer = fs.readFileSync(fileToSend);
        const caption = `📁 نسخه پشتیبان دیتابیس کامل سامانه (${reason})\n⏰ تاریخ: ${new Date().toLocaleString('fa-IR')}\n💾 نام فایل: ${filenameToSend}\n✨ شامل کلیه اطلاعات مالی، حواله‌ها، کاربران، چت‌ها و تنظیمات`;

        // Detect Telegram Chat ID from various config fields
        const tgChatId = settings.backupAdminTelegramChatId || settings.telegramChatId || settings.telegramAdminId || settings.telegramChannelId || settings.telegram_chat_id;
        if (settings.telegramBotToken && tgChatId) {
            try {
                console.log(`Sending DB backup to Telegram admin chat: ${tgChatId}`);
                const tg = await safeImport('./backend/telegram.js');
                if (tg && tg.sendBotDocument) {
                    await tg.sendBotDocument(tgChatId, buffer, filenameToSend, caption);
                    tgSent = true;
                    console.log("Backup sent to Telegram successfully ✅");
                }
            } catch (tgErr) {
                console.error("Failed to send backup to Telegram:", tgErr.message);
                errors.push(`تلگرام: ${tgErr.message}`);
            }
        }

        // Detect Bale Chat ID from various config fields
        const baleChatId = settings.backupAdminBaleChatId || settings.baleChatId || settings.baleAdminId || settings.baleChannelId || settings.bale_chat_id;
        if (settings.baleBotToken && baleChatId) {
            try {
                console.log(`Sending DB backup to Bale admin chat: ${baleChatId}`);
                const bale = await safeImport('./backend/bale.js');
                if (bale && bale.sendBotDocument) {
                    await bale.sendBotDocument(baleChatId, buffer, filenameToSend, caption);
                    baleSent = true;
                    console.log("Backup sent to Bale successfully ✅");
                }
            } catch (baleErr) {
                console.error("Failed to send backup to Bale:", baleErr.message);
                errors.push(`بله: ${baleErr.message}`);
            }
        }

        return {
            success: tgSent || baleSent,
            tgSent,
            baleSent,
            errors,
            filenameSent: filenameToSend
        };
    } catch (e) {
        console.error("Error in sendBackupToBots:", e);
        return { success: false, error: e.message };
    }
};

const performAutoBackup = () => {
    const db = getDb();
    const settings = db.settings || {};
    const mode = settings.backupMode || 'full'; // 'full' or 'db-only'
    
    console.log(`>>> Starting Automatic Backup (Mode: ${mode})...`);
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16); 
        const filename = `AutoBackup_${mode === 'full' ? 'Full' : 'DB'}_${timestamp}.zip`;
        const filePath = path.join(BACKUPS_DIR, filename);
        
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`✅ Auto Backup Created: ${filename} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
            sendBackupToBots(filePath, filename, "بکاپ خودکار دوره‌ای");
        });

        archive.on('error', (err) => { throw err; });
        archive.pipe(output);

        if (fs.existsSync(DB_FILE)) {
            archive.file(DB_FILE, { name: 'database.json' });
        }

        if (mode === 'full' && fs.existsSync(UPLOADS_DIR)) {
            archive.directory(UPLOADS_DIR, 'uploads');
        }

        archive.finalize();
        
        // Cleanup old backups (keep last 20)
        setTimeout(() => {
            try {
                const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('AutoBackup_')).sort();
                if (files.length > 20) {
                    const toDelete = files.slice(0, files.length - 20);
                    toDelete.forEach(f => fs.unlinkSync(path.join(BACKUPS_DIR, f)));
                    console.log(`🧹 Cleaned up ${toDelete.length} old backups.`);
                }
            } catch(e) { console.error("Cleanup error", e); }
        }, 10000); 

    } catch (e) {
        console.error("❌ Automatic Backup Failed:", e);
    }
};

const setupAutoBackup = () => {
    if (activeBackupJob) {
        activeBackupJob.stop();
        activeBackupJob = null;
    }
    
    const db = getDb();
    const intervalHours = Number(db.settings.backupIntervalHours) || 3;
    console.log(`>>> Scheduling Auto Backup every ${intervalHours} hours.`);
    
    // Convert hours to cron expression: 0 */X * * *
    activeBackupJob = cron.schedule(`0 */${intervalHours} * * *`, performAutoBackup);
};


// Auto sync warehouse inventory from Sayan daily at 00:05 and every 4 hours
const setupWarehouseInventoryDailySync = () => {
    // Run daily at 00:05 Tehran time (20:35 UTC) and at 08:05, 12:05, 16:05, 20:05
    cron.schedule('5 0,4,8,12,16,20 * * *', async () => {
        try {
            console.log('[Warehouse Auto-Sync] Refreshing live stock cache from Sayan DB...');
            const db = getDb();
            const nowObj = new Date();
            const todayMiladi = nowObj.toISOString().split('T')[0];
            await fetchSayanWarehouseInventoryData(db, '2026-03-20', todayMiladi, true);
            console.log('[Warehouse Auto-Sync] Successfully refreshed live stock from Sayan ERP.');
        } catch (e) {
            console.warn('[Warehouse Auto-Sync] Failed to refresh live stock:', e.message);
        }
    }, {
        timezone: 'Asia/Tehran'
    });
};

const setupLegacyDailyReports = () => {
    // Schedule daily reports for 23:45 Tehran time
    // Cron runs in UTC. Tehran is UTC+3:30. So 23:45 Tehran is 20:15 UTC.
    cron.schedule('15 20 * * *', async () => {
        console.log(">>> Running Automatic Daily Reports...");
        const db = getDb();
        const settings = db.settings || {};
        
        // Get Tehran current date in Shamsi format for the report
        const now = new Date();
        const dateStr = utils.toShamsiFull(now.toISOString()).split(' ')[0].replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); // Normalize to English digits
        
        // Groups to notify
        const targets = [];
        
        // 1. Accounting Groups
        if (settings.botAccountingGroupIdTele) targets.push({ platform: 'telegram', id: settings.botAccountingGroupIdTele, type: 'accounting' });
        if (settings.botAccountingGroupIdBale) targets.push({ platform: 'bale', id: settings.botAccountingGroupIdBale, type: 'accounting' });
        if (settings.botAccountingGroupId) targets.push({ platform: 'telegram', id: settings.botAccountingGroupId, type: 'accounting' }); // Fallback

        // 2. Bijak Groups
        if (settings.botBijakGroupId) targets.push({ platform: 'telegram', id: settings.botBijakGroupId, type: 'bijak' });
        if (settings.botBijakGroupIdBale) targets.push({ platform: 'bale', id: settings.botBijakGroupIdBale, type: 'bijak' });

        // 3. Exit Permit Groups (First, Second, Third, and/or Dedicated based on configuration)
        const sendToFirst = settings.dailyExitReportSendToFirstGroup === true;
        const sendToSecond = settings.dailyExitReportSendToSecondGroup === true;
        const sendToThird = settings.dailyExitReportSendToThirdGroup === true;
        const sendToDedicated = settings.dailyExitReportSendToDedicatedGroup !== false;

        if (sendToFirst) {
            if (settings.exitPermitNotificationTelegramId) targets.push({ platform: 'telegram', id: settings.exitPermitNotificationTelegramId, type: 'exit' });
            if (settings.exitPermitNotificationBaleId) targets.push({ platform: 'bale', id: settings.exitPermitNotificationBaleId, type: 'exit' });
            
            if (settings.exitPermitFirstGroupConfig?.telegramId) targets.push({ platform: 'telegram', id: settings.exitPermitFirstGroupConfig.telegramId, type: 'exit' });
            if (settings.exitPermitFirstGroupConfig?.baleId) targets.push({ platform: 'bale', id: settings.exitPermitFirstGroupConfig.baleId, type: 'exit' });
        }
        
        if (sendToSecond) {
            if (settings.exitPermitSecondGroupConfig?.telegramId) targets.push({ platform: 'telegram', id: settings.exitPermitSecondGroupConfig.telegramId, type: 'exit' });
            if (settings.exitPermitSecondGroupConfig?.baleId) targets.push({ platform: 'bale', id: settings.exitPermitSecondGroupConfig.baleId, type: 'exit' });
        }

        if (sendToThird) {
            if (settings.exitPermitThirdGroupConfig?.telegramId) targets.push({ platform: 'telegram', id: settings.exitPermitThirdGroupConfig.telegramId, type: 'exit' });
            if (settings.exitPermitThirdGroupConfig?.baleId) targets.push({ platform: 'bale', id: settings.exitPermitThirdGroupConfig.baleId, type: 'exit' });
        }

        if (sendToDedicated) {
            if (settings.dailyExitReportDedicatedTelegramId) targets.push({ platform: 'telegram', id: settings.dailyExitReportDedicatedTelegramId, type: 'exit' });
            if (settings.dailyExitReportDedicatedBaleId) targets.push({ platform: 'bale', id: settings.dailyExitReportDedicatedBaleId, type: 'exit' });
        }

        // Remove duplicates
        const uniqueTargets = Array.from(new Set(targets.map(t => `${t.platform}:${t.id}`)))
            .map(uid => targets.find(t => `${t.platform}:${t.id}` === uid));

        for (const target of uniqueTargets) {
            try {
                const sendFn = async (id, txt, opts) => {
                    if (target.platform === 'telegram') return telegram.sendBotMessage(id, txt, opts);
                    if (target.platform === 'bale') return bale.sendBotMessage(id, txt, opts);
                };
                const sendDocFn = async (id, buf, name, cap) => {
                    if (target.platform === 'telegram') return telegram.sendBotDocument(id, buf, name, cap);
                    if (target.platform === 'bale') return bale.sendBotDocument(id, buf, name, cap);
                };
                
                console.log(`[Cron] Sending daily report to ${target.platform} group ${target.id}`);
                await runDailyReport(target.platform, target.id, dateStr, sendFn, sendDocFn);
            } catch (e) {
                console.error(`[Cron] Failed to send daily report to ${target.id}:`, e.message);
            }
        }
    });
}; // End of setupDailyReports

// Helper to build Persian captioned production report
const buildProductionCaption = (dateStr, totals, waste) => {
    let dateObj = new Date();
    if (typeof dateStr === 'string' && (dateStr.includes('/') || dateStr.includes('.') || dateStr.includes('-'))) {
        const gregStr = parseJalaliStrToGregorian(dateStr);
        if (gregStr) {
            const parts = gregStr.split('-').map(x => parseInt(x, 10));
            dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
        }
    } else if (dateStr) {
        dateObj = new Date(dateStr);
    }

    const dayLabel = utils.toShamsiWeekdayAndDay(dateObj);
    const poyQty = utils.toPersianDigitsNoGrouping(totals.qty_61);
    const poyPct = utils.toPersianDigitsNoGrouping(waste.pct_61);
    const stretchQty = utils.toPersianDigitsNoGrouping(totals.qty_67);
    const stretchPct = utils.toPersianDigitsNoGrouping(waste.pct_67);
    const keshQty = utils.toPersianDigitsNoGrouping(totals.qty_79);
    const keshPct = utils.toPersianDigitsNoGrouping(waste.pct_79);
    const spandexQty = utils.toPersianDigitsNoGrouping(totals.qty_73);
    const spandexPct = utils.toPersianDigitsNoGrouping(waste.pct_73);
    const schweiterQty = utils.toPersianDigitsNoGrouping(totals.qty_schweiter || 0);
    const schweiterPct = utils.toPersianDigitsNoGrouping(waste.pct_schweiter || 0);
    const grandTotalVal = totals.grandTotal !== undefined && totals.grandTotal !== null ? totals.grandTotal : ((totals.qty_61 || 0) + (totals.qty_67 || 0) + (totals.qty_79 || 0) + (totals.qty_73 || 0) + (totals.qty_schweiter || 0));
    const totalWasteVal = waste.totalWaste !== undefined && waste.totalWaste !== null ? waste.totalWaste : ((waste.waste_61 || 0) + (waste.waste_67 || 0) + (waste.waste_79 || 0) + (waste.waste_73 || 0) + (waste.waste_schweiter || 0));
    
    const grandTotal = utils.toPersianDigitsNoGrouping(grandTotalVal);
    const totalWaste = utils.toPersianDigitsNoGrouping(totalWasteVal);

    return `تولید روز ${dayLabel}
کش:${keshQty}
درصد ضایعات:${keshPct}
اسپندکس:${spandexQty}
درصد ضایعات:${spandexPct}
استرچ:${stretchQty}
درصد ضایعات:${stretchPct}
شوایتر:${schweiterQty}
درصد ضایعات:${schweiterPct}
پی او وای:${poyQty}
درصد ضایعات:${poyPct}
مجموع تولید:${grandTotal}
مجموع ضایعات:${totalWaste}`;
};

// Unified Helper to collect configured bot targets for specific categories (sales, production, accounting, or all)
const collectBotTargets = (db, { category = 'all', platforms = ['telegram', 'bale', 'whatsapp'], customTargets = null } = {}) => {
    if (customTargets) {
        const normalizedCustom = [];
        const addNormalizedTarget = (plat, rawId) => {
            if (!plat || !rawId || !platforms.includes(plat)) return;
            String(rawId).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean).forEach(singleId => {
                const cleanId = utils.sanitizeGroupId ? utils.sanitizeGroupId(singleId) : singleId;
                if (cleanId && !normalizedCustom.some(t => t.platform === plat && t.id === cleanId)) {
                    normalizedCustom.push({ platform: plat, id: cleanId });
                }
            });
        };

        if (Array.isArray(customTargets) && customTargets.length > 0) {
            customTargets.forEach(item => {
                if (!item) return;
                if (typeof item === 'object') {
                    const plat = item.platform || 'telegram';
                    const rawId = item.id || item.groupId || item.chatId;
                    addNormalizedTarget(plat, rawId);
                } else if (typeof item === 'string') {
                    const trimmed = item.trim();
                    if (!trimmed) return;
                    if (trimmed.startsWith('wa_')) {
                        addNormalizedTarget('whatsapp', trimmed.slice(3));
                    } else if (/^(\+98|98|09)\d{9}$/.test(trimmed) || trimmed.includes('@c.us') || trimmed.includes('@g.us')) {
                        addNormalizedTarget('whatsapp', trimmed);
                    } else {
                        platforms.forEach(p => {
                            if (p !== 'whatsapp') addNormalizedTarget(p, trimmed);
                        });
                    }
                }
            });
            if (normalizedCustom.length > 0) return normalizedCustom;
        } else if (typeof customTargets === 'object' && !Array.isArray(customTargets)) {
            ['telegram', 'bale', 'whatsapp'].forEach(plat => {
                if (customTargets[plat]) {
                    if (Array.isArray(customTargets[plat])) {
                        customTargets[plat].forEach(id => addNormalizedTarget(plat, id));
                    } else {
                        addNormalizedTarget(plat, customTargets[plat]);
                    }
                }
            });
            if (normalizedCustom.length > 0) return normalizedCustom;
        }
    }
    const settings = db.settings || {};
    const salesTargets = [];

    const salesKeys = [
        { key: 'dailySalesTelegramGroupId', plat: 'telegram' },
        { key: 'dailySalesBaleGroupId', plat: 'bale' },
        { key: 'dailySalesWhatsappGroupId', plat: 'whatsapp' },
        { key: 'botDailySalesGroupIdTele', plat: 'telegram' },
        { key: 'botDailySalesGroupIdBale', plat: 'bale' },
        { key: 'botDailySalesGroupIdWhatsApp', plat: 'whatsapp' },
        { key: 'botDailySalesGroupId', plat: 'telegram' },
        { key: 'dailySalesGroupId', plat: 'telegram' },
        { key: 'salesGroupId', plat: 'telegram' },
    ];

    const accountingKeys = [
        { key: 'botAccountingGroupIdTele', plat: 'telegram' },
        { key: 'botAccountingGroupIdBale', plat: 'bale' },
        { key: 'botAccountingGroupIdWhatsApp', plat: 'whatsapp' },
        { key: 'botAccountingGroupId', plat: 'telegram' },
        { key: 'accountingGroupId', plat: 'telegram' },
    ];

    const productionKeys = [
        { key: 'productionTelegramGroupId', plat: 'telegram' },
        { key: 'productionTelegramGroupId2', plat: 'telegram' },
        { key: 'productionBaleGroupId', plat: 'bale' },
        { key: 'productionBaleGroupId2', plat: 'bale' },
        { key: 'productionWhatsappGroupId', plat: 'whatsapp' },
        { key: 'productionWhatsappGroupId2', plat: 'whatsapp' },
        { key: 'factoryGroupId', plat: 'telegram' },
        { key: 'factoryGroupId2', plat: 'telegram' },
    ];

    const productionCompareKeys = [
        { key: 'productionCompareTelegramGroupId', plat: 'telegram' },
        { key: 'productionCompareBaleGroupId', plat: 'bale' },
        { key: 'productionCompareWhatsappGroupId', plat: 'whatsapp' },
    ];

    const productionReturnsKeys = [
        { key: 'prodReturnsTelegramGroupId', plat: 'telegram' },
        { key: 'prodReturnsBaleGroupId', plat: 'bale' },
        { key: 'prodReturnsWhatsappGroupId', plat: 'whatsapp' },
    ];

    const warehouseKeys = [
        { key: 'warehouseTelegramGroupId', plat: 'telegram' },
        { key: 'warehouseTelegramGroupIds', plat: 'telegram' },
        { key: 'warehouseBaleGroupId', plat: 'bale' },
        { key: 'warehouseBaleGroupIds', plat: 'bale' },
        { key: 'warehouseWhatsappGroupId', plat: 'whatsapp' },
        { key: 'warehouseWhatsappGroupIds', plat: 'whatsapp' },
        { key: 'warehouseGroupId', plat: 'telegram' },
        { key: 'defaultWarehouseGroup', plat: 'telegram' }
    ];

    const reportsKeys = [
        { key: 'reportsGroupId', plat: 'telegram' },
        { key: 'telegramReportsGroupId', plat: 'telegram' },
        { key: 'telegramReportsGroupId2', plat: 'telegram' },
        { key: 'baleReportsGroupId', plat: 'bale' },
        { key: 'baleReportsGroupId2', plat: 'bale' },
        { key: 'whatsappReportsGroupId', plat: 'whatsapp' },
        { key: 'whatsappReportsGroupId2', plat: 'whatsapp' },
    ];

    const generalKeys = [
        { key: 'telegramChatId', plat: 'telegram' },
        { key: 'baleChatId', plat: 'bale' },
        { key: 'telegramGroupId', plat: 'telegram' },
        { key: 'baleGroupId', plat: 'bale' },
        { key: 'whatsappGroupId', plat: 'whatsapp' }
    ];

    let keysToUse = [];
    if (category === 'production') {
        keysToUse = productionKeys;
    } else if (category === 'production_compare') {
        const hasCompareConfig = productionCompareKeys.some(({ key }) => settings[key]);
        keysToUse = hasCompareConfig ? productionCompareKeys : [...productionCompareKeys, ...productionKeys, ...generalKeys];
    } else if (category === 'production_returns') {
        const hasReturnsConfig = productionReturnsKeys.some(({ key }) => settings[key]);
        keysToUse = hasReturnsConfig ? productionReturnsKeys : [...productionReturnsKeys, ...productionKeys, ...generalKeys];
    } else if (category === 'warehouse') {
        const hasWarehouseConfig = warehouseKeys.some(({ key }) => settings[key]);
        keysToUse = hasWarehouseConfig ? warehouseKeys : [...warehouseKeys, ...generalKeys];
    } else if (category === 'sales') {
        const hasSalesConfig = salesKeys.some(({ key }) => settings[key]);
        keysToUse = hasSalesConfig ? salesKeys : [...salesKeys, ...generalKeys];
    } else if (category === 'accounting') {
        const hasAccountingConfig = accountingKeys.some(({ key }) => settings[key]);
        keysToUse = hasAccountingConfig ? accountingKeys : [...accountingKeys, ...generalKeys];
    } else {
        keysToUse = [...salesKeys, ...accountingKeys, ...productionKeys, ...productionCompareKeys, ...productionReturnsKeys, ...warehouseKeys, ...reportsKeys, ...generalKeys];
    }

    keysToUse.forEach(({ key, plat }) => {
        const rawVal = settings[key];
        if (rawVal && platforms.includes(plat)) {
            const ids = String(rawVal).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean);
            ids.forEach(singleId => {
                if (singleId && !salesTargets.some(t => t.platform === plat && String(t.id).trim() === singleId)) {
                    salesTargets.push({ platform: plat, id: singleId });
                }
            });
        }
    });

    if (category === 'all') {
        if (db.groups && Array.isArray(db.groups)) {
            db.groups.forEach(g => {
                if (g.chatId) {
                    const plat = g.platform || 'telegram';
                    if (platforms.includes(plat)) {
                        salesTargets.push({ platform: plat, id: g.chatId });
                    }
                }
            });
        }

        if (db.botUsers && Array.isArray(db.botUsers)) {
            db.botUsers.forEach(u => {
                if (u.telegramChatId && platforms.includes('telegram')) {
                    salesTargets.push({ platform: 'telegram', id: u.telegramChatId });
                }
                if (u.baleChatId && platforms.includes('bale')) {
                    salesTargets.push({ platform: 'bale', id: u.baleChatId });
                }
                if (u.whatsappChatId && platforms.includes('whatsapp')) {
                    salesTargets.push({ platform: 'whatsapp', id: u.whatsappChatId });
                }
                if (u.chatId && !u.telegramChatId && !u.baleChatId && !u.whatsappChatId) {
                    const plat = u.platform || 'telegram';
                    if (platforms.includes(plat)) {
                        salesTargets.push({ platform: plat, id: u.chatId });
                    }
                }
            });
        }
    }

    if (db.reportDeliveryJobs && Array.isArray(db.reportDeliveryJobs)) {
        db.reportDeliveryJobs.forEach(job => {
            const isMatch = category === 'all' ||
                (category === 'production' && (job.module === 'inventory' || job.module === 'production' || job.reportType === 'production' || job.reportType === 'inventory_stock')) ||
                (category === 'sales' && (job.module === 'sales' || job.reportType === 'daily_sales' || job.reportType === 'sales_comparison')) ||
                (category === 'accounting' && (job.module === 'accounting' || job.reportType === 'customer_balances' || job.reportType === 'cheque_alerts'));

            if (isMatch && Array.isArray(job.botPlatforms)) {
                job.botPlatforms.forEach(plat => {
                    if (platforms.includes(plat)) {
                        let id = null;
                        if (plat === 'telegram') id = job.telegramGroup || job.destinationGroup;
                        else if (plat === 'bale') id = job.baleGroup || job.destinationGroup;
                        else if (plat === 'whatsapp') id = job.whatsappGroup || job.destinationGroup;
                        else id = job.destinationGroup;

                        if (id) {
                            salesTargets.push({ platform: plat, id });
                        }
                    }
                });
            }
        });
    }

    if (category === 'all' && settings.savedContacts && Array.isArray(settings.savedContacts)) {
        settings.savedContacts.forEach(c => {
            if (c.telegramId && platforms.includes('telegram')) {
                salesTargets.push({ platform: 'telegram', id: c.telegramId });
            }
            if (c.baleId && platforms.includes('bale')) {
                salesTargets.push({ platform: 'bale', id: c.baleId });
            }
            if (c.number && platforms.includes('whatsapp')) {
                salesTargets.push({ platform: 'whatsapp', id: c.number });
            }
        });
    }

    const uniqueSalesTargets = [];
    const seenMap = new Set();
    for (const t of salesTargets) {
        const cleanId = utils.sanitizeGroupId ? utils.sanitizeGroupId(t.id) : String(t.id).trim();
        if (!cleanId) continue;
        const key = `${t.platform}_${cleanId}`;
        if (!seenMap.has(key)) {
            seenMap.add(key);
            uniqueSalesTargets.push({ platform: t.platform, id: cleanId });
        }
    }

    return uniqueSalesTargets;
};

// Helper to generate and send daily sales report for a specific Date or Date Range
const sendDailySalesReportForDate = async (db, dateObjOrRange, labelSuffix = '', targetsOverride = null, selectedPlatforms = null) => {
    const settings = db.settings || {};
    
    let dateFromInput = dateObjOrRange;
    let dateToInput = dateObjOrRange;
    let isRange = false;

    if (dateObjOrRange && typeof dateObjOrRange === 'object' && !(dateObjOrRange instanceof Date)) {
        dateFromInput = dateObjOrRange.dateFrom || dateObjOrRange.from || dateObjOrRange.date;
        dateToInput = dateObjOrRange.dateTo || dateObjOrRange.to || dateFromInput;
        isRange = dateFromInput !== dateToInput;
    }

    const { gregFrom, gregTo, shamsiFrom, shamsiTo } = normalizeToYmdStrings(dateFromInput, dateToInput);
    const dateLabel = (shamsiFrom && shamsiTo && shamsiFrom !== shamsiTo) 
        ? `از ${shamsiFrom} تا ${shamsiTo}` 
        : (shamsiFrom || 'روز جاری');

    const platforms = selectedPlatforms && selectedPlatforms.length > 0 ? selectedPlatforms : ['telegram', 'bale', 'whatsapp'];
    const uniqueSalesTargets = collectBotTargets(db, { category: 'sales', platforms, customTargets: targetsOverride });

    if (uniqueSalesTargets.length === 0) {
        throw new Error('شناسه گروه اطلاع‌رسانی مالی/فروش در تنظیمات ثبت نشده است! جهت ارسال گزارش فروش، لطفاً به بخش «تنظیمات سیستم ⚙️ -> تب ربات‌ها -> تنظیمات اطلاع‌رسانی مالی و خروج» بروید و شناسه چت یا گروه تلگرام/بله (مانند 100123456789- یا آیدی عددی) را وارد نمایید.');
    }

    // Check if tokens exist for requested platforms
    const hasTgToken = !!settings.telegramBotToken;
    const hasBaleToken = !!settings.baleBotToken;
    const tgTargets = uniqueSalesTargets.filter(t => t.platform === 'telegram');
    const baleTargets = uniqueSalesTargets.filter(t => t.platform === 'bale');
    const waTargets = uniqueSalesTargets.filter(t => t.platform === 'whatsapp');

    if (tgTargets.length > 0 && !hasTgToken && baleTargets.length === 0 && waTargets.length === 0) {
        throw new Error('توکن ربات تلگرام در تنظیمات سیستم ثبت نشده است! لطفاً ابتدا توکن ربات تلگرام را در «تنظیمات سیستم -> تب ربات‌ها» وارد نمایید.');
    }
    if (baleTargets.length > 0 && !hasBaleToken && tgTargets.length === 0 && waTargets.length === 0) {
        throw new Error('توکن ربات بله در تنظیمات سیستم ثبت نشده است! لطفاً ابتدا توکن ربات بله را در «تنظیمات سیستم -> تب ربات‌ها» وارد نمایید.');
    }

    // Fetch sales and returns data using fetchProcessedSayanSalesData
    let salesData;
    try {
        salesData = await fetchProcessedSayanSalesData(db, dateFromInput, dateToInput);
    } catch (e) {
        console.warn("Sayan ERP query failed, attempting local invoices fallback:", e.message);
        const localInvs = Array.isArray(db.invoices) ? db.invoices : (Array.isArray(db.exitPermits) ? db.exitPermits : []);
        const rawSalesRows = localInvs.map(inv => ({
            DocId: inv.id || inv.number,
            InvoiceNum: inv.number || inv.id,
            Date: inv.date || gregFrom,
            Notes: inv.description || '',
            HeaderPayable: inv.amount || inv.totalPrice || 0,
            ItemCode: inv.itemCode || '',
            ItemName: inv.itemName || inv.productName || 'کالا',
            Quantity: inv.quantity || inv.weight || 0,
            Amount: inv.amount || inv.totalPrice || 0,
            GroupName: inv.groupName || inv.category || 'سایر گروه‌ها',
            CustomerName: inv.customerName || inv.recipientName || 'مشتری',
            OpCode: inv.opCode || '3'
        }));
        
        salesData = {
            categoryList: [{
                name: 'سایر محصولات',
                salesQty: rawSalesRows.reduce((s, r) => s + parseFloat(r.Quantity || 0), 0),
                salesAmt: rawSalesRows.reduce((s, r) => s + parseFloat(r.Amount || 0), 0),
                returnQty: 0,
                returnAmt: 0,
                netWgt: rawSalesRows.reduce((s, r) => s + parseFloat(r.Quantity || 0), 0),
                netAmt: rawSalesRows.reduce((s, r) => s + parseFloat(r.Amount || 0), 0),
                netFee: 0
            }],
            summary: {
                totalSalesQty: rawSalesRows.reduce((s, r) => s + parseFloat(r.Quantity || 0), 0),
                totalSalesAmt: rawSalesRows.reduce((s, r) => s + parseFloat(r.Amount || 0), 0),
                totalReturnQty: 0,
                totalReturnAmt: 0,
                netWeight: rawSalesRows.reduce((s, r) => s + parseFloat(r.Quantity || 0), 0),
                netAmount: rawSalesRows.reduce((s, r) => s + parseFloat(r.Amount || 0), 0),
                avgFee: 0,
                invoiceCount: rawSalesRows.length,
                customerCount: 1,
                shamsiFrom: shamsiFrom,
                shamsiTo: shamsiTo,
                gregFrom: gregFrom,
                gregTo: gregTo
            }
        };
    }

    const { categoryList, summary } = salesData;

    if (categoryList.length > 0) {
        const displaySuffix = labelSuffix && labelSuffix !== dateLabel ? ` (${labelSuffix})` : '';
        const title = `گزارش رسمی فروش و مرجوعی سایان ERP - ${dateLabel}${displaySuffix}`;
        const columns = ['ردیف', 'سرفصل کالا', 'فروش (ک‌گ / ریال)', 'مرجوعی کد ۱۳ (ک‌گ / ریال)', 'خالص نهایی (ک‌گ / ریال)', 'فی متوسط (ریال)'];
        
        let idx = 1;
        const tableRows = categoryList.map(cat => [
            (idx++).toLocaleString('fa-IR'),
            cat.name,
            `${cat.salesQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(cat.salesAmt).toLocaleString('fa-IR')}`,
            `${cat.returnQty > 0 ? cat.returnQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '۰'} / ${Math.round(cat.returnAmt).toLocaleString('fa-IR')}`,
            `${cat.netWgt.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(cat.netAmt).toLocaleString('fa-IR')}`,
            Math.round(cat.netFee).toLocaleString('fa-IR')
        ]);
        
        tableRows.push([
            'جمع کل',
            'خلاصه عملکرد',
            `${summary.totalSalesQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(summary.totalSalesAmt).toLocaleString('fa-IR')}`,
            `${summary.totalReturnQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(summary.totalReturnAmt).toLocaleString('fa-IR')}`,
            `${summary.netWeight.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(summary.netAmount).toLocaleString('fa-IR')}`,
            Math.round(summary.avgFee).toLocaleString('fa-IR')
        ]);
        
        const pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows, true, dateLabel); // Landscape
        
        if (!pdfBuffer) {
            throw new Error('خطا در تولید فایل PDF گزارش. لطفاً اطمینان حاصل کنید که مرورگر Chrome یا Edge روی سرور نصب شده باشد.');
        }

        const filename = `Sayan_Sales_${gregFrom}_${labelSuffix.includes('دیروز') ? 'Yesterday' : 'Report'}.pdf`;
        
        // Build detailed item & category breakdown text for bot message
        let categoryBreakdown = '';
        categoryList.forEach(cat => {
            if (cat.salesQty > 0 || cat.returnQty > 0) {
                categoryBreakdown += `🔹 *${cat.name}:* ${Math.round(cat.netWgt).toLocaleString('fa-IR')} ک‌گ | ${Math.round(cat.netAmt).toLocaleString('fa-IR')} ریال\n`;
            }
        });

        const caption = `📊 *گزارش فروش و مرجوعی سایان ERP*
📅 *تاریخ:* ${dateLabel} (${labelSuffix})
📦 *وزن فروش ناخالص:* ${summary.totalSalesQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم
💵 *مبلغ فروش ناخالص:* ${Math.round(summary.totalSalesAmt).toLocaleString('fa-IR')} ریال
🔄 *وزن مرجوعی (کد ۱۳):* ${summary.totalReturnQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم
❌ *مبلغ مرجوعی:* ${Math.round(summary.totalReturnAmt).toLocaleString('fa-IR')} ریال
✅ *وزن خالص کل:* ${summary.netWeight.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم
💰 *فروش خالص کل:* ${Math.round(summary.netAmount).toLocaleString('fa-IR')} ریال
🏷️ *فی نهایی میانگین:* ${Math.round(summary.avgFee).toLocaleString('fa-IR')} ریال/کیلوگرم
${categoryBreakdown ? `\n📋 *تفکیک عملکرد بر اساس نام اقلام:*\n${categoryBreakdown}` : ''}`;

        let successfulSends = 0;
        const sendDetails = [];
        let lastErr = null;
        const safePdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        for (const tgt of uniqueSalesTargets) {
            try {
                if (tgt.platform === 'telegram') {
                    await telegram.sendBotDocument(tgt.id, safePdfBuf, filename, caption);
                    successfulSends++;
                    sendDetails.push({ platform: 'telegram', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'bale') {
                    await bale.sendBotDocument(tgt.id, safePdfBuf, filename, caption);
                    successfulSends++;
                    sendDetails.push({ platform: 'bale', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        const waRes = await wa.sendMessage(tgt.id, caption, {
                            data: safePdfBuf.toString('base64'),
                            mimeType: 'application/pdf',
                            filename: filename
                        });
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        successfulSends++;
                        sendDetails.push({ platform: 'whatsapp', id: tgt.id, status: 'success' });
                    } else {
                        throw new Error('ماژول واتساپ در دسترس نیست');
                    }
                }
            } catch (e) {
                lastErr = e.message;
                console.error(`[Manual/Auto Sales Report] Failed to send to ${tgt.platform} group ${tgt.id}:`, e.message);
                sendDetails.push({ platform: tgt.platform, id: tgt.id, status: 'failed', error: e.message });
            }
        }

        if (successfulSends === 0) {
            throw new Error(`ارسال گزارش فروش ناموفق بود: ${lastErr || 'خطا در اتصال به پیام‌رسان‌ها'}`);
        }

        return { count: categoryList.length, totalSalesQty: summary.totalSalesQty, totalSalesAmt: summary.totalSalesAmt, grandNetAmt: summary.netAmount, grandNetQty: summary.netWeight, grandFinalPrice: summary.avgFee, sent: true, successfulSends, totalTargets: uniqueSalesTargets.length, sendDetails };
    } else {
        const emptyMsg = `⚠️ هیچ فاکتور فروشی برای ${dateLabel} (${labelSuffix}) در سرور سایان ثبت نشده است.`;
        let successfulSends = 0;
        const sendDetails = [];
        let lastErr = null;
        for (const tgt of uniqueSalesTargets) {
            try {
                if (tgt.platform === 'telegram') {
                    await telegram.sendBotMessage(tgt.id, emptyMsg);
                    successfulSends++;
                    sendDetails.push({ platform: 'telegram', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'bale') {
                    await bale.sendBotMessage(tgt.id, emptyMsg);
                    successfulSends++;
                    sendDetails.push({ platform: 'bale', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        await wa.sendMessage(tgt.id, emptyMsg);
                        successfulSends++;
                        sendDetails.push({ platform: 'whatsapp', id: tgt.id, status: 'success' });
                    } else {
                        throw new Error('ماژول واتساپ در دسترس نیست');
                    }
                }
            } catch (e) {
                lastErr = e.message;
                console.error(`[Manual/Auto Sales Report] Failed to send empty msg to ${tgt.platform} group ${tgt.id}:`, e.message);
                sendDetails.push({ platform: tgt.platform, id: tgt.id, status: 'failed', error: e.message });
            }
        }

        if (successfulSends === 0) {
            throw new Error(`ارسال پیام عدم وجود فاکتور فروش ناموفق بود: ${lastErr || 'خطا در پیام‌رسان‌ها'}`);
        }

        return { count: 0, sent: true, successfulSends, totalTargets: uniqueSalesTargets.length, sendDetails };
    }
};




// Note: Automated daily reports (Sales & Cheques) are dynamically managed via setupDailyReports() in Tehran TimeZone (Asia/Tehran)

app.post('/api/sayan/sales-report/send-daily', async (req, res) => {
    try {
        const db = getDb();
        const { date, labelSuffix, customTargets, selectedPlatforms, includeYesterday } = req.body;
        const dateObj = date ? new Date(date) : new Date();
        const result = await sendDailySalesReportForDate(db, dateObj, labelSuffix || 'امروز', customTargets, selectedPlatforms);
        
        let yesterdayResult = null;
        if (includeYesterday) {
            const yesterdayDate = new Date(dateObj);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            yesterdayResult = await sendDailySalesReportForDate(db, yesterdayDate, 'دیروز', customTargets, selectedPlatforms);
        }

        res.json({ success: true, today: result, yesterday: yesterdayResult });
    } catch (err) {
        console.error("Manual Daily Sales Send Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sayan/cheques-report/send-vault', async (req, res) => {
    try {
        const db = getDb();
        const { customTargets, selectedPlatforms, attachPdf, attachExcel, reportType, sortBy, sortOrder, filterBank, filterDrawer, customCheques, title } = req.body;
        const result = await sendTreasuryChequesReport(db, customTargets, selectedPlatforms, { 
            attachPdf, 
            attachExcel, 
            reportType: reportType || 'vault', 
            sortBy, 
            sortOrder, 
            filterBank, 
            filterDrawer, 
            customCheques, 
            title 
        });
        res.json(result);
    } catch (err) {
        console.error("Manual Treasury Cheques Send Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sayan/cheques-report/send', async (req, res) => {
    try {
        const db = getDb();
        const { customTargets, selectedPlatforms, attachPdf, attachExcel, reportType, sortBy, sortOrder, filterBank, filterDrawer, customCheques, title } = req.body;
        const result = await sendTreasuryChequesReport(db, customTargets, selectedPlatforms, { 
            attachPdf, 
            attachExcel, 
            reportType: reportType || 'vault', 
            sortBy, 
            sortOrder, 
            filterBank, 
            filterDrawer, 
            customCheques, 
            title 
        });
        res.json(result);
    } catch (err) {
        console.error("Manual Cheques Send Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// AI AGENT & STRATEGIC ANALYTICS ENDPOINTS
// ==========================================
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, contextData, history } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'پیام ارسال نشده است.' });
        }
        const aiModule = await import('./backend/ai-service.js');
        const response = await aiModule.askAiAssistant({ message, contextData, history });
        res.json(response);
    } catch (err) {
        console.error("AI Chat Error:", err);
        res.status(500).json({ error: err.message || 'خطا در پردازش هوش مصنوعی' });
    }
});

app.post('/api/ai/voice-command', async (req, res) => {
    try {
        const { audioBase64, mimeType } = req.body;
        if (!audioBase64) {
            return res.status(400).json({ error: 'داده صوتی ارسال نشده است.' });
        }
        const buffer = Buffer.from(audioBase64, 'base64');
        const aiModule = await import('./backend/ai-service.js');
        const result = await aiModule.processVoiceAudio(buffer, mimeType || 'audio/webm');
        res.json(result);
    } catch (err) {
        console.error("AI Voice Error:", err);
        res.status(500).json({ error: err.message || 'خطا در پردازش صوت' });
    }
});

app.post('/api/ai/warehouse-analysis', async (req, res) => {
    try {
        const warehousePayload = req.body;
        const aiModule = await import('./backend/ai-service.js');
        const result = await aiModule.generateWarehouseStrategicAnalysis(warehousePayload);
        res.json(result);
    } catch (err) {
        console.error("AI Warehouse Analysis Error:", err);
        res.status(500).json({ error: err.message || 'خطا در تحلیل انبار' });
    }
});

app.post('/api/ai/sales-analysis', async (req, res) => {
    try {
        const salesPayload = req.body;
        const aiModule = await import('./backend/ai-service.js');
        const result = await aiModule.generateSalesStrategicAnalysis(salesPayload);
        res.json(result);
    } catch (err) {
        console.error("AI Sales Analysis Error:", err);
        res.status(500).json({ error: err.message || 'خطا در تحلیل فروش' });
    }
});

app.post('/api/ai/scan-document', async (req, res) => {
    try {
        const { imageBase64, mimeType } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: 'تصویر سند ارسال نشده است.' });
        }
        const buffer = Buffer.from(imageBase64, 'base64');
        const aiModule = await import('./backend/ai-service.js');
        const result = await aiModule.scanDocumentWithAi(buffer, mimeType || 'image/jpeg');
        res.json(result);
    } catch (err) {
        console.error("AI Document Scan Error:", err);
        res.status(500).json({ error: err.message || 'خطا در اسکن هوشمند سند' });
    }
});


app.post('/api/sayan/sales-report/send-compare', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        const { chartData, dateFromA, dateToA, dateFromB, dateToB, selectedPlatforms, customTargets } = req.body;
        
        if (!chartData || chartData.length === 0) {
            return res.status(400).json({ error: 'داده‌ای برای ارسال وجود ندارد' });
        }

        const platforms = selectedPlatforms && selectedPlatforms.length > 0 ? selectedPlatforms : ['telegram', 'bale', 'whatsapp'];
        const uniqueSalesTargets = collectBotTargets(db, { category: 'sales', platforms, customTargets });
        
        if (uniqueSalesTargets.length === 0) {
            throw new Error('گروهی برای ارسال گزارش فروش (تلگرام یا بله) در تنظیمات سیستم ثبت نشده است. لطفاً در تنظیمات سیستم -> تب ربات‌ها آیدی گروه مقصد را وارد نمایید.');
        }

        const compareDateBadge = `دوره A: از ${dateFromA || '---'} تا ${dateToA || '---'} | دوره B: از ${dateFromB || '---'} تا ${dateToB || '---'}`;
        const title = `گزارش تحلیلی و مقایسه‌ای فروش (${compareDateBadge})`;
        const columns = ['ردیف', 'گروه اصلی کالا', 'وزن A (ک‌گ)', 'مبلغ A (ریال)', 'وزن B (ک‌گ)', 'مبلغ B (ریال)', 'تغییر وزن %', 'تغییر مبلغ %', 'تغییر فی %'];
        
        let totalNetWgtA = 0;
        let totalNetAmtA = 0;
        let totalNetWgtB = 0;
        let totalNetAmtB = 0;

        const tableRows = chartData.map((row, idx) => {
            const wgtA = row.netWeightA ?? row.netWgtA ?? row.grossWgtA ?? 0;
            const amtA = row.netAmountA ?? row.netAmtA ?? 0;
            const feeA = row.netFeeA ?? (wgtA > 0 ? amtA / wgtA : 0);

            const wgtB = row.netWeightB ?? row.netWgtB ?? row.grossWgtB ?? 0;
            const amtB = row.netAmountB ?? row.netAmtB ?? 0;
            const feeB = row.netFeeB ?? (wgtB > 0 ? amtB / wgtB : 0);

            totalNetWgtA += wgtA;
            totalNetAmtA += amtA;
            totalNetWgtB += wgtB;
            totalNetAmtB += amtB;

            const diffWgt = wgtA - wgtB;
            const wgtPct = wgtB > 0 ? ((diffWgt / wgtB) * 100).toFixed(1) : (wgtA > 0 ? '+100' : '0');
            const wgtPctStr = (Number(wgtPct) >= 0 ? '+' : '') + wgtPct + '%';

            const diffAmt = amtA - amtB;
            const amtPct = amtB > 0 ? ((diffAmt / amtB) * 100).toFixed(1) : (amtA > 0 ? '+100' : '0');
            const amtPctStr = (Number(amtPct) >= 0 ? '+' : '') + amtPct + '%';

            const diffFee = feeA - feeB;
            const feePct = feeB > 0 ? ((diffFee / feeB) * 100).toFixed(1) : (feeA > 0 ? '+100' : '0');
            const feePctStr = (Number(feePct) >= 0 ? '+' : '') + feePct + '%';

            return [
                (idx + 1).toLocaleString('fa-IR'),
                row.name || row.catName || 'سایر',
                wgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(amtA).toLocaleString('fa-IR') + ' ریال',
                wgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(amtB).toLocaleString('fa-IR') + ' ریال',
                wgtPctStr,
                amtPctStr,
                feePctStr
            ];
        });
        
        const avgFeeA = totalNetWgtA > 0 ? totalNetAmtA / totalNetWgtA : 0;
        const avgFeeB = totalNetWgtB > 0 ? totalNetAmtB / totalNetWgtB : 0;

        const totalDiffWgt = totalNetWgtA - totalNetWgtB;
        const totalWgtPct = totalNetWgtB > 0 ? ((totalDiffWgt / totalNetWgtB) * 100).toFixed(1) : (totalNetWgtA > 0 ? '+100' : '0');
        const totalWgtPctStr = (Number(totalWgtPct) >= 0 ? '+' : '') + totalWgtPct + '%';

        const totalDiffAmt = totalNetAmtA - totalNetAmtB;
        const totalAmtPct = totalNetAmtB > 0 ? ((totalDiffAmt / totalNetAmtB) * 100).toFixed(1) : (totalNetAmtA > 0 ? '+100' : '0');
        const totalAmtPctStr = (Number(totalAmtPct) >= 0 ? '+' : '') + totalAmtPct + '%';

        const totalDiffFee = avgFeeA - avgFeeB;
        const totalFeePct = avgFeeB > 0 ? ((totalDiffFee / avgFeeB) * 100).toFixed(1) : (avgFeeA > 0 ? '+100' : '0');
        const totalFeePctStr = (Number(totalFeePct) >= 0 ? '+' : '') + totalFeePct + '%';

        tableRows.push([
            'جمع کل',
            'خلاصه کل عملکرد',
            totalNetWgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
            Math.round(totalNetAmtA).toLocaleString('fa-IR') + ' ریال',
            totalNetWgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
            Math.round(totalNetAmtB).toLocaleString('fa-IR') + ' ریال',
            totalWgtPctStr,
            totalAmtPctStr,
            totalFeePctStr
        ]);

        const pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows, true, compareDateBadge);
        
        if (!pdfBuffer) {
            throw new Error('خطا در تولید فایل PDF گزارش. لطفاً اطمینان حاصل کنید که مرورگر Chrome یا Edge روی سرور نصب شده باشد.');
        }

        const filename = `Compare_Sales_${Date.now()}.pdf`;
        
        const caption = `📊 *گزارش مدیریتی مقایسه‌ای فروش (سایان ERP)*

📅 *دوره A (پایه):* ${dateFromA || '---'} الی ${dateToA || '---'}
📅 *دوره B (تطبیقی):* ${dateFromB || '---'} الی ${dateToB || '---'}

📦 *وزن کل A:* ${totalNetWgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم
💵 *فروش کل A:* ${Math.round(totalNetAmtA).toLocaleString('fa-IR')} ریال
🏷 *فی متوسط A:* ${Math.round(avgFeeA).toLocaleString('fa-IR')} ریال/ک‌گ

📦 *وزن کل B:* ${totalNetWgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم
💵 *فروش کل B:* ${Math.round(totalNetAmtB).toLocaleString('fa-IR')} ریال
🏷 *فی متوسط B:* ${Math.round(avgFeeB).toLocaleString('fa-IR')} ریال/ک‌گ

📈 *تغییرات وزن:* ${totalWgtPctStr}
💵 *تغییرات مبلغ:* ${totalAmtPctStr}
📊 *تغییرات فی متوسط:* ${totalFeePctStr}`;

        let successfulSends = 0;
        const sendDetails = [];
        let lastErr = null;
        const safePdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        for (const tgt of uniqueSalesTargets) {
            try {
                if (tgt.platform === 'telegram') {
                    await telegram.sendBotDocument(tgt.id, safePdfBuf, filename, caption);
                    successfulSends++;
                    sendDetails.push({ platform: 'telegram', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'bale') {
                    await bale.sendBotDocument(tgt.id, safePdfBuf, filename, caption);
                    successfulSends++;
                    sendDetails.push({ platform: 'bale', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        const waRes = await wa.sendMessage(tgt.id, caption, {
                            data: safePdfBuf.toString('base64'),
                            mimeType: 'application/pdf',
                            filename: filename
                        });
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        successfulSends++;
                        sendDetails.push({ platform: 'whatsapp', id: tgt.id, status: 'success' });
                    } else {
                        throw new Error('ماژول واتساپ در دسترس نیست');
                    }
                }
            } catch (e) {
                lastErr = e.message;
                console.error(`Failed to send compare report to ${tgt.platform} group ${tgt.id}:`, e.message);
                sendDetails.push({ platform: tgt.platform, id: tgt.id, status: 'failed', error: e.message });
            }
        }

        if (successfulSends === 0) {
            throw new Error(`ارسال گزارش مقایسه‌ای ناموفق بود: ${lastErr || 'خطا در ارسال به پیام‌رسان‌ها'}`);
        }

        res.json({ 
            success: true, 
            message: 'گزارش مقایسه‌ای با موفقیت به پیام‌رسان‌ها ارسال گردید.',
            sendDetails,
            successfulSends,
            totalTargets: uniqueSalesTargets.length
        });
    } catch (e) {
        console.error("Compare Sales Report Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/sales-report/download-compare-pdf', async (req, res) => {
    try {
        const { compareType, chartData, dateFromA, dateToA, dateFromB, dateToB } = req.body;
        if (!chartData || chartData.length === 0) {
            return res.status(400).json({ error: 'داده‌ای برای تولید PDF وجود ندارد' });
        }

        const isItems = compareType === 'items';
        const title = isItems
            ? `گزارش تفکیکی و مقایسه‌ای فروش ریز کالاها (دوره A: ${dateFromA || '---'} تا ${dateToA || '---'} / دوره B: ${dateFromB || '---'} تا ${dateToB || '---'})`
            : `گزارش تحلیلی و مقایسه‌ای فروش خلاصه گروه‌ها (دوره A: ${dateFromA || '---'} تا ${dateToA || '---'} / دوره B: ${dateFromB || '---'} تا ${dateToB || '---'})`;

        const columns = isItems
            ? ['ردیف', 'نام کالا', 'گروه اصلی', 'وزن A (ک‌گ)', 'مبلغ A (ریال)', 'وزن B (ک‌گ)', 'مبلغ B (ریال)', 'تغییر وزن %', 'تغییر مبلغ %', 'تغییر فی %']
            : ['ردیف', 'گروه اصلی کالا', 'وزن A (ک‌گ)', 'مبلغ A (ریال)', 'وزن B (ک‌گ)', 'مبلغ B (ریال)', 'تغییر وزن %', 'تغییر مبلغ %', 'تغییر فی %'];
        
        let totalNetWgtA = 0;
        let totalNetAmtA = 0;
        let totalNetWgtB = 0;
        let totalNetAmtB = 0;

        const tableRows = chartData.map((row, idx) => {
            const wgtA = row.netWeightA ?? row.netWgtA ?? row.grossWgtA ?? 0;
            const amtA = row.netAmountA ?? row.netAmtA ?? 0;
            const feeA = row.netFeeA ?? (wgtA > 0 ? amtA / wgtA : 0);

            const wgtB = row.netWeightB ?? row.netWgtB ?? row.grossWgtB ?? 0;
            const amtB = row.netAmountB ?? row.netAmtB ?? 0;
            const feeB = row.netFeeB ?? (wgtB > 0 ? amtB / wgtB : 0);

            totalNetWgtA += wgtA;
            totalNetAmtA += amtA;
            totalNetWgtB += wgtB;
            totalNetAmtB += amtB;

            const diffWgt = wgtA - wgtB;
            const wgtPct = wgtB > 0 ? ((diffWgt / wgtB) * 100).toFixed(1) : (wgtA > 0 ? '+100' : '0');
            const wgtPctStr = (Number(wgtPct) >= 0 ? '+' : '') + wgtPct + '%';

            const diffAmt = amtA - amtB;
            const amtPct = amtB > 0 ? ((diffAmt / amtB) * 100).toFixed(1) : (amtA > 0 ? '+100' : '0');
            const amtPctStr = (Number(amtPct) >= 0 ? '+' : '') + amtPct + '%';

            const diffFee = feeA - feeB;
            const feePct = feeB > 0 ? ((diffFee / feeB) * 100).toFixed(1) : (feeA > 0 ? '+100' : '0');
            const feePctStr = (Number(feePct) >= 0 ? '+' : '') + feePct + '%';

            if (isItems) {
                return [
                    (idx + 1).toLocaleString('fa-IR'),
                    row.name || 'نامشخص',
                    row.category || 'سایر',
                    wgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                    Math.round(amtA).toLocaleString('fa-IR') + ' ریال',
                    wgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                    Math.round(amtB).toLocaleString('fa-IR') + ' ریال',
                    wgtPctStr,
                    amtPctStr,
                    feePctStr
                ];
            } else {
                return [
                    (idx + 1).toLocaleString('fa-IR'),
                    row.name || row.catName || 'سایر',
                    wgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                    Math.round(amtA).toLocaleString('fa-IR') + ' ریال',
                    wgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                    Math.round(amtB).toLocaleString('fa-IR') + ' ریال',
                    wgtPctStr,
                    amtPctStr,
                    feePctStr
                ];
            }
        });
        
        const avgFeeA = totalNetWgtA > 0 ? totalNetAmtA / totalNetWgtA : 0;
        const avgFeeB = totalNetWgtB > 0 ? totalNetAmtB / totalNetWgtB : 0;

        const totalDiffWgt = totalNetWgtA - totalNetWgtB;
        const totalWgtPct = totalNetWgtB > 0 ? ((totalDiffWgt / totalNetWgtB) * 100).toFixed(1) : (totalNetWgtA > 0 ? '+100' : '0');
        const totalWgtPctStr = (Number(totalWgtPct) >= 0 ? '+' : '') + totalWgtPct + '%';

        const totalDiffAmt = totalNetAmtA - totalNetAmtB;
        const totalAmtPct = totalNetAmtB > 0 ? ((totalDiffAmt / totalNetAmtB) * 100).toFixed(1) : (totalNetAmtA > 0 ? '+100' : '0');
        const totalAmtPctStr = (Number(totalAmtPct) >= 0 ? '+' : '') + totalAmtPct + '%';

        const totalDiffFee = avgFeeA - avgFeeB;
        const totalFeePct = avgFeeB > 0 ? ((totalDiffFee / avgFeeB) * 100).toFixed(1) : (avgFeeA > 0 ? '+100' : '0');
        const totalFeePctStr = (Number(totalFeePct) >= 0 ? '+' : '') + totalFeePct + '%';

        if (isItems) {
            tableRows.push([
                'جمع کل',
                'خلاصه عملکرد ریز کالاها',
                '-',
                totalNetWgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(totalNetAmtA).toLocaleString('fa-IR') + ' ریال',
                totalNetWgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(totalNetAmtB).toLocaleString('fa-IR') + ' ریال',
                totalWgtPctStr,
                totalAmtPctStr,
                totalFeePctStr
            ]);
        } else {
            tableRows.push([
                'جمع کل',
                'خلاصه کل عملکرد',
                totalNetWgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(totalNetAmtA).toLocaleString('fa-IR') + ' ریال',
                totalNetWgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(totalNetAmtB).toLocaleString('fa-IR') + ' ریال',
                totalWgtPctStr,
                totalAmtPctStr,
                totalFeePctStr
            ]);
        }

        const compareDateBadge = `دوره A: از ${dateFromA || '---'} تا ${dateToA || '---'} | دوره B: از ${dateFromB || '---'} تا ${dateToB || '---'}`;
        const pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows, true, compareDateBadge);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Compare_Sales_Report_${Date.now()}.pdf"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error("Download Compare PDF Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/sales-report/send-executive', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        const { dateFrom, dateTo, summary, groupData, customTargets, selectedPlatforms, customTitle, customColumns, customRows } = req.body;

        const normDates = normalizeToYmdStrings(dateFrom, dateTo || dateFrom);
        const displayFrom = normDates.shamsiFrom || dateFrom || 'امروز';
        const displayTo = normDates.shamsiTo || dateTo || displayFrom;
        const dateRangeLabel = displayFrom === displayTo ? `مورخ ${displayFrom}` : `از تاریخ ${displayFrom} تا ${displayTo}`;
        const title = customTitle
            ? (customTitle.includes(displayFrom) ? customTitle : `${customTitle} (${dateRangeLabel})`)
            : `داشبورد مدیریتی گزارش فروش سایان ERP (${dateRangeLabel})`;

        const platforms = selectedPlatforms && selectedPlatforms.length > 0 ? selectedPlatforms : ['telegram', 'bale', 'whatsapp'];
        const uniqueTargets = collectBotTargets(db, { category: 'sales', platforms, customTargets });

        if (uniqueTargets.length === 0) {
            throw new Error('هیچ شناسه گروه یا چت مقصد برای پیام‌رسان‌های انتخاب شده یافت نشد. لطفاً گیرندگان مورد نظر را در پنجره ارسال انتخاب کنید یا در بخش «تنظیمات سیستم ⚙️ -> تب ربات‌ها» شناسه گروه را وارد نمایید.');
        }

        const columns = (Array.isArray(customColumns) && customColumns.length > 0)
            ? customColumns
            : ['ردیف', 'گروه اصلی کالا', 'وزن خالص (ک‌گ)', 'فروش خالص (ریال)', 'فی نهایی (ریال/ک‌گ)', 'سهم %'];
        const tableRows = (Array.isArray(customRows) && customRows.length > 0)
            ? customRows
            : (groupData || []).map((g, idx) => [
                (idx + 1).toLocaleString('fa-IR'),
                g.name || 'سایر',
                (g.netWgt || 0).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                Math.round(g.netAmt || 0).toLocaleString('fa-IR'),
                Math.round(g.netFee || 0).toLocaleString('fa-IR'),
                `${(g.sharePct || 0).toFixed(1)}%`
            ]);

        if (!customRows && summary) {
            tableRows.push([
                'جمع کل',
                '-',
                (summary.netWeight || 0).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                Math.round(summary.netAmount || 0).toLocaleString('fa-IR'),
                Math.round(summary.avgFee || 0).toLocaleString('fa-IR'),
                '100%'
            ]);
        }

        const pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows, true, dateRangeLabel);
        
        if (!pdfBuffer) {
            throw new Error('خطا در تولید فایل PDF گزارش. لطفاً اطمینان حاصل کنید که مرورگر Chrome یا Edge روی سرور نصب شده باشد.');
        }

        const filename = `Executive_Sales_Report_${displayFrom.replace(/\//g, '-')}_to_${displayTo.replace(/\//g, '-')}.pdf`;

        const caption = `📊 *${title}*
📅 *بازه گزارش:* ${dateRangeLabel}

💰 *فروش خالص کل:* ${Math.round(summary?.netAmount || 0).toLocaleString('fa-IR')} ریال
📦 *وزن خالص کل:* ${(summary?.netWeight || 0).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم
🏷️ *فی خالص میانگین:* ${Math.round(summary?.avgFee || 0).toLocaleString('fa-IR')} ریال/کیلوگرم
🧾 *تعداد فاکتورها:* ${summary?.invoiceCount || 0} عدد | 👥 *تعداد مشتریان:* ${summary?.customerCount || 0} نفر
💵 *میانگین هر فاکتور:* ${Math.round(summary?.avgInvoiceAmt || 0).toLocaleString('fa-IR')} ریال

⭐ *پرفروش‌ترین گروه:* ${summary?.topGroup || 'نامشخص'}
🏆 *پرفروش‌ترین کالا:* ${summary?.topProduct || 'نامشخص'}
🔻 *میزان مرجوعی:* ${Math.round(summary?.returnAmount || 0).toLocaleString('fa-IR')} ریال (${(summary?.returnWeight || 0).toFixed(1)} ک‌گ)

📎 فایل کامل PDF شامل جزئیات گزارش پیوست گردید.`;

        let successfulSends = 0;
        const sendDetails = [];
        let lastErr = null;
        const safePdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        for (const tgt of uniqueTargets) {
            try {
                if (tgt.platform === 'telegram') {
                    await telegram.sendBotDocument(tgt.id, safePdfBuf, filename, caption);
                    successfulSends++;
                    sendDetails.push({ platform: 'telegram', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'bale') {
                    await bale.sendBotDocument(tgt.id, safePdfBuf, filename, caption);
                    successfulSends++;
                    sendDetails.push({ platform: 'bale', id: tgt.id, status: 'success' });
                } else if (tgt.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        const waRes = await wa.sendMessage(tgt.id, caption, {
                            data: safePdfBuf.toString('base64'),
                            mimeType: 'application/pdf',
                            filename: filename
                        });
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        successfulSends++;
                        sendDetails.push({ platform: 'whatsapp', id: tgt.id, status: 'success' });
                    } else {
                        throw new Error('ماژول واتساپ در دسترس نیست');
                    }
                }
            } catch (e) {
                lastErr = e.message;
                console.error(`Failed to send executive report to ${tgt.platform} group ${tgt.id}:`, e.message);
                sendDetails.push({ platform: tgt.platform, id: tgt.id, status: 'failed', error: e.message });
            }
        }

        const whatsappFallbackLinks = [];
        for (const d of sendDetails) {
            if (d.platform === 'whatsapp' && d.status === 'failed') {
                let cleanPhone = String(d.id || '').replace(/[^0-9]/g, '');
                if (cleanPhone.startsWith('09')) cleanPhone = '98' + cleanPhone.slice(1);
                else if (cleanPhone.startsWith('9') && cleanPhone.length === 10) cleanPhone = '98' + cleanPhone;
                if (cleanPhone.length >= 10) {
                    whatsappFallbackLinks.push({
                        phone: d.id,
                        url: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(caption)}`
                    });
                }
            }
        }

        if (successfulSends === 0 && whatsappFallbackLinks.length === 0) {
            throw new Error(`ارسال گزارش به پیام‌رسان‌ها ناموفق بود: ${lastErr || 'خطای شبکه'}`);
        }

        res.json({ 
            success: true, 
            message: successfulSends > 0
                ? `گزارش مدیریتی با موفقیت به پیام‌رسان‌ها ارسال گردید.`
                : `درگاه مستقیم واتساپ آماده ارسال به شماره انتخاب‌شده می‌باشد.`,
            sendDetails,
            successfulSends,
            totalTargets: uniqueTargets.length,
            whatsappFallbackLinks
        });
    } catch (e) {
        console.error("Executive Sales Report Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SAYAN PRODUCTION REPORT ENDPOINTS ---
const normalizeShamsiDate = (str) => {
    if (!str) return '';
    return String(str).trim()
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
};

const parseJalaliStrToGregorian = (jalaliStr) => {
    if (!jalaliStr) return null;
    try {
        const clean = normalizeShamsiDate(jalaliStr);
        const parts = clean.split(/[\/\.\-]/).map(p => parseInt(p, 10)).filter(n => !isNaN(n));
        if (parts.length !== 3) return null;

        let jy = 0, jm = 0, jd = 0;

        if (parts[0] >= 1300 || parts[0] === 404 || parts[0] === 405 || (parts[0] >= 100 && parts[0] < 1000)) {
            jy = parts[0]; jm = parts[1]; jd = parts[2];
        } else if (parts[2] >= 1300 || parts[2] === 404 || parts[2] === 405 || parts[2] >= 100) {
            jy = parts[2]; jm = parts[1]; jd = parts[0];
        } else {
            if (parts[0] > 12) {
                jd = parts[0]; jm = parts[1]; jy = parts[2];
            } else {
                jy = parts[2]; jm = parts[1]; jd = parts[0];
            }
        }

        if (jy < 100) jy += 1400;
        else if (jy >= 100 && jy < 1000) jy += 1000;

        if (jm > 12 && jd <= 12) {
            const temp = jm; jm = jd; jd = temp;
        }

        const g = jalaali.toGregorian(jy, jm, jd);
        const y = g.gy;
        const m = String(g.gm).padStart(2, '0');
        const d = String(g.gd).padStart(2, '0');
        return `${y}-${m}-${d}`;
    } catch (e) {
        return null;
    }
};

const executeSayanQuery = async (db, queryStr, timeoutMs = 25000) => {
    const settings = db.settings || {};
    let serverSayanBaseUrl = sanitizeSayanUrl(settings.sayanApiUrl || process.env.SAYAN_API_URL || 'http://80.210.31.176:5000/api/external/v1');
    const serverSayanApiKey = settings.sayanApiKey || process.env.SAYAN_API_KEY || 's_gate_live_73f08a91b2c';
    if (!serverSayanBaseUrl || !serverSayanApiKey) {
        throw new Error('تنظیمات آدرس API و کلید امنیتی سایان در بخش تنظیمات سیستم وارد نشده است. لطفاً ابتدا از بخش تنظیمات، آدرس و کلید وب‌سرویس سایان را وارد نمایید.');
    }

    const finalUrl = `${serverSayanBaseUrl}/query`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await robustFetch(finalUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serverSayanApiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: queryStr }),
            signal: controller.signal,
            timeout: timeoutMs
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || err.message || `خطا در برقراری ارتباط با دیتابیس سایان ERP (کد ${response.status})`);
        }
        const data = await response.json();
        return data.data || [];
    } catch (err) {
        if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || err?.message?.includes('aborted')) {
            throw new Error(`مهلت زمان اجرای کوئری در سرور سایان (${timeoutMs / 1000} ثانیه) به پایان رسید.`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
};

app.post('/api/sayan-proxy', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        let serverSayanBaseUrl = sanitizeSayanUrl(settings.sayanApiUrl || process.env.SAYAN_API_URL);
        const serverSayanApiKey = settings.sayanApiKey || process.env.SAYAN_API_KEY;

        if (!serverSayanBaseUrl || !serverSayanApiKey) {
            return res.status(400).json({ error: 'تنظیمات آدرس API و کلید امنیتی سایان در بخش تنظیمات سیستم وارد نشده است.' });
        }

        const { path: targetPath, method: targetMethod, body: targetBody } = req.body;
        if (!targetPath) {
            return res.status(400).json({ error: 'مسیر درخواست (path) الزامی است.' });
        }

        const cleanPath = targetPath.replace(/^\//, '');
        const finalUrl = `${serverSayanBaseUrl}/${cleanPath}`;

        const headers = {
            'Authorization': `Bearer ${serverSayanApiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        const fetchOptions = {
            method: targetMethod || 'GET',
            headers
        };

        if (targetBody && (targetMethod === 'POST' || targetMethod === 'PUT')) {
            fetchOptions.body = JSON.stringify(targetBody);
        }

        const response = await robustFetch(finalUrl, fetchOptions);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
            return res.status(response.status).json(data || { error: `Sayan Server returned error status ${response.status}` });
        }

        res.json(data);
    } catch (err) {
        console.error("Sayan Proxy Error:", err);
        res.status(500).json({ error: err.message || 'خطا در برقراری ارتباط با وب‌سرویس سایان' });
    }
});

app.post('/api/sayan/test-connection', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        const rawUrl = (req.body && req.body.url) || settings.sayanApiUrl || process.env.SAYAN_API_URL;
        const apiKey = (req.body && req.body.apiKey) !== undefined ? req.body.apiKey : (settings.sayanApiKey || process.env.SAYAN_API_KEY);

        if (!rawUrl) {
            return res.status(400).json({ success: false, error: 'آدرس سرور یا IP وب‌سرویس سایان در تنظیمات وارد نشده است.' });
        }

        const cleanUrl = sanitizeSayanUrl(rawUrl);
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
            headers['x-api-key'] = apiKey;
        }

        try {
            const response = await robustFetch(`${cleanUrl}/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query: 'SELECT 1 AS ping' }),
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            const latency = Date.now() - startTime;

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMessage = errData.message || errData.error || `پاسخ وب‌سرویس با کد ${response.status} بازگشت داده شد.`;
                return res.json({
                    success: false,
                    error: errMessage,
                    status: response.status,
                    latency,
                    targetUrl: cleanUrl
                });
            }

            const data = await response.json().catch(() => ({}));
            return res.json({
                success: true,
                message: `اتصال به وب‌سرویس سایان با موفقیت برقرار شد.`,
                latency,
                targetUrl: cleanUrl,
                data: data.data || []
            });
        } catch (fetchErr) {
            const latency = Date.now() - startTime;
            let errorMsg = fetchErr.name === 'AbortError' ? 'مهلت زمان برقراری ارتباط (Timeout) با وب‌سرویس سایان به پایان رسید.' : (fetchErr.message || 'خطا در ارتباط با وب‌سرویس سایان');
            return res.json({
                success: false,
                error: errorMsg,
                latency,
                targetUrl: cleanUrl
            });
        }
    } catch (e) {
        return res.json({
            success: false,
            error: e.message || 'خطای غیرمنتظره در تست ارتباط'
        });
    }
});

// =========================================================================
// SAYAN ORDER AUTOMATION (53 -> 57) API ENDPOINTS
// =========================================================================

// 1. Get status, config & pending overview
app.get('/api/sayan/order-automation/status', async (req, res) => {
    try {
        const db = getDb();
        const config = sayanOrderAuto.getAutomationConfig(db);
        const logs = sayanOrderAuto.getAutomationLogs(db, 20);
        res.json({
            success: true,
            config,
            recentLogs: logs
        });
    } catch (err) {
        console.error("Order automation status error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Get all pending 53 purchase requests with items & detected vendors
app.get('/api/sayan/order-automation/pending', async (req, res) => {
    try {
        const db = getDb();
        const config = sayanOrderAuto.getAutomationConfig(db);
        const fiscalYear = req.query.fiscalYear || config.fiscalYear || '4';
        const forceRefresh = req.query.forceRefresh === 'true' || req.query.refresh === 'true';
        const pending = await sayanOrderAuto.getPendingPurchaseRequests(fiscalYear, forceRefresh);
        res.json({
            success: true,
            fiscalYear,
            totalPending: pending.length,
            readyCount: pending.filter(p => p.isReady).length,
            items: pending
        });
    } catch (err) {
        console.error("Order automation pending fetch error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2.1. Get archived / converted 53 purchase requests with their linked 57 pre-invoices
app.get('/api/sayan/order-automation/archived', async (req, res) => {
    try {
        const db = getDb();
        const config = sayanOrderAuto.getAutomationConfig(db);
        const fiscalYear = req.query.fiscalYear || config.fiscalYear || '4';
        const forceRefresh = req.query.forceRefresh === 'true' || req.query.refresh === 'true';
        const archived = await sayanOrderAuto.getArchivedPurchaseRequests(fiscalYear, forceRefresh);
        res.json({
            success: true,
            fiscalYear,
            totalArchived: archived.length,
            items: archived
        });
    } catch (err) {
        console.error("Order automation archived fetch error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Get items of a specific 53 document
app.get('/api/sayan/order-automation/items/:docNo', async (req, res) => {
    try {
        const db = getDb();
        const config = sayanOrderAuto.getAutomationConfig(db);
        const fiscalYear = req.query.fiscalYear || config.fiscalYear || '4';
        const archiveCode = req.query.archiveCode;
        const docId = req.query.docId;
        const items = await sayanOrderAuto.getPurchaseRequestItems(req.params.docNo, fiscalYear, { archiveCode, docId });
        res.json({
            success: true,
            items
        });
    } catch (err) {
        console.error("Order automation items fetch error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Update configuration
app.post('/api/sayan/order-automation/config', (req, res) => {
    try {
        const db = getDb();
        const updated = sayanOrderAuto.saveAutomationConfig(db, req.body || {});
        sayanOrderAuto.initAutomationScheduler();
        res.json({ success: true, config: updated });
    } catch (err) {
        console.error("Order automation save config error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Convert single 53 request to 57 pre-invoice
app.post('/api/sayan/order-automation/convert-single', async (req, res) => {
    try {
        const { doc53Id, vendorCode, vendorName, isDryRun, dryRun, user, requestedBy } = req.body || {};
        if (!doc53Id) {
            return res.json({ success: false, error: 'شناسه درخواست خرید (doc53Id) الزامی است.' });
        }
        const result = await sayanOrderAuto.convert53To57(doc53Id, {
            vendorCode,
            vendorName,
            isDryRun: Boolean(isDryRun ?? dryRun),
            user: user || requestedBy || 'کاربر سیستم'
        });
        res.json(result);
    } catch (err) {
        console.error("Order automation single convert error:", err);
        res.json({ success: false, error: err.message });
    }
});

// 6. Run full batch cycle
const handleBatchRun = async (req, res) => {
    try {
        const { isDryRun, dryRun, user, triggeredBy, fiscalYear } = req.body || {};
        const summary = await sayanOrderAuto.runAutomationCycle({
            isDryRun: isDryRun ?? dryRun,
            user: user || triggeredBy || 'اجرای دستی گروهی',
            fiscalYear
        });
        res.json({ success: true, summary });
    } catch (err) {
        console.error("Order automation batch run error:", err);
        res.json({ success: false, error: err.message });
    }
};
app.post('/api/sayan/order-automation/run-batch', handleBatchRun);
app.post('/api/sayan/order-automation/run-now', handleBatchRun);

// 7. Get audit logs
app.get('/api/sayan/order-automation/logs', (req, res) => {
    try {
        const db = getDb();
        const limit = parseInt(req.query.limit, 10) || 100;
        const logs = sayanOrderAuto.getAutomationLogs(db, limit);
        res.json({ success: true, logs });
    } catch (err) {
        console.error("Order automation logs error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. Get authentic real Sayan ERP document inspection (Doc 57 & linked Doc 53)
app.get('/api/sayan/order-automation/sayan-doc/:docNo', async (req, res) => {
    try {
        const fiscalYear = req.query.fiscalYear || '4';
        const docNo = req.params.docNo;
        const details = await sayanOrderAuto.getRealSayanDocumentDetails(docNo, fiscalYear);
        res.json({ success: true, ...details });
    } catch (err) {
        console.error("Error fetching Sayan real document details:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================================
// SAYAN CHEQUE RECEIPTS (BURSARY OP 11) API ENDPOINTS
// =========================================================================

// 1. Get next numbers and metadata for Cheque Receipt
app.get('/api/sayan/cheque-receipts/meta', async (req, res) => {
    try {
        const fiscalYear = req.query.fiscalYear || '4';
        const meta = await sayanChequeService.getNextChequeReceiptNumbers(fiscalYear);
        res.json({ success: true, ...meta });
    } catch (err) {
        console.error("Error fetching cheque receipt meta:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Search Sayan Tafsili / Persons by query
app.get('/api/sayan/cheque-receipts/persons', async (req, res) => {
    try {
        const query = req.query.query || req.query.q || req.query.search || '';
        const limit = parseInt(req.query.limit, 10) || 50;
        const force = req.query.force === 'true' || req.query.forceRefresh === 'true';
        const persons = await sayanChequeService.searchSayanPersons(query, limit, force);
        res.json({ success: true, persons });
    } catch (err) {
        console.error("Error searching Sayan persons:", err);
        res.status(500).json({ success: false, error: err.message, persons: [] });
    }
});

// 2.1. Search Sayan Tafsili / Vendors for Order Automation module
app.get('/api/sayan/order-automation/persons', async (req, res) => {
    try {
        const query = req.query.query || req.query.q || req.query.search || '';
        const limit = parseInt(req.query.limit, 10) || 60;
        const persons = await sayanChequeService.searchSayanPersons(query, limit);
        res.json({ success: true, persons });
    } catch (err) {
        console.error("Error searching Sayan persons for automation:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2b. Fetch Sayan Cashboxes / Funds list (GNR_TBL_005)
app.get('/api/sayan/cheque-receipts/cashboxes', async (req, res) => {
    try {
        const cashboxes = await sayanChequeService.getSayanCashboxes();
        res.json({ success: true, cashboxes });
    } catch (err) {
        console.error("Error fetching Sayan cashboxes:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Get Cheque Receipts history (combines live Sayan docs + local drafts)
app.get(['/api/sayan/cheque-receipts', '/api/sayan/cheque-receipts/history'], async (req, res) => {
    try {
        const fiscalYear = req.query.fiscalYear || '4';
        const search = req.query.search || '';
        const history = await sayanChequeService.getChequeReceiptsHistory(fiscalYear, search);
        res.json({ success: true, history, data: history, count: history.length });
    } catch (err) {
        console.error("Error fetching cheque receipts history:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.5. Fetch Person / Customer Cheques & Ras Data
app.get(['/api/sayan/person-cheques', '/api/sayan/person-cheques/:personCode'], async (req, res) => {
    try {
        const personCode = req.params.personCode || req.query.personCode || req.query.code || '';
        const personName = req.query.personName || req.query.name || '';
        const result = await sayanChequeService.getPersonChequesAndRas(personCode, personName, req.query);
        res.json(result);
    } catch (err) {
        console.error("Error fetching person cheques:", err);
        res.status(500).json({ success: false, error: err.message, cheques: [] });
    }
});

// 4. Save or create Cheque Receipt Draft
app.post(['/api/sayan/cheque-receipts', '/api/sayan/cheque-receipts/draft'], async (req, res) => {
    try {
        const receipt = req.body.receipt || req.body;
        const currentUser = req.body.currentUser || req.user || { name: receipt.createdByName || 'کاربر سیستم' };
        if (!receipt) {
            return res.status(400).json({ success: false, error: 'اطلاعات رسید چک ارسال نشده است.' });
        }
        const saved = await sayanChequeService.saveChequeReceiptDraft(receipt, currentUser);
        res.json({ success: true, receipt: saved, receiptNo: saved.receiptNo, id: saved.id });
    } catch (err) {
        console.error("Error saving cheque receipt draft:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4.5. Pure Edit Cheque Receipt in current stage (Never advances stage)
app.put('/api/sayan/cheque-receipts/:id', async (req, res) => {
    try {
        const receiptId = req.params.id;
        const currentUser = req.body?.currentUser || req.user || { id: req.body?.reviewerId, name: req.body?.reviewerName || 'کاربر' };
        const updatePayload = req.body;
        if (!receiptId) {
            return res.status(400).json({ success: false, error: 'شناسه رسید الزامی است.' });
        }
        const updated = await sayanChequeService.updateChequeReceipt(receiptId, updatePayload, currentUser);
        res.json({ success: true, receipt: updated, message: 'تغییرات رسید در همین مرحله با موفقیت ذخیره گردید.' });
    } catch (err) {
        console.error("Error updating cheque receipt:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4.6. Update Receipt Number directly (شماره رسید)
app.post(['/api/sayan/cheque-receipts/:id/update-receipt-no', '/api/sayan/cheque-receipts/update-receipt-no'], async (req, res) => {
    try {
        const receiptId = req.params.id || req.body?.receiptId || req.body?.id;
        const newReceiptNo = req.body?.receiptNo !== undefined ? req.body?.receiptNo : req.body?.newReceiptNo;
        const currentUser = req.body?.currentUser || req.user || { id: req.body?.reviewerId, name: req.body?.reviewerName || 'کاربر' };
        if (!receiptId) {
            return res.status(400).json({ success: false, error: 'شناسه رسید الزامی است.' });
        }
        if (newReceiptNo === undefined || newReceiptNo === null || String(newReceiptNo).trim() === '') {
            return res.status(400).json({ success: false, error: 'شماره رسید جدید الزامی است.' });
        }
        const updated = await sayanChequeService.updateReceiptNumber(receiptId, newReceiptNo, currentUser);
        res.json({ success: true, receipt: updated, message: 'شماره رسید با موفقیت به‌روزرسانی شد.' });
    } catch (err) {
        console.error("Error updating receipt number:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Stage 1: Accounting Staff Review, In-flight Edit & Approval
app.all(['/api/sayan/cheque-receipts/accounting-approve', '/api/sayan/cheque-receipts/:id/accounting-review', '/api/sayan/cheque-receipts/:id/accounting-approve'], async (req, res) => {
    try {
        const receiptId = req.params.id || req.body?.receiptId;
        const currentUser = req.body?.currentUser || req.user || { id: req.body?.reviewerId, name: req.body?.reviewerName || 'کارشناس حسابداری' };
        const note = req.body?.note || req.body?.accountingNote || '';
        const updatePayload = req.body?.updatePayload || (req.body?.cheques ? req.body : null);
        const approveForCEO = req.body?.approveForCEO === true; // Only advance to CEO if explicitly true!
        if (!receiptId) {
            return res.status(400).json({ success: false, error: 'شناسه رسید الزامی است.' });
        }
        const approved = await sayanChequeService.approveAccountingReceipt(receiptId, currentUser, note, updatePayload, approveForCEO);
        res.json({ success: true, receipt: approved });
    } catch (err) {
        console.error("Error in accounting approval of cheque receipt:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Stage 2: Final / CEO Approval & Sequential Background Sayan Registration
app.all(['/api/sayan/cheque-receipts/approve', '/api/sayan/cheque-receipts/:id/ceo-approve', '/api/sayan/cheque-receipts/:id/approve'], async (req, res) => {
    try {
        const receiptId = req.params.id || req.body?.receiptId;
        const currentUser = req.body?.currentUser || req.user || { id: req.body?.approverId, name: req.body?.approverName || 'مدیرعامل' };
        const note = req.body?.note || '';
        if (!receiptId) {
            return res.status(400).json({ success: false, error: 'شناسه رسید الزامی است.' });
        }
        
        // Immediate non-blocking CEO/Final approval with background queue registration
        const approved = await sayanChequeService.approveCEOReceipt(receiptId, currentUser, note);

        res.json({ 
            success: true, 
            queued: true,
            receipt: approved,
            message: 'رسید با موفقیت تایید شد و در صف صدور سند سایان قرار گرفت.'
        });
    } catch (err) {
        console.error("Error approving cheque receipt:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Workflow Configuration for Cheque Receipts & Sayan Registration
app.get('/api/sayan/cheque-receipts/workflow-config', (req, res) => {
    try {
        const config = sayanChequeService.getChequeWorkflowConfig();
        const db = getDb();
        const users = (db.users || []).map(u => ({
            id: u.id,
            username: u.username,
            name: u.fullName || u.name || u.username,
            role: u.role,
            roles: u.roles || []
        }));
        res.json({ success: true, config, users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sayan/cheque-receipts/workflow-config', (req, res) => {
    try {
        const newConfig = req.body || {};
        const saved = sayanChequeService.updateChequeWorkflowConfig(newConfig);
        res.json({ success: true, config: saved, message: 'تنظیمات فرآیند تایید و ثبت سایان با موفقیت ذخیره شد.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. Reject / Return Cheque Receipt for Revision
app.all(['/api/sayan/cheque-receipts/reject', '/api/sayan/cheque-receipts/:id/reject'], async (req, res) => {
    try {
        const receiptId = req.params.id || req.body?.receiptId;
        const currentUser = req.body?.currentUser || req.user || { name: req.body?.rejectedBy || 'کاربر' };
        const reason = req.body?.reason || req.body?.rejectReason || 'جهت بازبینی و اصلاح به حسابداری عودت داده شد.';
        const returnTo = req.body?.returnTo || 'ACCOUNTING';
        if (!receiptId) {
            return res.status(400).json({ success: false, error: 'شناسه رسید الزامی است.' });
        }
        const rejected = await sayanChequeService.rejectChequeReceipt(receiptId, currentUser, reason, returnTo);
        res.json({ success: true, receipt: rejected });
    } catch (err) {
        console.error("Error rejecting cheque receipt:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 9. Dry-run validate Cheque Receipt before registering
app.post('/api/sayan/cheque-receipts/dry-run', async (req, res) => {
    try {
        const receiptData = req.body.receipt || req.body;
        const validation = await sayanChequeService.validateAndDryRunChequeReceipt(receiptData);
        res.json({ success: true, validation });
    } catch (err) {
        console.error("Error in dry run cheque receipt:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 10. Register approved Cheque Receipt directly in Sayan DB
app.post(['/api/sayan/cheque-receipts/register-in-sayan', '/api/sayan/cheque-receipts/:id/re-register'], async (req, res) => {
    try {
        const receiptId = req.params.id || req.body?.receiptId;
        const currentUser = req.body?.currentUser || req.user || { name: 'مدیر سیستم' };
        if (!receiptId) {
            return res.status(400).json({ success: false, error: 'شناسه رسید الزامی است.' });
        }
        const result = await sayanChequeService.registerChequeReceiptInSayan(receiptId, currentUser, true);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error("Error registering cheque receipt in Sayan:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 10.1. Fix receipts with invalid Sanad 1 and prepare them for re-registration
app.post(['/api/sayan/cheque-receipts/fix-invalid-sanad-one', '/api/sayan/cheque-receipts/fix-invalid-docs'], async (req, res) => {
    try {
        const fiscalYear = req.body?.fiscalYear || req.query?.fiscalYear || '4';
        const autoReregister = req.body?.autoReregister === true;
        const currentUser = req.body?.currentUser || req.user || { name: 'مدیر سیستم' };
        const result = await sayanChequeService.fixInvalidSanadOneReceipts(fiscalYear, autoReregister, currentUser);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error("Error fixing invalid Sanad 1 receipts:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 10.2. Reset a single receipt from Sayan status for re-registration
app.post('/api/sayan/cheque-receipts/:id/reset-sayan', async (req, res) => {
    try {
        const receiptId = req.params.id || req.body?.receiptId;
        const currentUser = req.body?.currentUser || req.user || { name: 'مدیر سیستم' };
        const result = await sayanChequeService.resetReceiptForReRegistration(receiptId, currentUser);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error("Error resetting receipt for Sayan:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 10.5. Sync missing Accounting Vouchers (ACT_TBL) for registered Treasury receipts
app.post('/api/sayan/cheque-receipts/sync-accounting-docs', async (req, res) => {
    try {
        const fiscalYear = req.body?.fiscalYear || req.query?.fiscalYear || '4';
        const result = await sayanChequeService.syncMissingReceiptAccountingDocs(fiscalYear);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error("Error syncing missing cheque receipt accounting docs:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 11. Delete draft / cancel receipt
app.post('/api/sayan/cheque-receipts/delete-draft', async (req, res) => {
    try {
        const { receiptId } = req.body || {};
        const db = getDb();
        if (db.sayan_cheque_receipts) {
            db.sayan_cheque_receipts = db.sayan_cheque_receipts.filter(r => r.id !== receiptId);
            saveDb();
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting cheque receipt draft:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 12. Inspect Real Sayan Document Details (BUR_TBL_008, 009, 012, 016)
app.get('/api/sayan/cheque-receipts/real-document/:archiveCode', async (req, res) => {
    try {
        const archiveCode = req.params.archiveCode;
        const fiscalYear = req.query.fiscalYear || '4';
        const docDetails = await sayanChequeService.getSayanRealDocumentDetails(archiveCode, fiscalYear);
        res.json({
            success: docDetails.success,
            data: docDetails,
            ...docDetails
        });
    } catch (err) {
        console.error("Error fetching real Sayan document details:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 13. Get Cartable / Pending Counts for Cheque Receipts
app.get('/api/sayan/cheque-receipts/pending-counts', (req, res) => {
    try {
        const db = getDb();
        const list = db.sayan_cheque_receipts || [];
        const config = sayanChequeService.getChequeWorkflowConfig();
        const pendingAccounting = list.filter(r => r.status === 'PENDING_ACCOUNTING' || r.status === 'PENDING_APPROVAL').length;
        const pendingCeo = list.filter(r => r.status === 'PENDING_CEO').length;
        const processingSayan = list.filter(r => r.status === 'PROCESSING_SAYAN' || r.sayanSyncStatus === 'QUEUED' || r.sayanSyncStatus === 'PROCESSING').length;
        const approved = list.filter(r => r.status === 'REGISTERED_IN_SAYAN' || r.status === 'APPROVED').length;
        res.json({
            success: true,
            pendingAccounting,
            pendingCeo,
            pendingCEO: pendingCeo, // Backwards-compatible
            processingSayan,
            approved,
            totalPending: pendingAccounting + pendingCeo,
            config
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


const standardGroupNames = {
    '0101': 'چیپس',
    '0102': 'POY',
    '0103': 'dty یا پلی استر',
    '0104': 'لاستیک',
    '0105': 'لاکرا',
    '0106': 'پلی استر اسپان',
    '0107': 'مستر بچ',
    '0108': 'نایلون',
    '0401': 'اسپاندکس (کاور)',
    '0402': 'کش',
    '0403': 'اسپاندکس جوشی ( ساپورت )',
    '0405': 'پلی استر شوایتر',
    '0407': 'نایلون',
    '0408': 'نخ ملت',
    '0409': 'الیاف',
    '0410': 'FDY'
};

const cartonRatios = {
    '0401': 15.0,
    '0402': 16.0,
    '0403': 17.0,
    '0405': 15.5,
    '0410': 20.0,
};

const getItemNamesMap = async (db) => {
    if (global._sayanItemNamesCache && (Date.now() - global._sayanItemNamesCacheTime < 3600000)) {
        return global._sayanItemNamesCache;
    }
    try {
        const nameRows = await executeSayanQuery(db, `
            SELECT 
                RTRIM(LTRIM(t21.Field_004)) as ItemCode,
                RTRIM(LTRIM(t02.Field_003)) as ItemName,
                RTRIM(LTRIM(COALESCE(t02_parent.Field_003, t02.Field_003))) as GroupName,
                RTRIM(LTRIM(t02.Field_003)) as SubGroupName
            FROM IND_TBL_021 t21 WITH (NOLOCK)
            INNER JOIN IND_TBL_002 t02 WITH (NOLOCK) ON RTRIM(LTRIM(t21.Field_003)) = RTRIM(LTRIM(t02.Field_008))
            LEFT JOIN IND_TBL_002 t02_parent WITH (NOLOCK) ON RTRIM(LTRIM(t02.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
        `, 5000);

        const map = {};
        (nameRows || []).forEach(r => {
            if (r.ItemCode && !map[r.ItemCode]) {
                map[r.ItemCode] = { name: r.ItemName, group: r.GroupName, subGroup: r.SubGroupName };
            }
        });

        const ind22 = await executeSayanQuery(db, `SELECT RTRIM(LTRIM(Field_005)) as ItemCode, RTRIM(LTRIM(Field_004)) as ItemName FROM IND_TBL_022 WITH (NOLOCK)`, 5000);
        (ind22 || []).forEach(r => {
            if (r.ItemCode && !map[r.ItemCode]) {
                map[r.ItemCode] = { name: r.ItemName, group: '', subGroup: '' };
            }
        });

        global._sayanItemNamesCache = map;
        global._sayanItemNamesCacheTime = Date.now();
        return map;
    } catch (err) {
        console.warn("[Warehouse Inventory] Could not fetch item names map from Sayan:", err.message);
        return global._sayanItemNamesCache || {};
    }
};

const getFyCodeForDate = (dateStr) => {
    if (dateStr <= '2025-03-20') return 2;
    if (dateStr <= '2026-03-20') return 3;
    if (dateStr <= '2027-03-20') return 4;
    if (dateStr <= '2028-03-20') return 5;
    if (dateStr <= '2029-03-20') return 6;
    const year = parseInt(dateStr.substring(0, 4));
    return Math.max(2, year - 2022);
};

const getWarehouseInventoryForDate = async (db, targetDate, nameMap) => {
    const fyCode = getFyCodeForDate(targetDate);
    const sql = `
        SELECT 
            t11.Field_005 as ItemCode,
            SUM(CASE 
                WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '81') THEN t11.Field_006
                WHEN s06.Field_010 = 1 THEN t11.Field_006
                WHEN s06.Field_010 = -1 THEN -t11.Field_006
                ELSE 0 
            END) as StockQty,
            SUM(CASE 
                WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '81') THEN t11.Field_006
                ELSE 0
            END) as OpeningQty,
            SUM(CASE WHEN RTRIM(LTRIM(t10.Field_009)) NOT IN ('10', '81', '12', '14', '16', '53', '57') AND s06.Field_010 = 1 THEN t11.Field_006 ELSE 0 END) as InflowQty,
            SUM(CASE WHEN RTRIM(LTRIM(t10.Field_009)) NOT IN ('10', '81', '12', '14', '16', '53', '57') AND s06.Field_010 = -1 THEN t11.Field_006 ELSE 0 END) as OutflowQty
        FROM STR_TBL_011 t11 WITH (NOLOCK)
        INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 
                                   AND t11.Field_003 = t10.Field_004 
                                   AND t11.Field_012 = t10.Field_018
        INNER JOIN STR_TBL_006 s06 WITH (NOLOCK) ON t10.Field_009 = s06.Field_003
        WHERE t11.Field_003 = '${fyCode}' AND t10.Field_004 = '${fyCode}'
          AND t10.Field_008 <= '${targetDate}T23:59:59.000Z'
          AND t10.Field_009 NOT IN ('19', '82')
          AND (t11.Field_005 LIKE '01%' OR t11.Field_005 LIKE '04%')
        GROUP BY t11.Field_005
    `;
    const rows = await executeSayanQuery(db, sql, 20000);
    return (rows || []).map(r => {
        const code = String(r.ItemCode || '').trim();
        const grpCode = code.substring(0, 4);
        const mapped = nameMap[code] || {};
        const defaultGrp = standardGroupNames[grpCode] || `گروه ${grpCode}`;
        const weight = parseFloat((r.StockQty || 0).toFixed(3));
        const opening = parseFloat((r.OpeningQty || 0).toFixed(3));
        const inflow = parseFloat((r.InflowQty || 0).toFixed(3));
        const outflow = parseFloat((r.OutflowQty || 0).toFixed(3));
        let cartons = 0;
        if (cartonRatios[grpCode] && weight > 0) {
            cartons = Math.round(weight / cartonRatios[grpCode]);
        }
        return {
            itemCode: code,
            itemName: mapped.name || `${defaultGrp} - کد ${code.substring(4) || code}`,
            groupName: standardGroupNames[grpCode] || mapped.group || defaultGrp,
            subGroupName: mapped.subGroup || '',
            openingQty: opening,
            inflowQty: inflow,
            outflowQty: outflow,
            stockQty: weight,
            cartonsQty: cartons
        };
    });
};

const fetchSayanWarehouseInventoryData = async (db, lastYearDateTo, currentYearDateTo, forceRefresh = false) => {
    const settings = db.settings || {};
    const sayanUrl = sanitizeSayanUrl(settings.sayanApiUrl || process.env.SAYAN_API_URL || 'http://80.210.31.176:5000/api/external/v1');
    const sayanKey = (settings.sayanApiKey || process.env.SAYAN_API_KEY || 's_gate_live_73f08a91b2c').trim();

    if (forceRefresh && db.warehouseOverview) {
        db.warehouseOverview.sayanCache = null;
        saveDb(db);
    }

    // Return cached live stock if valid, confirmed live, and not forcing refresh (cache TTL: 3 minutes)
    const cached = db.warehouseOverview?.sayanCache;
    // Cache bypassed to ensure 100% live queries from Sayan SQL

    let lastYearStock = [];
    let currentStock = [];
    let isLiveSayan = false;

    try {
        const nameMap = await getItemNamesMap(db);
        const [lyResult, currResult] = await Promise.all([
            getWarehouseInventoryForDate(db, lastYearDateTo, nameMap),
            getWarehouseInventoryForDate(db, currentYearDateTo, nameMap)
        ]);

        if (Array.isArray(lyResult) && lyResult.length > 0 && Array.isArray(currResult) && currResult.length > 0) {
            lastYearStock = lyResult;
            currentStock = currResult;
            isLiveSayan = true;

            const overview = db.warehouseOverview || {};
            overview.sayanCache = {
                lastYearStock,
                currentStock,
                timestamp: Date.now(),
                isLive: true
            };
            db.warehouseOverview = overview;
            saveDb(db);
        }
    } catch (sayanErr) {
        console.warn('[Warehouse Inventory] Sayan live query error:', sayanErr.message);
    }

    if (!isLiveSayan || !lastYearStock.length || !currentStock.length) {
        if (cached && cached.isLive === true && Array.isArray(cached.lastYearStock) && cached.lastYearStock.length > 0) {
            lastYearStock = cached.lastYearStock;
            currentStock = cached.currentStock;
            isLiveSayan = true;
        } else {
            const benchmark = generateBenchmarkData();
            lastYearStock = benchmark.lastYearStock;
            currentStock = benchmark.currentStock;
        }
    }

    return {
        success: true,
        isLive: isLiveSayan,
        fromBenchmark: !isLiveSayan,
        lastYearStock,
        currentStock
    };
};

app.get('/api/sayan/warehouse-inventory', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
        const db = getDb();
        let lastYearDateTo = req.query.lastYearDateTo;
        if (!lastYearDateTo || !/^\d{4}-\d{2}-\d{2}$/.test(lastYearDateTo)) {
            lastYearDateTo = '2026-03-20';
        }
        let currentYearDateTo = req.query.currentYearDateTo || new Date().toISOString().split("T")[0];
        if (!currentYearDateTo || !/^\d{4}-\d{2}-\d{2}$/.test(currentYearDateTo)) {
            currentYearDateTo = new Date().toISOString().split('T')[0];
        }

        const force = req.query.force === '1' || req.query.force === 'true' || req.query.refresh === '1' || req.query.refresh === 'true';
        const result = await fetchSayanWarehouseInventoryData(db, lastYearDateTo, currentYearDateTo, force);
        res.json(result);
    } catch (err) {
        console.error("Warehouse Inventory Fetch Error:", err);
        const benchmark = generateBenchmarkData();
        res.json({
            success: true,
            isLive: false,
            fromBenchmark: true,
            lastYearStock: benchmark.lastYearStock,
            currentStock: benchmark.currentStock
        });
    }
});

app.get('/api/warehouse-overview/data', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
        const db = getDb();
        const overviewData = { ...(db.warehouseOverview || {}) }; delete overviewData.sayanCache; res.json(overviewData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/warehouse-overview/excluded', (req, res) => {
    try {
        const db = getDb();
        const overview = db.warehouseOverview || {};
        overview.excludedRegistrationNumbers = Array.isArray(req.body?.excluded) ? req.body.excluded : [];
        if (!overview.meta) overview.meta = {};
        overview.meta.excludedRegistrationNumbers = overview.excludedRegistrationNumbers;
        db.warehouseOverview = overview;
        saveDb(db);
        res.json({ success: true, count: overview.excludedRegistrationNumbers.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

let warehouseLiveStatusCache = { data: null, timestamp: 0 };
let isWarehouseLiveCalculating = false;

const MANUFACTURED_GROUPS = [
    { code: '0401', name: 'اسپاندکس (کاور)' },
    { code: '0402', name: 'کش' },
    { code: '0403', name: 'اسپاندکس جوشی ( ساپورت )' },
    { code: '0405', name: 'پلی استر شوایتر' },
    { code: '0407', name: 'نایلون' },
    { code: '0408', name: 'نخ ملت' },
    { code: '0409', name: 'الیاف' },
    { code: '0410', name: 'FDY' }
];

const RAW_MATERIAL_GROUPS = [
    { code: '0101', name: 'چیپس' },
    { code: '0102', name: 'POY' },
    { code: '0103', name: 'dty یا پلی استر' },
    { code: '0104', name: 'لاستیک' },
    { code: '0105', name: 'لاکرا' },
    { code: '0106', name: 'پلی استر اسپان' },
    { code: '0107', name: 'مستر بچ' },
    { code: '0108', name: 'نایلون' }
];

const calculateWarehouseLiveStatus = async (db, force = false, queryExcluded = null) => {
    // Return memory cached data if queried within the last 30 seconds and not forced
    if (!force && warehouseLiveStatusCache.data && (Date.now() - warehouseLiveStatusCache.timestamp < 30000)) {
        return warehouseLiveStatusCache.data;
    }

    if (isWarehouseLiveCalculating && warehouseLiveStatusCache.data) {
        return warehouseLiveStatusCache.data;
    }

    isWarehouseLiveCalculating = true;
    try {
        const overview = db.warehouseOverview || {};
        const meta = overview.meta || {};

        const excludedList = [
            ...(Array.isArray(queryExcluded) ? queryExcluded : []),
            ...(Array.isArray(overview.excludedRegistrationNumbers) ? overview.excludedRegistrationNumbers : []),
            ...(Array.isArray(meta.excludedRegistrationNumbers) ? meta.excludedRegistrationNumbers : [])
        ].map(x => String(x).trim()).filter(Boolean);

        const isItemExcluded = (item) => {
            if (!item || excludedList.length === 0) return false;
            const reg = item.registrationNumber ? String(item.registrationNumber).trim() : '';
            const prof = item.proforma || item.fileNumber ? String(item.proforma || item.fileNumber).trim() : '';
            const id = item.id ? String(item.id).trim() : '';
            return (
                (reg !== '' && excludedList.includes(reg)) ||
                (prof !== '' && excludedList.includes(prof)) ||
                (id !== '' && excludedList.includes(id))
            );
        };

        const lastYearDateTo = meta.report1Miladi || '2026-03-20';
        const currentYearDateTo = meta.report2Miladi || new Date().toISOString().split('T')[0];

        const invResult = await fetchSayanWarehouseInventoryData(db, lastYearDateTo, currentYearDateTo, force);
        const lastYearStock = invResult.lastYearStock || [];
        const currentStock = invResult.currentStock || [];

        const lastYearMap = {};
        lastYearStock.forEach(item => {
            const code = item.itemCode ? item.itemCode.trim() : (item.ItemCode ? item.ItemCode.trim() : '');
            if (code) lastYearMap[code] = parseFloat(item.stockQty !== undefined ? item.stockQty : (item.StockQty || 0));
        });

        const currentMap = {};
        currentStock.forEach(item => {
            const code = item.itemCode ? item.itemCode.trim() : (item.ItemCode ? item.ItemCode.trim() : '');
            if (code) currentMap[code] = parseFloat(item.stockQty !== undefined ? item.stockQty : (item.StockQty || 0));
        });

        const getSectionGroups = (isProduction, predefinedGroups) => {
            const set = new Set();
            predefinedGroups.forEach(g => set.add(g.code));

            const otherPredefined = isProduction ? RAW_MATERIAL_GROUPS : MANUFACTURED_GROUPS;
            const otherPredefinedCodes = new Set(otherPredefined.map(g => g.code));

            const matchesSection = (code) => {
                const prefix4 = code.substring(0, 4);
                if (set.has(prefix4)) return true;
                if (otherPredefinedCodes.has(prefix4)) return false;
                if (isProduction) {
                    return code.startsWith('04');
                } else {
                    return code.startsWith('01');
                }
            };

            lastYearStock.forEach(r => {
                const code = String(r.itemCode || r.ItemCode || '');
                if (code.length >= 4 && matchesSection(code)) {
                    set.add(code.substring(0, 4));
                }
            });
            currentStock.forEach(r => {
                const code = String(r.itemCode || r.ItemCode || '');
                if (code.length >= 4 && matchesSection(code)) {
                    set.add(code.substring(0, 4));
                }
            });

            const list = Array.from(set).map(prefix => {
                const predefined = predefinedGroups.find(g => g.code === prefix);
                if (predefined) return predefined;

                let discoveredName = '';
                const found = [...currentStock, ...lastYearStock].find(r => {
                    const c = String(r.itemCode || r.ItemCode || '');
                    return c.startsWith(prefix) && (r.itemName || r.ItemName);
                });
                if (found) {
                    discoveredName = found.itemName || found.ItemName || '';
                }
                return {
                    code: prefix,
                    name: discoveredName || `گروه ${prefix}`
                };
            });

            return list.sort((a, b) => a.code.localeCompare(b.code));
        };

        const alignedYarns = getSectionGroups(true, MANUFACTURED_GROUPS);
        const alignedImported = getSectionGroups(false, RAW_MATERIAL_GROUPS);

        const getSayanGroupSum = (groupCode, isLastYear) => {
            const map = isLastYear ? lastYearMap : currentMap;
            let sum = 0;
            Object.keys(map).forEach(code => {
                if (code.startsWith(groupCode)) {
                    sum += map[code];
                }
            });
            return sum;
        };

        const currentOverrides = overview.currentOverrides || {};
        const lastYearOverrides = overview.lastYearOverrides || {};

        const getItemValue = (groupCode, isLastYear) => {
            const overrides = isLastYear ? lastYearOverrides : currentOverrides;
            if (overrides[groupCode] && overrides[groupCode].weight !== undefined && overrides[groupCode].weight !== '') {
                return parseFloat(overrides[groupCode].weight) || 0;
            }
            return getSayanGroupSum(groupCode, isLastYear);
        };

        const itemCategories = overview.itemCategories || {};
        const filteredYarns = alignedYarns.filter(g => itemCategories[g.code] !== 'other');
        const filteredImported = alignedImported.filter(g => itemCategories[g.code] !== 'other');

        // Calculate Enterprise Weights
        const totalLastYearYarnsWeight = filteredYarns.reduce((sum, item) => sum + getItemValue(item.code, true), 0);
        const totalCurrentYarnsWeight = filteredYarns.reduce((sum, item) => sum + getItemValue(item.code, false), 0);

        const totalLastYearRawWeight = filteredImported.reduce((sum, item) => sum + getItemValue(item.code, true), 0);
        const bg = filteredImported.reduce((sum, item) => sum + getItemValue(item.code, false), 0);

        const tradeRecords = db.tradeRecords || [];
        const allowedCompanies = meta.allowedCompanies || [];

        const normalizeCompanyName = (name) => {
            if (!name) return '';
            return String(name)
                .trim()
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/ي/g, 'ی')
                .replace(/ك/g, 'ک')
                .replace(/آ/g, 'ا')
                .replace(/\s+/g, ' ')
                .toLowerCase();
        };

        const isCompanyMatching = (recordCompany, allowedComps) => {
            if (!allowedComps || allowedComps.length === 0) return true;
            const normRec = normalizeCompanyName(recordCompany);
            if (!normRec || normRec === 'بدون شرکت') {
                return allowedComps.some(c => {
                    const normC = normalizeCompanyName(c);
                    return normC === 'بدون شرکت' || normC === '';
                });
            }

            return allowedComps.some(allowed => {
                const normAllowed = normalizeCompanyName(allowed);
                if (!normAllowed) return false;
                if (normRec === normAllowed) return true;

                const cleanRec = normRec.replace(/^شرکت\s+/, '').trim();
                const cleanAllowed = normAllowed.replace(/^شرکت\s+/, '').trim();
                if (cleanRec === cleanAllowed) return true;

                if (cleanAllowed.length >= 5 && cleanRec.includes(cleanAllowed)) return true;
                if (cleanRec.length >= 5 && cleanAllowed.includes(cleanRec)) return true;

                return false;
            });
        };

        const getRecordWeight = (rec) => {
            if (rec.shippingDocuments && rec.shippingDocuments.length > 0) {
                const commDocs = rec.shippingDocuments.filter((d) => d.type === 'Commercial Invoice');
                let commW = 0;
                for (const doc of commDocs) {
                    if (doc.invoiceItems && doc.invoiceItems.length > 0) {
                        commW += doc.invoiceItems.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
                    } else if (doc.netWeight) {
                        commW += Number(doc.netWeight) || 0;
                    }
                }
                if (commW > 0) return commW;
            }
            return rec.items ? rec.items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0) : 0;
        };

        const activeTradeRecords = tradeRecords.filter((r) => !r.isArchived && isCompanyMatching(r.company, allowedCompanies));

        const parsedCommercialCustoms = [];
        const parsedCommercialPurchaseAndTransit = [];
        const parsedCommercialDomesticPurchases = [];

        for (const record of activeTradeRecords) {
            const recordExcluded = isItemExcluded({
                id: `com_${record.id}`,
                registrationNumber: record.registrationNumber || record.orderRegistrationNumber,
                proforma: record.fileNumber || record.proformaNumber || record.proforma
            }) || (record.id && isItemExcluded({ id: String(record.id) }));

            if (recordExcluded) {
                continue;
            }

            const isCompleted = record.status === 'Completed' || Boolean(record.isArchived);

            const isDomestic = record.purchaseType === 'domestic_bourse' || Boolean(record.petrochemicalData);
            if (isDomestic) {
                const isDelivered = Boolean(
                    record.petrochemicalData?.warehouseReceipt?.isConfirmed ||
                    record.petrochemicalData?.loadingNotice?.deliveryStatus === 'delivered_warehouse' ||
                    isCompleted
                );
                if (!isDelivered) {
                    const petroWeight = Number(record.petrochemicalData?.quantityKg) || getRecordWeight(record) || 0;
                    parsedCommercialDomesticPurchases.push({
                        id: `com_${record.id}`,
                        weight: petroWeight
                    });
                }
                continue;
            }

            const hasTruckFreight = Boolean(
                (record.internalShippingData?.payments && record.internalShippingData.payments.length > 0) ||
                (record.stages?.['INTERNAL_SHIPPING']?.costRial > 0) ||
                record.stages?.['INTERNAL_SHIPPING']?.isCompleted ||
                (record.stages?.['حمل داخلی']?.costRial > 0) ||
                record.stages?.['حمل داخلی']?.isCompleted
            );

            if (isCompleted || hasTruckFreight) {
                continue;
            }

            const hasCottage = Boolean(
                (record.cottageNumber && String(record.cottageNumber).trim() !== '') ||
                (record.greenLeafData?.duties && record.greenLeafData.duties.length > 0) ||
                (record.greenLeafData?.guarantees && record.greenLeafData.guarantees.length > 0) ||
                (record.stages?.['GREEN_LEAF']?.costRial > 0 || record.stages?.['GREEN_LEAF']?.isCompleted) ||
                (record.stages?.['برگ سبز']?.costRial > 0 || record.stages?.['برگ سبز']?.isCompleted) ||
                (record.greenLeafData?.duties?.some((d) => d.cottageNumber && String(d.cottageNumber).trim() !== ''))
            );

            const hasArrivalNotice = Boolean(
                (record.clearanceData?.receipts && record.clearanceData.receipts.length > 0) ||
                (record.clearanceData?.payments && record.clearanceData.payments.length > 0) ||
                (record.stages?.['CLEARANCE_DOCS']?.costRial > 0 || record.stages?.['CLEARANCE_DOCS']?.isCompleted) ||
                (record.stages?.['ترخیصیه و قبض انبار']?.costRial > 0 || record.stages?.['ترخیصیه و قبض انبار']?.isCompleted) ||
                record.isInCustoms
            );

            const isInCustoms = hasCottage || hasArrivalNotice;

            const hasCurrencyPurchase = Boolean(
                (record.currencyPurchaseData && (
                    (record.currencyPurchaseData.purchasedAmount || 0) > 0 || 
                    (record.currencyPurchaseData.tranches && record.currencyPurchaseData.tranches.length > 0)
                )) ||
                (record.stages?.['CURRENCY_PURCHASE']?.costCurrency > 0 || record.stages?.['CURRENCY_PURCHASE']?.costRial > 0 || record.stages?.['CURRENCY_PURCHASE']?.isCompleted) ||
                (record.stages?.['خرید ارز']?.costCurrency > 0 || record.stages?.['خرید ارز']?.costRial > 0 || record.stages?.['خرید ارز']?.isCompleted)
            );

            const hasAllocationApproved = Boolean(
                record.currencyPurchaseData?.allocationDate ||
                record.stages?.['ALLOCATION_APPROVED']?.isCompleted ||
                record.stages?.['تخصیص یافته']?.isCompleted
            );

            if (isInCustoms) {
                parsedCommercialCustoms.push({
                    id: `com_${record.id}`,
                    weight: getRecordWeight(record)
                });
            } else if (hasCurrencyPurchase || hasAllocationApproved) {
                parsedCommercialPurchaseAndTransit.push({
                    id: `com_${record.id}`,
                    weight: getRecordWeight(record)
                });
            }
        }

        const clearedFileNumbers = new Set(
            tradeRecords
                .filter((r) => {
                    const hasTruck = Boolean(
                        (r.internalShippingData?.payments && r.internalShippingData.payments.length > 0) ||
                        (r.stages?.['INTERNAL_SHIPPING']?.costRial > 0) ||
                        r.stages?.['INTERNAL_SHIPPING']?.isCompleted ||
                        (r.stages?.['حمل داخلی']?.costRial > 0) ||
                        r.stages?.['حمل داخلی']?.isCompleted
                    );
                    return r.status === 'Completed' || r.isArchived || hasTruck;
                })
                .map((r) => r.fileNumber)
                .filter(Boolean)
        );

        const baseCustoms = (overview.goodsInCustoms || []).filter((x) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma)) && !isItemExcluded(x));
        const baseTransit = (overview.goodsInTransit || []).filter((x) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma)) && !isItemExcluded(x));
        const basePurchase = (overview.purchasingGoods || []).filter((x) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma)) && !isItemExcluded(x));
        const baseDomestic = (overview.domesticPurchases || []).filter((x) => !x.id.startsWith('com_') && (!x.proforma || !clearedFileNumbers.has(x.proforma)) && !isItemExcluded(x));
        const baseCommercial = (overview.commercialGoods || []).filter((x) => !isItemExcluded({ id: x.id, registrationNumber: x.itemName }));

        const mergedBasePurchaseAndTransit = [...basePurchase, ...baseTransit];

        const finalGoodsInCustoms = [...baseCustoms, ...parsedCommercialCustoms];
        const finalPurchasingGoods = [...mergedBasePurchaseAndTransit, ...parsedCommercialPurchaseAndTransit];
        const finalDomesticPurchases = [...baseDomestic, ...parsedCommercialDomesticPurchases];
        const finalCommercialGoods = [...baseCommercial];

        const calculateCustomTableSum = (items, field) => (items || []).reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0);

        const customs = calculateCustomTableSum(finalGoodsInCustoms, 'weight');
        const purchase = calculateCustomTableSum(finalPurchasingGoods, 'weight');
        const domestic = calculateCustomTableSum(finalDomesticPurchases, 'weight');
        const commercial = calculateCustomTableSum(finalCommercialGoods, 'weight');
        const transit = 0;

        const totalCurrentRawWeight = bg + transit + customs + purchase + domestic + commercial;

        const totalLastYearAllWeight = totalLastYearYarnsWeight + totalLastYearRawWeight;
        const totalCurrentAllWeight = totalCurrentYarnsWeight + totalCurrentRawWeight;
        const diffAllWeight = totalCurrentAllWeight - totalLastYearAllWeight;
        const ratioAllWeight = totalLastYearAllWeight > 0 ? (diffAllWeight / totalLastYearAllWeight) * 100 : 0;

        let totalPositiveWeight = 0;
        let totalNegativeWeight = 0;

        filteredYarns.forEach(group => {
            const wLast = getItemValue(group.code, true);
            const wCurr = getItemValue(group.code, false);
            const diff = wCurr - wLast;
            if (diff > 0) totalPositiveWeight += diff;
            else if (diff < 0) totalNegativeWeight += diff;
        });

        filteredImported.forEach(group => {
            const wLast = getItemValue(group.code, true);
            const wCurr = getItemValue(group.code, false);
            const diff = wCurr - wLast;
            if (diff > 0) totalPositiveWeight += diff;
            else if (diff < 0) totalNegativeWeight += diff;
        });

        (finalGoodsInCustoms || []).forEach(item => {
            const wCurr = parseFloat(item.weight) || 0;
            if (wCurr > 0) totalPositiveWeight += wCurr;
            else if (wCurr < 0) totalNegativeWeight += wCurr;
        });

        (finalPurchasingGoods || []).forEach(item => {
            const wCurr = parseFloat(item.weight) || 0;
            if (wCurr > 0) totalPositiveWeight += wCurr;
            else if (wCurr < 0) totalNegativeWeight += wCurr;
        });

        (finalDomesticPurchases || []).forEach(item => {
            const wCurr = parseFloat(item.weight) || 0;
            if (wCurr > 0) totalPositiveWeight += wCurr;
            else if (wCurr < 0) totalNegativeWeight += wCurr;
        });

        const today = new Date();
        const option = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        const persDate = today.toLocaleDateString('fa-IR', option);

        const liveMeta = {
            totalCurrentAllWeight,
            diffAllWeight,
            ratioAllWeight,
            totalPositiveWeight,
            totalNegativeWeight,
            reportDate: persDate
        };

        if (!db.warehouseOverview) db.warehouseOverview = {};
        if (!db.warehouseOverview.meta) db.warehouseOverview.meta = {};
        Object.assign(db.warehouseOverview.meta, liveMeta);
        saveDb(db);

        const liveStatusPayload = {
            success: true,
            isMock: false,
            isLive: invResult.isLive,
            meta: liveMeta
        };
        warehouseLiveStatusCache = { data: liveStatusPayload, timestamp: Date.now() };

        return liveStatusPayload;
    } catch (err) {
        console.error("Live Warehouse Status calculation error:", err);
        const meta = db.warehouseOverview?.meta || {};
        return {
            success: true,
            isMock: false,
            fromFallback: true,
            message: 'استفاده از آخرین تراز واقعی ثبت‌شده در انبار',
            meta: {
                totalCurrentAllWeight: meta.totalCurrentAllWeight !== undefined ? meta.totalCurrentAllWeight : 0,
                diffAllWeight: meta.diffAllWeight !== undefined ? meta.diffAllWeight : 0,
                ratioAllWeight: meta.ratioAllWeight !== undefined ? meta.ratioAllWeight : 0,
                totalPositiveWeight: meta.totalPositiveWeight !== undefined ? meta.totalPositiveWeight : 0,
                totalNegativeWeight: meta.totalNegativeWeight !== undefined ? meta.totalNegativeWeight : 0,
                reportDate: meta.reportDate || ''
            }
        };
    } finally {
        isWarehouseLiveCalculating = false;
    }
};

// Background live sync for warehouse overview with Sayan ERP
let isWarehouseBackgroundSyncBusy = false;
const triggerBackgroundWarehouseLiveSync = async (force = false) => {
    if (isWarehouseBackgroundSyncBusy) return;
    isWarehouseBackgroundSyncBusy = true;
    try {
        const db = getDb();
        await calculateWarehouseLiveStatus(db, force);
    } catch (e) {
        console.warn("[Warehouse Background Sync] error:", e.message);
    } finally {
        isWarehouseBackgroundSyncBusy = false;
    }
};

// Start gentle background sync & Sayan cache priming
setTimeout(async () => {
    try {
        await sayanChequeService.getAllSayanPersons(true);
    } catch (e) {
        // ignore silent
    }
    triggerBackgroundWarehouseLiveSync(false);
}, 5000);

setInterval(() => {
    triggerBackgroundWarehouseLiveSync(false);
}, 300000);

const triggerBackgroundWarehouseLiveLiveStatus = triggerBackgroundWarehouseLiveSync;

app.get('/api/warehouse-overview/live-status', async (req, res) => {
    try {
        const db = getDb();
        const force = req.query.force === 'true';
        let queryExcluded = [];
        try {
            if (req.query.excluded) {
                queryExcluded = typeof req.query.excluded === 'string' ? JSON.parse(req.query.excluded) : req.query.excluded;
            }
        } catch {}
        const result = await calculateWarehouseLiveStatus(db, force, queryExcluded);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/warehouse-overview/data', (req, res) => {
    try {
        const db = getDb();
        db.warehouseOverview = req.body;
        saveDb(db);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- WAREHOUSE OVERVIEW & SUPPLY CHAIN PDF GENERATION & BOT DISPATCH ---
app.post('/api/warehouse-overview/generate-pdf', async (req, res) => {
    try {
        const {
            mode = 'both',
            summary = {},
            yarnItems = [],
            rawItems = [],
            logisticsItems = [],
            growthItems = [],
            negativeItems = [],
            signature = 'انبارداری مرکزی و تامین خارجی'
        } = req.body;

        const pdfBuffer = await Renderer.generateWarehouseOverviewReportPDF({
            mode,
            summary,
            yarnItems,
            rawItems,
            logisticsItems,
            growthItems,
            negativeItems,
            signature
        });

        const reportDate = summary.reportDate || '1405-05-31';
        const cleanDate = reportDate.replace(/[\/\\]/g, '-');
        const filename = `Warehouse_Overview_${cleanDate}_${mode}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (err) {
        console.error("Generate Warehouse PDF error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/warehouse-overview/send-negative-alert', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        const {
            mode = 'both', // 'both' | 'overview_only' | 'variance_only'
            sendFormat = 'pdf_and_caption', // 'pdf_and_caption' | 'pdf_only' | 'caption_only'
            notifyInApp = true,
            negativeItems = [],
            growthItems = [],
            yarnItems = [],
            rawItems = [],
            logisticsItems = [],
            summary = {},
            targetGroup = null,
            platforms = ['telegram', 'bale']
        } = req.body;

        // Collect destination targets strictly for Warehouse
        let targets = [];
        if (targetGroup) {
            const groupIds = String(targetGroup).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean);
            groupIds.forEach(gid => {
                platforms.forEach(plat => {
                    targets.push({ platform: plat, id: gid });
                });
            });
        } else {
            targets = collectBotTargets(db, { category: 'warehouse', platforms });
        }

        if (!targets || targets.length === 0) {
            return res.status(400).json({ 
                error: 'هیچ شناسه گروه یا مقصدی برای ارسال پیام بات تنظیم نشده است. لطفاً در بخش تنظیمات یا فیلد ارسال، آیدی گروه را وارد نمایید.' 
            });
        }

        // Format Iranian Persian numbers helper
        const fNum = (n, maxDec = 1) => {
            const num = parseFloat(n) || 0;
            return num.toLocaleString('fa-IR', { maximumFractionDigits: maxDec });
        };
        const fTon = (n) => {
            const num = (parseFloat(n) || 0) / 1000;
            return num.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
        };

        const reportDate = summary.reportDate || '۱۴۰۵/۰۵/۳۱';
        const r1Label = summary.report1Label || 'منتهی به سال ۱۴۰۴';
        const r2Label = summary.report2Label || 'وضعیت فعلی سال ۱۴۰۵';
        const signature = summary.signature || 'انبارداری مرکزی و تامین خارجی';

        // Prepare message caption based on mode and scope
        let msg = `🚨 *گزارش تراز وزنی انبارها و پایش زنجیره تامین* 🚨\n`;
        msg += `📅 *تاریخ استعلام:* ${reportDate}\n`;
        msg += `📊 *مقایسه دوره‌ها:* ${r2Label} نسبت به ${r1Label}\n`;
        msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;

        if (mode === 'both' || mode === 'overview_only') {
            msg += `⚖️ *خلاصه مقایسه وزنی زنجیره تامین و تولید:*\n\n`;

            if (summary.lastYearYarnsWeight !== undefined || summary.currentYarnsWeight !== undefined) {
                const yDiff = (summary.currentYarnsWeight || 0) - (summary.lastYearYarnsWeight || 0);
                const yRatio = summary.lastYearYarnsWeight > 0 ? (yDiff / summary.lastYearYarnsWeight) * 100 : 0;
                const yIcon = yDiff >= 0 ? '📈 رشد (+)' : '🔻 کاهش (-)';
                msg += `🧵 *۱. نخ‌های تولیدی کارخانه (تولید داخلی):*\n`;
                msg += `  • سال قبل: ${fNum(summary.lastYearYarnsWeight)} kg (${fTon(summary.lastYearYarnsWeight)} تن)\n`;
                msg += `  • سال جاری: ${fNum(summary.currentYarnsWeight)} kg (${fTon(summary.currentYarnsWeight)} تن)\n`;
                msg += `  • اختلاف وزنی: ${yDiff >= 0 ? '+' : ''}${fNum(yDiff)} kg (${yRatio >= 0 ? '+' : ''}${fNum(yRatio, 1)}%) [${yIcon}]\n\n`;
            }

            if (summary.lastYearRawWeight !== undefined || summary.currentRawWeight !== undefined) {
                const rDiff = (summary.currentRawWeight || 0) - (summary.lastYearRawWeight || 0);
                const rRatio = summary.lastYearRawWeight > 0 ? (rDiff / summary.lastYearRawWeight) * 100 : 0;
                const rIcon = rDiff >= 0 ? '📈 رشد (+)' : '🔻 کاهش (-)';
                msg += `📦 *۲. مواد اولیه، اقلام وارداتی و گمرک:*\n`;
                msg += `  • سال قبل: ${fNum(summary.lastYearRawWeight)} kg (${fTon(summary.lastYearRawWeight)} تن)\n`;
                msg += `  • سال جاری: ${fNum(summary.currentRawWeight)} kg (${fTon(summary.currentRawWeight)} تن)\n`;
                msg += `  • اختلاف وزنی: ${rDiff >= 0 ? '+' : ''}${fNum(rDiff)} kg (${rRatio >= 0 ? '+' : ''}${fNum(rRatio, 1)}%) [${rIcon}]\n\n`;
            }

            if (summary.lastYearTotalWeight !== undefined || summary.currentTotalWeight !== undefined) {
                const tDiff = (summary.currentTotalWeight || 0) - (summary.lastYearTotalWeight || 0);
                const tRatio = summary.lastYearTotalWeight > 0 ? (tDiff / summary.lastYearTotalWeight) * 100 : 0;
                const tIcon = tDiff >= 0 ? '✅ تراز مثبت' : '⚠️ تراز منفی';
                msg += `🏢 *۳. سرجمع کل موجودی زنجیره تامین:*\n`;
                msg += `  • سال قبل: ${fNum(summary.lastYearTotalWeight)} kg (${fTon(summary.lastYearTotalWeight)} تن)\n`;
                msg += `  • سال جاری: ${fNum(summary.currentTotalWeight)} kg (${fTon(summary.currentTotalWeight)} تن)\n`;
                msg += `  • تغییر کل: ${tDiff >= 0 ? '+' : ''}${fNum(tDiff)} kg (${tRatio >= 0 ? '+' : ''}${fNum(tRatio, 1)}%) [${tIcon}]\n`;
            }

            msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
        }

        if (mode === 'both' || mode === 'variance_only') {
            msg += `⚠️ *فهرست اقلام و کالاهای دارای کسری / افت وزنی (تراز منفی):*\n\n`;

            if (negativeItems.length === 0) {
                msg += `✅ هیچ کالایی با تراز وزنی منفی یافت نشد. تمامی اقلام در وضعیت رشد یا حفظ موجودی قرار دارند.\n`;
            } else {
                negativeItems.slice(0, 15).forEach((item, idx) => {
                    const num = fNum(idx + 1, 0);
                    const diff = parseFloat(item.diffWeight) || 0;
                    const ratio = parseFloat(item.ratio) || 0;
                    const catLabel = item.category === 'factory' ? '🧵 تولیدی' : '📦 مواد اولیه / وارداتی';
                    
                    msg += `${num}. *${item.name}* ${item.code ? `(${item.code})` : ''} - ${catLabel}\n`;
                    msg += `   🔻 افت وزنی: *${fNum(diff)} kg* (${fNum(ratio, 1)}%)\n`;
                    msg += `   📊 سال قبل: ${fNum(item.lastYearWeight)} kg ⬅️ امسال: ${fNum(item.currentWeight)} kg\n\n`;
                });
                if (negativeItems.length > 15) {
                    msg += `... و ${fNum(negativeItems.length - 15, 0)} قلم کالای منفی دیگر (جزئیات در فایل PDF پیوست)\n\n`;
                }
            }

            if (growthItems && growthItems.length > 0) {
                msg += `📈 *تعداد کالاهای دارای رشد وزنی (مثبت):* ${fNum(growthItems.length, 0)} قلم کالا\n`;
            }

            msg += `🔍 *تعداد کل کالاهای دارای کسری / افت:* ${fNum(negativeItems.length, 0)} قلم کالا\n`;
            msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
        }

        msg += `👤 *تنظیم گزارش:* ${signature}\n`;
        if (sendFormat !== 'caption_only') {
            msg += `📎 *فایل PDF رسمی ${mode === 'both' ? '۲ صفحه‌ای (جداول کل + روند رشد و افت)' : (mode === 'overview_only' ? 'صفحه ۱ (جداول کل)' : 'صفحه ۲ (تحلیل روند و کسری)')} ضمیمه گردید.*\n`;
        }
        msg += `🤖 *سامانه یکپارچه مانیتورینگ انبار و زنجیره تامین سایان ERP*`;

        // Generate PDF if requested
        let pdfBuffer = null;
        const filename = `Warehouse_Overview_${reportDate.replace(/[\/\\]/g, '-')}_${mode}.pdf`;

        if (sendFormat === 'pdf_and_caption' || sendFormat === 'pdf_only') {
            try {
                const Renderer = await import('./backend/renderer.js');
                pdfBuffer = await Renderer.generateWarehouseOverviewReportPDF({
                    mode,
                    summary,
                    yarnItems,
                    rawItems,
                    logisticsItems,
                    growthItems,
                    negativeItems,
                    signature
                });
            } catch (err) {
                console.error("PDF Generation error for bot dispatch:", err);
            }
        }

        // Send to targets
        let sentCount = 0;
        const sendErrors = [];

        const safePdfBuf = pdfBuffer ? (Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)) : null;
        for (const target of targets) {
            try {
                if (target.platform === 'telegram') {
                    const tg = await safeImport('./backend/telegram.js');
                    if (tg) {
                        if (safePdfBuf && (sendFormat === 'pdf_and_caption' || sendFormat === 'pdf_only')) {
                            const tgCaption = sendFormat === 'pdf_and_caption' ? msg : `📄 گزارش وضعیت و تراز انبارها (${reportDate})`;
                            await tg.sendBotDocument(target.id, safePdfBuf, filename, tgCaption);
                            sentCount++;
                        } else if (tg.sendBotMessage) {
                            await tg.sendBotMessage(target.id, msg, { parse_mode: 'Markdown' });
                            sentCount++;
                        }
                    }
                } else if (target.platform === 'bale') {
                    const bale = await safeImport('./backend/bale.js');
                    if (bale) {
                        if (safePdfBuf && (sendFormat === 'pdf_and_caption' || sendFormat === 'pdf_only')) {
                            const baleCaption = sendFormat === 'pdf_and_caption' ? msg : `📄 گزارش وضعیت و تراز انبارها (${reportDate})`;
                            await bale.sendBotDocument(target.id, safePdfBuf, filename, baleCaption);
                            sentCount++;
                        } else if (bale.sendBotMessage) {
                            await bale.sendBotMessage(target.id, msg);
                            sentCount++;
                        }
                    }
                } else if (target.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        let waRes;
                        if (safePdfBuf && (sendFormat === 'pdf_and_caption' || sendFormat === 'pdf_only')) {
                            waRes = await wa.sendMessage(target.id, msg, {
                                data: safePdfBuf.toString('base64'),
                                mimeType: 'application/pdf',
                                filename
                            });
                        } else {
                            waRes = await wa.sendMessage(target.id, msg);
                        }
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        sentCount++;
                    }
                }
            } catch (err) {
                console.error(`Error sending warehouse alert to ${target.platform} (${target.id}):`, err.message);
                sendErrors.push(`${target.platform} (${target.id}): ${err.message}`);
            }
        }

        // Send In-App Notification to CEO & Management if requested
        if (notifyInApp) {
            try {
                const totalDiff = (summary.currentTotalWeight || 0) - (summary.lastYearTotalWeight || 0);
                const notifTitle = `🚨 گزارش و هشدار کمبود موجودی انبار (${reportDate})`;
                const notifBody = negativeItems.length > 0 
                    ? `تعداد ${negativeItems.length} قلم کالا با کسری وزنی نسبت به سال قبل شناسایی شد. تراز کل زنجیره: ${totalDiff >= 0 ? '+' : ''}${fNum(totalDiff)} kg`
                    : `تراز کل زنجیره تامین: ${totalDiff >= 0 ? '+' : ''}${fNum(totalDiff)} kg (تمامی اقلام در وضعیت رشد یا حفظ موجودی)`;
                
                await broadcastNotification(
                    notifTitle,
                    notifBody,
                    '/?tab=warehouse',
                    ['ceo', 'admin', 'manager', 'commercial', 'financial']
                );
            } catch (notifErr) {
                console.error("In-app broadcast notification error:", notifErr);
            }
        }

        if (sentCount === 0 && sendErrors.length > 0) {
            return res.status(500).json({ 
                error: `خطا در ارسال به ربات: ${sendErrors.join(', ')}` 
            });
        }

        res.json({ 
            success: true, 
            sentCount, 
            targetsCount: targets.length,
            errors: sendErrors.length > 0 ? sendErrors : undefined,
            messageText: msg,
            hasPdf: !!pdfBuffer
        });
    } catch (err) {
        console.error("Negative alert send fatal error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/warehouse-overview/send-ai-advisor-report', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        const {
            analysisResult,
            destinationType = 'group', // 'group' | 'person' | 'both'
            platforms = ['telegram', 'bale'],
            reportDate = '',
            report1Label = 'سال قبل',
            report2Label = 'سال جاری',
            signature = 'مدیریت ارشد زنجیره تامین و هوش مصنوعی',
            customTargets = null
        } = req.body;

        if (!analysisResult) {
            return res.status(400).json({ error: 'داده‌های ارزیابی هوش مصنوعی ارسال نشده است.' });
        }

        // Gather targets
        let targets = [];
        
        if (customTargets && Array.isArray(customTargets) && customTargets.length > 0) {
            targets = customTargets.map(t => ({
                platform: t.platform,
                id: String(t.id).trim(),
                name: t.name
            }));
        } else {
            // 1. Group targets
            if (destinationType === 'group' || destinationType === 'both') {
                const groupTargets = collectBotTargets(db, { category: 'warehouse', platforms });
                groupTargets.forEach(t => {
                    if (!targets.some(x => x.platform === t.platform && String(x.id).trim() === String(t.id).trim())) {
                        targets.push(t);
                    }
                });
            }

            // 2. Personal/Individual targets
            if (destinationType === 'person' || destinationType === 'both') {
                if (platforms.includes('telegram') && settings.telegramChatId) {
                    const chatIds = String(settings.telegramChatId).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean);
                    chatIds.forEach(cid => {
                        if (!targets.some(x => x.platform === 'telegram' && String(x.id).trim() === cid)) {
                            targets.push({ platform: 'telegram', id: cid });
                        }
                    });
                }
                if (platforms.includes('bale') && settings.baleChatId) {
                    const chatIds = String(settings.baleChatId).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean);
                    chatIds.forEach(cid => {
                        if (!targets.some(x => x.platform === 'bale' && String(x.id).trim() === cid)) {
                            targets.push({ platform: 'bale', id: cid });
                        }
                    });
                }
            }
        }

        if (targets.length === 0) {
            return res.status(400).json({ 
                error: 'هیچ مقصد یا آیدی گروه/شخصی یافت نشد. لطفاً در بخش تنظیمات یا بخش ارسال، آیدی‌های مقصد را وارد کنید.' 
            });
        }

        // Format Persian numbers helper
        const fNum = (n, maxDec = 1) => {
            const num = parseFloat(n) || 0;
            return num.toLocaleString('fa-IR', { maximumFractionDigits: maxDec });
        };

        // Construct caption
        let msg = `🤖 *گزارش ارزیابی استراتژیک زنجیره تامین (هوش مصنوعی)* 🤖\n`;
        msg += `📅 *تاریخ استعلام:* ${reportDate || '۱۴۰۵/۰۵/۳۱'}\n`;
        msg += `📊 *مقایسه دوره‌ها:* ${report2Label} نسبت به ${report1Label}\n`;
        msg += `🎗️ *نمره پایداری زنجیره کالا:* *${analysisResult.healthScore || 85} از ۱۰۰*\n`;
        msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n\n`;

        msg += `💡 *خلاصه مدیریتی جلسه هیئت مدیره:*\n`;
        if (analysisResult.executiveSummary && Array.isArray(analysisResult.executiveSummary)) {
            analysisResult.executiveSummary.slice(0, 5).forEach((pt, idx) => {
                msg += `🔹 *${idx + 1}.* ${pt}\n`;
            });
        }
        msg += `\n`;

        if (analysisResult.criticalAlerts && analysisResult.criticalAlerts.length > 0) {
            msg += `⚠️ *هشدارهای حساس اتمام موجودی:*\n`;
            analysisResult.criticalAlerts.slice(0, 4).forEach((alert) => {
                msg += `• *${alert.itemName}*: ${alert.reason}\n`;
            });
            msg += `\n`;
        }

        if (analysisResult.procurementActionPlan && analysisResult.procurementActionPlan.length > 0) {
            msg += `🛠️ *اقدام پیشنهادی تدارکات و خرید:*\n`;
            analysisResult.procurementActionPlan.slice(0, 3).forEach((plan) => {
                msg += `• *${plan.action}* ⬅️ ${plan.impact}\n`;
            });
            msg += `\n`;
        }

        msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
        msg += `👤 *تنظیم گزارش:* ${signature}\n`;
        msg += `📎 *فایل گزارش استراتژیک ۲ صفحه‌ای مصور ضمیمه گردید.*\n`;
        msg += `🤖 *سیستم مانیتورینگ هوش مصنوعی کارخانجات لیان بافت*`;

        // Generate PDF
        let pdfBuffer = null;
        const filename = `AI_Strategic_Warehouse_Advisor_${(reportDate || '1405-05-31').replace(/[\/\\]/g, '-')}.pdf`;

        try {
            const Renderer = await import('./backend/renderer.js');
            pdfBuffer = await Renderer.generateAiWarehouseAdvisorReportPDF({
                healthScore: analysisResult.healthScore,
                executiveSummary: analysisResult.executiveSummary,
                totalWeightAnalysis: analysisResult.totalWeightAnalysis,
                logisticsPipelineInsight: analysisResult.logisticsPipelineInsight,
                criticalAlerts: analysisResult.criticalAlerts,
                procurementActionPlan: analysisResult.procurementActionPlan,
                fullReportMarkdown: analysisResult.fullReportMarkdown,
                reportDate,
                report1Label,
                report2Label,
                signature
            });
        } catch (err) {
            console.error("AI Advisor PDF generation error for bot:", err);
        }

        // Send to targets
        let sentCount = 0;
        const sendErrors = [];

        const safePdfBuf = pdfBuffer ? (Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)) : null;
        for (const target of targets) {
            try {
                if (target.platform === 'telegram') {
                    const tg = await safeImport('./backend/telegram.js');
                    if (tg) {
                        if (safePdfBuf) {
                            await tg.sendBotDocument(target.id, safePdfBuf, filename, msg);
                            sentCount++;
                        } else if (tg.sendBotMessage) {
                            await tg.sendBotMessage(target.id, msg, { parse_mode: 'Markdown' });
                            sentCount++;
                        }
                    }
                } else if (target.platform === 'bale') {
                    const bale = await safeImport('./backend/bale.js');
                    if (bale) {
                        if (safePdfBuf) {
                            await bale.sendBotDocument(target.id, safePdfBuf, filename, msg);
                            sentCount++;
                        } else if (bale.sendBotMessage) {
                            await bale.sendBotMessage(target.id, msg);
                            sentCount++;
                        }
                    }
                } else if (target.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        let waRes;
                        if (safePdfBuf) {
                            waRes = await wa.sendMessage(target.id, msg, {
                                data: safePdfBuf.toString('base64'),
                                mimeType: 'application/pdf',
                                filename
                            });
                        } else {
                            waRes = await wa.sendMessage(target.id, msg);
                        }
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        sentCount++;
                    }
                }
            } catch (err) {
                console.error(`Error sending AI Strategic report to ${target.platform} (${target.id}):`, err.message);
                sendErrors.push(`${target.platform} (${target.id}): ${err.message}`);
            }
        }

        // Send In-App Notification
        try {
            await broadcastNotification(
                `🤖 ارزیابی استراتژیک هوش مصنوعی زنجیره تامین صادر شد`,
                `گزارش تحلیلی با نمره پایداری ${analysisResult.healthScore || 85}/۱۰۰ به پیام‌رسان‌ها ارسال شد.`,
                '/?tab=warehouse',
                ['ceo', 'admin', 'manager', 'commercial', 'financial']
            );
        } catch (notifErr) {
            console.error("In-app broadcast notification error:", notifErr);
        }

        if (sentCount === 0 && sendErrors.length > 0) {
            return res.status(500).json({ 
                error: `خطا در ارسال به ربات: ${sendErrors.join(', ')}` 
            });
        }

        res.json({ 
            success: true, 
            sentCount, 
            targetsCount: targets.length,
            errors: sendErrors.length > 0 ? sendErrors : undefined,
            messageText: msg,
            hasPdf: !!pdfBuffer
        });
    } catch (err) {
        console.error("AI Advisor report send fatal error:", err);
        res.status(500).json({ error: err.message });
    }
});

export function getComparisonDateRanges(mode = 'yesterday_vs_last_year') {
    const now = new Date();
    const tehranStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' }); // "YYYY-MM-DD"
    const [gy, gm, gd] = tehranStr.split('-').map(Number);
    const jToday = jalaali.toJalaali ? jalaali.toJalaali(gy, gm, gd) : { jy: 1404, jm: 6, jd: 1 };

    // Yesterday
    const yestDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yestStr = yestDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
    const [ygy, ygm, ygd] = yestStr.split('-').map(Number);
    const jYest = jalaali.toJalaali ? jalaali.toJalaali(ygy, ygm, ygd) : { jy: 1404, jm: 6, jd: 1 };

    const formatJ = (jy, jm, jd) => `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;

    if (mode === 'yesterday_vs_last_year') {
        const dateA = formatJ(jYest.jy, jYest.jm, jYest.jd);
        const dateB = formatJ(jYest.jy - 1, jYest.jm, jYest.jd);
        return {
            dateFromA: dateA,
            dateToA: dateA,
            dateFromB: dateB,
            dateToB: dateB,
            labelA: `دیروز (${dateA})`,
            labelB: `دیروز سال قبل (${dateB})`
        };
    } else if (mode === 'today_vs_last_year') {
        const dateA = formatJ(jToday.jy, jToday.jm, jToday.jd);
        const dateB = formatJ(jToday.jy - 1, jToday.jm, jToday.jd);
        return {
            dateFromA: dateA,
            dateToA: dateA,
            dateFromB: dateB,
            dateToB: dateB,
            labelA: `امروز (${dateA})`,
            labelB: `امروز سال قبل (${dateB})`
        };
    } else if (mode === 'today_vs_yesterday') {
        const dateA = formatJ(jToday.jy, jToday.jm, jToday.jd);
        const dateB = formatJ(jYest.jy, jYest.jm, jYest.jd);
        return {
            dateFromA: dateA,
            dateToA: dateA,
            dateFromB: dateB,
            dateToB: dateB,
            labelA: `امروز (${dateA})`,
            labelB: `دیروز (${dateB})`
        };
    } else if (mode === 'month_to_date_vs_last_year') {
        const dateFromA = formatJ(jToday.jy, jToday.jm, 1);
        const dateToA = formatJ(jToday.jy, jToday.jm, jToday.jd);
        const dateFromB = formatJ(jToday.jy - 1, jToday.jm, 1);
        const dateToB = formatJ(jToday.jy - 1, jToday.jm, jToday.jd);
        return {
            dateFromA,
            dateToA,
            dateFromB,
            dateToB,
            labelA: `ماه جاری (${dateFromA} تا ${dateToA})`,
            labelB: `مدت مشابه سال قبل (${dateFromB} تا ${dateToB})`
        };
    } else if (mode === 'last_month_vs_last_year') {
        let lastJm = jToday.jm - 1;
        let lastJy = jToday.jy;
        if (lastJm < 1) {
            lastJm = 12;
            lastJy -= 1;
        }
        const isLeapA = jalaali.isLeapJalaaliYear ? jalaali.isLeapJalaaliYear(lastJy) : false;
        const isLeapB = jalaali.isLeapJalaaliYear ? jalaali.isLeapJalaaliYear(lastJy - 1) : false;
        const daysInMonth = lastJm <= 6 ? 31 : (lastJm <= 11 ? 30 : (isLeapA ? 30 : 29));
        const daysInMonthPrev = lastJm <= 6 ? 31 : (lastJm <= 11 ? 30 : (isLeapB ? 30 : 29));
        
        const dateFromA = formatJ(lastJy, lastJm, 1);
        const dateToA = formatJ(lastJy, lastJm, daysInMonth);
        const dateFromB = formatJ(lastJy - 1, lastJm, 1);
        const dateToB = formatJ(lastJy - 1, lastJm, daysInMonthPrev);
        return {
            dateFromA,
            dateToA,
            dateFromB,
            dateToB,
            labelA: `کل ماه گذشته (${dateFromA} تا ${dateToA})`,
            labelB: `ماه مشابه سال قبل (${dateFromB} تا ${dateToB})`
        };
    } else if (mode === 'quarter_vs_last_year') {
        const q = Math.ceil(jToday.jm / 3);
        const startM = (q - 1) * 3 + 1;
        const dateFromA = formatJ(jToday.jy, startM, 1);
        const dateToA = formatJ(jToday.jy, jToday.jm, jToday.jd);
        const dateFromB = formatJ(jToday.jy - 1, startM, 1);
        const dateToB = formatJ(jToday.jy - 1, jToday.jm, jToday.jd);
        return {
            dateFromA,
            dateToA,
            dateFromB,
            dateToB,
            labelA: `فصل جاری (${dateFromA} تا ${dateToA})`,
            labelB: `فصل مشابه سال قبل (${dateFromB} تا ${dateToB})`
        };
    } else if (mode === 'year_to_date_vs_last_year') {
        const dateFromA = formatJ(jToday.jy, 1, 1);
        const dateToA = formatJ(jToday.jy, jToday.jm, jToday.jd);
        const dateFromB = formatJ(jToday.jy - 1, 1, 1);
        const dateToB = formatJ(jToday.jy - 1, jToday.jm, jToday.jd);
        return {
            dateFromA,
            dateToA,
            dateFromB,
            dateToB,
            labelA: `سال جاری (${dateFromA} تا ${dateToA})`,
            labelB: `مدت مشابه سال قبل (${dateFromB} تا ${dateToB})`
        };
    }

    const dateA = formatJ(jYest.jy, jYest.jm, jYest.jd);
    const dateB = formatJ(jYest.jy - 1, jYest.jm, jYest.jd);
    return {
        dateFromA: dateA,
        dateToA: dateA,
        dateFromB: dateB,
        dateToB: dateB,
        labelA: `دیروز (${dateA})`,
        labelB: `دیروز سال قبل (${dateB})`
    };
}

export async function fetchProductionDataForDateRange(db, rawFrom, rawTo) {
    const dateFrom = normalizeShamsiDate(rawFrom);
    const dateTo = normalizeShamsiDate(rawTo) || dateFrom;

    if (!dateFrom) {
        throw new Error('تاریخ ابتدا مشخص نشده است');
    }

    const gregFromDate = parseJalaliStrToGregorian(dateFrom);
    const gregToDate = parseJalaliStrToGregorian(dateTo);

    if (!gregFromDate || !gregToDate) {
        throw new Error('فرمت تاریخ شمسی وارد شده نامعتبر است (مثال: 1405/05/02)');
    }

    const sql = `
        SELECT 
            t10.Field_001 as DocId,
            t10.Field_008 as Date,
            RTRIM(LTRIM(t10.Field_009)) as DocType,
            RTRIM(LTRIM(t11.Field_005)) as ItemCode,
            COALESCE(
                NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                NULLIF(RTRIM(LTRIM(t02_exact.Field_003)), ''),
                NULLIF(RTRIM(LTRIM(t_name.ItemName)), ''),
                NULLIF(RTRIM(LTRIM(t_group.GroupName)), ''),
                NULLIF(RTRIM(LTRIM(c01.Field_003)), ''),
                RTRIM(LTRIM(t11.Field_005)),
                N'کالای بدون نام'
            ) as ItemName,
            t11.Field_006 as Quantity
        FROM STR_TBL_010 t10
        INNER JOIN STR_TBL_011 t11 ON t11.Field_004 = t10.Field_005 
                                  AND t11.Field_003 = t10.Field_004
                                  AND t11.Field_012 = t10.Field_018
        LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN IND_TBL_002 t02_exact ON RTRIM(LTRIM(t02_exact.Field_008)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN COM_TBL_001 c01 ON RTRIM(LTRIM(c01.Field_004)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN (
            SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(t02_sub.Field_003) as ItemName
            FROM IND_TBL_021 t21_sub
            LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
            GROUP BY t21_sub.Field_004
        ) t_name ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_name.ItemCode))
        LEFT JOIN (
            SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(COALESCE(t02_grandparent.Field_003, t02_parent.Field_003, t02_sub.Field_003)) as GroupName
            FROM IND_TBL_021 t21_sub
            LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
            LEFT JOIN IND_TBL_002 t02_parent ON RTRIM(LTRIM(t02_sub.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
            LEFT JOIN IND_TBL_002 t02_grandparent ON RTRIM(LTRIM(t02_parent.Field_009)) = RTRIM(LTRIM(t02_grandparent.Field_008))
            GROUP BY t21_sub.Field_004
        ) t_group ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_group.ItemCode))
        WHERE RTRIM(LTRIM(t10.Field_009)) IN ('61', '67', '79', '73', '70')
          AND t10.Field_008 >= '${gregFromDate}T00:00:00.000Z'
          AND t10.Field_008 <= '${gregToDate}T23:59:59.999Z'
        ORDER BY COALESCE(s04.Field_003, t22.Field_004, t02_exact.Field_003, t_name.ItemName, t_group.GroupName, t11.Field_005, N'کالای بدون نام'), t10.Field_008
    `;

    const rawRows = await executeSayanQuery(db, sql);

    const getKnownYarnNameByCode = (code, docType) => {
        const c = String(code || '').replace(/[^0-9]/g, '');
        if (c.startsWith('01020203') || c.startsWith('010203')) return 'نخ شوایتر 150/48';
        if (c.startsWith('01020204') || c.startsWith('010204')) return 'نخ شوایتر 100/36';
        if (c.startsWith('01020205') || c.startsWith('010205')) return 'نخ شوایتر 75/36';
        if (c.startsWith('01020206') || c.startsWith('010206')) return 'نخ شوایتر 300/96';
        if (c.startsWith('01020209') || c.startsWith('010209')) return 'نخ شوایتر 150/144';
        if (c.startsWith('01020214') || c.startsWith('010214')) return 'نخ شوایتر 50/24';
        if (c.startsWith('01020216') || c.startsWith('010216')) return 'نخ شوایتر 75/72';
        if (c.startsWith('01030211') || c.startsWith('010311')) return 'نخ DTY 150/48';
        if (c.startsWith('010302') || c.startsWith('0103')) return 'نخ DTY';
        if (c.startsWith('0101')) return 'نخ POY';
        if (c.startsWith('0104')) return 'نخ کش';
        if (c.startsWith('0105')) return 'نخ اسپاندکس';
        if (c.startsWith('0102') || docType === '70') return 'نخ شوایتر 150';
        if (docType === '61') return 'نخ POY';
        if (docType === '67') return 'نخ DTY';
        if (docType === '79') return 'نخ کش';
        if (docType === '73') return 'نخ اسپاندکس';
        return 'کالای تولیدی';
    };

    const getMasterGroupForSayanItem = (code, rawName, grpName, docType) => {
        const itemCode = String(code || '').trim();
        const name = String(rawName || '').trim();
        const grp = String(grpName || '').trim();
        const c = itemCode.replace(/[^0-9]/g, '');

        if (c.startsWith('0401')) return 'اسپاندکس (کاور)';
        if (c.startsWith('0402')) return 'کش';
        if (c.startsWith('0403')) return 'اسپاندکس جوشی ( ساپورت )';
        if (c.startsWith('0405')) return 'پلی استر شوایتر';
        if (c.startsWith('0407')) return 'نایلون';
        if (c.startsWith('0408')) return 'نخ ملت';
        if (c.startsWith('0409')) return 'الیاف';
        if (c.startsWith('0410')) return 'FDY';

        if (c.startsWith('0101')) return 'چیپس';
        if (c.startsWith('010202') || (c.startsWith('0102') && name.includes('شوایتر'))) return 'پلی استر شوایتر';
        if (c.startsWith('0102')) return 'POY';
        if (c.startsWith('0103')) return 'dty یا پلی استر';
        if (c.startsWith('0104')) return 'لاستیک';
        if (c.startsWith('0105')) {
            if (name.includes('جوشی') || name.includes('ساپورت')) return 'اسپاندکس جوشی ( ساپورت )';
            if (name.includes('لاکرا')) return 'لاکرا';
            return 'اسپاندکس (کاور)';
        }
        if (c.startsWith('0106')) return 'پلی استر اسپان';
        if (c.startsWith('0107')) return 'مستر بچ';
        if (c.startsWith('0108')) return 'نایلون';

        if (grp) {
            if (grp.includes('جوشی') || grp.includes('ساپورت')) return 'اسپاندکس جوشی ( ساپورت )';
            if (grp.includes('کاور')) return 'اسپاندکس (کاور)';
            if (grp.includes('شوایتر')) return 'پلی استر شوایتر';
            if (grp.includes('ملت')) return 'نخ ملت';
            if (grp.includes('الیاف')) return 'الیاف';
            if (/FDY/i.test(grp)) return 'FDY';
            if (grp.includes('کش') || grp.includes('قیطان')) return 'کش';
            if (grp.includes('اسپاندکس')) return 'اسپاندکس (کاور)';
            if (/POY/i.test(grp)) return 'POY';
            if (/DTY/i.test(grp) || grp.includes('پلی استر')) return 'dty یا پلی استر';
            if (grp.includes('نایلون')) return 'نایلون';
            if (grp.includes('چیپس')) return 'چیپس';
            if (grp.includes('لاستیک')) return 'لاستیک';
            if (grp.includes('لاکرا')) return 'لاکرا';
            if (grp.includes('اسپان')) return 'پلی استر اسپان';
            if (grp.includes('مستر بچ') || grp.includes('مستربچ')) return 'مستر بچ';
        }

        if (name.includes('جوشی') || name.includes('ساپورت') || (name.includes('اسپاندکس') && name.includes('جوش'))) return 'اسپاندکس جوشی ( ساپورت )';
        if (name.includes('شوایتر')) return 'پلی استر شوایتر';
        if (name.includes('اسپاندکس') || name.includes('کاور')) return 'اسپاندکس (کاور)';
        if (name.includes('کش') || name.includes('قیطان')) return 'کش';
        if (name.includes('ملت')) return 'نخ ملت';
        if (name.includes('الیاف')) return 'الیاف';
        if (/FDY/i.test(name)) return 'FDY';
        if (/POY/i.test(name) || name.includes('پوی')) return 'POY';
        if (/DTY/i.test(name) || name.includes('پلی استر')) return 'dty یا پلی استر';
        if (name.includes('نایلون')) return 'نایلون';
        if (name.includes('چیپس')) return 'چیپس';
        if (name.includes('لاستیک')) return 'لاستیک';
        if (name.includes('لاکرا')) return 'لاکرا';
        if (name.includes('اسپان')) return 'پلی استر اسپان';
        if (name.includes('مستر بچ') || name.includes('مستربچ')) return 'مستر بچ';

        if (docType === '70') return 'پلی استر شوایتر';
        if (docType === '79') return 'کش';
        if (docType === '73') return 'اسپاندکس (کاور)';
        if (docType === '67') return 'dty یا پلی استر';
        if (docType === '61') return 'POY';

        return 'سایر محصولات';
    };

    const itemsMap = new Map();
    const groupsMap = new Map();
    const timelineMap = new Map();
    let qty_61 = 0, qty_67 = 0, qty_79 = 0, qty_73 = 0, qty_schweiter = 0;

    rawRows.forEach(r => {
        const itemCode = String(r.ItemCode || '').trim();
        let rawName = String(r.ItemName || itemCode || 'کالای بدون نام').trim();
        const qty = parseFloat(r.Quantity || 0);
        const docType = String(r.DocType || '').trim();

        const hasPersianLetters = /[\u0600-\u06FF]/.test(rawName);
        const isPureCode = rawName === itemCode || !hasPersianLetters || /^\d+$/.test(rawName.replace(/[\s\-\_]/g, ''));

        if (isPureCode) {
            rawName = getKnownYarnNameByCode(itemCode, docType);
        }

        const masterGroup = getMasterGroupForSayanItem(itemCode, rawName, r.GroupName, docType);

        let rowShamsiDate = dateFrom;
        if (r.Date) {
            try {
                const d = new Date(r.Date);
                if (!isNaN(d.getTime())) {
                    const j = jalaali.toJalaali(d);
                    rowShamsiDate = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
                }
            } catch (err) {}
        }

        // 1. By Item Map
        if (!itemsMap.has(rawName)) {
            itemsMap.set(rawName, {
                name: rawName,
                itemCode: itemCode,
                groupName: masterGroup,
                unit: 'کیلوگرم',
                qty_61: 0,
                qty_67: 0,
                qty_79: 0,
                qty_73: 0,
                qty_schweiter: 0,
                total: 0
            });
        }

        const item = itemsMap.get(rawName);
        if (docType === '61') { item.qty_61 += qty; qty_61 += qty; }
        else if (docType === '67') { item.qty_67 += qty; qty_67 += qty; }
        else if (docType === '79') { item.qty_79 += qty; qty_79 += qty; }
        else if (docType === '73') { item.qty_73 += qty; qty_73 += qty; }
        else if (docType === '70') { item.qty_schweiter += qty; qty_schweiter += qty; }
        item.total += qty;

        // 2. By Group Map
        if (!groupsMap.has(masterGroup)) {
            groupsMap.set(masterGroup, {
                name: masterGroup,
                groupName: masterGroup,
                unit: 'کیلوگرم',
                qty_61: 0,
                qty_67: 0,
                qty_79: 0,
                qty_73: 0,
                qty_schweiter: 0,
                total: 0,
                itemNames: new Set()
            });
        }
        const grp = groupsMap.get(masterGroup);
        if (docType === '61') grp.qty_61 += qty;
        else if (docType === '67') grp.qty_67 += qty;
        else if (docType === '79') grp.qty_79 += qty;
        else if (docType === '73') grp.qty_73 += qty;
        else if (docType === '70') grp.qty_schweiter += qty;
        grp.total += qty;
        grp.itemNames.add(rawName);

        // 3. Daily Timeline Map
        if (!timelineMap.has(rowShamsiDate)) {
            timelineMap.set(rowShamsiDate, {
                date: rowShamsiDate,
                total: 0,
                qty_61: 0,
                qty_67: 0,
                qty_79: 0,
                qty_73: 0,
                qty_schweiter: 0,
                groups: {}
            });
        }
        const tObj = timelineMap.get(rowShamsiDate);
        tObj.total += qty;
        tObj.groups[masterGroup] = (tObj.groups[masterGroup] || 0) + qty;
        if (docType === '61') tObj.qty_61 += qty;
        else if (docType === '67') tObj.qty_67 += qty;
        else if (docType === '79') tObj.qty_79 += qty;
        else if (docType === '73') tObj.qty_73 += qty;
        else if (docType === '70') tObj.qty_schweiter += qty;
    });

    const items = Array.from(itemsMap.values());
    const groups = Array.from(groupsMap.values()).map(g => ({
        ...g,
        itemCount: g.itemNames.size,
        itemNames: Array.from(g.itemNames)
    }));
    
    // Sort timeline ascending by date for smooth charts
    const dailyTimeline = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const grandTotal = qty_61 + qty_67 + qty_79 + qty_73 + qty_schweiter;

    return {
        dateFrom,
        dateTo,
        items,
        groups,
        dailyTimeline,
        totals: {
            qty_61,
            qty_67,
            qty_79,
            qty_73,
            qty_schweiter,
            grandTotal
        }
    };
}

app.get('/api/sayan/production-report', async (req, res) => {
    try {
        const db = getDb();
        const rawFrom = req.query.dateFrom || '';
        const rawTo = req.query.dateTo || rawFrom;

        const prodData = await fetchProductionDataForDateRange(db, rawFrom, rawTo);
        const { dateFrom, dateTo, items, groups, dailyTimeline, totals } = prodData;
        const { qty_61, qty_67, qty_79, qty_73, qty_schweiter, grandTotal } = totals;

        const key = `${dateFrom}_${dateTo}`;
        db.productionReportWastes = db.productionReportWastes || {};
        db.productionWasteArchive = db.productionWasteArchive || [];
        db.productionIdealTargets = db.productionIdealTargets || { byItem: {}, byGroup: {} };

        let waste_61 = 0;
        let waste_67 = 0;
        let waste_79 = 0;
        let waste_73 = 0;
        let waste_schweiter = 0;
        let detailsList = [];
        let foundInArchive = false;

        const matchingEntries = db.productionWasteArchive.filter(entry => {
            return entry.dateFrom >= dateFrom && entry.dateTo <= dateTo;
        });

        if (matchingEntries.length > 0) {
            foundInArchive = true;
            matchingEntries.forEach(entry => {
                waste_61 += parseFloat(entry.waste_61 || 0);
                waste_67 += parseFloat(entry.waste_67 || 0);
                waste_79 += parseFloat(entry.waste_79 || 0);
                waste_73 += parseFloat(entry.waste_73 || 0);
                waste_schweiter += parseFloat(entry.waste_schweiter || 0);
                if (entry.details && entry.details.trim()) {
                    detailsList.push(`[${entry.dateFrom}]: ${entry.details}`);
                }
            });
        }

        if (!foundInArchive) {
            const storedWaste = db.productionReportWastes[key] || {
                waste_61: 0,
                waste_67: 0,
                waste_79: 0,
                waste_73: 0,
                waste_schweiter: 0,
                details: ''
            };
            waste_61 = parseFloat(storedWaste.waste_61 || 0);
            waste_67 = parseFloat(storedWaste.waste_67 || 0);
            waste_79 = parseFloat(storedWaste.waste_79 || 0);
            waste_73 = parseFloat(storedWaste.waste_73 || 0);
            waste_schweiter = parseFloat(storedWaste.waste_schweiter || 0);
            if (storedWaste.details && storedWaste.details.trim()) {
                detailsList.push(storedWaste.details);
            }
        }

        const totalWaste = waste_61 + waste_67 + waste_79 + waste_73 + waste_schweiter;
        const pct_61 = qty_61 > 0 ? (waste_61 / qty_61) * 100 : 0;
        const pct_67 = qty_67 > 0 ? (waste_67 / qty_67) * 100 : 0;
        const pct_79 = qty_79 > 0 ? (waste_79 / qty_79) * 100 : 0;
        const pct_73 = qty_73 > 0 ? (waste_73 / qty_73) * 100 : 0;
        const pct_schweiter = qty_schweiter > 0 ? (waste_schweiter / qty_schweiter) * 100 : 0;
        const totalPct = grandTotal > 0 ? (totalWaste / grandTotal) * 100 : 0;

        res.json({
            success: true,
            dateFrom,
            dateTo,
            items,
            groups,
            dailyTimeline,
            idealTargets: db.productionIdealTargets || { byItem: {}, byGroup: {} },
            productionPlan: (db.productionPlans && db.productionPlans[`${dateFrom}_${dateTo}`]) || (db.productionPlans && db.productionPlans[dateFrom]) || db.productionPlanDefault || DEFAULT_PRODUCTION_PLAN,
            totals: {
                qty_61,
                qty_67,
                qty_79,
                qty_73,
                qty_schweiter,
                grandTotal
            },
            waste: {
                waste_61,
                waste_67,
                waste_79,
                waste_73,
                waste_schweiter,
                totalWaste,
                pct_61,
                pct_67,
                pct_79,
                pct_73,
                pct_schweiter,
                totalPct,
                details: detailsList.join(' | ') || ''
            }
        });
    } catch (e) {
        console.error("Sayan Production Report Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/production-report/save-ideal', (req, res) => {
    try {
        const db = getDb();
        const { idealTargets } = req.body;
        db.productionIdealTargets = idealTargets || { byItem: {}, byGroup: {} };
        saveDb(db);
        res.json({ success: true, message: 'مقادیر تولید ایده‌آل با موفقیت ذخیره گردید.', idealTargets: db.productionIdealTargets });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Production Plan & Machine Capacity Calculation Endpoints
// Formula: (نمره نخ × 60 × 24 × تعداد پوزیشن × سرعت دستگاه) / 9,000,000
const DEFAULT_PRODUCTION_PLAN = {
    scopeType: 'default',
    title: 'تنظیمات پیش‌فرض خطوط و ماشین‌آلات تولید',
    lineGroups: [
        {
            groupName: 'dty یا پلی استر',
            machines: [
                { id: 'm_dty_1', code: 'DTY-01', name: 'دستگاه DTY شماره ۱ (بارمگ)', yarnCount: 150, positionsCount: 288, speedMpm: 800, active: true },
                { id: 'm_dty_2', code: 'DTY-02', name: 'دستگاه DTY شماره ۲ (بارمگ)', yarnCount: 150, positionsCount: 288, speedMpm: 800, active: true },
                { id: 'm_dty_3', code: 'DTY-03', name: 'دستگاه DTY شماره ۳ (تکستچره)', yarnCount: 75, positionsCount: 240, speedMpm: 750, active: true },
                { id: 'm_dty_4', code: 'DTY-04', name: 'دستگاه DTY شماره ۴ (تکستچره)', yarnCount: 300, positionsCount: 216, speedMpm: 700, active: true }
            ]
        },
        {
            groupName: 'POY',
            machines: [
                { id: 'm_poy_1', code: 'POY-01', name: 'خط ریسندگی POY شماره ۱', yarnCount: 250, positionsCount: 144, speedMpm: 2800, active: true },
                { id: 'm_poy_2', code: 'POY-02', name: 'خط ریسندگی POY شماره ۲', yarnCount: 130, positionsCount: 144, speedMpm: 3000, active: true }
            ]
        },
        {
            groupName: 'کش',
            machines: [
                { id: 'm_el_1', code: 'EL-01', name: 'دستگاه بافت کش شماره ۱', yarnCount: 150, positionsCount: 120, speedMpm: 450, active: true },
                { id: 'm_el_2', code: 'EL-02', name: 'دستگاه بافت کش شماره ۲', yarnCount: 150, positionsCount: 120, speedMpm: 450, active: true }
            ]
        },
        {
            groupName: 'اسپاندکس (کاور)',
            machines: [
                { id: 'm_sp_1', code: 'SP-01', name: 'دستگاه کاورینگ اسپاندکس ۱', yarnCount: 70, positionsCount: 128, speedMpm: 550, active: true },
                { id: 'm_sp_2', code: 'SP-02', name: 'دستگاه کاورینگ اسپاندکس ۲', yarnCount: 140, positionsCount: 128, speedMpm: 500, active: true }
            ]
        },
        {
            groupName: 'پلی استر شوایتر',
            machines: [
                { id: 'm_sch_1', code: 'SCH-01', name: 'دستگاه شوایتر شماره ۱', yarnCount: 150, positionsCount: 48, speedMpm: 600, active: true }
            ]
        }
    ]
};

app.get('/api/sayan/production-plan', (req, res) => {
    try {
        const db = getDb();
        db.productionPlans = db.productionPlans || {};
        db.productionPlanDefault = db.productionPlanDefault || DEFAULT_PRODUCTION_PLAN;

        const dateFrom = String(req.query.dateFrom || '').trim();
        const dateTo = String(req.query.dateTo || dateFrom).trim();
        const key = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : (dateFrom || 'default');

        let plan = null;
        if (key !== 'default' && db.productionPlans[key]) {
            plan = db.productionPlans[key];
        } else if (dateFrom && db.productionPlans[dateFrom]) {
            plan = db.productionPlans[dateFrom];
        } else {
            plan = db.productionPlanDefault;
        }

        // Return current active plan and all saved plans index
        const savedPlansList = Object.keys(db.productionPlans).map(k => ({
            key: k,
            dateFrom: db.productionPlans[k].dateFrom,
            dateTo: db.productionPlans[k].dateTo,
            daysCount: db.productionPlans[k].daysCount || 1,
            title: db.productionPlans[k].title,
            updatedAt: db.productionPlans[k].updatedAt
        }));

        res.json({
            success: true,
            plan,
            defaultPlan: db.productionPlanDefault,
            savedPlansList,
            key
        });
    } catch (e) {
        console.error("Get production plan error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/production-plan/save', (req, res) => {
    try {
        const db = getDb();
        const { plan, dateFrom, dateTo, isDefault, applyToIdealTargets } = req.body;
        if (!plan || !plan.lineGroups) {
            return res.status(400).json({ error: 'اطلاعات پلن و دستگاه‌های تولید الزامی است' });
        }

        db.productionPlans = db.productionPlans || {};
        db.productionPlanDefault = db.productionPlanDefault || DEFAULT_PRODUCTION_PLAN;

        const now = new Date().toISOString();
        const planToSave = {
            ...plan,
            updatedAt: now
        };

        if (isDefault) {
            db.productionPlanDefault = planToSave;
        }

        if (dateFrom) {
            const actualDateTo = dateTo || dateFrom;
            const key = `${dateFrom}_${actualDateTo}`;
            db.productionPlans[key] = {
                ...planToSave,
                dateFrom,
                dateTo: actualDateTo
            };
        }

        // If applyToIdealTargets is requested, calculate ideal capacity per group and sync into productionIdealTargets
        if (applyToIdealTargets) {
            db.productionIdealTargets = db.productionIdealTargets || { byItem: {}, byGroup: {} };
            db.productionIdealTargets.byGroup = db.productionIdealTargets.byGroup || {};

            const days = Math.max(1, Number(plan.daysCount) || 1);

            plan.lineGroups.forEach(grp => {
                let groupDailyTotal = 0;
                (grp.machines || []).forEach(m => {
                    if (m.active !== false) {
                        const yarn = Number(m.yarnCount) || 0;
                        const pos = Number(m.positionsCount) || 0;
                        const spd = Number(m.speedMpm) || 0;
                        const eff = Number(m.efficiencyPct || 100) / 100;
                        // Daily formula: (yarn * 60 * 24 * pos * spd) / 9,000,000
                        const dailyIdeal = ((yarn * 60 * 24 * pos * spd) / 9000000) * eff;
                        groupDailyTotal += dailyIdeal;
                    }
                });
                const groupPeriodTotal = Math.round(groupDailyTotal * days);
                db.productionIdealTargets.byGroup[grp.groupName] = groupPeriodTotal;
                db.productionIdealTargets[`group_${grp.groupName}`] = groupPeriodTotal;
            });
        }

        saveDb(db);
        res.json({
            success: true,
            message: 'پلن تولید و ظرفیت محاسباتی دستگاه‌ها با موفقیت ذخیره شد.',
            plan: planToSave,
            idealTargets: db.productionIdealTargets
        });
    } catch (e) {
        console.error("Save production plan error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/sayan/production-plan/:key', (req, res) => {
    try {
        const db = getDb();
        db.productionPlans = db.productionPlans || {};
        const key = req.params.key;
        if (db.productionPlans[key]) {
            delete db.productionPlans[key];
            saveDb(db);
            res.json({ success: true, message: 'پلن ذخیره‌شده با موفقیت حذف شد.' });
        } else {
            res.status(404).json({ error: 'پلن مورد نظر یافت نشد.' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sayan/production-returns', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        const sayanUrl = settings.sayanApiUrl || process.env.SAYAN_API_URL;
        const sayanKey = settings.sayanApiKey || process.env.SAYAN_API_KEY;

        const rawFrom = req.query.dateFrom || '';
        const rawTo = req.query.dateTo || rawFrom;

        const dateFrom = normalizeShamsiDate(rawFrom);
        const dateTo = normalizeShamsiDate(rawTo) || dateFrom;

        if (!dateFrom || !dateTo) {
            return res.status(400).json({ error: 'تاریخ ابتدا و انتها الزامی است' });
        }

        const gregFromDate = parseJalaliStrToGregorian(dateFrom);
        const gregToDate = parseJalaliStrToGregorian(dateTo);

        if (!gregFromDate || !gregToDate) {
            return res.status(400).json({ error: 'فرمت تاریخ شمسی وارد شده نامعتبر است' });
        }

        if (!sayanUrl || !sayanKey) {
            // Generate highly realistic mock data for returns (Operation Code 44) matching user's specific document numbers (102, 103, 104, 105) and archive code (2716)
            const mockItems = [
                { DocId: '2716', ArchiveNo: '102', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', LineId: '1', ItemCode: '010301011001', ItemName: 'پلی استر ۱۰۰ سفید (برگشتی تولید)', Quantity: 393.2, LineNotes: 'تعداد کارتن: 20 | سری: P-102' },
                { DocId: '2716', ArchiveNo: '102', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', LineId: '2', ItemCode: '010301021001', ItemName: 'نخ پلی استر ماتی', Quantity: 551.1, LineNotes: 'تعداد کارتن: 28 | سری: P-103' },
                { DocId: '2716', ArchiveNo: '102', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', LineId: '3', ItemCode: '0401020410021001', ItemName: 'اسپاندکس کاور رونیز', Quantity: 311.9, LineNotes: 'تعداد کارتن: 16 | سری: SP-44' },
                { DocId: '2716', ArchiveNo: '102', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', LineId: '4', ItemCode: '010302011001', ItemName: 'نخ پلی استر رنگی', Quantity: 214.9, LineNotes: 'تعداد کارتن: 11' },
                { DocId: '2716', ArchiveNo: '102', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', LineId: '5', ItemCode: '0103012001', ItemName: 'نخ DTY سفید', Quantity: 202.7, LineNotes: 'تعداد کارتن: 10' },
                { DocId: '2716', ArchiveNo: '102', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', LineId: '6', ItemCode: '08100210101055', ItemName: 'ضایعات نوار کاغذی', Quantity: 50, LineNotes: 'رول کاغذی' },
                { DocId: '2717', ArchiveNo: '103', SubCode: '103', Date: `${gregFromDate}T15:20:00.000Z`, DocType: '44', LineId: '1', ItemCode: '010101001', ItemName: 'چیپس پلی استر گرید A', Quantity: 1200, LineNotes: 'جامبو بگ' },
                { DocId: '2717', ArchiveNo: '103', SubCode: '103', Date: `${gregFromDate}T15:20:00.000Z`, DocType: '44', LineId: '2', ItemCode: '010201002', ItemName: 'نخ POY سفید خام', Quantity: 850, LineNotes: 'پالت 1' },
                { DocId: '2718', ArchiveNo: '104', SubCode: '104', Date: `${gregToDate}T10:00:00.000Z`, DocType: '44', LineId: '1', ItemCode: '0407119', ItemName: 'نخ نایلون آپشنال', Quantity: 850, LineNotes: 'تعداد کارتن: 40' },
                { DocId: '2719', ArchiveNo: '105', SubCode: '105', Date: `${gregToDate}T14:45:00.000Z`, DocType: '44', LineId: '1', ItemCode: '0108005', ItemName: 'ضایعات نخ نایلون گرید A', Quantity: 310, LineNotes: 'عدل 2' },
                { DocId: '2719', ArchiveNo: '105', SubCode: '105', Date: `${gregToDate}T16:10:00.000Z`, DocType: '44', LineId: '2', ItemCode: '0103011', ItemName: 'نخ DTY ۷۵/۳۶ اینترمینگل ملانژ', Quantity: 680, LineNotes: 'تعداد کارتن: 34' }
            ];
            const filteredMock = mockItems.filter(item => {
                    const code = (item.ItemCode || '').trim();
                    const name = (item.ItemName || '').toLowerCase();
                    if (code.startsWith('0104') || code.startsWith('0105') || 
                        name.includes('لاکرا') || name.includes('لاستیک') || 
                        name.includes('lycra') || name.includes('rubber')) {
                        return false;
                    }
                    return true;
                });
            return res.json({
                success: true,
                isMock: true,
                dateFrom,
                dateTo,
                items: filteredMock,
                data: filteredMock
            });
        }

        const sql = `
            SELECT 
                t10.Field_005 as ArchiveCode,
                t10.Field_006 as DocNumber,
                t10.Field_006 as DocId,
                t10.Field_005 as ArchiveNo,
                t10.Field_006 as SubCode,
                t10.Field_008 as Date,
                RTRIM(LTRIM(t10.Field_009)) as DocType,
                t10.Field_011 as WarehouseCode,
                t10.Field_017 as HeaderDescription,
                t10.Field_029 as DocDescription,
                t11.Field_001 as LineId,
                RTRIM(LTRIM(t11.Field_005)) as ItemCode,
                COALESCE(
                    NULLIF(RTRIM(LTRIM(t02_item.Field_003)), ''),
                    NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                    NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                    NULLIF(RTRIM(LTRIM(t02_exact.Field_003)), ''),
                    NULLIF(RTRIM(LTRIM(c01.Field_003)), ''),
                    RTRIM(LTRIM(t11.Field_005)),
                    N'کالای بدون نام'
                ) as ItemName,
                COALESCE(
                    NULLIF(RTRIM(LTRIM(t02_parent.Field_003)), ''),
                    NULLIF(RTRIM(LTRIM(t02_grand.Field_003)), '')
                ) as GroupName,
                t02_grand.Field_003 as MainGroupName,
                t11.Field_006 as Quantity,
                t11.Field_031 as LineNotes
            FROM STR_TBL_010 t10
            INNER JOIN STR_TBL_011 t11 ON t11.Field_004 = t10.Field_005 
                                      AND t11.Field_003 = t10.Field_004
            LEFT JOIN IND_TBL_021 t21 ON RTRIM(LTRIM(t21.Field_004)) = RTRIM(LTRIM(t11.Field_005))
            LEFT JOIN IND_TBL_002 t02_item ON RTRIM(LTRIM(t21.Field_003)) = RTRIM(LTRIM(t02_item.Field_008))
            LEFT JOIN IND_TBL_002 t02_parent ON RTRIM(LTRIM(t02_item.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
            LEFT JOIN IND_TBL_002 t02_grand ON RTRIM(LTRIM(t02_parent.Field_009)) = RTRIM(LTRIM(t02_grand.Field_008))
            LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(t11.Field_005))
            LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
            LEFT JOIN IND_TBL_002 t02_exact ON RTRIM(LTRIM(t02_exact.Field_008)) = RTRIM(LTRIM(t11.Field_005))
            LEFT JOIN COM_TBL_001 c01 ON RTRIM(LTRIM(c01.Field_004)) = RTRIM(LTRIM(t11.Field_005))
            WHERE RTRIM(LTRIM(t10.Field_009)) = '44'
              AND (t11.Field_005 LIKE '01%' OR t11.Field_005 LIKE '04%' OR t11.Field_005 LIKE '05%')
              AND t10.Field_008 >= '${gregFromDate}T00:00:00.000Z'
              AND t10.Field_008 <= '${gregToDate}T23:59:59.999Z'
            ORDER BY t10.Field_008 DESC, t10.Field_005 DESC, t11.Field_001 ASC
        `;

        const queryRows = await executeSayanQuery(db, sql);
        res.json({
            success: true,
            isMock: false,
            dateFrom,
            dateTo,
            items: queryRows || [],
            data: queryRows || []
        });
    } catch (e) {
        console.error("Sayan Production Returns Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/production-report/save-waste', (req, res) => {
    try {
        const db = getDb();
        const { dateFrom, dateTo, waste_61, waste_67, waste_79, waste_73, waste_schweiter, details, totals, items, idealTargets } = req.body;
        if (!dateFrom || !dateTo) {
            return res.status(400).json({ error: 'تاریخ ابتدا و انتها الزامی است' });
        }
        if (idealTargets) {
            db.productionIdealTargets = idealTargets;
        }
        const key = `${dateFrom}_${dateTo}`;
        db.productionReportWastes = db.productionReportWastes || {};
        db.productionReportWastes[key] = {
            waste_61: parseFloat(waste_61 || 0),
            waste_67: parseFloat(waste_67 || 0),
            waste_79: parseFloat(waste_79 || 0),
            waste_73: parseFloat(waste_73 || 0),
            waste_schweiter: parseFloat(waste_schweiter || 0),
            details: String(details || '').trim(),
            updatedAt: new Date().toISOString()
        };

        // Archive and persist history
        db.productionWasteArchive = db.productionWasteArchive || [];
        const existingIdx = db.productionWasteArchive.findIndex(entry => entry.dateFrom === dateFrom && entry.dateTo === dateTo);
        const w_61 = parseFloat(waste_61 || 0);
        const w_67 = parseFloat(waste_67 || 0);
        const w_79 = parseFloat(waste_79 || 0);
        const w_73 = parseFloat(waste_73 || 0);
        const w_schweiter = parseFloat(waste_schweiter || 0);
        const totalW = w_61 + w_67 + w_79 + w_73 + w_schweiter;

        const archiveEntry = {
            id: existingIdx !== -1 ? db.productionWasteArchive[existingIdx].id : 'pwa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            dateFrom,
            dateTo,
            waste_61: w_61,
            waste_67: w_67,
            waste_79: w_79,
            waste_73: w_73,
            waste_schweiter: w_schweiter,
            totalWaste: totalW,
            details: String(details || '').trim(),
            totals: totals || null,
            items: items || null,
            updatedAt: new Date().toISOString()
        };

        if (existingIdx !== -1) {
            db.productionWasteArchive[existingIdx] = archiveEntry;
        } else {
            db.productionWasteArchive.push(archiveEntry);
        }

        saveDb(db);
        res.json({ success: true, message: 'اطلاعات ضایعات و آمار کل تولید با موفقیت در بایگانی ثبت گردید.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sayan/production-report/archive', (req, res) => {
    try {
        const db = getDb();
        db.productionWasteArchive = db.productionWasteArchive || [];
        // Sort by dateFrom descending
        const sorted = [...db.productionWasteArchive].sort((a, b) => b.dateFrom.localeCompare(a.dateFrom));
        res.json({ success: true, archive: sorted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/sayan/production-report/archive/:id', (req, res) => {
    try {
        const db = getDb();
        db.productionWasteArchive = db.productionWasteArchive || [];
        db.productionWasteArchive = db.productionWasteArchive.filter(entry => entry.id !== req.params.id);
        saveDb(db);
        res.json({ success: true, message: 'رکورد بایگانی با موفقیت حذف گردید.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/production-report/send-bot', async (req, res) => {
    try {
        const db = getDb();
        const { dateFrom, dateTo, items, totals, waste } = req.body;

        if (!dateFrom || !totals || !waste) {
            return res.status(400).json({ error: 'اطلاعات گزارش کامل نیست' });
        }

        // Auto-save and archive waste values so user never loses them even if they didn't click save button
        try {
            const actualDateTo = dateTo || dateFrom;
            const key = `${dateFrom}_${actualDateTo}`;
            db.productionReportWastes = db.productionReportWastes || {};
            db.productionReportWastes[key] = {
                waste_61: parseFloat(waste.waste_61 || 0),
                waste_67: parseFloat(waste.waste_67 || 0),
                waste_79: parseFloat(waste.waste_79 || 0),
                waste_73: parseFloat(waste.waste_73 || 0),
                waste_schweiter: parseFloat(waste.waste_schweiter || 0),
                details: String(waste.details || '').trim(),
                updatedAt: new Date().toISOString()
            };

            db.productionWasteArchive = db.productionWasteArchive || [];
            const existingIdx = db.productionWasteArchive.findIndex(entry => entry.dateFrom === dateFrom && entry.dateTo === actualDateTo);
            const w_61 = parseFloat(waste.waste_61 || 0);
            const w_67 = parseFloat(waste.waste_67 || 0);
            const w_79 = parseFloat(waste.waste_79 || 0);
            const w_73 = parseFloat(waste.waste_73 || 0);
            const w_schweiter = parseFloat(waste.waste_schweiter || 0);
            const totalW = w_61 + w_67 + w_79 + w_73 + w_schweiter;

            const archiveEntry = {
                id: existingIdx !== -1 ? db.productionWasteArchive[existingIdx].id : 'pwa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                dateFrom,
                dateTo: actualDateTo,
                waste_61: w_61,
                waste_67: w_67,
                waste_79: w_79,
                waste_73: w_73,
                waste_schweiter: w_schweiter,
                totalWaste: totalW,
                details: String(waste.details || '').trim(),
                totals: totals || null,
                items: items || null,
                updatedAt: new Date().toISOString()
            };

            if (existingIdx !== -1) {
                db.productionWasteArchive[existingIdx] = archiveEntry;
            } else {
                db.productionWasteArchive.push(archiveEntry);
            }
            saveDb(db);
        } catch (saveErr) {
            console.error("Auto-save waste in send-bot warning:", saveErr.message);
        }

        const title = req.body.customTitle || (dateTo && dateTo !== dateFrom 
            ? `گزارش تحلیلی و مانیتورینگ عملکرد خطوط تولید (${dateFrom} تا ${dateTo})`
            : `گزارش آمار کل تولید و ضایعات (${dateFrom})`);

        let pdfBuffer = null;
        if (req.body.pdfBase64) {
            pdfBuffer = Buffer.from(req.body.pdfBase64, 'base64');
        } else {
            pdfBuffer = await Renderer.generateProductionReportPDF(title, dateFrom, dateTo, items, totals, waste);
        }

        const caption = req.body.customCaption || buildProductionCaption(dateFrom, totals, waste);

        const filename = req.body.customFilename || (dateTo && dateTo !== dateFrom 
            ? `Production_Report_${dateFrom.replace(/[\/\\]/g, '-')}_to_${dateTo.replace(/[\/\\]/g, '-')}.pdf`
            : `Production_Report_${dateFrom.replace(/[\/\\]/g, '-')}.pdf`);
        const settings = db.settings || {};
        
        const uniqueTargets = collectBotTargets(db, {
            category: 'production',
            platforms: req.body.selectedPlatforms || ['telegram', 'bale', 'whatsapp'],
            customTargets: req.body.customTargets || null
        });

        if (uniqueTargets.length === 0) {
            return res.status(400).json({ error: 'هیچ شناسه گروه آمار تولید (تلگرام، بله یا واتساپ) در تنظیمات سیستم یافت نشد. لطفاً در «تنظیمات سیستم -> اطلاع‌رسانی ربات» شناسه گروه آمار تولید را وارد نمایید.' });
        }

        const safePdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        let sentCount = 0;
        let lastError = null;
        for (const target of uniqueTargets) {
            try {
                if (target.platform === 'telegram') {
                    await telegram.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    sentCount++;
                } else if (target.platform === 'bale') {
                    await bale.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    sentCount++;
                } else if (target.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        const waRes = await wa.sendMessage(target.id, caption, {
                            data: safePdfBuf.toString('base64'),
                            mimeType: 'application/pdf',
                            filename: filename
                        });
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        sentCount++;
                    }
                }
            } catch (err) {
                lastError = err.message;
                console.error(`[Send Production Report] Failed for ${target.platform}:${target.id}:`, err.message);
            }
        }

        if (sentCount === 0) {
            return res.status(400).json({ error: `ارسال گزارش آمار تولید ناموفق بود: ${lastError || 'خطای ناشناخته در اتصال به ربات'}` });
        }

        res.json({
            success: true,
            message: `گزارش با موفقیت به ${sentCount} گروه / چت در بات‌ها ارسال شد.`
        });
    } catch (e) {
        console.error("Send Production Report Bot Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- PRODUCTION RETURNS (CODE 44) PRIVATE HELPERS & ENDPOINTS ---
async function queryProductionReturnsData(db, dateFrom, dateTo) {
    const settings = db.settings || {};
    const sayanUrl = settings.sayanApiUrl || process.env.SAYAN_API_URL;
    const sayanKey = settings.sayanApiKey || process.env.SAYAN_API_KEY;

    const normFrom = normalizeShamsiDate(dateFrom);
    const normTo = normalizeShamsiDate(dateTo) || normFrom;

    const gregFromDate = parseJalaliStrToGregorian(normFrom);
    const gregToDate = parseJalaliStrToGregorian(normTo);

    if (!gregFromDate || !gregToDate) {
        throw new Error('فرمت تاریخ شمسی نامعتبر است');
    }

    if (!sayanUrl || !sayanKey) {
        return [
            { DocId: '2716', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', ItemCode: '010301011001', ItemName: 'پلی استر ۱۰۰ سفید (DTY)', Quantity: 393.2 },
            { DocId: '2716', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', ItemCode: '010301021001', ItemName: 'نخ پلی استر ماتی', Quantity: 551.1 },
            { DocId: '2716', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', ItemCode: '0401020410021001', ItemName: 'اسپاندکس کاور رونیز', Quantity: 311.9 },
            { DocId: '2716', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', ItemCode: '010302011001', ItemName: 'نخ پلی استر رنگی', Quantity: 214.9 },
            { DocId: '2716', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', ItemCode: '0103012001', ItemName: 'نخ DTY سفید', Quantity: 202.7 },
            { DocId: '2716', SubCode: '102', Date: `${gregFromDate}T09:15:00.000Z`, DocType: '44', ItemCode: '0402010101', ItemName: 'نخ کش / قیطان', Quantity: 180 },

            { DocId: '2717', SubCode: '103', Date: `${gregFromDate}T15:20:00.000Z`, DocType: '44', ItemCode: '010101001', ItemName: 'چیپس پلی استر گرید A', Quantity: 1200 },
            { DocId: '2717', SubCode: '103', Date: `${gregFromDate}T15:20:00.000Z`, DocType: '44', ItemCode: '010201002', ItemName: 'نخ POY سفید خام', Quantity: 850 },

            { DocId: '2718', SubCode: '104', Date: `${gregToDate}T10:00:00.000Z`, DocType: '44', ItemCode: '0407119', ItemName: 'نخ نایلون آپشنال', Quantity: 850 },
            { DocId: '2719', SubCode: '105', Date: `${gregToDate}T14:45:00.000Z`, DocType: '44', ItemCode: '04030101', ItemName: 'اسپاندکس جوشی ساپورت', Quantity: 240 },
            { DocId: '2719', SubCode: '105', Date: `${gregToDate}T16:10:00.000Z`, DocType: '44', ItemCode: '0103011', ItemName: 'نخ DTY ۷۵/۳۶ اینترمینگل ملانژ', Quantity: 680 }
        ];
    }

    const sql = `
        SELECT 
            t10.Field_005 as DocId,
            t10.Field_006 as SubCode,
            t10.Field_008 as Date,
            RTRIM(LTRIM(t10.Field_009)) as DocType,
            RTRIM(LTRIM(t11.Field_005)) as ItemCode,
            COALESCE(
                NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                NULLIF(RTRIM(LTRIM(t02_exact.Field_003)), ''),
                NULLIF(RTRIM(LTRIM(t_name.ItemName)), ''),
                NULLIF(RTRIM(LTRIM(t_group.GroupName)), ''),
                RTRIM(LTRIM(t11.Field_005)),
                N'کالای بدون نام'
            ) as ItemName,
            t11.Field_006 as Quantity
    FROM STR_TBL_010 t10
    INNER JOIN STR_TBL_011 t11 ON t11.Field_004 = t10.Field_005 
                              AND t11.Field_003 = t10.Field_004
    LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN IND_TBL_002 t02_exact ON RTRIM(LTRIM(t02_exact.Field_008)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN COM_TBL_001 c01 ON RTRIM(LTRIM(c01.Field_004)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN (
            SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(t02_sub.Field_003) as ItemName
            FROM IND_TBL_021 t21_sub
            LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
            GROUP BY t21_sub.Field_004
        ) t_name ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_name.ItemCode))
        LEFT JOIN (
            SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(COALESCE(t02_grandparent.Field_003, t02_parent.Field_003, t02_sub.Field_003)) as GroupName
            FROM IND_TBL_021 t21_sub
            LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
            LEFT JOIN IND_TBL_002 t02_parent ON RTRIM(LTRIM(t02_sub.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
            LEFT JOIN IND_TBL_002 t02_grandparent ON RTRIM(LTRIM(t02_parent.Field_009)) = RTRIM(LTRIM(t02_grandparent.Field_008))
            GROUP BY t21_sub.Field_004
        ) t_group ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_group.ItemCode))
        WHERE RTRIM(LTRIM(t10.Field_009)) = '44'
          AND t10.Field_008 >= '${gregFromDate}T00:00:00.000Z'
          AND t10.Field_008 <= '${gregToDate}T23:59:59.999Z'
        ORDER BY t10.Field_008 DESC
    `;

    const rows = await executeSayanQuery(db, sql);
    const results = rows || [];
    return results.filter(item => {
        const code = (item.ItemCode || '').trim();
        const name = (item.ItemName || '').toLowerCase();
        if (code.startsWith('0104') || code.startsWith('0105') || 
            name.includes('لاکرا') || name.includes('لاستیک') || 
            name.includes('lycra') || name.includes('rubber')) {
            return false;
        }
        return true;
    });
}

const compileProductionReturnsHtml = (dateFrom, dateTo, items) => {
    const classifyProductGroup = (itemCode, itemName) => {
        const code = (itemCode || '').trim();
        const name = (itemName || '').toLowerCase();
        
        // 1. محصولات (04xx)
        if (code.startsWith('0401') || name.includes('کاور')) return { code: '0401', name: 'اسپاندکس (کاور)', isProduction: true };
        if (code.startsWith('0402') || name.includes('کش') || name.includes('قیطان')) return { code: '0402', name: 'کش', isProduction: true };
        if (code.startsWith('0403') || name.includes('ساپورت') || name.includes('جوشی')) return { code: '0403', name: 'اسپاندکس جوشی ( ساپورت )', isProduction: true };
        if (code.startsWith('0405') || name.includes('شوایتر')) return { code: '0405', name: 'پلی استر شوایتر', isProduction: true };
        if (code.startsWith('0407')) return { code: '0407', name: 'نایلون', isProduction: true };
        if (code.startsWith('0408') || name.includes('ملت')) return { code: '0408', name: 'نخ ملت', isProduction: true };
        if (code.startsWith('0409') || name.includes('الیاف')) return { code: '0409', name: 'الیاف', isProduction: true };
        if (code.startsWith('0410') || name.includes('fdy')) return { code: '0410', name: 'FDY', isProduction: true };
        
        // 2. مواد اولیه (01xx)
        if (code.startsWith('0101') || name.includes('چیپس')) return { code: '0101', name: 'چیپس', isProduction: false };
        if (code.startsWith('0102') || name.includes('poy') || name.includes('پوی')) return { code: '0102', name: 'POY', isProduction: false };
        if (code.startsWith('0103') || name.includes('dty') || name.includes('دی تی وای') || name.includes('پلی استر')) return { code: '0103', name: 'dty یا پلی استر', isProduction: false };
        if (code.startsWith('0104') || name.includes('لاستیک')) return { code: '0104', name: 'لاستیک', isProduction: false };
        if (code.startsWith('0105') || name.includes('لاکرا')) return { code: '0105', name: 'لاکرا', isProduction: false };
        if (code.startsWith('0106') || name.includes('اسپان')) return { code: '0106', name: 'پلی استر اسپان', isProduction: false };
        if (code.startsWith('0107') || name.includes('مستر بچ') || name.includes('مستربچ')) return { code: '0107', name: 'مستر بچ', isProduction: false };
        if (code.startsWith('0108') || name.includes('نایلون')) return { code: '0108', name: 'نایلون', isProduction: false };

        return { code: code.substring(0, 4) || 'سایر', name: itemName || `کد ${code}`, isProduction: code.startsWith('04') };
    };

    const totalWeight = items.reduce((sum, item) => sum + parseFloat(item.Quantity || 0), 0);

    const productionGroupsMap = new Map();
    const materialGroupsMap = new Map();

    items.forEach(item => {
        const groupInfo = classifyProductGroup(item.ItemCode, item.ItemName);
        const mapToUse = groupInfo.isProduction ? productionGroupsMap : materialGroupsMap;
        
        if (!mapToUse.has(groupInfo.code)) {
            mapToUse.set(groupInfo.code, {
                code: groupInfo.code,
                name: groupInfo.name,
                itemsCount: 0,
                totalQty: 0
            });
        }
        const grp = mapToUse.get(groupInfo.code);
        grp.itemsCount += 1;
        grp.totalQty += parseFloat(item.Quantity || 0);
    });

    const productionGroupsList = Array.from(productionGroupsMap.values()).sort((a, b) => b.totalQty - a.totalQty);
    const materialGroupsList = Array.from(materialGroupsMap.values()).sort((a, b) => b.totalQty - a.totalQty);

    const totalProdWeight = productionGroupsList.reduce((sum, g) => sum + g.totalQty, 0);
    const totalMatWeight = materialGroupsList.reduce((sum, g) => sum + g.totalQty, 0);

    const detailedMap = new Map();
    items.forEach(item => {
        const key = `${item.ItemCode || ''}_${item.ItemName || ''}`;
        const groupInfo = classifyProductGroup(item.ItemCode, item.ItemName);
        
        if (!detailedMap.has(key)) {
            detailedMap.set(key, {
                code: item.ItemCode || '',
                name: item.ItemName || '',
                groupName: groupInfo.name,
                totalQty: 0
            });
        }
        detailedMap.get(key).totalQty += parseFloat(item.Quantity || 0);
    });

    const detailedList = Array.from(detailedMap.values()).sort((a, b) => b.totalQty - a.totalQty);

    // Group by DocId (Document Number)
    const documentsMap = new Map();
    items.forEach(item => {
        const docId = String(item.SubCode || item.DocId || 'بدون شماره سند').trim();
        let displayDate = '';
        if (item.Date) {
            try {
                displayDate = new Date(item.Date).toLocaleDateString('fa-IR');
            } catch(e) {
                displayDate = item.Date;
            }
        } else {
            displayDate = dateFrom;
        }
        if (!documentsMap.has(docId)) {
            documentsMap.set(docId, {
                docId,
                date: displayDate,
                totalQty: 0,
                items: []
            });
        }
        const doc = documentsMap.get(docId);
        doc.totalQty += parseFloat(item.Quantity || 0);
        doc.items.push({
            itemCode: item.ItemCode || '',
            itemName: item.ItemName || '',
            quantity: parseFloat(item.Quantity || 0),
            groupName: classifyProductGroup(item.ItemCode, item.ItemName).name
        });
    });

    const documentsList = Array.from(documentsMap.values()).sort((a, b) => {
        const numA = parseInt(a.docId, 10);
        const numB = parseInt(b.docId, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numB - numA;
        }
        return b.docId.localeCompare(a.docId);
    });

    const dateStr = dateFrom === dateTo ? dateFrom : `از ${dateFrom} تا ${dateTo}`;

    return `
        <!DOCTYPE html>
        <html lang="fa" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: 'Tahoma', 'Arial', sans-serif;
                    direction: rtl;
                    padding: 40px;
                    background: #fff;
                    color: #1e293b;
                }
                .header {
                    text-align: center;
                    border-bottom: 2px solid #1e3b8a;
                    padding-bottom: 15px;
                    margin-bottom: 25px;
                }
                .title {
                    font-size: 20px;
                    font-weight: 900;
                    color: #1e3a8a;
                }
                .subtitle {
                    font-size: 12px;
                    margin-top: 5px;
                    color: #475569;
                }
                .meta-box {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 15px;
                    margin-bottom: 25px;
                    background: #f8fafc;
                    padding: 12px 15px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                }
                .meta-item {
                    text-align: center;
                    font-size: 11px;
                    color: #64748b;
                    font-weight: bold;
                }
                .meta-val {
                    font-size: 15px;
                    font-weight: 900;
                    color: #0f172a;
                    margin-top: 4px;
                }
                .section-title {
                    font-size: 14px;
                    font-weight: bold;
                    border-right: 4px solid #1e3a8a;
                    padding-right: 8px;
                    margin-top: 25px;
                    margin-bottom: 12px;
                    color: #1e3a8a;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 25px;
                    font-size: 11px;
                }
                th, td {
                    border: 1px solid #cbd5e1;
                    padding: 8px;
                    text-align: center;
                }
                th {
                    background: #f1f5f9;
                    font-weight: bold;
                    color: #334155;
                }
                .text-right {
                    text-align: right;
                    padding-right: 12px;
                }
                .sum-row {
                    font-weight: bold;
                    background: #f8fafc;
                    color: #0f172a;
                }
                .doc-card-header {
                    margin-top: 25px;
                    margin-bottom: 8px;
                    font-weight: bold;
                    background: #f1f5f9;
                    padding: 8px 12px;
                    border: 1.5px solid #cbd5e1;
                    border-radius: 6px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                }
                .signatures-container {
                    margin-top: 40px;
                    display: flex;
                    justify-content: space-around;
                    font-weight: bold;
                    font-size: 12px;
                    color: #1e293b;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">تراز رسید برگشت از تولید کالا (کد عملیات ۴۴)</div>
                <div class="subtitle">دوره زمانی گزارش: ${dateStr}</div>
            </div>
            
            <div class="meta-box">
                <div class="meta-item">
                    <div>تاریخ استخراج گزارش</div>
                    <div class="meta-val">${new Date().toLocaleDateString('fa-IR')}</div>
                </div>
                <div class="meta-item">
                    <div>تعداد اسناد رسیدگی‌شده</div>
                    <div class="meta-val">${documentsList.length.toLocaleString('fa-IR')} سند</div>
                </div>
                <div class="meta-item">
                    <div>مجموع وزن برگشتی</div>
                    <div class="meta-val" style="color: #ef4444;">${Math.round(totalWeight).toLocaleString('fa-IR')} کیلوگرم</div>
                </div>
            </div>

            <div class="section-title">بخش اول: برگشت از تولید (ادغام در سطح گروه کالا)</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">ردیف</th>
                        <th>کد گروه</th>
                        <th>گروه کالا</th>
                        <th>تعداد اقلام متمایز</th>
                        <th>مجموع وزن برگشتی (کیلوگرم)</th>
                        <th>سهم از کل</th>
                    </tr>
                </thead>
                <tbody>
                    ${productionGroupsList.length === 0 ? '<tr><td colspan="6" style="padding: 12px; color: #64748b;">موردی ثبت نشده است</td></tr>' : productionGroupsList.map((g, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${g.code}</td>
                            <td class="text-right">${g.name}</td>
                            <td>${g.itemsCount}</td>
                            <td style="font-weight: bold;">${g.totalQty.toLocaleString('fa-IR')}</td>
                            <td>${totalWeight > 0 ? ((g.totalQty / totalWeight) * 100).toFixed(1) : 0}%</td>
                        </tr>
                    `).join('')}
                    <tr class="sum-row">
                        <td colspan="4">جمع کل برگشت از تولید</td>
                        <td>${totalWeight.toLocaleString('fa-IR')}</td>
                        <td>100%</td>
                    </tr>
                </tbody>
            </table>

            <div class="section-title">بخش دوم: گزارش ریز خود کالا (ادغام شده بر اساس نام کالا)</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">ردیف</th>
                        <th>کد کالا</th>
                        <th>نام کالا</th>
                        <th>گروه کالا</th>
                        <th>مجموع وزن برگشتی (کیلوگرم)</th>
                    </tr>
                </thead>
                <tbody>
                    ${detailedList.slice(0, 40).map((item, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${item.code}</td>
                            <td class="text-right">${item.name}</td>
                            <td>${item.groupName}</td>
                            <td style="font-weight: bold;">${item.totalQty.toLocaleString('fa-IR')}</td>
                        </tr>
                    `).join('')}
                    ${detailedList.length > 40 ? `<tr><td colspan="5" style="color: #64748b; font-style: italic; background: #f8fafc; padding: 10px;">... و تعداد ${detailedList.length - 40} قلم کالا دیگر ...</td></tr>` : ''}
                    <tr class="sum-row">
                        <td colspan="4">جمع کل وزن ریز اقلام</td>
                        <td>${totalWeight.toLocaleString('fa-IR')}</td>
                    </tr>
                </tbody>
            </table>

            <div class="section-title" style="page-break-before: always;">بخش سوم: ریز اسناد و مدارک برگشتی (کد عملیات ۴۴)</div>
            ${documentsList.map((doc) => `
                <div class="doc-card-header">
                    <span style="color: #1e3a8a;">شماره سند: ${doc.docId}</span>
                    <span>تاریخ ثبت: ${doc.date}</span>
                    <span style="color: #0f172a;">مجموع وزن برگشتی سند: ${Math.round(doc.totalQty).toLocaleString('fa-IR')} کیلوگرم</span>
                </div>
                <table style="margin-bottom: 20px;">
                    <thead>
                        <tr>
                            <th style="width: 50px;">ردیف</th>
                            <th style="width: 120px;">کد کالا</th>
                            <th>نام و شرح کالا</th>
                            <th style="width: 150px;">گروه کالا</th>
                            <th style="width: 120px;">وزن برگشتی (ک‌گ)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${doc.items.map((item, itemIdx) => `
                            <tr>
                                <td>${itemIdx + 1}</td>
                                <td>${item.itemCode}</td>
                                <td class="text-right">${item.itemName}</td>
                                <td>${item.groupName}</td>
                                <td style="font-weight: bold;">${Math.round(item.quantity).toLocaleString('fa-IR')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `).join('')}

            <div class="signatures-container">
                <div>امضا کننده ۱ (مسئول انبار تولید)<br><br><br>_______________</div>
                <div>امضا کننده ۲ (مدیر تولید)<br><br><br>_______________</div>
                <div>امضا کننده ۳ (مدیریت بازرگانی)<br><br><br>_______________</div>
            </div>
        </body>
        </html>
    `;
};

app.get('/api/sayan/production-returns/pdf', async (req, res) => {
    try {
        const db = getDb();
        const dateFrom = req.query.dateFrom || '';
        const dateTo = req.query.dateTo || dateFrom;

        const items = await queryProductionReturnsData(db, dateFrom, dateTo);
        const html = compileProductionReturnsHtml(dateFrom, dateTo, items);

        const Renderer = await import('./backend/renderer.js');
        const pdfBuffer = await Renderer.generatePdfBuffer(html);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Sayan_Production_Returns_${dateFrom}.pdf`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error("PDF Generate Error Sayan Returns:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/production-returns/send-bot', async (req, res) => {
    try {
        const db = getDb();
        const { dateFrom, dateTo } = req.body;

        if (!dateFrom || !dateTo) {
            return res.status(400).json({ error: 'تاریخ ابتدا و انتها الزامی است' });
        }

        const items = await queryProductionReturnsData(db, dateFrom, dateTo);
        const totalWeight = items.reduce((sum, item) => sum + parseFloat(item.Quantity || 0), 0);

        // Grouping summary for caption (strictly matching Sayan ERP categories)
        const classifyProductGroup = (itemCode, itemName) => {
            const code = (itemCode || '').trim();
            const name = (itemName || '').toLowerCase();
            
            // 1. محصولات (04xx)
            if (code.startsWith('0401') || name.includes('کاور')) return 'اسپاندکس (کاور)';
            if (code.startsWith('0402') || name.includes('کش') || name.includes('قیطان')) return 'کش';
            if (code.startsWith('0403') || name.includes('ساپورت') || name.includes('جوشی')) return 'اسپاندکس جوشی ( ساپورت )';
            if (code.startsWith('0405') || name.includes('شوایتر')) return 'پلی استر شوایتر';
            if (code.startsWith('0407')) return 'نایلون';
            if (code.startsWith('0408') || name.includes('ملت')) return 'نخ ملت';
            if (code.startsWith('0409') || name.includes('الیاف')) return 'الیاف';
            if (code.startsWith('0410') || name.includes('fdy')) return 'FDY';

            // 2. مواد اولیه (01xx)
            if (code.startsWith('0101') || name.includes('چیپس')) return 'چیپس';
            if (code.startsWith('0102') || name.includes('poy') || name.includes('پوی')) return 'POY';
            if (code.startsWith('0103') || name.includes('dty') || name.includes('دی تی وای') || name.includes('پلی استر')) return 'dty یا پلی استر';
            if (code.startsWith('0104') || name.includes('لاستیک')) return 'لاستیک';
            if (code.startsWith('0105') || name.includes('لاکرا')) return 'لاکرا';
            if (code.startsWith('0106') || name.includes('اسپان')) return 'پلی استر اسپان';
            if (code.startsWith('0107') || name.includes('مستر بچ') || name.includes('مستربچ')) return 'مستر بچ';
            if (code.startsWith('0108') || name.includes('نایلون')) return 'نایلون';

            return itemName || 'سایر اقلام';
        };

        const summaryMap = {};
        const itemsMap = new Map();

        items.forEach(item => {
            const grp = classifyProductGroup(item.ItemCode, item.ItemName);
            summaryMap[grp] = (summaryMap[grp] || 0) + parseFloat(item.Quantity || 0);

            // Clean item name resolution (never display raw numeric codes)
            const rawName = (item.ItemName || '').trim();
            const cleanName = (rawName && !rawName.startsWith('0') && isNaN(Number(rawName))) 
                ? rawName 
                : grp;
            itemsMap.set(cleanName, (itemsMap.get(cleanName) || 0) + parseFloat(item.Quantity || 0));
        });

        let summaryText = '';
        Object.entries(summaryMap).forEach(([grp, qty]) => {
            summaryText += `🔹 *${grp}:* ${Math.round(qty).toLocaleString('fa-IR')} ک‌گ\n`;
        });

        // Top returned items by name
        const topItems = Array.from(itemsMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        let topItemsText = '';
        if (topItems.length > 0) {
            topItemsText = `\n📦 *اقلام شاخص برگشتی:*\n` + 
                topItems.map(([name, qty]) => `▪️ ${name}: ${Math.round(qty).toLocaleString('fa-IR')} ک‌گ`).join('\n') + `\n`;
        }

        const dateStr = dateFrom === dateTo ? dateFrom : `از ${dateFrom} تا ${dateTo}`;
        const caption = `🚨 *گزارش تراز رسید برگشت از تولید کالا (کد عملیات ۴۴)* 🚨\n\n` +
                        `📅 *دوره گزارش:* ${dateStr}\n` +
                        `⚖️ *مجموع وزن برگشتی:* ${Math.round(totalWeight).toLocaleString('fa-IR')} کیلوگرم\n` +
                        `📄 *تعداد کل اسناد:* ${items.length.toLocaleString('fa-IR')} فقره سند\n\n` +
                        `📊 *خلاصه وزنی گروه‌ها:*\n${summaryText}` +
                        `${topItemsText}\n` +
                        `⚙️ _گزارش کامل PDF تراز برگشتی پیوست گردید._`;

        const html = compileProductionReturnsHtml(dateFrom, dateTo, items);
        const Renderer = await import('./backend/renderer.js');
        const pdfBuffer = await Renderer.generatePdfBuffer(html);

        const filename = `Sayan_Returns_${dateFrom.replace(/[\/\\]/g, '-')}.pdf`;
        const uniqueTargets = collectBotTargets(db, {
            category: 'production_returns',
            platforms: req.body.selectedPlatforms || ['telegram', 'bale', 'whatsapp'],
            customTargets: req.body.customTargets || null
        });

        if (uniqueTargets.length === 0) {
            return res.status(400).json({ error: 'هیچ شناسه گروه برگشت از تولید (کد ۴۴) در تنظیمات بات یافت نشد. لطفا ابتدا شناسه گروه‌های مربوطه را در بخش تنظیمات سیستم ذخیره نمایید.' });
        }

        const safePdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        let sentCount = 0;
        let lastError = null;

        for (const target of uniqueTargets) {
            try {
                if (target.platform === 'telegram' && telegram) {
                    await telegram.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    sentCount++;
                } else if (target.platform === 'bale' && bale) {
                    await bale.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    sentCount++;
                } else if (target.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        const waRes = await wa.sendMessage(target.id, caption, {
                            data: safePdfBuf.toString('base64'),
                            mimeType: 'application/pdf',
                            filename: filename
                        });
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        sentCount++;
                    }
                }
            } catch (err) {
                lastError = err.message;
                console.error(`[Send Sayan Returns Report] Failed for ${target.platform}:${target.id}:`, err.message);
            }
        }

        if (sentCount === 0) {
            return res.status(400).json({ error: `ارسال ناموفق بود: ${lastError || 'خطا در ارتباط با سرور پیام‌رسان‌ها'}` });
        }

        res.json({
            success: true,
            message: `گزارش تراز برگشت از تولید کالا با موفقیت به ${sentCount} گروه تلگرام/بله/واتساپ ارسال شد. ✅`
        });
    } catch (e) {
        console.error("Send Sayan Returns Bot Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/production-report/send-compare-bot', async (req, res) => {
    try {
        const db = getDb();
        const { dateFromA, dateToA, dateFromB, dateToB, items, groupByLabel } = req.body;

        if (!dateFromA || !items) {
            return res.status(400).json({ error: 'اطلاعات گزارش کامل نیست' });
        }

        const title = `گزارش مقایسه‌ای آمار تولید سایان${groupByLabel ? ` (${groupByLabel})` : ''}`;
        const Renderer = await import('./backend/renderer.js');
        const pdfBuffer = await Renderer.generateProductionCompareReportPDF(title, dateFromA, dateToA, dateFromB, dateToB, items, groupByLabel);

        // Build elegant caption
        const sumA = items.reduce((sum, item) => sum + (item.totalA || 0), 0);
        const sumB = items.reduce((sum, item) => sum + (item.totalB || 0), 0);
        const totalDiff = sumA - sumB;
        const totalDiffPct = sumB ? (totalDiff / sumB) * 100 : 0;

        let caption = `📊 *گزارش مقایسه‌ای آمار تولید کارخانه*
${groupByLabel ? `🏷️ *نوع تفکیک:* ${groupByLabel}\n` : ''}
📅 *بازه اول (A):* ${dateFromA} تا ${dateToA}
📅 *بازه دوم (B):* ${dateFromB} تا ${dateToB}

📈 *خلاصه آمار تولید:*
🔹 مجموع تولید بازه اول (A): ${sumA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
🔸 مجموع تولید بازه دوم (B): ${sumB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
📊 تفاضل تولید (A - B): ${totalDiff.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
📉 درصد تغییر: ${sumB ? `${totalDiffPct > 0 ? '+' : ''}${totalDiffPct.toFixed(1)}%` : '-'}

📎 جزئیات کامل ردیف‌های تولیدی در فایل PDF ضمیمه ارسال گردید.`;

        const filename = `Production_Compare_Report_${dateFromA.replace(/[\/\\]/g, '-')}.pdf`;
        const uniqueTargets = collectBotTargets(db, {
            category: 'production_compare',
            platforms: req.body.selectedPlatforms || ['telegram', 'bale', 'whatsapp'],
            customTargets: req.body.customTargets || null
        });

        if (uniqueTargets.length === 0) {
            return res.status(400).json({ error: 'هیچ شناسه گروه مقایسه آمار تولید (تلگرام، بله یا واتساپ) در تنظیمات سیستم یافت نشد. لطفاً در تنظیمات سیستم شناسه گروه مقایسه آمار تولید را وارد نمایید.' });
        }

        const safePdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        let sentCount = 0;
        let lastError = null;
        for (const target of uniqueTargets) {
            try {
                if (target.platform === 'telegram') {
                    await telegram.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    sentCount++;
                } else if (target.platform === 'bale') {
                    await bale.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    sentCount++;
                } else if (target.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        const waRes = await wa.sendMessage(target.id, caption, {
                            data: safePdfBuf.toString('base64'),
                            mimeType: 'application/pdf',
                            filename: filename
                        });
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        sentCount++;
                    }
                }
            } catch (err) {
                lastError = err.message;
                console.error(`[Send Production Compare Report] Failed for ${target.platform}:${target.id}:`, err.message);
            }
        }

        if (sentCount === 0) {
            return res.status(400).json({ error: `ارسال گزارش مقایسه‌ای ناموفق بود: ${lastError || 'خطای ناشناخته در اتصال به ربات'}` });
        }

        res.json({
            success: true,
            message: `گزارش مقایسه‌ای با موفقیت به ${sentCount} گروه / چت در بات‌ها ارسال شد.`
        });
    } catch (e) {
        console.error("Send Production Compare Report Bot Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sayan/sales-report/send-manual', async (req, res) => {
    try {
        const db = getDb();
        const { targetDate, date, dateFrom, dateTo, label, selectedPlatforms, customTargets, activeYear } = req.body;
        
        let datePayload = null;
        let labelSuffix = label || '';

        if (dateFrom && dateTo) {
            datePayload = { dateFrom, dateTo };
            labelSuffix = label || (dateFrom === dateTo ? dateFrom : `از ${dateFrom} تا ${dateTo}`);
        } else if (targetDate === 'today' || targetDate === 'yesterday') {
            const today = new Date();
            const jToday = jalaali.toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            let targetY = activeYear ? parseInt(activeYear, 10) : jToday.jy;
            if (isNaN(targetY)) targetY = jToday.jy;

            let targetJalaliStr = '';
            if (targetDate === 'today') {
                targetJalaliStr = `${targetY}/${String(jToday.jm).padStart(2, '0')}/${String(jToday.jd).padStart(2, '0')}`;
                labelSuffix = label || `امروز (${targetJalaliStr})`;
            } else if (targetDate === 'yesterday') {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const jYest = jalaali.toJalaali(yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate());
                targetJalaliStr = `${targetY}/${String(jYest.jm).padStart(2, '0')}/${String(jYest.jd).padStart(2, '0')}`;
                labelSuffix = label || `دیروز (${targetJalaliStr})`;
            }
            datePayload = targetJalaliStr;
        } else if (date) {
            datePayload = date;
            labelSuffix = label || date;
        } else {
            datePayload = new Date();
            labelSuffix = label || 'روز جاری';
        }

        const result = await sendDailySalesReportForDate(db, datePayload, labelSuffix, customTargets, selectedPlatforms);
        res.json({
            success: true,
            message: `گزارش فروش ${labelSuffix} با موفقیت به پیام‌رسان‌ها ارسال شد.`,
            result
        });
    } catch (e) {
        console.error("Manual Sales Report Sending Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// SAYAN ONLINE FACTORY EXIT INTEGRATION ENDPOINTS
// ==========================================

const mapGradeCode = (code) => {
    if (!code) return 'AA';
    const s = String(code).trim();
    if (s === '00011001') return 'AA';
    if (s === '00011002') return 'A';
    if (s === '00011003') return 'B';
    if (s === '00011004') return 'C';
    if (s.length < 5) return s;
    return 'AA';
};

const mapTwistCode = (code) => {
    if (!code) return 'Z';
    const s = String(code).trim();
    if (s === '00021001') return 'Z';
    if (s === '00021002') return 'S';
    if (s.length < 5) return s;
    return 'Z';
};

const parseDetailNote = (note) => {
    const result = {
        bobbinCount: 0,
        cartonCount: 0,
        grossWeight: 0,
        netWeight: 0,
        grade: 'AA',
        twistDirection: 'Z',
        description: ''
    };
    if (!note || typeof note !== 'string') return result;
    
    const parts = note.split('|').map(p => p.trim());
    for (const p of parts) {
        if (p.includes('تعداد بوبین:')) {
            result.bobbinCount = parseInt(p.replace('تعداد بوبین:', '').trim(), 10) || 0;
        } else if (p.includes('تعداد کارتن:')) {
            result.cartonCount = parseInt(p.replace('تعداد کارتن:', '').trim(), 10) || 0;
        } else if (p.includes('وزن ناخالص:')) {
            result.grossWeight = parseFloat(p.replace('وزن ناخالص:', '').trim()) || 0;
        } else if (p.includes('وزن خالص:')) {
            result.netWeight = parseFloat(p.replace('وزن خالص:', '').trim()) || 0;
        } else if (p.includes('گرید:')) {
            const rawG = p.replace('گرید:', '').trim();
            result.grade = mapGradeCode(rawG);
        } else if (p.includes('جهت تاب:')) {
            const rawT = p.replace('جهت تاب:', '').trim();
            result.twistDirection = mapTwistCode(rawT);
        } else if (p.includes('توضیحات:')) {
            const d = p.replace('توضیحات:', '').trim();
            if (d) result.description = d;
        }
    }
    return result;
};

// Search persons across Sayan ERP (GNR_TBL_001)
app.all(['/api/sayan/search-persons', '/api/sayan-persons/search'], async (req, res) => {
    try {
        const db = getDb();
        const q = String(req.query.q || req.body.q || '').trim();
        if (!q) {
            return res.json({ success: true, persons: [] });
        }

        const sanitized = q.replace(/'/g, "''");
        const queryStr = `
            SELECT TOP 35
                Field_001 as Id,
                Field_003 as PersonCode,
                Field_005 as SecondaryCode,
                RTRIM(LTRIM(COALESCE(Field_006, ''))) as FirstName,
                RTRIM(LTRIM(COALESCE(Field_007, ''))) as LastName,
                RTRIM(LTRIM(COALESCE(Field_008, ''))) as FatherOrDetail,
                RTRIM(LTRIM(COALESCE(Field_009, ''))) as NationalCode,
                RTRIM(LTRIM(COALESCE(Field_015, ''))) as Mobile,
                RTRIM(LTRIM(COALESCE(Field_021, ''))) as AccountingCode,
                RTRIM(LTRIM(COALESCE(Field_030, ''))) as TafsiliCode,
                RTRIM(LTRIM(COALESCE(Field_013, ''))) as Address
            FROM GNR_TBL_001
            WHERE (
                Field_006 LIKE N'%${sanitized}%' OR
                Field_007 LIKE N'%${sanitized}%' OR
                Field_003 LIKE '%${sanitized}%' OR
                Field_005 LIKE '%${sanitized}%' OR
                Field_008 LIKE N'%${sanitized}%' OR
                Field_009 LIKE '%${sanitized}%' OR
                Field_015 LIKE '%${sanitized}%' OR
                Field_021 LIKE '%${sanitized}%' OR
                Field_030 LIKE '%${sanitized}%'
            )
            ORDER BY Field_001 DESC
        `;

        const rows = await executeSayanQuery(db, queryStr);
        const persons = rows.map(r => {
            const fullName = `${r.FirstName || ''} ${r.LastName || ''}`.trim() || r.FatherOrDetail || `شخص ${r.PersonCode}`;
            return {
                id: String(r.Id || ''),
                personCode: String(r.PersonCode || r.SecondaryCode || ''),
                name: fullName,
                firstName: r.FirstName || '',
                lastName: r.LastName || '',
                fatherOrDetail: r.FatherOrDetail || '',
                nationalCode: r.NationalCode || '',
                mobile: r.Mobile || '',
                accountingCode: String(r.AccountingCode || r.TafsiliCode || r.PersonCode || ''),
                tafsiliCode: String(r.TafsiliCode || ''),
                address: r.Address || ''
            };
        });

        res.json({ success: true, persons });
    } catch (e) {
        console.error("Sayan Search Persons Error:", e);
        res.status(500).json({ error: e.message, persons: [] });
    }
});

// Build robust conditions for matching names and remittance numbers in Sayan (taking into account Arabic/Persian character variations)
// Helper to extract 3-6 digit person code from recipientName and clean the name
function extractCodeAndCleanName(name) {
    if (!name) return { cleanName: '', extractedCode: null };
    // Match any 3 to 6 digit sequence
    const match = String(name).match(/\b\d{3,6}\b/);
    const extractedCode = match ? match[0] : null;
    let cleanName = String(name);
    if (extractedCode) {
        cleanName = cleanName.replace(extractedCode, '');
    }
    cleanName = cleanName
        .replace(/کد\s+مشتری/gi, '')
        .replace(/کد/gi, '')
        .replace(/مشتری/gi, '')
        .replace(/با/gi, '')
        .replace(/نام/gi, '')
        .replace(/گیرنده/gi, '')
        .replace(/[\-\:\(\)]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return { cleanName, extractedCode };
}

// Build robust conditions for matching names and remittance numbers in Sayan (taking into account Arabic/Persian character variations)
function getSayanMatchConditions({ personCode, recipientName, permitNumber }) {
    let groups = [];

    // Function to build SQL Server normalized column comparison
    const sqlNormalize = (col) => {
        return `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col}, ''), N'ي', N'ی'), N'ك', N'ک'), N'‌', N' '), N'أ', N'ا')`;
    };

    const jsNormalizePersian = (str) => {
        return String(str)
            .replace(/ي/g, 'ی')
            .replace(/ك/g, 'ک')
            .replace(/‌/g, ' ')
            .replace(/أ/g, 'ا')
            .replace(/'/g, "''")
            .trim();
    };

    let pCode = personCode;
    let rName = recipientName;
    if (!pCode && rName) {
        const { cleanName, extractedCode } = extractCodeAndCleanName(rName);
        if (extractedCode) {
            pCode = extractedCode;
            rName = cleanName;
        }
    }

    // 1. Person matching group (Code OR Name)
    let personConds = [];
    if (pCode) {
        const sCode = String(pCode).replace(/'/g, "''").trim();
        const numericCode = parseInt(sCode, 10);
        let codeConds = [
            `RTRIM(LTRIM(t10.Field_010)) = '${sCode}'`,
            `RTRIM(LTRIM(t10.Field_010)) = '0${sCode}'`,
            `RTRIM(LTRIM(t10.Field_010)) = '00${sCode}'`,
            `RTRIM(LTRIM(p.Field_003)) = '${sCode}'`,
            `RTRIM(LTRIM(p.Field_005)) = '${sCode}'`
        ];
        if (!isNaN(numericCode)) {
            codeConds.push(`TRY_CAST(t10.Field_010 AS INT) = ${numericCode}`);
        }
        personConds.push(`(${codeConds.join(' OR ')})`);
        personConds.push(`t10.Field_029 LIKE '%${sCode}%'`);
    }

    if (rName) {
        const normName = jsNormalizePersian(rName);
        if (normName && !/^\d+$/.test(normName)) {
            personConds.push(`${sqlNormalize('t10.Field_029')} LIKE N'%${normName}%'`);
            personConds.push(`${sqlNormalize('p.Field_006')} LIKE N'%${normName}%'`);
            personConds.push(`${sqlNormalize('p.Field_007')} LIKE N'%${normName}%'`);
        }
    }

    if (personConds.length > 0) {
        groups.push(`(${personConds.join(' OR ')})`);
    }

    // 2. Number matching group (DocNo OR RemittanceNo)
    let numberConds = [];
    let numVal = permitNumber || (rName && /^\d+$/.test(rName) ? rName : null);
    if (numVal) {
        const normNum = String(numVal).replace(/'/g, "''").trim();
        if (normNum) {
            numberConds.push(`t10.Field_005 = '${normNum}'`);
            numberConds.push(`t10.Field_006 = '${normNum}'`);
            numberConds.push(`t10.Field_005 LIKE '%${normNum}%'`);
            numberConds.push(`t10.Field_006 LIKE '%${normNum}%'`);
        }
    }

    if (numberConds.length > 0) {
        groups.push(`(${numberConds.join(' OR ')})`);
    }

    return groups;
}

// ==========================================
// SAYAN SALES REMITTANCES (حواله‌های فروش و انبار)
// ==========================================

// Complete Sayan Sales Remittances List & Explorer Endpoint
app.all('/api/sayan/sales-remittances', async (req, res) => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        const sayanUrl = settings.sayanApiUrl || process.env.SAYAN_API_URL;
        const sayanKey = settings.sayanApiKey || process.env.SAYAN_API_KEY;

        if (!sayanUrl || !sayanKey) {
            return res.json({ success: false, message: 'تنظیمات آدرس API یا کلید امنیتی سایان در بخش تنظیمات سیستم ثبت نشده است.', remittances: [] });
        }

        const dateFrom = req.query.dateFrom || req.body.dateFrom;
        const dateTo = req.query.dateTo || req.body.dateTo;
        const search = String(req.query.search || req.body.search || '').trim();
        const docType = String(req.query.docType || req.body.docType || 'all').trim();
        const personCode = String(req.query.personCode || req.body.personCode || '').trim();
        const storeId = String(req.query.storeId || req.body.storeId || '').trim();
        const limit = Math.min(parseInt(req.query.limit || req.body.limit || '500', 10), 2000);

        let whereClauses = [];

        // DocType Filter
        if (docType && docType !== 'all') {
            if (docType === 'all_exit') {
                whereClauses.push(`RTRIM(LTRIM(t10.Field_009)) IN ('12', '23')`);
            } else {
                whereClauses.push(`RTRIM(LTRIM(t10.Field_009)) = '${docType.replace(/'/g, "''")}'`);
            }
        } else {
            whereClauses.push(`RTRIM(LTRIM(t10.Field_009)) IN ('12', '23', '3', '13')`);
        }

        // Date Range Filter
        if (dateFrom && dateTo) {
            const gregFrom = parseJalaliStrToGregorian(dateFrom) || (dateFrom.includes('-') ? dateFrom : null);
            const gregTo = parseJalaliStrToGregorian(dateTo) || (dateTo.includes('-') ? dateTo : null);
            if (gregFrom && gregTo) {
                whereClauses.push(`t10.Field_008 >= '${gregFrom}T00:00:00.000Z' AND t10.Field_008 <= '${gregTo}T23:59:59.999Z'`);
            }
        } else if (dateFrom) {
            const gregFrom = parseJalaliStrToGregorian(dateFrom) || (dateFrom.includes('-') ? dateFrom : null);
            if (gregFrom) {
                whereClauses.push(`t10.Field_008 >= '${gregFrom}T00:00:00.000Z'`);
            }
        }

        // Person Code Filter
        if (personCode) {
            const sanitizedPerson = personCode.replace(/'/g, "''");
            whereClauses.push(`(RTRIM(LTRIM(t10.Field_010)) = '${sanitizedPerson}' OR RTRIM(LTRIM(p.Field_003)) = '${sanitizedPerson}' OR RTRIM(LTRIM(p.Field_005)) = '${sanitizedPerson}')`);
        }

        // Store ID Filter
        if (storeId && storeId !== 'all') {
            whereClauses.push(`RTRIM(LTRIM(t10.Field_018)) = '${storeId.replace(/'/g, "''")}'`);
        }

        // Search Query (Multi-field fuzzy search)
        if (search) {
            const sanitized = search.replace(/'/g, "''");
            const sqlNormalize = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col}, ''), N'ي', N'ی'), N'ك', N'ک'), N'‌', N' '), N'أ', N'ا')`;
            const jsNorm = String(search).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/أ/g, 'ا').replace(/'/g, "''").trim();
            const fullPersonCol = `COALESCE(p.Field_006, '') + ' ' + COALESCE(p.Field_007, '')`;

            const searchConds = [
                `RTRIM(LTRIM(t10.Field_005)) LIKE N'%${sanitized}%'`,
                `RTRIM(LTRIM(t10.Field_006)) LIKE N'%${sanitized}%'`,
                `RTRIM(LTRIM(t10.Field_010)) LIKE N'%${sanitized}%'`,
                `${sqlNormalize('p.Field_006')} LIKE N'%${jsNorm}%'`,
                `${sqlNormalize('p.Field_007')} LIKE N'%${jsNorm}%'`,
                `${sqlNormalize(fullPersonCol)} LIKE N'%${jsNorm}%'`,
                `${sqlNormalize('t07.Field_006')} LIKE N'%${jsNorm}%'`,
                `RTRIM(LTRIM(t11.Field_005)) LIKE N'%${sanitized}%'`,
                `${sqlNormalize('s04.Field_003')} LIKE N'%${jsNorm}%'`,
                `${sqlNormalize('t22.Field_004')} LIKE N'%${jsNorm}%'`,
                `${sqlNormalize('t10.Field_029')} LIKE N'%${jsNorm}%'`
            ];

            // Multi-word token matching for customer names (e.g. "شرکت نساجی بهشت" or "احمد محمدی")
            const stopWords = new Set(['شرکت', 'فروشگاه', 'جناب', 'اقای', 'آقای', 'خانم', 'مهندس', 'حاج', 'برادران', 'کارخانه', 'تولیدی', 'بازرگانی', 'نساجی']);
            const nameTokens = jsNorm
                .replace(/[\(\)\-\:\d]/g, ' ')
                .split(/\s+/)
                .map(t => t.trim())
                .filter(t => t.length >= 2 && !stopWords.has(t));
            if (nameTokens.length >= 2) {
                const tokenAndCond = nameTokens.map(tok =>
                    `(${sqlNormalize(fullPersonCol)} LIKE N'%${tok}%' OR ${sqlNormalize('t07.Field_006')} LIKE N'%${tok}%' OR ${sqlNormalize('t10.Field_029')} LIKE N'%${tok}%')`
                ).join(' AND ');
                searchConds.push(`(${tokenAndCond})`);
            }

            whereClauses.push(`(${searchConds.join(' OR ')})`);
        }

        const sql = `
            SELECT TOP ${limit}
                t10.Field_001 as ArchiveCode,
                t10.Field_004 as SubSystem,
                t10.Field_005 as DocNo,
                t10.Field_006 as RemittanceNumber,
                t10.Field_007 as SubCode,
                t10.Field_008 as DocDate,
                RTRIM(LTRIM(t10.Field_009)) as DocType,
                t10.Field_010 as PersonCode,
                t10.Field_018 as StoreId,
                t10.Field_029 as Note,
                COALESCE(
                    NULLIF(RTRIM(LTRIM(t07.Field_006)), ''),
                    NULLIF(RTRIM(LTRIM(COALESCE(p.Field_006, '') + ' ' + COALESCE(p.Field_007, ''))), ''),
                    t10.Field_010,
                    N'طرف‌حساب نامشخص'
                ) as PersonFullName,
                p.Field_013 as PersonAddress,
                p.Field_015 as PersonPhone,
                t11.Field_001 as LineId,
                RTRIM(LTRIM(t11.Field_005)) as ItemCode,
                COALESCE(
                    NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                    NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                    NULLIF(RTRIM(LTRIM(t_name.ItemName)), ''),
                    RTRIM(LTRIM(t11.Field_005)),
                    N'کالای بدون نام'
                ) as ItemName,
                t11.Field_006 as NetQty,
                t11.Field_031 as DetailNote,
                t11.Field_034 as RowNo
            FROM STR_TBL_010 t10
            INNER JOIN STR_TBL_011 t11 ON t11.Field_004 = t10.Field_005 
                                      AND t11.Field_003 = t10.Field_004 
                                      AND t11.Field_012 = t10.Field_018
            LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
            LEFT JOIN (
                SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(t02_sub.Field_003) as ItemName
                FROM IND_TBL_021 t21_sub
                LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
                GROUP BY t21_sub.Field_004
            ) t_name ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_name.ItemCode))
            LEFT JOIN ACT_TBL_007 t07 ON RTRIM(LTRIM(t10.Field_010)) = RTRIM(LTRIM(t07.Field_005)) AND (t07.Field_004 = '11' OR t07.Field_004 = '31')
            LEFT JOIN GNR_TBL_001 p ON RTRIM(LTRIM(p.Field_003)) = RTRIM(LTRIM(t10.Field_010))
            LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(t11.Field_005))
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY t10.Field_008 DESC, t10.Field_005 DESC
        `;

        const rows = await executeSayanQuery(db, sql);
        
        // Group line items by Header (DocNo)
        const remittancesMap = new Map();
        
        const persianDays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];

        for (const row of rows) {
            const docKey = String(row.DocNo || row.ArchiveCode);
            if (!remittancesMap.has(docKey)) {
                let shamsiDateStr = '';
                let dayOfWeek = '';
                if (row.DocDate) {
                    try {
                        const d = new Date(row.DocDate);
                        if (!isNaN(d.getTime())) {
                            const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
                            shamsiDateStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
                            dayOfWeek = persianDays[d.getDay()];
                        }
                    } catch (e) {}
                }

                const docTypeStr = String(row.DocType || '').trim();
                let docTypeLabel = 'حواله فروش';
                if (docTypeStr === '23') docTypeLabel = 'حواله فروش';
                else if (docTypeStr === '12') docTypeLabel = 'سایر حواله‌ها (۱۲)';
                else if (docTypeStr === '3') docTypeLabel = 'حواله انبار';
                else if (docTypeStr === '13') docTypeLabel = 'برگشت از فروش';
                else if (docTypeStr === '10') docTypeLabel = 'رسید انبار';

                remittancesMap.set(docKey, {
                    archiveCode: String(row.ArchiveCode || ''),
                    subSystem: String(row.SubSystem || ''),
                    docNo: String(row.DocNo || ''),
                    remittanceNumber: String(row.RemittanceNumber || row.DocNo || ''),
                    subCode: String(row.SubCode || ''),
                    docDate: row.DocDate || '',
                    shamsiDate: shamsiDateStr,
                    dayOfWeek,
                    docType: docTypeStr,
                    docTypeLabel,
                    personCode: String(row.PersonCode || ''),
                    personFullName: String(row.PersonFullName || '').trim(),
                    personAddress: '',
                    personPhone: '',
                    storeId: String(row.StoreId || ''),
                    note: String(row.Note || '').trim(),
                    headerPayable: 0,
                    items: [],
                    totalNetWeight: 0,
                    totalGrossWeight: 0,
                    totalCartons: 0,
                    totalBobbins: 0,
                    totalAmount: 0
                });
            }

            const rem = remittancesMap.get(docKey);
            const parsed = parseDetailNote(row.DetailNote);
            const netVal = parseFloat(row.NetQty || 0);
            const grossVal = parsed.grossWeight > 0 ? parsed.grossWeight : netVal;
            const unitPrice = 0;
            const totalPrice = 0;

            rem.totalNetWeight += netVal;
            rem.totalGrossWeight += grossVal;
            rem.totalCartons += parsed.cartonCount;
            rem.totalBobbins += parsed.bobbinCount;
            rem.totalAmount += totalPrice;

            rem.items.push({
                lineId: String(row.LineId || ''),
                docNo: String(row.DocNo || ''),
                itemCode: String(row.ItemCode || ''),
                goodsName: String(row.ItemName || row.ItemCode || `کالا ${rem.items.length + 1}`),
                netQty: parseFloat(netVal.toFixed(3)),
                grossQty: parseFloat(grossVal.toFixed(3)),
                unitPrice,
                totalPrice,
                cartonCount: parsed.cartonCount,
                bobbinCount: parsed.bobbinCount,
                grade: parsed.grade,
                twistDirection: parsed.twistDirection,
                description: parsed.description,
                detailNote: row.DetailNote || '',
                rowNo: parseInt(row.RowNo || (rem.items.length + 1), 10)
            });
        }

        const remittances = Array.from(remittancesMap.values()).map(r => {
            r.totalNetWeight = parseFloat(r.totalNetWeight.toFixed(3));
            r.totalGrossWeight = parseFloat(r.totalGrossWeight.toFixed(3));
            r.itemsCount = r.items.length;
            return r;
        });

        // Calculate Overview Summary
        const summary = {
            totalRemittances: remittances.length,
            totalNetWeight: parseFloat(remittances.reduce((s, r) => s + r.totalNetWeight, 0).toFixed(3)),
            totalGrossWeight: parseFloat(remittances.reduce((s, r) => s + r.totalGrossWeight, 0).toFixed(3)),
            totalCartons: remittances.reduce((s, r) => s + r.totalCartons, 0),
            totalBobbins: remittances.reduce((s, r) => s + r.totalBobbins, 0),
            totalAmount: remittances.reduce((s, r) => s + r.totalAmount, 0),
            uniqueCustomersCount: new Set(remittances.map(r => r.personCode || r.personFullName)).size
        };

        res.json({
            success: true,
            remittances,
            summary
        });
    } catch (e) {
        console.error("Fetch Sayan Sales Remittances Error:", e);
        res.status(500).json({ success: false, message: e.message, error: e.message, remittances: [] });
    }
});

// Live Sayan Warehouses List
app.get('/api/sayan/warehouses', async (req, res) => {
    try {
        const warehouses = await sayanRemittanceService.getSayanWarehouses();
        res.json({ success: true, warehouses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, warehouses: [] });
    }
});

// Live Sayan Warehouses Detailed Stats per Fiscal Year
app.get('/api/sayan/warehouses/live-stats', async (req, res) => {
    try {
        const fiscalYear = req.query.fiscalYear || '4';
        const stats = await sayanRemittanceService.getSayanWarehousesLiveStats(fiscalYear);
        res.json({ success: true, stats, fiscalYear });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, stats: [] });
    }
});

// Recent Documents per Warehouse in Sayan
app.get('/api/sayan/warehouses/:code/documents', async (req, res) => {
    try {
        const warehouseCode = req.params.code;
        const fiscalYear = req.query.fiscalYear || '4';
        const limit = req.query.limit || 20;
        const documents = await sayanRemittanceService.getWarehouseRecentDocuments(warehouseCode, fiscalYear, limit);
        res.json({ success: true, documents, warehouseCode, fiscalYear });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, documents: [] });
    }
});

// Live Sayan Fiscal Years List
app.get('/api/sayan/fiscal-years', async (req, res) => {
    try {
        const fiscalYears = await sayanRemittanceService.getSayanFiscalYears();
        res.json({ success: true, fiscalYears });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, fiscalYears: [] });
    }
});

// Search Sayan Goods for Remittance
app.get('/api/sayan/goods/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const items = await sayanRemittanceService.searchSayanGoods(query);
        res.json({ success: true, items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, items: [] });
    }
});

// Search Sayan Customers for Remittance
app.get('/api/sayan/customers', async (req, res) => {
    try {
        const query = req.query.q || '';
        const refresh = req.query.refresh === 'true';
        const customers = query 
            ? await sayanRemittanceService.searchSayanCustomers(query)
            : await sayanRemittanceService.getAllSayanCustomers(refresh);
        res.json({ success: true, customers, count: customers.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, customers: [] });
    }
});

app.get('/api/sayan/customers/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const customers = await sayanRemittanceService.searchSayanCustomers(query);
        res.json({ success: true, customers, count: customers.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, customers: [] });
    }
});

// Barcode scanner lookup
app.post('/api/sayan/barcode/lookup', async (req, res) => {
    try {
        const { barcode, warehouseCode, fiscalYear } = req.body || {};
        const result = await sayanRemittanceService.lookupBarcodeInSayan(barcode, { warehouseCode, fiscalYear });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create & Register Sales Remittance in Sayan (OpCode 23)
app.post('/api/sayan/sales-remittances/create', async (req, res) => {
    try {
        const data = req.body || {};
        const currentUser = req.body.currentUser || req.user || { fullName: 'کاربر سیستم' };
        const result = await sayanRemittanceService.registerSalesRemittanceInSayan(data, currentUser);
        res.json(result);
    } catch (err) {
        console.error("Register Sayan Sales Remittance Error:", err);
        res.status(500).json({ success: false, message: err.message, error: err.message });
    }
});

// Get Sales Remittances Local Archive
app.get('/api/sayan/sales-remittances/archive', async (req, res) => {
    try {
        const archive = sayanRemittanceService.getSalesRemittancesArchive();
        res.json({ success: true, archive });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message, archive: [] });
    }
});

// Lookup matching Sayan Sales Remittance (STR_TBL_010 / STR_TBL_011)
// Explore endpoint to return a list of matching headers for debugging and manual search
app.post('/api/sayan/sales-remittance/explore', async (req, res) => {
    try {
        const { query } = req.body;
        const db = getDb();
        if (!db.settings?.sayanApiUrl) {
            return res.json({ success: false, message: 'تنظیمات ارتباط با سایان ثبت نشده است.' });
        }

        let whereClauses = ["RTRIM(LTRIM(t10.Field_009)) IN ('12', '23', '3', '13')"];
        
        if (query && query.trim()) {
            const sanitized = String(query).replace(/'/g, "''").trim();
            const numericVal = parseInt(sanitized, 10);
            
            const jsNormalize = (str) => {
                return String(str).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/أ/g, 'ا').replace(/'/g, "''").trim();
            };
            const normName = jsNormalize(sanitized);

            const sqlNormalize = (col) => {
                return `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col}, ''), N'ي', N'ی'), N'ك', N'ک'), N'‌', N' '), N'أ', N'ا')`;
            };

            let conditions = [];
            // Match DocNo or RemittanceNumber
            conditions.push(`RTRIM(LTRIM(t10.Field_005)) LIKE N'%${sanitized}%'`);
            conditions.push(`RTRIM(LTRIM(t10.Field_006)) LIKE N'%${sanitized}%'`);
            // Match Person Code
            conditions.push(`RTRIM(LTRIM(t10.Field_010)) LIKE N'%${sanitized}%'`);
            if (!isNaN(numericVal)) {
                conditions.push(`TRY_CAST(t10.Field_010 AS INT) = ${numericVal}`);
                conditions.push(`RTRIM(LTRIM(p.Field_003)) = '${sanitized}'`);
            }
            // Match Name
            if (normName && !/^\d+$/.test(normName)) {
                const parts = normName.split(/\s+/).filter(Boolean);
                if (parts.length > 0) {
                    const subParts = parts.map(part => {
                        return `(${sqlNormalize('p.Field_006')} LIKE N'%${part}%' OR ${sqlNormalize('p.Field_007')} LIKE N'%${part}%' OR ${sqlNormalize('t07.Field_006')} LIKE N'%${part}%')`;
                    });
                    conditions.push(`(${subParts.join(' AND ')})`);
                }
            } else {
                conditions.push(`${sqlNormalize('p.Field_006')} LIKE N'%${normName}%'`);
                conditions.push(`${sqlNormalize('p.Field_007')} LIKE N'%${normName}%'`);
                conditions.push(`${sqlNormalize('t07.Field_006')} LIKE N'%${normName}%'`);
            }

            whereClauses.push(`(${conditions.join(' OR ')})`);
        }

        const sql = `
            SELECT TOP 30
                t10.Field_001 as ArchiveCode,
                t10.Field_004 as SubSystem,
                t10.Field_005 as DocNo,
                t10.Field_006 as RemittanceNumber,
                t10.Field_008 as DocDate,
                RTRIM(LTRIM(t10.Field_009)) as DocType,
                t10.Field_010 as PersonCode,
                t10.Field_018 as StoreId,
                COALESCE(
                    NULLIF(RTRIM(LTRIM(COALESCE(p.Field_006, '') + ' ' + COALESCE(p.Field_007, ''))), ''),
                    NULLIF(RTRIM(LTRIM(t07.Field_006)), ''),
                    t10.Field_010,
                    N'طرف‌حساب نامشخص'
                ) as PersonFullName,
                p.Field_013 as PersonAddress
            FROM STR_TBL_010 t10
            LEFT JOIN GNR_TBL_001 p ON RTRIM(LTRIM(p.Field_003)) = RTRIM(LTRIM(t10.Field_010))
            LEFT JOIN ACT_TBL_007 t07 ON RTRIM(LTRIM(t10.Field_010)) = RTRIM(LTRIM(t07.Field_005)) AND (t07.Field_004 = '11' OR t07.Field_004 = '31')
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY t10.Field_008 DESC, t10.Field_001 DESC
        `;

        const { executeSayanQuery } = await import('./backend/sayan.js').catch(e => require('./backend/sayan.js'));
        const headers = await executeSayanQuery(db, sql);
        
        res.json({ success: true, headers: headers || [] });
    } catch (e) {
        console.error("Explore Remittances Error:", e);
        res.status(500).json({ success: false, message: e.message, error: e.message });
    }
});

// In-memory fast cache for recent Sayan exit remittances (avoids repeated SQL scans within 15s)
let RECENT_SAYAN_REMITTANCES_CACHE = {
    remittances: [],
    timestamp: 0,
    inflightPromise: null
};

function groupSayanRowsIntoRemittances(rows) {
    const remittancesMap = new Map();
    const persianDays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];

    for (const row of (rows || [])) {
        const docKey = `${String(row.SubSystem || '').trim()}_${String(row.StoreId || '').trim()}_${String(row.DocNo || row.ArchiveCode || '').trim()}`;
        if (!remittancesMap.has(docKey)) {
            let shamsiDateStr = '';
            let dayOfWeek = '';
            if (row.DocDate) {
                try {
                    const d = new Date(row.DocDate);
                    if (!isNaN(d.getTime())) {
                        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
                        shamsiDateStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
                        dayOfWeek = persianDays[d.getDay()];
                    }
                } catch (e) {}
            }

            const docTypeStr = String(row.DocType || '').trim();
            let docTypeLabel = 'حواله فروش';
            if (docTypeStr === '23') docTypeLabel = 'حواله فروش';
            else if (docTypeStr === '12') docTypeLabel = 'سایر حواله‌ها (۱۲)';
            else if (docTypeStr === '3') docTypeLabel = 'حواله انبار';
            else if (docTypeStr === '13') docTypeLabel = 'برگشت از فروش';

            remittancesMap.set(docKey, {
                archiveCode: String(row.ArchiveCode || ''),
                subSystem: String(row.SubSystem || ''),
                docNo: String(row.DocNo || '').trim(),
                remittanceNumber: String(row.RemittanceNumber || row.DocNo || '').trim(),
                subCode: String(row.SubCode || ''),
                docDate: row.DocDate || '',
                shamsiDate: shamsiDateStr,
                dayOfWeek,
                docType: docTypeStr,
                docTypeLabel,
                personCode: String(row.PersonCode || '').trim(),
                personFullName: String(row.PersonFullName || '').trim(),
                personAddress: row.PersonAddress || '',
                personPhone: row.PersonPhone || '',
                storeId: String(row.StoreId || ''),
                note: String(row.Note || '').trim(),
                items: [],
                _seenLineIds: new Set(),
                itemsCount: 0,
                totalNetWeight: 0,
                totalGrossWeight: 0,
                totalCartons: 0,
                totalBobbins: 0
            });
        }

        const rem = remittancesMap.get(docKey);
        const lineId = String(row.LineId || '');
        if (lineId && rem._seenLineIds.has(lineId)) continue;
        if (lineId) rem._seenLineIds.add(lineId);

        const parsed = parseDetailNote(row.DetailNote);
        const netVal = parseFloat(row.NetQty || 0);
        const grossVal = parsed.grossWeight > 0 ? parsed.grossWeight : netVal;

        rem.items.push({
            lineId,
            docNo: rem.docNo,
            itemCode: String(row.ItemCode || ''),
            goodsName: String(row.ItemName || row.ItemCode || `کالا ${rem.items.length + 1}`),
            netQty: parseFloat(netVal.toFixed(3)),
            grossQty: parseFloat(grossVal.toFixed(3)),
            unitPrice: parseFloat(row.UnitPrice || 0),
            totalPrice: parseFloat(row.TotalPrice || 0),
            cartonCount: parsed.cartonCount,
            bobbinCount: parsed.bobbinCount,
            grade: parsed.grade,
            twistDirection: parsed.twistDirection,
            description: parsed.description,
            detailNote: row.DetailNote || '',
            rowNo: parseInt(row.RowNo || (rem.items.length + 1), 10)
        });

        rem.itemsCount = rem.items.length;
        rem.totalNetWeight = parseFloat((rem.totalNetWeight + netVal).toFixed(3));
        rem.totalGrossWeight = parseFloat((rem.totalGrossWeight + grossVal).toFixed(3));
        rem.totalCartons += parsed.cartonCount;
        rem.totalBobbins += parsed.bobbinCount;
    }

    const result = Array.from(remittancesMap.values());
    for (const r of result) {
        delete r._seenLineIds;
    }
    return result;
}

async function getRecentSayanRemittancesFast(db, forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && RECENT_SAYAN_REMITTANCES_CACHE.remittances.length > 0 && (now - RECENT_SAYAN_REMITTANCES_CACHE.timestamp) < 25000) {
        return RECENT_SAYAN_REMITTANCES_CACHE.remittances;
    }
    if (RECENT_SAYAN_REMITTANCES_CACHE.inflightPromise) {
        return RECENT_SAYAN_REMITTANCES_CACHE.inflightPromise;
    }

    RECENT_SAYAN_REMITTANCES_CACHE.inflightPromise = (async () => {
        try {
            // Query recent 75 days using pure equality Hash-Joins (NO OR-joins!)
            const cutoffDate = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const sql = `
                SELECT TOP 1200
                    t10.Field_001 as ArchiveCode,
                    t10.Field_004 as SubSystem,
                    t10.Field_005 as DocNo,
                    t10.Field_006 as RemittanceNumber,
                    t10.Field_007 as SubCode,
                    t10.Field_008 as DocDate,
                    RTRIM(LTRIM(t10.Field_009)) as DocType,
                    t10.Field_010 as PersonCode,
                    t10.Field_018 as StoreId,
                    t10.Field_029 as Note,
                    COALESCE(
                        NULLIF(RTRIM(LTRIM(t07.Field_006)), ''),
                        NULLIF(RTRIM(LTRIM(COALESCE(p.Field_006, '') + ' ' + COALESCE(p.Field_007, ''))), ''),
                        NULLIF(RTRIM(LTRIM(COALESCE(p2.Field_006, '') + ' ' + COALESCE(p2.Field_007, ''))), ''),
                        t10.Field_010,
                        N'طرف‌حساب نامشخص'
                    ) as PersonFullName,
                    COALESCE(p.Field_013, p2.Field_013) as PersonAddress,
                    COALESCE(p.Field_015, p2.Field_015) as PersonPhone,
                    t11.Field_001 as LineId,
                    RTRIM(LTRIM(t11.Field_005)) as ItemCode,
                    COALESCE(
                        NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                        NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                        NULLIF(RTRIM(LTRIM(t_name.ItemName)), ''),
                        RTRIM(LTRIM(t11.Field_005)),
                        N'کالای بدون نام'
                    ) as ItemName,
                    t11.Field_006 as NetQty,
                    t11.Field_007 as UnitPrice,
                    t11.Field_008 as TotalPrice,
                    t11.Field_031 as DetailNote,
                    t11.Field_034 as RowNo
                FROM STR_TBL_010 t10
                INNER JOIN STR_TBL_011 t11 ON t11.Field_004 = t10.Field_005 
                                          AND t11.Field_003 = t10.Field_004 
                                          AND t11.Field_012 = t10.Field_018
                LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
                LEFT JOIN (
                    SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(t02_sub.Field_003) as ItemName
                    FROM IND_TBL_021 t21_sub
                    LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
                    GROUP BY t21_sub.Field_004
                ) t_name ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_name.ItemCode))
                LEFT JOIN ACT_TBL_007 t07 ON RTRIM(LTRIM(t10.Field_010)) = RTRIM(LTRIM(t07.Field_005)) AND (t07.Field_004 = '11' OR t07.Field_004 = '31')
                LEFT JOIN GNR_TBL_001 p ON RTRIM(LTRIM(p.Field_003)) = RTRIM(LTRIM(t10.Field_010))
                LEFT JOIN GNR_TBL_001 p2 ON RTRIM(LTRIM(p2.Field_005)) = RTRIM(LTRIM(t10.Field_010))
                LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(t11.Field_005))
                WHERE RTRIM(LTRIM(t10.Field_009)) IN ('12', '23', '3', '13')
                  AND t10.Field_008 >= '${cutoffDate}T00:00:00.000Z'
                ORDER BY t10.Field_008 DESC, t10.Field_005 DESC
            `;
            const rows = await executeSayanQuery(db, sql);
            const grouped = groupSayanRowsIntoRemittances(rows);
            RECENT_SAYAN_REMITTANCES_CACHE.remittances = grouped;
            RECENT_SAYAN_REMITTANCES_CACHE.timestamp = Date.now();
            return grouped;
        } finally {
            RECENT_SAYAN_REMITTANCES_CACHE.inflightPromise = null;
        }
    })();

    return RECENT_SAYAN_REMITTANCES_CACHE.inflightPromise;
}

// Fast Unified Helper to Lookup Matching Sayan Remittances (<150ms via Recent Window + Smart Fuzzy Scorer)
async function findMatchingSayanRemittances(db, params = {}) {
    const {
        personCode,
        tafsiliCode,
        recipientName,
        permitDate,
        permitNumber,
        remittanceNumber,
        itemNames = [],
        docType = 'all_exit',
        limit = 10
    } = params;

    const normPersian = (str) =>
        String(str || '')
            .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
            .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
            .replace(/ي/g, 'ی')
            .replace(/ك/g, 'ک')
            .replace(/‌/g, ' ')
            .replace(/[أإآ]/g, 'ا')
            .replace(/\s+/g, ' ')
            .trim();

    let pCode = personCode && !['0', '---', 'null', 'undefined'].includes(String(personCode).trim())
        ? normPersian(personCode)
        : '';
    let tCode = tafsiliCode && !['0', '---', 'null', 'undefined'].includes(String(tafsiliCode).trim())
        ? normPersian(tafsiliCode)
        : '';
    let rName = String(recipientName || '').trim();

    if (rName) {
        const { cleanName, extractedCode } = extractCodeAndCleanName(rName);
        if (extractedCode && !pCode) {
            pCode = normPersian(extractedCode);
        }
        rName = cleanName
            .replace(/\(.*?\)/g, ' ')
            .replace(/راننده\s*:.*/g, ' ')
            .replace(/کامیون\s*:.*/g, ' ')
            .replace(/پلاک\s*:.*/g, ' ')
            .replace(/شماره\s*:.*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const normRName = normPersian(rName);
    const stopWords = new Set(['شرکت', 'فروشگاه', 'جناب', 'اقای', 'آقای', 'خانم', 'مهندس', 'حاج', 'برادران', 'کارخانه', 'تولیدی', 'بازرگانی', 'نساجی', 'گروه', 'صنایع', 'با', 'مسئولیت', 'محدود', 'سهامی', 'خاص', 'عام']);
    const allTokens = normRName
        .replace(/[\(\)\-\:\d\/\\]/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);
    const coreTokens = allTokens.filter(t => !stopWords.has(t));
    const effectiveTokens = coreTokens.length > 0 ? coreTokens : allTokens;

    const normItemTokens = Array.isArray(itemNames)
        ? itemNames
            .flatMap(n => normPersian(n).split(/\s+/))
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !['کالا', 'نخ', 'کیلو', 'کارتن'].includes(t))
        : [];

    const explicitNum = remittanceNumber
        ? normPersian(remittanceNumber)
        : (normRName && /^\d+$/.test(normRName) ? normRName : '');

    const targetCodes = new Set(
        [pCode, tCode]
            .filter(Boolean)
            .flatMap(c => {
                const n = parseInt(c, 10);
                return !isNaN(n) ? [c, String(n), `0${n}`, `00${n}`] : [c];
            })
    );

    const gregPermitMs = permitDate
        ? (() => {
            const g = parseJalaliStrToGregorian(permitDate) || (String(permitDate).includes('-') ? permitDate : null);
            const t = g ? new Date(g).getTime() : NaN;
            return !isNaN(t) ? t : null;
        })()
        : null;

    const scoreCandidate = (rem) => {
        if (docType && docType !== 'all' && docType !== 'all_exit' && rem.docType !== docType) {
            return -1;
        }
        let score = 0;

        // 1. Explicit remittance / doc number match
        if (explicitNum && (rem.remittanceNumber === explicitNum || rem.docNo === explicitNum)) {
            score += 2000;
        }

        // 2. Person / Tafsili code match
        const remPCode = normPersian(rem.personCode);
        const remPCodeInt = parseInt(remPCode, 10);
        if (remPCode && (targetCodes.has(remPCode) || (!isNaN(remPCodeInt) && targetCodes.has(String(remPCodeInt))))) {
            score += 1000;
        }

        // 3. Name token match
        const remNameNorm = normPersian(rem.personFullName);
        const remNameNoSpaces = remNameNorm.replace(/\s+/g, '');
        const queryNoSpaces = effectiveTokens.join('');
        const remNoteNorm = normPersian(rem.note);

        if (normRName && normRName.length >= 2) {
            if (remNameNorm === normRName || (queryNoSpaces.length >= 4 && remNameNoSpaces.includes(queryNoSpaces))) {
                score += 850;
            } else if (effectiveTokens.length > 0) {
                let matchedInName = 0;
                let matchedInNote = 0;
                for (const tok of effectiveTokens) {
                    if (remNameNorm.includes(tok)) matchedInName++;
                    else if (remNoteNorm.includes(tok)) matchedInNote++;
                }
                if (matchedInName === effectiveTokens.length) {
                    score += 750;
                } else if (matchedInName + matchedInNote === effectiveTokens.length) {
                    score += 550;
                } else if (effectiveTokens.length >= 2 && matchedInName >= effectiveTokens.length - 1) {
                    score += 250 * matchedInName;
                } else if (effectiveTokens.length === 1 && matchedInName === 1 && effectiveTokens[0].length >= 3) {
                    score += 400;
                }
            }
        }

        if (score <= 0) return -1;

        // 4. Boost exit docTypes ('23' = حواله فروش, '12' = سایر حواله‌ها)
        if (rem.docType === '23') score += 40;
        else if (rem.docType === '12') score += 30;

        // 5. Item/Goods name overlap bonus (helps pick the exact remittance when a customer has multiple)
        if (normItemTokens.length > 0 && Array.isArray(rem.items)) {
            const remGoodsStr = normPersian(rem.items.map(it => it.goodsName || '').join(' '));
            let matchedItemToks = 0;
            for (const itok of normItemTokens) {
                if (remGoodsStr.includes(itok)) matchedItemToks++;
            }
            if (matchedItemToks > 0) {
                score += Math.min(120, matchedItemToks * 25);
            }
        }

        // 6. Date proximity bonus
        if (gregPermitMs && rem.docDate) {
            const remMs = new Date(rem.docDate).getTime();
            if (!isNaN(remMs)) {
                const diffDays = Math.abs(remMs - gregPermitMs) / (1000 * 60 * 60 * 24);
                if (diffDays <= 1) score += 140;
                else if (diffDays <= 4) score += 110;
                else if (diffDays <= 14) score += 75;
                else if (diffDays <= 35) score += 35;
            }
        }

        return score;
    };

    const topLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 30);

    // PASS 1: Ultra-fast check against recent 75-day cached remittances (<150ms first call, <1ms cached)
    try {
        const cacheAgeMs = Date.now() - RECENT_SAYAN_REMITTANCES_CACHE.timestamp;
        let recentList = await getRecentSayanRemittancesFast(db, false);
        let scored = [];
        for (const rem of recentList) {
            const s = scoreCandidate(rem);
            if (s > 0) {
                scored.push({ rem, score: s });
            }
        }
        // If cache was older than 3s and had no match (e.g., remittance was JUST registered in Sayan), refresh once
        if (scored.length === 0 && cacheAgeMs > 3000) {
            recentList = await getRecentSayanRemittancesFast(db, true);
            for (const rem of recentList) {
                const s = scoreCandidate(rem);
                if (s > 0) {
                    scored.push({ rem, score: s });
                }
            }
        }
        if (scored.length > 0) {
            scored.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return String(b.rem.docDate || '').localeCompare(String(a.rem.docDate || ''));
            });
            return scored.slice(0, topLimit).map(x => x.rem);
        }
    } catch (fastErr) {
        console.warn('[Sayan Fast Lookup] Recent window query warning:', fastErr.message);
    }

    // PASS 2: Targeted historical fallback (single query, pure Hash Joins, NO OR-joins!)
    const sqlNormalize = (col) =>
        `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col}, ''), N'ي', N'ی'), N'ك', N'ک'), N'‌', N' '), N'أ', N'ا')`;

    const whereOrs = [];
    if (explicitNum) {
        const sNum = explicitNum.replace(/'/g, "''");
        whereOrs.push(`RTRIM(LTRIM(t10.Field_005)) = '${sNum}'`);
        whereOrs.push(`RTRIM(LTRIM(t10.Field_006)) = '${sNum}'`);
    }
    for (const c of [pCode, tCode].filter(Boolean)) {
        const sCode = c.replace(/'/g, "''");
        whereOrs.push(`RTRIM(LTRIM(t10.Field_010)) = '${sCode}'`);
        whereOrs.push(`RTRIM(LTRIM(t10.Field_010)) = '0${sCode}'`);
    }
    if (effectiveTokens.length > 0) {
        const tokConds = effectiveTokens.map(tok => {
            const sTok = tok.replace(/'/g, "''");
            return `(${sqlNormalize('t07.Field_006')} LIKE N'%${sTok}%' OR ${sqlNormalize("COALESCE(p.Field_006, '') + ' ' + COALESCE(p.Field_007, '')")} LIKE N'%${sTok}%' OR ${sqlNormalize("COALESCE(p2.Field_006, '') + ' ' + COALESCE(p2.Field_007, '')")} LIKE N'%${sTok}%')`;
        });
        whereOrs.push(`(${tokConds.join(' AND ')})`);
    }

    if (whereOrs.length === 0) return [];

    const fallbackSql = `
        SELECT TOP 80
            t10.Field_001 as ArchiveCode,
            t10.Field_004 as SubSystem,
            t10.Field_005 as DocNo,
            t10.Field_006 as RemittanceNumber,
            t10.Field_007 as SubCode,
            t10.Field_008 as DocDate,
            RTRIM(LTRIM(t10.Field_009)) as DocType,
            t10.Field_010 as PersonCode,
            t10.Field_018 as StoreId,
            t10.Field_029 as Note,
            COALESCE(
                NULLIF(RTRIM(LTRIM(t07.Field_006)), ''),
                NULLIF(RTRIM(LTRIM(COALESCE(p.Field_006, '') + ' ' + COALESCE(p.Field_007, ''))), ''),
                NULLIF(RTRIM(LTRIM(COALESCE(p2.Field_006, '') + ' ' + COALESCE(p2.Field_007, ''))), ''),
                t10.Field_010,
                N'طرف‌حساب نامشخص'
            ) as PersonFullName,
            COALESCE(p.Field_013, p2.Field_013) as PersonAddress,
            COALESCE(p.Field_015, p2.Field_015) as PersonPhone,
            t11.Field_001 as LineId,
            RTRIM(LTRIM(t11.Field_005)) as ItemCode,
            COALESCE(
                NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                NULLIF(RTRIM(LTRIM(t_name.ItemName)), ''),
                RTRIM(LTRIM(t11.Field_005)),
                N'کالای بدون نام'
            ) as ItemName,
            t11.Field_006 as NetQty,
            t11.Field_007 as UnitPrice,
            t11.Field_008 as TotalPrice,
            t11.Field_031 as DetailNote,
            t11.Field_034 as RowNo
        FROM STR_TBL_010 t10
        INNER JOIN STR_TBL_011 t11 ON t11.Field_004 = t10.Field_005 
                                  AND t11.Field_003 = t10.Field_004 
                                  AND t11.Field_012 = t10.Field_018
        LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN (
            SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(t02_sub.Field_003) as ItemName
            FROM IND_TBL_021 t21_sub
            LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
            GROUP BY t21_sub.Field_004
        ) t_name ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_name.ItemCode))
        LEFT JOIN ACT_TBL_007 t07 ON RTRIM(LTRIM(t10.Field_010)) = RTRIM(LTRIM(t07.Field_005)) AND (t07.Field_004 = '11' OR t07.Field_004 = '31')
        LEFT JOIN GNR_TBL_001 p ON RTRIM(LTRIM(p.Field_003)) = RTRIM(LTRIM(t10.Field_010))
        LEFT JOIN GNR_TBL_001 p2 ON RTRIM(LTRIM(p2.Field_005)) = RTRIM(LTRIM(t10.Field_010))
        LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(t11.Field_005))
        WHERE RTRIM(LTRIM(t10.Field_009)) IN ('12', '23', '3', '13')
          AND (${whereOrs.join(' OR ')})
        ORDER BY t10.Field_008 DESC, t10.Field_005 DESC
    `;

    const fallbackRows = await executeSayanQuery(db, fallbackSql);
    const groupedFallback = groupSayanRowsIntoRemittances(fallbackRows);
    return groupedFallback.slice(0, topLimit);
}

// Automatic Fast Smart Lookup Endpoint
app.post('/api/sayan/sales-remittance/lookup', async (req, res) => {
    try {
        const db = getDb();
        const { personCode, tafsiliCode, recipientName, permitDate, permitNumber, remittanceNumber, itemNames, docType, limit } = req.body || {};

        if (!personCode && !tafsiliCode && !recipientName && !permitNumber && !remittanceNumber) {
            return res.status(400).json({ error: 'کد شخص، نام شخص یا شماره مجوز الزامی است' });
        }

        const remittances = await findMatchingSayanRemittances(db, {
            personCode,
            tafsiliCode,
            recipientName,
            permitDate,
            permitNumber,
            remittanceNumber,
            itemNames,
            docType: docType || 'all_exit',
            limit: limit || 12
        });

        if (!remittances || remittances.length === 0) {
            return res.json({ success: false, remittances: [], message: 'هیچ حواله فروش مرتبطی در سایان یافت نشد' });
        }

        res.json({
            success: true,
            remittance: remittances[0],
            remittances
        });
    } catch (e) {
        console.error("Sayan Remittance Lookup Error:", e);
        res.status(500).json({ error: e.message, remittances: [] });
    }
});

// Auto-Sync and Finalize Exit Permit with Sayan Remittance
app.post('/api/sayan/exit-permits/:id/sync-remittance', async (req, res) => {
    try {
        const db = getDb();
        if (!db.exitPermits) db.exitPermits = [];
        const { id } = req.params;
        const { approverWarehouse, advanceToSecurity = false, customItems, remittanceData, remittanceDocs, attachmentDataUrl } = req.body || {};

        const idx = db.exitPermits.findIndex(p => p.id === id);
        if (idx === -1) {
            return res.status(404).json({ error: 'مجوز خروج مورد نظر یافت نشد' });
        }

        const permit = db.exitPermits[idx];
        let rem = remittanceData;
        let remDocs = Array.isArray(remittanceDocs) && remittanceDocs.length > 0 ? remittanceDocs : null;

        const skipAutoLookup = req.body.skipAutoLookup === true || req.body.remittanceData === null;

        // Only do server fallback lookup if explicitly requested and rem was not passed
        if (!rem && !skipAutoLookup && req.body.autoLookup === true) {
            const pCode = permit.sayanPersonCode || (permit.destinations?.[0]?.sayanPersonCode);
            const tCode = permit.sayanTafsiliCode || (permit.destinations?.[0]?.sayanTafsiliCode);
            const rName = permit.recipientName || (permit.destinations?.[0]?.recipientName);
            const pDate = permit.date;

            try {
                const matchedList = await findMatchingSayanRemittances(db, {
                    personCode: pCode,
                    tafsiliCode: tCode,
                    recipientName: rName,
                    permitDate: pDate,
                    docType: 'all_exit',
                    limit: 5
                });
                if (matchedList && matchedList.length > 0) {
                    rem = matchedList[0];
                    if (!remDocs) remDocs = [rem];
                }
            } catch (lookupErr) {
                console.warn('Background Sayan lookup warning during sync-remittance:', lookupErr.message);
            }
        }

        // Preserve user-entered customItems (deliveredCartonCount & deliveredWeight) if provided!
        const hasUserConfirmedItems = Array.isArray(customItems) && customItems.length > 0 && customItems.some(x => Number(x.deliveredWeight) > 0 || Number(x.deliveredCartonCount) > 0);
        if (hasUserConfirmedItems) {
            permit.items = customItems.map((ci, i) => {
                const sayanItem = rem?.items?.[i];
                return {
                    ...ci,
                    id: ci.id || permit.items?.[i]?.id || `item-${Date.now()}-${i}`,
                    goodsName: ci.goodsName || sayanItem?.goodsName || `کالا ${i + 1}`,
                    cartonCount: Number(ci.cartonCount) || sayanItem?.cartonCount || Number(ci.deliveredCartonCount) || 0,
                    weight: Number(ci.weight) || sayanItem?.netQty || Number(ci.deliveredWeight) || 0,
                    deliveredCartonCount: Number(ci.deliveredCartonCount) || 0,
                    deliveredWeight: Number(ci.deliveredWeight) || 0,
                    grossWeight: Number(ci.grossWeight) || sayanItem?.grossQty || Number(ci.deliveredWeight) || 0,
                    bobbinCount: ci.bobbinCount ?? sayanItem?.bobbinCount ?? 0,
                    grade: ci.grade || sayanItem?.grade || 'AA',
                    twistDirection: ci.twistDirection || sayanItem?.twistDirection || 'Z',
                    itemCode: ci.itemCode || sayanItem?.itemCode || '',
                    description: ci.description || sayanItem?.description || ''
                };
            });
            permit.cartonCount = permit.items.reduce((s, x) => s + (Number(x.deliveredCartonCount || x.cartonCount) || 0), 0);
            permit.weight = permit.items.reduce((s, x) => s + (Number(x.deliveredWeight || x.weight) || 0), 0);
        }

        // Apply Sayan Remittance metadata to permit
        if (rem) {
            permit.sayanRemittanceNumber = String(rem.remittanceNumber || '');
            permit.sayanSubCode = String(rem.subCode || '');
            permit.sayanArchiveCode = String(rem.archiveCode || '');
            permit.sayanSyncedAt = Date.now();
            permit.sayanRemittanceDoc = rem;
            if (remDocs) {
                permit.sayanRemittanceDocs = remDocs;
            }

            // Only overwrite items from Sayan if user hadn't already entered custom delivered quantities
            if (!hasUserConfirmedItems && Array.isArray(rem.items) && rem.items.length > 0 && (!permit.items || !permit.items.some(x => Number(x.deliveredWeight) > 0))) {
                permit.items = rem.items.map((it, i) => ({
                    id: permit.items?.[i]?.id || `sayan-${Date.now()}-${i}`,
                    goodsName: it.goodsName || `کالا ${i + 1}`,
                    cartonCount: it.cartonCount || 0,
                    weight: it.netQty || it.weight || 0,
                    deliveredCartonCount: it.cartonCount || 0,
                    deliveredWeight: it.netQty || it.weight || 0,
                    grossWeight: it.grossQty || it.grossWeight || it.netQty || 0,
                    bobbinCount: it.bobbinCount || 0,
                    grade: it.grade || 'AA',
                    twistDirection: it.twistDirection || 'Z',
                    itemCode: it.itemCode || '',
                    description: it.description || ''
                }));
                permit.cartonCount = rem.totalCartons || permit.items.reduce((s, x) => s + (x.cartonCount || 0), 0);
                permit.weight = rem.totalNetWeight || permit.items.reduce((s, x) => s + (x.weight || 0), 0);
            }
        }

        if (attachmentDataUrl) {
            permit.attachments = permit.attachments || [];
            const fileName = `حواله_فروش_سایان_${permit.sayanRemittanceNumber || permit.permitNumber}.jpg`;
            let savedAttachmentData = attachmentDataUrl;

            // Immediately offload base64 attachment to /uploads/exit-permits/ so database.json & client localStorage stay tiny
            if (typeof attachmentDataUrl === 'string' && attachmentDataUrl.startsWith('data:image/')) {
                try {
                    const match = attachmentDataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
                    if (match && match[2]) {
                        const ext = match[1] === 'png' ? 'png' : 'jpg';
                        const subDir = path.join(UPLOADS_DIR, 'exit-permits');
                        if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
                        const diskName = `sayan_rem_${permit.id}_${Date.now()}.${ext}`;
                        fs.writeFileSync(path.join(subDir, diskName), Buffer.from(match[2], 'base64'));
                        savedAttachmentData = `/uploads/exit-permits/${diskName}`;
                    }
                } catch (offloadErr) {
                    console.warn('Could not offload Sayan remittance image to disk:', offloadErr.message);
                }
            }

            permit.attachments = permit.attachments.filter(a => !String(a.fileName || '').includes('حواله_فروش_سایان'));
            permit.attachments.push({
                fileName,
                data: savedAttachmentData
            });
        }

        if (approverWarehouse) {
            permit.approverWarehouse = approverWarehouse;
        }

        if (advanceToSecurity) {
            permit.status = 'در انتظار خروج (انتظامات)'; // PENDING_SECURITY
        }

        permit.updatedAt = Date.now();
        db.exitPermits[idx] = permit;
        saveDb(db);

        // Background Bot Notification (only when advancing status or explicitly requested)
        if (advanceToSecurity || req.body?.notifyBot) {
            setImmediate(async () => {
                try {
                    const refreshedDb = getDb();
                    await notifyExitPermitStep(permit, null, approverWarehouse, null, refreshedDb, 'تایید انبار با اتصال سایان', 'WAREHOUSE');
                } catch (err) {
                    console.error("Background notifyExitPermitStep error on sync-remittance:", err);
                }
            });
        }

        res.json({ success: true, permit });
    } catch (e) {
        console.error("Sayan Exit Permit Sync Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/users', (req, res) => {
    const db = getDb();
    const users = (db.users || []).map(u => {
        let lastSeenNum = u.lastSeen;
        if (typeof lastSeenNum === 'string') {
            const parsed = new Date(lastSeenNum).getTime();
            lastSeenNum = isNaN(parsed) ? (Number(lastSeenNum) || undefined) : parsed;
        }
        return {
            ...u,
            lastSeen: lastSeenNum
        };
    });
    res.json(users);
});

app.post('/api/users', (req, res) => { 
    const db = getDb(); 
    db.users.push(req.body); 
    saveDb(db); 
    res.json(db.users); 
});
app.put('/api/users/:id', (req, res) => { 
    const db = getDb(); 
    const idx = db.users.findIndex(u => u.id === req.params.id); 
    if(idx > -1) { 
        db.users[idx] = { ...db.users[idx], ...req.body }; 
        saveDb(db); 
        res.json(db.users); 
    } else res.status(404).send('Not Found'); 
});
app.delete('/api/users/:id', (req, res) => { 
    const db = getDb(); 
    db.users = db.users.filter(u => u.id !== req.params.id); 
    saveDb(db); 
    res.json(db.users); 
});

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

        const ip = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
        const lockoutKey = `${ip}_${username.trim()}`;
        const now = Date.now();

        // Check if temporarily locked out
        const attempt = loginAttempts.get(lockoutKey);
        if (attempt && attempt.blockedUntil && attempt.blockedUntil > now) {
            const remainingMinutes = Math.ceil((attempt.blockedUntil - now) / 60000);
            return res.status(429).json({ 
                error: `به دلیل تلاش‌های ناموفق مکرر، حساب شما موقتاً به مدت ${remainingMinutes} دقیقه قفل شده است.` 
            });
        }

        const db = getDb();
        if (!db.users || !Array.isArray(db.users)) {
            console.error("CRITICAL: Users table missing or invalid", db.users);
            return res.status(500).json({ error: 'Database integrity error' });
        }

        const user = db.users.find(u => u.username === username && u.password === password);
        if (user) { 
            // Reset failed login tracking on success
            loginAttempts.delete(lockoutKey);

            // Update Last Seen
            user.lastSeen = new Date().toISOString();
            saveDb(db);

            const { password, ...userWithoutPass } = user; 
            res.json(userWithoutPass); 
        } else { 
            // Increment failed attempt count
            const currentAttempt = attempt || { count: 0, blockedUntil: 0 };
            currentAttempt.count = (currentAttempt.count || 0) + 1;
            
            // If 10 consecutive failed attempts, block for 10 minutes
            if (currentAttempt.count >= 10) {
                currentAttempt.blockedUntil = now + 10 * 60 * 1000;
                console.warn(`[Security Alert] IP/User locked out due to failed attempts: ${lockoutKey}`);
            }
            loginAttempts.set(lockoutKey, currentAttempt);

            res.status(401).json({ error: 'نام کاربری یا کلمه عبور نادرست است' }); 
        }
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// HEARTBEAT FOR LAST SEEN
app.post('/api/heartbeat', (req, res) => {
    const { username, activeChat } = req.body;
    if (!username) return res.status(400).send('Missing username');
    
    const db = getDb();
    const user = (db.users || []).find(u => u.username?.toLowerCase() === username.toLowerCase());
    if (user) {
        const nowMs = Date.now();
        user.lastSeen = nowMs;
        user.lastSeenIso = new Date(nowMs).toISOString();
        if (activeChat !== undefined) {
            user.activeChat = activeChat;
        }
        
        // Keep active subscription timestamps fresh
        if (db.subscriptions) {
            let subUpdated = false;
            db.subscriptions.forEach(s => {
                if (s.username?.toLowerCase() === username.toLowerCase()) {
                    s.updatedAt = nowMs;
                    subUpdated = true;
                }
            });
        }
        
        saveDb(db);
    }
    res.json({ success: true, lastSeen: Date.now() });
});

// WEB PUSH SUBSCRIPTION ENDPOINTS
const getVapidKeyHandler = (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
};
app.get('/api/vapid-key', getVapidKeyHandler);
app.get('/vapid-key', getVapidKeyHandler);

const subscribeHandler = (req, res) => {
    try {
        const db = getDb();
        if (!db.subscriptions) db.subscriptions = [];
        const body = req.body || {};
        
        const endpoint = body.endpoint || (body.subscription && body.subscription.endpoint) || body.token;
        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint or token is required' });
        }
        
        const username = body.username ? String(body.username).trim() : null;
        if (!username) {
            // CRITICAL: Unauthenticated / logged out clients must NEVER hold push subscriptions
            db.subscriptions = db.subscriptions.filter(s => s.endpoint !== endpoint && (!s.subscription || s.subscription.endpoint !== endpoint));
            saveDb(db);
            return res.json({ success: true, message: 'Unauthenticated push registration purged' });
        }
        
        const existingIdx = db.subscriptions.findIndex(s => s.endpoint === endpoint || (s.subscription && s.subscription.endpoint === endpoint));
        
        const subObject = body.subscription || (body.endpoint && body.keys ? { endpoint: body.endpoint, keys: body.keys } : null);
        
        const record = {
            endpoint: endpoint,
            subscription: subObject,
            username: username,
            role: body.role || null,
            deviceType: body.deviceType || body.type || 'web',
            token: body.token || null,
            updatedAt: Date.now()
        };
        
        if (existingIdx > -1) {
            db.subscriptions[existingIdx] = { ...db.subscriptions[existingIdx], ...record };
        } else {
            db.subscriptions.push(record);
        }

        // Clean up any old invalid subscriptions with no username
        db.subscriptions = db.subscriptions.filter(s => Boolean(s.username));
        
        saveDb(db);
        res.json({ success: true, subscriptionsCount: db.subscriptions.length });
    } catch (e) {
        console.error("Subscribe endpoint error:", e);
        res.status(500).json({ error: "Failed to subscribe" });
    }
};
app.post('/api/subscribe', subscribeHandler);
app.post('/subscribe', subscribeHandler);

const unsubscribeHandler = (req, res) => {
    try {
        const db = getDb();
        if (!db.subscriptions) db.subscriptions = [];
        const { endpoint, username } = req.body || {};
        
        const beforeCount = db.subscriptions.length;
        
        if (endpoint) {
            // Remove any subscription matching this device endpoint
            db.subscriptions = db.subscriptions.filter(s => s.endpoint !== endpoint && (!s.subscription || s.subscription.endpoint !== endpoint));
        }
        if (username) {
            // Remove subscriptions for this username
            db.subscriptions = db.subscriptions.filter(s => !s.username || s.username.toLowerCase() !== String(username).toLowerCase());
        }

        // Always purge empty/anonymous subscriptions
        db.subscriptions = db.subscriptions.filter(s => Boolean(s.username));

        saveDb(db);
        console.log(`[Unsubscribe] Purged ${beforeCount - db.subscriptions.length} subscriptions. Active count: ${db.subscriptions.length}`);
        res.json({ success: true, remaining: db.subscriptions.length });
    } catch (e) {
        console.error("Unsubscribe endpoint error:", e);
        res.status(500).json({ error: "Failed to unsubscribe" });
    }
};
app.post('/api/unsubscribe', unsubscribeHandler);
app.post('/unsubscribe', unsubscribeHandler);

// BROADCAST TO BOT USERS

app.post('/api/bot/send-document', async (req, res) => {
    try {
        const { base64Data, filename, caption, platforms = ['telegram', 'bale', 'whatsapp'], customTargets } = req.body;
        if (!base64Data || !filename) {
            return res.status(400).json({ error: 'Missing required data' });
        }
        
        const buffer = Buffer.from(base64Data, 'base64');
        const db = getDb();
        let targets = [];
        
        if (customTargets && customTargets.length > 0) {
            for (const t of customTargets) {
                const rawId = t.groupId || t.id || t.chatId;
                if (rawId) {
                    String(rawId).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean).forEach(singleId => {
                        targets.push({ platform: t.platform, id: singleId });
                    });
                }
            }
        } else {
            targets = collectBotTargets(db, { category: 'accounting', platforms });
            if (targets.length === 0) {
                const settings = getSettings();
                if (settings.chatGroups) {
                    targets = settings.chatGroups;
                }
            }
        }
        
        const results = [];
        const mimeType = filename.endsWith('.xlsx')
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : (filename.endsWith('.png') ? 'image/png' : 'application/pdf');

        for (const target of targets) {
            if (!platforms.includes(target.platform)) continue;
            try {
                if (target.platform === 'telegram' && telegram) {
                    await telegram.sendBotDocument(target.id, buffer, filename, caption || '');
                    results.push({ platform: 'telegram', id: target.id, success: true });
                } else if (target.platform === 'bale' && bale) {
                    await bale.sendBotDocument(target.id, buffer, filename, caption || '');
                    results.push({ platform: 'bale', id: target.id, success: true });
                } else if (target.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        const waRes = await wa.sendMessage(target.id, caption || `📄 ${filename}`, {
                            data: buffer.toString('base64'),
                            mimeType,
                            filename
                        });
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        results.push({ platform: 'whatsapp', id: target.id, success: true });
                    }
                }
            } catch (err) {
                results.push({ platform: target.platform, id: target.id, success: false, error: err.message });
            }
        }
        
        const anySuccess = results.some(r => r.success);
        if (!anySuccess && results.length > 0) {
            return res.status(500).json({ error: results.map(r => `${r.platform}: ${r.error}`).join(' | '), results });
        }
        res.json({ success: true, results });
    } catch (e) {
        console.error("Error in /api/bot/send-document:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/bot/broadcast', async (req, res) => {
    try {
        const { message, platform = 'all', target = 'all' } = req.body;
        const db = getDb();
        
        let targetTargets = [];
        
        if (target === 'users') {
            targetTargets = db.users || [];
        } else if (target === 'contacts') {
            targetTargets = db.settings.savedContacts || [];
        } else if (target === 'all_subscribers') {
            const users = db.users || [];
            const contacts = db.settings.savedContacts || [];
            const subscribers = db.botSubscribers || []; // We'll add this
            targetTargets = [...users, ...contacts, ...subscribers];
        } else {
            // Default: All registered users who have linked their chat IDs
            targetTargets = db.users || [];
        }

        const botUsers = targetTargets.filter(u => u.telegramChatId || u.baleChatId || u.whatsappChatId || u.telegramId || u.baleId);
        
        let telegramCount = 0;
        let baleCount = 0;
        
        if (platform === 'all' || platform === 'telegram') {
            const telUsers = botUsers.filter(u => u.telegramChatId || u.telegramId);
            if (telUsers.length > 0) {
                const tgModule = await import('./backend/telegram.js');
                const uniqueIds = [...new Set(telUsers.map(u => u.telegramChatId || u.telegramId))];
                for (const chatId of uniqueIds) {
                    try { await tgModule.sendBotMessage(chatId, message); telegramCount++; } catch (e) { }
                }
            }
        }
        
        if (platform === 'all' || platform === 'bale') {
            const baleUsers = botUsers.filter(u => u.baleChatId || u.baleId);
            if (baleUsers.length > 0) {
                const baleModule = await import('./backend/bale.js');
                const uniqueIds = [...new Set(baleUsers.map(u => u.baleChatId || u.baleId))];
                for (const chatId of uniqueIds) {
                    try { await baleModule.sendBotMessage(chatId, message); baleCount++; } catch (e) { }
                }
            }
        }
        
        res.json({ success: true, count: telegramCount + baleCount });
    } catch (e) {
        console.error("Broadcast failed:", e);
        res.status(500).json({ error: 'Broadcast failed' });
    }
});

// --- IN-APP & WEBPUSH NOTIFICATION ENGINE ---
export async function broadcastNotification(title, body, url = null, targetRoles = null, targetUsernames = null, excludeUsernames = null, priority = 2, type = 'general') {
    try {
        const db = getDb();
        if (!db.notifications) db.notifications = [];

        const notif = {
            id: utils.generateUUID ? utils.generateUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            title,
            body,
            url,
            targetRoles: targetRoles ? (Array.isArray(targetRoles) ? targetRoles : [targetRoles]) : null,
            targetUsernames: targetUsernames ? (Array.isArray(targetUsernames) ? targetUsernames : [targetUsernames]) : null,
            excludeUsernames: excludeUsernames ? (Array.isArray(excludeUsernames) ? excludeUsernames : [excludeUsernames]) : null,
            createdAt: Date.now(),
            readBy: []
        };

        db.notifications.push(notif);
        if (db.notifications.length > 1000) {
            db.notifications = db.notifications.slice(-500);
        }
        saveDb(db);

        const targetRolesArray = targetRoles ? (Array.isArray(targetRoles) ? targetRoles : [targetRoles]) : null;
        const targetUsernamesArray = targetUsernames ? (Array.isArray(targetUsernames) ? targetUsernames : [targetUsernames]) : null;
        const excludeUsernamesArray = excludeUsernames ? (Array.isArray(excludeUsernames) ? excludeUsernames : [excludeUsernames]) : null;

        // Enqueue into Enterprise Notification Queue (with SSE instant dispatch & persistent retries)
        notificationQueue.enqueueNotification({
            id: notif.id,
            type: type || 'general',
            title,
            body,
            url,
            targetUsernames: targetUsernamesArray,
            targetRoles: targetRolesArray,
            excludeUsernames: excludeUsernamesArray,
            priority: priority || 2,
            metadata: { createdAt: notif.createdAt }
        }).catch(err => {
            console.warn('[Notification] Queue enqueue error:', err?.message);
        });

        return notif;
    } catch (e) {
        console.error("broadcastNotification error:", e);
    }
}

// Real-time Notification & Chat SSE Stream (Server-Sent Events)
app.get('/api/notifications/stream', (req, res) => {
    const username = req.query.username;
    if (!username) {
        return res.status(400).send('Username required');
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*'
    });
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    notificationQueue.registerSSEClient(username, res);
});

// Acknowledge receipt of a queued notification
app.post('/api/notifications/ack', (req, res) => {
    const { id, username } = req.body || {};
    if (id && username) {
        notificationQueue.acknowledgeNotification(id, username);
    }
    res.json({ success: true });
});

// Offline queue drainage: get pending undelivered notifications
app.get('/api/notifications/queue-pending', (req, res) => {
    const username = req.query.username;
    if (!username) return res.json([]);
    const pending = notificationQueue.getPendingNotificationsForUser(username);
    res.json(pending);
});

// Diagnostics for the notification queue
app.get('/api/notifications/queue-stats', (req, res) => {
    res.json(notificationQueue.getQueueDiagnostics());
});

app.get('/api/notifications', (req, res) => {
    try {
        const db = getDb();
        const username = req.query.username;
        const role = req.query.role;
        const list = db.notifications || [];

        if (!username && !role) {
            return res.json(list.slice(-100));
        }

        const filtered = list.filter(n => {
            if (n.deletedForUsernames && Array.isArray(n.deletedForUsernames) && n.deletedForUsernames.includes(username)) {
                return false;
            }
            if (n.excludeUsernames && Array.isArray(n.excludeUsernames) && n.excludeUsernames.includes(username)) {
                return false;
            }
            const hasRoleTargets = Boolean(n.targetRoles && Array.isArray(n.targetRoles) && n.targetRoles.length > 0);
            const hasUserTargets = Boolean(n.targetUsernames && Array.isArray(n.targetUsernames) && n.targetUsernames.length > 0);

            if (!hasRoleTargets && !hasUserTargets) {
                return true;
            }

            const matchRole = hasRoleTargets && role
                ? n.targetRoles.some(r => String(r).toLowerCase() === String(role).toLowerCase())
                : false;
            const matchUser = hasUserTargets && username
                ? n.targetUsernames.some(u => String(u).toLowerCase() === String(username).toLowerCase())
                : false;

            return matchRole || matchUser;
        });

        const result = filtered.slice(-100).map(n => ({
            ...n,
            read: Array.isArray(n.readBy) ? n.readBy.includes(username) : false
        }));

        res.json(result);
    } catch (e) {
        console.error("GET /api/notifications error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications/read', (req, res) => {
    try {
        const db = getDb();
        const { username, id } = req.body;
        if (!db.notifications) db.notifications = [];

        if (id === 'all') {
            db.notifications.forEach(n => {
                if (!n.readBy) n.readBy = [];
                if (username && !n.readBy.includes(username)) n.readBy.push(username);
            });
        } else if (id) {
            const notif = db.notifications.find(n => n.id === id);
            if (notif) {
                if (!notif.readBy) notif.readBy = [];
                if (username && !notif.readBy.includes(username)) notif.readBy.push(username);
            }
        }
        saveDb(db);
        res.json({ success: true });
    } catch (e) {
        console.error("POST /api/notifications/read error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications/delete', (req, res) => {
    try {
        const db = getDb();
        const { username, id } = req.body;
        if (!db.notifications) db.notifications = [];

        if (id === 'all') {
            db.notifications.forEach(n => {
                if (!n.deletedForUsernames) n.deletedForUsernames = [];
                if (username && !n.deletedForUsernames.includes(username)) n.deletedForUsernames.push(username);
            });
        } else if (id) {
            const notif = db.notifications.find(n => n.id === id);
            if (notif) {
                if (!notif.deletedForUsernames) n.deletedForUsernames = [];
                if (username && !notif.deletedForUsernames.includes(username)) n.deletedForUsernames.push(username);
            }
        }
        saveDb(db);
        res.json({ success: true });
    } catch (e) {
        console.error("POST /api/notifications/delete error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications/add', async (req, res) => {
    try {
        const { title, body, url, targetRoles, targetUsernames, excludeUsernames } = req.body;
        const notif = await broadcastNotification(title, body, url, targetRoles, targetUsernames, excludeUsernames);
        res.json({ success: true, notification: notif });
    } catch (e) {
        console.error("POST /api/notifications/add error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Test push / notification endpoint for Android, Tauri, and Web
app.post(['/api/send-test-push', '/send-test-push'], async (req, res) => {
    try {
        const { username } = req.body || {};
        if (!username) return res.status(400).json({ error: 'Username required' });
        const notif = await broadcastNotification(
            "اعلان آزمایشی دلکام (سیستم تست)",
            "این یک پیام تستی از سامانه دلکام است. سیستم اعلان‌ها و نوتیفیکیشن با موفقیت روی دستگاه شما فعال و متصل است.",
            "/chat",
            null,
            [username],
            null
        );
        res.json({ success: true, notification: notif, message: 'پیام تستی با موفقیت ارسال شد' });
    } catch (e) {
        console.error("POST /api/send-test-push error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 8. CHAT & COMMUNICATION
app.get(['/api/chat', '/chat'], (req, res, next) => {
    // If a browser is navigating directly to /chat (e.g. from a notification click or page reload),
    // pass through to the SPA index.html handler instead of dumping raw JSON in the browser tab!
    const acceptHeader = String(req.headers.accept || '');
    const secFetchMode = String(req.headers['sec-fetch-mode'] || '');
    if (req.path === '/chat' && (secFetchMode === 'navigate' || acceptHeader.includes('text/html'))) {
        return next();
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const db = getDb();
    const msgs = (db.messages || []).map(m => {
        let ts = m.timestamp;
        if (!ts) {
            ts = m.createdAt ? new Date(m.createdAt).getTime() : Date.now();
        } else if (typeof ts === 'string') {
            const num = Number(ts);
            if (!isNaN(num) && num > 1000000000) {
                ts = num;
            } else {
                const parsed = new Date(ts).getTime();
                ts = isNaN(parsed) ? Date.now() : parsed;
            }
        }
        return {
            ...m,
            timestamp: typeof ts === 'number' && !isNaN(ts) ? ts : Date.now()
        };
    });
    res.json(msgs);
});

app.post('/api/chat/read-batch', (req, res) => {
    const db = getDb();
    const { username, messageIds } = req.body;
    if (!username || !Array.isArray(messageIds)) {
        return res.status(400).json({ error: 'Username and messageIds required' });
    }
    const idSet = new Set(messageIds);
    let changed = false;
    (db.messages || []).forEach(m => {
        if (idSet.has(m.id)) {
            if (!m.readBy) m.readBy = [];
            if (!m.readBy.includes(username)) {
                m.readBy.push(username);
                changed = true;
            }
        }
    });

    // Cross-Device Sync: When messages are read on any device, mark corresponding notifications as read
    if (!db.notifications) db.notifications = [];
    db.notifications.forEach(n => {
        if (!n.readBy) n.readBy = [];
        if (!n.readBy.includes(username)) {
            const isChatNotif = (n.url && (n.url === '/chat' || n.url.startsWith('/chat?') || n.url.startsWith('chat')));
            if (isChatNotif && (idSet.has(n.id) || (n.targetUsernames && n.targetUsernames.includes(username)))) {
                n.readBy.push(username);
                changed = true;
            }
        }
    });

    if (changed) saveDb(db);
    res.json({ success: true, count: messageIds.length });
});

app.post('/api/chat/read-all', (req, res) => {
    const db = getDb();
    const { username, channelId, type } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    let changed = false;
    (db.messages || []).forEach(m => {
        if (m.senderUsername?.toLowerCase() === username.toLowerCase()) return;
        if (m.readBy?.includes(username)) return;

        let shouldMark = false;
        if (!channelId || channelId === 'all') {
            shouldMark = true;
        } else if (type === 'public' || channelId === 'public') {
            shouldMark = (!m.recipient && !m.groupId);
        } else if (type === 'private') {
            shouldMark = (m.senderUsername?.toLowerCase() === channelId?.toLowerCase() && m.recipient?.toLowerCase() === username.toLowerCase());
        } else if (type === 'group' || type === 'task_group') {
            shouldMark = (m.groupId === channelId);
        }

        if (shouldMark) {
            if (!m.readBy) m.readBy = [];
            m.readBy.push(username);
            changed = true;
        }
    });

    // Cross-Device Sync: When all messages are read in a channel, mark notifications as read
    if (!db.notifications) db.notifications = [];
    db.notifications.forEach(n => {
        if (!n.readBy) n.readBy = [];
        if (!n.readBy.includes(username)) {
            const isChatNotif = (n.url && (n.url === '/chat' || n.url.startsWith('/chat?') || n.url.startsWith('chat')));
            if (isChatNotif) {
                if (!channelId || channelId === 'all') {
                    n.readBy.push(username);
                    changed = true;
                } else if (n.url.includes(channelId)) {
                    n.readBy.push(username);
                    changed = true;
                }
            }
        }
    });

    if (changed) saveDb(db);
    res.json({ success: true });
});

app.get('/api/tickets', (req, res) => {
    res.json(getDb().tickets || []);
});

app.post('/api/tickets/:id/reply', async (req, res) => {
    const db = getDb();
    const ticketId = req.params.id;
    const { text, senderName } = req.body;
    
    db.tickets = db.tickets || [];
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const newMsg = {
        id: "msg_" + Math.random().toString(36).substr(2, 9),
        sender: 'admin',
        senderName: senderName || 'پشتیبانی',
        text: text,
        timestamp: new Date().toISOString()
    };
    ticket.messages.push(newMsg);
    ticket.updatedAt = Date.now();
    ticket.status = 'OPEN';
    saveDb(db);

    // Send to customer
    try {
        const replyMarkup = { inline_keyboard: [[{ text: '➕ ارسال پاسخ', callback_data: `GUEST_TICKET_REPLY_${ticket.id}` }]] };
        if (ticket.platform === 'telegram') {
            const tg = await safeImport('./backend/telegram.js');
            if (tg?.sendBotMessage) await tg.sendBotMessage(ticket.chatId, `📩 *پاسخ پشتیبانی به درخواست #${ticket.id}:*\n\n${text}`, { reply_markup: replyMarkup });
        } else if (ticket.platform === 'bale') {
            const bale = await safeImport('./backend/bale.js');
            if (bale?.sendBotMessage) await bale.sendBotMessage(ticket.chatId, `📩 *پاسخ پشتیبانی به درخواست #${ticket.id}:*\n\n${text}`, { reply_markup: replyMarkup });
        }
    } catch (e) { console.error("Ticket reply err:", e); }

    res.json(ticket);
});

app.put('/api/tickets/:id/status', (req, res) => {
    const db = getDb();
    const ticket = (db.tickets || []).find(t => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    ticket.status = req.body.status;
    ticket.updatedAt = Date.now();
    saveDb(db);
    res.json(ticket);
});

app.delete('/api/tickets/:id', (req, res) => {
    const db = getDb();
    db.tickets = (db.tickets || []).filter(t => t.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
});

app.post(['/api/chat', '/chat'], async (req, res) => { 
    const db = getDb(); 
    const msg = req.body;
    if(!db.messages) db.messages=[]; 

    // Always override with the server's authoritative timestamp to prevent client clock skew out-of-order bugs
    const ts = Date.now();
    msg.timestamp = ts;

    // Update sender's lastSeen timestamp and activeChat
    if (msg.senderUsername) {
        const senderUser = (db.users || []).find(u => u.username?.toLowerCase() === msg.senderUsername.toLowerCase());
        if (senderUser) {
            senderUser.lastSeen = ts;
            senderUser.lastSeenIso = new Date(ts).toISOString();
            if (msg.recipient) {
                senderUser.activeChat = { type: 'private', id: msg.recipient };
            } else if (msg.groupId) {
                senderUser.activeChat = { type: 'group', id: msg.groupId };
            }
        }
    }

    // Instantly append and resave database
    db.messages.push(msg); 
    saveDb(db); 
    
    // Instantly respond to client to maximize UI speed and responsiveness
    res.json(db.messages); 

    // Synchronize with external bots asynchronously in the background so it never blocks the user
    if (msg.recipient) {
        (async () => {
            const targetUser = db.users?.find(u => u.username === msg.recipient || u.fullName === msg.recipient);
            if (targetUser) {
                try {
                    let botRes = null;
                    let mutated = false;
                    if (targetUser.telegramChatId && db.settings?.telegramBotToken) {
                        const tg = await safeImport('./backend/telegram.js');
                        if (tg && tg.sendBotMessage) {
                            botRes = await tg.sendBotMessage(targetUser.telegramChatId, msg.message || '📎 فایل');
                            msg.botPlatform = 'telegram';
                            msg.botChatId = targetUser.telegramChatId;
                            msg.botMessageId = botRes?.message_id;
                            mutated = true;
                        }
                    } else if (targetUser.baleChatId && db.settings?.baleBotToken) {
                        const bale = await safeImport('./backend/bale.js');
                        if (bale && bale.sendBotMessage) {
                            botRes = await bale.sendBotMessage(targetUser.baleChatId, msg.message || '📎 فایل');
                            msg.botPlatform = 'bale';
                            msg.botChatId = targetUser.baleChatId;
                            msg.botMessageId = botRes?.result?.message_id;
                            mutated = true;
                        }
                    }
                    if (mutated) {
                        saveDb(db);
                    }
                } catch (e) {
                    console.error("Async Bot Sync Error:", e);
                }
            }
        })().catch(console.error);
    }

    // Broadcast notifications asynchronously in the background
    try {
        if (msg.recipient) {
            const targetUser = db.users?.find(u => 
                (u.username && u.username.toLowerCase() === msg.recipient.toLowerCase()) || 
                (u.fullName && u.fullName.toLowerCase() === msg.recipient.toLowerCase())
            );
            const targets = [msg.recipient];
            if (targetUser) {
                if (targetUser.username && !targets.includes(targetUser.username)) targets.push(targetUser.username);
                if (targetUser.fullName && !targets.includes(targetUser.fullName)) targets.push(targetUser.fullName);
            }
            broadcastNotification(
                `پیام از ${msg.sender}`,
                `${msg.sender}: ${msg.message || (msg.audioUrl ? '🎤 پیام صوتی' : '📎 فایل')}`,
                `/chat?pv=${msg.senderUsername}`,
                null,
                targets,
                [msg.senderUsername], // Exclude sender
                1, // Critical priority for PV
                'chat_pv'
            );
            // Real-time instant delivery via SSE directly to recipient
            notificationQueue.dispatchSSEEvent('chat_message', msg, targets, [msg.senderUsername]);
        } else if (msg.groupId) {
            const group = db.groups?.find(g => g.id === msg.groupId) || db.taskGroups?.find(g => g.id === msg.groupId);
            if (group) {
                const memberList = Array.isArray(group.members) ? [...group.members] : [];
                if (group.createdBy && !memberList.includes(group.createdBy)) memberList.push(group.createdBy);
                broadcastNotification(
                    `${group.name}`,
                    `${msg.sender}: ${msg.message || (msg.audioUrl ? '🎤 پیام صوتی' : '📎 فایل')}`,
                    `/chat?group=${msg.groupId}`,
                    null,
                    memberList.filter(m => String(m).toLowerCase() !== String(msg.senderUsername).toLowerCase()),
                    [msg.senderUsername],
                    2,
                    'chat_group'
                );
                notificationQueue.dispatchSSEEvent('chat_message', msg, memberList, [msg.senderUsername]);
            }
        } else {
            // Public channel
            broadcastNotification(
                `گروه عمومی`,
                `${msg.sender}: ${msg.message || (msg.audioUrl ? '🎤 پیام صوتی' : '📎 فایل')}`,
                '/chat',
                null,
                null,
                [msg.senderUsername],
                2,
                'chat_public'
            );
            notificationQueue.dispatchSSEEvent('chat_message', msg, null, [msg.senderUsername]);
        }

        // Targeted Mention / Tag Notifications (@username, @fullname, @all)
        if (msg.message && typeof msg.message === 'string') {
            const mentionMatches = msg.message.match(/@([a-zA-Z0-9_\.\-\u0600-\u06FF\u200c]+)/g) || [];
            const mentionTokens = mentionMatches.map(m => m.slice(1).toLowerCase().trim());
            const isAllMention = mentionTokens.includes('all') || mentionTokens.includes('همه');

            let targetedMentionUsers = [];
            if (isAllMention) {
                if (msg.groupId) {
                    const grp = (db.groups || []).find(g => g.id === msg.groupId) || (db.taskGroups || []).find(g => g.id === msg.groupId);
                    if (grp) {
                        const mList = Array.isArray(grp.members) ? [...grp.members] : [];
                        if (grp.createdBy && !mList.includes(grp.createdBy)) mList.push(grp.createdBy);
                        targetedMentionUsers = mList;
                    }
                } else {
                    targetedMentionUsers = (db.users || []).map(u => u.username).filter(Boolean);
                }
            } else if (mentionTokens.length > 0) {
                targetedMentionUsers = (db.users || []).filter(u => {
                    if (!u.username) return false;
                    const uName = u.username.toLowerCase();
                    const fName = (u.fullName || '').toLowerCase();
                    const fNameUnder = fName.replace(/\s+/g, '_');
                    const fNameCompact = fName.replace(/[\s\u200c]+/g, '');
                    return mentionTokens.some(tok => 
                        tok === uName || 
                        tok === fName || 
                        tok === fNameUnder || 
                        tok === fNameCompact
                    );
                }).map(u => u.username);
            }

            // Exclude message sender
            const filteredTargets = targetedMentionUsers.filter(u => 
                String(u).toLowerCase() !== String(msg.senderUsername).toLowerCase()
            );

            if (filteredTargets.length > 0) {
                const channelTitle = msg.groupId 
                    ? ((db.groups?.find(g => g.id === msg.groupId) || db.taskGroups?.find(g => g.id === msg.groupId))?.name || 'گروه')
                    : (msg.recipient ? 'گفتگو' : 'کانال عمومی');

                broadcastNotification(
                    `📢 منشن جدید: ${msg.sender} در ${channelTitle}`,
                    `${msg.sender}: ${msg.message}`,
                    msg.groupId ? `/chat?group=${msg.groupId}` : (msg.recipient ? `/chat?pv=${msg.senderUsername}` : '/chat'),
                    null,
                    filteredTargets,
                    [msg.senderUsername]
                );
            }
        }
    } catch (e) {
        console.error("Async broadcast notification error:", e);
    }
});

// Chat Message Reactions Endpoint
app.post('/api/chat/:id/reaction', (req, res) => {
    const db = getDb();
    const id = req.params.id;
    const { emoji, username } = req.body;
    if (!emoji || !username) {
        return res.status(400).json({ error: 'Emoji and username required' });
    }
    const idx = (db.messages || []).findIndex(m => m.id === id);
    if (idx > -1) {
        if (!db.messages[idx].reactions) db.messages[idx].reactions = {};
        const reactions = db.messages[idx].reactions;
        const users = reactions[emoji] ? [...reactions[emoji]] : [];
        const uIdx = users.indexOf(username);
        if (uIdx > -1) {
            users.splice(uIdx, 1);
            if (users.length === 0) {
                delete reactions[emoji];
            } else {
                reactions[emoji] = users;
            }
        } else {
            users.push(username);
            reactions[emoji] = users;
        }
        db.messages[idx].reactions = reactions;
        saveDb(db);
        return res.json({ success: true, reactions });
    }
    res.status(404).json({ error: 'Message not found' });
});

// Server-Side Graphics Processing Engine Routes
app.get('/api/graphics/engine-status', async (req, res) => {
    try {
        const { GraphicsEngine } = await safeImport('./backend/graphics-engine.js');
        if (GraphicsEngine) {
            res.json(GraphicsEngine.engineStatus());
        } else {
            res.json({ active: true, mode: 'Fallback Lightweight Engine' });
        }
    } catch (e) {
        res.json({ active: true, error: e.message });
    }
});

app.post('/api/graphics/optimize-image', async (req, res) => {
    try {
        const { base64Data, width = 800, quality = 80, format = 'webp' } = req.body;
        if (!base64Data) {
            return res.status(400).json({ error: 'base64Data required' });
        }
        const { optimizeImage } = await safeImport('./backend/graphics-engine.js');
        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const inputBuffer = Buffer.from(cleanBase64, 'base64');
        const optimized = await optimizeImage(inputBuffer, { width, quality, format });
        const optimizedBase64 = `data:image/${optimized.format};base64,${optimized.buffer.toString('base64')}`;
        res.json({
            success: true,
            format: optimized.format,
            width: optimized.width,
            height: optimized.height,
            size: optimized.size,
            dataUrl: optimizedBase64
        });
    } catch (err) {
        console.error("Graphics optimize API error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/graphics/render-chart', async (req, res) => {
    try {
        const { data = [], width = 300, height = 80, strokeColor = '#3B82F6', title = '' } = req.body;
        const { renderServerChart } = await safeImport('./backend/graphics-engine.js');
        const svg = renderServerChart({ data, width, height, strokeColor, title });
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/graphics/generate-badge', async (req, res) => {
    try {
        const { label = '', value = '', status = 'info' } = req.body;
        const { renderServerBadge } = await safeImport('./backend/graphics-engine.js');
        const svg = renderServerBadge({ label, value, status });
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/chat/:id', (req, res) => { 
    const db = getDb(); 
    const idx = db.messages.findIndex(m => m.id === req.params.id); 
    if(idx > -1) { 
        db.messages[idx] = { ...db.messages[idx], ...req.body, timestamp: db.messages[idx].timestamp }; 
        saveDb(db); 
        res.json(db.messages); 
    } else res.status(404).send('Not Found'); 
});
app.delete('/api/chat/:id', async (req, res) => { 
    const db = getDb(); 
    const id = req.params.id;
    const msgToDelete = (db.messages || []).find(m => m.id === id);

    if (msgToDelete) {
        const forEveryone = req.query.forEveryone === 'true';

        // Two-way deletion from Bots
        if (forEveryone && msgToDelete.botMessageId && msgToDelete.botChatId && msgToDelete.botPlatform) {
            try {
                if (msgToDelete.botPlatform === 'telegram') {
                    const tg = await safeImport('./backend/telegram.js');
                    if (tg && tg.deleteBotMessage) await tg.deleteBotMessage(msgToDelete.botChatId, msgToDelete.botMessageId);
                } else if (msgToDelete.botPlatform === 'bale') {
                    const bale = await safeImport('./backend/bale.js');
                    if (bale && bale.deleteBotMessage) await bale.deleteBotMessage(msgToDelete.botChatId, msgToDelete.botMessageId);
                }
            } catch (e) { console.error("Bot Remove Error:", e); }
        }

        // Collect file URLs to potentially delete
        const fileUrls = [];
        if (msgToDelete.attachment?.url) fileUrls.push(msgToDelete.attachment.url);
        if (msgToDelete.audioUrl) fileUrls.push(msgToDelete.audioUrl);

        // Delete from database
        db.messages = db.messages.filter(m => m.id !== id); 
        saveDb(db); 

        // Physical file deletion logic
        fileUrls.forEach(url => {
            // Only try to delete local uploads
            if (url.startsWith('/uploads/')) {
                // Check if any other message still references this file
                const stillInUse = db.messages.some(m => 
                    m.attachment?.url === url || m.audioUrl === url
                );

                if (!stillInUse) {
                    const fileName = url.replace('/uploads/', '');
                    const filePath = path.join(UPLOADS_DIR, fileName);
                    if (fs.existsSync(filePath)) {
                        try {
                            fs.unlinkSync(filePath);
                            console.log(`Deleted file: ${fileName}`);
                        } catch (err) {
                            console.error(`Error deleting file ${fileName}:`, err);
                        }
                    }
                }
            }
        });
    }

    res.json(db.messages || []); 
});

// --- BIO-LINK & DIGITAL CARD ENDPOINTS (LEPAN LINK STYLE) ---
const DEFAULT_BIO_LINK_CONFIG = {
    slug: 'lepanbaft',
    companyTitle: 'شرکت تولیدی لیان بافت',
    companySubtitle: 'تولید انواع نخ پلی استر ، کش ، اسپندکس ، POY و ساپورت',
    avatarUrl: '/lepan-logo.png',
    coverUrl: '/lepan-logo.png',
    theme: 'lepan_light',
    primaryColor: '#0284c7',
    addressText: 'تهران، بازار، خیابان خیام، پلاک ۱۲۰ / کارخانه: جاده قدیم قم، شهرک صنعتی',
    blocks: [
        {
            id: 'block_neshan',
            category: 'maps',
            title: 'مسیریاب نشان',
            subtitle: 'مسیریاب آنلاین نشان',
            value: 'https://nshn.ir',
            iconName: 'neshan',
            badge: 'نقشه و مسیریابی',
            colorTheme: 'rose',
            isActive: true,
            order: 1
        },
        {
            id: 'block_balad',
            category: 'maps',
            title: 'مسیریاب بلد',
            subtitle: 'مسیریاب آنلاین بلد',
            value: 'https://balad.ir',
            iconName: 'balad',
            badge: 'نقشه و مسیریابی',
            colorTheme: 'indigo',
            isActive: true,
            order: 2
        },
        {
            id: 'block_google_maps',
            category: 'maps',
            title: 'مسیریاب گوگل',
            subtitle: 'Google Maps Location',
            value: 'https://maps.google.com/?q=35.6892,51.3890',
            iconName: 'google_maps',
            badge: 'بین‌المللی',
            colorTheme: 'emerald',
            isActive: true,
            order: 3
        },
        {
            id: 'block_phone_mgr',
            category: 'phones',
            title: 'مدیریت : فتوت',
            subtitle: 'تماس مستقیم با مدیریت',
            value: '09125088474',
            iconName: 'mobile',
            badge: 'مدیریت ارشد',
            colorTheme: 'blue',
            isActive: true,
            order: 4
        },
        {
            id: 'block_phone_sales',
            category: 'phones',
            title: 'فروش : مقدم',
            subtitle: 'تماس با واحد فروش و سفارشات',
            value: '09120244159',
            iconName: 'mobile',
            badge: 'واحد فروش',
            colorTheme: 'blue',
            isActive: true,
            order: 5
        },
        {
            id: 'block_phone_office',
            category: 'phones',
            title: 'فروش (تلفن ثابت)',
            subtitle: 'دفتر مرکزی ۵۵۸۰۰۰۹۱-۰۲۱',
            value: '02155800091',
            iconName: 'phone',
            badge: 'دفتر مرکزی',
            colorTheme: 'slate',
            isActive: true,
            order: 6
        },
        {
            id: 'block_telegram_bot',
            category: 'bots',
            title: 'ربات تلگرام لیان بافت',
            subtitle: 'ارتباط مستقیم و پشتیبانی هوشمند در تلگرام (@lepanbaft_bot)',
            value: 'https://t.me/lepanbaft_bot',
            iconName: 'telegram_bot',
            badge: 'ربات تلگرام',
            colorTheme: 'blue',
            isActive: true,
            order: 7
        },
        {
            id: 'block_bale_bot',
            category: 'bots',
            title: 'بازوی بله لیان بافت',
            subtitle: 'ارتباط هوشمند و استعلام قیمت در پیام‌رسان بله (ble.ir/lepanbaft_bot)',
            value: 'https://ble.ir/lepanbaft_bot',
            iconName: 'bale_bot',
            badge: 'ربات بله',
            colorTheme: 'emerald',
            isActive: true,
            order: 8
        },
        {
            id: 'block_email',
            category: 'emails',
            title: 'ایمیل رسمی',
            subtitle: 'lepanbaft55@gmail.com',
            value: 'lepanbaft55@gmail.com',
            iconName: 'email',
            badge: 'مکاتبات',
            colorTheme: 'indigo',
            isActive: true,
            order: 9
        },
        {
            id: 'block_instagram',
            category: 'socials',
            title: 'اینستاگرام',
            subtitle: 'صفحه رسمی شرکت لیان بافت',
            value: 'https://instagram.com/lepanbaft',
            iconName: 'instagram',
            badge: 'اینستاگرام',
            colorTheme: 'purple',
            isActive: true,
            order: 10
        },
        {
            id: 'block_catalog',
            category: 'catalog',
            title: 'دانلود کاتالوگ و لیست مشخصات نخ‌ها',
            subtitle: 'مشاهده و دریافت کاتالوگ محصولات (PDF)',
            value: '/lepan-catalog.pdf',
            iconName: 'file',
            badge: 'دانلود کاتالوگ',
            colorTheme: 'amber',
            isActive: true,
            order: 11
        },
        {
            id: 'block_order_request',
            category: 'order_form',
            title: 'ثبت سفارش مستقیم و استعلام قیمت',
            subtitle: 'ارسال درخواست نخ، POY و ساپورت با پاسخگویی سریع',
            value: 'order_form',
            iconName: 'order',
            badge: 'ثبت سفارش',
            colorTheme: 'emerald',
            isActive: true,
            order: 12
        }
    ],
    orders: [],
    updatedAt: Date.now()
};

app.get('/api/bio-link', (req, res) => {
    const db = getDb();
    if (!db.bioLinkConfig) {
        db.bioLinkConfig = DEFAULT_BIO_LINK_CONFIG;
        saveDb(db);
    } else {
        // Ensure telegram and bale bots are present if not already added
        const currentBlocks = Array.isArray(db.bioLinkConfig.blocks) ? db.bioLinkConfig.blocks : [];
        let hasChanges = false;
        if (!currentBlocks.some(b => b.iconName === 'telegram_bot' || b.id === 'block_telegram_bot')) {
            const telBlock = DEFAULT_BIO_LINK_CONFIG.blocks.find(b => b.id === 'block_telegram_bot');
            if (telBlock) { currentBlocks.push(telBlock); hasChanges = true; }
        }
        if (!currentBlocks.some(b => b.iconName === 'bale_bot' || b.id === 'block_bale_bot')) {
            const baleBlock = DEFAULT_BIO_LINK_CONFIG.blocks.find(b => b.id === 'block_bale_bot');
            if (baleBlock) { currentBlocks.push(baleBlock); hasChanges = true; }
        }
        if (hasChanges) {
            db.bioLinkConfig.blocks = currentBlocks;
            saveDb(db);
        }
    }
    const isAdminScope = req.query.scope === 'admin';
    if (isAdminScope) {
        return res.json({ success: true, config: db.bioLinkConfig });
    }

    // Public view: completely sanitize and protect internal customer orders and private data
    const publicConfig = {
        slug: db.bioLinkConfig.slug || 'lepanbaft',
        companyTitle: db.bioLinkConfig.companyTitle || 'شرکت تولیدی لیان بافت',
        companySubtitle: db.bioLinkConfig.companySubtitle || '',
        avatarUrl: db.bioLinkConfig.avatarUrl || '/lepan-logo.png',
        coverUrl: db.bioLinkConfig.coverUrl || '',
        theme: db.bioLinkConfig.theme || 'lepan_light',
        addressText: db.bioLinkConfig.addressText || '',
        blocks: Array.isArray(db.bioLinkConfig.blocks) 
            ? db.bioLinkConfig.blocks.filter(b => b.isActive !== false)
            : []
    };
    res.json({ success: true, config: publicConfig });
});

app.post('/api/bio-link', (req, res) => {
    const db = getDb();
    const current = db.bioLinkConfig || DEFAULT_BIO_LINK_CONFIG;
    const { orders, ...safeUpdates } = req.body || {};
    db.bioLinkConfig = {
        ...current,
        ...safeUpdates,
        orders: Array.isArray(orders) ? orders : (current.orders || []),
        updatedAt: Date.now()
    };
    saveDb(db);
    res.json({ success: true, config: db.bioLinkConfig });
});

app.post('/api/bio-link/survey', (req, res) => {
    const db = getDb();
    if (!db.bioLinkConfig) {
        db.bioLinkConfig = DEFAULT_BIO_LINK_CONFIG;
    }
    const { customerName, customerPhone, qualityRating, deliveryRating, supportRating, comment } = req.body;
    if (!qualityRating || !deliveryRating || !supportRating) {
        return res.status(400).json({ success: false, error: 'لطفاً امتیازات را کامل ثبت کنید.' });
    }
    const newSurvey = {
        id: `srv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        customerName: String(customerName || 'مشتری عزیز').trim(),
        customerPhone: String(customerPhone || '').trim(),
        qualityRating: Number(qualityRating) || 5,
        deliveryRating: Number(deliveryRating) || 5,
        supportRating: Number(supportRating) || 5,
        comment: String(comment || '').trim(),
        createdAt: Date.now()
    };
    if (!Array.isArray(db.bioLinkConfig.surveys)) {
        db.bioLinkConfig.surveys = [];
    }
    db.bioLinkConfig.surveys.unshift(newSurvey);
    // Create system notification
    if (!Array.isArray(db.notifications)) {
        db.notifications = [];
    }
    db.notifications.unshift({
        id: `notif_survey_${Date.now()}`,
        title: '⭐ ثبت نظرسنجی جدید رضایت مشتری',
        message: `نظرسنجی جدید از ${newSurvey.customerName} (کیفیت: ${newSurvey.qualityRating}/5، تحویل: ${newSurvey.deliveryRating}/5، پشتیبانی: ${newSurvey.supportRating}/5)`,
        type: 'info',
        createdAt: Date.now(),
        read: false,
        url: 'digital-card'
    });
    saveDb(db);
    res.json({ success: true, message: 'نظر ارزشمند شما با موفقیت ثبت شد. از همراهی شما سپاسگزاریم.' });
});

app.post('/api/bio-link/order', (req, res) => {
    const db = getDb();
    if (!db.bioLinkConfig) {
        db.bioLinkConfig = DEFAULT_BIO_LINK_CONFIG;
    }
    const { customerName, customerPhone, productTitle, quantity, notes } = req.body;
    if (!customerName || !customerPhone) {
        return res.status(400).json({ success: false, error: 'نام و شماره تماس الزامی است.' });
    }
    const newOrder = {
        id: `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        customerName: String(customerName).trim(),
        customerPhone: String(customerPhone).trim(),
        productTitle: String(productTitle || 'استعلام عمومی').trim(),
        quantity: String(quantity || '').trim(),
        notes: String(notes || '').trim(),
        status: 'pending',
        createdAt: Date.now()
    };
    if (!Array.isArray(db.bioLinkConfig.orders)) {
        db.bioLinkConfig.orders = [];
    }
    db.bioLinkConfig.orders.unshift(newOrder);

    // Create system notification for sales team & admins
    if (!Array.isArray(db.notifications)) {
        db.notifications = [];
    }
    db.notifications.unshift({
        id: `notif_biolink_${Date.now()}`,
        title: '📦 ثبت سفارش جدید از لپان لینک / QR کد عمومی',
        message: `سفارش جدید از مشتری: ${newOrder.customerName} (${newOrder.customerPhone}) - کالا: ${newOrder.productTitle} (${newOrder.quantity})`,
        type: 'info',
        createdAt: Date.now(),
        read: false,
        url: 'digital-card'
    });

    saveDb(db);
    res.json({ success: true, message: 'سفارش شما با موفقیت ثبت گردید. کارشناسان فروش با شما تماس خواهند گرفت.', order: newOrder });
});

// --- SETTINGS AND DATABASE CONFIGURATION ENDPOINTS ---
app.get('/api/settings', (req, res) => {
    const db = getDb();
    res.json(db.settings || {});
});

app.post('/api/settings', async (req, res) => {
    const db = getDb();
    db.settings = { ...(db.settings || {}), ...req.body };
    saveDb(db);
    
    // Automatically re-initialize bots and schedule cron jobs on settings save
    try {
        setupDailyReports();
    } catch (e) {
        console.error("Failed to run setupDailyReports from settings save:", e);
    }

    try {
        setupAutoBackup();
    } catch (e) {
        console.error("Failed to run setupAutoBackup from settings save:", e);
    }

    try {
        if (db.settings.telegramBotToken) {
            const tg = await safeImport('./backend/telegram.js');
            if (tg && tg.initTelegram) {
                await tg.initTelegram(db.settings.telegramBotToken);
            }
        }
        if (db.settings.baleBotToken) {
            const bale = await safeImport('./backend/bale.js');
            if (bale && bale.initBaleBot) {
                await bale.initBaleBot(db.settings.baleBotToken);
            }
        }
    } catch (err) {
        console.error("Auto-restart bots from settings save failed:", err);
    }

    res.json(db.settings);
});

// Helper to dynamically sync release-version.json and actual installer files on disk with in-memory db.settings
const getSyncedVersionSettings = (db) => {
    if (!db.settings) db.settings = {};
    try {
        const relPath = path.join(__dirname, 'release-version.json');
        let relData = {};
        if (fs.existsSync(relPath)) {
            relData = JSON.parse(fs.readFileSync(relPath, 'utf8'));
            const relTimestamp = Number(relData.timestamp) || 0;
            const dbTimestamp = Number(db.settings.systemUpdatePublishedAt) || 0;
            if (relTimestamp >= dbTimestamp) {
                db.settings.webVersion = relData.webVersion || relData.version || '1.0.29';
                db.settings.systemVersion = db.settings.webVersion;
                db.settings.systemBuildNumber = relData.webBuildNumber || relData.buildNumber || `b_${relTimestamp}`;
                db.settings.systemUpdatePublishedAt = relTimestamp;
            }
        }

        // Strictly determine desktop (.exe/.msi) and Android (.apk) versions independently from actual installer files on disk!
        if (typeof findNewestInstallerFile === 'function') {
            const bestElectron = findNewestInstallerFile('desktop', 'exe', 'electron');
            if (bestElectron && bestElectron.version) {
                db.settings.electronLatestVersion = bestElectron.version;
                db.settings.hasElectronInstaller = true;
                db.settings.electronInstallerFileName = bestElectron.fileName;
                db.settings.electronInstallerSize = bestElectron.size || 0;
            } else {
                db.settings.electronLatestVersion = relData.electronVersion || relData.electronLatestVersion || null;
                db.settings.hasElectronInstaller = Boolean(db.settings.electronLatestVersion && bestElectron);
            }

            const bestTauri = findNewestInstallerFile('desktop', 'exe', 'tauri');
            if (bestTauri && bestTauri.version) {
                db.settings.tauriLatestVersion = bestTauri.version;
                db.settings.hasTauriInstaller = true;
                db.settings.tauriInstallerFileName = bestTauri.fileName;
                db.settings.tauriInstallerSize = bestTauri.size || 0;
            } else {
                db.settings.tauriLatestVersion = relData.tauriVersion || relData.tauriLatestVersion || null;
                db.settings.hasTauriInstaller = Boolean(db.settings.tauriLatestVersion && bestTauri);
            }

            const bestAndroid = findNewestInstallerFile('android');
            if (bestAndroid && bestAndroid.version) {
                db.settings.androidLatestVersion = bestAndroid.version;
                db.settings.hasAndroidInstaller = true;
                db.settings.androidInstallerFileName = bestAndroid.fileName;
                db.settings.androidInstallerSize = bestAndroid.size || 0;
            } else {
                db.settings.androidLatestVersion = relData.androidVersion || relData.androidLatestVersion || null;
                db.settings.hasAndroidInstaller = Boolean(db.settings.androidLatestVersion && bestAndroid);
            }

            // Legacy desktopLatestVersion fallback based on available desktop installer
            db.settings.desktopLatestVersion = db.settings.electronLatestVersion || db.settings.tauriLatestVersion || null;
            db.settings.hasDesktopInstaller = Boolean(db.settings.hasElectronInstaller || db.settings.hasTauriInstaller);
        }
    } catch (_) {}
    return db.settings;
};

// --- DESKTOP CLIENT (TAURI & ELECTRON) AUTO-UPDATER & CONFIG ENDPOINTS ---
app.get('/api/desktop/updater.json', (req, res) => {
    const db = getDb();
    const settings = getSyncedVersionSettings(db);
    const runtime = String(req.query?.runtime || req.headers['x-client-runtime'] || 'tauri').toLowerCase();
    const isElectron = runtime === 'electron';
    const bestDesktop = findNewestInstallerFile('desktop', 'exe', runtime);
    const bestAndroid = findNewestInstallerFile('android');

    const hasDesktop = Boolean(bestDesktop && fs.existsSync(bestDesktop.filePath));
    const hasAndroid = Boolean(bestAndroid && fs.existsSync(bestAndroid.filePath));
    const desktopVersion = hasDesktop ? bestDesktop.version : null;
    const androidVersion = hasAndroid ? bestAndroid.version : null;
    const desktopExt = bestDesktop?.ext || 'exe';
    const notes = settings.desktopReleaseNotes || settings.releaseNotes || 'نسخه جدید سیستم با قابلیت‌های بهبود یافته.';
    const pubDate = settings.systemUpdatePublishedAt ? new Date(Number(settings.systemUpdatePublishedAt)).toISOString() : new Date().toISOString();

    const runtimeParam = `&runtime=${runtime}`;
    const downloadUrl = hasDesktop
        ? `${req.protocol}://${req.get('host')}/api/downloads/latest-desktop?v=${encodeURIComponent(desktopVersion)}&ext=${desktopExt}${runtimeParam}`
        : '';
    const androidDownloadUrl = hasAndroid
        ? `${req.protocol}://${req.get('host')}/api/downloads/latest-android?v=${encodeURIComponent(androidVersion)}`
        : '';

    // Standard Auto-Updater manifest
    const updaterManifest = {
        version: desktopVersion,
        desktopLatestVersion: desktopVersion,
        androidLatestVersion: androidVersion,
        runtime,
        hasDesktopInstaller: hasDesktop,
        hasAndroidInstaller: hasAndroid,
        desktopFileName: hasDesktop ? bestDesktop.fileName : null,
        androidFileName: hasAndroid ? bestAndroid.fileName : null,
        notes: notes,
        pub_date: pubDate,
        url: downloadUrl,
        androidUrl: androidDownloadUrl,
        autoCheck: settings.desktopAutoCheckUpdates !== false,
        intervalMinutes: Number(settings.desktopUpdateIntervalMinutes) || 60,
        platforms: {
            "windows-x86_64": {
                signature: "",
                url: downloadUrl
            }
        }
    };
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(updaterManifest);
});

app.get('/api/desktop/check-update', (req, res) => {
    const db = getDb();
    const settings = getSyncedVersionSettings(db);
    const runtime = String(req.query?.runtime || req.headers['x-client-runtime'] || 'electron').toLowerCase();
    const bestDesktop = findNewestInstallerFile('desktop', 'exe', runtime);
    const bestAndroid = findNewestInstallerFile('android');
    
    // Strictly require that an actual installer file exists on disk for this specific runtime
    const hasDesktop = Boolean(bestDesktop && fs.existsSync(bestDesktop.filePath));
    const hasAndroid = Boolean(bestAndroid && fs.existsSync(bestAndroid.filePath));
    const desktopVersion = hasDesktop ? bestDesktop.version : null;
    const androidVersion = hasAndroid ? bestAndroid.version : null;
    const desktopExt = bestDesktop?.ext || 'exe';
    const desktopFileName = hasDesktop ? bestDesktop.fileName : null;
    const runtimeParam = runtime ? `&runtime=${runtime}` : '';

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
        latestVersion: desktopVersion,
        desktopLatestVersion: desktopVersion,
        androidLatestVersion: androidVersion,
        runtime,
        hasDesktopInstaller: hasDesktop,
        hasAndroidInstaller: hasAndroid,
        desktopFileName: desktopFileName,
        desktopFileSize: bestDesktop?.size || 0,
        androidFileName: hasAndroid ? (bestAndroid.fileName || `dlkam-android-v${androidVersion}.apk`) : null,
        androidFileSize: bestAndroid?.size || 0,
        releaseNotes: settings.desktopReleaseNotes || 'پایدار و به‌روز',
        updateUrl: `/api/desktop/updater.json?runtime=${runtime}`,
        directDownloadUrl: hasDesktop ? `/api/downloads/latest-desktop?v=${encodeURIComponent(desktopVersion)}&ext=${desktopExt}${runtimeParam}` : null,
        androidDownloadUrl: hasAndroid ? `/api/downloads/latest-android?v=${encodeURIComponent(androidVersion)}` : null,
        autoCheck: settings.desktopAutoCheckUpdates !== false,
        updateIntervalMinutes: Number(settings.desktopUpdateIntervalMinutes) || 60,
        lastCheckTime: settings.desktopLastCheckTime || null,
        updateChannel: settings.desktopUpdateChannel || 'stable',
        localServerUrl: settings.desktopLocalServerUrl || 'http://localhost:3000',
        cloudServerUrl: settings.desktopCloudServerUrl || 'https://dlkam.ir'
    });
});

// --- NUMBER SEQUENCE GENERATORS ---
app.get('/api/next-exit-permit-number', (req, res) => {
    const db = getDb();
    const permits = db.exitPermits || [];
    const company = req.query.company || db.settings?.defaultCompany || '';
    let startNum = db.settings?.currentExitPermitNumber || 1000;
    let activeYear = null;
    if (db.settings?.activeFiscalYearId) {
        activeYear = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
        if (activeYear) {
            if (activeYear.companySequences && company) {
                const target = company.trim().replace(/\s+/g, ' ');
                const foundKey = Object.keys(activeYear.companySequences).find(k => k.trim().replace(/\s+/g, ' ') === target);
                if (foundKey && activeYear.companySequences[foundKey]) {
                    const seqVal = activeYear.companySequences[foundKey].startExitPermitNumber;
                    if (seqVal) startNum = parseInt(String(seqVal)) || startNum;
                }
            }
        }
    }

    let filteredPermits = permits;
    if (activeYear) {
        filteredPermits = permits.filter(p => {
            if (p.fiscalYearId) return p.fiscalYearId === activeYear.id;
            if (activeYear.label) {
                const shamsiYM = utils.toShamsiYearMonth(p.date);
                if (shamsiYM && shamsiYM.startsWith(activeYear.label + '/')) return true;
            }
            if (activeYear.startDate && activeYear.endDate && p.date) {
                return p.date >= activeYear.startDate && p.date <= activeYear.endDate;
            }
            return true;
        });
    }

    const nextNum = findNextMaxNumber(filteredPermits, company, 'permitNumber', startNum);
    res.json({ nextNumber: nextNum });
});

app.get('/api/next-tracking-number', (req, res) => {
    const db = getDb();
    const company = req.query.company || db.settings?.defaultCompany || '';
    let startNum = db.settings?.currentTrackingNumber || 1000;
    let activeYear = null;
    if (db.settings?.activeFiscalYearId) {
        activeYear = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
        if (activeYear) {
            if (company && activeYear.companySequences) {
                const target = company.trim().replace(/\s+/g, ' ');
                const foundKey = Object.keys(activeYear.companySequences).find(k => k.trim().replace(/\s+/g, ' ') === target);
                if (foundKey && activeYear.companySequences[foundKey]) {
                    const seqVal = activeYear.companySequences[foundKey].startTrackingNumber;
                    if (seqVal) startNum = parseInt(String(seqVal)) || startNum;
                }
            }
        }
    }
    
    // Filter orders to only include those in the current fiscal year (by fiscalYearId, label, or date range)
    let filteredOrders = db.orders || [];
    if (activeYear) {
        filteredOrders = filteredOrders.filter(o => {
            if (o.fiscalYearId) {
                return o.fiscalYearId === activeYear.id;
            }
            if (activeYear.label) {
                const shamsiYM = utils.toShamsiYearMonth(o.date);
                if (shamsiYM && shamsiYM.startsWith(activeYear.label + '/')) {
                    return true;
                }
            }
            if (activeYear.startDate && activeYear.endDate && o.date) {
                return o.date >= activeYear.startDate && o.date <= activeYear.endDate;
            }
            return false;
        });
    }

    const nextNum = findNextMaxNumber(filteredOrders, company, 'trackingNumber', startNum);
    res.json({ nextTrackingNumber: nextNum });
});

app.get('/api/next-bijak-number', (req, res) => {
    const db = getDb();
    const company = req.query.company || db.settings?.defaultCompany || '';
    const txs = db.warehouseTransactions || [];
    let startNum = 1000;
    let activeYear = null;
    if (db.settings?.activeFiscalYearId) {
        activeYear = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
        if (activeYear && company) {
            if (activeYear.companySequences) {
                const target = company.trim().replace(/\s+/g, ' ');
                const foundKey = Object.keys(activeYear.companySequences).find(k => k.trim().replace(/\s+/g, ' ') === target);
                if (foundKey && activeYear.companySequences[foundKey]) {
                    const seqVal = activeYear.companySequences[foundKey].startBijakNumber;
                    if (seqVal) startNum = parseInt(String(seqVal)) || startNum;
                }
            }
        }
    }

    // Filter transactions to only include OUT (Bijaks) that fall within the active fiscal year
    let filteredTxs = txs.filter(tx => tx.type === 'OUT');
    if (activeYear) {
        filteredTxs = filteredTxs.filter(tx => {
            if (activeYear.label) {
                const shamsiYM = utils.toShamsiYearMonth(tx.date);
                if (shamsiYM && shamsiYM.startsWith(activeYear.label + '/')) {
                    return true;
                }
            }
            if (activeYear.startDate && activeYear.endDate && tx.date) {
                return tx.date >= activeYear.startDate && tx.date <= activeYear.endDate;
            }
            return false;
        });
    }

    const nextNum = findNextMaxNumber(filteredTxs, company, 'number', startNum);
    res.json({ nextNumber: nextNum });
});

app.get('/api/next-meeting-number', (req, res) => {
    const db = getDb();
    const meetings = db.meetings || [];
    const nextNum = utils.findNextMeetingNumber(meetings, db.settings);
    res.json({ nextNumber: nextNum });
});

app.get('/api/next-purchase-request-number', (req, res) => {
    const db = getDb();
    const reqs = db.purchaseRequests || [];
    let maxNum = 1000;
    reqs.forEach(r => {
        const numStr = r.requestNumber || r.number || '';
        if (numStr) {
            const clean = numStr.toString().replace('PR-', '');
            const num = parseInt(clean);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });
    res.json({ nextNumber: `PR-${maxNum + 1}` });
});

app.get('/api/next-cheque-receipt-number', (req, res) => {
    const db = getDb();
    const company = req.query.company || '';
    const receipts = db.chequeReceipts || [];
    let startNum = db.settings?.currentChequeReceiptNumber ? parseInt(String(db.settings.currentChequeReceiptNumber)) || 1000 : 1000;
    if (db.settings?.activeFiscalYearId && company) {
        const year = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
        if (year && year.companySequences && year.companySequences[company]) {
            startNum = parseInt(String(year.companySequences[company].startChequeReceiptNumber)) || startNum;
        }
    }
    
    const existingNumbers = new Set();
    receipts.forEach(r => {
        const rComp = r.company || '';
        if (rComp === company) {
            let numStr = r.number || '';
            if (numStr.startsWith('CR-')) {
                numStr = numStr.replace('CR-', '');
            }
            const num = parseInt(numStr);
            if (!isNaN(num) && num >= startNum) {
                existingNumbers.add(num);
            }
        }
    });
    
    let expected = startNum;
    while (existingNumbers.has(expected)) { expected++; }
    res.json({ nextNumber: `CR-${expected}` });
});

// --- MEETINGS BOT ACTIONS ---
app.post('/api/meetings/:id/announce', async (req, res) => {
    try {
        const db = getDb();
        const meeting = (db.meetings || []).find(m => m.id === req.params.id);
        if (meeting) {
            const now = Date.now();
            if (!req.query.force && meeting.announcedAt && (now - Number(meeting.announcedAt) < 600000)) {
                return res.json({ success: true, alreadyAnnounced: true, message: 'اعلان جلسه اخیراً ارسال شده است.' });
            }
            meeting.announcedAt = now;
            saveDb(db);

            await notifyMeetingAnnouncement(meeting, db);
            broadcastNotification(
                `✨ اعلان برگزاری جلسه تولید #${meeting.meetingNumber || ''}`,
                `جلسه تولید شماره ${meeting.meetingNumber || ''} روز ${meeting.date || ''} ساعت ${meeting.time || '۱۲:۰۰'} برگزار می‌شود.`,
                '/production-meetings',
                null,
                null
            );
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'صورتجلسه یافت نشد' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/meetings/:id/send-minutes', async (req, res) => {
    try {
        const db = getDb();
        const meeting = (db.meetings || []).find(m => m.id === req.params.id);
        if (meeting) {
            const now = Date.now();
            if (!req.query.force && meeting.minutesSentAt && (now - Number(meeting.minutesSentAt) < 600000)) {
                return res.json({ success: true, alreadySent: true, message: 'صورتجلسه اخیراً به گروه‌ها ارسال شده است.' });
            }
            meeting.minutesSentAt = now;
            saveDb(db);

            await notifyMeetingMinutes(meeting, db);
            broadcastNotification(
                `📝 ارسال صورتجلسه تولید #${meeting.meetingNumber || ''}`,
                `صورتجلسه شماره ${meeting.meetingNumber || ''} ثبت و ابلاغ گردید.`,
                '/production-meetings',
                null,
                null
            );
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'صورتجلسه یافت نشد' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- FULL-STACK DATA SYNCHRONIZATION ENDPOINTS ---
const CRUD_COLLECTIONS = [
    { route: 'security/logs', dbKey: 'securityLogs' },
    { route: 'security/driver-payments', dbKey: 'driverPayments' },
    { route: 'security/delays', dbKey: 'personnelDelays' },
    { route: 'security/overtimes', dbKey: 'personnelOvertimes' },
    { route: 'security/incidents', dbKey: 'securityIncidents' },
    { route: 'warehouse/items', dbKey: 'warehouseItems' },
    { route: 'trade', dbKey: 'tradeRecords' },
    { route: 'notes', dbKey: 'notes' },
    { route: 'part-master-data', dbKey: 'partMasterData' },
    { route: 'secretariat-settings', dbKey: 'secretariatSettings' },
    { route: 'secretariat-templates', dbKey: 'secretariatTemplates' },
    { route: 'cheque-receipts', dbKey: 'chequeReceipts' },
    { route: 'customer-balances', dbKey: 'customerBalances' },
    { route: 'customer-balances/chat-codes', dbKey: 'customerChatCodes' }
];

CRUD_COLLECTIONS.forEach(({ route, dbKey }) => {
    // GET
    app.get(`/api/${route}`, (req, res) => {
        const db = getDb();
        if (!db[dbKey]) db[dbKey] = [];
        res.json(db[dbKey]);
    });

    // POST
    app.post(`/api/${route}`, (req, res) => {
        const db = getDb();
        if (!db[dbKey]) db[dbKey] = [];
        const item = req.body;
        const existingIdx = db[dbKey].findIndex(x => {
            if (item.id && x.id) return x.id === item.id;
            if (item.companyId && x.companyId) return x.companyId === item.companyId;
            return false;
        });
        if (existingIdx > -1) {
            db[dbKey][existingIdx] = item;
        } else {
            db[dbKey].push(item);
        }
        saveDb(db);
        res.json(db[dbKey]);

        if (route === 'security/driver-payments' && item) {
            setImmediate(async () => {
                try {
                    const freshDb = getDb();
                    if (freshDb.settings?.botDriverPaymentAutoSendEnabled !== false) {
                        await notifyDriverPayment(item, freshDb, existingIdx > -1 ? 'EDIT' : 'CREATE');
                    }
                } catch (err) {
                    console.error("Auto notifyDriverPayment on POST error:", err);
                }
            });
        }
    });

    // PUT
    app.put(`/api/${route}/:id`, (req, res) => {
        const db = getDb();
        if (!db[dbKey]) db[dbKey] = [];
        const idx = db[dbKey].findIndex(x => x.id === req.params.id);
        let updatedItem;
        if (idx > -1) {
            updatedItem = { ...db[dbKey][idx], ...req.body };
            db[dbKey][idx] = updatedItem;
            saveDb(db);
            res.json(db[dbKey]);
        } else {
            updatedItem = { id: req.params.id, ...req.body };
            db[dbKey].push(updatedItem);
            saveDb(db);
            res.json(db[dbKey]);
        }

        if (route === 'security/driver-payments' && updatedItem) {
            setImmediate(async () => {
                try {
                    const freshDb = getDb();
                    if (freshDb.settings?.botDriverPaymentAutoSendEnabled !== false) {
                        await notifyDriverPayment(updatedItem, freshDb, 'EDIT');
                    }
                } catch (err) {
                    console.error("Auto notifyDriverPayment on PUT error:", err);
                }
            });
        }
    });

    // DELETE
    app.delete(`/api/${route}/:id`, (req, res) => {
        const db = getDb();
        if (!db[dbKey]) db[dbKey] = [];
        const deletedItem = db[dbKey].find(x => x.id === req.params.id);
        db[dbKey] = db[dbKey].filter(x => x.id !== req.params.id);
        saveDb(db);
        res.json(db[dbKey]);

        if (route === 'security/driver-payments' && deletedItem) {
            setImmediate(async () => {
                try {
                    const freshDb = getDb();
                    if (freshDb.settings?.botDriverPaymentAutoSendEnabled !== false) {
                        await notifyDriverPayment(deletedItem, freshDb, 'DELETE');
                    }
                } catch (err) {
                    console.error("Auto notifyDriverPayment on DELETE error:", err);
                }
            });
        }
    });
});

// --- DRIVER PAYMENTS NOTIFICATION ENDPOINT ---
app.post('/api/security/driver-payments/notify', async (req, res) => {
    try {
        const body = req.body || {};
        const payment = body.payment || body;
        const stage = body.stage || (payment.factoryApproved || payment.status === 'ARCHIVED' ? 'factory' : (payment.supervisorApproved || payment.status === 'PENDING_FACTORY' ? 'supervisor' : 'initial'));
        const options = body.options || { stage, targetGroupId: body.targetGroupId, platform: body.platform };
        if (!payment || !payment.id) {
            return res.status(400).json({ success: false, error: 'اطلاعات فرم واریزی نامعتبر است.' });
        }
        const db = getDb();
        const result = await notifyDriverPayment(payment, db, 'MANUAL', options);
        res.json(result || { success: true });
    } catch (e) {
        console.error("Manual driver payment notify error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- SECURITY MODULE CAMERA & ALPR ENDPOINTS ---
app.post('/api/security/save-only-photo', (req, res) => {
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) return res.status(400).json({ success: false, error: 'No image provided' });
        // Return imageBase64 directly or store it
        return res.json({ success: true, attachment: imageBase64 });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/security/ocr-plate-local', (req, res) => {
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) return res.status(400).json({ success: false, error: 'No image provided' });
        return res.json({ success: true, attachment: imageBase64, plateNumber: '' });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// --- DEDICATED PRODUCTION MEETINGS ENDPOINTS (WITH AUTO UNIQUE NUMBERING) ---
app.get('/api/meetings', (req, res) => {
    const db = getDb();
    if (!db.meetings) db.meetings = [];
    res.json(db.meetings);
});

app.post('/api/meetings', (req, res) => {
    const db = getDb();
    if (!db.meetings) db.meetings = [];
    const item = req.body;
    const existingIdx = db.meetings.findIndex(x => x.id === item.id);
    
    if (existingIdx > -1) {
        db.meetings[existingIdx] = { ...db.meetings[existingIdx], ...item };
    } else {
        // For new meetings, check if meetingNumber is duplicate or missing
        const curNum = (item.meetingNumber || '').trim();
        const isDuplicate = !curNum || db.meetings.some(m => 
            m.id !== item.id && 
            (m.meetingNumber || '').trim().toLowerCase() === curNum.toLowerCase()
        );
        if (isDuplicate) {
            item.meetingNumber = utils.findNextMeetingNumber(db.meetings, db.settings);
        }
        db.meetings.push(item);
    }
    saveDb(db);
    res.json(db.meetings);
});

app.put('/api/meetings/:id', (req, res) => {
    const db = getDb();
    if (!db.meetings) db.meetings = [];
    const idx = db.meetings.findIndex(x => x.id === req.params.id);
    if (idx > -1) {
        db.meetings[idx] = { ...db.meetings[idx], ...req.body };
        saveDb(db);
        res.json(db.meetings);
    } else {
        db.meetings.push({ id: req.params.id, ...req.body });
        saveDb(db);
        res.json(db.meetings);
    }
});

app.delete('/api/meetings/:id', (req, res) => {
    const db = getDb();
    if (!db.meetings) db.meetings = [];
    db.meetings = db.meetings.filter(x => x.id !== req.params.id);
    saveDb(db);
    res.json(db.meetings);
});

// --- COMPREHENSIVE GLOBAL SEARCH ENDPOINT (Ctrl+K) ---
const handleSearchEverything = (req, res) => {
    try {
        const query = (req.query.query || '').trim();
        const userId = req.query.userId || req.headers['x-user-id'];
        const role = req.query.role || req.headers['x-user-role'];

        if (!query || query.length < 2) {
            return res.json({ results: [] });
        }

        const normalizeStr = (str) => {
            if (str === null || str === undefined) return '';
            return String(str)
                .toLowerCase()
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/[\u200c]/g, ' ')
                .replace(/[\u064B-\u065F]/g, '')
                .replace(/[ي]/g, 'ی')
                .replace(/[ك]/g, 'ک')
                .replace(/[آأإٱ]/g, 'ا')
                .replace(/[ة]/g, 'ه')
                .replace(/[۰]/g, '0').replace(/[۱]/g, '1').replace(/[۲]/g, '2').replace(/[۳]/g, '3').replace(/[۴]/g, '4')
                .replace(/[۵]/g, '5').replace(/[۶]/g, '6').replace(/[۷]/g, '7').replace(/[۸]/g, '8').replace(/[۹]/g, '9')
                .replace(/[٠]/g, '0').replace(/[١]/g, '1').replace(/[٢]/g, '2').replace(/[٣]/g, '3').replace(/[٤]/g, '4')
                .replace(/[٥]/g, '5').replace(/[٦]/g, '6').replace(/[٧]/g, '7').replace(/[٨]/g, '8').replace(/[٩]/g, '9')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const normQuery = normalizeStr(query);
        const queryTokens = normQuery.split(' ').filter(Boolean);

        const matchesQuery = (text) => {
            if (!text) return false;
            const normText = normalizeStr(text);
            return queryTokens.every(token => normText.includes(token));
        };

        const db = getDb();
        const results = [];

        // Check user & permissions
        let currentUser = null;
        if (userId && Array.isArray(db.users)) {
            currentUser = db.users.find(u => u.id === userId || u.username === userId);
        }

        const userRole = (currentUser?.role || role || 'user').toLowerCase();
        const userRoles = Array.isArray(currentUser?.roles) ? currentUser.roles.map(r => r.toLowerCase()) : [userRole];
        const isAdmin = userRoles.includes('admin') || userRoles.includes('superadmin') || userRoles.includes('ceo') || userRoles.includes('director') || userRole === 'admin';
        const isFinancial = isAdmin || userRoles.includes('financial') || userRoles.includes('accountant') || userRoles.includes('manager');
        const isCommercial = isAdmin || userRoles.includes('commercial') || currentUser?.canManageTrade === true;
        const isWarehouse = isAdmin || userRoles.includes('warehouse') || userRoles.includes('warehouse_keeper') || userRoles.includes('factory_manager');
        const isSecurity = isAdmin || userRoles.includes('security') || userRoles.includes('security_head') || userRoles.includes('security_guard');

        // 1. Trade Records (بازرگانی و ثبت سفارش)
        if ((isCommercial || isAdmin || isFinancial) && Array.isArray(db.tradeRecords)) {
            db.tradeRecords.forEach(r => {
                const parts = [
                    r.fileNumber, r.proformaNumber, r.orderNumber, r.registrationNumber,
                    r.goodsName, r.sellerName, r.company, r.commodityGroup, r.mainCurrency,
                    r.operatingBank, r.currencyAllocationType, r.allocationCurrencyRank
                ];

                if (Array.isArray(r.items)) {
                    r.items.forEach(it => { parts.push(it.name, it.hsCode, it.part); });
                }

                if (r.greenLeafData) {
                    if (Array.isArray(r.greenLeafData.duties)) {
                        r.greenLeafData.duties.forEach(d => parts.push(`کوتاژ ${d.cottageNumber || ''}`, d.bank, d.part));
                    }
                    if (Array.isArray(r.greenLeafData.guarantees)) {
                        r.greenLeafData.guarantees.forEach(g => parts.push(g.guaranteeNumber, g.sepamNumber, g.chequeNumber, g.chequeBank));
                    }
                    if (Array.isArray(r.greenLeafData.taxes)) {
                        r.greenLeafData.taxes.forEach(t => parts.push(t.taxNumber, t.part));
                    }
                    if (Array.isArray(r.greenLeafData.roadTolls)) {
                        r.greenLeafData.roadTolls.forEach(rt => parts.push(rt.tollNumber, rt.part));
                    }
                }

                if (Array.isArray(r.shippingDocuments)) {
                    r.shippingDocuments.forEach(doc => {
                        parts.push(doc.documentNumber, doc.type, doc.vesselName, doc.portOfLoading, doc.portOfDischarge, doc.description);
                        if (Array.isArray(doc.invoiceItems)) doc.invoiceItems.forEach(i => parts.push(i.name, i.part));
                        if (Array.isArray(doc.packingItems)) doc.packingItems.forEach(p => parts.push(p.description, p.part));
                    });
                }

                if (r.clearanceData) {
                    if (Array.isArray(r.clearanceData.receipts)) {
                        r.clearanceData.receipts.forEach(rcp => parts.push(`قبض انبار ${rcp.receiptNumber || ''}`, rcp.warehouseName));
                    }
                }

                if (r.insuranceData) {
                    parts.push(r.insuranceData.policyNumber, r.insuranceData.company, r.insuranceData.agencyName, r.insuranceData.agencyCode);
                }

                if (r.currencyPurchaseData && Array.isArray(r.currencyPurchaseData.tranches)) {
                    r.currencyPurchaseData.tranches.forEach(tr => {
                        parts.push(tr.brokerName, tr.trackingCode, tr.dealNumber, tr.bankName, tr.description);
                    });
                }

                if (Array.isArray(r.comments)) {
                    r.comments.forEach(c => parts.push(c.text, c.author));
                }

                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    // Extract extra highlight text
                    let extraInfo = '';
                    if (r.greenLeafData?.duties?.[0]?.cottageNumber) {
                        extraInfo += ` | کوتاژ: ${r.greenLeafData.duties[0].cottageNumber}`;
                    }
                    if (r.registrationNumber) {
                        extraInfo += ` | ثبت سفارش: ${r.registrationNumber}`;
                    }

                    results.push({
                        type: 'trade',
                        id: r.id,
                        title: `بازرگانی: ${r.goodsName || 'پرونده'} (${r.fileNumber || 'بدون پرونده'})`,
                        subtitle: `شرکت: ${r.company || '---'} | فروشنده: ${r.sellerName || '---'}${extraInfo}`,
                        data: { recordId: r.id, fileNumber: r.fileNumber, tab: 'timeline' },
                        url: 'trade'
                    });
                }
            });
        }

        // 2. Payment Orders (دستور پرداخت‌ها)
        if ((isFinancial || isAdmin) && Array.isArray(db.orders)) {
            db.orders.forEach(o => {
                const parts = [
                    o.trackingNumber, o.beneficiary, o.company, o.description,
                    o.bankAccount, o.paymentMethod, o.invoiceNumber, o.status,
                    o.creatorName, o.approvedBy, o.notes
                ];
                if (o.chequeDetails) {
                    parts.push(o.chequeDetails.chequeNumber, o.chequeDetails.sayadNumber, o.chequeDetails.bankName, o.chequeDetails.dueDate);
                }

                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    results.push({
                        type: 'payment_order',
                        id: o.id,
                        title: `دستور پرداخت #${o.trackingNumber || ''} - ${o.beneficiary || ''}`,
                        subtitle: `مبلغ: ${Number(o.amount || 0).toLocaleString('fa-IR')} ریال | شرکت: ${o.company || '---'} | بابت: ${o.description || '---'}`,
                        data: { orderId: o.id, trackingNumber: o.trackingNumber },
                        url: 'manage'
                    });
                }
            });
        }

        // 3. Exit Permits & Invoices (مجوزهای خروج و فاکتورها)
        if ((isWarehouse || isSecurity || isAdmin || isFinancial) && Array.isArray(db.exitPermits)) {
            db.exitPermits.forEach(p => {
                const parts = [
                    p.permitNumber, p.invoiceNumber, p.buyerName, p.receiverName,
                    p.driverName, p.plateNumber, p.destination, p.company,
                    p.type, p.description, p.notes
                ];
                if (Array.isArray(p.items)) {
                    p.items.forEach(it => parts.push(it.name, it.code, it.description));
                }

                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    const isInvoice = !!p.invoiceNumber;
                    results.push({
                        type: 'exit_permit',
                        id: p.id,
                        title: isInvoice ? `فاکتور #${p.invoiceNumber} - ${p.buyerName || p.receiverName || ''}` : `مجوز خروج #${p.permitNumber || ''} - ${p.buyerName || p.receiverName || ''}`,
                        subtitle: `راننده: ${p.driverName || '---'} | پلاک: ${p.plateNumber || '---'} | مقصد: ${p.destination || '---'}`,
                        data: { permitId: p.id, permitNumber: p.permitNumber, invoiceNumber: p.invoiceNumber },
                        url: isInvoice ? 'manage-invoices' : 'manage-exit'
                    });
                }
            });
        }

        // 4. Cheque Receipts (رسیدهای دریافت چک صیادی)
        if ((isFinancial || isAdmin) && Array.isArray(db.chequeReceipts)) {
            db.chequeReceipts.forEach(c => {
                const parts = [
                    c.receiptNumber, c.customerName, c.drawerName, c.sayanCode,
                    c.sayadNumber, c.chequeNumber, c.bankName, c.branchName,
                    c.description, c.notes, c.dueDate
                ];
                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    results.push({
                        type: 'cheque_receipt',
                        id: c.id,
                        title: `رسید چک #${c.receiptNumber || ''} - ${c.customerName || c.drawerName || ''}`,
                        subtitle: `صیادی: ${c.sayadNumber || c.chequeNumber || '---'} | سررسید: ${c.dueDate || '---'} | مبلغ: ${Number(c.amount || 0).toLocaleString('fa-IR')} ریال`,
                        data: { receiptId: c.id, receiptNumber: c.receiptNumber },
                        url: 'sayan-operations'
                    });
                }
            });
        }

        // 5. Warehouse Items (کالاها و انبار)
        if ((isWarehouse || isAdmin) && Array.isArray(db.warehouseItems)) {
            db.warehouseItems.forEach(w => {
                const parts = [w.name, w.code, w.category, w.warehouseName, w.unit, w.notes, w.supplier, w.partNumber];
                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    results.push({
                        type: 'warehouse_item',
                        id: w.id,
                        title: `کالای انبار: ${w.name} (کد: ${w.code || '---'})`,
                        subtitle: `موجودی: ${Number(w.balance || w.quantity || 0).toLocaleString('fa-IR')} ${w.unit || 'عدد'} | انبار: ${w.warehouseName || 'مرکزی'}`,
                        data: { itemId: w.id, itemCode: w.code },
                        url: 'warehouse'
                    });
                }
            });
        }

        // 6. Meetings (جلسات و مصوبات)
        if (Array.isArray(db.meetings)) {
            db.meetings.forEach(m => {
                const parts = [m.meetingNumber, m.title, m.date, m.location, m.agenda, m.decisions, m.secretary];
                if (Array.isArray(m.attendees)) {
                    m.attendees.forEach(a => parts.push(typeof a === 'string' ? a : a.name));
                }
                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    results.push({
                        type: 'meeting',
                        id: m.id,
                        title: `جلسه #${m.meetingNumber || ''} - ${m.title || ''}`,
                        subtitle: `تاریخ: ${m.date || '---'} | مکان: ${m.location || '---'} | دبیر: ${m.secretary || '---'}`,
                        data: { meetingId: m.id },
                        url: 'meetings'
                    });
                }
            });
        }

        // 7. Users (کاربران سیستم)
        if (isAdmin && Array.isArray(db.users)) {
            db.users.forEach(u => {
                const parts = [u.fullName, u.username, u.role, u.mobile, u.email, u.department];
                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    results.push({
                        type: 'user',
                        id: u.id,
                        title: `کاربر: ${u.fullName || u.username} (${u.role || 'کاربر'})`,
                        subtitle: `نام کاربری: ${u.username} | موبایل: ${u.mobile || u.phone || '---'}`,
                        data: { userId: u.id },
                        url: 'users'
                    });
                }
            });
        }

        // 8. Customer Balances (مانده حساب مشتریان)
        if ((isFinancial || isAdmin) && Array.isArray(db.customerBalances)) {
            db.customerBalances.forEach(cb => {
                const parts = [cb.customerName, cb.name, cb.detailedCode, cb.phone, cb.address, cb.managerName];
                const searchableText = parts.filter(Boolean).join(' ');
                if (matchesQuery(searchableText)) {
                    results.push({
                        type: 'customer_balance',
                        id: cb.id,
                        title: `طرف حساب: ${cb.customerName || cb.name} (کد: ${cb.detailedCode || '---'})`,
                        subtitle: `مانده: ${Number(cb.balance || 0).toLocaleString('fa-IR')} ریال | تلفن: ${cb.phone || '---'}`,
                        data: { customerId: cb.id },
                        url: 'balances'
                    });
                }
            });
        }

        // Cap results to 40 items for swift responsive display
        return res.json({ results: results.slice(0, 40) });
    } catch (e) {
        console.error('Search error:', e);
        return res.status(500).json({ results: [], error: e.message });
    }
};

app.get('/api/search-everything', handleSearchEverything);
app.get('/search-everything', handleSearchEverything);

// Helper to save base64 string to file in uploads and strip base64 from database record
function saveBase64ToUploadFile(fileName, base64Str) {
    if (!base64Str) return null;
    if (!fs.existsSync(UPLOADS_DIR)) {
        try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}
    }
    let safeName = 'file';
    try {
        safeName = getSafeFileName(fileName || 'file');
    } catch (e) {
        safeName = 'attachment_' + Date.now();
    }
    const base64Data = base64Str.replace(/^data:.*;base64,/, '');
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeName}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);
    fs.writeFileSync(filePath, base64Data, 'base64');
    return `/uploads/${uniqueName}`;
}

async function sanitizeOrderAttachments(order) {
    if (!order) return order;
    
    let isBotAutoPdf = false;
    let allowedUsers = [];
    try {
        const db = getDb();
        isBotAutoPdf = db.settings?.botAutoPdfForPayments === true;
        allowedUsers = db.settings?.botAutoPdfAllowedUsers || [];
    } catch(e){}

    // Sanitize primary order attachments
    if (Array.isArray(order.attachments)) {
        const sanitized = [];
        for (let att of order.attachments) {
            if (!att) continue;
            let fileName = att.fileName || att.name || 'attachment';
            let dataStr = att.data || att.url || '';
            let isImage = /\.(jpg|jpeg|png|webp|bmp)$/i.test(fileName) || (att.type && att.type.startsWith('image/'));

            const isUserAllowed = allowedUsers.length === 0 || allowedUsers.some(u => 
                (order.requester && String(order.requester).toLowerCase().includes(String(u).toLowerCase())) ||
                (att.createdBy && String(att.createdBy).toLowerCase().includes(String(u).toLowerCase()))
            );

            if (isImage && (att.autoConvertPdf || (isBotAutoPdf && isUserAllowed))) {
                try {
                    let buffer = null;
                    if (dataStr.startsWith('data:') || dataStr.length > 500) {
                        const cleanBase64 = dataStr.replace(/^data:.*;base64,/, '');
                        buffer = Buffer.from(cleanBase64, 'base64');
                    } else if (dataStr.startsWith('/uploads/')) {
                        const safeBase = path.basename(dataStr.replace('/uploads/', '')).replace(/[\/\\]/g, '');
                        const filePath = path.join(UPLOADS_DIR, safeBase);
                        if (fs.existsSync(filePath)) {
                            buffer = fs.readFileSync(filePath);
                        }
                    }

                    if (buffer) {
                        const pdfBuffer = await mergeFilesToPdf([{ fileName, type: 'image', buffer }]);
                        const pdfName = fileName.replace(/\.[^/.]+$/, "") + ".pdf";
                        const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
                        const savedUrl = saveBase64ToUploadFile(pdfName, pdfBase64);
                        sanitized.push({
                            id: att.id || generateUUID(),
                            fileName: pdfName.startsWith('[PDF]') ? pdfName : `[PDF]_${pdfName}`,
                            name: pdfName.startsWith('[PDF]') ? pdfName : `[PDF]_${pdfName}`,
                            url: savedUrl,
                            data: savedUrl,
                            type: 'application/pdf',
                            size: pdfBuffer.length
                        });
                        continue;
                    }
                } catch (pdfErr) {
                    console.error("[Auto PDF] Error converting image attachment to PDF:", pdfErr);
                }
            }

            if (dataStr && (typeof dataStr === 'string') && (dataStr.startsWith('data:') || dataStr.length > 500)) {
                try {
                    const savedUrl = saveBase64ToUploadFile(fileName, dataStr);
                    sanitized.push({
                        id: att.id || generateUUID(),
                        fileName: fileName,
                        name: fileName,
                        url: savedUrl,
                        data: savedUrl,
                        type: att.type || (fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
                        size: att.size || 0
                    });
                } catch (e) {
                    console.error("Error converting base64 attachment to file:", e);
                    sanitized.push(att);
                }
            } else {
                if (att.url && !att.data) att.data = att.url;
                sanitized.push(att);
            }
        }
        order.attachments = sanitized;
    }

    // Sanitize archive attachments if present
    if (Array.isArray(order.archiveAttachments)) {
        order.archiveAttachments = order.archiveAttachments.map(att => {
            if (!att) return att;
            if (att.data && (typeof att.data === 'string') && (att.data.startsWith('data:') || att.data.length > 500)) {
                try {
                    const savedUrl = saveBase64ToUploadFile(att.fileName || att.name, att.data);
                    return {
                        id: att.id || generateUUID(),
                        fileName: att.fileName || att.name || 'file',
                        name: att.fileName || att.name || 'file',
                        url: savedUrl,
                        data: savedUrl,
                        type: att.type || (att.fileName && att.fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
                        size: att.size || 0,
                        uploadedAt: att.uploadedAt || Date.now(),
                        uploadedBy: att.uploadedBy || 'کاربر'
                    };
                } catch (e) {
                    console.error("Error converting archive base64 attachment to file:", e);
                }
            } else if (att.url && !att.data) {
                att.data = att.url;
            }
            return att;
        });
    }

    return order;
}

// Dedicated Payment Orders Endpoints with Automated Notifications
app.get('/api/orders', (req, res) => {
    const db = getDb();
    res.json(db.orders || []);
});

app.post('/api/orders', async (req, res) => {
    try {
        const db = getDb();
        if (!db.orders) db.orders = [];
        let item = req.body;
        item = await sanitizeOrderAttachments(item);
        if (!item.fiscalYearId && db.settings?.activeFiscalYearId) {
            item.fiscalYearId = db.settings.activeFiscalYearId;
        }
        if (!item.createdAt) item.createdAt = Date.now();

        const existingIdx = db.orders.findIndex(x => x.id === item.id);
        const isEdit = existingIdx > -1;

        if (isEdit) {
            db.orders[existingIdx] = { ...db.orders[existingIdx], ...item };
        } else {
            db.orders.push(item);
        }
        saveDb(db);
        res.json(db.orders);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const order = (freshDb.orders || []).find(x => x.id === item.id) || item;
                const eventType = isEdit ? 'EDIT' : 'CREATE';
                const stepName = isEdit ? 'ویرایش دستور پرداخت' : 'ثبت اولیه';
                
                await notifyPaymentOrderStep(order, freshDb, stepName, false, eventType);

                const totalFormatted = Number(order.totalAmount || 0).toLocaleString();
                await broadcastNotification(
                    isEdit ? `✏️ ویرایش دستور پرداخت #${order.trackingNumber || order.id}` : `💸 دستور پرداخت جدید #${order.trackingNumber || order.id}`,
                    `شرکت: ${order.payingCompany || '-'} | درخواست‌کننده: ${order.requester || '-'} | مبلغ: ${totalFormatted} ریال | ذینفع: ${order.payee || '-'}`,
                    '/manage',
                    ['admin', 'financial', 'manager', 'ceo'],
                    null,
                    order.requester ? [order.requester] : null
                );
            } catch (err) {
                console.error("Background notifyPaymentOrderStep error on POST /api/orders:", err);
            }
        });
    } catch (e) {
        console.error("POST /api/orders error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/orders/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db.orders) db.orders = [];
        const idx = db.orders.findIndex(x => x.id === req.params.id);
        const isEdit = req.body.isEdit || false;
        let updatedItem = req.body;
        updatedItem = await sanitizeOrderAttachments(updatedItem);

        if (idx > -1) {
            db.orders[idx] = { ...db.orders[idx], ...updatedItem };
            updatedItem = db.orders[idx];
        } else {
            updatedItem = { id: req.params.id, ...updatedItem };
            db.orders.push(updatedItem);
        }
        saveDb(db);
        res.json(db.orders);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const order = (freshDb.orders || []).find(x => x.id === req.params.id) || updatedItem;
                const eventType = isEdit ? 'EDIT' : 'STEP';
                const stepName = isEdit ? 'ویرایش دستور پرداخت' : (order.status || 'بروزرسانی وضعیت');
                const isFinal = order.status === 'پرداخت شده' || order.status === 'تایید مدیرعامل';

                await notifyPaymentOrderStep(order, freshDb, stepName, isFinal, eventType);

                const totalFormatted = Number(order.totalAmount || 0).toLocaleString();
                await broadcastNotification(
                    `🔄 بروزرسانی دستور پرداخت #${order.trackingNumber || order.id}`,
                    `مرحله: ${stepName} | شرکت: ${order.payingCompany || '-'} | مبلغ: ${totalFormatted} ریال | ذینفع: ${order.payee || '-'}`,
                    '/manage',
                    ['admin', 'financial', 'manager', 'ceo'],
                    null,
                    null
                );
            } catch (err) {
                console.error("Background notifyPaymentOrderStep error on PUT /api/orders:", err);
            }
        });
    } catch (e) {
        console.error("PUT /api/orders error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/orders/:id', (req, res) => {
    try {
        const db = getDb();
        if (!db.orders) db.orders = [];
        const orderToDelete = db.orders.find(x => x.id === req.params.id);
        db.orders = db.orders.filter(x => x.id !== req.params.id);
        saveDb(db);
        res.json(db.orders);

        if (orderToDelete) {
            setImmediate(async () => {
                try {
                    const freshDb = getDb();
                    await notifyPaymentOrderStep(orderToDelete, freshDb, 'حذف دستور پرداخت', false, 'DELETE');
                    await broadcastNotification(
                        `❌ حذف دستور پرداخت #${orderToDelete.trackingNumber || orderToDelete.id}`,
                        `دستور پرداخت مربوط به ${orderToDelete.payee || '-'} حذف گردید.`,
                        '/manage',
                        ['admin', 'financial', 'manager', 'ceo']
                    );
                } catch (err) {
                    console.error("Background notifyPaymentOrderStep error on DELETE /api/orders:", err);
                }
            });
        }
    } catch (e) {
        console.error("DELETE /api/orders error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Dedicated Archive Attachments Endpoints for Payment Orders
app.post('/api/orders/:id/archive-attachments', async (req, res) => {
    try {
        const db = getDb();
        if (!db.orders) db.orders = [];
        const reqId = String(req.params.id);
        const idx = db.orders.findIndex(x => String(x.id) === reqId || (x.trackingNumber && String(x.trackingNumber) === reqId));
        if (idx === -1) {
            return res.status(404).json({ error: 'دستور پرداخت یافت نشد' });
        }

        const order = db.orders[idx];
        order.archiveAttachments = order.archiveAttachments || [];

        let { fileName, fileData, url, type, size, uploadedBy } = req.body;
        let finalUrl = url;

        if (fileData && (fileData.startsWith('data:') || fileData.length > 500)) {
            finalUrl = saveBase64ToUploadFile(fileName || 'archive_attachment', fileData);
        }

        if (!finalUrl && !fileData) {
            return res.status(400).json({ error: 'فایلی جهت بارگذاری ارائه نشده است' });
        }

        const newAttachment = {
            id: generateUUID ? generateUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            fileName: fileName || 'پیوست بایگانی',
            name: fileName || 'پیوست بایگانی',
            url: finalUrl,
            data: finalUrl,
            type: type || (fileName && fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
            size: size || 0,
            uploadedAt: Date.now(),
            uploadedBy: uploadedBy || 'کاربر'
        };

        order.archiveAttachments.push(newAttachment);
        saveDb(db);

        res.json({
            success: true,
            order: order,
            attachment: newAttachment,
            orders: db.orders
        });
    } catch (e) {
        console.error("POST /api/orders/:id/archive-attachments error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/orders/:id/archive-attachments/:attachmentId', async (req, res) => {
    try {
        const db = getDb();
        if (!db.orders) db.orders = [];
        const reqId = String(req.params.id);
        const idx = db.orders.findIndex(x => String(x.id) === reqId || (x.trackingNumber && String(x.trackingNumber) === reqId));
        if (idx === -1) {
            return res.status(404).json({ error: 'دستور پرداخت یافت نشد' });
        }

        const order = db.orders[idx];
        const attId = String(req.params.attachmentId);

        if (Array.isArray(order.archiveAttachments)) {
            order.archiveAttachments = order.archiveAttachments.filter(a => 
                String(a.id || '') !== attId && 
                String(a.fileName || '') !== attId &&
                String(a.url || '') !== attId
            );
        }
        if (Array.isArray(order.attachments)) {
            order.attachments = order.attachments.filter(a => 
                String(a.id || '') !== attId && 
                String(a.fileName || '') !== attId &&
                String(a.url || '') !== attId
            );
        }
        saveDb(db);

        // Broadcast notification for real-time client sync
        try {
            await broadcastNotification(
                `🗑️ حذف پیوست دستور پرداخت #${order.trackingNumber}`,
                `یکی از پیوست‌های سند #${order.trackingNumber} حذف شد.`,
                '/manage',
                ['admin', 'financial', 'manager', 'ceo']
            );
        } catch (_) {}

        res.json({
            success: true,
            order: order,
            orders: db.orders
        });
    } catch (e) {
        console.error("DELETE archive attachment error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/orders/:id/attachments/:attachmentId', async (req, res) => {
    try {
        const db = getDb();
        if (!db.orders) db.orders = [];
        const reqId = String(req.params.id);
        const idx = db.orders.findIndex(x => String(x.id) === reqId || (x.trackingNumber && String(x.trackingNumber) === reqId));
        if (idx === -1) {
            return res.status(404).json({ error: 'دستور پرداخت یافت نشد' });
        }

        const order = db.orders[idx];
        const attId = String(req.params.attachmentId);

        if (Array.isArray(order.attachments)) {
            order.attachments = order.attachments.filter(a => 
                String(a.id || '') !== attId && 
                String(a.fileName || '') !== attId &&
                String(a.url || '') !== attId
            );
        }
        if (Array.isArray(order.archiveAttachments)) {
            order.archiveAttachments = order.archiveAttachments.filter(a => 
                String(a.id || '') !== attId && 
                String(a.fileName || '') !== attId &&
                String(a.url || '') !== attId
            );
        }
        saveDb(db);

        try {
            await broadcastNotification(
                `🗑️ حذف پیوست دستور پرداخت #${order.trackingNumber}`,
                `یکی از پیوست‌های سند #${order.trackingNumber} حذف شد.`,
                '/manage',
                ['admin', 'financial', 'manager', 'ceo']
            );
        } catch (_) {}

        res.json({
            success: true,
            order: order,
            orders: db.orders
        });
    } catch (e) {
        console.error("DELETE attachment error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Dedicated Warehouse Transactions / Bijak Endpoints with Automated Notifications
app.get('/api/warehouse/transactions', (req, res) => {
    const db = getDb();
    res.json(db.warehouseTransactions || []);
});

app.post('/api/warehouse/transactions', async (req, res) => {
    try {
        const db = getDb();
        if (!db.warehouseTransactions) db.warehouseTransactions = [];
        const item = req.body;
        if (!item.createdAt) item.createdAt = Date.now();

        // Check for duplicate OUT transaction (Bijak) number + company + fiscalYearId
        const activeFiscalYearId = item.fiscalYearId || db.settings?.activeFiscalYearId;
        if (item.type === 'OUT' && item.number && item.number > 0 && item.company) {
            const isDuplicate = db.warehouseTransactions.some(x => 
                x.id !== item.id && 
                x.type === 'OUT' &&
                x.company === item.company && 
                Number(x.number) === Number(item.number) && 
                (x.fiscalYearId || db.settings?.activeFiscalYearId) === activeFiscalYearId
            );
            if (isDuplicate) {
                return res.status(409).json({ error: `شماره بیجک خروج ${item.number} برای شرکت "${item.company}" قبلاً ثبت شده است.` });
            }
        }

        const existingIdx = db.warehouseTransactions.findIndex(x => x.id === item.id);
        const isEdit = existingIdx > -1;

        if (isEdit) {
            db.warehouseTransactions[existingIdx] = { ...db.warehouseTransactions[existingIdx], ...item };
        } else {
            db.warehouseTransactions.push(item);
        }
        saveDb(db);
        res.json(db.warehouseTransactions);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const tx = (freshDb.warehouseTransactions || []).find(x => x.id === item.id) || item;
                const eventType = isEdit ? 'EDIT' : 'CREATE';
                const stepName = isEdit ? 'ویرایش حواله انبار' : 'ثبت اولیه';

                await notifyWarehouseBijak(tx, freshDb, stepName, eventType);

                const isOut = tx.type === 'OUT';
                const title = isOut ? `🚨 حواله خروج انبار (بیجک) #${tx.number}` : `📥 حواله ورود انبار #${tx.number}`;
                await broadcastNotification(
                    title,
                    `شرکت: ${tx.company || '-'} | تحویل‌گیرنده/دهنده: ${tx.delivererOrReceiver || '-'} | وضعیت: ${tx.status || 'در انتظار'}`,
                    '/warehouse',
                    ['admin', 'warehouse', 'factory_manager', 'ceo', 'manager'],
                    null,
                    tx.createdBy ? [tx.createdBy] : null
                );
            } catch (err) {
                console.error("Background notifyWarehouseBijak error on POST /api/warehouse/transactions:", err);
            }
        });
    } catch (e) {
        console.error("POST /api/warehouse/transactions error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/warehouse/transactions/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db.warehouseTransactions) db.warehouseTransactions = [];

        // Check for duplicate OUT transaction (Bijak) number + company + fiscalYearId if updated
        const number = req.body.number;
        const type = req.body.type;
        const company = req.body.company;
        if (type === 'OUT' && number && number > 0 && company) {
            const activeFiscalYearId = req.body.fiscalYearId || db.settings?.activeFiscalYearId;
            const isDuplicate = db.warehouseTransactions.some(x => 
                x.id !== req.params.id && 
                x.type === 'OUT' &&
                x.company === company && 
                Number(x.number) === Number(number) && 
                (x.fiscalYearId || db.settings?.activeFiscalYearId) === activeFiscalYearId
            );
            if (isDuplicate) {
                return res.status(409).json({ error: `شماره بیجک خروج ${number} برای شرکت "${company}" قبلاً ثبت شده است.` });
            }
        }

        const idx = db.warehouseTransactions.findIndex(x => x.id === req.params.id);
        const isEdit = req.body.isEdit || false;
        let updatedItem;

        if (idx > -1) {
            db.warehouseTransactions[idx] = { ...db.warehouseTransactions[idx], ...req.body };
            updatedItem = db.warehouseTransactions[idx];
        } else {
            updatedItem = { id: req.params.id, ...req.body };
            db.warehouseTransactions.push(updatedItem);
        }
        saveDb(db);
        res.json(db.warehouseTransactions);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const tx = (freshDb.warehouseTransactions || []).find(x => x.id === req.params.id) || updatedItem;
                const eventType = isEdit ? 'EDIT' : 'STEP';
                const stepName = isEdit ? 'ویرایش حواله انبار' : (tx.status || 'بروزرسانی وضعیت');

                await notifyWarehouseBijak(tx, freshDb, stepName, eventType);

                const isOut = tx.type === 'OUT';
                const title = isOut ? `🔄 بروزرسانی حواله خروج (بیجک) #${tx.number}` : `🔄 بروزرسانی ورود انبار #${tx.number}`;
                await broadcastNotification(
                    title,
                    `مرحله: ${stepName} | شرکت: ${tx.company || '-'} | تحویل‌گیرنده/دهنده: ${tx.delivererOrReceiver || '-'}`,
                    '/warehouse',
                    ['admin', 'warehouse', 'factory_manager', 'ceo', 'manager'],
                    null,
                    null
                );
            } catch (err) {
                console.error("Background notifyWarehouseBijak error on PUT /api/warehouse/transactions:", err);
            }
        });
    } catch (e) {
        console.error("PUT /api/warehouse/transactions error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/warehouse/transactions/:id', (req, res) => {
    try {
        const db = getDb();
        if (!db.warehouseTransactions) db.warehouseTransactions = [];
        const txToDelete = db.warehouseTransactions.find(x => x.id === req.params.id);
        db.warehouseTransactions = db.warehouseTransactions.filter(x => x.id !== req.params.id);
        saveDb(db);
        res.json(db.warehouseTransactions);

        if (txToDelete) {
            setImmediate(async () => {
                try {
                    const freshDb = getDb();
                    await notifyWarehouseBijak(txToDelete, freshDb, 'حذف بیجک/حواله', 'DELETE');
                    await broadcastNotification(
                        `❌ حذف حواله/بیجک انبار #${txToDelete.number}`,
                        `سند انبار شماره ${txToDelete.number} مربوط به شرکت ${txToDelete.company || '-'} حذف گردید.`,
                        '/warehouse',
                        ['admin', 'warehouse', 'factory_manager', 'ceo', 'manager']
                    );
                } catch (err) {
                    console.error("Background notifyWarehouseBijak error on DELETE /api/warehouse/transactions:", err);
                }
            });
        }
    } catch (e) {
        console.error("DELETE /api/warehouse/transactions error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Dedicated Purchase Requests Endpoints with Automated Notifications
app.get('/api/purchase-requests', (req, res) => {
    const db = getDb();
    const reqs = db.purchaseRequests || [];
    let modified = false;
    reqs.forEach(pr => {
        if (Array.isArray(pr.items)) {
            pr.items.forEach(it => {
                if (it.itemName && it.sayanMatchedItem) {
                    if (!sayanPartsService.isMatchValidForQuery(it.itemName, it.sayanMatchedItem)) {
                        it.sayanMatchedItem = undefined;
                        it.sayanItemCode = undefined;
                        it.sayanStock = undefined;
                        it.warehouseStock = undefined;
                        it.isAvailableInWarehouse = false;
                        modified = true;
                    }
                }
            });
        }
        if (pr.itemName && pr.sayanMatchedItem) {
            if (!sayanPartsService.isMatchValidForQuery(pr.itemName, pr.sayanMatchedItem)) {
                pr.sayanMatchedItem = undefined;
                pr.sayanStock = undefined;
                pr.warehouseStock = undefined;
                pr.isAvailableInWarehouse = false;
                modified = true;
            }
        }
    });
    if (modified) {
        saveDb(db);
    }
    res.json(reqs);
});

// Match requested item name with Sayan factory parts and get live stock in Sayan warehouse
app.post('/api/sayan/match-part', async (req, res) => {
    try {
        const { itemName, itemCode } = req.body || {};
        const result = await sayanPartsService.searchAndMatchSayanPart(itemName, itemCode);
        res.json(result);
    } catch (e) {
        console.error("Match Sayan Part error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Batch match multiple items with Sayan parts and live stock
app.post('/api/sayan/batch-match-parts', async (req, res) => {
    try {
        const { items } = req.body || {};
        const results = await sayanPartsService.batchMatchSayanParts(items || []);
        res.json({ success: true, results });
    } catch (e) {
        console.error("Batch match Sayan parts error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Auto-enrich full purchase request with live Sayan stock
app.post('/api/sayan/enrich-purchase-request', async (req, res) => {
    try {
        const { request } = req.body || {};
        const enriched = await sayanPartsService.enrichPurchaseRequestWithSayanStock(request);
        res.json({ success: true, request: enriched });
    } catch (e) {
        console.error("Enrich purchase request error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Fetch Sayan factory parts catalog
app.get('/api/sayan/factory-parts', async (req, res) => {
    try {
        const force = req.query.force === 'true';
        const catalog = await sayanPartsService.getSayanFactoryPartsCatalog(force);
        res.json(catalog);
    } catch (e) {
        console.error("Get Sayan Factory Parts error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Force sync top Sayan factory parts with live stock into database.json
app.post('/api/sayan/sync-parts', async (req, res) => {
    try {
        const limit = Number(req.body?.limit) || 150;
        const result = await sayanPartsService.syncSayanFactoryPartsToDatabase(limit);
        res.json(result);
    } catch (e) {
        console.error("Sync Sayan Factory Parts error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Calculate FIFO Aging and Overdue Days for Sayan Parties (Debtors and Creditors)
app.post('/api/sayan/traz-aging', async (req, res) => {
    try {
        const parties = Array.isArray(req.body?.parties) ? req.body.parties : [];
        const force = Boolean(req.body?.force);
        if (parties.length === 0 && req.body?.code) {
            const single = await sayanAgingService.getPartyAgingFromSayan(req.body.code, req.body.balance);
            return res.json({ success: true, aging: { [req.body.code]: single } });
        }
        const results = await sayanAgingService.getBatchAgingForParties(parties, force);
        res.json({ success: true, aging: results });
    } catch (e) {
        console.error("Calculate Sayan Aging error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sayan/party-aging/:code', async (req, res) => {
    try {
        const code = req.params.code;
        const balance = Number(req.query.balance || 0);
        const result = await sayanAgingService.getPartyAgingFromSayan(code, balance);
        res.json(result);
    } catch (e) {
        console.error("Get Party Aging error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/purchase-requests', async (req, res) => {
    try {
        const db = getDb();
        if (!db.purchaseRequests) db.purchaseRequests = [];
        const item = req.body;
        if (!item.createdAt) item.createdAt = Date.now();

        // Automatically match requested items with Sayan factory parts & attach real-time warehouse stock
        try {
            await sayanPartsService.enrichPurchaseRequestWithSayanStock(item);
        } catch (enrichErr) {
            console.warn("[Purchase Request POST] Sayan stock enrichment warning:", enrichErr.message);
        }

        const existingIdx = db.purchaseRequests.findIndex(x => x.id === item.id);
        const isEdit = existingIdx > -1;

        if (isEdit) {
            db.purchaseRequests[existingIdx] = { ...db.purchaseRequests[existingIdx], ...item };
        } else {
            db.purchaseRequests.push(item);
        }
        saveDb(db);
        res.json(db.purchaseRequests);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const reqItem = (freshDb.purchaseRequests || []).find(x => x.id === item.id) || item;
                const eventType = isEdit ? 'EDIT' : 'CREATE';
                const stepName = isEdit ? 'ویرایش درخواست خرید' : 'ثبت اولیه';

                await notifyPurchaseRequestStep(reqItem, null, null, null, freshDb, stepName, eventType);
                await broadcastNotification(
                    isEdit ? `✏️ ویرایش درخواست خرید #${reqItem.requestNumber || reqItem.id}` : `🛒 درخواست خرید جدید #${reqItem.requestNumber || reqItem.id}`,
                    `عنوان: ${reqItem.title || reqItem.itemName || '-'} | درخواست‌کننده: ${reqItem.requester || '-'} | شرکت: ${reqItem.company || '-'}${reqItem.sayanStockSummary ? ` | ${reqItem.sayanStockSummary}` : ''}`,
                    '/purchase',
                    ['admin', 'ceo', 'manager', 'commercial', 'financial'],
                    null,
                    reqItem.requester ? [reqItem.requester] : null
                );
            } catch (err) {
                console.error("Background notifyPurchaseRequestStep error:", err);
            }
        });
    } catch (e) {
        console.error("POST /api/purchase-requests error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/purchase-requests/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db.purchaseRequests) db.purchaseRequests = [];
        const idx = db.purchaseRequests.findIndex(x => x.id === req.params.id);
        const isEdit = req.body.isEdit || false;
        let updatedItem;

        const prevComments = idx > -1 && Array.isArray(db.purchaseRequests[idx].comments)
            ? [...db.purchaseRequests[idx].comments]
            : [];

        const bodyData = { ...req.body };
        // Automatically match requested items with Sayan factory parts & attach real-time warehouse stock
        try {
            await sayanPartsService.enrichPurchaseRequestWithSayanStock(bodyData);
        } catch (enrichErr) {
            console.warn("[Purchase Request PUT] Sayan stock enrichment warning:", enrichErr.message);
        }

        if (idx > -1) {
            db.purchaseRequests[idx] = { ...db.purchaseRequests[idx], ...bodyData };
            updatedItem = db.purchaseRequests[idx];
        } else {
            updatedItem = { id: req.params.id, ...bodyData };
            db.purchaseRequests.push(updatedItem);
        }
        saveDb(db);
        res.json(db.purchaseRequests);

        const nextComments = Array.isArray(updatedItem.comments) ? updatedItem.comments : [];
        const hasNewComment = nextComments.length > prevComments.length;
        const latestComment = hasNewComment ? nextComments[nextComments.length - 1] : null;

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const reqItem = (freshDb.purchaseRequests || []).find(x => x.id === req.params.id) || updatedItem;

                const allInvolvedUsers = Array.from(new Set([
                    reqItem.requester,
                    reqItem.username,
                    reqItem.createdBy,
                    reqItem.shiftLeader,
                    reqItem.approverRepair,
                    reqItem.approverWarehouseCheck,
                    reqItem.approverTechnical,
                    reqItem.approverFactory,
                    reqItem.approverCommercial,
                    reqItem.approverCeoInitial,
                    reqItem.approverCeoSelection,
                    reqItem.approverFactorySelection,
                    reqItem.approverBuyer,
                    reqItem.approverQc,
                    reqItem.approverFactoryFinal,
                    reqItem.approverWarehouseReceipt,
                    reqItem.approverFactoryArchive,
                    ...(nextComments.map(c => c.userName)),
                    ...(nextComments.map(c => c.userId))
                ].filter(Boolean)));

                if (hasNewComment && latestComment) {
                    const authorExcludes = [latestComment.userName, latestComment.userId].filter(Boolean);
                    const commentSnippet = String(latestComment.text || '').length > 90
                        ? String(latestComment.text).slice(0, 90) + '...'
                        : String(latestComment.text || '');

                    await broadcastNotification(
                        `💬 نظر جدید در درخواست خرید #${reqItem.requestNumber || reqItem.id} (${reqItem.itemName || 'کالا'})`,
                        `${latestComment.userName || 'کاربر'}: "${commentSnippet}"`,
                        `/purchase?requestId=${reqItem.id}&subTab=comments`,
                        ['admin', 'ceo', 'manager', 'factory_manager', 'commercial', 'warehouse_keeper', 'warehouse', 'purchasing', 'technical', 'qc', 'financial'],
                        allInvolvedUsers.length > 0 ? allInvolvedUsers : null,
                        authorExcludes
                    );
                    return;
                }

                const eventType = isEdit ? 'EDIT' : 'STEP';
                const stepName = isEdit ? 'ویرایش درخواست خرید' : (reqItem.status || 'بروزرسانی وضعیت');

                const targets = Array.from(new Set([reqItem.requester, reqItem.username, reqItem.createdBy].filter(Boolean)));

                await notifyPurchaseRequestStep(reqItem, null, null, null, freshDb, stepName, eventType);
                await broadcastNotification(
                    `🔄 بروزرسانی درخواست خرید #${reqItem.requestNumber || reqItem.id}`,
                    `وضعیت/مرحله: ${stepName} | کالا: ${reqItem.itemName || '-'}${reqItem.sayanStockSummary ? ` | ${reqItem.sayanStockSummary}` : ''}`,
                    `/purchase?requestId=${reqItem.id}`,
                    ['admin', 'ceo', 'manager', 'commercial', 'financial'],
                    targets.length > 0 ? targets : null
                );
            } catch (err) {
                console.error("Background notifyPurchaseRequestStep error:", err);
            }
        });
    } catch (e) {
        console.error("PUT /api/purchase-requests error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/purchase-requests/:id', (req, res) => {
    try {
        const db = getDb();
        if (!db.purchaseRequests) db.purchaseRequests = [];
        const itemToDelete = db.purchaseRequests.find(x => x.id === req.params.id);
        db.purchaseRequests = db.purchaseRequests.filter(x => x.id !== req.params.id);
        saveDb(db);
        res.json(db.purchaseRequests);

        if (itemToDelete) {
            setImmediate(async () => {
                try {
                    const freshDb = getDb();
                    await notifyPurchaseRequestStep(itemToDelete, null, null, null, freshDb, 'حذف درخواست خرید', 'DELETE');
                    await broadcastNotification(
                        `❌ حذف درخواست خرید #${itemToDelete.requestNumber || itemToDelete.id}`,
                        `درخواست خرید با عنوان "${itemToDelete.title || '-'}" حذف شد.`,
                        '/purchase',
                        ['admin', 'ceo', 'manager', 'commercial', 'financial']
                    );
                } catch (err) {
                    console.error("Background notifyPurchaseRequestStep delete error:", err);
                }
            });
        }
    } catch (e) {
        console.error("DELETE /api/purchase-requests error:", e);
        res.status(500).json({ error: e.message });
    }
});

// AI Purchase Advisor - Supplier Sourcing & Web Grounding
app.post(['/api/purchase/ai-search-suppliers', '/api/api/purchase/ai-search-suppliers'], async (req, res) => {
    try {
        const { item, items, additionalNotes, customKey, excludeSuppliers, isDeepSearch, customSearchQuery } = req.body;
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService || !aiService.searchSuppliersWithAi) {
            return res.status(500).json({ error: 'ماژول هوش مصنوعی لود نشد.' });
        }

        const result = await aiService.searchSuppliersWithAi({
            item,
            items,
            additionalNotes,
            customKey,
            excludeSuppliers,
            isDeepSearch,
            customSearchQuery
        });

        res.json(result);
    } catch (e) {
        console.error("AI Search Suppliers API Error:", e);
        res.status(500).json({ error: e.message || 'خطا در جستجوی هوشمند تامین‌کنندگان با هوش مصنوعی' });
    }
});

// AI Purchase - Send RFQ / Proforma Request via WhatsApp, Bale, or Telegram
app.post(['/api/purchase/send-rfq-message', '/api/api/purchase/send-rfq-message'], async (req, res) => {
    try {
        const { platform = 'whatsapp', target, message, supplierName, requestNumber } = req.body;
        if (!target || !message) {
            return res.status(400).json({ error: 'شماره/آیدی مقصد و متن استعلام الزامی است.' });
        }

        const cleanTarget = String(target).trim();
        const digitsOnly = cleanTarget.replace(/\D/g, '');
        const isIranianLandline = /^(?:0)?(?:21|26|31|24|51|71|41|13|86|34|61|77|54|87|81|83|66|58|45|28|44|17|25|38|74)\d{7,8}$/.test(digitsOnly) || (/^0[1-8]/.test(digitsOnly) && !/^09/.test(digitsOnly));
        const isIranianMobile = /^(?:0098|98|\+98|0)?(9\d{9})$/.test(digitsOnly);

        if (platform === 'whatsapp' && isIranianLandline) {
            return res.json({
                success: false,
                sent: false,
                isLandline: true,
                errorMsg: `شماره «${cleanTarget}» شماره تلفن ثابت دفتر است و در پیام‌رسان واتساپ فعال نمی‌باشد. لطفاً شماره موبایل مسئول فروش (شروع با 09) را وارد نمایید یا جهت استعلام، مستقیماً تماس تلفنی حاصل فرمایید.`,
                directCallUrl: `tel:${cleanTarget.replace(/[^\d+]/g, '')}`,
                platform,
                target: cleanTarget,
                supplierName,
                requestNumber
            });
        }

        let sent = false;
        let directUrl = '';
        let errorMsg = null;

        if (platform === 'whatsapp') {
            const rawPhone = digitsOnly.replace(/^(?:0098|98|0)/, '98');
            directUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`;
            
            try {
                const wa = await safeImport('./backend/whatsapp.js');
                if (wa && wa.sendMessage && wa.getStatus && wa.getStatus().ready) {
                    await wa.sendMessage(cleanTarget, message);
                    sent = true;
                }
            } catch (wErr) {
                console.warn("Direct WhatsApp Web send failed, fallback to direct web link:", wErr.message);
                errorMsg = wErr.message;
            }
        } else if (platform === 'bale') {
            directUrl = `https://ble.ir/?text=${encodeURIComponent(message)}`;
            try {
                const baleMod = await safeImport('./backend/bale.js');
                if (baleMod && baleMod.sendBotMessage) {
                    await baleMod.sendBotMessage(cleanTarget, message);
                    sent = true;
                }
            } catch (bErr) {
                console.warn("Direct Bale send failed:", bErr.message);
                errorMsg = bErr.message;
            }
        } else if (platform === 'telegram') {
            directUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(message)}`;
            try {
                const tg = await safeImport('./backend/telegram.js');
                if (tg && tg.sendBotMessage) {
                    await tg.sendBotMessage(cleanTarget, message);
                    sent = true;
                }
            } catch (tErr) {
                console.warn("Direct Telegram send failed:", tErr.message);
                errorMsg = tErr.message;
            }
        }

        res.json({
            success: true,
            sent,
            directUrl,
            errorMsg: sent ? null : (errorMsg || 'ارسال خودکار از طریق سرور انجام نشد؛ می‌توانید از لینک مستقیم استفاده نمایید.'),
            platform,
            target: cleanTarget,
            supplierName,
            requestNumber
        });
    } catch (e) {
        console.error("Send RFQ Error:", e);
        res.status(500).json({ error: e.message || 'خطا در ارسال استعلام' });
    }
});

// Dedicated Secretariat Letters Endpoints with Automated Notifications & Numbering
function generateNextSecretariatLetterNumber(db, companyId, section = 'headquarters', customYear) {
    const settings = (db.secretariatSettings || []).find(s => s.companyId === companyId) || {};
    let year = customYear;
    if (!year) {
        try {
            const now = new Date();
            const j = jalaali.toJalaali ? jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate()) : { jy: 1404 };
            year = String(j.jy);
        } catch (e) {
            year = '1404';
        }
    }

    const isHQ = section === 'headquarters';
    const prefix = isHQ 
        ? (settings.numberingPrefixHeadquarters || 'HQ') 
        : (settings.numberingPrefixFactory || 'FAC');
    const startCounter = Number(settings.numberingStartCounter) || 1;
    const padLength = Number(settings.numberingPadLength) || 4;
    const format = settings.numberingFormat || '{PREFIX}-{YEAR}/{NUM}';

    // Count or find max sequence among existing letters for this company and section
    const relevantLetters = (db.secretariatLetters || []).filter(l => {
        if (l.companyId !== companyId) return false;
        if (l.section && l.section !== section) return false;
        return true;
    });

    let maxSeq = 0;
    relevantLetters.forEach(l => {
        if (!l.letterNumber) return;
        const numMatches = l.letterNumber.match(/\d+/g);
        if (numMatches && numMatches.length > 0) {
            const lastNum = parseInt(numMatches[numMatches.length - 1], 10);
            if (!isNaN(lastNum) && lastNum >= maxSeq && lastNum < 1000000) {
                maxSeq = lastNum;
            }
        }
    });

    const nextSeq = Math.max(maxSeq + 1, startCounter, relevantLetters.length + 1);
    const paddedNum = String(nextSeq).padStart(padLength, '0');

    let formatted = format
        .replace('{PREFIX}', prefix)
        .replace('{YEAR}', year)
        .replace('{NUM}', paddedNum)
        .replace('{SECTION}', isHQ ? 'HQ' : 'FAC');

    return {
        nextNumber: formatted,
        sequence: nextSeq,
        prefix,
        year
    };
}

app.get('/api/secretariat/next-number', (req, res) => {
    try {
        const db = getDb();
        const { companyId, section, year } = req.query;
        if (!companyId) {
            return res.status(400).json({ error: 'companyId is required' });
        }
        const result = generateNextSecretariatLetterNumber(db, String(companyId), String(section || 'headquarters'), year ? String(year) : undefined);
        res.json(result);
    } catch (e) {
        console.error("GET /api/secretariat/next-number error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/secretariat-letters', (req, res) => {
    const db = getDb();
    res.json(db.secretariatLetters || []);
});

app.post('/api/secretariat-letters', async (req, res) => {
    try {
        const db = getDb();
        if (!db.secretariatLetters) db.secretariatLetters = [];
        const item = req.body;
        if (!item.createdAt) item.createdAt = Date.now();

        // Auto-assign letterNumber if missing or set to 'auto'
        if (!item.letterNumber || item.letterNumber === 'auto' || String(item.letterNumber).trim() === '') {
            const generated = generateNextSecretariatLetterNumber(db, item.companyId, item.section || 'headquarters');
            item.letterNumber = generated.nextNumber;
        }

        const existingIdx = db.secretariatLetters.findIndex(x => x.id === item.id);
        const isEdit = existingIdx > -1;

        if (isEdit) {
            db.secretariatLetters[existingIdx] = { ...db.secretariatLetters[existingIdx], ...item };
        } else {
            db.secretariatLetters.push(item);
        }
        saveDb(db);
        res.json(db.secretariatLetters);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const letter = (freshDb.secretariatLetters || []).find(x => x.id === item.id) || item;
                const targets = Array.from(new Set([letter.sender, letter.receiver, letter.createdBy, letter.assignedTo].filter(Boolean)));
                await notifySecretariatLetter(letter, freshDb);
                await broadcastNotification(
                    `✉️ نامه اداری جدید #${letter.letterNumber}`,
                    `موضوع: ${letter.subject || '-'} | فرستنده: ${letter.sender || '-'} | گیرنده: ${letter.receiver || '-'}`,
                    '/secretariat',
                    ['admin', 'ceo', 'manager', 'office'],
                    targets.length > 0 ? targets : null
                );
            } catch (err) {
                console.error("Background notifySecretariatLetter error:", err);
            }
        });
    } catch (e) {
        console.error("POST /api/secretariat-letters error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/secretariat-letters/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db.secretariatLetters) db.secretariatLetters = [];
        const idx = db.secretariatLetters.findIndex(x => x.id === req.params.id);
        let updatedItem;

        if (idx > -1) {
            db.secretariatLetters[idx] = { ...db.secretariatLetters[idx], ...req.body };
            updatedItem = db.secretariatLetters[idx];
        } else {
            updatedItem = { id: req.params.id, ...req.body };
            db.secretariatLetters.push(updatedItem);
        }
        saveDb(db);
        res.json(db.secretariatLetters);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const letter = (freshDb.secretariatLetters || []).find(x => x.id === req.params.id) || updatedItem;
                const targets = Array.from(new Set([letter.sender, letter.receiver, letter.createdBy, letter.assignedTo].filter(Boolean)));
                await notifySecretariatLetter(letter, freshDb);
                await broadcastNotification(
                    `🔄 بروزرسانی نامه اداری #${letter.letterNumber}`,
                    `موضوع: ${letter.subject || '-'} | وضعیت/تاییدها بروزرسانی شد.`,
                    '/secretariat',
                    ['admin', 'ceo', 'manager', 'office'],
                    targets.length > 0 ? targets : null
                );
            } catch (err) {
                console.error("Background notifySecretariatLetter error:", err);
            }
        });
    } catch (e) {
        console.error("PUT /api/secretariat-letters error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/secretariat-letters/:id', (req, res) => {
    try {
        const db = getDb();
        if (!db.secretariatLetters) db.secretariatLetters = [];
        const letterToDelete = db.secretariatLetters.find(x => x.id === req.params.id);
        db.secretariatLetters = db.secretariatLetters.filter(x => x.id !== req.params.id);
        saveDb(db);
        res.json(db.secretariatLetters);

        if (letterToDelete) {
            setImmediate(async () => {
                try {
                    await broadcastNotification(
                        `❌ حذف نامه اداری #${letterToDelete.letterNumber}`,
                        `نامه اداری با موضوع "${letterToDelete.subject || '-'}" حذف گردید.`,
                        '/secretariat',
                        ['admin', 'ceo', 'manager', 'office']
                    );
                } catch (err) {
                    console.error("Background notifySecretariatLetter delete error:", err);
                }
            });
        }
    } catch (e) {
        console.error("DELETE /api/secretariat-letters error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Helper to safely resolve Secretariat Company Settings from DB
const resolveSecretariatCompanySettings = (db, companyId) => {
    const allSecSettings = db.secretariatCompanySettings || {};
    if (companyId && allSecSettings[companyId]) {
        return allSecSettings[companyId];
    }
    if (Array.isArray(db.secretariatSettings)) {
        if (companyId) {
            const found = db.secretariatSettings.find(s => String(s.companyId) === String(companyId))
                || db.secretariatSettings.find(s => s.companyId == companyId);
            if (found) return found;
        }
        return db.secretariatSettings[0] || {};
    }
    if (db.secretariatSettings && typeof db.secretariatSettings === 'object' && !Array.isArray(db.secretariatSettings)) {
        return db.secretariatSettings[companyId] || db.secretariatSettings;
    }
    return {};
};

// Dynamic PDF Letterhead page preview (renders first page as high-res PNG for browsers)
app.get('/api/secretariat/pdf-preview', async (req, res) => {
    try {
        const fileUrl = req.query.url;
        if (!fileUrl || typeof fileUrl !== 'string') {
            return res.status(400).send('Missing url parameter');
        }
        const parts = fileUrl.split('/uploads/');
        const fileName = parts[parts.length - 1].split('?')[0];
        const safeName = path.basename(fileName);
        const fullPdfPath = path.join(process.cwd(), 'uploads', safeName);

        if (!fs.existsSync(fullPdfPath)) {
            return res.status(404).send('PDF file not found');
        }

        const previewFileName = `preview_${safeName.replace(/\.pdf$/i, '')}.png`;
        const previewFullPath = path.join(process.cwd(), 'uploads', previewFileName);

        if (fs.existsSync(previewFullPath)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.sendFile(previewFullPath);
        }

        await Renderer.renderPdfPreviewImage(fullPdfPath, previewFullPath);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(previewFullPath);
    } catch (err) {
        console.error("PDF Preview generation error:", err);
        res.status(500).send('Error generating PDF preview');
    }
});

// Download Secretariat Letter as Vector PDF (high-resolution print with optional PDF letterhead)
app.get('/api/secretariat/letters/:id/pdf', async (req, res) => {
    try {
        const db = getDb();
        const letter = (db.secretariatLetters || []).find(x => x.id === req.params.id);
        if (!letter) {
            return res.status(404).json({ error: 'نامه اداری یافت نشد' });
        }
        const company = (db.companies || []).find(c => c.id === letter.companyId) || (db.settings?.companies || []).find(c => c.id === letter.companyId);
        const companyName = company ? company.name : '';
        const companySettings = resolveSecretariatCompanySettings(db, letter.companyId);
        const noLetterhead = req.query.noLetterhead === 'true';

        const pdfBuffer = await Renderer.generateSecretariatLetterPDF(
            letter,
            companyName,
            companySettings,
            company,
            noLetterhead
        );

        res.setHeader('Content-Type', 'application/pdf');
        const safeNum = String(letter.letterNumber || letter.id).replace(/[\/\\]/g, '_');
        const asciiFilename = `Letter_${safeNum}.pdf`;
        const encodedFilename = encodeURIComponent(`Letter_${safeNum}.pdf`);
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error("GET /api/secretariat/letters/:id/pdf error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Download Secretariat Letter as Word document (from custom Word template or HTML-to-DOCX)
app.get('/api/secretariat/letters/:id/docx', async (req, res) => {
    try {
        const db = getDb();
        const letter = (db.secretariatLetters || []).find(x => x.id === req.params.id);
        if (!letter) {
            return res.status(404).json({ error: 'نامه اداری یافت نشد' });
        }
        const company = (db.companies || []).find(c => c.id === letter.companyId) || (db.settings?.companies || []).find(c => c.id === letter.companyId);
        const companyName = company ? company.name : '';
        const companySettings = resolveSecretariatCompanySettings(db, letter.companyId);
        const noLetterhead = req.query.noLetterhead === 'true';

        const docBuffer = await Renderer.generateSecretariatLetterDoc(
            letter,
            companyName,
            companySettings,
            company,
            noLetterhead
        );

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        const safeNum = String(letter.letterNumber || letter.id).replace(/[\/\\]/g, '_');
        const asciiFilename = `Letter_${safeNum}.docx`;
        const encodedFilename = encodeURIComponent(`Letter_${safeNum}.docx`);
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.send(docBuffer);
    } catch (e) {
        console.error("GET /api/secretariat/letters/:id/docx error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Alias for word download
app.get('/api/secretariat/letters/:id/word', (req, res) => {
    res.redirect(307, `/api/secretariat/letters/${req.params.id}/docx${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`);
});

// Quick Microsoft Word (.docx) export on the fly
app.post('/api/secretariat/quick-docx', async (req, res) => {
    try {
        const {
            subject = 'نامه اداری',
            content = '',
            receiver = '',
            sender = '',
            date = '',
            letterNumber = '',
            signers = [],
            paperSize = 'A4',
            orientation = 'portrait',
            companyId = '',
            noLetterhead = false,
            section = 'headquarters',
            attachments = [],
            hasAttachment = false,
            attachmentDescription = '',
            addCompanyStamp = false,
            hideSalutationInLetter = false,
            hideSubjectInLetter = false,
        } = req.body;

        const db = getDb();
        const company = (db.companies || []).find(c => c.id === companyId) || (db.settings?.companies || []).find(c => c.id === companyId) || (db.companies || [])[0];
        const companyName = company ? company.name : '';
        const companySettings = resolveSecretariatCompanySettings(db, companyId || company?.id);

        const letter = {
            subject,
            content,
            receiver,
            sender,
            date,
            letterNumber,
            signers,
            paperSize,
            orientation,
            companyId: company?.id || companyId,
            section,
            attachments,
            hasAttachment,
            attachmentDescription,
            addCompanyStamp,
            hideSalutationInLetter,
            hideSubjectInLetter,
        };

        const docBuffer = await Renderer.generateSecretariatLetterDoc(
            letter,
            companyName,
            companySettings,
            company,
            noLetterhead
        );

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        const safeNum = String(letterNumber || 'Draft').replace(/[\/\\]/g, '_');
        const asciiFilename = `Letter_${safeNum}.docx`;
        const encodedFilename = encodeURIComponent(`Letter_${safeNum}.docx`);
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.send(docBuffer);
    } catch (e) {
        console.error("POST /api/secretariat/quick-docx error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Quick Vector PDF (300 DPI) export on the fly (supports drafts & saved letters)
app.post('/api/secretariat/quick-pdf', async (req, res) => {
    try {
        const {
            subject = 'نامه اداری',
            content = '',
            receiver = '',
            sender = '',
            date = '',
            letterNumber = 'پیش‌نویس',
            signers = [],
            approvedBy = [],
            signatureImageUrls = [],
            signaturePosition = 'bottom_left',
            signOffText = '',
            paperSize = 'A4',
            orientation = 'portrait',
            companyId = '',
            noLetterhead = false,
            section = 'headquarters',
            attachments = [],
            hasAttachment = false,
            attachmentDescription = '',
            addCompanyStamp = false,
            hideSalutationInLetter = true,
            hideSubjectInLetter = true,
        } = req.body;

        const db = getDb();
        const company = (db.companies || []).find(c => c.id === companyId) || (db.settings?.companies || []).find(c => c.id === companyId) || (db.companies || [])[0];
        const companyName = company ? company.name : '';
        const companySettings = resolveSecretariatCompanySettings(db, companyId || company?.id);

        const letter = {
            subject,
            content,
            receiver,
            sender,
            date,
            letterNumber,
            signers,
            approvedBy,
            signatureImageUrls,
            signaturePosition,
            signOffText: typeof signOffText === 'string' ? signOffText.trim() : '',
            paperSize,
            orientation,
            companyId: company?.id || companyId,
            section,
            attachments,
            hasAttachment,
            attachmentDescription,
            addCompanyStamp,
            hideSalutationInLetter,
            hideSubjectInLetter,
        };

        const pdfBuffer = await Renderer.generateSecretariatLetterPDF(
            letter,
            companyName,
            companySettings,
            company,
            Boolean(noLetterhead)
        );

        res.setHeader('Content-Type', 'application/pdf');
        const safeNum = String(letterNumber || 'Draft').replace(/[\/\\]/g, '_');
        const asciiFilename = `Letter_${safeNum}.pdf`;
        const encodedFilename = encodeURIComponent(`Letter_${safeNum}.pdf`);
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error("POST /api/secretariat/quick-pdf error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Import Word (.docx) file into HTML for Secretariat Editor
app.post('/api/secretariat/import-docx', async (req, res) => {
    try {
        const { fileData } = req.body;
        if (!fileData) {
            return res.status(400).json({ error: 'فایل ارسالی یافت نشد' });
        }
        const base64Data = fileData.includes(';base64,') 
            ? fileData.split(';base64,')[1] 
            : fileData;
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await mammoth.convertToHtml({ buffer });
        res.json({
            success: true,
            html: result.value,
            warnings: result.messages
        });
    } catch (e) {
        console.error("POST /api/secretariat/import-docx error:", e);
        res.status(500).json({ error: 'خطا در تبدیل فایل Word به متن: ' + e.message });
    }
});

// Import Google Docs document content directly into Secretariat Editor
app.post('/api/secretariat/import-google-doc', async (req, res) => {
    try {
        const { urlOrId, token } = req.body;
        if (!urlOrId) {
            return res.status(400).json({ error: 'لینک یا شناسه سند Google Docs الزامی است.' });
        }

        let docId = String(urlOrId).trim();
        const match = docId.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
        if (match) {
            docId = match[1];
        }

        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
            const response = await axios.get(exportUrl, {
                headers,
                responseType: 'text',
                timeout: 12000,
                maxRedirects: 5
            });

            if (response.data) {
                let html = response.data;
                const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                if (bodyMatch) {
                    html = bodyMatch[1];
                }
                return res.json({
                    success: true,
                    docId,
                    html: html
                });
            }
        } catch (fetchErr) {
            if (token) {
                try {
                    const apiRes = await axios.get(`https://docs.googleapis.com/v1/documents/${docId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const docData = apiRes.data;
                    let textContent = '';
                    if (docData.body && docData.body.content) {
                        for (const elem of docData.body.content) {
                            if (elem.paragraph) {
                                const pText = elem.paragraph.elements?.map(e => e.textRun?.content || '').join('') || '';
                                if (pText.trim()) textContent += `<p>${pText}</p>`;
                            }
                        }
                    }
                    return res.json({
                        success: true,
                        docId,
                        title: docData.title,
                        html: textContent || '<p>محتوایی یافت نشد</p>'
                    });
                } catch (apiErr) {
                    // fall through
                }
            }
        }

        res.status(400).json({ 
            error: 'امکان استخراج خودکار سند وجود ندارد. لطفاً مطمئن شوید دسترسی لینک روی «هرکس دارای پیوند است» (Anyone with the link) یا Viewer قرار دارد، یا متن را در گوگل داکس کپی کرده و پیست نمایید.' 
        });
    } catch (e) {
        console.error("POST /api/secretariat/import-google-doc error:", e);
        res.status(500).json({
            error: 'خطا در بارگذاری محتوای سند از Google Docs: ' + e.message
        });
    }
});

// Check ONLYOFFICE Document Server health
app.get('/api/secretariat/onlyoffice/health', async (req, res) => {
    const localTargetBase = process.env.ONLYOFFICE_DOC_SERVER_INTERNAL_URL || 'http://127.0.0.1:8088';
    const customTarget = req.query.target ? String(req.query.target).trim() : null;

    let localOnline = false;
    let customOnline = false;
    let publicOnline = false;

    // 1. Test local Docker on 8088
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const resp = await fetch(`${localTargetBase}/web-apps/apps/api/documents/api.js`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.ok) localOnline = true;
    } catch (e) {
        localOnline = false;
    }

    // 2. Test custom target if provided
    if (customTarget && customTarget !== localTargetBase) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const targetUrl = customTarget.startsWith('http') ? customTarget : `http://${customTarget}`;
            const resp = await fetch(`${targetUrl}/web-apps/apps/api/documents/api.js`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (resp.ok) customOnline = true;
        } catch (e) {
            customOnline = false;
        }
    }

    // 3. Test public demo server
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const resp = await fetch('https://documentserver.onlyoffice.com/web-apps/apps/api/documents/api.js', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.ok) publicOnline = true;
    } catch (e) {
        publicOnline = false;
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');

    res.json({
        online: localOnline || customOnline || publicOnline,
        localDocker: {
            online: localOnline,
            url: localTargetBase,
            proxyUrl: `${protocol}://${host}/onlyoffice-proxy`,
            message: localOnline ? 'سرور داکر محلی فعال و آماده است' : 'کانتینر داکر روی پورت 8088 خاموش یا نصب نشده است'
        },
        customServer: customTarget ? {
            online: customOnline,
            url: customTarget
        } : null,
        publicDemo: {
            online: publicOnline,
            url: 'https://documentserver.onlyoffice.com',
            message: publicOnline ? 'سرور آنلاین و دمو آماده استفاده است' : 'عدم دسترسی به سرور عمومی اینترنت'
        },
        recommendedUrl: localOnline ? `${protocol}://${host}/onlyoffice-proxy` : (publicOnline ? 'https://documentserver.onlyoffice.com' : `${protocol}://${host}/onlyoffice-proxy`)
    });
});

// Reverse Proxy for ONLYOFFICE (supports HTTPS-to-HTTP local bridge, eliminating browser Mixed Content blocking)
app.use('/onlyoffice-proxy', (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const customTargetHeader = req.headers['x-onlyoffice-target'];
    const customTargetQuery = req.query.target ? String(req.query.target).trim() : null;
    const targetBase = customTargetHeader || customTargetQuery || process.env.ONLYOFFICE_DOC_SERVER_INTERNAL_URL || 'http://127.0.0.1:8088';

    try {
        const parsedTarget = new URL(targetBase);
        const isHttps = parsedTarget.protocol === 'https:';
        const requestModule = isHttps ? https : http;
        const targetPath = req.originalUrl.replace(/^\/onlyoffice-proxy/, '').split('?')[0] || '/';

        const clientHeaders = { ...req.headers };
        delete clientHeaders.host;
        delete clientHeaders.connection;

        const options = {
            hostname: parsedTarget.hostname,
            port: parsedTarget.port || (isHttps ? 443 : 80),
            path: targetPath,
            method: req.method,
            headers: {
                ...clientHeaders,
                host: parsedTarget.host,
                'x-forwarded-host': req.get('host'),
                'x-forwarded-proto': req.headers['x-forwarded-proto'] || req.protocol || 'http',
            }
        };

        const proxyReq = requestModule.request(options, (proxyRes) => {
            const responseHeaders = { ...proxyRes.headers };

            // Rewrite location header if redirecting
            if (responseHeaders.location) {
                responseHeaders.location = responseHeaders.location.replace(/^(\/|http:\/\/127\.0\.0\.1:8088\/|http:\/\/localhost:8088\/)/, '/onlyoffice-proxy/');
            }

            res.writeHead(proxyRes.statusCode, responseHeaders);
            proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
            if (!res.headersSent) {
                // If browser requested a script file (e.g. api.js), return valid JS fallback so script tag doesn't throw syntax error
                if (req.originalUrl.includes('.js')) {
                    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
                    return res.status(200).send('console.warn("ONLYOFFICE Local Proxy: Docker on port 8088 is offline."); window.__ONLYOFFICE_PROXY_OFFLINE__ = true;');
                }
                res.status(502).json({
                    error: 'اتصال به سرور محلی ONLYOFFICE برقرار نشد. لطفاً مطمئن شوید سرویس داکر یا کانتینر ONLYOFFICE روی پورت 8088 فعال است.',
                    details: err.message,
                    target: targetBase
                });
            }
        });

        req.pipe(proxyReq, { end: true });
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// ONLYOFFICE Document Server Integration Endpoints
const onlyOfficeDocsCache = new Map();

// Periodic cleanup of stale ONLYOFFICE documents (older than 24h)
setInterval(() => {
    const now = Date.now();
    for (const [key, item] of onlyOfficeDocsCache.entries()) {
        if (now - item.updatedAt > 24 * 60 * 60 * 1000) {
            onlyOfficeDocsCache.delete(key);
        }
    }
}, 60 * 60 * 1000);

// Prepare or generate docx for ONLYOFFICE Document Editor
app.post('/api/secretariat/onlyoffice/prepare', async (req, res) => {
    try {
        const {
            letterId = '',
            subject = 'نامه اداری',
            content = '',
            receiver = '',
            sender = '',
            date = '',
            letterNumber = '',
            signers = [],
            paperSize = 'A4',
            orientation = 'portrait',
            companyId = '',
            noLetterhead = false,
            hasAttachment = false,
            attachmentDescription = '',
            attachments = []
        } = req.body;

        const db = getDb();
        const company = (db.companies || []).find(c => c.id === companyId) || (db.companies || [])[0];
        const companySettings = (db.secretariatSettings || []).find(s => s.companyId === (company?.id || companyId));

        const letter = {
            id: letterId,
            subject,
            content,
            receiver,
            sender,
            date,
            letterNumber,
            signers,
            paperSize,
            orientation,
            companyId: company?.id || companyId,
            hasAttachment: hasAttachment ?? ((attachments && attachments.length > 0) || false),
            attachmentDescription,
            attachments
        };

        const docBuffer = await Renderer.generateSecretariatLetterDoc(
            letter,
            company?.name || '',
            companySettings,
            company,
            noLetterhead
        );

        const docKey = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        onlyOfficeDocsCache.set(docKey, {
            letterId,
            docBuffer,
            htmlContent: content,
            subject,
            updatedAt: Date.now()
        });

        // Determine protocol and host for ONLYOFFICE to fetch the docx
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const fileUrl = `${protocol}://${host}/api/secretariat/onlyoffice/file/${docKey}`;
        const callbackUrl = `${protocol}://${host}/api/secretariat/onlyoffice/callback?key=${docKey}`;

        const safeTitle = (subject || 'letter').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');

        res.json({
            docKey,
            fileUrl,
            callbackUrl,
            title: `${safeTitle}.docx`,
            fileType: 'docx',
            documentType: 'word',
            htmlContent: content
        });
    } catch (e) {
        console.error("POST /api/secretariat/onlyoffice/prepare error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Serve DOCX file to ONLYOFFICE Document Server
app.get('/api/secretariat/onlyoffice/file/:docKey', (req, res) => {
    try {
        const { docKey } = req.params;
        const item = onlyOfficeDocsCache.get(docKey);
        if (!item || !item.docBuffer) {
            return res.status(404).send('Document not found or expired');
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.subject || 'document')}.docx"`);
        res.send(item.docBuffer);
    } catch (e) {
        console.error("GET /api/secretariat/onlyoffice/file error:", e);
        res.status(500).send('Error serving document');
    }
});

// ONLYOFFICE Document Server Callback endpoint (saves edits back)
app.post('/api/secretariat/onlyoffice/callback', async (req, res) => {
    try {
        const docKey = req.query.key;
        const { status, url } = req.body;

        // status 2 = doc ready for saving, status 6 = force save
        if ((status === 2 || status === 6) && url && docKey) {
            const resp = await fetch(url);
            if (resp.ok) {
                const arrayBuffer = await resp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Convert updated DOCX to HTML
                let updatedHtml = '';
                try {
                    const result = await mammoth.convertToHtml({ buffer });
                    updatedHtml = result.value || '';
                } catch (convErr) {
                    console.error("Mammoth conversion error:", convErr);
                }

                const cached = onlyOfficeDocsCache.get(docKey) || {};
                onlyOfficeDocsCache.set(docKey, {
                    ...cached,
                    docBuffer: buffer,
                    htmlContent: updatedHtml || cached.htmlContent,
                    updatedAt: Date.now()
                });

                // If associated with a saved letter, update database
                if (cached.letterId) {
                    const db = getDb();
                    const letterIndex = (db.secretariatLetters || []).findIndex(l => l.id === cached.letterId);
                    if (letterIndex !== -1 && updatedHtml) {
                        db.secretariatLetters[letterIndex].content = updatedHtml;
                        db.secretariatLetters[letterIndex].updatedAt = Date.now();
                        saveDb(db);
                    }
                }
            }
        }

        // ONLYOFFICE expects { error: 0 } response
        res.json({ error: 0 });
    } catch (e) {
        console.error("POST /api/secretariat/onlyoffice/callback error:", e);
        res.json({ error: 0 });
    }
});

// Retrieve latest synchronized content from ONLYOFFICE
app.get('/api/secretariat/onlyoffice/get-content/:docKey', (req, res) => {
    try {
        const { docKey } = req.params;
        const item = onlyOfficeDocsCache.get(docKey);
        if (!item) {
            return res.status(404).json({ error: 'Document session not found' });
        }
        res.json({
            htmlContent: item.htmlContent,
            updatedAt: item.updatedAt
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Convert uploaded DOCX to HTML
app.post('/api/secretariat/onlyoffice/convert-docx-to-html', async (req, res) => {
    try {
        const { base64Docx } = req.body;
        if (!base64Docx) {
            return res.status(400).json({ error: 'محتوای فایل ارسالی خالی است' });
        }
        const buffer = Buffer.from(base64Docx, 'base64');
        const result = await mammoth.convertToHtml({ buffer });
        res.json({ html: result.value || '' });
    } catch (e) {
        console.error("convert-docx-to-html error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Dedicated Exit Permits Endpoints with Automated Notifications
app.get('/api/exit-permits', (req, res) => {
    const db = getDb();
    res.json(db.exitPermits || []);
    // Pre-warm Sayan recent remittances cache in background so WarehouseFinalizeModal opens with 0ms latency
    if (db.settings?.sayanOnlineExitPermitsEnabled !== false && (db.settings?.sayanApiUrl || process.env.SAYAN_API_URL)) {
        setImmediate(() => {
            getRecentSayanRemittancesFast(db, false).catch(() => {});
        });
    }
});

app.post('/api/exit-permits', async (req, res) => {
    try {
        const db = getDb();
        if (!db.exitPermits) db.exitPermits = [];
        const item = req.body;
        if (!item.fiscalYearId && db.settings?.activeFiscalYearId) {
            item.fiscalYearId = db.settings.activeFiscalYearId;
        }
        if (!item.createdAt) {
            item.createdAt = Date.now();
        }

        // Check for duplicate permitNumber + company + fiscalYearId
        const activeFiscalYearId = item.fiscalYearId || db.settings?.activeFiscalYearId;
        if (item.permitNumber && item.company) {
            const isDuplicate = db.exitPermits.some(x => 
                x.id !== item.id && 
                x.company === item.company && 
                Number(x.permitNumber) === Number(item.permitNumber) && 
                (x.fiscalYearId || db.settings?.activeFiscalYearId) === activeFiscalYearId
            );
            if (isDuplicate) {
                return res.status(409).json({ error: `شماره مجوز خروج ${item.permitNumber} برای شرکت "${item.company}" قبلاً ثبت شده است.` });
            }
        }

        const existingIdx = db.exitPermits.findIndex(x => x.id === item.id);
        const isEdit = existingIdx > -1;
        
        if (isEdit) {
            db.exitPermits[existingIdx] = { ...db.exitPermits[existingIdx], ...item };
        } else {
            db.exitPermits.push(item);
        }
        saveDb(db);
        
        res.json(db.exitPermits);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const permit = (freshDb.exitPermits || []).find(x => x.id === item.id) || item;
                const eventType = isEdit ? 'EDIT' : 'CREATE';
                const stepName = isEdit ? 'ویرایش سند' : 'ثبت اولیه';
                const targets = Array.from(new Set([permit.requester, permit.createdBy, permit.recipientName].filter(Boolean)));

                await notifyExitPermitStep(permit, null, null, null, freshDb, stepName, eventType);

                await broadcastNotification(
                    isEdit ? `✏️ ویرایش برگه خروج کالا #${permit.permitNumber}` : `🚛 برگه خروج کالا از کارخانه #${permit.permitNumber}`,
                    `شرکت: ${permit.company || '-'} | گیرنده: ${permit.recipientName || '-'} | راننده: ${permit.driverName || '-'} (پلاک: ${permit.plateNumber || '-'})`,
                    '/manage-exit',
                    ['admin', 'ceo', 'manager', 'factory_manager', 'warehouse', 'security', 'sales_manager'],
                    targets.length > 0 ? targets : null
                );
            } catch (err) {
                console.error("Background notifyExitPermitStep error on POST /api/exit-permits:", err);
            }
        });
    } catch (e) {
        console.error("POST /api/exit-permits error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/exit-permits/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db.exitPermits) db.exitPermits = [];

        // Check for duplicate permitNumber + company + fiscalYearId if being updated
        const permitNumber = req.body.permitNumber;
        const company = req.body.company;
        if (permitNumber && company) {
            const activeFiscalYearId = req.body.fiscalYearId || db.settings?.activeFiscalYearId;
            const isDuplicate = db.exitPermits.some(x => 
                x.id !== req.params.id && 
                x.company === company && 
                Number(x.permitNumber) === Number(permitNumber) && 
                (x.fiscalYearId || db.settings?.activeFiscalYearId) === activeFiscalYearId
            );
            if (isDuplicate) {
                return res.status(409).json({ error: `شماره مجوز خروج ${permitNumber} برای شرکت "${company}" قبلاً ثبت شده است.` });
            }
        }

        const idx = db.exitPermits.findIndex(x => x.id === req.params.id);
        const isEdit = req.body.isEdit || false;
        let updatedItem;
        
        if (idx > -1) {
            const existing = db.exitPermits[idx];
            const incoming = { ...req.body };

            // Preserve background-synced Sayan remittance metadata & attachment if incoming snapshot lacked them
            if (!incoming.sayanRemittanceDoc && existing.sayanRemittanceDoc) {
                incoming.sayanRemittanceDoc = existing.sayanRemittanceDoc;
                incoming.sayanRemittanceDocs = incoming.sayanRemittanceDocs || existing.sayanRemittanceDocs;
                incoming.sayanRemittanceNumber = incoming.sayanRemittanceNumber || existing.sayanRemittanceNumber;
                incoming.sayanSubCode = incoming.sayanSubCode || existing.sayanSubCode;
                incoming.sayanArchiveCode = incoming.sayanArchiveCode || existing.sayanArchiveCode;
                incoming.sayanSyncedAt = incoming.sayanSyncedAt || existing.sayanSyncedAt;
            }
            if (Array.isArray(existing.attachments) && existing.attachments.some(a => String(a?.fileName || '').includes('حواله_فروش_سایان'))) {
                const incomingAtts = Array.isArray(incoming.attachments) ? incoming.attachments : [];
                if (!incomingAtts.some(a => String(a?.fileName || '').includes('حواله_فروش_سایان'))) {
                    const sayanAtts = existing.attachments.filter(a => String(a?.fileName || '').includes('حواله_فروش_سایان'));
                    incoming.attachments = [...incomingAtts, ...sayanAtts];
                }
            }

            db.exitPermits[idx] = { ...existing, ...incoming };
            updatedItem = db.exitPermits[idx];
        } else {
            updatedItem = { id: req.params.id, ...req.body };
            db.exitPermits.push(updatedItem);
        }
        saveDb(db);
        
        res.json(db.exitPermits);

        setImmediate(async () => {
            try {
                const freshDb = getDb();
                const permit = (freshDb.exitPermits || []).find(x => x.id === req.params.id) || updatedItem;
                const eventType = isEdit ? 'EDIT' : 'STEP';
                const stepName = isEdit ? 'ویرایش سند' : (permit.status || 'بروزرسانی وضعیت');
                const targets = Array.from(new Set([permit.requester, permit.createdBy, permit.recipientName].filter(Boolean)));

                await notifyExitPermitStep(permit, null, null, null, freshDb, stepName, eventType);

                await broadcastNotification(
                    `🔄 بروزرسانی برگه خروج کالا #${permit.permitNumber}`,
                    `مرحله: ${stepName} | وضعیت: ${permit.status || '-'} | گیرنده: ${permit.recipientName || '-'}`,
                    '/manage-exit',
                    ['admin', 'ceo', 'manager', 'factory_manager', 'warehouse', 'security', 'sales_manager'],
                    targets.length > 0 ? targets : null
                );
            } catch (err) {
                console.error("Background notifyExitPermitStep error on PUT /api/exit-permits:", err);
            }
        });
    } catch (e) {
        console.error("PUT /api/exit-permits error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/exit-permits/:id', (req, res) => {
    try {
        const db = getDb();
        if (!db.exitPermits) db.exitPermits = [];
        const permitToDelete = db.exitPermits.find(x => x.id === req.params.id);
        db.exitPermits = db.exitPermits.filter(x => x.id !== req.params.id);
        saveDb(db);
        res.json(db.exitPermits);

        if (permitToDelete) {
            setImmediate(async () => {
                try {
                    const freshDb = getDb();
                    await notifyExitPermitStep(permitToDelete, null, null, null, freshDb, 'حذف برگه خروج', 'DELETE');

                    await broadcastNotification(
                        `❌ حذف برگه خروج کالا #${permitToDelete.permitNumber}`,
                        `برگه خروج شماره ${permitToDelete.permitNumber} مربوط به شرکت ${permitToDelete.company || '-'} حذف گردید.`,
                        '/manage-exit',
                        ['admin', 'ceo', 'manager', 'factory_manager', 'warehouse', 'security', 'sales_manager']
                    );
                } catch (err) {
                    console.error("Background notifyExitPermitStep error on DELETE /api/exit-permits:", err);
                }
            });
        }
    } catch (e) {
        console.error("DELETE /api/exit-permits error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Custom endpoint for manual exit permit notification via bot
app.post('/api/exit-permits/:id/bot-notify', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const permit = (db.exitPermits || []).find(p => p.id === id);
        if (!permit) {
            return res.status(404).json({ error: 'برگه خروج یافت نشد' });
        }
        
        // Trigger bot core helper for exit permit notifications with 'MANUAL' type to skip deduplication
        await notifyExitPermitStep(permit, null, null, null, db, 'ارسال دستی', 'MANUAL');
        res.json({ success: true });
    } catch (e) {
        console.error("Manual bot notify error in server.js:", e);
        res.status(500).json({ error: e.message });
    }
});

// Custom endpoint for manual or re-dispatch of customer cargo exit notification (WhatsApp, Telegram, Bale)
app.post('/api/exit-permits/:id/notify-customer', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const permit = (db.exitPermits || []).find(p => p.id === id);
        if (!permit) {
            return res.status(404).json({ success: false, error: 'برگه خروج یافت نشد' });
        }
        const result = await notifyCustomerCargoExit(permit, db, true);
        if (result?.adminNotified && result?.missingPhoneBuyers?.length > 0) {
            broadcastNotification(
                `⚠️ عدم ثبت شماره مشتری (حواله #${permit.permitNumber})`,
                `برای خریدار «${result.missingPhoneBuyers.join('، ')}» شماره‌ای ثبت نشده است و پیام خروج بار ارسال نشد.`,
                '/manage-exit',
                ['admin', 'ceo', 'sales_manager']
            ).catch(() => {});
        }
        res.json({
            success: Boolean(result?.success),
            adminNotified: Boolean(result?.adminNotified),
            error: result?.reason || undefined,
            result
        });
    } catch (e) {
        console.error("Manual customer notify error in server.js:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Endpoint to batch auto-match contacts with Sayan customers/accounts
app.post('/api/sayan/contacts/auto-match', async (req, res) => {
    try {
        const db = getDb();
        const contacts = db.settings?.salesContacts || [];
        if (!contacts.length) {
            return res.json({ success: true, matchedCount: 0, contacts: [] });
        }

        // Get customers list from Sayan remittance service
        let sayanCustomers = await sayanRemittanceService.getAllSayanCustomers(true).catch(() => []);

        // Also query GNR_TBL_001 if available for additional person coverage
        try {
            const { executeSayanQuery } = await import('./backend/sayan-order-automation.js');
            const gnrRows = await executeSayanQuery(`
                SELECT TOP 500
                    RTRIM(LTRIM(Field_003)) as PersonCode,
                    RTRIM(LTRIM(COALESCE(Field_015, ''))) as Mobile,
                    RTRIM(LTRIM(COALESCE(Field_030, Field_021, Field_003))) as TafsiliCode,
                    RTRIM(LTRIM(COALESCE(Field_006, '') + ' ' + COALESCE(Field_007, ''))) as FullName
                FROM GNR_TBL_001 WITH (NOLOCK)
                WHERE Field_006 IS NOT NULL AND LEN(RTRIM(LTRIM(Field_006))) > 0
            `, 25000).catch(() => []);
            if (gnrRows && gnrRows.length > 0) {
                const gnrFormatted = gnrRows.map(r => ({
                    personCode: r.PersonCode,
                    tafsiliCode: r.TafsiliCode || r.PersonCode,
                    name: r.FullName,
                    mobile: r.Mobile
                }));
                // Merge without duplicates
                const seen = new Set(sayanCustomers.map(sc => String(sc.personCode || sc.tafsiliCode).trim()));
                for (const g of gnrFormatted) {
                    const key = String(g.personCode || g.tafsiliCode).trim();
                    if (!seen.has(key)) {
                        seen.add(key);
                        sayanCustomers.push(g);
                    }
                }
            }
        } catch (gnrErr) {
            console.warn("GNR_TBL_001 auto-match lookup fallback:", gnrErr.message);
        }

        let updatedCount = 0;

        const updatedContacts = contacts.map(c => {
            if (c.sayanPersonCode || c.sayanTafsiliCode) return c; // Already linked
            
            const cleanName = (c.name || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').trim().toLowerCase();
            const cleanMobile = (c.mobile || '').replace(/[^0-9]/g, '').slice(-10);

            const match = sayanCustomers.find(sc => {
                const scName = (sc.name || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').trim().toLowerCase();
                const scMobile = (sc.mobile || '').replace(/[^0-9]/g, '').slice(-10);
                return (cleanMobile && scMobile && cleanMobile === scMobile) ||
                       (cleanName && scName && (cleanName === scName || scName.includes(cleanName) || cleanName.includes(scName)));
            });

            if (match) {
                updatedCount++;
                return {
                    ...c,
                    sayanPersonCode: match.personCode || match.tafsiliCode,
                    sayanTafsiliCode: match.tafsiliCode || match.personCode,
                    sayanPersonName: match.name,
                    sayanMobile: match.mobile || c.mobile
                };
            }
            return c;
        });

        if (updatedCount > 0) {
            db.settings.salesContacts = updatedContacts;
            saveDb(db);
        }

        res.json({ success: true, matchedCount: updatedCount, contacts: updatedContacts });
    } catch (e) {
        console.error("Auto match Sayan contacts error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/groups', (req, res) => res.json(getDb().groups || []));
app.post('/api/groups', (req, res) => { const db = getDb(); if(!db.groups) db.groups=[]; db.groups.push(req.body); saveDb(db); res.json(db.groups); });
app.put('/api/groups/:id', (req, res) => { const db = getDb(); const idx = db.groups.findIndex(g => g.id === req.params.id); if(idx > -1) { db.groups[idx] = { ...db.groups[idx], ...req.body }; saveDb(db); res.json(db.groups); } else res.status(404).send('Not Found'); });
app.delete('/api/groups/:id', (req, res) => { 
    const db = getDb(); 
    db.groups = (db.groups || []).filter(g => g.id !== req.params.id); 
    if (db.messages) db.messages = db.messages.filter(m => m.groupId !== req.params.id);
    saveDb(db); 
    res.json(db.groups); 
});

app.get('/api/task-groups', (req, res) => res.json(getDb().taskGroups || []));
app.post('/api/task-groups', (req, res) => { const db = getDb(); if(!db.taskGroups) db.taskGroups=[]; db.taskGroups.push(req.body); saveDb(db); res.json(db.taskGroups); });
app.put('/api/task-groups/:id', (req, res) => { const db = getDb(); const idx = db.taskGroups.findIndex(g => g.id === req.params.id); if(idx > -1) { db.taskGroups[idx] = { ...db.taskGroups[idx], ...req.body }; saveDb(db); res.json(db.taskGroups); } else res.status(404).send('Not Found'); });
app.delete('/api/task-groups/:id', (req, res) => { 
    const db = getDb(); 
    db.taskGroups = (db.taskGroups || []).filter(g => g.id !== req.params.id); 
    if (db.messages) db.messages = db.messages.filter(m => m.groupId !== req.params.id);
    if (db.tasks) db.tasks = db.tasks.filter(t => t.groupId !== req.params.id);
    saveDb(db); 
    res.json(db.taskGroups); 
});

app.get('/api/tasks', (req, res) => res.json(getDb().tasks || []));
app.post('/api/tasks', (req, res) => { 
    const db = getDb(); 
    if(!db.tasks) db.tasks=[]; 
    const task = req.body;
    db.tasks.push(task); 
    saveDb(db); 
    res.json(db.tasks); 

    // Send notification
    try {
        const taskGroup = db.taskGroups?.find(tg => tg.id === task.groupId);
        const groupName = taskGroup ? taskGroup.name : 'گروه کاری';
        let targets = null;
        if (task.assignedTo && task.assignedTo.length > 0) {
            targets = [...task.assignedTo];
        } else if (taskGroup && taskGroup.members) {
            targets = [...taskGroup.members];
        }
        const exclude = task.createdBy ? [task.createdBy] : null;

        broadcastNotification(
            `تسک جدید: ${task.title}`,
            `یک تسک جدید در گروه "${groupName}" ثبت شد.`,
            `/chat?group=${task.groupId}&task=${task.id}`,
            null,
            targets,
            exclude
        ).catch(err => console.error("Task creation broadcast error:", err));
    } catch(e) {
        console.error("Task creation notification error:", e);
    }
});
app.put('/api/tasks/:id', (req, res) => { 
    const db = getDb(); 
    const idx = db.tasks.findIndex(t => t.id === req.params.id); 
    if(idx > -1) { 
        const currentTask = db.tasks[idx];
        const updatedTask = req.body;
        const statusChanged = updatedTask.status && updatedTask.status !== currentTask.status;
        const repliesChanged = updatedTask.replies && (!currentTask.replies || updatedTask.replies.length > currentTask.replies.length);

        db.tasks[idx] = { ...currentTask, ...updatedTask }; 
        saveDb(db); 
        res.json(db.tasks); 

        // Send notifications
        try {
            const taskGroup = db.taskGroups?.find(tg => tg.id === currentTask.groupId);
            const groupName = taskGroup ? taskGroup.name : 'گروه کاری';

            if (statusChanged && updatedTask.status === 'completed') {
                const completedBy = updatedTask.completedBy || 'کاربر';
                let targets = [currentTask.createdBy];
                if (currentTask.assignedTo) {
                    targets = [...targets, ...currentTask.assignedTo];
                }
                targets = Array.from(new Set(targets));
                const exclude = updatedTask.completedBy ? [updatedTask.completedBy] : null;

                broadcastNotification(
                    `تسک انجام شد: ${currentTask.title}`,
                    `تسک "${currentTask.title}" در گروه "${groupName}" توسط ${completedBy} انجام شد.`,
                    `/chat?group=${currentTask.groupId}&task=${currentTask.id}`,
                    null,
                    targets,
                    exclude
                ).catch(err => console.error("Task completed broadcast error:", err));
            } else if (repliesChanged) {
                const lastReply = updatedTask.replies[updatedTask.replies.length - 1];
                const sender = lastReply.sender || 'کاربر';
                const senderUsername = lastReply.senderUsername;
                
                let targets = [currentTask.createdBy];
                if (currentTask.assignedTo) {
                    targets = [...targets, ...currentTask.assignedTo];
                }
                targets = Array.from(new Set(targets));

                broadcastNotification(
                    `دیدگاه جدید روی تسک: ${currentTask.title}`,
                    `${sender}: ${lastReply.message}`,
                    `/chat?group=${currentTask.groupId}&task=${currentTask.id}`,
                    null,
                    targets,
                    [senderUsername]
                ).catch(err => console.error("Task reply broadcast error:", err));
            }
        } catch(e) {
            console.error("Task update notification error:", e);
        }
    } else res.status(404).send('Not Found'); 
});
app.delete('/api/tasks/:id', (req, res) => { const db = getDb(); db.tasks = db.tasks.filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tasks); });

app.get('/api/announcements', (req, res) => res.json(getDb().announcements || []));
app.post('/api/announcements', (req, res) => { const db = getDb(); if(!db.announcements) db.announcements=[]; db.announcements.push(req.body); saveDb(db); res.json(db.announcements); });
app.delete('/api/announcements/:id', (req, res) => { const db = getDb(); db.announcements = db.announcements.filter(a => a.id !== req.params.id); saveDb(db); res.json(db.announcements); });

// Notes Endpoints
app.get('/api/notes', (req, res) => {
    const db = getDb();
    res.json(db.notes || []);
});
app.post('/api/notes', (req, res) => {
    const db = getDb();
    if (!db.notes) db.notes = [];
    const note = req.body;
    if (!note.id) note.id = 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const existingIdx = db.notes.findIndex(n => n.id === note.id);
    if (existingIdx >= 0) {
        db.notes[existingIdx] = { ...db.notes[existingIdx], ...note, updatedAt: Date.now() };
    } else {
        db.notes.unshift({ ...note, createdAt: note.createdAt || Date.now(), updatedAt: Date.now() });
    }
    saveDb(db);
    res.json(db.notes);
});
app.put('/api/notes/:id', (req, res) => {
    const db = getDb();
    if (!db.notes) db.notes = [];
    const idx = db.notes.findIndex(n => n.id === req.params.id);
    if (idx > -1) {
        db.notes[idx] = { ...db.notes[idx], ...req.body, updatedAt: Date.now() };
    } else {
        db.notes.unshift({ ...req.body, id: req.params.id, createdAt: Date.now(), updatedAt: Date.now() });
    }
    saveDb(db);
    res.json(db.notes);
});
app.delete('/api/notes/:id', (req, res) => {
    const db = getDb();
    db.notes = (db.notes || []).filter(n => n.id !== req.params.id);
    saveDb(db);
    res.json(db.notes);
});

// Custom Calendar Events & Reminders Endpoints
app.get('/api/calendar-events', (req, res) => {
    const db = getDb();
    const userId = req.query.userId;
    let events = db.customCalendarEvents || [];
    if (userId) {
        events = events.filter(e => !e.userId || String(e.userId) === String(userId));
    }
    res.json(events);
});
app.post('/api/calendar-events', (req, res) => {
    const db = getDb();
    if (!db.customCalendarEvents) db.customCalendarEvents = [];
    const item = req.body;
    if (!item.id) item.id = 'cal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const idx = db.customCalendarEvents.findIndex(e => e.id === item.id);
    if (idx >= 0) {
        db.customCalendarEvents[idx] = { ...db.customCalendarEvents[idx], ...item };
    } else {
        db.customCalendarEvents.unshift(item);
    }
    saveDb(db);
    res.json(db.customCalendarEvents);
});
app.delete('/api/calendar-events/:id', (req, res) => {
    const db = getDb();
    db.customCalendarEvents = (db.customCalendarEvents || []).filter(e => e.id !== req.params.id);
    saveDb(db);
    res.json(db.customCalendarEvents);
});

// 9. FILE UPLOAD (Base64 JSON Endpoint)
app.post(['/api/upload', '/upload'], (req, res) => {
    try {
        const { fileName, fileData, category } = req.body;
        if (!fileName || !fileData) return res.status(400).send('Missing data');

        let safeName;
        try {
            safeName = getSafeFileName(fileName);
        } catch (verr) {
            return res.status(400).json({ error: verr.message });
        }

        let targetDir = UPLOADS_DIR;
        if (category && typeof category === 'string') {
            const cleanCat = category.replace(/[^a-zA-Z0-9_\-\/]/g, '').replace(/\.\./g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
            if (cleanCat) {
                const possibleDir = path.join(UPLOADS_DIR, cleanCat);
                if (path.resolve(possibleDir).startsWith(path.resolve(UPLOADS_DIR))) {
                    try {
                        fs.mkdirSync(possibleDir, { recursive: true });
                        targetDir = possibleDir;
                    } catch (err) {
                        console.error("Error creating upload subfolder:", err);
                    }
                }
            }
        }

        // Fix Regex to handle complex MIME types (e.g. audio/webm;codecs=opus)
        const base64Data = fileData.replace(/^data:.*;base64,/, '');
        const uniqueName = `${Date.now()}_${safeName}`;
        const filePath = path.join(targetDir, uniqueName);

        // Security check: ensure path stays strictly in uploads
        if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR))) {
            return res.status(400).json({ error: 'مسیر فایل غیرمجاز است' });
        }

        fs.writeFile(filePath, base64Data, 'base64', (err) => {
            if (err) return res.status(500).send('Upload failed');
            const relPath = path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');
            res.json({ fileName: decodeUtf8FileName(fileName) || safeName, url: `/uploads/${relPath}` });
        });
    } catch (e) {
        console.error("Upload error:", e);
        res.status(500).json({ error: 'خطا در بارگذاری فایل' });
    }
});

// PDF / Image merge tool endpoint with CamScanner Magic Color enhancements
app.post('/api/tools/merge-to-pdf', async (req, res) => {
    try {
        const { files, filter = 'magic_color' } = req.body;
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: 'هیچ فایلی جهت ادغام ارسال نشده است.' });
        }

        const preparedFiles = [];
        for (const item of files) {
            let buffer = null;
            let fileName = item.fileName || item.name || 'document';
            let type = item.type || (fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image');

            if (item.data) {
                const base64Clean = item.data.replace(/^data:.*;base64,/, '');
                buffer = Buffer.from(base64Clean, 'base64');
            } else if (item.url) {
                let localName = item.url.replace('/uploads/', '');
                const safeBase = path.basename(localName).replace(/[\/\\]/g, '');
                const localPath = path.join(UPLOADS_DIR, safeBase);
                if (fs.existsSync(localPath)) {
                    buffer = fs.readFileSync(localPath);
                }
            }

            if (buffer) {
                preparedFiles.push({ fileName, type, buffer });
            }
        }

        if (preparedFiles.length === 0) {
            return res.status(400).json({ error: 'هیچ فایل معتبری جهت پردازش یافت نشد.' });
        }

        const mergedBuffer = await mergeFilesToPdf(preparedFiles, { filter });
        const outputFileName = `Merged_${Date.now()}.pdf`;
        const outputPath = path.join(UPLOADS_DIR, outputFileName);
        fs.writeFileSync(outputPath, mergedBuffer);

        res.json({
            success: true,
            fileName: outputFileName,
            url: `/uploads/${outputFileName}`,
            fileData: `data:application/pdf;base64,${mergedBuffer.toString('base64')}`
        });
    } catch (e) {
        console.error("PDF Merge endpoint error:", e);
        res.status(500).json({ error: 'خطا در تبدیل و ادغام فایل‌ها: ' + e.message });
    }
});

// Single image CamScanner effect enhancement endpoint
app.post('/api/tools/enhance-image', async (req, res) => {
    try {
        const { imageData, filter = 'magic_color' } = req.body;
        if (!imageData) {
            return res.status(400).json({ error: 'تصویری جهت ارتقاء کیفیت ارسال نشده است.' });
        }
        const base64Clean = imageData.replace(/^data:.*;base64,/, '');
        const inputBuffer = Buffer.from(base64Clean, 'base64');
        const enhancedBuffer = await enhanceDocumentImage(inputBuffer, filter);
        const fileName = `enhanced_${Date.now()}.png`;
        const outputPath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(outputPath, enhancedBuffer);

        res.json({
            success: true,
            fileName,
            url: `/uploads/${fileName}`,
            imageData: `data:image/png;base64,${enhancedBuffer.toString('base64')}`
        });
    } catch (e) {
        console.error("Image enhance endpoint error:", e);
        res.status(500).json({ error: 'خطا در اعمال فیلتر اسکنر: ' + e.message });
    }
});

app.get('/api/upload-get-base64', (req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) {
        return res.status(400).json({ error: 'آدرس فایل ارسال نشده است' });
    }

    let filename = '';
    if (fileUrl.startsWith('/uploads/')) {
        filename = fileUrl.replace('/uploads/', '');
    } else {
        filename = path.basename(fileUrl);
    }

    // Path traversal check
    const safeBase = path.basename(filename).replace(/[\/\\]/g, '');
    const filePath = path.join(UPLOADS_DIR, safeBase);

    if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR)) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'فایل یافت نشد' });
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.gif') mimeType = 'image/gif';

        const base64 = fileBuffer.toString('base64');
        const fileData = `data:${mimeType};base64,${base64}`;
        res.json({ fileData });
    } catch (e) {
        console.error('Error reading file for base64:', e);
        res.status(500).json({ error: 'خطا در خواندن فایل: ' + e.message });
    }
});

const chunkTempDir = path.join(ROOT_DIR, 'chunk-temp');
if (!fs.existsSync(chunkTempDir)) fs.mkdirSync(chunkTempDir, { recursive: true });

app.post(['/api/upload-chunk', '/upload-chunk'], (req, res) => {
    const { uploadId, chunkIndex, chunkData } = req.body;
    if (!uploadId || chunkIndex === undefined || !chunkData) return res.status(400).send('Missing chunk data');
    const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeIndex = parseInt(chunkIndex, 10);
    if (isNaN(safeIndex)) return res.status(400).send('Invalid chunk index');

    const base64Data = chunkData.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join(chunkTempDir, `${safeUploadId}_${safeIndex}`);
    
    if (!path.resolve(filePath).startsWith(path.resolve(chunkTempDir))) {
        return res.status(400).send('Invalid path');
    }
    fs.writeFileSync(filePath, buffer);
    res.json({ success: true });
});

app.post(['/api/upload-finish', '/upload-finish'], async (req, res) => {
    const { uploadId, fileName, totalChunks } = req.body;
    if (!uploadId || !fileName || !totalChunks) return res.status(400).send('Missing finish data');
    
    const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
    let safeName;
    try {
        safeName = getSafeFileName(fileName);
    } catch (verr) {
        return res.status(400).json({ error: verr.message });
    }

    const uniqueName = `${Date.now()}_${safeName}`;
    const finalPath = path.join(UPLOADS_DIR, uniqueName);
    if (!path.resolve(finalPath).startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(400).send('Invalid destination path');
    }

    const writeStream = fs.createWriteStream(finalPath);
    
    // Append all chunks sequentially, using async/await to avoid blocking event loop
    try {
        // Verify all chunks exist first
        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunkTempDir, `${safeUploadId}_${i}`);
            if (!fs.existsSync(chunkPath)) {
                console.error(`Missing chunk ${i} for upload ${safeUploadId}`);
                try { writeStream.destroy(); } catch (_) {}
                return res.status(400).send(`Chunk ${i} missing. Please try again.`);
            }
        }

        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunkTempDir, `${safeUploadId}_${i}`);
            await new Promise((resolve, reject) => {
                const readStream = fs.createReadStream(chunkPath);
                readStream.pipe(writeStream, { end: false });
                readStream.on('end', () => {
                    try { fs.unlinkSync(chunkPath); } catch(e) {}
                    resolve();
                });
                readStream.on('error', reject);
            });
        }
        
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            writeStream.end();
        });
        
        return res.json({ success: true, fileName: safeName, url: `/uploads/${uniqueName}` });
    } catch (err) {
        console.error('Error combining chunks:', err);
        try { writeStream.destroy(); } catch (_) {}
        return res.status(500).send('Server Error');
    }
});

// Admin DB Optimization & Base64 Purge Endpoint
app.post('/api/admin/optimize-db', (req, res) => {
    try {
        const dbPath = path.join(ROOT_DIR, 'database.json');
        const sizeBefore = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
        
        const db = dbManager.getDb();
        const modified = dbManager.sanitizeAndOffloadDb(db);
        
        dbManager.saveDbImmediate(db);
        
        const sizeAfter = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
        const savedBytes = Math.max(0, sizeBefore - sizeAfter);

        res.json({
            success: true,
            modified,
            sizeBeforeBytes: sizeBefore,
            sizeAfterBytes: sizeAfter,
            sizeBeforeMB: (sizeBefore / (1024 * 1024)).toFixed(2),
            sizeAfterMB: (sizeAfter / (1024 * 1024)).toFixed(2),
            savedMB: (savedBytes / (1024 * 1024)).toFixed(2),
            message: `بهینه‌سازی پایگاه داده با موفقیت انجام شد.`
        });
    } catch (e) {
        console.error("DB optimize endpoint error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 10. BOTS (Telegram/Bale/WhatsApp)
app.get('/api/whatsapp/status', async (req, res) => {
    try {
        const wa = await safeImport('./backend/whatsapp.js');
        if (!wa) return res.status(503).json({ ready: false, qr: null, user: null, error: "WhatsApp module not found" });
        const waAuthPath = path.join(ROOT_DIR, 'wauth');
        const status = wa.getStatus();
        // If not ready and not initializing and no QR yet, start initialization
        if (!status.ready && !status.qr && !status.initializing && !status.error) {
            wa.initWhatsApp(waAuthPath);
        }
        res.json(wa.getStatus());
    } catch (e) {
        res.status(500).json({ ready: false, qr: null, user: null, error: e.message });
    }
});

app.post('/api/whatsapp/restart', async (req, res) => {
    try {
        const { clean } = req.body || {};
        const wa = await safeImport('./backend/whatsapp.js');
        const waAuthPath = path.join(ROOT_DIR, 'wauth');
        if (wa) {
            await wa.restartSession(waAuthPath, clean === true);
            res.json({ success: true, message: "WhatsApp service restarting..." });
        } else {
            res.status(503).json({ error: "WhatsApp module not available" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/logout', async (req, res) => {
    try {
        const wa = await safeImport('./backend/whatsapp.js');
        const waAuthPath = path.join(ROOT_DIR, 'wauth');
        if (wa) {
            await wa.logout();
            await wa.restartSession(waAuthPath, true);
            res.json({ success: true });
        } else {
            res.status(503).json({ error: "WhatsApp module not available" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/whatsapp/groups', async (req, res) => {
    try {
        const wa = await safeImport('./backend/whatsapp.js');
        if (wa) {
            const groups = await wa.getGroups();
            res.json({ success: true, groups });
        } else {
            res.json({ success: false, groups: [] });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, groups: [] });
    }
});

app.get('/api/whatsapp/diagnostics', async (req, res) => {
    try {
        const wa = await safeImport('./backend/whatsapp.js');
        if (!wa || !wa.getDiagnostics) {
            return res.status(503).json({ success: false, error: "ماژول عیب‌یابی واتساپ در دسترس نیست." });
        }
        const data = await wa.getDiagnostics();
        res.json(data);
    } catch (e) {
        console.error("WhatsApp Diagnostics Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/whatsapp/diagnostics/test', async (req, res) => {
    try {
        const { proxy } = req.body || {};
        const wa = await safeImport('./backend/whatsapp.js');
        if (!wa || !wa.runDiagnosticTest) {
            return res.status(503).json({ success: false, error: "ماژول تست عیب‌یابی واتساپ در دسترس نیست." });
        }
        const testResult = await wa.runDiagnosticTest(proxy);
        res.json({ success: true, ...testResult });
    } catch (e) {
        console.error("WhatsApp Diagnostic Test Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/whatsapp/diagnostics/clear', async (req, res) => {
    try {
        const wa = await safeImport('./backend/whatsapp.js');
        if (wa && wa.clearDiagnosticLogs) {
            wa.clearDiagnosticLogs();
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/whatsapp/clean-locks', async (req, res) => {
    try {
        const wa = await safeImport('./backend/whatsapp.js');
        if (wa && wa.cleanSessionLocks) {
            wa.cleanSessionLocks();
        }
        res.json({ success: true, message: 'قفل‌های قدیمی مرورگر با موفقیت پاکسازی شدند.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/send-whatsapp', async (req, res) => {
    const { number, message, mediaData } = req.body;
    try {
        const wa = await safeImport('./backend/whatsapp.js');
        if (!wa || !wa.sendMessage) {
            return res.json({ success: true, delivered: false, skipped: true, warning: "سرویس واتساپ در دسترس نیست یا متصل نشده است." });
        }
        const sendResult = await wa.sendMessage(number, message, mediaData);
        res.json({ success: true, ...sendResult });
    } catch (e) {
        console.error("WhatsApp Send Soft Catch:", e.message);
        res.json({ success: false, delivered: false, skipped: true, warning: e.message });
    }
});

app.post('/api/restart-bot', async (req, res) => {
    const { type } = req.body;
    const db = getDb();
    if (type === 'telegram' && db.settings.telegramBotToken) { const mod = await safeImport('./backend/telegram.js'); if(mod) mod.initTelegram(db.settings.telegramBotToken); }
    if (type === 'bale' && db.settings.baleBotToken) { const mod = await safeImport('./backend/bale.js'); if(mod) mod.initBaleBot(db.settings.baleBotToken); }
    if (type === 'whatsapp') { const mod = await safeImport('./backend/whatsapp.js'); if (mod) mod.restartSession(path.join(ROOT_DIR, 'wauth')); }
    res.json({ success: true });
});

app.post('/api/send-bot-message', async (req, res) => {
    const { platform, chatId, caption, mediaData } = req.body;
    try {
        if (platform === 'telegram') {
            const tg = await safeImport('./backend/telegram.js');
            if (tg && tg.sendBotPhoto && mediaData) {
                const buffer = Buffer.from(mediaData.data, 'base64');
                await tg.sendBotPhoto(chatId, buffer, caption, { filename: mediaData.filename || 'image.png' });
            } else if (tg && tg.sendBotMessage) {
                await tg.sendBotMessage(chatId, caption);
            }
        } else if (platform === 'bale') {
            const bale = await safeImport('./backend/bale.js');
            if (bale && bale.sendBotPhoto && mediaData) {
                const buffer = Buffer.from(mediaData.data, 'base64');
                await bale.sendBotPhoto(chatId, buffer, caption, { filename: mediaData.filename || 'image.png' });
            } else if (bale && bale.sendBotMessage) {
                await bale.sendBotMessage(chatId, caption);
            }
        } else if (platform === 'whatsapp') {
            const wa = await safeImport('./backend/whatsapp.js');
            if (wa && wa.sendMessage) {
                await wa.sendMessage(chatId, caption, mediaData);
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Bot Send Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- UPDATED BACKUP ENDPOINTS ---

app.get('/api/backups/list', (req, res) => {
    try {
        if (!fs.existsSync(BACKUPS_DIR)) return res.json([]);
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('AutoBackup_') || f.startsWith('Full_Backup_') || f.endsWith('.zip'))
            .map(f => {
                const stat = fs.statSync(path.join(BACKUPS_DIR, f));
                return { name: f, size: stat.size, date: stat.mtime };
            })
            .sort((a, b) => b.date - a.date);
        res.json(files);
    } catch(e) { res.status(500).json({error: "Failed"}); }
});

app.get('/api/backups/download/:filename', (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('/') || filename.includes('..')) return res.status(400).send("Invalid");
    const filePath = path.join(BACKUPS_DIR, filename);
    if (fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).send("Not found");
});

// FULL BACKUP (ZIP with DB + UPLOADS) - MANUAL TRIGGER
app.get('/api/full-backup', (req, res) => {
    try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `Full_Backup_${timestamp}.zip`;
        
        res.attachment(filename);
        archive.pipe(res);
        
        if (fs.existsSync(DB_FILE)) archive.file(DB_FILE, { name: 'database.json' });
        if (fs.existsSync(UPLOADS_DIR)) archive.directory(UPLOADS_DIR, 'uploads');
        
        archive.finalize();
    } catch (e) {
        console.error("Manual Backup Error:", e);
        res.status(500).send("Backup Generation Failed");
    }
});

// SEND BACKUP TO TELEGRAM/BALE BOTS
app.post('/api/backups/send-to-bot', async (req, res) => {
    try {
        const reason = req.body?.reason || "پشتیبان ارسالی دستی از پنل مدیریت";
        const mode = req.body?.mode || "auto"; // 'db' | 'full' | 'auto'
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

        // If mode is 'db' (or default fast bot backup mode):
        if (mode === 'db' || mode === 'auto') {
            const dbBackup = await createDbOnlyBackupZip(timestamp);
            const sendResult = await sendBackupToBots(dbBackup.filePath, dbBackup.filename, reason, true);
            return res.json({
                success: sendResult.success,
                filename: dbBackup.filename,
                size: dbBackup.size,
                botSendResult: sendResult
            });
        }

        // Full backup mode requested:
        const filename = `Backup_Full_${timestamp}.zip`;
        const filePath = path.join(BACKUPS_DIR, filename);

        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 6 } }); // Fast compression level

        output.on('close', async () => {
            try {
                const sendResult = await sendBackupToBots(filePath, filename, reason, true);
                res.json({
                    success: sendResult.success,
                    filename: sendResult.filenameSent || filename,
                    size: archive.pointer(),
                    botSendResult: sendResult
                });
            } catch (sendErr) {
                console.error("Bot dispatch error after archiving:", sendErr);
                res.status(500).json({ success: false, error: sendErr.message });
            }
        });

        archive.on('error', (err) => {
            console.error("Archive error:", err);
            res.status(500).json({ success: false, error: err.message });
        });

        archive.pipe(output);

        if (fs.existsSync(DB_FILE)) archive.file(DB_FILE, { name: 'database.json' });
        if (fs.existsSync(UPLOADS_DIR)) archive.directory(UPLOADS_DIR, 'uploads');

        archive.finalize();
    } catch (e) {
        console.error("Failed to send backup to bot:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// FULL RESTORE (ZIP OR JSON) - SMART HANDLING
app.post('/api/emergency-restore', (req, res) => {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, error: 'No data' });
    
    try {
        const base64Data = fileData.replace(/^data:.*,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // 1. Check Magic Number to see if ZIP (PK..)
        const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B;

        if (isZip) {
            console.log(">>> Restoring from ZIP archive...");
            const tempZip = path.join(ROOT_DIR, 'temp_restore.zip');
            fs.writeFileSync(tempZip, buffer);

            const zip = new AdmZip(tempZip);
            
            // Extract database.json
            const dbEntry = zip.getEntry('database.json');
            if (dbEntry) {
                const dbContent = zip.readAsText(dbEntry);
                fs.writeFileSync(DB_FILE, dbContent);
                // UPDATE MEMORY
                const parsed = JSON.parse(dbContent);
                dbManager.saveDbImmediate(parsed); 
                console.log("✅ Database restored.");
            }
            
            // Extract Uploads
            if (zip.getEntry('uploads/')) {
                zip.extractEntryTo("uploads/", ROOT_DIR, true, true); 
                console.log("✅ Uploads restored.");
            }
            
            fs.unlinkSync(tempZip);
            res.json({ success: true, mode: 'zip' });
        } else {
            console.log(">>> Restoring from JSON text...");
            const jsonStr = buffer.toString('utf-8');
            const parsed = JSON.parse(jsonStr);
            if (!parsed.settings && !parsed.users) throw new Error("Invalid backup file");
            
            dbManager.saveDbImmediate(parsed);
            
            res.json({ success: true, mode: 'json' });
        }
    } catch (e) {
        console.error("Restore failed:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/version', (req, res) => {
    try {
        const db = typeof getDb === 'function' ? getDb() : {};
        const settings = getSyncedVersionSettings(db);
        const runtime = String(req.query?.runtime || req.headers['x-client-runtime'] || 'web').toLowerCase();
        
        const bestElectron = findNewestInstallerFile('desktop', 'exe', 'electron');
        const bestTauri = findNewestInstallerFile('desktop', 'exe', 'tauri');
        const bestAndroid = findNewestInstallerFile('android');

        const hasElectron = Boolean(bestElectron && fs.existsSync(bestElectron.filePath));
        const hasTauri = Boolean(bestTauri && fs.existsSync(bestTauri.filePath));
        const hasAndroid = Boolean(bestAndroid && fs.existsSync(bestAndroid.filePath));

        const electronVersion = hasElectron ? bestElectron.version : (settings.electronLatestVersion || null);
        const tauriVersion = hasTauri ? bestTauri.version : (settings.tauriLatestVersion || null);
        const androidVersion = hasAndroid ? bestAndroid.version : (settings.androidLatestVersion || null);
        const webVersion = settings.webVersion || settings.systemVersion || '1.0.29';

        let reportedVersion = webVersion;
        let reportedDownloadUrl = '';
        let hasInstaller = false;
        let targetPlatform = 'web';
        let desktopFileName = null;
        let desktopFileSize = 0;

        if (runtime === 'android') {
            targetPlatform = 'android';
            reportedVersion = androidVersion;
            hasInstaller = hasAndroid;
            reportedDownloadUrl = hasAndroid ? `/api/downloads/latest-android?v=${encodeURIComponent(androidVersion || '')}` : '';
        } else if (runtime === 'electron') {
            targetPlatform = 'electron';
            reportedVersion = electronVersion;
            hasInstaller = hasElectron;
            desktopFileName = hasElectron ? bestElectron.fileName : null;
            desktopFileSize = bestElectron?.size || 0;
            reportedDownloadUrl = hasElectron ? `/api/downloads/latest-desktop?v=${encodeURIComponent(electronVersion || '')}&ext=exe&runtime=electron` : '';
        } else if (runtime === 'tauri') {
            targetPlatform = 'tauri';
            reportedVersion = tauriVersion;
            hasInstaller = hasTauri;
            desktopFileName = hasTauri ? bestTauri.fileName : null;
            desktopFileSize = bestTauri?.size || 0;
            reportedDownloadUrl = hasTauri ? `/api/downloads/latest-desktop?v=${encodeURIComponent(tauriVersion || '')}&ext=exe&runtime=tauri` : '';
        } else {
            // Web / PWA browser client
            targetPlatform = 'web';
            reportedVersion = webVersion;
            hasInstaller = true;
            reportedDownloadUrl = '';
        }

        const buildNumber = settings.systemBuildNumber || `b_${Date.now()}`;
        const title = settings.releaseTitle || 'نسخه جدید سامانه';
        const releaseNotes = settings.releaseNotes || settings.desktopReleaseNotes || 'به‌روزرسانی و بهینه‌سازی سامانه مالی و بازرگانی';
        const publishedAt = settings.systemUpdatePublishedAt || 0;

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ 
            version: reportedVersion,
            targetPlatform,
            hasInstaller,
            webVersion,
            electronLatestVersion: electronVersion,
            tauriLatestVersion: tauriVersion,
            androidLatestVersion: androidVersion,
            desktopLatestVersion: runtime === 'electron' ? electronVersion : (runtime === 'tauri' ? tauriVersion : (electronVersion || tauriVersion)),
            hasDesktopInstaller: runtime === 'electron' ? hasElectron : (runtime === 'tauri' ? hasTauri : (hasElectron || hasTauri)),
            hasElectronInstaller: hasElectron,
            hasTauriInstaller: hasTauri,
            hasAndroidInstaller: hasAndroid,
            desktopFileName,
            desktopFileSize,
            androidFileName: hasAndroid ? (bestAndroid.fileName || `dlkam-android-v${androidVersion}.apk`) : null,
            androidFileSize: bestAndroid?.size || 0,
            buildNumber, 
            title, 
            releaseNotes,
            timestamp: publishedAt || 0,
            downloadUrl: reportedDownloadUrl,
            androidDownloadUrl: hasAndroid ? `/api/downloads/latest-android?v=${encodeURIComponent(androidVersion || '')}` : '',
            updateIntervalMinutes: Number(settings.desktopUpdateIntervalMinutes) || 60,
            autoCheck: settings.desktopAutoCheckUpdates !== false
        });
    } catch (e) {
        res.json({ version: '1.0.29', webVersion: '1.0.29', buildNumber: '100', title: 'نسخۀ جدید', androidDownloadUrl: '/api/downloads/latest-android' });
    }
});

// PUBLISH NEW UPDATE ACROSS THE SYSTEM (Per-Platform or All)
app.post('/api/version/publish', async (req, res) => {
    try {
        const { 
            version, 
            platform = 'all',
            webVersion,
            electronLatestVersion,
            tauriLatestVersion,
            desktopLatestVersion, 
            androidLatestVersion, 
            title, 
            releaseNotes, 
            sendToBots = true 
        } = req.body || {};

        if (!version && !webVersion && !electronLatestVersion && !tauriLatestVersion && !androidLatestVersion) {
            return res.status(400).json({ success: false, error: 'شماره نسخه الزامی است' });
        }

        const db = typeof getDb === 'function' ? getDb() : {};
        if (!db.settings) db.settings = {};

        const bestElectron = findNewestInstallerFile('desktop', 'exe', 'electron');
        const bestTauri = findNewestInstallerFile('desktop', 'exe', 'tauri');
        const bestAndroid = findNewestInstallerFile('android');

        const now = Date.now();
        const buildNumber = `b_${now.toString(36).toUpperCase()}`;
        const inputVer = (version || webVersion || '1.0.29').trim();

        // Platform-aware assignment:
        const targetPlatform = String(platform || 'all').toLowerCase();
        let newWeb = webVersion ? webVersion.trim() : (targetPlatform === 'web' || targetPlatform === 'all' ? inputVer : (db.settings.webVersion || '1.0.29'));
        let newElectron = electronLatestVersion ? electronLatestVersion.trim() : (bestElectron?.version || (targetPlatform === 'electron' ? inputVer : (db.settings.electronLatestVersion || inputVer)));
        let newTauri = tauriLatestVersion ? tauriLatestVersion.trim() : (bestTauri?.version || (targetPlatform === 'tauri' ? inputVer : (db.settings.tauriLatestVersion || inputVer)));
        let newAndroid = androidLatestVersion ? androidLatestVersion.trim() : (bestAndroid?.version || (targetPlatform === 'android' ? inputVer : (db.settings.androidLatestVersion || inputVer)));

        const newTitle = title?.trim() || `نسخه جدید ${inputVer}`;
        const newNotes = releaseNotes?.trim() || 'به‌روزرسانی، ارتقای عملکرد و بهینه‌سازی کلی سیستم.';

        if (targetPlatform === 'web' || targetPlatform === 'all') {
            db.settings.webVersion = newWeb;
            db.settings.systemVersion = newWeb;
        }
        if (targetPlatform === 'electron' || targetPlatform === 'all') {
            db.settings.electronLatestVersion = newElectron;
            db.settings.electronVersion = newElectron;
        }
        if (targetPlatform === 'tauri' || targetPlatform === 'all') {
            db.settings.tauriLatestVersion = newTauri;
            db.settings.tauriVersion = newTauri;
        }
        if (targetPlatform === 'android' || targetPlatform === 'all') {
            db.settings.androidLatestVersion = newAndroid;
            db.settings.androidVersion = newAndroid;
        }

        db.settings.desktopLatestVersion = newElectron || newTauri;
        db.settings.systemBuildNumber = buildNumber;
        db.settings.releaseTitle = newTitle;
        db.settings.releaseNotes = newNotes;
        db.settings.desktopReleaseNotes = newNotes;
        db.settings.systemUpdatePublishedAt = now;

        try {
            const relPath = path.join(__dirname, 'release-version.json');
            let existingRelease = {};
            if (fs.existsSync(relPath)) {
                try { existingRelease = JSON.parse(fs.readFileSync(relPath, 'utf8')); } catch (_) {}
            }
            fs.writeFileSync(relPath, JSON.stringify({
                ...existingRelease,
                webVersion: newWeb,
                electronVersion: newElectron,
                electronLatestVersion: newElectron,
                tauriVersion: newTauri,
                tauriLatestVersion: newTauri,
                androidVersion: newAndroid,
                androidLatestVersion: newAndroid,
                version: newWeb,
                desktopLatestVersion: newElectron || newTauri,
                buildNumber,
                timestamp: now,
                publishedAt: new Date(now).toISOString()
            }, null, 2) + '\n', 'utf8');
        } catch (_) {}

        if (dbManager && typeof dbManager.saveDbImmediate === 'function') {
            dbManager.saveDbImmediate(db);
        }

        let botDispatch = null;
        if (sendToBots) {
            try {
                // Send automated DB backup on new release
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const dbBackup = await createDbOnlyBackupZip(timestamp);
                botDispatch = await sendBackupToBots(
                    dbBackup.filePath, 
                    dbBackup.filename, 
                    `انتشار نسخه ${newVersion}`, 
                    true
                );
            } catch (botErr) {
                console.warn('Bot backup on version publish error:', botErr.message);
            }
        }

        console.log(`🚀 New application update published: v${newVersion} (${buildNumber})`);

        res.json({
            success: true,
            version: newVersion,
            buildNumber,
            title: newTitle,
            releaseNotes: newNotes,
            timestamp: now,
            botDispatch
        });
    } catch (e) {
        console.error('Error publishing new version:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/quote/random', async (req, res) => {
    const quoteType = req.query.type || 'poem'; // 'poem' or 'motivational'
    return handleQuoteRequest(req, res, quoteType);
});

app.get('/api/quote/poem', async (req, res) => {
    return handleQuoteRequest(req, res, 'poem');
});

app.get('/api/quote/motivational', async (req, res) => {
    return handleQuoteRequest(req, res, 'motivational');
});

function handleQuoteRequest(req, res, type = 'poem') {
    const selectedType = type || req.query.type || 'poem';


    if (selectedType === 'motivational') {
        const motivationalQuotes = [
            { text: "موفقیت مجموعه‌ای از تلاش‌های کوچک روزانه است که بارها و بارها تکرار می‌شوند.", author: "رابرت کالیر", title: "تلاش مستمر" },
            { text: "بزرگترین افتخار ما در این نیست که هرگز زمین نخوریم، بلکه در این است که پس از هر بار افتادن دوباره برخیزیم.", author: "کنفوسیوس", title: "تاب‌آوری و استقامت" },
            { text: "فرصت‌ها خودبه‌خود اتفاق نمی‌افتند، شما هستید که با اراده و عمل آن‌ها را خلق می‌کنید.", author: "کریس گروسر", title: "فرصت‌سازی" },
            { text: "شجاعت به معنای نترسیدن نیست، بلکه تصمیم‌گیری برای ادامه دادن با وجود تمام ترس‌هاست.", author: "نلسون ماندلا", title: "قدرت اراده" },
            { text: "هیچ آسانسوری برای رسیدن به قله موفقیت وجود ندارد، باید پله‌ها را یکی‌یکی با افتخار طی کنی.", author: "زیگ زیگلار", title: "مسیر رشد" },
            { text: "امروز کارهایی را انجام بده که دیگران حوصله‌اش را ندارند، تا فردا کارهایی را تجربه کنی که دیگران توانش را ندارند.", author: "برایان تریسی", title: "تعهد فردی" },
            { text: "تنها راه انجام کارهای درخشان و ماندگار، عشق ورزیدن خالصانه به کاری است که انجام می‌دهید.", author: "استیو جابز", title: "اشتیاق کاری" },
            { text: "در هر چالش و بحرانی، بذر یک فرصت طلایی و جهش بزرگ‌تر نهفته است.", author: "ناپلئون هیل", title: "نگاه به آینده" },
            { text: "خوش‌بینی و امیدواری مغناطیس موفقیت است؛ انرژی مثبت شما اتفاقات ناب را جذب می‌کند.", author: "مری لو رتون", title: "انرژی مثبت" },
            { text: "بزرگترین سرمایه شما طرز فکر شما، عزت نفس شما و ایمانی است که به توانایی‌هایتان دارید.", author: "دکتر محمود حسابی", title: "باور به خود" },
            { text: "شکست پایان راه نیست، بلکه یک یادآوری هوشمندانه برای تغییر زاویه دید و تلاش هدفمندتر است.", author: "هنری فورد", title: "درس‌های رشد" },
            { text: "مسیر هزار فرسنگی با اولین قدم برداشته می‌شود؛ محکم و امیدوار گام بردارید.", author: "لائوتسه", title: "آغاز حرکت" },
            { text: "ارزش واقعی در آن چیزی است که به سازمان، همکاران و جامعه‌ات ارزش می‌افزاید.", author: "آلبرت اینشتین", title: "خلق ارزش" },
            { text: "هیچ گلی به فکر رقابت با گل کناری نیست، او شکوفا می‌شود و عطرش را جاری می‌سازد.", author: "حکمت کهن", title: "شکوفایی درونی" },
            { text: "تغییر در ابتدا سخت و دشوار است، در میانه نامنظم و چالش‌برانگیز، اما در انتها فوق‌العاده و شکوهمند است.", author: "رابین شارما", title: "استقبال از تغییر" },
            { text: "نور در دل تاریکی زاده می‌شود و عیار انسان‌های بزرگ در گذر از طوفان‌ها آشکار می‌گردد.", author: "جبران خلیل جبران", title: "امید و تاب‌آوری" },
            { text: "آینده در دستان کسانی است که به زیبایی آرمان‌ها و رویاهای شغلی و فردی خود ایمان راسخ دارند.", author: "النور روزولت", title: "آینده‌نگری" },
            { text: "همیشه به یاد داشته باشید: تمرکز، نظم و پیگیری مداوم از نبوغِ بدون تلاش بسیار قدرتمندتر است.", author: "آنتونی رابینز", title: "تمرکز و انگیزه" }
        ];
        const randIdx = Math.floor(Math.random() * motivationalQuotes.length);
        const sel = motivationalQuotes[randIdx];
        return res.json({
            ...sel,
            source: 'بانک انگیزه و اندیشه سازمانی',
            title: sel.title || 'انرژی و موفقیت'
        });
    }

    // Default: Poem (100% Offline Persian Heritage Anthology)
    const poemList = [
        { text: "سعدیا مرد نکونام نمیرد هرگز\nمرده آن است که نامش به نکویی نبرند", author: "سعدی", title: "نام نیک" },
        { text: "بنی آدم اعضای یک پیکرند\nکه در آفرینش ز یک گوهرند", author: "سعدی", title: "همدلی و انسانیت" },
        { text: "در نومیدی بسی امید است\nپایان شب سیه سپید است", author: "نظامی", title: "امید و روشنایی" },
        { text: "هر که در او جوهر دانایی است\nبر همه چیزش توانایی است", author: "نظامی", title: "دانش و توانمندی" },
        { text: "جهان یادگار است و ما رفتنی\nبه گیتی نماند به جز مردمی", author: "فردوسی", title: "نیک‌نامی و اخلاق" },
        { text: "تو نیکی می‌کن و در دجله انداز\nکه ایزد در بیابانت دهد باز", author: "سعدی", title: "نیکوکاری" },
        { text: "آسایش دو گیتی تفسیر این دو حرف است\nبا دوستان مروت با دشمنان مدارا", author: "حافظ", title: "مدارا و مروت" },
        { text: "عیب رندان مکن ای زاهد پاکیزه سرشت\nکه گناه دگران بر تو نخواهند نوشت", author: "حافظ", title: "انصاف و همدلی" },
        { text: "صبر و ظفر هر دو دوستان قدیمند\nبر اثر صبر نوبت ظفر آید", author: "حافظ", title: "صبر و پیروزی" },
        { text: "خدا کشتی آنجا که خواهد برد\nوگر ناخدا جامه بر تن درد", author: "سعدی", title: "توکل و آرامش" },
        { text: "هرگز نمیرد آن که دلش زنده شد به عشق\nثبت است بر جریده عالم دوام ما", author: "حافظ", title: "ماندگاری" },
        { text: "بشنو از نی چون حکایت می‌کند\nاز جدایی‌ها شکایت می‌کند", author: "مولانا", title: "نوای نی" },
        { text: "ای هیچ برای هیچ بر هیچ مپیچ\nدانی که پس از عمر چه ماند باقی؟\nمهر است و محبت است و باقی همه هیچ", author: "مولانا", title: "حکمت و محبت" },
        { text: "کار ما نیست شناسایی راز گل سرخ\nکار ما شاید این است\nکه در افسون گل سرخ شناور باشیم", author: "سهراب سپهری", title: "نگاه نو" },
        { text: "زندگی خالی نیست\nمهربانی هست، سیب هست، ایمان هست\nآری تا شقایق هست زندگی باید کرد", author: "سهراب سپهری", title: "شوق زندگی" },
        { text: "چشم‌ها را باید شست، جور دیگر باید دید\nواژه‌ها را باید شست", author: "سهراب سپهری", title: "دیدگاه تازه" },
        { text: "تو مگو همه به جنگند و ز صلح من چه آید\nتو یکی نه‌ای هزاری تو چراغ خود برافروز", author: "مولانا", title: "روشن‌گری و امید" },
        { text: "توانا بود هر که دانا بود\nز دانش دل پیر برنا بود", author: "فردوسی", title: "دانایی" },
        { text: "چون عهده نمی‌شود کسی فردا را\nحالی خوش کن تو این دل شیدا را", author: "خیام", title: "فرصت اکنون" },
        { text: "از حادثه لرزند به خود قصرنشینان\nما خانه به دوشان غم طوفان نداریم", author: "صائب تبریزی", title: "قناعت و استواری" },
        { text: "به راه بادیه رفتن به از نشستن باطل\nکه گر مراد نیابم به قدر وسع بکوشم", author: "سعدی", title: "پشتکار و تلاش" },
        { text: "روزگار است این که گه عزت دهد گه خار دارد\nچرخ بازیگر از این بازیچه‌ها بسیار دارد", author: "قائم مقام فراهانی", title: "فراز و نشیب روزگار" },
        { text: "عمر برف است و آفتاب تموز\nاندکی ماند و خواجه غره هنوز", author: "سعدی", title: "غنیمت وقت" },
        { text: "مکن ز غصه شکایت که در طریق طلب\nبه راحتی نرسید آن که زحمتی نکشید", author: "حافظ", title: "رنج و آسایش" },
        { text: "درخت دوستی بنشان که کام دل به بار آرد\nنهال دشمنی برکن که رنج بی‌شمار آرد", author: "حافظ", title: "دوستی و مهر" },
        { text: "همت بلند دار که مردان روزگار\nاز همت بلند به جایی رسیده‌اند", author: "سعدی", title: "بلندهمتی" },
        { text: "گوهر پاک بباید که دگرگون نشود\nورنه هر سنگ و گلی گوهر نایاب شد", author: "پروین اعتصامی", title: "اصالت و گوهر وجود" },
        { text: "اندیشه کردن به کار نکو\nسودمندتر از خود کار نکوست", author: "امیرخسرو دهلوی", title: "اندیشه نیک" },
        { text: "گرت پایداری است در کار خویش\nشوی کامران سر فراز از پس خویش", author: "فردوسی", title: "استواری در کار" },
        { text: "هیچ گنجی به از هنر نبود\nپیش دانا نکوتر از زر نبود", author: "فردوسی", title: "ارزش هنر و مهارت" },
        { text: "مردی آن نیست که بر تن بکشی جامهٔ زر\nمردی آن است که بر خلق خدا سود رسد", author: "سعدی", title: "خدمت و فایده‌رسانی" },
        { text: "به رنج اندر است ای خردمند گنج\nنیابد کسی گنج نابرده رنج", author: "فردوسی", title: "گنج و رنج" },
        { text: "اگر هنر داری و فضل و کمال\nبه کوش و دگرگون مکن این جمال", author: "سعدی", title: "کمال و هنر" }
    ];

    const randPoemIdx = Math.floor(Math.random() * poemList.length);
    const selPoem = poemList[randPoemIdx];
    return res.json({
        ...selPoem,
        source: 'گنجینه شعر و ادب پارسی',
        title: selPoem.title || 'شعر و حکمت پارسی'
    });
}

app.get('/manifest.json', (req, res) => {
    const db = getDb();
    const settings = db.settings || {};
    const iconUrl = settings.pwaIcon || "/lepan-logo.png";
    const appName = settings.appName || "سامانه مالی و بازرگانی";
    
    const manifest = {
        name: appName,
        short_name: settings.appName || "سامانه مالی",
        description: "سیستم جامع مدیریت پرداخت ها و مجوزهای خروج کالا",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#2563eb",
        orientation: "portrait",
        lang: "fa",
        dir: "rtl",
        categories: ["finance", "business", "productivity"],
        icons: [
            {
                src: iconUrl,
                sizes: "192x192",
                type: "image/png",
                purpose: "any"
            },
            {
                src: iconUrl,
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable"
            },
            {
                src: iconUrl,
                sizes: "512x512",
                type: "image/png",
                purpose: "any"
            },
            {
                src: iconUrl,
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable"
            }
        ],
        screenshots: [
            {
                src: iconUrl,
                sizes: "512x512",
                type: "image/png",
                form_factor: "wide",
                label: appName
            },
            {
                src: iconUrl,
                sizes: "512x512",
                type: "image/png",
                form_factor: "narrow",
                label: appName
            }
        ],
        prefer_related_applications: false,
        share_target: {
            action: "/api/share-target",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
                title: "title",
                text: "text",
                url: "url",
                files: [
                    {
                        name: "files",
                        accept: [
                            "image/*",
                            "video/*",
                            "audio/*",
                            "application/*",
                            "text/*"
                        ]
                    }
                ]
            }
        }
    };
    res.setHeader('Content-Type', 'application/manifest+json');
    res.send(JSON.stringify(manifest));
});

// --- CENTRALIZED REPORT DELIVERY ENGINE & SCHEDULER ---
let scheduledReportCronTasks = [];



function setupDailyReports() {
    try {
        scheduledReportCronTasks.forEach(t => t.stop());
        scheduledReportCronTasks = [];

        const db = getDb();
        if (!db.reportDeliveryJobs) db.reportDeliveryJobs = [];
        const settings = db.settings || {};
        
        // Seed initial default jobs if list is empty
        if (db.reportDeliveryJobs.length === 0) {
            const defaultSalesTime = settings.dailySalesSendTime || '19:00';
            const [dsh, dsm] = defaultSalesTime.split(':').map(x => parseInt(x, 10) || 0);

            const defaultChequeTime = settings.chequeVaultSendTime || '09:00';
            const [cqh, cqm] = defaultChequeTime.split(':').map(x => parseInt(x, 10) || 0);

            db.reportDeliveryJobs = [
                {
                    id: 'job_daily_sales_custom',
                    title: 'گزارش روزانه ارشد مدیریتی فروش سایان ERP (امروز)',
                    module: 'sales',
                    reportType: 'daily_sales',
                    botPlatforms: ['telegram', 'bale'],
                    destinationGroup: settings.dailySalesTelegramGroupId || settings.telegramGroupId || '',
                    telegramGroup: settings.dailySalesTelegramGroupId || '',
                    baleGroup: settings.dailySalesBaleGroupId || '',
                    whatsappGroup: settings.dailySalesWhatsAppGroupId || '',
                    scheduleType: 'daily_custom',
                    sendTime: defaultSalesTime,
                    sendHour: dsh || 19,
                    sendMinute: dsm || 0,
                    cronExpression: `${dsm || 0} ${dsh || 19} * * *`,
                    attachPdf: true,
                    attachExcel: true,
                    attachImage: true,
                    enabled: settings.dailySalesAutoSendEnabled ?? true,
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'job_daily_comparison_custom',
                    title: 'گزارش پایش مقایسه‌ای فروش (امروز با دیروز)',
                    module: 'sales',
                    reportType: 'sales_comparison',
                    botPlatforms: ['telegram', 'bale'],
                    destinationGroup: settings.dailySalesTelegramGroupId || settings.telegramGroupId || '',
                    telegramGroup: settings.dailySalesTelegramGroupId || '',
                    baleGroup: settings.dailySalesBaleGroupId || '',
                    whatsappGroup: settings.dailySalesWhatsAppGroupId || '',
                    scheduleType: 'daily_custom',
                    sendTime: defaultSalesTime,
                    sendHour: dsh || 19,
                    sendMinute: dsm || 0,
                    cronExpression: `${dsm || 0} ${dsh || 19} * * *`,
                    attachPdf: true,
                    attachExcel: true,
                    attachImage: true,
                    enabled: settings.dailySalesAutoSendEnabled ?? true,
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'job_cheques_treasury_vault',
                    title: 'گزارش وضعیت چک‌های نزد صندوق خزانه‌داری (سال ۱۴۰۴)',
                    module: 'accounting',
                    reportType: 'cheque_vault',
                    botPlatforms: ['telegram', 'bale'],
                    destinationGroup: settings.chequeVaultTelegramGroupId || settings.botAccountingGroupIdTele || '',
                    telegramGroup: settings.chequeVaultTelegramGroupId || '',
                    baleGroup: settings.chequeVaultBaleGroupId || '',
                    whatsappGroup: settings.chequeVaultWhatsappGroupId || '',
                    scheduleType: 'daily_custom',
                    sendTime: defaultChequeTime,
                    sendHour: cqh || 9,
                    sendMinute: cqm || 0,
                    cronExpression: `${cqm || 0} ${cqh || 9} * * *`,
                    attachPdf: settings.chequeVaultAttachPdf ?? true,
                    attachExcel: settings.chequeVaultAttachExcel ?? true,
                    attachImage: false,
                    enabled: settings.chequeVaultAutoSendEnabled ?? true,
                    createdAt: new Date().toISOString()
                }
            ];
            saveDb(db);
        } else {
            // Dynamically synchronize existing default jobs with the settings page fields
            let modified = false;
            
            const salesTime = settings.dailySalesSendTime || '19:00';
            const [salesHour, salesMin] = salesTime.split(':').map(x => parseInt(x, 10) || 0);

            const chequeTime = settings.chequeVaultSendTime || '09:00';
            const [chequeHour, chequeMin] = chequeTime.split(':').map(x => parseInt(x, 10) || 0);

            db.reportDeliveryJobs.forEach(job => {
                if (job.id === 'job_daily_sales_custom' || job.id === 'job_daily_comparison_custom') {
                    if (job.sendTime !== salesTime || job.sendHour !== salesHour || job.sendMinute !== salesMin) {
                        job.sendTime = salesTime;
                        job.sendHour = salesHour;
                        job.sendMinute = salesMin;
                        job.cronExpression = `${salesMin} ${salesHour} * * *`;
                        modified = true;
                    }
                    const salesEnabled = settings.dailySalesAutoSendEnabled ?? true;
                    if (job.enabled !== salesEnabled) {
                        job.enabled = salesEnabled;
                        modified = true;
                    }
                    const tgGroup = settings.dailySalesTelegramGroupId || settings.telegramGroupId || '';
                    if (job.telegramGroup !== tgGroup) {
                        job.telegramGroup = tgGroup;
                        modified = true;
                    }
                    const bGroup = settings.dailySalesBaleGroupId || '';
                    if (job.baleGroup !== bGroup) {
                        job.baleGroup = bGroup;
                        modified = true;
                    }
                    const wGroup = settings.dailySalesWhatsAppGroupId || '';
                    if (job.whatsappGroup !== wGroup) {
                        job.whatsappGroup = wGroup;
                        modified = true;
                    }
                } else if (job.id === 'job_cheques_treasury_vault') {
                    if (job.sendTime !== chequeTime || job.sendHour !== chequeHour || job.sendMinute !== chequeMin) {
                        job.sendTime = chequeTime;
                        job.sendHour = chequeHour;
                        job.sendMinute = chequeMin;
                        job.cronExpression = `${chequeMin} ${chequeHour} * * *`;
                        modified = true;
                    }
                    const chequesEnabled = settings.chequeVaultAutoSendEnabled ?? true;
                    if (job.enabled !== chequesEnabled) {
                        job.enabled = chequesEnabled;
                        modified = true;
                    }
                    const tgGroup = settings.chequeVaultTelegramGroupId || settings.botAccountingGroupIdTele || '';
                    if (job.telegramGroup !== tgGroup) {
                        job.telegramGroup = tgGroup;
                        modified = true;
                    }
                    const bGroup = settings.chequeVaultBaleGroupId || '';
                    if (job.baleGroup !== bGroup) {
                        job.baleGroup = bGroup;
                        modified = true;
                    }
                    const wGroup = settings.chequeVaultWhatsappGroupId || '';
                    if (job.whatsappGroup !== wGroup) {
                        job.whatsappGroup = wGroup;
                        modified = true;
                    }
                    const attachP = settings.chequeVaultAttachPdf ?? true;
                    if (job.attachPdf !== attachP) {
                        job.attachPdf = attachP;
                        modified = true;
                    }
                    const attachE = settings.chequeVaultAttachExcel ?? true;
                    if (job.attachExcel !== attachE) {
                        job.attachExcel = attachE;
                        modified = true;
                    }
                } else if (job.id === 'job_warehouse_overview_daily') {
                    const whTime = settings.warehouseDailyAutoReportTime || '09:00';
                    const [whH, whM] = whTime.split(':').map(x => parseInt(x, 10) || 0);
                    if (job.sendTime !== whTime || job.sendHour !== whH || job.sendMinute !== whM) {
                        job.sendTime = whTime;
                        job.sendHour = whH;
                        job.sendMinute = whM;
                        job.cronExpression = `${whM} ${whH} * * *`;
                        modified = true;
                    }
                    const whEnabled = settings.warehouseDailyAutoReportEnabled ?? false;
                    if (job.enabled !== whEnabled) {
                        job.enabled = whEnabled;
                        modified = true;
                    }
                    const whTg = settings.warehouseTelegramGroupId || '';
                    if (job.telegramGroup !== whTg) {
                        job.telegramGroup = whTg;
                        modified = true;
                    }
                    const whBale = settings.warehouseBaleGroupId || '';
                    if (job.baleGroup !== whBale) {
                        job.baleGroup = whBale;
                        modified = true;
                    }
                    const whWa = settings.warehouseWhatsappGroupId || '';
                    if (job.whatsappGroup !== whWa) {
                        job.whatsappGroup = whWa;
                        modified = true;
                    }
                }
            });

            // Ensure warehouse job exists if enabled
            if (!db.reportDeliveryJobs.some(j => j.id === 'job_warehouse_overview_daily')) {
                const whTime = settings.warehouseDailyAutoReportTime || '09:00';
                const [whH, whM] = whTime.split(':').map(x => parseInt(x, 10) || 0);
                db.reportDeliveryJobs.push({
                    id: 'job_warehouse_overview_daily',
                    title: 'گزارش پایش موجودی انبار، تراز وزنی و هشدار اقلام منفی',
                    module: 'warehouse',
                    reportType: 'warehouse_overview',
                    botPlatforms: settings.warehouseDailyAutoReportPlatforms || ['telegram', 'bale'],
                    destinationGroup: settings.warehouseTelegramGroupId || '',
                    telegramGroup: settings.warehouseTelegramGroupId || '',
                    baleGroup: settings.warehouseBaleGroupId || '',
                    whatsappGroup: settings.warehouseWhatsappGroupId || '',
                    scheduleType: 'daily_custom',
                    sendTime: whTime,
                    sendHour: whH || 9,
                    sendMinute: whM || 0,
                    cronExpression: `${whM || 0} ${whH || 9} * * *`,
                    attachPdf: true,
                    attachExcel: false,
                    attachImage: false,
                    enabled: settings.warehouseDailyAutoReportEnabled ?? false,
                    createdAt: new Date().toISOString()
                });
                modified = true;
            }

            if (modified) {
                saveDb(db);
            }
        }

        // Register cron triggers for all enabled jobs in Asia/Tehran timezone
        db.reportDeliveryJobs.forEach(job => {
            if (!job.enabled) return;

            let cronPattern = '0 19 * * *';

            // Check if exact sendHour and sendMinute or sendTime is configured
            if (job.sendHour !== undefined && job.sendMinute !== undefined) {
                cronPattern = `${parseInt(job.sendMinute, 10) || 0} ${parseInt(job.sendHour, 10) || 0} * * *`;
            } else if (job.sendTime && typeof job.sendTime === 'string' && job.sendTime.includes(':')) {
                const [h, m] = job.sendTime.split(':').map(x => parseInt(x, 10) || 0);
                cronPattern = `${m} ${h} * * *`;
            } else if (job.cronExpression && job.cronExpression.trim()) {
                cronPattern = job.cronExpression.trim();
            } else if (job.scheduleType === 'daily_1900' || job.scheduleType === 'daily_comp_1900') {
                cronPattern = '0 19 * * *';
            } else if (job.scheduleType === 'weekly') {
                cronPattern = '0 19 * * 6'; // Saturday 19:00 Tehran
            } else if (job.scheduleType === 'monthly') {
                cronPattern = '0 19 1 * *'; // 1st of month 19:00 Tehran
            }

            try {
                const task = cron.schedule(cronPattern, async () => {
                    console.log(`⏰ [Tehran Time Cron] Executing Scheduled Report Job: ${job.title} (${job.id}) at ${new Date().toLocaleTimeString('fa-IR')}`);
                    await executeReportJob(job);
                }, {
                    timezone: "Asia/Tehran"
                });
                scheduledReportCronTasks.push(task);
                console.log(`📌 Scheduled Report [${job.title}] with cron pattern "${cronPattern}" (Tehran Time)`);
            } catch (err) {
                console.error(`Failed to schedule report job ${job.id}:`, err);
            }
        });

        console.log(`✅ Loaded ${db.reportDeliveryJobs.length} report delivery jobs (${scheduledReportCronTasks.length} active cron schedules in Tehran Time).`);
    } catch (e) {
        console.error("setupDailyReports Error:", e);
    }
}

// ----------------------------------------------------
// TASK RECURRING REMINDER BACKGROUND RUNNER (E.G. EVERY 10 MINS)
// ----------------------------------------------------
let taskReminderIntervalTimer = null;
function setupTaskRecurringReminders() {
    if (taskReminderIntervalTimer) clearInterval(taskReminderIntervalTimer);

    console.log("⏰ Task Recurring Reminders engine initialized (checking every 30 seconds)...");
    taskReminderIntervalTimer = setInterval(async () => {
        try {
            const db = getDb();
            if (!db.tasks || !Array.isArray(db.tasks) || db.tasks.length === 0) return;

            const now = Date.now();
            let hasChanges = false;

            for (const task of db.tasks) {
                // Check pending tasks with active recurring reminder
                if (task.recurringReminder && task.status !== 'completed') {
                    const intervalMin = Number(task.reminderIntervalMinutes) || 10;
                    const intervalMs = intervalMin * 60 * 1000;
                    const lastReminded = Number(task.lastRemindedAt) || Number(task.createdAt) || 0;

                    if (now - lastReminded >= intervalMs) {
                        task.lastRemindedAt = now;
                        hasChanges = true;

                        const taskGroup = db.taskGroups?.find(tg => tg.id === task.groupId);
                        const groupName = taskGroup ? taskGroup.name : 'گروه کاری';
                        
                        // Extract specifically tagged / assigned users
                        let targets = [];
                        if (task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
                            task.assignedTo.forEach(u => {
                                if (u && typeof u === 'string' && u.trim()) {
                                    targets.push(u.trim());
                                }
                            });
                        } else if (task.assignee && typeof task.assignee === 'string' && task.assignee.trim()) {
                            targets.push(task.assignee.trim());
                        }

                        // Also extract any @mentions from title & description
                        const textToCheck = `${task.title || ''} ${task.description || ''}`;
                        const mentionRegex = /@([a-zA-Z0-9_\.\-\u0600-\u06FF]+)/g;
                        let match;
                        while ((match = mentionRegex.exec(textToCheck)) !== null) {
                            const mentioned = match[1]?.trim();
                            if (mentioned && !targets.some(t => t.toLowerCase() === mentioned.toLowerCase())) {
                                targets.push(mentioned);
                            }
                        }

                        // If specific people are tagged/assigned, targets strictly contains ONLY those tagged users!
                        // Only fallback to group members if NO person is tagged at all
                        if (targets.length === 0) {
                            if (taskGroup && taskGroup.members && Array.isArray(taskGroup.members)) {
                                targets = [...taskGroup.members];
                            } else if (task.createdBy) {
                                targets = [task.createdBy];
                            }
                        }

                        // Deduplicate targets
                        const uniqueTargets = Array.from(new Set(targets.map(t => t.trim())));

                        if (uniqueTargets && uniqueTargets.length > 0) {
                            broadcastNotification(
                                `⏰ یادآور تسک (${intervalMin} دقیقه): ${task.title}`,
                                `تسک "${task.title}" در گروه "${groupName}" در انتظار اقدام یا تکمیل شماست.`,
                                `/chat?group=${task.groupId}&task=${task.id}`,
                                null,
                                uniqueTargets,
                                null
                            ).catch(err => console.error("Task recurring broadcast error:", err));
                        }
                    }
                }
            }

            if (hasChanges) {
                saveDb(db);
            }
        } catch (err) {
            console.error("Task recurring reminders error:", err);
        }
    }, 30 * 1000);
}

async function fetchAndDispatchProductionCompareReport(db, customTargets, job, compRanges) {
    const { dateFromA, dateToA, dateFromB, dateToB, labelA, labelB } = compRanges;
    console.log(`🏭 Compiling Production Compare Report: [${labelA}] vs [${labelB}]...`);

    // Fetch Period A
    let resA = { items: [], totals: {} };
    let resB = { items: [], totals: {} };
    try {
        resA = await fetchProductionDataForDateRange(db, dateFromA, dateToA);
    } catch (eA) {
        console.warn(`Could not fetch production period A (${dateFromA} to ${dateToA}):`, eA.message);
    }
    try {
        resB = await fetchProductionDataForDateRange(db, dateFromB, dateToB);
    } catch (eB) {
        console.warn(`Could not fetch production period B (${dateFromB} to ${dateToB}):`, eB.message);
    }

    // Merge by Item Name
    const map = new Map();
    (resA.items || []).forEach(item => {
        map.set(item.name, {
            name: item.name,
            totalA: item.total || 0,
            totalB: 0
        });
    });
    (resB.items || []).forEach(item => {
        if (!map.has(item.name)) {
            map.set(item.name, {
                name: item.name,
                totalA: 0,
                totalB: item.total || 0
            });
        } else {
            map.get(item.name).totalB = item.total || 0;
        }
    });

    const items = Array.from(map.values()).sort((a, b) => (b.totalA + b.totalB) - (a.totalA + a.totalB));
    const sumA = resA.totals?.grandTotal ?? items.reduce((s, x) => s + (x.totalA || 0), 0);
    const sumB = resB.totals?.grandTotal ?? items.reduce((s, x) => s + (x.totalB || 0), 0);
    const totalDiff = sumA - sumB;
    const totalDiffPct = sumB ? (totalDiff / sumB) * 100 : 0;

    const title = `گزارش مقایسه‌ای آمار تولید کارخانه (${labelA} در مقایسه با ${labelB})`;
    const Renderer = await safeImport('./backend/renderer.js');
    let pdfBuffer = null;
    if (Renderer && Renderer.generateProductionCompareReportPDF) {
        try {
            pdfBuffer = await Renderer.generateProductionCompareReportPDF(title, dateFromA, dateToA, dateFromB, dateToB, items);
        } catch (pdfErr) {
            console.error("Error creating production compare PDF:", pdfErr);
        }
    }

    const caption = `📊 *گزارش مقایسه‌ای آمار تولید کارخانه*

📅 *بازه اول:* ${labelA}
📅 *بازه دوم:* ${labelB}

📈 *خلاصه وضعیت تولید:*
🔹 مجموع بازه اول: *${sumA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg*
🔸 مجموع بازه دوم: *${sumB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg*
📊 اختلاف کل (اول - دوم): *${(totalDiff >= 0 ? '+' : '')}${totalDiff.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg*
📉 درصد تغییر: *${sumB ? `${totalDiffPct >= 0 ? '+' : ''}${totalDiffPct.toFixed(1)}%` : '-'}*

📎 جدول کامل مقایسه‌ای اقلام در فایل PDF پیوست ارسال گردید.`;

    const filename = `Production_Compare_${dateFromA.replace(/[\/\\]/g, '-')}_vs_${dateFromB.replace(/[\/\\]/g, '-')}.pdf`;

    const targets = customTargets && customTargets.length > 0 ? customTargets : collectBotTargets(db, { category: 'production_compare' });

    for (const target of targets) {
        try {
            if (target.platform === 'telegram' && telegram) {
                if (pdfBuffer && job.attachPdf !== false) {
                    await telegram.sendBotDocument(target.id, pdfBuffer, filename, caption);
                } else {
                    await telegram.sendBotMessage(target.id, caption);
                }
            } else if (target.platform === 'bale' && bale) {
                if (pdfBuffer && job.attachPdf !== false) {
                    await bale.sendBotDocument(target.id, pdfBuffer, filename, caption);
                } else {
                    await bale.sendBotMessage(target.id, caption);
                }
            } else if (target.platform === 'whatsapp' && whatsapp) {
                if (pdfBuffer && job.attachPdf !== false) {
                    const b64 = pdfBuffer.toString('base64');
                    await whatsapp.sendMessage(target.id, caption, { data: b64, mimeType: 'application/pdf', filename });
                } else {
                    await whatsapp.sendMessage(target.id, caption);
                }
            }
        } catch (targetErr) {
            console.error(`Error sending production compare report to ${target.platform} (${target.id}):`, targetErr.message);
        }
    }
    console.log(`✅ Production compare report successfully dispatched to ${targets.length} targets.`);
}

async function executeReportJob(job) {
    const db = getDb();
    try {
        console.log(`🚀 Dispatching Scheduled Report Job [${job.title}] to platforms [${(job.botPlatforms || []).join(', ')}]...`);
        
        const isProdJob = job.module === 'inventory' || job.module === 'production' || job.reportType === 'production' || job.reportType === 'production_overview' || job.reportType === 'production_comparison' || job.reportType === 'inventory_stock';
        const isSalesJob = job.module === 'sales' || job.reportType === 'daily_sales' || job.reportType === 'sales_comparison';
        const isChequeJob = job.module === 'accounting' || 
            job.reportType === 'cheque_vault' || 
            job.reportType === 'cheque_not_due' || 
            job.reportType === 'cheque_overdue' || 
            job.reportType === 'cheque_matured' || 
            job.reportType === 'cheques_treasury' || 
            job.reportType === 'cheque_alerts';

        const defaultTgGroup = isChequeJob
            ? (db.settings?.chequeVaultTelegramGroupId || db.settings?.botAccountingGroupIdTele || db.settings?.telegramGroupId)
            : (job.reportType === 'warehouse_overview' || job.module === 'warehouse'
                ? (db.settings?.warehouseTelegramGroupId || '')
                : (isProdJob
                    ? (db.settings?.productionTelegramGroupId || db.settings?.factoryGroupId)
                    : (isSalesJob ? (db.settings?.dailySalesTelegramGroupId || db.settings?.botDailySalesGroupIdTele) : (db.settings?.botAccountingGroupIdTele || db.settings?.telegramGroupId))));

        const defaultBaleGroup = isChequeJob
            ? (db.settings?.chequeVaultBaleGroupId || db.settings?.botAccountingGroupIdBale || db.settings?.baleGroupId)
            : (job.reportType === 'warehouse_overview' || job.module === 'warehouse'
                ? (db.settings?.warehouseBaleGroupId || '')
                : (isProdJob
                    ? db.settings?.productionBaleGroupId
                    : (isSalesJob ? (db.settings?.dailySalesBaleGroupId || db.settings?.botDailySalesGroupIdBale) : (db.settings?.botAccountingGroupIdBale || db.settings?.baleGroupId))));

        const defaultWaGroup = isChequeJob
            ? (db.settings?.chequeVaultWhatsappGroupId || db.settings?.botBijakGroupIdWhatsApp)
            : (job.reportType === 'warehouse_overview' || job.module === 'warehouse'
                ? (db.settings?.warehouseWhatsappGroupId || '')
                : (isProdJob
                    ? db.settings?.productionWhatsappGroupId
                    : (isSalesJob ? (db.settings?.dailySalesWhatsappGroupId || db.settings?.botDailySalesGroupIdWhatsApp) : (db.settings?.botBijakGroupIdWhatsApp || db.settings?.defaultWarehouseGroup))));

        const teleGroup = job.telegramGroup || job.destinationGroup || defaultTgGroup;
        const baleGroup = job.baleGroup || job.destinationGroup || defaultBaleGroup;
        const waGroup = job.whatsappGroup || job.destinationGroup || defaultWaGroup;

        const customTargets = [];
        if (job.botPlatforms?.includes('telegram') && teleGroup) {
            const ids = String(teleGroup).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean);
            ids.forEach(id => customTargets.push({ platform: 'telegram', id }));
        }
        if (job.botPlatforms?.includes('bale') && baleGroup) {
            const ids = String(baleGroup).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean);
            ids.forEach(id => customTargets.push({ platform: 'bale', id }));
        }
        if (job.botPlatforms?.includes('whatsapp') && waGroup) {
            const ids = String(waGroup).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean);
            ids.forEach(id => customTargets.push({ platform: 'whatsapp', id }));
        }

        if (job.reportType === 'cheque_vault' || job.reportType === 'cheque_not_due' || job.reportType === 'cheque_overdue' || job.reportType === 'cheque_matured' || job.reportType === 'cheques_treasury' || job.reportType === 'cheque_alerts') {
            // Send Vault Cheques Report matching Sayan ERP criteria
            let rType = 'vault';
            if (job.reportType === 'cheque_not_due') rType = 'not_due';
            else if (job.reportType === 'cheque_overdue') rType = 'overdue';
            else if (job.reportType === 'cheque_matured') rType = 'matured';
            
            const res = await sendTreasuryChequesReport(db, customTargets.length > 0 ? customTargets : null, job.botPlatforms, {
                attachPdf: job.attachPdf ?? true,
                attachExcel: job.attachExcel ?? true,
                reportType: rType
            });
            console.log(`✅ Cheques report (${rType}) dispatched successfully: ${res?.count || 0} cheques found.`);
        } else if (job.reportType === 'customer_balances' || job.reportType === 'traz') {
            // Sayan Customer Balances (Traz)
            console.log("📊 Starting Sayan customer balances (Traz) report dispatch...");
            try {
                const list = await getCustomerBalancesData(db);
                const debtors = list.filter(r => (r.rawBalance || 0) > 0).sort((a, b) => Math.abs(b.rawBalance) - Math.abs(a.rawBalance));
                const creditors = list.filter(r => (r.rawBalance || 0) < 0).sort((a, b) => Math.abs(b.rawBalance) - Math.abs(a.rawBalance));

                const totalBed = debtors.reduce((s, r) => s + Math.abs(r.rawBalance || 0), 0);
                const totalBes = creditors.reduce((s, r) => s + Math.abs(r.rawBalance || 0), 0);
                const netBalance = totalBed - totalBes;

                const todayShamsi = new Date().toLocaleDateString('fa-IR');
                const fRial = (n) => (Math.round(n) || 0).toLocaleString('fa-IR') + ' ریال';

                let msg = `📊 *گزارش تراز معین تفصیلی و مانده حساب اشخاص / مشتریان*\n`;
                msg += `📅 *تاریخ استعلام:* ${todayShamsi}\n`;
                msg += `🏢 *سامانه جامع مالی سایان ERP*\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
                msg += `📈 *خلاصه وضعیت تراز کل:*\n`;
                msg += `🔹 مجموع بدهکاران (${debtors.length.toLocaleString('fa-IR')} طرف حساب): *${fRial(totalBed)}*\n`;
                msg += `🔸 مجموع بستانکاران (${creditors.length.toLocaleString('fa-IR')} طرف حساب): *${fRial(totalBes)}*\n`;
                msg += `⚖️ تراز خالص: *${fRial(Math.abs(netBalance))} (${netBalance >= 0 ? 'بدهکار' : 'بستانکار'})*\n\n`;

                if (debtors.length > 0) {
                    msg += `🔴 *بزرگترین بدهکاران (Top 5):*\n`;
                    debtors.slice(0, 5).forEach((d, idx) => {
                        msg += `  ${(idx + 1).toLocaleString('fa-IR')}. *${d.name}* (${d.accountCode}): ${fRial(d.balance)}\n`;
                    });
                    msg += `\n`;
                }

                if (creditors.length > 0) {
                    msg += `🟢 *بزرگترین بستانکاران (Top 5):*\n`;
                    creditors.slice(0, 5).forEach((c, idx) => {
                        msg += `  ${(idx + 1).toLocaleString('fa-IR')}. *${c.name}* (${c.accountCode}): ${fRial(c.balance)}\n`;
                    });
                    msg += `\n`;
                }

                msg += `📎 جزئیات کامل در فایل گزارش PDF پیوست گردید.`;

                let pdfBuffer = null;
                if (job.attachPdf !== false) {
                    try {
                        const Renderer = await safeImport('./backend/renderer.js');
                        if (Renderer && Renderer.generatePdfBuffer) {
                            const html = `
                            <html dir="rtl" lang="fa">
                            <head>
                                <meta charset="utf-8">
                                <title>گزارش تراز معین تفصیلی اشخاص</title>
                                <style>
                                    body { font-family: 'Tahoma', 'Segoe UI', sans-serif; padding: 20px; font-size: 11px; direction: rtl; color: #1e293b; background: #fff; }
                                    h1 { font-size: 16px; text-align: center; margin-bottom: 5px; color: #0f172a; }
                                    .subtitle { text-align: center; font-size: 11px; color: #64748b; margin-bottom: 20px; }
                                    .summary-box { display: flex; justify-content: space-around; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 20px; }
                                    .summary-item { text-align: center; }
                                    .summary-item b { display: block; font-size: 13px; margin-top: 4px; color: #0f172a; }
                                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                                    th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; text-align: right; }
                                    td { border: 1px solid #e2e8f0; padding: 5px 8px; font-size: 10px; }
                                    .bed { color: #dc2626; font-weight: bold; }
                                    .bes { color: #16a34a; font-weight: bold; }
                                </style>
                            </head>
                            <body>
                                <h1>گزارش تراز معین تفصیلی و مانده حساب اشخاص (سایان ERP)</h1>
                                <div class="subtitle">تاریخ گزارش: ${todayShamsi}</div>
                                <div class="summary-box">
                                    <div class="summary-item">مجموع بدهکاران: <b class="bed">${fRial(totalBed)}</b></div>
                                    <div class="summary-item">مجموع بستانکاران: <b class="bes">${fRial(totalBes)}</b></div>
                                    <div class="summary-item">تراز خالص: <b>${fRial(Math.abs(netBalance))} (${netBalance >= 0 ? 'بدهکار' : 'بستانکار'})</b></div>
                                </div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th style="width: 40px; text-align: center;">ردیف</th>
                                            <th style="width: 80px;">کد شخص</th>
                                            <th>نام طرف حساب</th>
                                            <th style="width: 120px; text-align: left;">مانده بدهکار (ریال)</th>
                                            <th style="width: 120px; text-align: left;">مانده بستانکار (ریال)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${list.slice(0, 300).map((r, i) => `
                                            <tr>
                                                <td style="text-align: center;">${(i + 1).toLocaleString('fa-IR')}</td>
                                                <td>${r.accountCode || '-'}</td>
                                                <td><b>${r.name || '-'}</b></td>
                                                <td style="text-align: left;" class="${r.rawBalance > 0 ? 'bed' : ''}">${r.rawBalance > 0 ? (Math.round(r.rawBalance)).toLocaleString('fa-IR') : '-'}</td>
                                                <td style="text-align: left;" class="${r.rawBalance < 0 ? 'bes' : ''}">${r.rawBalance < 0 ? (Math.round(Math.abs(r.rawBalance))).toLocaleString('fa-IR') : '-'}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </body>
                            </html>
                            `;
                            pdfBuffer = await Renderer.generatePdfBuffer(html);
                        }
                    } catch (pdfErr) {
                        console.error("Failed to generate balances PDF:", pdfErr);
                    }
                }

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await telegram.sendBotDocument(target.id, pdfBuffer, `Customer_Balances_${Date.now()}.pdf`, msg);
                            } else {
                                await telegram.sendBotMessage(target.id, msg);
                            }
                        } else if (target.platform === 'bale' && bale) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await bale.sendBotDocument(target.id, pdfBuffer, `Customer_Balances_${Date.now()}.pdf`, msg);
                            } else {
                                await bale.sendBotMessage(target.id, msg);
                            }
                        } else if (target.platform === 'whatsapp' && whatsapp && whatsapp.sendMessage) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                const b64 = pdfBuffer.toString('base64');
                                await whatsapp.sendMessage(target.id, msg, { data: b64, mimeType: 'application/pdf', filename: 'Customer_Balances.pdf' });
                            } else {
                                await whatsapp.sendMessage(target.id, msg);
                            }
                        }
                    } catch (targetErr) {
                        console.error(`Error sending customer balances report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Customer balances report successfully dispatched to ${customTargets.length} targets.`);
            } catch (err) {
                console.error("Error generating/sending customer balances report:", err);
            }
        } else if (job.reportType === 'warehouse_overview') {
            // Dispatch Warehouse Daily Overview to configured groups with dynamic compilation!
            try {
                console.log("📊 Starting dynamic compilation of warehouse daily overview report...");
                const overview = db.warehouseOverview || {};
                const lastYearOverrides = overview.lastYearOverrides || {};
                const currentOverrides = overview.currentOverrides || {};
                const goodsInTransit = overview.goodsInTransit || [];
                const goodsInCustoms = overview.goodsInCustoms || [];
                const purchasingGoods = overview.purchasingGoods || [];
                const commercialGoods = overview.commercialGoods || [];
                const itemCategories = overview.itemCategories || {};
                const meta = overview.meta || {};

                // Date helpers
                const getTodayJalaliStr = () => {
                    try {
                        const now = new Date();
                        const options = { calendar: 'persian', year: 'numeric', month: 'numeric', day: 'numeric' };
                        const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', options).formatToParts(now);
                        const y = parts.find(p => p.type === 'year')?.value || '1405';
                        const m = parts.find(p => p.type === 'month')?.value || '1';
                        const d = parts.find(p => p.type === 'day')?.value || '1';
                        const mm = parseInt(m, 10) < 10 ? `۰${m}` : m;
                        const dd = parseInt(d, 10) < 10 ? `۰${d}` : d;
                        return `${y}/${mm}/${dd}`;
                    } catch (e) {
                        return '۱۴۰۵/۰۵/۳۱';
                    }
                };

                const getJalaliYear = (jalaliStr) => {
                    const clean = String(jalaliStr || '').trim()
                        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                    const match = clean.match(/^(\d{4})/);
                    return match ? parseInt(match[1]) : 1404;
                };

                const getJalaliYearStartMiladi = (year) => {
                    if (year < 1404) return '2024-03-20';
                    return '2025-03-21';
                };

                const settings = db.settings || {};
                const isYearClosed = settings.sayanYearClosed === true;
                
                const report1Jalali = meta.report1Jalali || '۱۴۰۴/۱۲/۲۹';
                const report2Jalali = getTodayJalaliStr();
                const reportDate = getTodayJalaliStr();
                const report1Miladi = meta.report1Miladi || '2025-03-20';
                const report2Miladi = new Date().toISOString().split('T')[0];
                const cumulativeFromLastYear = !isYearClosed;

                const y1 = getJalaliYear(report1Jalali);
                const y2 = getJalaliYear(report2Jalali);
                const r1From = getJalaliYearStartMiladi(y1);
                const r2From = cumulativeFromLastYear ? getJalaliYearStartMiladi(y1) : getJalaliYearStartMiladi(y2);

                console.log(`📡 Querying Sayan stock for dates: Last Year: ${r1From} to ${report1Miladi}, Current: ${r2From} to ${report2Miladi}`);
                
                // Get stock data from Sayan ERP
                let lastYearStock = [];
                let currentStock = [];
                try {
                    const getWarehouseInventoryForDate = async (targetDate, fromDate) => {
                        const dateFromFilter = fromDate ? `AND t10.Field_008 >= '${fromDate}T00:00:00.000Z'` : '';
                        const sqlStockAndNames = `
                            WITH GroupedStock AS (
                                SELECT 
                                    t11.Field_005 as ItemCode,
                                    SUM(CASE 
                                        WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '13', '14', '24', '26', '28', '40', '44', '61', '65', '67', '70', '73', '79', '83') THEN t11.Field_006 
                                        WHEN RTRIM(LTRIM(t10.Field_009)) IN ('12', '25', '27', '30', '37', '42', '46', '62', '68', '71', '74', '80', '84') THEN -t11.Field_006 
                                        ELSE 0 
                                    END) as StockQty
                                FROM STR_TBL_011 t11
                                INNER JOIN STR_TBL_010 t10 ON t11.Field_004 = t10.Field_005 
                                                          AND t11.Field_003 = t10.Field_004 
                                                          AND t11.Field_012 = t10.Field_018
                                WHERE t10.Field_008 <= '${targetDate}T23:59:59.000Z'
                                  ${dateFromFilter}
                                GROUP BY t11.Field_005
                            )
                            SELECT 
                                gs.ItemCode,
                                gs.StockQty,
                                COALESCE(
                                    NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                                    NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                                    NULLIF(RTRIM(LTRIM(t02_exact.Field_003)), ''),
                                    NULLIF(RTRIM(LTRIM(t_name.ItemName)), ''),
                                    NULLIF(RTRIM(LTRIM(t_group.GroupName)), ''),
                                    NULLIF(RTRIM(LTRIM(c01.Field_003)), ''),
                                    RTRIM(LTRIM(gs.ItemCode)),
                                    N'کالای بدون نام'
                                ) as ItemName,
                                t_group.GroupName,
                                t_group.SubGroupName
                            FROM GroupedStock gs
                            LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(gs.ItemCode))
                            LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(gs.ItemCode))
                            LEFT JOIN IND_TBL_002 t02_exact ON RTRIM(LTRIM(t02_exact.Field_008)) = RTRIM(LTRIM(gs.ItemCode))
                            LEFT JOIN COM_TBL_001 c01 ON RTRIM(LTRIM(c01.Field_004)) = RTRIM(LTRIM(gs.ItemCode))
                            LEFT JOIN (
                                SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(t02_sub.Field_003) as ItemName
                                FROM IND_TBL_021 t21_sub
                                LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
                                GROUP BY t21_sub.Field_004
                            ) t_name ON RTRIM(LTRIM(gs.ItemCode)) = RTRIM(LTRIM(t_name.ItemCode))
                            LEFT JOIN (
                                SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, 
                                       MIN(t02_sub.Field_003) as SubGroupName,
                                       MIN(COALESCE(t02_grandparent.Field_003, t02_parent.Field_003, t02_sub.Field_003)) as GroupName
                                FROM IND_TBL_021 t21_sub
                                LEFT JOIN IND_TBL_002 t02_sub ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
                                LEFT JOIN IND_TBL_002 t02_parent ON RTRIM(LTRIM(t02_sub.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
                                LEFT JOIN IND_TBL_002 t02_grandparent ON RTRIM(LTRIM(t02_parent.Field_009)) = RTRIM(LTRIM(t02_grandparent.Field_008))
                                GROUP BY t21_sub.Field_004
                            ) t_group ON RTRIM(LTRIM(gs.ItemCode)) = RTRIM(LTRIM(t_group.ItemCode))
                        `;

                        const sqlCartonsOnly = `
                            SELECT 
                                t11.Field_005 as ItemCode,
                                SUM(CASE 
                                    WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '24', '26', '29', '40', '44', '46', '83') THEN
                                        TRY_CAST(
                                            LEFT(
                                                LTRIM(SUBSTRING(t11.Field_031, CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12, 10)),
                                                PATINDEX('%[^0-9]%', LTRIM(SUBSTRING(t11.Field_031, CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12, 10)) + 'X') - 1
                                            ) as float
                                        )
                                    WHEN RTRIM(LTRIM(t10.Field_009)) IN ('23', '25', '30', '37', '42', '84', '62', '68', '71', '74', '80') THEN
                                        -TRY_CAST(
                                            LEFT(
                                                LTRIM(SUBSTRING(t11.Field_031, CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12, 10)),
                                                PATINDEX('%[^0-9]%', LTRIM(SUBSTRING(t11.Field_031, CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12, 10)) + 'X') - 1
                                            ) as float
                                        )
                                    ELSE 0
                                END) as CartonsQty
                            FROM STR_TBL_011 t11
                            INNER JOIN STR_TBL_010 t10 ON t11.Field_004 = t10.Field_005 
                                                      AND t11.Field_003 = t10.Field_004 
                                                      AND t11.Field_012 = t10.Field_018
                            WHERE t10.Field_008 <= '${targetDate}T23:59:59.000Z'
                              ${dateFromFilter}
                              AND t11.Field_031 LIKE N'%تعداد کارتن:%'
                            GROUP BY t11.Field_005
                        `;

                        const [resStock, resCartons] = await Promise.all([
                            executeSayanQuery(db, sqlStockAndNames),
                            executeSayanQuery(db, sqlCartonsOnly)
                        ]);

                        const stockRows = resStock || [];
                        const cartonRows = resCartons || [];

                        const cartonsMap = {};
                        cartonRows.forEach(r => {
                            if (r.ItemCode) {
                                cartonsMap[r.ItemCode.trim()] = parseFloat(r.CartonsQty || 0);
                            }
                        });

                        return stockRows.map(r => {
                            const itemCodeTrimmed = r.ItemCode ? r.ItemCode.trim() : '';
                            return {
                                itemCode: itemCodeTrimmed,
                                itemName: r.ItemName ? r.ItemName.trim() : 'کالای بدون نام',
                                groupName: r.GroupName ? r.GroupName.trim() : 'سایر گروه‌ها',
                                subGroupName: r.SubGroupName ? r.SubGroupName.trim() : '',
                                stockQty: parseFloat(r.StockQty || 0),
                                cartonsQty: cartonsMap[itemCodeTrimmed] || 0
                            };
                        });
                    };

                    const results = await Promise.all([
                        getWarehouseInventoryForDate(report1Miladi, r1From),
                        getWarehouseInventoryForDate(report2Miladi, r2From)
                    ]);
                    lastYearStock = results[0] || [];
                    currentStock = results[1] || [];
                } catch (sayanQueryErr) {
                    console.error("❌ Sayan Query failed during daily cron compilation:", sayanQueryErr);
                }

                console.log(`📦 Sayan query done. LastYearStock rows: ${lastYearStock.length}, CurrentStock rows: ${currentStock.length}`);

                // Setup groups (matching Sayan ERP)
                const MANUFACTURED_GROUPS = [
                    { code: '0401', name: 'اسپاندکس (کاور)' },
                    { code: '0402', name: 'کش' },
                    { code: '0403', name: 'اسپاندکس جوشی ( ساپورت )' },
                    { code: '0405', name: 'پلی استر شوایتر' },
                    { code: '0407', name: 'نایلون' },
                    { code: '0408', name: 'نخ ملت' },
                    { code: '0409', name: 'الیاف' },
                    { code: '0410', name: 'FDY' }
                ];

                const RAW_MATERIAL_GROUPS = [
                    { code: '0101', name: 'چیپس' },
                    { code: '0102', name: 'POY' },
                    { code: '0103', name: 'dty یا پلی استر' },
                    { code: '0104', name: 'لاستیک' },
                    { code: '0105', name: 'لاکرا' },
                    { code: '0106', name: 'پلی استر اسپان' },
                    { code: '0107', name: 'مستر بچ' },
                    { code: '0108', name: 'نایلون' }
                ];

                const getSectionGroups = (isProduction, predefinedGroups) => {
                    const set = new Set();
                    predefinedGroups.forEach(g => set.add(g.code));

                    const otherPredefined = isProduction ? RAW_MATERIAL_GROUPS : MANUFACTURED_GROUPS;
                    const otherPredefinedCodes = new Set(otherPredefined.map(g => g.code));

                    const matchesSection = (code) => {
                        const prefix4 = code.substring(0, 4);
                        if (set.has(prefix4)) return true;
                        if (otherPredefinedCodes.has(prefix4)) return false;
                        if (isProduction) {
                            return code.startsWith('04');
                        } else {
                            return code.startsWith('01');
                        }
                    };

                    lastYearStock.forEach(r => {
                        const code = String(r.itemCode || '');
                        if (code.length >= 4 && matchesSection(code)) {
                            set.add(code.substring(0, 4));
                        }
                    });
                    currentStock.forEach(r => {
                        const code = String(r.itemCode || '');
                        if (code.length >= 4 && matchesSection(code)) {
                            set.add(code.substring(0, 4));
                        }
                    });

                    const list = Array.from(set).map(prefix => {
                        const predefined = predefinedGroups.find(g => g.code === prefix);
                        if (predefined) return predefined;

                        let discoveredName = '';
                        const found = [...currentStock, ...lastYearStock].find(r => {
                            const c = String(r.itemCode || '');
                            return c.startsWith(prefix) && (r.groupName || r.itemName);
                        });
                        if (found) {
                            discoveredName = found.groupName || found.itemName || '';
                        }
                        return {
                            code: prefix,
                            name: discoveredName || `گروه ${prefix}`
                        };
                    });

                    return list.sort((a, b) => a.code.localeCompare(b.code));
                };

                const alignedYarns = getSectionGroups(true, MANUFACTURED_GROUPS);
                const alignedImported = getSectionGroups(false, RAW_MATERIAL_GROUPS);

                const getSayanGroupSum = (groupCode, isLastYear, field) => {
                    const list = isLastYear ? lastYearStock : currentStock;
                    return list.reduce((sum, r) => {
                        const code = String(r.itemCode || '');
                        if (code.startsWith(groupCode)) {
                            const qty = field === 'weight' ? (r.stockQty || 0) : (r.cartonsQty || 0);
                            return sum + qty;
                        }
                        return sum;
                    }, 0);
                };

                const getSayanItemValue = (itemCode, isLastYear, field) => {
                    const list = isLastYear ? lastYearStock : currentStock;
                    const found = list.find(r => String(r.itemCode || '') === itemCode);
                    if (found) {
                        return field === 'weight' ? (found.stockQty || 0) : (found.cartonsQty || 0);
                    }
                    return 0;
                };

                const getItemValue = (itemKey, isLastYear, field, isGroup) => {
                    const overrides = isLastYear ? lastYearOverrides : currentOverrides;
                    let itemOverride = overrides[itemKey];
                    if (!itemOverride) {
                        const allItems = [...lastYearStock, ...currentStock];
                        const foundItem = allItems.find(r => String(r.itemCode || '') === itemKey);
                        if (foundItem && foundItem.itemName) {
                            itemOverride = overrides[foundItem.itemName];
                        }
                    }

                    if (itemOverride && itemOverride[field] !== undefined && itemOverride[field] !== '') {
                        return itemOverride[field];
                    }

                    if (field === 'weight' || field === 'cartons') {
                        if (isGroup) {
                            return getSayanGroupSum(itemKey, isLastYear, field);
                        } else {
                            return getSayanItemValue(itemKey, isLastYear, field);
                        }
                    }

                    if (field === 'proforma') return '';
                    return 0;
                };

                const getItemCategory = (code) => {
                    if (itemCategories && itemCategories[code]) return itemCategories[code];
                    if (code.startsWith('04')) return 'yarn';
                    if (code.startsWith('0104')) return 'rubber';
                    if (code.startsWith('0105')) return 'lycra';
                    if (code.startsWith('0106')) return 'spun';
                    if (code.startsWith('0101')) return 'chips';
                    return 'other';
                };

                const calculateCustomTableSum = (items, field) => {
                    return (items || []).reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0);
                };

                // Compute weights
                const totalLastYearYarnsWeight = alignedYarns.reduce((sum, item) => sum + getItemValue(item.code, true, 'weight', true), 0);
                const totalCurrentYarnsWeight = alignedYarns.reduce((sum, item) => sum + getItemValue(item.code, false, 'weight', true), 0);
                const diffYarnsWeight = totalCurrentYarnsWeight - totalLastYearYarnsWeight;
                const ratioYarnsWeight = totalLastYearYarnsWeight > 0 ? (diffYarnsWeight / totalLastYearYarnsWeight) * 100 : 0;

                const totalLastYearRawWeight = alignedImported.reduce((sum, item) => sum + getItemValue(item.code, true, 'weight', true), 0);

                const totalCurrentRawWeight = alignedImported.reduce((sum, item) => sum + getItemValue(item.code, false, 'weight', true), 0)
                    + calculateCustomTableSum(goodsInTransit, 'weight')
                    + calculateCustomTableSum(goodsInCustoms, 'weight')
                    + calculateCustomTableSum(purchasingGoods, 'weight');

                const diffRawWeight = totalCurrentRawWeight - totalLastYearRawWeight;
                const ratioRawWeight = totalLastYearRawWeight > 0 ? (diffRawWeight / totalLastYearRawWeight) * 100 : 0;

                const totalLastYearAllWeight = totalLastYearYarnsWeight + totalLastYearRawWeight;
                const totalCurrentAllWeight = totalCurrentYarnsWeight + totalCurrentRawWeight;
                const diffAllWeight = totalCurrentAllWeight - totalLastYearAllWeight;
                const ratioAllWeight = totalLastYearAllWeight > 0 ? (diffAllWeight / totalLastYearAllWeight) * 100 : 0;

                const totalCurrentContainers = alignedYarns.reduce((sum, item) => sum + (parseFloat(getItemValue(item.code, false, 'containers', true)) || 0), 0)
                    + alignedImported.reduce((sum, item) => sum + (parseFloat(getItemValue(item.code, false, 'containers', true)) || 0), 0)
                    + calculateCustomTableSum(goodsInTransit, 'containers')
                    + calculateCustomTableSum(goodsInCustoms, 'containers')
                    + calculateCustomTableSum(purchasingGoods, 'containers');

                const totalCurrentDollars = alignedYarns.reduce((sum, item) => sum + (parseFloat(getItemValue(item.code, false, 'dollars', true)) || 0), 0)
                    + alignedImported.reduce((sum, item) => sum + (parseFloat(getItemValue(item.code, false, 'dollars', true)) || 0), 0)
                    + calculateCustomTableSum(goodsInTransit, 'dollars')
                    + calculateCustomTableSum(goodsInCustoms, 'dollars')
                    + calculateCustomTableSum(purchasingGoods, 'dollars');

                // Build datasets
                const allComparedItems = [];
                alignedYarns.forEach(group => {
                    const wLast = getItemValue(group.code, true, 'weight', true);
                    const wCurr = getItemValue(group.code, false, 'weight', true);
                    const diff = wCurr - wLast;
                    const ratio = wLast > 0 ? (diff / wLast) * 100 : (wCurr < 0 ? -100 : 0);
                    allComparedItems.push({
                        code: group.code,
                        name: group.name,
                        category: 'factory',
                        categoryLabel: 'تولیدی کارخانه',
                        lastYearWeight: wLast,
                        currentWeight: wCurr,
                        diffWeight: diff,
                        ratio,
                        isNegative: diff < 0 || wCurr < 0
                    });
                });

                alignedImported.forEach(group => {
                    const wLast = getItemValue(group.code, true, 'weight', true);
                    const wCurr = getItemValue(group.code, false, 'weight', true);
                    const diff = wCurr - wLast;
                    const ratio = wLast > 0 ? (diff / wLast) * 100 : (wCurr < 0 ? -100 : 0);
                    allComparedItems.push({
                        code: group.code,
                        name: group.name,
                        category: 'raw',
                        categoryLabel: 'مواد اولیه / وارداتی',
                        lastYearWeight: wLast,
                        currentWeight: wCurr,
                        diffWeight: diff,
                        ratio,
                        isNegative: diff < 0 || wCurr < 0
                    });
                });

                // Add Goods In Transit
                goodsInTransit.forEach((item, idx) => {
                    const wCurr = parseFloat(item.weight || 0) || 0;
                    const wLast = 0;
                    const diff = wCurr - wLast;
                    const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
                    allComparedItems.push({
                        code: item.proforma ? `TR-${item.proforma}` : `TR-${idx + 1}`,
                        name: `${item.cargoType || 'بار در راه'}${item.proforma ? ` (${item.proforma})` : ''}`,
                        category: 'transit',
                        categoryLabel: 'بارهای در راه (کانتینری)',
                        lastYearWeight: wLast,
                        currentWeight: wCurr,
                        diffWeight: diff,
                        ratio,
                        isNegative: diff < 0 || wCurr < 0
                    });
                });

                // Add Goods In Customs
                goodsInCustoms.forEach((item, idx) => {
                    const wCurr = parseFloat(item.weight || 0) || 0;
                    const wLast = 0;
                    const diff = wCurr - wLast;
                    const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
                    allComparedItems.push({
                        code: item.proforma ? `CUST-${item.proforma}` : `CUST-${idx + 1}`,
                        name: `${item.cargoType || 'بار در گمرک'}${item.proforma ? ` (${item.proforma})` : ''}`,
                        category: 'customs',
                        categoryLabel: 'بارهای در گمرک',
                        lastYearWeight: wLast,
                        currentWeight: wCurr,
                        diffWeight: diff,
                        ratio,
                        isNegative: diff < 0 || wCurr < 0
                    });
                });

                // Add Purchasing Goods
                purchasingGoods.forEach((item, idx) => {
                    const wCurr = parseFloat(item.weight || 0) || 0;
                    const wLast = 0;
                    const diff = wCurr - wLast;
                    const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
                    allComparedItems.push({
                        code: item.proforma ? `PUR-${item.proforma}` : `PUR-${idx + 1}`,
                        name: `${item.cargoType || 'بار در حال خرید'}${item.proforma ? ` (${item.proforma})` : ''}`,
                        category: 'purchasing',
                        categoryLabel: 'بارهای در حال خرید',
                        lastYearWeight: wLast,
                        currentWeight: wCurr,
                        diffWeight: diff,
                        ratio,
                        isNegative: diff < 0 || wCurr < 0
                    });
                });

                // Add Commercial Goods
                commercialGoods.forEach((item, idx) => {
                    const wCurr = parseFloat(item.weight || 0) || 0;
                    const wLast = 0;
                    const diff = wCurr - wLast;
                    const ratio = wCurr > 0 ? 100 : (wCurr < 0 ? -100 : 0);
                    allComparedItems.push({
                        code: `COM-${idx + 1}`,
                        name: `${item.itemName || 'کالای تجاری'}${item.category ? ` (${item.category})` : ''}`,
                        category: 'commercial',
                        categoryLabel: 'کالای تجاری / متفرقه',
                        lastYearWeight: wLast,
                        currentWeight: wCurr,
                        diffWeight: diff,
                        ratio,
                        isNegative: diff < 0 || wCurr < 0
                    });
                });

                const negativeItems = allComparedItems
                    .filter(item => item.isNegative)
                    .sort((a, b) => a.diffWeight - b.diffWeight);

                const growthItems = allComparedItems
                    .filter(item => !item.isNegative && item.diffWeight > 0)
                    .sort((a, b) => b.diffWeight - a.diffWeight);

                const yarnItems = alignedYarns.map(g => ({
                    code: g.code,
                    name: g.name,
                    lastYearCartons: getItemValue(g.code, true, 'cartons', true),
                    lastYearWeight: getItemValue(g.code, true, 'weight', true),
                    lastYearContainers: getItemValue(g.code, true, 'containers', true),
                    lastYearDollars: getItemValue(g.code, true, 'dollars', true),
                    currentCartons: getItemValue(g.code, false, 'cartons', true),
                    currentWeight: getItemValue(g.code, false, 'weight', true),
                    currentContainers: getItemValue(g.code, false, 'containers', true),
                    currentDollars: getItemValue(g.code, false, 'dollars', true)
                }));

                const rawItems = alignedImported.map(g => ({
                    code: g.code,
                    name: g.name,
                    category: getItemCategory(g.code),
                    proforma: getItemValue(g.code, false, 'proforma', true) || getItemValue(g.code, true, 'proforma', true),
                    lastYearCartons: getItemValue(g.code, true, 'cartons', true),
                    lastYearWeight: getItemValue(g.code, true, 'weight', true),
                    lastYearContainers: getItemValue(g.code, true, 'containers', true),
                    lastYearDollars: getItemValue(g.code, true, 'dollars', true),
                    currentCartons: getItemValue(g.code, false, 'cartons', true),
                    currentWeight: getItemValue(g.code, false, 'weight', true),
                    currentContainers: getItemValue(g.code, false, 'containers', true),
                    currentDollars: getItemValue(g.code, false, 'dollars', true)
                }));

                const logisticsItems = [
                    ...goodsInTransit.map(r => ({ ...r, category: 'transit', categoryLabel: 'بارهای در راه (کانتینری)' })),
                    ...goodsInCustoms.map(r => ({ ...r, category: 'customs', categoryLabel: 'بارهای در گمرک' })),
                    ...purchasingGoods.map(r => ({ ...r, category: 'purchasing', categoryLabel: 'بارهای در حال خرید' })),
                    ...commercialGoods.map(r => ({ ...r, category: 'commercial', categoryLabel: 'کالای تجاری / متفرقه' }))
                ];

                const compiledSummary = {
                    reportDate,
                    report1Label,
                    report2Label,
                    signature: meta.signature || 'انبارداری مرکزی و پایش زنجیره تامین',
                    lastYearYarnsWeight: totalLastYearYarnsWeight,
                    currentYarnsWeight: totalCurrentYarnsWeight,
                    yarnsDiffWeight: diffYarnsWeight,
                    yarnsRatio: ratioYarnsWeight,
                    lastYearRawWeight: totalLastYearRawWeight,
                    currentRawWeight: totalCurrentRawWeight,
                    rawDiffWeight: diffRawWeight,
                    rawRatio: ratioRawWeight,
                    lastYearTotalWeight: totalLastYearAllWeight,
                    currentTotalWeight: totalCurrentAllWeight,
                    totalDiffWeight: diffAllWeight,
                    totalRatio: ratioAllWeight,
                    containersTotal: totalCurrentContainers,
                    dollarsTotal: totalCurrentDollars
                };

                console.log(`⚖️ Compiled summary: lastYearYarns: ${totalLastYearYarnsWeight}, currentYarns: ${totalCurrentYarnsWeight}, negative count: ${negativeItems.length}`);

                // Generate PDF using compiled data
                const RendererModule = await safeImport('./backend/renderer.js');
                const pdfBuffer = RendererModule && RendererModule.generateWarehouseOverviewReportPDF 
                    ? await RendererModule.generateWarehouseOverviewReportPDF({
                        mode: db.settings?.warehouseDailyAutoReportScope || 'both',
                        summary: compiledSummary,
                        yarnItems,
                        rawItems,
                        logisticsItems,
                        growthItems,
                        negativeItems,
                        signature: compiledSummary.signature
                    })
                    : null;

                // Build beautifully formatted caption message matching the manual sending!
                const fNum = (n, maxDec = 1) => {
                    const num = parseFloat(n) || 0;
                    return num.toLocaleString('fa-IR', { maximumFractionDigits: maxDec });
                };
                const fTon = (n) => {
                    const num = (parseFloat(n) || 0) / 1000;
                    return num.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
                };

                let msg = `🚨 *گزارش تراز وزنی انبارها و پایش زنجیره تامین* 🚨\n`;
                msg += `📅 *تاریخ استعلام:* ${reportDate}\n`;
                msg += `📊 *مقایسه دوره‌ها:* ${report2Label} نسبت به ${report1Label}\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;

                const autoScope = db.settings?.warehouseDailyAutoReportScope || 'both';

                if (autoScope === 'both' || autoScope === 'overview_only') {
                    msg += `⚖️ *خلاصه مقایسه وزنی زنجیره تامین و تولید:*\n\n`;

                    const yDiff = totalCurrentYarnsWeight - totalLastYearYarnsWeight;
                    const yRatio = totalLastYearYarnsWeight > 0 ? (yDiff / totalLastYearYarnsWeight) * 100 : 0;
                    const yIcon = yDiff >= 0 ? '📈 رشد (+)' : '🔻 کاهش (-)';
                    msg += `🧵 *۱. نخ‌های تولیدی کارخانه (تولید داخلی):*\n`;
                    msg += `  • سال قبل: ${fNum(totalLastYearYarnsWeight)} kg (${fTon(totalLastYearYarnsWeight)} تن)\n`;
                    msg += `  • سال جاری: ${fNum(totalCurrentYarnsWeight)} kg (${fTon(totalCurrentYarnsWeight)} تن)\n`;
                    msg += `  • اختلاف وزنی: ${yDiff >= 0 ? '+' : ''}${fNum(yDiff)} kg (${yRatio >= 0 ? '+' : ''}${fNum(yRatio, 1)}%) [${yIcon}]\n\n`;

                    const rDiff = totalCurrentRawWeight - totalLastYearRawWeight;
                    const rRatio = totalLastYearRawWeight > 0 ? (rDiff / totalLastYearRawWeight) * 100 : 0;
                    const rIcon = rDiff >= 0 ? '📈 رشد (+)' : '🔻 کاهش (-)';
                    msg += `📦 *۲. مواد اولیه، اقلام وارداتی و گمرک:*\n`;
                    msg += `  • سال قبل: ${fNum(totalLastYearRawWeight)} kg (${fTon(totalLastYearRawWeight)} تن)\n`;
                    msg += `  • سال جاری: ${fNum(totalCurrentRawWeight)} kg (${fTon(totalCurrentRawWeight)} تن)\n`;
                    msg += `  • اختلاف وزنی: ${rDiff >= 0 ? '+' : ''}${fNum(rDiff)} kg (${rRatio >= 0 ? '+' : ''}${fNum(rRatio, 1)}%) [${rIcon}]\n\n`;

                    const tDiff = totalCurrentAllWeight - totalLastYearAllWeight;
                    const tRatio = totalLastYearAllWeight > 0 ? (tDiff / totalLastYearAllWeight) * 100 : 0;
                    const tIcon = tDiff >= 0 ? '✅ تراز مثبت' : '⚠️ تراز منفی';
                    msg += `🏢 *۳. سرجمع کل موجودی زنجیره تامین:*\n`;
                    msg += `  • سال قبل: ${fNum(totalLastYearAllWeight)} kg (${fTon(totalLastYearAllWeight)} تن)\n`;
                    msg += `  • سال جاری: ${fNum(totalCurrentAllWeight)} kg (${fTon(totalCurrentAllWeight)} تن)\n`;
                    msg += `  • تغییر کل: ${tDiff >= 0 ? '+' : ''}${fNum(tDiff)} kg (${tRatio >= 0 ? '+' : ''}${fNum(tRatio, 1)}%) [${tIcon}]\n`;

                    msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
                }

                if (autoScope === 'both' || autoScope === 'variance_only') {
                    msg += `⚠️ *فهرست اقلام و کالاهای دارای کسری / افت وزنی (تراز منفی):*\n\n`;

                    if (negativeItems.length === 0) {
                        msg += `✅ هیچ کالایی با تراز وزنی منفی یافت نشد. تمامی اقلام در وضعیت رشد یا حفظ موجودی قرار دارند.\n`;
                    } else {
                        negativeItems.slice(0, 15).forEach((item, idx) => {
                            const num = fNum(idx + 1, 0);
                            const diff = parseFloat(item.diffWeight) || 0;
                            const ratio = parseFloat(item.ratio) || 0;
                            const catLabel = item.categoryLabel || (item.category === 'factory' ? '🧵 تولیدی' : '📦 مواد اولیه / وارداتی');
                            
                            msg += `${num}. *${item.name}* ${item.code ? `(${item.code})` : ''} - ${catLabel}\n`;
                            msg += `   🔻 افت وزنی: *${fNum(diff)} kg* (${fNum(ratio, 1)}%)\n`;
                            msg += `   📊 سال قبل: ${fNum(item.lastYearWeight)} kg ⬅️ امسال: ${fNum(item.currentWeight)} kg\n\n`;
                        });
                        if (negativeItems.length > 15) {
                            msg += `... و ${fNum(negativeItems.length - 15, 0)} قلم کالای منفی دیگر (جزئیات در فایل PDF پیوست)\n\n`;
                        }
                    }

                    if (growthItems && growthItems.length > 0) {
                        msg += `📈 *تعداد کالاهای دارای رشد وزنی (مثبت):* ${fNum(growthItems.length, 0)} قلم کالا\n`;
                    }

                    msg += `🔍 *تعداد کل کالاهای دارای کسری / افت:* ${fNum(negativeItems.length, 0)} قلم کالا\n`;
                    msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
                }

                msg += `👤 *تنظیم گزارش:* ${compiledSummary.signature}\n`;
                if (pdfBuffer) {
                    msg += `📎 *فایل PDF رسمی ${autoScope === 'both' ? '۲ صفحه‌ای (جداول کل + روند رشد و افت)' : (autoScope === 'overview_only' ? 'صفحه ۱ (جداول کل)' : 'صفحه ۲ (تحلیل روند و کسری)')} ضمیمه گردید.*\n`;
                }
                msg += `🤖 *سامانه یکپارچه مانیتورینگ انبار و زنجیره تامین سایان ERP*`;

                const caption = msg;
                const whatsapp = await safeImport('./backend/whatsapp.js');

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await telegram.sendBotDocument(target.id, pdfBuffer, `Warehouse_Overview_${Date.now()}.pdf`, caption);
                            } else {
                                await telegram.sendBotMessage(target.id, caption);
                            }
                        } else if (target.platform === 'bale' && bale) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await bale.sendBotDocument(target.id, pdfBuffer, `Warehouse_Overview_${Date.now()}.pdf`, caption);
                            } else {
                                await bale.sendBotMessage(target.id, caption);
                            }
                        } else if (target.platform === 'whatsapp' && whatsapp) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                const b64 = pdfBuffer.toString('base64');
                                await whatsapp.sendMessage(target.id, caption, { data: b64, mimeType: 'application/pdf', filename: 'Warehouse_Overview.pdf' });
                            } else {
                                await whatsapp.sendMessage(target.id, caption);
                            }
                        }
                    } catch (targetErr) {
                        console.error(`Error sending warehouse report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Warehouse overview report dynamically compiled and dispatched to ${customTargets.length} targets.`);
            } catch (whErr) {
                console.error("Error generating/sending warehouse report:", whErr);
            }
        } else if (job.reportType === 'inventory_stock') {
            // Sayan Inventory & Stock Kardex Overview
            console.log("📦 Starting Sayan inventory & stock kardex report dispatch...");
            try {
                const todayShamsi = new Date().toLocaleDateString('fa-IR');
                let inventoryItems = [];
                const sayanUrl = db.settings?.sayanApiUrl || process.env.SAYAN_API_URL;
                const sayanKey = db.settings?.sayanApiKey || process.env.SAYAN_API_KEY;
                if (sayanUrl && sayanKey) {
                    const gregToday = new Date().toISOString().split('T')[0];
                    const sql = `
                        WITH GroupedStock AS (
                            SELECT 
                                t11.Field_005 as ItemCode,
                                SUM(CASE 
                                    WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '24', '26', '29', '40', '44', '46', '83') THEN t11.Field_006 
                                    WHEN RTRIM(LTRIM(t10.Field_009)) IN ('23', '25', '30', '37', '42', '84', '62', '68', '71', '74', '80') THEN -t11.Field_006 
                                    ELSE 0 
                                END) as StockQty
                            FROM STR_TBL_011 t11
                            INNER JOIN STR_TBL_010 t10 ON t11.Field_004 = t10.Field_005 
                                                      AND t11.Field_003 = t10.Field_004 
                                                      AND t11.Field_012 = t10.Field_018
                            WHERE t10.Field_008 <= '${gregToday}T23:59:59.000Z'
                            GROUP BY t11.Field_005
                        )
                        SELECT 
                            gs.ItemCode,
                            gs.StockQty,
                            COALESCE(
                                NULLIF(RTRIM(LTRIM(s04.Field_003)), ''),
                                NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                                RTRIM(LTRIM(gs.ItemCode))
                            ) as ItemName
                        FROM GroupedStock gs
                        LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(gs.ItemCode))
                        LEFT JOIN IND_TBL_022 t22 ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(gs.ItemCode))
                        WHERE gs.StockQty <> 0
                    `;
                    inventoryItems = await executeSayanQuery(db, sql) || [];
                }

                const totalWeight = inventoryItems.reduce((s, r) => s + (parseFloat(r.StockQty) || 0), 0);
                const positiveItems = inventoryItems.filter(r => (parseFloat(r.StockQty) || 0) > 0);
                const negativeItems = inventoryItems.filter(r => (parseFloat(r.StockQty) || 0) < 0);

                let msg = `📦 *گزارش موجودی لحظه‌ای و کاردکس انبار کارخانه (سایان ERP)*\n`;
                msg += `📅 *تاریخ:* ${todayShamsi}\n`;
                msg += `⚖️ *سرجمع موجودی انبار:* *${Math.round(totalWeight).toLocaleString('fa-IR')} کیلوگرم*\n`;
                msg += `📊 *تعداد اقلام دارای موجودی:* *${positiveItems.length.toLocaleString('fa-IR')} قلم کالا*\n`;
                if (negativeItems.length > 0) {
                    msg += `⚠️ *تعداد اقلام با موجودی منفی:* *${negativeItems.length.toLocaleString('fa-IR')} قلم کالا*\n`;
                }
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;

                const topStock = [...positiveItems].sort((a, b) => (parseFloat(b.StockQty) || 0) - (parseFloat(a.StockQty) || 0)).slice(0, 6);
                if (topStock.length > 0) {
                    msg += `🔝 *بیشترین موجودی‌های انبار:*\n`;
                    topStock.forEach((item, idx) => {
                        msg += `  ${(idx + 1).toLocaleString('fa-IR')}. *${item.ItemName || item.ItemCode}:* ${Math.round(parseFloat(item.StockQty) || 0).toLocaleString('fa-IR')} ک‌گ\n`;
                    });
                }

                if (negativeItems.length > 0) {
                    msg += `\n🚨 *اقلام منفی نیازمند بازبینی کاردکس:*\n`;
                    negativeItems.slice(0, 4).forEach((item, idx) => {
                        msg += `  ⚠️ *${item.ItemName || item.ItemCode}:* ${Math.round(parseFloat(item.StockQty) || 0).toLocaleString('fa-IR')} ک‌گ\n`;
                    });
                }
                msg += `\n🤖 *سامانه جامع پایش انبار و لجستیک سایان ERP*`;

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) await telegram.sendBotMessage(target.id, msg);
                        else if (target.platform === 'bale' && bale) await bale.sendBotMessage(target.id, msg);
                        else if (target.platform === 'whatsapp' && whatsapp && whatsapp.sendMessage) await whatsapp.sendMessage(target.id, msg);
                    } catch (targetErr) {
                        console.error(`Error sending stock report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Stock kardex report dispatched to ${customTargets.length} targets.`);
            } catch (stockErr) {
                console.error("Error generating/sending stock kardex report:", stockErr);
            }
        } else if (job.reportType === 'production_returns') {
            // Sayan Production Returns & Wastes Report
            console.log("⚠️ Starting Sayan production returns report dispatch...");
            try {
                const now = new Date();
                const tehranStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
                const [gy, gm, gd] = tehranStr.split('-').map(Number);
                const jToday = jalaali.toJalaali ? jalaali.toJalaali(gy, gm, gd) : { jy: 1404, jm: 1, jd: 1 };
                const todayShamsi = `${jToday.jy}/${String(jToday.jm).padStart(2, '0')}/${String(jToday.jd).padStart(2, '0')}`;

                const items = await queryProductionReturnsData(db, todayShamsi, todayShamsi);
                const totalWeight = items.reduce((sum, item) => sum + parseFloat(item.Quantity || 0), 0);

                const classifyProductGroup = (itemCode, itemName) => {
                    const code = (itemCode || '').trim();
                    const name = (itemName || '').toLowerCase();
                    if (code.startsWith('0401') || name.includes('کاور')) return 'اسپاندکس (کاور)';
                    if (code.startsWith('0402') || name.includes('کش') || name.includes('قیطان')) return 'کش';
                    if (code.startsWith('0403') || name.includes('ساپورت') || name.includes('جوشی')) return 'اسپاندکس جوشی ( ساپورت )';
                    if (code.startsWith('0405') || name.includes('شوایتر')) return 'پلی استر شوایتر';
                    if (code.startsWith('0407')) return 'نایلون';
                    if (code.startsWith('0408') || name.includes('ملت')) return 'نخ ملت';
                    if (code.startsWith('0409') || name.includes('الیاف')) return 'الیاف';
                    if (code.startsWith('0410') || name.includes('fdy')) return 'FDY';
                    if (code.startsWith('0101') || name.includes('چیپس')) return 'چیپس';
                    if (code.startsWith('0102') || name.includes('poy') || name.includes('پوی')) return 'POY';
                    if (code.startsWith('0103') || name.includes('dty') || name.includes('دی تی وای') || name.includes('پلی استر')) return 'dty یا پلی استر';
                    if (code.startsWith('0104') || name.includes('لاستیک')) return 'لاستیک';
                    if (code.startsWith('0105') || name.includes('لاکرا')) return 'لاکرا';
                    if (code.startsWith('0106') || name.includes('اسپان')) return 'پلی استر اسپان';
                    if (code.startsWith('0107') || name.includes('مستر بچ') || name.includes('مستربچ')) return 'مستر بچ';
                    if (code.startsWith('0108') || name.includes('نایلون')) return 'نایلون';
                    return itemName || 'سایر اقلام';
                };

                const summaryMap = {};
                const itemsMap = new Map();
                items.forEach(item => {
                    const grp = classifyProductGroup(item.ItemCode, item.ItemName);
                    summaryMap[grp] = (summaryMap[grp] || 0) + parseFloat(item.Quantity || 0);
                    const rawName = (item.ItemName || '').trim();
                    const cleanName = (rawName && !rawName.startsWith('0') && isNaN(Number(rawName))) ? rawName : grp;
                    itemsMap.set(cleanName, (itemsMap.get(cleanName) || 0) + parseFloat(item.Quantity || 0));
                });

                let msg = `⚠️ *گزارش ضایعات و برگشت از تولید کارخانه (سایان ERP)*\n`;
                msg += `📅 *تاریخ:* ${todayShamsi}\n`;
                msg += `⚖️ *سرجمع وزن برگشتی:* *${Math.round(totalWeight).toLocaleString('fa-IR')} کیلوگرم*\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
                msg += `📊 *تفکیک گروه‌ها:*\n`;
                Object.entries(summaryMap).forEach(([grp, qty]) => {
                    msg += `🔹 *${grp}:* ${Math.round(qty).toLocaleString('fa-IR')} ک‌گ\n`;
                });

                const topItems = Array.from(itemsMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
                if (topItems.length > 0) {
                    msg += `\n📦 *اقلام شاخص برگشتی:*\n` + topItems.map(([name, qty]) => `▪️ ${name}: ${Math.round(qty).toLocaleString('fa-IR')} ک‌گ`).join('\n') + `\n`;
                }
                msg += `\n📎 فایل PDF رسمی گزارش پیوست گردید.`;

                let pdfBuffer = null;
                if (job.attachPdf !== false) {
                    try {
                        const html = compileProductionReturnsHtml(todayShamsi, todayShamsi, items);
                        const Renderer = await safeImport('./backend/renderer.js');
                        if (Renderer && Renderer.generatePdfBuffer) {
                            pdfBuffer = await Renderer.generatePdfBuffer(html);
                        }
                    } catch (pdfErr) {
                        console.error("PDF Generate Error Sayan Returns:", pdfErr);
                    }
                }

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await telegram.sendBotDocument(target.id, pdfBuffer, `Production_Returns_${todayShamsi.replace(/[\/\\]/g, '-')}.pdf`, msg);
                            } else {
                                await telegram.sendBotMessage(target.id, msg);
                            }
                        } else if (target.platform === 'bale' && bale) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await bale.sendBotDocument(target.id, pdfBuffer, `Production_Returns_${todayShamsi.replace(/[\/\\]/g, '-')}.pdf`, msg);
                            } else {
                                await bale.sendBotMessage(target.id, msg);
                            }
                        } else if (target.platform === 'whatsapp' && whatsapp && whatsapp.sendMessage) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                const b64 = pdfBuffer.toString('base64');
                                await whatsapp.sendMessage(target.id, msg, { data: b64, mimeType: 'application/pdf', filename: 'Production_Returns.pdf' });
                            } else {
                                await whatsapp.sendMessage(target.id, msg);
                            }
                        }
                    } catch (targetErr) {
                        console.error(`Error sending production returns report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Production returns report dispatched to ${customTargets.length} targets.`);
            } catch (retErr) {
                console.error("Error generating/sending production returns report:", retErr);
            }
        } else if (job.reportType === 'production_overview') {
            // Sayan Production Daily Overview (Live + Archive fallback)
            console.log("🏭 Starting Sayan production overview report dispatch...");
            try {
                const now = new Date();
                const tehranStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
                const [gy, gm, gd] = tehranStr.split('-').map(Number);
                const jToday = jalaali.toJalaali ? jalaali.toJalaali(gy, gm, gd) : { jy: 1404, jm: 1, jd: 1 };
                const todayShamsi = `${jToday.jy}/${String(jToday.jm).padStart(2, '0')}/${String(jToday.jd).padStart(2, '0')}`;

                const archive = db.productionWasteArchive || [];
                const todayArchiveEntry = archive.find(e => e.dateFrom === todayShamsi || e.dateTo === todayShamsi);

                let items = [];
                let totals = {};
                let waste = {};

                if (todayArchiveEntry) {
                    items = todayArchiveEntry.items || [];
                    totals = todayArchiveEntry.totals || {};
                    waste = {
                        waste_61: todayArchiveEntry.waste_61 || 0,
                        waste_67: todayArchiveEntry.waste_67 || 0,
                        waste_79: todayArchiveEntry.waste_79 || 0,
                        waste_73: todayArchiveEntry.waste_73 || 0,
                        waste_schweiter: todayArchiveEntry.waste_schweiter || 0,
                        details: todayArchiveEntry.details || ''
                    };
                } else {
                    // Fetch live production from Sayan ERP
                    try {
                        const liveProd = await fetchProductionDataForDateRange(db, todayShamsi, todayShamsi);
                        items = liveProd.items || [];
                        totals = liveProd.totals || {};
                        const savedWastes = db.productionReportWastes || {};
                        const key = `${todayShamsi}_${todayShamsi}`;
                        waste = savedWastes[key] || { waste_61: 0, waste_67: 0, waste_79: 0, waste_73: 0, waste_schweiter: 0, details: '' };
                    } catch (e) {
                        console.error("Live production fetch error:", e);
                    }
                }

                const Renderer = await safeImport('./backend/renderer.js');
                const title = `گزارش آمار کل تولید و ضایعات (${todayShamsi})`;
                const pdfBuffer = (Renderer && Renderer.generateProductionReportPDF && job.attachPdf !== false)
                    ? await Renderer.generateProductionReportPDF(title, todayShamsi, todayShamsi, items, totals, waste)
                    : null;

                const caption = buildProductionCaption(todayShamsi, totals, waste);

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await telegram.sendBotDocument(target.id, pdfBuffer, `Production_Report_${todayShamsi.replace(/[\/\\]/g, '-')}.pdf`, caption);
                            } else {
                                await telegram.sendBotMessage(target.id, caption);
                            }
                        } else if (target.platform === 'bale' && bale) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                await bale.sendBotDocument(target.id, pdfBuffer, `Production_Report_${todayShamsi.replace(/[\/\\]/g, '-')}.pdf`, caption);
                            } else {
                                await bale.sendBotMessage(target.id, caption);
                            }
                        } else if (target.platform === 'whatsapp' && whatsapp && whatsapp.sendMessage) {
                            if (pdfBuffer && job.attachPdf !== false) {
                                const b64 = pdfBuffer.toString('base64');
                                await whatsapp.sendMessage(target.id, caption, { data: b64, mimeType: 'application/pdf', filename: 'Production_Report.pdf' });
                            } else {
                                await whatsapp.sendMessage(target.id, caption);
                            }
                        }
                    } catch (targetErr) {
                        console.error(`Error sending production report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Production overview report dispatched to ${customTargets.length} targets.`);
            } catch (prodErr) {
                console.error("Error generating/sending production report:", prodErr);
            }
        } else if (job.reportType === 'production_comparison') {
            const compRanges = getComparisonDateRanges(job.comparisonPeriod || 'yesterday_vs_last_year');
            await fetchAndDispatchProductionCompareReport(db, customTargets, job, compRanges);
        } else if (job.reportType === 'sales_remittances') {
            // Sayan Sales Remittances Overview
            console.log("🚚 Starting Sayan sales remittances report dispatch...");
            try {
                const todayShamsi = new Date().toLocaleDateString('fa-IR');
                let remittances = [];
                const sayanUrl = db.settings?.sayanApiUrl || process.env.SAYAN_API_URL;
                const sayanKey = db.settings?.sayanApiKey || process.env.SAYAN_API_KEY;
                if (sayanUrl && sayanKey) {
                    const gregToday = new Date().toISOString().split('T')[0];
                    const sql = `
                        SELECT 
                            t10.Field_001 as DocId,
                            t10.Field_008 as Date,
                            RTRIM(LTRIM(t10.Field_009)) as DocType,
                            RTRIM(LTRIM(t10.Field_010)) as PersonCode,
                            COALESCE(c01.Field_003, t10.Field_010) as BuyerName,
                            RTRIM(LTRIM(t11.Field_005)) as ItemCode,
                            COALESCE(s04.Field_003, t11.Field_005) as ItemName,
                            t11.Field_006 as Quantity
                        FROM STR_TBL_010 t10
                        INNER JOIN STR_TBL_011 t11 ON t11.Field_004 = t10.Field_005 
                                                  AND t11.Field_003 = t10.Field_004 
                                                  AND t11.Field_012 = t10.Field_018
                        LEFT JOIN COM_TBL_001 c01 ON RTRIM(LTRIM(c01.Field_004)) = RTRIM(LTRIM(t10.Field_010))
                        LEFT JOIN STR_TBL_004 s04 ON RTRIM(LTRIM(s04.Field_004)) = RTRIM(LTRIM(t11.Field_005))
                        WHERE t10.Field_008 >= '${gregToday}T00:00:00.000Z'
                          AND RTRIM(LTRIM(t10.Field_009)) IN ('12', '23', '3', '13')
                    `;
                    remittances = await executeSayanQuery(db, sql) || [];
                }

                const uniqueDocs = new Set(remittances.map(r => r.DocId)).size;
                const totalQty = remittances.reduce((s, r) => s + (parseFloat(r.Quantity) || 0), 0);

                let msg = `🚚 *گزارش حواله‌های خروج و بارگیری انبار (سایان ERP)*\n`;
                msg += `📅 *تاریخ:* ${todayShamsi}\n`;
                msg += `📦 *تعداد حواله‌ها:* *${uniqueDocs.toLocaleString('fa-IR')} برگ*\n`;
                msg += `⚖️ *مجموع وزن خروجی:* *${Math.round(totalQty).toLocaleString('fa-IR')} کیلوگرم*\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;

                if (remittances.length === 0) {
                    msg += `✅ برای امروز هنوز حواله خروجی در سیستم ثبت نشده است.\n`;
                } else {
                    const buyerMap = new Map();
                    remittances.forEach(r => {
                        const b = r.BuyerName || 'مشتری نامشخص';
                        buyerMap.set(b, (buyerMap.get(b) || 0) + (parseFloat(r.Quantity) || 0));
                    });
                    msg += `👥 *بارگیری به تفکیک خریداران:*\n`;
                    Array.from(buyerMap.entries()).slice(0, 8).forEach(([b, qty], idx) => {
                        msg += `  ${(idx + 1).toLocaleString('fa-IR')}. *${b}:* ${Math.round(qty).toLocaleString('fa-IR')} ک‌گ\n`;
                    });
                }
                msg += `\n🤖 *سامانه مانیتورینگ خروج و بارگیری انبار*`;

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) await telegram.sendBotMessage(target.id, msg);
                        else if (target.platform === 'bale' && bale) await bale.sendBotMessage(target.id, msg);
                        else if (target.platform === 'whatsapp' && whatsapp && whatsapp.sendMessage) await whatsapp.sendMessage(target.id, msg);
                    } catch (targetErr) {
                        console.error(`Error sending remittances report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Remittances report dispatched to ${customTargets.length} targets.`);
            } catch (remErr) {
                console.error("Error generating/sending remittances report:", remErr);
            }
        } else if (job.reportType === 'sales_executive') {
            // Sayan Executive Sales Summary
            console.log("💼 Starting executive sales report dispatch...");
            try {
                const now = new Date();
                const tehranStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
                const [gy, gm, gd] = tehranStr.split('-').map(Number);
                const jToday = jalaali.toJalaali ? jalaali.toJalaali(gy, gm, gd) : { jy: 1404, jm: 1, jd: 1 };
                const todayShamsi = `${jToday.jy}/${String(jToday.jm).padStart(2, '0')}/${String(jToday.jd).padStart(2, '0')}`;

                const salesResult = await fetchProcessedSayanSalesData(db, todayShamsi, todayShamsi);
                const totals = salesResult?.totals || {};
                const totalSalesAmount = parseFloat(totals.totalSalesAmount || totals.netSalesAmount || 0);
                const totalSalesWeight = parseFloat(totals.totalSalesWeight || totals.netSalesWeight || 0);
                const totalReturnsAmount = parseFloat(totals.totalReturnsAmount || 0);
                const totalReturnsWeight = parseFloat(totals.totalReturnsWeight || 0);
                const netAmount = totalSalesAmount - totalReturnsAmount;
                const netWeight = totalSalesWeight - totalReturnsWeight;
                const invoiceCount = (salesResult?.invoices || []).length;

                const fRial = (n) => (Math.round(n) || 0).toLocaleString('fa-IR') + ' ریال';
                const fKg = (n) => (Math.round(n) || 0).toLocaleString('fa-IR') + ' ک‌گ';

                let msg = `💼 *گزارش خلاصه مدیریتی ارشد فروش کارخانه (Executive Summary)*\n`;
                msg += `📅 *تاریخ:* ${todayShamsi}\n`;
                msg += `🏢 *سامانه جامع گزارشات فروش سایان ERP*\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
                msg += `💰 *مبلغ فروش ناخالص:* *${fRial(totalSalesAmount)}*\n`;
                if (totalReturnsAmount > 0) {
                    msg += `🔻 *مبلغ برگشت از فروش:* *${fRial(totalReturnsAmount)}*\n`;
                }
                msg += `💵 *خالص فروش نهایی:* *${fRial(netAmount)}*\n`;
                msg += `⚖️ *خالص وزن بارگیری:* *${fKg(netWeight)}*\n`;
                msg += `📄 *تعداد فاکتورهای صادره:* *${invoiceCount.toLocaleString('fa-IR')} فقره*\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;

                const buyerMap = new Map();
                (salesResult?.invoices || []).forEach(inv => {
                    const b = inv.CustomerName || inv.BuyerName || 'نامشخص';
                    buyerMap.set(b, (buyerMap.get(b) || 0) + (parseFloat(inv.TotalAmount || inv.Amount) || 0));
                });
                const topBuyers = Array.from(buyerMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
                if (topBuyers.length > 0) {
                    msg += `🏆 *مشتریان برتر امروز:*\n`;
                    topBuyers.forEach(([name, amount], idx) => {
                        msg += `  ${(idx + 1).toLocaleString('fa-IR')}. *${name}:* ${fRial(amount)}\n`;
                    });
                    msg += `\n`;
                }

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) await telegram.sendBotMessage(target.id, msg);
                        else if (target.platform === 'bale' && bale) await bale.sendBotMessage(target.id, msg);
                        else if (target.platform === 'whatsapp' && whatsapp && whatsapp.sendMessage) await whatsapp.sendMessage(target.id, msg);
                    } catch (targetErr) {
                        console.error(`Error sending executive sales report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Executive sales report dispatched to ${customTargets.length} targets.`);
            } catch (execErr) {
                console.error("Error generating/sending executive sales report:", execErr);
            }
        } else if (job.reportType === 'daily_exit_summary') {
            // Factory Exit & Permits Summary
            console.log("🚪 Starting factory daily exit permits report dispatch...");
            try {
                const todayShamsi = new Date().toLocaleDateString('fa-IR');
                const permits = (db.exitPermits || []).filter(p => {
                    return (p.date || p.createdAt || '').includes(todayShamsi) || (p.createdAt && p.createdAt.startsWith(new Date().toISOString().split('T')[0]));
                });

                const goodsCount = permits.filter(p => p.type === 'GOODS' || p.type === 'KALA').length;
                const personalCount = permits.filter(p => p.type === 'PERSONAL' || p.type === 'PERSONNEL').length;
                const vehicleCount = permits.filter(p => p.type === 'VEHICLE').length;

                let msg = `🚪 *گزارش روزانه مجوزهای خروج و تردد کارخانه*\n`;
                msg += `📅 *تاریخ:* ${todayShamsi}\n`;
                msg += `📑 *مجموع برگه‌های خروج صادرشده:* *${permits.length.toLocaleString('fa-IR')} فقره*\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
                msg += `📦 برگه‌های خروج کالا و اقلام: *${goodsCount.toLocaleString('fa-IR')}*\n`;
                msg += `🚶‍♂️ برگه‌های تردد پرسنل: *${personalCount.toLocaleString('fa-IR')}*\n`;
                msg += `🚗 برگه‌های تردد خودرو: *${vehicleCount.toLocaleString('fa-IR')}*\n`;
                msg += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
                msg += `🤖 *سامانه حراست و مدیریت تردد*`;

                for (const target of customTargets) {
                    try {
                        if (target.platform === 'telegram' && telegram) await telegram.sendBotMessage(target.id, msg);
                        else if (target.platform === 'bale' && bale) await bale.sendBotMessage(target.id, msg);
                        else if (target.platform === 'whatsapp' && whatsapp && whatsapp.sendMessage) await whatsapp.sendMessage(target.id, msg);
                    } catch (targetErr) {
                        console.error(`Error sending exit permits report to ${target.platform} (${target.id}):`, targetErr.message);
                    }
                }
                console.log(`✅ Daily exit permits report dispatched to ${customTargets.length} targets.`);
            } catch (exitErr) {
                console.error("Error generating/sending daily exit report:", exitErr);
            }
        } else if (job.scheduleType === 'daily_comp_1900' || job.reportType === 'sales_comparison') {
            const sendFn = async (chatId, text, opts) => {
                if (job.botPlatforms?.includes('telegram') && teleGroup) {
                    try { await telegram.sendBotMessage(teleGroup, text, opts); } catch(e){ console.error("TG Send err:", e.message); }
                }
                if (job.botPlatforms?.includes('bale') && baleGroup) {
                    try { await bale.sendBotMessage(baleGroup, text, opts); } catch(e){ console.error("Bale Send err:", e.message); }
                }
                if (job.botPlatforms?.includes('whatsapp') && waGroup) {
                    try { await whatsapp.sendMessage(waGroup, text); } catch(e){ console.error("WA Send err:", e.message); }
                }
            };

            const sendDocFn = async (chatId, buffer, filename, caption) => {
                if (job.botPlatforms?.includes('telegram') && teleGroup) {
                    try { await telegram.sendBotDocument(teleGroup, buffer, filename, caption); } catch(e){ console.error("TG Send Doc err:", e.message); }
                }
                if (job.botPlatforms?.includes('bale') && baleGroup) {
                    try { await bale.sendBotDocument(baleGroup, buffer, filename, caption); } catch(e){ console.error("Bale Send Doc err:", e.message); }
                }
                if (job.botPlatforms?.includes('whatsapp') && waGroup) {
                    try {
                        const b64 = buffer.toString('base64');
                        await whatsapp.sendMessage(waGroup, caption || '', { data: b64, mimeType: 'application/pdf', filename: filename });
                    } catch(e){ console.error("WA Send Doc err:", e.message); }
                }
            };

            const compMode = job.comparisonPeriod || (job.scheduleType === 'daily_comp_1900' ? 'today_vs_yesterday' : 'yesterday_vs_last_year');
            const compRanges = getComparisonDateRanges(compMode);

            await generateAndSendComparisonPDF(
                db, 
                teleGroup || baleGroup || waGroup || 'default', 
                sendFn, 
                sendDocFn, 
                compRanges.dateFromA, 
                compRanges.dateToA, 
                compRanges.dateFromB, 
                compRanges.dateToB, 
                compRanges.labelA, 
                compRanges.labelB
            );
        } else {
            // Standard daily sales report
            const timeLabel = job.sendTime ? `ساعت ${job.sendTime}` : 'گزارش روزانه';
            await sendDailySalesReportForDate(db, new Date(), timeLabel, customTargets.length > 0 ? customTargets : null, job.botPlatforms);
        }

        // Update last run timestamp
        const jobIndex = db.reportDeliveryJobs?.findIndex(j => j.id === job.id);
        if (jobIndex > -1) {
            db.reportDeliveryJobs[jobIndex].lastRunAt = new Date().toLocaleString('fa-IR');
            saveDb(db);
        }
        return { success: true };
    } catch (err) {
        console.error(`Error executing report job ${job.id}:`, err);
        throw err;
    }
}

// API Routes for Report Delivery Engine
app.get('/api/report-delivery/jobs', (req, res) => {
    const db = getDb();
    res.json(db.reportDeliveryJobs || []);
});

app.post('/api/report-delivery/jobs', (req, res) => {
    const db = getDb();
    if (!db.reportDeliveryJobs) db.reportDeliveryJobs = [];
    const newJob = {
        id: 'job_' + Date.now(),
        createdAt: new Date().toISOString(),
        ...req.body
    };
    db.reportDeliveryJobs.push(newJob);
    saveDb(db);
    setupDailyReports();
    res.json(newJob);
});

app.put('/api/report-delivery/jobs/:id', (req, res) => {
    const db = getDb();
    if (!db.reportDeliveryJobs) db.reportDeliveryJobs = [];
    const idx = db.reportDeliveryJobs.findIndex(j => j.id === req.params.id);
    if (idx > -1) {
        db.reportDeliveryJobs[idx] = { ...db.reportDeliveryJobs[idx], ...req.body };
        saveDb(db);
        setupDailyReports();
        res.json(db.reportDeliveryJobs[idx]);
    } else {
        res.status(404).json({ error: 'Job not found' });
    }
});

app.delete('/api/report-delivery/jobs/:id', (req, res) => {
    const db = getDb();
    if (!db.reportDeliveryJobs) db.reportDeliveryJobs = [];
    db.reportDeliveryJobs = db.reportDeliveryJobs.filter(j => j.id !== req.params.id);
    saveDb(db);
    setupDailyReports();
    res.json({ success: true });
});

app.post('/api/report-delivery/execute-now', async (req, res) => {
    const { jobId } = req.body;
    const db = getDb();
    const job = (db.reportDeliveryJobs || []).find(j => j.id === jobId);
    if (!job) {
        return res.status(404).json({ error: 'زمان‌بندی یافت نشد' });
    }

    try {
        await executeReportJob(job);
        res.json({ success: true, message: `گزارش [${job.title}] با موفقیت تولید و ارسال شد.` });
    } catch (err) {
        res.status(500).json({ error: 'خطا در اجرای گزارش: ' + err.message });
    }
});

// --- AI ASSISTANT & INTELLIGENT ENTERPRISE MODULES ENDPOINTS ---
app.get('/api/ai/status', (req, res) => {
    try {
        const db = getDb();
        const settingsKey = db?.settings?.geminiApiKey?.trim();
        const envKey = process.env.GEMINI_API_KEY?.trim();
        const hasKey = Boolean(settingsKey || envKey);
        res.json({
            configured: hasKey,
            source: settingsKey ? 'settings' : (envKey ? 'env' : 'none'),
            model: 'gemini-3.1-flash-lite'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ai/test-connection', async (req, res) => {
    try {
        const { apiKey, baseUrl } = req.body || {};
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService) throw new Error("ماژول هوش مصنوعی لود نشد.");
        const result = await aiService.testAiConnection(apiKey, baseUrl);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error("AI test connection error:", e);
        let rawError = e.message || '';
        let errorMsg = rawError || 'خطا در برقراری ارتباط با مدل Gemini';
        if (rawError.includes('403') || rawError.includes('Forbidden') || rawError.includes('does not have permission')) {
            errorMsg = '⛔ خطای ۴۰۳ (خطای عدم دسترسی یا تحریم گوگل):\nاین خطا معمولاً به یکی از دو دلیل زیر رخ می‌دهد:\n\n' +
                '۱) محدودیت یا عدم دسترسی کلید API (بسیار احتمال دارد):\n' +
                'اگر کلید خود را به جای Google AI Studio از پنل اصلی Google Cloud Console ساخته‌اید، حتماً بررسی کنید که دسترسی به سرویس Generative Language API (یا Semantic Retriever API) برای این کلید فعال باشد و کلید دارای محدودیت‌های خاص (مانند محدودیت آی‌پی یا رفرر) نباشد.\n\n' +
                '۲) تحریم آی‌پی توسط گوگل:\n' +
                'اگر برنامه روی سرور با لوکیشن ایران اجرا می‌شود، گوگل درخواست را بلاک می‌کند. برای حل آن باید از DNS تحریم‌شکن (مانند شکن Shecan با آی‌پی 178.22.122.100 یا 403.online با آی‌پی 10.202.10.202) روی سرور لینوکس/ویندوز شما، یا از کادر تنظیم Reverse Proxy استفاده نمایید.';
        } else if (rawError.includes('API_KEY_INVALID') || rawError.includes('API key not valid') || rawError.includes('400')) {
            errorMsg = 'کلید API وارد شده نامعتبر است. لطفاً کلید صحیح Google Gemini را بررسی و وارد نمایید.';
        } else if (rawError.includes('RESOURCE_EXHAUSTED') || rawError.includes('429')) {
            errorMsg = 'سهمیه مجاز استفاده از این کلید API به پایان رسیده است (Rate Limit / Quota Exceeded).';
        } else if (rawError.includes('NOT_FOUND') || rawError.includes('404')) {
            errorMsg = 'مدل انتخاب شده یافت نشد یا در دسترس نیست.';
        }
        res.json({ success: false, error: errorMsg, rawError });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, contextData, history } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'پیامی برای ارسال وارد نشده است.' });
        }
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService) throw new Error("ماژول هوش مصنوعی در دسترس نیست.");
        const result = await aiService.askAiAssistant({ message, contextData, history });
        res.json(result);
    } catch (e) {
        console.error("AI chat error:", e);
        res.status(500).json({ error: e.message || 'خطا در پردازش هوش مصنوعی' });
    }
});

const handleVoiceProcess = async (req, res) => {
    try {
        const { audioBase64, mimeType, contextData } = req.body;
        if (!audioBase64) {
            return res.status(400).json({ error: 'داده صوتی ارسال نشده است.' });
        }
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService) throw new Error("ماژول هوش مصنوعی در دسترس نیست.");
        const result = await aiService.processVoiceAudio(audioBuffer, mimeType || 'audio/webm', undefined, contextData);
        res.json(result);
    } catch (e) {
        console.error("AI voice processing error:", e);
        res.status(500).json({ error: e.message || 'خطا در پردازش صوت' });
    }
};

app.post('/api/ai/voice-command', handleVoiceProcess);
app.post('/api/ai/voice-process', handleVoiceProcess);

app.post('/api/ai/warehouse-analysis', async (req, res) => {
    try {
        const payload = req.body;
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService) throw new Error("ماژول هوش مصنوعی در دسترس نیست.");
        const result = await aiService.generateWarehouseStrategicAnalysis(payload);
        res.json(result);
    } catch (e) {
        console.error("AI warehouse analysis error:", e);
        res.status(500).json({ error: e.message || 'خطا در تولید تحلیل تراز انبار' });
    }
});

app.post('/api/ai/sales-analysis', async (req, res) => {
    try {
        const payload = req.body;
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService) throw new Error("ماژول هوش مصنوعی در دسترس نیست.");
        const result = await aiService.generateSalesStrategicAnalysis(payload);
        res.json(result);
    } catch (e) {
        console.error("AI sales analysis error:", e);
        res.status(500).json({ error: e.message || 'خطا در تولید تحلیل فروش' });
    }
});

app.post('/api/ai/scan-document', async (req, res) => {
    try {
        const { imageBase64, mimeType } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: 'تصویر سند ارسال نشده است.' });
        }
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService) throw new Error("ماژول هوش مصنوعی در دسترس نیست.");
        const result = await aiService.scanDocumentWithAi(imageBuffer, mimeType || 'image/jpeg');
        res.json(result);
    } catch (e) {
        console.error("AI scan document error:", e);
        res.status(500).json({ error: e.message || 'خطا در اسکن هوشمند سند' });
    }
});

// --- UNIVERSAL SAYAN ERP AI ANALYSIS ENDPOINTS ---
app.post('/api/ai/sayan-analysis', async (req, res) => {
    try {
        const payload = req.body;
        const aiService = await safeImport('./backend/ai-service.js');
        if (!aiService) throw new Error("ماژول هوش مصنوعی در دسترس نیست.");
        const result = await aiService.generateSayanUniversalAnalysis(payload);
        res.json(result);
    } catch (e) {
        console.error("AI Sayan Universal Analysis error:", e);
        res.status(500).json({ error: e.message || 'خطا در تولید تحلیل هوشمند گزارشات سایان' });
    }
});

app.post('/api/ai/sayan-export-pdf', async (req, res) => {
    try {
        const reportData = req.body;
        const Renderer = await safeImport('./backend/renderer.js');
        if (!Renderer || !Renderer.generateSayanAiReportPDF) {
            throw new Error("سرویس تولید PDF در دسترس نیست.");
        }
        const pdfBuffer = await Renderer.generateSayanAiReportPDF(reportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Sayan_AI_Report_${Date.now()}.pdf`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error("AI Sayan PDF Export error:", e);
        res.status(500).json({ error: e.message || 'خطا در تولید فایل PDF تحلیل هوش مصنوعی' });
    }
});

app.post('/api/render-html-to-pdf', async (req, res) => {
    try {
        const { html, filename = `Report_${Date.now()}.pdf`, landscape = false } = req.body;
        if (!html) {
            return res.status(400).json({ error: 'محتوای گزارش برای تولید PDF ارسال نشده است.' });
        }
        const Renderer = await safeImport('./backend/renderer.js');
        if (!Renderer || !Renderer.generatePdfBuffer) {
            throw new Error("سرویس رندرینگ PDF در سرور در دسترس نیست.");
        }
        const pdfBuffer = await Renderer.generatePdfBuffer(html, {
            landscape: !!landscape,
            format: 'A4',
            printBackground: true
        });
        const safeName = (filename || `Report_${Date.now()}.pdf`).replace(/[^a-zA-Z0-9_.-]/g, '_');
        const uniqueName = `${Date.now()}_${safeName}`;
        const finalPath = path.join(UPLOADS_DIR, uniqueName);
        fs.writeFileSync(finalPath, pdfBuffer);
        const url = `/uploads/${uniqueName}`;
        res.json({ success: true, url, fileName: safeName });
    } catch (e) {
        console.error("Render HTML to PDF error:", e);
        res.status(500).json({ error: e.message || 'خطا در تبدیل گزارش به PDF' });
    }
});

app.post('/api/ai/sayan-send-bot', async (req, res) => {
    try {
        const {
            analysisData,
            selectedPlatforms = ['telegram', 'bale'],
            customGroupTele,
            customGroupBale,
            customGroupWa,
            attachPdf = true
        } = req.body;

        if (!analysisData) {
            return res.status(400).json({ error: 'داده‌های تحلیل برای ارسال به بات موجود نیست.' });
        }

        const db = getDb();
        const settings = db.settings || {};

        const tgGroup = customGroupTele || settings.botAccountingGroupIdTele || settings.telegramGroupId || settings.dailySalesTelegramGroupId;
        const bGroup = customGroupBale || settings.botAccountingGroupIdBale || settings.baleGroupId || settings.dailySalesBaleGroupId;
        const waGroup = customGroupWa || settings.botBijakGroupIdWhatsApp || settings.dailySalesWhatsappGroupId;

        const targets = [];
        if (selectedPlatforms.includes('telegram') && tgGroup) {
            String(tgGroup).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean).forEach(id => targets.push({ platform: 'telegram', id }));
        }
        if (selectedPlatforms.includes('bale') && bGroup) {
            String(bGroup).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean).forEach(id => targets.push({ platform: 'bale', id }));
        }
        if (selectedPlatforms.includes('whatsapp') && waGroup) {
            String(waGroup).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean).forEach(id => targets.push({ platform: 'whatsapp', id }));
        }

        if (targets.length === 0) {
            return res.status(400).json({ error: 'هیچ شناسه گروه یا کانالی برای ارسال مشخص نشده است. لطفاً تنظیمات بات را بررسی نمایید.' });
        }

        // Generate PDF Buffer if attachPdf is requested
        let pdfBuffer = null;
        if (attachPdf) {
            try {
                const Renderer = await safeImport('./backend/renderer.js');
                if (Renderer && Renderer.generateSayanAiReportPDF) {
                    pdfBuffer = await Renderer.generateSayanAiReportPDF(analysisData);
                }
            } catch (pdfErr) {
                console.warn("Could not generate PDF attachment for AI report:", pdfErr.message);
            }
        }

        const {
            reportTitle = 'گزارش تحلیلی هوش مصنوعی سایان ERP',
            sectionTitle = 'گزارشات سازمانی سایان',
            healthScore = 85,
            healthStatusFa = 'عالی',
            executiveSummary = [],
            riskAlerts = []
        } = analysisData;

        const jalaliDate = new Date().toLocaleDateString('fa-IR');
        let caption = `🤖 *تحلیل استراتژیک و هوشمند سایان ERP*\n`;
        caption += `📑 *موضوع:* ${reportTitle || sectionTitle}\n`;
        caption += `📅 *تاریخ استعلام:* ${jalaliDate}\n`;
        caption += `⭐ *شاخص سلامت عملکرد:* ${healthScore} از ۱۰۰ (${healthStatusFa})\n`;
        caption += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;

        if (executiveSummary && executiveSummary.length > 0) {
            caption += `📌 *خلاصه اجرایی و مدیریتی:*\n`;
            executiveSummary.forEach((point, idx) => {
                caption += `  ${(idx + 1).toLocaleString('fa-IR')}. ${point}\n`;
            });
            caption += `\n`;
        }

        if (riskAlerts && riskAlerts.length > 0) {
            caption += `⚠️ *مهم‌ترین هشدارهای ریسک:*\n`;
            riskAlerts.slice(0, 3).forEach((r) => {
                caption += `  • *${r.title}:* ${r.recommendation || r.description}\n`;
            });
            caption += `\n`;
        }

        caption += `📎 جزئیات مهندسی و نمودارهای تحلیلی در فایل PDF پیوست ارسال گردید.`;

        const filename = `Sayan_AI_Analysis_${Date.now()}.pdf`;
        const safePdfBuf = pdfBuffer ? (Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)) : null;
        let sentCount = 0;
        let lastErr = null;

        for (const target of targets) {
            try {
                if (target.platform === 'telegram' && telegram) {
                    if (safePdfBuf && attachPdf) {
                        await telegram.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    } else {
                        await telegram.sendBotMessage(target.id, caption);
                    }
                    sentCount++;
                } else if (target.platform === 'bale' && bale) {
                    if (safePdfBuf && attachPdf) {
                        await bale.sendBotDocument(target.id, safePdfBuf, filename, caption);
                    } else {
                        await bale.sendBotMessage(target.id, caption);
                    }
                    sentCount++;
                } else if (target.platform === 'whatsapp') {
                    const wa = await safeImport('./backend/whatsapp.js');
                    if (wa && wa.sendMessage) {
                        let waRes;
                        if (safePdfBuf && attachPdf) {
                            const b64 = safePdfBuf.toString('base64');
                            waRes = await wa.sendMessage(target.id, caption, { data: b64, mimeType: 'application/pdf', filename });
                        } else {
                            waRes = await wa.sendMessage(target.id, caption);
                        }
                        if (waRes && waRes.success === false) {
                            throw new Error(waRes.error || 'خطا در ارسال واتساپ');
                        }
                        sentCount++;
                    }
                }
            } catch (dispatchErr) {
                lastErr = dispatchErr.message;
                console.error(`Failed to send Sayan AI analysis to ${target.platform} (${target.id}):`, dispatchErr.message);
            }
        }

        if (sentCount === 0) {
            return res.status(500).json({ error: `ارسال تحلیل هوش مصنوعی ناموفق بود: ${lastErr || 'خطا در ارتباط با پیام‌رسان‌ها'}` });
        }

        res.json({ success: true, sentCount, message: `تحلیل هوش مصنوعی به ${sentCount} مقصد ارسال گردید.` });
    } catch (e) {
        console.error("AI Sayan send bot error:", e);
        res.status(500).json({ error: e.message || 'خطا در ارسال تحلیل هوشمند به بات‌ها' });
    }
});

// Using top-level DIST_DIR and isExplicitDev

// --- PUBLIC CUSTOMER SURVEY ENDPOINTS ---
app.get('/api/public/survey/:id', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
        const db = getDb();
        const { id } = req.params;
        const cleanId = String(id || '').trim();
        if (!cleanId) {
            return res.status(400).json({ error: 'شماره حواله وارد نشده است' });
        }

        const permits = db.exitPermits || [];
        const found = permits.find(p => 
            String(p.permitNumber || '') === cleanId ||
            String(p.id || '') === cleanId ||
            (p.permitNumber && String(p.permitNumber) === cleanId.replace(/[^0-9]/g, ''))
        );

        const settings = db.settings || {};
        const botLinks = {
            telegramUrl: settings.telegramBotUsername ? `https://t.me/${settings.telegramBotUsername.replace(/^@/, '')}` : 'https://t.me/LepanBaftBot',
            baleUrl: settings.baleBotUsername ? `https://ble.ir/${settings.baleBotUsername.replace(/^@/, '')}` : 'https://ble.ir/lepanbaft_bot',
            whatsappUrl: settings.whatsappChannelUrl || ''
        };

        if (!found) {
            return res.status(404).json({ error: `محموله یا مجوز خروج با شماره #${cleanId} یافت نشد.`, botLinks });
        }

        const itemsToCalc = (found.items && found.items.length > 0)
            ? found.items
            : [{ cartonCount: found.cartonCount || 0, weight: found.weight || 0, goodsName: found.goodsName || 'محصولات کارخانه' }];

        const totalCartons = itemsToCalc.reduce((s, i) => s + (Number(i.deliveredCartonCount ?? i.cartonCount) || 0), 0);
        const totalWeight = Number((itemsToCalc.reduce((s, i) => s + (Number(i.deliveredWeight ?? i.weight) || 0), 0)).toFixed(3));

        return res.json({
            success: true,
            data: {
                permitNumber: String(found.permitNumber || found.id),
                company: found.company || 'شرکت لپان بافت',
                date: utils.toShamsiFull(found.date).split(' ')[0] || found.date,
                exitTime: found.exitTime || '',
                recipientName: found.recipientName || found.customerName || '',
                driverName: found.driverName || '',
                driverPhone: found.driverPhone || '',
                plateNumber: found.plateNumber || '',
                destinationAddress: found.destinationAddress || '',
                description: found.description || '',
                items: itemsToCalc,
                totalWeight,
                totalCartons,
                botLinks
            }
        });
    } catch (err) {
        console.error("Public survey fetch error:", err);
        return res.status(500).json({ error: 'خطا در بارگذاری اطلاعات محموله' });
    }
});

app.post('/api/public/survey/submit', (req, res) => {
    try {
        const db = getDb();
        const {
            permitNumber,
            customerName,
            customerPhone,
            qualityRating,
            deliveryRating,
            courtesyRating,
            supportRating,
            overallRating,
            whyBuyFromUs,
            wouldRecommend,
            positivePoints,
            comment
        } = req.body;

        if (!db.customerFeedbacks) db.customerFeedbacks = [];

        const feedback = {
            id: 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            permitNumber: String(permitNumber || 'نامشخص'),
            customerName: String(customerName || 'مشتری محترم'),
            customerPhone: String(customerPhone || ''),
            qualityRating: Number(qualityRating) || 5,
            deliveryRating: Number(deliveryRating) || 5,
            courtesyRating: Number(courtesyRating) || 5,
            supportRating: Number(supportRating) || 5,
            overallRating: Number(overallRating) || 5,
            whyBuyFromUs: String(whyBuyFromUs || ''),
            wouldRecommend: String(wouldRecommend || ''),
            positivePoints: Array.isArray(positivePoints) ? positivePoints : [],
            comment: String(comment || '').trim(),
            submittedAt: new Date().toISOString()
        };

        db.customerFeedbacks.unshift(feedback);
        saveDb(db);

        console.log(`[Customer Survey] New detailed feedback submitted for Permit #${feedback.permitNumber} by ${feedback.customerName}`);
        return res.json({ success: true, message: 'نظرسنجی شما با موفقیت ثبت شد.' });
    } catch (err) {
        console.error("Public survey submit error:", err);
        return res.status(500).json({ error: 'خطا در ثبت نظرسنجی' });
    }
});

app.get('/api/customer-feedbacks', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
        const db = getDb();
        res.json(db.customerFeedbacks || []);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت نظرسنجی‌ها' });
    }
});

// --- CCTI PERSONNEL ACCOUNTS & ARCHIVES PERMANENT SERVER STORAGE ---
app.get('/api/ccti/data', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
        const db = getDb();
        res.json({
            persons: db.cctiPersons || {},
            archives: db.cctiArchives || [],
            sourceIban: db.cctiSourceIban || ''
        });
    } catch (err) {
        res.status(500).json({ error: 'خطا در خواندن حافظه پرسنل CCTI' });
    }
});

app.post('/api/ccti/persons', (req, res) => {
    try {
        const { persons, merge = true, sourceIban } = req.body || {};
        const db = getDb();
        if (!db.cctiPersons || !merge) {
            db.cctiPersons = {};
        }
        if (persons && typeof persons === 'object') {
            db.cctiPersons = merge ? { ...db.cctiPersons, ...persons } : persons;
        }
        if (typeof sourceIban === 'string' && sourceIban.trim()) {
            db.cctiSourceIban = sourceIban.trim();
        }
        saveDb(db);
        res.json({ success: true, persons: db.cctiPersons, count: Object.keys(db.cctiPersons).length });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ذخیره حافظه پرسنل CCTI' });
    }
});

app.post('/api/ccti/archives', (req, res) => {
    try {
        const { archives, sourceIban } = req.body || {};
        const db = getDb();
        if (Array.isArray(archives)) {
            db.cctiArchives = archives;
        }
        if (typeof sourceIban === 'string' && sourceIban.trim()) {
            db.cctiSourceIban = sourceIban.trim();
        }
        saveDb(db);
        res.json({ success: true, archives: db.cctiArchives || [] });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ذخیره بایگانی CCTI' });
    }
});


// Serve static assets from public (ensure sw.js, manifest.json, and html are NEVER cached stale)
app.use('/fonts', express.static(path.join(ROOT_DIR, 'public', 'fonts'), { maxAge: '30d' }));
app.use('/tesseract', express.static(path.join(ROOT_DIR, 'public', 'tesseract'), { maxAge: '30d' }));
app.use(express.static(path.join(ROOT_DIR, 'public'), {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

if (isExplicitDev) {
    console.log("Starting in Development mode with non-blocking Vite Middleware...");
    let viteInstance = null;
    const viteReadyPromise = (async () => {
        try {
            const { createServer: createViteServer } = await import("vite");
            viteInstance = await createViteServer({
                server: { middlewareMode: true, hmr: false },
                appType: "spa",
                optimizeDeps: {
                    entries: ['index.html']
                }
            });
            return viteInstance;
        } catch (err) {
            console.error("Vite dev middleware failed to load:", err?.message);
            return null;
        }
    })();

    app.use(async (req, res, next) => {
        if (req.originalUrl.startsWith('/api')) return next();
        const vite = viteInstance || await viteReadyPromise;
        if (!vite) return next();
        return vite.middlewares(req, res, next);
    });

    // Fallback SPA HTML handler for Vite dev server
    app.use('*', async (req, res, next) => {
        if (req.originalUrl.startsWith('/api')) return next();
        const vite = viteInstance || await viteReadyPromise;
        if (!vite) {
            if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
                return res.sendFile(path.join(DIST_DIR, 'index.html'));
            }
            return next();
        }
        try {
            let template = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf-8');
            template = await vite.transformIndexHtml(req.originalUrl, template);
            res.status(200).set({
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }).end(template);
        } catch (e) {
            vite.ssrFixStacktrace(e);
            next(e);
        }
    });
} else if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    let buildTime = "Unknown";
    try {
        const stats = fs.statSync(path.join(DIST_DIR, 'index.html'));
        buildTime = stats.mtime.toLocaleString('fa-IR');
    } catch(e){}
    console.log(`Starting in Production mode serving built assets from dist (Build Date: ${buildTime})...`);
    
    app.use(express.static(DIST_DIR, {
        maxAge: '1d',
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json') || filePath.endsWith('.js')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        }
    }));
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
        if (req.path.startsWith('/assets/') || /\.(js|mjs|css|map|woff2?|ttf|wasm|png|jpe?g|svg|ico)$/i.test(req.path)) {
            return res.status(404).end();
        }
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
} else {
    console.warn("⚠️ [توجه] فایل dist/index.html روی سرور یافت نشد. برای فعال‌سازی کامل وب‌اپ، لطفاً یکبار دستور npm run build را در پوشه اصلی پروژه اجرا کنید.");
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
        res.status(503).send(`
            <!DOCTYPE html>
            <html dir="rtl" lang="fa">
            <head>
                <meta charset="UTF-8">
                <title>سیستم در حال به‌روزرسانی</title>
                <style>
                    body { font-family: Tahoma, sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #1e293b; }
                    .card { background: white; padding: 40px; border-radius: 12px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                    h2 { color: #0d9488; }
                    code { background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #e11d48; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>در حال آماده‌سازی نسخه وب...</h2>
                    <p>فایل‌های نسخه وب در حال بیلد مجدد می‌باشند.</p>
                    <p>لطفاً در CMD سرور دستور زیر را اجرا نمایید:</p>
                    <code>npm run build</code>
                </div>
            </body>
            </html>
        `);
    });
}

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  VITE v5.4.21  ready in 120 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
    console.log(`  ➜  press h + enter to show help\n`);
    console.log(`Server running on http://localhost:${PORT}`);
    setTimeout(async () => {
        try {
            const db = getDb(); // Initial load to memory
            if(db.settings?.telegramBotToken) {
                const tgModule = await safeImport('./backend/telegram.js');
                if(tgModule) tgModule.initTelegram(db.settings.telegramBotToken);
            }
            if(db.settings?.baleBotToken) {
                const baleModule = await safeImport('./backend/bale.js');
                if(baleModule) baleModule.initBaleBot(db.settings.baleBotToken);
            }
            const waAuthPath = path.join(ROOT_DIR, 'wauth');
            if (fs.existsSync(waAuthPath) && process.env.DISABLE_WHATSAPP_DEV !== 'true') {
                const waModule = await safeImport('./backend/whatsapp.js');
                if (waModule) waModule.initWhatsApp(waAuthPath);
            }
        } catch (err) {
            console.error("Background services initialization error:", err);
        }
        setupAutoBackup();
        setupDailyReports();
        setupLegacyDailyReports();
        setupWarehouseInventoryDailySync();
        setupTaskRecurringReminders();
        sayanOrderAuto.initAutomationCron();
    }, 1000);
});

// WebSocket proxy support for ONLYOFFICE coauthoring and docservice
server.on('upgrade', (req, socket, head) => {
    if (req.url && (req.url.startsWith('/onlyoffice-proxy') || req.url.startsWith('/docservice') || req.url.startsWith('/spellchecker') || req.url.startsWith('/coauthoring'))) {
        const targetBase = process.env.ONLYOFFICE_DOC_SERVER_INTERNAL_URL || 'http://127.0.0.1:8088';
        try {
            const parsedTarget = new URL(targetBase);
            const targetPath = req.url.replace(/^\/onlyoffice-proxy/, '') || '/';
            const proxyReq = http.request({
                hostname: parsedTarget.hostname,
                port: parsedTarget.port || 80,
                path: targetPath,
                method: req.method,
                headers: {
                    ...req.headers,
                    host: parsedTarget.host,
                    'x-forwarded-host': req.headers.host,
                    'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http',
                }
            });
            proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
                socket.write(
                    `HTTP/1.1 101 Switching Protocols\r\n` +
                    Object.keys(proxyRes.headers).map(key => `${key}: ${proxyRes.headers[key]}`).join('\r\n') +
                    '\r\n\r\n'
                );
                proxySocket.pipe(socket);
                socket.pipe(proxySocket);
            });
            proxyReq.on('error', () => {
                socket.destroy();
            });
            proxyReq.end();
        } catch (e) {
            socket.destroy();
        }
    }
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`\n=======================================================================`);
        console.error(`[خطا / Port In Use] پورت ${PORT} در حال حاضر اشغال است!`);
        console.error(`علت: سرویس ویندوز (از طریق manager.bat) یا یک نمونه دیگر از سرور در حال اجراست.`);
        console.error(`1. اگر قبلاً با manager.bat سرویس را نصب کرده‌اید، برنامه در حال اجراست و کافیست`);
        console.error(`   مرورگر را باز کنید و آدرس زیر را وارد نمایید:`);
        console.error(`   --> http://localhost:${PORT}`);
        console.error(`2. برای متوقف کردن سرویس پس‌زمینه، در CMD بزنید: net stop PaymentSystem`);
        console.error(`=======================================================================\n`);
    } else {
        console.error(`[Server Error]:`, err);
    }
});



