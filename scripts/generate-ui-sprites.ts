/**
 * @fileoverview メカローグ UI スプライト生成スクリプト
 *
 * NPC キャラクター・UI パーツのドット絵 PNG を sharp で生成する。
 *
 * 実行: node --experimental-strip-types scripts/generate-ui-sprites.ts
 *      または: npx tsx scripts/generate-ui-sprites.ts
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** タイルの基本サイズ（px） */
const TILE_SIZE = 32;

/** プロジェクトルート（このスクリプトの1階層上） */
const PROJECT_ROOT = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
);

/** スプライト出力ルート */
const SPRITES_DIR = path.join(PROJECT_ROOT, 'public', 'sprites');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** RGBA ピクセル（各チャンネル 0-255） */
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 16進カラー文字列を RGBA に変換する。
 * @param hex - "#rrggbb" 形式
 * @param alpha - アルファ値（0-255）
 */
function hexToRGBA(hex: string, alpha = 255): RGBA {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: alpha,
  };
}

/**
 * 空の RGBA バッファ（全透明）を作成する。
 */
function createBuffer(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

/**
 * バッファの特定ピクセルに色を書き込む。
 */
function setPixel(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: RGBA,
): void {
  const height = Math.floor(buf.length / width / 4);
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  buf[idx]     = color.r;
  buf[idx + 1] = color.g;
  buf[idx + 2] = color.b;
  buf[idx + 3] = color.a;
}

/**
 * バッファに矩形を塗りつぶす。
 */
function fillRect(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, width, x + dx, y + dy, color);
    }
  }
}

/**
 * バッファに水平線を引く。
 */
function hLine(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  len: number,
  color: RGBA,
): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x + i, y, color);
}

/**
 * バッファに垂直線を引く。
 */
function vLine(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  len: number,
  color: RGBA,
): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x, y + i, color);
}

/**
 * バッファに枠線（矩形のアウトライン）を描画する。
 */
function strokeRect(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA,
): void {
  hLine(buf, width, x, y, w, color);
  hLine(buf, width, x, y + h - 1, w, color);
  vLine(buf, width, x, y, h, color);
  vLine(buf, width, x + w - 1, y, h, color);
}

/**
 * PNG ファイルを sharp 経由で保存する。
 */
