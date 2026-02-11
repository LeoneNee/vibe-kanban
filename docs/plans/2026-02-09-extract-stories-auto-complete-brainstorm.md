# ExtractStoriesButton 自动完成 Brainstorm 链式调用实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 当用户点击 "Extract Stories" 按钮时，如果 Story JSON 缺少 tasks，自动向当前 workspace 发送消息，触发 story-doc-generator 和 task-splitter 完成完整的链式流程，然后打开提取对话框。

**Architecture:**
- 在 ExtractStoriesButton 中添加状态检测逻辑，判断是否需要完成 brainstorm 流程
- 创建新的 hook `useCompleteBrainstorm` 封装发送消息和等待响应的逻辑
- 使用现有的 sessionsApi.followUp 发送消息到当前 workspace
- 轮询 entries 变化来检测 Claude 完成响应
- 提取更新后的完整 JSON 并打开对话框

**Tech Stack:** React, TypeScript, TanStack Query, sessionsApi

---

## Task 1: 创建 useCompleteBrainstorm Hook（TDD）

**Files:**
- Create: `frontend/src/hooks/useCompleteBrainstorm.ts`
- Create: `frontend/src/hooks/__tests__/useCompleteBrainstorm.test.ts`

### Step 1: 编写失败的测试

**创建测试文件：**

```typescript
// frontend/src/hooks/__tests__/useCompleteBrainstorm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCompleteBrainstorm } from '../useCompleteBrainstorm';
import type { BrainstormCard } from '@/utils/extractJsonCards';

// Mock sessionsApi
vi.mock('@/lib/api', () => ({
  sessionsApi: {
    followUp: vi.fn(),
  },
}));

// Mock useEntries
vi.mock('@/contexts/EntriesContext', () => ({
  useEntries: vi.fn(() => ({
    entries: [],
  })),
}));

describe('useCompleteBrainstorm', () => {
  const mockCards: BrainstormCard[] = [
    {
      id: 'story-1',
      title: 'Test Story',
      description: 'Test description',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return complete function and loading state', () => {
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    expect(result.current.complete).toBeDefined();
    expect(result.current.isCompleting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should call sessionsApi.followUp with correct prompt', async () => {
    const { sessionsApi } = await import('@/lib/api');
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    await result.current.complete(mockCards, 'claude_code');

    expect(sessionsApi.followUp).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        prompt: expect.stringContaining('/story-doc-generator'),
        executor_profile_id: {
          executor: 'claude_code',
          variant: null,
        },
      })
    );
  });

  it('should set loading state during completion', async () => {
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    expect(result.current.isCompleting).toBe(false);

    const promise = result.current.complete(mockCards, 'claude_code');

    expect(result.current.isCompleting).toBe(true);

    await promise;
  });

  it('should handle errors from sessionsApi', async () => {
    const { sessionsApi } = await import('@/lib/api');
    (sessionsApi.followUp as any).mockRejectedValueOnce(
      new Error('API error')
    );

    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    await expect(
      result.current.complete(mockCards, 'claude_code')
    ).rejects.toThrow('API error');

    expect(result.current.error).toBe('API error');
    expect(result.current.isCompleting).toBe(false);
  });

  it('should not call API if sessionId is undefined', async () => {
    const { sessionsApi } = await import('@/lib/api');
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: undefined })
    );

    await expect(
      result.current.complete(mockCards, 'claude_code')
    ).rejects.toThrow('No session ID');

    expect(sessionsApi.followUp).not.toHaveBeenCalled();
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd frontend
pnpm test useCompleteBrainstorm.test.ts
```

**Expected:** FAIL - `Cannot find module '../useCompleteBrainstorm'`

### Step 3: 实现最小化的 Hook

**创建 Hook 文件：**

