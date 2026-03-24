# 🏗️ メカローグ ー マルチエージェント開発計画書（更新版）

## Windows + VS Code 環境 / Opus 4.6 & Sonnet 4.6 モデル使い分け対応

---

## 1. モデル使い分け戦略

### 1.1 基本方針

**Opus 4.6** → 複雑な設計判断、アーキテクチャ、ボスAI、バグの根本原因分析
**Sonnet 4.6** → 定型的な実装、データ入力、スプライト量産、テスト記述

コスト削減効果: 全て Opus の場合と比較して **約50〜60%のトークン節約**

### 1.2 エージェント別モデル割り当て

```
┌──────────────────────────────────────────────────────────┐
│              🎯 チームリード（メインセッション）             │
│              モデル: Opus 4.6（常時）                       │
│     全体統合・設計判断・レビュー・デプロイ管理               │
└────┬─────────┬──────────┬──────────┬──────────┬──────────┘
     │         │          │          │          │
┌────▼───┐┌───▼────┐┌───▼─────┐┌──▼────┐┌───▼──────┐
│🕹️Core ││🎨Art   ││🎵Sound  ││⚖️Bal. ││🐛QA      │
│Opus/Son││Sonnet  ││Opus/Son ││Sonnet ││Opus/Son  │
└────────┘└────────┘└─────────┘└───────┘└──────────┘
```

### 1.3 タスク別の詳細モデル割り当て表

#### 🕹️ ゲームコアエージェント（game-core）

| タスク | モデル | 理由 |
|--------|--------|------|
| 迷路生成アルゴリズム設計 | **Opus** | 到達可能性保証のアルゴリズムが複雑 |
| ターンシステムの設計 | **Opus** | 速度差・行動順の設計判断が必要 |
| 戦闘ダメージ計算エンジン | **Opus** | 多数の変数が絡むバランス設計 |
| ボスAI（全13体の固有ロジック） | **Opus** | 各ボス独自の行動パターン・フェーズ遷移 |
| 敵AI（7パターン） | **Opus** | 経路探索・判断ロジック |
| セーブ・ロードシステム | **Opus** | データ整合性とエラーハンドリング |
| 状態異常システム | Sonnet | 定義に沿った実装 |
| アイテム・武器の使用処理 | Sonnet | JSON データに基づく定型処理 |
| ショップ売買ロジック | Sonnet | 単純な四則演算 |
| 倉庫の保管・取出し | Sonnet | CRUD 操作 |
| マシン強化の適用 | Sonnet | ステータス加算の単純処理 |
| 経験値・レベルアップ処理 | Sonnet | テーブル参照の定型処理 |

#### 🎨 グラフィックエージェント（pixel-artist）

| タスク | モデル | 理由 |
|--------|--------|------|
| スプライト生成スクリプトの設計 | **Opus**（初回のみ） | sharp + Buffer のパイプライン設計 |
| プレイヤーマシンのデザイン | Sonnet | テンプレート化済みのピクセル配置 |
| 通常敵スプライト（20種） | Sonnet | パターン化した量産作業 |
| ボススプライト（13体） | Sonnet | 量産だがサイズが大きい程度 |
| タイルセット（壁・通路・地形） | Sonnet | 単純なパターン繰り返し |
| アニメーションフレーム生成 | Sonnet | テンプレートに沿った変形 |
| UI素材（アイコン・ボタン等） | Sonnet | 定型デザイン |
| エフェクト（爆発・回復等） | Sonnet | パーティクル的な単純パターン |

#### 🎵 BGM・SEエージェント（sound-designer）

| タスク | モデル | 理由 |
|--------|--------|------|
| オーディオシステム設計 | **Opus** | Tone.js アーキテクチャ・状態管理 |
| BGM作曲（メロディ・コード進行） | **Opus** | 音楽理論に基づく創造的作業 |
| BGMのコード実装 | Sonnet | 設計済みの楽譜データをコード化 |
| SE（効果音）生成 | Sonnet | パラメータ調整の定型作業 |
| フェード・遷移制御 | Sonnet | イベントハンドリング |

#### ⚖️ ゲームバランスエージェント（balance-designer）

| タスク | モデル | 理由 |
|--------|--------|------|
| 敵データJSON全種作成 | Sonnet | 数値入力の量産作業 |
| 武器データJSON全種作成 | Sonnet | 同上 |
| ドロップテーブル作成 | Sonnet | 確率表の入力 |
| ショップ価格表作成 | Sonnet | 数値計算と入力 |
| 経験値テーブル作成 | Sonnet | 計算式に基づく生成 |
| バランスシミュレーター作成 | **Opus**（初回のみ） | シミュレーションロジック設計 |
| シミュレーション結果分析 | **Opus** | 統計解釈と調整判断 |

