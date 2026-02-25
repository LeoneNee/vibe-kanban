import { describe, it, expect } from 'vitest';
import { groupStoriesByStatus } from '../storyKanbanUtils';

describe('groupStoriesByStatus', () => {
  const makeStory = (id: string, status: string) => ({
    id,
    title: `Story ${id}`,
    status,
    task_type: 'story' as const,
  });

  it('cancelled stories go into cancelled column, not backlog', () => {
    const stories = [
      makeStory('1', 'todo'),
      makeStory('2', 'cancelled'),
      makeStory('3', 'done'),
    ];

    const columns = groupStoriesByStatus(stories as any);

    expect(columns.backlog.map((s: any) => s.id)).toEqual(['1']);
    expect(columns.cancelled.map((s: any) => s.id)).toEqual(['2']);
    expect(columns.done.map((s: any) => s.id)).toEqual(['3']);
  });

  it('backlog column does not contain cancelled stories', () => {
    const stories = [
      makeStory('1', 'cancelled'),
      makeStory('2', 'cancelled'),
    ];

    const columns = groupStoriesByStatus(stories as any);

    expect(columns.backlog).toEqual([]);
    expect(columns.cancelled).toHaveLength(2);
  });

  it('inreview stories go into inprogress column', () => {
    const stories = [
      makeStory('1', 'inreview'),
    ];

    const columns = groupStoriesByStatus(stories as any);

    expect(columns.inprogress).toHaveLength(1);
  });
});
