import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileOpener } from '@capacitor-community/file-opener';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { getServerHost } from '../services/apiService';

export interface MobilePrintOptions {
    title?: string;
    fileName?: string;
    orientation?: 'p' | 'portrait' | 'l' | 'landscape';
    scale?: number;
}

/**
 * Rewrite relative CSS url(...) references (e.g. local fonts/assets) against the stylesheet's
 * original base URL so inlined styles resolve cleanly inside an isolated about:blank print iframe
 * on Electron (file://), Tauri, and Web.
 */
const resolveCssUrls = (cssText: string, baseHref: string): string => {
    if (!cssText || !baseHref) return cssText;
    return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, rawUrl) => {
        const trimmed = String(rawUrl || '').trim();
        if (
            !trimmed ||
            trimmed.startsWith('data:') ||
            trimmed.startsWith('blob:') ||
            trimmed.startsWith('#') ||
            /^(?:https?:|file:|tauri:|asset:|capacitor:)/i.test(trimmed)
        ) {
            return match;
        }
        try {
            const absUrl = new URL(trimmed, baseHref).href;
            return `url("${absUrl}")`;
        } catch {
            return match;
        }
    });
};

/**
 * Collect all document styles by serializing accessible CSSStyleSheet rules inline.
 * This prevents broken relative <link href="./assets/..."> paths in Electron file:// / Tauri builds
 * when printing inside a blank iframe.
 */
export const collectPrintableDocumentStyles = (): string => {
    const chunks: string[] = [];
    const fallbackOriginHref = typeof window !== 'undefined' ? window.location.href : '';

    if (typeof document !== 'undefined' && document.styleSheets) {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
            if ((sheet as CSSStyleSheet).disabled) continue;
            const ownerNode = sheet.ownerNode as (HTMLLinkElement | HTMLStyleElement | null);
            const sheetBase = sheet.href || fallbackOriginHref;
            try {
                const rules = sheet.cssRules;
                if (rules && rules.length > 0) {
                    const cssText = Array.from(rules)
                        .map((r) => r.cssText)
                        .join('\n');
                    chunks.push(`<style data-print-inlined="true">\n${resolveCssUrls(cssText, sheetBase)}\n</style>`);
                } else if (ownerNode && ownerNode.tagName === 'STYLE' && ownerNode.textContent?.trim()) {
                    chunks.push(`<style data-print-inlined="true">\n${resolveCssUrls(ownerNode.textContent, sheetBase)}\n</style>`);
                }
            } catch {
                // Cross-origin stylesheet: preserve with its resolved absolute href
                if (sheet.href) {
                    chunks.push(`<link rel="stylesheet" href="${sheet.href}">`);
                } else if (ownerNode && ownerNode.outerHTML) {
                    chunks.push(ownerNode.outerHTML);
                }
            }
        }
    }

    // Fallback if styleSheets API yielded nothing (e.g. non-browser environment)
    if (chunks.length === 0 && typeof document !== 'undefined') {
        const nodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
        for (const node of nodes) {
            chunks.push(node.outerHTML);
        }
    }

    return chunks.join('\n');
};

/**
 * Cross-platform print & PDF generation helper.
 * On Desktop Web / Electron / Tauri: Uses a dedicated hidden iframe with inlined CSS to trigger the native print dialog seamlessly.
 * On Mobile (Capacitor Android/iOS): Converts the element to high-res PDF and invokes Native Share / Print Spooler.
 */