#### 🐛 テストエージェント（qa-tester）

| タスク | モデル | 理由 |
|--------|--------|------|
| テスト戦略・設計 | **Opus**（初回のみ） | テストカバレッジ計画 |
| P0テスト（迷路到達可能性等） | **Opus** | エッジケース発見が重要 |
| P1テスト（ダメージ計算等） | Sonnet | 仕様に沿ったアサーション |
| P2〜P3テスト | Sonnet | 定型テスト記述 |
| バグの根本原因分析 | **Opus** | 複雑なロジックの解析 |
| パフォーマンス計測スクリプト | Sonnet | 計測コードの記述 |

#### 📐 UI/UXエージェント（ui-designer）

| タスク | モデル | 理由 |
|--------|--------|------|
| Canvas描画エンジン設計 | **Opus** | ビューポート管理・描画最適化 |
| レスポンシブ対応設計 | **Opus** | PC/スマホ切替のアーキテクチャ |
| タッチ入力システム | **Opus** | ジェスチャー判定ロジック |
| HUD（HPバー等）実装 | Sonnet | React コンポーネントの定型実装 |
| メニュー画面実装 | Sonnet | UI コンポーネント |
| インベントリUI | Sonnet | リスト表示の定型パターン |
| ミニマップ描画 | Sonnet | Canvas の縮小描画 |

### 1.4 モデル指定方法

#### サブエージェントでのモデル指定

`.claude/agents/` のエージェント定義ファイルで `model` を指定:

```markdown
---
name: pixel-artist
description: ドット絵スプライトの生成と管理
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---
```

```markdown
---
name: game-core
description: ゲームコアロジック実装
tools: Read, Write, Edit, Bash, Glob, Grep
model: opus
---
```

#### 環境変数でのサブエージェントモデル制御

```powershell
# PowerShell でサブエージェントのデフォルトモデルを Sonnet に設定
$env:CLAUDE_CODE_SUBAGENT_MODEL = "claude-sonnet-4-6"
```

#### メインセッション内での動的切り替え

```
# Claude Code セッション内で /model コマンドを使用
/model claude-opus-4-6      # 複雑なタスク前に切替
/model claude-sonnet-4-6    # 定型タスクに切替
```

#### Agent Teams での指定

プロンプトで各 Teammate のモデルを明示:

```
エージェントチームを作成してください。

チーム構成:
1. game-core (Opus): ボス戦AIの実装
2. pixel-artist (Sonnet): ボススプライト13体の生成
3. sound-designer (Sonnet): SE 全種の実装
4. qa-tester (Sonnet): 戦闘システムのP1テスト作成

Sonnet で実行可能なチームメイトは Sonnet を使ってください。
```

> **注意**: 2026年3月現在、Agent Teams では全エージェントが同一モデル
> （Opus 4.6 必須）で動作します。Teammate 個別のモデル指定は
> 将来的にサポート予定ですが、現時点では未対応です。
> このため、コスト最適化には以下の **ハイブリッド戦略** を使います。

### 1.5 ハイブリッド戦略（現実的なコスト最適化）

Agent Teams が全員 Opus を要求する現状での対策:

```
戦略: Agent Teams（Opus）と Subagents（Sonnet）を併用

Phase A: Subagents (Sonnet) で量産タスクを先に実行
  → スプライト生成、JSONデータ作成、定型テスト
  → コスト: 低

Phase B: Agent Teams (Opus) で複雑タスクを並列実行
  → ボスAI、コアシステム設計、バグ分析
  → コスト: 高（だが期間は短い）

Phase C: 再び Subagents (Sonnet) で仕上げ
  → 残りのテスト、UIの微調整、データ修正
  → コスト: 低
```

---

## 2. Windows + VS Code 環境構築

### 2.1 前提条件

| ソフトウェア | バージョン | インストール方法 |
|------------|-----------|----------------|
| Windows | 10/11 | ― |
| VS Code | 1.98.0+ | 公式サイト or `winget install Microsoft.VisualStudioCode` |
| Node.js | 18+ (LTS推奨) | `winget install OpenJS.NodeJS.LTS` |
| Git | 最新版 | `winget install Git.Git` |
| PowerShell | 7+ | `winget install Microsoft.PowerShell` |

