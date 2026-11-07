/**
 * Utility functions for handling, repairing and displaying Persian/UTF-8 filenames across the entire system.
 */

/**
 * Repairs Persian/Arabic/UTF-8 filenames that were garbled into Latin1/ISO-8859-1 mojibake
 * (e.g. "Ø¹Ù Ø§Ù Øª" -> "ضمانت" or "Ø¯Ø±ÛØ§ÙØª" -> "دریافت").
 */
export function decodePersianFileName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== 'string') return '';
  
  let str = rawName.trim();
  
  // 1. If it has URL percent-encoding, decode it
  if (str.includes('%')) {
    try {
      str = decodeURIComponent(str);
    } catch (_) {}
  }
  
  // 2. Check if string contains typical UTF-8 bytes misinterpreted as Latin-1 (Ø, Ù, Ú, Â, etc.)
  if (/[\u00C0-\u00FF\u0080-\u00BF]/.test(str)) {
    try {
      const bytes = new Uint8Array(str.split('').map(c => c.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      // Check if decoding produced valid unicode and eliminated replacement chars
      if (decoded && !decoded.includes('\ufffd') && decoded.length > 0) {
        str = decoded;
      }
    } catch (_) {}
  }
  
  return str;
}

/**
 * Returns a clean, human-readable filename for display across all UI components.
 * If fileName is missing, extracts from URL path.
 */
export function getDisplayFileName(fileName?: string | null, url?: string | null): string {
  let name = decodePersianFileName(fileName);
  
  if (!name && url) {
    try {
      const cleanUrl = url.split('?')[0].split('#')[0];
      const parts = cleanUrl.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        name = decodePersianFileName(decodeURIComponent(lastPart));
      }
    } catch (_) {}
  }
  
  if (!name) return 'فایل پیوست';
  
  // If filename starts with timestamp prefix like "1727438291024_..." strip timestamp for clean display
  if (/^\d{13,14}_(.+)$/.test(name)) {
    name = name.replace(/^\d{13,14}_/, '');
  }
  
  return name;
}
