/**
 * @fileoverview メカローグ oil_drum（オイルドラム通常敵）スプライト生成スクリプト
 *
 * oil_drum_lv1〜lv4 を生成する。
 * big_oil_drum と同じカラーパレットを使用した 32x32 縮小版。
 * 通常敵なので腕は控えめ。
 *
 * 実行: node --experimental-strip-types scripts/generate-oil-drum-enemy-sprites.ts
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

const BLACK = hexToRGBA('#000000');
const WHITE = hexToRGBA('#FFFFFF');

// ---------------------------------------------------------------------------
// レベル別カラーパレット（big_oil_drum と同一）
// ---------------------------------------------------------------------------

interface DrumPalette {
  barrel:   RGBA;
  barrelHL: RGBA;
  barrelSH: RGBA;
  hoop:     RGBA;
  oil:      RGBA;
  oilHL:    RGBA;
  eye:      RGBA;
  eyeHL:    RGBA;
}

const LEVEL_PALETTES: DrumPalette[] = [
  // Lv1: ラスト（錆び）
  {
    barrel:   hexToRGBA('#5C3A00'),
    barrelHL: hexToRGBA('#8A6020'),
    barrelSH: hexToRGBA('#2A1500'),
    hoop:     hexToRGBA('#2A1800'),
    oil:      hexToRGBA('#CC8800'),
    oilHL:    hexToRGBA('#FFAA22'),
    eye:      hexToRGBA('#FF4400'),
    eyeHL:    hexToRGBA('#FFFFFF'),
  },
  // Lv2: トキシック（緑）
  {
    barrel:   hexToRGBA('#0A3A0A'),
    barrelHL: hexToRGBA('#1A7A1A'),
    barrelSH: hexToRGBA('#041204'),
    hoop:     hexToRGBA('#021002'),
    oil:      hexToRGBA('#22CC22'),
    oilHL:    hexToRGBA('#66FF44'),
    eye:      hexToRGBA('#FF4400'),
    eyeHL:    hexToRGBA('#FFFFFF'),
  },
  // Lv3: ミスティック（紫）
  {
    barrel:   hexToRGBA('#2A0060'),
    barrelHL: hexToRGBA('#6030A0'),
    barrelSH: hexToRGBA('#100030'),
    hoop:     hexToRGBA('#050015'),
    oil:      hexToRGBA('#9922DD'),
    oilHL:    hexToRGBA('#CC66FF'),
    eye:      hexToRGBA('#FF4400'),
    eyeHL:    hexToRGBA('#FFFFFF'),
  },
  // Lv4: インフェルノ（赤黒）
  {
    barrel:   hexToRGBA('#200000'),
    barrelHL: hexToRGBA('#600010'),
    barrelSH: hexToRGBA('#0A0000'),
    hoop:     hexToRGBA('#050000'),
    oil:      hexToRGBA('#CC0000'),
    oilHL:    hexToRGBA('#FF3333'),
    eye:      hexToRGBA('#FF0000'),
    eyeHL:    hexToRGBA('#FFFFFF'),
  },
];

// ---------------------------------------------------------------------------
// 直立ドラム描画（32x32 縮小版）
// ---------------------------------------------------------------------------
// big_oil_drum の drawUprightDrum をベースに 32x32 タイルに収まるよう縮小。
// タイル内座標: 幅 x:4..27, 高さ y:2..29
// フープリング: 2本
// 目: 2x2、小さめ
// アーム: 通常敵なので控えめ（短い）
// ---------------------------------------------------------------------------

/**
 * 32x32 の直立ドラム缶を描画する。
 */
