import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import {
  isPostgresConfigured,
  getCompanyErpStateFromPg,
  saveCompanyErpStateToPg,
  recordCompanyBackupMetadataInPg,
  listCompanyBackupsFromPg,
} from './erp-pg-repository.js';

export const sanitizeCompanyFolderName = (companyId) => {
  const clean = String(companyId || 'default_company')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean || 'default_company';
};

export const getCompanyBackupDir = (backupsRootDir, companyId) => {
  const dir = path.join(backupsRootDir, 'companies', sanitizeCompanyFolderName(companyId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const computeCanonicalSha256 = (data) => {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
};

export const computeCompanyRecordCounts = (state) => ({
  productionLines: Array.isArray(state?.productionLines) ? state.productionLines.length : 0,
  commodityGroups: Array.isArray(state?.commodityGroups) ? state.commodityGroups.length : 0,
  warehouses: Array.isArray(state?.warehouses) ? state.warehouses.length : 0,
  items: Array.isArray(state?.items) ? state.items.length : 0,
  boms: Array.isArray(state?.boms) ? state.boms.length : 0,
  cartonLabels: Array.isArray(state?.cartonLabels) ? state.cartonLabels.length : 0,
  productionVouchers: Array.isArray(state?.productionVouchers) ? state.productionVouchers.length : 0,
  warehouseDocuments: Array.isArray(state?.warehouseDocuments) ? state.warehouseDocuments.length : 0,
  remittances: Array.isArray(state?.remittances) ? state.remittances.length : 0,
  tradeDocs: Array.isArray(state?.tradeDocs) ? state.tradeDocs.length : 0,
  treasuryDocs: Array.isArray(state?.treasuryDocs) ? state.treasuryDocs.length : 0,
  vouchers: Array.isArray(state?.vouchers) ? state.vouchers.length : 0,
  chartOfAccounts: Array.isArray(state?.chartOfAccounts) ? state.chartOfAccounts.length : 0,
});

export const buildIsolatedCompanyBackupEnvelope = (companyId, companyName, state, storageEngine = 'postgresql') => {
  const cleanState = {
    ...state,
    companyId,
    companyName: companyName || state?.companyName || companyId,
  };
  delete cleanState.companiesData;

  const checksumSha256 = computeCanonicalSha256(cleanState);
  const recordCounts = computeCompanyRecordCounts(cleanState);

  return {
    formatVersion: 'delkam-erp-company-backup-v2',
    isolatedPerCompany: true,
    storageEngine,
    companyId,
    companyName: cleanState.companyName,
    activeFiscalYear: cleanState.activeFiscalYear || '1405',
    exportedAt: new Date().toISOString(),
    exportedAtMs: Date.now(),
    checksumSha256,
    recordCounts,
    state: cleanState,
  };
};

// Creates a compact per-company .json.gz snapshot inside backups/companies/<companyId>/
// Skips writing a duplicate auto-backup if the company checksum matches the newest snapshot.
export async function createIsolatedCompanySnapshot({
  backupsRootDir,
  companyId,
  companyName,
  state,
  backupKind = 'manual',
  createdBy = 'system',
  createdDateJalali = '',
  maxRetainedPerCompany = 15,
}) {
  const companyDir = getCompanyBackupDir(backupsRootDir, companyId);
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildIsolatedCompanyBackupEnvelope(companyId, companyName, state, engine);
  const rawJson = JSON.stringify(envelope);
  const rawBuffer = Buffer.from(rawJson, 'utf8');

  // Smart deduplication for automatic scheduled backups: avoid identical disk bloat
  if (backupKind === 'auto') {
    const metaFiles = fs
      .readdirSync(companyDir)
      .filter((f) => f.endsWith('.json.gz'))
      .sort()
      .reverse();
    if (metaFiles.length > 0) {
      try {
        const latestGz = fs.readFileSync(path.join(companyDir, metaFiles[0]));
        const latestParsed = JSON.parse(zlib.gunzipSync(latestGz).toString('utf8'));
        if (latestParsed?.checksumSha256 === envelope.checksumSha256) {
          return {
            skippedUnchanged: true,
            fileName: metaFiles[0],
            companyId,
            checksumSha256: envelope.checksumSha256,
            recordCounts: envelope.recordCounts,
          };
        }
      } catch {}
    }
  }

  const compressedBuffer = zlib.gzipSync(rawBuffer, { level: 9 });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeComp = sanitizeCompanyFolderName(companyId);
  const fileName = `ERP_${safeComp}_${backupKind}_${ts}.json.gz`;
  const filePath = path.join(companyDir, fileName);

  fs.writeFileSync(filePath, compressedBuffer);

  // Retain only newest N snapshots per company to keep Windows storage compact
  try {
    const files = fs
      .readdirSync(companyDir)
      .filter((f) => f.endsWith('.json.gz'))
      .sort();
    if (files.length > maxRetainedPerCompany) {
      const toRemove = files.slice(0, files.length - maxRetainedPerCompany);
      toRemove.forEach((f) => {
        try {
          fs.unlinkSync(path.join(companyDir, f));
        } catch {}
      });
    }
  } catch {}

  const metadata = {
    id: `bkp_${safeComp}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    companyId,
    companyName: envelope.companyName,
    fileName,
    format: 'json.gz',
    backupKind,
    sizeBytes: rawBuffer.length,
    compressedSizeBytes: compressedBuffer.length,
    recordCounts: envelope.recordCounts,
    checksumSha256: envelope.checksumSha256,
    createdBy: String(createdBy || 'system'),
    createdAtMs: envelope.exportedAtMs,
    createdDateJalali: String(createdDateJalali || ''),
  };

  if (isPostgresConfigured()) {
    await recordCompanyBackupMetadataInPg(metadata);
  }

  return {
    skippedUnchanged: false,
    ...metadata,
    filePath,
  };
}

// Lists saved isolated snapshots strictly for the requested companyId
export async function listIsolatedCompanySnapshots(backupsRootDir, companyId) {
  const companyDir = getCompanyBackupDir(backupsRootDir, companyId);
  const diskFiles = fs
    .readdirSync(companyDir)
    .filter((f) => f.endsWith('.json.gz') || f.endsWith('.json') || f.endsWith('.zip'))
    .map((f) => {
      const fp = path.join(companyDir, f);
      const stat = fs.statSync(fp);
      let kind = 'manual';
      if (f.includes('_auto_')) kind = 'auto';
      else if (f.includes('_pre_restore_')) kind = 'pre_restore';
      return {
        fileName: f,
        backupKind: kind,
        compressedSizeBytes: stat.size,
        createdAtMs: Math.round(stat.mtimeMs),
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const pgMeta = isPostgresConfigured() ? await listCompanyBackupsFromPg(companyId) : [];
  const pgMap = new Map(pgMeta.map((m) => [m.fileName, m]));

  return diskFiles.map((df) => {
    const meta = pgMap.get(df.fileName);
    return {
      id: meta?.id || df.fileName,
      companyId,
      companyName: meta?.companyName || '',
      fileName: df.fileName,
      format: df.fileName.endsWith('.zip') ? 'zip' : df.fileName.endsWith('.json.gz') ? 'json.gz' : 'json',
      backupKind: meta?.backupKind || df.backupKind,
      sizeBytes: meta?.sizeBytes || df.compressedSizeBytes,
      compressedSizeBytes: df.compressedSizeBytes,
      recordCounts: meta?.recordCounts || null,
      checksumSha256: meta?.checksumSha256 || null,
      createdBy: meta?.createdBy || 'system',
      createdAtMs: meta?.createdAtMs || df.createdAtMs,
      createdDateJalali: meta?.createdDateJalali || '',
    };
  });
}

// Creates a compact ZIP file containing ONLY a single company's ERP backup JSON
export async function createIsolatedCompanyBackupZip({
  backupsRootDir,
  companyId,
  companyName,
  state,
}) {
  const companyDir = getCompanyBackupDir(backupsRootDir, companyId);
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildIsolatedCompanyBackupEnvelope(companyId, companyName, state, engine);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeComp = sanitizeCompanyFolderName(companyId);
  const zipFileName = `ERP_Backup_${safeComp}_${ts}.zip`;
  const zipFilePath = path.join(companyDir, zipFileName);
  const innerJsonName = `ERP_${safeComp}_${ts}.json`;

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve({ filePath: zipFilePath, filename: zipFileName, size: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(JSON.stringify(envelope, null, 2), { name: innerJsonName });
    archive.finalize();
  });

  // Keep max 5 zip artifacts in company folder so disk remains compact
  try {
    const zips = fs.readdirSync(companyDir).filter((f) => f.endsWith('.zip')).sort();
    if (zips.length > 5) {
      zips.slice(0, zips.length - 5).forEach((f) => {
        try { fs.unlinkSync(path.join(companyDir, f)); } catch {}
      });
    }
  } catch {}

  const stat = fs.statSync(zipFilePath);
  return {
    filePath: zipFilePath,
    filename: zipFileName,
    size: stat.size,
    envelope,
  };
}

// Parses & validates a company backup payload (.json, .json.gz, or .zip buffer/object)
export function parseAndValidateCompanyBackupPayload(input) {
  let parsed = null;

  if (Buffer.isBuffer(input)) {
    // Detect ZIP (PK\x03\x04) or GZIP (\x1f\x8b) or plain UTF-8 JSON
    if (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b) {
      parsed = JSON.parse(zlib.gunzipSync(input).toString('utf8'));
    } else if (input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b) {
      const zip = new AdmZip(input);
      const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.endsWith('.json'));
      if (entries.length === 0) {
        throw new Error('فایل ZIP فاقد فایل پشتیبان JSON معتبر است.');
      }
      parsed = JSON.parse(entries[0].getData().toString('utf8'));
    } else {
      parsed = JSON.parse(input.toString('utf8'));
    }
  } else if (typeof input === 'string') {
    parsed = JSON.parse(input);
  } else if (input && typeof input === 'object') {
    parsed = input;
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ساختار فایل پشتیبان نامعتبر است.');
  }

  // Reject accidental full system database.json uploads to protect other companies
  if (parsed.companiesData || parsed.exitPermits || parsed.paymentOrders || parsed.users) {
    throw new Error('فایل انتخابی بکاپ کلی سامانه است. لطفاً فقط فایل بکاپ اختصاصی شرکت را انتخاب کنید.');
  }

  let extractedState = null;
  let sourceCompanyId = null;
  let sourceCompanyName = null;

  if (parsed.formatVersion && parsed.state && typeof parsed.state === 'object') {
    if (parsed.checksumSha256) {
      const actualHash = computeCanonicalSha256(parsed.state);
      if (actualHash !== parsed.checksumSha256) {
        throw new Error('کنترل اصالت (SHA-256) فایل پشتیبان ناموفق بود؛ فایل تغییر یافته یا آسیب دیده است.');
      }
    }
    extractedState = parsed.state;
    sourceCompanyId = parsed.companyId || parsed.state.companyId || null;
    sourceCompanyName = parsed.companyName || parsed.state.companyName || null;
  } else if (Array.isArray(parsed.chartOfAccounts) || Array.isArray(parsed.items) || Array.isArray(parsed.vouchers)) {
    // Legacy per-company direct JSON download compatibility
    extractedState = parsed;
    sourceCompanyId = parsed.companyId || null;
    sourceCompanyName = parsed.companyName || null;
  } else {
    throw new Error('فایل پشتیبان ساختار معتبر حسابداری شرکتی ندارد.');
  }

  return {
    state: extractedState,
    sourceCompanyId,
    sourceCompanyName,
    recordCounts: computeCompanyRecordCounts(extractedState),
    checksumSha256: computeCanonicalSha256(extractedState),
  };
}

// Restores a single company snapshot/file strictly into targetCompanyId without touching other companies
export async function restoreIsolatedCompanyBackup({
  backupsRootDir,
  targetCompanyId,
  targetCompanyName,
  settingsCompany = null,
  currentStateForSafetySnapshot = null,
  backupInput,
  allowCrossCompanyImport = false,
  restoredBy = 'system',
  createdDateJalali = '',
  legacyJsonSyncFn = null,
}) {
  const validated = parseAndValidateCompanyBackupPayload(backupInput);

  if (
    validated.sourceCompanyId &&
    validated.sourceCompanyId !== targetCompanyId &&
    !allowCrossCompanyImport
  ) {
    throw new Error(
      `این فایل پشتیبان متعلق به شرکت «${validated.sourceCompanyName || validated.sourceCompanyId}» است و با شرکت فعلی «${targetCompanyName}» مطابقت ندارد.`
    );
  }

  // Take an automatic safety snapshot right before restoring so rollback is always possible
  if (currentStateForSafetySnapshot) {
    await createIsolatedCompanySnapshot({
      backupsRootDir,
      companyId: targetCompanyId,
      companyName: targetCompanyName,
      state: currentStateForSafetySnapshot,
      backupKind: 'pre_restore',
      createdBy: restoredBy,
      createdDateJalali,
    });
  }

  const normalizedRestoredState = {
    ...validated.state,
    companyId: targetCompanyId,
    companyName: targetCompanyName || validated.sourceCompanyName || 'شرکت تولیدی',
  };
  delete normalizedRestoredState.companiesData;

  let finalState = normalizedRestoredState;
  if (isPostgresConfigured()) {
    const pgRes = await saveCompanyErpStateToPg(targetCompanyId, normalizedRestoredState, targetCompanyName, {
      forceReplace: true,
      settingsCompany,
    });
    if (pgRes?.state) {
      finalState = pgRes.state;
    }
  }

  if (typeof legacyJsonSyncFn === 'function') {
    legacyJsonSyncFn(finalState);
  }

  return {
    state: finalState,
    recordCounts: validated.recordCounts,
    checksumSha256: validated.checksumSha256,
  };
}

// Helper for server startup: resolves authoritative company state (PostgreSQL when configured, else JSON fallback)
export async function loadAuthoritativeCompanyErpState({
  companyId,
  companyName,
  settingsCompany,
  legacyState,
}) {
  if (isPostgresConfigured()) {
    const pgState = await getCompanyErpStateFromPg(companyId, companyName, settingsCompany, legacyState);
    if (pgState) return pgState;
  }
  return legacyState;
}
