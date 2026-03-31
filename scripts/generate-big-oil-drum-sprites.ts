/**
 * @fileoverview メカローグ ビッグ！オイルドラム ボス スプライト生成スクリプト
 *
 * big_oil_drum_lv1〜lv4 を生成する。
 * ドラム缶型ボス、赤い目、3本のオイルアーム。
 * カラーバリアント: Lv1=ラスト, Lv2=トキシック, Lv3=ミスティック, Lv4=インフェルノ
 *
 * 実行: node --experimental-strip-types scripts/generate-big-oil-drum-sprites.ts
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
type BossState = 'move' | 'atk' | 'dmg' | 'dead';

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

// ---------------------------------------------------------------------------
// レベル別カラーパレット
// ---------------------------------------------------------------------------

interface DrumPalette {
  barrel: RGBA;
  barrelHL: RGBA;
  barrelSH: RGBA;
  hoop: RGBA;
  oil: RGBA;
  oilHL: RGBA;
  eye: RGBA;
  eyeHL: RGBA;
}

const LEVEL_PALETTES: DrumPalette[] = [
  // Lv1: ラスト（錆び）
  {
    barrel:  hexToRGBA('#5C3A00'),
    barrelHL:hexToRGBA('#8A6020'),
    barrelSH:hexToRGBA('#2A1500'),
    hoop:    hexToRGBA('#2A1800'),
    oil:     hexToRGBA('#CC8800'),
    oilHL:   hexToRGBA('#FFAA22'),
    eye:     hexToRGBA('#FF4400'),
    eyeHL:   hexToRGBA('#FFFFFF'),
  },
  // Lv2: トキシック（緑）
  {
    barrel:  hexToRGBA('#0A3A0A'),
    barrelHL:hexToRGBA('#1A7A1A'),
    barrelSH:hexToRGBA('#041204'),
    hoop:    hexToRGBA('#021002'),
    oil:     hexToRGBA('#22CC22'),
    oilHL:   hexToRGBA('#66FF44'),
    eye:     hexToRGBA('#FF4400'),
    eyeHL:   hexToRGBA('#FFFFFF'),
  },
  // Lv3: ミスティック（紫）
  {
    barrel:  hexToRGBA('#2A0060'),
    barrelHL:hexToRGBA('#6030A0'),
    barrelSH:hexToRGBA('#100030'),
    hoop:    hexToRGBA('#050015'),
    oil:     hexToRGBA('#9922DD'),
    oilHL:   hexToRGBA('#CC66FF'),
    eye:     hexToRGBA('#FF4400'),
    eyeHL:   hexToRGBA('#FFFFFF'),
  },
  // Lv4: インフェルノ（赤黒）
  {
    barrel:  hexToRGBA('#200000'),
    barrelHL:hexToRGBA('#600010'),
    barrelSH:hexToRGBA('#0A0000'),
    hoop:    hexToRGBA('#050000'),
    oil:     hexToRGBA('#CC0000'),
    oilHL:   hexToRGBA('#FF3333'),
    eye:     hexToRGBA('#FF0000'),
    eyeHL:   hexToRGBA('#FFFFFF'),
  },
];

const BLACK = hexToRGBA('#000000');
const WHITE = hexToRGBA('#FFFFFF');

// ---------------------------------------------------------------------------
// 直立ドラム描画
// ---------------------------------------------------------------------------

/**
 * 直立ドラム缶を描画する。
 * @param buf 出力バッファ
 * @param S タイルサイズ
 * @param pal カラーパレット
 * @param offX X方向オフセット
 * @param offY Y方向オフセット
 * @param drawOilArms オイルアームを描画するか
 * @param atkFrame 攻撃フレーム番号（0=通常, 1=大きく伸びる, -1=スプラッシュ）
 * @param whiteFlash 白フラッシュ（ダメージ時）
 */
