# Task 层面工作流自动化实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现点击 Task 卡片后自动触发需求澄清 → 生成 TDD 计划 → 用户确认 → 执行的完整自动化工作流

**Architecture:**
1. 引入 workflow_state 字段追踪 Task 的工作流状态（new/brainstormed/planned/executing）
2. TaskPanel 根据 workflow_state 决定下一步行动（自动触发脑暴或计划生成）
3. 技能链自动编排：brainstorming-task → writing-plans → executing-plans

**Tech Stack:**
- Rust (SQLx, Axum) - 后端 API 和数据库迁移
- TypeScript/React - 前端状态管理和 UI 流程控制
- SQLite - 数据存储

---

## 任务概览

| 任务 | 类型 | 影响范围 | 预估时间 |
|------|------|----------|----------|
| Task 1: 添加 workflow_state 字段 | 数据库 | 后端+前端 | 25min |
| Task 2: 实现工作流状态机逻辑 | 前端 | TaskPanel | 30min |
| Task 3: 自动触发 brainstorming-task | 前端 | TaskPanel | 20min |
| Task 4: 脑暴完成自动生成计划 | 前端 | Workspace | 25min |
| Task 5: 计划确认后自动执行 | 前端 | Workspace | 20min |
| Task 6: 端到端集成测试 | 测试 | 全栈 | 15min |

---

## Task 1: 添加 workflow_state 字段

**目标:** 在 tasks 表中添加 workflow_state 字段追踪工作流状态

**Files:**
- Create: `crates/db/migrations/20260206000000_add_workflow_state_to_tasks.sql`
- Modify: `crates/db/src/models/task.rs:1-50`
- Modify: `shared/types.ts` (自动生成)
- Test: `crates/db/src/models/task.rs:200-250` (测试部分)

### Step 1: 编写失败测试

在 `crates/db/src/models/task.rs` 末尾添加测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_state_enum_serialization() {
        // 测试 WorkflowState 枚举序列化
        let state = WorkflowState::New;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"new\"");

        let state = WorkflowState::Brainstormed;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"brainstormed\"");
    }

    #[test]
    fn test_workflow_state_default() {
        // 测试默认值是 New
        let state = WorkflowState::default();
        assert_eq!(state, WorkflowState::New);
    }
}
```

### Step 2: 运行测试验证失败

```bash
cd crates/db
cargo test test_workflow_state -- --nocapture
```

预期: FAIL - WorkflowState 类型不存在

### Step 3: 创建数据库迁移

创建文件 `crates/db/migrations/20260206000000_add_workflow_state_to_tasks.sql`:

```sql
-- Add workflow_state column to tasks table
ALTER TABLE tasks ADD COLUMN workflow_state TEXT NOT NULL DEFAULT 'new'
    CHECK (workflow_state IN ('new', 'brainstormed', 'planned', 'executing', 'completed'));

-- Update existing tasks to 'new' state
UPDATE tasks SET workflow_state = 'new' WHERE workflow_state IS NULL;

-- Create index for workflow state queries
CREATE INDEX idx_tasks_workflow_state ON tasks(workflow_state);
```

### Step 4: 定义 WorkflowState 枚举

在 `crates/db/src/models/task.rs` 的 TaskType 定义之后添加:

```rust
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Type, Serialize, Deserialize, TS, Default, Display,
)]
#[sqlx(type_name = "TEXT", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[ts(export)]
pub enum WorkflowState {
    /// Task 刚创建，尚未进行需求澄清
    #[default]
    New,
    /// 已完成 brainstorming-task 需求澄清
    Brainstormed,
    /// 已生成 TDD 实现计划（writing-plans）
    Planned,
    /// 正在执行实现
    Executing,
    /// 已完成实现（但可能未合并）
    Completed,
}
```

### Step 5: 添加 workflow_state 到 Task 结构

修改 `Task` 结构体（约在第 38 行）:

```rust
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub task_type: TaskType,
    pub parent_workspace_id: Option<Uuid>,
    pub parent_task_id: Option<Uuid>,
    pub workflow_state: WorkflowState,  // 新增字段
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

### Step 6: 更新 CreateTask 结构

