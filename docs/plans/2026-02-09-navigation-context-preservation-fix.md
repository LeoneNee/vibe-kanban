# Navigation Context Preservation Fix - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix navigation context preservation issues to ensure Story context is maintained throughout task and attempt navigation flows.

**Architecture:** Add story context tracking to navigation functions, fix parent_task_id assignment in task creation, improve breadcrumb navigation, and make auto-brainstorm navigation opt-in rather than automatic.

**Tech Stack:** React Router, React Testing Library, Vitest, TypeScript

---

## Task 1: Fix TaskPanel Attempt Navigation Context

**Problem:** When clicking attempts in TaskPanel, the storyId context is lost, causing users to return to all-project tasks instead of the story's tasks.

**Files:**
- Modify: `frontend/src/components/panels/TaskPanel.tsx:226-234,253-259`
- Test: `frontend/src/components/panels/__tests__/TaskPanel.test.tsx` (create)

**Step 1: Write failing test for attempt navigation with story context**

Create: `frontend/src/components/panels/__tests__/TaskPanel.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test frontend/src/components/panels/__tests__/TaskPanel.test.tsx`
Expected: FAIL - Test should fail because current implementation doesn't preserve story context

**Step 3: Implement fix in TaskPanel**

Modify: `frontend/src/components/panels/TaskPanel.tsx`

```typescript
// Line 24-29, add storyId extraction
const TaskPanel = ({ task }: TaskPanelProps) => {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();
  const { config } = useUserSystem();
  const workflow = useTaskWorkflow(task);

  // Extract story context from task
  const storyId = task?.parent_task_id;

  // ... rest of the component

  // Line 226-234, fix parent attempt navigation
  onRowClick={(attempt) => {
    if (config?.beta_workspaces) {
      navigate(`/workspaces/${attempt.id}`);
    } else if (projectId) {
      const attemptPath = storyId
        ? paths.storyAttempt(projectId, storyId, attempt.task_id, attempt.id)
        : paths.attempt(projectId, attempt.task_id, attempt.id);
      navigate(attemptPath);
    }
  }}

  // Line 253-259, fix attempts list navigation
  onRowClick={(attempt) => {
    if (config?.beta_workspaces) {
      navigate(`/workspaces/${attempt.id}`);
    } else if (projectId && task.id) {
      const attemptPath = storyId
        ? paths.storyAttempt(projectId, storyId, task.id, attempt.id)
        : paths.attempt(projectId, task.id, attempt.id);
      navigate(attemptPath);
    }
  }}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test frontend/src/components/panels/__tests__/TaskPanel.test.tsx`
Expected: PASS - All tests should pass with story context preserved

**Step 5: Commit**

```bash
git add frontend/src/components/panels/TaskPanel.tsx frontend/src/components/panels/__tests__/TaskPanel.test.tsx
git commit -m "fix(navigation): preserve story context in TaskPanel attempt navigation

- Extract storyId from task.parent_task_id
- Use paths.storyAttempt when storyId exists
- Use paths.attempt when no storyId
- Add comprehensive tests for both scenarios

Fixes navigation issue where clicking attempts in story tasks
would lose story context and return to all-project tasks view."
```

---

## Task 2: Fix TaskFormDialog parent_task_id Assignment

**Problem:** TaskFormDialog sets parent_task_id to null but assigns parentTaskId to parent_workspace_id, breaking task-story relationships.

**Files:**
- Modify: `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx:194-208`
- Test: `frontend/src/components/dialogs/tasks/__tests__/TaskFormDialog.test.tsx` (create)

**Step 1: Write failing test for parent_task_id assignment**

