// Turn-based simulation. step(state, action) returns a new state object;
// the input state is never mutated. All randomness comes from state.rng.
import { mulberry32, randInt, seedFromString } from './rng.js';
import { generateFloor, DIRS, dist, WALL, PILLAR, STAIRS, SPIKES } from './floors.js';
import { TYPES } from './enemies.js';

export const LAST_FLOOR = 10;
export const ACTIONS = ['up', 'down', 'left', 'right', 'wait'];
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const POTION_HEAL = 10;
const SPIKE_DAMAGE = 2;
const LOG_MAX = 6;

function log(s, msg) {
  s.log.push(msg);
  while (s.log.length > LOG_MAX) s.log.shift();
}

// Modifiers apply only to the floor they name.
const modsFor = (mods, f) => (mods && mods.floor === f ? mods : null);

// Log tag for a modified floor; a sample file never claims to be today's.
const modTag = (s) => (!s.modded ? '' : s.mods.sample ? ' Sample floor.' : " Today's floor!");

function enterFloor(s, f) {
  const fl = generateFloor(s.seed, f, modsFor(s.mods, f));
  s.floor = f;
  s.floorReached = Math.max(s.floorReached, f);
  s.tiles = fl.tiles;
  s.stairs = fl.stairs;
  s.theme = fl.theme;
  s.modded = fl.modded;
  s.enemies = fl.enemies;
  s.potions = fl.potions;
  s.player.x = fl.start.x;
  s.player.y = fl.start.y;
}

// Fresh run. mods = { floor, theme, enemy, trap, sample } (whitelisted) or null.
export function newRun(seed, mods = null) {
  const s = {
    seed: String(seed),
    mods,
    floor: 0,
    floorReached: 0,
    turns: 0,
    kills: 0,
    over: false,
    won: false,
    log: [],
    rng: seedFromString('run|' + seed),
    player: { x: 0, y: 0, hp: 20, maxHp: 20, atk: 5, def: 1 },
  };
  enterFloor(s, 1);
  log(s, 'You enter the Daily Tower. Floor 1.' + modTag(s));
  return s;
}

const enemyAt = (s, x, y) => s.enemies.find((e) => e.x === x && e.y === y);

// max(1, atk - def) plus 0 or 1 seeded variance.
const damage = (rng, atk, def) => Math.max(1, atk - def) + randInt(rng, 2);

function hurtPlayer(s, amount, text) {
  const p = s.player;
  p.hp = Math.max(0, p.hp - amount);
  log(s, `${text} for ${amount}.`);
  if (p.hp <= 0) {
    s.over = true;
    s.won = false;
    log(s, 'You have fallen.');
  }
}

function win(s) {
  s.over = true;
  s.won = true;
  s.floorReached = LAST_FLOOR;
  log(s, 'The tower is cleared!');
}

function attackEnemy(s, rng, e) {
  const t = TYPES[e.kind];
  const dmg = damage(rng, s.player.atk, e.def);
  e.hp -= dmg;
  if (e.hp > 0) {
    log(s, `You hit the ${t.name} for ${dmg}.`);
    return;
  }
  s.enemies = s.enemies.filter((o) => o !== e);
  s.kills++;
  log(s, `You defeat the ${t.name}!`);
  if (t.boss) win(s);
}

// Returns 'floor' when the floor changed or the run was won.
function takeStairs(s) {
  if (s.floor < LAST_FLOOR) {
    const p = s.player;
    p.maxHp += 2;
    p.atk += 1;
    if (s.floor % 3 === 0) p.def += 1;
    p.hp = Math.min(p.maxHp, p.hp + 2 + Math.floor(p.maxHp / 5));
    enterFloor(s, s.floor + 1);
    if (s.floor === LAST_FLOOR) log(s, 'Floor 10. The Warden awaits.');
    else log(s, `You climb to floor ${s.floor}.` + modTag(s));
    return 'floor';
  }
  // Floor 10: sealed while a boss lives (if none exists, the stairs win).
  if (s.enemies.some((e) => TYPES[e.kind].boss)) {
    log(s, 'The stairs are sealed while the Warden lives.');
    return true;
  }
  win(s);
  return 'floor';
}

// Potions are only drunk when they would heal; at full HP they stay put.
function pickUpPotion(s, x, y) {
  const pi = s.potions.findIndex((o) => o.x === x && o.y === y);
  if (pi < 0) return;
  const p = s.player;
  if (p.hp >= p.maxHp) {
    log(s, 'Full HP. You leave the potion for later.');
    return;
  }
  s.potions.splice(pi, 1);
  const heal = Math.min(POTION_HEAL, p.maxHp - p.hp);
  p.hp += heal;
  log(s, `You drink a potion (+${heal} HP).`);
}

// false = no turn used, true = turn used, 'floor' = turn used, skip enemies.
function playerAct(s, rng, action) {
  if (action === 'wait') return true;
  const p = s.player;
  const [dx, dy] = DELTA[action];
  const x = p.x + dx, y = p.y + dy;
  const foe = enemyAt(s, x, y);
  if (foe) {
    attackEnemy(s, rng, foe);
    return s.over ? 'floor' : true;
  }
  const tile = s.tiles[y][x];
  if (tile === WALL || tile === PILLAR) return false;
  p.x = x;
  p.y = y;
  pickUpPotion(s, x, y);
  if (tile === SPIKES) hurtPlayer(s, SPIKE_DAMAGE, 'Spikes stab you');
  if (tile === STAIRS && !s.over) return takeStairs(s);
  return true;
}

function canEnter(s, e, x, y) {
  const tile = s.tiles[y][x];
  if (tile === WALL) return false;
  if (tile === PILLAR && !TYPES[e.kind].phase) return false;
  if (x === s.player.x && y === s.player.y) return false;
  return !enemyAt(s, x, y);
}

// Greedy chase: pick the step that gets closest without moving away.
function chase(s, e) {
  const p = s.player;
  let best = null;
  let bestD = dist(e, p) + 1;
  for (const [dx, dy] of DIRS) {
    const x = e.x + dx, y = e.y + dy;
    if (!canEnter(s, e, x, y)) continue;
    const d = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (d < bestD) {
      best = { x, y };
      bestD = d;
    }
  }
  if (best) {
    e.x = best.x;
    e.y = best.y;
  }
}

// Erratic move: try directions in a seeded shuffled order.
function flutter(s, rng, e) {
  const dirs = DIRS.slice();
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const [dx, dy] of dirs) {
    if (canEnter(s, e, e.x + dx, e.y + dy)) {
      e.x += dx;
      e.y += dy;
      return;
    }
  }
}

function enemiesAct(s, rng) {
  const p = s.player;
  for (const e of s.enemies) {
    if (s.over) return;
    const t = TYPES[e.kind];
    if (dist(e, p) === 1) {
      hurtPlayer(s, damage(rng, e.atk, p.def), `The ${t.name} ${t.verb} you`);
    } else if (t.erratic && rng() < 0.5) {
      flutter(s, rng, e);
    } else {
      chase(s, e);
    }
  }
}

export function step(state, action) {
  if (!state || state.over || !ACTIONS.includes(action)) return state;
  const s = structuredClone(state);
  const rng = mulberry32(s.rng);
  const acted = playerAct(s, rng, action);
  if (acted) {
    s.turns++;
    if (acted === true && !s.over) enemiesAct(s, rng);
  }
  s.rng = rng.getState();
  return s;
}
