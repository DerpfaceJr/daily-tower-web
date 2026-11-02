// Optional Stripe TEST-mode payment check for the $3 test link. Test card 4242 only; no real money.
// Non-blocking: always exits 0. Writes docs/pay.json with a PAY line.
// If Stripe's hosted page blocks automation, it reports that and does not retry.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const LINK = 'https://donate.stripe.com/test_7sY8wPgOQ0Vy4gx4SR4Ja00';
if (!LINK.includes('/test_')) throw new Error('refusing: not a Stripe test link');
mkdirSync('docs', { recursive: true });
const out = { link: LINK, steps: [] };
const log = (s) => { out.steps.push(s); console.log(s); };
let result = 'error';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
const page = await ctx.newPage();
try {
  await page.goto(LINK, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  log('opened ' + page.url());
  if (!page.url().includes('stripe.com')) throw new Error('not on stripe: ' + page.url());

  const fillIf = async (sel, val) => {
    const l = page.locator(sel).first();
    if ((await l.count()) && (await l.isVisible())) {
      if (!(await l.inputValue())) await l.fill(val);
      log('filled ' + sel);
      return true;
    }
    log('missing ' + sel);
    return false;
  };
  const cardTab = page.locator('[data-testid="card-accordion-item-button"]').first();
  if ((await cardTab.count()) && (await cardTab.isVisible())) {
    await cardTab.click();
    await page.waitForTimeout(1000);
    log('clicked card accordion');
  }
  await fillIf('input#customUnitAmount', '3');
  await fillIf('input#email', 'tips-smoke@example.com');
  const hasCard = await fillIf('input#cardNumber', '4242424242424242');
  await fillIf('input#cardExpiry', '12 / 34');
  await fillIf('input#cardCvc', '123');
  await fillIf('input#billingName', 'Smoke Test');
  await fillIf('input#billingPostalCode', '10001');
  if (!hasCard) {
    result = 'blocked_or_layout';
    throw new Error('no card field found (Stripe layout changed or automation blocked)');
  }
  await page.screenshot({ path: 'docs/pay-form.png' });
  await page.locator('button[type="submit"], .SubmitButton').first().click();
  log('clicked pay');
  await page.waitForURL(/derpfacejr\.github\.io\/daily-tower-web\//, { timeout: 60000 });
  log('redirected to ' + page.url());
  await page.waitForTimeout(3000);
  const thanks = await page.isVisible('#tip-thanks');
  log(`tip_thanks_visible=${thanks} url_now=${page.url()}`);
  result = thanks ? 'redirected_thanks_shown' : 'redirected_no_thanks';
} catch (e) {
  log('error: ' + (e && e.message ? e.message.slice(0, 300) : String(e)));
  if (result === 'error') result = 'failed_no_redirect';
}
await page.screenshot({ path: 'docs/pay-end.png' }).catch(() => {});
out.final_url = page.url();
out.PAY = `PAY result=${result}`;
console.log(out.PAY);
writeFileSync('docs/pay.json', JSON.stringify(out, null, 2));
await browser.close();
process.exit(0);
