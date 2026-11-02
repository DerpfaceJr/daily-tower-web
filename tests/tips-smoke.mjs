// Daily Tower tips smoke test (TEST MODE). Runs in CI only; Playwright is installed there.
// Checks:
//  a) '/' shows no tip UI, 0 console errors, 0 CSP violations
//  b) '/?tiptest=1' shows #support, 3 donate.stripe.com/test_ links, TEST MODE label, HYPOTHESIS note
//  c) '/?tip=thanks&x=1#h' shows the thank-you line and the URL becomes '?x=1#h'
//  d) '/3d.html' loads with 0 console errors and a canvas
// Writes docs/smoke.json with a SMOKE line. Exits non-zero on any failure.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8000';
const results = {};
function rec(name, ok, detail) {
  results[name] = { pass: !!ok, detail };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
mkdirSync('docs', { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open(path, settleMs = 1500) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const csp = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(t);
    if (/Content Security Policy/i.test(t)) csp.push(t);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForTimeout(settleMs);
  const dom = await page.evaluate(() => window.__csp || []);
  return { ctx, page, errors, csp: [...csp, ...dom] };
}
const first = (label, arr) => (arr.length ? ` ${label}=${JSON.stringify(String(arr[0]).slice(0, 200))}` : '');

async function check(name, fn) {
  try {
    await fn();
  } catch (e) {
    rec(name, false, 'threw: ' + (e && e.message ? e.message.slice(0, 300) : String(e)));
  }
}

await check('a_root_no_tip_ui', async () => {
  const o = await open('/');
  const supportVisible = await o.page.isVisible('#support');
  const tipVisible = await o.page.$$eval('a.tip', (as) => as.some((a) => a.getClientRects().length > 0));
  await o.page.screenshot({ path: 'docs/smoke-root.png', fullPage: true });
  rec('a_root_no_tip_ui',
    !supportVisible && !tipVisible && o.errors.length === 0 && o.csp.length === 0,
    `support_visible=${supportVisible} tip_visible=${tipVisible} console_errors=${o.errors.length} csp_violations=${o.csp.length}` +
      first('first_error', o.errors) + first('first_csp', o.csp));
  await o.ctx.close();
});

await check('b_tiptest_shown', async () => {
  const o = await open('/?tiptest=1');
  const supportVisible = await o.page.isVisible('#support');
  const hrefs = await o.page.$$eval('#support a[data-tip]', (as) => as.map((a) => a.href));
  const testLinks = hrefs.filter((h) => /^https:\/\/donate\.stripe\.com\/test_[A-Za-z0-9_]+$/.test(h)).length;
  const labelVisible = await o.page.isVisible('#tip-test-label');
  const text = supportVisible ? await o.page.innerText('#support') : '';
  const label = labelVisible && text.includes('TEST MODE: no real money');
  const hyp = text.includes('HYPOTHESIS');
  await o.page.screenshot({ path: 'docs/smoke-tiptest.png', fullPage: true });
  rec('b_tiptest_shown',
    supportVisible && testLinks === 3 && label && hyp && o.errors.length === 0 && o.csp.length === 0,
    `support_visible=${supportVisible} test_links=${testLinks}/3 test_label=${label} hypothesis_note=${hyp} console_errors=${o.errors.length} csp_violations=${o.csp.length}` +
      first('first_error', o.errors));
  await o.ctx.close();
});

await check('c_thanks_and_url', async () => {
  const o = await open('/?tip=thanks&x=1#h');
  const thanks = await o.page.isVisible('#tip-thanks');
  const u = new URL(o.page.url());
  const after = u.search + u.hash;
  const supportVisible = await o.page.isVisible('#support');
  await o.page.screenshot({ path: 'docs/smoke-thanks.png', fullPage: true });
  rec('c_thanks_and_url',
    thanks && after === '?x=1#h' && !supportVisible && o.errors.length === 0,
    `thanks_visible=${thanks} url_after=${JSON.stringify(after)} support_visible=${supportVisible} console_errors=${o.errors.length}` +
      first('first_error', o.errors));
  await o.ctx.close();
});

await check('d_3d_loads', async () => {
  const o = await open('/3d.html', 5000);
  const canvases = await o.page.locator('canvas').count();
  await o.page.screenshot({ path: 'docs/smoke-3d.png', fullPage: true });
  rec('d_3d_loads',
    canvases > 0 && o.errors.length === 0,
    `canvas_count=${canvases} console_errors=${o.errors.length}` + first('first_error', o.errors));
  await o.ctx.close();
});

await browser.close();

const pass = Object.keys(results).length === 4 && Object.values(results).every((r) => r.pass);
const SMOKE = `SMOKE pass=${pass ? 'yes' : 'no'} ` +
  Object.entries(results).map(([k, v]) => `${k}=${v.pass ? 'ok' : 'FAIL'}`).join(' ');
console.log(SMOKE);
writeFileSync('docs/smoke.json', JSON.stringify({
  SMOKE,
  sha: process.env.GITHUB_SHA || null,
  run_id: process.env.GITHUB_RUN_ID || null,
  base: BASE,
  checks: results,
}, null, 2));
process.exit(pass ? 0 : 1);
