'use client';

/**
 * @fileoverview オーディオエンジン
 *
 * Tone.js を使ってチップチューン風のBGM・SEをプログラム生成する。
 * 外部音声ファイルは一切使用しない。
 *
 * SSR 非対応のため dynamic import で遅延ロードする。
 * ユーザー操作後（initAudio呼び出し後）にのみ AudioContext を起動する。
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 再生可能なSE名の列挙型 */
export type SoundEffectName =
  | 'attack_melee'
  | 'attack_ranged'
  | 'attack_special'
  | 'hit_enemy'
  | 'hit_player'
  | 'enemy_death'
  | 'player_death'
  | 'item_pickup'
  | 'weapon_equip'
  | 'weapon_break'
  | 'floor_descend'
  | 'status_frozen'
  | 'status_burning'
  | 'status_shocked'
  | 'ui_select'
  | 'ui_cancel'
  | 'boss_appear'
  | 'level_up'
  | 'equipment_break_long';

/** 再生可能なBGM名の列挙型 */
export type BGMName =
  | 'title'
  | 'explore'
  | 'explore_light'
  | 'battle'
  | 'boss'
  | 'boss_bug_swarm'
  | 'boss_mach_runner'
  | 'boss_junk_king'
  | 'boss_phantom'
  | 'boss_iron_fortress'
  | 'shop'
  | 'base'
  | 'gameOver'
  | 'bossDefeat'
  | 'deep';

// ---------------------------------------------------------------------------
// モジュールスコープの状態
// ---------------------------------------------------------------------------

/** Tone.js モジュールへの参照（dynamic import 後に格納） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Tone: any = null;

/** Tone.js の事前ロードPromise（iOS Safari対応: ジェスチャー前にロード完了させる） */
let toneLoadPromise: Promise<void> | null = null;
if (typeof window !== 'undefined') {
  toneLoadPromise = import('tone').then(t => { Tone = t; }).catch(() => {});
}

/** 初期化済みフラグ */
let audioReady = false;

/** 現在再生中のBGM名 */
let currentBGM: BGMName | null = null;

/** 現在再生中のBGMのTone.jsオブジェクト群（dispose用） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeBGMParts: any[] = [];

/** 事前レンダリング済みBGMバッファのキャッシュ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bgmBufferCache: Map<BGMName, any> = new Map();

/**
 * BGMのメタ情報（Tone.Offline の duration 計算用）。
 * loopBars: ループ単位の小節数。0 = ループなし（ジングル）。
 */
const BGM_META: Partial<Record<BGMName, { bpm: number; loopBars: number }>> = {
  title:             { bpm: 135, loopBars: 4 },
  explore:           { bpm: 80,  loopBars: 8 },
  explore_light:     { bpm: 130, loopBars: 8 },
  battle:            { bpm: 140, loopBars: 8 },
  boss:              { bpm: 140, loopBars: 4 },
  boss_bug_swarm:    { bpm: 120, loopBars: 4 },
  boss_mach_runner:  { bpm: 175, loopBars: 4 },
  boss_junk_king:    { bpm: 60,  loopBars: 8 },
  boss_phantom:      { bpm: 90,  loopBars: 8 },
  boss_iron_fortress:{ bpm: 100, loopBars: 8 },
  shop:              { bpm: 100, loopBars: 4 },
  base:              { bpm: 90,  loopBars: 4 },
  deep:              { bpm: 110, loopBars: 8 },
  // gameOver, bossDefeat はループなしのジングルなのでキャッシュしない
};

/**
 * モバイル端末かどうかを判定する。
 * iOS/Android では OfflineAudioContext がメインコンテキストを suspend させる場合があるため、
 * 事前レンダリングをスキップしてライブレンダリングのみ使用する。
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  // maxTouchPoints > 1 で iPad（デスクトップモード含む）も検出
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
}

/** BGM用音量ノード */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bgmVol: any = null;

/** BGM通常ボリューム（dB） */
const BGM_NORMAL_DB = -12;

/** フェードアウト中の setTimeout ID（多重フェード防止） */
let fadeOutTimerId: ReturnType<typeof setTimeout> | null = null;

/** SE用音量ノード */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let seVol: any = null;

/** マスターボリューム（0.0〜1.0） */
let masterVolume = 0.8;

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

/**
 * iOS Safari対応: ユーザージェスチャーの同期コールスタック内でAudioContextをunlockする。
 * awaitを使わずに呼ぶこと（async/awaitはiOSのジェスチャーコンテキストを破壊する）。
 * Tone.jsが事前ロード済みの場合のみ有効。
 */
export function unlockAudioContext(): void {
  if (Tone) {
    // Tone.start()はPromiseを返すがawaitしない（iOSのジェスチャーコンテキスト保持のため）
    Tone.start().catch(() => {});
    return;
  }
  // Tone.js未ロード時: ネイティブWebAudio APIで直接AudioContextをunlockする
  // iOS SafariはユーザージェスチャーのコールスタックでAudioContext.resume()を呼ぶ必要がある
  if (typeof window !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const tempCtx = new AudioContextClass();
        tempCtx.resume().then(() => tempCtx.close()).catch(() => {});
      }
    } catch { /* ignore */ }
  }
}

/**
 * オーディオシステムを初期化する。
 * ユーザーインタラクション（クリック等）後に1回だけ呼ぶこと。
 */
export async function initAudio(): Promise<void> {
  if (audioReady) return;
  if (typeof window === 'undefined') return;

  // 事前ロードが完了していない場合はここで待つ（通常は既にロード済み）
  if (!Tone) {
    if (toneLoadPromise) {
      await toneLoadPromise;
    } else {
      Tone = await import('tone');
    }
  }

  // AudioContext を起動（ブラウザのオートプレイポリシー対応）
  await Tone.start();

  // スケジューラの先読み時間を延ばしてメインスレッド負荷によるドロップを防ぐ
  // 0.5 秒に引き上げ（事前レンダリングが完成するまでの保険）
  Tone.getContext().lookAhead = 0.5;

  // マスターボリューム設定
  Tone.getDestination().volume.value = volumeToDb(masterVolume) - 6;

  // BGM・SE 用音量ノード
  bgmVol = new Tone.Volume(BGM_NORMAL_DB).toDestination();
  seVol  = new Tone.Volume(-6).toDestination();

  audioReady = true;

  // iOS/Android では OfflineAudioContext 生成がメインコンテキストを suspend させる
  // 恐れがあるため事前レンダリングはスキップし、ライブレンダリングのみ使用する。
  // デスクトップではバックグラウンドで事前レンダリングしてメインスレッドのジャンクを回避する。
  if (!isMobileDevice()) {
    const BGM_PRERENDER_ORDER: BGMName[] = [
      'explore', 'explore_light', 'battle',
      'title', 'shop', 'base', 'deep',
      'boss', 'boss_bug_swarm', 'boss_mach_runner',
      'boss_junk_king', 'boss_phantom', 'boss_iron_fortress',
    ];
    (async () => {
      for (const name of BGM_PRERENDER_ORDER) {
        await preRenderBGM(name);
        // OfflineAudioContext 作成後にメインコンテキストが suspend されていれば再開する
        try {
          if (Tone.getContext().state === 'suspended') {
            await Tone.start();
          }
        } catch { /* ignore */ }
      }
    })();
  }

  // iOS Safari はタブのバックグラウンド移行時に AudioContext を自動 suspend する。
  // 前面復帰時に自動再開する。
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && audioReady && Tone) {
        Tone.start().catch(() => {});
      }
    });
  }
}

/**
 * SEを再生する。
 * initAudio() が呼ばれていない場合は何もしない。
 */
export function playSE(name: SoundEffectName): void {
  if (!audioReady || !Tone) return;
  try {
    SE_PLAYERS[name]?.();
  } catch {
    // SE 再生エラーは無視（ゲームプレイに影響させない）
  }
}

/**
 * BGMを再生する。
 * 既に同じBGMが再生中の場合は何もしない。
 * 別のBGMが再生中の場合はフェードアウトしてから新しいBGMをフェードインする。
 *
 * @param fadeOutSec フェードアウト時間（秒）。デフォルト 0.8
 * @param fadeInSec  フェードイン時間（秒）。デフォルト 0.6
 */
export function playBGM(name: BGMName, fadeOutSec = 0.8, fadeInSec = 0.6): void {
  if (!audioReady || !Tone) return;
  if (currentBGM === name) return;

  // 既にフェードアウト中なら前のタイマーをキャンセルして即切り替え
  if (fadeOutTimerId !== null) {
    clearTimeout(fadeOutTimerId);
    fadeOutTimerId = null;
    stopBGM();
    _startBGMWithFadeIn(name, fadeInSec);
    return;
  }

  if (currentBGM !== null) {
    // 現在のBGMをフェードアウトしてから切り替える
    try {
      bgmVol.volume.rampTo(-60, fadeOutSec);
    } catch {
      // フェードアウト失敗時は即停止
    }
    fadeOutTimerId = setTimeout(() => {
      fadeOutTimerId = null;
      stopBGM();
      _startBGMWithFadeIn(name, fadeInSec);
    }, fadeOutSec * 1000 + 50);
  } else {
    // BGM未再生 — フェードインのみ
    _startBGMWithFadeIn(name, fadeInSec);
  }
}

/**
 * BGMをオフラインで事前レンダリングしてバッファキャッシュに格納する。
 * Tone.Offline で生成した AudioBuffer を Tone.Player で再生することで
 * メインスレッドのジャンクに完全に依存しない再生を実現する。
 */
