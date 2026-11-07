const DB_NAME = 'app-asset-cache';
const STORE_NAME = 'assets';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        
        // Ensure indexedDB exists
        if (typeof indexedDB === 'undefined') {
            return reject(new Error('IndexedDB is not supported in this environment'));
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };
        request.onerror = () => reject(request.error);
    });
};

/**
 * Resolves a server URL to a cached local blob URL or falls back to the original URL.
 * It will download the file once and save the blob in IndexedDB for instant loads.
 */
export const getCachedAsset = async (url: string): Promise<string> => {
    if (!url || typeof window === 'undefined') return url;

    // We only cache files uploaded on our own server (e.g. from /uploads)
    // Avoid caching external URLs, data URIs, or APIs
    const isUpload = url.startsWith('/uploads') || url.includes('/uploads/');
    if (!isUpload || url.startsWith('data:')) {
        return url;
    }

    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(url);

            request.onsuccess = async () => {
                const blob = request.result;
                if (blob instanceof Blob) {
                    const objectUrl = URL.createObjectURL(blob);
                    resolve(objectUrl);
                } else {
                    // Fetch from server and store in IndexedDB
                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            resolve(url);
                            return;
                        }
                        const freshBlob = await response.blob();
                        
                        const writeTransaction = db.transaction(STORE_NAME, 'readwrite');
                        const writeStore = writeTransaction.objectStore(STORE_NAME);
                        writeStore.put(freshBlob, url);
                        
                        const objectUrl = URL.createObjectURL(freshBlob);
                        resolve(objectUrl);
                    } catch (err) {
                        console.warn('Failed to fetch and cache asset:', url, err);
                        resolve(url);
                    }
                }
            };
            request.onerror = () => resolve(url);
        });
    } catch (e) {
        console.warn('IndexedDB asset cache error:', e);
        return url;
    }
};
