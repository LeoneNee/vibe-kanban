import type { CreateTask } from 'shared/types';
import type { BrainstormCard } from './extractJsonCards';

export function buildStoryTask(
  projectId: string,
  card: BrainstormCard
): CreateTask {
  const sections: string[] = [];

  // Add description
  if (card.description?.trim()) {
    sections.push(card.description.trim());
  }

  // Note: Tasks are now created as separate task cards, not as checklists

  // Add metadata
  const details: string[] = [];
  if (card.priority) details.push(`Priority: ${card.priority}`);
  if (card.complexity) details.push(`Complexity: ${card.complexity}`);
  if (card.notes) details.push(`Notes: ${card.notes}`);

  if (details.length > 0) {
    sections.push(`---\n${details.join(' | ')}`);
  }

  return {
    project_id: projectId,
    title: card.title,
    description: sections.join('\n\n') || null,
    status: null,
    task_type: 'story',
    parent_workspace_id: null,
    parent_task_id: null,
    image_ids: null,
    tag: undefined,
  };
}