> **WSL2 について**: Claude Code は WSL2 でも Native Windows (PowerShell) でも
> 動作します。本ガイドでは **Native Windows (PowerShell)** を前提とします。
> WSL2 を使いたい場合は、VS Code の Remote - WSL 拡張機能と組み合わせてください。

### 2.2 ステップバイステップ セットアップ

#### Step 1: 必須ソフトのインストール（PowerShell を管理者で開く）

```powershell
# PowerShell 7 をインストール（まだの場合）
winget install Microsoft.PowerShell

# Node.js LTS をインストール
winget install OpenJS.NodeJS.LTS

# Git をインストール
winget install Git.Git

# ★ PowerShell を一度閉じて再度開く（PATHを反映）★

# バージョン確認
node --version    # v18.x.x 以上であること
npm --version     # 9.x.x 以上であること
git --version     # git version 2.x.x
```

#### Step 2: Claude Code CLI インストール

```powershell
# Claude Code をグローバルインストール
npm install -g @anthropic-ai/claude-code

# ★ PowerShell を一度閉じて再度開く ★

# 動作確認
claude --version

# 初回認証（ブラウザが開いてAnthropicアカウントでログイン）
claude auth login
```

> **トラブルシューティング**: `claude` コマンドが見つからない場合:
> ```powershell
> # npm のグローバルパスを確認
> npm config get prefix
> # 表示されたパスが PATH に含まれているか確認
> $env:PATH -split ";" | Select-String "npm"
> ```

#### Step 3: VS Code 拡張機能

```powershell
# VS Code を開く
code

# または VS Code 内のターミナルから
# Ctrl+Shift+X → 「Claude Code」で検索 → Anthropic 公式を Install
```

VS Code にインストールする拡張機能:

| 拡張機能 | 用途 |
|---------|------|
| **Claude Code** (Anthropic) | Claude Code 統合（必須） |
| ESLint | コード品質チェック |
| Prettier | コードフォーマッタ |
| Tailwind CSS IntelliSense | Tailwind 補完 |
| Error Lens | エラーのインライン表示 |

#### Step 4: プロジェクト作成

```powershell
# プロジェクトディレクトリを作成（ホームディレクトリ推奨）
cd $HOME
mkdir mecha-rogue
cd mecha-rogue

# Git 初期化
git init

# Next.js プロジェクト作成
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"

# ゲーム用ディレクトリ構造
mkdir -p src/game/core
mkdir -p src/game/entities
mkdir -p src/game/systems
mkdir -p src/game/ui
mkdir -p src/game/assets/data
mkdir -p public/sprites
mkdir -p public/audio
mkdir -p tests/unit
mkdir -p tests/integration
mkdir -p tests/e2e
mkdir -p tests/simulation
mkdir -p docs/design
mkdir -p docs/balance
mkdir -p docs/qa
mkdir -p docs/legal
mkdir -p .claude/agents
mkdir -p .claude/commands

# ゲーム関連パッケージ
npm install tone
npm install -D vitest @types/node
```

> **Windows の mkdir -p**: PowerShell 7 では `mkdir -p` が動作します。
> もし古い PowerShell（5.x）の場合は個別に `New-Item -ItemType Directory -Force -Path` を使います。

#### Step 5: Claude Code 設定ファイル配置

```powershell
# VS Code でプロジェクトを開く
code .
```

VS Code 内で以下のファイルを作成:

**`.claude/settings.json`**
```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep"
    ]
  }
}
```

**Agent Teams を有効化する場合**（Max プランで Opus 使用時）:

VS Code の設定 (Ctrl+,) → 「Claude Code」を検索、または `settings.json` に直接追加:
```json
{
  "claudeCode.agentTeams": true
}
```

もしくは PowerShell の環境変数で設定:
```powershell
# 現在のセッションのみ
$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"

# 永続化したい場合
[Environment]::SetEnvironmentVariable(
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1", "User"
)
# → PowerShell 再起動が必要
```

#### Step 6: CLAUDE.md をプロジェクトルートに作成

