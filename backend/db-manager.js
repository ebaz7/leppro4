
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';
import dns from 'dns';
import * as corePg from './core-pg-repository.js';

// Ensure DNS lookups prefer IPv4 to prevent 2-5 second IPv6 (::1) lookup timeouts on Windows local networks
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '..', 'database.json');
const SMART_PG_SPOOL_FILE = path.join(__dirname, '..', 'smart_pg_emergency_spool.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Persistent HTTP and HTTPS Connection Pools with TCP Keep-Alive and NoDelay
const localHttpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 200,
    maxFreeSockets: 50,
    timeout: 60000,
    scheduling: 'fifo'
});

const localHttpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 200,
    maxFreeSockets: 50,
    timeout: 60000,
    scheduling: 'fifo'
});

/**
 * Direct unproxied, high-performance HTTP/HTTPS fetch for internal services, local network (192.168.*, 127.0.0.1, localhost)
 * and Sayan ERP. Guarantees that local traffic is never routed through any system proxy,
 * VPN, or environment variables, with persistent socket reuse and TCP_NODELAY enabled.
 */
export const robustFetch = async (url, options = {}) => {
    return new Promise((resolve, reject) => {
        try {
            const parsed = new URL(url);
            
            // Map localhost directly to 127.0.0.1 to avoid Windows IPv6 resolution overhead
            if (parsed.hostname === 'localhost') {
                parsed.hostname = '127.0.0.1';
            }

            const lib = parsed.protocol === 'https:' ? https : http;
            const chosenAgent = parsed.protocol === 'https:' ? localHttpsAgent : localHttpAgent;
            const timeoutMs = options.timeout || 60000;
            const headers = { ...options.headers };

            for (const k of Object.keys(headers)) {
                if (k.toLowerCase() === 'content-length') delete headers[k];
            }
            if (options.body) {
                headers['Content-Length'] = Buffer.byteLength(options.body, 'utf8');
            }

            const req = lib.request(parsed, {
                method: options.method || 'GET',
                headers,
                timeout: timeoutMs,
                agent: chosenAgent
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        headers: {
                            get: (headerName) => {
                                const val = res.headers[String(headerName).toLowerCase()];
                                return Array.isArray(val) ? val.join(', ') : (val || '');
                            },
                            ...res.headers
                        },
                        json: async () => {
                            try {
                                return JSON.parse(data);
                            } catch (parseErr) {
                                return {};
                            }
                        },
                        text: async () => data
                    });
                });
            });

            // Enable TCP_NODELAY immediately to disable Nagle's algorithm for minimum round-trip latency
            req.on('socket', (socket) => {
                socket.setNoDelay(true);
                socket.setKeepAlive(true, 1000);
            });

            if (options.signal) {
                if (options.signal.aborted) {
                    req.destroy();
                    const err = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    return reject(err);
                }
                const onAbort = () => {
                    req.destroy();
                    const err = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    reject(err);
                };
                options.signal.addEventListener('abort', onAbort, { once: true });
            }

            req.on('timeout', () => {
                req.destroy();
                const err = new Error(`مهلت زمان برقراری ارتباط با وب‌سرویس (${timeoutMs / 1000} ثانیه) به پایان رسید.`);
                err.name = 'TimeoutError';
                reject(err);
            });
            req.on('error', (e) => reject(e));
            if (options.body) {
                req.write(options.body);
            }
            req.end();
        } catch (innerErr) {
            reject(innerErr);
        }
    });
};

/**
 * Sanitizes any Sayan Base URL to guarantee it includes the proper protocol and the essential '/api/external/v1' path.
 */
export const sanitizeSayanUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    let clean = url.trim();
    
    // Add http:// prefix if missing (unless it already has http:// or https://)
    if (!/^https?:\/\//i.test(clean)) {
        clean = 'http://' + clean;
    }
    
    // Remove trailing slashes
    clean = clean.replace(/\/+$/, '');
    
    // If it ends with /api/v1, replace it with /api/external/v1
    if (clean.endsWith('/api/v1')) {
        clean = clean.replace(/\/api\/v1$/, '/api/external/v1');
    }
    
    // If it doesn't contain /api/external/v1 and doesn't contain /api/v1
    if (!clean.includes('/api/external/v1') && !clean.includes('/api/v1')) {
        clean = clean + '/api/external/v1';
    }
    
    return clean;
};

if (!fs.existsSync(UPLOADS_DIR)) {
    try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}

/**
 * Saves a base64 string directly to the uploads directory as a physical file,
 * returning the web URL path (e.g. /uploads/1741950000_file.png).
 */
