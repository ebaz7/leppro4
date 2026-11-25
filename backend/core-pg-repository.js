import crypto from 'crypto';
import { Pool } from 'pg';

export const SMART_EXCLUDED_ROOT_KEYS = new Set(['industrialErp', 'companiesData']);

export const isPostgresConfigured = () =>
  Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME && process.env.SQL_USER);

const computeHash = (val) => {
  const str = typeof val === 'string' ? val : JSON.stringify(val ?? null);
  return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
};

const isTransientPgError = (error) => {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === '57P01' ||
    msg.includes('timeout') ||
    msg.includes('connection terminated') ||
    msg.includes('connect econnrefused') ||
    msg.includes('connection ended unexpectedly')
  );
};

const markCorePgFailure = (contextLabel, error) => {
  const msg = error?.message || String(error || 'خطای اتصال PostgreSQL');
  globalThis._corePgSchemaReady = false;
  globalThis._corePgLastFailedAt = Date.now();
  globalThis._corePgHealth = {
    ...(globalThis._corePgHealth || {}),
    configured: isPostgresConfigured(),
    connected: false,
    schemaReady: false,
    lastError: msg,
    lastCheckedAt: Date.now(),
  };
  if (isTransientPgError(error)) {
    console.warn(`[Smart Core PostgreSQL] ${contextLabel}:`, msg);
  } else {
    console.error(`[Smart Core PostgreSQL] ${contextLabel}:`, msg);
  }
};

export const getCorePgPool = () => {
  if (!isPostgresConfigured()) return null;
  const sig = `${process.env.SQL_HOST}|${process.env.SQL_PORT || ''}|${process.env.SQL_DB_NAME}|${process.env.SQL_USER}`;
  if (globalThis._corePostgresPool && globalThis._corePostgresPoolSig !== sig) {
    try {
      globalThis._corePostgresPool.end().catch(() => {});
    } catch {}
    globalThis._corePostgresPool = null;
    globalThis._corePgSchemaReady = false;
  }
  if (!globalThis._corePostgresPool) {
    globalThis._corePostgresPoolSig = sig;
    globalThis._corePostgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ...(process.env.SQL_PORT ? { port: Number(process.env.SQL_PORT) } : {}),
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 6000,
      query_timeout: 25000,
      statement_timeout: 25000,
    });
    globalThis._corePostgresPool.on('error', (err) => {
      markCorePgFailure('Unexpected idle pool client error', err);
    });
  }
  return globalThis._corePostgresPool;
};

const getCorePgAdminPool = () => {
  if (!isPostgresConfigured()) return null;
  const adminUser = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const adminPassword = process.env.SQL_ADMIN_USER
    ? process.env.SQL_ADMIN_PASSWORD
    : process.env.SQL_PASSWORD;
  if (!process.env.SQL_ADMIN_USER || adminUser === process.env.SQL_USER) {
    return getCorePgPool();
  }
  const sig = `${process.env.SQL_HOST}|${process.env.SQL_PORT || ''}|${process.env.SQL_DB_NAME}|${adminUser}`;
  if (globalThis._corePostgresAdminPool && globalThis._corePostgresAdminPoolSig !== sig) {
    try {
      globalThis._corePostgresAdminPool.end().catch(() => {});
    } catch {}
    globalThis._corePostgresAdminPool = null;
  }
  if (!globalThis._corePostgresAdminPool) {
    globalThis._corePostgresAdminPoolSig = sig;
    globalThis._corePostgresAdminPool = new Pool({
      host: process.env.SQL_HOST,
      user: adminUser,
      password: adminPassword,
      database: process.env.SQL_DB_NAME,
      ...(process.env.SQL_PORT ? { port: Number(process.env.SQL_PORT) } : {}),
      max: 4,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 6000,
      query_timeout: 25000,
      statement_timeout: 25000,
    });
    globalThis._corePostgresAdminPool.on('error', (err) => {
      markCorePgFailure('Unexpected idle admin pool client error', err);
    });
  }
  return globalThis._corePostgresAdminPool;
};