function drawUprightDrum(
  buf: Uint8Array,
  S: number,
  pal: DrumPalette,
  offX: number,
  offY: number,
  drawOilArms: boolean,
  atkFrame: number,
  whiteFlash: boolean
): void {
  // ダメージ白フラッシュ用: パレットを上書き
  const b   = whiteFlash ? hexToRGBA('#FFDDDD') : pal.barrel;
  const bHL = whiteFlash ? hexToRGBA('#FFFFFF') : pal.barrelHL;
  const bSH = whiteFlash ? hexToRGBA('#DDAAAA') : pal.barrelSH;
  const hp  = whiteFlash ? hexToRGBA('#CCAAAA') : pal.hoop;
  const oil  = pal.oil;
  const oilHL = pal.oilHL;

  // --- オイルアーム（ドラムより先に描画してドラムが上に重なる）---
  if (drawOilArms) {
    const armLen = atkFrame === 1 ? 14 : (atkFrame === -1 ? 0 : 10);

    if (atkFrame === -1) {
      // スプラッシュ: 四方に油滴
      const splashPoints = [
        { x: 4 + offX,  y: 6 + offY  },
        { x: 27 + offX, y: 6 + offY  },
        { x: 2 + offX,  y: 16 + offY },
        { x: 29 + offX, y: 16 + offY },
        { x: 8 + offX,  y: 2 + offY  },
        { x: 23 + offX, y: 2 + offY  },
        { x: 15 + offX, y: 1 + offY  },
        { x: 4 + offX,  y: 26 + offY },
        { x: 27 + offX, y: 26 + offY },
        { x: 10 + offX, y: 29 + offY },
        { x: 21 + offX, y: 29 + offY },
        { x: 15 + offX, y: 30 + offY },
      ];
      for (const p of splashPoints) {
        setPixel(buf, S, p.x, p.y, oil);
        setPixel(buf, S, p.x + 1, p.y, oilHL);
      }
    } else {
      // 左アーム: (7,16) → 弧を描いて左下へ
      const leftArmPoints: Array<[number, number]> = [
        [7, 16], [6, 18], [5, 20], [4, 22], [3, 24], [2, 26],
      ];
      const leftEnd = Math.min(armLen, leftArmPoints.length);
      for (let i = 0; i < leftEnd; i++) {
        const [ax, ay] = leftArmPoints[i];
        setPixel(buf, S, ax + offX, ay + offY, oil);
        setPixel(buf, S, ax - 1 + offX, ay + offY, oilHL);
      }

      // 右アーム: (24,16) → 弧を描いて右下へ
      const rightArmPoints: Array<[number, number]> = [
        [24, 16], [25, 18], [26, 20], [27, 22], [28, 24], [29, 26],
      ];
      const rightEnd = Math.min(armLen, rightArmPoints.length);
      for (let i = 0; i < rightEnd; i++) {
        const [ax, ay] = rightArmPoints[i];
        setPixel(buf, S, ax + offX, ay + offY, oil);
        setPixel(buf, S, ax + 1 + offX, ay + offY, oilHL);
      }

      // 中央ドリップ
      const dripPoints: Array<[number, number]> = [
        [15, 25], [16, 26], [17, 25], [16, 27], [15, 28], [16, 29], [17, 28],
      ];
      const dripEnd = Math.min(armLen < 6 ? 2 : 6, dripPoints.length);
      for (let i = 0; i < dripEnd; i++) {
        const [dx, dy] = dripPoints[i];
        setPixel(buf, S, dx + offX, dy + offY, oil);
      }

      // 底部オイル溜まり
      if (armLen >= 8) {
        hLine(buf, S, 1 + offX,  27 + offY, 3, oil);
        hLine(buf, S, 28 + offX, 27 + offY, 3, oil);
        hLine(buf, S, 13 + offX, 30 + offY, 5, oil);
        setPixel(buf, S, 2 + offX,  28 + offY, oilHL);
        setPixel(buf, S, 29 + offX, 28 + offY, oilHL);
      }
    }
  }

  // --- トップキャップ楕円 (y:3..5, x:9..22) ---
  hLine(buf, S, 10 + offX, 3 + offY, 12, bHL);
  hLine(buf, S, 9 + offX,  4 + offY, 14, bHL);
  hLine(buf, S, 9 + offX,  5 + offY, 14, b);

  // --- ドラム本体 (y:5..23, x:7..24) ---
  for (let gy = 6; gy <= 23; gy++) {
    // 左シャドウ (x=7,8)
    setPixel(buf, S, 7 + offX, gy + offY, bSH);
    setPixel(buf, S, 8 + offX, gy + offY, bSH);
    // ハイライト (x=9,10)
    setPixel(buf, S, 9 + offX,  gy + offY, bHL);
    setPixel(buf, S, 10 + offX, gy + offY, bHL);
    // 中央 (x=11..22)
    for (let gx = 11; gx <= 22; gx++) {
      setPixel(buf, S, gx + offX, gy + offY, b);
    }
    // 右シャドウ (x=23,24)
    setPixel(buf, S, 23 + offX, gy + offY, bSH);
    setPixel(buf, S, 24 + offX, gy + offY, bSH);
  }

  // --- フープリング ---
  hLine(buf, S, 7 + offX, 11 + offY, 18, hp);
  hLine(buf, S, 7 + offX, 12 + offY, 18, hp);
  hLine(buf, S, 7 + offX, 19 + offY, 18, hp);
  hLine(buf, S, 7 + offX, 20 + offY, 18, hp);

  // --- ボトムキャップ (y:24..26, x:9..22) ---
  hLine(buf, S, 9 + offX,  24 + offY, 14, b);
  hLine(buf, S, 9 + offX,  25 + offY, 14, bSH);
  hLine(buf, S, 10 + offX, 26 + offY, 12, bSH);

  // --- アウトライン ---
  // 上部
  hLine(buf, S, 10 + offX, 2 + offY, 12, BLACK);
  setPixel(buf, S, 9 + offX,  3 + offY, BLACK);
  setPixel(buf, S, 22 + offX, 3 + offY, BLACK);
  // 側面
  vLine(buf, S, 6 + offX,  4 + offY, 20, BLACK);
  vLine(buf, S, 25 + offX, 4 + offY, 20, BLACK);
  // 下部
  setPixel(buf, S, 8 + offX,  26 + offY, BLACK);
  setPixel(buf, S, 23 + offX, 26 + offY, BLACK);
  hLine(buf, S, 9 + offX, 27 + offY, 14, BLACK);

  // --- 目（2x2 赤, y:8, 左x:10 右x:19）---
  const eyeColor  = whiteFlash ? WHITE : pal.eye;
  const eyeHLColor = pal.eyeHL;
  fillRect(buf, S, 10 + offX, 8 + offY, 2, 2, eyeColor);
  fillRect(buf, S, 19 + offX, 8 + offY, 2, 2, eyeColor);
  // 目のハイライト
  setPixel(buf, S, 10 + offX, 8 + offY, eyeHLColor);
  setPixel(buf, S, 19 + offX, 8 + offY, eyeHLColor);
  // 目のアウトライン
  setPixel(buf, S, 9 + offX,  8 + offY, BLACK);
  setPixel(buf, S, 12 + offX, 8 + offY, BLACK);
  setPixel(buf, S, 9 + offX,  10 + offY, BLACK);
  setPixel(buf, S, 12 + offX, 10 + offY, BLACK);
  setPixel(buf, S, 18 + offX, 8 + offY, BLACK);
  setPixel(buf, S, 21 + offX, 8 + offY, BLACK);
  setPixel(buf, S, 18 + offX, 10 + offY, BLACK);
  setPixel(buf, S, 21 + offX, 10 + offY, BLACK);
}