export const saveBase64ToFile = (base64String, preferredName = 'file') => {
    if (!base64String || typeof base64String !== 'string') return base64String;
    const isDataUrl = base64String.startsWith('data:');
    const isRawBase64 = !isDataUrl && base64String.length > 500 && !base64String.startsWith('http') && !base64String.startsWith('/uploads/') && /^[A-Za-z0-9+/=\s]+$/.test(base64String.substring(0, 100));
    
    if (!isDataUrl && !isRawBase64) return base64String;

    try {
        let mimeType = 'image/png';
        let ext = '.png';
        let base64Data = base64String;

        if (isDataUrl) {
            const matches = base64String.match(/^data:([a-zA-Z0-9\/\-+.]+);base64,(.*)$/s);
            if (matches) {
                mimeType = matches[1];
                base64Data = matches[2];
            } else {
                base64Data = base64String.replace(/^data:.*?;base64,/, '');
            }
        }

        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
        else if (mimeType.includes('png')) ext = '.png';
        else if (mimeType.includes('webp')) ext = '.webp';
        else if (mimeType.includes('pdf')) ext = '.pdf';
        else if (mimeType.includes('gif')) ext = '.gif';
        else if (preferredName && path.extname(preferredName)) {
            ext = path.extname(preferredName);
        }

        const cleanName = (preferredName || 'file')
            .replace(/[\/\\]/g, '')
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_')
            .substring(0, 50);

        const uniqueFileName = `${Date.now()}_${Math.floor(Math.random() * 10000)}_${cleanName}${ext}`;
        const targetPath = path.join(UPLOADS_DIR, uniqueFileName);

        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(targetPath, buffer);
        console.log(`[DB Optimizer] Extracted base64 (${(buffer.length / 1024).toFixed(1)} KB) -> /uploads/${uniqueFileName}`);

        return `/uploads/${uniqueFileName}`;
    } catch (err) {
        console.error('[DB Optimizer] Failed to offload base64 to file:', err);
        return base64String;
    }
};

/**
 * Scans DB collections for base64 strings, offloads them to physical files in uploads/,
 * and replaces them with light /uploads/... URLs.
 */
export const sanitizeAndOffloadDb = (db) => {
    if (!db || typeof db !== 'object') return false;
    let modified = false;

    // 1. Exit Permits
    if (Array.isArray(db.exitPermits)) {
        db.exitPermits.forEach(permit => {
            if (Array.isArray(permit.attachments)) {
                permit.attachments.forEach(att => {
                    if (att && typeof att.data === 'string' && (att.data.startsWith('data:') || (att.data.length > 500 && !att.data.startsWith('http') && !att.data.startsWith('/uploads/')))) {
                        const newUrl = saveBase64ToFile(att.data, att.fileName || 'exit_permit_attachment');
                        if (newUrl !== att.data) {
                            att.data = newUrl;
                            att.url = newUrl;
                            modified = true;
                        }
                    }
                    if (att && typeof att.url === 'string' && att.url.startsWith('data:')) {
                        const newUrl = saveBase64ToFile(att.url, att.fileName || 'exit_permit_attachment');
                        if (newUrl !== att.url) {
                            att.url = newUrl;
                            if (att.data && att.data.startsWith('data:')) att.data = newUrl;
                            modified = true;
                        }
                    }
                });
            }
            if (permit.sayanRemittanceDocImage && typeof permit.sayanRemittanceDocImage === 'string' && permit.sayanRemittanceDocImage.startsWith('data:')) {
                const newUrl = saveBase64ToFile(permit.sayanRemittanceDocImage, `sayan_remittance_${permit.permitNumber || 'doc'}`);
                permit.sayanRemittanceDocImage = newUrl;
                modified = true;
            }
        });
    }

    // 2. Orders
    if (Array.isArray(db.orders)) {
        db.orders.forEach(order => {
            if (Array.isArray(order.attachments)) {
                order.attachments.forEach(att => {
                    if (att && typeof att.data === 'string' && (att.data.startsWith('data:') || (att.data.length > 500 && !att.data.startsWith('http') && !att.data.startsWith('/uploads/')))) {
                        const newUrl = saveBase64ToFile(att.data, att.fileName || 'order_attachment');
                        if (newUrl !== att.data) {
                            att.data = newUrl;
                            att.url = newUrl;
                            modified = true;
                        }
                    }
                    if (att && typeof att.url === 'string' && att.url.startsWith('data:')) {
                        const newUrl = saveBase64ToFile(att.url, att.fileName || 'order_attachment');
                        att.url = newUrl;
                        if (att.data && att.data.startsWith('data:')) att.data = newUrl;
                        modified = true;
                    }
                });
            }
        });
    }

    // 3. Trade Records
    if (Array.isArray(db.tradeRecords)) {
        db.tradeRecords.forEach(trade => {
            if (Array.isArray(trade.attachments)) {
                trade.attachments.forEach(att => {
                    if (att && typeof att.url === 'string' && att.url.startsWith('data:')) {
                        att.url = saveBase64ToFile(att.url, att.fileName || 'trade_attachment');
                        modified = true;
                    }
                    if (att && typeof att.data === 'string' && att.data.startsWith('data:')) {
                        att.data = saveBase64ToFile(att.data, att.fileName || 'trade_attachment');
                        modified = true;
                    }
                });
            }
            if (trade.stages && typeof trade.stages === 'object') {
                Object.values(trade.stages).forEach(stage => {
                    if (stage && Array.isArray(stage.attachments)) {
                        stage.attachments.forEach(att => {
                            if (att && typeof att.url === 'string' && att.url.startsWith('data:')) {
                                att.url = saveBase64ToFile(att.url, att.fileName || 'stage_attachment');
                                modified = true;
                            }
                        });
                    }
                });
            }
            if (Array.isArray(trade.shippingDocs)) {
                trade.shippingDocs.forEach(doc => {
                    if (doc && Array.isArray(doc.attachments)) {
                        doc.attachments.forEach(att => {
                            if (att && typeof att.url === 'string' && att.url.startsWith('data:')) {
                                att.url = saveBase64ToFile(att.url, att.fileName || 'shipping_doc');
                                modified = true;
                            }
                        });
                    }
                });
            }
        });
    }

    // 4. Cheque Receipts & Sayan Cheque Receipts
    if (Array.isArray(db.chequeReceipts)) {
        db.chequeReceipts.forEach(rcpt => {
            if (rcpt.image && typeof rcpt.image === 'string' && rcpt.image.startsWith('data:')) {
                rcpt.image = saveBase64ToFile(rcpt.image, `cheque_${rcpt.chequeNumber || 'receipt'}`);
                modified = true;
            }
            if (Array.isArray(rcpt.attachments)) {
                rcpt.attachments.forEach(att => {
                    if (att && typeof att.url === 'string' && att.url.startsWith('data:')) {
                        att.url = saveBase64ToFile(att.url, att.fileName || 'cheque_attachment');
                        modified = true;
                    }
                    if (att && typeof att.data === 'string' && att.data.startsWith('data:')) {
                        att.data = saveBase64ToFile(att.data, att.fileName || 'cheque_attachment');
                        modified = true;
                    }
                });
            }
        });
    }

    // 4b. Sayan Cheque Receipts (System bursary op 11 receipts)
    if (Array.isArray(db.sayan_cheque_receipts)) {
        db.sayan_cheque_receipts.forEach(rcpt => {
            if (Array.isArray(rcpt.attachments)) {
                rcpt.attachments.forEach(att => {
                    if (!att) return;
                    if (att.fileData && typeof att.fileData === 'string' && (att.fileData.startsWith('data:') || att.fileData.length > 500)) {
                        const newUrl = saveBase64ToFile(att.fileData, att.fileName || 'cheque_attachment');
                        att.url = newUrl;
                        delete att.fileData;
                        modified = true;
                    }
                    if (att.data && typeof att.data === 'string' && (att.data.startsWith('data:') || att.data.length > 500)) {
                        const newUrl = saveBase64ToFile(att.data, att.fileName || 'cheque_attachment');
                        att.url = newUrl;
                        delete att.data;
                        modified = true;
                    }
                    if (att.url && typeof att.url === 'string' && att.url.startsWith('data:')) {
                        att.url = saveBase64ToFile(att.url, att.fileName || 'cheque_attachment');
                        modified = true;
                    }
                    if (att.fileData) {
                        delete att.fileData;
                        modified = true;
                    }
                });
            }
            if (Array.isArray(rcpt.cheques)) {
                rcpt.cheques.forEach(chq => {
                    if (chq.image && typeof chq.image === 'string' && chq.image.startsWith('data:')) {
                        chq.image = saveBase64ToFile(chq.image, `cheque_${chq.chequeNumber || 'item'}`);
                        modified = true;
                    }
                    if (chq.fileData && typeof chq.fileData === 'string' && chq.fileData.startsWith('data:')) {
                        chq.url = saveBase64ToFile(chq.fileData, `cheque_${chq.chequeNumber || 'item'}`);
                        delete chq.fileData;
                        modified = true;
                    }
                });
            }
            if (rcpt.accountingReview && Array.isArray(rcpt.accountingReview.attachments)) {
                rcpt.accountingReview.attachments.forEach(att => {
                    if (att && att.fileData) {
                        att.url = saveBase64ToFile(att.fileData, att.fileName || 'review_att');
                        delete att.fileData;
                        modified = true;
                    }
                });
            }
        });
    }

    // 5. Messages (Chat)
    if (Array.isArray(db.messages)) {
        db.messages.forEach(msg => {
            if (msg.fileUrl && typeof msg.fileUrl === 'string' && msg.fileUrl.startsWith('data:')) {
                msg.fileUrl = saveBase64ToFile(msg.fileUrl, msg.fileName || 'chat_file');
                modified = true;
            }
        });
    }

    // 6. Deep recursive safety scan across entire DB to catch ANY remaining base64 payload
    const deepClean = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('data:application/pdf') || (val.length > 2000 && !val.startsWith('http') && !val.startsWith('/uploads/') && /^[A-Za-z0-9+/=\s]+$/.test(val.substring(0, 100))))) {
                const savedUrl = saveBase64ToFile(val, key);
                obj[key] = savedUrl;
                modified = true;
            } else if (val && typeof val === 'object') {
                deepClean(val);
            }
        }
    };
    try {
        deepClean(db);
    } catch (e) {}

    return modified;
};

