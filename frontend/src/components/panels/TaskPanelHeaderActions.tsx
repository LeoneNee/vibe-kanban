import { Button } from '../ui/button';
import { X, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import { paths } from '@/lib/paths';

type Task = TaskWithAttemptStatus;

interface TaskPanelHeaderActionsProps {
  task: Task;
  onClose: () => void;
}

export const TaskPanelHeaderActions = ({
  task,
  onClose,
}: TaskPanelHeaderActionsProps) => {
  const navigate = useNavigate();
  const { projectId, storyId } = useParams<{
    projectId: string;
    storyId?: string;
  }>();

  const handleBrainstorm = () => {
    if (projectId && storyId && task.id) {
      navigate(paths.taskBrainstorm(projectId, storyId, task.id));
    }
  };

  // Only show brainstorm button for tasks under a story in new or brainstormed state
  const showBrainstorm =
    !!storyId &&
    task.task_type === 'task' &&
    (task.workflow_state === 'new' || task.workflow_state === 'brainstormed');

  return (
    <>
      {showBrainstorm && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleBrainstorm}
          title={
            task.workflow_state === 'new'
              ? 'Start requirement clarification'
              : 'Review brainstorm results'
          }
        >
          <Sparkles size={16} className="mr-1" />
          {task.workflow_state === 'new' ? 'Brainstorm' : 'Review'}
        </Button>
      )}
      <ActionsDropdown task={task} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
