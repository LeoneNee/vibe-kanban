import { useState, useCallback, useRef, useEffect } from 'react';
import type { BaseCodingAgent } from 'shared/types';
import { sessionsApi } from '@/lib/api';
import { useEntries } from '@/contexts/EntriesContext';
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
  const { entries } = useEntries();
  const entriesCountRef = useRef(entries.length);
  const waitingForResponseRef = useRef(false);
  const resolveWaitRef = useRef<(() => void) | null>(null);

  // Monitor entries changes to detect when Claude completes response
  useEffect(() => {
    if (!waitingForResponseRef.current) return;

    // If entries increased, Claude has responded
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
        // Record current entries count
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

        // Wait for Claude response
        waitingForResponseRef.current = true;
        await new Promise<void>((resolve, reject) => {
          resolveWaitRef.current = resolve;

          // Timeout protection: wait up to 60 seconds
          const timeout = setTimeout(() => {
            waitingForResponseRef.current = false;
            resolveWaitRef.current = null;
            reject(new Error('Timeout waiting for response'));
          }, 60000);

          // Cleanup function
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
