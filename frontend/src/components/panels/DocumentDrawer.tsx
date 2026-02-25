import { useState } from 'react';
import { Drawer } from '@/components/ui/drawer';
import { useTaskDoc } from '@/hooks/useTaskDoc';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { NewCardHeader, NewCardContent } from '@/components/ui/new-card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, RefreshCw } from 'lucide-react';
import { tasksApi } from '@/lib/api';

interface DocumentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | undefined;
  taskTitle: string | undefined;
  onStartBrainstorm?: () => void;
}

export function DocumentDrawer({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  onStartBrainstorm,
}: DocumentDrawerProps) {
  const { data: docContent, isLoading, isError, refetch } = useTaskDoc(
    open ? taskId : undefined
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = () => {
    setEditContent(docContent ?? '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleSave = async () => {
    if (!taskId) return;
    setIsSaving(true);
    try {
      await tasksApi.writeDoc(taskId, editContent);
      setIsEditing(false);
      setEditContent('');
      refetch();
    } catch (error) {
      console.error('Failed to save document:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-muted-foreground">Failed to load document</p>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      );
    }

    if (!isEditing && (!docContent || docContent.trim() === '')) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">No document yet</p>
          {onStartBrainstorm && (
            <Button onClick={onStartBrainstorm} variant="default" size="sm">
              Start Brainstorm
            </Button>
          )}
        </div>
      );
    }

    return (
      <WYSIWYGEditor
        value={isEditing ? editContent : (docContent ?? '')}
        onChange={isEditing ? setEditContent : undefined}
        disabled={!isEditing}
      />
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} aria-labelledby="doc-drawer-title">
      <NewCardHeader className="pr-8">
        <div className="flex items-center justify-between w-full">
          <h2 id="doc-drawer-title" className="text-base font-medium truncate">
            {taskTitle || 'Document'}
          </h2>
          {!isLoading && !isError && (
            <div className="flex items-center gap-2 shrink-0">
              {isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Saving
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleEdit}>
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      </NewCardHeader>
      <NewCardContent className="flex-1 overflow-y-auto p-4">
        {renderContent()}
      </NewCardContent>
    </Drawer>
  );
}
