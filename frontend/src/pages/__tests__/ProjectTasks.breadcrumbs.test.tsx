import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectTasks } from '../ProjectTasks';

vi.mock('@/contexts/ProjectContext', () => ({
  useProject: () => ({
    projectId: 'proj-123',
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/contexts/SearchContext', () => ({
  useSearch: () => ({ query: '', focusInput: vi.fn() }),
}));

vi.mock('@/hooks/useProjectTasks', () => ({
  useProjectTasks: () => ({
    tasks: [],
    tasksById: {},
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useStoryTasks', () => ({
  useStoryTasks: () => ({
    tasks: [
      {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
        parent_task_id: 'story-456',
      },
    ],
    tasksById: {
      'task-123': {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
        parent_task_id: 'story-456',
      },
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useTask', () => ({
  useTask: (taskId: string) => {
    if (taskId === 'story-456') {
      return {
        data: {
          id: 'story-456',
          title: 'User Authentication Story',
          task_type: 'story',
        },
        isLoading: false,
      };
    }
    return { data: null, isLoading: false };
  },
}));

vi.mock('@/lib/api', () => ({
  tasksApi: {
    getById: vi.fn().mockResolvedValue({
      id: 'story-456',
      title: 'User Authentication Story',
      task_type: 'story',
    }),
  },
}));

describe('ProjectTasks - Breadcrumb Navigation', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const renderWithRouter = (initialPath: string) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="/projects/:projectId/stories/:storyId/tasks/:taskId"
              element={<ProjectTasks />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('displays story name in breadcrumb when viewing task under story', async () => {
    renderWithRouter('/projects/proj-123/stories/story-456/tasks/task-123');

    await waitFor(() => {
      expect(screen.getByText('User Authentication Story')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Task')).toBeInTheDocument();

    // Verify breadcrumb structure: Story > Task
    const breadcrumbItems = screen.getAllByRole('listitem');
    expect(breadcrumbItems.length).toBeGreaterThanOrEqual(2);
  });

  it('story name link navigates back to story tasks', async () => {
    renderWithRouter('/projects/proj-123/stories/story-456/tasks/task-123');

    await waitFor(() => {
      expect(screen.getByText('User Authentication Story')).toBeInTheDocument();
    });

    const storyLink = screen.getByText('User Authentication Story');
    expect(storyLink.closest('a')).toHaveAttribute(
      'href',
      '/projects/proj-123/stories/story-456/tasks'
    );
  });
});
