@AGENTS.md

# メカローグ ー 機甲迷宮探索記

## プロジェクト概要
2Dローグライク迷路ゲーム。Next.js + TypeScript + Canvas2D。
Cloudflare にデプロイ。PC + スマホ対応。

## 開発環境
- OS: Windows 10/11
- エディタ: VS Code + Claude Code 拡張
- Node.js: v24.14.0
- シェル: PowerShell

## モデルルール
- 基本: 全て Sonnet 4.6 で実行
- Opus 切替: Sonnet で2回失敗した場合のみ /model で手動切替

## 技術スタック
- Next.js 14+ (App Router), TypeScript strict
- Canvas 2D（描画）, Tone.js（音声）, Tailwind CSS（UI）

## ファイル構造
- src/game/core/ ← コアロジック
- src/game/entities/ ← エンティティ
- src/game/systems/ ← 各種システム（audio, renderer, input等）
- src/game/ui/ ← React UIコンポーネント
- src/game/assets/data/ ← JSON データ
- public/sprites/ ← PNG スプライト
- tests/ ← テスト
- scripts/ ← ビルド・生成スクリプト

## コーディング規約
- TypeScript strict, JSDoc コメント
- ゲームデータは JSON 外部化
- パスは path.join() で組み立て（Windows互換）
- マジックナンバー禁止（constants.ts に定義）