```markdown
# メカローグ ー 機甲迷宮探索記

## プロジェクト概要
2Dローグライク迷路ゲーム。Next.js + TypeScript + Canvas2D。
ブラウザ上で動作（PC + スマホ対応）。Vercel にデプロイ。

## 開発環境
- OS: Windows 10/11
- エディタ: VS Code
- シェル: PowerShell 7
- パスの区切り: \\ (Windows) ※ コード内では / を使用

## 技術スタック
- Next.js 14+ (App Router)
- TypeScript strict mode
- Canvas 2D（ゲーム描画）
- Tone.js（BGM・SE）
- Tailwind CSS（UI部分）

## モデル使い分けルール
### Opus 4.6 を使うタスク（複雑・設計判断）
- アルゴリズム設計（迷路生成、敵AI、ボスAI）
- アーキテクチャ設計（ゲームループ、描画エンジン、入力システム）
- 音楽の作曲（メロディ・コード進行の創作）
- バグの根本原因分析
- テスト戦略の立案

### Sonnet 4.6 を使うタスク（定型・量産）
- JSONデータファイルの作成（敵、武器、アイテム等）
- スプライト画像の量産生成
- 仕様に沿った定型コード実装
- 個別テストケースの記述
- UI コンポーネントの実装

## ファイル構造規約
- ゲームコアロジック: src/game/core/
- エンティティ: src/game/entities/
- システム: src/game/systems/
- UI: src/game/ui/
- データ定義: src/game/assets/data/ (JSON)
- スプライト: public/sprites/ (PNG)
- テスト: tests/

## コーディング規約
- 全ファイル TypeScript（strict: true）
- 関数には JSDoc コメント必須
- ゲームデータは JSON で外部化（ハードコーディング禁止）
- マジックナンバー禁止
- Windows パス互換: path.join() を必ず使用、ハードコードした / や \\ 禁止

## ドメイン並列パターン
独立ドメインの作業は並列起動可:
- グラフィック: public/sprites/, src/game/assets/
- BGM: src/game/systems/audio.ts
- バランス: src/game/assets/data/*.json
- テスト: tests/
各エージェントは自分のドメインのファイルのみ編集すること。

## Windows 固有の注意事項
- npm scripts では cross-env を使用
- ファイルパスは path.join() で組み立て
- 改行コードは LF に統一（.gitattributes で設定済み）
- PowerShell ではシングルクォートで JSON 文字列をエスケープ
```

#### Step 7: Windows 固有の設定ファイル

**`.gitattributes`**（改行コード統一）
```
* text=auto eol=lf
*.png binary
*.ico binary
```

**`.claudeignore`**（不要ファイルを除外してトークン節約）
```
node_modules/
.next/
out/
dist/
*.log
.env*
.git/
package-lock.json
```

**`tsconfig.json`の追加設定**（パス解決）
```json
{
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/game/*": ["src/game/*"],
      "@/tests/*": ["tests/*"]
    }
  }
}
```

---

## 3. エージェント定義ファイル（モデル指定付き）

### 3.1 🕹️ game-core（Opus / Sonnet 切り替え）

**`.claude/agents/game-core-opus.md`**（設計・複雑ロジック用）
```markdown
---
name: game-core-opus
description: ゲームコアの設計と複雑なロジック実装。迷路生成アルゴリズム、ターンシステム設計、ボスAI、敵AI、セーブシステム。
tools: Read, Write, Edit, Bash, Glob, Grep
model: opus
---

あなたは「メカローグ」のリードゲームプログラマーです。
設計判断を伴う複雑なタスクを担当します。

## 担当（Opus が必要なタスク）
- 迷路生成アルゴリズム（到達可能性保証付き再帰分割法）
- ゲームループとターンシステムの設計
- 戦闘システムのダメージ計算エンジン
- 敵AIの経路探索と行動判断（A*アルゴリズム等）
- ボスAI（13体の固有行動パターンとフェーズ遷移）
- セーブ・ロードのデータ整合性とリカバリ
- GameState の型設計とイミュータブルな状態管理

## 技術方針
- 全ロジックは純粋 TypeScript（UIフレームワーク非依存）
- GameState は1つのオブジェクトに集約
- 副作用を最小限に（テスタブルな設計）

## 出力先
- src/game/core/（コアシステム）
- src/game/entities/（エンティティクラス）
- src/game/systems/（各種システム）

## Windows 注意
- ファイルパスは必ず path.join() を使用
- テスト実行は npx vitest
```

