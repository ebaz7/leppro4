/**
 * URL query-parameter utilities (platform-agnostic, safe for Node & Browser).
 */

/**
 * Replaces or appends a single query parameter without creating duplicates
 * such as `?t=...&t=...` when fallback retry paths reuse a cache-busted URL.
 */
export function appendOrReplaceQueryParam(rawUrl: string, paramKey: string, paramValue: string): string {
  const input = String(rawUrl || '').trim();
  if (!input) return '';

  const hashIdx = input.indexOf('#');
  const hashPart = hashIdx >= 0 ? input.slice(hashIdx) : '';
  const withoutHash = hashIdx >= 0 ? input.slice(0, hashIdx) : input;

  const qIdx = withoutHash.indexOf('?');
  const basePath = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const queryStr = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : '';

  const keyLower = paramKey.toLowerCase();
  const keptPairs = queryStr
    ? queryStr
        .split('&')
        .filter((segment) => {
          if (!segment) return false;
          const eqIdx = segment.indexOf('=');
          const segKey = (eqIdx >= 0 ? segment.slice(0, eqIdx) : segment).toLowerCase();
          return segKey !== keyLower;
        })
    : [];

  keptPairs.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(paramValue)}`);
  return `${basePath}?${keptPairs.join('&')}${hashPart}`;
}

/**
 * Infers desktop runtime ('electron' | 'tauri') when an installer filename or URL
 * explicitly identifies the runtime even if `?runtime=` was omitted.
 */
export function inferDesktopRuntimeFromRequest(
  explicitRuntime?: string | null,
  urlPathOrFilename?: string | null
): 'electron' | 'tauri' | '' {
  const explicit = String(explicitRuntime || '').trim().toLowerCase();
  if (explicit === 'electron' || explicit === 'tauri') {
    return explicit;
  }
  const target = String(urlPathOrFilename || '').toLowerCase();
  if (target.includes('electron')) return 'electron';
  if (target.includes('dlkam-desktop-') || target.includes('sayan-desktop-') || target.endsWith('.msi')) {
    return 'tauri';
  }
  return '';
}
