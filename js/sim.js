// Turn-based simulation. step(state, action) returns a new state object;
// the input state is never mutated. All randomness comes from state.rng.
import { mulberry32, randInt, seedFromString } from './rng.js';
import { generateFloor, DIRS, dist, WALL, PILLAR, STAIRS, SPIKES } from './floors.js';
import { TYPES } from './enemies.js';

export const LAST_FLOOR = 10;
export const ACTIONS = [
  'up', 'down', 'left', 'right', 'wait',
  'skill1', 'skill2', 'skill3', 'pick0', 'pick1', 'pick2',
];
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const POTION_HEAL = 10;
const SPIKE_DAMAGE = 2;
const POISON_TICK = 2;
const POISON_TURNS = 4;
const LOG_MAX = 6;

// Hero classes. Floors never depend on the class: same tower for everyone.
export const CLASSES = {
  warrior: { name: 'Warrior', hp: 28, atk: 5, def: 2, crit: 0.05, dodge: 0, skills: ['cleave', 'shield', 'warcry'] },
  rogue: { name: 'Rogue', hp: 20, atk: 5, def: 1, crit: 0.25, dodge: 0.15, skills: ['dash', 'poison', 'smoke'] },
  mage: { name: 'Mage', hp: 17, atk: 4, def: 0, crit: 0.1, dodge: 0.05, skills: ['fireball', 'frost', 'blink'] },
};
export const CLASS_IDS = Object.keys(CLASSES);
export const isClass = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, c);

export const SKILLS = {
  cleave: { name: 'Cleave', cd: 4, text: 'Hit all 8 neighbours' },
  shield: { name: 'Shield', cd: 8, text: 'Halve damage for 3 turns' },
  warcry: { name: 'War Cry', cd: 10, text: 'Heal 25%, stun adjacent' },
  dash: { name: 'Dash', cd: 5, text: 'Move up to 3 tiles' },
  poison: { name: 'Poison', cd: 6, text: 'Hit + poison within 2' },
  smoke: { name: 'Smoke Bomb', cd: 9, text: 'Dodge all for 2 turns' },
  fireball: { name: 'Fireball', cd: 4, text: 'Bolt up to 6 tiles, splash' },
  frost: { name: 'Frost Nova', cd: 7, text: 'Freeze all within 2' },
  blink: { name: 'Blink', cd: 8, text: 'Teleport up to 4 tiles' },
};

export const UPGRADES = {
  vigor: { name: 'Vigor', text: '+6 max HP, heal 6' },
  might: { name: 'Might', text: '+1 ATK' },
  guard: { name: 'Guard', text: '+1 DEF' },
  precision: { name: 'Precision', text: '+8% crit' },
  haste: { name: 'Haste', text: 'All cooldowns -1 (min 2)' },
  vampiric: { name: 'Vampiric', text: '+1 HP per kill' },
};
const UPGRADE_IDS = Object.keys(UPGRADES);

export const xpFor = (level) => 8 + 6 * (level - 1);
export const skillCd = (p, id) => Math.max(2, SKILLS[id].cd - (p.haste || 0));

function log(s, msg) {
  s.log.push(msg);
  while (s.log.length > LOG_MAX) s.log.shift();
}

// Modifiers apply only to the floor they name.
const modsFor = (mods, f) => (mods && mods.floor === f ? mods : null);

// Log tag for a modified floor; a sample file never claims to be today's.
const modTag = (s) => (!s.modded ? '' : s.mods.sample ? ' Sample floor.' : " Today's floor!");

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const at = (o) => ({ x: o.x, y: o.y });

function tileAt(s, x, y) {
  const row = s.tiles[y];
  return row && row[x] !== undefined ? row[x] : WALL;
}
const blocked = (t) => t === WALL || t === PILLAR;

function enterFloor(s, f) {
  const fl = generateFloor(s.seed, f, modsFor(s.mods, f));
  s.floor = f;
  s.floorReached = Math.max(s.floorReached, f);
  s.tiles = fl.tiles;
  s.stairs = fl.stairs;
  s.theme = fl.theme;
  s.modded = fl.modded;
  s.enemies = fl.enemies.map((e) => ({ ...e, maxHp: e.maxHp ?? e.hp }));
  s.potions = fl.potions;
  s.player.x = fl.start.x;
  s.player.y = fl.start.y;
  s.fx = [];
}