async function savePNG(
  buf: Uint8Array,
  width: number,
  height: number,
  filePath: string,
): Promise<void> {
  await sharp(Buffer.from(buf), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

/**
 * ディレクトリを再帰的に作成する（存在する場合はスキップ）。
 */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// NPC スプライト生成
// ---------------------------------------------------------------------------

/**
 * ショップ NPC（shop_npc.png）を生成する。
 * 金色ベースのメカ系ロボット店員。帽子/バイザー付き、胴体に $ マーク。
 */
async function generateShopNpc(outDir: string): Promise<void> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  const gold     = hexToRGBA('#cc9900');
  const goldDark = hexToRGBA('#996600');
  const goldLight= hexToRGBA('#ffcc33');
  const white    = hexToRGBA('#ffffff');
  const gray     = hexToRGBA('#888888');
  const dark     = hexToRGBA('#222222');
  const visor    = hexToRGBA('#44aaff', 200);

  // --- 帽子（y=2〜7）---
  // つばの部分
  fillRect(buf, S, 8, 6, 16, 2, goldDark);
  // 帽子本体
  fillRect(buf, S, 10, 2, 12, 5, gold);
  // 帽子の縁ライン
  hLine(buf, S, 10, 2, 12, goldLight);

  // --- 頭部（y=8〜14）---
  fillRect(buf, S, 9, 8, 14, 7, gold);
  // 頭部アウトライン
  strokeRect(buf, S, 9, 8, 14, 7, dark);
  // バイザー（横長スリット）
  fillRect(buf, S, 11, 10, 10, 3, visor);
  hLine(buf, S, 11, 10, 10, goldLight);
  hLine(buf, S, 11, 12, 10, goldLight);

  // --- 首（y=15〜16）---
  fillRect(buf, S, 13, 15, 6, 2, goldDark);

  // --- 胴体（y=17〜26）---
  fillRect(buf, S, 8, 17, 16, 10, gold);
  strokeRect(buf, S, 8, 17, 16, 10, dark);
  // 胴体の縦パネルライン
  vLine(buf, S, 16, 18, 8, goldLight);
  // 胴体に「$」マーク（3×5 px のドット文字）
  // S の縦棒
  vLine(buf, S, 16, 19, 7, dark);
  // $ の横バー
  hLine(buf, S, 14, 19, 5, dark);
  hLine(buf, S, 14, 21, 5, dark);
  hLine(buf, S, 14, 23, 5, dark);
  // $ の縦補助棒（上半分は左に、下半分は右に）
  vLine(buf, S, 14, 19, 3, dark);
  vLine(buf, S, 18, 21, 3, dark);
  // 縦の中心線（$ のポール）
  setPixel(buf, S, 16, 18, white);
  setPixel(buf, S, 16, 24, white);

  // --- 左腕（y=17〜23）---
  fillRect(buf, S, 4, 17, 4, 7, gold);
  strokeRect(buf, S, 4, 17, 4, 7, dark);
  // 手部分
  fillRect(buf, S, 3, 23, 5, 3, goldDark);
  strokeRect(buf, S, 3, 23, 5, 3, dark);

  // --- 右腕（y=17〜23）---
  fillRect(buf, S, 24, 17, 4, 7, gold);
  strokeRect(buf, S, 24, 17, 4, 7, dark);
  // 手部分
  fillRect(buf, S, 24, 23, 5, 3, goldDark);
  strokeRect(buf, S, 24, 23, 5, 3, dark);

  // --- 脚（y=27〜31）---
  // 左脚
  fillRect(buf, S, 10, 27, 5, 5, goldDark);
  strokeRect(buf, S, 10, 27, 5, 5, dark);
  // 右脚
  fillRect(buf, S, 17, 27, 5, 5, goldDark);
  strokeRect(buf, S, 17, 27, 5, 5, dark);

  // --- アクセント（肩に白ドット）---
  setPixel(buf, S, 9, 17, white);
  setPixel(buf, S, 22, 17, white);
  setPixel(buf, S, 9, 18, gray);
  setPixel(buf, S, 22, 18, gray);

  await savePNG(buf, S, S, path.join(outDir, 'shop_npc.png'));
  console.log('  generated: shop_npc.png');
}

/**
 * 倉庫 NPC（storage_npc.png）を生成する。
 * 青みがかったグレーの金属製収納ロッカー。鍵穴アイコン付き。
 */
async function generateStorageNpc(outDir: string): Promise<void> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  const base     = hexToRGBA('#445566');
  const baseDark = hexToRGBA('#2a3a4a');
  const edge     = hexToRGBA('#88aacc');
  const edgeLight= hexToRGBA('#aaccee');
  const dark     = hexToRGBA('#1a2a3a');
  const keyColor = hexToRGBA('#ffdd44');
  const shadow   = hexToRGBA('#334455');

  // --- ロッカー本体（y=2〜29）---
  fillRect(buf, S, 4, 2, 24, 28, base);
  strokeRect(buf, S, 4, 2, 24, 28, dark);

  // --- エッジハイライト（左上に光沢ライン）---
  vLine(buf, S, 5, 3, 26, edge);
  hLine(buf, S, 5, 3, 22, edge);

  // --- 影（右下）---
  vLine(buf, S, 27, 3, 26, shadow);
  hLine(buf, S, 5, 29, 22, shadow);

  // --- 上下2段のドア仕切り線 ---
  hLine(buf, S, 5, 16, 22, edgeLight);
  hLine(buf, S, 5, 17, 22, dark);

  // --- 上段パネル（y=4〜14）---
  fillRect(buf, S, 6, 4, 20, 11, baseDark);
  strokeRect(buf, S, 6, 4, 20, 11, edge);

  // --- 下段パネル（y=18〜28）---
  fillRect(buf, S, 6, 18, 20, 10, baseDark);
  strokeRect(buf, S, 6, 18, 20, 10, edge);

  // --- 鍵穴アイコン（上段中央、y=6〜13）---
  // 鍵穴の円部分（5×5）
  const kx = 14;  // 鍵穴の中心 X
  const ky = 8;   // 鍵穴の中心 Y
  // 外円
  setPixel(buf, S, kx - 1, ky - 2, keyColor);
  setPixel(buf, S, kx,     ky - 2, keyColor);
  setPixel(buf, S, kx + 1, ky - 2, keyColor);
  setPixel(buf, S, kx - 2, ky - 1, keyColor);
  setPixel(buf, S, kx + 2, ky - 1, keyColor);
  setPixel(buf, S, kx - 2, ky,     keyColor);
  setPixel(buf, S, kx + 2, ky,     keyColor);
  setPixel(buf, S, kx - 2, ky + 1, keyColor);
  setPixel(buf, S, kx + 2, ky + 1, keyColor);
  setPixel(buf, S, kx - 1, ky + 2, keyColor);
  setPixel(buf, S, kx,     ky + 2, keyColor);
  setPixel(buf, S, kx + 1, ky + 2, keyColor);
  // 鍵穴スリット（下向きの小さな長方形）
  setPixel(buf, S, kx - 1, ky + 3, keyColor);
  setPixel(buf, S, kx,     ky + 3, keyColor);
  setPixel(buf, S, kx + 1, ky + 3, keyColor);
  setPixel(buf, S, kx - 1, ky + 4, keyColor);
  setPixel(buf, S, kx + 1, ky + 4, keyColor);
  setPixel(buf, S, kx - 1, ky + 5, keyColor);
  setPixel(buf, S, kx,     ky + 5, keyColor);
  setPixel(buf, S, kx + 1, ky + 5, keyColor);

  // --- 下段に格子状パネルライン ---
  vLine(buf, S, 16, 19, 8, edge);
  hLine(buf, S, 7, 22, 18, edge);
  hLine(buf, S, 7, 25, 18, edge);

  // --- 蝶番（左端に小さな矩形）---
  fillRect(buf, S, 5, 5, 2, 3, edgeLight);
  fillRect(buf, S, 5, 10, 2, 3, edgeLight);
  fillRect(buf, S, 5, 19, 2, 3, edgeLight);
  fillRect(buf, S, 5, 24, 2, 3, edgeLight);

  await savePNG(buf, S, S, path.join(outDir, 'storage_npc.png'));
  console.log('  generated: storage_npc.png');
}

