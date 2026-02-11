# 脑暴文档功能修复计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复脑暴完成后保存文档功能的关键问题，确保文档能正确生成和保存

**Architecture:**
1. 统一 `parent_task_id` 和 `parent_workspace_id` 的处理逻辑
2. 修复 slugify 对中文的支持，使用 fallback 策略
3. 增强前端错误处理和用户反馈

**Tech Stack:** Rust (后端), TypeScript/React (前端), SQLx (数据库)

---

## 任务概览

| 任务 | 优先级 | 影响范围 | 预估 |
|------|--------|----------|------|
| Task 1: 修复 slugify 中文支持 | P0 | 后端 | 15min |
| Task 2: 修复 task_docs API 支持 parent_task_id | P0 | 后端 | 20min |
| Task 3: 修复 Task 创建时文档生成逻辑 | P1 | 后端 | 15min |
| Task 4: 增强前端保存错误处理 | P2 | 前端 | 10min |
| Task 5: 增强内容提取逻辑 | P2 | 前端 | 15min |
| Task 6: 集成测试验证 | P1 | 全栈 | 10min |

---

## Task 1: 修复 slugify 中文支持

**目标:** 确保中文标题能生成有效的 slug，避免空路径

**Files:**
- Modify: `crates/services/src/task_doc.rs:4-13` (slugify 函数)
- Modify: `crates/services/src/task_doc.rs:69-72` (测试用例)

### Step 1: 编写失败测试

在 `crates/services/src/task_doc.rs` 中添加测试：

```rust
#[test]
fn test_slugify_chinese_only() {
    // 纯中文标题应该生成 fallback slug
    let result = slugify("用户登录功能");
    assert!(!result.is_empty(), "slug should not be empty for Chinese-only titles");
    assert!(result.starts_with("task-"), "Chinese-only slug should use fallback prefix");
}

#[test]
fn test_slugify_mixed_chinese_english() {
    // 中英混合应该保留英文部分
    assert_eq!(slugify("用户 Login API"), "login-api");
}
```

### Step 2: 运行测试验证失败

```bash
cargo test -p services slugify -- --nocapture
```

预期: FAIL - `test_slugify_chinese_only` 会失败

### Step 3: 修改 slugify 实现

修改 `crates/services/src/task_doc.rs:4-13`:

```rust
pub fn slugify(s: &str) -> String {
    let slug = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    // 如果 slug 为空（如纯中文标题），使用 fallback
    if slug.is_empty() {
        format!("task-{}", &uuid::Uuid::new_v4().to_string()[..8])
    } else {
        slug
    }
}
```

### Step 4: 更新现有测试期望

修改 `crates/services/src/task_doc.rs:69-72`:

```rust
#[test]
fn test_slugify_chinese() {
    // 中英混合：保留英文部分
    assert_eq!(slugify("用户登录 API"), "api");
}
```

### Step 5: 运行测试验证通过

```bash
cargo test -p services slugify -- --nocapture
```

预期: PASS

### Step 6: 提交

```bash
git add crates/services/src/task_doc.rs
git commit -m "fix(task_doc): handle Chinese-only titles in slugify with fallback"
```

---

## Task 2: 修复 task_docs API 支持 parent_task_id

**目标:** 让文档 API 同时支持通过 `parent_task_id` 或 `parent_workspace_id` 查找 parent story

**Files:**
- Modify: `crates/server/src/routes/task_docs.rs:37-78` (get_task_doc)
- Modify: `crates/server/src/routes/task_docs.rs:81-151` (update_task_doc)

### Step 1: 提取公共函数

在 `crates/server/src/routes/task_docs.rs` 顶部添加辅助函数：