Create: `frontend/src/components/dialogs/tasks/__tests__/TaskFormDialog.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NiceModal from '@ebay/nice-modal-react';
import { TaskFormDialog } from '../TaskFormDialog';
import * as tasksApi from '@/lib/api';

vi.mock('@/lib/api', () => ({
  tasksApi: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/components/ConfigProvider', () => ({
  useUserSystem: () => ({
    system: { config: { executor_profile: null } },
    profiles: {},
    loading: false,
  }),
}));

vi.mock('@/hooks/useProjectRepos', () => ({
  useProjectRepos: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useRepoBranchSelection', () => ({
  useRepoBranchSelection: () => ({
    configs: [],
    isLoading: false,
  }),
}));

describe('TaskFormDialog - Parent Task Assignment', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDialog = (props: any) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <NiceModal.Provider>
          <TaskFormDialog {...props} />
        </NiceModal.Provider>
      </QueryClientProvider>
    );
  };

  it('correctly assigns parent_task_id when creating task under story', async () => {
    const user = userEvent.setup();
    const mockCreate = vi.mocked(tasksApi.tasksApi.create);
    mockCreate.mockResolvedValue({
      id: 'new-task-123',
      project_id: 'proj-123',
      title: 'New Task',
      description: 'Description',
      status: 'todo',
      task_type: 'task',
      parent_task_id: 'story-456',
      parent_workspace_id: null,
      workflow_state: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await TaskFormDialog.show({
      mode: 'create',
      projectId: 'proj-123',
      taskType: 'task',
      parentTaskId: 'story-456',
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/title/i)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/title/i), 'New Task');

    const createButton = screen.getByRole('button', { name: /create/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_task_id: 'story-456',
          parent_workspace_id: null,
          task_type: 'task',
        })
      );
    });
  });

  it('correctly assigns parent_workspace_id when creating subtask', async () => {
    const user = userEvent.setup();
    const mockCreate = vi.mocked(tasksApi.tasksApi.create);
    mockCreate.mockResolvedValue({
      id: 'new-subtask-123',
      project_id: 'proj-123',
      title: 'New Subtask',
      description: 'Description',
      status: 'todo',
      task_type: 'task',
      parent_task_id: null,
      parent_workspace_id: 'workspace-789',
      workflow_state: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await TaskFormDialog.show({
      mode: 'subtask',
      projectId: 'proj-123',
      parentTaskAttemptId: 'workspace-789',
      initialBaseBranch: 'main',
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/title/i)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/title/i), 'New Subtask');

    const createButton = screen.getByRole('button', { name: /create/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_task_id: null,
          parent_workspace_id: 'workspace-789',
          task_type: 'task',
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test frontend/src/components/dialogs/tasks/__tests__/TaskFormDialog.test.tsx`
Expected: FAIL - Test should fail because parent_task_id is always null

**Step 3: Fix parent_task_id assignment**

Modify: `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx:194-208`

```typescript
const task: CreateTask = {
  project_id: projectId,
  title: value.title,
  description: value.description,
  status: null,
  task_type: (mode === 'create' && props.taskType) ? props.taskType : ('task' as TaskType),
  parent_workspace_id: mode === 'subtask' ? props.parentTaskAttemptId : null,
  parent_task_id: mode === 'create' && props.parentTaskId ? props.parentTaskId : null,
  image_ids: imageIds,
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test frontend/src/components/dialogs/tasks/__tests__/TaskFormDialog.test.tsx`
Expected: PASS - All tests should pass with correct parent assignments

**Step 5: Commit**

```bash
git add frontend/src/components/dialogs/tasks/TaskFormDialog.tsx frontend/src/components/dialogs/tasks/__tests__/TaskFormDialog.test.tsx
git commit -m "fix(tasks): correct parent_task_id assignment in TaskFormDialog

- Set parent_task_id from props.parentTaskId when creating tasks under stories
- Set parent_workspace_id only for subtasks (mode === 'subtask')
- Add comprehensive tests for parent assignment logic

Fixes task-story relationship where tasks created under stories
were not properly linked due to parent_task_id always being null."
```

---

## Task 3: Add Story Context to Breadcrumb Navigation

