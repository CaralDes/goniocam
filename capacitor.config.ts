import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.vadentia.goniocam',
  appName: 'GonioCam',
  webDir: 'dist-android',
  android: {
    // Aucune ressource distante : pas de contenu mixte, pas de débogage WebView en production.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
