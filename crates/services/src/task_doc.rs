use std::path::{Path, PathBuf};

pub fn slugify(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Compute the documentation file path for a task.
///
/// For Story: `{repo_root}/docs/stories/{story_id}-{slug}/README.md`
/// For Task: `{repo_root}/docs/stories/{story_id}-{slug}/{task_id}-{slug}.md`
pub fn get_task_doc_path(
    task: &db::models::task::Task,
    story: Option<&db::models::task::Task>,
    repo_root: &Path,
) -> PathBuf {
    use db::models::task::TaskType;

    let base = repo_root.join("docs/stories");

    match task.task_type {
        TaskType::Story => {
            let slug = slugify(&task.title);
            base.join(format!("{}-{}", task.id, slug))
                .join("README.md")
        }
        TaskType::Task => {
            let story = story.expect("Task must have parent story");
            let story_slug = slugify(&story.title);
            let task_slug = slugify(&task.title);
            base.join(format!("{}-{}", story.id, story_slug))
                .join(format!("{}-{}.md", task.id, task_slug))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slugify_basic() {
        assert_eq!(slugify("User Authentication"), "user-authentication");
    }

    #[test]
    fn test_slugify_with_numbers() {
        assert_eq!(slugify("API v2 Integration"), "api-v2-integration");
    }

    #[test]
    fn test_slugify_special_chars() {
        assert_eq!(slugify("Fix: Bug #123 [URGENT]"), "fix-bug-123-urgent");
    }

    #[test]
    fn test_slugify_multiple_dashes() {
        assert_eq!(slugify("A   B---C"), "a-b-c");
    }

    #[test]
    fn test_slugify_chinese() {
        assert_eq!(slugify("用户登录 API"), "api");
    }
}

#[cfg(test)]
mod path_tests {
    use super::*;
    use db::models::task::{Task, TaskStatus, TaskType};
    use chrono::Utc;
    use uuid::Uuid;

    pub(crate) fn mock_task(id: Uuid, title: &str, task_type: TaskType) -> Task {
        Task {
            id,
            project_id: Uuid::new_v4(),
            title: title.to_string(),
            description: None,
            status: TaskStatus::Todo,
            task_type,
            parent_workspace_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_story_doc_path() {
        let story = mock_task(
            Uuid::parse_str("123e4567-e89b-12d3-a456-426614174000").unwrap(),
            "User Authentication",
            TaskType::Story,
        );

        let path = get_task_doc_path(&story, None, Path::new("/repo"));

        assert_eq!(
            path,
            PathBuf::from(
                "/repo/docs/stories/123e4567-e89b-12d3-a456-426614174000-user-authentication/README.md"
            )
        );
    }

    #[test]
    fn test_task_doc_path() {
        let story = mock_task(
            Uuid::parse_str("123e4567-e89b-12d3-a456-426614174000").unwrap(),
            "User Authentication",
            TaskType::Story,
        );
        let task = mock_task(
            Uuid::parse_str("456e7890-e89b-12d3-a456-426614174111").unwrap(),
            "Login API",
            TaskType::Task,
        );

        let path = get_task_doc_path(&task, Some(&story), Path::new("/repo"));

        assert_eq!(
            path,
            PathBuf::from(
                "/repo/docs/stories/123e4567-e89b-12d3-a456-426614174000-user-authentication/456e7890-e89b-12d3-a456-426614174111-login-api.md"
            )
        );
    }

    #[test]
    #[should_panic(expected = "Task must have parent story")]
    fn test_task_without_story_panics() {
        let task = mock_task(Uuid::new_v4(), "Login API", TaskType::Task);

        get_task_doc_path(&task, None, Path::new("/repo"));
    }
}

/// Generate markdown template for a Story document
pub fn generate_story_doc_template(story: &db::models::task::Task) -> String {
    use db::models::task::TaskStatus;

    let status_str = match story.status {
        TaskStatus::Todo => "Todo",
        TaskStatus::InProgress => "In Progress",
        TaskStatus::InReview => "In Review",
        TaskStatus::Done => "Done",
        TaskStatus::Cancelled => "Cancelled",
    };

    format!(
        r#"# Story: {}

## 基本信息
- **ID**: {}
- **状态**: {}
- **创建时间**: {}

## 描述

{}

## Tasks

<!-- Tasks 列表将在子任务创建时自动更新 -->

## 更新日志

- [{}] Story 创建
"#,
        story.title,
        story.id,
        status_str,
        story.created_at.format("%Y-%m-%d %H:%M"),
        story.description.as_deref().unwrap_or("待补充"),
        story.created_at.format("%Y-%m-%d")
    )
}

/// Generate markdown template for a Task document
pub fn generate_task_doc_template(task: &db::models::task::Task, story: &db::models::task::Task) -> String {
    use db::models::task::{TaskStatus, TaskType};

    let implementation_hints = extract_implementation_hints(task.description.as_deref());
    let status_str = match task.status {
        TaskStatus::Todo => "Todo",
        TaskStatus::InProgress => "In Progress",
        TaskStatus::InReview => "In Review",
        TaskStatus::Done => "Done",
        TaskStatus::Cancelled => "Cancelled",
    };
    let task_type_str = match task.task_type {
        TaskType::Story => "Story",
        TaskType::Task => "Task",
    };

    format!(
        r#"# Task: {}

## 基本信息
- **ID**: {}
- **Story**: [{}-{}](./README.md)
- **类型**: {}
- **状态**: {}
- **创建时间**: {}

## 描述

{}

## 实现要点

{}

## 相关文件

<!-- 执行时自动补充 -->

## 更新日志

- [{}] Task 创建
"#,
        task.title,
        task.id,
        story.id,
        story.title,
        task_type_str,
        status_str,
        task.created_at.format("%Y-%m-%d %H:%M"),
        task.description.as_deref().unwrap_or("待补充"),
        implementation_hints,
        task.created_at.format("%Y-%m-%d")
    )
}

/// Extract implementation hints from description (bullet points)
pub fn extract_implementation_hints(description: Option<&str>) -> String {
    description
        .and_then(|d| {
            let hints: Vec<_> = d
                .lines()
                .filter(|line| {
                    let trimmed = line.trim_start();
                    trimmed.starts_with('-') || trimmed.starts_with('*')
                })
                .collect();

            if hints.is_empty() {
                None
            } else {
                Some(hints.join("\n"))
            }
        })
        .unwrap_or_else(|| "<!-- 待 Brainstorm 时补充 -->".to_string())
}

#[cfg(test)]
mod template_tests {
    use super::*;
    use crate::task_doc::path_tests::mock_task;
    use db::models::task::TaskType;
    use uuid::Uuid;

    #[test]
    fn test_generate_story_doc_template() {
        let story = mock_task(
            Uuid::parse_str("123e4567-e89b-12d3-a456-426614174000").unwrap(),
            "User Authentication",
            TaskType::Story
        );

        let doc = generate_story_doc_template(&story);

        assert!(doc.contains("# Story: User Authentication"));
        assert!(doc.contains("**ID**: 123e4567-e89b-12d3-a456-426614174000"));
        assert!(doc.contains("## 基本信息"));
        assert!(doc.contains("## 描述"));
        assert!(doc.contains("## Tasks"));
        assert!(doc.contains("## 更新日志"));
    }

    #[test]
    fn test_generate_task_doc_template_basic() {
        let story = mock_task(Uuid::new_v4(), "User Auth", TaskType::Story);
        let mut task = mock_task(Uuid::new_v4(), "Login API", TaskType::Task);
        task.description = Some("Implement POST /api/auth/login".to_string());

        let doc = generate_task_doc_template(&task, &story);

        assert!(doc.contains("# Task: Login API"));
        assert!(doc.contains("**Story**: ["));
        assert!(doc.contains("## 基本信息"));
        assert!(doc.contains("## 描述"));
        assert!(doc.contains("## 实现要点"));
        assert!(doc.contains("## 相关文件"));
        assert!(doc.contains("## 更新日志"));
    }

    #[test]
    fn test_extract_implementation_hints_with_bullets() {
        let description = Some("Implement login\n- POST /api/auth/login\n- Validate credentials\n- Return JWT token".to_string());

        let hints = extract_implementation_hints(description.as_deref());

        assert!(hints.contains("- POST /api/auth/login"));
        assert!(hints.contains("- Validate credentials"));
        assert!(hints.contains("- Return JWT token"));
    }

    #[test]
    fn test_extract_implementation_hints_no_bullets() {
        let description = Some("Just a simple description".to_string());

        let hints = extract_implementation_hints(description.as_deref());

        assert_eq!(hints, "<!-- 待 Brainstorm 时补充 -->");
    }
}