let MEMORY_DB_CACHE = null;
let saveTimeout = null;
let isSaving = false;
let CORE_STORAGE_MODE = 'uninitialized'; // 'postgresql' | 'json' | 'uninitialized'
let MIGRATED_FROM_JSON_ON_BOOT = false;
let HAS_PENDING_PG_SPOOL = fs.existsSync(SMART_PG_SPOOL_FILE);
let LAST_PG_SPOOL_AT = null;
let LAST_PG_SPOOL_ERROR = null;
let spoolRetryTimer = null;

const extractSmartOnlyStateForSpool = (dbObj) => {
    const clean = {};
    if (!dbObj || typeof dbObj !== 'object') return clean;
    for (const [k, v] of Object.entries(dbObj)) {
        if (corePg.SMART_EXCLUDED_ROOT_KEYS?.has(k) || v === undefined) continue;
        clean[k] = v;
    }
    return clean;
};

const clearEmergencyPgSpool = () => {
    try {
        if (fs.existsSync(SMART_PG_SPOOL_FILE)) {
            fs.unlinkSync(SMART_PG_SPOOL_FILE);
        }
    } catch (err) {
        console.error('[Smart Core Failover] Failed clearing emergency PG spool:', err);
    }
    HAS_PENDING_PG_SPOOL = false;
    LAST_PG_SPOOL_ERROR = null;
    if (spoolRetryTimer) {
        clearTimeout(spoolRetryTimer);
        spoolRetryTimer = null;
    }
};

