import { memo } from 'react';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import type { Task } from 'shared/types';
import { StoryCard } from './StoryCard';

export type StoryKanbanColumns = Record<'backlog' | 'inprogress' | 'done' | 'cancelled', Task[]>;

interface StoryKanbanBoardProps {
  columns: StoryKanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewStoryDetails: (task: Task) => void;
  onViewDoc?: (task: Task) => void;
  selectedStoryId?: string;
  onCreateStory?: () => void;
  projectId: string;
}

const columnMeta: Record<
  keyof StoryKanbanColumns,
  { name: string; color: string; id: 'todo' | 'inprogress' | 'done' | 'cancelled' }
> = {
  backlog: { name: 'Backlog', color: '--neutral-foreground', id: 'todo' },
  inprogress: { name: 'In Progress', color: '--info', id: 'inprogress' },
  done: { name: 'Done', color: '--success', id: 'done' },
  cancelled: { name: 'Cancelled', color: '--muted-foreground', id: 'cancelled' },
};

function StoryKanbanBoard({
  columns,
  onDragEnd,
  onViewStoryDetails,
  onViewDoc,
  selectedStoryId,
  onCreateStory,
  projectId,
}: StoryKanbanBoardProps) {
  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {(Object.keys(columns) as Array<keyof StoryKanbanColumns>).map((colKey) => {
        const { name, color, id } = columnMeta[colKey];
        const stories = columns[colKey];
        return (
          <KanbanBoard key={colKey} id={id}>
            <KanbanHeader name={name} color={color} onAddTask={onCreateStory} />
            <KanbanCards>
              {stories.map((story, index) => (
                <StoryCard
                  key={story.id}
                  task={story}
                  index={index}
                  status={id}
                  onViewDetails={onViewStoryDetails}
                  onViewDoc={onViewDoc}
                  isOpen={selectedStoryId === story.id}
                  projectId={projectId}
                />
              ))}
            </KanbanCards>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
}

export default memo(StoryKanbanBoard);

