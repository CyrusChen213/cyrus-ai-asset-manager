export const APP_VARIANT = import.meta.env.VITE_APP_VARIANT === 'user' ? 'user' : 'admin';
export const IS_ADMIN_BUILD = APP_VARIANT === 'admin';

export const DEFAULT_REMOTE_ADS_URL = 'https://cyruschen213.github.io/cyrus-ai-asset-manager/ads.json';
export const DEFAULT_UPDATE_CONFIG_URL = 'https://cyruschen213.github.io/cyrus-ai-asset-manager/update.json';
