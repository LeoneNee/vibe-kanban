use std::path::PathBuf;

use anyhow;
use axum::{
    Extension, Json, Router,
    extract::{
        Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::{delete, get, post, put},
};
use db::models::{
    image::TaskImage,
    project_repo::ProjectRepo,
    repo::{Repo, RepoError},
    task::{CreateTask, Task, TaskType, TaskWithAttemptStatus, UpdateTask},
    workspace::{CreateWorkspace, Workspace},
    workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
};
use deployment::Deployment;
use executors::profile::ExecutorProfileId;
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use services::services::{container::ContainerService, workspace_manager::WorkspaceManager};
use services::task_doc::generate_task_doc;
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl, error::ApiError, middleware::load_task_middleware,
    routes::{task_attempts::WorkspaceRepoInput, task_docs},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskQuery {
    pub project_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListTasksQuery {
    pub project_id: Uuid,
    pub task_type: Option<TaskType>,
    pub parent_task_id: Option<Uuid>,
}

pub async fn get_tasks(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListTasksQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Task>>>, ApiError> {
    // Convert parent_task_id to the filter format expected by list_tasks
    // None = no filter, Some(None) = filter for NULL, Some(Some(id)) = filter for specific id
    let parent_filter = query.parent_task_id.map(Some);

    let tasks = Task::list_tasks(
        &deployment.db().pool,
        query.project_id,
        query.task_type,
        parent_filter,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn stream_tasks_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_tasks_ws(socket, deployment, query.project_id).await {
            tracing::warn!("tasks WS closed: {}", e);
        }
    })
}

async fn handle_tasks_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    project_id: Uuid,
) -> anyhow::Result<()> {
    // Get the raw stream and convert LogMsg to WebSocket messages
    let mut stream = deployment
        .events()
        .stream_tasks_raw(project_id)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break; // client disconnected
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

pub async fn get_task(
    Extension(task): Extension<Task>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(task)))
}

/// Helper to generate task documentation after task creation.
/// Handles both direct repo path and lookup-based repo resolution.
async fn try_generate_task_doc(
    pool: &sqlx::SqlitePool,
    task: &Task,
    repo_path_hint: Option<PathBuf>,
) {
    // For Story tasks, generate with no parent
    if task.task_type == TaskType::Story {
        if let Some(repo_path) = repo_path_hint {
            if let Err(e) = generate_task_doc(task, None, &repo_path).await {
                tracing::warn!("Failed to generate task doc for story {}: {}", task.id, e);
            }
        }
        return;
    }

    // For Task tasks, need parent story
    let repo_path = match repo_path_hint {
        Some(path) => Some(path),
        None => resolve_repo_path_for_task(pool, task).await,
    };

    if let Some(repo_path) = repo_path {
        if let Ok(Some(parent_story)) = task.find_parent_story(pool).await {
            if let Err(e) = generate_task_doc(task, Some(&parent_story), &repo_path).await {
                tracing::warn!("Failed to generate task doc for task {}: {}", task.id, e);
            }
        }
    }
}

/// Resolve repo path from task's parent workspace
async fn resolve_repo_path_for_task(pool: &sqlx::SqlitePool, task: &Task) -> Option<PathBuf> {
    // Try parent_workspace_id first
    if let Some(parent_workspace_id) = task.parent_workspace_id {
        let repos = WorkspaceRepo::find_repos_for_workspace(pool, parent_workspace_id).await;
        if let Some(path) = repos.ok().and_then(|r| r.first().map(|r| r.path.clone())) {
            return Some(path);
        }
    }

    // Try parent_task_id -> workspace -> repo
    if let Some(parent_task_id) = task.parent_task_id {
        if let Ok(workspaces) = Workspace::fetch_all(pool, Some(parent_task_id)).await {
            if let Some(ws) = workspaces.into_iter().next() {
                let repos = WorkspaceRepo::find_repos_for_workspace(pool, ws.id).await;
                if let Some(path) = repos.ok().and_then(|r| r.first().map(|r| r.path.clone())) {
                    return Some(path);
                }
            }
        }
    }

    None
}

/// Resolve the first repo path for a given project.
/// Returns None if project has no associated repos.
pub(crate) async fn resolve_repo_path_for_project(
    pool: &sqlx::SqlitePool,
    project_id: Uuid,
) -> Option<PathBuf> {
    match ProjectRepo::find_repos_for_project(pool, project_id).await {
        Ok(repos) => repos.into_iter().next().map(|r| r.path),
        Err(e) => {
            tracing::debug!("Failed to find repos for project {}: {}", project_id, e);
            None
        }
    }
}

