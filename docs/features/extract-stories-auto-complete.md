# Extract Stories Auto-Complete Feature

## 概述

当用户在 brainstorm workspace 中点击 "Extract Stories" 按钮时，系统会自动检测 Story 卡片是否缺少 task 拆分。如果缺少 tasks，会自动触发完整的 brainstorm 链式流程（story-doc-generator + task-splitter），然后打开提取对话框。

## 用户流程

### 场景 1：Stories 已包含 tasks

1. 用户完成 brainstorm 对话
2. Claude 输出包含嵌套 tasks 的 Story JSON
3. 用户点击 "Extract Stories" 按钮
4. **结果：** 对话框立即打开，显示 Stories + Tasks

### 场景 2：Stories 缺少 tasks（自动完成）

1. 用户完成 brainstorm 对话
2. Claude 输出**不包含** tasks 的 Story JSON
3. 用户点击 "Extract Stories" 按钮
4. 按钮显示 "Completing brainstorm..." loading 状态
5. 系统自动向 Claude 发送 follow-up 消息
6. Claude 执行：
   - `/story-doc-generator` 为每个 Story 生成文档
   - `/task-splitter` 为每个 Story 拆分任务
   - 输出包含 tasks 的完整 Story JSON
7. **结果：** 对话框打开，显示 Stories + Tasks

## 技术实现

### 核心组件

- **ExtractStoriesButton**: 检测缺失的 tasks 并触发自动完成
- **useCompleteBrainstorm**: Hook，用于发送 follow-up 消息并等待响应
- **hasAllTasksGenerated**: 工具函数，检查所有 stories 是否都有 tasks

### 流程图

```
[用户点击 Extract Stories]
           ↓
[检查: hasAllTasksGenerated?]
      ↓           ↓
    Yes           No
      ↓           ↓
  [打开        [显示 loading]
  对话框]         ↓
              [发送 follow-up 消息]
                  ↓
              [等待 Claude 响应]
                  ↓
              [提取更新的 JSON]
                  ↓
              [打开对话框]
```

### 关键特性

#### 1. 智能等待机制

使用 `useEffect` 监听 `entries` 数组的变化，自动检测 Claude 何时完成响应：

```typescript
useEffect(() => {
  if (!waitingForResponseRef.current) return;

  // 如果 entries 增加了，说明 Claude 回复了
  if (entries.length > entriesCountRef.current) {
    entriesCountRef.current = entries.length;
    waitingForResponseRef.current = false;
    resolveWaitRef.current?.();
    resolveWaitRef.current = null;
  }
}, [entries]);
```

#### 2. 超时保护

最多等待 60 秒，避免永久等待：

```typescript
const timeout = setTimeout(() => {
  waitingForResponseRef.current = false;
  resolveWaitRef.current = null;
  reject(new Error('Timeout waiting for response'));
}, 60000);
```

#### 3. 错误处理

- 如果 API 调用失败：显示错误日志，仍然打开对话框显示当前 stories
- 如果超时：抛出超时错误，仍然打开对话框显示当前 stories
- 用户始终可以继续操作，即使自动完成失败

## 错误处理

### API 调用失败
```
Console Error: Failed to complete brainstorm: [error details]
Console Warn: An error occurred while generating tasks. Showing current stories.
行为: 打开对话框，显示原始 stories（无 tasks）
```

### 超时（60秒）
```
Error: Timeout waiting for response
行为: 打开对话框，显示原始 stories（无 tasks）
```

## 测试

### 单元测试

#### useCompleteBrainstorm Hook
- ✅ 返回 complete 函数和 loading 状态
- ✅ 使用正确的 prompt 调用 sessionsApi.followUp
- ✅ 处理来自 sessionsApi 的错误
- ✅ sessionId 为 undefined 时不调用 API

位置：`frontend/src/hooks/__tests__/useCompleteBrainstorm.test.ts`

#### hasAllTasksGenerated 工具函数
- ✅ 空数组返回 false
- ✅ 任何卡片没有 tasks 返回 false
- ✅ 任何卡片有空 tasks 数组返回 false
- ✅ 所有卡片都有至少一个 task 返回 true

位置：`frontend/src/utils/__tests__/checkBrainstormComplete.test.ts`

### 手动测试清单

#### 测试环境准备
```bash
pnpm run dev
```

#### 场景 A：已有 tasks
- [ ] 创建 brainstorm workspace
- [ ] 让 Claude 生成包含 tasks 的完整 JSON
- [ ] 点击 Extract Stories
- [ ] 验证立即打开 Dialog
- [ ] 验证 Dialog 显示完整的 Story + Tasks

#### 场景 B：缺少 tasks（核心场景）
- [ ] 创建新的 brainstorm workspace
- [ ] 让 Claude 只生成 Story JSON（无 tasks）
- [ ] 点击 Extract Stories
- [ ] 验证：
  - [ ] 按钮显示 "Completing brainstorm..." loading
  - [ ] 对话中自动发送消息
  - [ ] Claude 执行 /story-doc-generator 技能
  - [ ] Claude 执行 /task-splitter 技能
  - [ ] Claude 输出完整的 JSON
  - [ ] Dialog 显示完整 Story + Tasks
  - [ ] Console 显示成功日志

#### 场景 C：错误处理
- [ ] 模拟网络错误（断网或修改 API 返回错误）
- [ ] 点击 Extract Stories
- [ ] 验证：
  - [ ] Console 显示错误日志
  - [ ] Dialog 仍然打开，显示当前 stories

## 类型检查和 Lint

```bash
cd frontend
pnpm run check
pnpm run lint
```

**预期：** 无错误

## 关键文件

### 实现文件
- `frontend/src/hooks/useCompleteBrainstorm.ts` - 核心 hook
- `frontend/src/utils/checkBrainstormComplete.ts` - 检测工具
- `frontend/src/components/workspace/ExtractStoriesButton.tsx` - UI 集成

### 测试文件
- `frontend/src/hooks/__tests__/useCompleteBrainstorm.test.ts`
- `frontend/src/utils/__tests__/checkBrainstormComplete.test.ts`

### 类型定义
- `frontend/src/utils/extractJsonCards.ts` - BrainstormCard 和 BrainstormTask 类型

## 提交历史

- `4f138e5d` - feat(hooks): add useCompleteBrainstorm hook for story chain completion
- `3ec9468d` - feat(utils): add hasAllTasksGenerated utility function
- `dba6b099` - feat(ExtractStoriesButton): auto-complete brainstorm chain when tasks missing
- `e840b901` - feat(ExtractStoriesButton): add console logging for success and error feedback
- `e4563080` - feat(useCompleteBrainstorm): add intelligent wait mechanism based on entries changes

## 未来改进

### 可选增强功能
1. **详细进度指示** - 显示当前执行到哪个 skill（story-doc-generator 或 task-splitter）
2. **取消按钮** - 允许用户中断自动完成过程
3. **重试机制** - 失败后允许用户手动重试
4. **性能监控** - 监控生产环境中的使用情况和错误率

### 已知限制
- 依赖 entries 数组长度变化来检测响应，在极少数情况下可能不够精确
- 60 秒超时是固定的，不能根据 stories 数量动态调整
- Console 日志可能不够直观，建议后续添加 UI 通知
