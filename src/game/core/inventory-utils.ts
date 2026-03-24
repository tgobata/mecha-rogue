import type { InventoryItem } from './game-state';
import itemsRaw from '../assets/data/items.json';
import toolsRaw from '../assets/data/tools-equipment.json';

const ALL_ITEMS = [...(itemsRaw as any[]), ...(toolsRaw as any[])];

/**
 * 渡されたアイテムリストを sortKey に基づいてソートし、
 * 元のインデックス（originalIndex）を保持したオブジェクトの配列を返す。
 * 未鑑定アイテムは常にリストの最後に配置される。
 */
export function getSortedItems(
  items: InventoryItem[],
  sortKey: 'default' | 'name' | 'category'
): { item: InventoryItem; originalIndex: number }[] {
  const indexed = items.map((item, originalIndex) => ({ item, originalIndex }));

  if (sortKey === 'name') {
    return [...indexed].sort((a, b) => {
      if (a.item.unidentified && b.item.unidentified) return 0;
      if (a.item.unidentified) return 1;
      if (b.item.unidentified) return -1;
      const nameA = ALL_ITEMS.find((d) => d.id === a.item.itemId)?.name ?? a.item.itemId;
      const nameB = ALL_ITEMS.find((d) => d.id === b.item.itemId)?.name ?? b.item.itemId;
      return nameA.localeCompare(nameB, 'ja');
    });
  } else if (sortKey === 'category') {
    return [...indexed].sort((a, b) => {
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
  }
  return indexed;
}