export async function ensureCorePostgresSchemaReady(forceRetry = false) {
  if (!isPostgresConfigured()) {
    globalThis._corePgHealth = {
      configured: false,
      connected: false,
      schemaReady: false,
      lastError: null,
      lastCheckedAt: Date.now(),
    };
    return false;
  }

  if (globalThis._corePgSchemaReady && !forceRetry) {
    return true;
  }

  if (
    !forceRetry &&
    globalThis._corePgLastFailedAt &&
    Date.now() - globalThis._corePgLastFailedAt < 15000
  ) {
    return false;
  }

  if (globalThis._corePgSchemaInitInFlight) {
    return globalThis._corePgSchemaInitInFlight;
  }

  globalThis._corePgSchemaInitInFlight = (async () => {
    const adminPool = getCorePgAdminPool();
    const appPool = getCorePgPool();
    if (!appPool) return false;

    try {
      const schemaMod = await import('../scripts/setup-local-postgres-schema.mjs');
      try {
        await schemaMod.applyIdempotentSmartSchema(adminPool || appPool, process.env.SQL_USER);
      } catch (ddlErr) {
        // Non-admin user fallback: verify existing smart_* tables are readable/writable
        await appPool.query('SELECT key FROM smart_kv_store LIMIT 1');
        await appPool.query('SELECT id FROM smart_users LIMIT 1');
        await appPool.query('SELECT item_id FROM smart_collection_items LIMIT 1');
        await appPool.query('SELECT id FROM smart_backups LIMIT 1');
      }

      globalThis._corePgSchemaReady = true;
      globalThis._corePgLastFailedAt = 0;
      globalThis._corePgHealth = {
        configured: true,
        connected: true,
        schemaReady: true,
        lastError: null,
        lastCheckedAt: Date.now(),
      };
      return true;
    } catch (err) {
      markCorePgFailure('Schema/connection check warning', err);
      return false;
    } finally {
      globalThis._corePgSchemaInitInFlight = null;
    }
  })();

  return globalThis._corePgSchemaInitInFlight;
}

// In-memory diff tracker so incremental updates only touch changed rows in PostgreSQL
const persistedTracker = {
  hydrated: false,
  kvChecksums: new Map(), // key -> sha1
  userHashes: new Map(), // id -> sha1
  collectionItems: new Map(), // collectionName -> Map<itemId, { hash, index }>
};

const resetTracker = () => {
  persistedTracker.hydrated = false;
  persistedTracker.kvChecksums.clear();
  persistedTracker.userHashes.clear();
  persistedTracker.collectionItems.clear();
};

const getStableUserId = (user, idx, seenIds) => {
  let base = '';
  if (user && typeof user === 'object') {
    if (user.id != null && String(user.id).trim() !== '') base = String(user.id).trim();
    else if (user.username != null && String(user.username).trim() !== '') base = `u_${String(user.username).trim()}`;
  }
  if (!base) base = `__idx_${idx}`;
  let finalId = base;
  if (seenIds.has(finalId)) {
    finalId = `${base}__dup_${idx}`;
  }
  seenIds.add(finalId);
  return finalId;
};

const getStableCollectionItemId = (item, idx, seenIds) => {
  let base = '';
  if (item && typeof item === 'object') {
    if (item.id != null && String(item.id).trim() !== '') base = String(item.id).trim();
    else if (item._pgId != null && String(item._pgId).trim() !== '') base = String(item._pgId).trim();
    else if (item.key != null && String(item.key).trim() !== '') base = `k_${String(item.key).trim()}`;
    else if (item.code != null && String(item.code).trim() !== '' && Object.keys(item).length <= 8) {
      base = `c_${String(item.code).trim()}`;
    }
  }
  if (!base) base = `__idx_${idx}`;
  let finalId = base;
  if (seenIds.has(finalId)) {
    finalId = `${base}__dup_${idx}`;
  }
  seenIds.add(finalId);
  return finalId;
};

const safePgJsonStringify = (val) => {
  const raw = JSON.stringify(val ?? null);
  return typeof raw === 'string' ? raw.replace(/\\u0000/g, '') : 'null';
};