修改 `CreateTask` 结构体（约在第 82 行）:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateTask {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub task_type: TaskType,
    pub parent_workspace_id: Option<Uuid>,
    pub parent_task_id: Option<Uuid>,
    pub image_ids: Option<Vec<Uuid>>,
    pub workflow_state: Option<WorkflowState>,  // 新增可选字段
}
```

### Step 7: 运行数据库迁移

```bash
# 在项目根目录
pnpm run prepare-db
```

预期: 迁移成功，.sqlx 文件更新

### Step 8: 运行测试验证通过

```bash
cd crates/db
cargo test test_workflow_state -- --nocapture
```

预期: PASS

### Step 9: 生成 TypeScript 类型

```bash
pnpm run generate-types
```

预期: `shared/types.ts` 包含 WorkflowState 导出

### Step 10: 提交变更

```bash
git add crates/db/migrations/20260206000000_add_workflow_state_to_tasks.sql
git add crates/db/src/models/task.rs
git add .sqlx/
git add shared/types.ts
git commit -m "feat(db): add workflow_state to tasks table

- Add WorkflowState enum (new, brainstormed, planned, executing, completed)
- Add workflow_state column to tasks table with default 'new'
- Generate TypeScript types for WorkflowState
- Add unit tests for enum serialization

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: 实现工作流状态机逻辑

**目标:** 创建工作流状态机组件，根据 workflow_state 决定下一步行动

**Files:**
- Create: `frontend/src/hooks/useTaskWorkflow.ts`
- Create: `frontend/src/hooks/useTaskWorkflow.test.ts`
- Modify: `frontend/src/components/panels/TaskPanel.tsx:21-184`

### Step 1: 编写失败测试

创建 `frontend/src/hooks/useTaskWorkflow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTaskWorkflow } from './useTaskWorkflow';
import type { TaskWithAttemptStatus, WorkflowState } from 'shared/types';

describe('useTaskWorkflow', () => {
  const createMockTask = (workflow_state: WorkflowState): TaskWithAttemptStatus => ({
    task: {
      id: 'task-1',
      project_id: 'proj-1',
      title: 'Test Task',
      description: 'Test description',
      status: 'todo',
      task_type: 'task',
      parent_workspace_id: null,
      parent_task_id: 'story-1',
      workflow_state,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    executor: 'claude_code',
  });

  it('should return "brainstorm" action for new tasks', () => {
    const task = createMockTask('new');
    const { result } = renderHook(() => useTaskWorkflow(task));

    expect(result.current.nextAction).toBe('brainstorm');
    expect(result.current.actionLabel).toBe('开始需求澄清');
  });

  it('should return "plan" action for brainstormed tasks', () => {
    const task = createMockTask('brainstormed');
    const { result } = renderHook(() => useTaskWorkflow(task));

    expect(result.current.nextAction).toBe('plan');
    expect(result.current.actionLabel).toBe('生成实现计划');
  });

  it('should return "execute" action for planned tasks', () => {
    const task = createMockTask('planned');
    const { result } = renderHook(() => useTaskWorkflow(task));

    expect(result.current.nextAction).toBe('execute');
    expect(result.current.actionLabel).toBe('开始执行');
  });

  it('should return null for executing/completed tasks', () => {
    const executingTask = createMockTask('executing');
    const { result: executingResult } = renderHook(() => useTaskWorkflow(executingTask));
    expect(executingResult.current.nextAction).toBeNull();

    const completedTask = createMockTask('completed');
    const { result: completedResult } = renderHook(() => useTaskWorkflow(completedTask));
    expect(completedResult.current.nextAction).toBeNull();
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd frontend
pnpm test useTaskWorkflow
```

预期: FAIL - useTaskWorkflow 不存在

### Step 3: 实现工作流 Hook

创建 `frontend/src/hooks/useTaskWorkflow.ts`:

```typescript
import { useMemo } from 'react';
import type { TaskWithAttemptStatus, WorkflowState } from 'shared/types';

export type WorkflowAction = 'brainstorm' | 'plan' | 'execute' | null;

export interface TaskWorkflowResult {
  /** 下一步应该执行的动作 */
  nextAction: WorkflowAction;
  /** 动作按钮显示文本 */
  actionLabel: string | null;
  /** 是否可以手动创建 attempt（绕过工作流） */
  canCreateAttempt: boolean;
  /** 当前工作流进度百分比 */
  progress: number;
}

/**
 * Task 工作流状态机
 *
 * 状态转换:
 * new → brainstorm → brainstormed → plan → planned → execute → executing → completed
 */
export function useTaskWorkflow(
  task: TaskWithAttemptStatus | null
): TaskWorkflowResult {
  return useMemo(() => {
    if (!task) {
      return {
        nextAction: null,
        actionLabel: null,
        canCreateAttempt: false,
        progress: 0,
      };
    }

    const state = task.workflow_state || 'new';

    switch (state) {
      case 'new':
        return {
          nextAction: 'brainstorm',
          actionLabel: '开始需求澄清',
          canCreateAttempt: false,
          progress: 0,
        };

      case 'brainstormed':
        return {
          nextAction: 'plan',
          actionLabel: '生成实现计划',
          canCreateAttempt: false,
          progress: 33,
        };

      case 'planned':
        return {
          nextAction: 'execute',
          actionLabel: '开始执行',
          canCreateAttempt: true,
          progress: 66,
        };

      case 'executing':
        return {
          nextAction: null,
          actionLabel: null,
          canCreateAttempt: true,
          progress: 90,
        };

      case 'completed':
        return {
          nextAction: null,
          actionLabel: null,
          canCreateAttempt: true,
          progress: 100,
        };

      default:
        return {
          nextAction: null,
          actionLabel: null,
          canCreateAttempt: true,
          progress: 0,
        };
    }
  }, [task]);
}
```

### Step 4: 运行测试验证通过

```bash
cd frontend
pnpm test useTaskWorkflow
```

预期: PASS

### Step 5: 集成到 TaskPanel

修改 `frontend/src/components/panels/TaskPanel.tsx`，在导入部分添加:

```typescript
import { useTaskWorkflow } from '@/hooks/useTaskWorkflow';
```

在组件内部（第 21 行后）添加:

```typescript
const workflow = useTaskWorkflow(task);
```

在返回的 JSX 中（第 113 行 `<div className="mt-6 flex-shrink-0 space-y-4">` 之前）添加工作流进度指示:

```typescript
{task && (
  <div className="mb-4 space-y-2">
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">工作流进度</span>
      <span className="text-foreground font-medium">{workflow.progress}%</span>
    </div>
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${workflow.progress}%` }}
      />
    </div>
    {workflow.nextAction && (
      <p className="text-xs text-muted-foreground">
        下一步: {workflow.actionLabel}
      </p>
    )}
  </div>
)}
```

### Step 6: 手动验证 UI

```bash
pnpm run dev
```

1. 打开任一 Task
2. 确认工作流进度条显示
3. 确认"下一步"提示显示正确

预期: UI 正常渲染，无控制台错误

### Step 7: 提交变更

```bash
git add frontend/src/hooks/useTaskWorkflow.ts
git add frontend/src/hooks/useTaskWorkflow.test.ts
git add frontend/src/components/panels/TaskPanel.tsx
git commit -m "feat(frontend): add task workflow state machine

- Create useTaskWorkflow hook with state transitions
- Add workflow progress indicator to TaskPanel
- Add unit tests for workflow state logic

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: 自动触发 brainstorming-task

**目标:** TaskPanel 根据 workflow_state 自动导航到 brainstorm 页面

**Files:**
- Modify: `frontend/src/components/panels/TaskPanel.tsx:21-184`
- Modify: `frontend/src/components/panels/TaskPanelHeaderActions.tsx:1-54`

### Step 1: 编写自动导航逻辑测试

由于涉及路由和副作用，使用手动验证而非单元测试。

### Step 2: 修改 TaskPanelHeaderActions

修改 `frontend/src/components/panels/TaskPanelHeaderActions.tsx`，将脑暴按钮逻辑改为基于 workflow_state:

```typescript
// 修改第 31-32 行
// 旧代码:
// const showBrainstorm = !!storyId && task.task_type === 'task';

// 新代码:
const showBrainstorm =
  !!storyId &&
  task.task_type === 'task' &&
  (task.workflow_state === 'new' || task.workflow_state === 'brainstormed');
```

同时修改按钮文本以反映当前状态:

```typescript
// 修改第 36-46 行
{showBrainstorm && (
  <Button
    variant="outline"
    size="sm"
    onClick={handleBrainstorm}
    title={task.workflow_state === 'new' ? 'Start requirement clarification' : 'Review brainstorm results'}
  >
    <Sparkles size={16} className="mr-1" />
    {task.workflow_state === 'new' ? 'Brainstorm' : 'Review'}
  </Button>
)}
```

### Step 3: 添加自动导航逻辑到 TaskPanel

修改 `frontend/src/components/panels/TaskPanel.tsx`，在 useTaskWorkflow 调用后添加自动导航效果:

```typescript
// 在第 25 行后添加
useEffect(() => {
  if (!task || !projectId || !navigate) return;

  // 仅对 Story 下的 Task 自动触发工作流
  const storyId = task.parent_task_id;
  if (!storyId) return;

  // 如果是 new 状态且没有描述，自动导航到 brainstorm
  if (workflow.nextAction === 'brainstorm' && !task.description) {
    const shouldAutoBrainstorm = window.localStorage.getItem(
      `task-auto-brainstorm-${task.id}`
    );

    // 避免无限循环，只自动触发一次
    if (shouldAutoBrainstorm !== 'shown') {
      window.localStorage.setItem(`task-auto-brainstorm-${task.id}`, 'shown');
      navigate(paths.taskBrainstorm(projectId, storyId, task.id));
    }
  }
}, [task, workflow.nextAction, projectId, navigate]);
```

### Step 4: 手动验证自动导航

```bash
pnpm run dev
```

测试步骤:
1. 创建一个新的 Task（workflow_state = 'new'）
2. 点击 Task 卡片
3. 确认自动导航到 brainstorm 页面
4. 返回并再次点击，确认不会再次自动导航

预期: 第一次打开自动导航，后续不再自动导航

### Step 5: 清理测试数据

如果需要重置测试:
```javascript
// 在浏览器控制台运行
localStorage.clear();
```

### Step 6: 提交变更

```bash
git add frontend/src/components/panels/TaskPanel.tsx
git add frontend/src/components/panels/TaskPanelHeaderActions.tsx
git commit -m "feat(frontend): auto-navigate to brainstorm for new tasks

- Auto-navigate to brainstorm page when opening new tasks
- Update brainstorm button visibility based on workflow_state
- Add localStorage guard to prevent infinite navigation loops

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: 脑暴完成自动生成计划

**目标:** brainstorming-task 完成后自动调用 writing-plans 技能

**Files:**
- Modify: `frontend/src/pages/TaskBrainstormLaunch.tsx:1-458`
- Modify: `frontend/src/components/workspace/SaveBrainstormResultButton.tsx` (如果存在)

### Step 1: 分析当前脑暴完成流程

查看 TaskBrainstormLaunch 的 handleSubmit（第 132 行），当前只创建 workspace。

### Step 2: 查找 SaveBrainstormResultButton 组件

```bash
cd frontend
find src -name "*SaveBrainstorm*" -type f
```

预期: 找到保存结果的按钮组件

### Step 3: 修改保存逻辑添加技能链

在 `frontend/src/components/workspace/SaveBrainstormResultButton.tsx` 中（假设存在），修改保存成功后的逻辑:

```typescript
// 在保存成功的 onSuccess 回调中
onSuccess: async (data) => {
  // 现有保存逻辑...

  // 更新 workflow_state 为 'brainstormed'
  await tasksApi.update(taskId, {
    ...task,
    workflow_state: 'brainstormed',
  });

  // 自动触发 writing-plans
  const planPrompt = `/writing-plans\n\n根据以下需求生成详细的 TDD 实现计划:\n\n${savedContent}`;

  // 创建新 workspace 用于计划生成
  await createWorkspace.mutateAsync({
    task: {
      project_id: projectId,
      title: `📋 Plan: ${task.title}`,
      description: planPrompt,
      status: null,
      task_type: 'task',
      parent_workspace_id: null,
      parent_task_id: taskId,
      image_ids: null,
    },
    executor_profile_id: effectiveProfile,
    repos: workspaceRepos,
  });

  // 导航到新创建的 workspace
  toast.success('需求澄清完成，正在生成实现计划...');
}
```

### Step 4: 如果 SaveBrainstormResultButton 不存在

则修改 TaskBrainstormLaunch 的 workspace 创建逻辑，在 workspace 完成后添加回调:

在 `frontend/src/pages/TaskBrainstormLaunch.tsx` 的 handleSubmit 后添加监听逻辑:

```typescript
// 监听 workspace 完成事件
useEffect(() => {
  if (!createWorkspace.isSuccess || !createWorkspace.data) return;

  const workspaceId = createWorkspace.data.id;

  // 轮询检查 workspace 是否完成
  const checkCompletion = setInterval(async () => {
    try {
      const ws = await workspacesApi.get(workspaceId);
      if (ws.session?.status === 'completed') {
        clearInterval(checkCompletion);

        // 更新 task workflow_state
        await tasksApi.update(taskId!, {
          title: task?.title || '',
          description: task?.description || null,
          status: task?.status || 'todo',
          workflow_state: 'brainstormed',
          parent_workspace_id: task?.parent_workspace_id || null,
          parent_task_id: task?.parent_task_id || null,
          image_ids: null,
        });

        // TODO: 自动触发 writing-plans
        toast.success('需求澄清完成！请查看结果并生成实现计划。');
      }
    } catch (err) {
      console.error('Failed to check workspace completion:', err);
    }
  }, 2000);

  return () => clearInterval(checkCompletion);
}, [createWorkspace.isSuccess, createWorkspace.data]);
```

### Step 5: 手动验证技能链

```bash
pnpm run dev
```

测试流程:
1. 创建新 Task
2. 自动进入 brainstorm 页面
3. 提交脑暴 prompt
4. 等待完成
5. 确认 workflow_state 更新为 'brainstormed'
6. 确认自动触发计划生成（或显示"生成计划"按钮）

预期: 脑暴完成后自动更新状态

### Step 6: 提交变更

```bash
git add frontend/src/pages/TaskBrainstormLaunch.tsx
git add frontend/src/components/workspace/SaveBrainstormResultButton.tsx
git commit -m "feat(frontend): auto-trigger plan generation after brainstorm

