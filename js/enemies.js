// Enemy types: base stats, per-floor growth, colour and behaviour flags.

// Regular kinds (the boss is separate). Also the today.json enemy whitelist.
export const KINDS = ['slime', 'bat', 'skeleton', 'ghost'];

export const TYPES = {
  slime: {
    name: 'slime', verb: 'splats', color: '#5fd35f',
    hp: 4, atk: 2, def: 0, hpG: 1.2, atkG: 0.6, unlock: 1,
  },
  bat: {
    name: 'bat', verb: 'bites', color: '#b07be0',
    hp: 3, atk: 2, def: 0, hpG: 0.8, atkG: 0.7, unlock: 2,
    erratic: true, // moves randomly half the time
  },
  skeleton: {
    name: 'skeleton', verb: 'slashes', color: '#e8e4d0',
    hp: 7, atk: 4, def: 1, hpG: 1.5, atkG: 0.8, unlock: 4,
  },
  ghost: {
    name: 'ghost', verb: 'chills', color: '#8fd8ff',
    hp: 5, atk: 3, def: 2, hpG: 1.0, atkG: 0.8, unlock: 6,
    phase: true, // passes through pillars
  },
  boss: {
    name: 'Tower Warden', verb: 'smashes', color: '#ff5a3c',
    hp: 40, atk: 10, def: 4, hpG: 0, atkG: 0, unlock: 99,
    boss: true,
  },
};

// Build an enemy instance scaled to floor f.
export function makeEnemy(kind, f, x, y) {
  const t = TYPES[kind];
  const g = f - 1;
  const hp = t.hp + Math.floor(g * t.hpG);
  return {
    kind, x, y, hp, maxHp: hp,
    atk: t.atk + Math.floor(g * t.atkG),
    def: t.def + Math.floor(g / 4),
  };
}
