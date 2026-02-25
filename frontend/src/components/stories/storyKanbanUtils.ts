import type { Task } from 'shared/types';

export type StoryKanbanColumns = Record<
  'backlog' | 'inprogress' | 'done' | 'cancelled',
  Task[]
>;

export interface GroupOptions {
  excludeBrainstorm?: boolean;
}

const BRAINSTORM_PREFIX = '📋 Brainstorm:';

export function groupStoriesByStatus(
  stories: Task[],
  options: GroupOptions = {}
): StoryKanbanColumns {
  const filtered = options.excludeBrainstorm
    ? stories.filter((s) => !s.title.startsWith(BRAINSTORM_PREFIX))
    : stories;

  const columns: StoryKanbanColumns = {
    backlog: [],
    inprogress: [],
    done: [],
    cancelled: [],
  };

  for (const story of filtered) {
    switch (story.status) {
      case 'inprogress':
      case 'inreview':
        columns.inprogress.push(story);
        break;
      case 'done':
        columns.done.push(story);
        break;
      case 'cancelled':
        columns.cancelled.push(story);
        break;
      default: // 'todo' and others
        columns.backlog.push(story);
        break;
    }
  }

  return columns;
}