**Problem:** Breadcrumb navigation doesn't show story name when viewing tasks under a story.

**Files:**
- Modify: `frontend/src/pages/ProjectTasks.tsx:846-883`
- Test: `frontend/src/pages/__tests__/ProjectTasks.breadcrumbs.test.tsx` (create)

**Step 1: Write failing test for breadcrumb with story context**

Create: `frontend/src/pages/__tests__/ProjectTasks.breadcrumbs.test.tsx`

```typescript
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
    expect(breadcrumbItems).toHaveLength(2);
  });

  it('story name link navigates back to story tasks', async () => {
    const { container } = renderWithRouter(
      '/projects/proj-123/stories/story-456/tasks/task-123'
    );

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
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test frontend/src/pages/__tests__/ProjectTasks.breadcrumbs.test.tsx`
Expected: FAIL - Story name not displayed in breadcrumb

**Step 3: Add story fetching and breadcrumb logic**

Modify: `frontend/src/pages/ProjectTasks.tsx`

```typescript
// Add near top with other imports
import { useTask } from '@/hooks/useTask';

// Add after other hooks (around line 172)
const { data: parentStory } = useTask(storyId || '', {
  enabled: !!storyId,
});

// Modify rightHeader section (line 827-883)
const rightHeader = selectedTask ? (
  <NewCardHeader
    className="shrink-0"
    actions={
      isTaskView ? (
        <TaskPanelHeaderActions
          task={selectedTask}
          onClose={handleClosePanel}
        />
      ) : (
        <AttemptHeaderActions
          mode={mode}
          onModeChange={setMode}
          task={selectedTask}
          attempt={attempt ?? null}
          onClose={handleClosePanel}
        />
      )
    }
  >
    <div className="mx-auto w-full">
      <Breadcrumb>
        <BreadcrumbList>
          {/* Show story breadcrumb if in story context */}
          {storyId && parentStory && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer hover:underline"
                  onClick={() => {
                    navigate(paths.storyTasks(projectId!, storyId));
                  }}
                >
                  {truncateTitle(parentStory.title, 15)}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            {isTaskView ? (
              <BreadcrumbPage>
                {truncateTitle(selectedTask?.title)}
              </BreadcrumbPage>
            ) : (
              <BreadcrumbLink
                className="cursor-pointer hover:underline"
                onClick={() => {
                  const taskPath = storyId
                    ? paths.storyTask(projectId!, storyId, taskId!)
                    : paths.task(projectId!, taskId!);
                  navigateWithSearch(taskPath);
                }}
              >
                {truncateTitle(selectedTask?.title)}
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {!isTaskView && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {attempt?.branch || 'Task Attempt'}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  </NewCardHeader>
) : null;
```

**Step 4: Add useTask hook if it doesn't exist**

Check if exists: `frontend/src/hooks/useTask.ts`

If not exists, create: `frontend/src/hooks/useTask.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { Task } from 'shared/types';

export const taskKeys = {
  all: ['tasks'] as const,
  byId: (id: string) => [...taskKeys.all, id] as const,
};

export function useTask(taskId: string, options?: { enabled?: boolean }) {
  return useQuery<Task>({
    queryKey: taskKeys.byId(taskId),
    queryFn: () => tasksApi.getById(taskId),
    enabled: options?.enabled ?? !!taskId,
  });
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm run test frontend/src/pages/__tests__/ProjectTasks.breadcrumbs.test.tsx`
Expected: PASS - Story breadcrumb displayed correctly

**Step 6: Commit**

```bash
git add frontend/src/pages/ProjectTasks.tsx frontend/src/hooks/useTask.ts frontend/src/pages/__tests__/ProjectTasks.breadcrumbs.test.tsx
git commit -m "feat(navigation): add story context to breadcrumb navigation

- Fetch parent story data when storyId is present
- Display story name as clickable breadcrumb before task name
- Add useTask hook for fetching individual task data
- Add comprehensive breadcrumb tests

Improves navigation clarity by showing full hierarchy:
Story > Task > Attempt"
```