**`.claude/agents/game-core-sonnet.md`**（定型実装用）
```markdown
---
name: game-core-sonnet
description: ゲームコアの定型的な実装。JSONデータの読み込み、アイテム使用処理、ショップ、倉庫、レベルアップ処理。
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

あなたは「メカローグ」のゲームプログラマーです。
設計済みの仕様に従って定型的な実装を行います。

## 担当（Sonnet で十分なタスク）
- JSON データファイルの読み込みとエンティティ生成
- アイテム使用・武器装備の処理
- ショップの売買ロジック
- 倉庫の保管・取出し
- マシン強化の適用（ステータス加算）
- 経験値・レベルアップ処理（テーブル参照）
- 状態異常の適用・解除

## 原則
- game-core-opus が設計した型・インターフェースに従う
- src/game/assets/data/ の JSON を読み込んでエンティティを生成
- 既存コードのパターンに合わせる
```

### 3.2 🎨 pixel-artist（Sonnet メイン）

**`.claude/agents/pixel-artist.md`**
```markdown
---
name: pixel-artist
description: ドット絵スプライトの生成。キャラクター、敵、ボス、タイル、アイテム、エフェクト。
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

あなたは「メカローグ」のピクセルアートアーティストです。

## スプライト生成方式
Node.js の sharp ライブラリでプログラム生成:
```bash
npm install sharp
```

手順:
1. Buffer に RGBA ピクセルデータを書き込む
2. sharp で PNG に変換して public/sprites/ に保存
3. スプライトシートのメタデータ JSON を同時生成

## 仕様
- タイルサイズ: 32×32px
- ボス: 64×64px
- カラーパレット: キャラクターごと最大16色
- 背景透過 PNG

## コミカルな動きの指針
- 移動: 2〜4フレーム（上下バウンド）
- 攻撃: 3フレーム（大振り→ヒット→戻り）
- 被ダメ: 2フレーム（のけぞり＋目が×）
- アイドル: 2フレーム（揺れ/瞬き）
- ボス登場: 4フレーム（ドカーン演出）
- 撃破: 3フレーム（回転して消滅）

## 生成スクリプトの場所
- scripts/generate-sprites.ts（生成スクリプト本体）
- 実行: npx ts-node scripts/generate-sprites.ts

## 出力先
- public/sprites/{entity-name}.png
- src/game/assets/data/sprites.json

## Windows 注意
- sharp は Windows ネイティブでも動作する
- パスは path.join() を使用
```

### 3.3 🎵 sound-designer（Opus/Sonnet 切り替え）

**`.claude/agents/sound-designer-opus.md`**
```markdown
---
name: sound-designer-opus
description: オーディオシステム設計とBGM作曲。Tone.jsアーキテクチャ、メロディ・コード進行の創作。
tools: Read, Write, Edit, Bash, Glob, Grep
model: opus
---

あなたは「メカローグ」のサウンドディレクターです。
音楽理論に基づいた作曲とオーディオアーキテクチャを担当します。

## Opus が必要なタスク
1. オーディオシステム全体の設計（Tone.js の AudioContext管理、状態遷移）
2. BGM 9曲のメロディ・コード進行の作曲
   - 各楽曲のキー、テンポ、コード進行を決定
   - メロディライン（音符配列）を作成
   - 4チャンネル: メロディ(square) + ハーモニー(triangle) + ベース(sawtooth) + ドラム(noise)
3. 楽曲間のフェード遷移設計

## 楽曲リスト
1. タイトル画面 - C major, 120BPM, 明るく冒険的
2. 通常フロア探索 - G major, 130BPM, 軽快
3. 戦闘 - E minor, 150BPM, 緊張感
4. ボス戦 - D minor, 140BPM, 重厚
5. ショップ - F major, 100BPM, のんびり
6. スタート地点 - C major, 90BPM, 穏やか
7. ゲームオーバー - A minor, 80BPM, 4小節ジングル
8. ボス撃破 - C major, 160BPM, 8小節ファンファーレ
9. 深層フロア - B minor, 110BPM, ダーク

## 出力
- src/game/systems/audio.ts（オーディオエンジン）
- src/game/assets/data/bgm-tracks.json（楽曲データ）

## 法的注意
- 既存楽曲のメロディを絶対にコピーしない
- 全てオリジナル作曲
```

**`.claude/agents/sound-designer-sonnet.md`**
```markdown
---
name: sound-designer-sonnet
description: SE実装とBGMのコード化。設計済みの楽譜データの実装、効果音パラメータ調整。
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

あなたは「メカローグ」のサウンド実装担当です。
sound-designer-opus が設計した仕様に従って実装します。

## Sonnet で実行するタスク
- BGM 楽曲データの Tone.js コード化（JSON → 再生コード）
- SE（効果音）の Tone.js 実装（パラメータ調整）
- フェードイン・フェードアウト処理
- ミュート・音量制御UI連携

## SE リスト
攻撃系: 近接ヒット, 遠距離発射, 爆発, ミサイル
被弾系: ダメージ, 撃破, マシン破壊
取得系: アイテム, お金, 武器, レベルアップ
移動系: 階段, 落とし穴, ワープ
UI系: カーソル, 決定, キャンセル
回復系: HP回復, 状態異常回復, バリア

## 出力
- src/game/assets/data/se-definitions.json
- src/game/systems/audio.ts への SE 再生関数追加
```

