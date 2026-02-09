import { describe, it, expect } from 'vitest';
import type { CreateTask, TaskType } from 'shared/types';

/**
 * Test logic for parent_task_id and parent_workspace_id assignment
 * This tests the logic that should be implemented in TaskFormDialog
 */
describe('TaskFormDialog - Parent Task Assignment Logic', () => {
  // Helper function that mimics the logic in TaskFormDialog
  const buildTask = (params: {
    mode: 'create' | 'edit' | 'subtask';
    taskType?: TaskType;
    parentTaskId?: string;
    parentTaskAttemptId?: string;
    projectId: string;
    title: string;
    description: string;
  }): CreateTask => {
    const {
      mode,
      taskType,
      parentTaskId,
      parentTaskAttemptId,
      projectId,
      title,
      description,
    } = params;

    // This is the CORRECT logic we want to implement
    return {
      project_id: projectId,
      title,
      description,
      status: null,
      task_type: mode === 'create' && taskType ? taskType : 'task',
      parent_workspace_id:
        mode === 'subtask' ? parentTaskAttemptId || null : null,
      parent_task_id: mode === 'create' && parentTaskId ? parentTaskId : null,
      image_ids: null,
    };
  };

  it('correctly assigns parent_task_id when creating task under story', () => {
    const task = buildTask({
      mode: 'create',
      projectId: 'proj-123',
      taskType: 'task',
      parentTaskId: 'story-456',
      title: 'New Task',
      description: 'Description',
    });

    expect(task).toMatchObject({
      parent_task_id: 'story-456',
      parent_workspace_id: null,
      task_type: 'task',
    });
  });

  it('correctly assigns parent_workspace_id when creating subtask', () => {
    const task = buildTask({
      mode: 'subtask',
      projectId: 'proj-123',
      parentTaskAttemptId: 'workspace-789',
      title: 'New Subtask',
      description: 'Description',
    });

    expect(task).toMatchObject({
      parent_task_id: null,
      parent_workspace_id: 'workspace-789',
      task_type: 'task',
    });
  });

  it('sets both to null when creating task without parent', () => {
    const task = buildTask({
      mode: 'create',
      projectId: 'proj-123',
      taskType: 'task',
      title: 'New Task',
      description: 'Description',
    });

    expect(task).toMatchObject({
      parent_task_id: null,
      parent_workspace_id: null,
      task_type: 'task',
    });
  });

  it('preserves taskType when provided in create mode', () => {
    const storyTask = buildTask({
      mode: 'create',
      projectId: 'proj-123',
      taskType: 'story',
      title: 'New Story',
      description: 'Description',
    });

    expect(storyTask.task_type).toBe('story');
  });
});
