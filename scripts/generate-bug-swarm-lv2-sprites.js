/**
 * generate-bug-swarm-lv2-sprites.js
 * bug_swarm スプライトを赤系に色変換して bug_swarm_lv2 として出力するスクリプト。
 *
 * 実行: node scripts/generate-bug-swarm-lv2-sprites.js
 */

'use strict';

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SPRITES_DIR = path.join(__dirname, '..', 'public', 'sprites', 'enemies');

// 変換対象ファイルリスト（dir系 16ファイル x 各2枚）
const DIRECTIONS = ['down', 'left', 'right', 'up'];
const ANIMATIONS = ['atk', 'dead', 'dmg', 'move'];
const FRAME_COUNTS = {
  atk: 2,
  dead: 2,
  dmg: 2,
  move: 2,
};

/**
 * ピクセルデータをRaw RGBAバッファとして読み込み、色変換して出力する。
 * 変換式:
 *   newR = clamp(r * 1.4 + g * 0.3, 0, 255)
 *   newG = clamp(g * 0.2 - b * 0.1, 0, 255)
 *   newB = clamp(b * 0.1, 0, 255)
 * 輝度が暗くなりすぎる場合はスケールアップする。
 *
 * @param {string} inputPath
 * @param {string} outputPath
 */
async function recolorToRed(inputPath, outputPath) {
  const image = sharp(inputPath);
  const { width, height, channels } = await image.metadata();

  // channels が 4 (RGBA) でない場合も想定して強制 RGBA 化
  const rawBuffer = await image.ensureAlpha().raw().toBuffer();

  const totalPixels = width * height;
  const out = Buffer.allocUnsafe(rawBuffer.length);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = rawBuffer[offset];
    const g = rawBuffer[offset + 1];
    const b = rawBuffer[offset + 2];
    const a = rawBuffer[offset + 3];

    if (a === 0) {
      // 透明ピクセルはそのまま
      out[offset] = r;
      out[offset + 1] = g;
      out[offset + 2] = b;
      out[offset + 3] = a;
      continue;
    }

    // 色変換
    let newR = Math.min(255, r * 1.4 + g * 0.3);
    let newG = Math.max(0, g * 0.2 - b * 0.1);
    let newB = Math.max(0, b * 0.1);

    // 輝度保持: 元輝度と変換後輝度の比率でスケール
    const origLum = 0.299 * r + 0.587 * g + 0.114 * b;
    const newLum = 0.299 * newR + 0.587 * newG + 0.114 * newB;

    if (newLum > 0 && origLum > 0) {
      const scale = Math.min(origLum / newLum, 2.0); // 最大 2倍まで明るくする
      newR = Math.min(255, newR * scale);
      newG = Math.min(255, newG * scale);
      newB = Math.min(255, newB * scale);
    }

    out[offset] = Math.round(newR);
    out[offset + 1] = Math.round(newG);
    out[offset + 2] = Math.round(newB);
    out[offset + 3] = a;
  }

  await sharp(out, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(outputPath);
}

async function main() {
  const generated = [];
  const errors = [];

  for (const dir of DIRECTIONS) {
    for (const anim of ANIMATIONS) {
      const frameCount = FRAME_COUNTS[anim];
      for (let frame = 0; frame < frameCount; frame++) {
        const baseName = `bug_swarm_dir_${dir}_${anim}_${frame}.png`;
        const inputPath = path.join(SPRITES_DIR, baseName);
        const outputName = `bug_swarm_lv2_dir_${dir}_${anim}_${frame}.png`;
        const outputPath = path.join(SPRITES_DIR, outputName);

        if (!fs.existsSync(inputPath)) {
          console.warn(`[SKIP] ファイルが見つかりません: ${baseName}`);
          errors.push(baseName);
          continue;
        }

        try {
          await recolorToRed(inputPath, outputPath);
          console.log(`[OK] ${outputName}`);
          generated.push(outputName);
        } catch (err) {
          console.error(`[ERROR] ${baseName}: ${err.message}`);
          errors.push(baseName);
        }
      }
    }
  }

  console.log('\n=== 生成完了 ===');
  console.log(`生成: ${generated.length} ファイル`);
  if (errors.length > 0) {
    console.log(`スキップ/エラー: ${errors.length} ファイル`);
    errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log('\n生成ファイル一覧:');
  generated.forEach((f) => console.log(`  public/sprites/enemies/${f}`));
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
