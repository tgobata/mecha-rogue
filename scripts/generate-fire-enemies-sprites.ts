/**
 * @fileoverview メカローグ 炎系敵スプライト生成スクリプト
 *
 * ignition_bot（着火ロボ）Lv1-4 と fire_people（ファイヤーピーポー）Lv1-4 を生成する。
 * Node.js の sharp ライブラリを使って RGBA ピクセルバッファから PNG を生成。
 *
 * 実行: node --experimental-strip-types scripts/generate-fire-enemies-sprites.ts
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const TILE_SIZE = 32;

const PROJECT_ROOT = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..'
);

const ENEMIES_DIR = path.join(PROJECT_ROOT, 'public', 'sprites', 'enemies');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

type Direction = 'down' | 'up' | 'left' | 'right';
type State = 'idle' | 'move' | 'attack' | 'hit' | 'levelup' | 'dead';

type DrawFn = (
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
) => void;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function hexToRGBA(hex: string, alpha = 255): RGBA {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: alpha,
  };
}

function createBuffer(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

function setPixel(buf: Uint8Array, width: number, x: number, y: number, color: RGBA): void {
  if (x < 0 || x >= width || y < 0 || y >= Math.floor(buf.length / width / 4)) return;
  const idx = (y * width + x) * 4;
  buf[idx]     = color.r;
  buf[idx + 1] = color.g;
  buf[idx + 2] = color.b;
  buf[idx + 3] = color.a;
}

function fillRect(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, width, x + dx, y + dy, color);
    }
  }
}

function hLine(buf: Uint8Array, width: number, x: number, y: number, len: number, color: RGBA): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x + i, y, color);
}

function vLine(buf: Uint8Array, width: number, x: number, y: number, len: number, color: RGBA): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x, y + i, color);
}

function fillCircle(buf: Uint8Array, width: number, cx: number, cy: number, r: number, color: RGBA): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(buf, width, cx + dx, cy + dy, color);
      }
    }
  }
}

function drawCircleOutline(buf: Uint8Array, width: number, cx: number, cy: number, r: number, color: RGBA): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dist - r) < 0.8) {
        setPixel(buf, width, cx + dx, cy + dy, color);
      }
    }
  }
}

async function savePNG(buf: Uint8Array, width: number, height: number, filePath: string): Promise<void> {
  await sharp(Buffer.from(buf), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function dirOffset(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'down':  return { dx: 0,  dy: 1  };
    case 'up':    return { dx: 0,  dy: -1 };
    case 'left':  return { dx: -1, dy: 0  };
    case 'right': return { dx: 1,  dy: 0  };
  }
}

const BLACK = hexToRGBA('#000000');

// ---------------------------------------------------------------------------
// 炎パターン描画ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 三角形の炎を描画する（底から上に向かって細くなる）
 * @param baseX 炎の底の中心X
 * @param baseY 炎の底のY
 * @param height 炎の高さ（上方向）
 * @param fireColor 炎の色
 * @param tipColor 炎の先端色（明るい）
 */
function drawFlame(
  buf: Uint8Array,
  S: number,
  baseX: number,
  baseY: number,
  height: number,
  fireColor: RGBA,
  tipColor: RGBA
): void {
  for (let h = 0; h < height; h++) {
    // 底から上に行くほど細くなる
    const ratio = h / height;
    const halfW = Math.max(0, Math.round((1 - ratio) * 1.5));
    const y = baseY - h;
    for (let dx = -halfW; dx <= halfW; dx++) {
      const c = h > height * 0.6 ? tipColor : fireColor;
      setPixel(buf, S, baseX + dx, y, c);
    }
  }
}

/**
 * 横向き炎（左右噴出用）
 */
