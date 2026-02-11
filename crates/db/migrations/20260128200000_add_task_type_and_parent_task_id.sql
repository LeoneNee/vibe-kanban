-- Add parent_task_id column to tasks table
ALTER TABLE tasks ADD COLUMN parent_task_id BLOB REFERENCES tasks(id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
