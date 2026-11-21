import crypto from 'crypto';

/**
 * Real-Time Barcode-to-PC Bridge Service (Server-Authoritative + SSE)
 * Connects Android PDAs / Mobile Scanners directly to Windows Desktop Apps (Electron/Tauri)
 * or Desktop Web browsers so scanned barcodes are typed one-by-one into Sayan ERP in real time.
 */

const SESSION_IDLE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_ACTIVE_SESSIONS = 200;
const MAX_SCANS_PER_SESSION = 2000;
const MAX_BATCH_SCANS = 200;
const MAX_BARCODE_LENGTH = 128;

/** @type {Map<string, any>} */
const sessions = new Map();

function sanitizeBarcodeText(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, MAX_BARCODE_LENGTH);
}

function sanitizeLabel(raw, fallback = '') {
  const clean = String(raw || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

function generateUniquePairingCode() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!sessions.has(code)) return code;
  }
  return String(Date.now()).slice(-6);
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [code, session] of sessions.entries()) {
    const hasConnectedClients =
      session.hostSseClients.size > 0 || session.scannerSseClients.size > 0;
    const age = now - session.lastActivityAt;
    if ((!hasConnectedClients && age > 30 * 60 * 1000) || age > SESSION_IDLE_TTL_MS) {
      closeSessionInternal(code, 'expired');
    }
  }
  if (sessions.size > MAX_ACTIVE_SESSIONS) {
    const oldest = Array.from(sessions.values())
      .sort((a, b) => a.lastActivityAt - b.lastActivityAt)
      .slice(0, sessions.size - MAX_ACTIVE_SESSIONS);
    oldest.forEach((s) => closeSessionInternal(s.code, 'capacity_evicted'));
  }
}

function sendSsePayload(res, eventName, payload) {
  try {
    if (!res || res.writableEnded || res.destroyed) return false;
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
    return true;
  } catch (_) {
    return false;
  }
}

function broadcastToSet(clientSet, eventName, payload) {
  for (const client of Array.from(clientSet)) {
    const ok = sendSsePayload(client.res, eventName, payload);
    if (!ok) {
      clientSet.delete(client);
    }
  }
}

function broadcastToSession(session, eventName, payload, target = 'all') {
  if (target === 'all' || target === 'host') {
    broadcastToSet(session.hostSseClients, eventName, payload);
  }
  if (target === 'all' || target === 'scanner') {
    broadcastToSet(session.scannerSseClients, eventName, payload);
  }
}

function serializeSessionPublic(session, includeHistory = true) {
  return {
    code: session.code,
    hostDeviceName: session.hostDeviceName,
    hostPlatform: session.hostPlatform,
    hostUsername: session.hostUsername,
    hostFullName: session.hostFullName,
    hostOnline: session.hostSseClients.size > 0,
    paused: Boolean(session.paused),
    duplicateGuard: Boolean(session.duplicateGuard),
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    connectedScanners: Array.from(session.connectedScanners.values()),
    totalScans: session.scans.length,
    typedCount: session.scans.filter((s) => s.status === 'typed').length,
    queuedCount: session.scans.filter((s) => s.status === 'queued').length,
    scans: includeHistory ? session.scans.slice(-300) : undefined
  };
}

function createOrResumeSession({
  preferredCode = '',
  hostToken = '',
  hostDeviceName = 'کامپیوتر ویندوز',
  hostPlatform = 'desktop',
  hostUsername = '',
  hostFullName = '',
  duplicateGuard = true
} = {}) {
  pruneExpiredSessions();

  const cleanPreferred = String(preferredCode || '').replace(/\D/g, '');
  if (cleanPreferred.length === 6 && sessions.has(cleanPreferred)) {
    const existing = sessions.get(cleanPreferred);
    if (hostToken && existing.hostToken === hostToken) {
      existing.hostDeviceName = sanitizeLabel(hostDeviceName, existing.hostDeviceName);
      existing.hostPlatform = sanitizeLabel(hostPlatform, existing.hostPlatform);
      existing.lastActivityAt = Date.now();
      return {
        code: existing.code,
        hostToken: existing.hostToken,
        session: serializeSessionPublic(existing, true)
      };
    }
  }

  const code = generateUniquePairingCode();
  const newToken = crypto.randomBytes(16).toString('hex');
  const now = Date.now();

  const session = {
    code,
    hostToken: newToken,
    hostDeviceName: sanitizeLabel(hostDeviceName, 'کامپیوتر ویندوز'),
    hostPlatform: sanitizeLabel(hostPlatform, 'desktop'),
    hostUsername: sanitizeLabel(hostUsername, ''),
    hostFullName: sanitizeLabel(hostFullName, ''),
    paused: false,
    duplicateGuard: duplicateGuard !== false,
    createdAt: now,
    lastActivityAt: now,
    hostSseClients: new Set(),
    scannerSseClients: new Set(),
    connectedScanners: new Map(),
    seenClientScanIds: new Set(),
    scans: []
  };

  sessions.set(code, session);

  return {
    code,
    hostToken: newToken,
    session: serializeSessionPublic(session, true)
  };
}