```typescript
// frontend/src/hooks/useCompleteBrainstorm.ts
import { useState, useCallback } from 'react';
import type { BaseCodingAgent } from 'shared/types';
import { sessionsApi } from '@/lib/api';
import type { BrainstormCard } from '@/utils/extractJsonCards';

interface UseCompleteBrainstormOptions {
  sessionId: string | undefined;
}

interface UseCompleteBrainstormResult {
  complete: (
    cards: BrainstormCard[],
    executor: BaseCodingAgent
  ) => Promise<void>;
  isCompleting: boolean;
  error: string | null;
}

/**
 * Hook to complete brainstorm chain by sending follow-up message
 * to trigger story-doc-generator and task-splitter skills.
 */
export function useCompleteBrainstorm({
  sessionId,
}: UseCompleteBrainstormOptions): UseCompleteBrainstormResult {
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = useCallback(
    async (cards: BrainstormCard[], executor: BaseCodingAgent) => {
      if (!sessionId) {
        throw new Error('No session ID');
      }

      setIsCompleting(true);
      setError(null);

      try {
        const storiesJson = JSON.stringify(cards, null, 2);
        const prompt = `我发现这些 Story 还没有拆分 Task。请帮我完成以下工作：

1. 使用 /story-doc-generator 为每个 Story 生成文档（不需要展示文档内容）
2. 使用 /task-splitter 为每个 Story 拆分任务
3. 输出包含 tasks 数组的完整 Story JSON

当前的 Story JSON：
\`\`\`json
${storiesJson}
\`\`\`

请直接执行，无需确认，最后输出完整的 JSON 即可。`;

        await sessionsApi.followUp(sessionId, {
          prompt,
          executor_profile_id: {
            executor,
            variant: null,
          },
          retry_process_id: null,
          force_when_dirty: null,
          perform_git_reset: null,
        });
      } catch (e: unknown) {
        const err = e as { message?: string };
        const errorMessage = err.message ?? 'Unknown error';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsCompleting(false);
      }
    },
    [sessionId]
  );

  return {
    complete,
    isCompleting,
    error,
  };
}
```

### Step 4: 运行测试验证通过

```bash
cd frontend
pnpm test useCompleteBrainstorm.test.ts
```

**Expected:** PASS - 所有测试通过

### Step 5: Commit

```bash
git add frontend/src/hooks/useCompleteBrainstorm.ts frontend/src/hooks/__tests__/useCompleteBrainstorm.test.ts
git commit -m "feat(hooks): add useCompleteBrainstorm hook for story chain completion"
```

---

## Task 2: 添加检测 Story 是否包含 Tasks 的工具函数（TDD）

**Files:**
- Create: `frontend/src/utils/__tests__/checkBrainstormComplete.test.ts`
- Create: `frontend/src/utils/checkBrainstormComplete.ts`

### Step 1: 编写失败的测试

```typescript
// frontend/src/utils/__tests__/checkBrainstormComplete.test.ts
import { describe, it, expect } from 'vitest';
import { hasAllTasksGenerated } from '../checkBrainstormComplete';
import type { BrainstormCard } from '../extractJsonCards';

