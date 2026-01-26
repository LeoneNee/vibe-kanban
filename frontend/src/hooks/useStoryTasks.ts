import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { Task } from 'shared/types';

export function useStoryTasks(storyId: string, projectId: string) {
  return useQuery<Task[]>({
    queryKey: ['story-tasks', storyId],
    queryFn: () =>
      tasksApi.list({
        projectId,
        taskType: 'task',
        parentTaskId: storyId,
      }),
    enabled: !!storyId && !!projectId,
  });
}
