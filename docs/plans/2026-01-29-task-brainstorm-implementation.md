# Task Brainstorm 功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Task 执行前提供 AI 辅助的需求澄清功能，复用 Story Brainstorm 页面架构。

**Architecture:** 复用 `StoryBrainstormLaunch.tsx` 的 UI 结构创建 `TaskBrainstormLaunch.tsx`，使用 `brainstorming` skill（而非 `brainstorming-cards`）。完成后保存结果到 Task 文档的 `## 需求细节` 章节。

**Tech Stack:** React + TypeScript, React Router, TanStack Query, existing Task Doc API (`PATCH /tasks/:id/doc`)

---

## Task 1: 添加路由路径

**Files:**
- Modify: `frontend/src/lib/paths.ts:22-24`

**Step 1: 添加 taskBrainstorm 路径函数**

在 `paths.ts` 的 `storyBrainstorm` 之前添加：

```typescript
taskBrainstorm: (projectId: string, storyId: string, taskId: string) =>
  `/projects/${projectId}/stories/${storyId}/tasks/${taskId}/brainstorm`,
```

**Step 2: 验证类型检查通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check`
Expected: 无错误

**Step 3: Commit**

```bash
git add frontend/src/lib/paths.ts
git commit -m "feat: add taskBrainstorm path for task requirement clarification"
```

---

## Task 2: 创建 Task Brainstorm Prompt 构建器

**Files:**
- Create: `frontend/src/utils/buildTaskBrainstormPrompt.ts`
- Test: `frontend/src/utils/__tests__/buildTaskBrainstormPrompt.test.ts`

**Step 1: 编写失败测试**

```typescript
// frontend/src/utils/__tests__/buildTaskBrainstormPrompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildTaskBrainstormPrompt } from '../buildTaskBrainstormPrompt';

describe('buildTaskBrainstormPrompt', () => {
  it('should include /brainstorming skill reference', () => {
    const prompt = buildTaskBrainstormPrompt('Test Task', 'Some description');
    expect(prompt).toContain('/brainstorming');
  });

  it('should include task title', () => {
    const prompt = buildTaskBrainstormPrompt('My Task Title', 'desc');
    expect(prompt).toContain('My Task Title');
  });

  it('should include task description when provided', () => {
    const prompt = buildTaskBrainstormPrompt('Title', 'Task description here');
    expect(prompt).toContain('Task description here');
  });

  it('should handle empty description', () => {
    const prompt = buildTaskBrainstormPrompt('Title', '');
    expect(prompt).toContain('Title');
    expect(prompt).not.toContain('undefined');
  });
});
```

**Step 2: 运行测试验证失败**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban/frontend && pnpm test src/utils/__tests__/buildTaskBrainstormPrompt.test.ts`
Expected: FAIL - module not found

**Step 3: 实现 buildTaskBrainstormPrompt**

```typescript
// frontend/src/utils/buildTaskBrainstormPrompt.ts
export function buildTaskBrainstormPrompt(
  taskTitle: string,
  taskDescription: string | null | undefined
): string {
  const descSection = taskDescription
    ? `\n\n**现有描述：**\n${taskDescription}`
    : '';

  return `/brainstorming

帮我澄清「${taskTitle}」这个任务的需求细节。${descSection}

## 你的任务

1. **先问我 2-3 个关键问题**，了解任务的具体要求、边界条件、验收标准
2. **逐步澄清**：每次一个问题，根据我的回答追问或进入下一个问题
3. **最终生成需求摘要**，包含：
   - 核心需求点
   - 边界条件和约束
   - 技术实现要点
   - 验收标准

## 输出格式

当你准备好生成最终摘要时，请用以下格式：

