use std::io;

use axum::{Extension, Json, extract::State, http::StatusCode};
use db::models::{
    repo::Repo,
    task::{Task, TaskType},
    workspace::Workspace,
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::task_doc::{
    append_to_changelog, get_task_doc_path, section_header_from_doc_section, update_doc_section,
};
use tokio::fs;
use ts_rs::TS;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum DocSection {
    ApiSpec,
    TestCases,
    Dependencies,
    Changelog,
    ImplementationHints,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateTaskDocInput {
    pub section: DocSection,
    pub content: String,
}

/// 获取 Task 的 parent story，支持两种关联方式
async fn get_parent_story_for_task(
    pool: &sqlx::SqlitePool,
    task: &Task,
) -> Result<Option<Task>, ApiError> {
    if task.task_type != TaskType::Task {
        return Ok(None);
    }

    // 方式1: 通过 parent_task_id 直接关联
    if let Some(parent_task_id) = task.parent_task_id {
        let parent = Task::find_by_id(pool, parent_task_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Parent task not found".to_string()))?;
        return Ok(Some(parent));
    }

    // 方式2: 通过 parent_workspace_id 间接关联
    if let Some(parent_workspace_id) = task.parent_workspace_id {
        let parent_workspace = Workspace::find_by_id(pool, parent_workspace_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Parent workspace not found".to_string()))?;
        let parent = Task::find_by_id(pool, parent_workspace.task_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Parent task not found".to_string()))?;
        return Ok(Some(parent));
    }

    Err(ApiError::BadRequest(
        "Task must have either parent_task_id or parent_workspace_id".to_string(),
    ))
}

/// 获取任务关联的 workspace 和 repo
async fn get_workspace_and_repo_for_task(
    pool: &sqlx::SqlitePool,
    task: &Task,
    parent_story: Option<&Task>,
) -> Result<(Workspace, Repo), ApiError> {
    // 获取 workspace - 需要处理两种情况
    let workspace = if let Some(parent) = parent_story {
        // 如果是 Task，需要从 parent story 获取 workspace
        Workspace::fetch_all(pool, Some(parent.id))
            .await?
            .into_iter()
            .next()
    } else {
        // 如果是 Story，直接获取自己的 workspace
        Workspace::fetch_all(pool, Some(task.id))
            .await?
            .into_iter()
            .next()
    }
    .ok_or_else(|| ApiError::BadRequest("No workspace found".to_string()))?;

    let repo = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::BadRequest("No repo found".to_string()))?;

    Ok((workspace, repo))
}

pub async fn get_task_doc(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<String, ApiError> {
    let pool = &deployment.db().pool;

    // 使用新的辅助函数获取 parent story
    let parent_story = get_parent_story_for_task(pool, &task).await?;

    // 获取 workspace 和 repo
    let (_workspace, repo) = get_workspace_and_repo_for_task(pool, &task, parent_story.as_ref()).await?;

    let doc_path = get_task_doc_path(&task, parent_story.as_ref(), &repo.path);
    match fs::read_to_string(doc_path).await {
        Ok(contents) => Ok(contents),
        Err(err) if err.kind() == io::ErrorKind::NotFound => {
            Err(ApiError::BadRequest("Doc not found".to_string()))
        }
        Err(err) => Err(ApiError::Io(err)),
    }
}

pub async fn update_task_doc(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(input): Json<UpdateTaskDocInput>,
) -> Result<StatusCode, ApiError> {
    let pool = &deployment.db().pool;

    // 使用新的辅助函数获取 parent story
    let parent_story = get_parent_story_for_task(pool, &task).await?;

    // 获取 workspace 和 repo
    let (_workspace, repo) = get_workspace_and_repo_for_task(pool, &task, parent_story.as_ref()).await?;

    let doc_path = get_task_doc_path(&task, parent_story.as_ref(), &repo.path);

    // Read existing doc
    let content = fs::read_to_string(&doc_path)
        .await
        .map_err(|e| ApiError::BadRequest(format!("Doc not found: {}", e)))?;

    // Update section based on type
    let section_name = match input.section {
        DocSection::ApiSpec => "api_spec",
        DocSection::TestCases => "test_cases",
        DocSection::Dependencies => "dependencies",
        DocSection::Changelog => "changelog",
        DocSection::ImplementationHints => "implementation_hints",
    };

    let updated_content = if matches!(input.section, DocSection::Changelog) {
        append_to_changelog(&content, &input.content)
    } else {
        update_doc_section(
            &content,
            section_header_from_doc_section(section_name),
            &input.content,
        )
    }
    .map_err(|e| ApiError::BadRequest(format!("Failed to update: {}", e)))?;

    // Write back
    fs::write(&doc_path, updated_content)
        .await
        .map_err(ApiError::Io)?;

    Ok(StatusCode::OK)
}
