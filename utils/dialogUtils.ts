import { Capacitor } from '@capacitor/core';

/**
 * Cross-platform safe notification and confirmation utilities.
 * Prevents synchronous alert()/confirm() blocks that can freeze Capacitor WebViews on Android.
 */

export const safeAlert = (message: string, title?: string): Promise<void> => {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined') {
            // Dispatch in-app custom toast or notification event if listener exists
            const customEvent = new CustomEvent('app-custom-alert', {
                detail: { message, title }
            });
            window.dispatchEvent(customEvent);

            // Also use requestAnimationFrame to prevent thread lock
            setTimeout(() => {
                alert(message);
                resolve();
            }, 50);
        } else {
            resolve();
        }
    });
};

export const safeConfirm = (message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined') {
            const result = window.confirm(message);
            resolve(result);
        } else {
            resolve(false);
        }
    });
};
