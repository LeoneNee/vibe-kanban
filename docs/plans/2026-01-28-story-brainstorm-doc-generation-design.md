# Story Brainstorm 文档生成与任务执行系统设计

**设计日期**: 2026-01-28
**状态**: 设计完成，待实现

## 概述

为 Story Brainstorm 功能添加完整的文档生命周期管理：
1. 在启动 Brainstorm 前选择项目分支
2. 创建 Story/Task 时自动生成 markdown 文档
3. 执行 Task 时自动补充完整规格文档

## 设计目标

- **自动化文档生成**: Story/Task 创建时自动生成结构化文档
- **渐进式文档演进**: Brainstorm 时生成基础文档 → 执行时补充完整规格
- **分支感知**: 文档关联到具体的 Git 分支
- **细粒度任务拆分**: 后端一个 API 一个 Task，前端一个页面/组件/效果一个 Task

---

## 一、整体架构

### 1.1 核心流程

```
┌─────────────────────┐
│ Brainstorm 启动     │
│ - 选择项目分支      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ AI 对话生成 Stories │
│ - 拆解需求          │
│ - 生成 Task 列表    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 创建 Story/Task     │
│ - 数据库记录        │
│ - 自动生成文档      │  ← 统一入口
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 执行 Task           │
│ - 读取文档          │
│ - 补充完整规格      │
│ - 更新文档          │
│ - 开始编码          │
└─────────────────────┘
```

### 1.2 文档目录结构

```
docs/
  stories/
    123-user-authentication/
      README.md                    # Story 文档
      456-login-api.md             # Task 文档：后端登录 API
      457-login-form.md            # Task 文档：前端登录表单
      458-jwt-token-handling.md    # Task 文档：JWT 处理
    124-dashboard-ui/
      README.md
      459-dashboard-layout.md      # Task 文档：页面布局
      460-chart-component.md       # Task 文档：图表组件
      461-data-refresh-button.md   # Task 文档：刷新按钮
```

**命名规则**: `{id}-{slug}` 格式
- Story 目录：`123-user-authentication/`
- Story 文档：`123-user-authentication/README.md`
- Task 文档：`456-login-api.md`

---

## 二、前端实现

### 2.1 分支选择器（StoryBrainstormLaunch 页面）

**新增功能**:
- 展示所有项目关联的 repos
- 每个 repo 显示分支下拉选择器
- 默认值：`repo.default_target_branch`
- 快速操作："All repos use: [main/develop]"

**新增 Hook**:
```typescript
// hooks/useRepoBranches.ts
export function useRepoBranches(repoId: string) {
  return useQuery({
    queryKey: ['repo-branches', repoId],
    queryFn: () => api.getRepoBranches(repoId),
  });
}
```

**状态管理**:
```typescript
const [selectedBranches, setSelectedBranches] =
  useState<Record<string, string>>({});

// 构建 workspaceRepos
const workspaceRepos = projectRepos.map(repo => ({
  repo_id: repo.id,
  target_branch: selectedBranches[repo.id] || repo.default_target_branch,
}));
```

**UI 位置**: 在"Start Brainstorm"按钮上方，"How it works"说明下方

### 2.2 文档路径计算

前端需要能够计算文档路径用于展示：
```typescript
// utils/getTaskDocPath.ts
export function getTaskDocPath(
  task: Task,
  story?: Task
): string {
  const slugify = (str: string) =>
    str.toLowerCase()
       .replace(/[^a-z0-9]+/g, '-')
       .replace(/^-|-$/g, '');

  if (task.task_type === 'story') {
    const slug = slugify(task.title);
    return `docs/stories/${task.id}-${slug}/README.md`;
  } else {
    const storySlug = slugify(story.title);
    const taskSlug = slugify(task.title);
    return `docs/stories/${story.id}-${storySlug}/${task.id}-${taskSlug}.md`;
  }
}
```

---

## 三、后端实现

### 3.1 文档生成核心逻辑

**集成点**: `POST /tasks` 创建接口

```rust
// crates/server/src/routes/tasks.rs
async fn create_task(
    task_input: CreateTaskInput,
    workspace: Workspace,
) -> Result<Task> {
    // 1. 创建数据库记录
    let task = db.insert_task(task_input).await?;

    // 2. 如果是 Story，创建 parent Task（如果有）
    let parent_story = if task.task_type != TaskType::Story {
        db.get_task(task.parent_task_id?).await?
    } else {
        None
    };

    // 3. 生成文档
    generate_task_doc(&task, parent_story.as_ref(), &workspace).await?;

    Ok(task)
}
```

