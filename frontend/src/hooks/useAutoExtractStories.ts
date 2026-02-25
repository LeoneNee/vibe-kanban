import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tasksApi, projectsApi } from '@/lib/api';
import { buildStoryTask } from '@/utils/buildStoryTask';
import type { BrainstormCard } from '@/utils/extractJsonCards';
import type { Task, TaskTag } from 'shared/types';

export type ExtractionStatus =
  | 'idle'
  | 'extracting'
  | 'committing'
  | 'done'
  | 'error';

export interface AutoExtractResult {
  status: ExtractionStatus;
  error: string | null;
  storiesCreated: number;
  tasksCreated: number;
}

export function useAutoExtractStories(
  cards: BrainstormCard[],
  projectId: string | undefined,
  isComplete: boolean
): AutoExtractResult {
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [storiesCreated, setStoriesCreated] = useState(0);
  const [tasksCreated, setTasksCreated] = useState(0);
  const extractionStarted = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (
      !isComplete ||
      !projectId ||
      cards.length === 0 ||
      extractionStarted.current
    ) {
      return;
    }

    extractionStarted.current = true;

    const extract = async () => {
      setStatus('extracting');
      setError(null);

      try {
        // Step 1: Create story tasks in parallel
        const storyTasks = cards.map((card) => buildStoryTask(projectId, card));
        const storyResults = await Promise.allSettled(
          storyTasks.map((task) => tasksApi.create(task))
        );

        const successfulPairs: { story: Task; card: BrainstormCard }[] = [];
        let storyFailed = 0;

        storyResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulPairs.push({ story: result.value, card: cards[index] });
          } else {
            storyFailed++;
          }
        });

        setStoriesCreated(successfulPairs.length);

        // Step 2: Write doc_content for each story (sequential)
        for (const { story, card } of successfulPairs) {
          if (card.doc_content?.trim()) {
            try {
              await tasksApi.writeDoc(story.id, card.doc_content);
            } catch (err) {
              console.warn(
                `Failed to write doc for story ${story.id}:`,
                err
              );
            }
          }
        }

        // Step 3: Create child tasks
        let totalTasksCreated = 0;
        let tasksFailed = 0;

        for (const { story, card } of successfulPairs) {
          if (card.tasks && card.tasks.length > 0) {
            const childTasks = card.tasks.map((task) => ({
              project_id: projectId,
              title: task.title,
              description: task.description || null,
              status: null,
              task_type: 'task' as const,
              parent_workspace_id: null,
              parent_task_id: story.id,
              image_ids: null,
              tag: (task.tag as TaskTag) || undefined,
            }));

            const childResults = await Promise.allSettled(
              childTasks.map((task) => tasksApi.create(task))
            );

            totalTasksCreated += childResults.filter(
              (r) => r.status === 'fulfilled'
            ).length;
            tasksFailed += childResults.filter(
              (r) => r.status === 'rejected'
            ).length;
          }
        }

        setTasksCreated(totalTasksCreated);

        // Step 4: Invalidate queries
        await queryClient.invalidateQueries({
          queryKey: ['stories', projectId],
        });

        // Step 5: Git commit (best-effort)
        if (successfulPairs.length > 0) {
          setStatus('committing');
          const storyTitles = successfulPairs
            .map((p) => p.card.title)
            .join(', ');
          const commitMessage = `docs: add ${successfulPairs.length} stories from brainstorm\n\nStories: ${storyTitles}`;
          try {
            await projectsApi.gitCommit(projectId, commitMessage);
          } catch (err) {
            console.warn('Git commit failed (best-effort):', err);
          }
        }

        // Step 6: Determine final status
        if (storyFailed > 0 || tasksFailed > 0) {
          const parts = [];
          if (storyFailed > 0) parts.push(`${storyFailed} stories failed`);
          if (tasksFailed > 0) parts.push(`${tasksFailed} tasks failed`);
          setError(
            `Created ${successfulPairs.length} stories and ${totalTasksCreated} tasks, but ${parts.join(' and ')}.`
          );
          setStatus('error');
        } else {
          setStatus('done');
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to extract stories.'
        );
        setStatus('error');
      }
    };

    extract();
  }, [isComplete, projectId, cards, queryClient]);

  return { status, error, storiesCreated, tasksCreated };
}
