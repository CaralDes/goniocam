// Télécharge UNE FOIS les modèles officiels MediaPipe dans public/models/.
// Ils sont ensuite embarqués dans l'application (aucun téléchargement à l'exécution).
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'public/models');
mkdirSync(dir, { recursive: true });

const BASE = 'https://storage.googleapis.com/mediapipe-models';
const MODELS = [
  ['hand_landmarker.task', `${BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`],
  ['pose_landmarker_full.task', `${BASE}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`],
  ['pose_landmarker_lite.task', `${BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`],
];

const force = process.argv.includes('--force');
const manifest = {};
for (const [name, url] of MODELS) {
  const path = resolve(dir, name);
  if (existsSync(path) && !force) {
    console.log(`✓ ${name} déjà présent`);
  } else {
    process.stdout.write(`↓ ${name} … `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name} : HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    console.log('ok');
  }
  manifest[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
}
writeFileSync(resolve(dir, 'SHA256SUMS.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Empreintes SHA-256 écrites dans public/models/SHA256SUMS.json');
