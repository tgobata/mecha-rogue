/**
 * @fileoverview メカローグ 4〜10階 敵スプライト生成スクリプト
 *
 * 新規登場5種（Lv1-4）+ 既存敵の高Lvバリアント（Lv3/Lv4）を生成する。
 * Node.js の sharp ライブラリを使って RGBA ピクセルバッファから PNG を生成。
 * 全体的に明るめの色調で統一。
 *
 * 実行: node --experimental-strip-types scripts/generate-floor4-10-sprites.ts
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

// Level variant index: 0=lv1, 1=lv2, 2=lv3, 3=lv4
type DrawFn = (
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
) => void;

interface EnemyVariant {
  id: string;
  lv: number;
  drawFn: DrawFn;
}

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

function fillEllipse(
  buf: Uint8Array,
  width: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGBA
): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    for (let dx = -hw; dx <= hw; dx++) {
      setPixel(buf, width, cx + dx, cy + dy, color);
    }
  }
}

function drawLine(
  buf: Uint8Array,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: RGBA
): void {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  if (steps === 0) { setPixel(buf, width, x1, y1, color); return; }
  for (let s = 0; s <= steps; s++) {
    const px = Math.round(x1 + (x2 - x1) * s / steps);
    const py = Math.round(y1 + (y2 - y1) * s / steps);
    setPixel(buf, width, px, py, color);
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
const WHITE = hexToRGBA('#ffffff');

// ---------------------------------------------------------------------------
// 1. mine_layer（マインレイヤー）
// ---------------------------------------------------------------------------
// 4輪の地面走行型ロボ。後部から地雷を投下しながら進む。
// ---------------------------------------------------------------------------

function drawMineLayer(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別本体色（明るい）
  const BODY_COLORS = ['#88cc66', '#99dd77', '#44ccdd', '#ffaa44'];
  const LINE_COLORS = ['#556644', '#66aa44', '#2299aa', '#dd6622'];
  const bodyHex  = BODY_COLORS[lv] ?? BODY_COLORS[0];
  const lineHex  = LINE_COLORS[lv] ?? LINE_COLORS[0];

  const body   = hexToRGBA(bodyHex);
  const line   = hexToRGBA(lineHex);
  const wheel  = hexToRGBA('#445533');
  const mine   = hexToRGBA('#ffaa22');
  const sensor = hexToRGBA('#44ffff');

  const dOff = dirOffset(dir);
  const cx = 16;

  // move: 車輪バウンド
  const bounceY = state === 'move' && frame === 1 ? 1 : 0;
  const cy = 18 + bounceY;

  // dead: ひっくり返る
  const isDead = state === 'dead';

  if (isDead && frame === 2) {
    // 爆発煙
    fillCircle(buf, S, cx, cy - 2, 9, hexToRGBA('#aaaaaa', 140));
    fillCircle(buf, S, cx, cy - 2, 6, hexToRGBA('#ff8800', 160));
    fillCircle(buf, S, cx, cy - 2, 3, hexToRGBA('#ffcc00', 200));
    return;
  }

  const tiltX = isDead ? (frame === 0 ? 1 : 4) : 0;
  const tiltY = isDead ? (frame === 0 ? 2 : 6) : 0;
  const bx = cx + tiltX;
  const by = cy + tiltY;

  // hit: 本体が揺れる（赤みがかる）
  const bodyColor = state === 'hit' ? hexToRGBA('#dd9944') : body;

  if (dir === 'down' || dir === 'up') {
    // 正面/背面: 台形ボディ（幅22px高さ10px）
    // 上側は少し細い台形
    fillRect(buf, S, bx - 9, by - 8, 18, 10, bodyColor);
    hLine(buf, S, bx - 7, by - 9, 14, bodyColor); // 台形の斜め上辺
    hLine(buf, S, bx - 9, by - 8, 18, line);       // 本体ライン

    // センサーアンテナ（上部中央）
    vLine(buf, S, bx, by - 12, 4, sensor);
    fillCircle(buf, S, bx, by - 12, 2, sensor);

    // 4つの車輪（前後輪2ペア）
    // 前輪（下部）
    const wheelY = by + 1;
    // frame0/1でホイールパターン変化
    const wheelPat = state === 'move' ? frame : 0;
    for (const wx of [bx - 8, bx + 8]) {
      fillCircle(buf, S, wx, wheelY, 3, wheel);
      // スポーク
      if (wheelPat === 0) {
        setPixel(buf, S, wx, wheelY - 2, hexToRGBA('#7a9966'));
        setPixel(buf, S, wx, wheelY + 2, hexToRGBA('#7a9966'));
      } else {
        setPixel(buf, S, wx - 2, wheelY, hexToRGBA('#7a9966'));
        setPixel(buf, S, wx + 2, wheelY, hexToRGBA('#7a9966'));
      }
    }
    // 後輪（上部、背面時は前輪）
    const wheel2Y = by - 9;
    for (const wx of [bx - 7, bx + 7]) {
      fillCircle(buf, S, wx, wheel2Y, 3, wheel);
    }

    // 後部投下口（dir=down: 上側、dir=up: 下側）
    const hatchY = dir === 'down' ? by - 10 : by + 2;
    fillRect(buf, S, bx - 3, hatchY, 6, 2, hexToRGBA('#223322'));

    // アウトライン
    hLine(buf, S, bx - 9, by - 8, 18, BLACK);
    hLine(buf, S, bx - 9, by + 1, 18, BLACK);
    vLine(buf, S, bx - 9, by - 8, 10, BLACK);
    vLine(buf, S, bx + 8, by - 8, 10, BLACK);

  } else {
    // left/right: 横向き（4輪が全部見える）
    const facingRight = dir === 'right';
    // 投下口の向き（後部）
    const hatchX = facingRight ? bx - 11 : bx + 11;

    // ボディ横向き（幅22px高さ10px）
    fillRect(buf, S, bx - 11, by - 7, 22, 10, bodyColor);
    hLine(buf, S, bx - 11, by - 7, 22, line);

    // センサー（上部）
    vLine(buf, S, bx + (facingRight ? 5 : -5), by - 11, 4, sensor);
    fillCircle(buf, S, bx + (facingRight ? 5 : -5), by - 11, 2, sensor);

    // 4輪（横から見ると縦に2+2）
    const wheelPat = state === 'move' ? frame : 0;
    for (const wy of [by - 5, by + 4]) {
      for (const wx of [bx - 8, bx + 8]) {
        fillCircle(buf, S, wx, wy, 3, wheel);
        if (wheelPat === 0) {
          setPixel(buf, S, wx, wy - 2, hexToRGBA('#7a9966'));
          setPixel(buf, S, wx, wy + 2, hexToRGBA('#7a9966'));
        } else {
          setPixel(buf, S, wx - 2, wy, hexToRGBA('#7a9966'));
          setPixel(buf, S, wx + 2, wy, hexToRGBA('#7a9966'));
        }
      }
    }

    // 投下口（後部）
    fillRect(buf, S, hatchX - 1, by - 5, 3, 4, hexToRGBA('#223322'));

    // アウトライン
    hLine(buf, S, bx - 11, by - 7, 22, BLACK);
    hLine(buf, S, bx - 11, by + 2, 22, BLACK);
    vLine(buf, S, bx - 11, by - 7, 10, BLACK);
    vLine(buf, S, bx + 10, by - 7, 10, BLACK);
  }

  // attack（地雷投下）エフェクト
  if (state === 'attack') {
    const mineX = cx + dOff.dx * (frame === 0 ? 10 : frame === 1 ? 14 : 16);
    const mineY = cy + dOff.dy * (frame === 0 ? 8 : frame === 1 ? 12 : 14);
    if (frame === 0) {
      // 投下準備: 地雷が口から出てくる
      fillCircle(buf, S, mineX, mineY, 3, mine);
    } else if (frame === 1) {
      // 地雷が飛び出す
      fillCircle(buf, S, mineX, mineY, 4, mine);
      setPixel(buf, S, mineX, mineY - 2, hexToRGBA('#ffee44'));
    } else {
      // 地面に設置
      fillCircle(buf, S, mineX, mineY, 3, mine);
      hLine(buf, S, mineX - 3, mineY + 3, 7, hexToRGBA('#554422'));
    }
  }

  // hit: 火花
  if (state === 'hit') {
    setPixel(buf, S, cx - 3, cy - 12, hexToRGBA('#ffff44'));
    setPixel(buf, S, cx + 5, cy - 11, hexToRGBA('#ffcc00'));
    setPixel(buf, S, cx + 1, cy - 13, hexToRGBA('#ffffff'));
  }

  // levelup: センサーが光る
  if (state === 'levelup') {
    drawCircleOutline(buf, S, cx, cy - 5, 6 + frame * 2, hexToRGBA('#44ffff', 180));
    fillCircle(buf, S, cx, cy - 12, 3, hexToRGBA('#ffffff', frame === 0 ? 220 : 120));
  }
}

// ---------------------------------------------------------------------------
// 2. assault_mecha（アサルトメカ）
// ---------------------------------------------------------------------------
// 二足歩行の突撃型戦闘ロボ。右腕に機関銃を装備。
// ---------------------------------------------------------------------------

function drawAssaultMecha(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別色（明るい）
  const BODY_COLORS  = ['#6699ff', '#4477dd', '#44ccdd', '#44ee88'];
  const ARMOR_COLORS = ['#aaccff', '#88aaee', '#99eeff', '#aaeecc'];
  const bodyHex  = BODY_COLORS[lv]  ?? BODY_COLORS[0];
  const armorHex = ARMOR_COLORS[lv] ?? ARMOR_COLORS[0];

  const body    = hexToRGBA(bodyHex);
  const armor   = hexToRGBA(armorHex);
  // Lv3+ はガトリング（太い）
  const gunColor = lv >= 2 ? hexToRGBA('#ffdd44') : hexToRGBA('#ddcc33');
  const eyeColor = state === 'hit' ? hexToRGBA('#ff8800') : hexToRGBA('#ff4444');

  const dOff = dirOffset(dir);
  const cx = 16;
  const bounceY = state === 'move' && frame === 1 ? 1 : 0;
  const cy = 4 + bounceY;

  const isDead = state === 'dead';
  const deadOff = isDead ? frame * 3 : 0;

  if (isDead && frame === 2) {
    fillCircle(buf, S, cx + deadOff, 22, 10, hexToRGBA('#ff6600', 160));
    fillCircle(buf, S, cx + deadOff, 22, 6,  hexToRGBA('#ffcc00', 200));
    return;
  }

  const bx = cx + (isDead ? deadOff : 0);
  const by = cy + (isDead ? frame * 4 : 0);

  // head (8x7)
  const headTop = by;
  const bodyTop = by + 7;
  const legTop  = bodyTop + 12;

  const bodyColor = state === 'hit' ? hexToRGBA('#5566cc') : body;

  // -- 頭部 --
  fillRect(buf, S, bx - 4, headTop, 8, 7, bodyColor);
  hLine(buf, S, bx - 4, headTop, 8, armor);

  // 目（方向別）
  if (dir === 'down') {
    setPixel(buf, S, bx - 2, headTop + 3, eyeColor);
    setPixel(buf, S, bx + 1, headTop + 3, eyeColor);
    setPixel(buf, S, bx - 2, headTop + 2, hexToRGBA('#ff8888', 180));
    setPixel(buf, S, bx + 1, headTop + 2, hexToRGBA('#ff8888', 180));
  } else if (dir === 'up') {
    setPixel(buf, S, bx - 2, headTop + 3, hexToRGBA('#334455'));
    setPixel(buf, S, bx + 1, headTop + 3, hexToRGBA('#334455'));
  } else if (dir === 'left') {
    setPixel(buf, S, bx - 3, headTop + 3, eyeColor);
  } else {
    setPixel(buf, S, bx + 2, headTop + 3, eyeColor);
  }

  // hit: 目が赤点滅
  if (state === 'hit' && frame === 1) {
    fillRect(buf, S, bx - 4, headTop, 8, 7, hexToRGBA('#ff2200', 60));
  }

  // -- 胴体 --
  fillRect(buf, S, bx - 6, bodyTop, 12, 12, bodyColor);
  hLine(buf, S, bx - 6, bodyTop, 12, armor);
  vLine(buf, S, bx - 6, bodyTop, 12, armor);
  vLine(buf, S, bx + 5, bodyTop, 12, hexToRGBA(bodyHex, 180));

  // 胸部装甲文様（down方向）
  if (dir === 'down') {
    fillRect(buf, S, bx - 3, bodyTop + 2, 6, 4, armor);
    hLine(buf, S, bx - 3, bodyTop + 3, 6, hexToRGBA(bodyHex));
  }

  // Lv3+ 背部パック
  if (dir === 'up' && lv >= 2) {
    fillRect(buf, S, bx - 4, bodyTop + 1, 8, 8, hexToRGBA('#336655'));
    setPixel(buf, S, bx, bodyTop + 4, hexToRGBA('#44ffaa'));
  }

  // アウトライン（頭・胴）
  hLine(buf, S, bx - 4, headTop, 8, BLACK);
  vLine(buf, S, bx - 4, headTop, 7, BLACK);
  vLine(buf, S, bx + 3, headTop, 7, BLACK);
  hLine(buf, S, bx - 6, bodyTop, 12, BLACK);
  hLine(buf, S, bx - 6, bodyTop + 12, 12, BLACK);
  vLine(buf, S, bx - 6, bodyTop, 13, BLACK);
  vLine(buf, S, bx + 5, bodyTop, 13, BLACK);

  // -- 脚 --
  if (!isDead) {
    const legOff0 = state === 'move' && frame === 0 ? -2 : 0;
    const legOff1 = state === 'move' && frame === 0 ? 2  : 0;
    fillRect(buf, S, bx - 5, legTop, 3, 5 + legOff0, hexToRGBA('#334477'));
    fillRect(buf, S, bx + 2, legTop, 3, 5 + legOff1, hexToRGBA('#334477'));
    fillRect(buf, S, bx - 6, legTop + 4 + legOff0, 4, 2, hexToRGBA('#223355'));
    fillRect(buf, S, bx + 2, legTop + 4 + legOff1, 4, 2, hexToRGBA('#223355'));
  } else {
    // dead frame0: 膝をつく、frame1: 横倒し
    if (frame === 0) {
      fillRect(buf, S, bx - 5, legTop, 3, 3, hexToRGBA('#334477'));
      fillRect(buf, S, bx + 2, legTop, 3, 8, hexToRGBA('#334477'));
    } else {
      fillRect(buf, S, bx - 5, legTop + 3, 12, 3, hexToRGBA('#334477'));
    }
  }

  // -- 機関銃（右腕）--
  if (!isDead) {
    const isAttack = state === 'attack';
    const attackPush = isAttack && frame === 1 ? 3 : 0;
    // Lv3+ はガトリング砲（太い）
    const gunW = lv >= 2 ? 3 : 2;
    const gunLen = lv >= 2 ? 10 : 8;

    if (dir === 'down') {
      const gx = bx + 6;
      const gy = bodyTop + 2;
      fillRect(buf, S, gx, gy, gunW, gunLen + attackPush, gunColor);
      hLine(buf, S, gx - 1, gy + gunLen + attackPush, gunW + 2, BLACK);
      if (isAttack && frame === 1) {
        // 発射炎（明るい黄色）
        fillCircle(buf, S, gx + 1, gy + gunLen + attackPush + 2, 3, hexToRGBA('#ffee00'));
        fillCircle(buf, S, gx + 1, gy + gunLen + attackPush + 2, 1, hexToRGBA('#ffffff'));
      }
      if (isAttack && frame === 2) {
        // 硝煙
        fillCircle(buf, S, gx + 1, gy + gunLen + 3, 3, hexToRGBA('#888888', 120));
      }
    } else if (dir === 'up') {
      fillRect(buf, S, bx + 5, bodyTop + 2, gunW, 8, gunColor);
    } else if (dir === 'right') {
      // 機関銃が前（右）に向く
      const gx = bx + 6 + attackPush;
      fillRect(buf, S, gx, bodyTop + 3, gunLen, gunW, gunColor);
      vLine(buf, S, gx + gunLen, bodyTop + 2, gunW + 2, BLACK);
      if (isAttack && frame === 1) {
        fillCircle(buf, S, gx + gunLen + 2, bodyTop + 4, 3, hexToRGBA('#ffee00'));
        fillCircle(buf, S, gx + gunLen + 2, bodyTop + 4, 1, hexToRGBA('#ffffff'));
      }
      if (isAttack && frame === 2) {
        fillCircle(buf, S, gx + gunLen + 3, bodyTop + 4, 3, hexToRGBA('#888888', 120));
      }
    } else {
      // left: 機関銃が前（左）に向く
      const gx = bx - 7 - gunLen - attackPush;
      fillRect(buf, S, gx, bodyTop + 3, gunLen, gunW, gunColor);
      vLine(buf, S, gx - 1, bodyTop + 2, gunW + 2, BLACK);
      if (isAttack && frame === 1) {
        fillCircle(buf, S, gx - 2, bodyTop + 4, 3, hexToRGBA('#ffee00'));
        fillCircle(buf, S, gx - 2, bodyTop + 4, 1, hexToRGBA('#ffffff'));
      }
      if (isAttack && frame === 2) {
        fillCircle(buf, S, gx - 3, bodyTop + 4, 3, hexToRGBA('#888888', 120));
      }
    }
  }

  // levelup: 全身が青白く輝く
  if (state === 'levelup') {
    const alpha = frame === 0 ? 160 : 80;
    fillRect(buf, S, bx - 6, headTop, 12, 19, hexToRGBA('#aaddff', alpha));
    drawCircleOutline(buf, S, bx, headTop + 9, 10, hexToRGBA('#ffffff', 180));
  }
}

// ---------------------------------------------------------------------------
// 3. stealth_killer（ステルスキラー）
// ---------------------------------------------------------------------------
// 細身の暗殺型メカ。通常は薄く半透明。攻撃時に実体化。
// ---------------------------------------------------------------------------

function drawStealthKiller(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別色（明るい）
  const BODY_COLORS   = ['#88aacc', '#66cc99', '#bb88ee', '#ddbb44'];
  const VISOR_COLORS  = ['#ffff88', '#88ffcc', '#ffaaee', '#ffffaa'];
  const KNIFE_COLORS  = ['#aaffcc', '#88ffee', '#ddaaff', '#ffee88'];
  const MANTLE_COLORS = ['#6688aa', '#448866', '#9966bb', '#aa8822'];

  const bodyHex   = BODY_COLORS[lv]   ?? BODY_COLORS[0];
  const visorHex  = VISOR_COLORS[lv]  ?? VISOR_COLORS[0];
  const knifeHex  = KNIFE_COLORS[lv]  ?? KNIFE_COLORS[0];
  const mantleHex = MANTLE_COLORS[lv] ?? MANTLE_COLORS[0];

  // 通常は半透明（alpha=160）、attack/hit は実体化（alpha=255）
  const baseAlpha = (state === 'attack' || state === 'hit') ? 255 :
                    state === 'dead' ? Math.max(0, 160 - frame * 70) :
                    160;

  const body   = hexToRGBA(bodyHex, baseAlpha);
  const visor  = hexToRGBA(visorHex, baseAlpha);
  const knife  = hexToRGBA(knifeHex, Math.min(255, baseAlpha + 40));
  const mantle = hexToRGBA(mantleHex, Math.max(0, baseAlpha - 30));

  const dOff = dirOffset(dir);
  const cx = 16;
  const bounceY = state === 'move' && frame === 1 ? 1 : 0;

  // dead: 透明になって消える（alpha を段階的に下げる）
  if (state === 'dead' && frame === 2) {
    // ほぼ消えている（残像のみ）
    fillRect(buf, S, cx - 5, 6, 10, 22, hexToRGBA(bodyHex, 20));
    return;
  }

  const cy = 5 + bounceY;

  // -- マント（後ろ側に広がる）--
  // 上から垂れ下がる台形マント
  fillRect(buf, S, cx - 6, cy + 6, 12, 16, mantle);
  // マント下端（台形に）
  fillRect(buf, S, cx - 4, cy + 18, 8, 3, mantle);

  // -- スリムな胴体（5px幅）--
  fillRect(buf, S, cx - 3, cy + 2, 6, 18, body);
  // ハイライト
  vLine(buf, S, cx - 3, cy + 2, 18, hexToRGBA(bodyHex, Math.min(255, baseAlpha + 40)));

  // -- 頭部（三角形バイザー）--
  // バイザー: 三角形（上が尖る）
  fillRect(buf, S, cx - 3, cy, 6, 4, body);
  // バイザー部分（光る）
  setPixel(buf, S, cx - 2, cy + 1, visor);
  setPixel(buf, S, cx - 1, cy + 1, visor);
  setPixel(buf, S, cx,     cy + 1, visor);
  setPixel(buf, S, cx + 1, cy + 1, visor);
  // バイザーの頂点
  setPixel(buf, S, cx, cy - 1, visor);

  // 方向表現: バイザーの向き
  if (dir === 'left') {
    setPixel(buf, S, cx - 3, cy + 2, visor);
  } else if (dir === 'right') {
    setPixel(buf, S, cx + 2, cy + 2, visor);
  }

  // -- 両手のナイフ --
  const knifeAlpha = state === 'attack' && frame === 1 ? 255 : Math.min(255, baseAlpha + 30);
  const knifeC = hexToRGBA(knifeHex, knifeAlpha);

  // 攻撃時: ナイフが光る
  if (state === 'attack') {
    if (frame === 0) {
      // 加速突進: 体が前に傾く（ナイフ構え）
      const px = cx + dOff.dx * 2;
      const py = cy + dOff.dy * 2;
      fillRect(buf, S, px - 3, py + 2, 6, 16, hexToRGBA(bodyHex, 200));
      // ナイフ
      drawLine(buf, S, px - 5, py + 8, px - 5 + dOff.dx * 6, py + 8 + dOff.dy * 6, knifeC);
      drawLine(buf, S, px + 4, py + 8, px + 4 + dOff.dx * 6, py + 8 + dOff.dy * 6, knifeC);
    } else if (frame === 1) {
      // 斬撃（ナイフが光る）
      const slash = hexToRGBA('#ffffff', 220);
      drawLine(buf, S, cx + dOff.dx * 6 - 5, cy + dOff.dy * 6 + 8,
               cx + dOff.dx * 6 + 5, cy + dOff.dy * 6 + 18, slash);
      drawLine(buf, S, cx + dOff.dx * 6 + 5, cy + dOff.dy * 6 + 8,
               cx + dOff.dx * 6 - 5, cy + dOff.dy * 6 + 18, slash);
      // エフェクト
      drawCircleOutline(buf, S, cx + dOff.dx * 8, cy + dOff.dy * 8 + 12,
                        6, hexToRGBA(knifeHex, 200));
    } else {
      // 引き戻し
      drawLine(buf, S, cx - 5, cy + 8, cx - 5 - dOff.dx * 3, cy + 8 - dOff.dy * 3, knifeC);
      drawLine(buf, S, cx + 4, cy + 8, cx + 4 - dOff.dx * 3, cy + 8 - dOff.dy * 3, knifeC);
    }
  } else {
    // 通常時: ナイフを両脇に持つ
    vLine(buf, S, cx - 5, cy + 8, 7, knifeC);
    vLine(buf, S, cx + 4, cy + 8, 7, knifeC);
    // ナイフの先端
    setPixel(buf, S, cx - 5, cy + 14, hexToRGBA('#ffffff', Math.min(255, baseAlpha + 60)));
    setPixel(buf, S, cx + 4, cy + 14, hexToRGBA('#ffffff', Math.min(255, baseAlpha + 60)));
  }

  // levelup: 白くフラッシュ
  if (state === 'levelup') {
    const flashA = frame === 0 ? 200 : 100;
    fillRect(buf, S, cx - 6, cy - 1, 12, 24, hexToRGBA('#ffffff', flashA));
    fillCircle(buf, S, cx, cy + 1, 3, hexToRGBA(visorHex, 240));
  }

  // hit: 透明化が崩れて実体が見える
  if (state === 'hit') {
    fillRect(buf, S, cx - 3, cy + 2, 6, 18, hexToRGBA(bodyHex, 200));
    drawCircleOutline(buf, S, cx, cy + 10, 8, hexToRGBA('#ff4444', 180));
  }

  // アウトライン（実体化時のみ）
  if (baseAlpha > 100) {
    hLine(buf, S, cx - 3, cy, 6, hexToRGBA('#000000', baseAlpha / 2));
    hLine(buf, S, cx - 3, cy + 20, 6, hexToRGBA('#000000', baseAlpha / 2));
  }
}

// ---------------------------------------------------------------------------
// 4. shield_knight（シールドナイト）
// ---------------------------------------------------------------------------
// 重装甲の騎士型メカ。巨大な盾を構え、槍で突く。
// ---------------------------------------------------------------------------

function drawShieldKnight(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別色（明るい）
  const BODY_COLORS   = ['#ddbb66', '#cccccc', '#5599cc', '#aa77ee'];
  const SHIELD_COLORS = ['#ffdd88', '#eeeeee', '#88ccff', '#cc99ff'];
  const LANCE_COLORS  = ['#aaddff', '#bbddff', '#00ccff', '#cc88ff'];
  const VISOR_COLORS  = ['#00ffff', '#88ffff', '#00eeff', '#ffaaff'];

  const bodyHex   = BODY_COLORS[lv]   ?? BODY_COLORS[0];
  const shieldHex = SHIELD_COLORS[lv] ?? SHIELD_COLORS[0];
  const lanceHex  = LANCE_COLORS[lv]  ?? LANCE_COLORS[0];
  const visorHex  = VISOR_COLORS[lv]  ?? VISOR_COLORS[0];

  const body   = hexToRGBA(bodyHex);
  const shield = hexToRGBA(shieldHex);
  const lance  = hexToRGBA(lanceHex);
  const visor  = hexToRGBA(visorHex);

  const dOff = dirOffset(dir);
  const cx = 16;
  // 重い歩行: frame0=重心左, frame1=重心右
  const swayX = state === 'move' ? (frame === 0 ? -1 : 1) : 0;
  const bounceY = state === 'move' ? 1 : 0;

  const isDead = state === 'dead';

  if (isDead && frame === 2) {
    // フルアーマーが崩れる
    fillRect(buf, S, cx - 8, 14, 16, 14, hexToRGBA('#888866', 120));
    fillCircle(buf, S, cx, 22, 8, hexToRGBA('#cc9944', 100));
    return;
  }

  const bx = cx + swayX + (isDead ? frame * 4 : 0);
  const by = 4 + bounceY + (isDead ? frame * 2 : 0);

  const bodyColor = state === 'hit' ? hexToRGBA('#bb9944') : body;
  const isAttack  = state === 'attack';
  const isHit     = state === 'hit';

  // -- 頭部（バイザー付き）--
  const headTop = by;
  fillRect(buf, S, bx - 4, headTop, 8, 7, bodyColor);
  // バイザー
  fillRect(buf, S, bx - 3, headTop + 2, 6, 3, visor);
  hLine(buf, S, bx - 4, headTop, 8, hexToRGBA('#eecc88'));
  // バイザーアウトライン
  hLine(buf, S, bx - 4, headTop, 8, BLACK);
  vLine(buf, S, bx - 4, headTop, 7, BLACK);
  vLine(buf, S, bx + 3, headTop, 7, BLACK);

  // -- 胴体（がっしり）--
  const bodyTop = by + 7;
  fillRect(buf, S, bx - 7, bodyTop, 14, 14, bodyColor);
  hLine(buf, S, bx - 7, bodyTop, 14, hexToRGBA('#eecc88'));
  vLine(buf, S, bx - 7, bodyTop, 14, hexToRGBA('#eecc88'));
  vLine(buf, S, bx + 6, bodyTop, 14, hexToRGBA(bodyHex, 180));
  hLine(buf, S, bx - 7, bodyTop + 13, 14, BLACK);
  hLine(buf, S, bx - 7, bodyTop, 14, BLACK);
  vLine(buf, S, bx - 7, bodyTop, 14, BLACK);
  vLine(buf, S, bx + 6, bodyTop, 14, BLACK);

  // 胸の紋章（down方向）
  if (dir === 'down') {
    fillRect(buf, S, bx - 3, bodyTop + 3, 6, 6, hexToRGBA(shieldHex, 180));
    setPixel(buf, S, bx, bodyTop + 3, hexToRGBA('#ffffff'));
    setPixel(buf, S, bx, bodyTop + 8, hexToRGBA('#ffffff'));
    setPixel(buf, S, bx - 3, bodyTop + 5, hexToRGBA('#ffffff'));
    setPixel(buf, S, bx + 2, bodyTop + 5, hexToRGBA('#ffffff'));
  }

  // -- 分厚い装甲足 --
  if (!isDead) {
    const legOff0 = state === 'move' && frame === 0 ? -1 : 0;
    const legOff1 = state === 'move' && frame === 0 ? 1  : 0;
    fillRect(buf, S, bx - 6, bodyTop + 14, 4, 6 + legOff0, hexToRGBA(bodyHex));
    fillRect(buf, S, bx + 2, bodyTop + 14, 4, 6 + legOff1, hexToRGBA(bodyHex));
    fillRect(buf, S, bx - 7, bodyTop + 19 + legOff0, 5, 2, hexToRGBA(bodyHex));
    fillRect(buf, S, bx + 2, bodyTop + 19 + legOff1, 5, 2, hexToRGBA(bodyHex));
  } else {
    if (frame === 0) {
      fillRect(buf, S, bx - 6, bodyTop + 14, 4, 4, hexToRGBA(bodyHex));
      fillRect(buf, S, bx + 2, bodyTop + 14, 4, 8, hexToRGBA(bodyHex));
    } else {
      fillRect(buf, S, bx - 6, bodyTop + 16, 14, 4, hexToRGBA(bodyHex));
    }
  }

  if (isDead) return;

  // -- 盾と槍の配置（方向別）--
  const attackPush = isAttack && frame === 1 ? 4 : 0;
  const lanceGlow  = isAttack && frame === 1 ? hexToRGBA('#ffffff') : lance;
  // 盾が光る（hit時）
  const shieldColor = isHit ? hexToRGBA('#ffffff') : shield;

  if (dir === 'down') {
    // 盾: 左前
    const sX = bx - 13;
    const sY = bodyTop;
    fillRect(buf, S, sX, sY, 7, 12, shieldColor);
    hLine(buf, S, sX, sY, 7, BLACK);
    hLine(buf, S, sX, sY + 12, 7, BLACK);
    vLine(buf, S, sX, sY, 13, BLACK);
    vLine(buf, S, sX + 6, sY, 13, BLACK);
    // 盾の文様
    setPixel(buf, S, sX + 3, sY + 3, visor);
    setPixel(buf, S, sX + 3, sY + 9, visor);
    // hit: 盾が光る
    if (isHit) {
      fillRect(buf, S, sX, sY, 7, 12, hexToRGBA('#aaddff', 120));
    }
    // 槍: 右後ろ（下方向に突き出す）
    fillRect(buf, S, bx + 7, bodyTop + 2, 2, 8 + attackPush, lance);
    setPixel(buf, S, bx + 7, bodyTop + 10 + attackPush, lanceGlow.r > 200 ? lanceGlow : lanceGlow);
    vLine(buf, S, bx + 8, bodyTop + 10 + attackPush, 3, lanceGlow);
    if (isAttack && frame === 1) {
      fillCircle(buf, S, bx + 8, bodyTop + 14, 3, hexToRGBA(lanceHex, 220));
    }

  } else if (dir === 'up') {
    // 背面: 装甲背面 + マント
    fillRect(buf, S, bx - 7, bodyTop, 14, 14, hexToRGBA(bodyHex, 180));
    // マント
    fillRect(buf, S, bx - 5, bodyTop + 6, 10, 8, hexToRGBA('#886644', 160));
    // 盾と槍は後ろ側（暗め）
    fillRect(buf, S, bx - 12, bodyTop + 2, 6, 10, hexToRGBA(shieldHex, 160));
    fillRect(buf, S, bx + 7,  bodyTop + 2, 2, 7,  hexToRGBA(lanceHex,  160));

  } else if (dir === 'left') {
    // 盾が前面全面（左）
    const sX = bx - 14 - attackPush;
    const sY = bodyTop - 1;
    fillRect(buf, S, sX, sY, 8, 14, shieldColor);
    hLine(buf, S, sX, sY, 8, BLACK);
    hLine(buf, S, sX, sY + 14, 8, BLACK);
    vLine(buf, S, sX, sY, 15, BLACK);
    vLine(buf, S, sX + 7, sY, 15, BLACK);
    if (isHit) {
      fillRect(buf, S, sX, sY, 8, 14, hexToRGBA('#aaddff', 120));
    }
    // 槍（後ろ）
    fillRect(buf, S, bx + 6, bodyTop + 3, 2, 7, lance);

  } else {
    // right: 槍が前に突き出す
    const lX = bx + 8 + attackPush;
    fillRect(buf, S, lX, bodyTop + 3, 8, 2, lance);
    vLine(buf, S, lX + 7, bodyTop + 2, 4, lanceGlow);
    if (isAttack && frame === 1) {
      fillCircle(buf, S, lX + 9, bodyTop + 4, 3, hexToRGBA(lanceHex, 220));
    }
    // 盾（後ろ左）
    fillRect(buf, S, bx - 13, bodyTop, 6, 12, hexToRGBA(shieldHex, 180));
  }

  // levelup: 盾と槍が輝く
  if (state === 'levelup') {
    const alpha = frame === 0 ? 180 : 90;
    drawCircleOutline(buf, S, bx, bodyTop + 6, 12, hexToRGBA('#ffeeaa', alpha));
    fillRect(buf, S, bx - 7, bodyTop, 14, 14, hexToRGBA('#ffffcc', alpha / 2));
  }
}

// ---------------------------------------------------------------------------
// 5. healer_drone（ヒーラードローン）
// ---------------------------------------------------------------------------
// 医療支援ドローン。十字マークの丸いボディ。修復ビームで仲間を回復。
// ---------------------------------------------------------------------------

function drawHealerDrone(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別色（明るい）
  const BODY_COLORS   = ['#ff8888', '#ffaa44', '#ffee44', '#ffffff'];
  const PROP_COLORS   = ['#ff6666', '#ee8833', '#ddcc22', '#dddddd'];
  const CROSS_COLORS  = ['#ffffff', '#ffffff', '#ffffff', '#ffff88'];
  const NOZZLE_COLORS = ['#44ffff', '#55ffaa', '#99ff44', '#aaffff'];

  const bodyHex   = BODY_COLORS[lv]   ?? BODY_COLORS[0];
  const propHex   = PROP_COLORS[lv]   ?? PROP_COLORS[0];
  const crossHex  = CROSS_COLORS[lv]  ?? CROSS_COLORS[0];
  const nozzleHex = NOZZLE_COLORS[lv] ?? NOZZLE_COLORS[0];

  const body   = hexToRGBA(bodyHex);
  const prop   = hexToRGBA(propHex);
  const cross  = hexToRGBA(crossHex);
  const nozzle = hexToRGBA(nozzleHex);

  const dOff = dirOffset(dir);
  const cx = 16;
  // move: プロペラ + 上下バウンド
  const bounceY = state === 'move' && frame === 1 ? -1 : 0;
  const cy = 14 + bounceY;

  const isDead = state === 'dead';

  if (isDead && frame === 2) {
    // 着地 + 煙
    fillCircle(buf, S, cx, 20, 5, hexToRGBA('#888888', 160));
    fillCircle(buf, S, cx, 18, 3, hexToRGBA('#aaaaaa', 120));
    fillRect(buf, S, cx - 4, 22, 8, 2, hexToRGBA('#555544', 200));
    return;
  }

  const fallY = isDead ? (frame === 0 ? 2 : 6) : 0;
  const tiltX = isDead ? (frame === 0 ? 1 : 3) : 0;
  const bx = cx + tiltX;
  const by = cy + fallY;

  // -- プロペラ（上部、回転アニメ）--
  // frame0/1でプロペラ角度変化
  const propAngle = state === 'move' && frame === 1 ? 1 : 0;
  if (propAngle === 0) {
    hLine(buf, S, bx - 7, by - 9, 14, prop);
    hLine(buf, S, bx - 6, by - 10, 12, hexToRGBA(propHex, 180));
  } else {
    vLine(buf, S, bx, by - 15, 12, prop);
    // 交差方向にも
    hLine(buf, S, bx - 5, by - 10, 10, hexToRGBA(propHex, 120));
  }
  // プロペラ軸
  fillCircle(buf, S, bx, by - 9, 2, hexToRGBA('#888888'));

  // -- 丸いボディ（直径16px = 半径8）--
  const bodyColor = state === 'hit' ? hexToRGBA('#ff4444') : body;
  fillCircle(buf, S, bx, by, 8, bodyColor);
  // ハイライト
  fillCircle(buf, S, bx - 2, by - 3, 2, hexToRGBA('#ffffff', 180));
  drawCircleOutline(buf, S, bx, by, 8, BLACK);

  // -- 十字マーク（上部中央）--
  // hit時: 十字が赤くなる
  const crossColor = state === 'hit' && frame === 1 ? hexToRGBA('#ff0000') : cross;
  hLine(buf, S, bx - 3, by - 2, 7, crossColor);
  vLine(buf, S, bx, by - 4, 5, crossColor);

  // -- 4本のアーム + ノズル --
  // 方向に応じてノズルの光り方を変える
  const armDirs: Array<{ax: number; ay: number}> = [
    { ax: -9, ay: -4 },
    { ax:  8, ay: -4 },
    { ax: -9, ay:  4 },
    { ax:  8, ay:  4 },
  ];

  for (const { ax, ay } of armDirs) {
    const armEndX = bx + ax;
    const armEndY = by + ay;
    drawLine(buf, S, bx + (ax > 0 ? 7 : -7), by + (ay > 0 ? 4 : -4) + (ay > 0 ? 2 : 0),
             armEndX, armEndY, hexToRGBA('#ffaaaa'));
    // ノズル
    fillCircle(buf, S, armEndX, armEndY, 2, nozzle);
  }

  // -- attack（修復ビーム）--
  if (state === 'attack') {
    // ビーム方向: 攻撃対象方向
    const beamStartX = bx + dOff.dx * 10;
    const beamStartY = by + dOff.dy * 8;
    if (frame === 0) {
      // ノズルが光る
      fillCircle(buf, S, beamStartX, beamStartY, 4, hexToRGBA(nozzleHex, 200));
    } else if (frame === 1) {
      // 緑ビームが伸びる
      for (let i = 1; i <= 8; i++) {
        const bpx = beamStartX + dOff.dx * i;
        const bpy = beamStartY + dOff.dy * i;
        setPixel(buf, S, bpx, bpy, hexToRGBA('#44ff88'));
        setPixel(buf, S, bpx + dOff.dy, bpy + dOff.dx, hexToRGBA('#44ff88', 180));
        setPixel(buf, S, bpx - dOff.dy, bpy - dOff.dx, hexToRGBA('#44ff88', 180));
      }
    } else {
      // 回復エフェクト（緑星）
      const tipX = beamStartX + dOff.dx * 8;
      const tipY = beamStartY + dOff.dy * 8;
      fillCircle(buf, S, tipX, tipY, 3, hexToRGBA('#88ff88', 180));
      // キラキラ
      setPixel(buf, S, tipX - 2, tipY - 2, hexToRGBA('#ffffff'));
      setPixel(buf, S, tipX + 2, tipY - 2, hexToRGBA('#ffffff'));
      setPixel(buf, S, tipX,     tipY - 4, hexToRGBA('#ffffff'));
      setPixel(buf, S, tipX - 4, tipY,     hexToRGBA('#ffffff'));
      setPixel(buf, S, tipX + 4, tipY,     hexToRGBA('#ffffff'));
    }
  }

  // levelup: 十字が緑に輝く
  if (state === 'levelup') {
    const greenC = hexToRGBA('#44ff88', frame === 0 ? 220 : 120);
    hLine(buf, S, bx - 3, by - 2, 7, greenC);
    vLine(buf, S, bx, by - 4, 5, greenC);
    drawCircleOutline(buf, S, bx, by, 10, hexToRGBA('#44ff88', 180));
    // Lv4: ノズルが2倍（より大きく光る）
    if (lv >= 3) {
      for (const { ax, ay } of armDirs) {
        fillCircle(buf, S, bx + ax, by + ay, 3, greenC);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 【B】既存敵の高Lvバリアント（Lv3/Lv4）
// ---------------------------------------------------------------------------
// Lv3: 明るい青（#4488ff系）
// Lv4: 明るいオレンジ（#ff8844系）
// ---------------------------------------------------------------------------

// scout_drone Lv3（明るい青、眼が輝くシアン）
function drawScoutDroneLv3(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  const bodyColor = hexToRGBA('#4488ff');
  const hi        = hexToRGBA('#88aaff');
  const propColor = hexToRGBA('#2255cc');
  const dOff      = dirOffset(dir);

  const bounceY   = state === 'move' && frame === 1 ? -1 : 0;
  const deadTiltX = state === 'dead' ? (frame === 0 ? 2 : frame === 1 ? 4 : 6) : 0;
  const deadTiltY = state === 'dead' ? (frame === 0 ? 1 : frame === 1 ? 3 : 5) : 0;
  const cx = 16;
  const cy = 15 + bounceY + deadTiltY;

  if (state === 'dead' && frame === 2) {
    fillCircle(buf, S, cx + deadTiltX, cy, 8, hexToRGBA('#4488ff', 120));
    fillCircle(buf, S, cx + deadTiltX, cy, 5, hexToRGBA('#aaccff', 180));
    return;
  }
  if (state === 'dead' && frame === 1) {
    setPixel(buf, S, cx + deadTiltX, cy - 10, hexToRGBA('#8888ff', 160));
    setPixel(buf, S, cx + deadTiltX - 1, cy - 11, hexToRGBA('#aaaaff', 140));
  }

  // アンテナ
  vLine(buf, S, cx + deadTiltX - 4, cy - 8, 3, hi);
  vLine(buf, S, cx + deadTiltX + 3, cy - 8, 3, hi);
  setPixel(buf, S, cx + deadTiltX - 4, cy - 9, hi);
  setPixel(buf, S, cx + deadTiltX + 3, cy - 9, hi);

  // プロペラ
  const wingY = cy + (state === 'move' && frame === 1 ? -3 : -1);
  fillRect(buf, S, cx + deadTiltX - 11, wingY, 4, 2, propColor);
  fillRect(buf, S, cx + deadTiltX + 7,  wingY, 4, 2, propColor);

  // ボディ
  const bc = state === 'hit' ? hexToRGBA('#2244cc') : bodyColor;
  fillCircle(buf, S, cx + deadTiltX, cy, 7, bc);
  fillCircle(buf, S, cx + deadTiltX - 2, cy - 3, 2, hi);

  if (state === 'levelup') {
    const fa = frame === 0 ? 180 : 100;
    fillCircle(buf, S, cx + deadTiltX, cy, 7, hexToRGBA('#ccddff', fa));
    drawCircleOutline(buf, S, cx + deadTiltX, cy, 9, hexToRGBA('#88aaff', 150));
  }

  drawCircleOutline(buf, S, cx + deadTiltX, cy, 7, BLACK);

  // カメラ眼（シアン）
  const eyeX = cx + deadTiltX + dOff.dx * 4;
  const eyeY = cy + dOff.dy * 4;
  const eyeColor = state === 'hit' ? hexToRGBA('#ff4444') : hexToRGBA('#00ffff');
  fillCircle(buf, S, eyeX, eyeY, 2, eyeColor);
  setPixel(buf, S, eyeX, eyeY, BLACK);
  // 2つ目の眼（輝く）
  let eye2X: number, eye2Y: number;
  if (dir === 'down' || dir === 'up') {
    eye2X = cx + deadTiltX + 3;
    eye2Y = cy + dOff.dy * 2;
  } else {
    eye2X = cx + deadTiltX + dOff.dx * 2;
    eye2Y = cy + 3;
  }
  fillCircle(buf, S, eye2X, eye2Y, 2, eyeColor);
  setPixel(buf, S, eye2X, eye2Y, BLACK);

  if (state === 'attack') {
    const beamLen = frame === 0 ? 4 : frame === 1 ? 8 : 0;
    if (frame === 2) {
      fillCircle(buf, S, eyeX, eyeY, 4, hexToRGBA('#ffffff', 200));
    } else {
      for (let i = 1; i <= beamLen; i++) {
        setPixel(buf, S, eyeX + dOff.dx * i, eyeY + dOff.dy * i, hexToRGBA('#00ffff'));
      }
    }
  }
}

// mine_beetle Lv3（明るい青甲羅、爆弾ランプ3個）
function drawMineBeetleLv3(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  const shellColor = state === 'hit' ? hexToRGBA('#2244aa') : hexToRGBA('#4488ff');
  const hiColor    = hexToRGBA('#88aaff');
  const legColor   = hexToRGBA('#224488');
  const lampColor  = state === 'hit' ? hexToRGBA('#4466cc') :
                     state === 'attack' && frame === 1 ? hexToRGBA('#ffff44') :
                     state === 'levelup' ? hexToRGBA('#ffffff') :
                     hexToRGBA('#4499ff');
  const dOff = dirOffset(dir);
  const bounceY = state === 'move' && frame === 1 ? 1 : 0;
  const cx = 16;
  const cy = 18 + bounceY;

  if (state === 'dead' && frame === 2) {
    fillCircle(buf, S, cx, cy, 10, hexToRGBA('#4488ff', 180));
    fillCircle(buf, S, cx, cy, 6,  hexToRGBA('#aaccff', 220));
    fillCircle(buf, S, cx, cy, 3,  hexToRGBA('#ffffff', 240));
    return;
  }

  const sc = state === 'dead' && frame === 1 ? hexToRGBA('#224466') : shellColor;

  if (dir === 'down') {
    fillEllipse(buf, S, cx, cy, 9, 6, sc);
    fillRect(buf, S, cx - 5, cy - 3, 10, 3, hiColor);
    for (let i = 0; i < 3; i++) {
      const legX1 = cx - 9; const legX2 = cx + 9;
      const legBaseY = cy - 2 + i * 2;
      const legDown = state === 'move' ? (frame === i % 2 ? 2 : 0) : 0;
      drawLine(buf, S, cx - 2, legBaseY, legX1, legBaseY + 3 + legDown, legColor);
      drawLine(buf, S, cx + 2, legBaseY, legX2, legBaseY + 3 + legDown, legColor);
    }
    // 3個のランプ
    for (const lx of [cx - 3, cx, cx + 3]) {
      fillCircle(buf, S, lx, cy - 5, 2, lampColor);
    }
  } else if (dir === 'up') {
    fillEllipse(buf, S, cx, cy, 9, 6, sc);
    for (let i = 0; i < 3; i++) {
      const legBaseY = cy - 2 + i * 2;
      const legDown = state === 'move' ? (frame === i % 2 ? 2 : 0) : 0;
      drawLine(buf, S, cx - 2, legBaseY, cx - 9, legBaseY + 3 + legDown, legColor);
      drawLine(buf, S, cx + 2, legBaseY, cx + 9, legBaseY + 3 + legDown, legColor);
    }
    for (const lx of [cx - 3, cx, cx + 3]) {
      fillCircle(buf, S, lx, cy + 4, 2, lampColor);
    }
  } else {
    const facingRight = dir === 'right';
    const bx = facingRight ? cx - 11 : cx - 11;
    fillEllipse(buf, S, cx, cy, 11, 5, sc);
    hLine(buf, S, cx - 10, cy - 4, 20, hiColor);
    for (let i = 0; i < 3; i++) {
      const legBaseX = bx + i * 7 + 3;
      const legDown = state === 'move' ? (frame === i % 2 ? 2 : 0) : 0;
      vLine(buf, S, legBaseX, cy + 4, 4 + legDown, legColor);
      setPixel(buf, S, legBaseX - 1, cy + 7 + legDown, legColor);
      setPixel(buf, S, legBaseX + 1, cy + 7 + legDown, legColor);
    }
    // 3個ランプ（上）
    for (let i = 0; i < 3; i++) {
      fillCircle(buf, S, cx - 6 + i * 6, cy - 5, 2, lampColor);
    }
    // 頭部（前進方向）
    const headX = facingRight ? cx + 11 : cx - 11;
    fillCircle(buf, S, headX, cy, 4, sc);
  }

  // attack
  if (state === 'attack') {
    const expX = cx + dOff.dx * (frame === 1 ? 12 : 8);
    const expY = cy + dOff.dy * (frame === 1 ? 12 : 8);
    fillCircle(buf, S, expX, expY, 3 + frame, hexToRGBA('#ffff44', 200));
  }
}

// guard_bot Lv3（明るいシアン、肩装甲板追加）
function drawGuardBotLv3(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  const bodyColor   = state === 'hit' ? hexToRGBA('#2299aa') : hexToRGBA('#44ccdd');
  const hiColor     = hexToRGBA('#88eeff');
  const shColor     = hexToRGBA('#2288aa');
  const shieldColor = state === 'hit' ? hexToRGBA('#aaccff') : hexToRGBA('#99eeff');
  const batonColor  = hexToRGBA('#ffdd44');
  const armorColor  = hexToRGBA('#66bbcc');
  const dOff        = dirOffset(dir);

  const bounceY = state === 'move' && frame === 1 ? 1 : 0;
  const isDead  = state === 'dead';
  const deadTiltX = isDead ? frame * 3 : 0;
  const deadTiltY = isDead ? frame * 2 : 0;
  const cx = 16 + deadTiltX;
  const headTop = 6 + bounceY + deadTiltY;
  const bodyTop = 13 + bounceY + deadTiltY;
  const legTop  = bodyTop + 12;

  // 頭部
  fillRect(buf, S, cx - 4, headTop, 8, 7, bodyColor);
  hLine(buf, S, cx - 4, headTop, 8, hiColor);

  // 目
  const eyeColor = state === 'dead' ? hexToRGBA('#223344') :
                   state === 'hit'  ? hexToRGBA('#ff4400') :
                   hexToRGBA('#00ffff');
  if (dir === 'down') {
    setPixel(buf, S, cx - 2, headTop + 3, eyeColor);
    setPixel(buf, S, cx + 1, headTop + 3, eyeColor);
    setPixel(buf, S, cx - 2, headTop + 2, hexToRGBA('#44ffff', 180));
    setPixel(buf, S, cx + 1, headTop + 2, hexToRGBA('#44ffff', 180));
  } else if (dir === 'up') {
    setPixel(buf, S, cx - 2, headTop + 3, hexToRGBA('#225566'));
    setPixel(buf, S, cx + 1, headTop + 3, hexToRGBA('#225566'));
  } else if (dir === 'left') {
    setPixel(buf, S, cx - 3, headTop + 3, eyeColor);
  } else {
    setPixel(buf, S, cx + 2, headTop + 3, eyeColor);
  }

  // 胴体
  fillRect(buf, S, cx - 6, bodyTop, 12, 12, bodyColor);
  hLine(buf, S, cx - 6, bodyTop, 12, hiColor);
  vLine(buf, S, cx - 6, bodyTop, 12, hiColor);
  vLine(buf, S, cx + 5, bodyTop, 12, shColor);
  hLine(buf, S, cx - 6, bodyTop + 11, 12, shColor);

  // 肩装甲板（Lv3追加）
  fillRect(buf, S, cx - 9, bodyTop, 4, 5, armorColor);
  fillRect(buf, S, cx + 5, bodyTop, 4, 5, armorColor);
  fillRect(buf, S, cx - 4, bodyTop + 2, 8, 3, armorColor);

  // アウトライン
  hLine(buf, S, cx - 6, bodyTop, 12, BLACK);
  hLine(buf, S, cx - 6, bodyTop + 12, 12, BLACK);
  vLine(buf, S, cx - 6, bodyTop, 13, BLACK);
  vLine(buf, S, cx + 5, bodyTop, 13, BLACK);
  hLine(buf, S, cx - 4, headTop, 8, BLACK);
  vLine(buf, S, cx - 4, headTop, 7, BLACK);
  vLine(buf, S, cx + 3, headTop, 7, BLACK);

  // 脚
  if (!isDead) {
    const legOff0 = state === 'move' && frame === 0 ? -2 : 0;
    const legOff1 = state === 'move' && frame === 0 ? 2  : 0;
    fillRect(buf, S, cx - 5, legTop, 3, 5 + legOff0, shColor);
    fillRect(buf, S, cx + 2, legTop, 3, 5 + legOff1, shColor);
    fillRect(buf, S, cx - 6, legTop + 4 + legOff0, 4, 2, hexToRGBA('#224455'));
    fillRect(buf, S, cx + 2, legTop + 4 + legOff1, 4, 2, hexToRGBA('#224455'));
  }

  // 盾と武器
  if (!isDead) {
    const isAttack  = state === 'attack';
    const attackPush = isAttack && frame === 1 ? 4 : 0;
    const isHitShield = state === 'hit';

    if (dir === 'down') {
      fillRect(buf, S, cx - 11, bodyTop + 1, 6, 9, isHitShield ? hexToRGBA('#aaccff') : shieldColor);
      hLine(buf, S, cx - 11, bodyTop + 1, 6, BLACK);
      hLine(buf, S, cx - 11, bodyTop + 10, 6, BLACK);
      vLine(buf, S, cx - 11, bodyTop + 1, 10, BLACK);
      vLine(buf, S, cx - 5,  bodyTop + 1, 10, BLACK);
      fillRect(buf, S, cx + 6, bodyTop + 2, 2, 7 + attackPush, batonColor);
      hLine(buf, S, cx + 5, bodyTop + 6 + attackPush, 4, BLACK);
      if (isAttack) {
        const boltC = hexToRGBA('#44ffff', 220);
        setPixel(buf, S, cx + 7, bodyTop + 2 + attackPush, boltC);
        setPixel(buf, S, cx + 6, bodyTop + 1 + attackPush, boltC);
        setPixel(buf, S, cx + 8, bodyTop + 1 + attackPush, boltC);
      }
    } else if (dir === 'up') {
      fillRect(buf, S, cx - 9, bodyTop + 2, 6, 9, hexToRGBA('#336677'));
      fillRect(buf, S, cx + 5, bodyTop + 2, 2, 6, hexToRGBA('#aa8822'));
    } else if (dir === 'left') {
      fillRect(buf, S, cx - 11 - attackPush, bodyTop + 1, 6, 9, isHitShield ? hexToRGBA('#aaccff') : shieldColor);
      hLine(buf, S, cx - 11 - attackPush, bodyTop + 1, 6, BLACK);
      hLine(buf, S, cx - 11 - attackPush, bodyTop + 10, 6, BLACK);
      vLine(buf, S, cx - 11 - attackPush, bodyTop + 1, 10, BLACK);
      vLine(buf, S, cx - 5 - attackPush, bodyTop + 1, 10, BLACK);
      fillRect(buf, S, cx + 5, bodyTop + 3, 2, 6, batonColor);
    } else {
      fillRect(buf, S, cx - 8, bodyTop + 2, 6, 9, hexToRGBA('#336677'));
      const bX = cx + 6 + attackPush;
      fillRect(buf, S, bX, bodyTop + 2, 2, 7, batonColor);
      hLine(buf, S, bX - 1, bodyTop + 2 + attackPush, 4, BLACK);
      if (isAttack) {
        const boltC = hexToRGBA('#44ffff', 220);
        setPixel(buf, S, bX + 1, bodyTop + 1, boltC);
        setPixel(buf, S, bX,     bodyTop,     boltC);
        setPixel(buf, S, bX + 2, bodyTop,     boltC);
      }
    }
  }

  if (state === 'levelup') {
    const alpha = frame === 0 ? 180 : 90;
    fillRect(buf, S, cx - 6, headTop, 12, 19, hexToRGBA('#aaffff', alpha));
    drawCircleOutline(buf, S, cx, headTop + 9, 10, hexToRGBA('#ffffff', 180));
  }

  if (isDead && frame === 2) {
    fillCircle(buf, S, cx, bodyTop + 6, 10, hexToRGBA('#44ccdd', 120));
  }
}

// guard_bot Lv4（明るいオレンジ、重装甲）
function drawGuardBotLv4(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  const bodyColor   = state === 'hit' ? hexToRGBA('#cc5500') : hexToRGBA('#ff8844');
  const hiColor     = hexToRGBA('#ffcc88');
  const shColor     = hexToRGBA('#cc5522');
  const shieldColor = state === 'hit' ? hexToRGBA('#ffccaa') : hexToRGBA('#ffcc66');
  const batonColor  = hexToRGBA('#ffee44');
  const armorColor  = hexToRGBA('#ee7733');
  const dOff        = dirOffset(dir);

  const bounceY = state === 'move' && frame === 1 ? 1 : 0;
  const isDead  = state === 'dead';
  const deadTiltX = isDead ? frame * 3 : 0;
  const deadTiltY = isDead ? frame * 2 : 0;
  const cx = 16 + deadTiltX;
  const headTop = 6 + bounceY + deadTiltY;
  const bodyTop = 13 + bounceY + deadTiltY;
  const legTop  = bodyTop + 12;

  // 頭部
  fillRect(buf, S, cx - 4, headTop, 8, 7, bodyColor);
  hLine(buf, S, cx - 4, headTop, 8, hiColor);

  const eyeColor = state === 'dead' ? hexToRGBA('#443311') :
                   state === 'hit'  ? hexToRGBA('#ff2200') :
                   hexToRGBA('#ffdd44');
  if (dir === 'down') {
    setPixel(buf, S, cx - 2, headTop + 3, eyeColor);
    setPixel(buf, S, cx + 1, headTop + 3, eyeColor);
    setPixel(buf, S, cx - 2, headTop + 2, hexToRGBA('#ffee88', 180));
    setPixel(buf, S, cx + 1, headTop + 2, hexToRGBA('#ffee88', 180));
  } else if (dir === 'up') {
    setPixel(buf, S, cx - 2, headTop + 3, hexToRGBA('#552211'));
    setPixel(buf, S, cx + 1, headTop + 3, hexToRGBA('#552211'));
  } else if (dir === 'left') {
    setPixel(buf, S, cx - 3, headTop + 3, eyeColor);
  } else {
    setPixel(buf, S, cx + 2, headTop + 3, eyeColor);
  }

  // 胴体
  fillRect(buf, S, cx - 6, bodyTop, 12, 12, bodyColor);
  hLine(buf, S, cx - 6, bodyTop, 12, hiColor);
  vLine(buf, S, cx - 6, bodyTop, 12, hiColor);
  vLine(buf, S, cx + 5, bodyTop, 12, shColor);
  hLine(buf, S, cx - 6, bodyTop + 11, 12, shColor);

  // 重装甲（Lv4: より大きな肩当て）
  fillRect(buf, S, cx - 10, bodyTop - 1, 5, 6, armorColor);
  fillRect(buf, S, cx + 5,  bodyTop - 1, 5, 6, armorColor);
  fillRect(buf, S, cx - 5,  bodyTop + 2, 10, 4, armorColor);

  // アウトライン
  hLine(buf, S, cx - 6, bodyTop, 12, BLACK);
  hLine(buf, S, cx - 6, bodyTop + 12, 12, BLACK);
  vLine(buf, S, cx - 6, bodyTop, 13, BLACK);
  vLine(buf, S, cx + 5, bodyTop, 13, BLACK);
  hLine(buf, S, cx - 4, headTop, 8, BLACK);
  vLine(buf, S, cx - 4, headTop, 7, BLACK);
  vLine(buf, S, cx + 3, headTop, 7, BLACK);

  if (!isDead) {
    const legOff0 = state === 'move' && frame === 0 ? -2 : 0;
    const legOff1 = state === 'move' && frame === 0 ? 2  : 0;
    fillRect(buf, S, cx - 5, legTop, 3, 5 + legOff0, shColor);
    fillRect(buf, S, cx + 2, legTop, 3, 5 + legOff1, shColor);
    fillRect(buf, S, cx - 6, legTop + 4 + legOff0, 4, 2, hexToRGBA('#aa3311'));
    fillRect(buf, S, cx + 2, legTop + 4 + legOff1, 4, 2, hexToRGBA('#aa3311'));
  }

  if (!isDead) {
    const isAttack   = state === 'attack';
    const attackPush = isAttack && frame === 1 ? 4 : 0;
    const isHitShield = state === 'hit';

    if (dir === 'down') {
      fillRect(buf, S, cx - 12, bodyTop + 1, 7, 10, isHitShield ? hexToRGBA('#ffddcc') : shieldColor);
      vLine(buf, S, cx - 12, bodyTop + 1, 11, BLACK);
      hLine(buf, S, cx - 12, bodyTop + 1, 7, BLACK);
      hLine(buf, S, cx - 12, bodyTop + 11, 7, BLACK);
      fillRect(buf, S, cx + 6, bodyTop + 2, 2, 7 + attackPush, batonColor);
      hLine(buf, S, cx + 5, bodyTop + 6 + attackPush, 4, BLACK);
      if (isAttack) {
        const boltC = hexToRGBA('#ffee44', 220);
        setPixel(buf, S, cx + 7, bodyTop + 2 + attackPush, boltC);
        setPixel(buf, S, cx + 6, bodyTop + 1 + attackPush, boltC);
        setPixel(buf, S, cx + 8, bodyTop + 1 + attackPush, boltC);
      }
    } else if (dir === 'up') {
      fillRect(buf, S, cx - 9, bodyTop + 2, 7, 10, hexToRGBA('#884422'));
      fillRect(buf, S, cx + 5, bodyTop + 2, 2, 6,  hexToRGBA('#cc9922'));
    } else if (dir === 'left') {
      fillRect(buf, S, cx - 12 - attackPush, bodyTop + 1, 7, 10, isHitShield ? hexToRGBA('#ffddcc') : shieldColor);
      vLine(buf, S, cx - 12 - attackPush, bodyTop + 1, 11, BLACK);
      hLine(buf, S, cx - 12 - attackPush, bodyTop + 1, 7, BLACK);
      hLine(buf, S, cx - 12 - attackPush, bodyTop + 11, 7, BLACK);
      fillRect(buf, S, cx + 5, bodyTop + 3, 2, 6, batonColor);
    } else {
      fillRect(buf, S, cx - 9, bodyTop + 2, 7, 10, hexToRGBA('#884422'));
      const bX = cx + 6 + attackPush;
      fillRect(buf, S, bX, bodyTop + 2, 2, 7, batonColor);
      hLine(buf, S, bX - 1, bodyTop + 2 + attackPush, 4, BLACK);
      if (isAttack) {
        const boltC = hexToRGBA('#ffee44', 220);
        setPixel(buf, S, bX + 1, bodyTop + 1, boltC);
        setPixel(buf, S, bX,     bodyTop,     boltC);
        setPixel(buf, S, bX + 2, bodyTop,     boltC);
      }
    }
  }

  if (state === 'levelup') {
    const alpha = frame === 0 ? 180 : 90;
    fillRect(buf, S, cx - 6, headTop, 12, 19, hexToRGBA('#ffddaa', alpha));
    drawCircleOutline(buf, S, cx, headTop + 9, 10, hexToRGBA('#ffaa44', 200));
  }
}

// slime_x Lv3（明るい青ゲル体、X目が輝く）
function drawSlimeXLv3(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  const bodyHex = '#4488ff';
  const hlHex   = '#88aaff';
  const outHex  = '#1144aa';

  const bodyBase = hexToRGBA(bodyHex);
  const hl       = hexToRGBA(hlHex);
  const out      = hexToRGBA(outHex);

  const dOff = dirOffset(dir);

  const stretchX = state === 'move' && frame === 0 ? 2 : 0;
  const stretchY = state === 'move' && frame === 1 ? 2 : 0;

  const cx = 16;
  const cy = 18;
  const rxS = 10 + stretchX;
  const ryS =  7 + stretchY;

  if (state === 'dead') {
    if (frame === 0) {
      fillEllipse(buf, S, cx, cy, rxS, ryS, bodyBase);
      drawLine(buf, S, cx, cy - ryS, cx + 2, cy, BLACK);
      drawLine(buf, S, cx - 3, cy, cx, cy + ryS, BLACK);
    } else if (frame === 1) {
      fillEllipse(buf, S, cx - 5, cy, 5, ryS - 1, hexToRGBA(bodyHex, 200));
      fillEllipse(buf, S, cx + 5, cy, 5, ryS - 1, hexToRGBA(bodyHex, 200));
    } else {
      fillCircle(buf, S, cx - 4, cy, 2, hexToRGBA(bodyHex, 80));
      fillCircle(buf, S, cx + 4, cy, 2, hexToRGBA(bodyHex, 80));
    }
    return;
  }

  const bodyColor = state === 'hit' ? hexToRGBA('#2244cc') : bodyBase;
  fillEllipse(buf, S, cx, cy, rxS, ryS, bodyColor);
  fillCircle(buf, S, cx - Math.floor(rxS / 3), cy - Math.floor(ryS / 2), 2, hl);

  if (state === 'levelup') {
    fillEllipse(buf, S, cx, cy, rxS + 2, ryS + 2, hexToRGBA('#aaccff', frame === 0 ? 160 : 80));
    const spark = hexToRGBA('#00ffff', 220);
    setPixel(buf, S, cx, cy - ryS - 2, spark);
    setPixel(buf, S, cx + rxS + 2, cy, spark);
    setPixel(buf, S, cx - rxS - 2, cy, spark);
    setPixel(buf, S, cx, cy + ryS + 2, spark);
  }

  for (let dy = -ryS; dy <= ryS; dy++) {
    const hw = Math.floor(rxS * Math.sqrt(Math.max(0, 1 - (dy / ryS) ** 2)));
    setPixel(buf, S, cx - hw - 1, cy + dy, out);
    setPixel(buf, S, cx + hw + 1, cy + dy, out);
  }
  for (let dx = -rxS; dx <= rxS; dx++) {
    const hh = Math.floor(ryS * Math.sqrt(Math.max(0, 1 - (dx / rxS) ** 2)));
    setPixel(buf, S, cx + dx, cy - hh - 1, out);
    setPixel(buf, S, cx + dx, cy + hh + 1, out);
  }

  const eyeBaseX = cx + dOff.dx * 3;
  const eyeBaseY = cy + dOff.dy * 2 - 1;
  // X目が輝くシアン
  const eyeColor = state === 'hit' ? hexToRGBA('#ff0000') : hexToRGBA('#00ffff');

  for (const [lx, ly] of [[eyeBaseX - 4, eyeBaseY], [eyeBaseX + 4, eyeBaseY]] as const) {
    setPixel(buf, S, lx - 1, ly - 1, eyeColor);
    setPixel(buf, S, lx,     ly,     eyeColor);
    setPixel(buf, S, lx + 1, ly + 1, eyeColor);
    setPixel(buf, S, lx + 1, ly - 1, eyeColor);
    setPixel(buf, S, lx - 1, ly + 1, eyeColor);
  }

  const footColor = hexToRGBA(bodyHex, 180);
  for (let i = -4; i <= 4; i += 2) {
    fillCircle(buf, S, cx + i, cy + ryS, 2, footColor);
  }

  if (state === 'attack') {
    const pseudoLen = frame === 0 ? 3 : frame === 1 ? 8 : 2;
    const startX = cx + dOff.dx * (rxS + 1);
    const startY = cy + dOff.dy * (ryS + 1);
    for (let i = 1; i <= pseudoLen; i++) {
      fillCircle(buf, S, startX + dOff.dx * i, startY + dOff.dy * i, Math.max(1, 3 - i), hl);
    }
    if (frame === 1) {
      fillCircle(buf, S, startX + dOff.dx * pseudoLen, startY + dOff.dy * pseudoLen, 2, hexToRGBA(hlHex, 220));
    }
  }
}

// rust_hound Lv3（明るいシアン系「強化金属」）
function drawRustHoundLv3(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  const bodyHex = '#44ccdd';
  const sh      = hexToRGBA('#2299aa');
  const eyeColor = state === 'hit' ? hexToRGBA('#ff4400') : hexToRGBA('#00ffff');

  drawRustHoundBase(buf, S, dir, state, frame, bodyHex, sh, eyeColor, false);
}

// rust_hound Lv4（明るいオレンジ系）
function drawRustHoundLv4(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  const bodyHex = '#ff8844';
  const sh      = hexToRGBA('#cc5522');
  const eyeColor = state === 'hit' ? hexToRGBA('#ff0000') : hexToRGBA('#ffdd44');

  drawRustHoundBase(buf, S, dir, state, frame, bodyHex, sh, eyeColor, true);
}

// rust_hound 共通描画ベース
function drawRustHoundBase(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  bodyHex: string,
  sh: RGBA,
  eyeColor: RGBA,
  isLv4: boolean
): void {
  const body = hexToRGBA(bodyHex);
  const rust = hexToRGBA(bodyHex, 180);

  const bounceY = state === 'move' && frame === 1 ? 1 : 0;
  const isDead  = state === 'dead';

  if (isDead && frame === 2) {
    fillCircle(buf, S, 16, 18, 9, hexToRGBA(bodyHex, 120));
    return;
  }

  if (dir === 'down' || dir === 'up') {
    const cx = 16;
    const cy = 15 + bounceY + (isDead ? frame * 3 : 0);

    if (isDead && frame === 1) {
      fillEllipse(buf, S, cx, cy + 4, 9, 4, hexToRGBA(bodyHex, 140));
      return;
    }

    // 胴体
    fillEllipse(buf, S, cx, cy, 8, 6, body);
    hLine(buf, S, cx - 7, cy - 4, 14, hexToRGBA(bodyHex, 180));

    // 頭部
    const headY = dir === 'down' ? cy - 6 : cy + 4;
    fillRect(buf, S, cx - 4, headY - 2, 8, 5, body);
    // 鼻先
    const noseY = dir === 'down' ? headY - 3 : headY + 3;
    fillRect(buf, S, cx - 2, noseY, 4, 2, sh);
    // 目
    const leyX = dir === 'down' ? cy - 8 : cy + 7;
    setPixel(buf, S, cx - 2, leyX, eyeColor);
    setPixel(buf, S, cx + 1, leyX, eyeColor);
    if (state === 'levelup') {
      fillCircle(buf, S, cx, leyX, 2, hexToRGBA('#ffffff', frame === 0 ? 160 : 80));
    }

    // 尾
    const tailLen = 4;
    const tailDir = dir === 'down' ? 1 : -1;
    vLine(buf, S, cx + 5, cy, tailLen * tailDir, sh);

    // 4本脚
    const legPhase = state === 'move' ? frame : 0;
    for (let i = 0; i < 4; i++) {
      const lx = cx - 6 + i * 4;
      const legDown = legPhase === (i % 2) ? 3 : 0;
      vLine(buf, S, lx, cy + 5, 3 + legDown, sh);
    }

    // attack
    if (state === 'attack') {
      const biteLen = frame === 0 ? 2 : frame === 1 ? 5 : 1;
      const biteDir = dir === 'down' ? -1 : 1;
      fillRect(buf, S, cx - 3, headY - 2 + biteDir * biteLen, 6, 3, hexToRGBA(bodyHex));
    }

  } else {
    // 横向き
    const facingRight = dir === 'right';
    const flip = facingRight ? 1 : -1;
    const ox = state === 'move' && frame === 1 ? flip * 1 : 0;
    const oy = bounceY;
    const bx = 5 + (isDead ? frame * 2 : 0);
    const by = 13 + oy;

    if (isDead && frame === 1) {
      fillRect(buf, S, bx + 2, by + 4, 18, 5, hexToRGBA(bodyHex, 140));
      return;
    }

    // 胴体
    fillRect(buf, S, bx + 2, by, 18, 8, body);
    hLine(buf, S, bx + 2, by, 18, hexToRGBA(bodyHex, 200));

    // 強化ライン（高Lv特徴）
    if (isLv4) {
      setPixel(buf, S, bx + 5, by + 2, hexToRGBA('#ffcc88'));
      setPixel(buf, S, bx + 10, by + 3, hexToRGBA('#ffcc88'));
      setPixel(buf, S, bx + 15, by + 1, hexToRGBA('#ffcc88'));
    } else {
      setPixel(buf, S, bx + 5, by + 2, hexToRGBA('#88ddee'));
      setPixel(buf, S, bx + 10, by + 3, hexToRGBA('#88ddee'));
      setPixel(buf, S, bx + 15, by + 1, hexToRGBA('#88ddee'));
    }

    // 頭部
    const headX = facingRight ? bx + 20 : bx - 1;
    const headDX = facingRight ? 0 : -6;
    fillRect(buf, S, headX + headDX, by - 2, 7, 8, sh);
    const noseX = facingRight ? headX + headDX + 7 : headX + headDX - 2;
    vLine(buf, S, noseX, by + 2, 3, hexToRGBA(bodyHex, 180));
    const eyeXp = facingRight ? headX + headDX + 2 : headX + headDX + 3;
    setPixel(buf, S, eyeXp, by + 1, eyeColor);
    setPixel(buf, S, eyeXp, by,     eyeColor);

    if (state === 'levelup') {
      fillCircle(buf, S, eyeXp, by, 2, hexToRGBA('#ffffff', frame === 0 ? 160 : 80));
      drawCircleOutline(buf, S, 16 + ox, 16 + oy, 8 + frame * 3, hexToRGBA('#ffff44', 100));
    }

    if (state === 'attack') {
      const attackPush = frame === 1 ? flip * 3 : 0;
      const jawOpen = frame === 0 ? 1 : 3;
      fillRect(buf, S, headX + headDX, by - 2, 7, 5, sh);
      fillRect(buf, S, headX + headDX, by + 3, 7, jawOpen + 1, hexToRGBA(bodyHex, 180));
      setPixel(buf, S, headX + headDX + 1, by + 3, hexToRGBA('#eeeeee'));
      setPixel(buf, S, headX + headDX + 5, by + 3, hexToRGBA('#eeeeee'));
    }

    // 尻尾
    const tailX = facingRight ? bx + 2 : bx + 19;
    vLine(buf, S, tailX, by - 4, 6, sh);
    setPixel(buf, S, tailX + (facingRight ? -1 : 1), by - 5, sh);
    setPixel(buf, S, tailX + (facingRight ? -2 : 2), by - 3, sh);
    setPixel(buf, S, tailX + (facingRight ? -1 : 1), by - 6, hexToRGBA(bodyHex, 180));
    setPixel(buf, S, tailX + (facingRight ? -3 : 3), by - 4, hexToRGBA(bodyHex, 180));

    // 4本脚
    const legPhase = state === 'move' ? frame : 0;
    const legXs = [bx + 4, bx + 8, bx + 14, bx + 18];
    for (let i = 0; i < 4; i++) {
      const legDown = legPhase === (i % 2) ? 3 : 0;
      vLine(buf, S, legXs[i], by + 7, 3 + legDown, sh);
      setPixel(buf, S, legXs[i] - 1, by + 9 + legDown, sh);
      setPixel(buf, S, legXs[i] + 1, by + 9 + legDown, sh);
    }

    hLine(buf, S, bx + 2, by, 18, BLACK);
    hLine(buf, S, bx + 2, by + 7, 18, BLACK);
    vLine(buf, S, bx + 2, by, 8, BLACK);
    vLine(buf, S, bx + 19, by, 8, BLACK);
  }
}

// spark Lv3（明るい青白電撃）
function drawSparkLv3(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  drawSparkBase(buf, S, dir, state, frame, '#88aaff', '#aaccff', '#ffffff', 2);
}

// spark Lv4（明るいホワイト電撃、稲妻が太い）
function drawSparkLv4(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  _lv: number
): void {
  drawSparkBase(buf, S, dir, state, frame, '#ffffff', '#eeeeff', '#ffff88', 3);
}

// spark 共通描画ベース
function drawSparkBase(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  coreHex: string,
  outerHex: string,
  boltHex: string,
  boltWidth: number
): void {
  const dOff = dirOffset(dir);
  const cx = 16;
  const cy = 16;

  const bounceX = state === 'move' ? dOff.dx * (frame === 1 ? 2 : 0) : 0;
  const bounceY = state === 'move' ? dOff.dy * (frame === 1 ? 2 : 0) : 0;
  const bx = cx + bounceX;
  const by = cy + bounceY;

  const isDead = state === 'dead';
  if (isDead && frame === 2) {
    fillCircle(buf, S, bx, by, 6, hexToRGBA(coreHex, 60));
    return;
  }

  // 外殻（電気球）
  const outerR = isDead ? 4 - frame : (state === 'attack' && frame === 1 ? 10 : 7);
  const outerAlpha = isDead ? 200 - frame * 60 : 220;
  fillCircle(buf, S, bx, by, outerR, hexToRGBA(outerHex, outerAlpha));

  // コア
  const coreR = outerR > 4 ? outerR - 3 : 1;
  const coreAlpha = isDead ? 180 - frame * 50 : 240;
  fillCircle(buf, S, bx, by, coreR, hexToRGBA(coreHex, coreAlpha));

  drawCircleOutline(buf, S, bx, by, outerR, hexToRGBA('#000000', outerAlpha / 2));

  if (isDead) return;

  // 稲妻（方向別）
  const boltColor = hexToRGBA(boltHex, state === 'attack' ? 255 : 180);
  const boltLen = state === 'attack' ? (frame === 0 ? 6 : frame === 1 ? 12 : 4) : 5;

  for (let b = 0; b < boltWidth; b++) {
    const offset = b - Math.floor(boltWidth / 2);
    for (let i = outerR + 1; i <= outerR + boltLen; i++) {
      const bpx = bx + dOff.dx * i + dOff.dy * offset;
      const bpy = by + dOff.dy * i + dOff.dx * offset;
      setPixel(buf, S, bpx, bpy, boltColor);
    }
  }

  // ジグザグ稲妻エフェクト
  if (state === 'attack' && frame === 1) {
    for (let i = 1; i <= 6; i++) {
      const zx = bx + dOff.dx * (outerR + i) + (i % 2 === 0 ? dOff.dy : -dOff.dy) * 2;
      const zy = by + dOff.dy * (outerR + i) + (i % 2 === 0 ? dOff.dx : -dOff.dx) * 2;
      setPixel(buf, S, zx, zy, hexToRGBA('#ffffff', 220));
    }
  }

  // levelup: 全体が光る
  if (state === 'levelup') {
    drawCircleOutline(buf, S, bx, by, outerR + 3, hexToRGBA(boltHex, frame === 0 ? 180 : 80));
  }

  // hit: 赤みがかる
  if (state === 'hit') {
    fillCircle(buf, S, bx, by, outerR, hexToRGBA('#ff8888', 80));
  }
}

// ---------------------------------------------------------------------------
// 敵定義リスト
// ---------------------------------------------------------------------------

// 新規5種（各Lv1-4）
const NEW_ENEMY_BASE_IDS = [
  { id: 'mine_layer',     drawFn: drawMineLayer     },
  { id: 'assault_mecha',  drawFn: drawAssaultMecha  },
  { id: 'stealth_killer', drawFn: drawStealthKiller },
  { id: 'shield_knight',  drawFn: drawShieldKnight  },
  { id: 'healer_drone',   drawFn: drawHealerDrone   },
];

// 既存敵の高Lvバリアント（個別描画関数）
const HIGH_LV_VARIANTS: EnemyVariant[] = [
  { id: 'scout_drone_lv3',  lv: 2, drawFn: drawScoutDroneLv3  },
  { id: 'mine_beetle_lv3',  lv: 2, drawFn: drawMineBeetleLv3  },
  { id: 'guard_bot_lv3',    lv: 2, drawFn: drawGuardBotLv3    },
  { id: 'guard_bot_lv4',    lv: 3, drawFn: drawGuardBotLv4    },
  { id: 'slime_x_lv3',      lv: 2, drawFn: drawSlimeXLv3      },
  { id: 'rust_hound_lv3',   lv: 2, drawFn: drawRustHoundLv3   },
  { id: 'rust_hound_lv4',   lv: 3, drawFn: drawRustHoundLv4   },
  { id: 'spark_lv3',        lv: 2, drawFn: drawSparkLv3       },
  { id: 'spark_lv4',        lv: 3, drawFn: drawSparkLv4       },
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
  console.log('=== メカローグ 4-10階 敵スプライト生成開始 ===');

  ensureDir(ENEMIES_DIR);

  const generated: string[] = [];
  let count = 0;

  // --- 新規5種（各Lv1-4）---
  console.log('\n--- 新規敵5種（Lv1〜Lv4）---');
  for (const { id, drawFn } of NEW_ENEMY_BASE_IDS) {
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

  // --- 既存敵の高Lvバリアント ---
  console.log('\n--- 既存敵の高Lvバリアント ---');
  for (const { id, lv, drawFn } of HIGH_LV_VARIANTS) {
    console.log(`  [${id}] 生成中...`);
    for (const dir of DIRECTIONS) {
      for (const state of STATES) {
        const frameCount = STATE_FRAMES[state];
        for (let frame = 0; frame < frameCount; frame++) {
          const filename = await generateSprite(id, drawFn, lv, state, dir, frame, ENEMIES_DIR);
          generated.push(filename);
          count++;
        }
      }
    }
    console.log(`    完了`);
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
