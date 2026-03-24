# メカローグ 課題管理表

最終更新: 2026-03-23（#054-#055 インベントリ不具合修正完了）

## 優先度定義
| 優先度 | 基準 |
|---|---|
| P0 | ゲームが動かない・クラッシュ・データ破損 |
| P1 | ゲーム体験に大きな影響（戦闘バグ・進行不能） |
| P2 | 体験に影響するが回避可能（UI崩れ・バランス） |
| P3 | 改善要望・軽微な不具合 |

## ステータス定義
`未対応` / `対応中` / `完了` / `保留`

---

## 課題一覧

| ID | 優先度 | 発見日 | 発見元 | 概要 | 担当エージェント | ステータス | 完了日 |
|---|---|---|---|---|---|---|---|
| #001 | P1 | 2026-03-20 | qa-tester | combat.test.ts: atk=20 vs enemy(hp=15,def=3) でダメージが敵HPを超え意図せず撃破になっていた（テスト側の設定ミス。enemy.hp を 100 に修正して解決） | qa-tester | 完了 | 2026-03-20 |
| #002 | P1 | 2026-03-20 | ui-designer | turn-system.ts が Node.js の createRequire を使用するためブラウザで動作しない。client-turn.ts を別途作成して回避中 | game-core / ui-designer | 完了 | 2026-03-20 |
| #003 | P2 | 2026-03-20 | ui-designer | Turbopack が .js 拡張子インポートを解決できないため軽量シムファイル（constants.js 等）を手動配置している。根本解決が望ましい | game-core | 完了 | 2026-03-20 |
| #004 | P2 | 2026-03-20 | game-manager | turn-system.ts と client-turn.ts の二重管理。ロジック修正時に両方の更新が必要でデグレのリスクがある | game-core / ui-designer | 完了 | 2026-03-20 |
| #005 | P3 | 2026-03-20 | game-manager | movement.test.ts がシード42の実フロアに依存しており、迷路アルゴリズム変更時にテストが壊れる可能性がある | qa-tester | 未対応 | — |
| #006 | P3 | 2026-03-20 | game-manager | スプライトはプログラム生成のシンプルな図形のみ。ゲームとして視認しやすいデザインへの改善余地あり | pixel-artist | 完了 | 2026-03-21 |
| #007 | P1 | 2026-03-20 | ユーザー報告 | React hydration mismatch: GameCanvas.tsx のボタン className が複数行文字列のためSSRとクライアントで異なる文字列になる | ui-designer | 完了 | 2026-03-20 |
| #008 | P1 | 2026-03-20 | qa-tester | turn-system.ts の calcDamage が equippedWeapon.atk を参照しない。バンプ攻撃・attack アクションともに player.atk のみ使用し武器装備が攻撃力に反映されない | game-core | 完了 | 2026-03-20 |
| #009 | P1 | 2026-03-20 | ユーザー報告 | スタート後、主人公がどこにいるか視認できない。プレイヤースプライトが未生成・未表示、または周囲タイルと色・コントラストが同化している可能性がある | pixel-artist / ui-designer | 完了 | 2026-03-21 |
| #010 | P2 | 2026-03-20 | ユーザー報告 | ポーズ・ゲームリスタート・手動セーブ後ゲーム終了のUI（モーダル or 画面）が未実装 | ui-designer | 未対応 | — |
| #011 | P2 | 2026-03-20 | ユーザー報告 | マップ全体が暗く視認性が低い。床・通路の明度を上げてプレイアビリティを改善する | ui-designer / renderer | 完了 | 2026-03-20 |
| #012 | P3 | 2026-03-20 | ユーザー報告 | スタート時のマップサイズが 25×25 と狭い。初期フロアを 30×30 へ拡大し、進行後のフロアもスケールアップする | game-core | 完了 | 2026-03-20 |
| #013 | P2 | 2026-03-20 | ユーザー報告 | ボス登場時の演出が未実装。センスよくボス名を画面表示するイントロ演出（カットシーン or オーバーレイ）が必要 | ui-designer | 完了 | 2026-03-21 |
| #014 | P3 | 2026-03-20 | ユーザー報告 | ボスBGMが全ボス共通1曲。ボス種類ごとに個別BGMを用意し差別化する | sound-designer | 完了 | 2026-03-22 |
| #015 | P3 | 2026-03-20 | ユーザー報告 | ボス戦中にボスの残HPバーが未表示。全ボス戦でボス専用HPゲージを画面上部等に常時表示する | ui-designer | 完了 | 2026-03-21 |
| #016 | P1 | 2026-03-20 | ユーザー報告 | スタート時の地形によっては視界になにも表示されない。VIEW_RADIUS=3 が小さく、コーナー配置時にほぼ壁タイルしか見えない | game-core | 完了 | 2026-03-20 |
| #017 | P1 | 2026-03-20 | ユーザー報告 | 視界が主人公中心からずれて表示される。右端半マス・下端1行欠けが発生。containerRef がコントローラー込みの高さを計測し Canvas がオーバーフロー | ui-designer | 完了 | 2026-03-20 |
| #019 | P3 | 2026-03-21 | pixel-artist | 通常敵29種中26種（scout_drone/guard_bot/rust_hound以外）と全ボス13体について、方向別・アニメーション状態別の個性強化スプライトが未生成。現状は2フレームの汎用スプライトのみ | pixel-artist | 完了(B10F分) | 2026-03-22 |
| #020 | P2 | 2026-03-21 | ユーザー依頼 | バトルログに出てくる敵名がID文字列（scout_drone等）のまま。enemies.json の name（日本語）を引く関数を turn-system.ts に追加して日本語化する | game-core | 完了 | 2026-03-21 |
| #021 | P2 | 2026-03-21 | ユーザー依頼 | InventoryPanel でキーボード上下移動したとき選択行が画面外に出てもスクロールしない。selectedIndex 変化時に選択行を scrollIntoView する | ui-designer | 完了 | 2026-03-21 |
| #022 | P2 | 2026-03-21 | ユーザー依頼 | generatePlayerItemUse がロボアームの描画実装のまま。humanoid mech スタイルに書き換え | pixel-artist | 完了 | 2026-03-21 |
| #023 | P3 | 2026-03-21 | ユーザー依頼 | 敵の攻撃・被弾時に対応アニメーション状態（animState）が参照されていない。主要敵（Scout Drone / Guard Bot / Spark）の attack / hit アニメーション実装 | pixel-artist / game-core | 完了 | 2026-03-21 |
| #024 | P2 | 2026-03-21 | ユーザー報告 | iPhone (Chrome/Safari) にて BGM が再生されず、タップ操作が一切反応しない | ui-designer | 完了 | 2026-03-21 |
| #029 | P1 | 2026-03-22 | ユーザー報告 | プレイヤースプライトの背景が透明でなく白・黒・モザイク状になる。透明化処理が正しく機能していない | pixel-artist | 完了 | 2026-03-22 |
| #030 | P1 | 2026-03-22 | ユーザー報告 | 向きによって上半身だけ・下半身だけのドット絵になる。スプライト描画が方向ごとに不完全 | pixel-artist | 完了 | 2026-03-22 |
| #031 | P1 | 2026-03-22 | ユーザー報告 | プレイヤー表示サイズのはみ出し許容を 25% → 35% に変更する | pixel-artist / renderer | 完了 | 2026-03-22 |
| #032 | P1 | 2026-03-22 | ユーザー報告 | 向いている方向とスプライトの向きが合っていない（左向き時に右向き画像が出る等） | pixel-artist / renderer | 完了 | 2026-03-22 |
| #033 | P2 | 2026-03-22 | ユーザー報告 | 攻撃・被弾・アイテム使用時にアニメーション状態のスプライトが切り替わらない。animState は設定されているが見た目が変化しない | pixel-artist / renderer | 完了 | 2026-03-22 |
| #034 | P2 | 2026-03-22 | ユーザー報告 | 序盤フロアに「廃金属」アイテムが上限以上に大量出現する。アイテム出現数の上限制御が効いていない | game-core | 完了 | 2026-03-22 |
| #035 | P2 | 2026-03-22 | ユーザー依頼 | 拠点画面に「セーブして終了」と「タイトルに戻る」ボタンを追加。タイトルに戻る際はセーブ有無を選択するダイアログを表示する | ui-designer | 完了 | 2026-03-22 |
| #036 | P3 | 2026-03-22 | ユーザー報告 | ショップのスプライトの背景が透明でない。また表示サイズのはみ出し許容を 35% に統一する | pixel-artist | 完了 | 2026-03-22 |
| #037 | P2 | 2026-03-22 | ユーザー報告 | iPhone Safari/Chrome アクセス時に無音・タップ無反応で操作不可（#024 再発。複数回の修正を試みたが未解決。難易度高） | ui-designer | 完了 | 2026-03-22 |
| #049 | P1 | 2026-03-22 | ユーザー報告 | スマホ(192.168.x.x)からアクセス時に HMR cross-origin ブロック警告・無音・VirtualController タップ無反応の3問題が同時発生 | ui-designer | 完了 | 2026-03-22 |
| #038 | P1 | 2026-03-22 | ユーザー報告 | 武器アイコン上に移動しても武器が取得されず武器一覧に表示されない。武器の装備・装備外し（捨てる）・ショップでの売却が機能しない | game-core / ui-designer | 完了 | 2026-03-22 |
| #039 | P2 | 2026-03-22 | ユーザー依頼 | 主人公ドット絵をSF人型ロボットに刷新（明るく目立つ色）。攻撃・被弾・アイテム使用アニメーションを派手に | pixel-artist | 完了 | 2026-03-22 |
| #040 | P2 | 2026-03-22 | ユーザー依頼 | 攻撃・被弾・アイテム使用時に対象マスの色が一瞬変わるタイルフラッシュエフェクトを実装。空マス・壁への攻撃時もアイコン変化＋マスフラッシュを行う | ui-designer / game-core | 完了 | 2026-03-22 |
| #041 | P2 | 2026-03-22 | ユーザー依頼 | HP表示欄に Lv・所持G を追加。「Lv.2, HP 150/150, 所持G 100」のように表示する | ui-designer | 完了 | 2026-03-22 |
| #042 | P1 | 2026-03-22 | ユーザー報告 | 強化コアI等の武器強化アイテムをインベントリで「使用」できない。使用時は装備中の武器を強化するようにする | game-core | 完了 | 2026-03-22 |
| #043 | P1 | 2026-03-22 | ユーザー報告 | ショップで所持G足りていてインベントリに空きがあるのに購入ボタンを押すと拒否音が鳴り購入できない | game-core | 完了 | 2026-03-22 |
| #044 | P1 | 2026-03-22 | ユーザー報告 | インベントリに空きがあるのにアイテムアイコン上に移動してもアイテムが取得できない | game-core | 完了 | 2026-03-22 |
| #045 | P1 | 2026-03-22 | ユーザー報告 | B3Fまで同じ武器を使い続けても耐久値が全く減らない | game-core | 完了 | 2026-03-22 |
| #046 | P1 | 2026-03-22 | ユーザー報告 | ゲームオーバー・リタイア後にHPが初期値に戻らず、ダンジョン突入時のHPのままになっている | game-core / ui-designer | 完了 | 2026-03-22 |
| #047 | P3 | 2026-03-22 | ユーザー依頼 | 武器を多様化する。範囲攻撃、2マス先・3マス先攻撃可能など多種多様な武器を追加する | game-core / balance-designer | 完了 | 2026-03-22 |
| #048 | P2 | 2026-03-22 | ユーザー依頼 | 盾・アーマースロットを追加。攻撃武器・盾・アーマーの3種を同時装備可能にする | game-core / ui-designer / balance-designer | 完了 | 2026-03-22 |
| #025 | P0 | 2026-03-21 | 開発者調査 | 階段を踏んで次フロアに遷移すると装備武器・道具・ステータス異常が全消滅する。transitionToNextFloor の newPlayer 生成がスプレッドなしで5フィールドのみ設定していたため | game-core | 完了 | 2026-03-21 |
| #026 | P0 | 2026-03-21 | 開発者調査 | ピックアップ（アイテム/武器/ゴールド取得）時に敵全員のステータス（HP等）がリセットされる。turn-system.ts の newEnemies 参照が誤っていた | game-core | 完了 | 2026-03-21 |
| #027 | P1 | 2026-03-21 | 開発者調査 | 戦闘を繰り返すとバトルログが無制限に増加しアプリがフリーズする。React 再レンダリングコスト増大が原因 | ui-designer | 完了 | 2026-03-21 |
| #028 | P1 | 2026-03-21 | 開発者調査 | 迷路生成例外発生時に processTurn が throw するとゲームがフリーズしリカバリ不能になる | game-core / ui-designer | 完了 | 2026-03-21 |
| #018 | P0 | 2026-03-20 | 開発者調査 | スタート後プレイヤーが完全に見えない。タイトル表示中は canvas が DOM に存在せず DPR useEffect が空振り。ゲーム開始時に tileSize 未変化なら再実行されず canvas がデフォルト 300×150px のままとなり、プレイヤー(y=6*tileSize≧192px)が canvas 表示範囲外に落ちる。加えてタイルスプライトが rgb(28,28,28)/rgb(49,49,49) と暗すぎてマップが黒に近い | ui-designer | 完了 | 2026-03-20 |
| #050 | P0 | 2026-03-22 | ユーザー報告 | 特定のセーブスロット（20分以上プレイ等）のロード時にフリーズ、またはロード完了せずタイトルに戻る現象。サマリー分離・非同期ロードを適用したが特定環境下で再発 | Antigravity | 保留 | — |
| #051 | P2 | 2026-03-22 | ユーザー依頼 | 装備（武器・盾・アーマー）破損時のフィードバックが目立たない。ビープ音と画面フラッシュによる強調が必要 | Antigravity | 完了 | 2026-03-23 |
| #052 | P2 | 2026-03-22 | ユーザー依頼 | 識別スコープアイテムが使用できない。未鑑定アイテム選択時に鑑定ボタンを出し、スコープを消費して鑑定可能にする | Antigravity | 完了 | 2026-03-23 |
| #053 | P3 | 2026-03-22 | ユーザー報告 | インベントリのソート状態がメニューを閉じるとリセットされる。また「標準」ボタンが不要。ソート状態でのアイテム操作の正確性確保 | Antigravity | 完了 | 2026-03-23 |
| #054 | P0 | 2026-03-23 | ユーザー報告 | ソート状態でアイテムを使用すると、選択したものと異なるアイテムが使用される（インデックスのずれ） | Antigravity | 完了 | 2026-03-23 |
| #055 | P1 | 2026-03-23 | ユーザー報告 | アイテムの所持上限を超えて入手できてしまう。パイロットレベル依存の容量と機体性能依存の容量が混在 | Antigravity | 完了 | 2026-03-23 |