function drawSmallDrum(
  buf: Uint8Array,
  S: number,
  pal: DrumPalette,
  offX: number,
  offY: number,
  drawArms: boolean,
  atkFrame: number,    // 0=通常, 1=腕伸ばし, -1=スプラッシュ
  whiteFlash: boolean
): void {
  const b   = whiteFlash ? hexToRGBA('#FFDDDD') : pal.barrel;
  const bHL = whiteFlash ? hexToRGBA('#FFFFFF') : pal.barrelHL;
  const bSH = whiteFlash ? hexToRGBA('#DDAAAA') : pal.barrelSH;
  const hp  = whiteFlash ? hexToRGBA('#CCAAAA') : pal.hoop;
  const oil  = pal.oil;
  const oilHL = pal.oilHL;

  // --- 小さいオイルアーム（通常敵用: 控えめ）---
  if (drawArms) {
    if (atkFrame === -1) {
      // スプラッシュ: 四方に少量の油滴
      const splashPoints = [
        { x: 3 + offX,  y: 8 + offY  },
        { x: 28 + offX, y: 8 + offY  },
        { x: 2 + offX,  y: 15 + offY },
        { x: 29 + offX, y: 15 + offY },
        { x: 9 + offX,  y: 2 + offY  },
        { x: 22 + offX, y: 2 + offY  },
        { x: 15 + offX, y: 1 + offY  },
        { x: 5 + offX,  y: 26 + offY },
        { x: 26 + offX, y: 26 + offY },
        { x: 15 + offX, y: 29 + offY },
      ];
      for (const p of splashPoints) {
        setPixel(buf, S, p.x, p.y, oil);
        setPixel(buf, S, p.x + 1, p.y, oilHL);
      }
    } else {
      // 左アーム: 短め
      const armLen = atkFrame === 1 ? 5 : 3;
      const leftArmPoints: Array<[number, number]> = [
        [5, 14], [4, 16], [3, 18], [2, 20], [1, 22],
      ];
      const leftEnd = Math.min(armLen, leftArmPoints.length);
      for (let i = 0; i < leftEnd; i++) {
        const [ax, ay] = leftArmPoints[i];
        setPixel(buf, S, ax + offX, ay + offY, oil);
        setPixel(buf, S, ax - 1 + offX, ay + offY, oilHL);
      }

      // 右アーム: 短め
      const rightArmPoints: Array<[number, number]> = [
        [26, 14], [27, 16], [28, 18], [29, 20], [30, 22],
      ];
      const rightEnd = Math.min(armLen, rightArmPoints.length);
      for (let i = 0; i < rightEnd; i++) {
        const [ax, ay] = rightArmPoints[i];
        setPixel(buf, S, ax + offX, ay + offY, oil);
        setPixel(buf, S, ax + 1 + offX, ay + offY, oilHL);
      }

      // 中央オイルドリップ（idle/move でも小さく）
      const dripPoints: Array<[number, number]> = [
        [15, 23], [16, 24], [15, 25], [16, 26],
      ];
      const dripEnd = atkFrame === 1 ? 4 : 2;
      for (let i = 0; i < Math.min(dripEnd, dripPoints.length); i++) {
        const [dx, dy] = dripPoints[i];
        setPixel(buf, S, dx + offX, dy + offY, oil);
      }
    }
  }

  // --- トップキャップ楕円 (y:3..5, x:7..24) ---
  hLine(buf, S, 8 + offX,  3 + offY, 16, bHL);
  hLine(buf, S, 7 + offX,  4 + offY, 18, bHL);
  hLine(buf, S, 7 + offX,  5 + offY, 18, b);

  // --- ドラム本体 (y:5..22, x:5..26) ---
  for (let gy = 6; gy <= 22; gy++) {
    // 左シャドウ
    setPixel(buf, S, 5 + offX, gy + offY, bSH);
    setPixel(buf, S, 6 + offX, gy + offY, bSH);
    // ハイライト
    setPixel(buf, S, 7 + offX, gy + offY, bHL);
    setPixel(buf, S, 8 + offX, gy + offY, bHL);
    // 中央
    for (let gx = 9; gx <= 22; gx++) {
      setPixel(buf, S, gx + offX, gy + offY, b);
    }
    // 右シャドウ
    setPixel(buf, S, 23 + offX, gy + offY, bSH);
    setPixel(buf, S, 24 + offX, gy + offY, bSH);
  }

  // --- フープリング 2本 ---
  hLine(buf, S, 5 + offX, 10 + offY, 20, hp);
  hLine(buf, S, 5 + offX, 11 + offY, 20, hp);
  hLine(buf, S, 5 + offX, 18 + offY, 20, hp);
  hLine(buf, S, 5 + offX, 19 + offY, 20, hp);

  // --- ボトムキャップ (y:23..25, x:7..24) ---
  hLine(buf, S, 7 + offX,  23 + offY, 18, b);
  hLine(buf, S, 7 + offX,  24 + offY, 18, bSH);
  hLine(buf, S, 8 + offX,  25 + offY, 16, bSH);

  // --- アウトライン ---
  hLine(buf, S, 8 + offX,  2 + offY, 16, BLACK);
  setPixel(buf, S, 7 + offX,  3 + offY, BLACK);
  setPixel(buf, S, 24 + offX, 3 + offY, BLACK);
  vLine(buf, S, 4 + offX,  4 + offY, 20, BLACK);
  vLine(buf, S, 25 + offX, 4 + offY, 20, BLACK);
  setPixel(buf, S, 6 + offX,  25 + offY, BLACK);
  setPixel(buf, S, 25 + offX, 25 + offY, BLACK);
  hLine(buf, S, 7 + offX, 26 + offY, 18, BLACK);

  // --- 目（2x2、赤）y:7、左x:8 右x:19 ---
  const eyeColor   = whiteFlash ? WHITE : pal.eye;
  const eyeHLColor = pal.eyeHL;
  fillRect(buf, S, 8 + offX,  7 + offY, 2, 2, eyeColor);
  fillRect(buf, S, 19 + offX, 7 + offY, 2, 2, eyeColor);
  setPixel(buf, S, 8 + offX,  7 + offY, eyeHLColor);
  setPixel(buf, S, 19 + offX, 7 + offY, eyeHLColor);
  // 目アウトライン
  setPixel(buf, S, 7 + offX,  7 + offY,  BLACK);
  setPixel(buf, S, 10 + offX, 7 + offY,  BLACK);
  setPixel(buf, S, 7 + offX,  9 + offY,  BLACK);
  setPixel(buf, S, 10 + offX, 9 + offY,  BLACK);
  setPixel(buf, S, 18 + offX, 7 + offY,  BLACK);
  setPixel(buf, S, 21 + offX, 7 + offY,  BLACK);
  setPixel(buf, S, 18 + offX, 9 + offY,  BLACK);
  setPixel(buf, S, 21 + offX, 9 + offY,  BLACK);
}

