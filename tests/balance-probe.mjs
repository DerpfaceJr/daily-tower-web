// Temp probe 2: aimed-skill bot and mage base-stat variants.
import { BALANCE, CLASSES, CLASS_IDS } from '../js/sim.js';
import { runBot, judge, fmt, SEEDS } from './bot.mjs';

const VARIANTS = [
  { name: 'dumb bot, scale+atk2, mage 17/0', b: { skillScale: true, atkEvery: 2, wardenPct: 100 }, mage: [17, 0], smart: false },
  { name: 'smart bot, scale only, mage 17/0', b: { skillScale: true, atkEvery: 0, wardenPct: 100 }, mage: [17, 0], smart: true },
  { name: 'smart bot, scale+atk2, mage 17/0', b: { skillScale: true, atkEvery: 2, wardenPct: 100 }, mage: [17, 0], smart: true },
  { name: 'smart bot, scale+atk2, mage 22/1', b: { skillScale: true, atkEvery: 2, wardenPct: 100 }, mage: [22, 1], smart: true },
  { name: 'smart bot, scale+atk2, mage 24/1', b: { skillScale: true, atkEvery: 2, wardenPct: 100 }, mage: [24, 1], smart: true },
  { name: 'smart bot, scale+atk2, warden88, mage 22/1', b: { skillScale: true, atkEvery: 2, wardenPct: 88 }, mage: [22, 1], smart: true },
];
for (const v of VARIANTS) {
  Object.assign(BALANCE, v.b);
  CLASSES.mage.hp = v.mage[0];
  CLASSES.mage.def = v.mage[1];
  console.log(`== ${v.name}`);
  let all = true;
  for (const c of CLASS_IDS) {
    const rs = SEEDS.map((d) => runBot(d, c, v.smart));
    const j = judge(rs);
    all = all && j.pass;
    const lv = rs.filter((r) => r.floor === 10).map((r) => r.level);
    console.log(`${c}: wins ${j.wins}/${rs.length} fullHpWins ${j.fullHp} pass=${j.pass} F10levels=[${lv.join(',')}] | ${rs.map(fmt).join(' ; ')}`);
  }
  console.log(`variant pass=${all}`);
}