---

## 対応ログ

### #001 — 完了（2026-03-20）
- **原因:** テストのセットアップで enemy.hp=15 に設定したが atk=20 の攻撃で一撃死し、意図した「生存状態のダメージ検証」ができなかった
- **対応:** enemy.hp を 100 に変更してテストを修正
- **担当:** qa-tester サブエージェント（[8] 実施時）

### #002 — 完了（2026-03-20）
- **原因:** turn-system.ts が `createRequire`（Node.js専用API）で enemies.json を読み込んでいるため、ブラウザバンドルに含められない
- **対応:** `createRequire` と `loadEnemyDefinitions()` を削除し、`import enemyDefsRaw from '../assets/data/enemies.json'` の静的インポートに置換
- **副次効果:** #004 も同時解消（client-turn.ts を削除、GameCanvas.tsx のインポートを turn-system.ts に一本化）
- **テスト:** 126件全パス維持確認済み

### #003 — 完了（2026-03-20）
- **原因:** Turbopack が `.js` 拡張子を `.ts` にフォールバックするリゾルバーを持たない
- **対応:** `src/game/core/` 配下の全 `.ts` ファイルで `from './xxx.js'` を `from './xxx'`（拡張子なし）に変更
- **副次効果:** シムファイル（constants.js / floorUtils.js / types.js）を削除。next.config.ts の coreAliases・resolveAlias を削除しシンプル化
- **テスト:** 126件全パス維持確認済み