function getSessionByCode(rawCode) {
  const code = String(rawCode || '').replace(/\D/g, '');
  if (code.length !== 6) return null;
  return sessions.get(code) || null;
}

function listDiscoverableSessions({ username = '' } = {}) {
  pruneExpiredSessions();
  const normUser = String(username || '').trim().toLowerCase();
  const list = [];
  for (const session of sessions.values()) {
    const isHostActive =
      session.hostSseClients.size > 0 ||
      Date.now() - session.lastActivityAt < 2 * 60 * 1000;
    if (!isHostActive) continue;
    const sameUser =
      Boolean(normUser) &&
      session.hostUsername &&
      session.hostUsername.toLowerCase() === normUser;
    list.push({
      code: session.code,
      hostDeviceName: session.hostDeviceName,
      hostPlatform: session.hostPlatform,
      hostFullName: session.hostFullName || session.hostUsername || 'اپراتور سیستم',
      sameUser,
      hostOnline: session.hostSseClients.size > 0,
      connectedScannersCount: session.connectedScanners.size,
      totalScans: session.scans.length,
      lastActivityAt: session.lastActivityAt
    });
  }
  return list.sort((a, b) => {
    if (a.sameUser !== b.sameUser) return a.sameUser ? -1 : 1;
    return b.lastActivityAt - a.lastActivityAt;
  });
}

function joinScanner(rawCode, { scannerId, deviceName, username, fullName } = {}) {
  const session = getSessionByCode(rawCode);
  if (!session) {
    const err = new Error('کد اتصال نامعتبر است یا جلسه کامپیوتر بسته شده است.');
    err.statusCode = 404;
    throw err;
  }

  const cleanScannerId = sanitizeLabel(scannerId, `scanner_${crypto.randomBytes(4).toString('hex')}`);
  const existing = session.connectedScanners.get(cleanScannerId);
  const scannerInfo = {
    scannerId: cleanScannerId,
    deviceName: sanitizeLabel(deviceName, 'بارکدخوان / گوشی اندروید'),
    username: sanitizeLabel(username, ''),
    fullName: sanitizeLabel(fullName, ''),
    connectedAt: existing?.connectedAt || Date.now(),
    lastScanAt: existing?.lastScanAt || null,
    scanCount: existing?.scanCount || 0
  };

  session.connectedScanners.set(cleanScannerId, scannerInfo);
  session.lastActivityAt = Date.now();

  broadcastToSession(session, 'scanner:joined', {
    scanner: scannerInfo,
    connectedScanners: Array.from(session.connectedScanners.values())
  });

  return {
    scanner: scannerInfo,
    session: serializeSessionPublic(session, true)
  };
}

function leaveScanner(rawCode, scannerId) {
  const session = getSessionByCode(rawCode);
  if (!session) return { ok: true };
  const cleanId = sanitizeLabel(scannerId, '');
  if (cleanId && session.connectedScanners.has(cleanId)) {
    session.connectedScanners.delete(cleanId);
    session.lastActivityAt = Date.now();
    broadcastToSession(session, 'scanner:left', {
      scannerId: cleanId,
      connectedScanners: Array.from(session.connectedScanners.values())
    });
  }
  return { ok: true };
}

