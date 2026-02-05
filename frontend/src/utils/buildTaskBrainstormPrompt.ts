export function buildTaskBrainstormPrompt(
  taskTitle: string,
  taskDescription: string | null | undefined
): string {
  const descSection = taskDescription
    ? `\n描述：${taskDescription}`
    : '';

  return `/brainstorming-task

任务：${taskTitle}${descSection}
`;
}
