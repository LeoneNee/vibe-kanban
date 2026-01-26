-- Add task_type column to distinguish Stories from Tasks
ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'task'
    CHECK (task_type IN ('story', 'task'));

-- Add index for efficient filtering by task_type
CREATE INDEX idx_tasks_task_type ON tasks(task_type);

-- Add composite index for common query pattern (project + task_type)
CREATE INDEX idx_tasks_project_task_type ON tasks(project_id, task_type);