describe('hasAllTasksGenerated', () => {
  it('should return false for empty array', () => {
    expect(hasAllTasksGenerated([])).toBe(false);
  });

  it('should return false if any card has no tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
      {
        title: 'Story 2',
        // No tasks
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(false);
  });

  it('should return false if any card has empty tasks array', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
      {
        title: 'Story 2',
        tasks: [],
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(false);
  });

  it('should return true if all cards have at least one task', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
      {
        title: 'Story 2',
        tasks: [
          { title: 'Task 2', description: 'Desc 2' },
          { title: 'Task 3', description: 'Desc 3' },
        ],
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(true);
  });

  it('should return false for single card without tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(false);
  });

  it('should return true for single card with tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(true);
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd frontend
pnpm test checkBrainstormComplete.test.ts
```

**Expected:** FAIL - `Cannot find module '../checkBrainstormComplete'`

### Step 3: 实现工具函数

```typescript
// frontend/src/utils/checkBrainstormComplete.ts
import type { BrainstormCard } from './extractJsonCards';

/**
 * Check if all brainstorm cards have tasks generated.
 * Returns true only if every card has at least one task.
 */
export function hasAllTasksGenerated(cards: BrainstormCard[]): boolean {
  if (cards.length === 0) {
    return false;
  }

  return cards.every((card) => card.tasks && card.tasks.length > 0);
}
```

### Step 4: 运行测试验证通过

```bash
cd frontend
pnpm test checkBrainstormComplete.test.ts
```

**Expected:** PASS - 所有测试通过

### Step 5: Commit

```bash
git add frontend/src/utils/checkBrainstormComplete.ts frontend/src/utils/__tests__/checkBrainstormComplete.test.ts
git commit -m "feat(utils): add hasAllTasksGenerated utility function"
```

---

## Task 3: 修改 ExtractStoriesButton 集成自动完成逻辑

**Files:**
- Modify: `frontend/src/components/workspace/ExtractStoriesButton.tsx`

### Step 1: 添加导入和状态

在文件顶部添加导入：

```typescript
import { useState, useCallback } from 'react'; // 添加 useState, useCallback
import { Loader2 } from 'lucide-react'; // 添加 Loader2 图标
import { useCompleteBrainstorm } from '@/hooks/useCompleteBrainstorm';
import { hasAllTasksGenerated } from '@/utils/checkBrainstormComplete';
import { useUserSystem } from '@/components/ConfigProvider';
```

### Step 2: 在组件内添加 hooks 和状态

在 `ExtractStoriesButton` 组件函数内，`const { entries } = useEntries();` 之后添加：

```typescript
const [isCompleting, setIsCompleting] = useState(false);
const { config } = useUserSystem();
const sessionId = workspaceWithSession?.session_id;

const { complete, isCompleting: isApiCompleting, error } = useCompleteBrainstorm({
  sessionId,
});
```

### Step 3: 创建 handleExtract 函数

在组件内添加新的处理函数，替换原有的直接调用逻辑：

```typescript
const handleExtract = useCallback(async () => {
  if (!projectId) return;

  // 检查是否所有 Story 都有 tasks
  const allHaveTasks = hasAllTasksGenerated(extractedCards);

  if (allHaveTasks) {
    // 直接打开对话框
    ExtractStoriesDialog.show({
      cards: extractedCards,
      projectId,
    });
  } else {
    // 需要完成 brainstorm 链式调用
    setIsCompleting(true);
    try {
      const executor = config?.executor_profile?.executor ?? 'claude_code';

      // 发送消息触发 story-doc-generator 和 task-splitter
      await complete(extractedCards, executor);

      // 等待一小段时间让对话更新
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 重新提取 entries 中的 JSON
      const updatedCards = extractJsonCardsFromEntries(entries);

      // 打开对话框
      ExtractStoriesDialog.show({
        cards: updatedCards,
        projectId,
      });
    } catch (err) {
      console.error('Failed to complete brainstorm:', err);
      // 即使失败，也显示当前的 cards
      ExtractStoriesDialog.show({
        cards: extractedCards,
        projectId,
      });
    } finally {
      setIsCompleting(false);
    }
  }
}, [extractedCards, projectId, complete, config, entries]);
```

### Step 4: 更新按钮 JSX

将原有的 `onClick` 改为调用 `handleExtract`，并更新 loading 状态显示：

```typescript
const isLoading = isCompleting || isApiCompleting;

return (
  <Button
    onClick={handleExtract}
    disabled={isLoading}
    className="fixed bottom-6 right-6 z-50 shadow-lg"
    size="lg"
  >
    {isLoading ? (
      <>
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Completing brainstorm...
      </>
    ) : (
      <>
        <Sparkles className="mr-2 h-5 w-5" />
        Extract {extractedCards.length}{' '}
        {extractedCards.length === 1 ? 'Story' : 'Stories'}
      </>
    )}
  </Button>
);
```

### Step 5: 手动测试

启动开发服务器并测试：

```bash
cd frontend
pnpm run dev
```

**测试步骤：**
1. 创建一个 brainstorm workspace
2. 在对话中生成只包含 Story（无 tasks）的 JSON
3. 点击 "Extract Stories" 按钮
4. 验证：
   - 按钮显示 "Completing brainstorm..." loading 状态
   - 自动发送消息到对话中
   - Claude 回复包含 tasks 的完整 JSON
   - 自动打开 ExtractStoriesDialog
   - Dialog 中显示 Story + Tasks

**Expected:**
- ✅ 按钮进入 loading 状态
- ✅ 对话中出现自动发送的消息
- ✅ Claude 执行 story-doc-generator 和 task-splitter
- ✅ 最终打开的 Dialog 包含完整的 Story + Tasks

### Step 6: Commit

```bash
git add frontend/src/components/workspace/ExtractStoriesButton.tsx
git commit -m "feat(ExtractStoriesButton): auto-complete brainstorm chain when tasks missing"
```

---

## Task 4: 优化用户反馈 - 添加错误提示

**Files:**
- Modify: `frontend/src/components/workspace/ExtractStoriesButton.tsx`

### Step 1: 添加 toast 通知导入

在文件顶部添加：

```typescript
import { useToast } from '@/components/ui/use-toast';
```

### Step 2: 在组件内添加 toast hook

```typescript
const { toast } = useToast();
```

### Step 3: 在错误处理中添加 toast 通知

修改 `handleExtract` 函数的错误处理部分：

```typescript
} catch (err) {
  console.error('Failed to complete brainstorm:', err);

  toast({
    title: 'Failed to complete brainstorm',
    description: error || 'An error occurred while generating tasks. Showing current stories.',
    variant: 'destructive',
  });

  // 即使失败，也显示当前的 cards
  ExtractStoriesDialog.show({
    cards: extractedCards,
    projectId,
  });
} finally {
```

### Step 4: 添加成功提示（可选）

在成功完成后添加成功提示：

```typescript
// 重新提取 entries 中的 JSON
const updatedCards = extractJsonCardsFromEntries(entries);

// 检查是否真的生成了 tasks
const nowHasTasks = hasAllTasksGenerated(updatedCards);
if (nowHasTasks) {
  toast({
    title: 'Brainstorm completed',
    description: `Generated tasks for ${updatedCards.length} stories.`,
  });
}

// 打开对话框
ExtractStoriesDialog.show({
  cards: updatedCards,
  projectId,
});
```

### Step 5: 手动测试错误场景

**测试步骤：**
1. 模拟网络错误（断网或修改 API 返回错误）
2. 点击 Extract Stories 按钮
3. 验证显示错误 toast

**Expected:**
- ✅ 显示红色错误 toast
- ✅ 按钮恢复正常状态
- ✅ 仍然打开 Dialog 显示当前的 Stories

### Step 6: Commit

```bash
git add frontend/src/components/workspace/ExtractStoriesButton.tsx
git commit -m "feat(ExtractStoriesButton): add error handling with toast notifications"
```

---

## Task 5: 添加更智能的等待机制 - 监听 entries 变化

**Files:**
- Modify: `frontend/src/hooks/useCompleteBrainstorm.ts`

### Step 1: 添加等待完成的逻辑

在 `useCompleteBrainstorm` hook 中添加监听 entries 变化的能力：

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { useEntries } from '@/contexts/EntriesContext';

// ... 现有代码 ...

export function useCompleteBrainstorm({
  sessionId,
}: UseCompleteBrainstormOptions): UseCompleteBrainstormResult {
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { entries } = useEntries();
  const entriesCountRef = useRef(entries.length);
  const waitingForResponseRef = useRef(false);
  const resolveWaitRef = useRef<(() => void) | null>(null);

  // 监听 entries 变化，检测 Claude 是否完成响应
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

  const complete = useCallback(
    async (cards: BrainstormCard[], executor: BaseCodingAgent) => {
      if (!sessionId) {
        throw new Error('No session ID');
      }

      setIsCompleting(true);
      setError(null);

      try {
        // 记录当前 entries 数量
        entriesCountRef.current = entries.length;

        const storiesJson = JSON.stringify(cards, null, 2);
        const prompt = `我发现这些 Story 还没有拆分 Task。请帮我完成以下工作：

1. 使用 /story-doc-generator 为每个 Story 生成文档（不需要展示文档内容）
2. 使用 /task-splitter 为每个 Story 拆分任务
3. 输出包含 tasks 数组的完整 Story JSON

当前的 Story JSON：
\`\`\`json
${storiesJson}
\`\`\`

请直接执行，无需确认，最后输出完整的 JSON 即可。`;

        await sessionsApi.followUp(sessionId, {
          prompt,
          executor_profile_id: {
            executor,
            variant: null,
          },
          retry_process_id: null,
          force_when_dirty: null,
          perform_git_reset: null,
        });

        // 等待 Claude 响应
        waitingForResponseRef.current = true;
        await new Promise<void>((resolve, reject) => {
          resolveWaitRef.current = resolve;

          // 超时保护：最多等待 60 秒
          const timeout = setTimeout(() => {
            waitingForResponseRef.current = false;
            resolveWaitRef.current = null;
            reject(new Error('Timeout waiting for response'));
          }, 60000);

          // 清理函数
          const originalResolve = resolve;
          resolveWaitRef.current = () => {
            clearTimeout(timeout);
            originalResolve();
          };
        });
      } catch (e: unknown) {
        const err = e as { message?: string };
        const errorMessage = err.message ?? 'Unknown error';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsCompleting(false);
        waitingForResponseRef.current = false;
        resolveWaitRef.current = null;
      }
    },
    [sessionId, entries]
  );

  return {
    complete,
    isCompleting,
    error,
  };
}
```

### Step 2: 移除 ExtractStoriesButton 中的固定延迟

修改 `frontend/src/components/workspace/ExtractStoriesButton.tsx`：

删除：
```typescript
// 等待一小段时间让对话更新
await new Promise((resolve) => setTimeout(resolve, 1000));
```

因为 `useCompleteBrainstorm` 现在会自动等待响应完成。

### Step 3: 手动测试等待机制

**测试步骤：**
1. 创建 brainstorm workspace
2. 生成只有 Story 的 JSON
3. 点击 Extract Stories
4. 观察对话中 Claude 的响应过程
5. 验证在 Claude 完成所有响应后才打开 Dialog

**Expected:**
- ✅ 等待 Claude 执行完 story-doc-generator
- ✅ 等待 Claude 执行完 task-splitter
- ✅ 等待 Claude 输出最终 JSON
- ✅ 之后立即打开 Dialog

### Step 4: Commit

```bash
git add frontend/src/hooks/useCompleteBrainstorm.ts frontend/src/components/workspace/ExtractStoriesButton.tsx
git commit -m "feat(useCompleteBrainstorm): add intelligent wait mechanism based on entries changes"
```

---

## Task 6: 更新类型定义确保 BrainstormCard.tasks 类型正确

**Files:**
- Modify: `frontend/src/utils/extractJsonCards.ts`

### Step 1: 检查现有类型定义

读取文件查看 `BrainstormCard` 和 `BrainstormTask` 的定义：

```bash
cat frontend/src/utils/extractJsonCards.ts | grep -A 10 "export interface BrainstormCard"
```

### Step 2: 确保类型包含 tasks 字段

如果 `BrainstormCard` 没有 `tasks` 字段，添加：

```typescript
export interface BrainstormTask {
  title: string;
  description?: string;
}