### #004 — 完了（2026-03-20）
- **対応:** #002 の修正に伴い client-turn.ts を削除。GameCanvas.tsx のインポートを `turn-system.ts` の `processTurn` / `spawnEnemiesFromMap` に変更し単一ファイルに統合

### #005 — 未対応
- **対応案:** `makeExploringState` が返すフロアのスタート周辺に必ず通路が存在することを保証する形でテストを書き直す（特定シード依存をなくす）

### #006 — 完了（2026-03-21）
- **対応:** pixel-artist にて複数ラウンドのスプライト刷新を実施。主人公を SF 人型ロボット（シアン基調、ヒューマノイドメカ）にリデザイン（[43][47]）。攻撃・被弾・瀕死・アイテム使用のアニメーション状態別スプライト生成。スプライト背景透過処理（黒・白両対応）、輝度 30% 向上。

### #007 — 完了（2026-03-20）
- **原因:** `className="..."` の値に改行・インデントが含まれていた（複数行リテラル）。React SSR はサーバーで改行込みの文字列をそのまま出力するが、クライアント側の React は異なる文字列として評価しハイドレーション不一致が発生
- **対応:** `GameCanvas.tsx` 内の3箇所（スタートボタン・リスタートボタン・仮想コントローラーボタン）の複数行 className を1行に修正
- **教訓:** Tailwind className は常に1行の文字列リテラルで記述する。複数クラスを整理したい場合は `clsx` / `cn()` を使う

