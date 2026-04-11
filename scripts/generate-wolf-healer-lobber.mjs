/**
 * generate-wolf-healer-lobber.mjs
 * 3種の敵スプライト（各32×32px、2フレーム）生成スクリプト
 * - metal_wolf      : 金属製4本足狼型メカ
 * - healer_drone    : 回復支援型円形ドローン
 * - bomb_lobber     : 多連装ロケット搭載2足歩行砲撃メカ
 *
 * 実行: node scripts/generate-wolf-healer-lobber.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const S = 32;
const OUT = path.join(__dirname, '..', 'public', 'sprites', 'enemies');

// ---- 共通ユーティリティ ----

function hex(h, a = 255) {
  const c = h.replace('#', '');
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16), a };
}
function buf() { return new Uint8Array(S * S * 4); }
function px(b, x, y, c) {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const i = (y * S + x) * 4;
  b[i] = c.r; b[i + 1] = c.g; b[i + 2] = c.b; b[i + 3] = c.a;
}
function fr(b, x, y, w, h, c) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      px(b, x + dx, y + dy, c);
}
function hl(b, x, y, l, c) { for (let i = 0; i < l; i++) px(b, x + i, y, c); }
function vl(b, x, y, l, c) { for (let i = 0; i < l; i++) px(b, x, y + i, c); }
function dl(b, x1, y1, x2, y2, c) {
  const s = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  if (s === 0) { px(b, x1, y1, c); return; }
  for (let i = 0; i <= s; i++)
    px(b, Math.round(x1 + (x2 - x1) * i / s), Math.round(y1 + (y2 - y1) * i / s), c);
}
async function save(b, name) {
  await sharp(Buffer.from(b), { raw: { width: S, height: S, channels: 4 } }).png().toFile(path.join(OUT, name));
}

// ============================================================
// 1. METAL WOLF
// ============================================================

const MW = {
  BODY:  hex('#556677'),
  LIGHT: hex('#88aacc'),
  DARK:  hex('#223344'),
  EYE:   hex('#ff2200'),
  FANG:  hex('#eeeeff'),
  CLAW:  hex('#aabbcc'),
  ARMOR: hex('#3a5060'),
};

/**
 * メタルウルフ描画
 * @param {Uint8Array} b - ピクセルバッファ
 * @param {number} bY   - 縦オフセット（frame=1 で +1）
 */