const extractTimestampMs = (item, fallbackMs = 0) => {
  const clampMs = (n) => {
    if (!Number.isFinite(n) || n < 0) return fallbackMs;
    const rounded = Math.round(n);
    return rounded > Number.MAX_SAFE_INTEGER ? fallbackMs : rounded;
  };
  if (!item || typeof item !== 'object') return clampMs(fallbackMs);
  const raw =
    item.updatedAt ??
    item.updated_at ??
    item.createdAt ??
    item.created_at ??
    item.timestamp ??
    item.dateMs;
  if (typeof raw === 'number' && Number.isFinite(raw)) return clampMs(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 1000000000) return clampMs(num);
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return clampMs(parsed);
  }
  return clampMs(fallbackMs);
};

export async function loadSmartDbFromPostgres() {
  const ready = await ensureCorePostgresSchemaReady();
  if (!ready) return { ok: false, hasData: false, data: null };

  const pool = getCorePgPool();
  if (!pool) return { ok: false, hasData: false, data: null };

  try {
    const [kvRes, usersRes, colRes] = await Promise.all([
      pool.query('SELECT key, value_json, checksum FROM smart_kv_store ORDER BY key ASC'),
      pool.query('SELECT id, record_hash, data FROM smart_users ORDER BY id ASC'),
      pool.query(
        'SELECT collection_name, item_id, item_index, record_hash, data FROM smart_collection_items ORDER BY collection_name ASC, item_index ASC'
      ),
    ]);

    const hasData =
      kvRes.rows.length > 0 || usersRes.rows.length > 0 || colRes.rows.length > 0;

    resetTracker();
    if (!hasData) {
      persistedTracker.hydrated = true;
      return { ok: true, hasData: false, data: {} };
    }

    const loaded = {};

    for (const row of kvRes.rows) {
      if (SMART_EXCLUDED_ROOT_KEYS.has(row.key)) continue;
      loaded[row.key] = row.value_json;
      persistedTracker.kvChecksums.set(row.key, row.checksum || computeHash(row.value_json));
    }

    if (usersRes.rows.length > 0) {
      loaded.users = usersRes.rows.map((row) => {
        persistedTracker.userHashes.set(row.id, row.record_hash || computeHash(row.data));
        return row.data;
      });
    }

    for (const row of colRes.rows) {
      const colName = row.collection_name;
      if (SMART_EXCLUDED_ROOT_KEYS.has(colName)) continue;
      if (!Array.isArray(loaded[colName])) {
        loaded[colName] = [];
      }
      loaded[colName].push(row.data);

      let colMap = persistedTracker.collectionItems.get(colName);
      if (!colMap) {
        colMap = new Map();
        persistedTracker.collectionItems.set(colName, colMap);
      }
      colMap.set(row.item_id, {
        hash: row.record_hash || computeHash(row.data),
        index: Number(row.item_index) || 0,
      });
    }

    persistedTracker.hydrated = true;
    return {
      ok: true,
      hasData: true,
      data: loaded,
      stats: {
        kvKeys: kvRes.rows.length,
        users: usersRes.rows.length,
        collectionItems: colRes.rows.length,
      },
    };
  } catch (err) {
    markCorePgFailure('Failed to load Smart Management DB from PostgreSQL', err);
    return { ok: false, hasData: false, data: null, error: err?.message };
  }
}

// Serialized promise queue so rapid saveDb() calls never interleave SQL transactions
let syncChain = Promise.resolve({ ok: true });
let queuedPayload = null;
let syncRunning = false;

