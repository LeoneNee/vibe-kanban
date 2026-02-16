import { Drawer } from '@/components/ui/drawer';
import { useTaskDoc } from '@/hooks/useTaskDoc';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { NewCardHeader, NewCardContent } from '@/components/ui/new-card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, RefreshCw } from 'lucide-react';

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

    if (!docContent || docContent.trim() === '') {
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

    return <WYSIWYGEditor value={docContent} disabled />;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <NewCardHeader className="pr-8">
        <div className="font-semibold">{taskTitle || 'Document'}</div>
      </NewCardHeader>
      <NewCardContent className="flex-1 overflow-y-auto p-4">
        {renderContent()}
      </NewCardContent>
    </Drawer>
  );
}
