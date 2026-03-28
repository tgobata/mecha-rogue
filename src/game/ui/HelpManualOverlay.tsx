'use client';

/**
 * @fileoverview ゲーム内マニュアルオーバーレイ
 * プレイヤー向けのわかりやすいゲーム説明を表示する。
 */

import { useState } from 'react';

interface HelpManualOverlayProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// スタイル定数
// ---------------------------------------------------------------------------

const OVERLAY_BG = 'rgba(10, 10, 26, 0.96)';
const OVERLAY_BORDER = '1px solid #445566';
const SECTION_TITLE_COLOR = '#88ccff';
const TEXT_COLOR = '#ccddee';
const MUTED_COLOR = '#8899aa';
const ACCENT_COLOR = '#ffdd88';
const KEY_BG = 'rgba(40, 60, 90, 0.8)';
const KEY_BORDER = '1px solid #5577aa';
const HIGHLIGHT_BG = 'rgba(34, 60, 90, 0.5)';

// ---------------------------------------------------------------------------
// タブ定義
// ---------------------------------------------------------------------------

type TabId = 'basic' | 'combat' | 'save' | 'skill' | 'items' | 'tips';

const TABS: { id: TabId; label: string }[] = [
  { id: 'basic', label: '基本操作' },
  { id: 'combat', label: '戦闘' },
  { id: 'save', label: 'セーブ' },
  { id: 'skill', label: 'スキル' },
  { id: 'items', label: 'アイテム' },
  { id: 'tips', label: 'ヒント' },
];

// ---------------------------------------------------------------------------
// 補助コンポーネント
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: SECTION_TITLE_COLOR,
      fontWeight: 'bold',
      fontSize: 13,
      marginTop: 12,
      marginBottom: 6,
      borderBottom: '1px solid #334455',
      paddingBottom: 4,
    }}>
      {children}
    </div>
  );
}

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      backgroundColor: KEY_BG,
      border: KEY_BORDER,
      borderRadius: 4,
      padding: '1px 6px',
      fontSize: 11,
      color: ACCENT_COLOR,
      fontFamily: 'monospace',
      verticalAlign: 'middle',
    }}>
      {children}
    </span>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      padding: '3px 0',
      borderBottom: '1px solid rgba(68,85,102,0.3)',
      fontSize: 12,
      color: TEXT_COLOR,
    }}>
      <div style={{ flex: 1, color: MUTED_COLOR }}>{label}</div>
      <div style={{ flex: 2 }}>{value}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: HIGHLIGHT_BG,
      border: '1px solid #335566',
      borderRadius: 6,
      padding: '6px 10px',
      fontSize: 11,
      color: '#aaccdd',
      marginTop: 6,
      lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// タブコンテンツ
// ---------------------------------------------------------------------------

function TabBasic() {
  return (
    <div>
      <SectionTitle>PC（キーボード）操作</SectionTitle>
      <Row label="移動" value={<><KeyBadge>W</KeyBadge> <KeyBadge>A</KeyBadge> <KeyBadge>S</KeyBadge> <KeyBadge>D</KeyBadge> または 矢印キー</>} />
      <Row label="攻撃" value={<><KeyBadge>Z</KeyBadge> または <KeyBadge>X</KeyBadge></>} />
      <Row label="待機（1ターン）" value={<KeyBadge>Space</KeyBadge>} />
      <Row label="向きだけ変える" value={<><KeyBadge>Ctrl</KeyBadge> + 方向キー（ターン消費なし）</>} />
      <Row label="アイテム一覧" value={<KeyBadge>I</KeyBadge>} />
      <Row label="装備一覧" value={<KeyBadge>E</KeyBadge>} />
      <Row label="ステータス" value={<KeyBadge>C</KeyBadge>} />
      <Row label="ヘルプを開く" value={<KeyBadge>H</KeyBadge>} />
      <Row label="メニューを閉じる" value={<KeyBadge>Esc</KeyBadge>} />
      <Row label="ポーズ" value={<><KeyBadge>Esc</KeyBadge>（メニューが閉じているとき）</>} />

      <SectionTitle>スマホ（仮想コントローラー）操作</SectionTitle>
      <Row label="移動" value="Dpad（十字ボタン）" />
      <Row label="攻撃" value="赤い「攻」ボタン" />
      <Row label="待機" value="青い「待」ボタン" />
      <Row label="向きだけ変える" value={<>Dpad中央の「<span style={{ color: '#88ccff' }}>向</span>」ボタンをタップして向きモードにしてから方向ボタン</>} />
      <Row label="アイテム" value="「アイ」ボタン" />
      <Row label="装備" value="「装備」ボタン" />
      <Row label="ステータス" value="「能力」ボタン" />
      <Row label="ヘルプ" value="「？」ボタン" />

      <Note>
        スマホでDpad中央の「<span style={{ color: '#88ccff' }}>向</span>」ボタンが
        <span style={{ color: ACCENT_COLOR }}>青く光っている</span>ときは向きモードです。
        方向ボタンで移動せず、向きだけ変わります。もう一度タップで移動モードに戻ります。
      </Note>
    </div>
  );
}

