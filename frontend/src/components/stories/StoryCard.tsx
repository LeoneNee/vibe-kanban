import { useCallback, useEffect, useRef } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import { FileText } from 'lucide-react';
import type { Task, TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { Button } from '@/components/ui/button';
import { TaskCardHeader } from '../tasks/TaskCardHeader';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

interface StoryCardProps {
  task: Task;
  index: number;
  status: string;
  onViewDetails: (task: Task) => void;
  onViewDoc?: (task: Task) => void;
  isOpen?: boolean;
  /** @deprecated child_count is now included in the task object from the API */
  projectId?: string;
}

export function StoryCard({
  task,
  index,
  status,
  onViewDetails,
  onViewDoc,
  isOpen,
}: StoryCardProps) {
  // Import translation hook as required
  useTranslation('tasks');

  const childCount = Number(task.child_count ?? 0);

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const localRef = useRef<HTMLDivElement>(null);

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
              {onViewDoc && (
                <Button
                  variant="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDoc(task);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="View document"
                >
                  <FileText className="h-4 w-4" />
                </Button>
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