function registerSseStream(rawCode, res, { role = 'scanner', clientId = '', hostToken = '' } = {}) {
  const session = getSessionByCode(rawCode);
  if (!session) {
    return false;
  }

  const normalizedRole = role === 'host' ? 'host' : 'scanner';
  if (normalizedRole === 'host' && hostToken && session.hostToken !== hostToken) {
    return false;
  }

  const clientEntry = {
    id: sanitizeLabel(clientId, `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    role: normalizedRole,
    res,
    connectedAt: Date.now()
  };

  const targetSet = normalizedRole === 'host' ? session.hostSseClients : session.scannerSseClients;
  targetSet.add(clientEntry);
  session.lastActivityAt = Date.now();

  // Send immediate authoritative snapshot on connect / reconnect
  sendSsePayload(res, 'init', {
    role: normalizedRole,
    session: serializeSessionPublic(session, true)
  });

  if (normalizedRole === 'host') {
    broadcastToSession(
      session,
      'session:updated',
      {
        hostOnline: true,
        paused: session.paused,
        duplicateGuard: session.duplicateGuard
      },
      'scanner'
    );
  }

  const heartbeat = setInterval(() => {
    try {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeat);
        targetSet.delete(clientEntry);
        return;
      }
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (_) {
      clearInterval(heartbeat);
      targetSet.delete(clientEntry);
    }
  }, 20000);

  const cleanup = () => {
    clearInterval(heartbeat);
    targetSet.delete(clientEntry);
    if (normalizedRole === 'host' && session.hostSseClients.size === 0) {
      broadcastToSession(
        session,
        'session:updated',
        {
          hostOnline: false,
          paused: session.paused,
          duplicateGuard: session.duplicateGuard
        },
        'scanner'
      );
    }
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
  return true;
}

function pushScans(rawCode, payload = {}) {
  const session = getSessionByCode(rawCode);
  if (!session) {
    const err = new Error('جلسه اتصال با کامپیوتر یافت نشد یا بسته شده است.');
    err.statusCode = 404;
    throw err;
  }

  const scannerId = sanitizeLabel(payload.scannerId, 'scanner');
  const scannerName = sanitizeLabel(payload.scannerName || payload.deviceName, 'بارکدخوان اندروید');
  const forceAllowDuplicate = Boolean(payload.forceAllowDuplicate);

  let rawItems = [];
  if (Array.isArray(payload.items)) {
    rawItems = payload.items.slice(0, MAX_BATCH_SCANS);
  } else if (payload.barcode) {
    rawItems = [
      {
        barcode: payload.barcode,
        clientScanId: payload.clientScanId,
        scannedAt: payload.scannedAt,
        fromOfflineQueue: Boolean(payload.fromOfflineQueue)
      }
    ];
  }

  if (rawItems.length === 0) {
    const err = new Error('بارکد معتبری برای ارسال دریافت نشد.');
    err.statusCode = 400;
    throw err;
  }

  const accepted = [];
  const duplicates = [];
  const ignoredIdempotent = [];

  for (const item of rawItems) {
    const barcode = sanitizeBarcodeText(item?.barcode);
    if (!barcode) continue;

    const clientScanId = sanitizeLabel(item?.clientScanId, '');
    if (clientScanId && session.seenClientScanIds.has(clientScanId)) {
      const existing = session.scans.find((s) => s.clientScanId === clientScanId);
      if (existing) ignoredIdempotent.push(existing);
      continue;
    }

    if (session.duplicateGuard && !forceAllowDuplicate) {
      const existingDup = session.scans.find(
        (s) => s.barcode.toUpperCase() === barcode.toUpperCase() && s.status !== 'failed'
      );
      if (existingDup) {
        duplicates.push({ barcode, existingId: existingDup.id, createdAt: existingDup.createdAt });
        continue;
      }
    }

    const scanRecord = {
      id: `scan_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      clientScanId: clientScanId || undefined,
      barcode,
      scannerId,
      scannerName,
      fromOfflineQueue: Boolean(item?.fromOfflineQueue),
      status: 'queued',
      createdAt: Number(item?.scannedAt) || Date.now(),
      ackAt: null,
      error: null
    };

    if (clientScanId) {
      session.seenClientScanIds.add(clientScanId);
    }

    session.scans.push(scanRecord);
    if (session.scans.length > MAX_SCANS_PER_SESSION) {
      session.scans = session.scans.slice(-MAX_SCANS_PER_SESSION);
    }

    const scannerEntry = session.connectedScanners.get(scannerId);
    if (scannerEntry) {
      scannerEntry.scanCount = (scannerEntry.scanCount || 0) + 1;
      scannerEntry.lastScanAt = Date.now();
    } else {
      session.connectedScanners.set(scannerId, {
        scannerId,
        deviceName: scannerName,
        username: '',
        fullName: '',
        connectedAt: Date.now(),
        lastScanAt: Date.now(),
        scanCount: 1
      });
    }

    accepted.push(scanRecord);
    broadcastToSession(session, 'scan:new', { scan: scanRecord });
  }

  session.lastActivityAt = Date.now();

  return {
    accepted,
    duplicates,
    ignoredIdempotent,
    hostOnline: session.hostSseClients.size > 0,
    paused: session.paused
  };
}

