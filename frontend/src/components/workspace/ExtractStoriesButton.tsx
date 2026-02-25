import { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useEntries } from '@/contexts/EntriesContext';
import { useTask } from '@/hooks/useTask';
import { extractJsonCardsFromEntries } from '@/utils/extractJsonCards';
import { isBrainstormFullyComplete } from '@/utils/checkBrainstormComplete';
import { useAutoExtractStories } from '@/hooks/useAutoExtractStories';
import { paths } from '@/lib/paths';
import type { WorkspaceWithSession } from '@/types/attempt';

interface ExtractStoriesButtonProps {
  workspaceWithSession: WorkspaceWithSession | undefined;
}

export function ExtractStoriesButton({
  workspaceWithSession,
}: ExtractStoriesButtonProps) {
  const { entries } = useEntries();
  const navigate = useNavigate();
  const { data: task } = useTask(workspaceWithSession?.task_id ?? '', {
    enabled: !!workspaceWithSession?.task_id,
  });

  const projectId = task?.project_id;
  const isBrainstormTask = task?.title?.includes('Brainstorm') ?? false;

  const extractedCards = useMemo(
    () => (isBrainstormTask ? extractJsonCardsFromEntries(entries) : []),
    [entries, isBrainstormTask]
  );

  const isComplete =
    isBrainstormTask &&
    isBrainstormFullyComplete(extractedCards) &&
    !!projectId;

  const { status, error, storiesCreated, tasksCreated } =
    useAutoExtractStories(extractedCards, projectId ?? undefined, isComplete);

  // Auto-navigate when done
  useEffect(() => {
    if (status === 'done' && projectId) {
      navigate(paths.projectStories(projectId));
    }
  }, [status, projectId, navigate]);

  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-background border shadow-lg px-4 py-3 flex items-center gap-3">
      {status === 'extracting' && (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">
            正在创建 {extractedCards.length} 个 Stories...
          </span>
        </>
      )}
      {status === 'committing' && (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">正在提交到 Git...</span>
        </>
      )}
      {status === 'done' && (
        <>
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <span className="text-sm">
            已创建 {storiesCreated} 个 Stories，{tasksCreated} 个 Tasks
          </span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </>
      )}
    </div>
  );
}
