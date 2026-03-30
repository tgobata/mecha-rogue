/**
 * @fileoverview オイル・炎スプライト生成スクリプト
 *
 * 生成対象:
 *   tile_oil.png         - オイルマス（32x32）
 *   tile_fire.png        - 炎マス（32x32）
 *   enemy_oil_drum.png   - オイルドラム敵（32x32）
 *   enemy_fire_people.png - ファイヤーピーポー（32x32）
 *   boss_big_oil_drum.png - ビッグ！オイルドラム（64x64）
 *
 * 実行: node scripts/generate-oil-fire-sprites.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const SPRITES_DIR = path.join(PROJECT_ROOT, 'public', 'sprites');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function hexToRGBA(hex, alpha = 255) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: alpha,
  };
}

function createBuffer(width, height) {
  return new Uint8Array(width * height * 4);
}

function setPixel(buf, width, x, y, color) {
  const h = Math.floor(buf.length / width / 4);
  if (x < 0 || x >= width || y < 0 || y >= h) return;
  const idx = (y * width + x) * 4;
  buf[idx]     = color.r;
  buf[idx + 1] = color.g;
  buf[idx + 2] = color.b;
  buf[idx + 3] = color.a;
}

function fillRect(buf, width, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, width, x + dx, y + dy, color);
    }
  }
}

function fillCircle(buf, width, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(buf, width, cx + dx, cy + dy, color);
      }
    }
  }
}

function fillEllipse(buf, width, cx, cy, rx, ry, color) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0) {
        setPixel(buf, width, cx + dx, cy + dy, color);
      }
    }
  }
}

async function savePNG(buf, width, height, filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(buf), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

// ---------------------------------------------------------------------------
// tile_oil.png - オイルマス（32x32）
// ---------------------------------------------------------------------------

async function generateTileOil() {
  const S = 32;
  const buf = createBuffer(S, S);

  const floor    = hexToRGBA('#3a3a3a');
  const oil1     = hexToRGBA('#1a1a1a');
  const oil2     = hexToRGBA('#2d2d2d');
  const reflect  = hexToRGBA('#4a4a5a');

  // 床を塗りつぶす
  fillRect(buf, S, 0, 0, S, S, floor);

  // 油だまり中央の大楕円（暗め）
  fillEllipse(buf, S, 16, 18, 10, 6, oil1);

  // 中楕円（少し明るめでグラデーション感）
  fillEllipse(buf, S, 16, 18, 7, 4, oil2);

  // 中心に向かう小楕円（最も暗い）
  fillEllipse(buf, S, 16, 18, 4, 2, oil1);

  // 染みの広がり: 左上方向のシミ
  fillEllipse(buf, S, 9, 12, 4, 3, oil2);
  fillEllipse(buf, S, 9, 12, 2, 2, oil1);

  // 染みの広がり: 右方向のシミ
  fillEllipse(buf, S, 23, 16, 3, 2, oil2);

  // 染みの広がり: 下方向のシミ
  fillEllipse(buf, S, 15, 24, 3, 2, oil2);

  // 端の反射光（少数の明るいドット）
  const reflectPoints = [
    [7, 11], [8, 10], [22, 14], [24, 15], [14, 25], [18, 20],
  ];
  for (const [rx, ry] of reflectPoints) {
    setPixel(buf, S, rx, ry, reflect);
  }

  const outPath = path.join(SPRITES_DIR, 'tile_oil.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// tile_fire.png - 炎マス（32x32）
// ---------------------------------------------------------------------------

async function generateTileFire() {
  const S = 32;
  const buf = createBuffer(S, S);

  const charred = hexToRGBA('#1a0a00');
  const red1    = hexToRGBA('#ff2200');
  const red2    = hexToRGBA('#ff6600');
  const orange  = hexToRGBA('#ffaa00');
  const yellow  = hexToRGBA('#ffff00');

  // 下部4行: 焦げた床
  fillRect(buf, S, 0, 28, S, 4, charred);

  // 炎のシルエット（鋸歯状）を列ごとに高さを変えて描画
  // 各X座標での炎の下端（床=28）と上端（炎の先端）を定義
  // 炎の形: コミカルな鋸歯状プロファイル
  const flameTop = [
    // x: 0-31 の炎先端Y座標（小さいほど高い）
    20, 18, 16, 14, 12, 10, 12, 8, 10, 12, 10, 8, 6, 8, 10, 8,
    10, 8,  6,  8, 10, 12, 10, 8, 10, 12, 14, 12, 16, 18, 20, 22,
  ];

  for (let x = 0; x < S; x++) {
    const topY = flameTop[x];
    for (let y = topY; y < 28; y++) {
      // 高さに応じてグラデーション色を選択
      const ratio = (y - topY) / (28 - topY);
      let color;
      if (ratio < 0.25) {
        color = yellow;
      } else if (ratio < 0.50) {
        color = orange;
      } else if (ratio < 0.75) {
        color = red2;
      } else {
        color = red1;
      }
      setPixel(buf, S, x, y, color);
    }
  }

  // 内炎のハイライト（中央付近を明るく）
  for (let x = 10; x < 22; x++) {
    const topY = flameTop[x] + 2;
    for (let y = topY; y < 26; y++) {
      const ratio = (y - topY) / (26 - topY);
      let color;
      if (ratio < 0.3) {
        color = yellow;
      } else if (ratio < 0.6) {
        color = orange;
      } else {
        color = red2;
      }
      setPixel(buf, S, x, y, color);
    }
  }

  const outPath = path.join(SPRITES_DIR, 'tile_fire.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// enemy_oil_drum.png - オイルドラム敵（32x32）
// ---------------------------------------------------------------------------

async function generateEnemyOilDrum() {
  const S = 32;
  const buf = createBuffer(S, S);

  const bodyColor  = hexToRGBA('#8b6914');
  const highlight  = hexToRGBA('#c8901a');
  const band       = hexToRGBA('#4a3008');
  const dark       = hexToRGBA('#3a2505');
  const oilSymbol  = hexToRGBA('#1a1a1a');
  const oilStain   = hexToRGBA('#0f0f0f');
  const shadow     = hexToRGBA('#2a1e04');

  // ドラム缶本体（縦向き円柱）: X=7〜24, Y=4〜27
  fillRect(buf, S, 7, 4, 18, 24, bodyColor);

  // 左右の丸み（角を暗くして円柱感を出す）
  for (let y = 4; y < 28; y++) {
    setPixel(buf, S, 7,  y, dark);
    setPixel(buf, S, 24, y, dark);
    setPixel(buf, S, 8,  y, shadow);
    setPixel(buf, S, 23, y, shadow);
  }

  // 右側ハイライト（光沢）
  for (let y = 5; y < 27; y++) {
    setPixel(buf, S, 20, y, highlight);
    setPixel(buf, S, 21, y, highlight);
  }

  // 上部の蓋
  fillRect(buf, S, 8, 4, 16, 2, highlight);
  setPixel(buf, S, 8,  4, dark);
  setPixel(buf, S, 23, 4, dark);

  // 下部の底
  fillRect(buf, S, 8, 26, 16, 2, dark);

  // 金属バンド（上: Y=8〜9, 下: Y=22〜23）
  fillRect(buf, S, 7, 8,  18, 2, band);
  fillRect(buf, S, 7, 22, 18, 2, band);

  // バンドのエッジハイライト
  for (let x = 8; x < 24; x++) {
    setPixel(buf, S, x, 8,  hexToRGBA('#6b4a10'));
    setPixel(buf, S, x, 22, hexToRGBA('#6b4a10'));
  }

  // 正面のオイル滴シンボル（中央）
  // 丸い頭部
  fillCircle(buf, S, 16, 14, 2, oilSymbol);
  // 下に伸びる雫の形
  setPixel(buf, S, 15, 16, oilSymbol);
  setPixel(buf, S, 16, 16, oilSymbol);
  setPixel(buf, S, 17, 16, oilSymbol);
  setPixel(buf, S, 15, 17, oilSymbol);
  setPixel(buf, S, 16, 17, oilSymbol);
  setPixel(buf, S, 17, 17, oilSymbol);
  setPixel(buf, S, 16, 18, oilSymbol);

  // 下部に油が滲み出ている様子
  fillRect(buf, S, 10, 27, 12, 1, oilStain);
  fillEllipse(buf, S, 16, 29, 6, 2, oilStain);
  setPixel(buf, S, 13, 28, oilStain);
  setPixel(buf, S, 16, 28, oilStain);
  setPixel(buf, S, 19, 28, oilStain);

  const outPath = path.join(SPRITES_DIR, 'enemy_oil_drum.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// enemy_fire_people.png - ファイヤーピーポー（32x32）
// ---------------------------------------------------------------------------

async function generateEnemyFirePeople() {
  const S = 32;
  const buf = createBuffer(S, S);

  const body   = hexToRGBA('#cc2200');
  const aura1  = hexToRGBA('#ff6600');
  const aura2  = hexToRGBA('#ffaa00');
  const eye    = hexToRGBA('#ffffff');
  const dark   = hexToRGBA('#880000');
  const trans  = hexToRGBA('#000000', 0);

  // --- 炎オーラ（外周の揺らぎ）---
  // 頭部オーラ
  fillEllipse(buf, S, 16, 8, 8, 9, aura2);
  fillEllipse(buf, S, 16, 8, 6, 7, aura1);

  // 体オーラ
  fillEllipse(buf, S, 16, 20, 8, 10, aura2);
  fillEllipse(buf, S, 16, 20, 6, 8,  aura1);

  // 腕オーラ（左右）
  fillEllipse(buf, S, 8,  18, 5, 4, aura2);
  fillEllipse(buf, S, 24, 18, 5, 4, aura2);

  // --- 人型シルエット本体 ---
  // 頭
  fillEllipse(buf, S, 16, 9, 5, 5, body);

  // 首
  fillRect(buf, S, 14, 14, 4, 2, body);

  // 胴体
  fillRect(buf, S, 11, 16, 10, 10, body);

  // 腕（左右）
  fillRect(buf, S, 6, 16, 5, 8, body);
  fillRect(buf, S, 21, 16, 5, 8, body);

  // 脚（左右）
  fillRect(buf, S, 11, 26, 4, 5, body);
  fillRect(buf, S, 17, 26, 4, 5, body);

  // 胴体の暗い輪郭（立体感）
  for (let y = 16; y < 26; y++) {
    setPixel(buf, S, 11, y, dark);
    setPixel(buf, S, 20, y, dark);
  }

  // --- 炎の揺らぎ（体の周囲に小さな炎ドット）---
  const flamePixels = [
    [10, 6], [14, 3], [18, 3], [22, 7],
    [5, 14], [27, 14], [5, 22], [27, 22],
    [9, 28], [23, 28], [14, 31], [18, 31],
  ];
  for (const [fx, fy] of flamePixels) {
    if (fx >= 0 && fx < S && fy >= 0 && fy < S) {
      setPixel(buf, S, fx, fy, aura1);
    }
  }

  // --- 目（白い2点）---
  fillCircle(buf, S, 14, 8, 1, eye);
  fillCircle(buf, S, 18, 8, 1, eye);

  const outPath = path.join(SPRITES_DIR, 'enemy_fire_people.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// boss_big_oil_drum.png - ビッグ！オイルドラム（64x64）
// ---------------------------------------------------------------------------

async function generateBossBigOilDrum() {
  const S = 64;
  const buf = createBuffer(S, S);

  const bodyColor = hexToRGBA('#8b6914');
  const highlight = hexToRGBA('#c8901a');
  const band      = hexToRGBA('#4a3008');
  const bandLight = hexToRGBA('#6b4a10');
  const dark      = hexToRGBA('#3a2505');
  const shadow    = hexToRGBA('#2a1e04');
  const eyeColor  = hexToRGBA('#ffff00');
  const eyeDark   = hexToRGBA('#aa8800');
  const oilBlack  = hexToRGBA('#1a1a1a');
  const rivet     = hexToRGBA('#5a4010');
  const rivetHi   = hexToRGBA('#d4a020');

  // ドラム缶本体: X=8〜55, Y=6〜57
  fillRect(buf, S, 8, 6, 48, 52, bodyColor);

  // 左右の丸み（円柱感）
  for (let y = 6; y < 58; y++) {
    setPixel(buf, S, 8,  y, dark);
    setPixel(buf, S, 9,  y, shadow);
    setPixel(buf, S, 55, y, dark);
    setPixel(buf, S, 54, y, shadow);
  }

  // 右側ハイライト（光沢ライン 2本）
  for (let y = 7; y < 57; y++) {
    setPixel(buf, S, 44, y, highlight);
    setPixel(buf, S, 45, y, highlight);
    setPixel(buf, S, 46, y, hexToRGBA('#d4a020'));
  }

  // 左側の影
  for (let y = 7; y < 57; y++) {
    setPixel(buf, S, 10, y, shadow);
    setPixel(buf, S, 11, y, shadow);
  }

  // 上部の蓋
  fillRect(buf, S, 10, 6,  44, 4, highlight);
  // 蓋の端
  setPixel(buf, S, 10, 6, dark);
  setPixel(buf, S, 53, 6, dark);
  fillRect(buf, S, 10, 6, 44, 1, hexToRGBA('#d4a020'));

  // 下部の底
  fillRect(buf, S, 10, 57, 44, 3, dark);

  // 金属バンド（上に2本: Y=14〜16, Y=20〜22、下に2本: Y=42〜44, Y=48〜50）
  fillRect(buf, S, 8,  14, 48, 3, band);
  fillRect(buf, S, 8,  20, 48, 3, band);
  fillRect(buf, S, 8,  42, 48, 3, band);
  fillRect(buf, S, 8,  48, 48, 3, band);

  // バンドのエッジハイライト
  for (let x = 9; x < 55; x++) {
    setPixel(buf, S, x, 14, bandLight);
    setPixel(buf, S, x, 20, bandLight);
    setPixel(buf, S, x, 42, bandLight);
    setPixel(buf, S, x, 48, bandLight);
  }

  // リベット（ボルト）- ドラム本体の縦線付近
  const rivetPositions = [
    [12, 10], [51, 10], [12, 56], [51, 56],
    [12, 25], [51, 25], [12, 38], [51, 38],
  ];
  for (const [rx, ry] of rivetPositions) {
    setPixel(buf, S, rx,     ry,     rivet);
    setPixel(buf, S, rx + 1, ry,     rivetHi);
    setPixel(buf, S, rx,     ry + 1, rivet);
    setPixel(buf, S, rx + 1, ry + 1, rivet);
  }

  // --- 顔：黄色い目（2つの丸）---
  // 左目
  fillCircle(buf, S, 23, 32, 5, eyeColor);
  fillCircle(buf, S, 23, 32, 3, hexToRGBA('#ffff88'));
  fillCircle(buf, S, 22, 31, 2, eyeDark);

  // 右目
  fillCircle(buf, S, 41, 32, 5, eyeColor);
  fillCircle(buf, S, 41, 32, 3, hexToRGBA('#ffff88'));
  fillCircle(buf, S, 40, 31, 2, eyeDark);

  // 目の外枠（黒）
  for (let angle = 0; angle < 360; angle += 10) {
    const rad = angle * Math.PI / 180;
    const ex1 = Math.round(23 + 5 * Math.cos(rad));
    const ey1 = Math.round(32 + 5 * Math.sin(rad));
    setPixel(buf, S, ex1, ey1, dark);
    const ex2 = Math.round(41 + 5 * Math.cos(rad));
    const ey2 = Math.round(32 + 5 * Math.sin(rad));
    setPixel(buf, S, ex2, ey2, dark);
  }

  // --- 口のような横線（コミカルな顔）---
  fillRect(buf, S, 20, 39, 24, 2, dark);
  // 口の端を丸める
  setPixel(buf, S, 20, 39, shadow);
  setPixel(buf, S, 43, 39, shadow);

  // --- 周囲に油が飛び散る（黒いドット）---
  const oilSplats = [
    // 左上周辺
    [2, 8],  [3, 6],  [5, 4],
    [1, 15], [3, 18],
    // 右上周辺
    [60, 8],  [61, 6],  [59, 4],
    [62, 15], [60, 18],
    // 左下周辺
    [2, 50],  [3, 54],  [1, 58],
    [4, 60],  [5, 62],
    // 右下周辺
    [61, 50], [60, 54], [62, 58],
    [59, 60], [58, 62],
    // 上方向
    [20, 2], [28, 1], [36, 2], [44, 1],
    // 下方向（油だまり）
    [16, 61], [22, 62], [32, 63], [42, 62], [48, 61],
  ];
  for (const [ox, oy] of oilSplats) {
    if (ox >= 0 && ox < S && oy >= 0 && oy < S) {
      setPixel(buf, S, ox, oy, oilBlack);
      if (ox + 1 < S) setPixel(buf, S, ox + 1, oy, oilBlack);
    }
  }

  // 下部油だまり（楕円形）
  fillEllipse(buf, S, 32, 61, 18, 3, oilBlack);

  const outPath = path.join(SPRITES_DIR, 'boss_big_oil_drum.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('Generating oil/fire sprites...');
  fs.mkdirSync(SPRITES_DIR, { recursive: true });

  await generateTileOil();
  await generateTileFire();
  await generateEnemyOilDrum();
  await generateEnemyFirePeople();
  await generateBossBigOilDrum();

  console.log('Done. All sprites saved to:', SPRITES_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
