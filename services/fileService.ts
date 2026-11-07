import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { resolveImageUrl, getAuthToken } from './apiService';
import { FileOpener } from '@capacitor-community/file-opener';
import { Share } from '@capacitor/share';
import { isTauriDesktop } from '../utils/platformDetection';
import toast from 'react-hot-toast';

declare global {
    interface Window {
        DlkamAndroid?: {
            hasFileInAppFolder: (fileName: string) => boolean;
            getAppFolderFilePath: (fileName: string) => string;
            saveFileToAppFolder: (base64Data: string, fileName: string, mimeType: string) => boolean;
            openFileFromAppFolder: (fileName: string, mimeType: string) => boolean;
            saveImageToGallery: (base64Data: string, fileName: string, mimeType: string) => boolean;
        };
    }
}

const SAVED_FILES_REGISTRY_KEY = 'dlkam_saved_files_v2';
const APP_SUBFOLDER = 'DlkamFiles';

const sanitizeLocalFileName = (name: string): string => {
    const fallback = `file_${Date.now()}`;
    if (!name || !name.trim()) return fallback;
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
};

const guessMimeType = (fileName: string): string => {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
};

export const getSavedFilesRegistry = (): Record<string, string> => {
    try {
        const raw = localStorage.getItem(SAVED_FILES_REGISTRY_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

export const markFileAsSavedInRegistry = (fileName: string, uriOrPath: string = 'saved') => {
    try {
        const safeName = sanitizeLocalFileName(fileName);
        const reg = getSavedFilesRegistry();
        reg[safeName] = uriOrPath || 'saved';
        reg[fileName] = uriOrPath || 'saved';
        localStorage.setItem(SAVED_FILES_REGISTRY_KEY, JSON.stringify(reg));
        window.dispatchEvent(new CustomEvent('DLKAM_FILE_SAVED', { detail: { fileName, safeName, uri: uriOrPath } }));
    } catch {}
};

export const isFileMarkedSavedSync = (fileName: string): boolean => {
    if (!fileName) return false;
    const safeName = sanitizeLocalFileName(fileName);
    try {
        if (window.DlkamAndroid && typeof window.DlkamAndroid.hasFileInAppFolder === 'function') {
            if (window.DlkamAndroid.hasFileInAppFolder(safeName)) {
                return true;
            }
        }
    } catch {}
    const reg = getSavedFilesRegistry();
    return Boolean(reg[safeName] || reg[fileName]);
};

/**
 * Checks if a file already exists in the app's dedicated storage folder on Android or Windows Desktop.
 */
export const checkFileExists = async (fileName: string): Promise<boolean> => {
    if (!fileName) return false;
    const safeName = sanitizeLocalFileName(fileName);

    // 1. Check Native Android Bridge (DlkamAndroid)
    if (window.DlkamAndroid && typeof window.DlkamAndroid.hasFileInAppFolder === 'function') {
        try {
            const exists = window.DlkamAndroid.hasFileInAppFolder(safeName);
            if (exists) {
                markFileAsSavedInRegistry(fileName, 'android_app_folder');
                return true;
            }
        } catch {}
    }

    // 2. Check Capacitor Filesystem (App-specific External & Data directories)
    if (Capacitor.isNativePlatform()) {
        const candidatePaths = [
            { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.External },
            { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.Data },
            { path: safeName, directory: Directory.External },
            { path: safeName, directory: Directory.Data },
            { path: safeName, directory: Directory.Documents }
        ];
        for (const cand of candidatePaths) {
            try {
                const stat = await Filesystem.stat(cand);
                if (stat && stat.uri) {
                    markFileAsSavedInRegistry(fileName, stat.uri);
                    return true;
                }
            } catch {}
        }
        return false;
    }

    // 3. Check Windows Tauri Desktop App Folder
    if (isTauriDesktop()) {
        try {
            const { invoke } = await import('@tauri-apps/api/tauri');
            const exists = await invoke<boolean>('check_local_file_exists', { fileName: safeName });
            if (exists) {
                markFileAsSavedInRegistry(fileName, 'tauri_app_folder');
                return true;
            }
        } catch {}
    }

    return isFileMarkedSavedSync(fileName);
};

const fetchUrlAsBlob = async (rawUrl: string, onProgress?: (p: number) => void): Promise<Blob> => {
    const fetchUrl = resolveImageUrl(rawUrl);

    if (fetchUrl.startsWith('data:')) {
        if (onProgress) onProgress(50);
        const parts = fetchUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const bstr = atob(parts[1] || '');
        const u8arr = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) {
            u8arr[i] = bstr.charCodeAt(i);
        }
        if (onProgress) onProgress(85);
        return new Blob([u8arr], { type: mime });
    }

    if (onProgress) onProgress(25);
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token && !fetchUrl.startsWith('blob:')) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
        response = await fetch(fetchUrl, { headers });
        if (!response.ok) {
            response = await fetch(fetchUrl);
        }
    } catch {
        response = await fetch(fetchUrl);
    }

    if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
    }

    if (onProgress) onProgress(75);
    return await response.blob();
};

