import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  playSE,
  playBGM,
  initAudio,
  isAudioReady,
  unlockAudioContext,
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
        if (!isAudioReady()) {
          await initAudio();
        }
        audioStartedRef.current = true;
        playBGM("title");
      } catch {
        // ブラウザの autoplay policy で再生が blocked された場合は
        // ensureAudioAndBGM（最初のユーザー操作時）が再試行する
      }
    };
    tryAutoplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAction = useCallback(() => {
    playSE("ui_select");

    if (menuMode === "main") {
      if (selectedIndex === 0) {
        onNewGame();
      } else if (selectedIndex === 1) {
        setMenuMode("load");
      } else if (selectedIndex === 2) {
        setMenuMode("delete");
      } else if (selectedIndex === 3) {
        setShowManual(true);
      } else if (selectedIndex === 4) {
        // ACHIEVEMENTS は未実装のため無効
        playSE("ui_cancel");
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
          deleteSave(slot);
          setSaves(getAllSaves());
          playSE("enemy_death"); // カスタム削除音があればそれに変更
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

      const maxIndex = menuMode === "main" ? 4 : 5; // main = 0-4 (4 items + achievements disabled), load/delete = 5 (slots 1-5 + back)

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
      { label: "実績", enabled: false, comingSoon: true },
    ];

    return items.map((item, idx) => (
      <button
        key={`main-${idx}`}
        style={{ touchAction: "manipulation" }}
        className={`py-3 px-4 border-2 font-bold transition-all ${
          selectedIndex === idx && item.enabled
            ? "bg-blue-600 border-blue-300 text-white scale-110 shadow-[0_0_20px_rgba(59,130,246,0.5)] z-20 relative"
            : "bg-gray-900 border-gray-700 text-gray-500 opacity-60 z-10"
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
          if (idx === 0) onNewGame();
          else if (idx === 1 && item.enabled) setMenuMode("load");
          else if (idx === 2 && item.enabled) setMenuMode("delete");
          else if (idx === 3) setShowManual(true);
        }}
        onTouchStart={unlockAudioContext}
        onMouseEnter={() => { if (item.enabled) setSelectedIndex(idx); }}
      >
        {selectedIndex === idx && item.enabled ? "▶ " : ""}
        {item.label}
        {"comingSoon" in item && item.comingSoon && (
          <span style={{ fontSize: 9, color: "#666688", marginLeft: 6, fontWeight: "normal" }}>
            (COMING SOON)
          </span>
        )}
      </button>
    ));
  };

  const renderSlotMenu = () => {
    return (
      <div className="flex flex-col gap-2 w-72">
        <h2 className="text-xl font-bold text-center text-blue-300 mb-2 font-mono drop-shadow-md">
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
              className={`flex flex-col py-3 px-4 border-2 font-bold transition-all relative overflow-hidden ${
                isSelected
                  ? menuMode === "delete"
                    ? "bg-red-900 border-red-400 text-white scale-105 shadow-[0_0_15px_rgba(220,38,38,0.7)] z-20"
                    : "bg-blue-900 border-blue-400 text-white scale-105 shadow-[0_0_20px_rgba(59,130,246,0.6)] z-20"
                  : "bg-gray-900 border-gray-700 text-gray-500 opacity-70 z-10"
              }`}
              onClick={(e) => {
                unlockAudioContext();
                ensureAudioAndBGM();
                setSelectedIndex(idx);
                if (menuMode === "load" && save) {
                  playSE("ui_select");
                  onLoadGame(idx + 1);
                } else if (menuMode === "delete" && save) {
                  deleteSave(idx + 1);
                  setSaves(getAllSaves());
                  playSE("enemy_death");
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
          className={`mt-4 py-2 border-2 font-bold transition-all ${
            selectedIndex === 5
              ? "bg-gray-600 border-gray-300 text-white shadow-[0_0_10px_rgba(156,163,175,0.5)] z-20 relative"
              : "bg-gray-900 border-gray-700 text-gray-500 opacity-60 z-10"
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
      className="absolute inset-0 bg-gradient-to-br from-sky-300 via-blue-500 to-indigo-600 flex flex-col items-center justify-center overflow-hidden font-mono"
      onClick={ensureAudioAndBGM}
      onTouchStart={unlockAudioContext}
    >
      {/* 🌠 背景の星空演出 (Hydration エラー回避のためマウント後に表示) */}
      <div className="absolute inset-0 pointer-events-none">
        {isMounted &&
          [...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-white rounded-full animate-pulse"
              style={{
                width: Math.random() * 2 + 1 + "px",
                height: Math.random() * 2 + 1 + "px",
                top: Math.random() * 100 + "%",
                left: Math.random() * 100 + "%",
                animationDelay: Math.random() * 5 + "s",
                opacity: Math.random() * 0.7 + 0.3,
              }}
            />
          ))}
      </div>

      {/* 🤖 タイトルロゴ (生成したスプライト) */}
      <div className="relative mb-12 transform scale-125 z-10">
        <img
          src="/sprites/ui/title_logo.png"
          alt="MECHA ROGUE"
          style={{ imageRendering: "pixelated" }}
          className="drop-shadow-[0_0_15px_rgba(68,136,255,0.6)]"
        />
        {menuMode === "main" && (
          <div className="absolute -bottom-4 right-0 text-[10px] text-blue-400 font-bold tracking-widest animate-bounce">
            PRESS START
          </div>
        )}
      </div>

      {/* 🔘 メニュー */}
      <div className="flex flex-col gap-4 z-10">
        {menuMode === "main" ? (
          <div className="flex flex-col gap-4 w-56">{renderMainMenu()}</div>
        ) : (
          renderSlotMenu()
        )}
      </div>

      <div className="absolute bottom-4 text-[10px] text-gray-600 tracking-tighter">
        © 2026 o77bata / VER 0.1.{process.env.NEXT_PUBLIC_BUILD_VERSION ?? '0000.00.00.00.00.00'}
      </div>

      {/* マニュアルオーバーレイ */}
      {showManual && (
        <HelpManualOverlay onClose={() => setShowManual(false)} />
      )}
    </div>
  );
};

export default TitleScreen;
