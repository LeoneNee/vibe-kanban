import { describe, it, expect } from 'vitest';
import { groupStoriesByStatus } from '../../components/stories/storyKanbanUtils';

describe('Brainstorm task filtering', () => {
  const makeStory = (id: string, title: string, status: string) => ({
    id,
    title,
    status,
    task_type: 'story' as const,
  });

  it('filters out brainstorm tasks from story kanban', () => {
    const stories = [
      makeStory('1', 'User Authentication', 'todo'),
      makeStory('2', '📋 Brainstorm: Feature Planning', 'todo'),
      makeStory('3', 'Payment Integration', 'inprogress'),
    ];

    const columns = groupStoriesByStatus(stories as any, { excludeBrainstorm: true });

    const allStories = [
      ...columns.backlog,
      ...columns.inprogress,
      ...columns.done,
      ...columns.cancelled,
    ];

    expect(allStories.map((s: any) => s.id)).not.toContain('2');
    expect(allStories).toHaveLength(2);
  });

  it('identifies brainstorm tasks by title prefix', () => {
    const brainstormStory = makeStory('1', '📋 Brainstorm: Something', 'todo');
    const normalStory = makeStory('2', 'Normal Story', 'todo');

    const columns = groupStoriesByStatus(
      [brainstormStory, normalStory] as any,
      { excludeBrainstorm: true }
    );

    expect(columns.backlog).toHaveLength(1);
    expect(columns.backlog[0].id).toBe('2');
  });

  it('includes all stories when excludeBrainstorm is false', () => {
    const stories = [
      makeStory('1', '📋 Brainstorm: Planning', 'todo'),
      makeStory('2', 'Normal Story', 'todo'),
    ];

    const columns = groupStoriesByStatus(stories as any);

    expect(columns.backlog).toHaveLength(2);
  });
});