- Update workflow_state to 'brainstormed' on completion
- Add workspace completion polling
- Prepare for auto-triggering writing-plans skill

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: 计划确认后自动执行

**目标:** writing-plans 完成后，用户确认计划，自动更新 workflow_state 并可开始执行

**Files:**
- Create: `frontend/src/components/workspace/ConfirmPlanButton.tsx`
- Modify: `frontend/src/components/panels/TaskPanel.tsx:21-184`

### Step 1: 创建计划确认按钮组件

创建 `frontend/src/components/workspace/ConfirmPlanButton.tsx`:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { tasksApi } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';

interface ConfirmPlanButtonProps {
  task: TaskWithAttemptStatus;
  projectId: string;
  planContent: string;
}

export function ConfirmPlanButton({
  task,
  projectId,
  planContent,
}: ConfirmPlanButtonProps) {
  const navigate = useNavigate();
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsConfirming(true);

      // 更新 workflow_state 为 'planned'
      await tasksApi.update(task.id, {
        title: task.title,
        description: task.description,
        status: task.status,
        workflow_state: 'planned',
        parent_workspace_id: task.parent_workspace_id,
        parent_task_id: task.parent_task_id,
        image_ids: null,
      });

      // 保存计划到 task 文档
      await tasksApi.updateDoc(task.id, {
        implementation_plan: planContent,
      });

      // 导航回 task 详情
      const storyId = task.parent_task_id;
      if (storyId) {
        navigate(paths.storyTask(projectId, storyId, task.id));
      } else {
        navigate(paths.task(projectId, task.id));
      }
    } catch (err) {
      console.error('Failed to confirm plan:', err);
      alert('确认计划失败，请重试');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Button
      onClick={handleConfirm}
      disabled={isConfirming}
      size="default"
      className="w-full"
    >
      {isConfirming ? (
        <>
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          确认中...
        </>
      ) : (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          确认计划并进入执行阶段
        </>
      )}
    </Button>
  );
}
```

### Step 2: 在 TaskPanel 添加"开始执行"按钮

修改 `frontend/src/components/panels/TaskPanel.tsx`，在工作流进度条后添加执行按钮:

```typescript
{workflow.nextAction === 'execute' && (
  <Button
    onClick={() => {
      // 创建新的执行 workspace
      CreateAttemptDialog.show({
        taskId: task.id,
      });
    }}
    size="default"
    className="w-full"
  >
    <Play className="mr-2 h-4 w-4" />
    {workflow.actionLabel}
  </Button>
)}
```

添加必要的导入:

```typescript
import { Play } from 'lucide-react';
```

### Step 3: 修改 CreateAttemptDialog 更新状态

修改 `frontend/src/components/dialogs/tasks/CreateAttemptDialog.tsx`，在创建 workspace 成功后:

```typescript
onSuccess: async (workspace) => {
  // 更新 workflow_state 为 'executing'
  await tasksApi.update(taskId, {
    ...task,
    workflow_state: 'executing',
  });

  // 现有导航逻辑...
}
```

### Step 4: 手动验证完整流程

```bash
pnpm run dev
```

测试端到端流程:
1. 创建新 Task (workflow_state = 'new')
2. 自动导航到 brainstorm → 完成 (workflow_state = 'brainstormed')
3. 自动触发计划生成 → 完成 (workflow_state = 'planned')
4. 返回 TaskPanel，点击"开始执行"
5. 确认 workflow_state 更新为 'executing'

预期: 完整工作流自动执行

### Step 5: 提交变更

```bash
git add frontend/src/components/workspace/ConfirmPlanButton.tsx
git add frontend/src/components/panels/TaskPanel.tsx
git add frontend/src/components/dialogs/tasks/CreateAttemptDialog.tsx
git commit -m "feat(frontend): add plan confirmation and execution trigger

