import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import https from 'https';
import { fileURLToPath } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import FormData from 'form-data';
import * as dbManager from './backend/db-manager.js';
import * as corePg from './backend/core-pg-repository.js';
import * as coreBackupMgr from './backend/core-backup-manager.js';
import * as erpPg from './backend/erp-pg-repository.js';
import * as erpBackupMgr from './backend/erp-backup-manager.js';
import * as utils from './backend/utils.js';

try {
    dns.setDefaultResultOrder('ipv4first');
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');

const action = process.argv[2] || 'backup'; // 'update' | 'uninstall' | 'backup'
const reasonLabel =
    action === 'update'
        ? 'عملیات آپدیت سیستم'
        : action === 'uninstall'
        ? 'عملیات آنیستال سیستم'
        : 'عملیات پشتیبان‌گیری';

const MAX_BOT_UPLOAD_BYTES = 45 * 1024 * 1024; // Keep safely under Telegram 50MB bot limit

const normCompKey = (nameStr) =>
    String(nameStr || '')
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/\u200c/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const makeStableCompanyId = (nameStr) => {
    const clean = normCompKey(nameStr);
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
        hash = (hash << 5) - hash + clean.charCodeAt(i);
        hash |= 0;
    }
    return 'comp_' + Math.abs(hash).toString(36);
};

