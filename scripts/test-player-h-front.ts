/**
 * 主人公 H スプライト 正面テスト生成スクリプト v3
 * かわいいロボット・口あり・全体光沢・細い丸パーツ
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

/** 塗りつぶし楕円 */
function ellipse(buf: Uint8Array, cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    const dy = (y - cy) / ry;
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
    hLine(buf, cx - hw, y, hw * 2 + 1, c);
  }
}

/** 不透明ピクセルの外周にアウトラインを描く */
function outline(buf: Uint8Array, c: RGBA): void {
  const snap = new Uint8Array(buf);
  for (let y = 1; y < S-1; y++) {
    for (let x = 1; x < S-1; x++) {
      const idx = (y*S+x)*4;
      if (snap[idx+3] > 0) {
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
          const ni = ((y+dy)*S+(x+dx))*4;
          if (snap[ni+3] === 0) {
            buf[ni]=c.r; buf[ni+1]=c.g; buf[ni+2]=c.b; buf[ni+3]=c.a;
          }
        }
      }
    }
  }
}

// ─── カラーパレット ──────────────────────────────────────────────────────────
const O   = hex('#FF9010');  // オレンジ本体
const OM  = hex('#CC5A00');  // 影オレンジ
const OL  = hex('#FFCC55');  // ハイライトオレンジ
const OH  = hex('#FFE8B0');  // 強光沢（最明点）
const BV  = hex('#2288EE');  // バイザー青
const BH  = hex('#77CCFF');  // バイザーハイライト
const BD  = hex('#0044AA');  // バイザー影
const BE  = hex('#0055FF');  // 虹彩（青）
const WH  = hex('#FFFFFF');  // 白
const BK  = hex('#111133');  // 瞳（黒）
const GD  = hex('#FFD700');  // ゴールドアウトライン
const AN  = hex('#FFDD00');  // アンテナ軸
const AB  = hex('#FF4400');  // アンテナ球
const AH  = hex('#FFAA55');  // アンテナ球ハイライト
const MK  = hex('#0033BB');  // 口（濃い青）
const MT  = hex('#66BBFF');  // 口内ハイライト（明るい青）

