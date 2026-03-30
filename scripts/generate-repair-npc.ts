/**
 * @fileoverview メカローグ 修理屋 NPC スプライト生成スクリプト
 *
 * 修理屋 NPC（repair_npc.png）のドット絵 PNG を sharp で生成する。
 * シアン/ライトブルー系の整備士ロボット。レンチ工具を右手に持つ。
 *
 * 実行: node --experimental-strip-types scripts/generate-repair-npc.ts
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

/** スプライト出力先 */
const NPC_DIR = path.join(PROJECT_ROOT, 'public', 'sprites', 'npc');

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
// 修理屋 NPC スプライト生成
// ---------------------------------------------------------------------------

/**
 * 修理屋 NPC（repair_npc.png）を生成する。
 *
 * シアン/ライトブルー系の整備士ロボット。
 * - ゴーグル付きヘルメット（シアン地に濃いバイザー）
 * - 作業着（水色）胴体、左胸に修理アイコン（レンチマーク）
 * - 右手にレンチ工具
 * - 左手は作業グリップ
 * - 脚は白/シルバー系ブーツ
 */
async function generateRepairNpc(outDir: string): Promise<void> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  // カラーパレット（シアン/ライトブルー系）
  const cyan       = hexToRGBA('#00ccdd');
  const cyanLight  = hexToRGBA('#55eeff');
  const cyanDark   = hexToRGBA('#007788');
  const bodyBlue   = hexToRGBA('#88ddee');
  const bodyBlueDk = hexToRGBA('#44aabb');
  const visor      = hexToRGBA('#002244', 230);
  const visorGlow  = hexToRGBA('#0066ff', 200);
  const white      = hexToRGBA('#eeeeff');
  const silver     = hexToRGBA('#aabbcc');
  const silverDk   = hexToRGBA('#778899');
  const dark       = hexToRGBA('#112233');
  const yellow     = hexToRGBA('#ffdd44');  // レンチの差し色
  const orange     = hexToRGBA('#ff8822');  // 警戒色アクセント
  const stripe     = hexToRGBA('#ffcc00');  // 安全ストライプ

  // ==========================================================================
  // ヘルメット（y=1〜13）
  // ==========================================================================

  // ヘルメット本体（丸みのある形）
  // y=1: 上部の細い帽体
  hLine(buf, S, 11, 1, 10, cyanDark);
  // y=2〜3: ヘルメット頂部
  fillRect(buf, S, 10, 2, 12, 2, cyan);
  hLine(buf, S, 10, 2, 12, cyanLight);  // 上部ハイライト

  // y=4〜12: ヘルメット本体（幅14）
  fillRect(buf, S, 9, 4, 14, 9, cyan);
  // アウトライン
  strokeRect(buf, S, 9, 4, 14, 9, dark);

  // ヘルメット頂部のアンテナ／センサー（左側）
  setPixel(buf, S, 10, 0, silverDk);
  setPixel(buf, S, 10, 1, silver);
  setPixel(buf, S, 11, 0, orange);  // センサーライト（オレンジ）

  // 左右のハイライト（立体感）
  vLine(buf, S, 10, 5, 7, cyanLight);
  setPixel(buf, S, 9, 5, cyanLight);

  // ゴーグル／バイザー（y=6〜9、横長）
  // バイザー背景（濃い青黒）
  fillRect(buf, S, 10, 6, 12, 4, visor);
  strokeRect(buf, S, 10, 6, 12, 4, dark);
  // バイザーの発光ライン（中央の細い光）
  hLine(buf, S, 11, 7, 10, visorGlow);
  hLine(buf, S, 11, 8, 10, visorGlow);
  // バイザーの反射ハイライト（左上に白い点）
  setPixel(buf, S, 11, 6, white);
  setPixel(buf, S, 12, 6, white);

  // ヘルメットのサイド通気孔（右側）
  setPixel(buf, S, 22, 6, cyanDark);
  setPixel(buf, S, 22, 8, cyanDark);
  setPixel(buf, S, 22, 10, cyanDark);

  // ヘルメット下部あご部分（y=12〜13）
  fillRect(buf, S, 11, 12, 10, 2, cyanDark);
  hLine(buf, S, 11, 13, 10, dark);

  // ==========================================================================
  // 首（y=14〜15）
  // ==========================================================================
  fillRect(buf, S, 13, 14, 6, 2, silverDk);
  hLine(buf, S, 13, 14, 6, silver);  // 首上部ハイライト

  // ==========================================================================
  // 胴体（y=16〜25）作業着スタイル
  // ==========================================================================
  // 胴体本体（水色の作業着）
  fillRect(buf, S, 8, 16, 16, 10, bodyBlue);
  strokeRect(buf, S, 8, 16, 16, 10, dark);

  // 胴体中央の縦パネルライン
  vLine(buf, S, 16, 17, 8, cyanLight);

  // 安全ストライプ（胴体横ライン）
  hLine(buf, S, 9, 18, 14, stripe);
  hLine(buf, S, 9, 19, 14, orange);
  hLine(buf, S, 9, 20, 14, stripe);

  // 左胸のレンチアイコン（3×5 px）
  // レンチの柄（縦棒）
  vLine(buf, S, 11, 21, 4, yellow);
  // レンチの頭（C字型）
  setPixel(buf, S, 10, 21, yellow);
  setPixel(buf, S, 12, 21, yellow);
  setPixel(buf, S, 10, 22, yellow);
  setPixel(buf, S, 12, 22, yellow);
  setPixel(buf, S, 10, 23, yellow);
  setPixel(buf, S, 12, 23, yellow);

  // 右胸の電源/ゲージパネル（小さい四角）
  fillRect(buf, S, 18, 21, 4, 3, cyanDark);
  strokeRect(buf, S, 18, 21, 4, 3, dark);
  setPixel(buf, S, 19, 22, cyanLight);  // パネル光点
  setPixel(buf, S, 20, 22, cyan);

  // 肩のアクセント（ボルト風の点）
  setPixel(buf, S, 9, 16, white);
  setPixel(buf, S, 23, 16, white);
  setPixel(buf, S, 9, 17, silver);
  setPixel(buf, S, 23, 17, silver);

  // ==========================================================================
  // 左腕（y=16〜23）通常グリップ
  // ==========================================================================
  fillRect(buf, S, 4, 16, 4, 8, bodyBlue);
  strokeRect(buf, S, 4, 16, 4, 8, dark);
  // 袖の安全ストライプ
  hLine(buf, S, 4, 18, 4, stripe);
  hLine(buf, S, 4, 19, 4, orange);
  // 左手（グリップ）
  fillRect(buf, S, 3, 23, 5, 3, silverDk);
  strokeRect(buf, S, 3, 23, 5, 3, dark);
  setPixel(buf, S, 4, 24, silver);  // 手のハイライト

  // ==========================================================================
  // 右腕（y=16〜22）レンチ保持
  // ==========================================================================
  fillRect(buf, S, 24, 16, 4, 7, bodyBlue);
  strokeRect(buf, S, 24, 16, 4, 7, dark);
  // 袖の安全ストライプ
  hLine(buf, S, 24, 18, 4, stripe);
  hLine(buf, S, 24, 19, 4, orange);
  // 右手（レンチを握る）
  fillRect(buf, S, 24, 22, 4, 3, silverDk);
  strokeRect(buf, S, 24, 22, 4, 3, dark);

  // ==========================================================================
  // レンチ工具（右手から突き出す、y=10〜25）
  // ==========================================================================
  // レンチ柄（黄色）
  vLine(buf, S, 28, 15, 12, yellow);
  vLine(buf, S, 29, 15, 12, yellow);
  // 柄の影
  vLine(buf, S, 30, 16, 10, orange);
  // レンチ頭（上部の開口部、y=10〜14）
  // 左フォーク
  setPixel(buf, S, 27, 12, yellow);
  setPixel(buf, S, 26, 11, yellow);
  setPixel(buf, S, 26, 12, yellow);
  setPixel(buf, S, 26, 13, yellow);
  setPixel(buf, S, 27, 13, yellow);
  // 右フォーク
  setPixel(buf, S, 30, 12, yellow);
  setPixel(buf, S, 31, 11, yellow);
  setPixel(buf, S, 31, 12, yellow);
  setPixel(buf, S, 31, 13, yellow);
  setPixel(buf, S, 30, 13, yellow);
  // フォーク間の溝（暗い）
  setPixel(buf, S, 28, 11, dark);
  setPixel(buf, S, 29, 11, dark);
  setPixel(buf, S, 28, 12, dark);
  setPixel(buf, S, 29, 12, dark);
  // レンチ頭ハイライト
  setPixel(buf, S, 26, 10, white);
  setPixel(buf, S, 27, 10, white);

  // ==========================================================================
  // 脚（y=26〜31）
  // ==========================================================================
  // 左脚（作業ブーツ）
  fillRect(buf, S, 9, 26, 6, 5, bodyBlueDk);
  strokeRect(buf, S, 9, 26, 6, 5, dark);
  // ブーツつま先（白/シルバー強化プレート）
  fillRect(buf, S, 9, 29, 6, 2, silver);
  strokeRect(buf, S, 9, 29, 6, 2, dark);
  hLine(buf, S, 10, 29, 4, white);  // ブーツハイライト

  // 右脚（作業ブーツ）
  fillRect(buf, S, 17, 26, 6, 5, bodyBlueDk);
  strokeRect(buf, S, 17, 26, 6, 5, dark);
  // ブーツつま先
  fillRect(buf, S, 17, 29, 6, 2, silver);
  strokeRect(buf, S, 17, 29, 6, 2, dark);
  hLine(buf, S, 18, 29, 4, white);  // ブーツハイライト

  // 脚の安全ストライプ
  hLine(buf, S, 10, 27, 4, stripe);
  hLine(buf, S, 18, 27, 4, stripe);

  // ==========================================================================
  // 保存
  // ==========================================================================
  const outPath = path.join(outDir, 'repair_npc.png');
  await savePNG(buf, S, S, outPath);
  console.log('  generated:', outPath);
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  ensureDir(NPC_DIR);
  console.log('Generating repair NPC sprite...');
  await generateRepairNpc(NPC_DIR);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
