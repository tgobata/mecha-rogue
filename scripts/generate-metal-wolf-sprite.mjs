/**
 * generate-metal-wolf-sprite.mjs
 * メタルウルフ（metal_wolf）32×32スプライト生成スクリプト
 * 実行: node scripts/generate-metal-wolf-sprite.mjs
 *
 * 4本足の横向き（右向き）狼型ロボット
 * 頭部が右（前方）、尻尾が左上（後方）、背中にキャノン砲
 *
 * ピクセルバイピクセル設計（frame=0, bY=0）:
 *  y=1  尻尾先端: x=1に1px
 *  y=2  尻尾: x=2,3
 *  y=3  尻尾+キャノン砲身: x=3,4尻尾, x=8〜22キャノン上行
 *  y=4  尻尾根元+キャノン砲身: x=4,5, x=8〜22キャノン下行
 *  y=5  キャノン砲台+胴体上端+耳: x=8〜16砲台, x=14〜24胴体上端, x=23〜25耳
 *  y=6  耳+胴体+砲台: x=23〜25耳, x=6〜22胴体, x=9〜15砲台
 *  y=7  胴体+頭部上: x=5〜23胴体, x=22〜30頭部
 *  y=8  胴体+頭部(目): x=5〜23胴体, x=22〜30頭部, x=24,25赤目
 *  y=9  胴体+頭部: x=5〜23, x=22〜30
 *  y=10 胴体パネル線+頭部: x=6〜22暗線, x=22〜30頭部
 *  y=11 胴体+マズル: x=5〜23, x=27〜31
 *  y=12 胴体+マズル+牙: x=5〜23, x=27〜31, x=28白牙
 *  y=13 胴体下端+牙: x=6〜22, x=28白牙
 *  y=14 胴体パネル線: x=6〜22暗
 *  y=15 胴体下: x=6〜22
 *  y=16 脚上部: x=7〜9, x=12〜14, x=17〜19, x=22〜24（各3px）
 *  y=17 脚: 同上
 *  y=18 膝関節(暗): 同上
 *  y=19 脚下部: x=8〜10, x=13〜15, x=18〜20, x=23〜25
 *  y=20〜22 脚: 同上
 *  y=23 爪(銀): x=7〜10, x=12〜15, x=17〜20, x=22〜25
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const S = 32;
const ENEMIES_DIR = path.join(__dirname, '..', 'public', 'sprites', 'enemies');

// ---- ユーティリティ ----

function hexToRGBA(hex, alpha = 255) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: alpha };
}
function createBuffer() { return new Uint8Array(S * S * 4); }
function setPixel(buf, x, y, c) {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const i = (y * S + x) * 4;
  buf[i]=c.r; buf[i+1]=c.g; buf[i+2]=c.b; buf[i+3]=c.a;
}
function hLine(buf, x, y, len, c) {
  for (let i = 0; i < len; i++) setPixel(buf, x+i, y, c);
}
async function savePNG(buf, filePath) {
  await sharp(Buffer.from(buf), { raw: { width: S, height: S, channels: 4 } }).png().toFile(filePath);
}

// ---- カラーパレット ----

const OUTLINE  = hexToRGBA('#221100');
const BODY     = hexToRGBA('#886644');
const LIGHT    = hexToRGBA('#ddaa66');
const DARK     = hexToRGBA('#442211');
const EYE      = hexToRGBA('#ff3300');
const CANNON   = hexToRGBA('#444444');
const CANNON_H = hexToRGBA('#888888');
const CLAW     = hexToRGBA('#cccccc');
const FANG     = hexToRGBA('#eeeeee');
const TAIL     = hexToRGBA('#ddaa66');

// ---- メタルウルフ本体描画 ----
// bY: 全体縦オフセット（frame=0: 0, frame=1: 1）

function drawMetalWolf(buf, bY) {

  // =====================
  // 尻尾（左上方向、後方）
  // =====================
  // y=1 尻尾先端
  setPixel(buf, 1, 1+bY, TAIL);

  // y=2 尻尾
  setPixel(buf, 2, 2+bY, LIGHT);
  setPixel(buf, 3, 2+bY, LIGHT);

  // y=3 尻尾
  setPixel(buf, 3, 3+bY, TAIL);
  setPixel(buf, 4, 3+bY, TAIL);

  // y=4 尻尾根元
  setPixel(buf, 4, 4+bY, TAIL);
  setPixel(buf, 5, 4+bY, TAIL);

  // =====================
  // キャノン砲身（背中上、x=8〜22、y=3〜4）
  // =====================
  // y=3 砲身上行（ハイライト）
  hLine(buf, 8, 3+bY, 15, CANNON_H);
  // y=4 砲身下行
  hLine(buf, 8, 4+bY, 15, CANNON);
  // アウトライン
  setPixel(buf,  8, 3+bY, OUTLINE); // 砲口左上
  setPixel(buf,  8, 4+bY, OUTLINE); // 砲口左下
  setPixel(buf, 22, 3+bY, OUTLINE); // 右端上
  setPixel(buf, 22, 4+bY, OUTLINE); // 右端下

  // =====================
  // キャノン砲台ベース（x=8〜16, y=5〜6）
  // =====================
  // y=5 砲台上端 + 胴体上端
  hLine(buf,  8, 5+bY, 9, CANNON);
  hLine(buf, 14, 5+bY, 11, BODY);   // 胴体上端（x=14〜24）
  // 耳（三角耳、x=23〜25、y=5）
  setPixel(buf, 23, 5+bY, BODY);
  setPixel(buf, 24, 5+bY, BODY);
  setPixel(buf, 25, 5+bY, OUTLINE); // 耳先端

  // y=6 砲台 + 胴体 + 耳
  hLine(buf,  9, 6+bY, 7, CANNON);
  hLine(buf,  6, 6+bY, 17, BODY);
  // 耳（x=23〜25）
  setPixel(buf, 23, 6+bY, BODY);
  setPixel(buf, 24, 6+bY, LIGHT);   // 耳ハイライト
  setPixel(buf, 25, 6+bY, BODY);
  setPixel(buf, 22, 6+bY, OUTLINE); // 耳根左アウトライン
  setPixel(buf, 26, 6+bY, OUTLINE); // 耳右アウトライン

  // =====================
  // 胴体メイン（x=5〜23, y=7〜15）+ 頭部（x=22〜30, y=7〜12）
  // =====================

  // y=7 胴体 + 頭部上
  hLine(buf,  5, 7+bY, 19, BODY);   // x=5〜23胴体
  hLine(buf, 22, 7+bY,  9, BODY);   // x=22〜30頭部上

  // y=8 胴体 + 頭部 + 目
  hLine(buf,  5, 8+bY, 19, BODY);
  hLine(buf, 22, 8+bY,  9, BODY);
  setPixel(buf, 24, 8+bY, EYE);     // 目左
  setPixel(buf, 25, 8+bY, EYE);     // 目右

  // y=9 胴体 + 頭部
  hLine(buf,  5, 9+bY, 19, BODY);
  hLine(buf, 22, 9+bY,  9, BODY);

  // y=10 パネル線 + 頭部
  hLine(buf,  6, 10+bY, 17, DARK);  // パネル線（暗）
  hLine(buf, 22, 10+bY,  9, BODY);

  // y=11 胴体 + 頭部 + マズル
  hLine(buf,  5, 11+bY, 19, BODY);
  hLine(buf, 27, 11+bY,  5, BODY);  // マズル x=27〜31

  // y=12 胴体 + マズル + 牙
  hLine(buf,  5, 12+bY, 19, BODY);
  hLine(buf, 27, 12+bY,  5, BODY);
  setPixel(buf, 28, 12+bY, FANG);   // 牙

  // y=13 胴体下端 + 牙
  hLine(buf,  6, 13+bY, 17, BODY);
  setPixel(buf, 28, 13+bY, FANG);   // 牙（白）

  // y=14 パネル線
  hLine(buf,  6, 14+bY, 17, DARK);

  // y=15 胴体下
  hLine(buf,  6, 15+bY, 17, BODY);

  // =====================
  // 4本の脚
  // 前脚2本: x=7〜9, x=12〜14（右寄り＝前方）
  // 後脚2本: x=17〜19, x=22〜24（左寄り＝後方）
  // =====================
  const legXs = [7, 12, 17, 22]; // 各脚の開始X

  // y=16〜17 脚上部（胴体から直接伸びる）
  for (const lx of legXs) {
    hLine(buf, lx, 16+bY, 3, BODY);
    hLine(buf, lx, 17+bY, 3, BODY);
  }

  // y=18 膝関節（暗色）
  for (const lx of legXs) {
    hLine(buf, lx, 18+bY, 3, DARK);
  }

  // y=19〜22 脚下部（膝から爪先へ）
  // 仕様: x=8〜10, x=13〜15, x=18〜20, x=23〜25（1px右にずれる）
  const lowerLegXs = [8, 13, 18, 23];
  for (const lx of lowerLegXs) {
    hLine(buf, lx, 19+bY, 3, BODY);
    hLine(buf, lx, 20+bY, 3, BODY);
    hLine(buf, lx, 21+bY, 3, BODY);
    hLine(buf, lx, 22+bY, 3, BODY);
  }

  // y=23 爪（銀）
  // 仕様: x=7〜10, x=12〜15, x=17〜20, x=22〜25（4px幅）
  hLine(buf,  7, 23+bY, 4, CLAW);
  hLine(buf, 12, 23+bY, 4, CLAW);
  hLine(buf, 17, 23+bY, 4, CLAW);
  hLine(buf, 22, 23+bY, 4, CLAW);

  // =====================
  // アウトライン補強
  // =====================
  // 胴体外縁
  setPixel(buf,  5,  7+bY, OUTLINE); // 胴体左上角
  setPixel(buf,  5, 15+bY, OUTLINE); // 胴体左下角
  hLine(buf,  6, 16+bY, 17, OUTLINE); // 胴体下辺

  // 頭部外縁
  setPixel(buf, 22,  7+bY, OUTLINE); // 頭部左上
  setPixel(buf, 30,  7+bY, OUTLINE); // 頭部右上
  setPixel(buf, 30, 12+bY, OUTLINE); // 頭部右下
  // マズル外縁
  setPixel(buf, 31, 11+bY, OUTLINE);
  setPixel(buf, 31, 12+bY, OUTLINE);
  hLine(buf, 27, 13+bY, 5, OUTLINE); // マズル下辺

  // 爪下アウトライン
  setPixel(buf,  6, 23+bY, OUTLINE);
  setPixel(buf, 11, 23+bY, OUTLINE);
  setPixel(buf, 16, 23+bY, OUTLINE);
  setPixel(buf, 21, 23+bY, OUTLINE);
  hLine(buf,  7, 24+bY, 4, OUTLINE);
  hLine(buf, 12, 24+bY, 4, OUTLINE);
  hLine(buf, 17, 24+bY, 4, OUTLINE);
  hLine(buf, 22, 24+bY, 4, OUTLINE);
}

// ---- メイン ----

async function main() {
  if (!fs.existsSync(ENEMIES_DIR)) {
    fs.mkdirSync(ENEMIES_DIR, { recursive: true });
  }

  for (let frame = 0; frame <= 1; frame++) {
    const buf = createBuffer();
    const bY = frame; // frame=1: 全体1px下シフト（呼吸アニメ）
    drawMetalWolf(buf, bY);

    const filePath = path.join(ENEMIES_DIR, `metal_wolf_dir_down_idle_${frame}.png`);
    await savePNG(buf, filePath);
    console.log(`Generated: ${filePath}`);
  }

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
