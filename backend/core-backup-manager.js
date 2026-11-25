import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import {
  SMART_EXCLUDED_ROOT_KEYS,
  isPostgresConfigured,
  recordSmartBackupMetadataInPg,
  listSmartBackupsFromPg,
} from './core-pg-repository.js';

export const getSmartBackupDir = (backupsRootDir) => {
  const dir = path.join(backupsRootDir, 'smart');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const computeCanonicalSha256 = (data) => {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
};

export const extractSmartManagementState = (db) => {
  const clean = {};
  if (!db || typeof db !== 'object') return clean;
  for (const [k, v] of Object.entries(db)) {
    if (SMART_EXCLUDED_ROOT_KEYS.has(k)) continue;
    clean[k] = v;
  }
  return clean;
};

export const computeSmartRecordCounts = (smartData) => {
  const d = smartData || {};
  return {
    users: Array.isArray(d.users) ? d.users.length : 0,
    orders: Array.isArray(d.orders) ? d.orders.length : 0,
    exitPermits: Array.isArray(d.exitPermits) ? d.exitPermits.length : 0,
    warehouseItems: Array.isArray(d.warehouseItems) ? d.warehouseItems.length : 0,
    warehouseTransactions: Array.isArray(d.warehouseTransactions) ? d.warehouseTransactions.length : 0,
    tradeRecords: Array.isArray(d.tradeRecords) ? d.tradeRecords.length : 0,
    chequeReceipts: Array.isArray(d.chequeReceipts) ? d.chequeReceipts.length : 0,
    sayanChequeReceipts: Array.isArray(d.sayan_cheque_receipts) ? d.sayan_cheque_receipts.length : 0,
    sayanSalesInvoicesArchive: Array.isArray(d.sayanSalesInvoicesArchive) ? d.sayanSalesInvoicesArchive.length : 0,
    messages: Array.isArray(d.messages) ? d.messages.length : 0,
    groups: Array.isArray(d.groups) ? d.groups.length : 0,
    tasks: Array.isArray(d.tasks) ? d.tasks.length : 0,
    notes: Array.isArray(d.notes) ? d.notes.length : 0,
    securityLogs: Array.isArray(d.securityLogs) ? d.securityLogs.length : 0,
    secretariatLetters: Array.isArray(d.secretariatLetters) ? d.secretariatLetters.length : 0,
    meetings: Array.isArray(d.meetings) ? d.meetings.length : 0,
    tickets: Array.isArray(d.tickets) ? d.tickets.length : 0,
    purchaseRequests: Array.isArray(d.purchaseRequests) ? d.purchaseRequests.length : 0,
  };
};

export const buildSmartBackupEnvelope = (smartData, storageEngine = 'postgresql') => {
  const cleanData = extractSmartManagementState(smartData);
  const checksumSha256 = computeCanonicalSha256(cleanData);
  const recordCounts = computeSmartRecordCounts(cleanData);

  return {
    formatVersion: 'delkam-smart-core-backup-v2',
    scope: 'smart_management',
    isolatedFromCompanyAccounting: true,
    storageEngine,
    exportedAt: new Date().toISOString(),
    exportedAtMs: Date.now(),
    checksumSha256,
    recordCounts,
    data: cleanData,
  };
};

const sqlQuote = (val) => {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
};

const sqlJsonb = (val, fallback = {}) => {
  const safe = val !== undefined && val !== null ? val : fallback;
  return `${sqlQuote(JSON.stringify(safe))}::jsonb`;
};

const computeSha1 = (val) => {
  const s = typeof val === 'string' ? val : JSON.stringify(val ?? null);
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex');
};

export function generateSmartPostgresSqlDump(envelope) {
  const data = extractSmartManagementState(envelope?.data || envelope || {});
  const envelopeB64 = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');

  const lines = [
    '-- ============================================================================',
    '-- Delkam Smart Management ("مدیریت هوشمند") - PostgreSQL Isolated SQL Dump',
    '-- Scope: smart_kv_store, smart_users, smart_collection_items ONLY',
    '-- Company Accounting (erp_* tables) is 100% isolated and untouched.',
    `-- Exported At:     ${envelope?.exportedAt || new Date().toISOString()}`,
    `-- SHA-256 Checksum:${envelope?.checksumSha256 || ''}`,
    `-- DELKAM_SMART_ENVELOPE_BASE64:${envelopeB64}`,
    '-- ============================================================================',
    '',
    "SET client_encoding = 'UTF8';",
    'SET standard_conforming_strings = on;',
    'BEGIN;',
    '',
    '-- Clear ONLY Smart Management tables (erp_* accounting tables remain untouched)',
    'DELETE FROM smart_collection_items;',
    'DELETE FROM smart_users;',
    'DELETE FROM smart_kv_store;',
    '',
  ];

  // 1. KV Store entries
  for (const [key, val] of Object.entries(data)) {
    if (SMART_EXCLUDED_ROOT_KEYS.has(key) || val === undefined || Array.isArray(val)) continue;
    const hash = computeSha1(val);
    lines.push(
      `INSERT INTO smart_kv_store (key, value_json, checksum) VALUES (${sqlQuote(key)}, ${sqlJsonb(val, {})}, ${sqlQuote(hash)});`
    );
  }

  // 2. Users
  const usersArr = Array.isArray(data.users) ? data.users : [];
  const seenUsers = new Set();
  usersArr.forEach((u, idx) => {
    let uid =
      u && typeof u === 'object' && u.id != null && String(u.id).trim() !== ''
        ? String(u.id).trim()
        : u?.username
        ? `u_${String(u.username).trim()}`
        : `__idx_${idx}`;
    if (seenUsers.has(uid)) uid = `${uid}__dup_${idx}`;
    seenUsers.add(uid);
    const hash = computeSha1(u ?? {});
    const isActive = u?.isActive !== false && u?.disabled !== true;
    const role = String(u?.role || (Array.isArray(u?.roles) ? u.roles[0] : '') || '');
    lines.push(
      `INSERT INTO smart_users (id, username, full_name, role, is_active, record_hash, data) VALUES (${sqlQuote(uid)}, ${sqlQuote(u?.username || '')}, ${sqlQuote(u?.fullName || u?.name || '')}, ${sqlQuote(role)}, ${sqlQuote(isActive)}, ${sqlQuote(hash)}, ${sqlJsonb(u, {})});`
    );
  });

  // 3. All array collections
  for (const [colName, arr] of Object.entries(data)) {
    if (colName === 'users' || SMART_EXCLUDED_ROOT_KEYS.has(colName) || !Array.isArray(arr)) continue;
    const seenIds = new Set();
    arr.forEach((item, idx) => {
      let itemId = '';
      if (item && typeof item === 'object') {
        if (item.id != null && String(item.id).trim() !== '') itemId = String(item.id).trim();
        else if (item._pgId != null && String(item._pgId).trim() !== '') itemId = String(item._pgId).trim();
        else if (item.key != null && String(item.key).trim() !== '') itemId = `k_${String(item.key).trim()}`;
      }
      if (!itemId) itemId = `__idx_${idx}`;
      if (seenIds.has(itemId)) itemId = `${itemId}__dup_${idx}`;
      seenIds.add(itemId);

      const hash = computeSha1(item ?? null);
      const createdMs = Number(item?.createdAt || item?.timestamp || 0) || 0;
      const updatedMs = Number(item?.updatedAt || createdMs || 0) || 0;
      lines.push(
        `INSERT INTO smart_collection_items (collection_name, item_id, item_index, record_hash, created_at_ms, updated_at_ms, data) VALUES (${sqlQuote(colName)}, ${sqlQuote(itemId)}, ${sqlQuote(idx)}, ${sqlQuote(hash)}, ${sqlQuote(createdMs)}, ${sqlQuote(updatedMs)}, ${sqlJsonb(item, {})});`
      );
    });
  }

  lines.push('');
  lines.push('COMMIT;');
  lines.push('-- End of Delkam Smart Management PostgreSQL Dump');
  return lines.join('\n');
}

export function createSmartBackupZipBuffer({
  smartData,
  includeUploadsDir = false,
  uploadsDir = '',
}) {
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildSmartBackupEnvelope(smartData, engine);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const zipFileName = `Smart_Backup_${ts}.zip`;
  const innerSqlName = `Smart_Postgres_${ts}.sql`;
  const innerJsonName = `Smart_Snapshot_${ts}.json`;
  const sqlDumpText = generateSmartPostgresSqlDump(envelope);

  const zip = new AdmZip();
  zip.addFile(innerSqlName, Buffer.from(sqlDumpText, 'utf8'));
  zip.addFile(innerJsonName, Buffer.from(JSON.stringify(envelope, null, 2), 'utf8'));
  if (includeUploadsDir && uploadsDir && fs.existsSync(uploadsDir)) {
    zip.addLocalFolder(uploadsDir, 'uploads');
  }
  const buffer = zip.toBuffer();

  return {
    buffer,
    filename: zipFileName,
    sqlFilename: innerSqlName,
    jsonFilename: innerJsonName,
    size: buffer.length,
    envelope,
  };
}

export async function createSmartBackupZipFile({
  targetFilePath,
  smartData,
  includeUploadsDir = false,
  uploadsDir = '',
  compressionLevel = 9,
}) {
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildSmartBackupEnvelope(smartData, engine);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const innerSqlName = `Smart_Postgres_${ts}.sql`;
  const innerJsonName = `Smart_Snapshot_${ts}.json`;
  const sqlDumpText = generateSmartPostgresSqlDump(envelope);

  const dir = path.dirname(targetFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetFilePath);
    const archive = archiver('zip', { zlib: { level: compressionLevel } });
    output.on('close', () => resolve(true));
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(sqlDumpText, { name: innerSqlName });
    archive.append(JSON.stringify(envelope, null, 2), { name: innerJsonName });
    if (includeUploadsDir && uploadsDir && fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }
    archive.finalize();
  });

  const stat = fs.statSync(targetFilePath);
  return {
    filePath: targetFilePath,
    filename: path.basename(targetFilePath),
    size: stat.size,
    envelope,
  };
}