// ---------------------------------------------------------------------------
// UI パーツ生成
// ---------------------------------------------------------------------------

/**
 * パネル背景タイル（panel_bg.png）を生成する。
 * 暗い青紫 + ガラス風光沢。
 */
async function generatePanelBg(outDir: string): Promise<void> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  const bg     = hexToRGBA('#1a1a2e', 220);
  const border = hexToRGBA('#445566', 255);
  const gloss  = hexToRGBA('#6677aa', 80);
  const corner = hexToRGBA('#556688', 255);

  // 背景塗りつぶし
  fillRect(buf, S, 0, 0, S, S, bg);

  // 外枠ボーダー
  strokeRect(buf, S, 0, 0, S, S, border);

  // 左上の光沢ライン（ガラス感）
  for (let i = 1; i < S - 1; i++) {
    setPixel(buf, S, i, 1, gloss);
    setPixel(buf, S, 1, i, gloss);
  }

  // 内側の薄いボーダー
  strokeRect(buf, S, 2, 2, S - 4, S - 4, hexToRGBA('#2a2a4a', 180));

  // コーナー強調
  setPixel(buf, S, 0, 0, corner);
  setPixel(buf, S, S - 1, 0, corner);
  setPixel(buf, S, 0, S - 1, corner);
  setPixel(buf, S, S - 1, S - 1, corner);

  // 右下に微妙な影グラデーション
  for (let i = 0; i < 4; i++) {
    const shadow = hexToRGBA('#000000', 30 + i * 15);
    hLine(buf, S, 1, S - 2 - i, S - 2, shadow);
    vLine(buf, S, S - 2 - i, 1, S - 2, shadow);
  }

  await savePNG(buf, S, S, path.join(outDir, 'panel_bg.png'));
  console.log('  generated: panel_bg.png');
}

