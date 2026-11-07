import { useState, useEffect } from 'react';
import { getCachedAsset } from '../utils/assetCache';

/**
 * Custom React hook to automatically load and resolve cached server assets (uploads)
 * from local IndexedDB for rapid loading.
 */
export function useCachedAsset(url: string | undefined): string | undefined {
    const [cachedUrl, setCachedUrl] = useState<string | undefined>(url);

    useEffect(() => {
        if (!url) {
            setCachedUrl(undefined);
            return;
        }

        let isMounted = true;
        
        getCachedAsset(url).then((resolvedUrl) => {
            if (isMounted) {
                setCachedUrl(resolvedUrl);
            }
        }).catch(() => {
            if (isMounted) {
                setCachedUrl(url);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [url]);

    return cachedUrl;
}
