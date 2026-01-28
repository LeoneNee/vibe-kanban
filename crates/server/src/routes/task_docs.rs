use std::io;

use axum::{Extension, Json, extract::State, http::StatusCode};
use db::models::{
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

pub async fn get_task_doc(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<String, ApiError> {
    let pool = &deployment.db().pool;

    let parent_story = if task.task_type == TaskType::Task {
        let parent_workspace_id = task
            .parent_workspace_id
            .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;
        let parent_workspace = Workspace::find_by_id(pool, parent_workspace_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;
        Some(
            Task::find_by_id(pool, parent_workspace.task_id)
                .await?
                .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?,
        )
    } else {
        None
    };

    let workspace = Workspace::fetch_all(pool, Some(task.id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;

    let repo = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;

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

    // Get parent story if this is a Task
    let parent_story = if task.task_type == TaskType::Task {
        let parent_workspace_id = task
            .parent_workspace_id
            .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;
        let parent_workspace = Workspace::find_by_id(pool, parent_workspace_id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;
        Some(
            Task::find_by_id(pool, parent_workspace.task_id)
                .await?
                .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?,
        )
    } else {
        None
    };

    // Get workspace and repo
    let workspace = Workspace::fetch_all(pool, Some(task.id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;

    let repo = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::BadRequest("Doc not found".to_string()))?;

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