---

## Task 4: Make Auto-Brainstorm Navigation Opt-In

**Problem:** TaskPanel automatically navigates to brainstorm page for new tasks, which disrupts user flow when they just want to view the task.

**Files:**
- Modify: `frontend/src/components/panels/TaskPanel.tsx:31-50`
- Modify: `frontend/src/components/panels/TaskPanelHeaderActions.tsx` (add brainstorm button)
- Test: `frontend/src/components/panels/__tests__/TaskPanel.autoBrainstorm.test.tsx` (create)

**Step 1: Write test for opt-in brainstorm navigation**

Create: `frontend/src/components/panels/__tests__/TaskPanel.autoBrainstorm.test.tsx`

```typescript
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
  useTaskWorkflow: (task: any) => {
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
    vi.mocked(require('@/hooks').useNavigateWithSearch).mockReturnValue(navigate);

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
    };

    renderTaskPanel(newTask);

    await waitFor(() => {
      expect(screen.getByText('下一步: Start Brainstorm')).toBeInTheDocument();
    });

    // Note: The workflow button for brainstorm will be added in next task
    // This test verifies no auto-navigation occurs
  });
});
```

**Step 2: Run test to verify current behavior**

Run: `pnpm run test frontend/src/components/panels/__tests__/TaskPanel.autoBrainstorm.test.tsx`
Expected: FAIL - Currently auto-navigates, should not

**Step 3: Remove auto-navigation useEffect**

Modify: `frontend/src/components/panels/TaskPanel.tsx:31-50`

```typescript
// DELETE the entire auto-navigation useEffect (lines 31-50)
// Remove these lines:
  // 自动导航到 brainstorm（仅首次）
  useEffect(() => {
    if (!task || !projectId || !navigate) return;

    // 仅对 Story 下的 Task 自动触发工作流
    const storyId = task.parent_task_id;
    if (!storyId) return;

    // 如果是 new 状态且没有描述，自动导航到 brainstorm
    if (workflow.nextAction === 'brainstorm' && !task.description) {
      const storageKey = `task-auto-brainstorm-${task.id}`;
      const hasShown = window.localStorage.getItem(storageKey);

      // 避免无限循环，只自动触发一次
      if (hasShown !== 'shown') {
        window.localStorage.setItem(storageKey, 'shown');
        navigate(paths.taskBrainstorm(projectId, storyId, task.id));
      }
    }
  }, [task, workflow.nextAction, projectId, navigate]);
```

**Step 4: Add brainstorm workflow button**

Modify: `frontend/src/components/panels/TaskPanel.tsx` (in the workflow section around line 149)

```typescript
{/* 工作流动作按钮 */}
{workflow.nextAction === 'brainstorm' && (
  <Button
    onClick={async () => {
      if (!task || !projectId) return;
      const storyId = task.parent_task_id;
      if (!storyId) return;

      navigate(paths.taskBrainstorm(projectId, storyId, task.id));
    }}
    size="default"
    className="w-full mt-2"
  >
    <Sparkles className="mr-2 h-4 w-4" />
    {workflow.actionLabel}
  </Button>
)}

{workflow.nextAction === 'plan' && (
  <Button
    onClick={async () => {
      // ... existing plan logic
    }}
    size="default"
    className="w-full mt-2"
  >
    <FileText className="mr-2 h-4 w-4" />
    {workflow.actionLabel}
  </Button>
)}
```

Add import for Sparkles icon:

```typescript
import { PlusIcon, FileText, Play, Sparkles } from 'lucide-react';
```

**Step 5: Run test to verify it passes**

Run: `pnpm run test frontend/src/components/panels/__tests__/TaskPanel.autoBrainstorm.test.tsx`
Expected: PASS - No auto-navigation occurs

**Step 6: Commit**