function drawRobot(buf: Uint8Array): void {

  // ══════════════════════════════════════════════════════════════════════
  // 1. アンテナ（左: cx=26, 右: cx=38 ― 内側に少し傾いた2本）
  // ══════════════════════════════════════════════════════════════════════

  // 左アンテナ
  ellipse(buf, 26, 5, 3, 3, AB);
  px(buf, 25, 4, AH);   // 球ハイライト
  px(buf, 26, 8, AN); px(buf, 26, 9, AN);   // 軸
  px(buf, 27, 10, AN);  // 根元（わずかに内側）

  // 右アンテナ
  ellipse(buf, 38, 5, 3, 3, AB);
  px(buf, 37, 4, AH);
  px(buf, 38, 8, AN); px(buf, 38, 9, AN);
  px(buf, 37, 10, AN);

  // ══════════════════════════════════════════════════════════════════════
  // 2. 頭部（cx=32, cy=21, rx=14, ry=11 の丸い楕円）
  // ══════════════════════════════════════════════════════════════════════

  ellipse(buf, 32, 21, 14, 11, O);

  // 頭部下部を少し暗く（立体感）
  for (let y = 27; y <= 31; y++) {
    const dy = (y - 21) / 11;
    const hw = Math.round(14 * Math.sqrt(Math.max(0, 1 - dy*dy)));
    if (hw > 2) hLine(buf, 32 - hw + 1, y, hw*2 - 1, OM);
  }

  // 頭部光沢（左上に丸い白ハイライト）
  ellipse(buf, 24, 14, 5, 3, OL);
  px(buf, 22, 13, OH); px(buf, 23, 13, OH); px(buf, 24, 13, OH);
  px(buf, 22, 14, OH); px(buf, 23, 14, OH);

  // ══════════════════════════════════════════════════════════════════════
  // 3. バイザー（全体的に狭く: x=22~42, y=13~28）
  // ══════════════════════════════════════════════════════════════════════

  for (let y = 13; y <= 28; y++) {
    let x0 = 22, x1 = 42;
    if      (y === 13 || y === 28) { x0 = 24; x1 = 40; }
    else if (y === 14 || y === 27) { x0 = 23; x1 = 41; }
    hLine(buf, x0, y, x1 - x0 + 1, BV);
  }

  // バイザー下部影（大きく下に: y=27~28 のみ、最下部2行だけ濃く）
  hLine(buf, 23, 27, 19, BD);
  hLine(buf, 24, 28, 17, BD);

  // バイザー光沢（左上に白い反射帯）
  hLine(buf, 24, 13, 8,  BH);
  hLine(buf, 23, 14, 11, BH);
  hLine(buf, 22, 15, 10, BH);
  hLine(buf, 22, 16,  6, BH);
  px(buf, 24, 13, WH); px(buf, 25, 13, WH); // 最輝点
  px(buf, 23, 14, WH); px(buf, 24, 14, WH);

  // ══════════════════════════════════════════════════════════════════════
  // 4. 目（縦長楕円: rx=3, ry=5）瞳は縦3px（約2.5倍面積）
  //    左: cx=26, cy=18  /  右: cx=38, cy=18
  // ══════════════════════════════════════════════════════════════════════

  // 左目
  ellipse(buf, 26, 18, 3, 5, BE);    // 青い虹彩（縦長）
  ellipse(buf, 26, 18, 1, 3, WH);    // 白目（縦長）
  // 瞳: 縦3px の縦長楕円（2.5倍面積）
  px(buf, 26, 17, BK);
  px(buf, 26, 18, BK);
  px(buf, 26, 19, BK);
  px(buf, 25, 15, WH);               // 目ハイライト

  // 右目
  ellipse(buf, 38, 18, 3, 5, BE);
  ellipse(buf, 38, 18, 1, 3, WH);
  px(buf, 38, 17, BK);
  px(buf, 38, 18, BK);
  px(buf, 38, 19, BK);
  px(buf, 37, 15, WH);

  // ══════════════════════════════════════════════════════════════════════
  // 5. 口（V字型・特徴的・少し目立たせる）
  // ══════════════════════════════════════════════════════════════════════

  // V の左腕（左上→中央下へ斜め）
  px(buf, 27, 22, MK);
  px(buf, 28, 23, MK);
  px(buf, 29, 24, MK);
  px(buf, 30, 25, MK);
  // V の底（中央）
  px(buf, 31, 25, MK); px(buf, 32, 25, MK); px(buf, 33, 25, MK);
  // V の右腕（中央下→右上へ斜め）
  px(buf, 34, 24, MK);
  px(buf, 35, 23, MK);
  px(buf, 36, 22, MK);
  px(buf, 37, 22, MK);
  // 口内ハイライト（明るい青でV内側を光らせる）
  px(buf, 29, 24, MT); px(buf, 30, 25, MT);
  px(buf, 31, 25, MT); px(buf, 32, 25, MT);
  px(buf, 33, 25, MT); px(buf, 34, 24, MT);

  // ══════════════════════════════════════════════════════════════════════
  // 6. ネック（小さな楕円でつなぐ）
  // ══════════════════════════════════════════════════════════════════════

  ellipse(buf, 32, 32, 4, 2, OM);

  // ══════════════════════════════════════════════════════════════════════
  // 7. 胴体（cx=32, cy=40, rx=11, ry=9 の丸い楕円）
  // ══════════════════════════════════════════════════════════════════════

  ellipse(buf, 32, 40, 11, 9, O);

  // 胴体下部影
  for (let y = 44; y <= 49; y++) {
    const dy = (y - 40) / 9;
    const hw = Math.round(11 * Math.sqrt(Math.max(0, 1 - dy*dy)));
    if (hw > 0) hLine(buf, 32 - hw, y, hw*2 + 1, OM);
  }

  // 胴体光沢（左上）
  ellipse(buf, 26, 34, 4, 2, OL);
  px(buf, 24, 33, OH); px(buf, 25, 33, OH); px(buf, 26, 33, OH);

  // コアリアクター（横長楕円: rx=6, ry=2）
  ellipse(buf, 32, 40, 6, 2, BD);   // 外枠（濃い青）
  ellipse(buf, 32, 40, 5, 1, BH);   // 内側（明るい青）
  px(buf, 30, 40, WH); px(buf, 31, 40, WH); px(buf, 32, 40, WH); // 輝線

  // ══════════════════════════════════════════════════════════════════════
  // 8. 腕（細い楕円: 左 cx=18/右 cx=46, cy=37, rx=3, ry=7）
  // ══════════════════════════════════════════════════════════════════════

  // 左腕
  ellipse(buf, 18, 37, 3, 7, O);
  // 腕の光沢（中心列を明るく）
  for (let y = 31; y <= 43; y++) {
    const dy = (y - 37) / 7;
    if (Math.abs(dy) <= 1) px(buf, 18, y, OL);
  }

  // 右腕
  ellipse(buf, 46, 37, 3, 7, O);
  for (let y = 31; y <= 43; y++) {
    const dy = (y - 37) / 7;
    if (Math.abs(dy) <= 1) px(buf, 46, y, OL);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 9. 手（水色の小さい球: 左 cx=17/右 cx=47, cy=46）
  // ══════════════════════════════════════════════════════════════════════

  // 左手
  ellipse(buf, 17, 46, 4, 4, BV);
  ellipse(buf, 17, 46, 2, 2, BH);   // 内側ハイライト
  px(buf, 15, 44, WH);              // 光沢点

  // 右手
  ellipse(buf, 47, 46, 4, 4, BV);
  ellipse(buf, 47, 46, 2, 2, BH);
  px(buf, 45, 44, WH);

  // ══════════════════════════════════════════════════════════════════════
  // 10. 脚（細め楕円: 左 cx=26/右 cx=38, cy=53, rx=3, ry=5）
  // ══════════════════════════════════════════════════════════════════════

  // 左脚
  ellipse(buf, 26, 53, 3, 5, O);
  for (let y = 49; y <= 57; y++) px(buf, 26, y, OL);  // 光沢中心列

  // 右脚
  ellipse(buf, 38, 53, 3, 5, O);
  for (let y = 49; y <= 57; y++) px(buf, 38, y, OL);

  // ══════════════════════════════════════════════════════════════════════
  // 11. 足（横楕円: 左 cx=24/右 cx=40, cy=58, rx=6, ry=3）
  // ══════════════════════════════════════════════════════════════════════

  // 左足
  ellipse(buf, 24, 58, 6, 3, OM);
  hLine(buf, 20, 56, 8, OL);   // 上部光沢
  px(buf, 20, 55, OH);         // 輝点

  // 右足
  ellipse(buf, 40, 58, 6, 3, OM);
  hLine(buf, 36, 56, 8, OL);
  px(buf, 36, 55, OH);

  // ══════════════════════════════════════════════════════════════════════
  // 12. 全体アウトライン（ゴールド）
  // ══════════════════════════════════════════════════════════════════════

  outline(buf, GD);
}

// ─── メイン ─────────────────────────────────────────────────────────────────
const buf = createBuffer();
drawRobot(buf);

const ROOT = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..'
);
const outPath = path.join(ROOT, 'public', 'sprites', 'player', 'idle_down_0.png');

await sharp(Buffer.from(buf), { raw: { width: S, height: S, channels: 4 } })
  .png()
  .toFile(outPath);

console.log('Generated:', outPath);
