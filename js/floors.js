// Procedural floor generation: an 11x11 walled room with pillars, stairs,
// enemies and potions. Pure and deterministic for (seed, floorIndex, mods).
import { mulberry32, randInt, subSeed } from './rng.js';
import { KINDS, TYPES, makeEnemy } from './enemies.js';

export const SIZE = 11;
export const WALL = '#', FLOOR = '.', PILLAR = 'o', STAIRS = '>', SPIKES = '^';
export const THEMES = ['stone', 'lava', 'ice', 'crypt'];
export const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const MAX_TRIES = 10;

export const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const same = (a, b) => a.x === b.x && a.y === b.y;

// The guaranteed route may use floor and stairs only (no spikes, no pillars).
const safeTile = (t) => t === FLOOR || t === STAIRS;

// BFS from `from` to `to` over tiles accepted by `ok`.
export function reachable(tiles, from, to, ok = safeTile) {
  const seen = new Set([from.y * SIZE + from.x]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift();
    if (same(c, to)) return true;
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      const k = y * SIZE + x;
      if (seen.has(k) || !ok(tiles[y][x])) continue;
      seen.add(k);
      queue.push({ x, y });
    }
  }
  return false;
}

// Boss check only: spikes hurt but do not block.
const walkTile = (t) => safeTile(t) || t === SPIKES;

// BFS step counts from `from` over tiles accepted by `ok` (-1 = unreached).
function distances(tiles, from, ok) {
  const d = new Array(SIZE * SIZE).fill(-1);
  d[from.y * SIZE + from.x] = 0;
  const queue = [from];
  while (queue.length) {
    const c = queue.shift();
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      const k = y * SIZE + x;
      if (d[k] >= 0 || !ok(tiles[y][x])) continue;
      d[k] = d[c.y * SIZE + c.x] + 1;
      queue.push({ x, y });
    }
  }
  return d;
}

function blankRoom() {
  const rows = [];
  for (let y = 0; y < SIZE; y++) {
    const row = [];
    for (let x = 0; x < SIZE; x++) {
      const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
      row.push(edge ? WALL : FLOOR);
    }
    rows.push(row);
  }
  return rows;
}

// Plain floor cells that pass `keep`.
function openCells(tiles, keep) {
  const out = [];
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (tiles[y][x] === FLOOR && keep({ x, y })) out.push({ x, y });
    }
  }
  return out;
}

// Remove and return a random element of a list.
const take = (rng, list) => list.splice(randInt(rng, list.length), 1)[0];

// One layout attempt: start and stairs on opposite sides, then obstacles.
function tryLayout(rng, mods) {
  const tiles = blankRoom();
  const left = rng() < 0.5;
  const start = { x: left ? 1 : SIZE - 2, y: 1 + randInt(rng, SIZE - 2) };
  const stairs = { x: left ? SIZE - 2 : 1, y: 1 + randInt(rng, SIZE - 2) };
  tiles[stairs.y][stairs.x] = STAIRS;
  // Keep the start and its neighbours clear.
  const cells = openCells(tiles, (c) => dist(c, start) > 1);
  const pillars = 4 + randInt(rng, 6);
  for (let i = 0; i < pillars && cells.length; i++) {
    const c = take(rng, cells);
    tiles[c.y][c.x] = PILLAR;
  }
  if (mods && mods.trap === 'spikes') {
    const spikes = 4 + randInt(rng, 4);
    for (let i = 0; i < spikes && cells.length; i++) {
      const c = take(rng, cells);
      tiles[c.y][c.x] = SPIKES;
    }
  }
  return { tiles, start, stairs };
}

// Fallback: an empty room that is always passable.
function openLayout() {
  const tiles = blankRoom();
  const start = { x: 1, y: 5 };
  const stairs = { x: SIZE - 2, y: 5 };
  tiles[stairs.y][stairs.x] = STAIRS;
  return { tiles, start, stairs };
}

function placeEnemies(rng, layout, f, mods) {
  const cells = openCells(layout.tiles, (c) => dist(c, layout.start) >= 4);
  const out = [];
  const add = (kind) => {
    if (!cells.length) return;
    const c = take(rng, cells);
    out.push(makeEnemy(kind, f, c.x, c.y));
  };
  if (f >= 10) {
    add('boss');
    add('skeleton');
    add('ghost');
    return out;
  }
  const pool = KINDS.filter((k) => TYPES[k].unlock <= f);
  const favored = mods && KINDS.includes(mods.enemy) ? mods.enemy : null;
  const count = Math.min(7, 2 + Math.floor(f / 2) + (favored ? 2 : 0));
  for (let i = 0; i < count; i++) {
    add(favored && rng() < 0.6 ? favored : pool[randInt(rng, pool.length)]);
  }
  return out;
}

// Make sure the player can reach a tile next to the boss (spike-free path
// preferred). If pillars box it in, move it to a reachable open tile at least
// 4 steps from the start. Returns false when there is no such tile.
function freeBoss(rng, layout, enemies) {
  const boss = enemies.find((e) => e.kind === 'boss');
  if (!boss) return true;
  const { tiles, start } = layout;
  const maps = [safeTile, walkTile].map((ok) => distances(tiles, start, ok));
  for (const d of maps) {
    if (DIRS.some(([dx, dy]) => d[(boss.y + dy) * SIZE + boss.x + dx] >= 0)) return true;
  }
  for (const d of maps) {
    const spots = openCells(tiles, (c) =>
      d[c.y * SIZE + c.x] >= 4 && !enemies.some((e) => same(e, c)));
    if (spots.length) {
      const c = take(rng, spots);
      boss.x = c.x;
      boss.y = c.y;
      return true;
    }
  }
  return false;
}

function placePotions(rng, layout, enemies, f) {
  const cells = openCells(layout.tiles, (c) =>
    !same(c, layout.start) && !enemies.some((e) => same(e, c)));
  const count = f >= 10 ? 2 : 1 + randInt(rng, 2);
  const out = [];
  for (let i = 0; i < count && cells.length; i++) out.push(take(rng, cells));
  return out;
}

// Build a floor. `mods` = { theme, enemy, trap } or null for a normal floor.
export function generateFloor(seed, floorIndex, mods = null) {
  let layout = null;
  let rng = null;
  let enemies = null;
  for (let attempt = 0; attempt < MAX_TRIES && !layout; attempt++) {
    rng = mulberry32(subSeed(seed, floorIndex, attempt));
    const l = tryLayout(rng, mods);
    if (!reachable(l.tiles, l.start, l.stairs)) continue;
    const e = placeEnemies(rng, l, floorIndex, mods);
    if (floorIndex >= 10 && !freeBoss(rng, l, e)) continue;
    layout = l;
    enemies = e;
  }
  if (!layout) {
    rng = mulberry32(subSeed(seed, floorIndex, 'open'));
    layout = openLayout();
    enemies = placeEnemies(rng, layout, floorIndex, mods);
  }
  let theme = floorIndex >= 10 ? 'crypt' : 'stone';
  if (mods && THEMES.includes(mods.theme)) theme = mods.theme;
  const potions = placePotions(rng, layout, enemies, floorIndex);
  return {
    tiles: layout.tiles,
    start: layout.start,
    stairs: layout.stairs,
    theme,
    enemies,
    potions,
    modded: !!mods,
  };
}