```bash
git add frontend/src/components/panels/TaskPanel.tsx frontend/src/components/panels/__tests__/TaskPanel.autoBrainstorm.test.tsx
git commit -m "refactor(workflow): make brainstorm navigation opt-in instead of automatic

- Remove auto-navigation useEffect that forced users to brainstorm
- Add explicit 'Start Brainstorm' workflow button
- Users now choose when to start brainstorm process
- Add tests verifying no automatic navigation

Improves UX by giving users control over when to start brainstorming
rather than forcing immediate navigation when viewing new tasks."
```

---

## Task 5: Integration Testing

**Files:**
- Test: `frontend/src/__tests__/integration/navigation-flow.test.tsx` (create)

**Step 1: Write integration test for complete navigation flow**

Create: `frontend/src/__tests__/integration/navigation-flow.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectStories } from '@/pages/ProjectStories';
import { ProjectTasks } from '@/pages/ProjectTasks';

// Mock API responses
const mockStories = [
  {
    id: 'story-123',
    title: 'User Authentication',
    status: 'inprogress',
    task_type: 'story',
    parent_task_id: null,
  },
];

const mockTasks = [
  {
    id: 'task-456',
    title: 'Login API',
    status: 'todo',
    task_type: 'task',
    parent_task_id: 'story-123',
  },
];

const mockAttempts = [
  {
    id: 'attempt-789',
    task_id: 'task-456',
    branch: 'feature/login',
    created_at: new Date().toISOString(),
    session: { executor: 'claude' },
  },
];

vi.mock('@/hooks/useProjectStories', () => ({
  useProjectStories: () => ({
    data: mockStories,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useStoryTasks', () => ({
  useStoryTasks: () => ({
    tasks: mockTasks,
    tasksById: { 'task-456': mockTasks[0] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useTaskAttempts', () => ({
  useTaskAttemptsWithSessions: () => ({
    data: mockAttempts,
    isLoading: false,
    isError: false,
  }),
}));

describe('Navigation Flow Integration', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maintains story context through Story → Task → Attempt navigation', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/projects/proj-123/stories']}>
          <Routes>
            <Route
              path="/projects/:projectId/stories"
              element={<ProjectStories />}
            />
            <Route
              path="/projects/:projectId/stories/:storyId/tasks"
              element={<ProjectTasks />}
            />
            <Route
              path="/projects/:projectId/stories/:storyId/tasks/:taskId"
              element={<ProjectTasks />}
            />
            <Route
              path="/projects/:projectId/stories/:storyId/tasks/:taskId/attempts/:attemptId"
              element={<ProjectTasks />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Step 1: View stories board
    await waitFor(() => {
      expect(screen.getByText('User Authentication')).toBeInTheDocument();
    });

    // Step 2: Click story to view its tasks
    await user.click(screen.getByText('User Authentication'));

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        '/projects/proj-123/stories/story-123/tasks'
      );
      expect(screen.getByText('Login API')).toBeInTheDocument();
    });

    // Step 3: Click task to view details
    await user.click(screen.getByText('Login API'));

    await waitFor(() => {
      expect(window.location.pathname).toContain(
        '/projects/proj-123/stories/story-123/tasks/task-456'
      );
    });

    // Step 4: Click attempt to view details
    const attemptRow = screen.getByText('feature/login').closest('tr');
    await user.click(attemptRow!);

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        '/projects/proj-123/stories/story-123/tasks/task-456/attempts/attempt-789'
      );
    });

    // Verify breadcrumb shows: User Authentication > Login API > feature/login
    expect(screen.getByText('User Authentication')).toBeInTheDocument();
    expect(screen.getByText('Login API')).toBeInTheDocument();
    expect(screen.getByText('feature/login')).toBeInTheDocument();
  });
});
```

**Step 2: Run integration test**

Run: `pnpm run test frontend/src/__tests__/integration/navigation-flow.test.tsx`
Expected: PASS - Full navigation flow preserves story context

