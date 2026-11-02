// Node sim check for Daily Tower v2: classes, determinism, skills, level-ups.
// Prints one line per check and a final 'SIM pass=yes|no'. Exits 1 on failure.
import { newRun, step, CLASSES, CLASS_IDS, SKILLS, LAST_FLOOR } from '../js/sim.js';
import { WALL } from '../js/floors.js';
import { TYPES } from '../js/enemies.js';

let fails = 0;
const ok = (cond, name) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) fails++;
};
const J = (o) => JSON.stringify(o);
const SEED = '2026-11-02';

// 1. Same tower for every class.
const runs = CLASS_IDS.map((c) => newRun(SEED, null, c));
ok(runs.every((r) => J(r.tiles) === J(runs[0].tiles) && J(r.enemies) === J(runs[0].enemies) && J(r.stairs) === J(runs[0].stairs) && J(r.potions) === J(runs[0].potions)), 'floor 1 identical across classes');
ok(runs.map((r) => r.player.maxHp).join() === '28,20,17', 'class base HP 28/20/17');
ok(runs.every((r, i) => r.cls === CLASS_IDS[i] && r.player.cd.length === 3 && r.player.level === 1), 'class, cooldowns and level set');
ok(newRun(SEED).cls === 'warrior', 'default class is warrior');
ok(newRun(SEED, null, 'toString').cls === 'warrior' && newRun(SEED, null, '<img>').cls === 'warrior', 'unknown class falls back to warrior');
ok(LAST_FLOOR === 10, 'last floor is 10');

// 2. Determinism: same seed + class + actions = same state.
const pool = ['up', 'left', 'down', 'right', 'skill1', 'skill2', 'skill3', 'wait', 'up', 'right'];
const script = [];
for (let i = 0, r = 7; i < 400; i++) {
  r = (r * 48271) % 2147483647;
  script.push(pool[r % pool.length]);
}
function play(cls) {
  let s = newRun(SEED, null, cls);
  for (const a of script) {
    s = step(s, a);
    if (s.levelUp) s = step(s, 'pick1');
    if (s.over) break;
  }
  return s;
}
for (const c of CLASS_IDS) ok(J(play(c)) === J(play(c)), `deterministic replay (${c})`);

// 3. Skills in a walled test arena.
const proto = runs[0].enemies.find((e) => !TYPES[e.kind].boss);
function arena(cls) {
  const s = newRun(SEED, null, cls);
  const F = s.tiles[s.player.y][s.player.x];
  const N = 15;
  s.tiles = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (x === 0 || y === 0 || x === N - 1 || y === N - 1 ? WALL : F)));
  s.potions = [];
  s.stairs = { x: 1, y: 1 };
  s.player.x = 7;
  s.player.y = 7;
  s.player.face = { dx: 0, dy: -1 };
  s.enemies = [];
  return s;
}
const foe = (x, y, hp = 50) => ({ ...proto, x, y, hp, maxHp: hp, poison: 0, frozen: 0 });

if (!proto) {
  ok(false, 'floor 1 has a normal enemy to copy for skill tests');
} else {
  for (const c of CLASS_IDS) {
    CLASSES[c].skills.forEach((id, i) => {
      const s = arena(c);
      s.enemies = [foe(7, 5), foe(8, 8)];
      const a = `skill${i + 1}`;
      const s2 = step(s, a);
      ok(s2 !== s && s2.turns === s.turns + 1 && s2.player.cd[i] === SKILLS[id].cd && s2.fx.some((f) => f.kind === id), `${c} ${id}: uses a turn, sets cd ${SKILLS[id].cd}, emits fx`);
      const s3 = step(s2, a);
      ok(s3.turns === s2.turns, `${c} ${id}: blocked while on cooldown`);
      if (id === 'frost') ok(s2.enemies.every((e) => e.frozen >= 1 && e.hp === 48), 'frost: all in range frozen and hit for 2');
      if (id === 'shield') ok(s2.player.shield === 2, 'shield: 2 turns left after first enemy turn');
      if (id === 'dash') ok(s2.player.y === 6 && s2.player.x === 7, 'dash: stops before the enemy');
      if (id === 'blink') ok(s2.player.y === 3 && s2.player.x === 7, 'blink: farthest free tile within 4');
      if (id === 'poison') ok(s2.enemies.some((e) => e.poison > 0 || e.hp < 50), 'poison: target hit');
    });
  }

  // 4. Kill -> XP -> level-up with 3 distinct picks.
  const s = arena('warrior');
  s.enemies = [foe(7, 6, 1)];
  s.enemies[0].maxHp = 5;
  s.player.xp = s.player.xpNext - 1;
  const s2 = step(s, 'up');
  const ch = s2.levelUp && s2.levelUp.choices;
  ok(s2.kills === s.kills + 1 && s2.player.level === 2 && s2.player.xpNext === 14 && ch && ch.length === 3 && new Set(ch).size === 3, 'kill gives XP; level 2 offers 3 distinct picks');
  ok(step(s2, 'up') === s2 && step(s2, 'skill1') === s2, 'moves and skills blocked while picking');
  const s3 = step(s2, 'pick0');
  ok(s3.levelUp === null && s3.turns === s2.turns && J(s3.player) !== J(s2.player), 'pick applies an upgrade without using a turn');
  ok(step(s3, 'pick0') === s3, 'pick ignored when no level-up is pending');
}

console.log(`SIM pass=${fails ? 'no' : 'yes'}`);
process.exit(fails ? 1 : 0);
