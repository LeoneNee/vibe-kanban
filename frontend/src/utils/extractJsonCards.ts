import type { PatchTypeWithKey } from '@/hooks/useConversationHistory/types';

export type BrainstormTask = {
  title: string;
  description?: string;
  tag?: string;
};

export type BrainstormCard = {
  id?: string;
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  complexity?: number; // 1-5
  notes?: string;
  tasks?: BrainstormTask[];
  doc_content?: string;
};

function isValidBrainstormCard(obj: unknown): obj is BrainstormCard {
  if (!obj || typeof obj !== 'object') return false;
  const card = obj as Record<string, unknown>;
  return typeof card.title === 'string' && card.title.trim().length > 0;
}

export function extractJsonCardsFromEntries(
  entries: PatchTypeWithKey[]
): BrainstormCard[] {
  let lastValidCards: BrainstormCard[] = [];

  // 遍历所有条目，只保留最后一个有效的 JSON 卡片块
  entries.forEach((entry) => {
    if (entry.type !== 'NORMALIZED_ENTRY') return;
    if (entry.content.entry_type.type !== 'assistant_message') return;

    const content = entry.content.content;
    const jsonBlocks = content.match(/```json\s*\n([\s\S]*?)\n```/g) || [];

    jsonBlocks.forEach((block: string) => {
      try {
        const jsonStr = block
          .replace(/```json\s*\n/, '')
          .replace(/\n```$/, '');
        const parsed = JSON.parse(jsonStr);

        if (Array.isArray(parsed)) {
          const validCards = parsed.filter(isValidBrainstormCard);
          // 只有当解析出有效卡片时，才更新为最新版本
          if (validCards.length > 0) {
            lastValidCards = validCards;
          }
        }
      } catch (err) {
        console.warn('Failed to parse JSON block:', err);
      }
    });
  });

  return lastValidCards;
}
