// Deterministic random helpers shared by the simulation modules.

// FNV-1a 32-bit hash of a string, used to turn text seeds into numbers.
export function seedFromString(str) {
  const s = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Combine a seed with extra parts (floor index, attempt...) into a new seed.
export function subSeed(seed, ...parts) {
  return seedFromString([seed, ...parts].join('|'));
}

// mulberry32 PRNG. Returns floats in [0, 1). getState() exposes the
// internal counter so the sim can store it in plain state objects.
export function mulberry32(seed) {
  let a = seed | 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.getState = () => a;
  return next;
}

// Integer in [0, n).
export function randInt(rng, n) {
  return Math.floor(rng() * n);
}
