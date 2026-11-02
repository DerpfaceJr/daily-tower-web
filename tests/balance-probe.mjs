// Temp probe: run the bot under each tuning step, in the owner's order.
import { BALANCE, CLASS_IDS, LAST_FLOOR } from '../js/sim.js';
import { generateFloor } from '../js/floors.js';
import { TYPES } from '../js/enemies.js';
import { runBot, judge, fmt, SEEDS } from './bot.mjs';

for (const d of SEEDS) {
  const w = generateFloor(d, LAST_FLOOR, null).enemies.filter((e) => TYPES[e.kind].boss);
  const n = generateFloor(d, LAST_FLOOR, null).enemies.length;
  console.log(`warden ${d}: ${w.map((e) => `hp${e.hp} atk${e.atk} def${e.def}`).join(',')} enemiesOnF10=${n}`);
}
const VARIANTS = [
  { skillScale: false, atkEvery: 0, wardenPct: 100 },
  { skillScale: true, atkEvery: 0, wardenPct: 100 },
  { skillScale: true, atkEvery: 2, wardenPct: 100 },
  { skillScale: true, atkEvery: 2, wardenPct: 88 },
  { skillScale: true, atkEvery: 2, wardenPct: 85 },
];
for (const v of VARIANTS) {
  Object.assign(BALANCE, v);
  console.log(`== variant ${JSON.stringify(v)}`);
  let all = true;
  for (const c of CLASS_IDS) {
    const rs = SEEDS.map((d) => runBot(d, c));
    const j = judge(rs);
    all = all && j.pass;
    console.log(`${c}: wins ${j.wins}/${rs.length} fullHpWins ${j.fullHp} pass=${j.pass} | ${rs.map(fmt).join(' ; ')}`);
  }
  console.log(`variant pass=${all}`);
}
