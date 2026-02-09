import { describe, it, expect } from 'vitest';
import { paths } from '@/lib/paths';

/**
 * Integration test for navigation context preservation
 *
 * Tests that story context is properly maintained in URL paths throughout
 * the navigation flow: Story → Task → Attempt
 */
describe('Navigation Flow Integration - Story Context Preservation', () => {
  const projectId = 'proj-123';
  const storyId = 'story-456';
  const taskId = 'task-789';
  const attemptId = 'attempt-abc';

  describe('Story-contextual paths', () => {
    it('generates correct story tasks path', () => {
      const path = paths.storyTasks(projectId, storyId);
      expect(path).toBe('/projects/proj-123/stories/story-456/tasks');
    });

    it('generates correct story task detail path', () => {
      const path = paths.storyTask(projectId, storyId, taskId);
      expect(path).toBe('/projects/proj-123/stories/story-456/tasks/task-789');
    });

    it('generates correct story attempt path', () => {
      const path = paths.storyAttempt(projectId, storyId, taskId, attemptId);
      expect(path).toBe(
        '/projects/proj-123/stories/story-456/tasks/task-789/attempts/attempt-abc'
      );
    });
  });

  describe('Regular (non-story) paths', () => {
    it('generates correct project tasks path', () => {
      const path = paths.projectTasks(projectId);
      expect(path).toBe('/projects/proj-123/tasks');
    });

    it('generates correct task detail path', () => {
      const path = paths.task(projectId, taskId);
      expect(path).toBe('/projects/proj-123/tasks/task-789');
    });

    it('generates correct attempt path', () => {
      const path = paths.attempt(projectId, taskId, attemptId);
      expect(path).toBe('/projects/proj-123/tasks/task-789/attempts/attempt-abc');
    });
  });

  describe('Navigation context preservation logic', () => {
    it('uses story paths when parent_task_id exists', () => {
      const task = {
        id: taskId,
        parent_task_id: storyId, // Story context present
      };

      // Logic that should be used in components
      const attemptPath = task.parent_task_id
        ? paths.storyAttempt(projectId, task.parent_task_id, taskId, attemptId)
        : paths.attempt(projectId, taskId, attemptId);

      expect(attemptPath).toBe(
        '/projects/proj-123/stories/story-456/tasks/task-789/attempts/attempt-abc'
      );
      expect(attemptPath).toContain(`/stories/${storyId}`);
    });

    it('uses regular paths when parent_task_id is null', () => {
      const task = {
        id: taskId,
        parent_task_id: null, // No story context
      };

      const attemptPath = task.parent_task_id
        ? paths.storyAttempt(projectId, task.parent_task_id, taskId, attemptId)
        : paths.attempt(projectId, taskId, attemptId);

      expect(attemptPath).toBe(
        '/projects/proj-123/tasks/task-789/attempts/attempt-abc'
      );
      expect(attemptPath).not.toContain('/stories/');
    });
  });

  describe('Full navigation flow paths', () => {
    it('maintains story context through complete flow', () => {
      // Step 1: User views story tasks
      const step1 = paths.storyTasks(projectId, storyId);
      expect(step1).toContain(`/stories/${storyId}`);

      // Step 2: User clicks on a task
      const step2 = paths.storyTask(projectId, storyId, taskId);
      expect(step2).toContain(`/stories/${storyId}`);
      expect(step2).toContain(`/tasks/${taskId}`);

      // Step 3: User clicks on an attempt
      const step3 = paths.storyAttempt(projectId, storyId, taskId, attemptId);
      expect(step3).toContain(`/stories/${storyId}`);
      expect(step3).toContain(`/tasks/${taskId}`);
      expect(step3).toContain(`/attempts/${attemptId}`);

      // Step 4: User navigates back to story (via breadcrumb)
      const step4 = paths.storyTasks(projectId, storyId);
      expect(step4).toBe(step1); // Back to step 1
    });

    it('works without story context', () => {
      // Step 1: User views all project tasks
      const step1 = paths.projectTasks(projectId);
      expect(step1).not.toContain('/stories/');

      // Step 2: User clicks on a task
      const step2 = paths.task(projectId, taskId);
      expect(step2).not.toContain('/stories/');
      expect(step2).toContain(`/tasks/${taskId}`);

      // Step 3: User clicks on an attempt
      const step3 = paths.attempt(projectId, taskId, attemptId);
      expect(step3).not.toContain('/stories/');
      expect(step3).toContain(`/tasks/${taskId}`);
      expect(step3).toContain(`/attempts/${attemptId}`);
    });
  });

  describe('Breadcrumb navigation paths', () => {
    it('provides correct path to return to story tasks from task detail', () => {
      const currentPath = paths.storyTask(projectId, storyId, taskId);
      const backPath = paths.storyTasks(projectId, storyId);

      expect(currentPath).toContain(backPath.slice(0, -6)); // Remove '/tasks'
      expect(backPath).toBe('/projects/proj-123/stories/story-456/tasks');
    });

    it('provides correct path to return to task from attempt', () => {
      const attemptPath = paths.storyAttempt(projectId, storyId, taskId, attemptId);
      const taskPath = paths.storyTask(projectId, storyId, taskId);

      expect(attemptPath).toContain(taskPath);
    });
  });
});
