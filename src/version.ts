declare const __APP_VERSION__: string;
/** Version de l'application, injectée au build depuis package.json. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_NAME = 'GonioCam';
