import type { Task } from 'shared/types';

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getTaskDocPath(task: Task, story?: Task): string {
  if (task.task_type === 'story') {
    const slug = slugify(task.title);
    return `docs/stories/${task.id}-${slug}/README.md`;
  } else {
    if (!story) {
      throw new Error('Task requires parent story');
    }
    const storySlug = slugify(story.title);
    const taskSlug = slugify(task.title);
    return `docs/stories/${story.id}-${storySlug}/${task.id}-${taskSlug}.md`;
  }
}