function TabCombat() {
  return (
    <div>
      <SectionTitle>攻撃の方法</SectionTitle>
      <Note>
        敵に<span style={{ color: ACCENT_COLOR }}>隣接した状態</span>で攻撃ボタンを押すと、
        向いている方向の敵を攻撃します。
        まず向きを敵の方向に合わせてから攻撃しましょう。
      </Note>

      <SectionTitle>向きだけ変える方法</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8, marginBottom: 8 }}>
        移動せずに向きだけ変えたいときは：
      </div>
      <Row label="PC" value={<><KeyBadge>Ctrl</KeyBadge> + 方向キー（ターン消費なし）</>} />
      <Row label="スマホ" value="Dpad中央「向」をタップ → 向きモード → 方向ボタン" />
      <Note>
        向きモードはターンを消費せず、向きだけを変えます。
        敵に背を向けないように立ち回りましょう。
      </Note>

      <SectionTitle>ターン制システム</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8 }}>
        このゲームはターン制です。プレイヤーが1回行動するたびに敵も1回行動します。
        焦らず作戦を考えながら進みましょう。
      </div>

      <SectionTitle>武器と耐久値</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8 }}>
        武器には耐久値があり、使うたびに減っていきます。
        耐久値が0になると壊れて使えなくなります。
        拠点や修理スポット（<span style={{ color: ACCENT_COLOR }}>W</span>タイル）で修理できます。
      </div>

      <SectionTitle>特殊タイル</SectionTitle>
      <Row label=">（階段）" value="次の階層へ進む" />
      <Row label="P（ショップ）" value="アイテム・武器の売買" />
      <Row label="R（休憩所）" value="HPを回復する" />
      <Row label="W（修理）" value="武器を修理する" />
      <Row label="H（ヒント）" value="ゲームのヒントを表示" />
    </div>
  );
}

function TabSave() {
  return (
    <div>
      <SectionTitle>セーブ方法</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8 }}>
        <div style={{ marginBottom: 8 }}>
          ゲームのセーブは以下のタイミングで<span style={{ color: ACCENT_COLOR }}>自動的に</span>行われます。
          手動でセーブボタンを押す必要はありません。
        </div>
      </div>

      <SectionTitle>オートセーブのタイミング</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          '階段を下りて新しい階層に入ったとき',
          '拠点（ベース）に戻ったとき',
          '「セーブして終了」を選んだとき',
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 8,
            fontSize: 12,
            color: TEXT_COLOR,
            padding: '4px 0',
            borderBottom: '1px solid rgba(68,85,102,0.3)',
          }}>
            <span style={{ color: '#44cc88', flexShrink: 0 }}>✓</span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <Note>
        セーブデータはブラウザのローカルストレージに保存されます。
        ブラウザのデータを削除するとセーブデータも消えます。
      </Note>

      <SectionTitle>セーブスロット</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8 }}>
        複数のセーブスロットがあり、タイトル画面から選択できます。
        異なるスロットで別のキャラクターを育てることができます。
      </div>

      <SectionTitle>セーブして終了する方法</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Row label="PC" value={<><KeyBadge>Esc</KeyBadge> → 「セーブして終了」</>} />
        <Row label="スマホ" value="ポーズ → 「セーブして終了」" />
      </div>
      <Note>
        「セーブして終了」を選ぶと現在の状態を保存してタイトル画面に戻ります。
        次回ロードすれば同じ場所から再開できます。
      </Note>

      <SectionTitle>拠点へ帰還（リタイア）</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8 }}>
        ダンジョンの途中でも拠点に帰還できます。ただし、
        <span style={{ color: '#ff8866' }}>現在のダンジョンの進行状況は失われます。</span>
        集めたアイテムや経験値は持ち帰れます。
      </div>
    </div>
  );
}