### 3.2 文档路径生成

```rust
// crates/services/src/task_doc.rs
pub fn get_task_doc_path(
    task: &Task,
    story: Option<&Task>,
    workspace: &Workspace,
) -> PathBuf {
    let repo_root = get_workspace_repo_root(workspace);
    let base = repo_root.join("docs/stories");

    match task.task_type {
        TaskType::Story => {
            let slug = slugify(&task.title);
            base.join(format!("{}-{}", task.id, slug))
                .join("README.md")
        }
        _ => {
            let story = story.expect("Task must have parent story");
            let story_slug = slugify(&story.title);
            let task_slug = slugify(&task.title);
            base.join(format!("{}-{}", story.id, story_slug))
                .join(format!("{}-{}.md", task.id, task_slug))
        }
    }
}

fn slugify(s: &str) -> String {
    s.to_lowercase()
     .chars()
     .map(|c| if c.is_alphanumeric() { c } else { '-' })
     .collect::<String>()
     .split('-')
     .filter(|s| !s.is_empty())
     .collect::<Vec<_>>()
     .join("-")
}
```

### 3.3 文档模板生成

**Story 文档模板（基础级别 - A）**:
```rust
fn generate_story_doc_template(story: &Task) -> String {
    format!(r#"# Story: {}

## 基本信息
- **ID**: {}
- **优先级**: {}
- **复杂度**: {}
- **状态**: {}
- **创建时间**: {}

## 描述

{}

## Tasks

<!-- Tasks 列表将在子任务创建时自动更新 -->

## 更新日志

- [{}] Story 创建
"#,
        story.title,
        story.id,
        story.priority.unwrap_or("Medium"),
        story.complexity.unwrap_or(3),
        story.status.unwrap_or("Pending"),
        story.created_at.format("%Y-%m-%d %H:%M"),
        story.description.as_deref().unwrap_or("待补充"),
        story.created_at.format("%Y-%m-%d")
    )
}
```

**Task 文档模板（实现要点级别 - B）**:
```rust
fn generate_task_doc_template(task: &Task, story: &Task) -> String {
    // 尝试从 task.description 中提取实现要点
    let implementation_hints = extract_implementation_hints(&task.description);

    format!(r#"# Task: {}

## 基本信息
- **ID**: {}
- **Story**: [{}-{}](./README.md)
- **类型**: {}
- **状态**: {}
- **创建时间**: {}

## 描述

{}

## 实现要点

{}

## 相关文件

<!-- 执行时自动补充 -->

## 更新日志

- [{}] Task 创建
"#,
        task.title,
        task.id,
        story.id,
        story.title,
        task.task_type,
        task.status.unwrap_or("Pending"),
        task.created_at.format("%Y-%m-%d %H:%M"),
        task.description.as_deref().unwrap_or("待补充"),
        implementation_hints,
        task.created_at.format("%Y-%m-%d")
    )
}

fn extract_implementation_hints(description: Option<&str>) -> String {
    // 从 Brainstorm AI 的输出中提取技术要点
    // 例如：如果 description 包含 "POST /api/auth/login"
    // 则提取为列表项
    description
        .and_then(|d| {
            // 简单实现：将描述按行分割，以 - 或 * 开头的视为要点
            let hints: Vec<_> = d.lines()
                .filter(|line| line.trim_start().starts_with('-')
                             || line.trim_start().starts_with('*'))
                .collect();

            if hints.is_empty() {
                None
            } else {
                Some(hints.join("\n"))
            }
        })
        .unwrap_or_else(|| "<!-- 待 Brainstorm 时补充 -->".to_string())
}
```

### 3.4 文档读写接口

**新增 API 端点**:

```rust
// GET /tasks/:id/doc - 读取文档内容
pub async fn get_task_doc(
    task_id: i32,
    db: &DbPool,
) -> Result<String> {
    let task = db.get_task(task_id).await?;
    let story = if task.task_type != TaskType::Story {
        Some(db.get_task(task.parent_task_id?).await?)
    } else {
        None
    };

    let workspace = db.get_workspace(task.workspace_id).await?;
    let doc_path = get_task_doc_path(&task, story.as_ref(), &workspace);

    tokio::fs::read_to_string(&doc_path)
        .await
        .map_err(|e| Error::DocumentNotFound(e.to_string()))
}

// PATCH /tasks/:id/doc - 更新文档内容
pub async fn update_task_doc(
    task_id: i32,
    update: UpdateTaskDocInput,
    db: &DbPool,
) -> Result<()> {
    let task = db.get_task(task_id).await?;
    let story = if task.task_type != TaskType::Story {
        Some(db.get_task(task.parent_task_id?).await?)
    } else {
        None
    };

    let workspace = db.get_workspace(task.workspace_id).await?;
    let doc_path = get_task_doc_path(&task, story.as_ref(), &workspace);

    // 读取现有文档
    let mut content = tokio::fs::read_to_string(&doc_path).await?;

    // 根据 section 更新对应章节
    content = update_doc_section(&content, &update.section, &update.content)?;

    // 写回文件
    tokio::fs::write(&doc_path, content).await?;

    // Git add
    git_add(&doc_path, &workspace)?;

    Ok(())
}

#[derive(Deserialize)]
pub struct UpdateTaskDocInput {
    pub section: DocSection,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocSection {
    ApiSpec,
    TestCases,
    Dependencies,
    Changelog,
    ImplementationHints,
}
```

### 3.5 文档章节更新逻辑

```rust
fn update_doc_section(
    doc_content: &str,
    section: &DocSection,
    new_content: &str,
) -> Result<String> {
    let section_header = match section {
        DocSection::ApiSpec => "## API 规格",
        DocSection::TestCases => "## 测试用例",
        DocSection::Dependencies => "## 依赖和风险",
        DocSection::Changelog => "## 更新日志",
        DocSection::ImplementationHints => "## 实现要点",
    };

    // 如果章节不存在，在文档末尾添加
    if !doc_content.contains(section_header) {
        return Ok(format!("{}\n\n{}\n\n{}",
            doc_content.trim_end(),
            section_header,
            new_content
        ));
    }

    // 如果章节存在，替换内容
    // 简化实现：找到 section_header，替换到下一个 ## 之前的内容
    // 生产环境建议使用成熟的 Markdown 解析库

    let lines: Vec<&str> = doc_content.lines().collect();
    let mut result = Vec::new();
    let mut in_target_section = false;
    let mut section_updated = false;

    for line in lines {
        if line.starts_with("## ") {
            if line == section_header {
                in_target_section = true;
                result.push(line);
                result.push(new_content);
                section_updated = true;
            } else {
                in_target_section = false;
                result.push(line);
            }
        } else if !in_target_section || !section_updated {
            result.push(line);
        }
    }

    Ok(result.join("\n"))
}
```

### 3.6 Git 集成

```rust
fn git_add(file_path: &Path, workspace: &Workspace) -> Result<()> {
    let repo_root = get_workspace_repo_root(workspace);

    std::process::Command::new("git")
        .arg("add")
        .arg(file_path)
        .current_dir(repo_root)
        .output()
        .map_err(|e| Error::GitError(e.to_string()))?;

    Ok(())
}
```

---

## 四、AI 集成与自动化

### 4.1 Brainstorming Skill 增强

在 `/brainstorming-cards` skill 中添加提示：

```markdown
当 AI 生成 Story 列表的 JSON 后，自动说明：

"这些 Story 创建后，系统会自动在 `docs/stories/` 目录下为每个 Story 和 Task 生成文档。
文档将包含：
- Story: 基本信息、描述、Tasks 列表
- Task: 基本信息、描述、实现要点

这些文档会随着开发过程不断更新，成为项目的技术知识库。"
```

### 4.2 Task 执行自动流程

**触发词识别**:
- `执行 task-456`
- `开始做 #456`
- `implement task 456`
- `开发登录 API 这个任务`

**自动执行流程**:

