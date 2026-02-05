# Brainstorming Skill 链式编排实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建 3 个新 Skill（story-doc-generator、task-splitter、brainstorming-task）并修改 brainstorming-cards 实现链式编排。

**Architecture:** 所有 Skill 以 markdown 文件形式存在，通过 Claude 的 Skill 调用机制实现链式编排。Skill 之间通过对话上下文传递信息，不依赖外部状态存储。

**Tech Stack:** Markdown、Claude Skill 系统

---

## Task 1: 创建 story-doc-generator Skill

**Files:**
- Create: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/story-doc-generator/skill.md`

**Step 1: 创建目录**

```bash
mkdir -p ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/story-doc-generator
```

**Step 2: 创建 skill.md 文件**

```markdown
---
name: story-doc-generator
description: "根据 Story 卡片和对话内容生成详细的 Story markdown 文档（7章节）"
---

# Story 文档生成器

## 目标

根据 Story 卡片信息和 brainstorming-cards 对话上下文，为每个 Story 生成详细的 markdown 文档。

## 输入

- Story 卡片 JSON（id、title、description、priority、complexity、notes）
- brainstorming-cards 对话上下文（需求澄清内容）

## 输出

为每个 Story 生成 markdown 文档，包含 7 个章节。

## 文档模板

```markdown
# {Story 标题}

## 用户故事
作为 [角色]，我希望 [功能]，以便 [价值]。

## 功能需求
- [ ] 需求点 1
- [ ] 需求点 2
- [ ] ...

## 非功能需求
- 性能：...
- 安全：...
- 兼容性：...

## 验收标准
| 场景 | 输入/操作 | 预期结果 |
|------|----------|----------|
| ... | ... | ... |

## 技术方案建议
- 前端：...
- 后端：...
- 数据：...

## 风险与依赖
- 风险：...
- 依赖：...
- 约束：...
```

## 内容提取规则

从对话上下文中提取：

| 章节 | 提取来源 |
|------|----------|
| 用户故事 | 用户描述的需求意图、目标用户、期望价值 |
| 功能需求 | Story 的 description + 对话中提到的具体功能点 |
| 非功能需求 | 对话中提到的性能、安全、兼容性要求 |
| 验收标准 | 对话中的边界条件、预期行为、成功标准 |
| 技术方案建议 | 对话中涉及的技术选型、架构约束 |
| 风险与依赖 | Story 的 notes + 对话中提到的风险、依赖 |

## 流程

1. 接收 Story 卡片列表
2. 逐个处理每个 Story：
   - 根据对话上下文提取相关信息
   - 填充文档模板
   - 展示给用户确认
3. 用户确认后，输出所有 Story 文档
4. 自动调用 task-splitter 进入下一阶段

## 注意事项

- 如果某个章节信息不足，标注 "待补充" 而非留空
- 保持文档简洁，避免冗余
- 验收标准必须可测试、可验证
```

**Step 3: 验证文件创建**

```bash
ls -la ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/story-doc-generator/
cat ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/story-doc-generator/skill.md
```

Expected: 文件存在且内容正确

**Step 4: Commit**

```bash
cd ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/
git add story-doc-generator/
git commit -m "feat: add story-doc-generator skill"
```

---

## Task 2: 创建 task-splitter Skill

**Files:**
- Create: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/task-splitter/skill.md`

**Step 1: 创建目录**

```bash
mkdir -p ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/task-splitter
```

**Step 2: 创建 skill.md 文件**

```markdown
---
name: task-splitter
description: "分析 Story 内容，建议 Task 拆分方案，用户确认后生成 Task 卡片"
---

# Task 拆分器

## 目标

分析 Story 文档内容，将 Story 拆分为可执行的 Task 列表，由用户确认后生成 Task 卡片和初始文档。

## 输入

- Story 文档（7 章节完整内容）
- Story 卡片基本信息

## 输出

- Task 卡片 JSON 列表
- 每个 Task 的初始占位文档

## 拆分原则

- **Task** = 单一职责的开发任务，可独立完成和测试
- 每个 Task 聚焦一个具体实现点
- Task 数量适中（3-7 个为佳）
- 遵循依赖顺序：基础设施 → 数据层 → 业务逻辑 → 界面

## 流程

### 1. 分析 Story

读取 Story 文档，识别：
- 功能需求中的具体功能点
- 技术方案中的实现层次
- 可能的依赖关系

### 2. 生成 Task 建议

展示建议列表：

```
建议将此 Story 拆分为以下 Task：

1. [Task 标题] - 简要描述
2. [Task 标题] - 简要描述
3. [Task 标题] - 简要描述

请确认或调整（输入数字修改对应项，或直接确认）：
```

### 3. 用户确认/调整

- 用户可添加、删除、修改 Task
- 用户确认后生成最终列表

### 4. 生成 Task 卡片和文档

Task 卡片格式：

```json
{
  "id": "task-1",
  "title": "任务标题（动词开头）",
  "description": "一句话描述任务范围",
  "story_id": "关联的 Story ID",
  "status": "pending",
  "priority": "high|medium|low"
}
```

Task 初始文档格式：

```markdown
# {Task 标题}

