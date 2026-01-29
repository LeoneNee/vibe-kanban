export const paths = {
  projects: () => '/projects',
  projectTasks: (projectId: string) => `/projects/${projectId}/tasks`,
  task: (projectId: string, taskId: string) =>
    `/projects/${projectId}/tasks/${taskId}`,
  attempt: (projectId: string, taskId: string, attemptId: string) =>
    `/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`,
  attemptFull: (projectId: string, taskId: string, attemptId: string) =>
    `/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/full`,
  projectStories: (projectId: string) => `/projects/${projectId}/stories`,
  storyTasks: (projectId: string, storyId: string) =>
    `/projects/${projectId}/stories/${storyId}/tasks`,
  storyTask: (projectId: string, storyId: string, taskId: string) =>
    `/projects/${projectId}/stories/${storyId}/tasks/${taskId}`,
  storyAttempt: (
    projectId: string,
    storyId: string,
    taskId: string,
    attemptId: string
  ) =>
    `/projects/${projectId}/stories/${storyId}/tasks/${taskId}/attempts/${attemptId}`,
  taskBrainstorm: (projectId: string, storyId: string, taskId: string) =>
    `/projects/${projectId}/stories/${storyId}/tasks/${taskId}/brainstorm`,
  storyBrainstorm: (projectId: string) =>
    `/projects/${projectId}/stories/brainstorm`,
};
