import { useMemo } from 'react';
import type { TaskWithAttemptStatus } from 'shared/types';

export type WorkflowAction = 'brainstorm' | 'plan' | 'execute' | null;

export interface TaskWorkflowResult {
  /** 下一步应该执行的动作 */
  nextAction: WorkflowAction;
  /** 动作按钮显示文本 */
  actionLabel: string | null;
  /** 是否可以手动创建 attempt（绕过工作流） */
  canCreateAttempt: boolean;
  /** 当前工作流进度百分比 */
  progress: number;
}

/**
 * Task 工作流状态机
 *
 * 状态转换:
 * new → brainstorm → brainstormed → plan → planned → execute → executing → completed
 */
export function useTaskWorkflow(
  task: TaskWithAttemptStatus | null
): TaskWorkflowResult {
  return useMemo(() => {
    if (!task) {
      return {
        nextAction: null,
        actionLabel: null,
        canCreateAttempt: false,
        progress: 0,
      };
    }

    const state = task.workflow_state || 'new';

    switch (state) {
      case 'new':
        return {
          nextAction: 'brainstorm',
          actionLabel: '开始需求澄清',
          canCreateAttempt: false,
          progress: 0,
        };

      case 'brainstormed':
        return {
          nextAction: 'plan',
          actionLabel: '生成实现计划',
          canCreateAttempt: false,
          progress: 33,
        };

      case 'planned':
        return {
          nextAction: 'execute',
          actionLabel: '开始执行',
          canCreateAttempt: true,
          progress: 66,
        };

      case 'executing':
        return {
          nextAction: null,
          actionLabel: null,
          canCreateAttempt: true,
          progress: 90,
        };

      case 'completed':
        return {
          nextAction: null,
          actionLabel: null,
          canCreateAttempt: true,
          progress: 100,
        };

      default:
        return {
          nextAction: null,
          actionLabel: null,
          canCreateAttempt: true,
          progress: 0,
        };
    }
  }, [task]);
}
