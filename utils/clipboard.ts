/**
 * Reliable cross-platform clipboard copy helper for Windows Electron, Tauri,
 * Android WebView, Mobile Web, and Desktop Web (works over HTTP/LAN & HTTPS).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  // 1. Modern Clipboard API (works in HTTPS & localhost & Electron/Chromium)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {}

  // 2. Electron native clipboard fallback (if exposed by preload)
  try {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win?.electronAPI?.copyText && typeof win.electronAPI.copyText === 'function') {
      const ok = await win.electronAPI.copyText(value);
      if (ok) return true;
    }
  } catch (_) {}

  // 3. Universal DOM textarea fallback (works reliably in LAN HTTP, WebViews, and inside modals)
  try {
    if (typeof document === 'undefined' || !document.body) return false;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const prevRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, value.length);

    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (prevRange && selection) {
      selection.removeAllRanges();
      selection.addRange(prevRange);
    }
    return Boolean(succeeded);
  } catch (_) {
    return false;
  }
}