- Create ConfirmPlanButton component
- Add 'Start Execution' button in TaskPanel for planned tasks
- Update workflow_state to 'executing' on workspace creation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: 端到端集成测试

**目标:** 验证完整工作流从 new → brainstormed → planned → executing

**Files:**
- Create: `frontend/src/pages/__tests__/TaskWorkflow.e2e.test.tsx`

### Step 1: 创建端到端测试

创建 `frontend/src/pages/__tests__/TaskWorkflow.e2e.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectTasks } from '../ProjectTasks';

describe('Task Workflow E2E', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('should complete full workflow: new → brainstormed → planned → executing', async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ProjectTasks />
        </BrowserRouter>
      </QueryClientProvider>
    );

    // Step 1: 创建新 Task
    const createButton = screen.getByText(/create.*task/i);
    await user.click(createButton);

    const titleInput = screen.getByLabelText(/title/i);
    await user.type(titleInput, 'Test Task Workflow');

    const submitButton = screen.getByText(/create/i);
    await user.click(submitButton);

    // Step 2: 验证自动导航到 brainstorm
    await waitFor(() => {
      expect(screen.getByText(/brainstorm/i)).toBeInTheDocument();
    });

    // Step 3: 提交 brainstorm
    const promptTextarea = screen.getByPlaceholderText(/task details/i);
    await user.type(promptTextarea, '/brainstorming-task\n\n任务：实现用户登录');

    const startButton = screen.getByText(/start brainstorm/i);
    await user.click(startButton);

    // Step 4: 等待 brainstorm 完成，验证状态更新为 'brainstormed'
    await waitFor(
      () => {
        expect(screen.getByText(/brainstormed/i)).toBeInTheDocument();
      },
      { timeout: 30000 }
    );

    // Step 5: 验证自动触发计划生成（或显示"生成计划"按钮）
    const planButton = await screen.findByText(/生成.*计划/i);
    expect(planButton).toBeInTheDocument();

    // Step 6: 点击生成计划
    await user.click(planButton);

    // Step 7: 等待计划生成完成
    await waitFor(
      () => {
        expect(screen.getByText(/planned/i)).toBeInTheDocument();
      },
      { timeout: 60000 }
    );

    // Step 8: 确认计划
    const confirmButton = screen.getByText(/确认计划/i);
    await user.click(confirmButton);

    // Step 9: 验证显示"开始执行"按钮
    const executeButton = await screen.findByText(/开始执行/i);
    expect(executeButton).toBeInTheDocument();

    // Step 10: 点击开始执行
    await user.click(executeButton);

    // Step 11: 验证 workflow_state 更新为 'executing'
    await waitFor(() => {
      expect(screen.getByText(/executing/i)).toBeInTheDocument();
    });
  });
});
```

### Step 2: 运行端到端测试

```bash
cd frontend
pnpm test TaskWorkflow.e2e
```

预期: 测试通过（注意：需要运行后端服务）