function drawMetalWolf(b, bY) {
  // =========================================================
  // メタルウルフ: 横向き（右向き）4本足狼型メカ
  // 全体レイアウト:
  //   y= 0- 1: 尻尾先端（左上）
  //   y= 2- 3: 耳（右側）
  //   y= 1- 9: 頭部（右）x=18〜29
  //   y= 4-13: 胴体（中央）x=4〜18
  //   y= 0- 4: 尻尾（左）x=0〜5
  //   y=13-22: 4本脚 x=5,9,13,17（各3px幅）
  //   y=22-23: 爪
  // =========================================================

  // --- 尻尾（左上カーブ、x=0〜5, y=0〜6）---
  px(b, 5, 6 + bY, MW.LIGHT);
  px(b, 4, 5 + bY, MW.LIGHT);
  px(b, 3, 4 + bY, MW.LIGHT);
  px(b, 2, 3 + bY, MW.BODY);
  px(b, 1, 2 + bY, MW.BODY);
  px(b, 0, 1 + bY, MW.LIGHT);

  // --- 胴体（x=4〜17, y=4〜13）横長の箱型 ---
  fr(b, 4, 4 + bY, 14, 10, MW.BODY);
  // 上端ハイライト
  hl(b, 5, 4 + bY, 12, MW.LIGHT);
  // 左端・右端シャドウ
  vl(b, 4, 4 + bY, 10, MW.DARK);
  vl(b, 17, 4 + bY, 10, MW.DARK);
  // 胴体下端
  hl(b, 4, 13 + bY, 14, MW.DARK);
  // 装甲パネル線
  hl(b, 5, 7 + bY, 11, MW.ARMOR);
  hl(b, 5, 10 + bY, 11, MW.ARMOR);
  // 装甲板（中段）
  fr(b, 5, 8 + bY, 11, 2, MW.ARMOR);

  // --- 首（胴体と頭部の接続 x=16〜19, y=5〜8）---
  fr(b, 16, 5 + bY, 4, 5, MW.BODY);

  // --- 耳（三角、右側 x=22〜25, y=1〜3）---
  hl(b, 22, 1 + bY, 4, MW.DARK);
  hl(b, 22, 2 + bY, 3, MW.BODY);
  px(b, 23, 1 + bY, MW.BODY);

  // --- 頭部（x=18〜28, y=2〜9）---
  fr(b, 18, 2 + bY, 11, 8, MW.BODY);
  hl(b, 19, 2 + bY, 9, MW.LIGHT);   // 上端ハイライト
  vl(b, 18, 2 + bY, 8, MW.DARK);    // 左端
  vl(b, 28, 2 + bY, 7, MW.DARK);    // 右端
  // 目（発光赤）
  fr(b, 21, 5 + bY, 3, 2, MW.EYE);
  px(b, 21, 5 + bY, MW.LIGHT);      // ハイライト
  // 頭部下端
  hl(b, 18, 9 + bY, 11, MW.DARK);

  // --- マズル（前方突き出し x=26〜31, y=6〜9）---
  fr(b, 26, 6 + bY, 6, 4, MW.BODY);
  hl(b, 27, 6 + bY, 5, MW.LIGHT);
  vl(b, 31, 6 + bY, 4, MW.DARK);
  hl(b, 26, 9 + bY, 6, MW.DARK);
  // 牙
  px(b, 27, 9 + bY, MW.FANG);
  px(b, 29, 9 + bY, MW.FANG);
  px(b, 31, 9 + bY, MW.FANG);

  // --- 4本脚（各3px幅 x=5,9,13,17）---
  // 前脚(右): x=13,17  後脚(左): x=5,9
  const legXs = [5, 9, 13, 17];
  for (const lx of legXs) {
    // 付け根 y=13〜14
    fr(b, lx, 13 + bY, 3, 2, MW.BODY);
    // 膝 y=15（少し前に出る）
    hl(b, lx, 15 + bY, 3, MW.DARK);
    // 脚下部 y=16〜21
    fr(b, lx, 16 + bY, 3, 6, MW.BODY);
    // 脚両端シャドウ
    vl(b, lx,     13 + bY, 9, MW.DARK);
    vl(b, lx + 2, 13 + bY, 9, MW.DARK);
  }
  // 爪（各脚下端）
  for (const lx of legXs) {
    px(b, lx - 1, 22 + bY, MW.CLAW);
    px(b, lx,     22 + bY, MW.CLAW);
    px(b, lx + 1, 22 + bY, MW.CLAW);
    px(b, lx + 2, 22 + bY, MW.CLAW);
    hl(b, lx - 1, 23 + bY, 4, MW.DARK);
  }
}

async function generateMetalWolf() {
  for (let frame = 0; frame <= 1; frame++) {
    const b = buf();
    drawMetalWolf(b, frame); // frame=1 で全体1px下シフト（呼吸）
    await save(b, `metal_wolf_dir_down_idle_${frame}.png`);
    console.log(`  metal_wolf_dir_down_idle_${frame}.png`);
  }
}

// ============================================================
// 2. HEALER DRONE
// ============================================================

const HD = {
  BODY:     hex('#ddeedd'),
  LIGHT:    hex('#ffffff'),
  DARK:     hex('#558855'),
  CROSS:    hex('#33dd44'),
  ROTOR:    hex('#aaccaa'),
  GLOW:     hex('#00ff88'),
  GLOW2:    hex('#88ffcc'), // frame1用の明るいグロー
  THRUSTER: hex('#336633'),
};

/**
 * ヒーラードローン描画
 * @param {Uint8Array} b
 * @param {number} bY    - 縦オフセット（frame=1 で +1）
 * @param {boolean} alt  - frame=1 の差分（ローター傾き・グロー点滅）
 */
