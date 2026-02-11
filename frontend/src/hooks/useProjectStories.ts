import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { Task } from 'shared/types';

export function useProjectStories(projectId: string) {
  return useQuery<Task[]>({
    queryKey: ['stories', projectId],
    queryFn: async () => {
      console.log(
        '[useProjectStories] Fetching stories for project: ' + projectId
      );
      const stories = await tasksApi.list({
        projectId,
        taskType: 'story',
      });
      console.log(
        `[useProjectStories] Fetched ${stories.length} stories`,
        stories
      );
      return stories;
    },
    enabled: !!projectId,
  });
}