/**
 * 通常ボタン（button_normal.png）を生成する。
 * 80×32px、暗いグラデーション + ボーダー、角丸風。
 */
async function generateButtonNormal(outDir: string): Promise<void> {
  const W = 80;
  const H = 32;
  const buf = createBuffer(W, H);

  const bgTop    = hexToRGBA('#2a2a4a');
  const bgBot    = hexToRGBA('#1a1a3a');
  const border   = hexToRGBA('#556688');
  const gloss    = hexToRGBA('#3a3a5a', 180);
  const corner   = hexToRGBA('#000000', 0);  // 透明（角丸の見た目）

  // グラデーション（上から下へ）
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const color: RGBA = {
      r: Math.round(bgTop.r + (bgBot.r - bgTop.r) * t),
      g: Math.round(bgTop.g + (bgBot.g - bgTop.g) * t),
      b: Math.round(bgTop.b + (bgBot.b - bgTop.b) * t),
      a: 255,
    };
    hLine(buf, W, 0, y, W, color);
  }

  // ボーダー
  strokeRect(buf, W, 0, 0, W, H, border);

  // 角丸エミュレート（四隅 2px を透明にする）
  for (let corner_r = 0; corner_r < 4; corner_r++) {
    const mask = 4 - corner_r;
    // 左上
    fillRect(buf, W, 0, 0, mask, 1, corner);
    fillRect(buf, W, 0, 0, 1, mask, corner);
    // 右上
    fillRect(buf, W, W - mask, 0, mask, 1, corner);
    fillRect(buf, W, W - 1, 0, 1, mask, corner);
    // 左下
    fillRect(buf, W, 0, H - 1, mask, 1, corner);
    fillRect(buf, W, 0, H - mask, 1, mask, corner);
    // 右下
    fillRect(buf, W, W - mask, H - 1, mask, 1, corner);
    fillRect(buf, W, W - 1, H - mask, 1, mask, corner);
    break;  // 1回だけ実行（ループ不要、コード構造維持のため）
  }

  // 上部の光沢ライン
  hLine(buf, W, 2, 1, W - 4, gloss);

  // 内側ハイライト（左上角）
  setPixel(buf, W, 2, 2, hexToRGBA('#4a4a6a'));

  await savePNG(buf, W, H, path.join(outDir, 'button_normal.png'));
  console.log('  generated: button_normal.png');
}

/**
 * 選択状態ボタン（button_selected.png）を生成する。
 * 80×32px、青グラデーション + 発光ボーダー。
 */
async function generateButtonSelected(outDir: string): Promise<void> {
  const W = 80;
  const H = 32;
  const buf = createBuffer(W, H);

  const bgTop  = hexToRGBA('#225588');
  const bgBot  = hexToRGBA('#113366');
  const border = hexToRGBA('#44aaff');
  const glow   = hexToRGBA('#44aaff', 120);
  const gloss  = hexToRGBA('#55bbff', 160);
  const corner = hexToRGBA('#000000', 0);

  // グラデーション（上から下へ）
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const color: RGBA = {
      r: Math.round(bgTop.r + (bgBot.r - bgTop.r) * t),
      g: Math.round(bgTop.g + (bgBot.g - bgTop.g) * t),
      b: Math.round(bgTop.b + (bgBot.b - bgTop.b) * t),
      a: 255,
    };
    hLine(buf, W, 0, y, W, color);
  }

  // ボーダー（発光）
  strokeRect(buf, W, 0, 0, W, H, border);

  // 発光エフェクト（ボーダーの内側にも薄い光）
  strokeRect(buf, W, 1, 1, W - 2, H - 2, glow);

  // 角丸エミュレート
  fillRect(buf, W, 0, 0, 4, 1, corner);
  fillRect(buf, W, 0, 0, 1, 4, corner);
  fillRect(buf, W, W - 4, 0, 4, 1, corner);
  fillRect(buf, W, W - 1, 0, 1, 4, corner);
  fillRect(buf, W, 0, H - 1, 4, 1, corner);
  fillRect(buf, W, 0, H - 4, 1, 4, corner);
  fillRect(buf, W, W - 4, H - 1, 4, 1, corner);
  fillRect(buf, W, W - 1, H - 4, 1, 4, corner);

  // 上部の光沢ライン
  hLine(buf, W, 2, 1, W - 4, gloss);

  // 下部の発光
  hLine(buf, W, 2, H - 2, W - 4, glow);

  await savePNG(buf, W, H, path.join(outDir, 'button_selected.png'));
  console.log('  generated: button_selected.png');
}