const scheduleEmergencySpoolRecovery = () => {
    if (spoolRetryTimer || !HAS_PENDING_PG_SPOOL) return;
    spoolRetryTimer = setTimeout(async () => {
        spoolRetryTimer = null;
        if (!HAS_PENDING_PG_SPOOL || !MEMORY_DB_CACHE || !corePg.isPostgresConfigured()) return;
        try {
            const ready = await corePg.ensureCorePostgresSchemaReady(true);
            if (!ready) {
                scheduleEmergencySpoolRecovery();
                return;
            }
            const res = await corePg.syncSmartDbToPostgres(MEMORY_DB_CACHE, { forceFullSync: true });
            if (res?.ok) {
                CORE_STORAGE_MODE = 'postgresql';
                clearEmergencyPgSpool();
                console.log('✅ [Smart Core Failover] PostgreSQL reconnected; emergency disk spool synced cleanly.');
            } else {
                scheduleEmergencySpoolRecovery();
            }
        } catch {
            scheduleEmergencySpoolRecovery();
        }
    }, 15000);
    if (typeof spoolRetryTimer.unref === 'function') spoolRetryTimer.unref();
};

const writeEmergencyPgSpool = (dbObj, reason = 'postgres_unavailable') => {
    try {
        if (!dbObj || typeof dbObj !== 'object') return false;
        const payload = {
            spoolVersion: 1,
            spooledAtMs: Date.now(),
            reason: String(reason || 'postgres_unavailable'),
            data: extractSmartOnlyStateForSpool(dbObj),
        };
        const tmpPath = `${SMART_PG_SPOOL_FILE}.tmp_${process.pid}_${Date.now()}`;
        fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf8');
        fs.renameSync(tmpPath, SMART_PG_SPOOL_FILE);
        HAS_PENDING_PG_SPOOL = true;
        LAST_PG_SPOOL_AT = payload.spooledAtMs;
        LAST_PG_SPOOL_ERROR = payload.reason;
        scheduleEmergencySpoolRecovery();
        return true;
    } catch (err) {
        console.error('[Smart Core Failover] Failed writing emergency PG spool:', err);
        return false;
    }
};

const readEmergencyPgSpool = () => {
    try {
        if (!fs.existsSync(SMART_PG_SPOOL_FILE)) return null;
        const raw = fs.readFileSync(SMART_PG_SPOOL_FILE, 'utf8');
        if (!raw || !raw.trim()) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data && typeof parsed.data === 'object') {
            return {
                spooledAtMs: Number(parsed.spooledAtMs || 0) || fs.statSync(SMART_PG_SPOOL_FILE).mtimeMs,
                reason: parsed.reason || null,
                data: parsed.data,
            };
        }
    } catch (err) {
        console.error('[Smart Core Failover] Failed reading emergency PG spool:', err);
    }
    return null;
};

const createDefaultDb = () => ({
    settings: {
        sayanApiUrl: process.env.SAYAN_API_URL || "",
        sayanApiKey: process.env.SAYAN_API_KEY || "s_gate_live_73f08a91b2c"
    },
    users: [
        { id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: 'admin', roles: ['admin'], canManageTrade: true }
    ],
    orders: [],
    exitPermits: [],
    warehouseItems: [],
    warehouseTransactions: [],
    tradeRecords: [],
    chequeReceipts: [],
    securityLogs: [],
    personnelDelays: [],
    securityIncidents: [],
    messages: [],
    groups: [],
    tasks: [],
    subscriptions: [],
    botSubscribers: [],
    customerBalances: [],
    customerChatCodes: [],
    fiscalYears: {},
    sequences: {},
    notes: [],
    customCalendarEvents: [],
    purchaseRequests: [],
    partMasterData: []
});

