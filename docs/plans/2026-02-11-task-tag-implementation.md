# Task 标签系统 TDD 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Task 卡片上添加预定义标签（7 种），实现左侧色条视觉分类、看板筛选、brainstorm prompt 注入、以及自动化生成链的标签支持。

**Architecture:** 单字段 `tag: Option<TaskTag>` 加到 Task 表和模型上。前端用静态配置映射颜色/显示名/注入文本。KanbanCard 通过 `className` 的 `border-l-4` 实现色条。

**Tech Stack:** Rust (SQLx, ts-rs, serde), TypeScript/React (Tailwind, TanStack Form), SQLite

---

### Task 1: 数据库迁移 — 添加 tag 字段

**Files:**
- Create: `crates/db/migrations/20260211000000_add_tag_to_tasks.sql`

**Step 1: 创建迁移文件**

```sql
ALTER TABLE tasks ADD COLUMN tag TEXT DEFAULT NULL;
```

**Step 2: 验证迁移可运行**

Run: `cd /Users/leone/AI/vibe-kanban/.worktrees/story-kanban && cargo sqlx migrate run --source crates/db/migrations --database-url "sqlite:///tmp/test-tag-migration.db?mode=rwc"`
Expected: 迁移成功

**Step 3: Commit**

```bash
git add crates/db/migrations/20260211000000_add_tag_to_tasks.sql
git commit -m "feat(db): add tag column to tasks table"
```

---

### Task 2: Rust 模型 — TaskTag 枚举 + Task 结构体扩展

**Files:**
- Modify: `crates/db/src/models/task.rs`

**Step 1: 写 TaskTag 枚举的序列化测试**

在 `task.rs:549` 的 `mod tests` 中添加：

```rust
#[test]
fn test_task_tag_serialization() {
    let tag = TaskTag::UiDesign;
    let json = serde_json::to_string(&tag).unwrap();
    assert_eq!(json, "\"ui-design\"");

    let tag = TaskTag::Api;
    let json = serde_json::to_string(&tag).unwrap();
    assert_eq!(json, "\"api\"");

    let tag = TaskTag::Bugfix;
    let json = serde_json::to_string(&tag).unwrap();
    assert_eq!(json, "\"bugfix\"");
}

#[test]
fn test_task_tag_deserialization() {
    let tag: TaskTag = serde_json::from_str("\"ui-design\"").unwrap();
    assert_eq!(tag, TaskTag::UiDesign);

    let tag: TaskTag = serde_json::from_str("\"refactor\"").unwrap();
    assert_eq!(tag, TaskTag::Refactor);
}

#[test]
fn test_task_tag_option_serialization() {
    let tag: Option<TaskTag> = None;
    let json = serde_json::to_string(&tag).unwrap();
    assert_eq!(json, "null");

    let tag: Option<TaskTag> = Some(TaskTag::Test);
    let json = serde_json::to_string(&tag).unwrap();
    assert_eq!(json, "\"test\"");
}
```

**Step 2: 运行测试验证失败**

Run: `cargo test -p db test_task_tag`
Expected: FAIL — `TaskTag` 不存在

**Step 3: 实现 TaskTag 枚举**

在 `task.rs` 的 `WorkflowState` 枚举后（line 41 后）插入：

```rust
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Type, Serialize, Deserialize, TS, Display, EnumString,
)]
#[sqlx(type_name = "TEXT", rename_all = "kebab-case")]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
#[ts(export)]
pub enum TaskTag {
    UiDesign,
    Api,
    Bugfix,
    Refactor,
    Infra,
    Docs,
    Test,
}
```

**Step 4: 运行测试验证通过**

Run: `cargo test -p db test_task_tag`
Expected: PASS

**Step 5: 扩展 Task 结构体**

在 `task.rs` Task struct 中 `workflow_state` 字段后（line 68 后）添加：

```rust
pub tag: Option<TaskTag>,
```

在 CreateTask struct 中 `workflow_state` 字段后（line 114 后）添加：

