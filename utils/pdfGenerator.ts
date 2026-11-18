import { toJpeg } from 'html-to-image';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { saveBlobAndOpenFile } from '../services/fileService';
import { isAndroidApp, isElectronDesktop, isTauriDesktopOnly } from './platformDetection';

type PdfFormat = 'A4' | 'A5';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfOrientationSetting = 'auto' | 'portrait' | 'landscape';

export interface PdfOptions {
    elementId: string;
    filename: string;
    format?: PdfFormat;
    orientation?: PdfOrientation;
    returnBlob?: boolean;
    onComplete?: () => void;
    onError?: (error: any) => void;
}

/**
 * Automatically detects whether an HTML report should be rendered in Landscape ('landscape')
 * or Portrait ('portrait') based on table column count, comparative grids, CSS @page rules, or filename.
 */
export const detectHtmlOrientation = (htmlString: string, filename: string = ''): PdfOrientation => {
    const cleanHtml = String(htmlString || '');
    const cleanName = String(filename || '');

    // 1. Explicit CSS @page size rule in HTML
    if (/size\s*:\s*(?:A4\s+)?landscape/i.test(cleanHtml)) {
        return 'landscape';
    }
    if (/size\s*:\s*(?:A4\s+)?portrait/i.test(cleanHtml)) {
        return 'portrait';
    }

    // 2. Comparative reports or 6-card KPI grids or wide filenames
    if (
        /Comparison|Compare|مقایسه‌ای|مقایسه فروش|مقایسه تولید|kpi-grid-6/i.test(cleanName) ||
        /Comparison|Compare|مقایسه‌ای|مقایسه فروش|مقایسه تولید|kpi-grid-6/i.test(cleanHtml)
    ) {
        return 'landscape';
    }

    // 3. Count <th> columns in the first table header row
    try {
        const theadMatch = cleanHtml.match(/<thead[\s\S]*?<\/thead>/i) || cleanHtml.match(/<tr[\s\S]*?<\/tr>/i);
        if (theadMatch) {
            const firstRowMatch = theadMatch[0].match(/<tr[\s\S]*?<\/tr>/i);
            const rowHtml = firstRowMatch ? firstRowMatch[0] : theadMatch[0];
            const thMatches = rowHtml.match(/<th\b/gi);
            if (thMatches && thMatches.length >= 7) {
                return 'landscape';
            }
        }
    } catch {
        // ignore regex parse errors
    }

    return 'portrait';
};

/**
 * Injects explicit @page orientation and auto-fit table rules into an HTML document string
 * so neither browser printing nor PDF rendering cuts off wide tables.
 */
export const injectOrientationStylesIntoHtml = (
    htmlString: string,
    orientation: PdfOrientation
): string => {
    const isLandscape = orientation === 'landscape';
    const overrideCss = `
      <style id="dlkam-orientation-override">
        @page {
          size: A4 ${isLandscape ? 'landscape' : 'portrait'};
          margin: ${isLandscape ? '6mm 7mm' : '7mm 8mm'};
        }
        html, body {
          width: 100%;
          margin: 0;
          padding: 6px;
          box-sizing: border-box;
          direction: rtl;
        }
        table {
          width: 100% !important;
          max-width: 100% !important;
          border-collapse: collapse;
          table-layout: auto;
          ${isLandscape ? 'font-size: 9.5px !important;' : ''}
        }
        th, td {
          ${isLandscape ? 'padding: 4px 4px !important; font-size: 9.5px !important;' : ''}
          word-break: break-word;
        }
      </style>
    `;

    if (htmlString.includes('</head>')) {
        return htmlString.replace('</head>', `${overrideCss}</head>`);
    }
    return overrideCss + htmlString;
};

/**
 * Prints an HTML document cleanly using a hidden in-page iframe instead of window.open('', '_blank').
 * This prevents Electron / Windows WebView from opening a stuck blank white popup window.
 */
