import { memo, useState } from 'react';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskTag, TaskWithAttemptStatus } from 'shared/types';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import { ALL_TASK_TAGS, TASK_TAG_CONFIGS } from '@/config/taskTags';
import { cn } from '@/lib/utils';

export type KanbanColumns = Record<TaskStatus, TaskWithAttemptStatus[]>;

interface TaskKanbanBoardProps {
  columns: KanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onViewDoc?: (task: TaskWithAttemptStatus) => void;
  selectedTaskId?: string;
  onCreateTask?: () => void;
  projectId: string;
}

function TaskKanbanBoard({
  columns,
  onDragEnd,
  onViewTaskDetails,
  onViewDoc,
  selectedTaskId,
  onCreateTask,
  projectId,
}: TaskKanbanBoardProps) {
  const [tagFilter, setTagFilter] = useState<TaskTag | null>(null);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Tag filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap px-1 shrink-0">
        {ALL_TASK_TAGS.map((tagKey) => {
          const config = TASK_TAG_CONFIGS[tagKey];
          const isSelected = tagFilter === tagKey;
          return (
            <button
              key={tagKey}
              type="button"
              onClick={() => setTagFilter(isSelected ? null : tagKey)}
              className={cn(
                'px-2 py-0.5 rounded text-xs border transition-colors',
                isSelected
                  ? `${config.bgColor} border-current font-medium`
                  : 'border-border text-muted-foreground hover:border-foreground/30'
              )}
            >
              <span
                className={cn(
                  'inline-block w-2 h-2 rounded-full mr-1',
                  config.dotColor
                )}
              />
              {config.label}
            </button>
          );
        })}
      </div>

      <KanbanProvider onDragEnd={onDragEnd}>
        {Object.entries(columns).map(([status, tasks]) => {
          const statusKey = status as TaskStatus;
          const filteredTasks = tagFilter
            ? tasks.filter((t) => t.tag === tagFilter)
            : tasks;
          return (
            <KanbanBoard key={status} id={statusKey}>
              <KanbanHeader
                name={statusLabels[statusKey]}
                color={statusBoardColors[statusKey]}
                onAddTask={onCreateTask}
              />
              <KanbanCards>
                {filteredTasks.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    index={index}
                    status={statusKey}
                    onViewDetails={onViewTaskDetails}
                    onViewDoc={onViewDoc}
                    isOpen={selectedTaskId === task.id}
                    projectId={projectId}
                  />
                ))}
              </KanbanCards>
            </KanbanBoard>
          );
        })}
      </KanbanProvider>
    </div>
  );
}

export default memo(TaskKanbanBoard);
