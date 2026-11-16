// Test de bout en bout de l'interface avec des détections synthétiques injectées
// (build `--mode e2e` uniquement) : bilan « main complète » bilatéral, captures automatiques,
// correction manuelle, récapitulatif, export PDF et CSV.
//
// Usage : npx vitest run tests/fixtures.test.ts && npx vite build --mode e2e --outDir dist-e2e
//         npx vite preview --outDir dist-e2e --port 4174 &  puis  node scripts/e2e-flow.mjs
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const URL_APP = process.argv[2] ?? 'http://localhost:4174/';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const fixtures = JSON.parse(readFileSync('tests/out/fixtures-e2e.json', 'utf8'));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('goniocam.settings.v1', JSON.stringify({ modelePose: 'lite', delegate: 'CPU', sonCapture: false })));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let ok = true;
const check = (name, cond, detail = '') => {
  ok &&= !!cond;
  console.log(`${cond ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(URL_APP);
await page.waitForSelector('.engine.ready', { timeout: 120_000 });
await page.fill('input[placeholder^="ex."]', 'E2E-042');
await page.click('text=Droit');
await page.click('button.proto:has-text("Main complète")');
await page.click('text=Commencer le bilan');

const order = ['doigts_ext', 'doigts_flex', 'pouce_ext', 'pouce_flex'];
const queue = [...order.map((s) => [s, 'D']), ...order.map((s) => [s, 'G'])];
const t0 = Date.now();
for (const [step, side] of queue) {
  await page.evaluate((d) => { window.__fakeDetection = d; }, fixtures[`${step}|${side}`]);
  if (step === 'doigts_flex' && side === 'G') {
    await page.waitForTimeout(450);
    await page.screenshot({ path: 'tests/out/e2e-live.png' });
  }
  await page.waitForSelector('.sheet', { timeout: 15_000 });
  if (step === 'doigts_flex' && side === 'D') {
    await page.screenshot({ path: 'tests/out/e2e-capture.png' });
    // Correction manuelle d'une valeur.
    const input = page.locator('.review-item', { hasText: 'D2 (index) IPP' }).locator('input');
    await input.fill('72');
    await input.blur();
  }
  await page.click('text=Valider et continuer');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.evaluate(() => { window.__fakeDetection = undefined; });
}
const elapsed = (Date.now() - t0) / 1000;
check('8 captures automatiques (main complète, bilatéral)', true, `${elapsed.toFixed(1)} s de capture pure`);

await page.waitForSelector('table.results');
const rowText = async (label) => (await page.locator('tr', { hasText: label }).first().innerText()).replace(/\s+/g, ' ');
const ipp = await rowText('D2 IPP flex.');
check('D2 IPP flexion : sain 100°, atteint corrigé 72°, déficit 28°', /100°.*72°.*28°/.test(ipp), ipp);
const mcpExt = await rowText('D3 MCP ext.');
check('D3 MCP extension : sain 10°, atteint -5° (déficit 15°)', /10°.*-5°.*15°/.test(mcpExt), mcpExt);
const thumb = await rowText('D1 IP flex.');
check('Pouce IP flexion : 80° / 50°', /80°.*50°.*30°/.test(thumb), thumb);
await page.screenshot({ path: 'tests/out/e2e-recap.png', fullPage: true });

const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('text=Exporter la fiche PDF')]);
await pdf.saveAs('tests/out/e2e-bilan.pdf');
check('Export PDF', pdf.suggestedFilename().endsWith('.pdf'), pdf.suggestedFilename());
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('text=CSV brut (validation)')]);
await csv.saveAs('tests/out/e2e-brut.csv');
const lines = readFileSync('tests/out/e2e-brut.csv', 'utf8').trim().split('\n').length;
check('Export CSV brut', lines > 100, `${lines} lignes`);
check('Aucune erreur JavaScript', errors.length === 0, errors.join(' | '));

writeFileSync('tests/out/e2e-result.txt', ok ? 'OK\n' : 'ECHEC\n');
await browser.close();
process.exit(ok ? 0 : 1);