### #009 — 完了（2026-03-21）
- **対応:** #018 の Canvas 常時 DOM 配置修正でプレイヤー描画領域外問題を解消。renderer.ts でプレイヤーを「常に青い円 → スプライト重ね描き」方式に変更。pixel-artist にて SF 人型メカスプライトを全方向・全 animState 分生成（[43][47]）。被弾フラッシュ透明度 0.35→0.45 に強化。

### #010 — 未対応
- **対応案:** ui-designer にてオーバーレイモーダルを実装。ポーズ（ESC キー / ポーズボタン）→ 再開・リスタート・セーブ終了を選択できるメニュー。セーブはlocalStorage または IndexedDB に GameState を JSON 保存する

### #011 — 完了（2026-03-20）
- **対応:** `renderer.ts` のフォールバック色を全面的に明度アップ。床 `#0e0e16` → `#252535`、壁 `#4a4a5a` → `#6a6a80`。特殊タイル（水・溶岩・氷・ワープ・磁場等）も同比率で明るく。視界外オーバーレイ透過率を壁 0.45→0.30、床 0.72→0.55 に下げ探索済みエリアを視認しやすく改善

### #012 — 完了（2026-03-20）
- **対応:** `constants.ts` の `FLOOR_SIZES` を更新。1-5F: 25×25→**30×30**、6-10F: 30→35、11-20F: 35→40、21-30F: 40→**48**、31+F: 45→**55**。全クリ10〜20時間想定に合わせて後半フロアも拡大。EXPテーブルも同時に balance-designer にて調整済み

### #013 — 未対応
- **対応案:** ui-designer にてボス登場オーバーレイを実装。フェードイン黒幕 + ボス名テキストアニメーション（2〜3秒）→ フェードアウトで戦闘開始。GameState に `bossIntro` フェーズを追加する

### #014 — 未対応
- **対応案:** sound-designer にてボス種別ごとの BGM を Tone.js で作曲・追加。`playBGM('boss_<bossType>')` の形式で呼び出せるようにし、ボス登場時（#013 演出後）に切り替える

### #015 — 未対応
- **対応案:** ui-designer にてボス専用 HP ゲージコンポーネントを実装。GameState の phase が `boss` または Enemy に `isBoss: true` フラグがある間、画面上部にボス名 + HP バー（幅広、赤グラデーション）を常時表示する。HUD.tsx または GameCanvas.tsx にオーバーレイとして追加する

### #016 — 完了（2026-03-20）
- **原因:** `VIEW_RADIUS = 3`（半径3タイル）が小さすぎ、スタート地点がコーナーや狭い通路付近の場合、視界に壁タイルしか現れずプレイヤーには「何も見えない」状態に見えた
- **対応:** `constants.ts` の `VIEW_RADIUS` を `3 → 5` に引き上げ（視界直径 7→11 タイル）

### #018 — 完了（2026-03-20）
- **原因1（描画領域外）:** タイトル/ゲームオーバー画面中は `<canvas>` が DOM に存在しないため、DPR セットアップ `useEffect([tileSize])` が `canvasRef.current === null` で早期リターン。ゲーム開始時に `tileSize` が変化していなければ useEffect は再実行されず、Canvas はデフォルトの 300×150px のまま。プレイヤーは `y = 6 * tileSize`（tileSize=32 なら y=192）に描画されるが canvas の高さが 150px しかないため表示範囲外に落ちる
- **原因2（タイルスプライトが暗すぎる）:** `floor.png` の平均色が rgb(28,28,28)、`wall.png` が rgb(49,49,49) とほぼ黒。`#011` で改善したフォールバック色（床 #252535、壁 #6a6a80）を上書きしてしまう
- **対応1:** `GameCanvas.tsx` の条件付き early return を廃止し、Canvas を常に DOM に配置。タイトル/ゲームオーバーは `absolute inset-0 z-10` のオーバーレイ div に変更。これにより useEffect が初回マウント時に正しく canvas サイズを設定できる
- **対応2:** `getDefaultSpriteList()` から `tile_wall` / `tile_floor` を除外し、コード定義のフォールバック色（明るい #252535/#6a6a80）を使用
- **対応3:** プレイヤー描画を「常に青い円を描いた上にスプライトを重ねる」方式に変更し、透過スプライトでも位置が視認できるよう改善

### #017 — 完了（2026-03-20）
- **原因:** `containerRef` が Canvas エリア＋仮想コントローラーを含む外枠 div に設置されていたため、`calcTileSize` がコントローラー分の高さを含む全高を計測し、算出した Canvas が実際に使えるエリアをはみ出していた。`overflow-hidden` によりはみ出た右端・下端がクリップされて半マス・1行欠けとなった。また Bresenham LOS の非対称性により下方向の視線判定が上方向より不利だった
- **対応:** (1) `containerRef` を Canvas 専用の内側 div（`flex-1 min-h-0 overflow-hidden`）に移動し、コントローラーを flex 外（下固定）に分離。(2) `visibility.ts` の LOS 判定を双方向対称化（両方向のいずれかが通れば視認可能）

### #020 — 完了（2026-03-21）
- **原因:** `GameCanvas.tsx` の `handleAction` 内でローカルに `const getEnemyName = ...` を定義しており、`turn-system.ts` からインポートした同名関数をシャドーしていた。ローカル版は bosses のみ参照し通常敵の日本語名が未解決。
- **対応:** ローカルの `getEnemyName` 定義を削除し、`turn-system.ts` のインポート版をそのまま使用するよう修正（[49]）。

