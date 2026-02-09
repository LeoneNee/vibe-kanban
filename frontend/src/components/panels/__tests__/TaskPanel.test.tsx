import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TaskPanel from '../TaskPanel';
import * as useNavigateHook from '@/hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TaskWithAttemptStatus } from 'shared/types';

vi.mock('@/hooks', async () => {
  const actual = await vi.importActual('@/hooks');
  return {
    ...actual,
    useNavigateWithSearch: vi.fn(),
  };
});

vi.mock('@/contexts/ProjectContext', () => ({
  useProject: () => ({ projectId: 'proj-123' }),
}));

vi.mock('@/components/ConfigProvider', () => ({
  useUserSystem: () => ({ config: { beta_workspaces: false } }),
}));

vi.mock('@/hooks/useTaskWorkflow', () => ({
  useTaskWorkflow: () => ({ progress: 0, nextAction: null }),
}));

vi.mock('@/hooks/useTaskAttempts', () => ({
  useTaskAttemptsWithSessions: () => ({
    data: [
      {
        id: 'attempt-1',
        task_id: 'task-123',
        branch: 'feature/test',
        created_at: new Date().toISOString(),
        session: { executor: 'claude' },
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useTaskAttempt', () => ({
  useTaskAttemptWithSession: () => ({ data: null, isLoading: false }),
}));

describe('TaskPanel - Story Context Navigation', () => {
  const mockNavigate = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigateHook.useNavigateWithSearch).mockReturnValue(mockNavigate);
  });

  const renderTaskPanel = (task: TaskWithAttemptStatus) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TaskPanel task={task} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('navigates to story-contextual attempt path when task has parent_task_id', async () => {
    const user = userEvent.setup();
    const taskWithStory: TaskWithAttemptStatus = {
      id: 'task-123',
      project_id: 'proj-123',
      title: 'Test Task',
      description: 'Description',
      status: 'todo',
      task_type: 'task',
      parent_task_id: 'story-456', // This is the story context
      parent_workspace_id: null,
      workflow_state: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_in_progress_attempt: false,
      last_attempt_failed: false,
      executor: '',
    };

    renderTaskPanel(taskWithStory);

    // Wait for attempt to be rendered
    await waitFor(() => {
      expect(screen.getByText('feature/test')).toBeInTheDocument();
    });

    // Click on the attempt row
    const attemptRow = screen.getByText('feature/test').closest('tr');
    await user.click(attemptRow!);

    // Should navigate with story context preserved
    expect(mockNavigate).toHaveBeenCalledWith(
      '/projects/proj-123/stories/story-456/tasks/task-123/attempts/attempt-1'
    );
  });

  it('navigates to regular attempt path when task has no parent_task_id', async () => {
    const user = userEvent.setup();
    const taskWithoutStory: TaskWithAttemptStatus = {
      id: 'task-123',
      project_id: 'proj-123',
      title: 'Test Task',
      description: 'Description',
      status: 'todo',
      task_type: 'task',
      parent_task_id: null, // No story context
      parent_workspace_id: null,
      workflow_state: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_in_progress_attempt: false,
      last_attempt_failed: false,
      executor: '',
    };

    renderTaskPanel(taskWithoutStory);

    await waitFor(() => {
      expect(screen.getByText('feature/test')).toBeInTheDocument();
    });

    const attemptRow = screen.getByText('feature/test').closest('tr');
    await user.click(attemptRow!);

    // Should navigate without story context
    expect(mockNavigate).toHaveBeenCalledWith(
      '/projects/proj-123/tasks/task-123/attempts/attempt-1'
    );
  });
});
