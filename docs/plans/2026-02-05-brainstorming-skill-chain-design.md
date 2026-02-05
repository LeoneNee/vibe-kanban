# Brainstorming Skill 链式编排设计

## 概述

设计一套 Skill 链式编排方案，实现从 Project 需求到 Story 卡片、Story 文档、Task 拆分、Task 详细澄清的完整流程。

## 整体架构

### 四个 Skill 的职责

| Skill | 职责 | 触发方式 |
|-------|------|----------|
| brainstorming-cards | 生成 Story 卡片，编排后续流程 | 用户手动触发 |
| story-doc-generator | 为 Story 生成详细 markdown 文档 | 被 brainstorming-cards 自动调用 |
| task-splitter | 分析 Story，建议 Task 拆分 | 被 brainstorming-cards 自动调用 |
| brainstorming-task | Task 级别全流程澄清 | 用户手动触发 |

### 调用关系

```
用户触发 brainstorming-cards
        ↓
   [需求澄清对话]
        ↓
   生成 Story 卡片列表
        ↓
   ┌─────────────────────────────────────┐
   │  自动调用 story-doc-generator       │
   │  为每个 Story 生成 markdown 文档    │
   └─────────────────────────────────────┘
        ↓
   ┌─────────────────────────────────────┐
   │  自动调用 task-splitter             │
   │  AI 建议 Task 拆分 → 用户确认       │
   │  → 生成 Task 卡片（简要描述）       │
   └─────────────────────────────────────┘
        ↓
   流程完成，用户可进入单个 Task 进行
   brainstorming-task 详细澄清
```

## Story 文档结构

### 模板（7 章节）

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

### 内容来源

- **用户故事**：从需求澄清对话中提炼
- **功能需求**：从 Story 卡片的 description + 对话补充
- **非功能需求**：对话中提到的性能/安全/兼容性要求
- **验收标准**：从对话中的边界条件、预期行为提炼
- **技术方案建议**：对话中涉及的技术选型/约束
- **风险与依赖**：对话中提到的 notes、依赖、风险

## Task 拆分流程

### task-splitter 工作流程

```
读取 Story 文档内容
        ↓
AI 分析并生成 Task 拆分建议
        ↓
展示给用户：
┌─────────────────────────────────────────┐
│ 建议将此 Story 拆分为以下 Task：        │
│                                         │
│ 1. [Task 标题] - 简要描述               │
│ 2. [Task 标题] - 简要描述               │
│ 3. [Task 标题] - 简要描述               │
│                                         │
│ 请确认或调整：                          │
│ [确认] [添加] [删除] [修改]             │
└─────────────────────────────────────────┘
        ↓
用户确认/调整后生成 Task 卡片
```

### Task 卡片结构（初始简要版）

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

### Task 初始文档（占位）

```markdown
# {Task 标题}

## 需求描述
{从 task-splitter 对话中提取的简要描述}

---
> 请使用 brainstorming-task 进行详细需求澄清
```

## brainstorming-task Skill

### 定位

全流程型需求澄清工具，通过自由对话覆盖需求、技术、实现三个维度，最后统一生成完整的 Task 文档。

### 对话行为

```
读取 Task 基本信息 + Story 文档（获取上下文）
        ↓
自由对话（AI 灵活切换关注点）：
  - 需求维度：具体要做什么？边界在哪？
  - 技术维度：怎么实现？涉及哪些模块/接口？
  - 实现维度：具体改哪些代码？步骤是什么？
        ↓
用户说"够了"或 AI 判断信息充足
        ↓
生成完整 Task 文档，用户确认后保存
```

### 对话策略

- 每次只问一个问题
- 优先提供选择题（基于 Story 上下文和代码库分析）
- 自动关联 Story 文档内容，避免重复询问已知信息
- 根据回答灵活追问或切换维度

### Task 文档结构（8 章节）

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

## Skill 文件结构

### 文件位置

```
~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/
├── brainstorming/           # 现有，通用 brainstorming
├── brainstorming-cards/     # 修改，增加自动编排
│   └── skill.md
├── story-doc-generator/     # 新增
│   └── skill.md
├── task-splitter/           # 新增
│   └── skill.md
└── brainstorming-task/      # 新增
    └── skill.md
```

### 各 Skill 的 description 字段

| Skill | description |
|-------|-------------|
| brainstorming-cards | 为 Project 生成 Story 卡片，并自动编排后续文档生成与 Task 拆分 |
| story-doc-generator | 根据 Story 卡片和对话内容生成详细的 Story markdown 文档 |
| task-splitter | 分析 Story 内容，建议 Task 拆分方案，用户确认后生成 Task 卡片 |
| brainstorming-task | Task 级别全流程澄清：需求 → 技术 → 实现，生成完整 Task 文档 |

## 完整流程示例

```
用户：我要做一个用户认证系统

        ↓ 触发 brainstorming-cards

AI：逐个问题澄清需求（登录方式？第三方？权限？...）

        ↓ 用户回答完毕

AI：生成 Story 卡片：
    - story-1: 实现用户名密码登录
    - story-2: 实现 OAuth 第三方登录
    - story-3: 实现角色权限控制

        ↓ 自动调用 story-doc-generator

AI：为每个 Story 生成详细文档（7章节）

        ↓ 自动调用 task-splitter

AI：为 story-1 建议 Task 拆分：
    - task-1: 创建登录表单组件
    - task-2: 实现登录 API 端点
    - task-3: 添加密码加密存储
    用户确认后生成 Task 卡片和占位文档

        ↓ 继续 story-2、story-3...

流程完成！

        ↓ 用户选择某个 Task，触发 brainstorming-task

AI：详细澄清该 Task（需求→技术→实现）
    生成完整 Task 文档（8章节）

        ↓ 开始执行实现
```

## 实现计划

### 阶段一：创建新 Skill 文件

1. 创建 `story-doc-generator/skill.md`
2. 创建 `task-splitter/skill.md`
3. 创建 `brainstorming-task/skill.md`

### 阶段二：修改现有 Skill

1. 修改 `brainstorming-cards/skill.md`，增加自动编排逻辑

### 阶段三：验证

1. 端到端测试完整流程
2. 验证文档生成质量
3. 验证 Task 拆分合理性

## 不做的事情

- 不修改现有数据模型
- 不新增 API 端点
- 不保存对话历史（只保存最终文档）
- Skill 之间通过文档传递信息，不直接共享状态