```python
# AI 伪代码
def execute_task(task_reference):
    # 1. 解析 Task 引用
    task_id = parse_task_reference(task_reference)

    # 2. 获取 Task 详情
    task = api.get(f"/tasks/{task_id}")
    story = api.get(f"/tasks/{task.parent_task_id}") if task.parent_task_id else None

    # 3. 读取现有文档
    doc_content = api.get(f"/tasks/{task_id}/doc")

    # 4. 分析文档完整度
    completeness = analyze_doc_completeness(doc_content)

    # 5. 主动说明当前状态
    print(f"准备执行 Task #{task_id}: {task.title}")
    print(f"当前文档完整度: {completeness}")
    print(f"\n现有实现要点:\n{extract_section(doc_content, 'implementation_hints')}")

    # 6. 发起补充讨论
    print("\n在开始实现前，让我们先确认几个关键细节：")

    if task.task_type == "backend_api":
        discuss_api_spec(task)
    elif task.task_type == "frontend_page":
        discuss_page_spec(task)
    elif task.task_type == "frontend_component":
        discuss_component_spec(task)

    # 7. 更新文档
    api.patch(f"/tasks/{task_id}/doc", {
        "section": "api_spec",
        "content": collected_spec
    })

    api.patch(f"/tasks/{task_id}/doc", {
        "section": "test_cases",
        "content": collected_tests
    })

    api.patch(f"/tasks/{task_id}/doc", {
        "section": "changelog",
        "content": f"[{today}] 执行前讨论完成，补充完整规格"
    })

    # 8. 开始实现
    print("\n✅ 规格已确认并更新到文档，现在开始实现...")
    codex(f"实现 {task.title}，参考文档: {doc_path}")
```

**针对不同类型的讨论问题**:

```python
def discuss_api_spec(task):
    questions = [
        "请求方法和路径？（如 POST /api/auth/login）",
        "请求参数有哪些？格式是什么？",
        "成功响应返回什么？",
        "可能的错误情况有哪些？错误码如何定义？",
        "是否需要认证？使用什么认证方式？",
    ]
    # 逐个提问并收集答案

def discuss_page_spec(task):
    questions = [
        "页面的核心布局是什么？（如左侧边栏 + 主内容区）",
        "页面需要哪些主要组件？",
        "页面的状态管理用什么方案？（如 Zustand/Context）",
        "需要调用哪些 API？",
        "页面路由路径是什么？",
    ]

def discuss_component_spec(task):
    questions = [
        "组件的 Props 定义有哪些？",
        "组件内部有哪些状态？",
        "组件需要哪些事件处理？",
        "组件的样式方案？（Tailwind classes/CSS modules）",
        "组件是否需要测试？",
    ]
```

### 4.3 系统提示词更新

在 `CLAUDE.md` 中添加：

```markdown
## Story & Task 文档规范

### 文档结构
- 所有 Story 和 Task 都有对应的 markdown 文档在 `docs/stories/` 目录
- Story: `docs/stories/{id}-{slug}/README.md`
- Task: `docs/stories/{story_id}-{slug}/{task_id}-{slug}.md`

### 文档级别
- **级别 A（创建时）**: 基本信息 + 描述 + 实现要点
- **级别 B（执行前）**: + API规格 + 测试用例 + 依赖风险
- **级别 C（执行中）**: + 更新日志记录关键决策

### AI 工作流
1. **创建 Story/Task**: 后端自动生成级别 A 文档
2. **执行 Task 时**:
   - 使用 `GET /tasks/:id/doc` 读取文档
   - 分析完整度，发起 brainstorming 补充到级别 B
   - 使用 `PATCH /tasks/:id/doc` 更新各章节
   - 调用 `codex` skill 开始实现
3. **执行过程中**: 关键决策记录到 changelog 章节

### API 接口
- `GET /tasks/:id/doc` - 读取文档内容
- `PATCH /tasks/:id/doc` - 更新文档章节
  ```json
  {
    "section": "api_spec" | "test_cases" | "dependencies" | "changelog",
    "content": "markdown content"
  }
  ```
```

---

## 五、实现计划

### 5.1 前端任务

1. **分支选择器** (frontend/src/pages/StoryBrainstormLaunch.tsx)
   - [ ] 添加 `useRepoBranches` hook
   - [ ] 添加分支选择 UI 组件
   - [ ] 修改 `workspaceRepos` 构建逻辑
   - [ ] 添加表单验证

2. **文档路径工具** (frontend/src/utils/getTaskDocPath.ts)
   - [ ] 实现 `slugify` 函数
   - [ ] 实现 `getTaskDocPath` 函数
   - [ ] 添加单元测试

