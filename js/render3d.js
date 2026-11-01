// three.js view for 3d.html. Draws the same sim state as render.js.
// No game logic here: main.js + sim.js drive everything; this only paints.
// 'three' resolves through the import map in 3d.html (pinned three@0.160.0).
import * as THREE from 'three';
import { SIZE, WALL, PILLAR, STAIRS, SPIKES } from './floors.js';
import { TYPES } from './enemies.js';

const PALETTE = {
  stone: { floor: 0x4a4f5a, wall: 0x2b2f38, pillar: 0x7a8090, bg: 0x14161c },
  lava: { floor: 0x4a2c24, wall: 0x2a1410, pillar: 0x8a4226, bg: 0x1a0b08 },
  ice: { floor: 0x9fb8c8, wall: 0x5d7a8c, pillar: 0xd8eef8, bg: 0x0e1a22 },
  crypt: { floor: 0x3a3442, wall: 0x1f1a26, pillar: 0x5f5470, bg: 0x0c0a10 },
};
const HALF = (SIZE - 1) / 2;
const CAM_OFFSET = new THREE.Vector3(0, 8.5, 6.5);
const HEIGHT = { slime: 0.2, bat: 0.75, skeleton: 0.375, ghost: 0.4, boss: 0.45 };

const geo = {
  floor: new THREE.BoxGeometry(0.96, 0.2, 0.96),
  wall: new THREE.BoxGeometry(1, 0.8, 1),
  pillar: new THREE.CylinderGeometry(0.28, 0.34, 1, 10),
  step: new THREE.BoxGeometry(0.7, 0.12, 0.25),
  spike: new THREE.ConeGeometry(0.1, 0.3, 6),
  heroBody: new THREE.CylinderGeometry(0.22, 0.3, 0.55, 12),
  heroHead: new THREE.SphereGeometry(0.18, 12, 10),
  slime: new THREE.SphereGeometry(0.32, 14, 10),
  bat: new THREE.OctahedronGeometry(0.26),
  skeleton: new THREE.BoxGeometry(0.34, 0.75, 0.24),
  ghost: new THREE.ConeGeometry(0.3, 0.75, 12),
  boss: new THREE.DodecahedronGeometry(0.42),
  potion: new THREE.SphereGeometry(0.14, 10, 8),
  bar: new THREE.BoxGeometry(0.7, 0.07, 0.07),
};

// Shared materials (meshes are rebuilt each turn; GPU resources are not).
const mats = new Map();
function mat(color, opacity = 1) {
  const key = color + '|' + opacity;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }));
  }
  return mats.get(key);
}

const mesh = (g, m) => new THREE.Mesh(g, m);
function at(m, x, y, h) {
  m.position.set(x - HALF, h, y - HALF);
  return m;
}

function buildBoard(s, pal) {
  const g = new THREE.Group();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = s.tiles[y][x];
      if (t === WALL) {
        g.add(at(mesh(geo.wall, mat(pal.wall)), x, y, 0.3));
        continue;
      }
      g.add(at(mesh(geo.floor, mat(pal.floor)), x, y, -0.1));
      if (t === PILLAR) {
        g.add(at(mesh(geo.pillar, mat(pal.pillar)), x, y, 0.5));
      } else if (t === STAIRS) {
        for (let i = 0; i < 3; i++) {
          const m = at(mesh(geo.step, mat(0xf2c94c)), x, y, 0.06 + i * 0.12);
          m.position.z += 0.25 - i * 0.25;
          g.add(m);
        }
      } else if (t === SPIKES) {
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
          const m = at(mesh(geo.spike, mat(0xc0c4cc)), x, y, 0.15);
          m.position.x += dx;
          m.position.z += dz;
          g.add(m);
        }
      }
    }
  }
  return g;
}

function buildActors(s) {
  const g = new THREE.Group();
  for (const p of s.potions) g.add(at(mesh(geo.potion, mat(0xff5d8f)), p.x, p.y, 0.18));
  for (const e of s.enemies) {
    const t = TYPES[e.kind] || {};
    const color = new THREE.Color(t.color || '#ffffff').getHex();
    const m = at(mesh(geo[e.kind] || geo.slime, mat(color, e.kind === 'ghost' ? 0.7 : 1)), e.x, e.y, HEIGHT[e.kind] ?? 0.3);
    if (e.kind === 'slime') m.scale.y = 0.65;
    g.add(m);
    // HP bar: dark back, red front scaled by remaining HP.
    const frac = Math.max(0, Math.min(1, e.hp / e.maxHp));
    const back = at(mesh(geo.bar, mat(0x222222)), e.x, e.y, 1.1);
    const front = at(mesh(geo.bar, mat(0xe24b4b)), e.x, e.y, 1.1);
    front.scale.set(Math.max(frac, 0.001), 1.2, 1.2);
    front.position.x -= (1 - frac) * 0.35;
    g.add(back, front);
  }
  const p = s.player;
  const color = p.hp <= 0 ? 0x667080 : 0x4da3ff;
  const hero = new THREE.Group();
  const body = mesh(geo.heroBody, mat(color));
  body.position.y = 0.275;
  const head = mesh(geo.heroHead, mat(p.hp <= 0 ? 0x8a8f99 : 0xffd9b0));
  head.position.y = 0.7;
  hero.add(body, head);
  hero.position.set(p.x - HALF, 0, p.y - HALF);
  g.add(hero);
  return g;
}

// Returns paint(state). Throws if WebGL is unavailable (main.js reports it).
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvas.dataset.gl = renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.stone.bg);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = new THREE.Vector3();
  const look = new THREE.Vector3();
  let board = null;
  let boardKey = '';
  let actors = null;
  let primed = false;
  let running = false;

  // Camera eases toward the hero, then stops rendering until the next change.
  function frame() {
    look.lerp(target, primed && !reduce ? 0.2 : 1);
    primed = true;
    camera.position.copy(look).add(CAM_OFFSET);
    camera.lookAt(look);
    renderer.render(scene, camera);
    if (look.distanceTo(target) > 0.005) requestAnimationFrame(frame);
    else running = false;
  }
  function kick() {
    if (running) return;
    running = true;
    frame(); // first frame is synchronous so the canvas is never blank after paint()
  }
  function resize() {
    const w = canvas.clientWidth || 352;
    const h = canvas.clientHeight || w;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    kick();
  }
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  resize();

  return function paint(s) {
    const pal = PALETTE[s.theme] || PALETTE.stone;
    const key = s.theme + '|' + s.tiles.map((r) => r.join('')).join('');
    if (key !== boardKey) {
      if (board) scene.remove(board);
      board = buildBoard(s, pal);
      scene.add(board);
      scene.background = new THREE.Color(pal.bg);
      boardKey = key;
      primed = false; // new floor: snap the camera instead of gliding
    }
    if (actors) scene.remove(actors);
    actors = buildActors(s);
    scene.add(actors);
    target.set(s.player.x - HALF, 0, s.player.y - HALF);
    kick();
  };
}