```rust
#[ts(optional)]
pub tag: Option<TaskTag>,
```

在 UpdateTask struct 中 `workflow_state` 字段后（line 146 后）添加：

```rust
#[ts(optional)]
pub tag: Option<TaskTag>,
```

**Step 6: 更新 `from_title_description` 方法**

在 `CreateTask::from_title_description` 的返回值中添加 `tag: None,`（line 132 后）

**Step 7: 更新所有 SQL 查询**

需要更新以下查询，在 SELECT 列和 RETURNING 子句中添加 `tag`：

- `find_by_project_id_with_attempt_status`（line 166）：SELECT 中加 `t.tag AS "tag: TaskTag"`，Task 构造中加 `tag: rec.tag`
- `list_tasks`（line 252）：SELECT 列表加 `, tag`
- `find_by_id`（line 283）：加 `tag as "tag: TaskTag"`
- `find_by_rowid`（line 294）：加 `tag as "tag: TaskTag"`
- `create`（line 313）：INSERT 列加 `tag`，VALUES 加 `$10`，绑定 `data.tag`，RETURNING 加 `tag`
- `update`（line 343）：SET 加 `tag = COALESCE($9, tag)`，绑定 `tag` 参数，RETURNING 加 `tag`
- `update_workflow_state`（line 383）：RETURNING 加 `tag`
- `find_children_by_parent_task_id`（line 435）：SELECT 加 `, tag`
- `find_children_by_workspace_id`（line 476）：SELECT 加 `tag as "tag: TaskTag"`

同时更新 `Task::update` 签名，增加 `tag: Option<TaskTag>` 参数。

**Step 8: 运行全部测试**

Run: `cargo test -p db`
Expected: PASS

**Step 9: Commit**

```bash
git add crates/db/src/models/task.rs
git commit -m "feat(db): add TaskTag enum and tag field to Task model"
```

---

### Task 3: API 路由 — update_task 传递 tag 参数

**Files:**
- Modify: `crates/server/src/routes/tasks.rs:402-433`

**Step 1: 更新 update_task handler**

在 `update_task` 函数中（line 420 后），添加 tag 处理：

```rust
let tag = payload.tag;
```

并在 `Task::update()` 调用中传入 tag 参数（新增第 9 个参数）。

**Step 2: 运行测试**

Run: `cargo test -p server`
Expected: PASS（现有测试应通过）

**Step 3: Commit**

```bash
git add crates/server/src/routes/tasks.rs
git commit -m "feat(api): pass tag field through update_task handler"
```

---

### Task 4: MCP — create_task 支持 tag 参数

**Files:**
- Modify: `crates/server/src/mcp/task_server.rs:29-37,162-191,584-619`

**Step 1: 扩展 CreateTaskRequest**

在 `CreateTaskRequest` struct（line 36 后）添加：

```rust
#[schemars(description = "Optional tag for task categorization: 'ui-design', 'api', 'bugfix', 'refactor', 'infra', 'docs', 'test'")]
pub tag: Option<String>,
```

**Step 2: 更新 create_task MCP handler**

在 `create_task` 方法（line 584）中，解构时添加 `tag`，并修改 `CreateTask::from_title_description` 调用后设置 tag：

```rust
let mut create_task = CreateTask::from_title_description(project_id, title, expanded_description);
if let Some(tag_str) = tag {
    create_task.tag = TaskTag::from_str(&tag_str).ok();
}
```

**Step 3: 扩展 TaskSummary 和 TaskDetails**

在 `TaskSummary`（line 163）和 `TaskDetails`（line 194）中添加 `tag` 字段，并在 `from_task_with_status` 中映射。

**Step 4: 运行编译检查**

Run: `cargo check -p server`
Expected: 编译通过

**Step 5: Commit**

```bash
git add crates/server/src/mcp/task_server.rs
git commit -m "feat(mcp): add tag parameter to create_task MCP tool"
```

---