function resolveBackupChatIds(db) {
    const settings = db?.settings || {};
    const tgIds = new Set();
    const baleIds = new Set();

    const pushIds = (setRef, rawVal) => {
        if (!rawVal) return;
        String(rawVal)
            .split(/[,،;\n\r]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((v) => setRef.add(utils.sanitizeGroupId ? utils.sanitizeGroupId(v) : v));
    };

    pushIds(
        tgIds,
        settings.backupAdminTelegramChatId ||
            settings.telegramChatId ||
            settings.telegramAdminId ||
            settings.telegramChannelId ||
            settings.telegram_chat_id ||
            settings.defaultTelegramId ||
            settings.telegramGroupId
    );
    pushIds(
        baleIds,
        settings.backupAdminBaleChatId ||
            settings.baleChatId ||
            settings.baleAdminId ||
            settings.baleChannelId ||
            settings.bale_chat_id ||
            settings.defaultBaleId ||
            settings.baleGroupId
    );

    if (tgIds.size === 0 || baleIds.size === 0) {
        const adminUsers = Array.isArray(db?.users)
            ? db.users.filter(
                  (u) =>
                      String(u?.role || '').toLowerCase() === 'admin' ||
                      String(u?.username || '').toLowerCase() === 'admin'
              )
            : [];
        adminUsers.forEach((u) => {
            if (tgIds.size === 0 && u?.telegramChatId) pushIds(tgIds, u.telegramChatId);
            if (baleIds.size === 0 && u?.baleChatId) pushIds(baleIds, u.baleChatId);
        });
    }

    return {
        tgChatIds: Array.from(tgIds),
        baleChatIds: Array.from(baleIds),
    };
}

async function resolveAllAccountingCompanies(db) {
    const companyMap = new Map();
    const byId = new Map();

    const registerCompany = (compObj) => {
        if (!compObj) return;
        const cleanName = String(compObj.name || '').trim();
        const cid = String(compObj.id || '').trim() || (cleanName ? makeStableCompanyId(cleanName) : '');
        if (!cid && !cleanName) return;
        const mapKey = cleanName ? normCompKey(cleanName) : cid;
        const existing = companyMap.get(mapKey) || byId.get(cid);
        if (existing) {
            if (!existing.banks?.length && Array.isArray(compObj.banks)) {
                existing.banks = compObj.banks;
            }
            return;
        }
        const entry = {
            ...compObj,
            id: cid || makeStableCompanyId(cleanName),
            name: cleanName || cid,
            isAccountingEnabled: compObj.isAccountingEnabled !== undefined ? compObj.isAccountingEnabled : true,
            banks: Array.isArray(compObj.banks) ? compObj.banks : [],
        };
        companyMap.set(mapKey, entry);
        byId.set(entry.id, entry);
    };

    const settings = db?.settings || {};
    (settings.companies || []).forEach((c) => {
        if (c && c.name && String(c.name).trim()) {
            const mapKey = normCompKey(c.name);
            if (
                c.id === 'comp_arian' &&
                !(settings.companyNames || []).some((n) => normCompKey(n) === mapKey) &&
                (settings.companyNames || []).length > 0
            ) {
                return;
            }
            registerCompany(c);
        }
    });

    (settings.companyNames || []).forEach((name) => {
        if (name && String(name).trim()) {
            registerCompany({
                id: makeStableCompanyId(name),
                name: String(name).trim(),
                showInWarehouse: true,
                isAccountingEnabled: true,
                banks: [],
            });
        }
    });

    if (Array.isArray(settings.fiscalYears)) {
        settings.fiscalYears.forEach((fy) => {
            if (fy?.companySequences && typeof fy.companySequences === 'object') {
                Object.keys(fy.companySequences).forEach((k) => {
                    if (k && String(k).trim()) {
                        registerCompany({
                            id: makeStableCompanyId(k),
                            name: String(k).trim(),
                            showInWarehouse: true,
                            isAccountingEnabled: true,
                            banks: [],
                        });
                    }
                });
            }
        });
    }

    // Also inspect PostgreSQL erp_companies directly so zero PG accounting companies are ever missed
    if (erpPg.isPostgresConfigured()) {
        try {
            const pgStatsMap = await erpPg.getAllCompanyStatsFromPg();
            if (pgStatsMap && pgStatsMap.size > 0) {
                for (const [cid, info] of pgStatsMap.entries()) {
                    if (cid && info?.companyName) {
                        registerCompany({
                            id: cid,
                            name: info.companyName,
                            isAccountingEnabled: true,
                            banks: [],
                        });
                    }
                }
            }
        } catch (err) {
            console.warn('[PreAction Backup] Could not list PG erp_companies:', err?.message || err);
        }
    }

    // Also include any legacy industrialErp.companiesData keys not yet registered
    const legacyCompaniesData = db?.industrialErp?.companiesData || {};
    for (const [cid, st] of Object.entries(legacyCompaniesData)) {
        if (st && typeof st === 'object' && (st.companyName || cid)) {
            registerCompany({
                id: cid,
                name: st.companyName || cid,
                isAccountingEnabled: true,
                banks: [],
            });
        }
    }

    let list = Array.from(companyMap.values()).filter((c) => c.isAccountingEnabled !== false);
    if (list.length > 1 && list.some((c) => c.name !== 'شرکت اصلی')) {
        list = list.filter(
            (c) =>
                c.name !== 'شرکت اصلی' ||
                c.logo ||
                c.registrationNumber ||
                c.nationalId ||
                c.address ||
                c.economicCode ||
                (c.banks && c.banks.length > 0)
        );
    }
    if (list.length > 1 && list.some((c) => c.id !== 'comp_arian')) {
        list = list.filter((c) => c.id !== 'comp_arian');
    }
    if (list.length === 0) {
        list = [{ id: 'comp_default', name: 'شرکت پیش‌فرض', isAccountingEnabled: true, banks: [] }];
    }
    return list;
}

async function dispatchZipBufferToBots({ settings, tgChatIds, baleChatIds, buffer, filename, caption }) {
    const tgToken = settings?.telegramBotToken ? String(settings.telegramBotToken).trim() : '';
    const baleToken = settings?.baleBotToken ? String(settings.baleBotToken).trim() : '';

    if (!tgToken && !baleToken) return { skipped: 'no_tokens' };
    if (tgChatIds.length === 0 && baleChatIds.length === 0) return { skipped: 'no_chat_ids' };

    const tasks = [];

    if (tgToken && tgChatIds.length > 0) {
        tasks.push(
            (async () => {
                const requestOptions = { agentOptions: { keepAlive: true, family: 4 }, timeout: 8000 };
                if (process.env.PROXY_URL) requestOptions.proxy = process.env.PROXY_URL;
                const bot = new TelegramBot(tgToken, { polling: false, request: requestOptions });
                for (const chatId of tgChatIds) {
                    try {
                        await Promise.race([
                            bot.sendDocument(chatId, buffer, { caption }, { filename, contentType: 'application/zip' }),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Telegram offline timeout')), 10000)
                            ),
                        ]);
                        console.log(`✅ Sent ${filename} to Telegram (${chatId})`);
                        break;
                    } catch (tgErr) {
                        console.warn(`⚠️ Telegram skip (${chatId}) for ${filename}: ${tgErr.message}`);
                    }
                }
            })()
        );
    }

    if (baleToken && baleChatIds.length > 0) {
        tasks.push(
            (async () => {
                for (const chatId of baleChatIds) {
                    try {
                        const form = new FormData();
                        form.append('chat_id', chatId);
                        form.append('document', buffer, { filename, contentType: 'application/zip' });
                        form.append('caption', caption);

                        await new Promise((resolve, reject) => {
                            const req = https.request(
                                {
                                    hostname: 'tapi.bale.ai',
                                    path: `/bot${baleToken}/sendDocument`,
                                    method: 'POST',
                                    headers: form.getHeaders(),
                                    timeout: 8000,
                                },
                                (res) => {
                                    let body = '';
                                    res.on('data', (c) => (body += c));
                                    res.on('end', () => {
                                        try {
                                            const parsed = JSON.parse(body);
                                            if (parsed && parsed.ok === false) {
                                                return reject(new Error(parsed.description || 'Bale error'));
                                            }
                                            resolve(parsed);
                                        } catch {
                                            resolve({ raw: body });
                                        }
                                    });
                                }
                            );
                            req.on('error', reject);
                            req.on('timeout', () => {
                                req.destroy();
                                reject(new Error('Bale upload timeout'));
                            });
                            form.pipe(req);
                        });
                        console.log(`✅ Sent ${filename} to Bale (${chatId})`);
                        break;
                    } catch (baleErr) {
                        console.warn(`⚠️ Bale skip (${chatId}) for ${filename}: ${baleErr.message}`);
                    }
                }
            })()
        );
    }

    await Promise.allSettled(tasks);
}