## 需求描述
{从拆分建议中提取的描述}

---
> 请使用 brainstorming-task 进行详细需求澄清
```

### 5. 循环处理

对每个 Story 重复以上流程，直到所有 Story 的 Task 都拆分完成。

## 常见拆分模式

| Story 类型 | 典型 Task 拆分 |
|-----------|---------------|
| CRUD 功能 | 数据模型 → API 端点 → 前端组件 → 集成测试 |
| UI 功能 | 组件设计 → 状态管理 → 事件处理 → 样式调整 |
| 集成功能 | 接口定义 → 适配器实现 → 错误处理 → 端到端测试 |

## 注意事项

- Task 标题使用动词开头（创建、实现、添加、修复）
- 描述要简短但足够区分不同 Task
- 考虑 Task 之间的依赖顺序
```

**Step 3: 验证文件创建**

```bash
ls -la ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/task-splitter/
cat ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/task-splitter/skill.md
```

Expected: 文件存在且内容正确

**Step 4: Commit**

```bash
cd ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/
git add task-splitter/
git commit -m "feat: add task-splitter skill"
```

---

## Task 3: 创建 brainstorming-task Skill

**Files:**
- Create: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-task/skill.md`

**Step 1: 创建目录**

```bash
mkdir -p ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-task
```

**Step 2: 创建 skill.md 文件**

```markdown
---
name: brainstorming-task
description: "Task 级别全流程澄清：需求 → 技术 → 实现，生成完整 Task 文档（8章节）"
---

# Task 需求澄清（全流程型）

## 目标

通过自由对话，澄清 Task 的需求细节、技术方案和实现要点，最终生成完整的 Task 文档。

## 输入

- Task 基本信息（title、description）
- 关联的 Story 文档（提供上下文）

## 输出

完整的 Task 文档（8 章节）

## 对话流程

### 1. 初始化

- 读取 Task 基本信息
- 读取关联 Story 文档
- 读取现有 Task 文档（如存在）
- 从 Story 上下文中提取与本 Task 相关的信息

### 2. 自由对话

采用自由流程，AI 根据对话内容灵活切换关注维度：

**需求维度：**
- 具体要实现什么功能？
- 边界条件是什么？
- 有哪些异常情况需要处理？

**技术维度：**
- 涉及哪些模块/文件？
- 需要哪些接口变更？
- 数据结构如何设计？

**实现维度：**
- 具体修改哪些代码？
- 实现步骤是什么？
- 如何测试验证？

### 3. 对话策略

- 每次只问一个问题
- 优先提供选择题（基于 Story 上下文和代码库分析）
- 自动关联 Story 文档内容，避免重复询问已知信息
- 根据回答灵活追问或切换维度
- 用户可随时说"够了"进入文档生成

### 4. 生成文档

对话结束后，生成完整的 Task 文档。

## Task 文档模板（8 章节）

```markdown
# {Task 标题}

## 需求描述
详细说明要实现什么，用户可感知的行为变化。

## 输入/输出定义
- 输入：...
- 输出：...
- 异常情况：...

## 技术方案
整体实现思路、技术选型、架构考虑。

## 接口变更
- 新增接口：...
- 修改接口：...

## 数据结构变更
- 数据库：...
- 前端状态：...

## 实现步骤
1. [ ] 步骤一
2. [ ] 步骤二
3. [ ] ...

## 验收标准
| 场景 | 操作 | 预期结果 |
|------|------|----------|
| ... | ... | ... |

## 风险与注意事项
- 风险：...
- 注意：...
```

## 内容提取规则

| 章节 | 提取来源 |
|------|----------|
| 需求描述 | 对话中的功能描述、用户期望 |
| 输入/输出定义 | 对话中的参数、返回值、异常情况 |
| 技术方案 | 对话中的实现思路、技术选型 |
| 接口变更 | 对话中提到的 API、函数签名 |
| 数据结构变更 | 对话中的数据库、状态设计 |
| 实现步骤 | 对话中的代码修改点、执行顺序 |
| 验收标准 | 对话中的测试场景、预期行为 |
| 风险与注意事项 | 对话中的潜在问题、注意点 |

## 后续流程

文档确认后，提示用户：

```
Task 文档已生成。下一步选项：

1. 使用 writing-plans 生成 TDD 实现计划
2. 返回继续其他 Task 的澄清
3. 结束
```

## 注意事项