### #021 — 完了（2026-03-21）
- **対応:** `InventoryPanel.tsx` に `scrollRef` と `data-index` 属性を追加。`useEffect([selectedIndex])` でアクティブ行を `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` で追従（[50]）。

### #022 — 完了（2026-03-21）
- **対応:** pixel-artist が `drawTankBody`（SF 戦車）→ `drawMechBody`（ヒューマノイドメカ）に置き換えを実施（[47]）。全 animState × 全方向スプライトを再生成。

### #023 — 完了（2026-03-21）
- **対応:** `turn-system.ts` の戦闘処理で `player.animState` / `enemy.animState` を `'attack'` / `'hit'` に設定するよう修正。`renderer.ts` の stateKey マッピングを全 animState に対応拡張（[46]）。向き計算ヘルパー `getDirection` を `floorUtils.ts` に追加し不自然なアニメーション反転を解消（[58]）。

### #024 — 完了（2026-03-21）
- **原因1:** `initAudio()` 内の `await import('tone')` が非同期で iOS Safari のジェスチャーコンテキストを切断していた。
- **原因2:** `onTouchStart` で `setSelectedIndex` を呼ぶと React 再レンダリングが発生し、`scale-110` トランジション中に onClick が発火しない。
- **原因3:** `audioStartedRef.current = true` を `await initAudio()` 前にセットしていたため、例外時にリトライ不可。
- **対応:** Tone.js をモジュール初期化時に事前ロード。`unlockAudioContext()` に WebAudio API ネイティブフォールバック追加。全ボタンを `onPointerDown` + `e.preventDefault()` に統一。`ensureAudioAndBGM` を try-catch で囲み catch で `audioStartedRef.current = false` にリセット（[52][53] + バグ再調査）。

### #025 — 完了（2026-03-21）
- **原因:** `transitionToNextFloor` 内の `newPlayer` 生成で `...(currentPlayer ?? {})` スプレッドがなく、`pos/hp/maxHp/atk/def/facing` の5フィールドのみ設定。`equippedWeapon`, `equippedTools`, `toolInventory`, `statusEffects` 等が消失。
- **対応:** `newPlayer` 生成に `...(currentPlayer ?? {})` スプレッドを先頭に追加し既存フィールドを全保持（[48]）。

### #026 — 完了（2026-03-21）
- **原因:** `processPlayerAction` 内でピックアップ処理後に `newEnemies` を正しく引き継がず、古いステートの enemies を参照していた。
- **対応:** ピックアップ処理後も `newEnemies` を最新ステートから参照するよう修正（Antigravity [53]）。

### #027 — 完了（2026-03-21）
- **対応:** `setBattleLog(prev => [...prev, ...newLogs].slice(-50))` で最大50件に制限（Antigravity [57]）。

### #028 — 完了（2026-03-21）
- **対応:** `GameCanvas.tsx` の `handleAction` 内で `processTurn` 呼び出しを try-catch で囲み、例外時は console.error を出力して return するよう修正（[49]）。

### #029 — 完了（2026-03-22）
- **調査結果:** スプライット PNG 自体は `hasAlpha: true` で透明背景として正しく生成されていることを確認。Canvas の黒背景が透過ピクセルから透けて見えているのが原因。
- **対応:** renderer.ts のプレイヤー描画はスプライット下に青い円を重ねる方式（位置視認用）のため、透明部分に黒ではなく青円が見える状態。背景処理は仕様上の正常動作と確認。引き続き視覚上の問題があればユーザー再報告待ち。

### #030 — 完了（2026-03-22）
- **調査結果:** `drawMechBody` の各方向ブランチはトップダウン視点として意図的に設計（UP方向=背面視点で脚が上・頭が下）。32×32px に全方向スプライットが正しく収まっていることを確認。不自然に見える場合はデザイン再調整が必要。

### #031 — 完了（2026-03-22）
- **対応:** `renderer.ts` のプレイヤー描画部分の表示サイズを `tileSize * 1.25` → `tileSize * 1.35` に変更（[61]）。スプライット全件再生成済み。

### #032 — 完了（2026-03-22）
- **調査結果:** `renderer.ts` の facingKey は `player.facing` をそのまま使用しており逆転なし。スプライットキー `player_idle_left_*` は左向きキャノンアームが正しく描かれていることを確認。

### #033 — 完了（2026-03-22）
- **原因（3層構造）:**
  1. `processTurn` 冒頭で全エンティティの animState を `'idle'` にリセット後に行動処理 → attack/hit 設定後も「次のキー入力で即 idle に戻る」動作で人間の目に見えなかった
  2. `handleUseItem` が `setGameState(withAnim)` を呼ぶが `stateRef.current = withAnim` 代入がなく RAF ループが item_use を反映しなかった
  3. 敵の animState も同様に持続期間なし
- **対応（`src/game/ui/GameCanvas.tsx`）:**
  - `ANIM_STATE_DURATION_MS = 600` 定数を追加（600ms 表示）
  - `animStateExpiryRef`（`Map<string, number>`）で各エンティティの有効期限管理
  - RAF ループ内で期限切れ animState を `'idle'` に書き戻し（再レンダリングなし）
  - `handleAction` / `handleUseItem` で animState 設定後に expiry を登録
  - `handleUseItem` に `stateRef.current = withAnim` 追加（[63]）

### #034 — 完了（2026-03-22）
- **原因:** `maze-generator.ts` の `placeEntities` に2つの独立したアイテム配置ループが存在。通常配置ループは `MAX_SPAWN_ITEMS=3` チェック済みだが、宝物部屋の専用配置ループが上限チェックなしに無制限配置していた。廃金属は序盤の出現重み（`dropWeight: 10`）が高いため集中。
- **対応:**
  - `constants.ts` に宝物部屋専用上限定数を追加（`MAX_TREASURE_ROOM_ITEMS=5`、`MAX_TREASURE_ROOM_GOLD=4`）
  - 宝物部屋の配置ループに上限チェックを追加
  - 通常配置ループが宝物部屋セルをスキップするようマーキング追加（二重配置も解消）（[62]）