function TabSkill() {
  return (
    <div>
      <SectionTitle>スキルとは</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8 }}>
        スキルはレベルアップ時に習得できる特殊能力です。
        <span style={{ color: ACCENT_COLOR }}>アクティブスキル</span>（自分で発動）と
        <span style={{ color: '#88dd88' }}>パッシブスキル</span>（常時効果）の2種類があります。
      </div>

      <SectionTitle>スキルの習得方法</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8, marginBottom: 8 }}>
        特定のレベルに達すると、スキル選択画面が表示されます。
        表示された候補からひとつを選んで習得しましょう。
      </div>

      <SectionTitle>アクティブスキル一覧</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          backgroundColor: HIGHLIGHT_BG,
          border: '1px solid #445566',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
        }}>
          <div style={{ color: ACCENT_COLOR, fontWeight: 'bold', marginBottom: 2 }}>パワーストライク（Lv3〜）</div>
          <div style={{ color: TEXT_COLOR }}>ATKの2倍ダメージの強力な一撃。クールダウン5ターン。</div>
        </div>
        <div style={{
          backgroundColor: HIGHLIGHT_BG,
          border: '1px solid #445566',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
        }}>
          <div style={{ color: ACCENT_COLOR, fontWeight: 'bold', marginBottom: 2 }}>バリア（Lv2〜）</div>
          <div style={{ color: TEXT_COLOR }}>1ターンの間DEFを大幅に上昇させる防御スキル。クールダウン4ターン。</div>
        </div>
        <div style={{
          backgroundColor: HIGHLIGHT_BG,
          border: '1px solid #445566',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
        }}>
          <div style={{ color: ACCENT_COLOR, fontWeight: 'bold', marginBottom: 2 }}>オーバーチャージ（Lv5〜）</div>
          <div style={{ color: TEXT_COLOR }}>前方3マスを一気に攻撃する範囲攻撃。クールダウン6ターン。</div>
        </div>
      </div>

      <SectionTitle>パッシブスキル一覧</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { name: 'リジェネ（Lv4〜）', desc: '毎ターン自動でHPが1回復する。' },
          { name: 'タフネス（Lv6〜）', desc: '受けるダメージを軽減する。' },
          { name: 'スカベンジャー（Lv8〜）', desc: 'アイテムのドロップ率が+20%上昇する。' },
        ].map((sk, i) => (
          <div key={i} style={{
            backgroundColor: 'rgba(20,50,30,0.4)',
            border: '1px solid #335544',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}>
            <div style={{ color: '#88dd88', fontWeight: 'bold', marginBottom: 2 }}>{sk.name}</div>
            <div style={{ color: TEXT_COLOR }}>{sk.desc}</div>
          </div>
        ))}
      </div>

      <SectionTitle>アクティブスキルの使い方</SectionTitle>
      <Row label="PC" value="ステータス画面（C）からスキルを選択" />
      <Row label="スマホ" value="画面下部のスキルボタン列" />
      <Note>
        スキルが使えるときはボタンが青く光ります。
        クールダウン中（<span style={{ color: '#ff9944' }}>CD:X</span>）はあと何ターンで使えるか表示されます。
      </Note>
    </div>
  );
}

function TabItems() {
  return (
    <div>
      <SectionTitle>アイテムの使い方</SectionTitle>
      <Row label="PC" value={<><KeyBadge>I</KeyBadge> でアイテム一覧 → 選択 → <KeyBadge>Enter</KeyBadge> または <KeyBadge>Z</KeyBadge></>} />
      <Row label="スマホ" value="「アイ」ボタン → アイテムをタップ → 「使用」" />

      <SectionTitle>装備の付け替え</SectionTitle>
      <Row label="PC" value={<><KeyBadge>E</KeyBadge> で装備一覧 → 選択</>} />
      <Row label="スマホ" value="「装備」ボタン → 武器をタップして装備" />
      <Note>
        装備可能な武器スロット数はメカ（機体）によって異なります。
        強い武器が手に入ったらすぐ装備しましょう。
      </Note>

      <SectionTitle>アイテムの種類</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { name: '回復アイテム', desc: 'HPを回復する。ピンチのときに使おう。' },
          { name: 'エネルギー補給', desc: 'エネルギー武器に使うエネルギーを補充する。' },
          { name: '識別スコープ', desc: '未識別のアイテムを鑑定する。未識別アイテムは使う前に鑑定しよう。' },
          { name: '強化パーツ', desc: '武器や機体を強化する。' },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 8,
            fontSize: 12,
            color: TEXT_COLOR,
            padding: '4px 0',
            borderBottom: '1px solid rgba(68,85,102,0.3)',
          }}>
            <span style={{ color: ACCENT_COLOR, flexShrink: 0 }}>■</span>
            <div>
              <span style={{ color: ACCENT_COLOR }}>{item.name}：</span>
              {item.desc}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>ショップ（Pタイル）</SectionTitle>
      <div style={{ fontSize: 12, color: TEXT_COLOR, lineHeight: 1.8 }}>
        フロアにある「P」タイルに乗ると商人のショップが開きます。
        ゴールドでアイテムや武器を購入したり、不要なものを売却できます。
      </div>
    </div>
  );
}