export const printHtmlInPage = (
    htmlString: string,
    orientationSetting: PdfOrientationSetting = 'auto',
    filename: string = '',
    options?: { skipStyleInjection?: boolean }
): void => {
    if (!htmlString) return;
    const resolvedOrientation: PdfOrientation =
        orientationSetting === 'auto'
            ? detectHtmlOrientation(htmlString, filename)
            : orientationSetting;

    const resolvedHtml = options?.skipStyleInjection
        ? htmlString
        : injectOrientationStylesIntoHtml(htmlString, resolvedOrientation);
    const existingFrame = document.getElementById('dlkam-hidden-print-iframe');
    if (existingFrame && existingFrame.parentNode) {
        existingFrame.parentNode.removeChild(existingFrame);
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'dlkam-hidden-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0.01';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!doc || !win) {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        return;
    }

    doc.open();
    doc.write(resolvedHtml);
    doc.close();

    let printed = false;
    let readyStarted = false;
    const triggerPrint = () => {
        if (printed) return;
        printed = true;
        try {
            win.focus();
            win.print();
        } catch (err) {
            console.error('In-page iframe print failed:', err);
        } finally {
            setTimeout(() => {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            }, 60000);
        }
    };

    const runPrintWhenReady = () => {
        if (readyStarted || printed) return;
        readyStarted = true;
        const waits: Promise<unknown>[] = [];
        try {
            const imgs = Array.from(doc.querySelectorAll('img'));
            for (const img of imgs) {
                if (!img.complete) {
                    waits.push(new Promise((res) => { img.onload = res; img.onerror = res; }));
                }
            }
            if (doc.fonts && doc.fonts.ready) {
                waits.push(doc.fonts.ready.catch(() => undefined));
            }
        } catch {}
        if (waits.length > 0) {
            Promise.race([Promise.all(waits), new Promise((res) => setTimeout(res, 1500))]).then(() => {
                setTimeout(triggerPrint, 180);
            });
        } else {
            setTimeout(triggerPrint, 250);
        }
    };

    iframe.onload = runPrintWhenReady;
    setTimeout(runPrintWhenReady, 450);
};

/**
 * Smart cross-platform HTML report exporter/printer:
 * - On Android native (Capacitor): converts HTML to PDF and saves/opens locally via DlkamAndroid/Filesystem (never redirects to external web browser).
 * - On Electron Desktop & Web: prints via hidden in-page iframe (never opens blank white Electron popup window).
 */
