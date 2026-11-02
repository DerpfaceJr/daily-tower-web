// Scripted bot for balance checks. Plays a whole run through step() only:
// picks the first upgrade on each level-up, uses any skill that is off
// cooldown when an enemy is within 2 tiles, hunts enemies for XP, then stairs.
import { newRun, step, LAST_FLOOR } from '../js/sim.js';
import { WALL, PILLAR, STAIRS } from '../js/floors.js';

export const SEEDS = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];

const MOVES = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function tile(s, x, y) {
  const r = s.tiles[y];
  return r && r[x] !== undefined ? r[x] : WALL;
}

// BFS from the player; returns the first move toward the nearest goal.
function firstMove(s, wantEnemy) {
  const p = s.player;
  const foes = new Set(s.enemies.map((e) => e.x + ',' + e.y));
  const seen = new Set([p.x + ',' + p.y]);
  const q = [{ x: p.x, y: p.y, first: null }];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    for (const [a, dx, dy] of MOVES) {
      const x = c.x + dx, y = c.y + dy, k = x + ',' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      const first = c.first || a;
      if (foes.has(k)) {
        if (wantEnemy) return first;
        continue;
      }
      const t = tile(s, x, y);
      if (t === WALL || t === PILLAR) continue;
      if (t === STAIRS) {
        if (!wantEnemy) return first;
        continue;
      }
      q.push({ x, y, first });
    }
  }
  return null;
}

export function runBot(seed, cls, maxSteps = 6000) {
  let s = newRun(seed, null, cls);
  let floor = s.floor, floorTurns = 0;
  for (let n = 0; n < maxSteps && !s.over; n++) {
    if (s.levelUp) {
      s = step(s, 'pick0');
      continue;
    }
    if (s.floor !== floor) {
      floor = s.floor;
      floorTurns = 0;
    }
    const p = s.player;
    let next = s;
    if (s.enemies.some((e) => cheb(e, p) <= 2)) {
      for (let i = 0; i < 3 && next === s; i++) {
        if (p.cd[i] > 0) continue;
        const t = step(s, `skill${i + 1}`);
        if (t.turns !== s.turns) next = t;
      }
    }
    if (next === s) {
      const hunt = s.floor === LAST_FLOOR || floorTurns < 250;
      const mv = (hunt && firstMove(s, true)) || firstMove(s, false) || firstMove(s, true);
      next = mv ? step(s, mv) : s;
      if (next === s || next.turns === s.turns) next = step(s, 'wait');
    }
    s = next;
    floorTurns++;
  }
  const p = s.player;
  return { cls, seed: String(seed), won: s.won, floor: s.floorReached, level: p.level, hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, turns: s.turns, kills: s.kills };
}

// Target: wins on most seeds, and not a full-HP win on every seed.
export function judge(rs) {
  const wins = rs.filter((r) => r.won).length;
  const fullHp = rs.filter((r) => r.won && r.hp === r.maxHp).length;
  return { wins, fullHp, pass: wins * 2 > rs.length && fullHp < rs.length };
}

export const fmt = (r) => `${r.seed.slice(5)} L${r.level} F${r.floor} ${r.won ? 'W' : 'L'} hp${r.hp}/${r.maxHp} atk${r.atk} def${r.def} t${r.turns}`;