export async function createSmartSnapshot({
  backupsRootDir,
  smartData,
  backupKind = 'manual',
  createdBy = 'system',
  createdDateJalali = '',
  maxRetained = 25,
}) {
  const smartDir = getSmartBackupDir(backupsRootDir);
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildSmartBackupEnvelope(smartData, engine);
  const rawJson = JSON.stringify(envelope);
  const rawBuffer = Buffer.from(rawJson, 'utf8');

  if (backupKind === 'auto') {
    const existing = fs
      .readdirSync(smartDir)
      .filter((f) => f.endsWith('.json.gz'))
      .sort()
      .reverse();
    if (existing.length > 0) {
      try {
        const latestGz = fs.readFileSync(path.join(smartDir, existing[0]));
        const latestParsed = JSON.parse(zlib.gunzipSync(latestGz).toString('utf8'));
        if (latestParsed?.checksumSha256 === envelope.checksumSha256) {
          return {
            skippedUnchanged: true,
            fileName: existing[0],
            checksumSha256: envelope.checksumSha256,
            recordCounts: envelope.recordCounts,
          };
        }
      } catch {}
    }
  }

  const compressedBuffer = zlib.gzipSync(rawBuffer, { level: 9 });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `Smart_${backupKind}_${ts}.json.gz`;
  const filePath = path.join(smartDir, fileName);
  fs.writeFileSync(filePath, compressedBuffer);

  try {
    const files = fs
      .readdirSync(smartDir)
      .filter((f) => f.endsWith('.json.gz'))
      .sort();
    if (files.length > maxRetained) {
      files.slice(0, files.length - maxRetained).forEach((f) => {
        try {
          fs.unlinkSync(path.join(smartDir, f));
        } catch {}
      });
    }
  } catch {}

  const metadata = {
    id: `smart_bkp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fileName,
    format: 'json.gz',
    backupKind,
    scope: 'smart_management',
    sizeBytes: rawBuffer.length,
    compressedSizeBytes: compressedBuffer.length,
    recordCounts: envelope.recordCounts,
    checksumSha256: envelope.checksumSha256,
    createdBy: String(createdBy || 'system'),
    createdAtMs: envelope.exportedAtMs,
    createdDateJalali: String(createdDateJalali || ''),
  };

  if (isPostgresConfigured()) {
    await recordSmartBackupMetadataInPg(metadata);
  }

  return {
    skippedUnchanged: false,
    ...metadata,
    filePath,
  };
}

export async function listSmartBackups(backupsRootDir) {
  const results = [];
  const seen = new Set();

  const smartDir = getSmartBackupDir(backupsRootDir);
  if (fs.existsSync(smartDir)) {
    for (const f of fs.readdirSync(smartDir)) {
      if (!f.endsWith('.zip') && !f.endsWith('.json.gz') && !f.endsWith('.sql') && !f.endsWith('.json')) continue;
      const fp = path.join(smartDir, f);
      const stat = fs.statSync(fp);
      if (!stat.isFile()) continue;
      seen.add(f);
      results.push({
        name: f,
        size: stat.size,
        date: stat.mtime,
        scope: 'smart_management',
      });
    }
  }

  // Backward compatibility: list legacy root backups (excluding companies/ and ERP_* files)
  if (fs.existsSync(backupsRootDir)) {
    for (const f of fs.readdirSync(backupsRootDir)) {
      if (f === 'companies' || f === 'smart' || f.startsWith('ERP_')) continue;
      if (!(f.startsWith('AutoBackup_') || f.startsWith('Full_Backup_') || f.startsWith('Smart_') || f.endsWith('.zip'))) {
        continue;
      }
      if (seen.has(f)) continue;
      const fp = path.join(backupsRootDir, f);
      const stat = fs.statSync(fp);
      if (!stat.isFile()) continue;
      results.push({
        name: f,
        size: stat.size,
        date: stat.mtime,
        scope: 'smart_management',
      });
    }
  }

  const pgMeta = isPostgresConfigured() ? await listSmartBackupsFromPg(50).catch(() => []) : [];
  const pgMap = new Map(pgMeta.map((m) => [m.fileName, m]));

  return results
    .map((r) => {
      const meta = pgMap.get(r.name);
      return {
        ...r,
        backupKind: meta?.backupKind || (r.name.includes('Auto') || r.name.includes('_auto_') ? 'auto' : 'manual'),
        checksumSha256: meta?.checksumSha256 || null,
        recordCounts: meta?.recordCounts || null,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function resolveSmartBackupFilePath(backupsRootDir, rawFilename) {
  const fileName = path.basename(String(rawFilename || ''));
  if (!fileName || fileName.startsWith('ERP_')) return null;

  const smartDir = path.resolve(getSmartBackupDir(backupsRootDir));
  const smartCandidate = path.resolve(smartDir, fileName);
  if (smartCandidate.startsWith(smartDir + path.sep) && fs.existsSync(smartCandidate)) {
    return smartCandidate;
  }

  const rootDir = path.resolve(backupsRootDir);
  const rootCandidate = path.resolve(rootDir, fileName);
  if (
    rootCandidate.startsWith(rootDir + path.sep) &&
    fs.existsSync(rootCandidate) &&
    fs.statSync(rootCandidate).isFile()
  ) {
    return rootCandidate;
  }
  return null;
}

function tryExtractSmartEnvelopeFromSql(sqlText) {
  const text = String(sqlText || '');
  const smartMatch = text.match(/--\s*DELKAM_SMART_ENVELOPE_BASE64:([A-Za-z0-9+/=]+)/);
  if (smartMatch && smartMatch[1]) {
    return JSON.parse(Buffer.from(smartMatch[1], 'base64').toString('utf8'));
  }
  const erpMatch = text.match(/--\s*DELKAM_ERP_ENVELOPE_BASE64:([A-Za-z0-9+/=]+)/);
  if (erpMatch && erpMatch[1]) {
    return JSON.parse(Buffer.from(erpMatch[1], 'base64').toString('utf8'));
  }
  return null;
}

export function parseAndValidateSmartBackupPayload(input) {
  let parsed = null;
  let zipInstance = null;

  if (Buffer.isBuffer(input)) {
    if (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b) {
      const gunzipped = zlib.gunzipSync(input).toString('utf8');
      parsed = tryExtractSmartEnvelopeFromSql(gunzipped) || JSON.parse(gunzipped);
    } else if (input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b) {
      zipInstance = new AdmZip(input);
      const entries = zipInstance.getEntries().filter((e) => !e.isDirectory);
      const smartJsonEntry = entries.find((e) => /^Smart_Snapshot_.*\.json$/i.test(path.basename(e.entryName)));
      const legacyDbEntry = entries.find((e) => e.entryName === 'database.json' || path.basename(e.entryName) === 'database.json');
      const smartSqlEntry = entries.find((e) => /^Smart_Postgres_.*\.sql$/i.test(path.basename(e.entryName)));
      const anyJsonEntry = entries.find((e) => e.entryName.endsWith('.json'));
      const anySqlEntry = entries.find((e) => e.entryName.endsWith('.sql'));

      if (smartJsonEntry) {
        parsed = JSON.parse(smartJsonEntry.getData().toString('utf8'));
      } else if (legacyDbEntry) {
        parsed = JSON.parse(legacyDbEntry.getData().toString('utf8'));
      } else if (smartSqlEntry) {
        parsed = tryExtractSmartEnvelopeFromSql(smartSqlEntry.getData().toString('utf8'));
      } else if (anyJsonEntry) {
        parsed = JSON.parse(anyJsonEntry.getData().toString('utf8'));
      } else if (anySqlEntry) {
        parsed = tryExtractSmartEnvelopeFromSql(anySqlEntry.getData().toString('utf8'));
      }
      if (!parsed) {
        throw new Error('فایل ZIP فاقد فایل پشتیبان معتبر بخش مدیریت هوشمند است.');
      }
    } else {
      const rawText = input.toString('utf8');
      parsed = tryExtractSmartEnvelopeFromSql(rawText) || JSON.parse(rawText);
    }
  } else if (typeof input === 'string') {
    parsed = tryExtractSmartEnvelopeFromSql(input) || JSON.parse(input);
  } else if (input && typeof input === 'object') {
    parsed = input;
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ساختار فایل پشتیبان نامعتبر است.');
  }

  // Strict guard: Reject Company Accounting backups so they never accidentally restore into Smart Management
  if (
    parsed.formatVersion === 'delkam-erp-company-backup-v2' ||
    parsed.isolatedPerCompany === true ||
    (parsed.state && !parsed.users && !parsed.settings && (Array.isArray(parsed.state.chartOfAccounts) || Array.isArray(parsed.state.vouchers))) ||
    (!parsed.users && !parsed.settings && (Array.isArray(parsed.chartOfAccounts) || Array.isArray(parsed.vouchers)))
  ) {
    throw new Error('فایل انتخاب‌شده بکاپ اختصاصی «حسابداری شرکت‌ها» است. لطفاً آن را از بخش حسابداری صنعتی شرکت‌ها بازیابی کنید.');
  }

  let extractedData = null;
  if (parsed.formatVersion === 'delkam-smart-core-backup-v2' && parsed.data && typeof parsed.data === 'object') {
    if (parsed.checksumSha256) {
      const actualHash = computeCanonicalSha256(parsed.data);
      if (actualHash !== parsed.checksumSha256) {
        throw new Error('کنترل اصالت (SHA-256) فایل پشتیبان ناموفق بود؛ فایل آسیب دیده یا تغییر یافته است.');
      }
    }
    extractedData = extractSmartManagementState(parsed.data);
  } else if (parsed.settings || parsed.users || parsed.orders || parsed.exitPermits || parsed.messages) {
    // Legacy database.json or offline JSON cache backup
    extractedData = extractSmartManagementState(parsed);
  } else {
    throw new Error('فایل انتخاب‌شده فاقد ساختار معتبر پشتیبان مدیریت هوشمند است.');
  }

  return {
    smartData: extractedData,
    zipInstance,
    recordCounts: computeSmartRecordCounts(extractedData),
    checksumSha256: computeCanonicalSha256(extractedData),
  };
}

export async function restoreSmartBackup({
  backupsRootDir,
  currentDb,
  backupInput,
  restoredBy = 'system',
  createdDateJalali = '',
  extractUploadsFn = null,
  saveImmediateFn,
}) {
  const validated = parseAndValidateSmartBackupPayload(backupInput);

  // Automatic pre-restore safety snapshot of current Smart Management data
  if (currentDb && typeof currentDb === 'object') {
    await createSmartSnapshot({
      backupsRootDir,
      smartData: extractSmartManagementState(currentDb),
      backupKind: 'pre_restore',
      createdBy: restoredBy,
      createdDateJalali,
    }).catch(() => {});
  }

  // Strictly preserve existing Industrial ERP / Company Accounting state in memory & PostgreSQL
  const preservedIndustrialErp = currentDb?.industrialErp;
  const restoredFullDb = {
    ...validated.smartData,
    ...(preservedIndustrialErp ? { industrialErp: preservedIndustrialErp } : {}),
  };

  if (typeof saveImmediateFn === 'function') {
    await saveImmediateFn(restoredFullDb, { forceFullSync: true });
  }

  let uploadsRestored = false;
  if (validated.zipInstance && typeof extractUploadsFn === 'function') {
    uploadsRestored = Boolean(extractUploadsFn(validated.zipInstance));
  }

  return {
    mode: validated.zipInstance ? 'zip' : 'db',
    uploadsRestored,
    recordCounts: validated.recordCounts,
    checksumSha256: validated.checksumSha256,
  };
}
