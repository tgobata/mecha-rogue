/**
 * @fileoverview ダンジョンテクスチャ生成スクリプト
 *
 * 生成対象:
 *   wall_metal.png    - SF メタル壁（256x256）
 *   floor_metal.png   - 金属グレーチング床（256x256）
 *   ceiling_metal.png - 天井（配管あり）（256x256）
 *
 * 実行: node scripts/generate-dungeon-textures.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const TEXTURES_DIR = path.join(PROJECT_ROOT, 'public', 'textures', 'dungeon');

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
// wall_metal.png - SF メタル壁（256x256）
// ---------------------------------------------------------------------------

async function generateWallMetal() {
  const S = 256;
  const buf = createBuffer(S, S);

  const base      = hexToRGBA('#2a2d3e');  // ベース色: 暗い青灰色
  const panelEdge = hexToRGBA('#1a1c2b');  // パネル境界線: 暗め
  const rivet     = hexToRGBA('#4a6080');  // リベット: 明るいグレー
  const hlTop     = hexToRGBA('#3a3f58');  // パネル上端ハイライト
  const hlRight   = hexToRGBA('#22253a');  // パネル右端ハイライト
  const circuit   = hexToRGBA('#3a5070');  // 回路パターン線

  // ベース塗りつぶし
  fillRect(buf, S, 0, 0, S, S, base);

  // 64px おきのパネル境界線（水平・垂直）
  const PANEL = 64;
  for (let i = 0; i < S; i += PANEL) {
    // 垂直線
    for (let y = 0; y < S; y++) {
      setPixel(buf, S, i, y, panelEdge);
      if (i + 1 < S) setPixel(buf, S, i + 1, y, panelEdge);
    }
    // 水平線
    for (let x = 0; x < S; x++) {
      setPixel(buf, S, x, i, panelEdge);
      if (i + 1 < S) setPixel(buf, S, x, i + 1, panelEdge);
    }
  }

  // パネル内ハイライト（上端・右端）
  for (let py = 0; py < S; py += PANEL) {
    for (let px = 0; px < S; px += PANEL) {
      // 上端ハイライト（境界線から2px内側に3px幅）
      for (let dx = 2; dx < PANEL - 2; dx++) {
        setPixel(buf, S, px + dx, py + 2, hlTop);
        setPixel(buf, S, px + dx, py + 3, hlTop);
        setPixel(buf, S, px + dx, py + 4, hlTop);
      }
      // 右端ハイライト（境界線から2px内側）
      for (let dy = 2; dy < PANEL - 2; dy++) {
        setPixel(buf, S, px + PANEL - 3, py + dy, hlRight);
        setPixel(buf, S, px + PANEL - 4, py + dy, hlRight);
      }
    }
  }

  // パネルコーナーのリベット（4x4 ドット）
  for (let cy = 0; cy < S; cy += PANEL) {
    for (let cx = 0; cx < S; cx += PANEL) {
      // コーナーより少し内側（境界線の2px内）
      const rx = cx + 4;
      const ry = cy + 4;
      fillRect(buf, S, rx, ry, 4, 4, rivet);
      // リベットのハイライト（左上の1px）
      setPixel(buf, S, rx, ry, hexToRGBA('#6a90b0'));
    }
  }

  // 中央パネル（[1,1]: 64〜128 x 64〜128）に機械的なアクセント（回路パターン風）
  const panels = [
    { px: 64, py: 64 },
    { px: 128, py: 128 },
    { px: 64, py: 192 },
    { px: 192, py: 64 },
  ];
  for (const { px, py } of panels) {
    // 横線
    for (let dx = 8; dx < PANEL - 8; dx++) {
      setPixel(buf, S, px + dx, py + 24, circuit);
      setPixel(buf, S, px + dx, py + 40, circuit);
    }
    // 縦線
    for (let dy = 8; dy < PANEL - 8; dy++) {
      setPixel(buf, S, px + 20, py + dy, circuit);
      setPixel(buf, S, px + 44, py + dy, circuit);
    }
    // 交点の小さな四角（ノード）
    fillRect(buf, S, px + 18, py + 22, 4, 4, circuit);
    fillRect(buf, S, px + 42, py + 22, 4, 4, circuit);
    fillRect(buf, S, px + 18, py + 38, 4, 4, circuit);
    fillRect(buf, S, px + 42, py + 38, 4, 4, circuit);
    // 中央に小さなドット
    fillRect(buf, S, px + 30, py + 30, 4, 4, circuit);
  }

  const outPath = path.join(TEXTURES_DIR, 'wall_metal.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// floor_metal.png - 金属グレーチング床（256x256）
// ---------------------------------------------------------------------------

async function generateFloorMetal() {
  const S = 256;
  const buf = createBuffer(S, S);

  const base       = hexToRGBA('#1a1c26');  // ベース: 暗い
  const gridLine   = hexToRGBA('#0d0f18');  // 格子線: より暗く
  const intersection = hexToRGBA('#2a2d3e'); // 交点ドット

  // ベース塗りつぶし
  fillRect(buf, S, 0, 0, S, S, base);

  // 16px グリッドの格子線
  const GRID = 16;
  for (let i = 0; i < S; i += GRID) {
    // 垂直線
    for (let y = 0; y < S; y++) {
      setPixel(buf, S, i, y, gridLine);
    }
    // 水平線
    for (let x = 0; x < S; x++) {
      setPixel(buf, S, x, i, gridLine);
    }
  }

  // 格子交点に小さなドット（2x2）
  for (let gy = 0; gy < S; gy += GRID) {
    for (let gx = 0; gx < S; gx += GRID) {
      setPixel(buf, S, gx,     gy,     intersection);
      setPixel(buf, S, gx + 1, gy,     intersection);
      setPixel(buf, S, gx,     gy + 1, intersection);
      setPixel(buf, S, gx + 1, gy + 1, intersection);
    }
  }

  const outPath = path.join(TEXTURES_DIR, 'floor_metal.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// ceiling_metal.png - 天井（配管あり）（256x256）
// ---------------------------------------------------------------------------

async function generateCeilingMetal() {
  const S = 256;
  const buf = createBuffer(S, S);

  const base   = hexToRGBA('#12141e');  // ベース: 非常に暗い
  const pipe   = hexToRGBA('#2a2d3e');  // 配管本体
  const pipeDk = hexToRGBA('#1a1c2b');  // 配管の影側
  const flange = hexToRGBA('#3a4050');  // フランジ（接続部）
  const flangeEdge = hexToRGBA('#22253a'); // フランジのエッジ

  // ベース塗りつぶし
  fillRect(buf, S, 0, 0, S, S, base);

  // 左配管: X=48〜55（太さ8px）
  const PIPE_LEFT_X  = 48;
  const PIPE_RIGHT_X = 200;
  const PIPE_W = 8;

  for (let y = 0; y < S; y++) {
    // 左配管
    fillRect(buf, S, PIPE_LEFT_X,  y, PIPE_W, 1, pipe);
    // 左配管の上側（明るめ）
    setPixel(buf, S, PIPE_LEFT_X, y, hexToRGBA('#3a3f58'));
    // 左配管の下側（暗め）
    setPixel(buf, S, PIPE_LEFT_X + PIPE_W - 1, y, pipeDk);

    // 右配管
    fillRect(buf, S, PIPE_RIGHT_X, y, PIPE_W, 1, pipe);
    setPixel(buf, S, PIPE_RIGHT_X, y, hexToRGBA('#3a3f58'));
    setPixel(buf, S, PIPE_RIGHT_X + PIPE_W - 1, y, pipeDk);
  }

  // フランジ（接続部）を等間隔（64px おき）で描画
  const FLANGE_INTERVAL = 64;
  const FLANGE_W = 14;  // フランジの幅（配管より広く）
  const FLANGE_H = 6;   // フランジの高さ

  for (let fy = 16; fy < S; fy += FLANGE_INTERVAL) {
    // 左配管フランジ
    const lx = PIPE_LEFT_X - (FLANGE_W - PIPE_W) / 2;
    fillRect(buf, S, lx, fy, FLANGE_W, FLANGE_H, flange);
    // フランジのエッジ（上下に1px暗い線）
    for (let dx = 0; dx < FLANGE_W; dx++) {
      setPixel(buf, S, lx + dx, fy, flangeEdge);
      setPixel(buf, S, lx + dx, fy + FLANGE_H - 1, flangeEdge);
    }

    // 右配管フランジ
    const rx = PIPE_RIGHT_X - (FLANGE_W - PIPE_W) / 2;
    fillRect(buf, S, rx, fy, FLANGE_W, FLANGE_H, flange);
    for (let dx = 0; dx < FLANGE_W; dx++) {
      setPixel(buf, S, rx + dx, fy, flangeEdge);
      setPixel(buf, S, rx + dx, fy + FLANGE_H - 1, flangeEdge);
    }
  }

  const outPath = path.join(TEXTURES_DIR, 'ceiling_metal.png');
  await savePNG(buf, S, S, outPath);
  console.log('Generated:', outPath);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('Generating dungeon textures...');
  fs.mkdirSync(TEXTURES_DIR, { recursive: true });

  await generateWallMetal();
  await generateFloorMetal();
  await generateCeilingMetal();

  console.log('Done. All textures saved to:', TEXTURES_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