async function main() {
    console.log(`>>> Starting PostgreSQL-first pre-action backup for: ${action}`);

    if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    try {
        await dbManager.initCoreStorage();
    } catch (err) {
        console.warn('[PreAction Backup] Core storage init warning:', err?.message || err);
    }

    const db = dbManager.getDb();
    if (!db || typeof db !== 'object' || Object.keys(db).length === 0) {
        console.warn('No Smart Management data found in PostgreSQL or database.json; skipping pre-action backup.');
        return;
    }

    const coreStatus = dbManager.getCoreStorageStatus();
    const settings = db.settings || {};
    const mode = settings.backupMode || 'full';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const todayJalali = utils.toShamsiFull(new Date()).split(' ')[0] || '';
    const { tgChatIds, baleChatIds } = resolveBackupChatIds(db);

    // -------------------------------------------------------------------------
    // 1. SMART MANAGEMENT POSTGRESQL BACKUP (smart_* tables + optional uploads)
    // -------------------------------------------------------------------------
    try {
        const smartDir = coreBackupMgr.getSmartBackupDir(BACKUPS_DIR);
        const smartData = coreBackupMgr.extractSmartManagementState(db);
        const smartFilename = `PreAction_Smart_${action}_${mode === 'full' ? 'Full' : 'DB'}_${timestamp}.zip`;
        const smartFilePath = path.join(smartDir, smartFilename);

        const smartZipRes = await coreBackupMgr.createSmartBackupZipFile({
            targetFilePath: smartFilePath,
            smartData,
            includeUploadsDir: mode === 'full',
            uploadsDir: UPLOADS_DIR,
            compressionLevel: 9,
        });

        console.log(
            `✅ [Smart Management Backup] ${smartFilename} (${(smartZipRes.size / 1024 / 1024).toFixed(2)} MB | Engine: ${coreStatus.mode})`
        );

        if (corePg.isPostgresConfigured()) {
            await corePg
                .recordSmartBackupMetadataInPg({
                    id: `smart_pre_${action}_${Date.now()}`,
                    fileName: smartFilename,
                    format: 'zip',
                    backupKind: 'pre_action',
                    scope: 'smart_management',
                    sizeBytes: smartZipRes.size,
                    compressedSizeBytes: smartZipRes.size,
                    recordCounts: smartZipRes.envelope.recordCounts,
                    checksumSha256: smartZipRes.envelope.checksumSha256,
                    createdBy: `pre-${action}`,
                    createdAtMs: smartZipRes.envelope.exportedAtMs,
                    createdDateJalali: todayJalali,
                })
                .catch(() => {});
        }

        // Dispatch Smart Management PostgreSQL backup to Telegram/Bale (fallback to DB-only SQL+JSON ZIP if uploads > 45MB)
        let botFilename = smartFilename;
        let botBuffer = null;
        if (smartZipRes.size <= MAX_BOT_UPLOAD_BYTES) {
            botBuffer = fs.readFileSync(smartFilePath);
        } else {
            const dbOnlyZip = coreBackupMgr.createSmartBackupZipBuffer({
                smartData,
                includeUploadsDir: false,
            });
            botFilename = `PreAction_Smart_${action}_DB_${timestamp}.zip`;
            botBuffer = dbOnlyZip.buffer;
            console.log(
                `ℹ️ Full Smart ZIP exceeded 45MB for bot upload; sending compact PostgreSQL SQL+JSON archive (${botFilename}, full backup preserved on disk).`
            );
        }

        const counts = smartZipRes.envelope?.recordCounts || {};
        const smartCaption =
            `⚠️ نسخه پشتیبان اضطراری «مدیریت هوشمند» (${reasonLabel})\n` +
            `🗄️ منبع: ${coreStatus.mode === 'postgresql' ? 'PostgreSQL (جداول smart_*)' : 'JSON محلی'}\n` +
            `⏰ تاریخ: ${new Date().toLocaleString('fa-IR')}\n` +
            `💾 فایل: ${botFilename}\n` +
            `📊 دستورپرداخت: ${counts.orders || 0} | حواله: ${counts.exitPermits || 0} | چک صیادی: ${counts.sayanChequeReceipts || 0}\n` +
            `🔒 بکاپ هر شرکت حسابداری به صورت جداگانه ارسال می‌شود.`;

        await dispatchZipBufferToBots({
            settings,
            tgChatIds,
            baleChatIds,
            buffer: botBuffer,
            filename: botFilename,
            caption: smartCaption,
        });
    } catch (smartErr) {
        console.error('❌ [Smart Management Backup] Error:', smartErr?.message || smartErr);
    }

    // -------------------------------------------------------------------------
    // 2. ALL COMPANIES ACCOUNTING POSTGRESQL BACKUPS (erp_* tables, isolated)
    // -------------------------------------------------------------------------
    try {
        const companies = await resolveAllAccountingCompanies(db);
        const erpEngine = erpPg.isPostgresConfigured() ? 'postgresql' : 'json';
        console.log(`>>> Backing up ${companies.length} accounting company(s) from ${erpEngine}...`);

        for (const comp of companies) {
            try {
                const legacySt = db?.industrialErp?.companiesData?.[comp.id] || {
                    companyId: comp.id,
                    companyName: comp.name,
                };
                const state = await erpBackupMgr.loadAuthoritativeCompanyErpState({
                    companyId: comp.id,
                    companyName: comp.name,
                    settingsCompany: comp,
                    legacyState: legacySt,
                });

                const safeComp = erpBackupMgr.sanitizeCompanyFolderName(comp.id);
                const diskZip = await erpBackupMgr.createIsolatedCompanyBackupZip({
                    backupsRootDir: BACKUPS_DIR,
                    companyId: comp.id,
                    companyName: comp.name,
                    state,
                });

                console.log(
                    `✅ [ERP Company Backup] ${comp.name} (${comp.id}) -> ${diskZip.filename} (${(diskZip.size / 1024).toFixed(1)} KB | Engine: ${erpEngine})`
                );

                if (erpPg.isPostgresConfigured()) {
                    await erpPg
                        .recordCompanyBackupMetadataInPg({
                            id: `bkp_pre_${safeComp}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                            companyId: comp.id,
                            companyName: comp.name,
                            fileName: diskZip.filename,
                            format: 'zip',
                            backupKind: 'pre_action',
                            sizeBytes: diskZip.size,
                            compressedSizeBytes: diskZip.size,
                            recordCounts: diskZip.envelope.recordCounts,
                            checksumSha256: diskZip.envelope.checksumSha256,
                            createdBy: `pre-${action}`,
                            createdAtMs: diskZip.envelope.exportedAtMs,
                            createdDateJalali: todayJalali,
                        })
                        .catch(() => {});
                }

                const botZipFilename = `PreAction_ERP_${safeComp}_${action}_${timestamp}.zip`;
                const counts = diskZip.envelope?.recordCounts || {};
                const erpCaption =
                    `⚠️ نسخه پشتیبان اضطراری حسابداری شرکت «${comp.name}» (${reasonLabel})\n` +
                    `🆔 شناسه: ${comp.id}\n` +
                    `🗄️ منبع: ${erpEngine === 'postgresql' ? 'PostgreSQL (جداول erp_*)' : 'JSON محلی'}\n` +
                    `📦 کارتن‌ها: ${counts.cartonLabels || 0} | اسناد مالی: ${counts.vouchers || 0} | کالاها: ${counts.items || 0}\n` +
                    `🔐 SHA-256: ${String(diskZip.envelope?.checksumSha256 || '').slice(0, 16)}...\n` +
                    `⏰ ${new Date().toLocaleString('fa-IR')}`;

                const erpBuf = fs.readFileSync(diskZip.filePath);
                await dispatchZipBufferToBots({
                    settings,
                    tgChatIds,
                    baleChatIds,
                    buffer: erpBuf,
                    filename: botZipFilename,
                    caption: erpCaption,
                });
            } catch (compErr) {
                console.error(`❌ [ERP Company Backup] ${comp.name} failed:`, compErr?.message || compErr);
            }
        }
    } catch (erpErr) {
        console.error('❌ [ERP Companies Backup] Error:', erpErr?.message || erpErr);
    }

    console.log('Pre-action PostgreSQL backup sequence completed!');
}

main()
    .catch((err) => {
        console.error('Fatal in main pre-action-backup:', err);
    })
    .finally(async () => {
        await Promise.allSettled([corePg.closeCorePgPools(), erpPg.closeErpPgPools()]);
        process.exit(0);
    });

