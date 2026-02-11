import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, Sparkles } from 'lucide-react';

import { defineModal } from '@/lib/modals';
import { tasksApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { BrainstormCard } from '@/utils/extractJsonCards';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CreateTask } from 'shared/types';

export interface StoryBulkCreateDialogProps {
  projectId: string;
}

type Mode = 'list' | 'json' | 'brainstorm';

const BRAINSTORM_PROMPT = `/brainstorming-cards`;

const JSON_SAMPLE = JSON.stringify(
  [
    {
      id: 'story-1',
      title: 'Story title',
      description: 'Short description',
      priority: 'medium',
      complexity: 3,
      notes: 'Optional notes',
    },
  ],
  null,
  2
);

const clampCount = (value: number) => Math.max(3, Math.min(7, value));

const parseQuickList = (text: string): BrainstormCard[] => {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separators = [' - ', ' – ', ' — ', ': '];
      let title = line;
      let description = '';
      for (const separator of separators) {
        const index = line.indexOf(separator);
        if (index > -1) {
          title = line.slice(0, index).trim();
          description = line.slice(index + separator.length).trim();
          break;
        }
      }
      return {
        title,
        description: description || undefined,
      };
    })
    .filter((card) => card.title.length > 0);
};

const normalizePriority = (value: unknown): BrainstormCard['priority'] => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return undefined;
};

const normalizeComplexity = (value: unknown): number | undefined => {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(5, Math.round(parsed)));
};

const parseJsonCards = (text: string): BrainstormCard[] => {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('JSON must be an array of cards.');
  }
  return parsed
    .map((item): BrainstormCard | null => {
      if (!item || typeof item !== 'object') return null;
      const card = item as Record<string, unknown>;
      const title = typeof card.title === 'string' ? card.title.trim() : '';
      if (!title) return null;
      return {
        id: typeof card.id === 'string' ? card.id : undefined,
        title,
        description:
          typeof card.description === 'string'
            ? card.description.trim()
            : undefined,
        priority: normalizePriority(card.priority),
        complexity: normalizeComplexity(card.complexity),
        notes: typeof card.notes === 'string' ? card.notes.trim() : undefined,
      };
    })
    .filter((card): card is BrainstormCard => card !== null);
};

const buildStoryDescription = (card: BrainstormCard) => {
  const details: string[] = [];
  if (card.priority) {
    details.push(`Priority: ${card.priority}`);
  }
  if (card.complexity) {
    details.push(`Complexity: ${card.complexity}`);
  }
  if (card.notes) {
    details.push(`Notes: ${card.notes}`);
  }

  return [card.description?.trim(), details.join('\n')]
    .filter(Boolean)
    .join('\n\n');
};

const buildStoryTask = (projectId: string, card: BrainstormCard): CreateTask => ({
  project_id: projectId,
  title: card.title,
  description: buildStoryDescription(card),
  status: null,
  task_type: 'story',
  parent_workspace_id: null,
  parent_task_id: null,
  image_ids: null,
});

