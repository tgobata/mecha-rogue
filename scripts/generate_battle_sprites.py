"""
generate_battle_sprites.py
バトル画面用の敵スプライト(256x256)を Stable Diffusion で生成する。

使い方:
  py -3.12 scripts/generate_battle_sprites.py

オプション:
  --only <id1,id2,...>  指定した enemyType だけ生成
  --force               既存ファイルを上書き再生成
  --steps N             推論ステップ数(デフォルト 25)
  --preview             生成せず対象リストだけ表示

出力先: public/sprites/enemies/battle/{enemyType}.png
"""

import argparse
import os
import sys
import time

OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "public", "sprites", "enemies", "battle"
)

# ---------------------------------------------------------------------------
# 敵タイプ別プロンプト定義
# ---------------------------------------------------------------------------
# 共通スタイル修飾子はコード側で付加。ここには各敵固有の外見記述のみ書く。

# シグネチャカラー・シルエット・かわいさを凝縮（CLIPトークン上限: STYLE_PREFIXと合算77以内）
ENEMY_PROMPTS: dict[str, str] = {
    # ── 通常敵 ──────────────────────────────────────────────────────
    "scout_drone":
        "sky-blue round flying drone, huge sparkly camera eye, four tiny propellers, "
        "chubby teardrop body, cyan glow, adorable baby robot",

    "mine_beetle":
        "lime-green fat beetle robot, three red round mines on back, "
        "six stubby legs, big innocent black eyes, round shiny carapace",

    "guard_bot":
        "boxy security patrol robot, holding electric shock baton crackling with yellow sparks, "
        "thick heavy front armor shield plate on chest, "
        "rotating orange warning light on head, square yellow visor, "
        "grey and dark yellow color, stern patrolling stance",

    "slime_x":
        "silver chrome slime blob, rainbow iridescent surface, "
        "one big winking eye, golden glowing core inside, wobbly jelly silhouette",

    "mini_slime":
        "tiny pastel silver slime drop, one giant dewy eye, pearl white, "
        "water-drop shape, happy smile, ultra small and round",

    "rust_hound":
        "rust-orange dog robot, floppy cracked metal ears, red glowing eyes, "
        "broken tail antenna wagging, peeling orange paint, scruffy four-legged",

    "spark":
        "vivid yellow electric sphere, zigzag lightning arms and legs, "
        "crescent white eyes, electric arcs crackling, energetic bouncy pose",

    "mine_layer":
        "yellow-black hazard stripe tank robot, two big cartoon treads, "
        "worried eyes, mine dispenser chute, round chubby chassis",

    "assault_mecha":
        "cobalt blue humanoid mecha, white star markings, big shoulder pads, "
        "arm cannons, orange visor glow, heroic wide-legged stance",

    "stealth_killer":
        "matte black ninja robot, purple trim, crimson laser eye, "
        "blade arms, purple energy scarf trailing, crouching sneaky pose",

    "shield_knight":
        "gold silver knight robot, giant round glowing shield, "
        "tiny lance, blue eye-slit visor, proud noble stance",

    "healer_drone":
        "tiny round hovering repair drone, spinning rotors on top, "
        "green glowing repair beam arm extended, medical cross emblem on body, "
        "mint green and white, no legs, frightened fleeing pose",

    "metal_wolf":
        "chrome silver wolf robot, icy blue glowing eyes, "
        "metallic fur mane plates, perky ears, bushy chrome tail, elegant",

    "bomb_lobber":
        "bright orange chubby robot, oversized arm raising a lit black bomb, "
        "round rotund body, tiny feet, sweat-drop panic face",

    "acid_spitter":
        "neon green snake robot, wide grinning mouth dripping acid, "
        "bulgy eyes, coiled serpentine body, toxic teal color",

    "cannon_turtle":
        "olive green turtle robot, enormous cannon barrel chimney on shell, "
        "stubby four legs, targeting monocle, sleepy expression",

    "phase_ghost":
        "translucent sky-blue ghost robot, glitchy pixel edges, "
        "huge white ghost eyes, wispy tail body, floating spooky-cute",

    "mimic":
        "wooden brown treasure chest robot, wide open lid with jagged teeth, "
        "innocent corner eyes, four tentacle legs, gold lock details",

    "berserker":
        "cracked red armor robot, exposed hydraulic pistons, "
        "dual jagged blade arms wide open, steam venting, furious rage eyes",

    "teleporter":
        "violet sleek robot, holographic portal ring at waist, "
        "teal warp shimmer, one foot stepping into portal, curious pose",

    "commander":
        "navy blue tall robot, gold epaulettes, broadcasting antenna head, "
        "gold insignia chest, pointing gesture, bossy confident face",

    "mag_sniper":
        "gunmetal robot, comically long railgun barrel, targeting scope eye, "
        "kneeling stance, red laser dot, focused squint",

    "death_machine":
        "glossy black robot, bone-pattern engravings, red skull visor, "
        "crescent scythe, dark cape, red joint glow, menacing smirk",

    "reflector":
        "polished hexagonal chrome robot, rainbow prism crystal chest, "
        "deflector arms, light beams bouncing, smug shiny expression",

    "abyss_worm":
        "dark brown segmented worm robot, giant copper spiral drill head, "
        "ring teeth, dirt flying, dizzy spinning eyes",

    "chrono_shifter":
        "deep purple round robot, glowing clock face chest, "
        "golden gears orbiting as halo, pocket watch chain, mysterious wink",

    "nano_swarm":
        "teal humanoid shape from thousands of glowing nano-dots, "
        "shifting particle edges, two white eyes in swarm center, fluid form",

    "void_stalker":
        "liquid darkness body robot, two piercing white eyes, "
        "shadow tentacles, trapped stars inside body, eerie predator grin",

    "last_boss_shadow":
        "towering black shadow boss, six glowing yellow eyes, "
        "giant shadow wings spread, deep purple lightning aura, sinister",

    "oil_drum":
        "hazard-yellow barrel robot, red warning stripes, "
        "dented angry face with X eyes and frown, stubby arms and feet, oil drips",

    "igniter":
        "red-orange fire robot, both arms are flamethrower nozzles, "
        "pilot flame on head, ember sparks, manic excited expression",

    "fire_people":
        "humanoid robot wrapped in bright orange flames, "
        "happy eyes through fire, ember particles rising, fiery crest",

    # ── ボス ────────────────────────────────────────────────────────
    "bug_swarm":
        "giant swarm boss, creature shape from thousands of tiny green beetles, "
        "two huge yellow compound eyes, bug-mandible mouth, bioluminescent glow",

    "mach_runner":
        "scarlet red streamlined speed mecha, twin orange afterburner jets, "
        "racing number chest, motion speed lines, exhilarated expression",

    "junk_king":
        "huge patchwork robot king, scrap-parts body, wrench-pipe crown, "
        "asymmetric arms, blinking salvaged lights, proud junk-king face",

    "phantom":
        "pale blue translucent ghost mecha, glowing blue veins, "
        "spectral cloak, multiple phantom arms floating, haunting gentle smile",

    "iron_fortress":
        "walking iron castle boss, massive castle wall body, "
        "portcullis gate face with red glowing eyes, crenellated battlements crown, "
        "two shoulder cannons, tiny legs under huge wall, iron grey stone",

    "samurai_master":
        "crimson gold samurai mecha, tall kabuto crest, twin katana blades, "
        "cherry blossoms swirling, haori cape, noble warrior expression",

    "shadow_twin":
        "twin robots one pure white one pure black, energy tether connecting them, "
        "each with one glowing eye, yin-yang pose, enigmatic synchronized",

    "queen_of_shadow":
        "dark violet regal mecha queen, jeweled crown, flowing shadow robe, "
        "swirling portal behind, imperial stance, deep violet and black",

    "mind_controller":
        "dome-head robot with giant pink brain visible inside, "
        "psionic antenna array, objects orbiting telekinetically, smug all-knowing",

    "overload":
        "white robot cracking apart with blinding electricity, "
        "bolts from every joint, red alarm light, panicked overclocked expression",

    "time_eater":
        "hourglass-body robot, golden sand flowing inside, "
        "devouring clock gears in mouth, antique gold and deep purple",

    "eternal_core":
        "crystalline sphere robot, pure white radiant light, "
        "planet-like orbiting rings, rainbow inner core, angelic mechanical wings",

    "big_oil_drum":
        "massive double-wide yellow barrel boss, huge angry bolted-on face, "
        "volcano explosion from top, skull hazard labels, furious expression",

    "final_boss":
        "ominous shifting dark boss, giant glowing question mark as face, "
        "reality-warping rainbow tears, hands from dimensional rifts, unknowable",
}

