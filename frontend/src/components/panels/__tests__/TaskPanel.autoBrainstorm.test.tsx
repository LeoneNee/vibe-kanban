import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskPanel from '../TaskPanel';
import type { TaskWithAttemptStatus } from 'shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks', () => ({
  useNavigateWithSearch: vi.fn(),
}));

vi.mock('@/contexts/ProjectContext', () => ({
  useProject: () => ({ projectId: 'proj-123' }),
}));

vi.mock('@/components/ConfigProvider', () => ({
  useUserSystem: () => ({ config: { beta_workspaces: false } }),
}));

vi.mock('@/hooks/useTaskWorkflow', () => ({
  useTaskWorkflow: (task: TaskWithAttemptStatus | null) => {
    if (!task?.description && task?.parent_task_id) {
      return {
        progress: 25,
        nextAction: 'brainstorm',
        actionLabel: 'Start Brainstorm',
      };
    }
    return { progress: 0, nextAction: null, actionLabel: null };
  },
}));

vi.mock('@/hooks/useTaskAttempts', () => ({
  useTaskAttemptsWithSessions: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useTaskAttempt', () => ({
  useTaskAttemptWithSession: () => ({ data: null, isLoading: false }),
}));

describe('TaskPanel - Auto-Brainstorm Navigation', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

  it('does NOT auto-navigate to brainstorm for new tasks', async () => {
    const navigate = vi.fn();
    const { useNavigateWithSearch } = await import('@/hooks');
    vi.mocked(useNavigateWithSearch).mockReturnValue(navigate);

    const newTask: TaskWithAttemptStatus = {
      id: 'task-123',
      project_id: 'proj-123',
      title: 'New Task',
      description: null, // No description
      status: 'todo',
      task_type: 'task',
      parent_task_id: 'story-456',
      parent_workspace_id: null,
      workflow_state: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_in_progress_attempt: false,
      last_attempt_failed: false,
      executor: '',
      tag: null,
    };

    renderTaskPanel(newTask);

    // Wait a bit to ensure no navigation happens
    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    }, { timeout: 1000 });

    expect(navigate).not.toHaveBeenCalledWith(
      expect.stringContaining('brainstorm')
    );
  });

  it('shows workflow action button for brainstorm instead of auto-navigating', async () => {
    const newTask: TaskWithAttemptStatus = {
      id: 'task-123',
      project_id: 'proj-123',
      title: 'New Task',
      description: null,
      status: 'todo',
      task_type: 'task',
      parent_task_id: 'story-456',
      parent_workspace_id: null,
      workflow_state: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_in_progress_attempt: false,
      last_attempt_failed: false,
      executor: '',
      tag: null,
    };

    renderTaskPanel(newTask);

    await waitFor(() => {
      expect(screen.getByText('下一步: Start Brainstorm')).toBeInTheDocument();
    });

    // Note: The workflow button for brainstorm will be added in implementation
    // This test verifies no auto-navigation occurs
  });
});
