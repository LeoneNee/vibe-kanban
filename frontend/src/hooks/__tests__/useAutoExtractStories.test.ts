import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { BrainstormCard } from '@/utils/extractJsonCards';

// --- Mocks ---

const mockCreate = vi.fn();
const mockWriteDoc = vi.fn();
const mockGitCommit = vi.fn();

vi.mock('@/lib/api', () => ({
  tasksApi: {
    create: (...args: unknown[]) => mockCreate(...args),
    writeDoc: (...args: unknown[]) => mockWriteDoc(...args),
  },
  projectsApi: {
    gitCommit: (...args: unknown[]) => mockGitCommit(...args),
  },
}));

vi.mock('@/utils/buildStoryTask', () => ({
  buildStoryTask: (projectId: string, card: BrainstormCard) => ({
    project_id: projectId,
    title: card.title,
    description: card.description || null,
    status: null,
    task_type: 'story' as const,
    parent_workspace_id: null,
    parent_task_id: null,
    image_ids: null,
  }),
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeCard(title: string, taskCount = 1): BrainstormCard {
  return {
    title,
    description: `${title} description`,
    doc_content: `# ${title}\n## Description\nContent`,
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      title: `Task ${i + 1}`,
    })),
  };
}

// --- Tests ---

describe('useAutoExtractStories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCreate.mockResolvedValue({ id: 'story-1', title: 'Story' });
    mockWriteDoc.mockResolvedValue(undefined);
    mockGitCommit.mockResolvedValue({ committed: true });
  });

  it('should remain idle when isComplete is false', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const cards = [makeCard('Story 1')];
    const { result } = renderHook(
      () => useAutoExtractStories(cards, 'proj-1', false),
      { wrapper: createWrapper() }
    );

    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(result.current.status).toBe('idle');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should remain idle when projectId is undefined', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const cards = [makeCard('Story 1')];
    const { result } = renderHook(
      () => useAutoExtractStories(cards, undefined, true),
      { wrapper: createWrapper() }
    );

    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(result.current.status).toBe('idle');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should remain idle when cards are empty', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const { result } = renderHook(
      () => useAutoExtractStories([], 'proj-1', true),
      { wrapper: createWrapper() }
    );

    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(result.current.status).toBe('idle');
  });

  it('should auto-extract and reach done status when isComplete is true', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const cards = [makeCard('Story 1', 2)];

    let callCount = 0;
    mockCreate.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        id: `task-${callCount}`,
        title: callCount === 1 ? 'Story 1' : `Task ${callCount}`,
      });
    });

    const { result } = renderHook(
      () => useAutoExtractStories(cards, 'proj-1', true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });

    // Verify story creation
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj-1',
        title: 'Story 1',
        task_type: 'story',
      })
    );

    // Verify doc write
    expect(mockWriteDoc).toHaveBeenCalledWith(
      'task-1',
      expect.stringContaining('# Story 1')
    );

    // Verify child tasks (2 tasks)
    expect(mockCreate).toHaveBeenCalledTimes(3); // 1 story + 2 child tasks

    // Verify git commit
    expect(mockGitCommit).toHaveBeenCalledWith(
      'proj-1',
      expect.stringContaining('docs: add 1 stories from brainstorm')
    );

    expect(result.current.storiesCreated).toBe(1);
    expect(result.current.tasksCreated).toBe(2);
  });

  it('should not trigger extraction twice', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const cards = [makeCard('Story 1')];

    const { result, rerender } = renderHook(
      () => useAutoExtractStories(cards, 'proj-1', true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });

    const createCallCount = mockCreate.mock.calls.length;

    rerender();
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect(mockCreate.mock.calls.length).toBe(createCallCount);
  });

  it('should set error status on partial story failure', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const cards = [makeCard('Story 1'), makeCard('Story 2')];

    let callIdx = 0;
    mockCreate.mockImplementation(() => {
      callIdx++;
      if (callIdx === 2) return Promise.reject(new Error('Create failed'));
      return Promise.resolve({
        id: `task-${callIdx}`,
        title: `Story ${callIdx}`,
      });
    });

    const { result } = renderHook(
      () => useAutoExtractStories(cards, 'proj-1', true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toContain('1 stories failed');
  });

  it('should set error status when child tasks fail', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const cards = [makeCard('Story 1', 3)];

    let callIdx = 0;
    mockCreate.mockImplementation(() => {
      callIdx++;
      // First call = story creation (success)
      if (callIdx === 1) {
        return Promise.resolve({ id: 'story-1', title: 'Story 1' });
      }
      // Second child task fails
      if (callIdx === 3) {
        return Promise.reject(new Error('Child task create failed'));
      }
      return Promise.resolve({
        id: `task-${callIdx}`,
        title: `Task ${callIdx}`,
      });
    });

    const { result } = renderHook(
      () => useAutoExtractStories(cards, 'proj-1', true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toContain('1 tasks failed');
    expect(result.current.storiesCreated).toBe(1);
    expect(result.current.tasksCreated).toBe(2);
  });

  it('should still reach done even if git commit fails', async () => {
    const { useAutoExtractStories } = await import('../useAutoExtractStories');
    const cards = [makeCard('Story 1')];
    mockGitCommit.mockRejectedValue(new Error('Git failed'));

    const { result } = renderHook(
      () => useAutoExtractStories(cards, 'proj-1', true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });

    expect(mockGitCommit).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
});
