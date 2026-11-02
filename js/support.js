// Daily Tower tips. Static Stripe Payment Links, no server, no webhook.
// TEST MODE: these are Stripe test-mode links (Clowder sandbox). No real money moves.
// Prices ($3 / $5 / $10) are a HYPOTHESIS. No secrets in this file: Payment Link URLs are public.
// Imports nothing from the game; tips never change a run.
//
// Visibility rules:
// - TEST_MODE = true: the tip section stays hidden unless the URL has ?tiptest=1.
//   Normal visitors see no tip UI.
// - TEST_MODE = false (later, live links only): the section shows for everyone.
// - In both modes, all 3 links must pass the regex and match the mode, or nothing shows.
const TEST_MODE = true;
const TIP_LINKS = {
  3: 'https://donate.stripe.com/test_7sY8wPgOQ0Vy4gx4SR4Ja00',
  5: 'https://donate.stripe.com/test_3cI9AT7egbAc4gxdpn4Ja01',
  10: 'https://donate.stripe.com/test_fZu00jgOQ5bO8wNgBz4Ja02',
};
const ALLOWED = /^https:\/\/(buy|donate)\.stripe\.com\/[A-Za-z0-9_]+$/;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const optedIn = TEST_MODE ? params.get('tiptest') === '1' : true;

const sec = $('support');
const links = sec ? [...sec.querySelectorAll('a[data-tip]')] : [];
let ready = links.length === 3;
for (const a of links) {
  const url = TIP_LINKS[a.dataset.tip];
  const isTest = !!url && url.includes('/test_');
  if (!url || !ALLOWED.test(url) || isTest !== TEST_MODE) { ready = false; continue; }
  a.href = url;
}
const label = $('tip-test-label');
if (label) label.hidden = !TEST_MODE;
if (sec && ready && optedIn) sec.hidden = false;

// Return from Stripe: a thank-you line only. It sits OUTSIDE #support so it shows even
// when the section is hidden. It grants nothing and is NOT proof of payment.
if (params.get('tip') === 'thanks') {
  const t = $('tip-thanks');
  if (t) {
    if (TEST_MODE) t.textContent += ' (Test mode: no real money moved.)';
    t.hidden = false;
  }
  // Clear only the tip param; keep every other param and the #hash.
  params.delete('tip');
  const q = params.toString();
  history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
}