### Step 3: 手动执行完整流程测试

```bash
pnpm run dev
```

完整测试步骤:
1. 创建新 Project
2. 创建新 Story
3. 在 Story 下创建新 Task
4. 验证自动导航到 brainstorm
5. 完成 brainstorm，验证状态更新
6. 验证自动触发或手动触发计划生成
7. 完成计划，验证状态更新
8. 点击"开始执行"，验证创建 workspace
9. 验证最终状态为 'executing'

预期: 所有步骤顺利执行，无错误

### Step 4: 清理测试数据

如果需要重置:
```sql
-- 在 SQLite 控制台
DELETE FROM tasks WHERE title LIKE 'Test Task%';
DELETE FROM workspaces WHERE branch LIKE '%test%';
```

### Step 5: 更新文档

创建或更新 `docs/workflows/task-workflow.md`:

```markdown
# Task 工作流说明

## 状态转换

```
new → brainstormed → planned → executing → completed
```

## 各状态说明

- **new**: Task 刚创建，尚未进行需求澄清
- **brainstormed**: 已完成 brainstorming-task 需求澄清
- **planned**: 已生成 TDD 实现计划（writing-plans）
- **executing**: 正在执行实现
- **completed**: 已完成实现

## 自动化行为

1. **new → brainstormed**: 首次打开 Task 自动导航到 brainstorm 页面
2. **brainstormed → planned**: brainstorm 完成后自动触发计划生成
3. **planned → executing**: 点击"开始执行"按钮创建 workspace

## 手动干预点

用户可在以下环节手动干预:
- 跳过自动 brainstorm（关闭自动导航）
- 修改生成的计划
- 选择执行的 executor profile
```

### Step 6: 提交最终变更

```bash
git add frontend/src/pages/__tests__/TaskWorkflow.e2e.test.tsx
git add docs/workflows/task-workflow.md
git commit -m "test(frontend): add e2e test for task workflow automation

- Add comprehensive end-to-end test for workflow states
- Document task workflow behavior and state transitions
- Verify automatic state updates at each stage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 验收标准

| 场景 | 预期结果 |
|------|---------|
| 创建新 Task | workflow_state 默认为 'new' |
| 首次打开新 Task | 自动导航到 brainstorm 页面 |
| brainstorm 完成 | workflow_state 更新为 'brainstormed' |
| 自动触发计划生成 | 创建新 workspace 调用 writing-plans |
| 计划生成完成 | workflow_state 更新为 'planned' |
| 点击"开始执行" | workflow_state 更新为 'executing' |
| TaskPanel 进度条 | 正确显示当前工作流进度 |
| 完整端到端流程 | 无错误，所有状态正确转换 |

---

## 不做的事情

- 不修改现有 TaskStatus 枚举（保持 todo/inprogress/done 等）
- 不自动合并或删除 workspace
- 不保存对话历史（只保存最终文档）
- 不强制用户必须遵循工作流（允许手动创建 attempt）
- 不修改 Story 层面的工作流（仅限 Task）

---

## 技术债务与后续优化

1. **性能优化**: workspace 完成检测使用轮询，可改为 WebSocket 推送
2. **状态回退**: 未实现状态回退机制（如 planned → brainstormed）
3. **并发控制**: 多个用户同时操作同一 Task 的冲突处理
4. **错误恢复**: workspace 执行失败时的状态恢复策略
5. **用户偏好**: 允许用户关闭全局自动化行为

---

## 相关文档

- [Task Brainstorm 功能设计](./2026-01-29-task-brainstorm-design.md)
- [Brainstorming Skill 链式编排设计](./2026-02-05-brainstorming-skill-chain-design.md)
- [Story Doc Generation 实现](./2026-01-28-story-doc-generation-implementation.md)

---

**实现完成检查清单:**

- [ ] Task 1: workflow_state 字段添加完成
- [ ] Task 2: 工作流状态机实现完成
- [ ] Task 3: 自动触发 brainstorm 实现完成
- [ ] Task 4: 自动生成计划实现完成
- [ ] Task 5: 计划确认与执行实现完成
- [ ] Task 6: 端到端测试通过
- [ ] 所有测试通过 (`pnpm run check`, `cargo test`)
- [ ] 手动 QA 测试通过
- [ ] 文档更新完成