function drawHealerDrone(b, bY, alt) {
  // --- ローター軸 ---
  px(b, 15, 1 + bY, HD.DARK);
  px(b, 16, 1 + bY, HD.DARK);

  // --- ローター翼 ---
  if (!alt) {
    // frame=0: 水平翼
    hl(b, 5,  2 + bY, 10, HD.ROTOR); // 左翼
    hl(b, 17, 2 + bY, 10, HD.ROTOR); // 右翼
    // 翼先端を少し濃く
    px(b,  5, 2 + bY, HD.DARK);
    px(b, 26, 2 + bY, HD.DARK);
  } else {
    // frame=1: 翼が斜め（dl使用）
    dl(b, 15, 2 + bY, 5,  5 + bY, HD.ROTOR); // 左翼（斜め下）
    dl(b, 16, 2 + bY, 26, 5 + bY, HD.ROTOR); // 右翼（斜め下）
    px(b, 5,  5 + bY, HD.DARK);
    px(b, 26, 5 + bY, HD.DARK);
  }

  // --- 上部ドーム（y=4〜6）---
  fr(b, 12, 4 + bY, 8, 3, HD.BODY);
  hl(b, 13, 4 + bY, 6, HD.LIGHT); // 上端ハイライト

  // --- 本体楕円（cx=15, cy=15, rx=8, ry=8, y=7〜22）---
  const cx = 15, cy = 15 + bY, rx = 8, ry = 8;
  for (let y = cy - ry; y <= cy + ry; y++) {
    if (y < 0 || y >= S) continue;
    const dy = y - cy;
    const xSpan = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
    const x0 = cx - xSpan;
    const x1 = cx + xSpan;
    // 外縁（DARK）
    px(b, x0, y, HD.DARK);
    px(b, x1, y, HD.DARK);
    // 内部（BODY）
    if (x1 - x0 > 1) hl(b, x0 + 1, y, x1 - x0 - 1, HD.BODY);
    // 上1/4 ハイライト
    if (dy <= -ry / 2) hl(b, x0 + 1, y, x1 - x0 - 1, HD.LIGHT);
  }

  // --- 緑十字マーク（本体中央）---
  // 縦軸
  vl(b, 15, 10 + bY, 9, HD.CROSS);
  vl(b, 16, 10 + bY, 9, HD.CROSS);
  // 横軸
  hl(b, 11, 14 + bY, 10, HD.CROSS);
  hl(b, 11, 15 + bY, 10, HD.CROSS);

  // --- 下部スラスター（y=19〜24）---
  const glowColor = alt ? HD.GLOW2 : HD.GLOW;
  // 左スラスター
  fr(b, 10, 19 + bY, 4, 5, HD.THRUSTER);
  fr(b, 11, 20 + bY, 2, 3, glowColor); // 内側グロー
  // 右スラスター
  fr(b, 18, 19 + bY, 4, 5, HD.THRUSTER);
  fr(b, 19, 20 + bY, 2, 3, glowColor);
}

async function generateHealerDrone() {
  for (let frame = 0; frame <= 1; frame++) {
    const b = buf();
    drawHealerDrone(b, frame, frame === 1);
    await save(b, `healer_drone_dir_down_idle_${frame}.png`);
    console.log(`  healer_drone_dir_down_idle_${frame}.png`);
  }
}

// ============================================================
// 3. BOMB LOBBER
// ============================================================

const BL = {
  BODY:       hex('#664422'),
  LIGHT:      hex('#cc8844'),
  DARK:       hex('#331100'),
  ROCKET:     hex('#994400'),
  ROCKET_TIP: hex('#ff6600'),
  EXHAUST:    hex('#ffcc00'),
  EYE:        hex('#ff4400'),
  JOINT:      hex('#442200'),
};

/**
 * ボムロバー描画
 * @param {Uint8Array} b
 * @param {boolean} alt - frame=1 の差分（歩行・ポッド上昇）
 */
