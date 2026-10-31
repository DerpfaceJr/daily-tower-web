// Browser entry: builds the daily seed, loads today's floor, wires input.
import { newRun, step } from './sim.js';
import { render } from './render.js';
import { THEMES } from './floors.js';
import { KINDS } from './enemies.js';

const TRAPS = ['none', 'spikes'];
const DEFAULT_MODS = { floor: 5, theme: 'stone', enemy: null, trap: 'none', sample: false };
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'wait',
};

// Same seed for everyone on a given UTC day.
const seed = new Date().toISOString().slice(0, 10);
const $ = (id) => document.getElementById(id);
const ctx = $('game').getContext('2d');
let mods = null; // null = no modified floor
let state = null;

// Keep only whitelisted values; anything else falls back to defaults.
function sanitizeMods(raw) {
  const m = { ...DEFAULT_MODS };
  if (!raw || typeof raw !== 'object') return m;
  const src = raw.modifiers && typeof raw.modifiers === 'object' ? raw.modifiers : {};
  if (THEMES.includes(src.theme)) m.theme = src.theme;
  if (KINDS.includes(src.enemy)) m.enemy = src.enemy;
  if (TRAPS.includes(src.trap)) m.trap = src.trap;
  if (Number.isInteger(raw.floor) && raw.floor >= 1 && raw.floor <= 9) m.floor = raw.floor;
  m.sample = raw.sample === true;
  return m;
}

// Untrusted strings: type-checked, length-capped, only ever set via textContent.
const cleanText = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function showToday(raw, why = "Today's floor: unavailable (default floor)") {
  const sample = !!raw && raw.sample === true;
  $('today-title').textContent = sample ? 'Sample floor' : "Today's floor";
  $('sample-badge').hidden = !sample;
  if (!raw) {
    $('today-label').textContent = why;
    $('today-detail').textContent = '';
    $('today-comment').textContent = '';
    return;
  }
  $('today-label').textContent = cleanText(raw.label, 120) || (sample ? 'Sample floor' : "Today's floor");
  const bits = [`Floor ${mods.floor}`, `${mods.theme} theme`];
  if (mods.enemy) bits.push(`more ${mods.enemy}s`);
  if (mods.trap === 'spikes') bits.push('spike traps (2 damage)');
  $('today-detail').textContent = bits.join(' · ');
  const ex = cleanText(raw.comment_example, 140);
  $('today-comment').textContent = ex ? `Example comment: "${ex}"` : '';
}

async function loadToday() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('./floors/today.json', { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    clearTimeout(timer);
    if (!raw || typeof raw !== 'object') throw new Error('bad shape');
    // Only today's file (or a labelled sample) changes the tower.
    if (raw.sample === true || raw.date === seed) {
      mods = sanitizeMods(raw);
      showToday(raw);
    } else {
      mods = null;
      showToday(null, "Today's floor: not set yet (default floor)");
    }
  } catch (err) {
    // file:// or network failure: play with no modified floor.
    mods = null;
    showToday(null);
  }
}

function saveBest(floor) {
  try {
    const key = 'daily-tower-best:' + seed;
    const prev = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    const best = Math.max(prev, floor);
    localStorage.setItem(key, String(best));
    return best;
  } catch (err) {
    return 0; // storage blocked; skip the best score
  }
}

// Messages added since `prev` (the sim keeps only the last few lines).
function newLines(prev, next) {
  for (let d = 0; d <= prev.length; d++) {
    const kept = prev.slice(d);
    if (kept.every((m, i) => next[i] === m)) return next.slice(kept.length);
  }
  return next;
}

// The visible list is redrawn; only #log-latest is aria-live.
function draw(prevLog = null) {
  render(ctx, state);
  const p = state.player;
  $('hp').textContent = `${p.hp}/${p.maxHp}`;
  $('floor').textContent = String(state.floor);
  $('atk').textContent = String(p.atk);
  const list = $('log');
  list.replaceChildren();
  for (const msg of state.log) {
    const li = document.createElement('li');
    li.textContent = msg;
    list.appendChild(li);
  }
  const fresh = prevLog ? newLines(prevLog, state.log) : state.log;
  if (fresh.length) $('log-latest').textContent = fresh.join(' ');
}

function showOver() {
  const best = saveBest(state.floorReached);
  $('over-title').textContent = state.won ? 'Tower cleared!' : 'You fell';
  $('over-floor').textContent = `Floor reached: ${state.floorReached}`;
  $('over-turns').textContent = `Turns: ${state.turns}`;
  $('over-kills').textContent = `Kills: ${state.kills}`;
  $('over-best').textContent = best ? `Your best on this device today: floor ${best}` : '';
  $('over').hidden = false;
  $('retry').focus();
}

function restart() {
  state = newRun(seed, mods);
  $('over').hidden = true;
  draw();
}

// In-run restart: asks first unless the run is already over.
function askRestart() {
  if (!state) return;
  if (state.over || confirm('Restart the run from floor 1? (Same daily tower.)')) restart();
}

// Input is ignored only while loading or on the run-over screen.
function act(action) {
  if (!state || state.over) return;
  const prevLog = state.log;
  state = step(state, action);
  draw(prevLog);
  if (state.over) showOver();
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'KeyR') {
    e.preventDefault();
    askRestart();
    return;
  }
  if (state && state.over) return;
  const action = KEYS[e.code];
  if (!action) return;
  e.preventDefault();
  act(action);
});

for (const btn of document.querySelectorAll('[data-act]')) {
  btn.addEventListener('click', () => {
    act(btn.dataset.act);
    btn.blur(); // so Space does not re-click a focused button
  });
}
$('retry').addEventListener('click', restart);
$('restart').addEventListener('click', (e) => {
  askRestart();
  e.currentTarget.blur();
});

$('seed').textContent = `Tower of ${seed} (UTC)`;
loadToday().then(restart);