### Task 5: 类型同步 + SQLx 准备

**Files:**
- Regenerate: `shared/types.ts`
- Update: `.sqlx/` cache

**Step 1: 重新生成 TypeScript 类型**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` 更新，包含 `TaskTag` 类型和 Task/CreateTask/UpdateTask 的 `tag` 字段

**Step 2: 准备 SQLx 离线缓存**

Run: `pnpm run prepare-db`
Expected: `.sqlx/` 目录更新

**Step 3: 运行全量 Rust 测试**

Run: `cargo test --workspace`
Expected: PASS

**Step 4: 运行前端类型检查**

Run: `pnpm run check`
Expected: 可能有类型错误（前端代码尚未更新 tag 字段），记录需要修复的位置

**Step 5: Commit**

```bash
git add shared/types.ts .sqlx/
git commit -m "chore: regenerate types and SQLx cache for tag field"
```

---

### Task 6: 前端配置 — task-tags.ts

**Files:**
- Create: `frontend/src/config/task-tags.ts`

**Step 1: 创建标签配置文件**

```typescript
import type { TaskTag } from 'shared/types';

export interface TaskTagConfig {
  label: string;
  color: string;        // Tailwind border color class
  bgColor: string;      // Tailwind background color class (for filter chips)
  dotColor: string;     // Tailwind dot color class (for filter chips)
  injectionPrompt: string;
}

export const TASK_TAG_CONFIGS: Record<TaskTag, TaskTagConfig> = {
  'ui-design': {
    label: 'UI 设计',
    color: 'border-l-blue-500',
    bgColor: 'bg-blue-500/10',
    dotColor: 'bg-blue-500',
    injectionPrompt:
      '本任务是 UI 设计任务。请重点关注：页面布局与信息层级、交互流程与状态变化、响应式适配策略、组件拆分粒度、样式方案（Tailwind 类名组织）。在技术方案章节建议使用 leone-ui2code 处理设计稿/截图。',
  },
  api: {
    label: 'API',
    color: 'border-l-green-500',
    bgColor: 'bg-green-500/10',
    dotColor: 'bg-green-500',
    injectionPrompt:
      '本任务是 API 开发任务。请重点关注：接口路径与 HTTP 方法设计、请求/响应数据结构、错误码定义、权限校验、数据库查询优化。建议使用 leone-api 生成端点骨架。',
  },
  bugfix: {
    label: 'Bug 修复',
    color: 'border-l-red-500',
    bgColor: 'bg-red-500/10',
    dotColor: 'bg-red-500',
    injectionPrompt:
      '本任务是 Bug 修复任务。请重点关注：问题复现步骤、根因分析、影响范围评估、回归风险。建议使用 systematic-debugging 技能定位根因。',
  },
  refactor: {
    label: '重构',
    color: 'border-l-orange-500',
    bgColor: 'bg-orange-500/10',
    dotColor: 'bg-orange-500',
    injectionPrompt:
      '本任务是代码重构任务。请重点关注：现有代码问题诊断、重构目标与约束、兼容性影响、测试覆盖。建议使用 leone-review 先做代码审查。',
  },
  infra: {
    label: '基础设施',
    color: 'border-l-purple-500',
    bgColor: 'bg-purple-500/10',
    dotColor: 'bg-purple-500',
    injectionPrompt:
      '本任务是基础设施任务。请重点关注：环境配置、部署流程、脚本可靠性、回滚方案。',
  },
  docs: {
    label: '文档',
    color: 'border-l-cyan-500',
    bgColor: 'bg-cyan-500/10',
    dotColor: 'bg-cyan-500',
    injectionPrompt:
      '本任务是文档任务。请重点关注：目标读者、文档结构、与代码的同步策略、示例完整性。',
  },
  test: {
    label: '测试',
    color: 'border-l-yellow-500',
    bgColor: 'bg-yellow-500/10',
    dotColor: 'bg-yellow-500',
    injectionPrompt:
      '本任务是测试任务。请重点关注：测试策略（单元/集成/E2E）、边界条件覆盖、测试数据准备、断言质量。建议使用 test-driven-development 技能。',
  },
};

