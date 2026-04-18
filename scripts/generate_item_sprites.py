"""
generate_item_sprites.py
アイテムカテゴリ用スプライト(16x16)を Stable Diffusion で生成する。
512x512 で生成後に 16x16 へリサイズして既存ファイルを上書きする。

使い方:
  py -3.12 scripts/generate_item_sprites.py

オプション:
  --force     既存ファイルを上書き再生成
  --steps N   推論ステップ数(デフォルト 25)
  --preview   生成せず対象リストだけ表示

出力先: public/sprites/items/{category}.png (16x16)
"""

import argparse
import os
import time

OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "public", "sprites", "items"
)

# ---------------------------------------------------------------------------
# カテゴリ別プロンプト定義
# ---------------------------------------------------------------------------
# CLIPトークン上限 77。STYLE_PREFIX 約20トークン + 各プロンプト ≤ 55 トークン。

ITEM_PROMPTS: dict[str, str] = {
    "recovery":
        "red cross medical repair kit, glowing green heal aura, white box",

    "weapon":
        "golden wrench and gear, weapon upgrade parts, sparkling",

    "exploration":
        "glowing blue map scroll, radar antenna, exploration compass",

    "combat":
        "round grenade bomb with lit fuse, red and black, explosive",

    "special":
        "glowing purple mystery module, star burst light, special device",

    "machine_upgrade":
        "blue circuit board chip, upgrade arrows, electrical glow",

    "unidentified":
        "brown box with question mark, sealed unknown item",

    "material":
        "shiny metal scrap pieces, circuit board fragments, silver",
}

# ---------------------------------------------------------------------------
# 共通プロンプト部品
# ---------------------------------------------------------------------------

# CLIPトークン上限77。STYLE_PREFIX単体で約20トークンに抑える
STYLE_PREFIX = (
    "(masterpiece, best quality), "
    "cute chibi game icon, pixel art style, 16x16 icon, "
    "colorful, black background, "
)

NEGATIVE_PROMPT = (
    "blurry, low quality, bad anatomy, extra limbs, deformed, "
    "text, watermark, signature, border, frame, "
    "realistic photograph, 3D render, dark muddy colors, monochrome, "
    "nsfw, cropped"
)


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true", help="overwrite existing files")
    p.add_argument("--steps", type=int, default=25, help="inference steps")
    p.add_argument("--preview", action="store_true", help="list targets without generating")
    return p.parse_args()


def main():
    args = parse_args()

    targets = list(ITEM_PROMPTS.items())

    if args.preview:
        print(f"[preview] {len(targets)} targets:")
        for category, _ in targets:
            out = os.path.join(OUTPUT_DIR, f"{category}.png")
            status = "EXISTS" if os.path.exists(out) else "pending"
            print(f"  {category:20s}  {status}")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── モデルロード ──────────────────────────────────────────────
    print("[info] Loading Lykon/dreamshaper-8 ...")
    import torch
    from diffusers import StableDiffusionPipeline

    pipe = StableDiffusionPipeline.from_pretrained(
        "Lykon/dreamshaper-8",
        torch_dtype=torch.float16,
        safety_checker=None,
        requires_safety_checker=False,
    ).to("cuda")
    pipe.enable_attention_slicing()

    # xformers があれば使う（VRAM節約）
    try:
        pipe.enable_xformers_memory_efficient_attention()
        print("[info] xformers enabled")
    except Exception:
        pass

    print(f"[info] Model loaded. Generating {len(targets)} item sprites ...\n")

    from PIL import Image

    total = len(targets)
    generated = 0
    skipped   = 0
    failed    = 0

    for idx, (category, specific_prompt) in enumerate(targets, 1):
        out_path = os.path.join(OUTPUT_DIR, f"{category}.png")

        if os.path.exists(out_path) and not args.force:
            print(f"[{idx:2d}/{total}] SKIP  {category}")
            skipped += 1
            continue

        full_prompt = STYLE_PREFIX + specific_prompt
        seed = abs(hash(category)) % (2**32)

        print(f"[{idx:2d}/{total}] GEN   {category} ...", end="", flush=True)
        t0 = time.time()

        try:
            generator = torch.Generator(device="cuda").manual_seed(seed)
            with torch.no_grad():
                result = pipe(
                    full_prompt,
                    negative_prompt=NEGATIVE_PROMPT,
                    width=512,
                    height=512,
                    num_inference_steps=args.steps,
                    guidance_scale=7.5,
                    generator=generator,
                )
            img: Image.Image = result.images[0]
            # 16x16 にリサイズして既存の sprites.json の dimensions を維持
            img = img.resize((16, 16), Image.LANCZOS)
            img.save(out_path)
            elapsed = time.time() - t0
            print(f"  done ({elapsed:.1f}s)")
            generated += 1
        except Exception as e:
            print(f"  FAILED: {e}")
            failed += 1

    print(f"\n[done] generated={generated}  skipped={skipped}  failed={failed}")
    print(f"[out]  {os.path.abspath(OUTPUT_DIR)}")


if __name__ == "__main__":
    main()