3. **API 客户端** (frontend/src/api 或相关位置)
   - [ ] 添加 `GET /tasks/:id/doc`
   - [ ] 添加 `PATCH /tasks/:id/doc`
   - [ ] 添加 TypeScript 类型定义

### 5.2 后端任务

1. **文档生成核心** (crates/services/src/task_doc.rs - 新文件)
   - [ ] 实现 `slugify` 函数
   - [ ] 实现 `get_task_doc_path` 函数
   - [ ] 实现 `generate_story_doc_template`
   - [ ] 实现 `generate_task_doc_template`
   - [ ] 实现 `extract_implementation_hints`
   - [ ] 实现 `git_add` 函数

2. **集成到 Task 创建** (crates/server/src/routes/tasks.rs)
   - [ ] 修改 `create_task` 函数，调用文档生成
   - [ ] 处理文档生成失败的错误
   - [ ] 确保 Story 目录创建

3. **文档读写 API** (crates/server/src/routes/task_docs.rs - 新文件)
   - [ ] 实现 `GET /tasks/:id/doc`
   - [ ] 实现 `PATCH /tasks/:id/doc`
   - [ ] 实现 `update_doc_section` 函数
   - [ ] 添加错误处理（文档不存在等）

4. **数据模型** (crates/db/src 相关位置)
   - [ ] 确认 `WorkspaceRepo` 已有 `target_branch` 字段
   - [ ] 添加 `UpdateTaskDocInput` 和 `DocSection` 类型
   - [ ] 添加必要的序列化/反序列化

5. **Rust 依赖**
   - [ ] 检查是否需要添加 Markdown 解析库（可选）
   - [ ] 检查文件系统操作相关依赖

### 5.3 AI 集成任务

1. **Brainstorming Skill 更新**
   - [ ] 在 skill 中添加文档生成说明
   - [ ] 测试 AI 是否正确说明文档生成

2. **Task 执行 Skill** (可能需要新建 skill)
   - [ ] 创建 `/execute-task` skill 或在系统提示词中添加
   - [ ] 实现触发词识别逻辑
   - [ ] 实现针对不同 Task 类型的讨论模板
   - [ ] 实现文档完整度分析
   - [ ] 集成 codex skill 调用

3. **系统提示词**
   - [ ] 更新 CLAUDE.md 添加文档规范章节
   - [ ] 测试 AI 是否遵循新规范

### 5.4 测试任务

1. **单元测试**
   - [ ] Rust: `slugify` 函数测试
   - [ ] Rust: `get_task_doc_path` 测试
   - [ ] Rust: 文档模板生成测试
   - [ ] TypeScript: 前端工具函数测试

2. **集成测试**
   - [ ] 创建 Story 时文档生成测试
   - [ ] 创建 Task 时文档生成测试
   - [ ] 文档读取 API 测试
   - [ ] 文档更新 API 测试
   - [ ] Git add 集成测试

3. **E2E 测试**
   - [ ] 完整的 Brainstorm → 创建 → 文档生成流程
   - [ ] 执行 Task → 补充文档 → 开始编码流程
   - [ ] 分支选择 → 文档关联正确分支

---

## 六、关键技术决策

### 6.1 文档路径使用计算而非存储

**决策**: 不在数据库中存储 `doc_path`，始终通过规则计算

**理由**:
- 路径规则固定，计算成本低
- 避免数据冗余
- 简化数据库 schema
- 改标题时可选择是否重命名文件

### 6.2 文档生成在后端统一处理

**决策**: 后端 `/tasks` 创建接口统一负责文档生成，前端和 AI 都通过此入口

**理由**:
- 确保无论哪种创建方式，文档都被生成
- 文档格式和路径一致性
- Git 操作在后端更安全
- 前端无需文件系统权限

### 6.3 渐进式文档级别

**决策**: 创建时生成基础文档（A），执行时补充完整（B），执行中更新（C）

**理由**:
- Brainstorm 阶段信息有限，避免生成大量空白章节
- 执行时强制补充规格，确保实现质量
- 更新日志记录关键决策，形成知识库

### 6.4 文档更新使用章节式 API

**决策**: `PATCH /tasks/:id/doc` 支持按章节更新，而非覆盖整个文档

**理由**:
- 避免并发更新冲突
- AI 可以增量更新特定部分
- 保留其他章节的内容
- 更新日志可以追加而非替换

