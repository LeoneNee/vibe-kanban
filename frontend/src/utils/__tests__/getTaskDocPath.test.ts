import { describe, it, expect } from 'vitest';
import { getTaskDocPath, slugify } from '../getTaskDocPath';
import type { Task } from 'shared/types';

describe('slugify', () => {
  it('converts to lowercase and replaces spaces with dashes', () => {
    expect(slugify('User Authentication')).toBe('user-authentication');
  });

  it('handles special characters', () => {
    expect(slugify('Fix: Bug #123 [URGENT]')).toBe('fix-bug-123-urgent');
  });

  it('removes multiple consecutive dashes', () => {
    expect(slugify('A   B---C')).toBe('a-b-c');
  });

  it('removes non-alphanumeric characters', () => {
    expect(slugify('Hello@World\!')).toBe('hello-world');
  });
});

describe('getTaskDocPath', () => {
  const mockTask = (id: string, title: string, taskType: 'story' | 'task'): Task => ({
    id,
    project_id: 'proj-123',
    title,
    description: null,
    status: 'todo',
    task_type: taskType,
    parent_workspace_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it('returns correct path for Story', () => {
    const story = mockTask('story-123', 'User Authentication', 'story');
    const path = getTaskDocPath(story);
    expect(path).toBe('docs/stories/story-123-user-authentication/README.md');
  });

  it('returns correct path for Task with parent Story', () => {
    const story = mockTask('story-123', 'User Authentication', 'story');
    const task = mockTask('task-456', 'Login API', 'task');
    const path = getTaskDocPath(task, story);
    expect(path).toBe('docs/stories/story-123-user-authentication/task-456-login-api.md');
  });

  it('throws error for Task without parent Story', () => {
    const task = mockTask('task-456', 'Login API', 'task');
    expect(() => getTaskDocPath(task)).toThrow('Task requires parent story');
  });
});