const normalizeSmartDbCache = (targetDb) => {
    const db = targetDb && typeof targetDb === 'object' ? targetDb : createDefaultDb();

    if (!db.settings) db.settings = {};
    if (!db.settings.sayanApiUrl && process.env.SAYAN_API_URL) {
        db.settings.sayanApiUrl = process.env.SAYAN_API_URL;
    }
    if (db.settings.sayanApiUrl) {
        db.settings.sayanApiUrl = sanitizeSayanUrl(db.settings.sayanApiUrl);
    }
    if (!db.settings.sayanApiKey) {
        db.settings.sayanApiKey = process.env.SAYAN_API_KEY || "s_gate_live_73f08a91b2c";
    }

    if (!Array.isArray(db.settings.companies)) {
        db.settings.companies = [];
    }
    if (!Array.isArray(db.settings.companyNames)) {
        db.settings.companyNames = [];
    }

    const normCompName = (s) => String(s || '')
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/\u200c/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const companyMap = new Map();

    (db.settings.companies || []).forEach((c, idx) => {
        const cName = typeof c === 'string' ? c.trim() : (c && c.name ? String(c.name).trim() : '');
        const key = normCompName(cName);
        if (key) {
            const existing = companyMap.get(key) || {};
            const obj = (typeof c === 'object' && c !== null) ? c : {};
            companyMap.set(key, {
                ...existing,
                ...obj,
                id: obj.id || existing.id || ('comp_' + idx + '_' + Date.now()),
                name: cName,
                showInWarehouse: obj.showInWarehouse !== undefined ? obj.showInWarehouse : (existing.showInWarehouse !== undefined ? existing.showInWarehouse : true),
                isAccountingEnabled: obj.isAccountingEnabled !== undefined ? obj.isAccountingEnabled : (existing.isAccountingEnabled !== undefined ? existing.isAccountingEnabled : true),
                banks: Array.isArray(obj.banks) ? obj.banks : (Array.isArray(existing.banks) ? existing.banks : []),
                logo: obj.logo || existing.logo || "",
                registrationNumber: obj.registrationNumber || existing.registrationNumber || "",
                nationalId: obj.nationalId || existing.nationalId || "",
                address: obj.address || existing.address || "",
                phone: obj.phone || existing.phone || "",
                fax: obj.fax || existing.fax || "",
                postalCode: obj.postalCode || existing.postalCode || "",
                economicCode: obj.economicCode || existing.economicCode || "",
                letterhead: obj.letterhead || existing.letterhead || ""
            });
        }
    });

    (db.settings.companyNames || []).forEach((n, idx) => {
        const name = typeof n === 'string' ? n.trim() : '';
        const key = normCompName(name);
        if (key && !companyMap.has(key)) {
            companyMap.set(key, {
                id: 'comp_name_' + idx + '_' + Date.now(),
                name,
                showInWarehouse: true,
                isAccountingEnabled: true,
                banks: []
            });
        }
    });

    if (Array.isArray(db.settings.fiscalYears)) {
        db.settings.fiscalYears.forEach(fy => {
            if (fy && fy.companySequences) {
                Object.keys(fy.companySequences).forEach((k, idx) => {
                    const name = k ? k.trim() : '';
                    const key = normCompName(name);
                    if (key && !companyMap.has(key)) {
                        companyMap.set(key, {
                            id: 'comp_fy_' + idx + '_' + Date.now(),
                            name,
                            showInWarehouse: true,
                            isAccountingEnabled: true,
                            banks: []
                        });
                    }
                });
            }
        });
    }

    let allCompanies = Array.from(companyMap.values());
    allCompanies = allCompanies.filter(c =>
        c.name !== 'شرکت اصلی' ||
        c.logo ||
        c.registrationNumber ||
        c.nationalId ||
        c.address ||
        c.economicCode ||
        (c.banks && c.banks.length > 0)
    );

    db.settings.companies = allCompanies;
    db.settings.companyNames = allCompanies.map(c => c.name);

    if (!Array.isArray(db.settings.operatingBankNames)) {
        db.settings.operatingBankNames = [];
    }
    if (!Array.isArray(db.settings.bankNames)) {
        db.settings.bankNames = [];
    }

    const extractedBanks = new Set();
    (db.settings.operatingBankNames || []).forEach(b => { if (b && typeof b === 'string' && b.trim()) extractedBanks.add(b.trim()); });
    (db.settings.bankNames || []).forEach(b => { if (b && typeof b === 'string' && b.trim()) extractedBanks.add(b.trim()); });
    if (db.settings.companyBank && typeof db.settings.companyBank === 'string' && db.settings.companyBank.trim()) {
        extractedBanks.add(db.settings.companyBank.trim());
    }

    (db.settings.companies || []).forEach(c => {
        if (c && Array.isArray(c.banks)) {
            c.banks.forEach(b => {
                if (b) {
                    const bName = typeof b === 'string' ? b : (b.bankName || '');
                    if (bName && bName.trim()) extractedBanks.add(bName.trim());
                }
            });
        }
    });

    (db.orders || []).forEach(o => {
        if (Array.isArray(o.paymentDetails)) {
            o.paymentDetails.forEach(p => {
                if (p && p.bankName && p.bankName.trim()) extractedBanks.add(p.bankName.trim());
                if (p && p.recipientBank && p.recipientBank.trim()) extractedBanks.add(p.recipientBank.trim());
            });
        }
    });

    (db.chequeReceipts || []).forEach(c => {
        if (c && c.bankName && c.bankName.trim()) extractedBanks.add(c.bankName.trim());
    });

    (db.tradeRecords || []).forEach(t => {
        ['inspectionPayments', 'clearancePayments', 'shippingPayments', 'agentPayments', 'guarantees'].forEach(key => {
            if (Array.isArray(t[key])) {
                t[key].forEach(p => {
                    if (p && p.bank && p.bank.trim()) extractedBanks.add(p.bank.trim());
                });
            }
        });
    });

    const allExtractedBankList = Array.from(extractedBanks);
    if (allExtractedBankList.length > 0) {
        db.settings.operatingBankNames = Array.from(new Set([
            ...db.settings.operatingBankNames,
            ...allExtractedBankList
        ]));
        db.settings.bankNames = Array.from(new Set([
            ...db.settings.bankNames,
            ...allExtractedBankList
        ]));
    }

    if (db.fiscalYears && Array.isArray(db.fiscalYears) && db.fiscalYears.length > 0) {
        if (!db.settings.fiscalYears || (Array.isArray(db.settings.fiscalYears) && db.settings.fiscalYears.length === 0)) {
            db.settings.fiscalYears = db.fiscalYears;
        }
    } else if (db.settings.fiscalYears && !Array.isArray(db.settings.fiscalYears) && typeof db.settings.fiscalYears === 'object') {
        db.settings.fiscalYears = Object.values(db.settings.fiscalYears);
    }

    if (!Array.isArray(db.settings.fiscalYears) || db.settings.fiscalYears.length === 0) {
        db.settings.fiscalYears = [
            { id: 'fy_1402', label: '1402', isClosed: false, companySequences: {}, createdAt: Date.now() },
            { id: 'fy_1403', label: '1403', isClosed: false, companySequences: {}, createdAt: Date.now() },
            { id: 'fy_1404', label: '1404', isClosed: false, companySequences: {}, createdAt: Date.now() },
            { id: 'fy_1405', label: '1405', isClosed: false, companySequences: {}, createdAt: Date.now() }
        ];
    }
    const activeFound = db.settings.activeFiscalYearId && db.settings.fiscalYears.some(fy => fy.id === db.settings.activeFiscalYearId);
    if (!activeFound && db.settings.fiscalYears.length > 0) {
        db.settings.activeFiscalYearId = db.settings.fiscalYears[0].id;
    } else if (!db.settings.activeFiscalYearId) {
        db.settings.activeFiscalYearId = 'fy_1404';
    }

    const arrays = ['users', 'botSubscribers', 'orders', 'exitPermits', 'warehouseTransactions', 'subscriptions', 'messages', 'groups', 'tasks', 'tradeRecords', 'notes', 'customerBalances', 'customerChatCodes', 'chequeReceipts', 'customCalendarEvents'];
    arrays.forEach(arr => {
        if (!Array.isArray(db[arr])) db[arr] = [];
    });

    if (db.users.length === 0) {
        db.users.push({ id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: 'admin', roles: ['admin'], canManageTrade: true });
    }

    return db;
};