export const executeCrossPlatformPrint = async (
    elementOrHtml: HTMLElement | string | null,
    options: MobilePrintOptions = {}
): Promise<boolean> => {
    const title = options.title || 'سند چاپی سیستم';
    const fileName = options.fileName || `Document_${Date.now()}.pdf`;
    const orientation = options.orientation || 'portrait';

    if (!elementOrHtml) {
        console.warn('executeCrossPlatformPrint: No element or HTML provided');
        return false;
    }

    // 1. Mobile (Android/iOS) Native Handling
    if (Capacitor.isNativePlatform()) {
        try {
            let pdfBlob: Blob | null = null;

            if (typeof elementOrHtml === 'object' && elementOrHtml instanceof HTMLElement) {
                // High-fidelity HTML to Canvas capture
                const canvas = await html2canvas(elementOrHtml, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    allowTaint: true,
                    backgroundColor: '#ffffff'
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const pdf = new jsPDF({
                    orientation: orientation === 'landscape' || orientation === 'l' ? 'landscape' : 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();
                const imgWidth = pageWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;

                pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
                pdfBlob = pdf.output('blob');
            }

            if (pdfBlob) {
                // Convert blob to base64
                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const res = reader.result as string;
                        resolve(res.split(',')[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(pdfBlob);
                });

                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });

                // Try opening directly with FileOpener or Native Share
                try {
                    await FileOpener.open({ filePath: savedFile.uri });
                    return true;
                } catch {
                    // Fallback to Native Share
                    await Share.share({
                        title,
                        url: savedFile.uri,
                        dialogTitle: `چاپ و اشتراک‌گذاری ${title}`
                    });
                    return true;
                }
            }
        } catch (mobileErr) {
            console.error('Mobile print generation error:', mobileErr);
        }
    }

    // 2. Desktop Web / Electron / Tauri Handling (Hidden IFrame Printing)
    try {
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0px';
        printFrame.style.height = '0px';
        printFrame.style.border = '0';
        printFrame.style.visibility = 'hidden';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
        if (!frameDoc) {
            throw new Error('عدم دسترسی به فریم پرینت');
        }

        let contentHtml = '';
        if (typeof elementOrHtml === 'string') {
            contentHtml = elementOrHtml;
        } else {
            // Clone element and inline all document styles for 100% visual fidelity on Electron/Tauri/Web
            const clone = elementOrHtml.cloneNode(true) as HTMLElement;
            const activeHost = (typeof window !== 'undefined' ? (getServerHost() || window.location.origin) : '').replace(/\/+$/, '');

            // Ensure all images in clone have resolved absolute URLs and exact print color adjustment
            const liveImages = Array.from(elementOrHtml.querySelectorAll('img'));
            const cloneImages = Array.from(clone.querySelectorAll('img'));
            cloneImages.forEach((img, idx) => {
                const liveImg = liveImages[idx];
                const currentSrc = liveImg?.currentSrc || liveImg?.src || img.getAttribute('src');
                if (currentSrc) {
                    if (
                        currentSrc.startsWith('data:') ||
                        currentSrc.startsWith('blob:') ||
                        currentSrc.startsWith('http://') ||
                        currentSrc.startsWith('https://') ||
                        currentSrc.startsWith('file://') ||
                        currentSrc.startsWith('tauri://') ||
                        currentSrc.startsWith('asset://')
                    ) {
                        img.src = currentSrc;
                    } else if (currentSrc.startsWith('/')) {
                        img.src = activeHost && activeHost !== 'file://' ? `${activeHost}${currentSrc}` : currentSrc;
                    } else if (!currentSrc.includes('://')) {
                        try {
                            img.src = new URL(currentSrc, window.location.href).href;
                        } catch {
                            img.src = activeHost && activeHost !== 'file://' ? `${activeHost}/${currentSrc}` : currentSrc;
                        }
                    }
                }
                img.setAttribute('crossorigin', 'anonymous');
                img.style.setProperty('-webkit-print-color-adjust', 'exact');
                img.style.setProperty('print-color-adjust', 'exact');
            });

            const docStyles = collectPrintableDocumentStyles();
            const pageSize = (orientation === 'landscape' || orientation === 'l') ? 'A5 landscape' : 'A4 portrait';
            const cloneIdSelector = clone.id ? `#${clone.id}` : '';

            contentHtml = `
                <!DOCTYPE html>
                <html dir="rtl" lang="fa">
                <head>
                    <meta charset="utf-8">
                    <title>${title}</title>
                    ${docStyles}
                    <style>
                        @page { size: ${pageSize}; margin: 0mm !important; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
                        html, body { font-family: 'Vazirmatn', Tahoma, sans-serif; margin: 0 !important; padding: 0 !important; direction: rtl; background: #ffffff !important; }
                        img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        @media print {
                            @page { size: ${pageSize}; margin: 0mm !important; }
                            html, body, body * {
                                visibility: visible !important;
                                opacity: 1 !important;
                            }
                            ${cloneIdSelector ? `body > ${cloneIdSelector} { display: flex !important; visibility: visible !important; }` : ''}
                            #print-content-section {
                                margin: 0 auto !important;
                                border: none !important;
                                box-shadow: none !important;
                                page-break-after: avoid !important;
                                page-break-inside: avoid !important;
                            }
                            .no-print, .hidden-print-export {
                                display: none !important;
                            }
                        }
                    </style>
                </head>
                <body class="bg-white">
                    ${clone.outerHTML}
                </body>
                </html>
            `;
        }

        frameDoc.open();
        frameDoc.write(contentHtml);
        frameDoc.close();

        // Wait for stylesheets, fonts, and images inside the iframe to finish loading before printing
        const triggerPrint = () => {
            try {
                if (printFrame.contentWindow) {
                    printFrame.contentWindow.focus();
                    printFrame.contentWindow.print();
                }
            } catch (err) {
                console.warn('Hidden frame print error, falling back to window.print():', err);
                window.print();
            } finally {
                setTimeout(() => {
                    if (document.body.contains(printFrame)) {
                        document.body.removeChild(printFrame);
                    }
                }, 3000);
            }
        };

        const waitPromises: Promise<unknown>[] = [];

        const frameLinks = Array.from(frameDoc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
        for (const link of frameLinks) {
            if (!link.sheet) {
                waitPromises.push(
                    new Promise((res) => {
                        link.addEventListener('load', res, { once: true });
                        link.addEventListener('error', res, { once: true });
                    })
                );
            }
        }

        const frameImages = Array.from(frameDoc.querySelectorAll('img'));
        for (const img of frameImages) {
            if (!img.complete) {
                waitPromises.push(
                    new Promise((res) => {
                        img.onload = res;
                        img.onerror = res;
                    })
                );
            }
        }

        if (frameDoc.fonts && frameDoc.fonts.ready) {
            waitPromises.push(frameDoc.fonts.ready.catch(() => undefined));
        }

        if (waitPromises.length > 0) {
            Promise.race([
                Promise.all(waitPromises),
                new Promise((res) => setTimeout(res, 1500))
            ]).then(() => {
                setTimeout(triggerPrint, 200);
            });
        } else {
            setTimeout(triggerPrint, 250);
        }

        return true;
    } catch (webErr) {
        console.error('Web print error:', webErr);
        window.print();
        return false;
    }
};