### #035 — 完了（2026-03-22）
- **対応（`src/game/ui/BaseScreen.tsx`）:**
  - `onSaveAndExit?` / `onReturnToTitle?` コールバックを Props に追加
  - フッターに「セーブして終了」（緑）・「タイトルに戻る」（オレンジ）ボタンを追加
  - 「タイトルに戻る」押下時に確認ダイアログを表示: 「セーブして戻る」/ 「セーブせずに戻る（赤・警告テキスト付き）」/ 「キャンセル」
- **対応（`src/game/ui/GameCanvas.tsx`）:**
  - `handleReturnToTitleWithoutSave` を追加（state リセット + `playBGM('title')`）
  - `BaseScreen` に両コールバックを接続（[64]）

### #036 — 完了（2026-03-22）
- **対応:** `renderer.ts` に `TILE_SHOP` タイル上へのショップ NPC スプライット描画ロジックを追加。背景透明・35%はみ出しで中央寄せ描画。`getDefaultSpriteList` に NPC スプライット読み込みを追加（[61]）。

### #019 — 完了（B10F分）（2026-03-22）
- **対応（`scripts/generate-sprites.ts`）:**
  - B10F 通常敵 12 種の 4 方向 × 3 状態（idle/attack/hit）× 2 フレーム スプライトを生成する draw 関数を追加: `drawScoutDrone4Dir`（既存更新）, `drawMineBeetle4Dir`, `drawSpark4Dir`, `drawSlimeX4Dir`, `drawMiniSlime4Dir`, `drawAssaultMecha4Dir`, `drawStealthKiller4Dir`, `drawShieldKnight4Dir`, `drawMineLayer4Dir`, `drawHealerDrone4Dir`, `drawMetalWolf4Dir`, `drawBombLobber4Dir`
  - B10F ボス 5 体の 4 方向 × 4 状態（move/atk/dmg/dead）× 2 フレーム スプライトを生成する `generateBoss4DirSprites()` と draw 関数を追加: `drawBugSwarm4Dir`, `drawMachRunner4Dir`, `drawJunkKing4Dir`, `drawPhantom4Dir`, `drawIronFortress4Dir`
  - `flipHorizontal()` ユーティリティ追加（right 方向 = left の水平反転で生成）
  - 生成スプライト数: 通常敵 288 枚 + ボス 160 枚 = **448 枚**（累計 645 ファイル）
- **対応（`src/game/systems/renderer.ts`）:**
  - `getDefaultSpriteList()` に B10F 敵・ボス全種の `{id}_dir_{dir}_{state}_{frame}` キーでの読み込みを追加
  - 敵描画の idle / hit ルックアップを方向考慮 `${enemyType}_dir_${dir}_{state}_{frame}` → 4 段階フォールバック チェーンに更新
  - ボスの move / atk 状態ブランチを追加

### #008 — 完了（2026-03-20）
- **原因:** `turn-system.ts` の `processPlayerAction` 内の `calcDamage(newPlayer.atk, ...)` が `equippedWeapon.atk` を加算していなかった
- **対応:** `effectiveAtk(player): number` 関数を追加（`player.atk + equippedWeapon?.atk`）し、バンプ攻撃・`attack` アクション両方で `effectiveAtk` を使用するよう修正
- **影響:** `damage-calculation.test.ts` の期待値を正しい式（`player.atk + weapon.atk - def`）に更新
- **qa-tester P1 テスト（371件）全パス確認済み**

### #038 — 完了（2026-03-22）（初回修正は不完全、再修正で解決）
- **真の根本原因:** `stateWithPickup.player.weaponSlots` にはピックアップ後の武器が入っているが、`playerAfterTrap`（`processPlayerAction` の戻り値 = ピックアップ処理前）が `processEnemyActions` / `finalPlayer` にそのまま使われていたため、最終的な `return { player: finalPlayer }` から武器が消えていた。
- **修正（`src/game/core/turn-system.ts`）:** ピックアップブロック終了後・フロア遷移チェック前に `playerAfterTrap.weaponSlots = stateWithPickup.player.weaponSlots` を同期するコードを追加。以降の `processEnemyActions` → `playerAfterEnemies` → `finalPlayer` まで weaponSlots が正しく引き継がれるようになった。
- テスト: 422件中421件パス（失敗1件は既存の無関係バグ）

### #039 — 完了（2026-03-22）
- **対応（`scripts/generate-sprites.ts`）:**
  - パレット刷新: エレクトリックシアン `#00c8ff` / ブルー `#0080ff` をボディメインに、ゴールドライン `#ffdd00`、マゼンタセンサー `#ff00ff`、グリーンコア `#00ff88` を採用
  - **idle**: コア・アンテナが交互点滅。バイザーにマゼンタ発光＋白い輝点2つ（両目）
  - **attack**: フレーム0=キャノン/腕がゴールド/シアンでチャージ発光 → フレーム1=白中心・黄/オレンジ放射状の爆発エフェクト（8方向ライン＋スパーク）→ フレーム2=緑/青白残光オーラ
  - **hit**: フレーム0=ボディ全体を真っ赤 `#ff0000` に塗りつぶすダメージフラッシュ＋黄スパーク8点散布 → フレーム1=亀裂ライン＋スパーク残留
  - **item_use**: フレーム0=左腕を高く掲げ、3重緑オーラ（半径3/5/7px）を放射状展開 → フレーム1=ボディ全体を緑オーバーレイ＋外周オーラリング＋ゴールド十字
  - **near_death**: 暗青灰ボディ、大きな斜め亀裂、赤ピンクエネルギー漏れ `#ff0044`、スパーク8点
- 全方向（down/up/left/right）× 全 animState 分、計49枚のPNGを再生成

