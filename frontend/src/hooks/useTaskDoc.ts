import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';

export function useTaskDoc(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-doc', taskId],
    queryFn: () => tasksApi.getDoc(taskId!),
    enabled: !!taskId,
  });
}