// Fresh run. mods = { floor, theme, enemy, trap, sample } (whitelisted) or null.
// cls is checked against the class whitelist; unknown values become warrior.
export function newRun(seed, mods = null, cls = 'warrior') {
  const c = isClass(cls) ? cls : 'warrior';
  const k = CLASSES[c];
  const s = {
    seed: String(seed),
    mods,
    cls: c,
    floor: 0,
    floorReached: 0,
    turns: 0,
    kills: 0,
    over: false,
    won: false,
    log: [],
    fx: [],
    levelUp: null,
    pendingLevels: 0,
    rng: seedFromString('run|' + seed),
    player: {
      x: 0, y: 0, cls: c,
      hp: k.hp, maxHp: k.hp, atk: k.atk, def: k.def, crit: k.crit, dodge: k.dodge,
      face: { dx: 0, dy: 1 }, cd: [0, 0, 0],
      level: 1, xp: 0, xpNext: xpFor(1),
      shield: 0, smoke: 0, haste: 0, vamp: 0,
    },
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

// Draw 3 distinct upgrades with the run rng when a level-up is pending.
function offerLevelUp(s, rng) {
  if (s.levelUp || s.pendingLevels <= 0 || s.over) return;
  const ids = UPGRADE_IDS.slice();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  s.levelUp = { choices: ids.slice(0, 3) };
  s.pendingLevels--;
}

function gainXp(s, rng, xp) {
  if (!(xp > 0)) return;
  const p = s.player;
  p.xp += xp;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpFor(p.level);
    p.maxHp += 2;
    p.hp = Math.min(p.maxHp, p.hp + 2);
    s.pendingLevels++;
    log(s, `Level up! You are level ${p.level}.`);
  }
  offerLevelUp(s, rng);
}

function applyUpgrade(s, id) {
  const p = s.player;
  if (id === 'vigor') { p.maxHp += 6; p.hp = Math.min(p.maxHp, p.hp + 6); }
  else if (id === 'might') p.atk += 1;
  else if (id === 'guard') p.def += 1;
  else if (id === 'precision') p.crit = Math.round((p.crit + 0.08) * 100) / 100;
  else if (id === 'haste') p.haste += 1;
  else if (id === 'vampiric') p.vamp += 1;
  else return;
  log(s, `You choose ${UPGRADES[id].name}.`);
}

// Every kill (attack, skill, splash or poison) goes through here.
function killEnemy(s, rng, e) {
  const t = TYPES[e.kind];
  s.enemies = s.enemies.filter((o) => o !== e);
  s.kills++;
  log(s, `You defeat the ${t.name}!`);
  const p = s.player;
  if (p.vamp > 0) p.hp = Math.min(p.maxHp, p.hp + p.vamp);
  if (t.boss) {
    win(s);
    return;
  }
  gainXp(s, rng, e.maxHp || 0);
}

// A player hit: seeded damage plus a seeded crit roll (x2).
function strike(s, rng, e, atk, verb) {
  const p = s.player;
  let dmg = damage(rng, atk, e.def);
  const crit = p.crit > 0 && rng() < p.crit;
  if (crit) dmg *= 2;
  e.hp -= dmg;
  if (e.hp > 0) {
    log(s, `${verb} the ${TYPES[e.kind].name} for ${dmg}${crit ? ' (crit!)' : ''}.`);
    return;
  }
  killEnemy(s, rng, e);
}

// Flat damage (splash, frost, poison ticks).
function hurtEnemy(s, rng, e, amount, verb) {
  e.hp -= amount;
  if (e.hp > 0) {
    log(s, `${verb} the ${TYPES[e.kind].name} for ${amount}.`);
    return;
  }
  killEnemy(s, rng, e);
}

// Returns 'floor' when the floor changed or the run was won.
function takeStairs(s) {
  if (s.floor < LAST_FLOOR) {
    const p = s.player;
    // Levels replace the old +1 ATK per floor.
    p.maxHp += 2;
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

// Landing on a tile: potions, spikes and stairs trigger here only.
function landOn(s, x, y) {
  const p = s.player;
  p.x = x;
  p.y = y;
  pickUpPotion(s, x, y);
  const tile = tileAt(s, x, y);
  if (tile === SPIKES) hurtPlayer(s, SPIKE_DAMAGE, 'Spikes stab you');
  if (tile === STAIRS && !s.over) return takeStairs(s);
  return true;
}

// Skills: return false (no turn used), true, or 'floor'.
const SKILL_FN = {
  cleave(s, rng) {
    const p = s.player;
    const tiles = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) tiles.push({ x: p.x + dx, y: p.y + dy });
    s.fx.push({ kind: 'cleave', from: at(p), to: at(p), tiles });
    const hit = s.enemies.filter((e) => cheb(e, p) === 1);
    log(s, hit.length ? 'You Cleave!' : 'You Cleave the air.');
    for (const e of hit) {
      if (s.over) break;
      if (s.enemies.includes(e)) strike(s, rng, e, p.atk, 'Cleave hits');
    }
    return true;
  },
  shield(s) {
    const p = s.player;
    p.shield = 3;
    s.fx.push({ kind: 'shield', from: at(p), to: at(p), tiles: [] });
    log(s, 'You raise your Shield (3 turns).');
    return true;
  },
  warcry(s) {
    const p = s.player;
    const heal = Math.min(Math.max(1, Math.floor(p.maxHp / 4)), p.maxHp - p.hp);
    p.hp += heal;
    const tiles = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) tiles.push({ x: p.x + dx, y: p.y + dy });
    let n = 0;
    for (const e of s.enemies) if (cheb(e, p) === 1) { e.frozen = Math.max(e.frozen || 0, 1); n++; }
    s.fx.push({ kind: 'warcry', from: at(p), to: at(p), tiles });
    log(s, `War Cry! +${heal} HP, ${n} stunned.`);
    return true;
  },
  dash(s) {
    const p = s.player;
    const { dx, dy } = p.face;
    let x = p.x, y = p.y;
    const tiles = [];
    for (let k = 0; k < 3; k++) {
      const nx = x + dx, ny = y + dy;
      if (blocked(tileAt(s, nx, ny)) || enemyAt(s, nx, ny)) break;
      x = nx;
      y = ny;
      tiles.push({ x, y });
    }
    if (!tiles.length) {
      log(s, 'No room to Dash.');
      return false;
    }
    s.fx.push({ kind: 'dash', from: at(p), to: { x, y }, tiles });
    log(s, 'You Dash!');
    return landOn(s, x, y);
  },
  poison(s, rng) {
    const p = s.player;
    const { dx, dy } = p.face;
    const tiles = [];
    for (let k = 1; k <= 2; k++) {
      const x = p.x + dx * k, y = p.y + dy * k;
      if (blocked(tileAt(s, x, y))) break;
      tiles.push({ x, y });
      const e = enemyAt(s, x, y);
      if (e) {
        s.fx.push({ kind: 'poison', from: at(p), to: { x, y }, tiles });
        e.poison = POISON_TURNS;
        strike(s, rng, e, p.atk, 'Your poisoned blade cuts');
        return true;
      }
    }
    log(s, 'No target for Poison.');
    return false;
  },
  smoke(s) {
    const p = s.player;
    p.smoke = 2;
    s.fx.push({ kind: 'smoke', from: at(p), to: at(p), tiles: [] });
    log(s, 'Smoke Bomb! You vanish for 2 turns.');
    return true;
  },
  fireball(s, rng) {
    const p = s.player;
    const { dx, dy } = p.face;
    let x = p.x, y = p.y, target = null;
    const tiles = [];
    for (let k = 1; k <= 6; k++) {
      const nx = p.x + dx * k, ny = p.y + dy * k;
      if (blocked(tileAt(s, nx, ny))) break;
      x = nx;
      y = ny;
      tiles.push({ x, y });
      target = enemyAt(s, x, y);
      if (target) break;
    }
    if (!tiles.length) {
      log(s, 'No room to cast Fireball.');
      return false;
    }
    s.fx.push({ kind: 'fireball', from: at(p), to: { x, y }, tiles });
    if (!target) {
      log(s, 'The Fireball fizzles.');
      return true;
    }
    const splash = s.enemies.filter((e) => e !== target && cheb(e, target) === 1);
    strike(s, rng, target, p.atk + 4, 'Your Fireball scorches');
    for (const e of splash) {
      if (s.over) break;
      if (s.enemies.includes(e)) hurtEnemy(s, rng, e, 2, 'Flames lick');
    }
    return true;
  },
  frost(s, rng) {
    const p = s.player;
    const tiles = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) tiles.push({ x: p.x + dx, y: p.y + dy });
    s.fx.push({ kind: 'frost', from: at(p), to: at(p), tiles });
    const hit = s.enemies.filter((e) => cheb(e, p) <= 2);
    log(s, `Frost Nova! ${hit.length} frozen.`);
    for (const e of hit) {
      if (s.over) break;
      if (!s.enemies.includes(e)) continue;
      e.frozen = Math.max(e.frozen || 0, 2);
      hurtEnemy(s, rng, e, 2, 'Frost bites');
    }
    return true;
  },
  blink(s) {
    const p = s.player;
    const { dx, dy } = p.face;
    let dest = null;
    for (let k = 1; k <= 4; k++) {
      const x = p.x + dx * k, y = p.y + dy * k;
      if (!blocked(tileAt(s, x, y)) && !enemyAt(s, x, y)) dest = { x, y };
    }
    if (!dest) {
      log(s, 'Nowhere to Blink.');
      return false;
    }
    s.fx.push({ kind: 'blink', from: at(p), to: dest, tiles: [at(p), dest] });
    log(s, 'You Blink!');
    return landOn(s, dest.x, dest.y);
  },
};

