// Daily Tower v2 browser smoke (Playwright chromium). Prints one line per check
// and 'SMOKE pass=yes|no'. Writes docs/v2-smoke.json and screenshots. Exit 1 on failure.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const CLASSES = { warrior: 'Warrior', rogue: 'Rogue', mage: 'Mage' };
const results = [];
const ok = (name, cond, info = '') => {
  results.push({ name, ok: !!cond, info: String(info).slice(0, 400) });
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info !== '' ? ' :: ' + String(info).slice(0, 200) : ''}`);
};
mkdirSync('docs', { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + path, { waitUntil: 'load' });
  return { ctx, page, errors };
}
const cspErrors = (errs) => errs.filter((e) => /Content Security Policy|Refused to/i.test(e));

// Wait until the HUD HP is filled in. Polls from Node (no page.waitForFunction),
// so the game's CSP never has to allow unsafe-eval.
async function waitHud(page, timeout = 25000) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    last = await page.locator('#hp').textContent({ timeout: 1000 }).catch(() => null);
    if (last !== null && last !== '-') return;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout ${timeout}ms waiting for #hp to leave '-' (last=${last})`);
}

async function canvasColors(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game');
    if (!c || !c.width || !c.height) return 0;
    const t = document.createElement('canvas');
    t.width = 64; t.height = 64;
    const x = t.getContext('2d');
    x.drawImage(c, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return set.size;
  });
}

try {
  // 1. Hero screen, each class.
  for (const [cls, label] of Object.entries(CLASSES)) {
    const { ctx, page, errors } = await open('/');
    try {
      ok(`${cls}: hero screen visible on first visit`, await page.isVisible('#hero'));
      await page.fill('#hero-name', 'Test<b>x</b>');
      await page.click(`.class-card[data-cls="${cls}"]`);
      await page.click('#hero-start');
      await waitHud(page);
      ok(`${cls}: hero screen closes after Start`, !(await page.isVisible('#hero')));
      const name = await page.textContent('#hero-label');
      const tags = await page.evaluate(() => document.getElementById('hero-label').children.length);
      ok(`${cls}: name sanitised and set as text`, name === 'Testbxb' && tags === 0, `name=${name} children=${tags}`);
      ok(`${cls}: HUD shows class`, (await page.textContent('#cls')) === label);
      const saved = await page.evaluate(() => localStorage.getItem('daily-tower-hero'));
      ok(`${cls}: hero saved in localStorage`, saved && JSON.parse(saved).cls === cls, saved);
      ok(`${cls}: no tip UI on /`, !(await page.isVisible('#support')));
      const hud0 = await page.textContent('.hud');
      let cdShown = false;
      for (const k of ['Digit1', 'ArrowUp', 'Digit1', 'ArrowLeft', 'Digit1', 'ArrowRight', 'Digit1', 'ArrowDown', 'Digit1']) {
        await page.keyboard.press(k);
        await page.waitForTimeout(120);
        const cd = (await page.textContent('#sk0 .sk-cd')) || '';
        if (/^\d+$/.test(cd.trim())) { cdShown = true; break; }
        if (await page.isVisible('#over')) break;
      }
      ok(`${cls}: skill 1 shows a cooldown number`, cdShown, await page.textContent('#sk0'));
      const hud1 = await page.textContent('.hud');
      const log = await page.textContent('#log');
      ok(`${cls}: HUD or log changed after keys`, hud1 !== hud0 || (log || '').length > 0, log);
      await page.waitForTimeout(600);
      const colors = await canvasColors(page);
      ok(`${cls}: WebGL canvas non-blank`, colors > 4, `distinct colours=${colors}`);
      await page.screenshot({ path: `docs/v2-${cls}.png` });
      await page.reload({ waitUntil: 'load' });
      await waitHud(page);
      ok(`${cls}: returning player skips hero screen`, !(await page.isVisible('#hero')));
      ok(`${cls}: 0 console errors`, errors.length === 0, errors.join(' | '));
      ok(`${cls}: 0 CSP violations`, cspErrors(errors).length === 0);
    } catch (e) {
      ok(`${cls}: flow completed`, false, e.message);
      await page.screenshot({ path: `docs/v2-${cls}-fail.png` }).catch(() => {});
    }
    await ctx.close();
  }

  // 2. Tip gating stays as before.
  {
    const { ctx, page, errors } = await open('/?tiptest=1');
    await page.waitForTimeout(800);
    ok('tiptest: #support visible', await page.isVisible('#support'));
    const hrefs = await page.$$eval('#support a.tip', (as) => as.map((a) => a.getAttribute('href') || ''));
    ok('tiptest: 3 Stripe TEST links', hrefs.length === 3 && hrefs.every((h) => h.startsWith('https://donate.stripe.com/test_')), hrefs.join(' '));
    ok('tiptest: TEST MODE label', await page.isVisible('#tip-test-label'));
    ok('tiptest: HYPOTHESIS note', ((await page.textContent('#support')) || '').includes('HYPOTHESIS'));
    ok('tiptest: 0 console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open('/?tip=thanks&x=1#h');
    await page.waitForTimeout(800);
    ok('thanks: thank-you line visible', await page.isVisible('#tip-thanks'));
    const u = new URL(page.url());
    ok('thanks: URL keeps ?x=1#h', u.search + u.hash === '?x=1#h', page.url());
    ok('thanks: 0 console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/3d.html');
    await page.waitForURL((u) => u.pathname === '/' || u.pathname.endsWith('/index.html'), { timeout: 10000 }).catch(() => {});
    const u = new URL(page.url());
    ok('3d.html redirects to /', u.pathname === '/', page.url());
    ok('3d.html: canvas present after redirect', (await page.$('canvas#game')) !== null);
    await ctx.close();
  }
} catch (e) {
  ok('smoke script completed', false, e.message);
}
await browser.close();

const pass = results.length > 0 && results.every((r) => r.ok);
const line = `SMOKE pass=${pass ? 'yes' : 'no'}`;
console.log(line);
writeFileSync('docs/v2-smoke.json', JSON.stringify({ line, pass, at: new Date().toISOString(), results }, null, 2));
process.exit(pass ? 0 : 1);