// ---------------------------------------------------------------------------
// 90°CW 回転（move / dead 横倒し用）
// ---------------------------------------------------------------------------

function rotateBuf90CW(src: Uint8Array, S: number): Uint8Array {
  const dst = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const srcIdx = (y * S + x) * 4;
      const newX   = S - 1 - y;
      const newY   = x;
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
// oil_drum 通常敵 全状態描画
// ---------------------------------------------------------------------------

function drawOilDrumEnemy(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  lv: number
): void {
  const pal = LEVEL_PALETTES[lv] ?? LEVEL_PALETTES[0];

  if (state === 'move') {
    // 横倒し転がり（ローリング）: 直立バッファを 90°CW 回転
    const uprightBuf = createBuffer(S, S);
    drawSmallDrum(uprightBuf, S, pal, 0, 0, false, 0, false);
    const rotated = rotateBuf90CW(uprightBuf, S);
    for (let i = 0; i < rotated.length; i++) {
      buf[i] = rotated[i];
    }
    // スピード線
    const mlColor  = hexToRGBA('#FFFFFF', 100);
    const mlOffset = frame === 0 ? 0 : 3;
    if (dir === 'right' || dir === 'down') {
      vLine(buf, S, 2 + mlOffset, 8, 16, mlColor);
      vLine(buf, S, 5 + mlOffset, 4, 24, mlColor);
    } else {
      vLine(buf, S, S - 3 - mlOffset, 8, 16, mlColor);
      vLine(buf, S, S - 6 - mlOffset, 4, 24, mlColor);
    }
    return;
  }

  if (state === 'attack') {
    if (frame === 0) {
      // 通常（腕準備）
      drawSmallDrum(buf, S, pal, 0, 0, true, 0, false);
    } else if (frame === 1) {
      // 腕伸ばし
      drawSmallDrum(buf, S, pal, 0, 0, true, 1, false);
    } else {
      // スプラッシュ
      drawSmallDrum(buf, S, pal, 0, 0, true, -1, false);
    }
    return;
  }

  if (state === 'hit') {
    if (frame === 0) {
      // わずかにずれる
      drawSmallDrum(buf, S, pal, -2, 0, false, 0, false);
    } else {
      // 白フラッシュ
      drawSmallDrum(buf, S, pal, 0, 0, false, 0, true);
    }
    return;
  }

  if (state === 'dead') {
    if (frame === 0) {
      // 傾く
      const uprightBuf = createBuffer(S, S);
      drawSmallDrum(uprightBuf, S, pal, 0, 0, false, 0, false);
      const rotated = rotateBuf90CW(uprightBuf, S);
      for (let i = 0; i < rotated.length; i++) {
        buf[i] = rotated[i];
      }
    } else if (frame === 1) {
      // 横倒し + 煙
      const uprightBuf = createBuffer(S, S);
      drawSmallDrum(uprightBuf, S, pal, 0, 0, false, 0, false);
      const rotated = rotateBuf90CW(uprightBuf, S);
      for (let i = 0; i < rotated.length; i++) {
        buf[i] = rotated[i];
      }
      // 煙
      const smokeColor = hexToRGBA('#888888', 100);
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          if (dx * dx + dy * dy <= 25) {
            setPixel(buf, S, 16 + dx, 10 + dy, { ...smokeColor, a: Math.max(0, 100 - Math.round(10 * Math.sqrt(dx * dx + dy * dy))) });
          }
        }
      }
    } else {
      // 爆発
      const smokeColor = hexToRGBA('#888888', 150);
      for (let dy = -11; dy <= 11; dy++) {
        for (let dx = -11; dx <= 11; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 11) {
            const a = Math.max(0, Math.round(150 * (1 - dist / 11)));
            setPixel(buf, S, 16 + dx, 16 + dy, { ...smokeColor, a });
          }
        }
      }
      const fireColor = { ...pal.oilHL, a: 200 };
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (dx * dx + dy * dy <= 36) {
            setPixel(buf, S, 16 + dx, 16 + dy, fireColor);
          }
        }
      }
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dy * dy <= 9) {
            setPixel(buf, S, 16 + dx, 16 + dy, hexToRGBA('#FFFFFF', 220));
          }
        }
      }
      // オイル飛散
      const oilSplash: Array<[number, number]> = [
        [3, 4], [28, 5], [5, 27], [26, 26],
        [1, 15], [30, 16], [14, 1], [16, 30],
      ];
      for (const [sx, sy] of oilSplash) {
        setPixel(buf, S, sx, sy, pal.oil);
        setPixel(buf, S, sx + 1, sy, pal.oilHL);
      }
    }
    return;
  }

  if (state === 'levelup') {
    drawSmallDrum(buf, S, pal, 0, 0, false, 0, false);
    const flashA = frame === 0 ? 200 : 100;
    // 光る輪郭
    for (let dy = -13; dy <= 13; dy++) {
      for (let dx = -13; dx <= 13; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(dist - 13) < 0.9) {
          setPixel(buf, S, 16 + dx, 14 + dy, hexToRGBA('#FFFFFF', flashA));
        }
        if (Math.abs(dist - 15) < 0.9) {
          setPixel(buf, S, 16 + dx, 14 + dy, hexToRGBA(
            `#${pal.oil.r.toString(16).padStart(2,'0')}${pal.oil.g.toString(16).padStart(2,'0')}${pal.oil.b.toString(16).padStart(2,'0')}`,
            Math.round(flashA / 2)
          ));
        }
      }
    }
    return;
  }

  // idle (frame 0/1): 直立 + 小さいオイルドリップ
  drawSmallDrum(buf, S, pal, 0, 0, true, 0, false);
  // frame1: ドリップが少し長く（追加ピクセル）
  if (frame === 1) {
    setPixel(buf, S, 15, 27, pal.oil);
    setPixel(buf, S, 16, 28, pal.oil);
    setPixel(buf, S, 16, 27, pal.oilHL);
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
  const S   = TILE_SIZE;
  const buf = createBuffer(S, S);

  drawOilDrumEnemy(buf, S, dir, state, frame, lv);

  const filename = `${enemyId}_${state}_dir_${dir}_idle_${frame}.png`;
  const filePath  = path.join(ENEMIES_DIR, filename);

  await savePNG(buf, S, S, filePath);
  return filename;
}

async function main(): Promise<void> {
  console.log('=== メカローグ oil_drum 通常敵スプライト生成開始 ===');

  ensureDir(ENEMIES_DIR);

  const generated: string[] = [];
  let count = 0;

  // oil_drum_lv1〜lv4
  for (let lv = 0; lv < 4; lv++) {
    const lvLabel = `lv${lv + 1}`;
    const enemyId = `oil_drum_${lvLabel}`;
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