// ---------------------------------------------------------------------------
// 90°CW 回転
// ---------------------------------------------------------------------------

/**
 * バッファを90°時計回りに回転させる。
 */
function rotateBuf90CW(src: Uint8Array, S: number): Uint8Array {
  const dst = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const srcIdx = (y * S + x) * 4;
      const newX = S - 1 - y;
      const newY = x;
      const dstIdx = (newY * S + newX) * 4;
      dst[dstIdx]     = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  return dst;
}

// ---------------------------------------------------------------------------
// ボスドラム 全状態描画
// ---------------------------------------------------------------------------

/**
 * ビッグオイルドラム 1フレーム描画。
 */
function drawBigOilDrum(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: BossState,
  frame: number,
  lv: number
): void {
  const pal = LEVEL_PALETTES[lv] ?? LEVEL_PALETTES[0];

  if (state === 'move') {
    // 直立バッファを描いてから90°CW回転（横倒し転がり）
    const uprightBuf = createBuffer(S, S);
    drawUprightDrum(uprightBuf, S, pal, 0, 0, false, 0, false);
    const rotated = rotateBuf90CW(uprightBuf, S);
    // 回転済みピクセルをメインバッファにコピー
    for (let i = 0; i < rotated.length; i++) {
      buf[i] = rotated[i];
    }

    // モーションライン（スピード線）: フレームによって位置変更
    const mlColor = hexToRGBA('#FFFFFF', 120);
    const mlOffset = frame === 0 ? 0 : 3;
    if (dir === 'right' || dir === 'down') {
      // 右方向移動
      vLine(buf, S, 2 + mlOffset, 8, 16, mlColor);
      vLine(buf, S, 5 + mlOffset, 4, 24, mlColor);
    } else {
      // 左方向移動
      vLine(buf, S, S - 3 - mlOffset, 8, 16, mlColor);
      vLine(buf, S, S - 6 - mlOffset, 4, 24, mlColor);
    }
    return;
  }

  if (state === 'atk') {
    if (frame === 0) {
      // オイルアームが大きく伸びる
      drawUprightDrum(buf, S, pal, 0, 0, true, 1, false);
    } else {
      // オイルが四方に飛び散る（スプラッシュ）
      drawUprightDrum(buf, S, pal, 0, 0, true, -1, false);
    }
    return;
  }

  if (state === 'dmg') {
    if (frame === 0) {
      // わずかにずれる（-2px）
      drawUprightDrum(buf, S, pal, -2, 0, true, 0, false);
    } else {
      // 白フラッシュ
      drawUprightDrum(buf, S, pal, 0, 0, false, 0, true);
    }
    return;
  }

  if (state === 'dead') {
    if (frame === 0) {
      // 横倒し（回転 + 傾き）
      const uprightBuf = createBuffer(S, S);
      drawUprightDrum(uprightBuf, S, pal, 0, 0, true, 0, false);
      const rotated = rotateBuf90CW(uprightBuf, S);
      for (let i = 0; i < rotated.length; i++) {
        buf[i] = rotated[i];
      }
    } else {
      // 爆発（スモーク + オイル飛散）
      // スモーク円
      const smokeColor = hexToRGBA('#888888', 160);
      const smokeLight = hexToRGBA('#AAAAAA', 120);
      for (let dy = -12; dy <= 12; dy++) {
        for (let dx = -12; dx <= 12; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 12) {
            const a = Math.max(0, Math.round(160 * (1 - dist / 12)));
            setPixel(buf, S, 16 + dx, 16 + dy, { ...smokeColor, a });
          }
        }
      }
      // 内側オレンジ
      const fireColor = { ...pal.oilHL, a: 200 };
      for (let dy = -7; dy <= 7; dy++) {
        for (let dx = -7; dx <= 7; dx++) {
          if (dx * dx + dy * dy <= 49) {
            setPixel(buf, S, 16 + dx, 16 + dy, fireColor);
          }
        }
      }
      // 中心白
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dy * dy <= 9) {
            setPixel(buf, S, 16 + dx, 16 + dy, hexToRGBA('#FFFFFF', 220));
          }
        }
      }
      // オイル飛散ピクセル
      const oilSplash: Array<[number, number]> = [
        [3, 3], [28, 4], [5, 28], [26, 27],
        [1, 14], [30, 15], [14, 1], [16, 30],
        [6, 6], [24, 7], [7, 24], [23, 23],
      ];
      for (const [sx, sy] of oilSplash) {
        setPixel(buf, S, sx, sy, pal.oil);
        setPixel(buf, S, sx + 1, sy, pal.oilHL);
      }
      // 煙粒子
      const smokePixels: Array<[number, number]> = [
        [4, 10], [10, 2], [20, 3], [27, 9],
        [29, 20], [22, 28], [10, 29], [3, 22],
      ];
      for (const [sx, sy] of smokePixels) {
        setPixel(buf, S, sx, sy, smokeLight);
      }
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// 生成メイン
// ---------------------------------------------------------------------------