/**
 * 剣アイコン（icon_sword.png）を生成する。
 * 白い剣 + 金のハンドル、透明背景。
 */
async function generateIconSword(outDir: string): Promise<void> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  const blade    = hexToRGBA('#eeeeee');
  const bladeEdge= hexToRGBA('#aaaaaa');
  const handle   = hexToRGBA('#ccaa00');
  const handleDk = hexToRGBA('#996600');
  const guard    = hexToRGBA('#ddbb11');
  const guardDk  = hexToRGBA('#aa8800');
  const tip      = hexToRGBA('#ffffff');

  // --- 剣身（斜め45度、左下→右上）---
  // 刃本体（2px幅の斜め線）
  for (let i = 0; i < 16; i++) {
    setPixel(buf, S, 7 + i, 22 - i, blade);
    setPixel(buf, S, 8 + i, 22 - i, blade);
    setPixel(buf, S, 7 + i, 21 - i, bladeEdge);
  }

  // 剣先（右上）
  setPixel(buf, S, 23, 6, tip);
  setPixel(buf, S, 24, 5, tip);
  setPixel(buf, S, 23, 5, bladeEdge);

  // --- 鍔（cross guard）（斜めの横棒）---
  for (let i = -3; i <= 3; i++) {
    setPixel(buf, S, 12 + i, 18 - i, guard);
    setPixel(buf, S, 11 + i, 18 - i, guardDk);
  }

  // --- グリップ（ハンドル）---
  for (let i = 0; i < 6; i++) {
    setPixel(buf, S, 5 + i, 24 + i, handle);
    setPixel(buf, S, 6 + i, 24 + i, handle);
    setPixel(buf, S, 5 + i, 25 + i, handleDk);
  }

  // --- ポメル（柄頭）---
  fillRect(buf, S, 4, 29, 3, 3, handleDk);
  setPixel(buf, S, 5, 29, handle);
  setPixel(buf, S, 5, 30, handle);

  await savePNG(buf, S, S, path.join(outDir, 'icon_sword.png'));
  console.log('  generated: icon_sword.png');
}

/**
 * アイテムアイコン（icon_item.png）を生成する。
 * 緑のカプセル + 白の＋マーク、透明背景。
 */
async function generateIconItem(outDir: string): Promise<void> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  const green     = hexToRGBA('#44cc66');
  const greenDark = hexToRGBA('#228844');
  const greenLight= hexToRGBA('#66ee88');
  const white     = hexToRGBA('#ffffff');
  const dark      = hexToRGBA('#115522');

  // --- カプセル本体（角丸の楕円形）---
  // 中心: (16, 16)、楕円 10×13
  const cx = 16;
  const cy = 16;
  const rx = 9;
  const ry = 12;

  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) {
        // 上半分：明るい緑、下半分：暗い緑
        const color = y < cy ? green : greenDark;
        setPixel(buf, S, x, y, color);
      }
    }
  }

  // --- アウトライン ---
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = dx * dx + dy * dy;
      if (dist > 0.85 && dist <= 1.0) {
        setPixel(buf, S, x, y, dark);
      }
    }
  }

  // --- 光沢（左上に白い楕円）---
  for (let y = cy - ry + 2; y <= cy - 2; y++) {
    for (let x = cx - rx + 2; x <= cx - 2; x++) {
      const dx = (x - (cx - 3)) / (rx * 0.45);
      const dy = (y - (cy - 5)) / (ry * 0.35);
      if (dx * dx + dy * dy <= 1.0) {
        setPixel(buf, S, x, y, hexToRGBA('#aaffcc', 160));
      }
    }
  }

  // --- 中央の仕切り線 ---
  hLine(buf, S, cx - rx + 1, cy, rx * 2 - 2, dark);
  hLine(buf, S, cx - rx + 1, cy - 1, rx * 2 - 2, greenLight);

  // --- 白の＋マーク（右下の下半分領域）---
  // + の縦棒
  vLine(buf, S, cx + 3, cy + 3, 7, white);
  // + の横棒
  hLine(buf, S, cx, cy + 6, 7, white);
  // + の中心を少し太く
  setPixel(buf, S, cx + 2, cy + 6, white);
  setPixel(buf, S, cx + 4, cy + 6, white);

  await savePNG(buf, S, S, path.join(outDir, 'icon_item.png'));
  console.log('  generated: icon_item.png');
}