export interface BrainstormCard {
  id?: string;
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  complexity?: number;
  notes?: string;
  tasks?: BrainstormTask[]; // 添加这一行
}
```

### Step 3: 运行类型检查

```bash
cd frontend
pnpm run check
```

**Expected:** PASS - 没有类型错误

### Step 4: Commit（如果有修改）

```bash
git add frontend/src/utils/extractJsonCards.ts
git commit -m "feat(types): ensure BrainstormCard includes optional tasks field"
```

---

## Task 7: 端到端测试和文档

**Files:**
- Create: `docs/features/extract-stories-auto-complete.md`

### Step 1: 编写功能文档

```markdown
# Extract Stories Auto-Complete Feature

## Overview

When users click the "Extract Stories" button in a brainstorm workspace, the system automatically detects if Story cards are missing task breakdowns. If tasks are missing, it triggers the complete brainstorm chain (story-doc-generator + task-splitter) before opening the extraction dialog.

## User Flow

### Scenario 1: Stories already have tasks

1. User completes brainstorm conversation
2. Claude outputs Story JSON with nested tasks
3. User clicks "Extract Stories" button
4. **Result:** Dialog opens immediately showing Stories + Tasks

### Scenario 2: Stories missing tasks (auto-complete)

1. User completes brainstorm conversation
2. Claude outputs Story JSON **without** tasks
3. User clicks "Extract Stories" button
4. Button shows "Completing brainstorm..." loading state
5. System sends follow-up message to Claude automatically
6. Claude executes:
   - `/story-doc-generator` for each Story
   - `/task-splitter` for each Story
   - Outputs complete Story JSON with tasks