export const exportReportHtmlSmart = async (
    htmlString: string,
    filename: string,
    orientationSetting: PdfOrientationSetting = 'auto',
    options?: { downloadPdf?: boolean }
): Promise<void> => {
    if (!htmlString) return;
    const cleanName = (filename || `Report_${Date.now()}.pdf`).replace(/[\\/:*?"<>|]/g, '_');
    const pdfFilename = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;

    if (options?.downloadPdf || isAndroidApp() || Capacitor.isNativePlatform()) {
        const loadingToast = toast.loading('در حال آماده‌سازی و ذخیره فایل PDF...');
        try {
            const resolvedOrientation: PdfOrientation =
                orientationSetting === 'auto'
                    ? detectHtmlOrientation(htmlString, pdfFilename)
                    : orientationSetting;
            const blob = await generatePdfFromHtml(htmlString, pdfFilename, { orientation: resolvedOrientation });
            if (!blob) {
                throw new Error('PDF_GENERATION_FAILED');
            }
            toast.dismiss(loadingToast);
            await saveBlobAndOpenFile(blob, pdfFilename);
        } catch (err) {
            console.error('PDF export error:', err);
            toast.error('خطا در تولید و ذخیره PDF', { id: loadingToast });
        }
        return;
    }

    printHtmlInPage(htmlString, orientationSetting, pdfFilename);
};

/**
 * Prints a PDF or Image inside FileViewerModal without opening a blank Electron child window.
 */
export const printPdfOrImageInPage = async (
    fileUrl: string,
    detectedType: 'pdf' | 'image',
    fileName: string = 'document',
    existingPdfIframe?: HTMLIFrameElement | null
): Promise<void> => {
    if (detectedType === 'image') {
        const imgHtml = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>${fileName}</title>
  <style>
    @page { margin: 6mm; }
    body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 96vh; background: #ffffff; }
    img { max-width: 100%; max-height: 95vh; object-fit: contain; }
  </style>
</head>
<body>
  <img src="${fileUrl}" />
</body>
</html>`;
        printHtmlInPage(imgHtml, 'portrait', fileName);
        return;
    }

    // For PDF: 1) Try printing directly from the already-loaded iframe in FileViewerModal
    if (existingPdfIframe && existingPdfIframe.contentWindow) {
        try {
            existingPdfIframe.contentWindow.focus();
            existingPdfIframe.contentWindow.print();
            return;
        } catch (directErr) {
            console.warn('Direct PDF iframe print fallback:', directErr);
        }
    }

    // 2) Fetch PDF as same-origin Blob URL and print via hidden iframe
    try {
        let blobUrlToPrint = fileUrl;
        let shouldRevoke = false;
        if (!fileUrl.startsWith('blob:') && !fileUrl.startsWith('data:')) {
            const headers: Record<string, string> = {};
            try {
                const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
                if (token) headers.Authorization = `Bearer ${token}`;
            } catch {}
            const res = await fetch(fileUrl, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            blobUrlToPrint = URL.createObjectURL(pdfBlob);
            shouldRevoke = true;
        }

        const existingFrame = document.getElementById('dlkam-hidden-pdf-print-iframe');
        if (existingFrame && existingFrame.parentNode) {
            existingFrame.parentNode.removeChild(existingFrame);
        }

        const iframe = document.createElement('iframe');
        iframe.id = 'dlkam-hidden-pdf-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = '0';
        iframe.style.opacity = '0.01';
        iframe.src = blobUrlToPrint;
        document.body.appendChild(iframe);

        iframe.onload = () => {
            setTimeout(() => {
                try {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } catch (e) {
                    console.error('Hidden PDF iframe print error:', e);
                } finally {
                    setTimeout(() => {
                        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                        if (shouldRevoke) URL.revokeObjectURL(blobUrlToPrint);
                    }, 60000);
                }
            }, 500);
        };
    } catch (err) {
        console.error('Failed to print PDF via blob iframe:', err);
    }
};

export const generatePdfFromHtml = async (
    htmlString: string,
    filename: string,
    options?: { orientation?: PdfOrientationSetting }
): Promise<Blob | undefined> => {
    try {
        const resolvedOrientation: PdfOrientation =
            !options?.orientation || options.orientation === 'auto'
                ? detectHtmlOrientation(htmlString, filename)
                : options.orientation;

        const isLandscape = resolvedOrientation === 'landscape';
        const targetWidthPx = isLandscape ? 1123 : 794;
        const targetHeightPx = isLandscape ? 794 : 1123;

        const styledHtml = injectOrientationStylesIntoHtml(htmlString, resolvedOrientation);

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = `${targetWidthPx}px`;
        iframe.style.height = `${targetHeightPx}px`;
        iframe.style.left = '-9999px';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document;
        if (!doc) {
            document.body.removeChild(iframe);
            return undefined;
        }
        
        doc.open();
        doc.write(styledHtml);
        doc.close();

        // Wait for rendering
        await new Promise(r => setTimeout(r, 850));

        // Ensure wide tables are never clipped horizontally
        const actualScrollWidth = Math.max(targetWidthPx, doc.body.scrollWidth || targetWidthPx);
        if (actualScrollWidth > targetWidthPx) {
            iframe.style.width = `${actualScrollWidth}px`;
            await new Promise(r => setTimeout(r, 150));
        }

        const finalOrientation: PdfOrientation =
            options?.orientation === 'auto' && actualScrollWidth > 900
                ? 'landscape'
                : resolvedOrientation;

        const canvas = await html2canvas(doc.body, {
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: actualScrollWidth,
            width: actualScrollWidth,
            windowHeight: doc.body.scrollHeight > targetHeightPx ? doc.body.scrollHeight : targetHeightPx
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const pdf = new jsPDF(finalOrientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 12) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        const pdfBlob = pdf.output('blob');
        document.body.removeChild(iframe);
        return pdfBlob;
    } catch (error) {
        console.error('Error generating PDF from HTML:', error);
        return undefined;
    }
};

export const generatePdf = async ({
    elementId,
    filename,
    format = 'A4',
    orientation = 'portrait',
    returnBlob,
    onComplete,
    onError
}: PdfOptions) => {
    const originalElement = document.getElementById(elementId);
    
    if (!originalElement) {
        if (onError) onError(new Error('Element not found'));
        return;
    }

    try {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.zIndex = '-1';
        
        let width = 0;
        let height = 0;
        
        if (format === 'A4') {
             if (orientation === 'portrait') { width = 794; height = 1123; }
             else { width = 1123; height = 794; }
        } else if (format === 'A5') {
             if (orientation === 'portrait') { width = 559; height = 794; }
             else { width = 794; height = 559; }
        }

        const clone = originalElement.cloneNode(true) as HTMLElement;
        
        const noPrints = clone.querySelectorAll('.no-print');
        noPrints.forEach(el => el.remove());

        const originalInputs = originalElement.querySelectorAll('input, textarea, select');
        const clonedInputs = clone.querySelectorAll('input, textarea, select');

        originalInputs.forEach((input: any, index) => {
            const clonedInput = clonedInputs[index] as any;
            if (!clonedInput) return;

            if (input.tagName === 'SELECT') {
                const selectedOption = input.options[input.selectedIndex];
                const span = document.createElement('span');
                span.innerText = selectedOption ? selectedOption.text : '';
                span.className = input.className;
                span.style.display = 'inline-block';
                span.style.padding = '4px';
                if(input.parentNode) input.parentNode.replaceChild(span, input);
                clonedInput.value = input.value;
            } else if (input.type === 'checkbox' || input.type === 'radio') {
                clonedInput.checked = input.checked;
                if(input.checked) clonedInput.setAttribute('checked', 'checked');
            } else {
                clonedInput.value = input.value;
                clonedInput.setAttribute('value', input.value);
            }
        });

        clone.style.width = `${width}px`;
        clone.style.margin = '0';
        clone.style.padding = '20px';
        clone.style.transform = 'none';
        clone.classList.add('printable-content');

        clone.style.fontFamily = "'Vazirmatn', sans-serif";
        clone.style.direction = 'rtl';
        const allElements = clone.querySelectorAll('*');
        allElements.forEach((el: any) => {
            const currentFont = el.style.fontFamily || (window.getComputedStyle && window.getComputedStyle(el).fontFamily) || '';
            if (!currentFont.includes('monospace') && !el.classList.contains('font-mono') && !el.classList.contains('text-mono')) {
                el.style.fontFamily = "'Vazirmatn', sans-serif";
            }
            el.style.direction = 'rtl';
            
            const style = window.getComputedStyle && window.getComputedStyle(el);
            if (style) {
                if (style.textAlign === 'left') {
                    el.style.textAlign = 'right';
                }
            }
        });

        container.appendChild(clone);
        document.body.appendChild(container);

        await new Promise(resolve => setTimeout(resolve, 80));

        let imgData = '';
        try {
            imgData = await toJpeg(clone, {
                quality: 0.98,
                pixelRatio: 2.5,
                backgroundColor: '#ffffff'
            });
        } catch (imgErr) {
            console.warn('html-to-image failed, falling back to html2canvas', imgErr);
            const canvas = await html2canvas(clone, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: width,
                width: width
            });
            imgData = canvas.toDataURL('image/jpeg', 0.95);
        }

        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'mm',
            format: format
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 12) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        const finalFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
        const pdfBlob = pdf.output('blob');

        document.body.removeChild(container);
        
        if (returnBlob) {
            if (onComplete) onComplete();
            return pdfBlob;
        }

        if (Capacitor.isNativePlatform() || isAndroidApp() || isElectronDesktop() || isTauriDesktopOnly()) {
            await saveBlobAndOpenFile(pdfBlob, finalFilename);
        } else {
            try {
                pdf.save(finalFilename);
            } catch (saveErr) {
                await saveBlobAndOpenFile(pdfBlob, finalFilename);
            }
        }

        if (onComplete) onComplete();
        return undefined;

    } catch (error: any) {
        console.error('Client-Side PDF Error:', error);
        alert('خطا در تولید PDF: ' + (error?.message || 'نامشخص'));
        if (onError) onError(error);
        return undefined;
    }
};
