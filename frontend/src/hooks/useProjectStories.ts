import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { Task } from 'shared/types';

export function useProjectStories(projectId: string) {
  return useQuery<Task[]>({
    queryKey: ['stories', projectId],
    queryFn: () =>
      tasksApi.list({
        projectId,
        taskType: 'story',
      }),
    enabled: !!projectId,
  });
}