- 充分利用 Story 上下文，避免重复询问
- 实现步骤要具体到文件/函数级别
- 验收标准必须可测试
- 如信息不足，标注"待补充"
```

**Step 3: 验证文件创建**

```bash
ls -la ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-task/
cat ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-task/skill.md
```

Expected: 文件存在且内容正确

**Step 4: Commit**

```bash
cd ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/
git add brainstorming-task/
git commit -m "feat: add brainstorming-task skill"
```

---

## Task 4: 修改 brainstorming-cards Skill 增加自动编排

**Files:**
- Modify: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-cards/skill.md`

**Step 1: 备份原文件**

```bash
cp ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-cards/skill.md \
   ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-cards/skill.md.bak
```

**Step 2: 更新 skill.md 文件**

将原文件内容替换为：

```markdown
---
name: brainstorming-cards
description: "为 Project 生成 Story 卡片，并自动编排后续文档生成与 Task 拆分"
---

# 生成卡片 brainstorm（Story 级别）

## 目标

根据项目需求，输出 **Story 卡片列表**，并自动编排后续的文档生成和 Task 拆分流程。

## 流程

### 1. 理解需求（必做）

- 逐个提问，每次只问一个问题
- **优先选择题**：每个问题提供 2-4 个基于常见模式/最佳实践的选项，附简短解释
- 保留「其他」选项让用户自由输入
- 持续提问直到足够理解需求，由你判断何时够了
- 用户随时可以说"够了"来跳到生成阶段

### 2. 生成 Story 卡片

- 基于澄清后的需求，生成 Story 卡片列表
- 每张卡片聚焦一个用户可感知的独立功能点

## 拆分原则

- **Story** = 用户可感知的独立功能，可以单独交付和验收
- 如果需求太大，应拆成多个 Story
- 卡片数量适中（3-7 个为佳）
- YAGNI — 只生成必要的卡片

## Story 卡片输出格式

```json
[
  {
    "id": "story-1",
    "title": "故事标题（简短且动词开头）",
    "description": "一句话说明范围 + 验收重点",
    "priority": "high|medium|low",
    "complexity": 1-5,
    "notes": "可选：关键约束/依赖/风险"
  }
]
```

---

## 后续流程（自动编排）

Story 卡片生成完成后，**自动**执行以下流程：

### 阶段 1: 调用 story-doc-generator

为每个 Story 生成详细的 markdown 文档（7 章节）：
- 用户故事
- 功能需求
- 非功能需求
- 验收标准
- 技术方案建议
- 风险与依赖

**执行方式：**
1. 逐个处理每个 Story
2. 根据本次对话内容提取相关信息
3. 展示生成的文档，用户确认后继续

### 阶段 2: 调用 task-splitter

为每个 Story 建议 Task 拆分：
1. 分析 Story 文档内容
2. 生成 Task 拆分建议（3-7 个）
3. 用户确认/调整
4. 生成 Task 卡片和初始文档

**Task 初始文档格式：**
```markdown
# {Task 标题}

## 需求描述
{简要描述}

---
> 请使用 brainstorming-task 进行详细需求澄清
```

### 流程完成

所有 Story 和 Task 生成完成后，展示汇总：

```
流程完成！已生成：

Story 列表：
- story-1: [标题] (3 个 Task)
- story-2: [标题] (4 个 Task)
...

下一步：
- 选择某个 Task，使用 brainstorming-task 进行详细需求澄清
- 或直接开始实现
```

## 注意事项

- 整个流程在一次会话中完成
- 每个阶段展示进度，让用户知道当前位置
- 用户可在任意阶段暂停或调整
- 文档通过对话上下文传递，不依赖外部存储
```

**Step 3: 验证修改**

```bash
cat ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-cards/skill.md
```

Expected: 内容已更新，包含自动编排逻辑

**Step 4: Commit**

```bash
cd ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/
git add brainstorming-cards/skill.md
git commit -m "feat: add auto-orchestration to brainstorming-cards"
```

---

## Task 5: 验证完整流程

**Step 1: 检查所有 Skill 文件存在**

```bash
ls -la ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/story-doc-generator/
ls -la ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/task-splitter/
ls -la ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-task/
ls -la ~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/brainstorming-cards/
```

Expected: 所有目录和 skill.md 文件存在

**Step 2: 验证 Skill 能被识别**

在新的 Claude 会话中测试：
1. 输入 `/brainstorming-cards`，确认 skill 被识别
2. 输入 `/brainstorming-task`，确认 skill 被识别

**Step 3: 端到端测试（可选）**

使用一个简单需求测试完整流程：
1. 触发 brainstorming-cards
2. 完成需求澄清
3. 确认 Story 卡片生成
4. 确认 Story 文档生成
5. 确认 Task 拆分
6. 选择一个 Task 进行 brainstorming-task

---

## 汇总

| Task | 文件 | 操作 |
|------|------|------|
| 1 | story-doc-generator/skill.md | 创建 |
| 2 | task-splitter/skill.md | 创建 |
| 3 | brainstorming-task/skill.md | 创建 |
| 4 | brainstorming-cards/skill.md | 修改 |
| 5 | - | 验证 |

总计：3 个新文件，1 个修改文件