# ---------------------------------------------------------------------------
# 共通プロンプト部品
# ---------------------------------------------------------------------------

# CLIPトークン上限77。STYLE_PREFIX単体で約20トークンに抑える
STYLE_PREFIX = (
    "(masterpiece, best quality), "
    "cute chibi anime robot, 2D game sprite, "
    "vibrant colors, cel-shaded, black background, full body, "
)

NEGATIVE_PROMPT = (
    "blurry, low quality, bad anatomy, extra limbs, deformed, "
    "multiple characters, text, watermark, signature, border, frame, "
    "realistic photograph, 3D render, dark muddy colors, monochrome, "
    "human face, nsfw, cropped, partial body"
)


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--only", type=str, default="", help="comma-separated IDs to generate")
    p.add_argument("--force", action="store_true", help="overwrite existing files")
    p.add_argument("--steps", type=int, default=25, help="inference steps")
    p.add_argument("--preview", action="store_true", help="list targets without generating")
    return p.parse_args()


def main():
    args = parse_args()

    only_set = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else set()

    targets = [
        (eid, prompt)
        for eid, prompt in ENEMY_PROMPTS.items()
        if (not only_set or eid in only_set)
    ]

    if args.preview:
        print(f"[preview] {len(targets)} targets:")
        for eid, _ in targets:
            out = os.path.join(OUTPUT_DIR, f"{eid}.png")
            status = "EXISTS" if os.path.exists(out) else "pending"
            print(f"  {eid:30s}  {status}")
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

    print(f"[info] Model loaded. Generating {len(targets)} sprites ...\n")

    from PIL import Image
    import torch

    total = len(targets)
    generated = 0
    skipped   = 0
    failed    = 0

    for idx, (eid, specific_prompt) in enumerate(targets, 1):
        out_path = os.path.join(OUTPUT_DIR, f"{eid}.png")

        if os.path.exists(out_path) and not args.force:
            print(f"[{idx:2d}/{total}] SKIP  {eid}")
            skipped += 1
            continue

        full_prompt = STYLE_PREFIX + specific_prompt
        seed = abs(hash(eid)) % (2**32)

        print(f"[{idx:2d}/{total}] GEN   {eid} ...", end="", flush=True)
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
            img = img.resize((256, 256), Image.LANCZOS)
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
