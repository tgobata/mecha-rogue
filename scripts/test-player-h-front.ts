/**
 * 主人公 H スプライト 正面テスト生成スクリプト
 * idle_down_0.png のみ生成して確認用
 *
 * 実行: node --experimental-strip-types scripts/test-player-h-front.ts
 */

import sharp from 'sharp';
import path from 'path';

const S = 64;

interface RGBA { r: number; g: number; b: number; a: number; }

function hex(h: string, a = 255): RGBA {
  const c = h.replace('#', '');
  return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16), a };
}

function createBuffer(): Uint8Array { return new Uint8Array(S * S * 4); }

function px(buf: Uint8Array, x: number, y: number, c: RGBA): void {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const i = (y * S + x) * 4;
  buf[i] = c.r; buf[i+1] = c.g; buf[i+2] = c.b; buf[i+3] = c.a;
}

function hLine(buf: Uint8Array, x: number, y: number, w: number, c: RGBA): void {
  for (let i = 0; i < w; i++) px(buf, x+i, y, c);
}

/** 楕円（近似）を塗りつぶす */
function ellipse(buf: Uint8Array, cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    const dy = (y - cy) / ry;
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
    hLine(buf, cx - hw, y, hw * 2 + 1, c);
  }
}

/** 楕円アウトライン（ドーナツ状に外周を塗る） */
function ellipseOutline(buf: Uint8Array, cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
  ellipse(buf, cx, cy, rx, ry, c);
  // 1px 小さい楕円を透明で抜く→アウトライン残す
  if (rx > 1 && ry > 1) {
    const inner = new Uint8Array(S * S * 4);
    ellipse(inner, cx, cy, rx - 1, ry - 1, { r: 1, g: 0, b: 0, a: 255 });
    for (let i = 0; i < S * S * 4; i += 4) {
      if (inner[i + 3] > 0) { buf[i] = c.r; buf[i+1] = c.g; buf[i+2] = c.b; buf[i+3] = 0; }
    }
  }
}

/** アウトライン（不透明ピクセルの外周を塗る） */
function outline(buf: Uint8Array, c: RGBA): void {
  const snap = new Uint8Array(buf);
  for (let y = 1; y < S-1; y++) {
    for (let x = 1; x < S-1; x++) {
      const idx = (y*S+x)*4;
      if (snap[idx+3] > 0) {
        for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const ni = ((y+dy)*S+(x+dx))*4;
          if (snap[ni+3] === 0) { buf[ni]=c.r; buf[ni+1]=c.g; buf[ni+2]=c.b; buf[ni+3]=c.a; }
        }
      }
    }
  }
}

// ───── カラーパレット ─────────────────────────────────────────────────────
const O  = hex('#FF8C00');   // オレンジ本体
const OM = hex('#CC6000');   // 濃いオレンジ（影）
const OL = hex('#FFBB44');   // 薄いオレンジ（ハイライト）
const BV = hex('#44AAFF');   // 水色バイザー
const BH = hex('#99DDFF');   // バイザーハイライト
const BE = hex('#1A6AFF');   // 青い虹彩
const WH = hex('#FFFFFF');   // 白
const BK = hex('#111122');   // 黒（瞳）
const GD = hex('#FFD700');   // ゴールド（縁取り）
const AN = hex('#FFDD00');   // アンテナ軸
const AB = hex('#FF5500');   // アンテナ球

