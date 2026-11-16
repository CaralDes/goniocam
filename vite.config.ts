import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Politique de sécurité du contenu, injectée au build (le serveur de développement de Vite
 * a besoin de styles et scripts injectés, incompatibles avec une CSP stricte).
 * - connect-src 'self' : aucune connexion sortante possible ;
 * - 'wasm-unsafe-eval' : nécessaire à l'instanciation du WebAssembly de MediaPipe.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "manifest-src 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'goniocam-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    cspPlugin(),
    ...(process.env.HTTPS ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'GonioCam — goniométrie par caméra',
        short_name: 'GonioCam',
        description: 'Mesure des amplitudes articulaires du membre supérieur et de la main par caméra, 100 % locale.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout est précaché : runtime WebAssembly et modèles compris → fonctionnement hors ligne.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,task,webmanifest}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        inlineWorkboxRuntime: true,
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  server: { host: true },
  preview: { host: true },
});
