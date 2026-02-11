use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

use super::{project::Project, workspace::Workspace};
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Type, Serialize, Deserialize, TS, Default, Display,
)]
#[sqlx(type_name = "TEXT", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[ts(export)]
pub enum TaskType {
    Story,
    #[default]
    Task,
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Type, Serialize, Deserialize, TS, Default, Display,
)]
#[sqlx(type_name = "TEXT", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[ts(export)]
pub enum WorkflowState {
    /// Task 刚创建，尚未进行需求澄清
    #[default]
    New,
    /// 已完成 brainstorming-task 需求澄清
    Brainstormed,
    /// 已生成 TDD 实现计划（writing-plans）
    Planned,
    /// 正在执行实现
    Executing,
    /// 已完成实现（但可能未合并）
    Completed,
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Type, Serialize, Deserialize, TS, Display, EnumString,
)]
#[sqlx(type_name = "TEXT", rename_all = "kebab-case")]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
#[ts(export)]
pub enum TaskTag {
    UiDesign,
    Api,
    Bugfix,
    Refactor,
    Infra,
    Docs,
    Test,
}

#[derive(
    Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default,
)]
#[sqlx(type_name = "task_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum TaskStatus {
    #[default]
    Todo,
    InProgress,
    InReview,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid, // Foreign key to Project
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub task_type: TaskType,
    pub parent_workspace_id: Option<Uuid>, // Foreign key to parent Workspace
    pub parent_task_id: Option<Uuid>,
    pub workflow_state: WorkflowState,
    pub tag: Option<TaskTag>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TaskWithAttemptStatus {
    #[serde(flatten)]
    #[ts(flatten)]
    pub task: Task,
    pub has_in_progress_attempt: bool,
    pub last_attempt_failed: bool,
    pub executor: String,
}

impl std::ops::Deref for TaskWithAttemptStatus {
    type Target = Task;
    fn deref(&self) -> &Self::Target {
        &self.task
    }
}

