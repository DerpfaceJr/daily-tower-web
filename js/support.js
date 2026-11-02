// Daily Tower tips. Static Stripe Payment Links, no server, no webhook.
// TEST MODE: these are Stripe test-mode links (Clowder sandbox). No real money moves.
// Prices ($3 / $5 / $10) are a HYPOTHESIS. No secrets in this file: Payment Link URLs are public.
// Imports nothing from the game; tips never change a run.
const TEST_MODE = true;
const TIP_LINKS = {
  3: 'https://donate.stripe.com/test_7sY8wPgOQ0Vy4gx4SR4Ja00',
  5: 'https://donate.stripe.com/test_3cI9AT7egbAc4gxdpn4Ja01',
  10: 'https://donate.stripe.com/test_fZu00jgOQ5bO8wNgBz4Ja02',
};
const ALLOWED = /^https:\/\/(buy|donate)\.stripe\.com\/[A-Za-z0-9_]+$/;
const $ = (id) => document.getElementById(id);

// Show the section only if all 3 links are well-formed AND match the mode
// (test links only in TEST_MODE, live links only when TEST_MODE is false).
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
if (sec && ready) sec.hidden = false;

// Return from Stripe: a thank-you line only. It grants nothing and is NOT proof of payment.
if (new URLSearchParams(location.search).get('tip') === 'thanks') {
  const t = $('tip-thanks');
  if (t) t.hidden = false;
  history.replaceState(null, '', location.pathname);
}