```rust
/// 获取 Task 的 parent story，支持两种关联方式
async fn get_parent_story_for_task(
    pool: &sqlx::SqlitePool,
    task: &Task,
) -> Result<Option<Task>, ApiError> {
    if task.task_type != TaskType::Task {
        return Ok(None);
    }

    // 方式1: 通过 parent_task_id 直接关联
    if let Some(parent_task_id) = task.parent_task_id {
        let parent = Task::find_by_id(pool, parent_task_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Parent task not found".to_string()))?;
        return Ok(Some(parent));
    }

    // 方式2: 通过 parent_workspace_id 间接关联
    if let Some(parent_workspace_id) = task.parent_workspace_id {
        let parent_workspace = Workspace::find_by_id(pool, parent_workspace_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Parent workspace not found".to_string()))?;
        let parent = Task::find_by_id(pool, parent_workspace.task_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Parent task not found".to_string()))?;
        return Ok(Some(parent));
    }

    Err(ApiError::BadRequest(
        "Task must have either parent_task_id or parent_workspace_id".to_string(),
    ))
}
```

### Step 2: 重构 get_task_doc

修改 `crates/server/src/routes/task_docs.rs` 中的 `get_task_doc`:

```rust
pub async fn get_task_doc(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<String, ApiError> {
    let pool = &deployment.db().pool;

    // 使用新的辅助函数获取 parent story
    let parent_story = get_parent_story_for_task(pool, &task).await?;

    // 获取 workspace 和 repo - 需要处理两种情况
    let workspace = if let Some(ref parent) = parent_story {
        // 如果是 Task，需要从 parent story 获取 workspace
        Workspace::fetch_all(pool, Some(parent.id))
            .await?
            .into_iter()
            .next()
    } else {
        // 如果是 Story，直接获取自己的 workspace
        Workspace::fetch_all(pool, Some(task.id))
            .await?
            .into_iter()
            .next()
    }
    .ok_or_else(|| ApiError::BadRequest("No workspace found".to_string()))?;

    let repo = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::BadRequest("No repo found".to_string()))?;

    let doc_path = get_task_doc_path(&task, parent_story.as_ref(), &repo.path);
    match fs::read_to_string(doc_path).await {
        Ok(contents) => Ok(contents),
        Err(err) if err.kind() == io::ErrorKind::NotFound => {
            Err(ApiError::BadRequest("Doc not found".to_string()))
        }
        Err(err) => Err(ApiError::Io(err)),
    }
}
```

### Step 3: 重构 update_task_doc

同样修改 `update_task_doc` 使用新的辅助函数（参考上面的模式）

### Step 4: 运行后端检查

```bash
pnpm run backend:check
```

预期: PASS

### Step 5: 提交

```bash
git add crates/server/src/routes/task_docs.rs
git commit -m "fix(task_docs): support both parent_task_id and parent_workspace_id"
```

---

## Task 3: 修复 Task 创建时文档生成逻辑

**目标:** 确保使用 `parent_task_id` 创建的 Task 也能生成文档

**Files:**
- Modify: `crates/server/src/routes/tasks.rs:175-193` (create_task 函数)

### Step 1: 修改 create_task 中的文档生成逻辑

在 `crates/server/src/routes/tasks.rs` 中，修改文档生成部分：