impl std::ops::DerefMut for TaskWithAttemptStatus {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.task
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TaskRelationships {
    pub parent_task: Option<Task>, // The task that owns the parent workspace
    pub current_workspace: Workspace, // The workspace we're viewing
    pub children: Vec<Task>,       // Tasks created from this workspace
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateTask {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub task_type: TaskType,
    pub parent_workspace_id: Option<Uuid>,
    pub parent_task_id: Option<Uuid>,
    pub image_ids: Option<Vec<Uuid>>,
    #[ts(optional)]
    pub workflow_state: Option<WorkflowState>,
    #[ts(optional)]
    pub tag: Option<TaskTag>,
}

impl CreateTask {
    pub fn from_title_description(
        project_id: Uuid,
        title: String,
        description: Option<String>,
    ) -> Self {
        Self {
            project_id,
            title,
            description,
            status: Some(TaskStatus::Todo),
            task_type: TaskType::default(),
            parent_workspace_id: None,
            parent_task_id: None,
            image_ids: None,
            workflow_state: None,
            tag: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UpdateTask {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub parent_workspace_id: Option<Uuid>,
    pub parent_task_id: Option<Uuid>,
    pub image_ids: Option<Vec<Uuid>>,
    #[ts(optional)]
    pub workflow_state: Option<WorkflowState>,
    #[ts(optional)]
    pub tag: Option<TaskTag>,
}

impl Task {
    pub fn to_prompt(&self) -> String {
        if let Some(description) = self.description.as_ref().filter(|d| !d.trim().is_empty()) {
            format!("{}\n\n{}", &self.title, description)
        } else {
            self.title.clone()
        }
    }

    pub async fn parent_project(&self, pool: &SqlitePool) -> Result<Option<Project>, sqlx::Error> {
        Project::find_by_id(pool, self.project_id).await
    }

    pub async fn find_by_project_id_with_attempt_status(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<TaskWithAttemptStatus>, sqlx::Error> {
        let records = sqlx::query!(
            r#"SELECT
  t.id                            AS "id!: Uuid",
  t.project_id                    AS "project_id!: Uuid",
  t.title,
  t.description,
  t.status                        AS "status!: TaskStatus",
  t.task_type                     AS "task_type!: TaskType",
  t.parent_workspace_id           AS "parent_workspace_id: Uuid",
  t.parent_task_id                AS "parent_task_id: Uuid",
  t.workflow_state                AS "workflow_state!: WorkflowState",
  t.tag                           AS "tag: TaskTag",
  t.created_at                    AS "created_at!: DateTime<Utc>",
  t.updated_at                    AS "updated_at!: DateTime<Utc>",

  CASE WHEN EXISTS (
    SELECT 1
      FROM workspaces w
      JOIN sessions s ON s.workspace_id = w.id
      JOIN execution_processes ep ON ep.session_id = s.id
     WHERE w.task_id       = t.id
       AND ep.status        = 'running'
       AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
     LIMIT 1
  ) THEN 1 ELSE 0 END            AS "has_in_progress_attempt!: i64",

  CASE WHEN (
    SELECT ep.status
      FROM workspaces w
      JOIN sessions s ON s.workspace_id = w.id
      JOIN execution_processes ep ON ep.session_id = s.id
     WHERE w.task_id       = t.id
     AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
     ORDER BY ep.created_at DESC
     LIMIT 1
  ) IN ('failed','killed') THEN 1 ELSE 0 END
                                 AS "last_attempt_failed!: i64",

  ( SELECT s.executor
      FROM workspaces w
      JOIN sessions s ON s.workspace_id = w.id
      WHERE w.task_id = t.id
     ORDER BY s.created_at DESC
      LIMIT 1
    )                               AS "executor!: String"

FROM tasks t
WHERE t.project_id = $1
ORDER BY t.created_at DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        let tasks = records
            .into_iter()
            .map(|rec| TaskWithAttemptStatus {
                task: Task {
                    id: rec.id,
                    project_id: rec.project_id,
                    title: rec.title,
                    description: rec.description,
                    status: rec.status,
                    task_type: rec.task_type,
                    parent_workspace_id: rec.parent_workspace_id,
                    parent_task_id: rec.parent_task_id,
                    workflow_state: rec.workflow_state,
                    tag: rec.tag,
                    created_at: rec.created_at,
                    updated_at: rec.updated_at,
                },
                has_in_progress_attempt: rec.has_in_progress_attempt != 0,
                last_attempt_failed: rec.last_attempt_failed != 0,
                executor: rec.executor,
            })
            .collect();

        Ok(tasks)
    }

    pub async fn list_tasks(
        pool: &SqlitePool,
        project_id: Uuid,
        task_type_filter: Option<TaskType>,
        parent_task_id_filter: Option<Option<Uuid>>,
    ) -> Result<Vec<Task>, sqlx::Error> {
        use sqlx::QueryBuilder;

        let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
            "SELECT id, project_id, title, description, status, task_type, parent_workspace_id, parent_task_id, workflow_state, tag, created_at, updated_at FROM tasks WHERE project_id = "
        );
        builder.push_bind(project_id);

        if let Some(task_type) = task_type_filter {
            builder.push(" AND task_type = ");
            builder.push_bind(task_type);
        }

        if let Some(parent_filter) = parent_task_id_filter {
            match parent_filter {
                None => {
                    builder.push(" AND parent_task_id IS NULL");
                }
                Some(parent_id) => {
                    builder.push(" AND parent_task_id = ");
                    builder.push_bind(parent_id);
                }
            }
        }

        builder.push(" ORDER BY created_at DESC");

        builder
            .build_query_as::<Task>()
            .fetch_all(pool)
            .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", task_type as "task_type!: TaskType", parent_workspace_id as "parent_workspace_id: Uuid", parent_task_id as "parent_task_id: Uuid", workflow_state as "workflow_state!: WorkflowState", tag as "tag: TaskTag", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", task_type as "task_type!: TaskType", parent_workspace_id as "parent_workspace_id: Uuid", parent_task_id as "parent_task_id: Uuid", workflow_state as "workflow_state!: WorkflowState", tag as "tag: TaskTag", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks
               WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTask,
        task_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let status = data.status.clone().unwrap_or_default();
        let workflow_state = data.workflow_state.unwrap_or_default();
        sqlx::query_as!(
            Task,
            r#"INSERT INTO tasks (id, project_id, title, description, status, task_type, parent_workspace_id, parent_task_id, workflow_state, tag)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", task_type as "task_type!: TaskType", parent_workspace_id as "parent_workspace_id: Uuid", parent_task_id as "parent_task_id: Uuid", workflow_state as "workflow_state!: WorkflowState", tag as "tag: TaskTag", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            task_id,
            data.project_id,
            data.title,
            data.description,
            status,
            data.task_type,
            data.parent_workspace_id,
            data.parent_task_id,
            workflow_state,
            data.tag
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
        title: String,
        description: Option<String>,
        status: TaskStatus,
        parent_workspace_id: Option<Uuid>,
        parent_task_id: Option<Uuid>,
        workflow_state: Option<WorkflowState>,
        tag: Option<TaskTag>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"UPDATE tasks
               SET title = $3, description = $4, status = $5, parent_workspace_id = $6, parent_task_id = $7, workflow_state = COALESCE($8, workflow_state), tag = COALESCE($9, tag), updated_at = datetime('now', 'subsec')
               WHERE id = $1 AND project_id = $2
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", task_type as "task_type!: TaskType", parent_workspace_id as "parent_workspace_id: Uuid", parent_task_id as "parent_task_id: Uuid", workflow_state as "workflow_state!: WorkflowState", tag as "tag: TaskTag", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            title,
            description,
            status,
            parent_workspace_id,
            parent_task_id,
            workflow_state,
            tag
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: TaskStatus,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE tasks SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            id,
            status
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// 更新任务的工作流状态
    pub async fn update_workflow_state(
        pool: &SqlitePool,
        id: Uuid,
        workflow_state: WorkflowState,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"UPDATE tasks
               SET workflow_state = $2, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", task_type as "task_type!: TaskType", parent_workspace_id as "parent_workspace_id: Uuid", parent_task_id as "parent_task_id: Uuid", workflow_state as "workflow_state!: WorkflowState", tag as "tag: TaskTag", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            workflow_state
        )
        .fetch_one(pool)
        .await
    }

    /// Update the parent_workspace_id field for a task
    pub async fn update_parent_workspace_id(
        pool: &SqlitePool,
        task_id: Uuid,
        parent_workspace_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE tasks SET parent_workspace_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            task_id,
            parent_workspace_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Nullify parent_workspace_id for all tasks that reference the given workspace ID
    /// This breaks parent-child relationships before deleting a parent task
    pub async fn nullify_children_by_workspace_id<'e, E>(
        executor: E,
        workspace_id: Uuid,
    ) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!(
            "UPDATE tasks SET parent_workspace_id = NULL WHERE parent_workspace_id = $1",
            workspace_id
        )
        .execute(executor)
        .await?;
        Ok(result.rows_affected())
    }

    /// Find all child tasks that reference the given task ID as their parent
    pub async fn find_children_by_parent_task_id(
        pool: &SqlitePool,
        parent_task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Task>(
            r#"SELECT id, project_id, title, description, status, task_type, parent_workspace_id, parent_task_id, workflow_state, tag, created_at, updated_at
               FROM tasks
               WHERE parent_task_id = $1
               ORDER BY created_at DESC"#,
        )
        .bind(parent_task_id)
        .fetch_all(pool)
        .await
    }

    /// Delete all child tasks that reference the given task ID as their parent
    pub async fn delete_children_by_parent_task_id<'e, E>(
        executor: E,
        parent_task_id: Uuid,
    ) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query("DELETE FROM tasks WHERE parent_task_id = $1")
            .bind(parent_task_id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM tasks WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn find_children_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        // Find only child tasks that have this workspace as their parent
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", task_type as "task_type!: TaskType", parent_workspace_id as "parent_workspace_id: Uuid", parent_task_id as "parent_task_id: Uuid", workflow_state as "workflow_state!: WorkflowState", tag as "tag: TaskTag", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks
               WHERE parent_workspace_id = $1
               ORDER BY created_at DESC"#,
            workspace_id,
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_relationships_for_workspace(
        pool: &SqlitePool,
        workspace: &Workspace,
    ) -> Result<TaskRelationships, sqlx::Error> {
        // 1. Get the current task (task that owns this workspace)
        let current_task = Self::find_by_id(pool, workspace.task_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // 2. Get parent task (if current task was created by another workspace)
        let parent_task = if let Some(parent_workspace_id) = current_task.parent_workspace_id {
            // Find the workspace that created the current task
            if let Ok(Some(parent_workspace)) =
                Workspace::find_by_id(pool, parent_workspace_id).await
            {
                // Find the task that owns that parent workspace - THAT's the real parent
                Self::find_by_id(pool, parent_workspace.task_id).await?
            } else {
                None
            }
        } else {
            None
        };

        // 3. Get children tasks (created from this workspace)
        let children = Self::find_children_by_workspace_id(pool, workspace.id).await?;

        Ok(TaskRelationships {
            parent_task,
            current_workspace: workspace.clone(),
            children,
        })
    }

    /// Find the parent story for a Task-type task.
    /// Returns None for Story-type tasks.
    /// Supports two association methods:
    /// 1. Direct: via parent_task_id
    /// 2. Indirect: via parent_workspace_id -> workspace -> task_id
    pub async fn find_parent_story(&self, pool: &SqlitePool) -> Result<Option<Task>, sqlx::Error> {
        // Story tasks have no parent story
        if self.task_type == TaskType::Story {
            return Ok(None);
        }

        // Method 1: Direct association via parent_task_id
        if let Some(parent_task_id) = self.parent_task_id {
            return Self::find_by_id(pool, parent_task_id).await;
        }

        // Method 2: Indirect via parent_workspace_id
        if let Some(parent_workspace_id) = self.parent_workspace_id {
            if let Some(parent_workspace) = Workspace::find_by_id(pool, parent_workspace_id).await? {
                return Self::find_by_id(pool, parent_workspace.task_id).await;
            }
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_state_enum_serialization() {
        // 测试 WorkflowState 枚举序列化
        let state = WorkflowState::New;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"new\"");

        let state = WorkflowState::Brainstormed;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"brainstormed\"");
    }

    #[test]
    fn test_workflow_state_default() {
        // 测试默认值是 New
        let state = WorkflowState::default();
        assert_eq!(state, WorkflowState::New);
    }

    #[test]
    fn test_task_tag_serialization() {
        let tag = TaskTag::UiDesign;
        let json = serde_json::to_string(&tag).unwrap();
        assert_eq!(json, "\"ui-design\"");

        let tag = TaskTag::Api;
        let json = serde_json::to_string(&tag).unwrap();
        assert_eq!(json, "\"api\"");

        let tag = TaskTag::Bugfix;
        let json = serde_json::to_string(&tag).unwrap();
        assert_eq!(json, "\"bugfix\"");
    }

    #[test]
    fn test_task_tag_deserialization() {
        let tag: TaskTag = serde_json::from_str("\"ui-design\"").unwrap();
        assert_eq!(tag, TaskTag::UiDesign);

        let tag: TaskTag = serde_json::from_str("\"refactor\"").unwrap();
        assert_eq!(tag, TaskTag::Refactor);
    }

    #[test]
    fn test_task_tag_option_serialization() {
        let tag: Option<TaskTag> = None;
        let json = serde_json::to_string(&tag).unwrap();
        assert_eq!(json, "null");

        let tag: Option<TaskTag> = Some(TaskTag::Test);
        let json = serde_json::to_string(&tag).unwrap();
        assert_eq!(json, "\"test\"");
    }
}