function useSkill(s, rng, i) {
  const p = s.player;
  const id = CLASSES[p.cls].skills[i];
  if (!id || p.cd[i] > 0) return false;
  const r = SKILL_FN[id](s, rng);
  if (r) p.cd[i] = skillCd(p, id);
  return r;
}

// false = no turn used, true = turn used, 'floor' = turn used, skip enemies.
function playerAct(s, rng, action) {
  if (action === 'wait') return true;
  if (action.startsWith('skill')) return useSkill(s, rng, Number(action[5]) - 1);
  const p = s.player;
  const [dx, dy] = DELTA[action];
  p.face = { dx, dy };
  const x = p.x + dx, y = p.y + dy;
  const foe = enemyAt(s, x, y);
  if (foe) {
    strike(s, rng, foe, p.atk, 'You hit');
    return s.over ? 'floor' : true;
  }
  if (blocked(tileAt(s, x, y))) return false;
  return landOn(s, x, y);
}

function canEnter(s, e, x, y) {
  const tile = tileAt(s, x, y);
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

// Enemy attack on the player: smoke and dodge (seeded), then shield halves.
function enemyHits(s, rng, e) {
  const p = s.player;
  const t = TYPES[e.kind];
  if (p.smoke > 0 || (p.dodge > 0 && rng() < p.dodge)) {
    log(s, `You dodge the ${t.name}.`);
    return;
  }
  let amount = damage(rng, e.atk, p.def);
  if (p.shield > 0) amount = Math.floor(amount / 2);
  if (amount <= 0) {
    log(s, `Your shield blocks the ${t.name}.`);
    return;
  }
  hurtPlayer(s, amount, `The ${t.name} ${t.verb} you`);
}

function enemiesAct(s, rng) {
  const p = s.player;
  // Poison ticks first; poison kills count as kills.
  for (const e of s.enemies.slice()) {
    if (s.over) return;
    if (e.poison > 0) {
      e.poison--;
      hurtEnemy(s, rng, e, POISON_TICK, 'Poison eats');
    }
  }
  for (const e of s.enemies) {
    if (s.over) return;
    if (e.frozen > 0) {
      e.frozen--;
      continue;
    }
    const t = TYPES[e.kind];
    if (dist(e, p) === 1) {
      enemyHits(s, rng, e);
    } else if (t.erratic && rng() < 0.5) {
      flutter(s, rng, e);
    } else {
      chase(s, e);
    }
  }
  if (p.shield > 0) p.shield--;
  if (p.smoke > 0) p.smoke--;
}

export function step(state, action) {
  if (!state || state.over || !ACTIONS.includes(action)) return state;
  const isPick = action.startsWith('pick');
  // While a level-up is pending only picks are accepted (restart is main.js).
  if (state.levelUp ? !isPick : isPick) return state;
  const s = structuredClone(state);
  s.fx = [];
  const rng = mulberry32(s.rng);
  if (isPick) {
    applyUpgrade(s, s.levelUp.choices[Number(action[4])]);
    s.levelUp = null;
    offerLevelUp(s, rng);
    s.rng = rng.getState();
    return s;
  }
  const used = action.startsWith('skill') ? Number(action[5]) - 1 : -1;
  const acted = playerAct(s, rng, action);
  if (acted) {
    s.turns++;
    const p = s.player;
    p.cd = p.cd.map((c, i) => (i === used ? c : Math.max(0, c - 1)));
    if (acted === true && !s.over) enemiesAct(s, rng);
  }
  s.rng = rng.getState();
  return s;
}
