import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTaskWorkflow } from './useTaskWorkflow';
import type { TaskWithAttemptStatus, WorkflowState } from 'shared/types';

describe('useTaskWorkflow', () => {
  const createMockTask = (workflow_state: WorkflowState): TaskWithAttemptStatus => ({
    id: 'task-1',
    project_id: 'proj-1',
    title: 'Test Task',
    description: 'Test description',
    status: 'todo',
    task_type: 'task',
    parent_workspace_id: null,
    parent_task_id: 'story-1',
    workflow_state,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    executor: 'claude_code',
    tag: null,
  });

  it('should return "brainstorm" action for new tasks', () => {
    const task = createMockTask('new');
    const { result } = renderHook(() => useTaskWorkflow(task));

    expect(result.current.nextAction).toBe('brainstorm');
    expect(result.current.actionLabel).toBe('开始需求澄清');
  });

  it('should return "plan" action for brainstormed tasks', () => {
    const task = createMockTask('brainstormed');
    const { result } = renderHook(() => useTaskWorkflow(task));

    expect(result.current.nextAction).toBe('plan');
    expect(result.current.actionLabel).toBe('生成实现计划');
  });

  it('should return "execute" action for planned tasks', () => {
    const task = createMockTask('planned');
    const { result } = renderHook(() => useTaskWorkflow(task));

    expect(result.current.nextAction).toBe('execute');
    expect(result.current.actionLabel).toBe('开始执行');
  });

  it('should return null for executing/completed tasks', () => {
    const executingTask = createMockTask('executing');
    const { result: executingResult } = renderHook(() => useTaskWorkflow(executingTask));
    expect(executingResult.current.nextAction).toBeNull();

    const completedTask = createMockTask('completed');
    const { result: completedResult } = renderHook(() => useTaskWorkflow(completedTask));
    expect(completedResult.current.nextAction).toBeNull();
  });
});