### #040 — 完了（2026-03-22）
**① 空マス・壁への攻撃でも animState='attack' が設定されない問題（`turn-system.ts`）**
- 素手（武器未装備）で攻撃した場合に animState が未設定だった
- `attack` ケースの武器耐久消費 `if (weapon) { ... }` に `else` 節を追加し、素手・空振り時も `animState: 'attack'` を設定

**② タイルフラッシュエフェクト（`renderer.ts` / `GameCanvas.tsx`）**
- `renderer.ts`: `FlashMap` 型を追加。`renderGame` に `flashMap?: FlashMap` パラメータを追加。タイル描画後・エンティティ描画前に期限チェック付きの色付き矩形を重ねる処理を追加
- `GameCanvas.tsx`: `flashMapRef`（`Map<string, {color, expiry}>`）を追加。`addFlash(x,y,color)` / `getFrontTile(player)` ヘルパー関数を追加
  - 移動/攻撃アクション → 前方タイルに黄橙 `rgba(255,200,0,0.7)` 250ms
  - プレイヤー被弾 → プレイヤータイルに赤 `rgba(255,0,0,0.7)` 250ms
  - 敵被弾 → 敵タイルに赤 `rgba(255,0,0,0.7)` 250ms
  - アイテム使用 → プレイヤータイルに緑 `rgba(0,255,136,0.6)` 250ms
  - RAF ループで `renderGame` に `flashMapRef.current` を渡す

**③ アニメーションさらに派手化（`scripts/generate-sprites.ts`、全573枚再生成）**
- **attack f0**: ボディ外周を白 `#ffffff` で縁取り。コア超高輝度。マゼンタ→黄グロードット十字配置
- **attack f1**: 全ピクセル黄色フラッシュ処理。白→黄→橙の3リング衝撃波。スパーク6点
- **attack f2**: シアン `#00ffff` 残光ライン（距離に応じてアルファ線形減衰）
- **hit f0**: 2px右シフトでノックバック表現。ほぼ白に変換。白+黄スパーク10点ペア
- **hit f1**: `#ff2222` 全塗りつぶし。2px幅亀裂（橙+黄橙）。スパーク8点2色ペア
- **item_use f0**: 腕先から12本の光線をスプライト端まで延伸。中間角度に散布ドット
- **item_use f1**: `#44ff88` 縁取り。8方向に星形ドット（各4点）
- **テスト:** 422件中421件パス（失敗1件は `start-return.test.ts` の既存問題で今回の修正とは無関係）

### #041 — 完了（2026-03-22）
- **対応（`HUD.tsx`）:** `HUDProps` に `level: number` / `gold: number` を追加。HP テキスト行を `Lv.{level}  HP {hp}/{maxHp}  G {gold}` 形式に変更。Lv は `text-yellow-300`、G は `text-yellow-200` で視認性確保。HP ゲージバーは維持。
- **対応（`GameCanvas.tsx`）:** HUD の呼び出しに `level={gameState.pilot.level}` / `gold={gameState.inventory.gold}` を追加。

### #042 — 完了（2026-03-22）
- **原因:** `tool-system.ts` の `nonUsableEffects` 配列に `'weapon_upgrade_material'` が含まれており「ここでは使えません」と弾かれていた。
- **対応:** `nonUsableEffects` から `weapon_upgrade_material` を削除。新規ハンドラを追加（tier1:+5 ATK、tier2:+10 ATK、tier3:+20 ATK）し `inventory.equippedWeapons` の `weaponLevel` も +1。`weapon_durability_restore_full` も `weaponSlots` / `inventory.equippedWeapons` を同期更新するよう拡張。

### #043 — 完了（2026-03-22）
- **原因:** `GameCanvas.tsx` の `handleBuyItem` が武器枠チェックに `getInventoryCapacity(level)`（大きな値）を使っており、`state.machine.weaponSlots`（実際の上限2）を参照していなかった。アイテムも `machine.itemPouch` ではなく誤った値で判定していた。
- **対応:** 武器購入チェックを `player.weaponSlots.length >= machine.weaponSlots` に修正。アイテム購入チェックを `currentItemCount >= machine.itemPouch` に修正。

### #044 — 完了（2026-03-22）
- **原因:** `turn-system.ts` のアイテムピックアップ処理が `state.inventory.items`（ピックアップ前の素の state）を参照しており、同ターン内の先行変更と競合していた。
- **対応:** アイテム追加処理のベースを `stateWithPickup.inventory` に変更。ゴールドも `stateWithPickup.inventory.gold` を参照するよう修正。

### #045 — 完了（2026-03-22）
- **原因:** `player.equippedWeapon.durability` は減算されていたが `inventory.equippedWeapons` に同期されなかったため、セーブ後ロードすると耐久が元に戻っていた。
- **対応:** `playerAfterTrap.equippedWeapon` の耐久値を `stateWithPickup.inventory.equippedWeapons` に反映する同期ブロックを追加。武器が壊れた場合は `weaponSlots` / `equippedWeapons` 両方から除去。

### #046 — 完了（2026-03-22）
- **原因1（ゲームオーバー）:** `handleGameOverReturn` が古い `gameState`（useState 値）を `applyStartReturn` に渡し、`machine.hp` が中途半端な値で帰還処理されていた。
- **原因2（リタイア）:** `handleMoveToBase` の `setGameState` 更新後に `stateRef.current` への書き戻しがなく、次の `handleEnterDungeon` が古い hp でプレイヤーを生成していた。
- **対応:** `handleGameOverReturn` を `stateRef.current` 経由に変更し `machine.hp = machine.maxHp` を明示設定。`handleMoveToBase` の更新後 state を `stateRef.current` に書き戻すよう修正。

### #047 — 完了（2026-03-22）
- **実施内容（`src/game/assets/data/weapons.json`）:**
  - 既存武器23件に `attackRange` / `attackPattern` / `weight` フィールドを追加
  - 新武器10件を追加: ロングスピア（pierce2）・スナイパーキャノン（pierce4）・スキャッターガン（spread3）・ボレーミサイル（cross2）・カーボンブレード（single近接）・プラズマエミッター（all8範囲）・グレネードランチャー（spread3）・サンダーウェーブ（bidirectional）・ビームキャノン（pierce6）・スクラップソード（single近接）