pub async fn create_task(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    // Validate task_type and parent_* relationship
    let has_parent_workspace = payload.parent_workspace_id.is_some();
    let has_parent_task = payload.parent_task_id.is_some();
    match payload.task_type {
        TaskType::Story => {
            if has_parent_workspace || has_parent_task {
                return Err(ApiError::BadRequest(
                    "Story cannot have parent_workspace_id or parent_task_id".to_string(),
                ));
            }
        }
        TaskType::Task => {
            if has_parent_workspace == has_parent_task {
                return Err(ApiError::BadRequest(
                    "Task must have exactly one of parent_workspace_id or parent_task_id"
                        .to_string(),
                ));
            }
        }
    }

    let id = Uuid::new_v4();

    tracing::debug!(
        "Creating task '{}' in project {}",
        payload.title,
        payload.project_id
    );

    let task = Task::create(&deployment.db().pool, &payload, id).await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
            "task_id": task.id.to_string(),
            "project_id": payload.project_id,
            "has_description": task.description.is_some(),
            "has_images": payload.image_ids.is_some(),
            }),
        )
        .await;

    // Generate task doc based on task type
    match task.task_type {
        TaskType::Story => {
            // For Story: query project's first repo and generate doc
            if let Some(repo_path) = resolve_repo_path_for_project(&deployment.db().pool, task.project_id).await {
                try_generate_task_doc(&deployment.db().pool, &task, Some(repo_path)).await;
            } else {
                tracing::warn!("Story {} has no associated repos, skipping doc generation", task.id);
            }
        }
        TaskType::Task => {
            // For Task: try to resolve repo from parent
            try_generate_task_doc(&deployment.db().pool, &task, None).await;
        }
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateAndStartTaskRequest {
    pub task: CreateTask,
    pub executor_profile_id: ExecutorProfileId,
    pub repos: Vec<WorkspaceRepoInput>,
}

pub async fn create_task_and_start(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateAndStartTaskRequest>,
) -> Result<ResponseJson<ApiResponse<TaskWithAttemptStatus>>, ApiError> {
    if payload.repos.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one repository is required".to_string(),
        ));
    }

    // Validate task_type and parent_* relationship
    let has_parent_workspace = payload.task.parent_workspace_id.is_some();
    let has_parent_task = payload.task.parent_task_id.is_some();
    match payload.task.task_type {
        TaskType::Story => {
            if has_parent_workspace || has_parent_task {
                return Err(ApiError::BadRequest(
                    "Story cannot have parent_workspace_id or parent_task_id".to_string(),
                ));
            }
        }
        TaskType::Task => {
            if has_parent_workspace == has_parent_task {
                return Err(ApiError::BadRequest(
                    "Task must have exactly one of parent_workspace_id or parent_task_id"
                        .to_string(),
                ));
            }
        }
    }

    let pool = &deployment.db().pool;

    let task_id = Uuid::new_v4();
    let task = Task::create(pool, &payload.task, task_id).await?;

    if let Some(image_ids) = &payload.task.image_ids {
        TaskImage::associate_many_dedup(pool, task.id, image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": task.project_id,
                "has_description": task.description.is_some(),
                "has_images": payload.task.image_ids.is_some(),
            }),
        )
        .await;

    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_workspace(&attempt_id, &task.title)
        .await;

    // Compute agent_working_dir based on repo count:
    // - Single repo: use repo name as working dir (agent runs in repo directory)
    // - Multiple repos: use None (agent runs in workspace root)
    let agent_working_dir = if payload.repos.len() == 1 {
        let repo = Repo::find_by_id(pool, payload.repos[0].repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;
        Some(repo.name)
    } else {
        None
    };

    let workspace = Workspace::create(
        pool,
        &CreateWorkspace {
            branch: git_branch_name,
            agent_working_dir,
        },
        attempt_id,
        task.id,
    )
    .await?;

    let workspace_repos: Vec<CreateWorkspaceRepo> = payload
        .repos
        .iter()
        .map(|r| CreateWorkspaceRepo {
            repo_id: r.repo_id,
            target_branch: r.target_branch.clone(),
        })
        .collect();
    WorkspaceRepo::create_many(&deployment.db().pool, workspace.id, &workspace_repos).await?;

    // Generate task doc after workspace repos are created
    if let Some(first_repo_input) = payload.repos.first() {
        if let Ok(Some(first_repo)) = Repo::find_by_id(pool, first_repo_input.repo_id).await {
            try_generate_task_doc(pool, &task, Some(first_repo.path.clone())).await;
        }
    }

    let is_attempt_running = deployment
        .container()
        .start_workspace(&workspace, payload.executor_profile_id.clone())
        .await
        .inspect_err(|err| tracing::error!("Failed to start task attempt: {}", err))
        .is_ok();
    deployment
        .track_if_analytics_allowed(
            "task_attempt_started",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "executor": &payload.executor_profile_id.executor,
                "variant": &payload.executor_profile_id.variant,
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    let task = Task::find_by_id(pool, task.id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    tracing::info!("Started attempt for task {}", task.id);
    Ok(ResponseJson(ApiResponse::success(TaskWithAttemptStatus {
        task,
        has_in_progress_attempt: is_attempt_running,
        last_attempt_failed: false,
        executor: payload.executor_profile_id.executor.to_string(),
    })))
}

pub async fn update_task(
    Extension(existing_task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,

    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = match payload.description {
        Some(s) if s.trim().is_empty() => None, // Empty string = clear description
        Some(s) => Some(s),                     // Non-empty string = update description
        None => existing_task.description,      // Field omitted = keep existing
    };
    let status = payload.status.unwrap_or(existing_task.status);
    let parent_workspace_id = payload
        .parent_workspace_id
        .or(existing_task.parent_workspace_id);
    let parent_task_id = payload.parent_task_id.or(existing_task.parent_task_id);
    let workflow_state = payload.workflow_state;

    let task = Task::update(
        &deployment.db().pool,
        existing_task.id,
        existing_task.project_id,
        title,
        description,
        status,
        parent_workspace_id,
        parent_task_id,
        workflow_state,
    )
    .await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::delete_by_task_id(&deployment.db().pool, task.id).await?;
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn delete_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    let pool = &deployment.db().pool;

    // If this is a Story, first handle all child tasks
    let mut child_workspace_dirs: Vec<PathBuf> = Vec::new();
    let mut child_repositories: Vec<Repo> = Vec::new();
    let child_tasks = if task.task_type == TaskType::Story {
        let children = Task::find_children_by_parent_task_id(pool, task.id).await?;
        for child in &children {
            // Stop any running processes for child tasks
            let child_workspaces = Workspace::fetch_all(pool, Some(child.id)).await?;
            for workspace in &child_workspaces {
                deployment.container().try_stop(workspace, true).await;
                if let Some(ref container_ref) = workspace.container_ref {
                    child_workspace_dirs.push(PathBuf::from(container_ref));
                }
            }
            // Collect repositories for cleanup
            let child_repos = WorkspaceRepo::find_unique_repos_for_task(pool, child.id).await?;
            child_repositories.extend(child_repos);
        }
        children
    } else {
        Vec::new()
    };

    // Gather task attempts data needed for background cleanup
    let attempts = Workspace::fetch_all(pool, Some(task.id))
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch task attempts for task {}: {}", task.id, e);
            ApiError::Workspace(e)
        })?;

    // Stop any running execution processes before deletion
    for workspace in &attempts {
        deployment.container().try_stop(workspace, true).await;
    }

    let repositories = WorkspaceRepo::find_unique_repos_for_task(pool, task.id).await?;

    // Collect workspace directories that need cleanup
    let mut workspace_dirs: Vec<PathBuf> = attempts
        .iter()
        .filter_map(|attempt| attempt.container_ref.as_ref().map(PathBuf::from))
        .collect();
    // Add child workspace directories
    workspace_dirs.extend(child_workspace_dirs);
    // Merge child repositories
    let mut all_repositories = repositories;
    all_repositories.extend(child_repositories);

    // Use a transaction to ensure atomicity: either all operations succeed or all are rolled back
    let mut tx = pool.begin().await?;

    // Nullify parent_workspace_id for all child tasks before deletion
    // This breaks parent-child relationships to avoid foreign key constraint violations
    let mut total_children_affected = 0u64;
    for attempt in &attempts {
        let children_affected =
            Task::nullify_children_by_workspace_id(&mut *tx, attempt.id).await?;
        total_children_affected += children_affected;
    }

    // If this is a Story, delete all child tasks first
    let child_tasks_deleted = if !child_tasks.is_empty() {
        Task::delete_children_by_parent_task_id(&mut *tx, task.id).await?
    } else {
        0
    };

    // Delete task from database (FK CASCADE will handle task_attempts)
    let rows_affected = Task::delete(&mut *tx, task.id).await?;

    if rows_affected == 0 {
        return Err(ApiError::Database(SqlxError::RowNotFound));
    }

    // Commit the transaction - if this fails, all changes are rolled back
    tx.commit().await?;

    if total_children_affected > 0 {
        tracing::info!(
            "Nullified {} child task references before deleting task {}",
            total_children_affected,
            task.id
        );
    }

    if child_tasks_deleted > 0 {
        tracing::info!(
            "Cascade deleted {} child tasks before deleting story {}",
            child_tasks_deleted,
            task.id
        );
    }

    deployment
        .track_if_analytics_allowed(
            "task_deleted",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": task.project_id.to_string(),
                "task_type": task.task_type.to_string(),
                "attempt_count": attempts.len(),
                "child_tasks_deleted": child_tasks_deleted,
            }),
        )
        .await;

    let task_id = task.id;
    let pool = pool.clone();
    tokio::spawn(async move {
        tracing::info!(
            "Starting background cleanup for task {} ({} workspaces, {} repos)",
            task_id,
            workspace_dirs.len(),
            all_repositories.len()
        );

        for workspace_dir in &workspace_dirs {
            if let Err(e) = WorkspaceManager::cleanup_workspace(workspace_dir, &all_repositories).await
            {
                tracing::error!(
                    "Background workspace cleanup failed for task {} at {}: {}",
                    task_id,
                    workspace_dir.display(),
                    e
                );
            }
        }

        match Repo::delete_orphaned(&pool).await {
            Ok(count) if count > 0 => {
                tracing::info!("Deleted {} orphaned repo records", count);
            }
            Err(e) => {
                tracing::error!("Failed to delete orphaned repos: {}", e);
            }
            _ => {}
        }

        tracing::info!("Background cleanup completed for task {}", task_id);
    });

    // Return 202 Accepted to indicate deletion was scheduled
    Ok((StatusCode::ACCEPTED, ResponseJson(ApiResponse::success(()))))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_actions_router = Router::new()
        .route("/", put(update_task))
        .route("/", delete(delete_task));

    let task_id_router = Router::new()
        .route("/", get(get_task))
        .route(
            "/doc",
            get(task_docs::get_task_doc)
                .put(task_docs::write_task_doc)
                .patch(task_docs::update_task_doc),
        )
        .merge(task_actions_router)
        .layer(from_fn_with_state(deployment.clone(), load_task_middleware));

    let inner = Router::new()
        .route("/", get(get_tasks).post(create_task))
        .route("/stream/ws", get(stream_tasks_ws))
        .route("/create-and-start", post(create_task_and_start))
        .nest("/{task_id}", task_id_router);

    // mount under /projects/:project_id/tasks
    Router::new().nest("/tasks", inner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    #[sqlx::test(migrations = "../db/migrations")]
    async fn test_resolve_repo_path_for_project_returns_first_repo(pool: SqlitePool) {
        // Create test project
        let project_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))"
        )
        .bind(project_id)
        .bind("Test Project")
        .execute(&pool)
        .await
        .unwrap();

        // Create test repo
        let repo_id = Uuid::new_v4();
        let repo_path = "/tmp/test-repo";
        sqlx::query(
            "INSERT INTO repos (id, name, display_name, path, default_target_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
        )
        .bind(repo_id)
        .bind("test-repo")
        .bind("Test Repo")
        .bind(repo_path)
        .bind("main")
        .execute(&pool)
        .await
        .unwrap();

        // Link repo to project
        let project_repo_id = Uuid::new_v4();
        sqlx::query("INSERT INTO project_repos (id, project_id, repo_id) VALUES (?, ?, ?)")
            .bind(project_repo_id)
            .bind(project_id)
            .bind(repo_id)
            .execute(&pool)
            .await
            .unwrap();

        // Test the function
        let result = resolve_repo_path_for_project(&pool, project_id).await;
        assert!(result.is_some(), "Expected Some, got None");
        assert_eq!(result.unwrap().to_str().unwrap(), repo_path);
    }

    #[sqlx::test(migrations = "../db/migrations")]
    async fn test_resolve_repo_path_for_project_returns_none_when_no_repos(pool: SqlitePool) {
        let project_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))"
        )
        .bind(project_id)
        .bind("Test Project No Repos")
        .execute(&pool)
        .await
        .unwrap();

        let result = resolve_repo_path_for_project(&pool, project_id).await;
        assert!(result.is_none());
    }
}