\`\`\`markdown
## 需求细节

### 核心需求
- ...

### 边界条件
- ...

### 技术要点
- ...

### 验收标准
- [ ] ...
\`\`\`

---

让我们开始吧，请提出第一个问题：
`;
}
```

**Step 4: 运行测试验证通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban/frontend && pnpm test src/utils/__tests__/buildTaskBrainstormPrompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/buildTaskBrainstormPrompt.ts frontend/src/utils/__tests__/buildTaskBrainstormPrompt.test.ts
git commit -m "feat: add buildTaskBrainstormPrompt utility for task brainstorm"
```

---

## Task 3: 添加 Task Doc API 到前端

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: 添加 getTaskDoc 和 updateTaskDoc 函数**

在 `tasksApi` 对象中添加：

```typescript
async getDoc(taskId: string): Promise<string> {
  const response = await makeRequest(`/api/tasks/${taskId}/doc`);
  return response as string;
},

async updateDoc(
  taskId: string,
  section: 'api_spec' | 'test_cases' | 'dependencies' | 'changelog' | 'implementation_hints',
  content: string
): Promise<void> {
  await makeRequest(`/api/tasks/${taskId}/doc`, {
    method: 'PATCH',
    body: JSON.stringify({ section, content }),
  });
},
```

**Step 2: 验证类型检查通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check`
Expected: 无错误

**Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add task doc API methods to frontend"
```

---

## Task 4: 创建 TaskBrainstormLaunch 页面组件

**Files:**
- Create: `frontend/src/pages/TaskBrainstormLaunch.tsx`

**Step 1: 创建页面组件**

复用 `StoryBrainstormLaunch.tsx` 的结构，但修改为 Task 脑暴：

