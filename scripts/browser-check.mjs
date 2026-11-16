// Vérification automatisée dans Chrome (headless) du build de production :
// CSP sans violation, chargement local des modèles, aucune requête réseau après chargement,
// fonctionnement hors ligne (service worker), parcours bilan jusqu'à l'écran de mesure.
//
// Usage : npm run build && npm run preview (dans un autre terminal), puis
//   CHROME_PATH=/chemin/vers/chrome node scripts/browser-check.mjs [http://localhost:4173/]
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const URL_APP = process.argv[2] ?? 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const OUT = 'tests/out';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, permissions: ['camera'] });
// Réglages de test : modèle Pose « lite » si le modèle « full » n'est pas dans le build ; délégué au choix.
const initSettings = {};
if (!existsSync('dist/models/pose_landmarker_full.task')) {
  initSettings.modelePose = 'lite';
  console.log('ℹ pose_landmarker_full.task absent du build : test avec le modèle « lite ».');
}
if (process.env.DELEGATE) initSettings.delegate = process.env.DELEGATE;
await context.addInitScript((s) => {
  if (!localStorage.getItem('goniocam.settings.v1')) localStorage.setItem('goniocam.settings.v1', JSON.stringify(s));
}, initSettings);
const page = await context.newPage();

const consoleErrors = [];
const cspViolations = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  if (/Content Security Policy|Refused to/.test(m.text())) cspViolations.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const external = [];
const allRequests = [];
context.on('request', (r) => {
  allRequests.push({ url: r.url(), t: Date.now() });
  if (!r.url().startsWith(new URL(URL_APP).origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
});

const waitReady = async (label) => {
  const t0 = Date.now();
  await page.waitForSelector('.engine.ready, .engine.error', { timeout: 120_000 });
  const ok = (await page.$('.engine.ready')) !== null;
  check(`Moteur de vision chargé (${label})`, ok, ok ? `${Date.now() - t0} ms` : await page.textContent('.engine'));
  return ok;
};

// 1) Premier chargement : installation du service worker et précache.
await page.goto(URL_APP, { waitUntil: 'load' });
await waitReady('premier chargement');
const swReady = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return !!reg.active;
});
check('Service worker actif', swReady);
// Laisse le temps au précache de se terminer.
await page.waitForFunction(async () => {
  const keys = await caches.keys();
  for (const k of keys) {
    const c = await caches.open(k);
    const reqs = await c.keys();
    if (reqs.some((r) => r.url.includes('hand_landmarker.task'))) return true;
  }
  return false;
}, null, { timeout: 120_000 });
check('Modèles et runtime précachés', true);

// 2) Rechargement : plus aucune requête après chargement.
await page.reload({ waitUntil: 'load' });
await waitReady('rechargement');
const tReady = Date.now();

// Parcours : code patient, côté, protocole main → écran de mesure.
await page.fill('input[placeholder^="ex."]', 'TEST-001');
await page.click('text=Droit');
await page.click('button.proto:has-text("Main complète")');
await page.click('text=Commencer le bilan');
await page.waitForSelector('canvas.view');
await page.waitForTimeout(6000);
const fpsText = await page.textContent('.pill.fps');
const fps = parseInt(fpsText ?? '0', 10);
check('Boucle d\'analyse active sur la caméra (factice)', fps > 0, `${fpsText} en headless logiciel (sans GPU)`);
const refusal = await page.textContent('.messages');
check('Refus explicite sans main détectée', /Main non détectée|non détect/i.test(refusal ?? ''), refusal?.slice(0, 80));
await page.screenshot({ path: `${OUT}/ecran-mesure.png` });

// Capture manuelle refusée (pas de main)
await page.click('button.capture');
await page.waitForTimeout(300);
const flash = await page.textContent('.messages');
check('Capture manuelle refusée', /refusée/i.test(flash ?? ''), flash?.slice(0, 80));

// Récapitulatif
await page.click('text=☰ Récap');
await page.waitForSelector('table.results');
await page.screenshot({ path: `${OUT}/ecran-recap.png`, fullPage: true });
check('Récapitulatif affiché', true);

const after = allRequests.filter((r) => r.t > tReady);
check('Aucune requête réseau après chargement', after.length === 0, after.map((r) => r.url).slice(0, 5).join(', '));
check('Aucune requête vers un domaine externe', external.length === 0, external.slice(0, 5).join(', '));
check('Aucune violation CSP', cspViolations.length === 0, cspViolations.slice(0, 3).join(' | '));

// 3) Hors ligne complet.
await context.setOffline(true);
await page.goto(URL_APP, { waitUntil: 'load' });
await waitReady('hors ligne');
await context.setOffline(false);

// Réglages
await page.click('text=Réglages');
await page.waitForSelector('text=Normes indicatives');
await page.screenshot({ path: `${OUT}/ecran-reglages.png` });
await page.click('text=‹ Retour');
await page.screenshot({ path: `${OUT}/ecran-accueil.png`, fullPage: true });

const cspMeta = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.getAttribute('content')).catch(() => null);
check('CSP présente dans le document', !!cspMeta && cspMeta.includes("connect-src 'self'"));
check('Pas d\'erreur JavaScript', consoleErrors.filter((e) => !/favicon|^INFO:/i.test(e)).length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
