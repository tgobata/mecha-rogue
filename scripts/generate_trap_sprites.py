"""
generate_trap_sprites.py
罠タイル用スプライト(64x64)を Stable Diffusion で生成する。

使い方:
  py -3.12 scripts/generate_trap_sprites.py

オプション:
  --only <type1,type2,...>  指定した TrapType だけ生成
  --force                   既存ファイルを上書き再生成
  --steps N                 推論ステップ数(デフォルト 25)
  --preview                 生成せず対象リストだけ表示

出力先: public/sprites/tiles/trap_{type}.png (64x64)
"""

import argparse
import os
import time

OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "public", "sprites", "tiles"
)

# ---------------------------------------------------------------------------
# 罠タイプ別プロンプト定義
# ---------------------------------------------------------------------------
# CLIPトークン上限 77。STYLE_PREFIX 約20トークン + 各プロンプト ≤ 55 トークン。

TRAP_PROMPTS: dict[str, str] = {
    "visible_pitfall":
        "open square pit hole in floor, warning yellow stripes around edge, clearly visible danger",

    "hidden_pitfall":
        "disguised floor panel, slightly different texture, hidden pressure plate, subtle crack",

    "large_pitfall":
        "huge deep pit hole, two tile wide, red warning border, deep darkness inside",

    "landmine":
        "round metal landmine, pressure trigger button on top, red warning light, half buried in floor",

    "poison_gas":
        "gas vent nozzle in floor, green toxic mist puffing out, biohazard symbol, green and yellow",

    "arrow_trap":
        "wall arrow launcher mechanism, loaded arrows pointing sideways, tension spring, grey metal",

    "teleport_trap":
        "swirling purple warp portal pad in floor, teleport energy, concentric rings",

    "item_loss":
        "magnetic vacuum trap, suction vortex, items floating toward center, grey and blue",

    "summon_trap":
        "red summoning circle on floor, glowing rune pattern, enemy silhouettes appearing",

    "rust_trap":
        "corrosive spray nozzle, orange rust dripping, acid splatter pattern, brown orange",
}

# ---------------------------------------------------------------------------
# 共通プロンプト部品
# ---------------------------------------------------------------------------

# CLIPトークン上限77。STYLE_PREFIX単体で約20トークンに抑える
STYLE_PREFIX = (
    "(masterpiece, best quality), "
    "cute chibi anime icon, 2D game tile sprite, top-down view, "
    "vibrant colors, cel-shaded, black background, "
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
    p.add_argument("--only", type=str, default="", help="comma-separated TrapTypes to generate")
    p.add_argument("--force", action="store_true", help="overwrite existing files")
    p.add_argument("--steps", type=int, default=25, help="inference steps")
    p.add_argument("--preview", action="store_true", help="list targets without generating")
    return p.parse_args()


def main():
    args = parse_args()

    only_set = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else set()

    targets = [
        (trap_type, prompt)
        for trap_type, prompt in TRAP_PROMPTS.items()
        if (not only_set or trap_type in only_set)
    ]

    if args.preview:
        print(f"[preview] {len(targets)} targets:")
        for trap_type, _ in targets:
            out = os.path.join(OUTPUT_DIR, f"trap_{trap_type}.png")
            status = "EXISTS" if os.path.exists(out) else "pending"
            print(f"  {trap_type:30s}  {status}")
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

    print(f"[info] Model loaded. Generating {len(targets)} trap sprites ...\n")

    from PIL import Image

    total = len(targets)
    generated = 0
    skipped   = 0
    failed    = 0

    for idx, (trap_type, specific_prompt) in enumerate(targets, 1):
        out_path = os.path.join(OUTPUT_DIR, f"trap_{trap_type}.png")

        if os.path.exists(out_path) and not args.force:
            print(f"[{idx:2d}/{total}] SKIP  {trap_type}")
            skipped += 1
            continue

        full_prompt = STYLE_PREFIX + specific_prompt
        seed = abs(hash(trap_type)) % (2**32)

        print(f"[{idx:2d}/{total}] GEN   {trap_type} ...", end="", flush=True)
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
            img = img.resize((64, 64), Image.LANCZOS)
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