```typescript
// frontend/src/pages/TaskBrainstormLaunch.tsx
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, FolderGit2 } from 'lucide-react';
import { useUserSystem } from '@/components/ConfigProvider';
import { useCreateWorkspace } from '@/hooks/useCreateWorkspace';
import { useProjectRepos, useRepoBranches } from '@/hooks';
import { useTask } from '@/hooks/useTask';
import { getVariantOptions } from '@/utils/executor';
import { paths } from '@/lib/paths';
import { buildTaskBrainstormPrompt } from '@/utils/buildTaskBrainstormPrompt';
import type { ExecutorProfileId, BaseCodingAgent, Repo } from 'shared/types';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';

export function TaskBrainstormLaunch() {
  const { projectId, storyId, taskId } = useParams<{
    projectId: string;
    storyId: string;
    taskId: string;
  }>();
  const navigate = useNavigate();
  const { profiles, config } = useUserSystem();
  const { project } = useProject();

  const { data: task, isLoading: isTaskLoading } = useTask(taskId);

  const [message, setMessage] = useState('');
  const [selectedProfile, setSelectedProfile] =
    useState<ExecutorProfileId | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<
    Record<string, string>
  >({});

  const { createWorkspace } = useCreateWorkspace();
  const { data: projectRepos = [], isLoading: isLoadingRepos } =
    useProjectRepos(projectId);

  // Initialize message with brainstorm prompt when task loads
  useEffect(() => {
    if (task) {
      setMessage(buildTaskBrainstormPrompt(task.title, task.description));
    }
  }, [task]);

  // Default to user's config profile or first available executor
  const effectiveProfile = useMemo<ExecutorProfileId | null>(() => {
    if (selectedProfile) return selectedProfile;
    if (config?.executor_profile) return config.executor_profile;
    if (profiles) {
      const firstExecutor = Object.keys(profiles)[0] as BaseCodingAgent;
      if (firstExecutor) {
        const variants = Object.keys(profiles[firstExecutor]);
        return {
          executor: firstExecutor,
          variant: variants[0] ?? null,
        };
      }
    }
    return null;
  }, [selectedProfile, config?.executor_profile, profiles]);

  // Get variant options for the current executor
  const variantOptions = useMemo(
    () => getVariantOptions(effectiveProfile?.executor, profiles),
    [effectiveProfile?.executor, profiles]
  );

  // Build repos array for workspace creation
  const workspaceRepos = useMemo(() => {
    return projectRepos.map((repo) => ({
      repo_id: repo.id,
      target_branch:
        selectedBranches[repo.id] || repo.default_target_branch || 'main',
    }));
  }, [projectRepos, selectedBranches]);

  // Determine if we can submit
  const canSubmit =
    message.trim().length > 0 &&
    effectiveProfile !== null &&
    projectId !== undefined &&
    taskId !== undefined &&
    workspaceRepos.length > 0;

  // Handle variant change
  const handleVariantChange = useCallback(
    (variant: string | null) => {
      if (!effectiveProfile) return;
      setSelectedProfile({
        executor: effectiveProfile.executor,
        variant,
      });
    },
    [effectiveProfile]
  );

  // Handle executor change
  const handleExecutorChange = useCallback(
    (executor: BaseCodingAgent) => {
      const executorConfig = profiles?.[executor];
      if (!executorConfig) {
        setSelectedProfile({ executor, variant: null });
        return;
      }

      const variants = Object.keys(executorConfig);
      let targetVariant: string | null = null;

      if (
        config?.executor_profile?.executor === executor &&
        config?.executor_profile?.variant
      ) {
        const savedVariant = config.executor_profile.variant;
        if (variants.includes(savedVariant)) {
          targetVariant = savedVariant;
        }
      }

      if (!targetVariant) {
        targetVariant = variants.includes('DEFAULT')
          ? 'DEFAULT'
          : (variants[0] ?? null);
      }

      setSelectedProfile({ executor, variant: targetVariant });
    },
    [profiles, config?.executor_profile]
  );

  // Handle submit - creates workspace with task as parent
  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmit || !effectiveProfile || !projectId || !taskId) return;

    await createWorkspace.mutateAsync({
      task: {
        project_id: projectId,
        title: `🧠 Brainstorm: ${task?.title || 'Task'}`,
        description: message,
        status: null,
        task_type: 'task',
        parent_workspace_id: null,
        parent_task_id: taskId,
        image_ids: null,
      },
      executor_profile_id: effectiveProfile,
      repos: workspaceRepos,
    });
  }, [
    canSubmit,
    effectiveProfile,
    projectId,
    taskId,
    task?.title,
    message,
    createWorkspace,
    workspaceRepos,
  ]);

  // Navigate back to task
  const handleBack = useCallback(() => {
    if (projectId && storyId && taskId) {
      navigate(paths.storyTask(projectId, storyId, taskId));
    }
  }, [navigate, projectId, storyId, taskId]);

  // Determine error to display
  const displayError =
    hasAttemptedSubmit && !projectId
      ? 'Project ID not found'
      : hasAttemptedSubmit && !taskId
        ? 'Task ID not found'
        : createWorkspace.error
          ? createWorkspace.error instanceof Error
            ? createWorkspace.error.message
            : 'Failed to create workspace'
          : null;

  // Handle case where no project or task exists
  if (!projectId || !taskId) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-lg font-medium text-high mb-2">
            Task not found
          </h2>
          <p className="text-sm text-low">
            Unable to start brainstorming session
          </p>
        </div>
      </div>
    );
  }

  // Handle loading state
  if (isTaskLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" />
          Loading task...
        </div>
      </div>
    );
  }

  // Handle case where no repos are configured
  if (!isLoadingRepos && projectRepos.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <FolderGit2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-high mb-2">
              No Repository Configured
            </h2>
            <p className="text-sm text-muted-foreground">
              Please add a repository to your project before starting a
              brainstorming session.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Task
            </Button>
            <Button onClick={() => navigate('/settings/repos')}>
              Add Repository
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col bg-primary h-full overflow-auto">
      {/* Centered content */}
      <div className="flex-1 flex items-start justify-center pt-12 pb-8 px-6">
        <div className="w-full max-w-2xl space-y-6">
          {/* Header */}
          <div>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Task
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Task Brainstorm
                </h1>
                <p className="text-sm text-muted-foreground">
                  AI-assisted requirement clarification for{' '}
                  {task?.title || 'this task'}
                </p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-muted/50 border border-border/50 p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">
              How it works
            </h3>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>AI will ask clarifying questions about the task</li>
              <li>Answer each question to refine the requirements</li>
              <li>Review the generated requirement summary</li>
              <li>Save the clarified requirements to the task document</li>
            </ol>
          </div>

          {/* Branch Selection */}
          {projectRepos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                Repository Branches
              </h3>
              <p className="text-xs text-muted-foreground">
                Select the target branch for each repository
              </p>
              <div className="space-y-2">
                {projectRepos.map((repo) => (
                  <BranchSelector
                    key={repo.id}
                    repo={repo}
                    selectedBranch={
                      selectedBranches[repo.id] ||
                      repo.default_target_branch ||
                      'main'
                    }
                    onBranchChange={(branch) =>
                      setSelectedBranches((prev) => ({
                        ...prev,
                        [repo.id]: branch,
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {/* Textarea */}
            <div className="rounded-lg border border-border bg-background">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Task requirements will be loaded here..."
                className="w-full h-48 p-4 text-sm bg-transparent resize-none focus:outline-none"
                disabled={createWorkspace.isPending}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-4">
              {/* Left side - executor selection */}
              <div className="flex items-center gap-3">
                <select
                  value={effectiveProfile?.executor ?? ''}
                  onChange={(e) =>
                    handleExecutorChange(e.target.value as BaseCodingAgent)
                  }
                  className="h-9 px-3 text-sm rounded-md border border-border bg-background"
                  disabled={createWorkspace.isPending}
                >
                  {Object.keys(profiles ?? {}).map((exec) => (
                    <option key={exec} value={exec}>
                      {exec
                        .split('_')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')}
                    </option>
                  ))}
                </select>

                {variantOptions.length > 1 && (
                  <select
                    value={effectiveProfile?.variant ?? 'DEFAULT'}
                    onChange={(e) => handleVariantChange(e.target.value)}
                    className="h-9 px-3 text-sm rounded-md border border-border bg-background"
                    disabled={createWorkspace.isPending}
                  >
                    {variantOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Right side - submit button */}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || createWorkspace.isPending}
                size="default"
              >
                {createWorkspace.isPending ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Brainstorm
                  </>
                )}
              </Button>
            </div>

            {/* Error message */}
            {displayError && (
              <div className="text-sm text-destructive">{displayError}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface BranchSelectorProps {
  repo: Repo;
  selectedBranch: string;
  onBranchChange: (branch: string) => void;
}

function BranchSelector({
  repo,
  selectedBranch,
  onBranchChange,
}: BranchSelectorProps) {
  const { data: branches, isLoading } = useRepoBranches(repo.id);

  // Filter to local branches only for cleaner UI
  const localBranches = branches?.filter((b) => !b.is_remote) ?? [];

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {repo.display_name || repo.name}
        </p>
      </div>
      <select
        value={selectedBranch}
        onChange={(e) => onBranchChange(e.target.value)}
        disabled={isLoading}
        className="h-9 px-3 text-sm rounded-md border border-border bg-background min-w-[120px]"
      >
        {isLoading ? (
          <option>Loading...</option>
        ) : localBranches.length > 0 ? (
          localBranches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
            </option>
          ))
        ) : (
          <option value={selectedBranch}>{selectedBranch}</option>
        )}
      </select>
    </div>
  );
}
```