### 3.4 ⚖️ balance-designer（Sonnet メイン）

**`.claude/agents/balance-designer.md`**
```markdown
---
name: balance-designer
description: ゲームデータJSONの作成と数値バランス調整。
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

あなたは「メカローグ」のバランスデザイナーです。
docs/design/game-design.md の仕様に基づいてデータファイルを作成します。

## 担当
- src/game/assets/data/enemies.json
- src/game/assets/data/bosses.json
- src/game/assets/data/weapons.json
- src/game/assets/data/tools-equipment.json
- src/game/assets/data/items.json
- src/game/assets/data/shop-prices.json
- src/game/assets/data/drop-tables.json
- src/game/assets/data/scaling.json
- src/game/assets/data/exp-table.json

## バランス基準
- 1〜5階: 撃破率5%以下
- 5階到達時: 最初の武器が買えるゴールド量
- 武器耐久: 1フロア持続
- 全クリ想定: 10〜20時間（2026-03-20 改訂: マップ拡大・EXPテーブル再調整済み）
```

### 3.5 🐛 qa-tester（Opus/Sonnet 切り替え）

**`.claude/agents/qa-tester-opus.md`**
```markdown
---
name: qa-tester-opus
description: テスト戦略立案、P0テスト、バグ根本原因分析。
tools: Read, Write, Edit, Bash, Glob, Grep
model: opus
---

あなたは「メカローグ」のQAリードです。

## Opus が必要なタスク
- テスト戦略全体の立案
- P0テスト: 迷路の到達可能性、セーブ整合性、ターン順序
- バグの根本原因分析と修正提案
- 自動プレイシミュレーターの設計（tests/simulation/）
```

**`.claude/agents/qa-tester-sonnet.md`**
```markdown
---
name: qa-tester-sonnet
description: P1〜P3テストの記述、パフォーマンス計測。
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

あなたは「メカローグ」のQAエンジニアです。

## Sonnet で実行するタスク
- P1テスト: ダメージ計算、敵AI動作、ドロップ確率
- P2テスト: 視界計算、状態異常、ショップ金額
- P3テスト: UI表示、パフォーマンス
- テストの実行とレポート出力

## テスト実行
npx vitest run（ユニット・統合テスト）
```

---

## 4. VS Code ワークフロー

### 4.1 推奨レイアウト

```
┌──────────────────────────────────────────────────┐
│ VS Code                                          │
│ ┌──────────────┬───────────────┬───────────────┐ │
│ │ ファイル      │  エディタ      │ Claude Code   │ │
│ │ エクスプローラ │  (コード編集)  │ (サイドバー)   │ │
│ │              │               │               │ │
│ │ src/         │  maze.ts      │ > 迷路生成を   │ │
│ │  game/       │               │   実装して...  │ │
│ │   core/      │               │               │ │
│ │   entities/  │               │ [Opus 4.6]    │ │
│ │   systems/   │               │               │ │
│ │              │               │               │ │
│ ├──────────────┴───────────────┴───────────────┤ │
│ │ ターミナル (PowerShell)                        │ │
│ │ PS> npx vitest run                            │ │
│ │ PS> npm run dev                               │ │
│ └───────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 4.2 VS Code での操作チートシート

| 操作 | ショートカット | 説明 |
|------|-------------|------|
| Claude Code を開く | Spark アイコン（右上） | サイドバーに Claude が表示 |
| ファイルを Claude に渡す | `@ファイル名` | プロンプトで参照 |
| 選択コードを渡す | Alt+K | 選択中のコードを自動引用 |
| モデル切替 | `/model` | Opus ↔ Sonnet 切替 |
| ターミナル切替 | Ctrl+` | 統合ターミナル表示/非表示 |
| コマンドパレット | Ctrl+Shift+P | 全コマンド検索 |
| 新しい会話 | Ctrl+N（Claude パネル内） | 別タスク用の新セッション |

### 4.3 開発サイクル（日常ワークフロー）

