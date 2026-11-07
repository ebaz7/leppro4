import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

/**
 * Applies CamScanner style Magic Color / Auto Document Enhancement to an image buffer
 * @param {Buffer} buffer 
 * @param {'magic_color' | 'crisp_bw' | 'enhance' | 'original'} mode 
 * @returns {Promise<Buffer>}
 */
export async function enhanceDocumentImage(buffer, mode = 'magic_color') {
    if (!buffer || buffer.length === 0) return buffer;
    if (mode === 'original') {
        return sharp(buffer).rotate().png({ quality: 95, compressionLevel: 6 }).toBuffer();
    }

    try {
        let pipeline = sharp(buffer).rotate(); // auto-rotate based on EXIF

        if (mode === 'crisp_bw') {
            // High-contrast clean Black & White scanner mode
            pipeline = pipeline
                .grayscale()
                .normalize({ lower: 5, upper: 95 })
                .linear(1.35, -35)
                .sharpen({ sigma: 1.4, m1: 1.6, m2: 0.8 });
        } else if (mode === 'enhance') {
            // Balanced auto-enhancement
            pipeline = pipeline
                .normalize({ lower: 2, upper: 98 })
                .modulate({ brightness: 1.05, saturation: 1.15 })
                .linear(1.12, -10)
                .sharpen({ sigma: 1.1, m1: 1.3, m2: 0.6 });
        } else {
            // Default: 'magic_color' (CamScanner Magic Color preset)
            // 1. Normalize levels to stretch histogram (removes dark phone shadows)
            // 2. Modulate brightness & color saturation (preserves blue/red stamps & seals)
            // 3. Linear curve to make paper background pristine white while deepening ink
            // 4. Studio unsharp mask for razor-sharp Persian / English calligraphy & printed text
            pipeline = pipeline
                .normalize({ lower: 3, upper: 97 })
                .modulate({ brightness: 1.08, saturation: 1.35 })
                .linear(1.22, -16)
                .sharpen({ sigma: 1.3, m1: 1.5, m2: 0.7 });
        }

        return await pipeline.png({ quality: 92, compressionLevel: 6 }).toBuffer();
    } catch (err) {
        console.warn('[Image Enhancement] Failed to apply filter, falling back to standard image:', err.message);
        return sharp(buffer).rotate().png({ quality: 90 }).toBuffer().catch(() => buffer);
    }
}

/**
 * Merges a list of image and PDF buffers into a single PDF document with CamScanner auto-enhancement.
 * @param {Array<{ buffer: Buffer, type: 'image' | 'pdf' | string, fileName?: string }>} fileList 
 * @param {object} [options] 
 * @param {'magic_color' | 'crisp_bw' | 'enhance' | 'original'} [options.filter='magic_color']
 * @returns {Promise<Buffer>}
 */
export async function mergeFilesToPdf(fileList, options = {}) {
    if (!Array.isArray(fileList) || fileList.length === 0) {
        throw new Error('هیچ فایلی برای ادغام ارسال نشده است.');
    }

    const filterMode = options.filter || 'magic_color';
    const mergedPdf = await PDFDocument.create();

    // Standard A4 dimensions in points (72 points per inch)
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const MARGIN = 18;
    const MAX_CONTENT_WIDTH = A4_WIDTH - (MARGIN * 2);
    const MAX_CONTENT_HEIGHT = A4_HEIGHT - (MARGIN * 2);

    for (let index = 0; index < fileList.length; index++) {
        const item = fileList[index];
        const { buffer, type, fileName } = item;

        if (!buffer || buffer.length === 0) {
            console.warn(`[PDF Merger] Skipping empty file at index ${index}`);
            continue;
        }

        const isPdf = type === 'pdf' || (fileName && /\.pdf$/i.test(fileName)) || isPdfBuffer(buffer);

        if (isPdf) {
            try {
                const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
                const pageIndices = srcPdf.getPageIndices();
                const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
                for (const page of copiedPages) {
                    mergedPdf.addPage(page);
                }
            } catch (pdfErr) {
                console.error(`[PDF Merger] Error processing PDF page at index ${index}:`, pdfErr.message);
            }
        } else {
            // Process Image with CamScanner Magic Color filter
            try {
                const enhancedPngBuffer = await enhanceDocumentImage(buffer, filterMode);
                const image = await mergedPdf.embedPng(enhancedPngBuffer);
                const { width: imgWidth, height: imgHeight } = image.scale(1);

                // Calculate scaling to fit within A4 margins while maintaining aspect ratio
                const scale = Math.min(
                    MAX_CONTENT_WIDTH / imgWidth,
                    MAX_CONTENT_HEIGHT / imgHeight,
                    1 // Don't upscale small images beyond 100%
                );

                const finalWidth = imgWidth * scale;
                const finalHeight = imgHeight * scale;

                const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
                const xPos = MARGIN + (MAX_CONTENT_WIDTH - finalWidth) / 2;
                const yPos = MARGIN + (MAX_CONTENT_HEIGHT - finalHeight) / 2;

                page.drawImage(image, {
                    x: xPos,
                    y: yPos,
                    width: finalWidth,
                    height: finalHeight,
                });
            } catch (imgErr) {
                console.error(`[PDF Merger] Error processing image at index ${index}:`, imgErr.message);
                
                // Fallback attempt: try embedding raw JPEG if sharp had issues
                try {
                    const jpgImage = await mergedPdf.embedJpg(buffer);
                    const { width: imgWidth, height: imgHeight } = jpgImage.scale(1);
                    const scale = Math.min(MAX_CONTENT_WIDTH / imgWidth, MAX_CONTENT_HEIGHT / imgHeight, 1);
                    const finalWidth = imgWidth * scale;
                    const finalHeight = imgHeight * scale;

                    const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
                    page.drawImage(jpgImage, {
                        x: MARGIN + (MAX_CONTENT_WIDTH - finalWidth) / 2,
                        y: MARGIN + (MAX_CONTENT_HEIGHT - finalHeight) / 2,
                        width: finalWidth,
                        height: finalHeight,
                    });
                } catch (fallbackErr) {
                    console.error(`[PDF Merger] Fallback image embed failed:`, fallbackErr.message);
                }
            }
        }
    }

    if (mergedPdf.getPageCount() === 0) {
        throw new Error('هیچ صفحه معتبری از فایل‌های ارسالی قابل استخراج و ادغام نبود.');
    }

    const mergedPdfBytes = await mergedPdf.save();
    return Buffer.from(mergedPdfBytes);
}

/**
 * Check if buffer header matches %PDF
 * @param {Buffer} buffer 
 * @returns {boolean}
 */
function isPdfBuffer(buffer) {
    if (!buffer || buffer.length < 4) return false;
    return buffer.slice(0, 4).toString('ascii') === '%PDF';
}