**Step 2: 验证类型检查通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check`
Expected: 无错误

**Step 3: Commit**

```bash
git add frontend/src/pages/TaskBrainstormLaunch.tsx
git commit -m "feat: add TaskBrainstormLaunch page component"
```

---

## Task 5: 添加路由配置

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: 导入 TaskBrainstormLaunch**

在文件顶部的 imports 中添加：

```typescript
import { TaskBrainstormLaunch } from './pages/TaskBrainstormLaunch';
```

**Step 2: 添加路由**

在 `storyBrainstorm` 路由之后（约 169 行）添加：

```typescript
<Route
  path="/projects/:projectId/stories/:storyId/tasks/:taskId/brainstorm"
  element={<TaskBrainstormLaunch />}
/>
```

**Step 3: 验证类型检查通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check`
Expected: 无错误

**Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add route for TaskBrainstormLaunch page"
```

---

## Task 6: 在 TaskPanelHeaderActions 添加脑暴按钮

**Files:**
- Modify: `frontend/src/components/panels/TaskPanelHeaderActions.tsx`

**Step 1: 添加 Brainstorm 按钮**

修改组件，添加脑暴按钮（在 ActionsDropdown 之前）：

```typescript
import { Button } from '../ui/button';
import { X, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import { paths } from '@/lib/paths';

type Task = TaskWithAttemptStatus;

interface TaskPanelHeaderActionsProps {
  task: Task;
  onClose: () => void;
}

export const TaskPanelHeaderActions = ({
  task,
  onClose,
}: TaskPanelHeaderActionsProps) => {
  const navigate = useNavigate();
  const { projectId, storyId } = useParams<{
    projectId: string;
    storyId?: string;
  }>();

  const handleBrainstorm = () => {
    if (projectId && storyId && task.id) {
      navigate(paths.taskBrainstorm(projectId, storyId, task.id));
    }
  };

  // Only show brainstorm button for tasks under a story
  const showBrainstorm = !!storyId && task.task_type === 'task';

  return (
    <>
      {showBrainstorm && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleBrainstorm}
          title="Brainstorm requirements"
        >
          <Sparkles size={16} className="mr-1" />
          Brainstorm
        </Button>
      )}
      <ActionsDropdown task={task} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
```

**Step 2: 验证类型检查通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check`
Expected: 无错误

**Step 3: Commit**

```bash
git add frontend/src/components/panels/TaskPanelHeaderActions.tsx
git commit -m "feat: add Brainstorm button to TaskPanelHeaderActions"
```

---

## Task 7: 创建 SaveBrainstormResultButton 组件

**Files:**
- Create: `frontend/src/components/workspace/SaveBrainstormResultButton.tsx`

**Step 1: 创建保存结果按钮组件**

这个按钮在 workspace 页面显示，当完成脑暴后允许用户保存结果到 Task 文档：

```typescript
// frontend/src/components/workspace/SaveBrainstormResultButton.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tasksApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import type { Task, NormalizedEntry } from 'shared/types';

interface SaveBrainstormResultButtonProps {
  task: Task;
  entries: NormalizedEntry[];
  projectId: string;
  storyId?: string;
}

function extractMarkdownContent(entries: NormalizedEntry[]): string | null {
  // Look for the last assistant message containing ## 需求细节
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry.type === 'NORMALIZED_ENTRY' &&
      entry.data.type === 'assistant_message'
    ) {
      const content = entry.data.content;
      // Find markdown code block or direct content with ## 需求细节
      const markdownMatch = content.match(/```markdown\s*([\s\S]*?)```/);
      if (markdownMatch) {
        return markdownMatch[1].trim();
      }
      // Or look for the section directly
      if (content.includes('## 需求细节')) {
        const startIdx = content.indexOf('## 需求细节');
        return content.slice(startIdx).trim();
      }
    }
  }
  return null;
}

export function SaveBrainstormResultButton({
  task,
  entries,
  projectId,
  storyId,
}: SaveBrainstormResultButtonProps) {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Only show for task brainstorm workspaces
  const isBrainstormTask =
    task.title.startsWith('🧠 Brainstorm:') && task.task_type === 'task';

  const markdownContent = useMemo(
    () => extractMarkdownContent(entries),
    [entries]
  );

  const canSave = isBrainstormTask && markdownContent && task.parent_task_id;

  if (!canSave) {
    return null;
  }

  const handleSave = async () => {
    if (!markdownContent || !task.parent_task_id) return;

    setIsSaving(true);
    try {
      await tasksApi.updateDoc(
        task.parent_task_id,
        'implementation_hints',
        markdownContent
      );
      setSaved(true);

      // Navigate back to parent task after short delay
      setTimeout(() => {
        if (storyId) {
          navigate(paths.storyTask(projectId, storyId, task.parent_task_id!));
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to save brainstorm result:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Button
      onClick={handleSave}
      disabled={isSaving || saved}
      className="fixed bottom-6 right-6 shadow-lg"
      size="lg"
    >
      {saved ? (
        <>
          <Check className="mr-2 h-4 w-4" />
          Saved!
        </>
      ) : isSaving ? (
        <>
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Saving...
        </>
      ) : (
        <>
          <Save className="mr-2 h-4 w-4" />
          Save to Task Doc
        </>
      )}
    </Button>
  );
}
```

**Step 2: 验证类型检查通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check`
Expected: 无错误

**Step 3: Commit**

```bash
git add frontend/src/components/workspace/SaveBrainstormResultButton.tsx
git commit -m "feat: add SaveBrainstormResultButton for task brainstorm results"
```

---

## Task 8: 集成 SaveBrainstormResultButton 到 Workspace 页面

**Files:**
- Modify: 需要找到 Workspace 页面并集成按钮

**Step 1: 找到 Workspace 页面组件**

Run: `grep -r "SaveBrainstormResultButton\|ExtractStoriesButton" frontend/src --include="*.tsx" -l`

**Step 2: 在 ExtractStoriesButton 旁边添加 SaveBrainstormResultButton**

参考 ExtractStoriesButton 的集成方式，在相同位置添加 SaveBrainstormResultButton。

**Step 3: 验证类型检查通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check`
Expected: 无错误

**Step 4: Commit**

```bash
git add <modified-files>
git commit -m "feat: integrate SaveBrainstormResultButton in Workspace page"
```

---

## Task 9: 手动测试完整流程

**Step 1: 启动开发服务器**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run dev:qa`

**Step 2: 测试流程**

1. 进入一个 Project → Stories → 选择一个 Story → 查看 Tasks
2. 点击一个 Task 打开 TaskPanel
3. 验证 TaskPanel 头部显示 "Brainstorm" 按钮
4. 点击 "Brainstorm" 按钮，验证导航到 TaskBrainstormLaunch 页面
5. 验证页面显示正确的 Task 信息和 brainstorm prompt
6. 点击 "Start Brainstorm" 创建 workspace
7. 在 workspace 中与 AI 对话
8. 当 AI 生成 `## 需求细节` 摘要后，验证 "Save to Task Doc" 按钮出现
9. 点击保存，验证保存成功并导航回 Task

**Step 3: 记录任何发现的问题**

---

## Task 10: 最终提交

**Step 1: 确保所有测试通过**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && pnpm run check && pnpm run lint`

**Step 2: 创建最终提交（如有未提交的修复）**

```bash
git add -A
git commit -m "feat: complete Task Brainstorm feature implementation"
```

---

## 验收标准

| 场景 | 预期结果 |
|------|---------|
| 点击 Task 脑暴按钮 | 导航到 `/projects/:projectId/stories/:storyId/tasks/:taskId/brainstorm` |
| 页面加载 | 显示 Task 标题、描述，加载 brainstorm prompt |
| 点击 Start Brainstorm | 创建 workspace，导航到 workspace 页面 |
| AI 生成需求摘要 | "Save to Task Doc" 按钮出现 |
| 点击保存 | 内容保存到 Task 文档，导航回 Task |