async function executeSyncToPostgres(dbSnapshot, { forceFullSync = false } = {}) {
  if (!dbSnapshot || typeof dbSnapshot !== 'object') {
    return { ok: false, reason: 'empty_snapshot' };
  }
  const ready = await ensureCorePostgresSchemaReady();
  if (!ready) {
    return { ok: false, reason: 'postgres_unavailable' };
  }
  const pool = getCorePgPool();
  if (!pool) return { ok: false, reason: 'no_pool' };

  const client = await pool.connect();
  const BATCH_SIZE = 350;
  let upsertedKv = 0;
  let deletedKv = 0;
  let upsertedUsers = 0;
  let deletedUsers = 0;
  let upsertedItems = 0;
  let deletedItems = 0;

  try {
    await client.query('BEGIN');

    if (forceFullSync) {
      await client.query('DELETE FROM smart_collection_items');
      await client.query('DELETE FROM smart_users');
      await client.query('DELETE FROM smart_kv_store');
      resetTracker();
    }

    // 1. Sync scalar / object keys to smart_kv_store
    const incomingKvKeys = new Set();
    const kvToUpsert = [];
    for (const [key, val] of Object.entries(dbSnapshot)) {
      if (SMART_EXCLUDED_ROOT_KEYS.has(key)) continue;
      if (val === undefined) continue;
      if (Array.isArray(val)) continue;
      incomingKvKeys.add(key);
      const serialized = safePgJsonStringify(val);
      const hash = computeHash(serialized);
      if (forceFullSync || persistedTracker.kvChecksums.get(key) !== hash) {
        kvToUpsert.push({ key, serialized, hash });
      }
    }

    for (let i = 0; i < kvToUpsert.length; i += BATCH_SIZE) {
      const slice = kvToUpsert.slice(i, i + BATCH_SIZE);
      await client.query(
        `INSERT INTO smart_kv_store (key, value_json, checksum, updated_at)
         SELECT k, v::jsonb, c, NOW()
         FROM UNNEST($1::text[], $2::text[], $3::text[]) AS t(k, v, c)
         ON CONFLICT (key) DO UPDATE SET
           value_json = EXCLUDED.value_json,
           checksum = EXCLUDED.checksum,
           updated_at = NOW()`,
        [slice.map((x) => x.key), slice.map((x) => x.serialized), slice.map((x) => x.hash)]
      );
      slice.forEach((x) => persistedTracker.kvChecksums.set(x.key, x.hash));
      upsertedKv += slice.length;
    }

    if (!forceFullSync && persistedTracker.hydrated) {
      const staleKvKeys = [];
      for (const existingKey of persistedTracker.kvChecksums.keys()) {
        if (!incomingKvKeys.has(existingKey)) staleKvKeys.push(existingKey);
      }
      if (staleKvKeys.length > 0) {
        await client.query('DELETE FROM smart_kv_store WHERE key = ANY($1::text[])', [staleKvKeys]);
        staleKvKeys.forEach((k) => persistedTracker.kvChecksums.delete(k));
        deletedKv += staleKvKeys.length;
      }
    }

    // 2. Sync users array to smart_users
    const usersArr = Array.isArray(dbSnapshot.users) ? dbSnapshot.users : [];
    const seenUserIds = new Set();
    const usersToUpsert = [];
    const nextUserHashes = new Map();

    usersArr.forEach((u, idx) => {
      const uid = getStableUserId(u, idx, seenUserIds);
      const serialized = safePgJsonStringify(u ?? {});
      const hash = computeHash(serialized);
      nextUserHashes.set(uid, hash);
      if (forceFullSync || persistedTracker.userHashes.get(uid) !== hash) {
        usersToUpsert.push({
          id: uid,
          username: String(u?.username || ''),
          fullName: String(u?.fullName || u?.name || ''),
          role: String(u?.role || (Array.isArray(u?.roles) ? u.roles[0] : '') || ''),
          isActive: u?.isActive !== false && u?.disabled !== true,
          hash,
          serialized,
        });
      }
    });

    for (let i = 0; i < usersToUpsert.length; i += BATCH_SIZE) {
      const slice = usersToUpsert.slice(i, i + BATCH_SIZE);
      await client.query(
        `INSERT INTO smart_users (id, username, full_name, role, is_active, record_hash, data, updated_at)
         SELECT id, username, full_name, role, is_active, record_hash, data::jsonb, NOW()
         FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::boolean[], $6::text[], $7::text[])
           AS t(id, username, full_name, role, is_active, record_hash, data)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           is_active = EXCLUDED.is_active,
           record_hash = EXCLUDED.record_hash,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [
          slice.map((x) => x.id),
          slice.map((x) => x.username),
          slice.map((x) => x.fullName),
          slice.map((x) => x.role),
          slice.map((x) => x.isActive),
          slice.map((x) => x.hash),
          slice.map((x) => x.serialized),
        ]
      );
      upsertedUsers += slice.length;
    }

    if (!forceFullSync && persistedTracker.hydrated) {
      const removedUserIds = [];
      for (const oldUid of persistedTracker.userHashes.keys()) {
        if (!nextUserIdsHas(nextUserHashes, oldUid)) removedUserIds.push(oldUid);
      }
      if (removedUserIds.length > 0) {
        await client.query('DELETE FROM smart_users WHERE id = ANY($1::text[])', [removedUserIds]);
        deletedUsers += removedUserIds.length;
      }
    }
    persistedTracker.userHashes = nextUserHashes;

    // 3. Sync all other array collections incrementally to smart_collection_items
    const activeCollectionNames = new Set();
    const itemsToUpsert = [];
    const nextCollectionsMap = new Map();
    const deletionsByCollection = [];

    for (const [colName, arr] of Object.entries(dbSnapshot)) {
      if (colName === 'users' || SMART_EXCLUDED_ROOT_KEYS.has(colName)) continue;
      if (!Array.isArray(arr)) continue;

      activeCollectionNames.add(colName);
      const prevColMap = persistedTracker.collectionItems.get(colName) || new Map();
      const nextColMap = new Map();
      const seenIds = new Set();

      for (let idx = 0; idx < arr.length; idx++) {
        const item = arr[idx];
        const itemId = getStableCollectionItemId(item, idx, seenIds);
        const serialized = safePgJsonStringify(item ?? null);
        const hash = computeHash(serialized);
        nextColMap.set(itemId, { hash, index: idx });

        const prevEntry = prevColMap.get(itemId);
        if (forceFullSync || !prevEntry || prevEntry.hash !== hash || prevEntry.index !== idx) {
          const createdMs = extractTimestampMs(item, 0);
          const updatedMs = extractTimestampMs(item, createdMs || Date.now());
          itemsToUpsert.push({
            colName,
            itemId,
            itemIndex: idx,
            hash,
            createdMs,
            updatedMs,
            serialized,
          });
        }
      }

      if (!forceFullSync && persistedTracker.hydrated && prevColMap.size > 0) {
        const removedIds = [];
        for (const oldId of prevColMap.keys()) {
          if (!nextColMap.has(oldId)) removedIds.push(oldId);
        }
        if (removedIds.length > 0) {
          deletionsByCollection.push({ colName, removedIds });
        }
      }

      nextCollectionsMap.set(colName, nextColMap);
    }

    // Delete collections that disappeared completely
    if (!forceFullSync && persistedTracker.hydrated) {
      const removedCollections = [];
      for (const oldColName of persistedTracker.collectionItems.keys()) {
        if (!activeCollectionNames.has(oldColName)) removedCollections.push(oldColName);
      }
      if (removedCollections.length > 0) {
        const delRes = await client.query(
          'DELETE FROM smart_collection_items WHERE collection_name = ANY($1::text[])',
          [removedCollections]
        );
        deletedItems += delRes.rowCount || 0;
      }
    }

    for (const { colName, removedIds } of deletionsByCollection) {
      for (let i = 0; i < removedIds.length; i += 1000) {
        const slice = removedIds.slice(i, i + 1000);
        const delRes = await client.query(
          'DELETE FROM smart_collection_items WHERE collection_name = $1 AND item_id = ANY($2::text[])',
          [colName, slice]
        );
        deletedItems += delRes.rowCount || 0;
      }
    }

    for (let i = 0; i < itemsToUpsert.length; i += BATCH_SIZE) {
      const slice = itemsToUpsert.slice(i, i + BATCH_SIZE);
      await client.query(
        `INSERT INTO smart_collection_items
           (collection_name, item_id, item_index, record_hash, created_at_ms, updated_at_ms, data, updated_at)
         SELECT c, id, idx, h, cms, ums, d::jsonb, NOW()
         FROM UNNEST($1::text[], $2::text[], $3::integer[], $4::text[], $5::bigint[], $6::bigint[], $7::text[])
           AS t(c, id, idx, h, cms, ums, d)
         ON CONFLICT (collection_name, item_id) DO UPDATE SET
           item_index = EXCLUDED.item_index,
           record_hash = EXCLUDED.record_hash,
           updated_at_ms = EXCLUDED.updated_at_ms,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [
          slice.map((x) => x.colName),
          slice.map((x) => x.itemId),
          slice.map((x) => x.itemIndex),
          slice.map((x) => x.hash),
          slice.map((x) => x.createdMs),
          slice.map((x) => x.updatedMs),
          slice.map((x) => x.serialized),
        ]
      );
      upsertedItems += slice.length;
    }

    await client.query('COMMIT');

    persistedTracker.collectionItems = nextCollectionsMap;
    persistedTracker.hydrated = true;
    globalThis._corePgHealth = {
      ...(globalThis._corePgHealth || {}),
      configured: true,
      connected: true,
      schemaReady: true,
      lastError: null,
      lastSyncAt: Date.now(),
    };

    return {
      ok: true,
      upsertedKv,
      deletedKv,
      upsertedUsers,
      deletedUsers,
      upsertedItems,
      deletedItems,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    markCorePgFailure('Failed syncing Smart Management DB to PostgreSQL', err);
    return { ok: false, error: err?.message };
  } finally {
    client.release();
  }
}

function nextUserIdsHas(map, id) {
  return map.has(id);
}

export function syncSmartDbToPostgres(dbSnapshot, options = {}) {
  if (!dbSnapshot || typeof dbSnapshot !== 'object') {
    return Promise.resolve({ ok: false, reason: 'empty' });
  }

  // Clone top-level Smart keys safely at enqueue time if forceFullSync or queue latest snapshot
  queuedPayload = { snapshot: dbSnapshot, forceFullSync: Boolean(options.forceFullSync) };

  if (syncRunning) {
    return syncChain;
  }

  syncRunning = true;
  syncChain = (async () => {
    let lastResult = { ok: true };
    try {
      while (queuedPayload) {
        const current = queuedPayload;
        queuedPayload = null;
        lastResult = await executeSyncToPostgres(current.snapshot, {
          forceFullSync: current.forceFullSync,
        });
      }
    } finally {
      syncRunning = false;
    }
    return lastResult;
  })();

  return syncChain;
}

export async function waitForPendingCorePgSync() {
  try {
    await syncChain;
  } catch {}
}

export async function recordSmartBackupMetadataInPg(meta) {
  const ready = await ensureCorePostgresSchemaReady();
  if (!ready) return false;
  const pool = getCorePgPool();
  if (!pool) return false;

  try {
    await pool.query(
      `INSERT INTO smart_backups
         (id, file_name, format, backup_kind, scope, size_bytes, compressed_size_bytes, record_counts, checksum_sha256, created_by, created_at_ms, created_date_jalali)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         size_bytes = EXCLUDED.size_bytes,
         compressed_size_bytes = EXCLUDED.compressed_size_bytes,
         record_counts = EXCLUDED.record_counts,
         checksum_sha256 = EXCLUDED.checksum_sha256`,
      [
        String(meta.id || `smart_bkp_${Date.now()}`),
        String(meta.fileName || ''),
        String(meta.format || 'zip'),
        String(meta.backupKind || 'manual'),
        String(meta.scope || 'smart_management'),
        Number(meta.sizeBytes || 0),
        Number(meta.compressedSizeBytes || 0),
        JSON.stringify(meta.recordCounts || {}),
        String(meta.checksumSha256 || ''),
        String(meta.createdBy || 'system'),
        Number(meta.createdAtMs || Date.now()),
        String(meta.createdDateJalali || ''),
      ]
    );
    return true;
  } catch (err) {
    markCorePgFailure('Failed recording Smart backup metadata', err);
    return false;
  }
}

export async function listSmartBackupsFromPg(limit = 50) {
  const ready = await ensureCorePostgresSchemaReady();
  if (!ready) return [];
  const pool = getCorePgPool();
  if (!pool) return [];
  try {
    const res = await pool.query(
      'SELECT * FROM smart_backups ORDER BY created_at_ms DESC LIMIT $1',
      [Math.max(1, Math.min(200, Number(limit) || 50))]
    );
    return res.rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      format: r.format,
      backupKind: r.backup_kind,
      scope: r.scope,
      sizeBytes: Number(r.size_bytes || 0),
      compressedSizeBytes: Number(r.compressed_size_bytes || 0),
      recordCounts: r.record_counts || {},
      checksumSha256: r.checksum_sha256 || '',
      createdBy: r.created_by || 'system',
      createdAtMs: Number(r.created_at_ms || 0),
      createdDateJalali: r.created_date_jalali || '',
    }));
  } catch {
    return [];
  }
}