function acknowledgeScan(rawCode, { hostToken, scanId, status = 'typed', error = null } = {}) {
  const session = getSessionByCode(rawCode);
  if (!session) {
    const err = new Error('جلسه یافت نشد.');
    err.statusCode = 404;
    throw err;
  }
  if (!hostToken || session.hostToken !== hostToken) {
    const err = new Error('عدم مجوز ثبت تاییدیه برای این جلسه.');
    err.statusCode = 403;
    throw err;
  }

  const target = session.scans.find((s) => s.id === scanId);
  if (!target) {
    return { ok: false, notFound: true };
  }

  target.status = status === 'failed' ? 'failed' : 'typed';
  target.ackAt = Date.now();
  target.error = error ? sanitizeLabel(error, '') : null;
  session.lastActivityAt = Date.now();

  broadcastToSession(session, 'scan:ack', {
    scanId: target.id,
    clientScanId: target.clientScanId,
    barcode: target.barcode,
    status: target.status,
    ackAt: target.ackAt,
    error: target.error
  });

  return { ok: true, scan: target };
}

function updateSessionSettings(rawCode, { hostToken, paused, duplicateGuard, clearHistory } = {}) {
  const session = getSessionByCode(rawCode);
  if (!session) {
    const err = new Error('جلسه یافت نشد.');
    err.statusCode = 404;
    throw err;
  }
  if (!hostToken || session.hostToken !== hostToken) {
    const err = new Error('عدم مجوز تغییر تنظیمات این جلسه.');
    err.statusCode = 403;
    throw err;
  }

  if (typeof paused === 'boolean') session.paused = paused;
  if (typeof duplicateGuard === 'boolean') session.duplicateGuard = duplicateGuard;
  if (clearHistory === true) {
    session.scans = [];
    session.seenClientScanIds.clear();
  }
  session.lastActivityAt = Date.now();

  const snapshot = serializeSessionPublic(session, true);
  broadcastToSession(session, 'session:updated', {
    hostOnline: session.hostSseClients.size > 0,
    paused: session.paused,
    duplicateGuard: session.duplicateGuard,
    cleared: clearHistory === true,
    totalScans: session.scans.length
  });

  return { ok: true, session: snapshot };
}

function closeSessionInternal(code, reason = 'host_closed') {
  const session = sessions.get(code);
  if (!session) return;
  broadcastToSession(session, 'session:closed', { code, reason });
  for (const c of session.hostSseClients) {
    try { c.res.end(); } catch (_) {}
  }
  for (const c of session.scannerSseClients) {
    try { c.res.end(); } catch (_) {}
  }
  sessions.delete(code);
}

function closeSession(rawCode, hostToken) {
  const session = getSessionByCode(rawCode);
  if (!session) return { ok: true };
  if (!hostToken || session.hostToken !== hostToken) {
    const err = new Error('عدم مجوز بستن این جلسه.');
    err.statusCode = 403;
    throw err;
  }
  closeSessionInternal(session.code, 'host_closed');
  return { ok: true };
}

export {
  createOrResumeSession,
  getSessionByCode,
  serializeSessionPublic,
  listDiscoverableSessions,
  joinScanner,
  leaveScanner,
  registerSseStream,
  pushScans,
  acknowledgeScan,
  updateSessionSettings,
  closeSession
};