export const ALL_TASK_TAGS: TaskTag[] = Object.keys(TASK_TAG_CONFIGS) as TaskTag[];
```

**Step 2: Commit**

```bash
git add frontend/src/config/task-tags.ts
git commit -m "feat(frontend): add task tag configuration with colors and prompts"
```

---

### Task 7: TaskCard — 左侧色条 + tooltip

**Files:**
- Modify: `frontend/src/components/tasks/TaskCard.tsx:77-124`

**Step 1: 导入配置并修改 KanbanCard**

在 imports（line 10 后）添加：

```typescript
import { TASK_TAG_CONFIGS } from '@/config/task-tags';
import type { TaskTag } from 'shared/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
```

修改 KanbanCard 渲染（line 78），给 KanbanCard 添加 className prop 传递色条样式：

```typescript
const tagConfig = task.tag ? TASK_TAG_CONFIGS[task.tag as TaskTag] : null;
```

在 `<KanbanCard` 组件上添加：

```typescript
className={tagConfig ? `border-l-4 ${tagConfig.color}` : undefined}
```

如果 KanbanCard 的 `className` 属性已支持（需检查）。如果支持，色条就会自动生效。

若 tag 存在，用 Tooltip 包裹整个卡片或在卡片内显示 tooltip。

**Step 2: 运行前端类型检查**

Run: `pnpm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/tasks/TaskCard.tsx
git commit -m "feat(frontend): add left color bar to TaskCard based on tag"
```

---

### Task 8: TaskFormDialog — 标签选择器

**Files:**
- Modify: `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`

**Step 1: 扩展 TaskFormValues**

在 `TaskFormValues` type（line 79）中添加：

```typescript
tag: TaskTag | null;
```

**Step 2: 更新 defaultValues**

在各 mode 的 defaultValues 中添加 `tag: null`。edit 模式从 `props.task` 读取 tag（需扩展 Task interface）。

**Step 3: 更新 handleSubmit**

在创建 `CreateTask` 对象时（line 194）添加：

```typescript
tag: value.tag,
```

在更新 `UpdateTask` 时也传入 tag。

**Step 4: 添加标签选择器 UI**

在 description 字段和 status/autoStart 之间（约 line 469 后），添加标签选择器：

```tsx
{/* Tag selector — only for Task type (not Story) */}
{!isStoryCreate && (
  <form.Field name="tag">
    {(field) => (
      <div className="flex items-center gap-1.5 flex-wrap">
        {ALL_TASK_TAGS.map((tagKey) => {
          const config = TASK_TAG_CONFIGS[tagKey];
          const isSelected = field.state.value === tagKey;
          return (
            <button
              key={tagKey}
              type="button"
              onClick={() =>
                field.handleChange(isSelected ? null : tagKey)
              }
              className={cn(
                'px-2 py-0.5 rounded text-xs border transition-colors',
                isSelected
                  ? `${config.bgColor} border-current font-medium`
                  : 'border-border text-muted-foreground hover:border-foreground/30'
              )}
              title={config.label}
            >
              <span
                className={cn(
                  'inline-block w-2 h-2 rounded-full mr-1',
                  config.dotColor
                )}
              />
              {config.label}
            </button>
          );
        })}
      </div>
    )}
  </form.Field>
)}
```

**Step 5: 运行前端检查**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/dialogs/tasks/TaskFormDialog.tsx
git commit -m "feat(frontend): add tag selector to TaskFormDialog"
```

---

### Task 9: TaskKanbanBoard — 筛选芯片

**Files:**
- Modify: `frontend/src/components/tasks/TaskKanbanBoard.tsx`

**Step 1: 添加筛选状态和 UI**

导入配置：