/**
 * 倉庫アイコン（icon_storage.png）を生成する。
 * 青いボックス + 白い上下矢印、透明背景。
 */
async function generateIconStorage(outDir: string): Promise<void> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  const blue     = hexToRGBA('#3366aa');
  const blueDark = hexToRGBA('#224477');
  const blueLight= hexToRGBA('#5588cc');
  const white    = hexToRGBA('#ffffff');
  const dark     = hexToRGBA('#112233');

  // --- ボックス本体（y=10〜26）---
  fillRect(buf, S, 6, 10, 20, 17, blue);
  strokeRect(buf, S, 6, 10, 20, 17, dark);

  // --- エッジハイライト ---
  hLine(buf, S, 7, 11, 18, blueLight);
  vLine(buf, S, 7, 11, 15, blueLight);

  // --- 影 ---
  hLine(buf, S, 7, 26, 18, blueDark);
  vLine(buf, S, 25, 11, 15, blueDark);

  // --- 蓋のライン ---
  hLine(buf, S, 7, 16, 18, blueLight);
  hLine(buf, S, 7, 17, 18, dark);

  // --- 蓋のハンドル ---
  fillRect(buf, S, 13, 13, 6, 3, blueLight);
  strokeRect(buf, S, 13, 13, 6, 3, dark);

  // --- 上向き矢印（ y=1〜8）---
  // 矢印の先端
  setPixel(buf, S, 16, 1, white);
  hLine(buf, S, 15, 2, 3, white);
  hLine(buf, S, 14, 3, 5, white);
  hLine(buf, S, 13, 4, 7, white);
  // 矢印の軸
  vLine(buf, S, 15, 5, 4, white);
  vLine(buf, S, 16, 5, 4, white);
  vLine(buf, S, 17, 5, 4, white);

  // --- 下向き矢印（y=27〜32 の下部）は省略し、ボックス内に↓示唆ライン ---
  // 下矢印（ボックス内下部 y=20〜26）
  hLine(buf, S, 13, 20, 7, white);
  vLine(buf, S, 15, 21, 3, white);
  vLine(buf, S, 16, 21, 3, white);
  vLine(buf, S, 17, 21, 3, white);
  hLine(buf, S, 14, 24, 5, white);
  hLine(buf, S, 15, 25, 3, white);
  setPixel(buf, S, 16, 26, white);

  await savePNG(buf, S, S, path.join(outDir, 'icon_storage.png'));
  console.log('  generated: icon_storage.png');
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('UI スプライト生成開始...');

  const npcDir = path.join(SPRITES_DIR, 'npc');
  const uiDir  = path.join(SPRITES_DIR, 'ui');

  ensureDir(npcDir);
  ensureDir(uiDir);

  console.log('\n[NPC スプライト]');
  await generateShopNpc(npcDir);
  await generateStorageNpc(npcDir);

  console.log('\n[UI パーツ]');
  await generatePanelBg(uiDir);
  await generateButtonNormal(uiDir);
  await generateButtonSelected(uiDir);
  await generateIconSword(uiDir);
  await generateIconItem(uiDir);
  await generateIconStorage(uiDir);

  console.log('\n全スプライト生成完了。');
  console.log(`  NPC  -> ${npcDir}`);
  console.log(`  UI   -> ${uiDir}`);
}

main().catch((err) => {
  console.error('生成エラー:', err);
  process.exit(1);
});
