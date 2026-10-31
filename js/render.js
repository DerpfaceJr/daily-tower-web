// Canvas renderer: tiles and 8x8 pixel sprites, all drawn in code.
import { SIZE, WALL, PILLAR, STAIRS, SPIKES } from './floors.js';
import { TYPES } from './enemies.js';

export const TILE = 32;
const PX = TILE / 8; // one sprite pixel

const PALETTES = {
  stone: { floor: '#3a3d4a', floor2: '#343742', wall: '#6b6f80', dark: '#44475a', pillar: '#8a8fa3' },
  lava: { floor: '#3a2020', floor2: '#43241b', wall: '#7a3b1e', dark: '#4f200d', pillar: '#a8501e', glow: '#ff7a1a' },
  ice: { floor: '#4f7f98', floor2: '#4a7891', wall: '#a8d4e8', dark: '#6e9fb8', pillar: '#e3f6ff' },
  crypt: { floor: '#2a2433', floor2: '#251f2d', wall: '#4d4259', dark: '#30283a', pillar: '#6e6080' },
};

// '.' is transparent; other letters map to colours per sprite.
const SPRITES = {
  player: [
    '..hhhh..',
    '..hssh..',
    '..ssss..',
    '.bbbbbb.',
    's.bbbb.s',
    '..bbbb..',
    '..l..l..',
    '.ll..ll.',
  ],
  slime: [
    '........',
    '........',
    '...cc...',
    '..cccc..',
    '.ckcckc.',
    '.cccccc.',
    'cccccccc',
    '........',
  ],
  bat: [
    '........',
    'c......c',
    'cc.cc.cc',
    'ccwccwcc',
    '.cccccc.',
    '..c..c..',
    '........',
    '........',
  ],
  skeleton: [
    '..cccc..',
    '.cccccc.',
    '.ckcckc.',
    '..cccc..',
    '...cc...',
    '.cccccc.',
    '...cc...',
    '..c..c..',
  ],
  ghost: [
    '..cccc..',
    '.cccccc.',
    '.ckcckc.',
    '.cccccc.',
    '.cckkcc.',
    '.cccccc.',
    '.cccccc.',
    '.c.cc.c.',
  ],
  boss: [
    'y.y..y.y',
    'cccccccc',
    'cwkccwkc',
    '.cccccc.',
    'ckkkkkkc',
    'cccccccc',
    '.cc..cc.',
    '.cc..cc.',
  ],
  potion: [
    '...kk...',
    '...ww...',
    '..cccc..',
    '.cccccc.',
    '.cwcccc.',
    '.cccccc.',
    '..cccc..',
    '........',
  ],
};

const PLAYER_COLORS = { h: '#ffd23f', s: '#f1c27d', b: '#3a7bd5', l: '#1e3f73' };
const POTION_COLORS = { c: '#e0413a', k: '#6b4a2b', w: '#ffd6d6' };

function drawSprite(ctx, rows, tx, ty, colors) {
  const X = tx * TILE, Y = ty * TILE;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const color = colors[rows[j][i]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(X + i * PX, Y + j * PX, PX, PX);
    }
  }
}

function drawTile(ctx, pal, tile, x, y) {
  const X = x * TILE, Y = y * TILE;
  if (tile === WALL) {
    ctx.fillStyle = pal.dark;
    ctx.fillRect(X, Y, TILE, TILE);
    ctx.fillStyle = pal.wall;
    ctx.fillRect(X, Y, TILE, TILE - 6);
    // simple brick lines
    ctx.fillStyle = pal.dark;
    ctx.fillRect(X, Y + 12, TILE, 2);
    ctx.fillRect(X + (y % 2 ? 8 : 22), Y, 2, 12);
    return;
  }
  ctx.fillStyle = (x + y) % 2 ? pal.floor : pal.floor2;
  ctx.fillRect(X, Y, TILE, TILE);
  if (pal.glow && (x * 7 + y * 13) % 5 === 0) {
    ctx.fillStyle = pal.glow;
    ctx.fillRect(X + 6, Y + 20, 10, 2);
    ctx.fillRect(X + 14, Y + 18, 2, 4);
  }
  if (tile === PILLAR) {
    ctx.fillStyle = pal.dark;
    ctx.fillRect(X + 5, Y + 24, 22, 6);
    ctx.fillStyle = pal.pillar;
    ctx.fillRect(X + 8, Y + 4, 16, 22);
    ctx.fillStyle = pal.dark;
    ctx.fillRect(X + 12, Y + 6, 2, 18);
  } else if (tile === STAIRS) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#d9c27a' : '#b89b4a';
      ctx.fillRect(X + 4 + i * 3, Y + 4 + i * 6, 24 - i * 6, 6);
    }
  } else if (tile === SPIKES) {
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(X + 3, Y + 24, 26, 4);
    ctx.fillStyle = '#cfd3dc';
    for (let i = 0; i < 3; i++) {
      const sx = X + 4 + i * 8;
      ctx.beginPath();
      ctx.moveTo(sx, Y + 25);
      ctx.lineTo(sx + 4, Y + 8);
      ctx.lineTo(sx + 8, Y + 25);
      ctx.fill();
    }
  }
}

function drawHpBar(ctx, e) {
  if (e.hp >= e.maxHp) return;
  const X = e.x * TILE + 3, Y = e.y * TILE + 1, W = TILE - 6;
  ctx.fillStyle = '#000';
  ctx.fillRect(X, Y, W, 3);
  ctx.fillStyle = '#ff4d4d';
  ctx.fillRect(X, Y, Math.max(1, Math.round((W * e.hp) / e.maxHp)), 3);
}

export function render(ctx, s) {
  const pal = PALETTES[s.theme] || PALETTES.stone;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) drawTile(ctx, pal, s.tiles[y][x], x, y);
  }
  for (const p of s.potions) drawSprite(ctx, SPRITES.potion, p.x, p.y, POTION_COLORS);
  for (const e of s.enemies) {
    const t = TYPES[e.kind];
    ctx.globalAlpha = t.phase ? 0.75 : 1;
    drawSprite(ctx, SPRITES[e.kind], e.x, e.y, { c: t.color, k: '#111', w: '#fff', y: '#ffd23f' });
    ctx.globalAlpha = 1;
    drawHpBar(ctx, e);
  }
  const p = s.player;
  ctx.globalAlpha = p.hp > 0 ? 1 : 0.4;
  drawSprite(ctx, SPRITES.player, p.x, p.y, PLAYER_COLORS);
  ctx.globalAlpha = 1;
}
