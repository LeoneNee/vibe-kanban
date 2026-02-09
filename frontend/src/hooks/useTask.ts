import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { Task } from 'shared/types';

export const taskKeys = {
  all: ['tasks'] as const,
  byId: (id: string) => [...taskKeys.all, id] as const,
};

export function useTask(taskId: string, options?: { enabled?: boolean }) {
  return useQuery<Task>({
    queryKey: taskKeys.byId(taskId),
    queryFn: () => tasksApi.getById(taskId),
    enabled: options?.enabled ?? !!taskId,
  });
}
