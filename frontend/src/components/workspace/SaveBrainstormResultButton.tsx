import { useState, useMemo } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { useEntries } from '@/contexts/EntriesContext';
import { useTask } from '@/hooks/useTask';
import { Button } from '@/components/ui/button';
import { tasksApi } from '@/lib/api';
import type { WorkspaceWithSession } from '@/types/attempt';
import type { UnifiedLogEntry } from '@/types/logs';

interface SaveBrainstormResultButtonProps {
  workspaceWithSession: WorkspaceWithSession | undefined;
}

function extractMarkdownContent(entries: UnifiedLogEntry[]): string | null {
  // 从后往前查找最后一条助手消息
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry?.type === 'NORMALIZED_ENTRY' &&
      entry?.data?.type === 'assistant_message'
    ) {
      const content = entry.data.content;
      if (typeof content !== 'string') continue;

      // 1. 查找 markdown 代码块
      const markdownMatch = content.match(/```markdown\s*([\s\S]*?)```/);
      if (markdownMatch) {
        return markdownMatch[1].trim();
      }

      // 2. 查找多种可能的章节标题（按优先级）
      const sectionHeaders = [
        '## 需求细节',
        '## 实现要点',
        '## Implementation Details',
        '## Requirements',
        '## 功能描述',
        '## 技术方案',
      ];

      for (const header of sectionHeaders) {
        if (content.includes(header)) {
          const startIdx = content.indexOf(header);
          return content.slice(startIdx).trim();
        }
      }

      // 3. 如果消息足够长且包含列表，可能是有效内容
      if (content.length > 200 && (content.includes('- ') || content.includes('* '))) {
        // 提取从第一个 ## 开始的内容
        const h2Match = content.match(/(## .+[\s\S]*)/);
        if (h2Match) {
          return h2Match[1].trim();
        }
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

  // 显示等待提示：是脑暴任务但尚未提取到内容
  const showNoContentHint = isBrainstormTask && !markdownContent && task?.parent_task_id;

  if (showNoContentHint) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-muted text-muted-foreground px-4 py-2 rounded-lg text-sm">
        等待 AI 生成包含 "## 需求细节" 的内容...
      </div>
    );
  }

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