function drawBombLobber(b, alt) {
  // =========================================================
  // ボムロバー: 2足歩行砲撃メカ
  // 全体レイアウト（正面向き）:
  //   y= 0- 5: ロケットポッド（最重要特徴、最上部）
  //   y= 6- 9: 肩・上体
  //   y= 6-10: 頭部（小さく）
  //   y= 9-19: 胴体
  //   y= 9-17: 腕（左右）
  //   y=19-31: 2本の長い機械脚
  // =========================================================

  // 歩行オフセット: frame=1 で左右脚が交互
  const lLeg = alt ? 1 : 0;   // 左脚: frame1で+1px下
  const rLeg = alt ? 0 : 1;   // 右脚: frame1で+0（標準）/ frame0で+1

  // =====================
  // ロケットポッド（y=0〜5、幅20、中央配置）
  // 6発のロケット弾が上向きに並ぶ
  // =====================
  // ポッドベース（台座）
  fr(b, 6, 4, 20, 3, BL.DARK);
  hl(b, 7, 4, 18, BL.JOINT);
  // ロケット弾6発（x=7,9,11,13,15,17,19,21 → 奇数位置に2px幅で）
  const rocketXs = [7, 10, 13, 16, 19, 22];
  for (const rx of rocketXs) {
    px(b, rx,     0, BL.ROCKET_TIP);  // 弾頭先端
    px(b, rx + 1, 0, BL.ROCKET_TIP);
    px(b, rx,     1, BL.ROCKET_TIP);  // 弾頭
    px(b, rx + 1, 1, BL.ROCKET_TIP);
    fr(b, rx, 2, 2, 2, BL.ROCKET);    // 弾体上
    fr(b, rx, 4, 2, 1, BL.DARK);      // 弾体下（ポッド内）
  }

  // =====================
  // 胴体（x=9〜22, y=7〜18）
  // =====================
  fr(b, 9, 7, 14, 12, BL.BODY);
  hl(b, 10, 7, 12, BL.LIGHT);   // 上端ハイライト
  vl(b, 9, 7, 12, BL.DARK);     // 左端
  vl(b, 22, 7, 12, BL.DARK);    // 右端
  hl(b, 10, 11, 12, BL.DARK);   // 装甲線1
  hl(b, 10, 15, 12, BL.DARK);   // 装甲線2
  hl(b, 9, 18, 14, BL.DARK);    // 胴体下端

  // =====================
  // 頭部（小さく x=13〜18, y=5〜8）
  // =====================
  fr(b, 13, 4, 6, 5, BL.BODY);
  hl(b, 14, 4, 4, BL.LIGHT);
  vl(b, 13, 4, 5, BL.DARK);
  vl(b, 18, 4, 5, BL.DARK);
  // バイザー目（2つ）
  fr(b, 14, 6, 2, 2, BL.EYE);
  fr(b, 17, 6, 2, 2, BL.EYE);

  // =====================
  // 腕（左右、太く短い）
  // =====================
  // 左腕
  fr(b, 4, 9, 5, 7, BL.DARK);
  hl(b, 5, 9, 3, BL.BODY);
  hl(b, 5, 10, 3, BL.BODY);
  hl(b, 4, 14, 5, BL.JOINT); // 肘
  fr(b, 3, 15, 5, 3, BL.DARK); // 前腕
  // 右腕
  fr(b, 23, 9, 5, 7, BL.DARK);
  hl(b, 23, 9, 3, BL.BODY);
  hl(b, 23, 10, 3, BL.BODY);
  hl(b, 23, 14, 5, BL.JOINT); // 肘
  fr(b, 24, 15, 5, 3, BL.DARK); // 前腕

  // =====================
  // 左脚（太く、膝あり）
  // =====================
  const ll = lLeg;
  // 大腿
  fr(b, 10, 18 + ll, 5, 5, BL.BODY);
  hl(b, 10, 18 + ll, 5, BL.LIGHT);
  vl(b, 10, 18 + ll, 5, BL.DARK);
  vl(b, 14, 18 + ll, 5, BL.DARK);
  // 膝関節
  hl(b, 9, 23 + ll, 7, BL.JOINT);
  hl(b, 9, 24 + ll, 7, BL.DARK);
  // 下腿
  fr(b, 10, 25 + ll, 4, 5, BL.BODY);
  vl(b, 10, 25 + ll, 5, BL.DARK);
  vl(b, 13, 25 + ll, 5, BL.DARK);
  // 足
  hl(b, 8, 30 + ll, 8, BL.DARK);

  // =====================
  // 右脚
  // =====================
  const rl = rLeg;
  // 大腿
  fr(b, 17, 18 + rl, 5, 5, BL.BODY);
  hl(b, 17, 18 + rl, 5, BL.LIGHT);
  vl(b, 17, 18 + rl, 5, BL.DARK);
  vl(b, 21, 18 + rl, 5, BL.DARK);
  // 膝関節
  hl(b, 16, 23 + rl, 7, BL.JOINT);
  hl(b, 16, 24 + rl, 7, BL.DARK);
  // 下腿
  fr(b, 18, 25 + rl, 4, 5, BL.BODY);
  vl(b, 18, 25 + rl, 5, BL.DARK);
  vl(b, 21, 25 + rl, 5, BL.DARK);
  // 足
  hl(b, 16, 30 + rl, 8, BL.DARK);

  // =====================
  // 排気炎（frame=1 で点灯）
  // =====================
  if (alt) {
    px(b, 12, 19, BL.EXHAUST);
    px(b, 19, 19, BL.EXHAUST);
  }
}

async function generateBombLobber() {
  for (let frame = 0; frame <= 1; frame++) {
    const b = buf();
    drawBombLobber(b, frame === 1);
    await save(b, `bomb_lobber_dir_down_idle_${frame}.png`);
    console.log(`  bomb_lobber_dir_down_idle_${frame}.png`);
  }
}

// ============================================================
// メイン
// ============================================================

async function main() {
  if (!fs.existsSync(OUT)) {
    fs.mkdirSync(OUT, { recursive: true });
  }

  console.log('Generating metal_wolf...');
  await generateMetalWolf();

  console.log('Generating healer_drone...');
  await generateHealerDrone();

  console.log('Generating bomb_lobber...');
  await generateBombLobber();

  console.log('Done. 6 files generated.');
}

main().catch(err => { console.error(err); process.exit(1); });