// ───── 描画 ──────────────────────────────────────────────────────────────
function drawRobot(buf: Uint8Array): void {

  // ── 左アンテナ（cx=25, 先端y=2）────────────────────────────────────
  ellipse(buf, 25, 3, 2, 2, AB);           // 球
  px(buf, 25, 2, hex('#FF8844'));           // ハイライト
  px(buf, 25, 5, AN); px(buf, 25, 6, AN); px(buf, 26, 7, AN); // 軸（少し内向き）

  // ── 右アンテナ（cx=39, 先端y=2）────────────────────────────────────
  ellipse(buf, 39, 3, 2, 2, AB);
  px(buf, 39, 2, hex('#FF8844'));
  px(buf, 39, 5, AN); px(buf, 39, 6, AN); px(buf, 38, 7, AN); // 軸（少し内向き）

  // ── 頭部（楕円: cx=32, cy=18, rx=13, ry=10）─────────────────────────
  ellipse(buf, 32, 18, 13, 10, O);
  // 上部ハイライト
  for (let y = 9; y <= 13; y++) {
    const dy = (y - 18) / 10;
    const hw = Math.round(13 * Math.sqrt(Math.max(0, 1 - dy*dy)));
    if (hw > 2) hLine(buf, 32 - hw + 2, y, hw * 2 - 3, OL);
  }

  // ── バイザー（角丸矩形: x=21〜43, y=12〜24）────────────────────────
  for (let y = 12; y <= 24; y++) {
    let x0 = 21, x1 = 43;
    if (y === 12 || y === 24) { x0 = 23; x1 = 41; }
    else if (y === 13 || y === 23) { x0 = 22; x1 = 42; }
    hLine(buf, x0, y, x1 - x0 + 1, BV);
  }
  // バイザー上部ハイライト2行
  hLine(buf, 23, 12, 19, BH);
  hLine(buf, 22, 13, 21, BH);
  hLine(buf, 22, 14, 6,  hex('#BBEEFF'));

  // ── 目（左: cx=26, cy=18  右: cx=38, cy=18）────────────────────────
  // 青い虹彩
  ellipse(buf, 26, 18, 4, 4, BE);
  ellipse(buf, 38, 18, 4, 4, BE);
  // 白目（少し小さめの楕円）
  ellipse(buf, 26, 18, 2, 2, WH);
  ellipse(buf, 38, 18, 2, 2, WH);
  // 黒い瞳（1px、白目の中央）
  px(buf, 26, 18, BK);
  px(buf, 38, 18, BK);
  // 白ハイライト（左上）
  px(buf, 25, 16, WH); px(buf, 37, 16, WH);

  // ── ネック（細め: cx=32, y=28〜29）──────────────────────────────────
  hLine(buf, 29, 28, 7, OM);
  hLine(buf, 29, 29, 7, OM);

  // ── 胴体（楕円: cx=32, cy=38, rx=12, ry=10）─────────────────────────
  ellipse(buf, 32, 38, 12, 10, O);
  // 上部ハイライト
  for (let y = 29; y <= 33; y++) {
    const dy = (y - 38) / 10;
    const hw = Math.round(12 * Math.sqrt(Math.max(0, 1 - dy*dy)));
    if (hw > 2) hLine(buf, 32 - hw + 2, y, hw * 2 - 3, OL);
  }
  // 下部影
  for (let y = 43; y <= 47; y++) {
    const dy = (y - 38) / 10;
    const hw = Math.round(12 * Math.sqrt(Math.max(0, 1 - dy*dy)));
    if (hw > 0) hLine(buf, 32 - hw, y, hw * 2 + 1, OM);
  }

  // ── コアリアクター（中央小円）──────────────────────────────────────
  ellipse(buf, 32, 38, 3, 3, BH);
  px(buf, 32, 38, WH); px(buf, 31, 38, WH);

  // ── 左腕（細め楕円: cx=17, cy=35, rx=3, ry=8）──────────────────────
  ellipse(buf, 17, 35, 3, 8, O);
  // ハイライト（内側1列）
  for (let y = 28; y <= 38; y++) px(buf, 17, y, OL);

  // ── 右腕（細め楕円: cx=47, cy=35, rx=3, ry=8）──────────────────────
  ellipse(buf, 47, 35, 3, 8, O);
  for (let y = 28; y <= 38; y++) px(buf, 47, y, OL);

  // ── 左手（小円: cx=16, cy=44, rx=4, ry=4）──────────────────────────
  ellipse(buf, 16, 44, 4, 4, BV);
  ellipse(buf, 16, 44, 2, 2, BH);
  px(buf, 15, 42, WH);

  // ── 右手（小円: cx=48, cy=44, rx=4, ry=4）──────────────────────────
  ellipse(buf, 48, 44, 4, 4, BV);
  ellipse(buf, 48, 44, 2, 2, BH);
  px(buf, 47, 42, WH);

  // ── 左脚（細楕円: cx=26, cy=52, rx=4, ry=5）──────────────────────────
  ellipse(buf, 26, 52, 4, 5, O);
  for (let y = 48; y <= 54; y++) px(buf, 26, y, OL);

  // ── 右脚（細楕円: cx=38, cy=52, rx=4, ry=5）──────────────────────────
  ellipse(buf, 38, 52, 4, 5, O);
  for (let y = 48; y <= 54; y++) px(buf, 38, y, OL);

  // ── 左足（横楕円: cx=24, cy=58, rx=6, ry=3）──────────────────────────
  ellipse(buf, 24, 58, 6, 3, OM);
  hLine(buf, 20, 56, 8, OL);   // 上部ハイライト

  // ── 右足（横楕円: cx=40, cy=58, rx=6, ry=3）──────────────────────────
  ellipse(buf, 40, 58, 6, 3, OM);
  hLine(buf, 36, 56, 8, OL);

  // ── 全体アウトライン（ゴールド）────────────────────────────────────
  outline(buf, GD);
}

// ───── メイン ────────────────────────────────────────────────────────────
const buf = createBuffer();
drawRobot(buf);

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const outPath = path.join(ROOT, 'public', 'sprites', 'player', 'idle_down_0.png');

await sharp(Buffer.from(buf), { raw: { width: S, height: S, channels: 4 } })
  .png()
  .toFile(outPath);

console.log('Generated:', outPath);