/**
 * Saves an image directly into the Android Gallery (Pictures/Dlkam album) or Desktop App Folder.
 */
export const saveImageToGallery = async (
    url: string,
    fileName?: string,
    onProgress?: (p: number) => void
): Promise<boolean> => {
    const safeName = sanitizeLocalFileName(fileName || `Dlkam_Image_${Date.now()}.jpg`);
    const finalImageName = /\.(jpg|jpeg|png|webp|gif)$/i.test(safeName) ? safeName : `${safeName}.jpg`;
    const mimeType = guessMimeType(finalImageName);

    try {
        if (onProgress) onProgress(15);
        const blob = await fetchUrlAsBlob(url, onProgress);
        const base64data = await blobToBase64(blob);

        // 1. Native Android Bridge -> Directly inserts into Android Gallery (Pictures/Dlkam)
        if (window.DlkamAndroid && typeof window.DlkamAndroid.saveImageToGallery === 'function') {
            const ok = window.DlkamAndroid.saveImageToGallery(base64data, finalImageName, mimeType);
            if (ok) {
                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName || finalImageName, 'gallery');
                toast.success('تصویر با موفقیت در گالری گوشی (آلبوم Dlkam) ذخیره شد 📸');
                return true;
            }
        }

        // 2. Capacitor Native Fallback (Saves in App Dedicated Folder + Media/Documents)
        if (Capacitor.isNativePlatform()) {
            let savedUri = '';
            const targetDirs = [Directory.External, Directory.Data];
            for (const dir of targetDirs) {
                try {
                    const res = await Filesystem.writeFile({
                        path: `${APP_SUBFOLDER}/${finalImageName}`,
                        data: base64data,
                        directory: dir,
                        recursive: true
                    });
                    if (res?.uri) {
                        savedUri = res.uri;
                        break;
                    }
                } catch {}
            }
            // Try writing a copy to Documents as well if permitted
            try {
                await Filesystem.writeFile({
                    path: `Dlkam/${finalImageName}`,
                    data: base64data,
                    directory: Directory.Documents,
                    recursive: true
                });
            } catch {}

            if (savedUri) {
                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName || finalImageName, savedUri);
                toast.success('تصویر در حافظه برنامه ذخیره شد 📸');
                return true;
            }
        }

        // 3. Windows Tauri Desktop
        if (isTauriDesktop()) {
            try {
                const { invoke } = await import('@tauri-apps/api/tauri');
                const arrayBuffer = await blob.arrayBuffer();
                const bytes = Array.from(new Uint8Array(arrayBuffer));
                const savedPath = await invoke<string>('save_and_open_local_file', {
                    fileName: finalImageName,
                    bytes,
                    openAfter: false
                });
                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName || finalImageName, savedPath);
                toast.success('تصویر در پوشه اختصاصی برنامه ذخیره شد');
                return true;
            } catch {}
        }

        // 4. Standard Web Browser fallback
        if (onProgress) onProgress(100);
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = finalImageName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        }, 800);
        markFileAsSavedInRegistry(fileName || finalImageName, 'web');
        toast.success('تصویر ذخیره شد');
        return true;
    } catch (err) {
        console.error('saveImageToGallery error:', err);
        toast.error('خطا در ذخیره تصویر در گالری');
        return false;
    }
};

/**
 * Downloads a file once into the app's dedicated folder on Android or Windows Desktop,
 * marks it as saved so subsequent taps open it immediately from local storage without re-downloading.
 */
