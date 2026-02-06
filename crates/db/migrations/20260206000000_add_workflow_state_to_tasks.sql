-- Add workflow_state column to tasks table
ALTER TABLE tasks ADD COLUMN workflow_state TEXT NOT NULL DEFAULT 'new'
    CHECK (workflow_state IN ('new', 'brainstormed', 'planned', 'executing', 'completed'));

-- Update existing tasks to 'new' state
UPDATE tasks SET workflow_state = 'new' WHERE workflow_state IS NULL;

-- Create index for workflow state queries
CREATE INDEX idx_tasks_workflow_state ON tasks(workflow_state);