```
1. VS Code を開く
   code C:\Users\{ユーザー名}\mecha-rogue

2. Claude Code サイドバーを開く（Spark アイコン）

3. 今日のタスクを指示
   例: 「@docs/design/game-design.md を参照して、
        game-core-sonnet サブエージェントで
        ショップの売買ロジックを実装してください」

4. Claude が実装 → diff が表示される → 確認して Accept/Reject

5. ターミナルでテスト実行
   PS> npx vitest run tests/unit/shop.test.ts

6. ブラウザで動作確認
   PS> npm run dev
   → http://localhost:3000 を開く

7. 問題あれば Claude に修正依頼
   「ショップで売却時に価格が0になるバグがあります。
    @src/game/systems/shop.ts を確認して修正してください」

8. 確認OK → コミット
   PS> git add -A
   PS> git commit -m "feat: ショップ売買ロジック実装"
```

### 4.4 複数エージェントの同時実行（VS Code 内）

VS Code では複数のターミナルタブを開けるので、以下のように並列作業可能:

```
ターミナル1: Claude Code メインセッション（Opus）
  → 設計・レビュー・統合

ターミナル2: dev サーバー
  PS> npm run dev

ターミナル3: テスト監視
  PS> npx vitest --watch

ターミナル4: スプライト生成（必要時）
  PS> npx ts-node scripts/generate-sprites.ts
```

Agent Teams を使う場合:
```
# メインの Claude Code セッションから
> エージェントチームを作成して、以下を並列実行:
> 1. ボスAI 3体分の実装（game-core）
> 2. そのボスのスプライト生成（pixel-artist）
> 3. ボス戦BGMの仕上げ（sound-designer）
```

VS Code 内で各エージェントの進捗が Spark パネルに表示されます。

---

## 5. フェーズ別実行計画（モデル明示版）

### フェーズ1: 基盤構築（2〜3日）

```
実行方式: Subagents（順次）
コスト: 低

Step 1: game-core-opus
  → 迷路生成アルゴリズム + ターンシステム設計
  
Step 2: pixel-artist (Sonnet)
  → 基本タイル: 壁、通路、階段、プレイヤー、敵（3種）
  
Step 3: ui-designer-opus（初回のみ Opus）
  → Canvas描画エンジン + 入力システム設計
  
Step 4: ui-designer-sonnet
  → HUD実装（HPバー、ミニマップ、ログ）
  
Step 5: qa-tester-sonnet
  → P0テスト（迷路到達可能性、移動、基本戦闘）
  
Step 6: ローカルで動作確認
  PS> npm run dev → ブラウザで操作テスト
```

### フェーズ2: 戦闘・アイテム（3〜5日）

```
実行方式: Subagents（一部並列）
コスト: 低〜中

並列A (Sonnet):
├─ balance-designer → 武器・敵・アイテム JSON 作成
├─ pixel-artist → 敵スプライト全種 + 武器アイコン
└─ sound-designer-sonnet → SE 全種実装

並列B (Opus):
├─ game-core-opus → 戦闘ダメージ計算エンジン
└─ sound-designer-opus → オーディオシステム設計 + BGM 3曲作曲

順次 (Sonnet):
└─ game-core-sonnet → アイテム使用、武器装備、耐久度処理

最後 (Sonnet):
└─ qa-tester-sonnet → P1テスト（戦闘、武器、アイテム）
```

### フェーズ3: 経済・強化システム（3〜5日）

```
実行方式: Agent Teams (Opus) + Subagents (Sonnet) ハイブリッド

事前準備 - Subagents (Sonnet):
├─ balance-designer → ショップ価格、ドロップテーブル、EXP テーブル
└─ pixel-artist → ショップ、倉庫、UIアイコン素材

Agent Teams (Opus) - 3並列:
├─ game-core: ショップ・倉庫・マシン強化の設計と実装
├─ ui-designer: インベントリ・ショップ・倉庫のUI実装
└─ sound-designer: 残り BGM 6曲の作曲

仕上げ - Subagents (Sonnet):
├─ game-core-sonnet → レベルアップ、スキルツリー適用
└─ qa-tester-sonnet → ショップ・倉庫テスト
```

### フェーズ4: ボス・コンテンツ（5〜7日）

```
実行方式: Agent Teams (Opus)

Agent Teams - 4並列:
├─ game-core-opus: ボスAI 13体の固有ロジック実装
├─ pixel-artist (Sonnet扱い): ボススプライト13体 + 演出
├─ sound-designer-sonnet: ボス登場ジングル、BGM遷移
└─ qa-tester-opus: ボス戦個別テスト + シミュレーション検証

追加 - Subagent (Opus):
└─ balance-designer シミュレーション → 結果分析・調整提案
```

