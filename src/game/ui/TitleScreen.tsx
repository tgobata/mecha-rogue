import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  playSE,
  playBGM,
  initAudio,
  isAudioReady,
  unlockAudioContext,
  setMuted,
  getMuted,
} from "../systems/audio";
import { getAllSaves, deleteSave, SaveSummary } from "../core/save-system";
import HelpManualOverlay from "./HelpManualOverlay";

interface TitleScreenProps {
  onNewGame: () => void;
  onLoadGame: (slot: number) => void;
  onAchievements: () => void;
}

type MenuMode = "main" | "load" | "delete";

const TitleScreen: React.FC<TitleScreenProps> = ({
  onNewGame,
  onLoadGame,
  onAchievements,
}) => {
  const [menuMode, setMenuMode] = useState<MenuMode>("main");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saves, setSaves] = useState<(SaveSummary | null)[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [deleteConfirmSlot, setDeleteConfirmSlot] = useState<number | null>(null);
  const [showFullSavesNotice, setShowFullSavesNotice] = useState(false);
  const [isMuted, setIsMuted] = useState(() => getMuted());

  // メニューモードが切り替わるか、コンポーネントがマウントされた時にセーブデータを取得する
  useEffect(() => {
    setSaves(getAllSaves());
    setSelectedIndex(0); // リセット
    setIsMounted(true);
  }, [menuMode]);

  // マウント時に BGM の自動再生を試みる（autoplay policy で失敗した場合はユーザー操作時にリトライ）
  useEffect(() => {
    const tryAutoplay = async () => {
      try {
        if (!isAudioReady()) return; // ユーザー操作前は何もしない
        audioStartedRef.current = true;
        playBGM("title");
      } catch { /* ignore */ }
    };
    tryAutoplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAction = useCallback(() => {
    playSE("ui_select");

    if (menuMode === "main") {
      if (selectedIndex === 0) {
        const activeSavesCount = saves.filter((s) => s !== null).length;
        if (isMounted && activeSavesCount >= 5) {
          setShowFullSavesNotice(true);
          return;
        }
        onNewGame();
      } else if (selectedIndex === 1) {
        setMenuMode("load");
      } else if (selectedIndex === 2) {
        setMenuMode("delete");
      } else if (selectedIndex === 3) {
        setShowManual(true);
      } else if (selectedIndex === 4) {
        onAchievements();
      }
    } else if (menuMode === "load") {
      if (selectedIndex === 5) {
        setMenuMode("main");
      } else {
        const slot = selectedIndex + 1;
        if (saves[selectedIndex]) {
          onLoadGame(slot);
        } else {
          playSE("ui_cancel");
        }
      }
    } else if (menuMode === "delete") {
      if (selectedIndex === 5) {
        setMenuMode("main");
      } else {
        const slot = selectedIndex + 1;
        if (saves[selectedIndex]) {
          setDeleteConfirmSlot(slot);
        } else {
          playSE("ui_cancel");
        }
      }
    }
  }, [menuMode, selectedIndex, onNewGame, onLoadGame, onAchievements, saves]);

  // ブラウザの autoplay ポリシー対応: ユーザー操作後に音声を初期化して BGM を再生する
  const audioStartedRef = useRef(false);
  const ensureAudioAndBGM = useCallback(async () => {
    if (audioStartedRef.current) return;
    audioStartedRef.current = true;
    try {
      if (!isAudioReady()) {
        await initAudio();
      }
      playBGM("title");
    } catch {
      // 初期化に失敗した場合は次のユーザー操作でリトライできるようフラグをリセット
      audioStartedRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 最初のキー操作で audio を初期化して BGM を再生（autoplay policy 対応）
      ensureAudioAndBGM();

      // H キーでマニュアルを開閉
      if (e.key === "h" || e.key === "H") {
        setShowManual((prev) => !prev);
        return;
      }
      // マニュアル表示中は他のキー操作を受け付けない
      if (showManual) return;

      const maxIndex = menuMode === "main" ? 4 : 5; // main = 0-4 (5 items), load/delete = 5 (slots 1-5 + back)

      if (e.key === "ArrowUp" || e.key === "w") {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
        playSE("ui_select");
      } else if (e.key === "ArrowDown" || e.key === "s") {
        setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
        playSE("ui_select");
      } else if (e.key === "Enter" || e.key === " ") {
        handleAction();
      } else if (e.key === "Escape") {
        if (menuMode !== "main") {
          playSE("ui_cancel");
          setMenuMode("main");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuMode, handleAction, showManual]);

  // 描画ヘルパー
  const renderMainMenu = () => {
    const activeSavesCount = saves.filter((s) => s !== null).length;
    const hasSaves = !isMounted || activeSavesCount > 0;

    const items = [
      { label: "はじめから", enabled: true },
      { label: "つづきから", enabled: hasSaves },
      { label: "データ削除", enabled: hasSaves },
      { label: "マニュアル確認", enabled: true },
      { label: "実績", enabled: true },
    ];

    return (
      <>
        <div className="text-center text-[10px] text-cyan-400 font-bold tracking-widest animate-bounce mb-1 pointer-events-none">
          PRESS START
        </div>
        {items.map((item, idx) => (
      <button
        key={`main-${idx}`}
        style={{ touchAction: "manipulation" }}
        className={`py-2 px-4 border-2 font-bold transition-all ${
          selectedIndex === idx && item.enabled
            ? "bg-cyan-900 border-cyan-400 text-cyan-100 scale-110 shadow-[0_0_20px_rgba(0,220,220,0.5)] z-20 relative"
            : "bg-gray-950 border-gray-700 text-gray-400 opacity-60 z-10"
        } ${!item.enabled ? "opacity-30 cursor-not-allowed" : ""}`}
        onClick={(e) => {
          unlockAudioContext();
          ensureAudioAndBGM();
          if (!item.enabled) {
            playSE("ui_cancel");
            return;
          }
          setSelectedIndex(idx);
          playSE("ui_select");
          if (idx === 0) {
            const activeSavesCount = saves.filter((s) => s !== null).length;
            if (isMounted && activeSavesCount >= 5) {
              setShowFullSavesNotice(true);
              return;
            }
            onNewGame();
          }
          else if (idx === 1 && item.enabled) setMenuMode("load");
          else if (idx === 2 && item.enabled) setMenuMode("delete");
          else if (idx === 3) setShowManual(true);
          else if (idx === 4) onAchievements();
        }}
        onTouchStart={unlockAudioContext}
        onMouseEnter={() => { if (item.enabled) setSelectedIndex(idx); }}
      >
        {selectedIndex === idx && item.enabled ? "▶ " : ""}
        {item.label}
      </button>
        ))}
      </>
    );
  };

  const renderSlotMenu = () => {
    return (
      <div className="flex flex-col gap-1 w-72">
        <h2 className="text-base font-bold text-center text-blue-300 mb-1 font-mono drop-shadow-md">
          {menuMode === "load"
            ? "--- セーブデータ選択 ---"
            : "--- セーブデータ削除 ---"}
        </h2>

        {Array.from({ length: 5 }).map((_, idx) => {
          const save = saves[idx];
          const isSelected = selectedIndex === idx;
          const slotLabel = `スロット ${idx + 1}`;

          return (
            <button
              key={`slot-${idx}`}
              style={{ touchAction: "manipulation" }}
              className={`flex flex-col py-2 px-4 border-2 font-bold transition-all relative overflow-hidden ${
                isSelected
                  ? menuMode === "delete"
                    ? "bg-red-900 border-red-400 text-white scale-105 shadow-[0_0_15px_rgba(220,38,38,0.7)] z-20"
                    : "bg-cyan-900 border-cyan-400 text-white scale-105 shadow-[0_0_20px_rgba(0,220,220,0.6)] z-20"
                  : "bg-gray-950 border-gray-700 text-gray-500 opacity-70 z-10"
              }`}
              onClick={(e) => {
                unlockAudioContext();
                ensureAudioAndBGM();
                setSelectedIndex(idx);
                if (menuMode === "load" && save) {
                  playSE("ui_select");
                  onLoadGame(idx + 1);
                } else if (menuMode === "delete" && save) {
                  setDeleteConfirmSlot(idx + 1);
                } else {
                  playSE("ui_cancel");
                }
              }}
              onTouchStart={unlockAudioContext}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="flex justify-between items-center w-full mb-1">
                <span className={`text-sm tracking-tighter ${isSelected ? "text-blue-200" : "text-gray-400"}`}>
                  {isSelected ? "▶ " : ""}{slotLabel}
                </span>
                <span className={`text-[10px] font-mono ${save ? (isSelected ? "text-blue-300" : "text-gray-500") : "text-transparent"}`}>
                  {save ? new Date(save.savedAt).toLocaleString("ja-JP", {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                  }) : "---"}
                </span>
              </div>

              {save ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full text-left">
                  <div className="flex justify-between items-baseline border-b border-gray-800 pb-0.5">
                    <span className="text-[9px] opacity-60">LV</span>
                    <span className={`text-sm ${isSelected ? "text-white" : "text-gray-300"}`}>{save.level}</span>
                  </div>
                  <div className="flex justify-between items-baseline border-b border-gray-800 pb-0.5">
                    <span className="text-[9px] opacity-60">FLOOR</span>
                    <span className={`text-sm ${isSelected ? "text-white" : "text-gray-300"}`}>B{save.floor}F</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] opacity-60">HP</span>
                    <span className={`text-xs ${isSelected ? "text-green-300" : "text-green-600"}`}>{save.hp}/{save.maxHp}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] opacity-60">GOLD</span>
                    <span className={`text-xs ${isSelected ? "text-yellow-300" : "text-yellow-600"}`}>{save.gold}G</span>
                  </div>
                  <div className="col-span-2 mt-1 pt-1 border-t border-gray-800 flex items-center gap-2">
                    <span className="text-[9px] opacity-60 italic">EQUIP:</span>
                    <span className={`text-[10px] truncate ${isSelected ? "text-blue-200" : "text-gray-500"}`}>
                      {save.weaponName || "---"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-12 w-full text-gray-700 italic text-sm tracking-widest bg-black/20 rounded">
                  データなし
                </div>
              )}
            </button>
          );
        })}

        <button
          key="back"
          style={{ touchAction: "manipulation" }}
          className={`mt-2 py-2 border-2 font-bold transition-all ${
            selectedIndex === 5
              ? "bg-gray-700 border-gray-400 text-white shadow-[0_0_10px_rgba(156,163,175,0.4)] z-20 relative"
              : "bg-gray-950 border-gray-700 text-gray-500 opacity-60 z-10"
          }`}
          onClick={(e) => {
            unlockAudioContext();
            ensureAudioAndBGM();
            playSE("ui_cancel");
            setMenuMode("main");
          }}
          onTouchStart={unlockAudioContext}
          onMouseEnter={() => setSelectedIndex(5)}
        >
          {selectedIndex === 5 ? "▶ " : ""}もどる
        </button>
      </div>
    );
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden font-mono"
      style={{
        backgroundColor: "#101733",
        backgroundImage: [
          "linear-gradient(rgba(30,70,150,0.09) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(30,70,150,0.09) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "32px 32px",
      }}
      onClick={ensureAudioAndBGM}
      onTouchStart={unlockAudioContext}
    >
      {/* 背景画像 (添付のタイトルアートワーク) */}
      <img
        src="/title_bg.png"
        alt=""
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        style={{ objectFit: "contain", objectPosition: "center", zIndex: 0 }}
        draggable={false}
      />
      {/* ===== 背景画像と同じ領域を占めるオーバーレイ（object-fit:contain に合わせた位置合わせ用）===== */}
      {/* 画像サイズ 1101×890 のアスペクト比を保ちつつ、コンテナに収まる最大サイズを算出 */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
      >
        <div
          className="relative pointer-events-none"
          style={{
            width: "min(100%, calc(100vh * 1101 / 890))",
            aspectRatio: "1101 / 890",
          }}
        >
          {/* サウンドボタン（背景画像の右上） */}
          <button
            className="absolute top-3 right-3 flex flex-col items-center gap-0.5 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              const next = !getMuted();
              setMuted(next);
              setIsMuted(next);
            }}
            onTouchStart={(e) => { unlockAudioContext(); e.stopPropagation(); }}
            title={isMuted ? "サウンドON" : "サウンドOFF"}
            style={{
              background: isMuted ? "rgba(30,30,50,0.85)" : "rgba(20,40,80,0.85)",
              border: `2px solid ${isMuted ? "#555577" : "#4488cc"}`,
              borderRadius: 8,
              cursor: "pointer",
              padding: "6px 10px",
              boxShadow: isMuted ? "none" : "0 0 12px rgba(68,170,255,0.4)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{isMuted ? "🔇" : "🔊"}</span>
            <span style={{ fontSize: 9, color: isMuted ? "#888" : "#88ccff", letterSpacing: 1 }}>
              {isMuted ? "OFF" : "ON"}
            </span>
          </button>
        </div>
      </div>

      {/* ===== メニュー (背景画像の中央下部に重ねる) ===== */}
      <div
        className="absolute left-1/2 flex flex-col items-center gap-2 z-10"
        style={{ bottom: "16%", transform: "translateX(-50%)" }}
      >
        {menuMode === "main" ? (
          <div className="flex flex-col gap-2 w-56">{renderMainMenu()}</div>
        ) : (
          renderSlotMenu()
        )}
      </div>

      {/* バージョン・コピーライト（フッター） */}
      <div
        className="absolute bottom-3 left-1/2 text-[10px] text-gray-400 font-bold tracking-widest pointer-events-none z-10"
        style={{ transform: "translateX(-50%)", whiteSpace: "nowrap" }}
      >
        © 2026 o77bata / VER 0.2.{process.env.NEXT_PUBLIC_BUILD_VERSION ?? '0000.00.00.00.00.00'}
      </div>

      {/* マニュアルオーバーレイ */}
      {showManual && (
        <HelpManualOverlay onClose={() => setShowManual(false)} />
      )}

      {/* セーブデータ満杯通知ダイアログ */}
      {showFullSavesNotice && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
        >
          <div
            className="flex flex-col items-center gap-5 p-7 rounded-lg border-2 border-yellow-500 font-mono"
            style={{ backgroundColor: 'rgba(20, 15, 5, 0.98)', maxWidth: 320 }}
          >
            <div className="text-yellow-400 text-base font-bold tracking-wide">⚠ セーブデータが満杯です</div>
            <div className="text-gray-200 text-sm text-center leading-relaxed">
              セーブスロットが5つすべて<br />埋まっています。<br /><br />
              <span className="text-yellow-300 font-bold">「データ削除」</span>で1つ以上の<br />
              セーブデータを削除してから、<br />
              <span className="text-blue-300 font-bold">「はじめから」</span>をお試しください。
            </div>
            <div className="flex gap-4">
              <button
                className="px-4 py-2 bg-yellow-800 border border-yellow-500 text-white rounded font-bold hover:bg-yellow-600 transition-colors"
                style={{ touchAction: 'manipulation' }}
                onClick={() => {
                  playSE("ui_select");
                  setShowFullSavesNotice(false);
                  setMenuMode("delete");
                }}
                onTouchStart={unlockAudioContext}
              >
                データ削除へ
              </button>
              <button
                className="px-4 py-2 bg-gray-700 border border-gray-500 text-gray-200 rounded font-bold hover:bg-gray-500 transition-colors"
                style={{ touchAction: 'manipulation' }}
                onClick={() => {
                  playSE("ui_cancel");
                  setShowFullSavesNotice(false);
                }}
                onTouchStart={unlockAudioContext}
              >
                もどる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* セーブデータ削除確認ダイアログ */}
      {deleteConfirmSlot !== null && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <div
            className="flex flex-col items-center gap-6 p-8 rounded-lg border-2 border-red-500 font-mono"
            style={{ backgroundColor: 'rgba(30, 10, 10, 0.98)', minWidth: 280 }}
          >
            <div className="text-red-400 text-base font-bold tracking-wide">⚠ セーブデータ削除</div>
            <div className="text-gray-200 text-sm text-center">
              スロット {deleteConfirmSlot} のデータを<br />本当に削除しますか？
            </div>
            <div className="flex gap-4">
              <button
                className="px-6 py-2 bg-red-800 border border-red-500 text-white rounded font-bold hover:bg-red-600 transition-colors"
                style={{ touchAction: 'manipulation' }}
                onClick={() => {
                  deleteSave(deleteConfirmSlot);
                  setSaves(getAllSaves());
                  playSE("enemy_death");
                  setDeleteConfirmSlot(null);
                }}
                onTouchStart={unlockAudioContext}
              >
                削除する
              </button>
              <button
                className="px-6 py-2 bg-gray-700 border border-gray-500 text-gray-200 rounded font-bold hover:bg-gray-500 transition-colors"
                style={{ touchAction: 'manipulation' }}
                onClick={() => {
                  playSE("ui_cancel");
                  setDeleteConfirmSlot(null);
                }}
                onTouchStart={unlockAudioContext}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TitleScreen;
