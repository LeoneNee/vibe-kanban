import type { BrainstormCard } from './extractJsonCards';

/**
 * Check if all brainstorm cards have tasks generated.
 * Returns true only if every card has at least one task.
 */
export function hasAllTasksGenerated(cards: BrainstormCard[]): boolean {
  if (cards.length === 0) {
    return false;
  }

  return cards.every((card) => card.tasks && card.tasks.length > 0);
}
