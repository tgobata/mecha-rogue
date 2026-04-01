/**
 * @fileoverview メカローグ igniter（着火ロボ）スプライト生成スクリプト
 *
 * igniter_lv1〜lv3 を生成する。
 * ゲームのネオン系スタイル（シアン/青系グロー）で描画。
 *
 * 実行: node --experimental-strip-types scripts/generate-igniter-sprites.ts
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
 * 中身を塗りつぶした炎
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
 * 中身を塗りつぶした炎
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
// igniter（着火ロボ）描画
// ---------------------------------------------------------------------------
// ネオン系スタイル: シアン/青系グロー、赤い目2つ、炎噴出
// Lv1: シアン体, 橙炎
// Lv2: 緑シアン体, 黄緑炎
// Lv3: 紫体, 紫炎
// ---------------------------------------------------------------------------

function drawIgniter(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  // Lv別ネオン系カラー（lv は 0-based: 0=Lv1, 1=Lv2, 2=Lv3）
  const BODY_COLORS  = ['#00CCCC', '#44FFAA', '#AA44FF'];
  const BODY_HLS     = ['#44FFFF', '#88FFCC', '#CC88FF'];
  const FIRE_COLORS  = ['#FF8800', '#AAFF00', '#CC22FF'];
  const FIRE_TIPS    = ['#FFEE44', '#EEFFAA', '#FF88FF'];
  const EYE_COLOR    = '#FF4400';

  const bodyHex   = BODY_COLORS[lv] ?? BODY_COLORS[0];
  const bodyHLHex = BODY_HLS[lv]    ?? BODY_HLS[0];
  const fireHex   = FIRE_COLORS[lv] ?? FIRE_COLORS[0];
  const fireTipHex= FIRE_TIPS[lv]   ?? FIRE_TIPS[0];

  const body    = hexToRGBA(bodyHex);
  const bodyHL  = hexToRGBA(bodyHLHex);
  const fire    = hexToRGBA(fireHex);
  const fireTip = hexToRGBA(fireTipHex);
  const eye     = hexToRGBA(EYE_COLOR);
  const dOff    = dirOffset(dir);

  // バウンド（移動時）
  const bounceY = state === 'move' && frame === 1 ? 2 : 0;

  // アタック: 前方に +2px ずれ → 炎噴射 → 戻る
  const attackOffX = state === 'attack'
    ? (frame === 1 ? dOff.dx * 2 : frame === 2 ? dOff.dx * 1 : 0)
    : 0;
  const attackOffY = state === 'attack'
    ? (frame === 1 ? dOff.dy * 2 : frame === 2 ? dOff.dy * 1 : 0)
    : 0;

  // dead: 傾いて倒れる
  const isDead    = state === 'dead';
  const deadTiltX = isDead ? frame * 3 : 0;
  const deadTiltY = isDead ? frame * 2 : 0;

  // dead frame2: 爆発煙
  if (isDead && frame === 2) {
    fillCircle(buf, S, 16, 18, 10, hexToRGBA('#224444', 130));
    fillCircle(buf, S, 16, 18,  7, hexToRGBA(fireHex, 160));
    fillCircle(buf, S, 16, 18,  4, hexToRGBA(fireTipHex, 210));
    // ネオングロー輪郭
    drawCircleOutline(buf, S, 16, 18, 11, hexToRGBA(bodyHex, 100));
    return;
  }

  const cx = 16 + attackOffX + deadTiltX;
  const cy = 4  + attackOffY + bounceY + deadTiltY;

  // hit フレーム0: 白フラッシュ（ボディを白っぽく）
  const isHit = state === 'hit';
  const bodyColor = isHit ? hexToRGBA('#CCFFFF') : body;
  const bodyHLColor = isHit ? hexToRGBA('#FFFFFF') : bodyHL;

  // 攻撃フレーム1: 炎を大きく
  const isAttackFlame = state === 'attack' && frame === 1;
  const flameHeight0  = 4;
  const flameHeight1  = 7;
  const flameH        = (frame === 1 || isAttackFlame) ? flameHeight1 : flameHeight0;
  const footFlameH    = (frame === 1 || isAttackFlame) ? 8 : 5;

  // ---- 炎描画（ボディの後ろ側から先に描いてボディが上に来る）----
  if (dir === 'down' || dir === 'up') {
    // 足元炎
    drawFlame(buf, S, cx - 3, cy + 28, footFlameH, fire, fireTip);
    drawFlame(buf, S, cx + 3, cy + 28, footFlameH, fire, fireTip);
    // 両脇炎
    drawFlameHorizontal(buf, S, cx - 9, cy + 16, flameH, -1, fire, fireTip);
    drawFlameHorizontal(buf, S, cx + 9, cy + 16, flameH,  1, fire, fireTip);
  } else {
    // 横向き: 足元炎
    drawFlame(buf, S, cx - 2, cy + 28, footFlameH, fire, fireTip);
    drawFlame(buf, S, cx + 4, cy + 28, footFlameH, fire, fireTip);
    // 後方炎（進行方向の反対側）
    const rearDirX = dir === 'right' ? -1 : 1;
    drawFlameHorizontal(buf, S, cx + rearDirX * 7, cy + 15, flameH + 1, rearDirX, fire, fireTip);
    // 頭頂炎
    drawFlame(buf, S, cx, cy - 1, flameH - 1, fire, fireTip);
  }

  // ---- 脚 ----
  const legY = cy + 21;
  fillRect(buf, S, cx - 5, legY, 3, 5, hexToRGBA(bodyHex, 220));
  fillRect(buf, S, cx + 2, legY, 3, 5, hexToRGBA(bodyHex, 220));
  // 足先（黒）
  fillRect(buf, S, cx - 6, legY + 4, 4, 2, BLACK);
  fillRect(buf, S, cx + 2, legY + 4, 4, 2, BLACK);

  // ---- ボディ（胸部が広い四角形）----
  const bodyTop = cy + 10;
  fillRect(buf, S, cx - 8, bodyTop, 16, 11, bodyColor);
  // ネオングロー: ハイライト線
  hLine(buf, S, cx - 8, bodyTop,     16, bodyHLColor);
  vLine(buf, S, cx - 8, bodyTop,     11, bodyHLColor);
  // ボディ中央のグロー縦線
  vLine(buf, S, cx,     bodyTop + 1,  9, hexToRGBA(bodyHex, 160));

  // ---- 腕（短め）----
  fillRect(buf, S, cx - 11, bodyTop + 2, 3, 5, bodyColor);
  fillRect(buf, S, cx + 8,  bodyTop + 2, 3, 5, bodyColor);
  // 腕先端（炎噴射口）
  setPixel(buf, S, cx - 11, bodyTop + 6, fire);
  setPixel(buf, S, cx + 10, bodyTop + 6, fire);

  // ---- 頭部（正方形、角を丸めた風）----
  const headTop = cy;
  fillRect(buf, S, cx - 5, headTop + 1, 10, 8, bodyColor);
  fillRect(buf, S, cx - 4, headTop,      8, 10, bodyColor);
  // 頭部ネオンハイライト
  hLine(buf, S, cx - 3, headTop,     6, bodyHLColor);
  vLine(buf, S, cx - 4, headTop + 1, 3, bodyHLColor);

  // ---- 目（赤、2x2）----
  if (dir === 'down' || dir === 'up') {
    if (dir === 'down') {
      fillRect(buf, S, cx - 3, headTop + 3, 2, 2, eye);
      fillRect(buf, S, cx + 1, headTop + 3, 2, 2, eye);
      // 目の白ハイライト
      setPixel(buf, S, cx - 3, headTop + 3, hexToRGBA('#FFFFFF'));
      setPixel(buf, S, cx + 1, headTop + 3, hexToRGBA('#FFFFFF'));
    } else {
      // 背面: うっすら
      setPixel(buf, S, cx - 2, headTop + 3, hexToRGBA(bodyHex, 120));
      setPixel(buf, S, cx + 1, headTop + 3, hexToRGBA(bodyHex, 120));
    }
  } else {
    const eyeX = dir === 'right' ? cx + 3 : cx - 4;
    fillRect(buf, S, eyeX, headTop + 3, 2, 2, eye);
    setPixel(buf, S, eyeX, headTop + 3, hexToRGBA('#FFFFFF'));
  }

  // hit frame1: 目が×になる
  if (isHit && frame === 1) {
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
  hLine(buf, S, cx - 4, headTop,     8, BLACK);
  hLine(buf, S, cx - 5, headTop + 1, 1, BLACK);
  hLine(buf, S, cx + 4, headTop + 1, 1, BLACK);
  hLine(buf, S, cx - 5, headTop + 8, 1, BLACK);
  hLine(buf, S, cx + 4, headTop + 8, 1, BLACK);
  hLine(buf, S, cx - 4, headTop + 9, 8, BLACK);
  vLine(buf, S, cx - 5, headTop + 1, 8, BLACK);
  vLine(buf, S, cx + 4, headTop + 1, 8, BLACK);
  // ボディアウトライン
  hLine(buf, S, cx - 8, bodyTop,      16, BLACK);
  hLine(buf, S, cx - 8, bodyTop + 10, 16, BLACK);
  vLine(buf, S, cx - 8, bodyTop,      11, BLACK);
  vLine(buf, S, cx + 7, bodyTop,      11, BLACK);

  // ---- ネオングロー: ボディ外周に淡いグロー ----
  const glowA = 60;
  drawCircleOutline(buf, S, cx, cy + 11, 12, hexToRGBA(bodyHex, glowA));

  // ---- levelup: 白いフラッシュ + ネオングロー ----
  if (state === 'levelup') {
    const flashA = frame === 0 ? 200 : 100;
    drawCircleOutline(buf, S, cx, cy + 11, 13, hexToRGBA('#FFFFFF', flashA));
    drawCircleOutline(buf, S, cx, cy + 11, 15, hexToRGBA(bodyHex, flashA / 2));
    fillRect(buf, S, cx - 4, headTop, 8, 10, hexToRGBA('#FFFFFF', flashA / 3));
  }
}

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
const STATES: State[]         = ['idle', 'move', 'attack', 'hit', 'levelup', 'dead'];

// ---------------------------------------------------------------------------
// 生成メイン
// ---------------------------------------------------------------------------

async function generateSprite(
  enemyId: string,
  lv: number,
  state: State,
  dir: Direction,
  frame: number
): Promise<string> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  drawIgniter(buf, S, dir, state, frame, lv);

  const filename = `${enemyId}_${state}_dir_${dir}_idle_${frame}.png`;
  const filePath  = path.join(ENEMIES_DIR, filename);

  await savePNG(buf, S, S, filePath);
  return filename;
}

async function main(): Promise<void> {
  console.log('=== メカローグ igniter スプライト生成開始 ===');

  ensureDir(ENEMIES_DIR);

  const generated: string[] = [];
  let count = 0;

  // igniter_lv1〜lv3 のみ（lv4 は不要）
  for (let lv = 0; lv < 3; lv++) {
    const lvLabel = `lv${lv + 1}`;
    const enemyId = `igniter_${lvLabel}`;
    console.log(`\n[${enemyId}] 生成中...`);

    for (const dir of DIRECTIONS) {
      for (const state of STATES) {
        const frameCount = STATE_FRAMES[state];
        for (let frame = 0; frame < frameCount; frame++) {
          const filename = await generateSprite(enemyId, lv, state, dir, frame);
          generated.push(filename);
          count++;
        }
      }
    }
    console.log(`  ${enemyId}: 完了`);
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
