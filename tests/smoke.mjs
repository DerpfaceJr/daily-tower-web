// Browser smoke test. Playwright Chromium is installed in CI only.
//   node tests/smoke.mjs <name> <url>
// e.g. node tests/smoke.mjs local http://127.0.0.1:8000/
//      node tests/smoke.mjs local3d http://127.0.0.1:8001/3d.html
// A name containing "3d" also checks that a WebGL renderer was created.
// Prints PASS/FAIL lines, ERROR[name] lines, then SMOKE_<NAME>=PASS|FAIL.
// Writes tests/out/<name>.png and tests/out/smoke-<name>.json. Exits 1 on failure.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [name = 'local', url = 'http://127.0.0.1:8000/'] = process.argv.slice(2);
const is3d = /3d/i.test(name);
const OUT = new URL('./out/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const outPath = (f) => fileURLToPath(new URL(f, OUT));

const errors = [];
const results = [];
const check = (label, ok, info = '') => {
  results.push({ label, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${name}] ${label}${info ? ' - ' + info : ''}`);
};
// Chromium's automatic favicon request is not part of the game.
const ignored = (t) => /favicon/i.test(t);

// Copies #game (2D or WebGL) onto a scratch 2D canvas and samples its pixels.
// The 3D renderer uses preserveDrawingBuffer so its last frame is readable.
const canvasInfo = (page) => page.evaluate(() => {
  const src = document.getElementById('game');
  const w = Math.max(1, Math.min(src.width, 800));
  const h = Math.max(1, Math.min(src.height, 800));
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const t = tmp.getContext('2d');
  t.drawImage(src, 0, 0, w, h);
  const d = t.getImageData(0, 0, w, h).data;
  let painted = 0;
  let hash = 0;
  const colors = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) painted++;
    const v = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    if (colors.size < 64) colors.add(v);
    hash = (Math.imul(hash, 31) + v + d[i + 3]) >>> 0;
  }
  return { painted, colors: colors.size, hash, w, h };
});

// #over is the run-over overlay: hidden while the run is still going.
// run_over:true means the overlay is showing.
const hudText = (page) => page.evaluate(() =>
  ['hp', 'floor', 'atk', 'log', 'over'].map((id) => {
    const el = document.getElementById(id);
    if (!el) return `${id}:missing`;
    return id === 'over' ? `run_over:${!el.hidden}` : `${id}:${el.textContent}`;
  }).join('|'));

// Why the run ended, read from the overlay (empty object while still running).
const overInfo = (page) => page.evaluate(() => {
  const o = document.getElementById('over');
  if (!o || o.hidden) return { runOver: false };
  const t = (id) => document.getElementById(id)?.textContent || '';
  return { runOver: true, title: t('over-title'), floor: t('over-floor'), turns: t('over-turns'), kills: t('over-kills'), hp: t('hp') };
});

let browser;
try {
  // Headless CI has no GPU: ask for SwiftShader software WebGL for the 3D page.
  browser = await chromium.launch(is3d ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignored(m.text() + ' ' + (m.location().url || ''))) errors.push('console: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { if (!ignored(r.url())) errors.push('requestfailed: ' + r.url()); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  const target = url + (url.includes('?') ? '&' : '?') + 'smoke=' + Date.now();
  const res = await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  check('page loads', !!res && res.ok(), `HTTP ${res ? res.status() : 'none'}`);

  let started = true;
  try {
    await page.waitForFunction(() => {
      const f = document.getElementById('floor');
      return f && f.textContent !== '-';
    }, null, { timeout: 20000 });
  } catch {
    started = false;
  }
  check('game starts (HUD filled in)', started);
  const today = await page.evaluate(() => document.getElementById('today-label')?.textContent || '');
  console.log(`INFO [${name}] today-label: ${today.slice(0, 120)}`);

  if (is3d) {
    const gl = await page.evaluate(() => document.getElementById('game')?.dataset.gl || '');
    check('WebGL renderer created', gl === 'webgl2' || gl === 'webgl', `gl=${gl || 'none'}`);
  }
  await page.waitForTimeout(300);

  const before = await canvasInfo(page);
  const hudBefore = await hudText(page);
  check('canvas has non-blank pixels', before.painted > 0 && before.colors > 1, `painted=${before.painted} colors=${before.colors} size=${before.w}x${before.h}`);

  // Arrow keys (moving into an enemy is the attack) plus Space to wait.
  const keys = ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Space', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowUp'];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(keys[i % keys.length]);
    await page.waitForTimeout(25);
  }
  // Touch D-pad buttons too (skipped automatically if the run is over).
  const mid = await overInfo(page);
  if (!mid.runOver) {
    for (const act of ['up', 'right', 'down', 'left', 'wait']) {
      await page.locator(`[data-act="${act}"]`).click({ timeout: 2000 }).catch((e) => errors.push(`dpad ${act}: ${e.message.split('\n')[0]}`));
    }
  }
  await page.waitForTimeout(400);

  const after = await canvasInfo(page);
  const hudAfter = await hudText(page);
  const hudChanged = hudAfter !== hudBefore;
  const canvasChanged = after.hash !== before.hash;
  check('input changes the game (HUD/log or canvas)', hudChanged || canvasChanged, `hud ${hudChanged ? 'changed' : 'same'}, canvas ${canvasChanged ? 'changed' : 'same'}`);
  console.log(`INFO [${name}] hud after: ${hudAfter.slice(0, 300)}`);

  const end = await overInfo(page);
  if (end.runOver) {
    console.log(`INFO [${name}] RUN_OVER=yes reason="${end.title}" ${end.floor} | ${end.turns} | ${end.kills} | hp ${end.hp}`);
    // A run may only end by falling (0 HP) or clearing the tower.
    const hpLeft = parseInt(end.hp, 10);
    const consistent = /cleared/i.test(end.title) || hpLeft === 0;
    check('run-over screen matches state (fell at 0 HP or cleared)', consistent, `title=${end.title} hp=${end.hp}`);
  } else {
    console.log(`INFO [${name}] RUN_OVER=no (overlay hidden, run still going)`);
  }
  await page.screenshot({ path: outPath(`${name}.png`), fullPage: true });
} catch (err) {
  errors.push('smoke: ' + (err && err.message ? err.message.split('\n')[0] : String(err)));
  check('smoke finished without exception', false);
} finally {
  if (browser) await browser.close().catch(() => {});
}

check('no console or page errors', errors.length === 0, `${errors.length} error(s)`);
for (const e of errors) console.log(`ERROR[${name}]: ${e.slice(0, 300)}`);
const ok = results.every((r) => r.ok);
writeFileSync(outPath(`smoke-${name}.json`), JSON.stringify({ name, url, ok, results, errors }, null, 2));
console.log(`SMOKE_${name.toUpperCase()}=${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
