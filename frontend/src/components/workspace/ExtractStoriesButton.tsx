import { useMemo, useState, useCallback } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useEntries } from '@/contexts/EntriesContext';
import { useTask } from '@/hooks/useTask';
import { Button } from '@/components/ui/button';
import { ExtractStoriesDialog } from '@/components/dialogs/stories/ExtractStoriesDialog';
import { extractJsonCardsFromEntries } from '@/utils/extractJsonCards';
import { useCompleteBrainstorm } from '@/hooks/useCompleteBrainstorm';
import { hasAllTasksGenerated } from '@/utils/checkBrainstormComplete';
import { useUserSystem } from '@/components/ConfigProvider';
import type { WorkspaceWithSession } from '@/types/attempt';
import { BaseCodingAgent } from 'shared/types';

interface ExtractStoriesButtonProps {
  workspaceWithSession: WorkspaceWithSession | undefined;
}

export function ExtractStoriesButton({
  workspaceWithSession,
}: ExtractStoriesButtonProps) {
  const { entries } = useEntries();
  const { data: task } = useTask(workspaceWithSession?.task_id ?? '', {
    enabled: !!workspaceWithSession?.task_id,
  });
  const [isCompleting, setIsCompleting] = useState(false);
  const { config } = useUserSystem();
  const sessionId = workspaceWithSession?.session?.id;

  const { complete, isCompleting: isApiCompleting } = useCompleteBrainstorm({
    sessionId,
  });

  const projectId = task?.project_id;

  // Only show for brainstorm tasks
  const isBrainstormTask = task?.title?.includes('Brainstorm') ?? false;

  // Extract cards from conversation
  const extractedCards = useMemo(
    () => (isBrainstormTask ? extractJsonCardsFromEntries(entries) : []),
    [entries, isBrainstormTask]
  );

  // Handle extract click
  const handleExtract = useCallback(async () => {
    if (!projectId) return;

    // Check if all Story have tasks
    const allHaveTasks = hasAllTasksGenerated(extractedCards);

    if (allHaveTasks) {
      // Directly open dialog
      ExtractStoriesDialog.show({
        cards: extractedCards,
        projectId,
      });
    } else {
      // Need to complete brainstorm chain
      setIsCompleting(true);
      try {
        const executor = config?.executor_profile?.executor ?? BaseCodingAgent.CLAUDE_CODE;

        // Send message to trigger story-doc-generator and task-splitter
        await complete(extractedCards, executor);

        // Wait a moment for conversation to update
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Re-extract JSON from entries
        const updatedCards = extractJsonCardsFromEntries(entries);

        // Check if tasks were actually generated
        const nowHasTasks = hasAllTasksGenerated(updatedCards);
        if (nowHasTasks) {
          console.log(`Brainstorm completed: Generated tasks for ${updatedCards.length} stories.`);
        }

        // Open dialog
        ExtractStoriesDialog.show({
          cards: updatedCards,
          projectId,
        });
      } catch (err) {
        console.error('Failed to complete brainstorm:', err);
        console.warn('An error occurred while generating tasks. Showing current stories.');

        // Even if failed, still show current cards
        ExtractStoriesDialog.show({
          cards: extractedCards,
          projectId,
        });
      } finally {
        setIsCompleting(false);
      }
    }
  }, [extractedCards, projectId, complete, config, entries]);

  // Don't show button if not a brainstorm task, no cards, or no project
  if (!isBrainstormTask || extractedCards.length === 0 || !projectId) {
    return null;
  }

  const isLoading = isCompleting || isApiCompleting;

  return (
    <Button
      onClick={handleExtract}
      disabled={isLoading}
      className="fixed bottom-6 right-6 z-50 shadow-lg"
      size="lg"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Completing brainstorm...
        </>
      ) : (
        <>
          <Sparkles className="mr-2 h-5 w-5" />
          Extract {extractedCards.length} {extractedCards.length === 1 ? 'Story' : 'Stories'}
        </>
      )}
    </Button>
  );
}
