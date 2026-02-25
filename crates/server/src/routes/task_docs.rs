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
use services::task_doc::{append_to_changelog, get_task_doc_path, update_doc_section};
use tokio::fs;
use ts_rs::TS;

use crate::{DeploymentImpl, error::ApiError, routes::tasks::resolve_repo_path_for_project};

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

impl DocSection {
    /// 直接返回对应的 Markdown 章节标题，无需经过中间字符串映射。
    pub fn section_header(&self) -> &'static str {
        match self {
            DocSection::ApiSpec => "## API 规格",
            DocSection::TestCases => "## 测试用例",
            DocSection::Dependencies => "## 依赖和风险",
            DocSection::Changelog => "## 更新日志",
            DocSection::ImplementationHints => "## 实现要点",
        }
    }
}

#[cfg(test)]
mod doc_section_tests {
    use super::DocSection;

    #[test]
    fn section_header_returns_correct_chinese_headers() {
        assert_eq!(DocSection::ApiSpec.section_header(), "## API 规格");
        assert_eq!(DocSection::TestCases.section_header(), "## 测试用例");
        assert_eq!(DocSection::Dependencies.section_header(), "## 依赖和风险");
        assert_eq!(DocSection::Changelog.section_header(), "## 更新日志");
        assert_eq!(
            DocSection::ImplementationHints.section_header(),
            "## 实现要点"
        );
    }

    #[test]
    fn section_header_covers_all_variants() {
        // 确保每个枚举变体都返回非空且以 "## " 开头的标题
        let variants = [
            DocSection::ApiSpec,
            DocSection::TestCases,
            DocSection::Dependencies,
            DocSection::Changelog,
            DocSection::ImplementationHints,
        ];
        for variant in &variants {
            let header = variant.section_header();
            assert!(
                header.starts_with("## "),
                "header '{header}' should start with '## '"
            );
            assert!(!header.trim_start_matches("## ").is_empty(), "header body should not be empty");
        }
    }
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

    // Use the model method for resolution
    let parent = task.find_parent_story(pool).await?;

    if parent.is_none() && (task.parent_task_id.is_some() || task.parent_workspace_id.is_some()) {
        return Err(ApiError::BadRequest(
            "Parent task not found".to_string(),
        ));
    }

    Ok(parent)
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

    // 根据 task_type 解析文档路径。
    // Story 可能没有 workspace（新建时尚未开始执行），直接从 project repo 解析路径。
    // Task 则需要通过 workspace 获取 repo，若 workspace 不存在则报错。
    let doc_path = match task.task_type {
        TaskType::Story => {
            let repo_path = resolve_repo_path_for_project(pool, task.project_id)
                .await
                .ok_or_else(|| ApiError::BadRequest("No repo found for project".to_string()))?;
            get_task_doc_path(&task, None, &repo_path)
        }
        TaskType::Task => {
            let parent_story = get_parent_story_for_task(pool, &task).await?;
            let (_workspace, repo) =
                get_workspace_and_repo_for_task(pool, &task, parent_story.as_ref()).await?;
            get_task_doc_path(&task, parent_story.as_ref(), &repo.path)
        }
    };

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

    // 根据 task_type 解析文档路径，与 get_task_doc 和 write_task_doc 保持一致。
    // Story 可能没有 workspace，直接从 project repo 解析路径。
    let doc_path = match task.task_type {
        TaskType::Story => {
            let repo_path = resolve_repo_path_for_project(pool, task.project_id)
                .await
                .ok_or_else(|| ApiError::BadRequest("No repo found for project".to_string()))?;
            get_task_doc_path(&task, None, &repo_path)
        }
        TaskType::Task => {
            let parent_story = get_parent_story_for_task(pool, &task).await?;
            let (_workspace, repo) =
                get_workspace_and_repo_for_task(pool, &task, parent_story.as_ref()).await?;
            get_task_doc_path(&task, parent_story.as_ref(), &repo.path)
        }
    };

    // Read existing doc
    let content = fs::read_to_string(&doc_path)
        .await
        .map_err(|e| ApiError::BadRequest(format!("Doc not found: {}", e)))?;

    // Update section based on type — directly use the enum's section_header() method,
    // eliminating the intermediate string mapping layer.
    let updated_content = if matches!(input.section, DocSection::Changelog) {
        append_to_changelog(&content, &input.content)
    } else {
        update_doc_section(&content, input.section.section_header(), &input.content)
    }
    .map_err(|e| ApiError::BadRequest(format!("Failed to update: {}", e)))?;

    // Write back
    fs::write(&doc_path, updated_content)
        .await
        .map_err(ApiError::Io)?;

    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct WriteTaskDocInput {
    pub content: String,
}

/// PUT /api/tasks/{task_id}/doc — 全文替换任务文档
pub async fn write_task_doc(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(input): Json<WriteTaskDocInput>,
) -> Result<StatusCode, ApiError> {
    let pool = &deployment.db().pool;

    // 根据 task_type 解析文档路径
    let doc_path = match task.task_type {
        TaskType::Story => {
            // Story 可能没有 workspace，从 project repo 解析路径
            let repo_path = resolve_repo_path_for_project(pool, task.project_id)
                .await
                .ok_or_else(|| {
                    ApiError::BadRequest("No repo found for project".to_string())
                })?;
            get_task_doc_path(&task, None, &repo_path)
        }
        TaskType::Task => {
            let parent_story = get_parent_story_for_task(pool, &task).await?;
            let (_workspace, repo) =
                get_workspace_and_repo_for_task(pool, &task, parent_story.as_ref()).await?;
            get_task_doc_path(&task, parent_story.as_ref(), &repo.path)
        }
    };

    // 确保父目录存在
    if let Some(parent) = doc_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(ApiError::Io)?;
    }

    // 全文覆写
    fs::write(&doc_path, &input.content)
        .await
        .map_err(ApiError::Io)?;

    Ok(StatusCode::NO_CONTENT)
}