7. **Result:** Dialog opens showing Stories + Tasks

## Technical Implementation

### Key Components

- **ExtractStoriesButton**: Detects missing tasks and triggers auto-complete
- **useCompleteBrainstorm**: Hook to send follow-up message and wait for response
- **hasAllTasksGenerated**: Utility to check if all stories have tasks

### Flow Diagram

```
[User clicks Extract Stories]
           ↓
[Check: hasAllTasksGenerated?]
      ↓           ↓
    Yes           No
      ↓           ↓
  [Open       [Show loading]
  Dialog]         ↓
              [Send follow-up message]
                  ↓
              [Wait for Claude response]
                  ↓
              [Extract updated JSON]
                  ↓
              [Open Dialog]
```

## Error Handling

- If API call fails: Show error toast, open dialog with current stories
- If timeout (60s): Show timeout error, open dialog with current stories
- User can always proceed even if auto-complete fails

## Testing

### Manual Test Checklist

- [ ] Stories with tasks → Dialog opens immediately
- [ ] Stories without tasks → Auto-complete triggers
- [ ] Loading state displays correctly
- [ ] Success toast shown after completion
- [ ] Error toast shown on failure
- [ ] Timeout protection works (mock long response)
- [ ] Dialog shows complete Story + Task structure
```

### Step 2: 端到端手动测试

**完整测试流程：**

1. **启动开发环境**
   ```bash
   pnpm run dev
   ```

2. **测试场景 A：已有 tasks**
   - 创建 brainstorm workspace
   - 让 Claude 生成包含 tasks 的完整 JSON
   - 点击 Extract Stories
   - 验证立即打开 Dialog

3. **测试场景 B：缺少 tasks（核心场景）**
   - 创建新的 brainstorm workspace
   - 让 Claude 只生成 Story JSON（无 tasks）
   - 点击 Extract Stories
   - 验证：
     - 按钮显示 loading
     - 对话中自动发送消息
     - Claude 执行技能
     - Dialog 显示完整 Story + Tasks

4. **测试场景 C：错误处理**
   - 在 DevTools Network 面板中模拟网络错误
   - 点击 Extract Stories
   - 验证显示错误 toast

**Expected:** 所有场景按预期工作

### Step 3: 运行类型检查和 lint

```bash
cd frontend
pnpm run check
pnpm run lint
```

**Expected:** 无错误

### Step 4: Commit 文档

```bash
git add docs/features/extract-stories-auto-complete.md
git commit -m "docs: add extract stories auto-complete feature documentation"
```

---

## 总结

**完成的功能：**
- ✅ ExtractStoriesButton 自动检测 Story 是否包含 tasks
- ✅ 缺少 tasks 时自动触发链式调用
- ✅ 智能等待机制，监听 entries 变化
- ✅ 完善的错误处理和用户反馈
- ✅ 完整的类型安全
- ✅ 功能文档

**关键文件：**
- `frontend/src/hooks/useCompleteBrainstorm.ts` - 核心 hook
- `frontend/src/utils/checkBrainstormComplete.ts` - 检测工具
- `frontend/src/components/workspace/ExtractStoriesButton.tsx` - UI 集成

**测试覆盖：**
- ✅ useCompleteBrainstorm 单元测试
- ✅ hasAllTasksGenerated 单元测试
- ✅ 端到端手动测试

**下一步：**
- 考虑添加更详细的进度指示（显示当前执行到哪个 skill）
- 考虑添加取消按钮（允许用户中断自动完成）
- 监控生产环境中的使用情况和错误率
