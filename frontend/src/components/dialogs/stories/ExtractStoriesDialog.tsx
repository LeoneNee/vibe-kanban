import { useCallback, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2, Edit2, CheckSquare } from 'lucide-react';

import { defineModal } from '@/lib/modals';
import { tasksApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import { buildStoryTask } from '@/utils/buildStoryTask';
import type { Task } from 'shared/types';
import type { BrainstormCard, BrainstormTask } from '@/utils/extractJsonCards';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export interface ExtractStoriesDialogProps {
  cards: BrainstormCard[];
  projectId: string;
}

const ExtractStoriesDialogImpl = NiceModal.create<ExtractStoriesDialogProps>(
  ({ cards: initialCards, projectId }) => {
    const modal = useModal();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [cards, setCards] = useState<BrainstormCard[]>(initialCards);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const updateCard = useCallback(
      (index: number, updated: Partial<BrainstormCard>) => {
        setCards((prev) =>
          prev.map((card, i) => (i === index ? { ...card, ...updated } : card))
        );
        setEditingIndex(null);
      },
      []
    );

    const deleteCard = useCallback((index: number) => {
      setCards((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleCreate = useCallback(async () => {
      console.log('[ExtractStoriesDialog] handleCreate started');
      console.log(`[ExtractStoriesDialog] cards length: ${cards.length}`);
      setIsCreating(true);
      setError(null);

      try {
        // Step 1: Create all stories first
        const storyTasks = cards.map((card) => buildStoryTask(projectId, card));
        console.log(
          `[ExtractStoriesDialog] Creating ${storyTasks.length} stories`
        );
        const storyResults = await Promise.allSettled(
          storyTasks.map((task) => tasksApi.create(task))
        );

        // Build pairs of (story, card) for successfully created stories
        const successfulPairs: { story: Task; card: BrainstormCard }[] = [];
        let storyFailed = 0;

        storyResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulPairs.push({ story: result.value, card: cards[index] });
          } else {
            storyFailed++;
          }
        });

        console.log(
          `[ExtractStoriesDialog] Created ${successfulPairs.length} stories, ${storyFailed} failed`
        );

        // Step 1.5: Write doc_content for stories that have it
        for (const { story, card } of successfulPairs) {
          if (card.doc_content?.trim()) {
            try {
              await tasksApi.writeDoc(story.id, card.doc_content);
              console.log(
                `[ExtractStoriesDialog] Wrote doc for story ${story.id}`
              );
            } catch (err) {
              console.warn(
                `[ExtractStoriesDialog] Failed to write doc for story ${story.id}:`,
                err
              );
            }
          }
        }

        // Step 2: Create child tasks for each story
        let tasksFailed = 0;
        let tasksCreated = 0;

        for (const { story, card } of successfulPairs) {
          if (card.tasks && card.tasks.length > 0) {
            console.log(
              `[ExtractStoriesDialog] Creating ${card.tasks.length} child tasks for story ${story.id}`
            );

            const childTasksToCreate = card.tasks.map((task) => ({
              project_id: projectId,
              title: task.title,
              description: task.description || null,
              status: null,
              task_type: 'task' as const,
              parent_workspace_id: null,
              parent_task_id: story.id,
              image_ids: null,
            }));

            const childResults = await Promise.allSettled(
              childTasksToCreate.map((task) => tasksApi.create(task))
            );

            const succeeded = childResults.filter((r) => r.status === 'fulfilled')
              .length;
            tasksCreated += succeeded;
            tasksFailed += childResults.length - succeeded;
          }
        }

        console.log(
          `[ExtractStoriesDialog] Created ${tasksCreated} child tasks, ${tasksFailed} failed`
        );

        // Invalidate queries to refresh the UI
        await queryClient.invalidateQueries({
          queryKey: ['stories', projectId],
        });

        if (storyFailed === 0 && tasksFailed === 0) {
          modal.resolve();
          modal.hide();
          navigate(paths.projectStories(projectId));
        } else {
          const errorParts = [];
          if (storyFailed > 0)
            errorParts.push(`${storyFailed} stories failed`);
          if (tasksFailed > 0) errorParts.push(`${tasksFailed} tasks failed`);
          setError(
            `Created ${successfulPairs.length} stories and ${tasksCreated} tasks, but ${errorParts.join(' and ')}.`
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create stories.';
        setError(message);
      } finally {
        setIsCreating(false);
      }
    }, [cards, projectId, queryClient, modal, navigate]);

    const handleCancel = () => {
      modal.reject();
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    if (cards.length === 0) {
      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>No Stories to Create</DialogTitle>
              <DialogDescription>
                All cards have been removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleCancel}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review & Create Stories</DialogTitle>
            <DialogDescription>
              Review the extracted stories below. Tasks will be created as
              separate task cards linked to their parent story.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {cards.map((card, index) => (
              <Card key={index} className="relative">
                <CardContent className="pt-6">
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditingIndex(editingIndex === index ? null : index)
                      }
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCard(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {editingIndex === index ? (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor={`title-${index}`}>Title</Label>
                        <Input
                          id={`title-${index}`}
                          value={card.title}
                          onChange={(e) =>
                            updateCard(index, { title: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`description-${index}`}>
                          Description
                        </Label>
                        <Textarea
                          id={`description-${index}`}
                          value={card.description || ''}
                          onChange={(e) =>
                            updateCard(index, { description: e.target.value })
                          }
                          rows={3}
                        />
                      </div>
                      <Button size="sm" onClick={() => setEditingIndex(null)}>
                        Done
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-semibold text-base mb-2 pr-20">
                        {card.title}
                      </h3>
                      {card.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {card.description}
                        </p>
                      )}
                      {card.tasks && card.tasks.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                            <CheckSquare className="h-3.5 w-3.5" />
                            <span>Tasks ({card.tasks.length})</span>
                          </div>
                          <ul className="space-y-1">
                            {card.tasks.map((task: BrainstormTask, taskIndex: number) => (
                              <li
                                key={taskIndex}
                                className="text-sm text-foreground/80 flex items-start gap-2"
                              >
                                <span className="text-muted-foreground mt-1">•</span>
                                <span>{task.title}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                        {card.priority && (
                          <span className="capitalize">
                            Priority: {card.priority}
                          </span>
                        )}
                        {card.complexity && (
                          <span>Complexity: {card.complexity}</span>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Creating Stories</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Creating...' : `Create ${cards.length} Stories`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ExtractStoriesDialog = defineModal<
  ExtractStoriesDialogProps,
  void
>(ExtractStoriesDialogImpl);
