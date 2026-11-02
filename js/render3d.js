// three.js view for Daily Tower. Paint only: reads sim state, never changes it.
// three is imported by pinned URL so no inline importmap is needed under the CSP.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { WALL, PILLAR, STAIRS, SPIKES } from './floors.js';
import { TYPES } from './enemies.js';

const FX_MS = 400;
// [floor, wall] colours per theme; unknown themes use stone.
const THEME_COLORS = {
  stone: [0x3b3e45, 0x7d828c],
  moss: [0x2e3d29, 0x5b7a4a],
  ice: [0x4f6d7c, 0x9cc4d6],
  lava: [0x3a1d16, 0x8a4430],
  crypt: [0x2f2a38, 0x6a5f7a],
  sand: [0x6b5a37, 0xb8a06a],
};
const themeColors = (t) => THEME_COLORS[t] || THEME_COLORS.stone;

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const basic = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

function kindColor(kind) {
  const t = TYPES[kind] || {};
  if (typeof t.color === 'string' && /^#[0-9a-f]{3,6}$/i.test(t.color)) return new THREE.Color(t.color);
  let h = 0;
  for (const ch of String(kind)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.5);
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 10, 6);
  scene.add(sun);
  const board = new THREE.Group();
  const things = new THREE.Group();
  const fxGroup = new THREE.Group();
  scene.add(board, things, fxGroup);

  // Shared, long-lived geometries and materials.
  const G = {
    tile: new THREE.BoxGeometry(1, 0.2, 1),
    wall: new THREE.BoxGeometry(1, 1, 1),
    pillar: new THREE.CylinderGeometry(0.3, 0.35, 1.1, 12),
    spike: new THREE.ConeGeometry(0.1, 0.3, 6),
    stair: new THREE.BoxGeometry(0.8, 0.15, 0.8),
    potion: new THREE.SphereGeometry(0.16, 12, 10),
    enemy: new THREE.BoxGeometry(0.6, 0.6, 0.6),
    crown: new THREE.ConeGeometry(0.25, 0.3, 5),
    ice: new THREE.BoxGeometry(0.8, 0.8, 0.8),
    aura: new THREE.SphereGeometry(0.62, 20, 14),
  };
  const M = {
    potion: lam(0xd8454a, { emissive: 0x401010 }),
    spike: lam(0xbfc5cc),
    stair: lam(0xe0b84a),
    crown: lam(0xf2c84b, { emissive: 0x3a2a00 }),
    ice: basic(0x9ee6ff, 0.35),
    shield: basic(0x5aa8ff, 0.3),
    smoke: basic(0x9a9a9a, 0.45),
  };
  const kindMats = new Map();
  function kindMat(kind, poisoned) {
    const k = kind + (poisoned ? '|p' : '');
    if (!kindMats.has(k)) {
      const c = kindColor(kind);
      if (poisoned) c.lerp(new THREE.Color(0x4fd04f), 0.55);
      kindMats.set(k, lam(c, poisoned ? { emissive: 0x0f3a0f } : {}));
    }
    return kindMats.get(k);
  }

  let W = 11, H = 11, boardKey = '', boardMats = [];
  const pos = (x, y) => new THREE.Vector3(x - W / 2 + 0.5, 0, y - H / 2 + 0.5);

  function buildBoard(s) {
    board.clear();
    boardMats.forEach((m) => m.dispose());
    H = s.tiles.length;
    W = s.tiles[0].length;
    const [fc, wc] = themeColors(s.theme);
    const floorM = lam(fc), wallM = lam(wc), pillarM = lam(new THREE.Color(wc).multiplyScalar(1.2));
    boardMats = [floorM, wallM, pillarM];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = s.tiles[y][x];
        const p = pos(x, y);
        if (t === WALL) {
          const m = new THREE.Mesh(G.wall, wallM);
          m.position.set(p.x, 0.4, p.z);
          board.add(m);
          continue;
        }
        const f = new THREE.Mesh(G.tile, floorM);
        f.position.set(p.x, -0.1, p.z);
        board.add(f);
        if (t === PILLAR) {
          const m = new THREE.Mesh(G.pillar, pillarM);
          m.position.set(p.x, 0.55, p.z);
          board.add(m);
        } else if (t === STAIRS) {
          for (let k = 0; k < 3; k++) {
            const m = new THREE.Mesh(G.stair, M.stair);
            m.scale.set(1 - k * 0.25, 1, 1 - k * 0.25);
            m.position.set(p.x, 0.075 + k * 0.15, p.z);
            board.add(m);
          }
        } else if (t === SPIKES) {
          for (const [ox, oz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
            const m = new THREE.Mesh(G.spike, M.spike);
            m.position.set(p.x + ox, 0.15, p.z + oz);
            board.add(m);
          }
        }
      }
    }
    const span = Math.max(W, H);
    camera.position.set(0, span * 1.05, span * 0.85);
    camera.lookAt(0, 0, 0.5);
  }

  // Hero models. Forward is +z; rotation.y turns them to face p.face.
  function buildHero(cls) {
    const g = new THREE.Group();
    const temp = [];
    const geo = (x) => (temp.push(x), x);
    const mat = (c, e) => {
      const m = lam(c, e ? { emissive: e } : {});
      temp.push(m);
      return m;
    };
    const add = (gm, mt, x, y, z) => {
      const m = new THREE.Mesh(gm, mt);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const skin = mat(0xf0c8a0);
    const steel = mat(0xb8c0c8);
    if (cls === 'mage') {
      add(geo(new THREE.ConeGeometry(0.32, 0.75, 14)), mat(0x6b3fa0), 0, 0.38, 0);
      add(geo(new THREE.SphereGeometry(0.15, 14, 10)), skin, 0, 0.84, 0);
      add(geo(new THREE.ConeGeometry(0.2, 0.55, 14)), mat(0x4a2a78), 0, 1.18, 0);
      add(geo(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8)), mat(0x7a5230), 0.32, 0.5, 0.05);
      add(geo(new THREE.SphereGeometry(0.09, 12, 10)), mat(0x9fe8ff, 0x3fb8ff), 0.32, 1.05, 0.05);
    } else if (cls === 'rogue') {
      add(geo(new THREE.BoxGeometry(0.34, 0.55, 0.24)), mat(0x2f5d3a), 0, 0.4, 0);
      add(geo(new THREE.SphereGeometry(0.14, 14, 10)), skin, 0, 0.8, 0);
      add(geo(new THREE.ConeGeometry(0.2, 0.4, 12)), mat(0x1f3d27), 0, 0.98, 0);
      const dagger = geo(new THREE.BoxGeometry(0.05, 0.05, 0.32));
      add(dagger, steel, 0.24, 0.4, 0.18);
      add(dagger, steel, -0.24, 0.4, 0.18);
    } else {
      add(geo(new THREE.BoxGeometry(0.46, 0.55, 0.32)), mat(0xb03a2e), 0, 0.4, 0);
      add(geo(new THREE.BoxGeometry(0.32, 0.3, 0.32)), steel, 0, 0.84, 0);
      add(geo(new THREE.BoxGeometry(0.06, 0.06, 0.62)), steel, 0.32, 0.45, 0.25);
      add(geo(new THREE.BoxGeometry(0.36, 0.4, 0.05)), mat(0x5a6a80), -0.18, 0.42, 0.22);
    }
    g.userData.temp = temp;
    return g;
  }

  let hero = null, heroCls = '';
  const shieldAura = new THREE.Mesh(G.aura, M.shield);
  const smokeAura = new THREE.Mesh(G.aura, M.smoke);
  smokeAura.scale.setScalar(1.15);
  shieldAura.visible = smokeAura.visible = false;
  scene.add(shieldAura, smokeAura);

  // Short-lived skill effects; every temporary geometry/material is disposed.
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const effects = [];
  function addFx(f) {
    const geos = [], mats = [], parts = [];
    const mk = (gm, color, opacity) => {
      geos.push(gm);
      const mt = basic(color, opacity);
      mats.push(mt);
      const mesh = new THREE.Mesh(gm, mt);
      fxGroup.add(mesh);
      parts.push(mesh);
      return mesh;
    };
    const fade = (k, o = 0.9) => mats.forEach((mt) => { mt.opacity = o * (1 - k); });
    const a = pos(f.from.x, f.from.y), b = pos(f.to.x, f.to.y);
    let update;
    switch (f.kind) {
      case 'cleave':
        for (const t of f.tiles) {
          const m = mk(new THREE.PlaneGeometry(0.9, 0.9), 0xff8a2a, 0.9);
          const q = pos(t.x, t.y);
          m.rotation.x = -Math.PI / 2;
          m.position.set(q.x, 0.03, q.z);
        }
        update = (k) => fade(k);
        break;
      case 'warcry':
      case 'frost': {
        const ring = mk(new THREE.RingGeometry(0.8, 1, 40), f.kind === 'frost' ? 0x9ee6ff : 0xffd84a, 0.9);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(a.x, 0.05, a.z);
        const max = f.kind === 'frost' ? 2.6 : 1.6;
        update = (k) => { ring.scale.setScalar(0.3 + k * max); fade(k); };
        break;
      }
      case 'shield':
      case 'smoke': {
        const sp = mk(new THREE.SphereGeometry(0.65, 20, 14), f.kind === 'shield' ? 0x5aa8ff : 0x9a9a9a, 0.6);
        sp.position.set(a.x, 0.45, a.z);
        update = (k) => { sp.scale.setScalar(0.5 + (f.kind === 'smoke' ? 1.3 : 0.6) * k); fade(k, 0.6); };
        break;
      }
      case 'dash': {
        const pts = [a, ...f.tiles.slice(0, -1).map((t) => pos(t.x, t.y))];
        for (const q of pts) {
          const m = mk(new THREE.BoxGeometry(0.36, 0.7, 0.26), 0x6fd08c, 0.5);
          m.position.set(q.x, 0.4, q.z);
        }
        update = (k) => fade(k, 0.5);
        break;
      }
      case 'poison':
      case 'fireball': {
        const fire = f.kind === 'fireball';
        const ball = mk(new THREE.SphereGeometry(fire ? 0.2 : 0.12, 14, 10), fire ? 0xff7a1a : 0x5ee05e, 1);
        ball.position.set(a.x, 0.5, a.z);
        update = (k) => {
          const t = Math.min(1, k / 0.6);
          ball.position.set(a.x + (b.x - a.x) * t, 0.5, a.z + (b.z - a.z) * t);
          if (k > 0.6) {
            const q = (k - 0.6) / 0.4;
            ball.scale.setScalar(1 + q * (fire ? 3 : 1.5));
            mats[0].opacity = 1 - q;
          }
        };
        break;
      }
      case 'blink': {
        for (const q of [a, b]) {
          const m = mk(new THREE.SphereGeometry(0.4, 16, 12), 0xb06cff, 0.8);
          m.position.set(q.x, 0.45, q.z);
        }
        update = (k) => { parts.forEach((m) => m.scale.setScalar(0.5 + k)); fade(k, 0.8); };
        break;
      }
      default:
        return;
    }
    // Reduced motion: one static mid-frame, removed after the same time.
    if (reduced) update(0.5);
    effects.push({ t0: performance.now(), update: reduced ? null : update, geos, mats, parts });
  }
  function endFx(e) {
    e.parts.forEach((m) => fxGroup.remove(m));
    e.geos.forEach((gm) => gm.dispose());
    e.mats.forEach((mt) => mt.dispose());
  }

  let raf = 0;
  function frame(now) {
    raf = 0;
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const k = (now - e.t0) / FX_MS;
      if (k >= 1) {
        endFx(e);
        effects.splice(i, 1);
      } else if (e.update) {
        e.update(Math.max(0, k));
      }
    }
    renderer.render(scene, camera);
    if (effects.length) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  let cw = 0, ch = 0;
  function resize() {
    const w = canvas.clientWidth || 352;
    const h = canvas.clientHeight || w;
    if (w === cw && h === ch) return;
    cw = w;
    ch = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', () => { resize(); kick(); });

  let last = null;
  return function paint(s) {
    if (!s || !s.tiles || !s.tiles.length) return;
    const key = `${s.seed}|${s.floor}|${s.theme}|${s.modded}`;
    if (key !== boardKey) {
      boardKey = key;
      buildBoard(s);
    }
    const cls = s.cls || 'warrior';
    if (cls !== heroCls) {
      if (hero) {
        scene.remove(hero);
        hero.userData.temp.forEach((d) => d.dispose());
      }
      hero = buildHero(cls);
      heroCls = cls;
      scene.add(hero);
    }
    const p = s.player;
    const hp = pos(p.x, p.y);
    hero.position.set(hp.x, 0, hp.z);
    if (p.face) hero.rotation.y = Math.atan2(p.face.dx, p.face.dy);
    shieldAura.visible = p.shield > 0;
    shieldAura.position.set(hp.x, 0.45, hp.z);
    smokeAura.visible = p.smoke > 0;
    smokeAura.position.set(hp.x, 0.45, hp.z);

    things.clear();
    for (const o of s.potions) {
      const q = pos(o.x, o.y);
      const m = new THREE.Mesh(G.potion, M.potion);
      m.position.set(q.x, 0.2, q.z);
      things.add(m);
    }
    for (const e of s.enemies) {
      const t = TYPES[e.kind] || {};
      const q = pos(e.x, e.y);
      const sc = t.boss ? 1.4 : 1;
      const body = new THREE.Mesh(G.enemy, kindMat(e.kind, e.poison > 0));
      body.scale.setScalar(sc);
      body.position.set(q.x, 0.3 * sc, q.z);
      things.add(body);
      if (t.boss) {
        const cr = new THREE.Mesh(G.crown, M.crown);
        cr.position.set(q.x, 0.6 * sc + 0.15, q.z);
        things.add(cr);
      }
      if (e.frozen > 0) {
        const ice = new THREE.Mesh(G.ice, M.ice);
        ice.scale.setScalar(sc);
        ice.position.copy(body.position);
        things.add(ice);
      }
    }
    if (s !== last && Array.isArray(s.fx)) for (const f of s.fx) addFx(f);
    last = s;
    resize();
    kick();
  };
}