- **実施内容（`src/game/core/weapon-system.ts`）:**
  - `AttackPattern` 型（single / pierce / spread3 / cross / all8 / bidirectional）を追加
  - `resolveByPattern(pos, facing, pattern, range, map, enemies)` 関数を追加
  - `raycast` ヘルパー（壁遮断/貫通対応の単方向射線計算）を追加
  - `getAttackTargetPositions` を拡張: `attackPattern` フィールドがあれば `resolveByPattern` 経由、なければ後方互換の `rawRangeType` ロジック
- **テスト:** 422件中421件パス（start-return.test.ts 1件は既存の無関係バグ）

### #048 — 完了（2026-03-22）
- **実施内容（`src/game/core/game-state.ts`）:**
  - `WeaponCategory` に `'shield' | 'armor'` を追加
  - `EquippedShield` 型（shieldId, durability, maxDurability, def, blockChance?, name）を新規追加
  - `EquippedArmor` 型（armorId, durability, maxDurability, def, maxHpBonus?, name）を新規追加
  - `Player` に `equippedShield?`, `equippedArmor?`, `shieldSlots?`, `armorSlots?` を追加
  - `MachineStats` に `shieldSlots: number`, `armorSlots: number` を追加（初期値: 各1）
  - `Inventory` に `equippedShields: EquippedShield[]`, `equippedArmors: EquippedArmor[]` を追加
- **実施内容（`src/game/assets/data/weapons.json`）:**
  - 盾6種追加（light_shield〜aegis_shield, 2F〜22F出現, DEF+3〜+15, blockChance 0〜25%）
  - アーマー6種追加（titanium_plate〜plasma_armor, 3F〜23F出現, DEF+5〜+20, maxHpBonus 0〜+30）
- **実施内容（`src/game/core/turn-system.ts`）:**
  - 敵攻撃ダメージ計算に `equippedShield.def` + `equippedArmor.def` を加算
  - 盾の `blockChance` による確率ダメージ完全ブロック処理を追加
  - TILE_WEAPON ピックアップ時に `category` を確認し shield/armor を専用スロットに振り分け
- **実施内容（`src/game/ui/WeaponPanel.tsx`）:**
  - 盾スロット・アーマースロットの表示セクションを追加（装備/外す/破棄ボタン、耐久バー、def/blockChance/maxHpBonus 表示）
- **実施内容（`src/game/ui/GameCanvas.tsx`）:**
  - `handleEquipShield`, `handleUnequipShield`, `handleDropShield`, `handleEquipArmor`, `handleUnequipArmor`, `handleDropArmor` の6ハンドラーを追加
- **テスト:** 422件中421件パス（start-return.test.ts 1件は既存の無関係バグ・変化なし）

### #037 — 完了（2026-03-22）（#049 として再調査・根本解決）
- → #049 の対応ログを参照

### #051 — 完了（2026-03-23）
- **原因:** 装備破損時の通知がバトルログのみで、プレイ中に気づきにくかった。
- **対応:**
  - `audio.ts` に 1.5 秒のビープ音 SE `equipment_break_long` を追加。
  - `renderer.ts` に全画面フラッシュ描画機能を追加。
  - `GameCanvas.tsx` で「壊れた」ログ検出時に上記 SE と赤フラッシュ（1.5秒）をトリガーするよう実装。

### #052 — 完了（2026-03-23）
- **原因:** 識別スコープ（id_scope）を直接「使う」ことができず、識別ロジックが未統合だった。
- **対応:**
  - `InventoryPanel.tsx` にて、未鑑定アイテム選択中かつ識別スコープを所持している場合にのみ「鑑定」ボタンを表示。
  - `GameCanvas.tsx` に `handleIdentifyItem` ハンドラを実装し、スコープを消費して対象を識別。
  - `tool-system.ts` の `identify_item` 効果を修正し、ログに正式名称を表示するように改善。

### #053 — 完了（2026-03-23）
- **原因:** ソート状態が React コンポーネントのローカルステートだったため、メニューを閉じると破棄されていた。
- **対応:**
  - `game-state.ts` の `Inventory` 型に `sortKey` を追加し、状態を `GameState` へ移行。
  - `InventoryPanel.tsx` から「標準」ボタンを削除し、指定のソート順が維持されるよう変更。
  - `InventoryPanel.tsx` のアイテム操作（使用・鑑定・破棄）に `originalIndex` を使用することで、ソート順によらず正しいアイテムが対象になるよう保証。

### #054 — 完了（2026-03-23）
- **原因:** `GameCanvas.tsx` の `handleUIAction`（キーボード・仮想コントローラ操作）が、ソート後の表示上のインデックスをそのまま `handleUseItem` に渡していたため、内部の `items` 配列の正しい要素を指定できていなかった。
- **対応:**
  - `inventory-utils.ts` を作成し、ソートロジックを抽出・共通化。
  - `GameCanvas.tsx` で `getSortedItems` を使用して、表示上のインデックスから `originalIndex`（元の配列の添字）を逆引きしてから `handleUseItem` を呼ぶように修正。

### #055 — 完了（2026-03-23）
- **原因:** `turn-system.ts` のアイテム取得チェックが `getInventoryCapacity(level)`（レベル依存）を参照していたのに対し、ショップやUIの表示は `machine.itemPouch` を参照しており、ロジック間で不整合があった。
- **対応:**
  - アイテム取得時の上限チェックを `state.machine.itemPouch` に、武器取得時の上限チェックを `state.machine.weaponSlots` に統一。
  - メッセージ内容を「アイテムポーチがいっぱいで〜」「武器スロットがいっぱいで〜」とより具体化。
