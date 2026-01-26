import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { Task, TaskStatus, TaskWithAttemptStatus } from 'shared/types';

export function useStoryTasks(
  storyId: string,
  projectId: string,
  options?: { enabled?: boolean }
) {
  const query = useQuery<Task[]>({
    queryKey: ['story-tasks', storyId],
    queryFn: () =>
      tasksApi.list({
        projectId,
        taskType: 'task',
        parentTaskId: storyId,
      }),
    enabled: options?.enabled ?? (!!storyId && !!projectId),
  });

  const tasks: TaskWithAttemptStatus[] = useMemo(() => {
    const base = query.data ?? [];
    return base.map((t) => ({
      ...t,
      has_in_progress_attempt: false,
      last_attempt_failed: false,
      executor: '',
    }));
  }, [query.data]);

  const { tasksById, tasksByStatus } = useMemo(() => {
    const byId: Record<string, TaskWithAttemptStatus> = {};
    const byStatus: Record<TaskStatus, TaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    tasks.forEach((task) => {
      byId[task.id] = task;
      byStatus[task.status]?.push(task);
    });

    return { tasksById: byId, tasksByStatus: byStatus };
  }, [tasks]);

  return {
    tasks,
    tasksById,
    tasksByStatus,
    isLoading: query.isLoading,
    isConnected: true,
    error: (query.error as Error | null)?.message ?? null,
  };
}