### フェーズ5: 品質仕上げ + デプロイ（2〜3日）

```
実行方式: Subagents (Sonnet 中心)

qa-tester-opus → 全体統合テスト、エッジケース発見
qa-tester-sonnet → クロスブラウザチェックリスト実行
pixel-artist (Sonnet) → タイトル画面、ゲームオーバー画面
sound-designer-sonnet → BGM遷移の仕上げ
ui-designer-sonnet → スマホ操作の最終調整

最後:
├─ git tag v1.0.0
├─ vercel --prod（本番デプロイ）
└─ docs/legal/licenses.md（ライセンス表記最終確認）
```

---

## 6. Vercel デプロイ（Windows から）

### 6.1 Vercel CLI セットアップ

```powershell
# Vercel CLI インストール
npm install -g vercel

# ログイン（ブラウザが開く）
vercel login

# プロジェクトディレクトリで
cd C:\Users\{ユーザー名}\mecha-rogue

# プロジェクトをリンク
vercel link
# → 対話形式で設定（Framework: Next.js を選択）

# プレビューデプロイ（テスト用）
vercel

# 本番デプロイ
vercel --prod
```

### 6.2 GitHub 連携による自動デプロイ（推奨）

```powershell
# GitHub リポジトリを作成して push
git remote add origin https://github.com/{あなたのID}/mecha-rogue.git
git push -u origin main
```

Vercel ダッシュボード (vercel.com) で:
1. 「New Project」→ GitHub リポジトリを選択
2. Framework: Next.js（自動検出される）
3. 「Deploy」

以降、`git push` するだけで自動デプロイ。

---

## 7. コスト比較（モデル使い分けの効果）

### 全て Opus の場合 vs ハイブリッド

| 項目 | 全 Opus | ハイブリッド | 節約率 |
|------|---------|------------|--------|
| フェーズ1 | 200K tokens | 120K tokens | 40% |
| フェーズ2 | 800K tokens | 350K tokens | 56% |
| フェーズ3 | 2M tokens | 900K tokens | 55% |
| フェーズ4 | 1.5M tokens | 800K tokens | 47% |
| フェーズ5 | 500K tokens | 200K tokens | 60% |
| **合計** | **5M tokens** | **2.37M tokens** | **53%** |

Max プラン ($200/月) で十分1ヶ月以内に完了見込み。

---

## 付録A: トラブルシューティング（Windows 固有）

| 問題 | 原因 | 対処法 |
|------|------|--------|
| `claude` コマンドが見つからない | PATH未設定 | `npm config get prefix` でパスを確認し環境変数に追加 |
| sharp インストールエラー | ネイティブモジュール | `npm install --platform=win32 sharp` |
| ファイルパスエラー | バックスラッシュ | コード内で `path.join()` を使用 |
| PowerShell 実行ポリシー | スクリプト制限 | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| 改行コードの差異 | CRLF/LF 混在 | `.gitattributes` に `* text=auto eol=lf` |
| ポート3000が使用中 | 他プロセス | `netstat -ano | findstr :3000` で確認 |
| Canvas描画がぼやける | DPIスケーリング | `canvas.width = canvas.clientWidth * devicePixelRatio` |
| Tone.js 音が出ない | AudioContext 制限 | ユーザークリック内で `Tone.start()` を呼ぶ |
| Agent Teams が有効にならない | 環境変数未設定 | PowerShell を再起動、`$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` を確認 |
| VS Code 拡張が消える | 既知の問題 | Ctrl+Shift+P → 「Claude Code: Open in Sidebar」 |

## 付録B: 便利な PowerShell エイリアス

`$PROFILE` ファイルに追加（`notepad $PROFILE` で編集）:

```powershell
# プロジェクトへ移動
function mecha { cd $HOME\mecha-rogue }

# 開発サーバー起動
function dev { npm run dev }

# テスト実行
function test-game { npx vitest run }

# テスト監視モード
function test-watch { npx vitest --watch }

# スプライト再生成
function gen-sprites { npx ts-node scripts/generate-sprites.ts }

# Vercel プレビューデプロイ
function deploy-preview { vercel }

# Vercel 本番デプロイ
function deploy-prod { vercel --prod }
```

---

**このドキュメントに従って、Windows + VS Code 環境で
Opus / Sonnet を使い分けながら効率的に開発を進めてください。**
