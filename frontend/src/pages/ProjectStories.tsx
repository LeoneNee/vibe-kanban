import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import { Loader } from '@/components/ui/loader';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { useProject } from '@/contexts/ProjectContext';
import { useSearch } from '@/contexts/SearchContext';
import { useProjectStories } from '@/hooks/useProjectStories';
import StoryKanbanBoard, {
  type StoryKanbanColumns,
} from '@/components/stories/StoryKanbanBoard';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { paths } from '@/lib/paths';
import { tasksApi } from '@/lib/api';
import type { Task, TaskStatus } from 'shared/types';

const normalizeStatus = (status: string): TaskStatus =>
  status.toLowerCase() as TaskStatus;

export function ProjectStories() {
  const navigate = useNavigate();
  const { storyId } = useParams<{ projectId: string; storyId?: string }>();

  const {
    projectId,
    isLoading: projectLoading,
    error: projectError,
  } = useProject();

  const { query: searchQuery } = useSearch();

  const {
    data: stories = [],
    isLoading,
    error,
  } = useProjectStories(projectId || '');

  // When a story disappears (deleted or filtered out), ensure URL is reset
  useEffect(() => {
    if (!projectId || !storyId || isLoading) return;
    const exists = stories.some((s) => s.id === storyId);
    if (!exists) {
      navigate(paths.projectStories(projectId), { replace: true });
    }
  }, [projectId, storyId, isLoading, stories, navigate]);

  const hasSearch = Boolean(searchQuery.trim());
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const kanbanColumns = useMemo(() => {
    const columns: StoryKanbanColumns = {
      backlog: [],
      inprogress: [],
      done: [],
    };

    const matchesSearch = (
      title: string,
      description?: string | null
    ): boolean => {
      if (!hasSearch) return true;
      const lowerTitle = title.toLowerCase();
      const lowerDescription = description?.toLowerCase() ?? '';
      return (
        lowerTitle.includes(normalizedSearch) ||
        lowerDescription.includes(normalizedSearch)
      );
    };

    // Group: backlog = todo + cancelled, inprogress = inprogress + inreview, done = done
    stories.forEach((story) => {
      if (!matchesSearch(story.title, story.description)) return;

      const status = normalizeStatus(story.status);
      if (status === 'todo' || status === 'cancelled') {
        columns.backlog.push(story);
      } else if (status === 'inprogress' || status === 'inreview') {
        columns.inprogress.push(story);
      } else if (status === 'done') {
        columns.done.push(story);
      }
    });

    // Sort each column by recency
    (Object.keys(columns) as Array<keyof StoryKanbanColumns>).forEach((key) => {
      columns[key].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return columns;
  }, [stories, hasSearch, normalizedSearch]);

  const selectedStory = useMemo(
    () => (storyId ? stories.find((s) => s.id === storyId) ?? null : null),
    [storyId, stories]
  );

  const hasVisibleStories = useMemo(
    () =>
      Object.values(kanbanColumns).some((items) => items && items.length > 0),
    [kanbanColumns]
  );

  const handleViewStoryDetails = useCallback(
    (story: Task) => {
      if (!projectId) return;
      navigate(paths.storyTasks(projectId, story.id));
    },
    [navigate, projectId]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const draggedId = active.id as string;
      // Column IDs for StoryKanbanBoard map to task statuses directly: 'todo' | 'inprogress' | 'done'
      const newStatus = over.id as Extract<
        TaskStatus,
        'todo' | 'inprogress' | 'done'
      >;
      const story = stories.find((s) => s.id === draggedId);
      if (!story || story.status === newStatus) return;

      try {
        await tasksApi.update(draggedId, {
          title: story.title,
          description: story.description,
          status: newStatus,
          task_type: story.task_type,
          parent_workspace_id: story.parent_workspace_id,
          image_ids: null,
        });
      } catch (err) {
        console.error('Failed to update story status:', err);
      }
    },
    [stories]
  );

  const isInitialLoad = isLoading && stories.length === 0;

  if (projectError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size={16} />
            Error
          </AlertTitle>
          <AlertDescription>
            {projectError.message || 'Failed to load project'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size={16} />
            Error
          </AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load stories'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (projectLoading && isInitialLoad) {
    return <Loader message="Loading stories..." size={32} className="py-8" />;
  }

  return (
    <div className="h-full flex flex-col">
      {stories.length === 0 ? (
        <div className="max-w-7xl mx-auto mt-8">
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">No stories yet</p>
            </CardContent>
          </Card>
        </div>
      ) : !hasVisibleStories ? (
        <div className="max-w-7xl mx-auto mt-8">
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">No search results</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="w-full h-full overflow-x-auto overflow-y-auto overscroll-x-contain">
          <StoryKanbanBoard
            columns={kanbanColumns}
            onDragEnd={handleDragEnd}
            onViewStoryDetails={handleViewStoryDetails}
            selectedStoryId={selectedStory?.id}
            projectId={projectId!}
          />
        </div>
      )}
    </div>
  );
}

export default ProjectStories;

