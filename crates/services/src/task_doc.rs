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

    fn mock_task(id: Uuid, title: &str, task_type: TaskType) -> Task {
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