export function getCorePostgresHealth() {
  const configured = isPostgresConfigured();
  const h = globalThis._corePgHealth || {};
  const connected = Boolean(configured && (globalThis._corePgSchemaReady || h.connected));
  return {
    configured,
    connected,
    schemaReady: Boolean(globalThis._corePgSchemaReady),
    storageEngine: connected ? 'postgresql' : 'json',
    host: process.env.SQL_HOST ? String(process.env.SQL_HOST) : null,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432,
    database: process.env.SQL_DB_NAME ? String(process.env.SQL_DB_NAME) : null,
    lastError: h.lastError || null,
    lastCheckedAt: h.lastCheckedAt || null,
    lastSyncAt: h.lastSyncAt || null,
  };
}

export async function probeCorePostgresHealth() {
  const ok = await ensureCorePostgresSchemaReady(true);
  const base = getCorePostgresHealth();
  if (!ok) return base;

  try {
    const pool = getCorePgPool();
    const [tablesRes, kvRes, usersRes, itemsRes, colBreakdownRes, dbSizeRes, erpTablesRes] =
      await Promise.all([
        pool.query(
          "SELECT count(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'smart_%'"
        ),
        pool.query('SELECT count(*)::int AS cnt FROM smart_kv_store'),
        pool.query('SELECT count(*)::int AS cnt FROM smart_users'),
        pool.query('SELECT count(*)::int AS cnt FROM smart_collection_items'),
        pool.query(
          'SELECT collection_name, count(*)::int AS cnt FROM smart_collection_items GROUP BY collection_name ORDER BY cnt DESC LIMIT 12'
        ),
        pool.query('SELECT pg_database_size(current_database())::bigint AS bytes'),
        pool.query(
          "SELECT count(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'erp_%'"
        ),
      ]);

    const collections = {};
    for (const row of colBreakdownRes.rows || []) {
      collections[row.collection_name] = Number(row.cnt || 0);
    }

    return {
      ...base,
      connected: true,
      storageEngine: 'postgresql',
      smartTablesCount: Number(tablesRes.rows?.[0]?.cnt || 0),
      erpTablesCount: Number(erpTablesRes.rows?.[0]?.cnt || 0),
      kvKeysCount: Number(kvRes.rows?.[0]?.cnt || 0),
      usersCount: Number(usersRes.rows?.[0]?.cnt || 0),
      collectionItemsCount: Number(itemsRes.rows?.[0]?.cnt || 0),
      databaseSizeBytes: Number(dbSizeRes.rows?.[0]?.bytes || 0),
      topCollections: collections,
      architecture: {
        directClientToPostgres5432: false,
        backendApiGateway: 'express-node',
        isolatedBackups: true,
      },
    };
  } catch (err) {
    return {
      ...base,
      connected: false,
      lastError: err?.message || base.lastError,
    };
  }
}

export async function closeCorePgPools() {
  await waitForPendingCorePgSync();
  try {
    if (globalThis._corePostgresPool) {
      await globalThis._corePostgresPool.end();
      globalThis._corePostgresPool = null;
    }
  } catch {}
  try {
    if (globalThis._corePostgresAdminPool) {
      await globalThis._corePostgresAdminPool.end();
      globalThis._corePostgresAdminPool = null;
    }
  } catch {}
}