async function preRenderBGM(name: BGMName): Promise<void> {
  if (!Tone || bgmBufferCache.has(name)) return;
  const meta = BGM_META[name];
  if (!meta || meta.loopBars === 0) return;

  const secPerBar = (60 / meta.bpm) * 4; // 1小節の秒数（4/4拍子）
  const loopDuration = secPerBar * meta.loopBars;
  const renderDuration = loopDuration + 1.0; // リリーステール用に +1 秒

  // オフラインコンテキスト内で生成された Parts を追跡するローカル変数
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let offlineParts: any[] = [];

  try {
    const buffer = await Tone.Offline(() => {
      // BGM_PLAYERS は activeBGMParts（モジュールグローバル）に同期的に書き込む。
      // Tone.Offline のコールバックは同期実行されるため、ここで確実に捕捉・復元できる。
      const prevParts = activeBGMParts;
      activeBGMParts = [];
      Tone.getTransport().bpm.value = meta.bpm;
      BGM_PLAYERS[name](Tone.getDestination());
      // BGM ファクトリーが書き込んだオフライン Parts を退避
      offlineParts = activeBGMParts;
      // 非同期レンダリング開始前にライブ Parts を即座に復元
      // （レンダリング中に playBGM が呼ばれても activeBGMParts が上書きされない）
      activeBGMParts = prevParts;
    }, renderDuration);

    bgmBufferCache.set(name, buffer);
  } catch {
    // 事前レンダリング失敗時はライブレンダリングにフォールバックするため無視
  } finally {
    // オフライン Parts のみ破棄（ライブ Parts には一切触れない）
    for (const p of offlineParts) {
      try { p.stop?.(); p.dispose?.(); } catch { /* ignore */ }
    }
  }
}

/**
 * BGMをフェードインで開始する内部ヘルパー。
 */
function _startBGMWithFadeIn(name: BGMName, fadeInSec: number): void {
  if (!Tone || !bgmVol) return;
  try {
    bgmVol.volume.value = -60;

    const cached = bgmBufferCache.get(name);
    if (cached) {
      // ── 事前レンダリング済み: AudioBufferSourceNode で再生（オーディオスレッド完全独立）
      const player = new Tone.Player(cached).connect(bgmVol);
      player.loop = true;
      // ループ区間をテール (+1秒) を除いた音楽部分のみに限定
      const meta = BGM_META[name];
      if (meta) {
        const loopDuration = (60 / meta.bpm) * 4 * meta.loopBars;
        player.loopStart = 0;
        player.loopEnd = loopDuration;
      }
      player.start();
      activeBGMParts = [player];
    } else {
      // ── フォールバック: ライブレンダリング（バッファ未完成時）
      BGM_PLAYERS[name]?.(bgmVol);
    }

    currentBGM = name;
    bgmVol.volume.rampTo(BGM_NORMAL_DB, fadeInSec);
  } catch {
    // BGM 再生エラーは無視
  }
}

/**
 * BGMを停止する（即時停止）。
 * フェードアウト中のタイマーもキャンセルする。
 */
export function stopBGM(): void {
  if (!Tone) return;

  // フェードアウトタイマーが残っていればキャンセル
  if (fadeOutTimerId !== null) {
    clearTimeout(fadeOutTimerId);
    fadeOutTimerId = null;
  }

  // Transport を停止してポジションを 0 にリセット
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  Tone.getTransport().position = 0;

  // 再生中の Part/Sequence を dispose
  for (const part of activeBGMParts) {
    try {
      part.stop();
      part.dispose();
    } catch {
      // ignore
    }
  }
  activeBGMParts = [];
  currentBGM = null;

  // 次回フェードインのためにボリュームをノーマルに戻す
  if (bgmVol) {
    try { bgmVol.volume.value = BGM_NORMAL_DB; } catch { /* ignore */ }
  }
}

/**
 * マスターボリュームを設定する。
 * @param vol 0.0（無音）〜1.0（最大）
 */
export function setVolume(vol: number): void {
  masterVolume = Math.max(0, Math.min(1, vol));
  if (!Tone) return;
  Tone.getDestination().volume.value = volumeToDb(masterVolume) - 6;
}

/**
 * オーディオが初期化済みかどうかを返す。
 */
export function isAudioReady(): boolean {
  return audioReady;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 0.0〜1.0 の音量値をデシベルに変換する。
 */
function volumeToDb(vol: number): number {
  if (vol <= 0) return -Infinity;
  return 20 * Math.log10(vol);
}

/**
 * 指定時刻（Tone.js 時間文字列または秒）から少し後の時刻を返す。
 * SEの重ね再生用。
 */
function now(): number {
  return Tone.now() + 0.01;
}

// ---------------------------------------------------------------------------
// SE 実装
// ---------------------------------------------------------------------------

/** SE 再生関数マップ */
const SE_PLAYERS: Record<SoundEffectName, () => void> = {

  /** 近接攻撃: 「ザシュ」短い刃音 */
  attack_melee: () => {
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.01 },
    }).connect(seVol);
    noise.triggerAttackRelease('8n', now());
    setTimeout(() => noise.dispose(), 500);
  },

  /** 遠距離攻撃: 「パン」高音の発射音 */
  attack_ranged: () => {
    const synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.01 },
    }).connect(seVol);
    const t = now();
    synth.triggerAttack(880, t);
    synth.frequency.exponentialRampTo(220, 0.1, t);
    synth.triggerRelease(t + 0.1);
    setTimeout(() => synth.dispose(), 500);
  },

  /** 特殊攻撃: 「ビュィン」エネルギー音 */
  attack_special: () => {
    const synth = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 10,
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1 },
    }).connect(seVol);
    const t = now();
    synth.triggerAttack('C4', t);
    synth.frequency.exponentialRampTo(880, 0.15, t);
    synth.triggerRelease(t + 0.2);
    setTimeout(() => synth.dispose(), 800);
  },

  /** 敵にヒット: 「ドン」金属打撃音 */
  hit_enemy: () => {
    const synth = new Tone.MetalSynth({
      frequency: 200,
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(seVol);
    synth.triggerAttackRelease('16n', now());
    setTimeout(() => synth.dispose(), 500);
  },

  /** プレイヤー被弾: 「ガン」重い被弾音 */
  hit_player: () => {
    const synth = new Tone.MetalSynth({
      frequency: 80,
      envelope: { attack: 0.001, decay: 0.2, release: 0.05 },
      harmonicity: 3.1,
      modulationIndex: 16,
      resonance: 2000,
      octaves: 1.0,
    }).connect(seVol);
    synth.triggerAttackRelease('8n', now());
    setTimeout(() => synth.dispose(), 600);
  },

  /** 敵撃破: 「シュルルル」爆散音 */
  enemy_death: () => {
    const noise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0, release: 0.05 },
    }).connect(seVol);
    noise.triggerAttackRelease('4n', now());
    setTimeout(() => noise.dispose(), 800);
  },

  /** プレイヤー大破: 「ガシャーン」大破音（長め） */
  player_death: () => {
    const metal = new Tone.MetalSynth({
      frequency: 60,
      envelope: { attack: 0.005, decay: 0.4, release: 0.1 },
      harmonicity: 2.1,
      modulationIndex: 8,
      resonance: 800,
      octaves: 1.2,
    }).connect(seVol);
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.1 },
    }).connect(seVol);
    const t = now();
    metal.triggerAttackRelease('4n', t);
    noise.triggerAttackRelease('4n', t + 0.05);
    setTimeout(() => { metal.dispose(); noise.dispose(); }, 1200);
  },

  /** アイテム取得: 「チン」高音ベル */
  item_pickup: () => {
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.2 },
    }).connect(seVol);
    const t = now();
    synth.triggerAttack(1047, t);
    synth.frequency.exponentialRampTo(2093, 0.15, t);
    synth.triggerRelease(t + 0.3);
    setTimeout(() => synth.dispose(), 800);
  },

  /** 武器装備: 「カキン」装備音 */
  weapon_equip: () => {
    const synth = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.08, release: 0.01 },
      harmonicity: 8,
      modulationIndex: 16,
      resonance: 6000,
      octaves: 1.5,
    }).connect(seVol);
    synth.triggerAttackRelease('16n', now());
    setTimeout(() => synth.dispose(), 400);
  },

  /** 武器破壊: 「ビキ」破壊音 */
  weapon_break: () => {
    const dist  = new Tone.Distortion(0.8).connect(seVol);
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.02 },
    }).connect(dist);
    noise.triggerAttackRelease('8n', now());
    setTimeout(() => { noise.dispose(); dist.dispose(); }, 600);
  },

  /** フロア遷移: 「ウォン」下降音 */
  floor_descend: () => {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.35, sustain: 0.1, release: 0.1 },
    }).connect(seVol);
    const t = now();
    synth.triggerAttack(440, t);
    synth.frequency.exponentialRampTo(110, 0.4, t);
    synth.triggerRelease(t + 0.4);
    setTimeout(() => synth.dispose(), 1000);
  },

  /** 凍結付与: 「シャリン」氷音 */
  status_frozen: () => {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
    }).connect(seVol);
    const t = now();
    synth.triggerAttack(2093, t);
    synth.frequency.exponentialRampTo(1047, 0.1, t);
    synth.triggerRelease(t + 0.15);
    setTimeout(() => synth.dispose(), 500);
  },

  /** 炎上付与: 「ボォ」炎音 */
  status_burning: () => {
    const noise = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.02, decay: 0.12, sustain: 0, release: 0.02 },
    }).connect(seVol);
    noise.triggerAttackRelease('8n', now());
    setTimeout(() => noise.dispose(), 500);
  },

  /** 感電付与: 「ビリビリ」電撃音 */
  status_shocked: () => {
    const tremolo = new Tone.Tremolo({ frequency: 40, depth: 1.0 }).connect(seVol).start();
    const synth   = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0.3, release: 0.05 },
    }).connect(tremolo);
    const t = now();
    synth.triggerAttack(660, t);
    synth.triggerRelease(t + 0.18);
    setTimeout(() => { synth.dispose(); tremolo.dispose(); }, 600);
  },

  /** UI決定: 「ピ」短い決定音 */
  ui_select: () => {
    const synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    }).connect(seVol);
    synth.triggerAttackRelease(880, '32n', now());
    setTimeout(() => synth.dispose(), 300);
  },

  /** UIキャンセル: 「プ」短いキャンセル音 */
  ui_cancel: () => {
    const synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.01 },
    }).connect(seVol);
    const t = now();
    synth.triggerAttack(440, t);
    synth.frequency.linearRampTo(220, 0.08, t);
    synth.triggerRelease(t + 0.1);
    setTimeout(() => synth.dispose(), 400);
  },

  /** ボス登場: 「ドドドド」低音ドラム4連打 */
  boss_appear: () => {
    const drum = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    }).connect(seVol);
    const t = now();
    drum.triggerAttackRelease('C1', '8n', t);
    drum.triggerAttackRelease('C1', '8n', t + 0.18);
    drum.triggerAttackRelease('C1', '8n', t + 0.36);
    drum.triggerAttackRelease('C1', '8n', t + 0.54);
    setTimeout(() => drum.dispose(), 1500);
  },

  /** レベルアップ: 「ジャーン」上昇アルペジオ */
  level_up: () => {
    const synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.3, release: 0.1 },
    }).connect(seVol);
    const t = now();
    const notes = ['C4', 'E4', 'G4', 'C5'] as const;
    notes.forEach((note, i) => {
      synth.triggerAttackRelease(note, '8n', t + i * 0.1);
    });
    setTimeout(() => synth.dispose(), 1000);
  },

  /** 装備大破: 「ピピピピ」警告音（長め） */
  equipment_break_long: () => {
    const synth = new Tone.Oscillator({
      type: 'square',
      frequency: 440,
    }).connect(seVol);
    const t = now();
    // 1.5秒間、0.1秒おきに音量を上下させてビープ音を作る
    synth.start(t);
    for (let i = 0; i < 15; i++) {
      const startTime = t + i * 0.1;
      synth.volume.setValueAtTime(-6, startTime);
      synth.volume.setValueAtTime(-60, startTime + 0.05);
    }
    synth.stop(t + 1.5);
    setTimeout(() => synth.dispose(), 2000);
  },
};

