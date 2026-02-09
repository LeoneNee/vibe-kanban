import { useTranslation } from 'react-i18next';
import { useProject } from '@/contexts/ProjectContext';
import { useTaskAttemptsWithSessions } from '@/hooks/useTaskAttempts';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useNavigateWithSearch } from '@/hooks';
import { useUserSystem } from '@/components/ConfigProvider';
import { useTaskWorkflow } from '@/hooks/useTaskWorkflow';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import { PlusIcon, FileText, Play, Sparkles } from 'lucide-react';
import { CreateAttemptDialog } from '@/components/dialogs/tasks/CreateAttemptDialog';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { DataTable, type ColumnDef } from '@/components/ui/table';
import { tasksApi } from '@/lib/api';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();
  const { config } = useUserSystem();
  const workflow = useTaskWorkflow(task);

  // Extract story context from task
  const storyId = task?.parent_task_id;

  const {
    data: attempts = [],
    isLoading: isAttemptsLoading,
    isError: isAttemptsError,
  } = useTaskAttemptsWithSessions(task?.id);

  const { data: parentAttempt, isLoading: isParentLoading } =
    useTaskAttemptWithSession(task?.parent_workspace_id || undefined);

  const formatTimeAgo = (iso: string) => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const absSec = Math.round(Math.abs(diffMs) / 1000);

    const rtf =
      typeof Intl !== 'undefined' &&
      typeof Intl.RelativeTimeFormat === 'function'
        ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        : null;

    const to = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
      rtf
        ? rtf.format(-value, unit)
        : `${value} ${unit}${value !== 1 ? 's' : ''} ago`;

    if (absSec < 60) return to(Math.round(absSec), 'second');
    const mins = Math.round(absSec / 60);
    if (mins < 60) return to(mins, 'minute');
    const hours = Math.round(mins / 60);
    if (hours < 24) return to(hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 30) return to(days, 'day');
    const months = Math.round(days / 30);
    if (months < 12) return to(months, 'month');
    const years = Math.round(months / 12);
    return to(years, 'year');
  };

  const displayedAttempts = [...attempts].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (!task) {
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.noTaskSelected')}
      </div>
    );
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

  const attemptColumns: ColumnDef<WorkspaceWithSession>[] = [
    {
      id: 'executor',
      header: '',
      accessor: (attempt) => attempt.session?.executor || 'Base Agent',
      className: 'pr-4',
    },
    {
      id: 'branch',
      header: '',
      accessor: (attempt) => attempt.branch || '—',
      className: 'pr-4',
    },
    {
      id: 'time',
      header: '',
      accessor: (attempt) => formatTimeAgo(attempt.created_at),
      className: 'pr-0 text-right',
    },
  ];

  return (
    <>
      <NewCardContent>
        <div className="p-6 flex flex-col h-full max-h-[calc(100vh-8rem)]">
          {task && workflow.progress > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">工作流进度</span>
                <span className="text-foreground font-medium">{workflow.progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${workflow.progress}%` }}
                />
              </div>
              {workflow.nextAction && (
                <p className="text-xs text-muted-foreground">
                  下一步: {workflow.actionLabel}
                </p>
              )}

              {/* 工作流动作按钮 */}
              {workflow.nextAction === 'brainstorm' && (
                <Button
                  onClick={async () => {
                    if (!task || !projectId) return;
                    const storyId = task.parent_task_id;
                    if (!storyId) return;

                    navigate(paths.taskBrainstorm(projectId, storyId, task.id));
                  }}
                  size="default"
                  className="w-full mt-2"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {workflow.actionLabel}
                </Button>
              )}

              {workflow.nextAction === 'plan' && (
                <Button
                  onClick={async () => {
                    if (!task || !projectId) return;

                    // 更新 workflow_state 为 'brainstormed'（如果还不是）
                    if (task.workflow_state !== 'brainstormed') {
                      await tasksApi.update(task.id, {
                        title: task.title,
                        description: task.description,
                        status: task.status,
                        workflow_state: 'brainstormed',
                        parent_workspace_id: task.parent_workspace_id,
                        parent_task_id: task.parent_task_id,
                        image_ids: null,
                      });
                    }

                    // 显示对话框让用户创建 planning workspace
                    CreateAttemptDialog.show({
                      taskId: task.id,
                    });
                  }}
                  size="default"
                  className="w-full mt-2"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {workflow.actionLabel}
                </Button>
              )}

              {workflow.nextAction === 'execute' && (
                <Button
                  onClick={async () => {
                    if (!task || !projectId) return;

                    // 更新 workflow_state 为 'planned'（如果还不是）
                    if (task.workflow_state !== 'planned') {
                      await tasksApi.update(task.id, {
                        title: task.title,
                        description: task.description,
                        status: task.status,
                        workflow_state: 'planned',
                        parent_workspace_id: task.parent_workspace_id,
                        parent_task_id: task.parent_task_id,
                        image_ids: null,
                      });
                    }

                    // 创建执行 workspace
                    CreateAttemptDialog.show({
                      taskId: task.id,
                    });
                  }}
                  size="default"
                  className="w-full mt-2"
                >
                  <Play className="mr-2 h-4 w-4" />
                  {workflow.actionLabel}
                </Button>
              )}
            </div>
          )}
          <div className="space-y-3 overflow-y-auto flex-shrink min-h-0">
            <WYSIWYGEditor value={titleContent} disabled />
            {descriptionContent && (
              <WYSIWYGEditor value={descriptionContent} disabled />
            )}
          </div>

          <div className="mt-6 flex-shrink-0 space-y-4">
            {task.parent_workspace_id && (
              <DataTable
                data={parentAttempt ? [parentAttempt] : []}
                columns={attemptColumns}
                keyExtractor={(attempt) => attempt.id}
                onRowClick={(attempt) => {
                  if (config?.beta_workspaces) {
                    navigate(`/workspaces/${attempt.id}`);
                  } else if (projectId) {
                    const attemptPath = storyId
                      ? paths.storyAttempt(projectId, storyId, attempt.task_id, attempt.id)
                      : paths.attempt(projectId, attempt.task_id, attempt.id);
                    navigate(attemptPath);
                  }
                }}
                isLoading={isParentLoading}
                headerContent="Parent Attempt"
              />
            )}

            {isAttemptsLoading ? (
              <div className="text-muted-foreground">
                {t('taskPanel.loadingAttempts')}
              </div>
            ) : isAttemptsError ? (
              <div className="text-destructive">
                {t('taskPanel.errorLoadingAttempts')}
              </div>
            ) : (
              <DataTable
                data={displayedAttempts}
                columns={attemptColumns}
                keyExtractor={(attempt) => attempt.id}
                onRowClick={(attempt) => {
                  if (config?.beta_workspaces) {
                    navigate(`/workspaces/${attempt.id}`);
                  } else if (projectId && task.id) {
                    const attemptPath = storyId
                      ? paths.storyAttempt(projectId, storyId, task.id, attempt.id)
                      : paths.attempt(projectId, task.id, attempt.id);
                    navigate(attemptPath);
                  }
                }}
                emptyState={t('taskPanel.noAttempts')}
                headerContent={
                  <div className="w-full flex text-left">
                    <span className="flex-1">
                      {t('taskPanel.attemptsCount', {
                        count: displayedAttempts.length,
                      })}
                    </span>
                    <span>
                      <Button
                        variant="icon"
                        onClick={() =>
                          CreateAttemptDialog.show({
                            taskId: task.id,
                          })
                        }
                      >
                        <PlusIcon size={16} />
                      </Button>
                    </span>
                  </div>
                }
              />
            )}
          </div>
        </div>
      </NewCardContent>
    </>
  );
};

export default TaskPanel;