```typescript
import { useState } from 'react';
import { ALL_TASK_TAGS, TASK_TAG_CONFIGS } from '@/config/task-tags';
import type { TaskTag } from 'shared/types';
import { cn } from '@/lib/utils';
```

在组件内添加筛选状态：

```typescript
const [tagFilter, setTagFilter] = useState<TaskTag | null>(null);
```

在 KanbanProvider 之前渲染筛选芯片行。

按 tagFilter 过滤每列的 tasks：

```typescript
const filteredTasks = tagFilter
  ? tasks.filter((t) => t.tag === tagFilter)
  : tasks;
```

**Step 2: 运行前端检查**

Run: `pnpm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/tasks/TaskKanbanBoard.tsx
git commit -m "feat(frontend): add tag filter chips to TaskKanbanBoard"
```

---

### Task 10: BrainstormTask 类型 + ExtractStoriesDialog — 传递 tag

**Files:**
- Modify: `frontend/src/utils/extractJsonCards.ts:3-6`
- Modify: `frontend/src/components/dialogs/stories/ExtractStoriesDialog.tsx:117-126`

**Step 1: 扩展 BrainstormTask 类型**

在 `extractJsonCards.ts` 的 `BrainstormTask` type（line 3）添加：

```typescript
export type BrainstormTask = {
  title: string;
  description?: string;
  tag?: string;
};
```

**Step 2: 更新 ExtractStoriesDialog 子任务创建**

在 `ExtractStoriesDialog.tsx` line 117-126 的 childTasksToCreate map 中，添加 tag 字段：

```typescript
const childTasksToCreate = card.tasks.map((task) => ({
  project_id: projectId,
  title: task.title,
  description: task.description || null,
  status: null,
  task_type: 'task' as const,
  parent_workspace_id: null,
  parent_task_id: story.id,
  image_ids: null,
  tag: task.tag || null,
}));
```

**Step 3: 运行前端检查**

Run: `pnpm run check`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/utils/extractJsonCards.ts frontend/src/components/dialogs/stories/ExtractStoriesDialog.tsx
git commit -m "feat(frontend): pass tag from brainstorm tasks to API on extraction"
```

---

### Task 11: 修复前端类型错误

**Files:**
- Modify: 各处需要补充 `tag` 字段的位置

**Step 1: 运行完整前端检查**

Run: `pnpm run check`

**Step 2: 逐个修复缺失的 tag 字段**

可能需要修复的位置：
- `buildStoryTask.ts:27-36` — CreateTask 对象中添加 `tag: null`
- `TaskFormDialog.tsx` 的 Task interface（line 56-64）— 如果 edit 模式需要读取 tag
- 其他使用 `CreateTask` 构造的位置

**Step 3: 运行检查通过**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add -u
git commit -m "fix(frontend): add missing tag field to all CreateTask usages"
```

---

### Task 12: 全量验证

**Step 1: Rust 测试**

Run: `cargo test --workspace`
Expected: ALL PASS

**Step 2: 前端检查**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

**Step 3: 类型一致性**

Run: `pnpm run generate-types:check`
Expected: PASS（类型已同步）

**Step 4: Commit 任何遗留修复**

---

### Task 13: 技能文件更新（手动）

**Files:**
- Modify: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/task-splitter/skill.md`
- Modify: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-cards/skill.md`
- Modify: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-task/skill.md`

**Step 1: 更新 task-splitter**

在 task-splitter 的输出格式中添加 tag 字段说明：

- 每个 task 对象新增 `"tag"` 字段
- 添加标签判断规则（涉及页面/组件 → ui-design，涉及接口 → api，等）

**Step 2: 更新 brainstorming-cards**

在编排器输出 schema 中确认 tasks 数组含 tag 字段。

**Step 3: 更新 brainstorming-task**

添加：检查当前 Task 的 tag 字段，如果非空则在对话开始时注入对应的上下文指令。

**Step 4: Commit**

```bash
git add -A  # skill 文件可能在插件缓存目录
git commit -m "feat(skills): update brainstorm skills to support task tags"
```