/**
 * Bootstraps Smart Management ("مدیریت هوشمند") database from PostgreSQL.
 * Automatically migrates existing database.json into smart_* tables on first run if PostgreSQL smart_* is empty.
 */
export async function initCoreStorage() {
    const defaultDb = createDefaultDb();
    const pendingSpool = readEmergencyPgSpool();

    let legacyErpInMemory = null;
    if (fs.existsSync(DB_FILE)) {
        try {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            if (raw.trim()) {
                const parsedLegacy = JSON.parse(raw);
                if (parsedLegacy?.industrialErp) {
                    legacyErpInMemory = parsedLegacy.industrialErp;
                }
            }
        } catch {}
    }

    if (corePg.isPostgresConfigured()) {
        const pgRes = await corePg.loadSmartDbFromPostgres();
        if (pgRes.ok) {
            if (pendingSpool && pendingSpool.data) {
                MEMORY_DB_CACHE = normalizeSmartDbCache({
                    ...defaultDb,
                    ...(pgRes.hasData && pgRes.data ? pgRes.data : {}),
                    ...pendingSpool.data,
                    ...(legacyErpInMemory ? { industrialErp: legacyErpInMemory } : {}),
                });
                try {
                    sanitizeAndOffloadDb(MEMORY_DB_CACHE);
                } catch {}
                const spoolSync = await corePg.syncSmartDbToPostgres(MEMORY_DB_CACHE, { forceFullSync: true });
                if (spoolSync.ok) {
                    clearEmergencyPgSpool();
                    CORE_STORAGE_MODE = 'postgresql';
                    MIGRATED_FROM_JSON_ON_BOOT = false;
                    console.log('✅ [Smart Core PostgreSQL] Recovered and synced emergency outage spool into PostgreSQL.');
                    return { mode: CORE_STORAGE_MODE, migratedFromJson: false, recoveredFromSpool: true, stats: spoolSync };
                }
            }

            if (pgRes.hasData && pgRes.data) {
                MEMORY_DB_CACHE = normalizeSmartDbCache({
                    ...defaultDb,
                    ...pgRes.data,
                    ...(legacyErpInMemory ? { industrialErp: legacyErpInMemory } : {}),
                });

                try {
                    const wasShrunk = sanitizeAndOffloadDb(MEMORY_DB_CACHE);
                    if (wasShrunk) {
                        await corePg.syncSmartDbToPostgres(MEMORY_DB_CACHE);
                    }
                } catch (optErr) {
                    console.error('[DB Optimizer] Startup PG offload check error:', optErr);
                }

                CORE_STORAGE_MODE = 'postgresql';
                MIGRATED_FROM_JSON_ON_BOOT = false;
                console.log(
                    `✅ [Smart Core PostgreSQL] Loaded Smart Management DB from PostgreSQL (kv=${pgRes.stats?.kvKeys || 0}, users=${pgRes.stats?.users || 0}, items=${pgRes.stats?.collectionItems || 0}).`
                );
                return { mode: CORE_STORAGE_MODE, migratedFromJson: false, stats: pgRes.stats };
            }

            // PostgreSQL smart_* tables are empty -> auto-migrate from database.json if present, or seed defaults
            let sourceData = defaultDb;
            let migrated = false;
            if (fs.existsSync(DB_FILE)) {
                try {
                    const fileContent = fs.readFileSync(DB_FILE, 'utf8');
                    if (fileContent.trim()) {
                        const parsed = JSON.parse(fileContent);
                        sourceData = { ...defaultDb, ...parsed };
                        migrated = true;
                    }
                } catch (readErr) {
                    console.error('[Smart Core PostgreSQL] Failed reading database.json for migration:', readErr);
                }
            }

            MEMORY_DB_CACHE = normalizeSmartDbCache(sourceData);
            try {
                sanitizeAndOffloadDb(MEMORY_DB_CACHE);
            } catch {}

            const syncRes = await corePg.syncSmartDbToPostgres(MEMORY_DB_CACHE, { forceFullSync: true });
            if (syncRes.ok) {
                CORE_STORAGE_MODE = 'postgresql';
                MIGRATED_FROM_JSON_ON_BOOT = migrated;
                console.log(
                    migrated
                        ? `✅ [Smart Core PostgreSQL] Auto-migrated existing database.json to PostgreSQL smart_* tables (kv=${syncRes.upsertedKv}, users=${syncRes.upsertedUsers}, items=${syncRes.upsertedItems}).`
                        : `✅ [Smart Core PostgreSQL] Seeded initial Smart Management database into PostgreSQL.`
                );
                return { mode: CORE_STORAGE_MODE, migratedFromJson: migrated, stats: syncRes };
            }
        }
    }

    // Fallback when SQL_HOST is not configured or PostgreSQL is offline
    CORE_STORAGE_MODE = 'json';
    getDb();
    if (HAS_PENDING_PG_SPOOL && corePg.isPostgresConfigured()) {
        scheduleEmergencySpoolRecovery();
    }
    console.warn('⚠️ [Smart Core DB] PostgreSQL unavailable/unconfigured. Running in legacy database.json fallback mode.');
    return { mode: CORE_STORAGE_MODE, migratedFromJson: false };
}