**Step 3: Commit**

```bash
git add frontend/src/__tests__/integration/navigation-flow.test.tsx
git commit -m "test(navigation): add integration test for story context preservation

- Test complete navigation flow: Story → Task → Attempt
- Verify story context maintained throughout navigation
- Verify breadcrumbs display correct hierarchy
- Ensure URLs contain story context at each step"
```

---

## Task 6: Manual QA Testing

**No code changes, just testing**

**Step 1: Start development server in QA mode**

Run: `pnpm run dev:qa`

**Step 2: Test Story → Task → Attempt navigation**

Manual steps:
1. Navigate to Projects page
2. Click on a project
3. Click on a story card
4. Verify URL: `/projects/{projectId}/stories/{storyId}/tasks`
5. Click on a task card
6. Verify URL: `/projects/{projectId}/stories/{storyId}/tasks/{taskId}`
7. Verify breadcrumb shows: `{Story Title} > {Task Title}`
8. Click on an attempt in the list
9. Verify URL: `/projects/{projectId}/stories/{storyId}/tasks/{taskId}/attempts/{attemptId}`
10. Click story name in breadcrumb
11. Verify returns to: `/projects/{projectId}/stories/{storyId}/tasks`
12. Press browser back button
13. Verify navigates through story-contextual URLs

**Step 3: Test task creation under story**

Manual steps:
1. Navigate to a story's tasks page
2. Click "Create Task" button
3. Fill in task details
4. Create task
5. Verify new task appears in story's task list
6. Click on new task
7. Verify task details show correct story context

**Step 4: Test workflow buttons**

Manual steps:
1. Create a new task under a story
2. Click on the task
3. Verify "Start Brainstorm" button appears (no auto-navigation)
4. Click "Start Brainstorm" button
5. Verify navigates to brainstorm page
6. Complete brainstorm
7. Return to task
8. Verify "Start Planning" button appears
9. Test planning and execution workflow buttons

**Step 5: Document any issues found**

Create: `docs/qa/navigation-context-qa-report.md` if issues found

**Step 6: Commit QA results**

```bash
# If QA report created
git add docs/qa/navigation-context-qa-report.md
git commit -m "docs(qa): add manual QA report for navigation context fixes

- Tested Story → Task → Attempt navigation flow
- Verified breadcrumb navigation
- Tested task creation under stories
- Verified workflow button behavior
- All tests passed / [list any issues]"
```

---

## Summary

**What We Fixed:**
1. ✅ TaskPanel Attempt navigation now preserves story context
2. ✅ TaskFormDialog correctly assigns parent_task_id for story tasks
3. ✅ Breadcrumb navigation shows story hierarchy
4. ✅ Auto-brainstorm is now opt-in via workflow button
5. ✅ Integration tests verify end-to-end flow
6. ✅ Manual QA testing confirms fixes work in real usage

**Testing Strategy:**
- Unit tests for each component change
- Integration test for complete navigation flow
- Manual QA for user experience validation
- TDD approach: write failing test → implement → verify passing

**Remaining Issues (Not Addressed):**
- Missing "View All Tasks" button on story board (lower priority)
- Could improve error handling for failed navigations (future enhancement)

---

## Verification Commands

Run all navigation-related tests:
```bash
pnpm run test -- navigation
```

Run specific test files:
```bash
pnpm run test frontend/src/components/panels/__tests__/TaskPanel.test.tsx
pnpm run test frontend/src/components/dialogs/tasks/__tests__/TaskFormDialog.test.tsx
pnpm run test frontend/src/pages/__tests__/ProjectTasks.breadcrumbs.test.tsx
pnpm run test frontend/src/components/panels/__tests__/TaskPanel.autoBrainstorm.test.tsx
pnpm run test frontend/src/__tests__/integration/navigation-flow.test.tsx
```

Type check:
```bash
pnpm run check
```

Build verification:
```bash
pnpm run build
```