export const downloadAndOpenFile = async (
    url: string,
    fileName: string,
    onProgress?: (p: number) => void,
    allowCache: boolean = true
): Promise<boolean> => {
    const safeName = sanitizeLocalFileName(fileName || 'document.pdf');
    const mimeType = guessMimeType(safeName);
    const isImage = /^image\//.test(mimeType);

    try {
        // If it's an image on Android, save directly to Gallery when download button is tapped
        if (isImage && Capacitor.isNativePlatform()) {
            return await saveImageToGallery(url, safeName, onProgress);
        }

        // 1. Android Native Bridge (DlkamAndroid) - Fastest & 100% Scoped-Storage Safe
        if (window.DlkamAndroid && typeof window.DlkamAndroid.hasFileInAppFolder === 'function') {
            if (allowCache && window.DlkamAndroid.hasFileInAppFolder(safeName)) {
                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName, 'android_app_folder');
                const opened = window.DlkamAndroid.openFileFromAppFolder(safeName, mimeType);
                if (opened) return true;
            }

            if (onProgress) onProgress(15);
            const blob = await fetchUrlAsBlob(url, onProgress);
            const base64data = await blobToBase64(blob);
            const saved = window.DlkamAndroid.saveFileToAppFolder(base64data, safeName, mimeType);
            if (saved) {
                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName, 'android_app_folder');
                toast.success('فایل در پوشه اختصاصی برنامه ذخیره شد ✓');
                window.DlkamAndroid.openFileFromAppFolder(safeName, mimeType);
                return true;
            }
        }

        // 2. Capacitor Native Environment (App-specific External / Data storage so Android 11-15 never blocks it)
        if (Capacitor.isNativePlatform()) {
            let fileUri = '';

            if (allowCache) {
                const checkDirs = [
                    { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.External },
                    { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.Data },
                    { path: safeName, directory: Directory.Documents }
                ];
                for (const cand of checkDirs) {
                    try {
                        const stat = await Filesystem.stat(cand);
                        if (stat && stat.uri) {
                            fileUri = stat.uri;
                            break;
                        }
                    } catch {}
                }
            }

            if (!fileUri) {
                if (onProgress) onProgress(15);
                const blob = await fetchUrlAsBlob(url, onProgress);
                const base64data = await blobToBase64(blob);

                // Write to App's dedicated External folder first, fallback to Data folder
                const writeTargets = [
                    { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.External },
                    { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.Data },
                    { path: safeName, directory: Directory.External },
                    { path: safeName, directory: Directory.Data }
                ];

                for (const target of writeTargets) {
                    try {
                        const result = await Filesystem.writeFile({
                            path: target.path,
                            data: base64data,
                            directory: target.directory,
                            recursive: true
                        });
                        if (result && result.uri) {
                            fileUri = result.uri;
                            break;
                        }
                    } catch (writeErr) {
                        console.warn('Write attempt failed for target:', target.directory, writeErr);
                    }
                }

                if (!fileUri) {
                    throw new Error('UNABLE_TO_WRITE_APP_STORAGE');
                }

                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName, fileUri);
                toast.success('فایل در حافظه اختصاصی برنامه ذخیره شد ✓');
            } else {
                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName, fileUri);
            }

            // Open the locally stored file
            try {
                await FileOpener.open({ filePath: fileUri, contentType: mimeType });
            } catch (openErr) {
                console.warn('FileOpener failed, falling back to Share:', openErr);
                try {
                    await Share.share({
                        title: safeName,
                        url: fileUri,
                        dialogTitle: `باز کردن ${safeName}`
                    });
                } catch {
                    toast.success('فایل در پوشه اختصاصی برنامه روی گوشی ذخیره شده است.');
                }
            }
            return true;
        }

        // 3. Windows Desktop (Tauri) - Dedicated App Folder Storage
        if (isTauriDesktop()) {
            try {
                const { invoke } = await import('@tauri-apps/api/tauri');
                if (allowCache) {
                    const exists = await invoke<boolean>('check_local_file_exists', { fileName: safeName });
                    if (exists) {
                        if (onProgress) onProgress(100);
                        markFileAsSavedInRegistry(fileName, 'tauri_app_folder');
                        await invoke<string>('open_local_file', { fileName: safeName });
                        return true;
                    }
                }

                if (onProgress) onProgress(20);
                const blob = await fetchUrlAsBlob(url, onProgress);
                const arrayBuffer = await blob.arrayBuffer();
                const bytes = Array.from(new Uint8Array(arrayBuffer));
                const savedPath = await invoke<string>('save_and_open_local_file', {
                    fileName: safeName,
                    bytes,
                    openAfter: true
                });
                if (onProgress) onProgress(100);
                markFileAsSavedInRegistry(fileName, savedPath);
                toast.success('فایل در پوشه اختصاصی برنامه ذخیره و باز شد ✓');
                return true;
            } catch (tauriErr) {
                console.warn('Tauri local file save fallback to web:', tauriErr);
            }
        }

        // 4. Web Environment
        if (onProgress) onProgress(30);
        const fetchUrl = resolveImageUrl(url);
        if (fetchUrl.startsWith('data:') || fetchUrl.startsWith('blob:')) {
            const blob = await fetchUrlAsBlob(url, onProgress);
            await saveBlobAndOpenFile(blob, safeName);
            markFileAsSavedInRegistry(fileName, 'web');
            return true;
        }

        if (onProgress) onProgress(100);
        const a = document.createElement('a');
        a.href = fetchUrl;
        a.download = safeName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        markFileAsSavedInRegistry(fileName, 'web');
        return true;
    } catch (err) {
        console.error('Download error:', err);
        toast.error('خطا در دریافت یا باز کردن فایل. لطفاً اتصال به سرور را بررسی کنید.');
        return false;
    }
};

