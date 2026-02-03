import { useState, useMemo } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { useEntries } from '@/contexts/EntriesContext';
import { useTask } from '@/hooks/useTask';
import { Button } from '@/components/ui/button';
import { tasksApi } from '@/lib/api';
import type { WorkspaceWithSession } from '@/types/attempt';

interface SaveBrainstormResultButtonProps {
  workspaceWithSession: WorkspaceWithSession | undefined;
}

function extractMarkdownContent(entries: any[]): string | null {
  // Look for the last assistant message containing ## 需求细节
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry?.type === 'NORMALIZED_ENTRY' &&
      entry?.data?.type === 'assistant_message'
    ) {
      const content = entry.data.content;
      if (typeof content !== 'string') continue;

      // Find markdown code block
      const markdownMatch = content.match(/\`\`\`markdown\s*([\s\S]*?)\`\`\`/);
      if (markdownMatch) {
        return markdownMatch[1].trim();
      }
      // Or look for the section directly
      if (content.includes('## 需求细节')) {
        const startIdx = content.indexOf('## 需求细节');
        return content.slice(startIdx).trim();
      }
    }
  }
  return null;
}

export function SaveBrainstormResultButton({
  workspaceWithSession,
}: SaveBrainstormResultButtonProps) {
  const { entries } = useEntries();
  const { data: task } = useTask(workspaceWithSession?.task_id);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show for task brainstorm workspaces
  const isBrainstormTask =
    task?.title?.startsWith('🧠 Brainstorm:') && task?.task_type === 'task';

  const markdownContent = useMemo(
    () => (isBrainstormTask ? extractMarkdownContent(entries) : null),
    [entries, isBrainstormTask]
  );

  const canSave = isBrainstormTask && markdownContent && task?.parent_task_id;

  if (!canSave) {
    return null;
  }

  const handleSave = async () => {
    if (!markdownContent || !task?.parent_task_id) return;

    setIsSaving(true);
    setError(null);
    try {
      await tasksApi.updateDoc(
        task.parent_task_id,
        'implementation_hints',
        markdownContent
      );
      setSaved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败，请重试';
      setError(message);
      console.error('Failed to save brainstorm result:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Button
      onClick={handleSave}
      disabled={isSaving || saved}
      variant={error ? 'destructive' : 'default'}
      className="fixed bottom-6 right-6 z-50 shadow-lg"
      size="lg"
    >
      {saved ? (
        <>
          <Check className="mr-2 h-5 w-5" />
          已保存
        </>
      ) : error ? (
        <>
          <AlertCircle className="mr-2 h-5 w-5" />
          重试保存
        </>
      ) : isSaving ? (
        <>
          <span className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" />
          保存中...
        </>
      ) : (
        <>
          <Save className="mr-2 h-5 w-5" />
          保存到任务文档
        </>
      )}
    </Button>
  );
}
