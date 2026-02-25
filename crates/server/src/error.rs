use axum::{
    Json,
    extract::multipart::MultipartError,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use db::models::{
    execution_process::ExecutionProcessError, project::ProjectError,
    project_repo::ProjectRepoError, repo::RepoError, scratch::ScratchError, session::SessionError,
    workspace::WorkspaceError,
};
use deployment::{DeploymentError, RemoteClientNotConfigured};
use executors::{command::CommandBuildError, executors::ExecutorError};
use git2::Error as Git2Error;
use local_deployment::pty::PtyError;
use services::services::{
    config::{ConfigError, EditorOpenError},
    container::ContainerError,
    git::GitServiceError,
    git_host::GitHostError,
    image::ImageError,
    project::ProjectServiceError,
    remote_client::RemoteClientError,
    repo::RepoError as RepoServiceError,
    worktree_manager::WorktreeError,
};
use thiserror::Error;
use utils::response::ApiResponse;

#[derive(Debug, Error, ts_rs::TS)]
#[ts(type = "string")]
pub enum ApiError {
    #[error(transparent)]
    Project(#[from] ProjectError),
    #[error(transparent)]
    Repo(#[from] RepoError),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error(transparent)]
    ScratchError(#[from] ScratchError),
    #[error(transparent)]
    ExecutionProcess(#[from] ExecutionProcessError),
    #[error(transparent)]
    GitService(#[from] GitServiceError),
    #[error(transparent)]
    GitHost(#[from] GitHostError),
    #[error(transparent)]
    Deployment(#[from] DeploymentError),
    #[error(transparent)]
    Container(#[from] ContainerError),
    #[error(transparent)]
    Executor(#[from] ExecutorError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Worktree(#[from] WorktreeError),
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    Image(#[from] ImageError),
    #[error("Multipart error: {0}")]
    Multipart(#[from] MultipartError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    EditorOpen(#[from] EditorOpenError),
    #[error(transparent)]
    RemoteClient(#[from] RemoteClientError),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error(transparent)]
    CommandBuilder(#[from] CommandBuildError),
    #[error(transparent)]
    Pty(#[from] PtyError),
}

impl From<&'static str> for ApiError {
    fn from(msg: &'static str) -> Self {
        ApiError::BadRequest(msg.to_string())
    }
}

impl From<Git2Error> for ApiError {
    fn from(err: Git2Error) -> Self {
        ApiError::GitService(GitServiceError::from(err))
    }
}

impl From<RemoteClientNotConfigured> for ApiError {
    fn from(_: RemoteClientNotConfigured) -> Self {
        ApiError::BadRequest("Remote client not configured".to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status_code, error_type) = match &self {
            ApiError::Project(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ProjectError"),
            ApiError::Repo(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ProjectRepoError"),
            ApiError::Workspace(_) => (StatusCode::INTERNAL_SERVER_ERROR, "WorkspaceError"),
            ApiError::Session(_) => (StatusCode::INTERNAL_SERVER_ERROR, "SessionError"),
            ApiError::ScratchError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ScratchError"),
            ApiError::ExecutionProcess(err) => match err {
                ExecutionProcessError::ExecutionProcessNotFound => {
                    (StatusCode::NOT_FOUND, "ExecutionProcessError")
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "ExecutionProcessError"),
            },
            // Promote certain GitService errors to conflict status with concise messages
            ApiError::GitService(git_err) => match git_err {
                services::services::git::GitServiceError::MergeConflicts { .. } => {
                    (StatusCode::CONFLICT, "GitServiceError")
                }
                services::services::git::GitServiceError::RebaseInProgress => {
                    (StatusCode::CONFLICT, "GitServiceError")
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "GitServiceError"),
            },
            ApiError::GitHost(_) => (StatusCode::INTERNAL_SERVER_ERROR, "GitHostError"),
            ApiError::Deployment(_) => (StatusCode::INTERNAL_SERVER_ERROR, "DeploymentError"),
            ApiError::Container(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ContainerError"),
            ApiError::Executor(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ExecutorError"),
            ApiError::CommandBuilder(_) => (StatusCode::INTERNAL_SERVER_ERROR, "CommandBuildError"),
            ApiError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "DatabaseError"),
            ApiError::Worktree(_) => (StatusCode::INTERNAL_SERVER_ERROR, "WorktreeError"),
            ApiError::Config(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ConfigError"),
            ApiError::Image(img_err) => match img_err {
                ImageError::InvalidFormat => (StatusCode::BAD_REQUEST, "InvalidImageFormat"),
                ImageError::TooLarge(_, _) => (StatusCode::PAYLOAD_TOO_LARGE, "ImageTooLarge"),
                ImageError::NotFound => (StatusCode::NOT_FOUND, "ImageNotFound"),
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "ImageError"),
            },
            ApiError::Io(_) => (StatusCode::INTERNAL_SERVER_ERROR, "IoError"),
            ApiError::EditorOpen(err) => match err {
                EditorOpenError::LaunchFailed { .. } => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "EditorLaunchError")
                }
                _ => (StatusCode::BAD_REQUEST, "EditorOpenError"),
            },
            ApiError::Multipart(_) => (StatusCode::BAD_REQUEST, "MultipartError"),
            ApiError::RemoteClient(err) => match err {
                RemoteClientError::Auth => (StatusCode::UNAUTHORIZED, "RemoteClientError"),
                RemoteClientError::Timeout => (StatusCode::GATEWAY_TIMEOUT, "RemoteClientError"),
                RemoteClientError::Transport(_) => (StatusCode::BAD_GATEWAY, "RemoteClientError"),
                RemoteClientError::Http { status, .. } => (
                    StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY),
                    "RemoteClientError",
                ),
                RemoteClientError::Token(_) => (StatusCode::BAD_GATEWAY, "RemoteClientError"),
                RemoteClientError::Api(code) => match code {
                    services::services::remote_client::HandoffErrorCode::NotFound => {
                        (StatusCode::NOT_FOUND, "RemoteClientError")
                    }
                    services::services::remote_client::HandoffErrorCode::Expired => {
                        (StatusCode::UNAUTHORIZED, "RemoteClientError")
                    }
                    services::services::remote_client::HandoffErrorCode::AccessDenied => {
                        (StatusCode::FORBIDDEN, "RemoteClientError")
                    }
                    services::services::remote_client::HandoffErrorCode::ProviderError
                    | services::services::remote_client::HandoffErrorCode::InternalError => {
                        (StatusCode::BAD_GATEWAY, "RemoteClientError")
                    }
                    _ => (StatusCode::BAD_REQUEST, "RemoteClientError"),
                },
                RemoteClientError::Storage(_) => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "RemoteClientError")
                }
                RemoteClientError::Serde(_) | RemoteClientError::Url(_) => {
                    (StatusCode::BAD_REQUEST, "RemoteClientError")
                }
            },
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, "BadRequest"),
            ApiError::Conflict(_) => (StatusCode::CONFLICT, "ConflictError"),
            ApiError::Forbidden(_) => (StatusCode::FORBIDDEN, "ForbiddenError"),
            ApiError::Pty(err) => match err {
                PtyError::SessionNotFound(_) => (StatusCode::NOT_FOUND, "PtyError"),
                PtyError::SessionClosed => (StatusCode::GONE, "PtyError"),
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "PtyError"),
            },
        };

        let error_message = match &self {
            ApiError::Image(img_err) => match img_err {
                ImageError::InvalidFormat => "This file type is not supported. Please upload an image file (PNG, JPG, GIF, WebP, or BMP).".to_string(),
                ImageError::TooLarge(size, max) => format!(
                    "This image is too large ({:.1} MB). Maximum file size is {:.1} MB.",
                    *size as f64 / 1_048_576.0,
                    *max as f64 / 1_048_576.0
                ),
                ImageError::NotFound => "Image not found.".to_string(),
                _ => {
                    "Failed to process image. Please try again.".to_string()
                }
            },
            ApiError::GitService(git_err) => match git_err {
                services::services::git::GitServiceError::MergeConflicts { message, .. } => {
                    message.clone()
                }
                services::services::git::GitServiceError::RebaseInProgress => {
                    "A rebase is already in progress. Resolve conflicts or abort the rebase, then retry.".to_string()
                }
                _ => format!("{}: {}", error_type, self),
            },
            ApiError::Multipart(_) => "Failed to upload file. Please ensure the file is valid and try again.".to_string(),
            ApiError::RemoteClient(err) => match err {
                RemoteClientError::Auth => "Unauthorized. Please sign in again.".to_string(),
                RemoteClientError::Timeout => "Remote service timeout. Please try again.".to_string(),
                RemoteClientError::Transport(_) => "Remote service unavailable. Please try again.".to_string(),
                RemoteClientError::Http { body, .. } => {
                    if body.is_empty() {
                        "Remote service error. Please try again.".to_string()
                    } else {
                        body.clone()
                    }
                }
                RemoteClientError::Token(_) => {
                    "Remote service returned an invalid access token. Please sign in again.".to_string()
                }
                RemoteClientError::Storage(_) => {
                    "Failed to persist credentials locally. Please retry.".to_string()
                }
                RemoteClientError::Api(code) => match code {
                    services::services::remote_client::HandoffErrorCode::NotFound => {
                        "The requested resource was not found.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::Expired => {
                        "The link or token has expired.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::AccessDenied => {
                        "Access denied.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::UnsupportedProvider => {
                        "Unsupported authentication provider.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::InvalidReturnUrl => {
                        "Invalid return URL.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::InvalidChallenge => {
                        "Invalid authentication challenge.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::ProviderError => {
                        "Authentication provider error. Please try again.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::InternalError => {
                        "Internal remote service error. Please try again.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::Other(msg) => {
                        format!("Authentication error: {}", msg)
                    }
                },
                RemoteClientError::Serde(_) => "Unexpected response from remote service.".to_string(),
                RemoteClientError::Url(_) => "Remote service URL is invalid.".to_string(),
            },
            ApiError::Unauthorized => "Unauthorized. Please sign in again.".to_string(),
            ApiError::BadRequest(msg) => msg.clone(),
            ApiError::Conflict(msg) => msg.clone(),
            ApiError::Forbidden(msg) => msg.clone(),
            _ => {
                tracing::error!(error = %self, error_type = error_type, "Internal error occurred");
                "An internal error occurred. Please try again later.".to_string()
            }
        };
        let response = ApiResponse::<()>::error(&error_message);
        (status_code, Json(response)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::response::IntoResponse;

    #[tokio::test]
    async fn test_default_branch_does_not_leak_internal_details() {
        // 构造一个落入默认 `_ =>` 分支的错误：IoError
        // IO 错误消息中会包含系统内部路径或错误描述，不应暴露给客户端
        let internal_msg = "secret internal path /etc/shadow permission denied";
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, internal_msg);
        let api_err = ApiError::Io(io_err);

        let response = api_err.into_response();

        // 验证状态码为 500
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        // 读取响应体
        let body_bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("failed to read response body");
        let body_str = std::str::from_utf8(&body_bytes).expect("body is not valid UTF-8");

        // 验证响应体不包含内部错误路径或详细信息
        assert!(
            !body_str.contains(internal_msg),
            "Response body must NOT contain internal error details, but got: {body_str}"
        );
        assert!(
            !body_str.contains("/etc/shadow"),
            "Response body must NOT contain internal paths, but got: {body_str}"
        );

        // 验证响应体包含通用错误提示
        assert!(
            body_str.contains("An internal error occurred"),
            "Response body must contain generic error message, but got: {body_str}"
        );
    }

    #[tokio::test]
    async fn test_default_branch_database_error_does_not_leak_details() {
        // 数据库错误同样落入默认分支，包含敏感的 SQL 查询信息
        let db_err = sqlx::Error::RowNotFound;
        let api_err = ApiError::Database(db_err);

        let response = api_err.into_response();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let body_bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("failed to read response body");
        let body_str = std::str::from_utf8(&body_bytes).expect("body is not valid UTF-8");

        // 不应包含 "DatabaseError: ..." 这样的内部格式
        assert!(
            !body_str.contains("DatabaseError:"),
            "Response body must NOT leak error_type prefix, but got: {body_str}"
        );

        // 应包含通用错误提示
        assert!(
            body_str.contains("An internal error occurred"),
            "Response body must contain generic error message, but got: {body_str}"
        );
    }
}

impl From<ProjectServiceError> for ApiError {
    fn from(err: ProjectServiceError) -> Self {
        match err {
            ProjectServiceError::Database(db_err) => ApiError::Database(db_err),
            ProjectServiceError::Io(io_err) => ApiError::Io(io_err),
            ProjectServiceError::Project(proj_err) => ApiError::Project(proj_err),
            ProjectServiceError::PathNotFound(path) => {
                ApiError::BadRequest(format!("Path does not exist: {}", path.display()))
            }
            ProjectServiceError::PathNotDirectory(path) => {
                ApiError::BadRequest(format!("Path is not a directory: {}", path.display()))
            }
            ProjectServiceError::NotGitRepository(path) => {
                ApiError::BadRequest(format!("Path is not a git repository: {}", path.display()))
            }
            ProjectServiceError::DuplicateGitRepoPath => ApiError::Conflict(
                "A project with this git repository path already exists".to_string(),
            ),
            ProjectServiceError::DuplicateRepositoryName => ApiError::Conflict(
                "A repository with this name already exists in the project".to_string(),
            ),
            ProjectServiceError::RepositoryNotFound => {
                ApiError::BadRequest("Repository not found".to_string())
            }
            ProjectServiceError::GitError(msg) => {
                ApiError::BadRequest(format!("Git operation failed: {}", msg))
            }
            ProjectServiceError::RemoteClient(msg) => {
                ApiError::BadRequest(format!("Remote client error: {}", msg))
            }
        }
    }
}

impl From<RepoServiceError> for ApiError {
    fn from(err: RepoServiceError) -> Self {
        match err {
            RepoServiceError::Database(db_err) => ApiError::Database(db_err),
            RepoServiceError::Io(io_err) => ApiError::Io(io_err),
            RepoServiceError::PathNotFound(path) => {
                ApiError::BadRequest(format!("Path does not exist: {}", path.display()))
            }
            RepoServiceError::PathNotDirectory(path) => {
                ApiError::BadRequest(format!("Path is not a directory: {}", path.display()))
            }
            RepoServiceError::NotGitRepository(path) => {
                ApiError::BadRequest(format!("Path is not a git repository: {}", path.display()))
            }
            RepoServiceError::NotFound => ApiError::BadRequest("Repository not found".to_string()),
            RepoServiceError::DirectoryAlreadyExists(path) => {
                ApiError::BadRequest(format!("Directory already exists: {}", path.display()))
            }
            RepoServiceError::Git(git_err) => {
                ApiError::BadRequest(format!("Git error: {}", git_err))
            }
            RepoServiceError::InvalidFolderName(name) => {
                ApiError::BadRequest(format!("Invalid folder name: {}", name))
            }
        }
    }
}

impl From<ProjectRepoError> for ApiError {
    fn from(err: ProjectRepoError) -> Self {
        match err {
            ProjectRepoError::Database(db_err) => ApiError::Database(db_err),
            ProjectRepoError::NotFound => {
                ApiError::BadRequest("Repository not found in project".to_string())
            }
            ProjectRepoError::AlreadyExists => {
                ApiError::Conflict("Repository already exists in project".to_string())
            }
        }
    }
}