function TabTips() {
  return (
    <div>
      <SectionTitle>生き残るためのコツ</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          {
            title: '壁を背にして戦う',
            body: '複数の敵に囲まれないよう、壁を背にして戦うと挟み撃ちを防げます。',
          },
          {
            title: '向きを意識する',
            body: 'Ctrl+方向キー（PC）または向きモード（スマホ）で、ターンを消費せず向きを変えられます。敵に背を向けないようにしましょう。',
          },
          {
            title: '待機して回復',
            body: 'Spaceキー（待機）を押すとターンを消費します。リジェネスキルを持っていれば待機中にHPが自動回復します。',
          },
          {
            title: 'ミニマップを活用',
            body: '画面右上のミニマップで周囲の地形や敵の位置を確認できます。赤い点が敵です。',
          },
          {
            title: '不要アイテムは売る',
            body: 'ショップで不要なアイテムや武器を売るとゴールドになります。アイテムポーチがいっぱいになる前に整理しましょう。',
          },
          {
            title: 'ピンチになったら帰還',
            body: 'HPが危なくなってきたら無理せず拠点へ帰還しましょう。拠点では武器の修理や倉庫の整理ができます。',
          },
          {
            title: '機体（メカ）を選ぼう',
            body: '拠点では出撃する機体を変更できます。機体によって武器スロット数や初期パラメータが異なります。',
          },
        ].map((tip, i) => (
          <div key={i} style={{
            backgroundColor: HIGHLIGHT_BG,
            border: '1px solid #334455',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}>
            <div style={{ color: ACCENT_COLOR, fontWeight: 'bold', marginBottom: 2 }}>
              {i + 1}. {tip.title}
            </div>
            <div style={{ color: TEXT_COLOR, lineHeight: 1.6 }}>{tip.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export default function HelpManualOverlay({ onClose }: HelpManualOverlayProps) {
  const [activeTab, setActiveTab] = useState<TabId>('basic');

  const renderContent = () => {
    switch (activeTab) {
      case 'basic':   return <TabBasic />;
      case 'combat':  return <TabCombat />;
      case 'save':    return <TabSave />;
      case 'skill':   return <TabSkill />;
      case 'items':   return <TabItems />;
      case 'tips':    return <TabTips />;
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 25,
        pointerEvents: 'auto',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(380px, calc(100vw - 24px))',
          maxHeight: 'min(560px, calc(100vh - 80px))',
          background: OVERLAY_BG,
          border: OVERLAY_BORDER,
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'monospace',
          color: TEXT_COLOR,
          boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #334455',
          backgroundColor: 'rgba(20, 20, 45, 0.95)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 'bold', color: ACCENT_COLOR }}>
            ？ ゲームマニュアル
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: MUTED_COLOR,
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: '0 4px',
            }}
            aria-label="マニュアルを閉じる"
          >
            ×
          </button>
        </div>

        {/* タブバー */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          overflowX: 'auto',
          borderBottom: '1px solid #334455',
          backgroundColor: 'rgba(15, 15, 35, 0.9)',
          flexShrink: 0,
          scrollbarWidth: 'none',
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: '0 0 auto',
                padding: '7px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id
                  ? '2px solid #66aaff'
                  : '2px solid transparent',
                color: activeTab === tab.id ? '#88ccff' : MUTED_COLOR,
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                cursor: 'pointer',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        <div style={{
          overflowY: 'auto',
          padding: '10px 14px 16px',
          flex: 1,
        }}>
          {renderContent()}
        </div>

        {/* フッター */}
        <div style={{
          borderTop: '1px solid #334455',
          padding: '6px 14px',
          fontSize: 10,
          color: MUTED_COLOR,
          textAlign: 'center',
          flexShrink: 0,
          backgroundColor: 'rgba(15, 15, 35, 0.9)',
        }}>
          PC: <span style={{ color: '#aabbcc' }}>H キー</span> でいつでも開閉 ／
          スマホ: <span style={{ color: '#aabbcc' }}>「？」ボタン</span> でいつでも開閉
        </div>
      </div>
    </div>
  );
}
