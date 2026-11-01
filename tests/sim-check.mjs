// Headless sim check (Node 22, no dependencies). Run from repo root:
//   node tests/sim-check.mjs
// Prints PASS/FAIL lines, then SIM=PASS or SIM=FAIL. Exits 1 on any failure.
import { readFileSync } from 'node:fs';
import { newRun, step } from '../js/sim.js';
import { WALL, PILLAR, STAIRS, SPIKES } from '../js/floors.js';

let failed = 0;
const check = (label, ok, info = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${info ? ' - ' + info : ''}`);
};

const MOVES = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
const hpSum = (s) => s.enemies.reduce((a, e) => a + e.hp, 0);
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function nearest(p, list) {
  let best = null;
  let bd = Infinity;
  for (const o of list) {
    const d = manhattan(o, p);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// Mixed policy: attack an adjacent foe, otherwise chase the nearest one,
// with some wandering and waiting mixed in. Fully deterministic.
function choose(s, i) {
  const p = s.player;
  for (const [a, dx, dy] of MOVES) {
    if (s.enemies.some((e) => e.x === p.x + dx && e.y === p.y + dy)) return a;
  }
  if (i % 9 === 8) return 'wait';
  const open = MOVES.filter(([, dx, dy]) => {
    const t = s.tiles[p.y + dy]?.[p.x + dx];
    return t !== undefined && t !== WALL && t !== PILLAR;
  });
  if (!open.length) return 'wait';
  if (i % 5 === 4) return open[i % open.length][0];
  const goal = nearest(p, s.enemies) || s.stairs;
  if (!goal) return open[0][0];
  const cost = ([, dx, dy]) => manhattan({ x: p.x + dx, y: p.y + dy }, goal);
  open.sort((a, b) => cost(a) - cost(b));
  return open[0][0];
}

let badOver = 0;
let badOverInfo = '';
function play(seed, mods, steps = 200) {
  let s = newRun(seed, mods);
  const start = { x: s.player.x, y: s.player.y, floor: s.floor };
  let moved = false;
  let hits = 0;
  for (let i = 0; i < steps && !s.over; i++) {
    const prev = s;
    s = step(prev, choose(prev, i));
    if (s.floor !== start.floor || s.player.x !== start.x || s.player.y !== start.y) moved = true;
    if (s.kills > prev.kills || (s.floor === prev.floor && hpSum(s) < hpSum(prev))) hits++;
    // A run may only end by falling (hp 0) or winning.
    if (s.over && s.player.hp > 0 && !s.won) {
      badOver++;
      if (!badOverInfo) badOverInfo = `${seed} turn=${s.turns} floor=${s.floor} hp=${s.player.hp} log=${s.log.slice(-2).join(' / ')}`;
    }
  }
  return { s, moved, hits };
}

const SAMPLE = { floor: 1, theme: 'lava', enemy: 'bat', trap: 'spikes', sample: true };
const RUNS = [
  ['2026-10-31', null], ['2026-11-01', null], ['2026-11-02', null],
  ['sim-check-a', null], ['sim-check-b', null],
  ['2026-10-31', SAMPLE], ['sim-check-c', SAMPLE],
];

let anyMoved = false;
let totalHits = 0;
let overState = null;
for (const [seed, mods] of RUNS) {
  const label = `run ${seed}${mods ? ' +sample mods' : ''} (200 steps) no throw`;
  try {
    const r = play(seed, mods);
    anyMoved ||= r.moved;
    totalHits += r.hits;
    if (r.s.over && !overState) overState = r.s;
    const p = r.s.player;
    check(label, true, `turns=${r.s.turns} floor=${r.s.floorReached} kills=${r.s.kills} hp=${p.hp}/${p.maxHp} hits=${r.hits} over=${r.s.over} won=${r.s.won}`);
  } catch (err) {
    check(label, false, String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
  }
}
check('hero position changes', anyMoved);
check('at least one enemy HP drops or an enemy dies', totalHits > 0, `hit turns=${totalHits}`);
check('run is over only at hp 0 or on a win', badOver === 0, badOverInfo);

try {
  const a = JSON.stringify(play('determinism', null).s);
  const b = JSON.stringify(play('determinism', null).s);
  check('same seed + same inputs gives the same state', a === b);

  const s0 = newRun('mutation-check');
  const snap = JSON.stringify(s0);
  step(s0, 'right');
  step(s0, 'up');
  check('step() does not mutate its input', JSON.stringify(s0) === snap);
  check('unknown action is ignored', step(s0, 'jump') === s0);
  const over = overState || { ...s0, over: true };
  check('input after run over is ignored', step(over, 'up') === over);
} catch (err) {
  check('determinism / purity checks no throw', false, String(err));
}

// Potions: left in place at full HP, drunk (and removed) when they heal.
try {
  const base = structuredClone(newRun('potion-check'));
  base.enemies = [];
  const p = base.player;
  const spot = MOVES.find(([, dx, dy]) => {
    const t = base.tiles[p.y + dy]?.[p.x + dx];
    return t !== undefined && t !== WALL && t !== PILLAR && t !== STAIRS && t !== SPIKES;
  });
  if (!spot) throw new Error('no open tile next to start');
  const [dir, dx, dy] = spot;
  base.potions = [{ x: p.x + dx, y: p.y + dy }];
  const full = step(base, dir);
  check('potion at full HP is not drunk', full.potions.length === 1 && full.player.hp === full.player.maxHp, `potions=${full.potions.length} hp=${full.player.hp}/${full.player.maxHp}`);
  const hurt = structuredClone(base);
  hurt.player.hp = hurt.player.maxHp - 3;
  const healed = step(hurt, dir);
  check('potion below full HP heals and is used up', healed.potions.length === 0 && healed.player.hp === healed.player.maxHp, `potions=${healed.potions.length} hp=${healed.player.hp}/${healed.player.maxHp}`);
} catch (err) {
  check('potion checks no throw', false, String(err));
}

const BANNED = /Math\.random|new Date|Date\.now|performance\.now/;
for (const f of ['rng.js', 'sim.js', 'floors.js', 'enemies.js']) {
  try {
    const src = readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    const m = src.match(BANNED);
    check(`js/${f} has no Math.random/Date/performance.now`, !m, m ? m[0] : '');
  } catch (err) {
    check(`js/${f} readable`, false, String(err));
  }
}

console.log(failed ? `SIM=FAIL (${failed} failed)` : 'SIM=PASS');
process.exit(failed ? 1 : 0);