export const getCoreStorageStatus = () => ({
    mode: CORE_STORAGE_MODE,
    migratedFromJsonOnBoot: MIGRATED_FROM_JSON_ON_BOOT,
    pgConfigured: corePg.isPostgresConfigured(),
    pgHealth: corePg.getCorePostgresHealth(),
    emergencySpoolActive: HAS_PENDING_PG_SPOOL,
    spoolFile: HAS_PENDING_PG_SPOOL ? path.basename(SMART_PG_SPOOL_FILE) : null,
    lastSpooledAt: LAST_PG_SPOOL_AT,
    lastSpoolError: LAST_PG_SPOOL_ERROR,
});

export const getDb = () => {
    if (MEMORY_DB_CACHE) return MEMORY_DB_CACHE;
    try {
        const defaultDb = createDefaultDb();
        const pendingSpool = readEmergencyPgSpool();
        const dbFileExists = fs.existsSync(DB_FILE);
        const dbFileMtime = dbFileExists ? fs.statSync(DB_FILE).mtimeMs : 0;

        if (pendingSpool && pendingSpool.data && pendingSpool.spooledAtMs >= dbFileMtime) {
            let legacyErpInMemory = null;
            if (dbFileExists) {
                try {
                    const parsedLegacy = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                    if (parsedLegacy?.industrialErp) legacyErpInMemory = parsedLegacy.industrialErp;
                } catch {}
            }
            MEMORY_DB_CACHE = normalizeSmartDbCache({
                ...defaultDb,
                ...pendingSpool.data,
                ...(legacyErpInMemory ? { industrialErp: legacyErpInMemory } : {}),
            });
            return MEMORY_DB_CACHE;
        }

        if (dbFileExists) {
            const fileContent = fs.readFileSync(DB_FILE, 'utf8');
            if (fileContent.trim()) {
                const data = JSON.parse(fileContent);
                MEMORY_DB_CACHE = normalizeSmartDbCache({ ...defaultDb, ...data });

                try {
                    const wasShrunk = sanitizeAndOffloadDb(MEMORY_DB_CACHE);
                    if (wasShrunk && CORE_STORAGE_MODE !== 'postgresql') {
                        console.log('[DB Optimizer] Successfully extracted base64 attachments into /uploads/. Saving lightened database.json...');
                        fs.writeFileSync(DB_FILE, JSON.stringify(MEMORY_DB_CACHE, null, 2));
                    }
                } catch (shrinkErr) {
                    console.error('[DB Optimizer] Initial migration error:', shrinkErr);
                }

                return MEMORY_DB_CACHE;
            }
        }
        MEMORY_DB_CACHE = normalizeSmartDbCache(defaultDb);
        return MEMORY_DB_CACHE;
    } catch (e) {
        console.error("DB Read Error:", e);
        return {};
    }
};

export const saveDb = (data) => {
    if (data) {
        const prevIndustrialErp = MEMORY_DB_CACHE?.industrialErp;
        MEMORY_DB_CACHE = data;
        if (!MEMORY_DB_CACHE.industrialErp && prevIndustrialErp) {
            MEMORY_DB_CACHE.industrialErp = prevIndustrialErp;
        }
    }
    if (!MEMORY_DB_CACHE) return true;

    if (MEMORY_DB_CACHE.settings && MEMORY_DB_CACHE.settings.sayanApiUrl) {
        MEMORY_DB_CACHE.settings.sayanApiUrl = sanitizeSayanUrl(MEMORY_DB_CACHE.settings.sayanApiUrl);
    }

    if (saveTimeout) return true;

    const debounceMs = CORE_STORAGE_MODE === 'postgresql' ? 250 : 3000;

    saveTimeout = setTimeout(async () => {
        try {
            if (isSaving) return;
            isSaving = true;
            if (MEMORY_DB_CACHE) {
                try {
                    sanitizeAndOffloadDb(MEMORY_DB_CACHE);
                } catch (optErr) {
                    console.error('[DB Optimizer] Optimization on save error:', optErr);
                }

                if (CORE_STORAGE_MODE === 'postgresql') {
                    const hadPendingSpool = HAS_PENDING_PG_SPOOL || fs.existsSync(SMART_PG_SPOOL_FILE);
                    const syncRes = await corePg.syncSmartDbToPostgres(MEMORY_DB_CACHE, {
                        forceFullSync: hadPendingSpool,
                    });
                    if (syncRes?.ok) {
                        if (hadPendingSpool) {
                            clearEmergencyPgSpool();
                            console.log('✅ [Smart Core Failover] Emergency disk spool synced back to PostgreSQL.');
                        }
                    } else {
                        const reason = syncRes?.error || syncRes?.reason || 'postgres_sync_failed';
                        if (!hadPendingSpool) {
                            console.warn(`⚠️ [Smart Core Failover] PostgreSQL unreachable during save (${reason}). Spooling Smart Management data to smart_pg_emergency_spool.json.`);
                        }
                        writeEmergencyPgSpool(MEMORY_DB_CACHE, reason);
                    }
                } else {
                    fs.writeFileSync(DB_FILE, JSON.stringify(MEMORY_DB_CACHE, null, 2));
                    if (corePg.isPostgresConfigured()) {
                        writeEmergencyPgSpool(MEMORY_DB_CACHE, 'postgres_boot_offline');
                    } else if (HAS_PENDING_PG_SPOOL) {
                        clearEmergencyPgSpool();
                    }
                }
            }
        } catch (e) {
            console.error("DB Save Error:", e);
            if (CORE_STORAGE_MODE === 'postgresql' && MEMORY_DB_CACHE) {
                writeEmergencyPgSpool(MEMORY_DB_CACHE, e?.message || 'save_exception');
            }
        } finally {
            saveTimeout = null;
            isSaving = false;
        }
    }, debounceMs);

    return true;
};