### 6.5 AI 自动触发文档补充

**决策**: 识别到"执行 Task"指令时，AI 自动读取文档并发起补充讨论

**理由**:
- 确保每个 Task 执行前都有完整规格
- 减少遗漏和错误
- 形成统一的工作流程
- 文档自动保持最新

---

## 七、风险和依赖

### 7.1 风险

1. **文件系统权限**
   - 风险：后端可能没有写入 repo 的权限
   - 缓解：提前检查权限，清晰的错误提示

2. **Git 冲突**
   - 风险：多人同时修改同一 Story 的文档
   - 缓解：文档按 Task 分离，冲突概率低；提供冲突解决指南

3. **文档与数据库不一致**
   - 风险：文档生成失败但数据库记录已创建
   - 缓解：事务处理；失败时回滚或标记需要重新生成

4. **Slug 冲突**
   - 风险：不同 Task 的 slug 可能相同
   - 缓解：使用 ID 前缀确保唯一性

### 7.2 依赖

1. **Git 可用性**
   - 后端需要能够执行 `git add` 命令
   - Workspace 必须关联到 Git repo

2. **文件系统访问**
   - 后端需要读写 `docs/stories/` 目录的权限

3. **Brainstorming Skill**
   - AI 需要能够输出结构化的 JSON 格式
   - 依赖 `/brainstorming-cards` skill 正常工作

4. **Codex Skill**
   - 执行阶段依赖 `codex` skill 进行实现

---

## 八、未来扩展

### 8.1 文档模板自定义
- 允许项目自定义文档模板
- 支持不同类型 Task 的专用模板

### 8.2 文档版本控制
- 记录文档的历史版本
- 支持回退到之前的规格

### 8.3 文档搜索和索引
- 全文搜索所有 Story/Task 文档
- 生成项目知识图谱

### 8.4 文档导出
- 导出为 PDF/HTML
- 生成项目手册

### 8.5 智能文档补全
- AI 根据代码自动更新文档
- 检测文档与代码的不一致

---

## 九、验收标准

### 9.1 分支选择
- [ ] Brainstorm 启动页面显示所有 repos
- [ ] 每个 repo 可以独立选择分支
- [ ] 默认使用 `default_target_branch`
- [ ] 分支信息正确传递到后端

### 9.2 文档生成
- [ ] 创建 Story 时自动生成 `{id}-{slug}/README.md`
- [ ] 创建 Task 时自动生成 `{id}-{slug}.md`
- [ ] 文档内容符合模板规范
- [ ] 文档自动 `git add`

### 9.3 文档读写
- [ ] `GET /tasks/:id/doc` 正确返回文档内容
- [ ] `PATCH /tasks/:id/doc` 正确更新指定章节
- [ ] 更新后文档格式正确
- [ ] 错误处理完善（文档不存在等）

### 9.4 AI 集成
- [ ] 识别"执行 Task"指令
- [ ] 自动读取文档
- [ ] 发起针对性补充讨论
- [ ] 更新文档到完整级别
- [ ] 调用 codex 开始实现

### 9.5 E2E 流程
- [ ] Brainstorm → 选择分支 → 创建 Story → 文档生成
- [ ] 创建 Task → 文档生成 → 执行 Task → 文档补充
- [ ] 文档内容准确反映 Story/Task 状态

---

## 十、实现优先级

### P0 (必须)
1. 后端文档生成核心逻辑
2. 集成到 Task 创建接口
3. 文档读取 API (`GET /tasks/:id/doc`)
4. 基础文档模板（级别 A 和 B）

### P1 (重要)
1. 前端分支选择器
2. 文档更新 API (`PATCH /tasks/:id/doc`)
3. AI 执行 Task 自动流程
4. 系统提示词更新

### P2 (可选)
1. Brainstorming skill 说明增强
2. 复杂的文档章节解析
3. Git 冲突处理
4. E2E 测试覆盖

---

## 总结

这个设计实现了 Story Brainstorm 的完整文档生命周期：

1. **自动化**: 创建即生成，无需手动维护
2. **渐进式**: 从基础到完整，随开发过程演进
3. **智能化**: AI 自动补充和更新文档
4. **结构化**: 统一的目录和命名规范
5. **可追溯**: 更新日志记录关键决策

文档成为项目的"第二大脑"，既是规划工具，也是知识库。