const StoryBulkCreateDialogImpl =
  NiceModal.create<StoryBulkCreateDialogProps>(({ projectId }) => {
    const modal = useModal();
    const queryClient = useQueryClient();

    const [mode, setMode] = useState<Mode>('list');
    const [listInput, setListInput] = useState('');
    const [jsonInput, setJsonInput] = useState('');
    const [brainstormContext, setBrainstormContext] = useState('');
    const [brainstormOutput, setBrainstormOutput] = useState('');
    const [targetCount, setTargetCount] = useState(5);
    const [copied, setCopied] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const promptPreview = useMemo(() => {
      const context = brainstormContext.trim();
      const count = clampCount(targetCount);
      const tail = [
        context ? `当前上下文：${context}` : null,
        `目标数量：${count}`,
      ]
        .filter(Boolean)
        .join('\n');
      return [BRAINSTORM_PROMPT, tail].filter(Boolean).join('\n\n');
    }, [brainstormContext, targetCount]);

    const canSubmit = useMemo(() => {
      if (mode === 'list') return listInput.trim().length > 0;
      if (mode === 'json') return jsonInput.trim().length > 0;
      return brainstormOutput.trim().length > 0;
    }, [mode, listInput, jsonInput, brainstormOutput]);

    const handleCopyPrompt = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(promptPreview);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch (err) {
        console.warn('Failed to copy prompt:', err);
      }
    }, [promptPreview]);

    const handleGenerateDraft = useCallback(() => {
      const contextLines = brainstormContext
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-*\\d.]+\\s*/, '').trim())
        .filter(Boolean);
      const count = clampCount(targetCount);
      const base = contextLines[0] ?? brainstormContext.trim() ?? 'Story';
      const fallbackTitles = [
        'Scope & goals',
        'User flow',
        'Core implementation',
        'Edge cases',
        'QA & acceptance',
        'Release & rollout',
        'Documentation',
      ];

      const cards = Array.from({ length: count }).map((_, index) => {
        const title =
          contextLines[index] ??
          `${base} - ${fallbackTitles[index % fallbackTitles.length]}`;
        return {
          id: `story-${index + 1}`,
          title,
          description:
            contextLines[index] != null
              ? ''
              : `Drafted from “${base}” context.`,
          priority: 'medium',
          complexity: 3,
        };
      });

      setBrainstormOutput(JSON.stringify(cards, null, 2));
    }, [brainstormContext, targetCount]);

    const parseCardsForMode = useCallback(() => {
      if (mode === 'list') {
        return parseQuickList(listInput);
      }
      if (mode === 'json') {
        return parseJsonCards(jsonInput);
      }
      return parseJsonCards(brainstormOutput);
    }, [mode, listInput, jsonInput, brainstormOutput]);

    const handleSubmit = useCallback(async () => {
      setError(null);
      setIsSubmitting(true);

      try {
        const cards = parseCardsForMode();
        if (cards.length === 0) {
          throw new Error('No valid story cards found.');
        }

        const results = await Promise.allSettled(
          cards.map((card) => tasksApi.create(buildStoryTask(projectId, card)))
        );

        const failures = results.filter((result) => result.status === 'rejected');
        await queryClient.invalidateQueries({
          queryKey: ['stories', projectId],
        });

        if (failures.length > 0) {
          setError(
            `Created ${cards.length - failures.length} stories, ${failures.length} failed.`
          );
          return;
        }

        modal.resolve();
        modal.hide();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create stories.';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    }, [parseCardsForMode, projectId, queryClient, modal]);

    const handleCancel = () => {
      modal.reject();
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    const handleCountChange = (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      if (Number.isNaN(value)) return;
      setTargetCount(clampCount(value));
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[720px]">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isSubmitting && canSubmit) {
                void handleSubmit();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Create Stories</DialogTitle>
              <DialogDescription>
                Add multiple stories at once. Choose a mode below.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'list', label: 'Quick list' },
                { id: 'json', label: 'JSON' },
                { id: 'brainstorm', label: 'Brainstorm' },
              ].map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={mode === option.id ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    mode === option.id ? '' : 'text-muted-foreground'
                  )}
                  onClick={() => setMode(option.id as Mode)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {mode === 'list' && (
              <div className="grid gap-2">
                <Label htmlFor="story-list-input">
                  One story per line (title - description optional)
                </Label>
                <Textarea
                  id="story-list-input"
                  value={listInput}
                  onChange={(event) => setListInput(event.target.value)}
                  placeholder={`Add Story A - Description\nAdd Story B`}
                  rows={8}
                />
              </div>
            )}

            {mode === 'json' && (
              <div className="grid gap-2">
                <Label htmlFor="story-json-input">JSON cards</Label>
                <Textarea
                  id="story-json-input"
                  value={jsonInput}
                  onChange={(event) => setJsonInput(event.target.value)}
                  placeholder={JSON_SAMPLE}
                  rows={10}
                />
              </div>
            )}

            {mode === 'brainstorm' && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="brainstorm-context">
                    Context (project goals, users, constraints)
                  </Label>
                  <Textarea
                    id="brainstorm-context"
                    value={brainstormContext}
                    onChange={(event) => setBrainstormContext(event.target.value)}
                    placeholder="Describe the project context to guide brainstorming."
                    rows={4}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="grid gap-2">
                    <Label htmlFor="brainstorm-count">Target cards</Label>
                    <Input
                      id="brainstorm-count"
                      type="number"
                      min={3}
                      max={7}
                      value={targetCount}
                      onChange={handleCountChange}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={handleGenerateDraft}
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate draft
                  </Button>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="brainstorm-prompt">
                      Built-in brainstorming prompt
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={handleCopyPrompt}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <Textarea
                    id="brainstorm-prompt"
                    value={promptPreview}
                    readOnly
                    rows={8}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="brainstorm-output">
                    Paste JSON output here
                  </Label>
                  <Textarea
                    id="brainstorm-output"
                    value={brainstormOutput}
                    onChange={(event) => setBrainstormOutput(event.target.value)}
                    placeholder={JSON_SAMPLE}
                    rows={10}
                  />
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Unable to create stories</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create stories'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  });

export const StoryBulkCreateDialog = defineModal<
  StoryBulkCreateDialogProps,
  void
>(StoryBulkCreateDialogImpl);