// Immediate save for critical operations (e.g. restore, settings publish, shutdown flush)
export const saveDbImmediate = async (data, options = {}) => {
    try {
        if (data) {
            const prevIndustrialErp = MEMORY_DB_CACHE?.industrialErp;
            MEMORY_DB_CACHE = options.normalize ? normalizeSmartDbCache(data) : data;
            if (options.preserveIndustrialErp !== false && !MEMORY_DB_CACHE.industrialErp && prevIndustrialErp) {
                MEMORY_DB_CACHE.industrialErp = prevIndustrialErp;
            }
        }
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        if (MEMORY_DB_CACHE) {
            if (MEMORY_DB_CACHE.settings && MEMORY_DB_CACHE.settings.sayanApiUrl) {
                MEMORY_DB_CACHE.settings.sayanApiUrl = sanitizeSayanUrl(MEMORY_DB_CACHE.settings.sayanApiUrl);
            }
            try {
                sanitizeAndOffloadDb(MEMORY_DB_CACHE);
            } catch (optErr) {
                console.error('[DB Optimizer] Optimization on saveImmediate error:', optErr);
            }

            if (CORE_STORAGE_MODE === 'postgresql' || (corePg.isPostgresConfigured() && await corePg.ensureCorePostgresSchemaReady())) {
                CORE_STORAGE_MODE = 'postgresql';
                const hadPendingSpool = HAS_PENDING_PG_SPOOL || fs.existsSync(SMART_PG_SPOOL_FILE);
                const res = await corePg.syncSmartDbToPostgres(MEMORY_DB_CACHE, {
                    forceFullSync: Boolean(options.forceFullSync) || hadPendingSpool,
                });
                if (res?.ok) {
                    if (hadPendingSpool) clearEmergencyPgSpool();
                    return true;
                }
                writeEmergencyPgSpool(MEMORY_DB_CACHE, res?.error || res?.reason || 'postgres_sync_failed');
                return false;
            } else {
                fs.writeFileSync(DB_FILE, JSON.stringify(MEMORY_DB_CACHE, null, 2));
                if (corePg.isPostgresConfigured()) {
                    writeEmergencyPgSpool(MEMORY_DB_CACHE, 'postgres_boot_offline');
                } else if (HAS_PENDING_PG_SPOOL) {
                    clearEmergencyPgSpool();
                }
            }
        }
        return true;
    } catch (e) {
        console.error("Immediate DB Save Error:", e);
        if (CORE_STORAGE_MODE === 'postgresql' && MEMORY_DB_CACHE) {
            writeEmergencyPgSpool(MEMORY_DB_CACHE, e?.message || 'save_immediate_exception');
        }
        return false;
    }
};

export const flushPendingSaves = async () => {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
        if (MEMORY_DB_CACHE && CORE_STORAGE_MODE === 'postgresql') {
            const hadPendingSpool = HAS_PENDING_PG_SPOOL || fs.existsSync(SMART_PG_SPOOL_FILE);
            const res = await corePg.syncSmartDbToPostgres(MEMORY_DB_CACHE, {
                forceFullSync: hadPendingSpool,
            });
            if (res?.ok) {
                if (hadPendingSpool) clearEmergencyPgSpool();
            } else {
                writeEmergencyPgSpool(MEMORY_DB_CACHE, res?.error || res?.reason || 'postgres_flush_failed');
            }
        } else if (MEMORY_DB_CACHE && CORE_STORAGE_MODE === 'json') {
            try {
                fs.writeFileSync(DB_FILE, JSON.stringify(MEMORY_DB_CACHE, null, 2));
                if (corePg.isPostgresConfigured()) {
                    writeEmergencyPgSpool(MEMORY_DB_CACHE, 'postgres_boot_offline');
                } else if (HAS_PENDING_PG_SPOOL) {
                    clearEmergencyPgSpool();
                }
            } catch {}
        }
    }
    await corePg.waitForPendingCorePgSync();
};

export const refreshCache = async () => {
    MEMORY_DB_CACHE = null;
    if (CORE_STORAGE_MODE === 'postgresql') {
        await initCoreStorage();
        return getDb();
    }
    return getDb();
};