const DIRECTIONS: Direction[] = ['down', 'up', 'left', 'right'];
const BOSS_STATES: BossState[] = ['move', 'atk', 'dmg', 'dead'];
const FRAME_COUNT = 2;

async function main(): Promise<void> {
  console.log('=== ビッグ！オイルドラム ボス スプライト生成開始 ===');

  ensureDir(ENEMIES_DIR);

  const generated: string[] = [];
  let count = 0;

  for (let lv = 0; lv < 4; lv++) {
    const lvLabel = `lv${lv + 1}`;
    const bossId  = `big_oil_drum_${lvLabel}`;
    console.log(`\n[${bossId}] 生成中...`);

    for (const dir of DIRECTIONS) {
      for (const state of BOSS_STATES) {
        for (let frame = 0; frame < FRAME_COUNT; frame++) {
          const S = TILE_SIZE;
          const buf = createBuffer(S, S);

          drawBigOilDrum(buf, S, dir, state, frame, lv);

          const filename = `${bossId}_dir_${dir}_${state}_${frame}.png`;
          const filePath = path.join(ENEMIES_DIR, filename);

          await savePNG(buf, S, S, filePath);
          generated.push(filename);
          count++;
        }
      }
    }
    console.log(`  ${bossId}: 完了`);
  }

  console.log(`\n=== 生成完了: ${count} ファイル ===`);
  console.log(`出力先: ${ENEMIES_DIR}`);

  console.log('\n--- 生成ファイル一覧（先頭32件）---');
  for (const f of generated.slice(0, 32)) {
    console.log('  ' + f);
  }
  if (generated.length > 32) {
    console.log(`  ... 他 ${generated.length - 32} ファイル`);
  }
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
