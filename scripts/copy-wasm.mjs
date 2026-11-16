// Copie le runtime WebAssembly de MediaPipe dans public/ pour qu'il soit servi
// par l'application elle-même (aucun CDN à l'exécution).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dst = resolve(root, 'public/mediapipe/wasm');
mkdirSync(dst, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  cpSync(resolve(src, f), resolve(dst, f));
}
console.log('[assets] runtime MediaPipe copié dans public/mediapipe/wasm');

const models = ['hand_landmarker.task', 'pose_landmarker_full.task', 'pose_landmarker_lite.task'];
const missing = models.filter((m) => !existsSync(resolve(root, 'public/models', m)));
if (missing.length) {
  console.warn(`[assets] Modèles absents : ${missing.join(', ')} — lancez « npm run models » (une fois, connexion requise).`);
}