```rust
// Generate task doc for Task-type tasks
if task.task_type == TaskType::Task {
    // 获取 repo 路径 - 需要从关联的 workspace 获取
    let repo_path = if let Some(parent_workspace_id) = task.parent_workspace_id {
        // 方式1: 通过 parent_workspace_id
        let repos = WorkspaceRepo::find_repos_for_workspace(pool, parent_workspace_id).await;
        repos.ok().and_then(|r| r.first().map(|r| r.path.clone()))
    } else if let Some(parent_task_id) = task.parent_task_id {
        // 方式2: 通过 parent_task_id 找到其 workspace
        let parent_workspaces = Workspace::fetch_all(pool, Some(parent_task_id)).await.ok();
        if let Some(ws) = parent_workspaces.and_then(|w| w.into_iter().next()) {
            let repos = WorkspaceRepo::find_repos_for_workspace(pool, ws.id).await;
            repos.ok().and_then(|r| r.first().map(|r| r.path.clone()))
        } else {
            None
        }
    } else {
        None
    };

    if let Some(repo_path) = repo_path {
        // 获取 parent story
        let parent_story = if let Some(parent_task_id) = task.parent_task_id {
            Task::find_by_id(pool, parent_task_id).await.ok().flatten()
        } else if let Some(parent_workspace_id) = task.parent_workspace_id {
            if let Ok(Some(parent_workspace)) = Workspace::find_by_id(pool, parent_workspace_id).await {
                Task::find_by_id(pool, parent_workspace.task_id).await.ok().flatten()
            } else {
                None
            }
        } else {
            None
        };

        if let Some(parent_story) = parent_story {
            if let Err(e) = generate_task_doc(&task, Some(&parent_story), &repo_path).await {
                tracing::warn!("Failed to generate task doc for task {}: {}", task.id, e);
            }
        }
    }
}
```

### Step 2: 运行后端检查

```bash
pnpm run backend:check
```

预期: PASS

### Step 3: 提交

```bash
git add crates/server/src/routes/tasks.rs
git commit -m "fix(tasks): generate doc for tasks with parent_task_id"
```

---

## Task 4: 增强前端保存错误处理

**目标:** 保存失败时显示用户友好的错误提示

**Files:**
- Modify: `frontend/src/components/workspace/SaveBrainstormResultButton.tsx`

### Step 1: 添加错误状态和 toast

```typescript
import { useState, useMemo } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { useEntries } from '@/contexts/EntriesContext';
import { useTask } from '@/hooks/useTask';
import { Button } from '@/components/ui/button';
import { tasksApi } from '@/lib/api';
import { toast } from 'sonner';  // 添加 toast
import type { WorkspaceWithSession } from '@/types/attempt';

// ... 保持 extractMarkdownContent 不变 ...

export function SaveBrainstormResultButton({
  workspaceWithSession,
}: SaveBrainstormResultButtonProps) {
  const { entries } = useEntries();
  const { data: task } = useTask(workspaceWithSession?.task_id);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);  // 添加错误状态

  // ... 保持 isBrainstormTask 和 markdownContent 不变 ...

  const handleSave = async () => {
    if (!markdownContent || !task?.parent_task_id) return;

    setIsSaving(true);
    setError(null);
    try {
      await tasksApi.updateDoc(
        task.parent_task_id,
        'implementation_hints',
        markdownContent
      );
      setSaved(true);
      toast.success('脑暴结果已保存到任务文档');
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败，请重试';
      setError(message);
      toast.error(`保存失败: ${message}`);
      console.error('Failed to save brainstorm result:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Button
      onClick={handleSave}
      disabled={isSaving || saved}
      variant={error ? 'destructive' : 'default'}
      className="fixed bottom-6 right-6 z-50 shadow-lg"
      size="lg"
    >
      {saved ? (
        <>
          <Check className="mr-2 h-5 w-5" />
          已保存
        </>
      ) : error ? (
        <>
          <AlertCircle className="mr-2 h-5 w-5" />
          重试保存
        </>
      ) : isSaving ? (
        <>
          <span className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" />
          保存中...
        </>
      ) : (
        <>
          <Save className="mr-2 h-5 w-5" />
          保存到任务文档
        </>
      )}
    </Button>
  );
}
```

### Step 2: 运行前端检查

```bash
pnpm run check
```

预期: PASS

### Step 3: 提交

```bash
git add frontend/src/components/workspace/SaveBrainstormResultButton.tsx
git commit -m "feat(frontend): add error handling and toast for save brainstorm result"
```

---

## Task 5: 增强内容提取逻辑

**目标:** 支持更多格式的脑暴内容提取

**Files:**
- Modify: `frontend/src/components/workspace/SaveBrainstormResultButton.tsx:13-37`