function drawFlameHorizontal(
  buf: Uint8Array,
  S: number,
  baseX: number,
  baseY: number,
  length: number,
  dirX: number,
  fireColor: RGBA,
  tipColor: RGBA
): void {
  for (let l = 0; l < length; l++) {
    const ratio = l / length;
    const halfW = Math.max(0, Math.round((1 - ratio) * 1.5));
    const x = baseX + dirX * l;
    for (let dy = -halfW; dy <= halfW; dy++) {
      const c = l > length * 0.6 ? tipColor : fireColor;
      setPixel(buf, S, x, baseY + dy, c);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. ignition_bot（着火ロボ）
// ---------------------------------------------------------------------------
// 丸みのある正方形頭部（glowing eyes）、四角いロボットボディ、
// 短い脚2本、両脇と足元から炎が噴出
// ---------------------------------------------------------------------------

function drawIgnitionBot(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別色
  const BODY_COLORS = ['#44aa55', '#aaaa22', '#dd6622', '#bb2244'];
  const FIRE_COLORS = ['#ffaa22', '#ff8800', '#ff4400', '#ff2288'];
  const EYE_COLORS  = ['#ffdd00', '#ff8800', '#ff4400', '#ffaacc'];

  const bodyHex = BODY_COLORS[lv] ?? BODY_COLORS[0];
  const fireHex = FIRE_COLORS[lv] ?? FIRE_COLORS[0];
  const eyeHex  = EYE_COLORS[lv]  ?? EYE_COLORS[0];

  const body    = hexToRGBA(bodyHex);
  const fire    = hexToRGBA(fireHex);
  const fireTip = hexToRGBA('#ffeeaa');
  const eye     = hexToRGBA(eyeHex);
  const dOff    = dirOffset(dir);

  // バウンド
  const bounceY = state === 'move' && frame === 1 ? 2 : 0;
  // アタック: 前方にX/Yずれ
  const attackOffX = state === 'attack'
    ? (frame === 1 ? dOff.dx * 2 : frame === 2 ? dOff.dx * 1 : 0)
    : 0;
  const attackOffY = state === 'attack'
    ? (frame === 1 ? dOff.dy * 2 : frame === 2 ? dOff.dy * 1 : 0)
    : 0;
  // dead: 傾き
  const isDead = state === 'dead';
  const deadTiltX = isDead ? frame * 3 : 0;
  const deadTiltY = isDead ? frame * 2 : 0;

  if (isDead && frame === 2) {
    // 爆発
    fillCircle(buf, S, 16, 18, 10, hexToRGBA('#aaaaaa', 130));
    fillCircle(buf, S, 16, 18,  7, hexToRGBA(fireHex, 160));
    fillCircle(buf, S, 16, 18,  4, hexToRGBA('#ffeeaa', 200));
    return;
  }

  const cx = 16 + attackOffX + deadTiltX;
  const cy = 4  + attackOffY + bounceY + deadTiltY;

  // hit: 赤みをかける
  const bodyColor = state === 'hit' ? hexToRGBA('#dd5555') : body;

  // ---- 炎描画（ボディの後ろ側から）----
  const flameHeight0 = 4; // frame0: 低め
  const flameHeight1 = 6; // frame1: 高め
  const flameH = frame === 1 ? flameHeight1 : flameHeight0;
  const footFlameH = frame === 1 ? 7 : 5;

  if (dir === 'down' || dir === 'up') {
    // 足元炎（下から噴出）
    drawFlame(buf, S, cx - 3, cy + 28, footFlameH, fire, fireTip);
    drawFlame(buf, S, cx + 3, cy + 28, footFlameH, fire, fireTip);
    // 両脇炎
    drawFlameHorizontal(buf, S, cx - 9, cy + 16, flameH, -1, fire, fireTip);
    drawFlameHorizontal(buf, S, cx + 9, cy + 16, flameH,  1, fire, fireTip);
  } else {
    // 横向き: 足元炎
    drawFlame(buf, S, cx - 2, cy + 28, footFlameH, fire, fireTip);
    drawFlame(buf, S, cx + 4, cy + 28, footFlameH, fire, fireTip);
    // 後方炎
    const rearDirX = dir === 'right' ? -1 : 1;
    drawFlameHorizontal(buf, S, cx + rearDirX * 7, cy + 15, flameH + 1, rearDirX, fire, fireTip);
    // 頭頂炎
    drawFlame(buf, S, cx, cy - 1, flameH - 1, fire, fireTip);
  }

  // ---- 脚 ----
  const legY = cy + 21;
  fillRect(buf, S, cx - 5, legY, 3, 5, hexToRGBA(bodyHex, 220));
  fillRect(buf, S, cx + 2, legY, 3, 5, hexToRGBA(bodyHex, 220));
  // 足先
  fillRect(buf, S, cx - 6, legY + 4, 4, 2, BLACK);
  fillRect(buf, S, cx + 2, legY + 4, 4, 2, BLACK);

  // ---- ボディ（胸部が広い四角形）----
  const bodyTop = cy + 10;
  fillRect(buf, S, cx - 8, bodyTop, 16, 11, bodyColor);
  // 胸部ハイライト
  hLine(buf, S, cx - 8, bodyTop, 16, hexToRGBA(bodyHex, 200));
  vLine(buf, S, cx - 8, bodyTop, 11, hexToRGBA(bodyHex, 180));

  // ---- 腕（短め）----
  fillRect(buf, S, cx - 11, bodyTop + 2, 3, 5, bodyColor);
  fillRect(buf, S, cx + 8,  bodyTop + 2, 3, 5, bodyColor);
  // 腕先端（炎噴射口）
  setPixel(buf, S, cx - 11, bodyTop + 6, fire);
  setPixel(buf, S, cx + 10, bodyTop + 6, fire);

  // ---- 頭部（丸みのある正方形）----
  const headTop = cy;
  // 丸みを出すため角を欠く
  fillRect(buf, S, cx - 5, headTop + 1, 10, 8, bodyColor);
  fillRect(buf, S, cx - 4, headTop,      8, 10, bodyColor);
  // 頭部ハイライト
  hLine(buf, S, cx - 3, headTop, 6, hexToRGBA(bodyHex, 200));

  // ---- 目（glowing）----
  if (dir === 'down' || dir === 'up') {
    // 正面/背面
    if (dir === 'down') {
      fillRect(buf, S, cx - 3, headTop + 3, 2, 2, eye);
      fillRect(buf, S, cx + 1, headTop + 3, 2, 2, eye);
      // 目の輝き
      setPixel(buf, S, cx - 3, headTop + 3, hexToRGBA('#ffffff'));
      setPixel(buf, S, cx + 1, headTop + 3, hexToRGBA('#ffffff'));
    } else {
      // 背面は目なし（後頭部）
      setPixel(buf, S, cx - 2, headTop + 3, hexToRGBA(bodyHex, 120));
      setPixel(buf, S, cx + 1, headTop + 3, hexToRGBA(bodyHex, 120));
    }
  } else {
    // 横向き
    const eyeX = dir === 'right' ? cx + 3 : cx - 4;
    fillRect(buf, S, eyeX, headTop + 3, 2, 2, eye);
    setPixel(buf, S, eyeX, headTop + 3, hexToRGBA('#ffffff'));
  }

  // hit: 目が×になる
  if (state === 'hit' && frame === 1) {
    if (dir === 'down') {
      setPixel(buf, S, cx - 3, headTop + 3, BLACK);
      setPixel(buf, S, cx - 2, headTop + 4, BLACK);
      setPixel(buf, S, cx - 2, headTop + 3, BLACK);
      setPixel(buf, S, cx - 3, headTop + 4, BLACK);
      setPixel(buf, S, cx + 1, headTop + 3, BLACK);
      setPixel(buf, S, cx + 2, headTop + 4, BLACK);
      setPixel(buf, S, cx + 2, headTop + 3, BLACK);
      setPixel(buf, S, cx + 1, headTop + 4, BLACK);
    }
  }

  // ---- アウトライン ----
  // 頭部アウトライン
  hLine(buf, S, cx - 4, headTop,      8, BLACK);
  hLine(buf, S, cx - 5, headTop + 1,  1, BLACK);
  hLine(buf, S, cx + 4, headTop + 1,  1, BLACK);
  hLine(buf, S, cx - 5, headTop + 8,  1, BLACK);
  hLine(buf, S, cx + 4, headTop + 8,  1, BLACK);
  hLine(buf, S, cx - 4, headTop + 9,  8, BLACK);
  vLine(buf, S, cx - 5, headTop + 1,  8, BLACK);
  vLine(buf, S, cx + 4, headTop + 1,  8, BLACK);
  // ボディアウトライン
  hLine(buf, S, cx - 8, bodyTop,      16, BLACK);
  hLine(buf, S, cx - 8, bodyTop + 10, 16, BLACK);
  vLine(buf, S, cx - 8, bodyTop,      11, BLACK);
  vLine(buf, S, cx + 7, bodyTop,      11, BLACK);

  // ---- levelup: 白いフラッシュアウトライン ----
  if (state === 'levelup') {
    const flashA = frame === 0 ? 200 : 100;
    drawCircleOutline(buf, S, cx, cy + 11, 13, hexToRGBA('#ffffff', flashA));
    fillRect(buf, S, cx - 4, headTop, 8, 10, hexToRGBA('#ffffff', flashA / 2));
  }

  // ---- dead frame0: 傾く ----
  if (isDead && frame === 0) {
    // すでにdeadTiltXで傾いている
  }
}

// ---------------------------------------------------------------------------
// 2. fire_people（ファイヤーピーポー）
// ---------------------------------------------------------------------------
// 丸い頭部、細長い人型ボディ、腕を横に広げた形、
// 脚下部は炎で形成、全身がオーラ炎に包まれる
// ---------------------------------------------------------------------------

function drawFirePeople(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別色
  const BODY_COLORS = ['#ffaa44', '#ff7722', '#ff3300', '#990044'];
  const AURA_COLORS = ['#ffee88', '#ffcc22', '#ffaa00', '#ff44aa'];
  const EYE_COLORS  = ['#ffffff', '#ffff88', '#ffee44', '#ffccee'];

  const bodyHex = BODY_COLORS[lv] ?? BODY_COLORS[0];
  const auraHex = AURA_COLORS[lv] ?? AURA_COLORS[0];
  const eyeHex  = EYE_COLORS[lv]  ?? EYE_COLORS[0];

  const body    = hexToRGBA(bodyHex);
  const aura    = hexToRGBA(auraHex);
  const auraTip = hexToRGBA('#ffffff', 180);
  const eye     = hexToRGBA(eyeHex);
  const dOff    = dirOffset(dir);

  // バウンド
  const bounceY = state === 'move' && frame === 1 ? 2 : 0;
  // アタック
  const attackOffX = state === 'attack'
    ? (frame === 1 ? dOff.dx * 2 : frame === 2 ? dOff.dx * 1 : 0)
    : 0;
  const attackOffY = state === 'attack'
    ? (frame === 1 ? dOff.dy * 2 : frame === 2 ? dOff.dy * 1 : 0)
    : 0;

  const isDead = state === 'dead';
  const deadTiltX = isDead ? frame * 3 : 0;
  const deadTiltY = isDead ? frame * 2 : 0;

  if (isDead && frame === 2) {
    // 爆発（煙と炎）
    fillCircle(buf, S, 16, 18, 11, hexToRGBA('#888888', 130));
    fillCircle(buf, S, 16, 18,  7, hexToRGBA(auraHex, 160));
    fillCircle(buf, S, 16, 18,  4, hexToRGBA('#ffffff', 180));
    return;
  }

  const cx = 16 + attackOffX + deadTiltX;
  const cy = 3  + attackOffY + bounceY + deadTiltY;

  // hit: 全体が赤みがかる
  const bodyColor = state === 'hit' ? hexToRGBA('#ff5555') : body;
  const auraColor = state === 'hit' ? hexToRGBA('#ff8888', 160) : hexToRGBA(auraHex, 180);

  // 炎オーラの強さ（frame1で広がる）
  const auraSpread = frame === 1 ? 2 : 1;

  // ---- 炎オーラ（ボディ外周に散らす）----
  // 頭周り
  fillCircle(buf, S, cx, cy + 2, 6 + auraSpread, hexToRGBA(auraHex, 80));
  // ボディ周り
  fillRect(buf, S, cx - 5 - auraSpread, cy + 8, 10 + auraSpread * 2, 14, hexToRGBA(auraHex, 60));

  // 脚部炎（下から噴出）
  const legFlameH = frame === 1 ? 7 : 5;
  drawFlame(buf, S, cx - 2, cy + 27, legFlameH, aura, auraTip);
  drawFlame(buf, S, cx + 2, cy + 27, legFlameH, aura, auraTip);

  // オーラの炎ピクセル（ボディ外側）
  const auraPixels = [
    // 左側
    { x: cx - 5, y: cy + 9 },
    { x: cx - 6, y: cy + 12 },
    { x: cx - 5, y: cy + 15 },
    { x: cx - 6, y: cy + 18 },
    // 右側
    { x: cx + 4, y: cy + 9 },
    { x: cx + 5, y: cy + 12 },
    { x: cx + 4, y: cy + 15 },
    { x: cx + 5, y: cy + 18 },
    // 頭周り
    { x: cx - 4, y: cy - 1 },
    { x: cx + 3, y: cy - 1 },
    { x: cx,     y: cy - 2 },
  ];
  for (const { x, y } of auraPixels) {
    setPixel(buf, S, x, y, hexToRGBA(auraHex, 200));
  }
  // frame1でオーラ追加ピクセル
  if (frame === 1) {
    setPixel(buf, S, cx - 7, cy + 10, aura);
    setPixel(buf, S, cx - 7, cy + 16, aura);
    setPixel(buf, S, cx + 6, cy + 10, aura);
    setPixel(buf, S, cx + 6, cy + 16, aura);
    setPixel(buf, S, cx - 1, cy - 3, aura);
    setPixel(buf, S, cx + 1, cy - 3, aura);
  }

  // ---- 脚（炎の形）----
  const legTop = cy + 20;
  // 脚は炎色で細く
  vLine(buf, S, cx - 2, legTop, 7, hexToRGBA(bodyHex, 200));
  vLine(buf, S, cx + 1, legTop, 7, hexToRGBA(bodyHex, 200));
  // 足先は炎
  fillRect(buf, S, cx - 3, legTop + 6, 2, 2, aura);
  fillRect(buf, S, cx + 1, legTop + 6, 2, 2, aura);

  // ---- ボディ（細長い人型）----
  const bodyTop = cy + 9;
  // 胴体（細い）
  fillRect(buf, S, cx - 3, bodyTop, 6, 11, bodyColor);
  // ボディ中央ライン（ハイライト）
  vLine(buf, S, cx - 3, bodyTop, 11, hexToRGBA(bodyHex, 220));

  // ---- 腕（横に広げる）----
  // 腕: bodyTopから横に伸びる
  const armY = bodyTop + 3;
  // left arm
  fillRect(buf, S, cx - 8, armY, 5, 3, bodyColor);
  // right arm
  fillRect(buf, S, cx + 3, armY, 5, 3, bodyColor);
  // 腕先端に炎
  setPixel(buf, S, cx - 8, armY + 1, aura);
  setPixel(buf, S, cx + 7, armY + 1, aura);
  // 腕の炎アウトライン
  if (frame === 1) {
    setPixel(buf, S, cx - 9, armY,     aura);
    setPixel(buf, S, cx - 9, armY + 2, aura);
    setPixel(buf, S, cx + 8, armY,     aura);
    setPixel(buf, S, cx + 8, armY + 2, aura);
  }

  // ---- 頭部（丸い）----
  fillCircle(buf, S, cx, cy + 4, 5, bodyColor);
  // 頭部ハイライト
  setPixel(buf, S, cx - 2, cy + 2, hexToRGBA(bodyHex, 220));
  setPixel(buf, S, cx - 1, cy + 1, hexToRGBA(bodyHex, 200));

  // ---- 目（輝く）----
  if (dir === 'down' || dir === 'up') {
    if (dir === 'down') {
      fillRect(buf, S, cx - 2, cy + 3, 2, 2, eye);
      fillRect(buf, S, cx + 1, cy + 3, 2, 2, eye);
      setPixel(buf, S, cx - 2, cy + 3, hexToRGBA('#ffffff'));
      setPixel(buf, S, cx + 1, cy + 3, hexToRGBA('#ffffff'));
    } else {
      // 背面
      setPixel(buf, S, cx - 1, cy + 4, hexToRGBA(bodyHex, 100));
      setPixel(buf, S, cx + 1, cy + 4, hexToRGBA(bodyHex, 100));
    }
  } else {
    const eyeX = dir === 'right' ? cx + 2 : cx - 3;
    fillRect(buf, S, eyeX, cy + 3, 2, 2, eye);
    setPixel(buf, S, eyeX, cy + 3, hexToRGBA('#ffffff'));
  }

  // hit: 目が×になる（frame1）
  if (state === 'hit' && frame === 1) {
    if (dir === 'down') {
      setPixel(buf, S, cx - 2, cy + 3, BLACK);
      setPixel(buf, S, cx - 1, cy + 4, BLACK);
      setPixel(buf, S, cx - 1, cy + 3, BLACK);
      setPixel(buf, S, cx - 2, cy + 4, BLACK);
      setPixel(buf, S, cx + 1, cy + 3, BLACK);
      setPixel(buf, S, cx + 2, cy + 4, BLACK);
      setPixel(buf, S, cx + 2, cy + 3, BLACK);
      setPixel(buf, S, cx + 1, cy + 4, BLACK);
    }
  }

  // ---- アウトライン ----
  // 頭部アウトライン（円形）
  drawCircleOutline(buf, S, cx, cy + 4, 5, BLACK);
  // ボディアウトライン
  hLine(buf, S, cx - 3, bodyTop,      6, BLACK);
  hLine(buf, S, cx - 3, bodyTop + 10, 6, BLACK);
  vLine(buf, S, cx - 3, bodyTop,      11, BLACK);
  vLine(buf, S, cx + 2, bodyTop,      11, BLACK);

  // ---- levelup: 輝くアウトライン ----
  if (state === 'levelup') {
    const flashA = frame === 0 ? 220 : 110;
    drawCircleOutline(buf, S, cx, cy + 4, 7, hexToRGBA('#ffffff', flashA));
    drawCircleOutline(buf, S, cx, cy + 4, 10, hexToRGBA(auraHex, flashA / 2));
    fillRect(buf, S, cx - 3, bodyTop, 6, 11, hexToRGBA('#ffffff', flashA / 3));
  }

  // ---- dead frame0/1: 傾く・崩れる ----
  if (isDead && frame === 1) {
    // 崩れかけの煙
    fillCircle(buf, S, cx + 2, cy + 8, 4, hexToRGBA('#888888', 100));
  }
}

// ---------------------------------------------------------------------------
// 敵リスト
// ---------------------------------------------------------------------------

const FIRE_ENEMY_BASE_IDS: Array<{ id: string; drawFn: DrawFn }> = [
  { id: 'ignition_bot', drawFn: drawIgnitionBot },
  { id: 'fire_people',  drawFn: drawFirePeople  },
];

// ---------------------------------------------------------------------------
// フレーム数定義
// ---------------------------------------------------------------------------

const STATE_FRAMES: Record<State, number> = {
  idle:    2,
  move:    2,
  attack:  3,
  hit:     2,
  levelup: 2,
  dead:    3,
};

const DIRECTIONS: Direction[] = ['down', 'up', 'left', 'right'];
const STATES: State[] = ['idle', 'move', 'attack', 'hit', 'levelup', 'dead'];

// ---------------------------------------------------------------------------
// 生成メイン
// ---------------------------------------------------------------------------

async function generateSprite(
  id: string,
  drawFn: DrawFn,
  lv: number,
  state: State,
  dir: Direction,
  frame: number,
  outDir: string
): Promise<string> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  drawFn(buf, S, dir, state, frame, lv);

  const filename = `${id}_${state}_dir_${dir}_idle_${frame}.png`;
  const filePath = path.join(outDir, filename);

  await savePNG(buf, S, S, filePath);
  return filename;
}

async function main(): Promise<void> {
  console.log('=== メカローグ 炎系敵スプライト生成開始 ===');

  ensureDir(ENEMIES_DIR);

  const generated: string[] = [];
  let count = 0;

  console.log('\n--- 炎系敵2種（Lv1〜Lv4）---');
  for (const { id, drawFn } of FIRE_ENEMY_BASE_IDS) {
    console.log(`\n[${id}] 生成中...`);
    for (let lv = 0; lv < 4; lv++) {
      const lvLabel = `lv${lv + 1}`;
      const enemyId = `${id}_${lvLabel}`;
      for (const dir of DIRECTIONS) {
        for (const state of STATES) {
          const frameCount = STATE_FRAMES[state];
          for (let frame = 0; frame < frameCount; frame++) {
            const filename = await generateSprite(enemyId, drawFn, lv, state, dir, frame, ENEMIES_DIR);
            generated.push(filename);
            count++;
          }
        }
      }
    }
    console.log(`  ${id}: 完了 (Lv1-4)`);
  }

  console.log(`\n=== 生成完了: ${count} ファイル ===`);
  console.log(`出力先: ${ENEMIES_DIR}`);

  console.log('\n--- 生成ファイル一覧（先頭30件）---');
  for (const f of generated.slice(0, 30)) {
    console.log('  ' + f);
  }
  if (generated.length > 30) {
    console.log(`  ... 他 ${generated.length - 30} ファイル`);
  }
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
