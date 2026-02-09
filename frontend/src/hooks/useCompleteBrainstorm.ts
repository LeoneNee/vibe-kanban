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