export const saveBlobAndOpenFile = async (blob: Blob, fileName: string): Promise<boolean> => {
    const safeName = sanitizeLocalFileName(fileName || `file_${Date.now()}`);
    const mimeType = blob.type || guessMimeType(safeName);

    // 1. Android Native Bridge
    if (window.DlkamAndroid && typeof window.DlkamAndroid.saveFileToAppFolder === 'function') {
        try {
            const base64data = await blobToBase64(blob);
            const isImg = /^image\//.test(mimeType) || /\.(jpg|jpeg|png|webp|gif)$/i.test(safeName);
            if (isImg) {
                const ok = window.DlkamAndroid.saveImageToGallery(base64data, safeName, mimeType);
                if (ok) {
                    markFileAsSavedInRegistry(fileName, 'gallery');
                    toast.success('تصویر در گالری گوشی (آلبوم Dlkam) ذخیره شد 📸');
                    return true;
                }
            } else {
                const ok = window.DlkamAndroid.saveFileToAppFolder(base64data, safeName, mimeType);
                if (ok) {
                    markFileAsSavedInRegistry(fileName, 'android_app_folder');
                    toast.success('فایل در پوشه اختصاصی برنامه ذخیره شد ✓');
                    window.DlkamAndroid.openFileFromAppFolder(safeName, mimeType);
                    return true;
                }
            }
        } catch (e) {
            console.warn('DlkamAndroid bridge blob save error:', e);
        }
    }

    // 2. Capacitor Native Environment
    if (Capacitor.isNativePlatform()) {
        try {
            const base64data = await blobToBase64(blob);
            let savedUri = '';
            const writeTargets = [
                { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.External },
                { path: `${APP_SUBFOLDER}/${safeName}`, directory: Directory.Data }
            ];
            for (const target of writeTargets) {
                try {
                    const result = await Filesystem.writeFile({
                        path: target.path,
                        data: base64data,
                        directory: target.directory,
                        recursive: true
                    });
                    if (result?.uri) {
                        savedUri = result.uri;
                        break;
                    }
                } catch {}
            }

            if (!savedUri) {
                throw new Error('WRITE_FAILED');
            }

            markFileAsSavedInRegistry(fileName, savedUri);
            toast.success('فایل در پوشه اختصاصی برنامه ذخیره شد ✓');

            try {
                await FileOpener.open({ filePath: savedUri, contentType: mimeType });
            } catch {
                await Share.share({
                    title: safeName,
                    url: savedUri,
                    dialogTitle: `باز کردن ${safeName}`
                });
            }
            return true;
        } catch (err) {
            console.error('Error saving/opening blob:', err);
            toast.error('خطا در ذخیره و باز کردن فایل.');
            return false;
        }
    }

    // 3. Windows Tauri Desktop
    if (isTauriDesktop()) {
        try {
            const { invoke } = await import('@tauri-apps/api/tauri');
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = Array.from(new Uint8Array(arrayBuffer));
            const savedPath = await invoke<string>('save_and_open_local_file', {
                fileName: safeName,
                bytes,
                openAfter: true
            });
            markFileAsSavedInRegistry(fileName, savedPath);
            toast.success('فایل در پوشه اختصاصی برنامه ذخیره و باز شد ✓');
            return true;
        } catch {}
    }

    // 4. Standard Web Browser
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);

    setTimeout(() => {
        a.click();
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 1000);
    }, 100);
    markFileAsSavedInRegistry(fileName, 'web');
    return true;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64Data);
        };
        reader.readAsDataURL(blob);
    });
};