### Step 1: 增强 extractMarkdownContent 函数

```typescript
function extractMarkdownContent(entries: any[]): string | null {
  // 从后往前查找最后一条助手消息
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry?.type === 'NORMALIZED_ENTRY' &&
      entry?.data?.type === 'assistant_message'
    ) {
      const content = entry.data.content;
      if (typeof content !== 'string') continue;

      // 1. 查找 markdown 代码块
      const markdownMatch = content.match(/```markdown\s*([\s\S]*?)```/);
      if (markdownMatch) {
        return markdownMatch[1].trim();
      }

      // 2. 查找多种可能的章节标题（按优先级）
      const sectionHeaders = [
        '## 需求细节',
        '## 实现要点',
        '## Implementation Details',
        '## Requirements',
        '## 功能描述',
        '## 技术方案',
      ];

      for (const header of sectionHeaders) {
        if (content.includes(header)) {
          const startIdx = content.indexOf(header);
          return content.slice(startIdx).trim();
        }
      }

      // 3. 如果消息足够长且包含列表，可能是有效内容
      if (content.length > 200 && (content.includes('- ') || content.includes('* '))) {
        // 提取从第一个 ## 开始的内容
        const h2Match = content.match(/(## .+[\s\S]*)/);
        if (h2Match) {
          return h2Match[1].trim();
        }
      }
    }
  }
  return null;
}
```

### Step 2: 添加"无内容"状态提示

在组件中添加调试信息（可选，开发时使用）：

```typescript
// 在 canSave 判断后添加
const showNoContentHint = isBrainstormTask && !markdownContent && task?.parent_task_id;

// 在 return 之前添加
if (showNoContentHint) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-muted text-muted-foreground px-4 py-2 rounded-lg text-sm">
      等待 AI 生成包含 "## 需求细节" 的内容...
    </div>
  );
}
```

### Step 3: 运行前端检查

```bash
pnpm run check
```

预期: PASS

### Step 4: 提交

```bash
git add frontend/src/components/workspace/SaveBrainstormResultButton.tsx
git commit -m "feat(frontend): enhance brainstorm content extraction with multiple formats"
```

---

## Task 6: 集成测试验证

**目标:** 端到端验证修复后的功能正常工作

### Step 1: 启动开发服务器

```bash
pnpm run dev:qa
```

### Step 2: 手动测试场景

1. **测试中文标题 slug 生成**
   - 创建标题为纯中文的 Story（如"用户登录功能"）
   - 验证 `docs/stories/` 下生成了有效的目录

2. **测试脑暴保存功能**
   - 在任意 Task 上点击 Brainstorm
   - 完成脑暴对话
   - 点击 "保存到任务文档" 按钮
   - 验证：
     - 成功时显示 toast 提示
     - 查看原 Task 文档，确认 "## 实现要点" 已更新

3. **测试错误处理**
   - 临时断开后端
   - 点击保存按钮
   - 验证显示错误提示和重试按钮

### Step 3: 运行自动化测试

```bash
cargo test --workspace
pnpm run check
```

预期: 全部 PASS

### Step 4: 最终提交

```bash
git add -A
git commit -m "test: verify brainstorm doc fixes with integration testing"
```

---

## 验收标准

- [ ] 中文标题的 Story/Task 能生成有效的文档路径
- [ ] 通过 `parent_task_id` 关联的 Task 能正确读取/更新文档
- [ ] 脑暴保存失败时显示用户友好的错误提示
- [ ] 支持多种格式的脑暴内容提取
- [ ] 所有测试通过

---

## 回滚计划

如果修复引入新问题：

```bash
git revert HEAD~N  # N = 需要回滚的提交数
```

关键文件备份：
- `crates/services/src/task_doc.rs`
- `crates/server/src/routes/task_docs.rs`
- `crates/server/src/routes/tasks.rs`
- `frontend/src/components/workspace/SaveBrainstormResultButton.tsx`
