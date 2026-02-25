import type { BrainstormCard } from './extractJsonCards';

/**
 * Check if the brainstorm is fully complete:
 * - All cards have doc_content (story-doc-generator has run)
 * - All cards have tasks (task-splitter has run)
 */
export function isBrainstormFullyComplete(
  cards: BrainstormCard[]
): boolean {
  if (cards.length === 0) {
    return false;
  }

  return cards.every(
    (card) =>
      card.doc_content &&
      card.doc_content.trim().length > 0 &&
      card.tasks &&
      card.tasks.length > 0
  );
}
