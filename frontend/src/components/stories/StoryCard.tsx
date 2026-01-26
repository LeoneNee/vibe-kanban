import { useCallback, useEffect, useRef, useState } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import type { Task, TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { TaskCardHeader } from '../tasks/TaskCardHeader';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { tasksApi } from '@/lib/api';

interface StoryCardProps {
  task: Task;
  index: number;
  status: string;
  onViewDetails: (task: Task) => void;
  isOpen?: boolean;
  projectId: string;
}

export function StoryCard({
  task,
  index,
  status,
  onViewDetails,
  isOpen,
  projectId,
}: StoryCardProps) {
  // Import translation hook as required
  useTranslation('tasks');

  const [childCount, setChildCount] = useState<number>(0);

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tasksApi
      .list({
        projectId,
        taskType: 'task',
        parentTaskId: task.id,
      })
      .then((children) => setChildCount(children.length))
      .catch(console.error);
  }, [task.id, projectId]);

  useEffect(() => {
    if (!isOpen || !localRef.current) return;
    const el = localRef.current;
    requestAnimationFrame(() => {
      el.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });
  }, [isOpen]);

  return (
    <KanbanCard
      key={task.id}
      id={task.id}
      name={task.title}
      index={index}
      parent={status}
      onClick={handleClick}
      isOpen={isOpen}
      forwardedRef={localRef}
    >
      <div className="flex flex-col gap-2">
        <TaskCardHeader
          title={task.title}
          right={
            <div className="flex items-center gap-2">
              {childCount > 0 && (
                <Badge variant="secondary">
                  {childCount} {childCount === 1 ? 'task' : 'tasks'}
                </Badge>
              )}
              <ActionsDropdown
                task={task as unknown as TaskWithAttemptStatus}
              />
            </div>
          }
        />
        {task.description && (
          <p className="text-sm text-secondary-foreground break-words">
            {task.description.length > 130
              ? `${task.description.substring(0, 130)}...`
              : task.description}
          </p>
        )}
      </div>
    </KanbanCard>
  );
}
