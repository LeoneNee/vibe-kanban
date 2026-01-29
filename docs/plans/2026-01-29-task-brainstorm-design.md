# Task Brainstorm 功能设计

## 概述

在 Task 执行前提供 AI 辅助的需求澄清功能，通过对话式交互补充任务细节，结果保存到 Task 文档。

## 用户流程

1. 用户在 TaskPanel 点击"脑暴"按钮
2. 导航到专用对话页面
3. AI 读取现有 Task 信息，提出澄清问题
4. 用户逐一回答或补充
5. 完成后 AI 生成结构化摘要
6. 用户确认，保存到 Task 文档
7. 可选：点击"开始执行"触发 TDD 计划生成

## AI 对话行为

### 初始化
- 读取 Task 的 title、description
- 读取已有文档内容（如存在）
- 生成 3-5 个需要澄清的问题

### 对话过程
- 每次展示 1 个问题
- 用户可回答或补充额外信息
- AI 根据回答追问或进入下一问题
- 显示进度指示（如 "问题 2/5"）

### 完成确认
- AI 生成结构化摘要，包含：
  - 核心需求点
  - 边界条件
  - 技术约束
  - 验收标准
- 用户确认后保存

### 文档更新
- 保留原有文档内容
- 追加到 `## 需求细节` 章节
- 不保存对话历史，只保存最终结果

## 技术实现架构

### Skill 调用映射

| 场景 | 使用 Skill | 输出 |
|------|-----------|------|
| Story 脑暴 | `brainstorming-cards` | 多个 Story 卡片列表 |
| Task 脑暴 | `brainstorming` | 单个 Task 需求细节文档 |
| Task 执行 | `writing-plans` | TDD 开发计划 |

### 路由配置

```typescript
// paths.ts
taskBrainstorm: (projectId: string, storyId: string, taskId: string) =>
  `/projects/${projectId}/stories/${storyId}/tasks/${taskId}/brainstorm`
```

### 页面组件

创建 `TaskBrainstorm.tsx`，复用 Story Brainstorm 对话 UI 结构：
- 调用 `brainstorming` skill（而非 `brainstorming-cards`）
- 完成后更新 Task 文档
- 提供"开始执行"按钮，触发 `writing-plans` skill

### API 端点

使用现有文档 API：
- `GET /tasks/:id/doc` - 读取文档
- `PATCH /tasks/:id/doc` - 更新文档章节

### 数据流

```
TaskPanel 点击"脑暴"按钮
    ↓
导航到 /projects/:projectId/stories/:storyId/tasks/:taskId/brainstorm
    ↓
对话页面调用 brainstorming skill
    ↓
完成确认 → 保存到 Task 文档
    ↓
点击"开始执行" → 调用 writing-plans skill → TDD 计划
```

## 实现步骤

1. **路由配置**
   - `paths.ts` 添加 `taskBrainstorm` 路径
   - `App.tsx` 添加对应路由

2. **页面组件**
   - 创建 `TaskBrainstorm.tsx`，复用 Story Brainstorm 对话 UI
   - 接入 `brainstorming` skill
   - 完成后调用 `PATCH /tasks/:id/doc` 保存结果

3. **入口按钮**
   - 在 TaskPanel 添加"脑暴"按钮
   - 点击导航到 brainstorm 页面

4. **执行触发**
   - 脑暴完成后显示"开始执行"按钮
   - 触发 `writing-plans` skill 生成 TDD 计划

## 验收标准

| 场景 | 预期结果 |
|------|---------|
| 点击 Task 脑暴按钮 | 导航到对话页面，加载 Task 信息 |
| 对话过程 | 调用 brainstorming skill，逐步澄清需求 |
| 确认完成 | 生成摘要，保存到 Task 文档 `## 需求细节` |
| 点击开始执行 | 调用 writing-plans skill，生成 TDD 计划 |
| 返回 Task 列表 | 文档内容已更新，可在 Task 详情查看 |

## 不做的事情

- 不保存对话历史
- 不新建独立组件架构
- 不修改现有 Task 数据模型