// ---------------------------------------------------------------------------
// BGM 実装
// ---------------------------------------------------------------------------

/** BGM 再生関数マップ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BGM_PLAYERS: Record<BGMName, (dest: any) => void> = {

  /**
   * タイトル BGM
   * C major, 100 BPM, 明るい冒険感
   * コード進行: C - Am - F - G (8小節ループ)
   */
  title: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 135; // 楽しそうで軽快なテンポ

    // リズミカルなピコピコメロディ
    const melSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.1 },
    }).connect(dest);

    // はねるベース
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1 },
    }).connect(dest);

    const kick = new Tone.MembraneSynth().connect(dest);
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.01 },
    }).connect(dest);

    // 軽快なメロディ (C - F - G - C) 4小節ループ
    const melNotes: [string, string][] = [
      ['0:0:0', 'E5'], ['0:0:2', 'G5'], ['0:1:0', 'C6'], ['0:1:2', 'G5'],
      ['0:2:0', 'E5'], ['0:2:2', 'C5'], ['0:3:0', 'D5'], ['0:3:2', 'E5'],
      ['1:0:0', 'F5'], ['1:0:2', 'A5'], ['1:1:0', 'C6'], ['1:1:2', 'A5'],
      ['1:2:0', 'F5'], ['1:2:2', 'C5'], ['1:3:0', 'D5'], ['1:3:2', 'E5'],
      ['2:0:0', 'D5'], ['2:0:2', 'G5'], ['2:1:0', 'B5'], ['2:1:2', 'G5'],
      ['2:2:0', 'D5'], ['2:2:2', 'B4'], ['2:3:0', 'C5'], ['2:3:2', 'D5'],
      ['3:0:0', 'E5'], ['3:0:2', 'C5'], ['3:1:0', 'E5'], ['3:1:2', 'G5'],
      ['3:2:0', 'C6'], ['3:2:2', 'C6'], ['3:3:0', 'C6'],
    ];

    const melPart = new Tone.Part((time: number, note: string) => {
      melSynth.triggerAttackRelease(note, '16n', time);
    }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '4m';

    // はねるベースライン
    const bassNotes: [string, string][] = [
      ['0:0:0', 'C3'], ['0:0:2', 'C3'], ['0:1:2', 'C3'], ['0:2:0', 'C3'], ['0:2:2', 'C3'],
      ['1:0:0', 'F2'], ['1:0:2', 'F2'], ['1:1:2', 'F2'], ['1:2:0', 'F2'], ['1:2:2', 'F2'],
      ['2:0:0', 'G2'], ['2:0:2', 'G2'], ['2:1:2', 'G2'], ['2:2:0', 'G2'], ['2:2:2', 'G2'],
      ['3:0:0', 'C3'], ['3:0:2', 'C3'], ['3:1:2', 'C3'], ['3:2:0', 'C3'], ['3:2:2', 'C3'],
    ];

    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '16n', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '4m';

    const kickPattern = ['0:0:0','0:1:0','0:2:0','0:3:0', '1:0:0','1:1:0','1:2:0','1:3:0', '2:0:0','2:1:0','2:2:0','2:3:0', '3:0:0','3:1:0','3:2:0','3:3:0'];
    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C2', '16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, kickPattern.map(t => [t, null]));
    kickPart.loop = true;
    kickPart.loopEnd = '4m';

    const snarePattern = ['0:1:0','0:3:0', '1:1:0','1:3:0', '2:1:0','2:3:0', '3:1:0','3:3:0'];
    const snarePart = new Tone.Part((time: number) => {
      try { snare.triggerAttackRelease('16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, snarePattern.map(t => [t, null]));
    snarePart.loop = true;
    snarePart.loopEnd = '4m';

    melPart.start(0);
    bassPart.start(0);
    kickPart.start(0);
    snarePart.start(0);
    transport.start();

    activeBGMParts = [melPart, bassPart, kickPart, snarePart, melSynth, bassSynth, kick, snare];
  },

  /**
   * 探索 BGM
   * Am ペンタトニック, 80 BPM, 緊張感のある探索音楽
   * コード進行: Am - G - F - Em (8小節ループ)
   */
  explore: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 80;

    // メロディシンセ（矩形波）
    const melSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.02, decay: 0.15, sustain: 0.5, release: 0.2 },
    }).connect(dest);

    // パッドシンセ（サイン波、長めアタック）
    const padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 0.5 },
    }).connect(dest);

    // ベースシンセ
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.2 },
    }).connect(dest);

    // メロディ: Am ペンタトニック風フレーズ
    const melNotes: [string, string][] = [
      // Am区間
      ['0:0:0', 'A4'], ['0:0:2', 'C5'], ['0:1:0', 'E5'], ['0:1:2', 'D5'],
      ['0:2:0', 'C5'], ['0:2:2', 'A4'], ['0:3:0', 'G4'],
      // G区間
      ['1:0:0', 'G4'], ['1:0:2', 'B4'], ['1:1:0', 'D5'], ['1:1:2', 'C5'],
      ['1:2:0', 'B4'], ['1:2:2', 'G4'], ['1:3:0', 'A4'],
      // F区間
      ['2:0:0', 'F4'], ['2:0:2', 'A4'], ['2:1:0', 'C5'], ['2:1:2', 'D5'],
      ['2:2:0', 'C5'], ['2:2:2', 'A4'], ['2:3:0', 'G4'],
      // Em区間
      ['3:0:0', 'E4'], ['3:0:2', 'G4'], ['3:1:0', 'B4'], ['3:1:2', 'A4'],
      ['3:2:0', 'G4'], ['3:2:2', 'E4'], ['3:3:0', 'D4'],
      // 繰り返し（変奏）
      ['4:0:0', 'A4'], ['4:0:2', 'E5'], ['4:1:0', 'D5'], ['4:1:2', 'C5'],
      ['4:2:0', 'E5'], ['4:2:2', 'C5'], ['4:3:0', 'A4'],
      ['5:0:0', 'G4'], ['5:0:2', 'D5'], ['5:1:0', 'C5'], ['5:1:2', 'B4'],
      ['5:2:0', 'D5'], ['5:2:2', 'B4'], ['5:3:0', 'G4'],
      ['6:0:0', 'F4'], ['6:0:2', 'C5'], ['6:1:0', 'D5'], ['6:1:2', 'C5'],
      ['6:2:0', 'A4'], ['6:2:2', 'F4'], ['6:3:0', 'E4'],
      ['7:0:0', 'E4'], ['7:0:2', 'B4'], ['7:1:0', 'A4'], ['7:1:2', 'G4'],
      ['7:2:0', 'B4'], ['7:2:2', 'A4'], ['7:3:0', 'E4'],
    ];

    const melPart = new Tone.Part((time: number, note: string) => {
      melSynth.triggerAttackRelease(note, '8n', time);
    }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '8m';

    // パッド: コードを長めに鳴らす
    const padNotes: [string, string[]][] = [
      ['0:0:0', ['A3', 'C4', 'E4']],
      ['2:0:0', ['G3', 'B3', 'D4']],
      ['4:0:0', ['F3', 'A3', 'C4']],
      ['6:0:0', ['E3', 'G3', 'B3']],
    ];

    const padPart = new Tone.Part((time: number, notes: string[]) => {
      padSynth.triggerAttackRelease(notes, '2m', time);
    }, padNotes);
    padPart.loop = true;
    padPart.loopEnd = '8m';

    // ベース
    const bassNotes: [string, string][] = [
      ['0:0:0', 'A2'], ['0:2:0', 'A2'],
      ['1:0:0', 'G2'], ['1:2:0', 'G2'],
      ['2:0:0', 'F2'], ['2:2:0', 'F2'],
      ['3:0:0', 'E2'], ['3:2:0', 'E2'],
      ['4:0:0', 'A2'], ['4:2:0', 'C3'],
      ['5:0:0', 'G2'], ['5:2:0', 'B2'],
      ['6:0:0', 'F2'], ['6:2:0', 'A2'],
      ['7:0:0', 'E2'], ['7:2:0', 'G2'],
    ];

    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '4n', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '8m';

    melPart.start(0);
    padPart.start(0);
    bassPart.start(0);

    transport.start();

    activeBGMParts = [melPart, padPart, bassPart, melSynth, padSynth, bassSynth];
  },

  /**
   * 探索（浅層・軽快）BGM
   * C major, 130 BPM, 明るいチップチューン
   * 用途: フロア10以下の奇数階（1F, 3F, 7F, 9F）
   * コード進行: C - G - Am - F (8小節ループ)
   */
  explore_light: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 130;

    // メロディシンセ（矩形波 ― チップチューン感）
    const melSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.3, release: 0.08 },
    }).connect(dest);

    // ベースシンセ（三角波 ― 軽め）
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.1 },
    }).connect(dest);

    // キック
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.03 },
    }).connect(dest);

    // スネア
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 },
    }).connect(dest);

    // ハイハット（MetalSynth）
    const hihat = new Tone.MetalSynth({
      frequency: 600,
      envelope: { attack: 0.001, decay: 0.015, release: 0.008 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 5000,
      octaves: 1.5,
    }).connect(dest);
    hihat.volume.value = -8;

    // メロディ: Cメジャーペンタトニック（C D E G A）8小節ループ
    // 小節0-3: C - G - Am - F
    // 小節4-7: 変奏（少し動きを加える）
    const melNotes: [string, string][] = [
      // C区間 (小節0)
      ['0:0:0', 'C5'], ['0:0:2', 'E5'], ['0:1:0', 'G5'], ['0:1:2', 'E5'],
      ['0:2:0', 'C5'], ['0:2:2', 'D5'], ['0:3:0', 'E5'],
      // G区間 (小節1)
      ['1:0:0', 'G4'], ['1:0:2', 'B4'], ['1:1:0', 'D5'], ['1:1:2', 'B4'],
      ['1:2:0', 'G4'], ['1:2:2', 'A4'], ['1:3:0', 'B4'],
      // Am区間 (小節2)
      ['2:0:0', 'A4'], ['2:0:2', 'C5'], ['2:1:0', 'E5'], ['2:1:2', 'C5'],
      ['2:2:0', 'A4'], ['2:2:2', 'G4'], ['2:3:0', 'A4'],
      // F区間 (小節3)
      ['3:0:0', 'F4'], ['3:0:2', 'A4'], ['3:1:0', 'C5'], ['3:1:2', 'A4'],
      ['3:2:0', 'G4'], ['3:2:2', 'E4'], ['3:3:0', 'F4'],
      // C区間変奏 (小節4) ― 上行フレーズ
      ['4:0:0', 'C5'], ['4:0:2', 'D5'], ['4:1:0', 'E5'], ['4:1:2', 'G5'],
      ['4:2:0', 'A5'], ['4:2:2', 'G5'], ['4:3:0', 'E5'],
      // G区間変奏 (小節5)
      ['5:0:0', 'D5'], ['5:0:2', 'B4'], ['5:1:0', 'G4'], ['5:1:2', 'A4'],
      ['5:2:0', 'B4'], ['5:2:2', 'D5'], ['5:3:0', 'G4'],
      // Am区間変奏 (小節6)
      ['6:0:0', 'E5'], ['6:0:2', 'C5'], ['6:1:0', 'A4'], ['6:1:2', 'G4'],
      ['6:2:0', 'A4'], ['6:2:2', 'C5'], ['6:3:0', 'E5'],
      // F区間変奏 (小節7) ― C5で着地して次ループへ
      ['7:0:0', 'F4'], ['7:0:2', 'G4'], ['7:1:0', 'A4'], ['7:1:2', 'C5'],
      ['7:2:0', 'A4'], ['7:2:2', 'G4'], ['7:3:0', 'C5'],
    ];

    const melPart = new Tone.Part((time: number, note: string) => {
      melSynth.triggerAttackRelease(note, '16n', time);
    }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '8m';

    // ベースライン: ルート音を4分音符で刻む（シンプル）
    const bassNotes: [string, string][] = [
      ['0:0:0', 'C3'], ['0:2:0', 'C3'],
      ['1:0:0', 'G2'], ['1:2:0', 'G2'],
      ['2:0:0', 'A2'], ['2:2:0', 'A2'],
      ['3:0:0', 'F2'], ['3:2:0', 'F2'],
      ['4:0:0', 'C3'], ['4:2:0', 'E3'],
      ['5:0:0', 'G2'], ['5:2:0', 'B2'],
      ['6:0:0', 'A2'], ['6:2:0', 'C3'],
      ['7:0:0', 'F2'], ['7:2:0', 'G2'],
    ];

    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '8n', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '8m';

    // キック: 1・3拍（8小節 = 32拍分）
    const kickTimes: string[] = [];
    for (let bar = 0; bar < 8; bar++) {
      kickTimes.push(`${bar}:0:0`, `${bar}:2:0`);
    }
    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C2', '16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, kickTimes.map(t => [t, null]));
    kickPart.loop = true;
    kickPart.loopEnd = '8m';

    // スネア: 2・4拍
    const snareTimes: string[] = [];
    for (let bar = 0; bar < 8; bar++) {
      snareTimes.push(`${bar}:1:0`, `${bar}:3:0`);
    }
    const snarePart = new Tone.Part((time: number) => {
      try { snare.triggerAttackRelease('16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, snareTimes.map(t => [t, null]));
    snarePart.loop = true;
    snarePart.loopEnd = '8m';

    // ハイハット: 8分音符でリズムを刻む（軽快感）
    const hihatTimes: string[] = [];
    for (let bar = 0; bar < 8; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        hihatTimes.push(`${bar}:${beat}:0`, `${bar}:${beat}:2`);
      }
    }
    const hihatPart = new Tone.Part((time: number) => {
      try { hihat.triggerAttackRelease('32n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, hihatTimes.map(t => [t, null]));
    hihatPart.loop = true;
    hihatPart.loopEnd = '8m';

    melPart.start(0);
    bassPart.start(0);
    kickPart.start(0);
    snarePart.start(0);
    hihatPart.start(0);
    transport.start();

    activeBGMParts = [melPart, bassPart, kickPart, snarePart, hihatPart, melSynth, bassSynth, kick, snare, hihat];
  },

  /**
   * 戦闘 BGM
   * Am, 140 BPM, 激しいアクション
   * コード進行: Am - F - C - G (4小節ループ)
   * 16分音符ドラムパターン
   */
  battle: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 140;

    // メロディシンセ（矩形波+デチューン効果）
    const melSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.7, release: 0.05 },
      detune: 5,
    }).connect(dest);

    // ベースシンセ（矩形波）
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.8, release: 0.05 },
    }).connect(dest);

    // キック
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.04 },
    }).connect(dest);

    // スネア
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 },
    }).connect(dest);

    // ハイハット
    const hihat = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.02, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(dest);

    // メロディ: Am ペンタトニック + 激しいリズム
    const melNotes: [string, string][] = [
      // Am区間
      ['0:0:0', 'A4'], ['0:0:1', 'C5'], ['0:0:2', 'E5'], ['0:0:3', 'A5'],
      ['0:1:0', 'G5'], ['0:1:2', 'E5'], ['0:2:0', 'C5'], ['0:2:2', 'A4'],
      ['0:3:0', 'E5'], ['0:3:2', 'C5'],
      // F区間
      ['1:0:0', 'F4'], ['1:0:1', 'A4'], ['1:0:2', 'C5'], ['1:0:3', 'F5'],
      ['1:1:0', 'E5'], ['1:1:2', 'C5'], ['1:2:0', 'A4'], ['1:2:2', 'F4'],
      ['1:3:0', 'C5'], ['1:3:2', 'A4'],
      // C区間
      ['2:0:0', 'C5'], ['2:0:2', 'E5'], ['2:1:0', 'G5'], ['2:1:2', 'E5'],
      ['2:2:0', 'C5'], ['2:2:2', 'G4'], ['2:3:0', 'E5'], ['2:3:2', 'C5'],
      // G区間
      ['3:0:0', 'G4'], ['3:0:1', 'B4'], ['3:0:2', 'D5'], ['3:0:3', 'G5'],
      ['3:1:0', 'F5'], ['3:1:2', 'D5'], ['3:2:0', 'B4'], ['3:2:2', 'G4'],
      ['3:3:0', 'D5'], ['3:3:2', 'B4'],
    ];

    const melPart = new Tone.Part((time: number, note: string) => {
      melSynth.triggerAttackRelease(note, '16n', time);
    }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '4m';

    // ベース: 8分音符でアグレッシブに
    const bassNotes: [string, string][] = [
      ['0:0:0', 'A2'], ['0:0:2', 'A2'], ['0:1:0', 'C3'], ['0:1:2', 'A2'],
      ['0:2:0', 'E2'], ['0:2:2', 'G2'], ['0:3:0', 'A2'], ['0:3:2', 'E2'],
      ['1:0:0', 'F2'], ['1:0:2', 'F2'], ['1:1:0', 'A2'], ['1:1:2', 'F2'],
      ['1:2:0', 'C2'], ['1:2:2', 'E2'], ['1:3:0', 'F2'], ['1:3:2', 'C2'],
      ['2:0:0', 'C3'], ['2:0:2', 'C3'], ['2:1:0', 'E3'], ['2:1:2', 'C3'],
      ['2:2:0', 'G2'], ['2:2:2', 'B2'], ['2:3:0', 'C3'], ['2:3:2', 'G2'],
      ['3:0:0', 'G2'], ['3:0:2', 'G2'], ['3:1:0', 'B2'], ['3:1:2', 'G2'],
      ['3:2:0', 'D2'], ['3:2:2', 'F2'], ['3:3:0', 'G2'], ['3:3:2', 'D2'],
    ];

    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '8n', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '4m';

    // キック: 8ビートパターン
    const kickTimes = [
      '0:0:0', '0:2:0',
      '1:0:0', '1:2:0',
      '2:0:0', '2:2:0',
      '3:0:0', '3:2:0',
    ];

    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C2', '16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, kickTimes.map((t) => [t, null]));
    kickPart.loop = true;
    kickPart.loopEnd = '4m';

    // スネア: 2・4拍
    const snareTimes = [
      '0:1:0', '0:3:0',
      '1:1:0', '1:3:0',
      '2:1:0', '2:3:0',
      '3:1:0', '3:3:0',
    ];

    const snarePart = new Tone.Part((time: number) => {
      try { snare.triggerAttackRelease('16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, snareTimes.map((t) => [t, null]));
    snarePart.loop = true;
    snarePart.loopEnd = '4m';

    // ハイハット: 16分音符パターン
    const hihatTimes: string[] = [];
    for (let bar = 0; bar < 4; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        for (let sub = 0; sub < 4; sub++) {
          hihatTimes.push(`${bar}:${beat}:${sub}`);
        }
      }
    }

    const hihatPart = new Tone.Part((time: number) => {
      try { hihat.triggerAttackRelease('32n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, hihatTimes.map((t) => [t, null]));
    hihatPart.loop = true;
    hihatPart.loopEnd = '4m';

    melPart.start(0);
    bassPart.start(0);
    kickPart.start(0);
    snarePart.start(0);
    hihatPart.start(0);

    transport.start();

    activeBGMParts = [melPart, bassPart, kickPart, snarePart, hihatPart, melSynth, bassSynth, kick, snare, hihat];
  },

  /**
   * ボス戦 BGM
   * D minor, 140 BPM, 重厚で威圧的
   * コード進行: Dm - Bb - Gm - A (4小節ループ)
   */
  boss: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 140;

    const melSynth = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 } }).connect(dest);
    const bassSynth = new Tone.Synth({ oscillator: { type: 'fmsquare' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.1 } }).connect(dest);
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.01 } }).connect(dest);
    const snare = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.02 } }).connect(dest);

    const melNotes: [string, string][] = [
      ['0:0:0', 'D5'], ['0:1:0', 'F5'], ['0:1:2', 'A5'], ['0:2:0', 'G5'], ['0:3:0', 'F5'], ['0:3:2', 'E5'],
      ['1:0:0', 'Bb4'], ['1:1:0', 'D5'], ['1:1:2', 'F5'], ['1:2:0', 'E5'], ['1:3:0', 'D5'], ['1:3:2', 'C5'],
      ['2:0:0', 'G4'], ['2:1:0', 'Bb4'], ['2:1:2', 'D5'], ['2:2:0', 'C5'], ['2:3:0', 'Bb4'], ['2:3:2', 'A4'],
      ['3:0:0', 'A4'], ['3:1:0', 'C5'], ['3:1:2', 'E5'], ['3:2:0', 'F5'], ['3:2:2', 'E5'], ['3:3:0', 'C#5'], ['3:3:2', 'A4'],
    ];
    const melPart = new Tone.Part((time: number, note: string) => { melSynth.triggerAttackRelease(note, '8n', time); }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '4m';

    const bassNotes: [string, string][] = [
      ['0:0:0', 'D2'], ['0:2:0', 'D2'],
      ['1:0:0', 'Bb1'], ['1:2:0', 'Bb1'],
      ['2:0:0', 'G1'], ['2:2:0', 'G1'],
      ['3:0:0', 'A1'], ['3:2:0', 'A1'],
    ];
    const bassPart = new Tone.Part((time: number, note: string) => { bassSynth.triggerAttackRelease(note, '2n', time); }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '4m';

    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C1', '8n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, [['0:0:0'], ['0:1:2'], ['0:2:0'], ['0:3:2'], ['1:0:0'], ['1:1:2'], ['1:2:0'], ['1:3:2'], ['2:0:0'], ['2:1:2'], ['2:2:0'], ['2:3:2'], ['3:0:0'], ['3:1:0'], ['3:2:0'], ['3:3:0']]);
    kickPart.loop = true;
    kickPart.loopEnd = '4m';

    const snarePart = new Tone.Part((time: number) => {
      try { snare.triggerAttackRelease('8n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, [['0:1:0'], ['0:3:0'], ['1:1:0'], ['1:3:0'], ['2:1:0'], ['2:3:0'], ['3:1:0'], ['3:3:0']]);
    snarePart.loop = true;
    snarePart.loopEnd = '4m';

    melPart.start(0);
    bassPart.start(0);
    kickPart.start(0);
    snarePart.start(0);
    transport.start();
    activeBGMParts = [melPart, bassPart, kickPart, snarePart, melSynth, bassSynth, kick, snare];
  },

  /**
   * ボス戦 BGM: バグスウォーム (B2F)
   * C minor, 120 BPM, 不規則・不気味・虫の羽音イメージ
   * AMシンセによるトレモロ変調 + 不規則なアルペジオ + 低音ドローン
   */
  boss_bug_swarm: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 120;

    // 不規則な高速アルペジオ（AMシンセ → ぶるぶると震える音）
    const arpSynth = new Tone.AMSynth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.05 },
      modulation: { type: 'sawtooth' },
      modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1 },
      harmonicity: 8,
    }).connect(dest);
    arpSynth.volume.value = -4;

    // 低音ドローン（不気味な持続音）
    const droneSynth = new Tone.Synth({
      oscillator: { type: 'fmsine', modulationType: 'triangle' },
      envelope: { attack: 0.5, decay: 0.3, sustain: 0.9, release: 0.8 },
    }).connect(dest);
    droneSynth.volume.value = -10;

    // 打撃音（羽音のような細かいパルス）
    const blipSynth = new Tone.Synth({
      oscillator: { type: 'pulse', width: 0.1 },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    }).connect(dest);
    blipSynth.volume.value = -8;

    // キック（重め）
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 4,
      envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.01 },
    }).connect(dest);

    // 不規則アルペジオ: Cm スケール (C Eb G Bb Ab) を不規則に
    const arpNotes: [string, string][] = [
      ['0:0:0', 'C5'], ['0:0:1', 'Eb5'], ['0:0:2', 'G5'], ['0:0:3', 'Bb5'],
      ['0:1:0', 'Ab4'], ['0:1:1', 'C5'], ['0:1:3', 'Eb5'],
      ['0:2:0', 'G5'], ['0:2:1', 'Eb5'], ['0:2:2', 'C5'], ['0:2:3', 'G4'],
      ['0:3:0', 'Ab4'], ['0:3:2', 'Bb4'], ['0:3:3', 'C5'],
      ['1:0:0', 'Eb5'], ['1:0:2', 'G5'], ['1:1:1', 'Bb5'], ['1:1:3', 'Ab5'],
      ['1:2:0', 'G5'], ['1:2:2', 'Eb5'], ['1:3:0', 'C5'], ['1:3:2', 'Ab4'],
      ['2:0:0', 'Bb4'], ['2:0:1', 'C5'], ['2:0:3', 'Eb5'],
      ['2:1:0', 'G5'], ['2:1:2', 'Bb5'], ['2:2:0', 'Ab5'], ['2:2:2', 'G5'],
      ['2:3:0', 'Eb5'], ['2:3:2', 'C5'],
      ['3:0:0', 'Ab4'], ['3:0:2', 'Bb4'], ['3:1:0', 'C5'], ['3:1:2', 'Eb5'],
      ['3:2:0', 'G5'], ['3:2:1', 'Ab5'], ['3:2:3', 'Bb5'],
      ['3:3:0', 'C6'], ['3:3:2', 'Bb5'],
    ];
    const arpPart = new Tone.Part((time: number, note: string) => {
      arpSynth.triggerAttackRelease(note, '32n', time);
    }, arpNotes);
    arpPart.loop = true;
    arpPart.loopEnd = '4m';

    // ドローン
    const droneNotes: [string, string][] = [
      ['0:0:0', 'C2'], ['2:0:0', 'G1'],
    ];
    const dronePart = new Tone.Part((time: number, note: string) => {
      droneSynth.triggerAttackRelease(note, '2m', time);
    }, droneNotes);
    dronePart.loop = true;
    dronePart.loopEnd = '4m';

    // ブリップ（密な羽音パルス）
    const blipTimes = ['0:0:0','0:0:1','0:0:2','0:0:3','0:1:1','0:1:3','0:2:0','0:2:2','0:3:1','0:3:3','1:0:1','1:1:0','1:1:2','1:2:1','1:2:3','1:3:0','1:3:2','2:0:0','2:0:3','2:1:1','2:2:0','2:2:2','2:3:1','3:0:0','3:0:2','3:1:1','3:1:3','3:2:2','3:3:0','3:3:3'];
    const blipNotes = ['C6','Eb6','G6','Bb5','Ab6','C6','G5','Eb6'];
    const blipPart = new Tone.Part((time: number, i: number) => {
      blipSynth.triggerAttackRelease(blipNotes[i % blipNotes.length], '64n', time);
    }, blipTimes.map((t, i) => [t, i]));
    blipPart.loop = true;
    blipPart.loopEnd = '4m';

    // キックパターン（不規則）
    const kickTimes = ['0:0:0','0:2:0','1:0:0','1:1:2','1:3:0','2:0:0','2:2:2','3:0:0','3:2:0','3:3:2'];
    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C1', '16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, kickTimes.map(t => [t, null]));
    kickPart.loop = true;
    kickPart.loopEnd = '4m';

    arpPart.start(0);
    dronePart.start(0);
    blipPart.start(0);
    kickPart.start(0);
    transport.start();
    activeBGMParts = [arpPart, dronePart, blipPart, kickPart, arpSynth, droneSynth, blipSynth, kick];
  },

  /**
   * ボス戦 BGM: マッハランナー (B4F)
   * E minor, 175 BPM, 超高速・機械的・スピード感
   * Square波主体の高速8分ループ + 金属的打撃ドラム
   */
  boss_mach_runner: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 175;

    // メインリード（矩形波、高速ランニング感）
    const leadSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.002, decay: 0.05, sustain: 0.4, release: 0.04 },
    }).connect(dest);
    leadSynth.volume.value = -4;

    // ハーモニーライン（1オクターブ下の矩形波）
    const harmSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.002, decay: 0.05, sustain: 0.3, release: 0.04 },
    }).connect(dest);
    harmSynth.volume.value = -9;

    // ベース（重め）
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'fmsquare', modulationType: 'square' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.05 },
    }).connect(dest);
    bassSynth.volume.value = -6;

    // キック（鋭く早い）
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 8,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.01 },
    }).connect(dest);

    // メタル系スネア
    const metal = new Tone.MetalSynth({
      frequency: 400, harmonicity: 5.1,
      modulationIndex: 32, resonance: 4000, octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.06, release: 0.01 },
    }).connect(dest);
    metal.volume.value = -8;

    // 超高速メロディ: Em スケール (E G A B D)
    const leadNotes: [string, string][] = [
      ['0:0:0', 'E5'], ['0:0:1', 'G5'], ['0:0:2', 'A5'], ['0:0:3', 'B5'],
      ['0:1:0', 'D6'], ['0:1:1', 'B5'], ['0:1:2', 'A5'], ['0:1:3', 'G5'],
      ['0:2:0', 'E5'], ['0:2:1', 'D5'], ['0:2:2', 'B4'], ['0:2:3', 'A4'],
      ['0:3:0', 'G4'], ['0:3:1', 'A4'], ['0:3:2', 'B4'], ['0:3:3', 'D5'],
      ['1:0:0', 'E5'], ['1:0:1', 'G5'], ['1:0:2', 'B5'], ['1:0:3', 'D6'],
      ['1:1:0', 'E6'], ['1:1:1', 'D6'], ['1:1:2', 'B5'], ['1:1:3', 'G5'],
      ['1:2:0', 'A5'], ['1:2:1', 'G5'], ['1:2:2', 'E5'], ['1:2:3', 'D5'],
      ['1:3:0', 'B4'], ['1:3:1', 'A4'], ['1:3:2', 'G4'], ['1:3:3', 'E4'],
      ['2:0:0', 'G4'], ['2:0:1', 'A4'], ['2:0:2', 'B4'], ['2:0:3', 'D5'],
      ['2:1:0', 'E5'], ['2:1:1', 'G5'], ['2:1:2', 'A5'], ['2:1:3', 'B5'],
      ['2:2:0', 'A5'], ['2:2:1', 'G5'], ['2:2:2', 'E5'], ['2:2:3', 'D5'],
      ['2:3:0', 'B4'], ['2:3:1', 'D5'], ['2:3:2', 'E5'], ['2:3:3', 'G5'],
      ['3:0:0', 'B5'], ['3:0:1', 'A5'], ['3:0:2', 'G5'], ['3:0:3', 'E5'],
      ['3:1:0', 'D5'], ['3:1:1', 'E5'], ['3:1:2', 'G5'], ['3:1:3', 'A5'],
      ['3:2:0', 'B5'], ['3:2:1', 'D6'], ['3:2:2', 'E6'], ['3:2:3', 'D6'],
      ['3:3:0', 'B5'], ['3:3:1', 'A5'], ['3:3:2', 'G5'], ['3:3:3', 'E5'],
    ];
    const leadPart = new Tone.Part((time: number, note: string) => {
      leadSynth.triggerAttackRelease(note, '16n', time);
    }, leadNotes);
    leadPart.loop = true;
    leadPart.loopEnd = '4m';

    // ハーモニー（メロディ-3半音）
    const harmNotes: [string, string][] = leadNotes.map(([t, n]) => {
      // 3度下のハーモニーを手動定義（Em内で）
      const harmMap: Record<string, string> = {
        'E5':'B4','G5':'E5','A5':'F#5','B5':'G5','D6':'B5','E6':'C6',
        'E4':'B3','G4':'E4','A4':'E4','B4':'G4','D5':'B4',
      };
      return [t, harmMap[n] ?? n] as [string, string];
    });
    const harmPart = new Tone.Part((time: number, note: string) => {
      harmSynth.triggerAttackRelease(note, '16n', time);
    }, harmNotes);
    harmPart.loop = true;
    harmPart.loopEnd = '4m';

    // 高速ベース
    const bassNotes: [string, string][] = [
      ['0:0:0', 'E2'], ['0:0:2', 'E2'], ['0:1:0', 'G2'], ['0:1:2', 'G2'],
      ['0:2:0', 'A2'], ['0:2:2', 'A2'], ['0:3:0', 'B2'], ['0:3:2', 'B2'],
      ['1:0:0', 'E2'], ['1:0:2', 'E2'], ['1:1:0', 'D2'], ['1:1:2', 'D2'],
      ['1:2:0', 'A2'], ['1:2:2', 'A2'], ['1:3:0', 'B2'], ['1:3:2', 'B2'],
      ['2:0:0', 'G2'], ['2:0:2', 'G2'], ['2:1:0', 'E2'], ['2:1:2', 'E2'],
      ['2:2:0', 'A2'], ['2:2:2', 'A2'], ['2:3:0', 'B2'], ['2:3:2', 'B2'],
      ['3:0:0', 'B2'], ['3:0:2', 'B2'], ['3:1:0', 'A2'], ['3:1:2', 'A2'],
      ['3:2:0', 'G2'], ['3:2:2', 'G2'], ['3:3:0', 'E2'], ['3:3:2', 'E2'],
    ];
    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '8n', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '4m';

    // 超高速キックパターン（4つ打ち）
    const kickTimes = Array.from({ length: 16 }, (_, i) => `${Math.floor(i / 4)}:${i % 4}:0`);
    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C1', '16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, kickTimes.map(t => [t, null]));
    kickPart.loop = true;
    kickPart.loopEnd = '4m';

    // メタルスネア（拍2・4）
    const metalTimes = ['0:1:0','0:3:0','1:1:0','1:3:0','2:1:0','2:3:0','3:1:0','3:3:0'];
    const metalPart = new Tone.Part((time: number) => {
      try { metal.triggerAttack('16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, metalTimes.map(t => [t, null]));
    metalPart.loop = true;
    metalPart.loopEnd = '4m';

    leadPart.start(0);
    harmPart.start(0);
    bassPart.start(0);
    kickPart.start(0);
    metalPart.start(0);
    transport.start();
    activeBGMParts = [leadPart, harmPart, bassPart, kickPart, metalPart, leadSynth, harmSynth, bassSynth, kick, metal];
  },

  /**
   * ボス戦 BGM: ジャンクキング (B5F)
   * G minor, 60 BPM, 重厚・工業的・ガチャガチャした金属音
   * 重低音MembraneSynth + ゆっくりとした不気味なメロディ + 金属打撃SE風ドラム
   */
  boss_junk_king: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 60;

    // 重低音メロディ（のこぎり波）
    const melSynth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 0.4 },
    }).connect(dest);
    melSynth.volume.value = -4;

    // 重厚なベース（FMシンセ）
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'fmsquare', modulationType: 'square' },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.8, release: 0.3 },
    }).connect(dest);
    bassSynth.volume.value = -2;

    // 強力なキック
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.15, octaves: 10,
      envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.05 },
    }).connect(dest);
    kick.volume.value = 4;

    // 金属的クラッシュ（ジャンク感）
    const metalCrash = new Tone.MetalSynth({
      frequency: 120, harmonicity: 2.1,
      modulationIndex: 8, resonance: 800, octaves: 1.2,
      envelope: { attack: 0.001, decay: 0.5, release: 0.2 },
    }).connect(dest);
    metalCrash.volume.value = -6;

    // ノイズスネア（重め）
    const snare = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.05 },
    }).connect(dest);
    snare.volume.value = -4;

    // ゆっくりとした不気味なメロディ: Gm (G Bb D F Eb)
    const melNotes: [string, string][] = [
      ['0:0:0', 'G4'], ['0:2:0', 'Bb4'],
      ['1:0:0', 'D5'], ['1:2:0', 'F4'],
      ['2:0:0', 'Eb5'], ['2:2:0', 'D5'],
      ['3:0:0', 'Bb4'], ['3:2:0', 'G4'],
      ['4:0:0', 'F4'], ['4:2:0', 'Eb4'],
      ['5:0:0', 'D4'], ['5:2:0', 'G4'],
      ['6:0:0', 'Bb4'], ['6:2:0', 'D5'],
      ['7:0:0', 'G4'],
    ];
    const melPart = new Tone.Part((time: number, note: string) => {
      melSynth.triggerAttackRelease(note, '4n', time);
    }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '8m';

    // 重低音ベース
    const bassNotes: [string, string][] = [
      ['0:0:0', 'G1'], ['2:0:0', 'G1'],
      ['4:0:0', 'Eb1'], ['6:0:0', 'D1'],
    ];
    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '2m', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '8m';

    // 重いキックパターン（強調）
    const kickTimes = ['0:0:0','0:2:2','1:2:0','2:0:0','2:2:2','3:2:0','4:0:0','4:2:2','5:2:0','6:0:0','6:2:2','7:2:0'];
    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C1', '8n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, kickTimes.map(t => [t, null]));
    kickPart.loop = true;
    kickPart.loopEnd = '8m';

    // 金属クラッシュ（拍3）
    const crashTimes = ['0:2:0','1:0:0','2:2:0','3:0:0','4:2:0','5:0:0','6:2:0','7:0:0'];
    const crashPart = new Tone.Part((time: number) => {
      try { metalCrash.triggerAttack('8n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, crashTimes.map(t => [t, null]));
    crashPart.loop = true;
    crashPart.loopEnd = '8m';

    // スネア
    const snareTimes = ['0:2:0','1:2:0','2:2:0','3:2:0','4:2:0','5:2:0','6:2:0','7:2:0'];
    const snarePart = new Tone.Part((time: number) => {
      try { snare.triggerAttackRelease('4n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, snareTimes.map(t => [t, null]));
    snarePart.loop = true;
    snarePart.loopEnd = '8m';

    melPart.start(0);
    bassPart.start(0);
    kickPart.start(0);
    crashPart.start(0);
    snarePart.start(0);
    transport.start();
    activeBGMParts = [melPart, bassPart, kickPart, crashPart, snarePart, melSynth, bassSynth, kick, metalCrash, snare];
  },

  /**
   * ボス戦 BGM: ファントム (B7F)
   * B diminished, 90 BPM, 幻想的・不気味・ディミニッシュスケール
   * Sine波中心 + フランジャー効果 + コーラス重ねがけ
   */
  boss_phantom: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 90;

    // コーラス（幻想的な揺れ）
    const chorus = new Tone.Chorus(4, 2.5, 0.7).connect(dest).start();
    // フランジャー代わりにディレイ+フィードバックで揺らぎを作る
    const flanger = new Tone.FeedbackDelay('32n', 0.3).connect(chorus);

    // メインメロディ（サイン波 → 幻想的）
    const melSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.8 },
    }).connect(flanger);
    melSynth.volume.value = -2;

    // ハーモニーパッド（ポリシンセ、サイン波）
    const padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.3, decay: 0.5, sustain: 0.7, release: 1.0 },
    }).connect(chorus);
    padSynth.volume.value = -10;

    // ベース（低めのサイン波）
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.8, release: 0.5 },
    }).connect(dest);
    bassSynth.volume.value = -6;

    // ソフトパーカッション（幽霊的）
    const softDrum = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.02, decay: 0.15, sustain: 0, release: 0.1 },
    }).connect(dest);
    softDrum.volume.value = -14;

    // ディミニッシュスケール: B D F Ab (Bdim7)
    // メロディ: 幻想的・漂うような動き
    const melNotes: [string, string][] = [
      ['0:0:0', 'B4'], ['0:2:0', 'D5'],
      ['1:0:0', 'F5'], ['1:2:0', 'Ab5'],
      ['2:0:0', 'B5'], ['2:2:0', 'Ab5'],
      ['3:0:0', 'F5'], ['3:2:0', 'D5'],
      ['4:0:0', 'D5'], ['4:2:0', 'B4'],
      ['5:0:0', 'Ab4'], ['5:2:0', 'F4'],
      ['6:0:0', 'D4'], ['6:2:0', 'F4'],
      ['7:0:0', 'Ab4'], ['7:2:0', 'B4'],
    ];
    const melPart = new Tone.Part((time: number, note: string) => {
      melSynth.triggerAttackRelease(note, '4n', time);
    }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '8m';

    // パッドコード: dim7コード進行
    const padNotes: [string, string[]][] = [
      ['0:0:0', ['B3', 'D4', 'F4', 'Ab4']],
      ['4:0:0', ['Ab3', 'B3', 'D4', 'F4']],
    ];
    const padPart = new Tone.Part((time: number, chord: string[]) => {
      padSynth.triggerAttackRelease(chord, '4m', time);
    }, padNotes);
    padPart.loop = true;
    padPart.loopEnd = '8m';

    // ベース: 半音下降
    const bassNotes: [string, string][] = [
      ['0:0:0', 'B2'], ['2:0:0', 'F2'],
      ['4:0:0', 'Ab2'], ['6:0:0', 'D2'],
    ];
    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '2m', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '8m';

    // ソフトパーカッション（控えめなリズム）
    const drumTimes = ['0:1:0','0:3:0','1:1:0','1:3:0','2:0:2','2:2:2','3:1:0','3:3:0','4:1:0','4:3:0','5:1:2','5:3:2','6:1:0','6:3:0','7:1:0','7:3:0'];
    const drumPart = new Tone.Part((time: number) => {
      try { softDrum.triggerAttackRelease('8n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, drumTimes.map(t => [t, null]));
    drumPart.loop = true;
    drumPart.loopEnd = '8m';

    melPart.start(0);
    padPart.start(0);
    bassPart.start(0);
    drumPart.start(0);
    transport.start();
    activeBGMParts = [melPart, padPart, bassPart, drumPart, melSynth, padSynth, bassSynth, softDrum, chorus, flanger];
  },

  /**
   * ボス戦 BGM: アイアンフォートレス (B9F)
   * D minor (軍隊的), 100 BPM, 壮大・マーチ風・要塞の重さ
   * 強いスネアドラム（マーチリズム）+ 重厚な低音 + 堂々としたメロディ
   */
  boss_iron_fortress: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 100;

    // 堂々としたメロディ（のこぎり波）
    const melSynth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.2 },
    }).connect(dest);
    melSynth.volume.value = -3;

    // 副旋律（矩形波、重ねてチップチューン感）
    const harmSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.15 },
    }).connect(dest);
    harmSynth.volume.value = -9;

    // 重厚なベース
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'fmsquare', modulationType: 'square' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.2 },
    }).connect(dest);
    bassSynth.volume.value = -2;

    // マーチキック（強め）
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.1, octaves: 8,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.02 },
    }).connect(dest);
    kick.volume.value = 2;

    // 軍隊的スネア（強くシャープ）
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.03 },
    }).connect(dest);
    snare.volume.value = 0;

    // 金属的ハイハット（行進感）
    const hihat = new Tone.MetalSynth({
      frequency: 600, harmonicity: 5.1,
      modulationIndex: 32, resonance: 6000, octaves: 1.0,
      envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
    }).connect(dest);
    hihat.volume.value = -14;

    // 堂々としたメロディ: Dm (D F A C Bb)
    const melNotes: [string, string][] = [
      ['0:0:0', 'D5'], ['0:1:0', 'F5'], ['0:2:0', 'A5'], ['0:3:0', 'F5'],
      ['1:0:0', 'D5'], ['1:1:0', 'C5'], ['1:2:0', 'Bb4'], ['1:3:0', 'A4'],
      ['2:0:0', 'F4'], ['2:1:0', 'A4'], ['2:2:0', 'C5'], ['2:3:0', 'A4'],
      ['3:0:0', 'F4'], ['3:1:0', 'E4'], ['3:2:0', 'D4'], ['3:3:0', 'C#4'],
      ['4:0:0', 'D4'], ['4:1:0', 'F4'], ['4:2:0', 'A4'], ['4:3:0', 'C5'],
      ['5:0:0', 'D5'], ['5:1:0', 'F5'], ['5:2:0', 'A5'], ['5:3:0', 'D6'],
      ['6:0:0', 'C6'], ['6:1:0', 'A5'], ['6:2:0', 'F5'], ['6:3:0', 'D5'],
      ['7:0:0', 'C5'], ['7:1:0', 'Bb4'], ['7:2:0', 'A4'],
    ];
    const melPart = new Tone.Part((time: number, note: string) => {
      melSynth.triggerAttackRelease(note, '8n', time);
    }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '8m';

    // 副旋律（3度下）
    const harmNotes: [string, string][] = [
      ['0:0:0', 'Bb4'], ['0:1:0', 'D5'], ['0:2:0', 'F5'], ['0:3:0', 'D5'],
      ['1:0:0', 'Bb4'], ['1:1:0', 'A4'], ['1:2:0', 'G4'], ['1:3:0', 'F4'],
      ['2:0:0', 'D4'], ['2:1:0', 'F4'], ['2:2:0', 'A4'], ['2:3:0', 'F4'],
      ['3:0:0', 'D4'], ['3:1:0', 'C4'], ['3:2:0', 'Bb3'],
      ['4:0:0', 'Bb3'], ['4:1:0', 'D4'], ['4:2:0', 'F4'], ['4:3:0', 'A4'],
      ['5:0:0', 'Bb4'], ['5:1:0', 'D5'], ['5:2:0', 'F5'], ['5:3:0', 'Bb5'],
      ['6:0:0', 'A5'], ['6:1:0', 'F5'], ['6:2:0', 'D5'], ['6:3:0', 'Bb4'],
      ['7:0:0', 'A4'], ['7:1:0', 'G4'], ['7:2:0', 'F4'],
    ];
    const harmPart = new Tone.Part((time: number, note: string) => {
      harmSynth.triggerAttackRelease(note, '8n', time);
    }, harmNotes);
    harmPart.loop = true;
    harmPart.loopEnd = '8m';

    // ベース（マーチ的な4分音符）
    const bassNotes: [string, string][] = [
      ['0:0:0', 'D2'], ['0:2:0', 'D2'],
      ['1:0:0', 'Bb1'], ['1:2:0', 'A1'],
      ['2:0:0', 'F1'], ['2:2:0', 'F1'],
      ['3:0:0', 'A1'], ['3:2:0', 'A1'],
      ['4:0:0', 'D2'], ['4:2:0', 'D2'],
      ['5:0:0', 'D2'], ['5:2:0', 'D2'],
      ['6:0:0', 'C2'], ['6:2:0', 'Bb1'],
      ['7:0:0', 'A1'], ['7:2:0', 'A1'],
    ];
    const bassPart = new Tone.Part((time: number, note: string) => {
      bassSynth.triggerAttackRelease(note, '4n', time);
    }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '8m';

    // マーチキック（1拍目 + 3拍目強調）
    const kickTimes = ['0:0:0','0:2:0','1:0:0','1:2:0','2:0:0','2:2:0','3:0:0','3:2:0','4:0:0','4:2:0','5:0:0','5:2:0','6:0:0','6:2:0','7:0:0','7:2:0'];
    const kickPart = new Tone.Part((time: number) => {
      try { kick.triggerAttackRelease('C1', '8n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, kickTimes.map(t => [t, null]));
    kickPart.loop = true;
    kickPart.loopEnd = '8m';

    // 軍隊的スネア（マーチリズム: 2・4拍目 + 裏拍）
    const snareTimes = ['0:1:0','0:3:0','0:3:2','1:1:0','1:3:0','1:3:2','2:1:0','2:3:0','2:3:2','3:1:0','3:3:0','3:3:2','4:1:0','4:3:0','4:3:2','5:1:0','5:3:0','5:3:2','6:1:0','6:3:0','6:3:2','7:1:0','7:3:0'];
    const snarePart = new Tone.Part((time: number) => {
      try { snare.triggerAttackRelease('16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, snareTimes.map(t => [t, null]));
    snarePart.loop = true;
    snarePart.loopEnd = '8m';

    // ハイハット（8分刻み）
    const hihatTimes: string[] = [];
    for (let m = 0; m < 8; m++) { for (let b = 0; b < 4; b++) { hihatTimes.push(`${m}:${b}:0`); hihatTimes.push(`${m}:${b}:2`); } }
    const hihatPart = new Tone.Part((time: number) => {
      try { hihat.triggerAttack('16n', time); } catch { /* ループ境界での時刻衝突を無視 */ }
    }, hihatTimes.map(t => [t, null]));
    hihatPart.loop = true;
    hihatPart.loopEnd = '8m';

    melPart.start(0);
    harmPart.start(0);
    bassPart.start(0);
    kickPart.start(0);
    snarePart.start(0);
    hihatPart.start(0);
    transport.start();
    activeBGMParts = [melPart, harmPart, bassPart, kickPart, snarePart, hihatPart, melSynth, harmSynth, bassSynth, kick, snare, hihat];
  },

  /**
   * ショップ BGM
   * F major, 100BPM, のんびり
   */
  shop: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 100;

    const melSynth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.3 } }).connect(dest);
    const padSynth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.2, decay: 0.5, sustain: 0.5, release: 0.5 } }).connect(dest);

    const melNotes: [string, string][] = [
        ['0:0:0', 'F4'], ['0:2:0', 'A4'], ['0:3:0', 'C5'],
        ['1:0:0', 'G4'], ['1:2:0', 'Bb4'], ['1:3:0', 'A4'],
        ['2:0:0', 'C4'], ['2:2:0', 'F4'], ['2:3:0', 'A4'],
        ['3:0:0', 'G4'], ['3:2:0', 'F4'],
    ];
    const melPart = new Tone.Part((time: number, note: string) => { melSynth.triggerAttackRelease(note, '4n', time); }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '4m';

    const padNotes: [string, string[]][] = [
        ['0:0:0', ['F3', 'A3', 'C4']],
        ['2:0:0', ['Bb2', 'D3', 'F3']],
    ];
    const padPart = new Tone.Part((time: number, chord: string[]) => { padSynth.triggerAttackRelease(chord, '2m', time); }, padNotes);
    padPart.loop = true;
    padPart.loopEnd = '4m';

    melPart.start(0);
    padPart.start(0);
    transport.start();
    activeBGMParts = [melPart, padPart, melSynth, padSynth];
  },

  /**
   * 拠点 BGM
   * C major, 90BPM, 穏やか
   */
  base: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 90;

    const melSynth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 0.5 } }).connect(dest);
    const bassSynth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.2 } }).connect(dest);

    const melNotes: [string, string][] = [
        ['0:0:0', 'C4'], ['0:2:0', 'E4'], ['1:0:0', 'G4'], ['1:2:0', 'E4'],
        ['2:0:0', 'F4'], ['2:2:0', 'A4'], ['3:0:0', 'G4'], ['3:2:0', 'C4'],
    ];
    const melPart = new Tone.Part((time: number, note: string) => { melSynth.triggerAttackRelease(note, '2n', time); }, melNotes);
    melPart.loop = true;
    melPart.loopEnd = '4m';

    const bassNotes: [string, string][] = [
        ['0:0:0', 'C2'],
        ['2:0:0', 'F2'],
    ];
    const bassPart = new Tone.Part((time: number, note: string) => { bassSynth.triggerAttackRelease(note, '1m', time); }, bassNotes);
    bassPart.loop = true;
    bassPart.loopEnd = '4m';

    melPart.start(0);
    bassPart.start(0);
    transport.start();
    activeBGMParts = [melPart, bassPart, melSynth, bassSynth];
  },

  /**
   * ゲームオーバー
   * A minor, 80BPM, 4小節ジングル
   */
  gameOver: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 80;
    const synth = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, decay: 0.5, sustain: 0, release: 0.1 } }).connect(dest);
    const notes: [string, string][] = [
        ['0:0:0', 'A3'], ['0:2:0', 'G3'],
        ['1:0:0', 'F3'], ['1:2:0', 'E3'],
        ['2:0:0', 'D3'], ['3:0:0', 'C3'],
    ];
    const part = new Tone.Part((time: number, note: string) => { synth.triggerAttackRelease(note, '2n', time); }, notes);
    part.loop = false;
    part.start(0);
    transport.start();
    activeBGMParts = [part, synth];
    setTimeout(() => stopBGM(), 4 * 60 / 80 * 1000); // Stop after 4 measures
  },

  /**
   * ボス撃破
   * C major, 160BPM, ファンファーレ
   */
  bossDefeat: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 160;
    const synth = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.1 } }).connect(dest);
    const notes: [string, string][] = [
        ['0:0:0', 'C4'], ['0:0:2', 'E4'], ['0:1:0', 'G4'],
        ['0:2:0', 'C5'], ['0:2:2', 'G4'], ['0:3:0', 'C5'],
        ['1:0:0', 'E5'], ['1:1:0', 'G5'],
        ['1:2:0', 'C6'],
    ];
    const part = new Tone.Part((time: number, note: string) => { synth.triggerAttackRelease(note, '8n', time); }, notes);
    part.loop = false;
    part.start(0);
    transport.start();
    activeBGMParts = [part, synth];
    setTimeout(() => stopBGM(), 2 * 60 / 160 * 1000 * 2); // Stop after 2 measures
  },

  /**
   * 深層
   * B minor, 110BPM, ダーク
   */
  deep: (dest: any) => {
    const transport = Tone.getTransport();
    transport.bpm.value = 110;
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fmsine', modulationType: 'triangle' }, envelope: { attack: 1.5, decay: 1.0, sustain: 0.8, release: 1.5 } }).connect(dest);
    const bell = new Tone.MetalSynth({ frequency: 300, harmonicity: 12, resonance: 800, octaves: 2 }).connect(dest);
    bell.volume.value = -15;
    
    const padNotes: [string, string[]][] = [
        ['0:0:0', ['B3', 'D4', 'F#4']],
        ['4:0:0', ['G3', 'B3', 'D4']],
    ];
    const padPart = new Tone.Part((time: number, chord: string[]) => { pad.triggerAttackRelease(chord, '4m', time); }, padNotes);
    padPart.loop = true;
    padPart.loopEnd = '8m';

    const bellNotes: string[] = ['0:3:2', '1:2:0', '2:1:3', '3:0:1', '3:3:0', '4:2:2', '5:1:0', '6:0:3', '7:2:1'];
    const bellPart = new Tone.Part((time: number) => { bell.triggerAttack('16n', time); }, bellNotes.map(t => [t, null]));
    bellPart.loop = true;
    bellPart.loopEnd = '8m';
    
    padPart.start(0);
    bellPart.start(0);
    transport.start();
    activeBGMParts = [padPart, bellPart, pad, bell];
  },
};
