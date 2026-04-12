import type { InventoryItem } from './game-state';
import itemsRaw from '../assets/data/items.json';
import toolsRaw from '../assets/data/tools-equipment.json';

const ALL_ITEMS = [...(itemsRaw as any[]), ...(toolsRaw as any[])];

/**
 * アイテムリスト内の同名（itemId + unidentified が同じ）エントリを集約する。
 * 複数スロットに分散した同種アイテムを1エントリにまとめて quantity を合算する。
 * originalIndex は最初に登場したエントリの index を使用する（use/drop 操作先として有効）。
 */
function mergeItems(
  indexed: { item: InventoryItem; originalIndex: number }[],
): { item: InventoryItem; originalIndex: number }[] {
  const merged: { item: InventoryItem; originalIndex: number }[] = [];
  for (const entry of indexed) {
    const existingIdx = merged.findIndex(
      (m) =>
        m.item.itemId === entry.item.itemId &&
        m.item.unidentified === entry.item.unidentified,
    );
    if (existingIdx >= 0) {
      merged[existingIdx] = {
        ...merged[existingIdx],
        item: {
          ...merged[existingIdx].item,
          quantity: merged[existingIdx].item.quantity + entry.item.quantity,
        },
      };
    } else {
      merged.push({ ...entry });
    }
  }
  return merged;
}

/**
 * 渡されたアイテムリストを sortKey に基づいてソートし、
 * 元のインデックス（originalIndex）を保持したオブジェクトの配列を返す。
 * 同名アイテムは1行に集約して quantity を合算する。
 * 未鑑定アイテムは常にリストの最後に配置される。
 */
export function getSortedItems(
  items: InventoryItem[],
  sortKey: 'default' | 'name' | 'category'
): { item: InventoryItem; originalIndex: number }[] {
  const indexed = items.map((item, originalIndex) => ({ item, originalIndex }));

  if (sortKey === 'name') {
    const sorted = [...indexed].sort((a, b) => {
      if (a.item.unidentified && b.item.unidentified) return 0;
      if (a.item.unidentified) return 1;
      if (b.item.unidentified) return -1;
      const nameA = ALL_ITEMS.find((d) => d.id === a.item.itemId)?.name ?? a.item.itemId;
      const nameB = ALL_ITEMS.find((d) => d.id === b.item.itemId)?.name ?? b.item.itemId;
      return nameA.localeCompare(nameB, 'ja');
    });
    return mergeItems(sorted);
  } else if (sortKey === 'category') {
    const sorted = [...indexed].sort((a, b) => {
      if (a.item.unidentified && b.item.unidentified) return 0;
      if (a.item.unidentified) return 1;
      if (b.item.unidentified) return -1;
      const catA = ALL_ITEMS.find((d) => d.id === a.item.itemId)?.category ?? '';
      const catB = ALL_ITEMS.find((d) => d.id === b.item.itemId)?.category ?? '';
      if (catA !== catB) return catA.localeCompare(catB, 'ja');
      const nameA = ALL_ITEMS.find((d) => d.id === a.item.itemId)?.name ?? a.item.itemId;
      const nameB = ALL_ITEMS.find((d) => d.id === b.item.itemId)?.name ?? b.item.itemId;
      return nameA.localeCompare(nameB, 'ja');
    });
    return mergeItems(sorted);
  }
  // default: 元順序のまま集約
  return mergeItems(indexed);
}
