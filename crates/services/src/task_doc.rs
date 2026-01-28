use std::io;
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

/// Generate documentation file for a task (Story or Task)
///
/// Creates the directory structure and writes the markdown file.
pub async fn generate_task_doc(
    task: &db::models::task::Task,
    story: Option<&db::models::task::Task>,
    repo_root: &Path,
) -> io::Result<PathBuf> {
    use db::models::task::TaskType;

    let doc_path = get_task_doc_path(task, story, repo_root);

    // Create parent directory if it doesn't exist
    if let Some(parent) = doc_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Generate content based on task type
    let content = match task.task_type {
        TaskType::Story => generate_story_doc_template(task),
        TaskType::Task => {
            let story = story.expect("Task must have parent story");
            generate_task_doc_template(task, story)
        }
    };

    // Write to file
    tokio::fs::write(&doc_path, content).await?;

    Ok(doc_path)
}

#[cfg(test)]
mod generation_tests {
    use super::*;
    use tempfile::TempDir;
    use db::models::task::TaskType;
    use uuid::Uuid;

    // Reuse mock_task from path_tests
    use super::path_tests::mock_task;

    #[tokio::test]
    async fn test_generate_story_doc_creates_directory_and_file() {
        let temp_dir = TempDir::new().unwrap();
        let repo_root = temp_dir.path();

        let story = mock_task(
            Uuid::parse_str("123e4567-e89b-12d3-a456-426614174000").unwrap(),
            "User Auth",
            TaskType::Story
        );

        let doc_path = generate_task_doc(&story, None, repo_root).await.unwrap();

        assert!(doc_path.exists());
        assert_eq!(
            doc_path,
            repo_root.join("docs/stories/123e4567-e89b-12d3-a456-426614174000-user-auth/README.md")
        );

        let content = tokio::fs::read_to_string(&doc_path).await.unwrap();
        assert!(content.contains("# Story: User Auth"));
    }

    #[tokio::test]
    async fn test_generate_task_doc_creates_file() {
        let temp_dir = TempDir::new().unwrap();
        let repo_root = temp_dir.path();

        // First create the story doc (creates directory)
        let story = mock_task(
            Uuid::parse_str("123e4567-e89b-12d3-a456-426614174000").unwrap(),
            "User Auth",
            TaskType::Story
        );
        generate_task_doc(&story, None, repo_root).await.unwrap();

        // Now create task doc
        let task = mock_task(
            Uuid::parse_str("456e7890-e89b-12d3-a456-426614174111").unwrap(),
            "Login API",
            TaskType::Task
        );
        let doc_path = generate_task_doc(&task, Some(&story), repo_root).await.unwrap();

        assert!(doc_path.exists());

        let content = tokio::fs::read_to_string(&doc_path).await.unwrap();
        assert!(content.contains("# Task: Login API"));
    }

    #[tokio::test]
    async fn test_generate_task_doc_idempotent() {
        let temp_dir = TempDir::new().unwrap();
        let repo_root = temp_dir.path();

        let story = mock_task(Uuid::new_v4(), "User Auth", TaskType::Story);

        // Generate twice
        let path1 = generate_task_doc(&story, None, repo_root).await.unwrap();
        let path2 = generate_task_doc(&story, None, repo_root).await.unwrap();

        // Should not error, paths should be same
        assert_eq!(path1, path2);
        assert!(path1.exists());
    }
}

/// Update or add a section in a markdown document
pub fn update_doc_section(
    doc_content: &str,
    section_header: &str,
    new_content: &str,
) -> Result<String, String> {
    // If section doesn't exist, append at end
    if !doc_content.contains(section_header) {
        return Ok(format!(
            "{}\n\n{}\n\n{}",
            doc_content.trim_end(),
            section_header,
            new_content
        ));
    }

    // Replace section content
    let lines: Vec<&str> = doc_content.lines().collect();
    let mut result = Vec::new();
    let mut in_target_section = false;
    let mut section_updated = false;

    for line in lines {
        if line.starts_with("## ") {
            if line == section_header {
                in_target_section = true;
                result.push(line);
                result.push("");
                result.push(new_content);
                section_updated = true;
            } else {
                in_target_section = false;
                result.push(line);
            }
        } else if !in_target_section || !section_updated {
            result.push(line);
        }
    }

    Ok(result.join("\n"))
}

/// Append a new entry to the changelog section
pub fn append_to_changelog(doc_content: &str, new_entry: &str) -> Result<String, String> {
    let section_header = "## 更新日志";

    if !doc_content.contains(section_header) {
        return update_doc_section(doc_content, section_header, new_entry);
    }

    // Find changelog section and append
    let lines: Vec<&str> = doc_content.lines().collect();
    let mut result = Vec::new();
    let mut in_changelog = false;
    let mut appended = false;

    for (i, line) in lines.iter().enumerate() {
        result.push(*line);

        if line.starts_with("## ") {
            if *line == section_header {
                in_changelog = true;
            } else if in_changelog && !appended {
                // Reached next section, insert before it
                result.pop();
                result.push(new_entry);
                result.push("");
                result.push(*line);
                appended = true;
                in_changelog = false;
            } else {
                in_changelog = false;
            }
        }

        // If last line and still in changelog
        if in_changelog && i == lines.len() - 1 && !appended {
            result.push(new_entry);
            appended = true;
        }
    }

    Ok(result.join("\n"))
}

/// Convert DocSection enum variant name to Chinese section header
pub fn section_header_from_doc_section(section: &str) -> &'static str {
    match section {
        "api_spec" => "## API 规格",
        "test_cases" => "## 测试用例",
        "dependencies" => "## 依赖和风险",
        "changelog" => "## 更新日志",
        "implementation_hints" => "## 实现要点",
        _ => "## 未知章节",
    }
}

#[cfg(test)]
mod section_update_tests {
    use super::*;

    #[test]
    fn test_update_existing_section() {
        let doc = r#"# Task: Test

## 基本信息
- ID: 123

## 实现要点
Old content

## 更新日志
- Log entry
"#;

        let updated = update_doc_section(doc, "## 实现要点", "New content").unwrap();

        assert!(updated.contains("New content"));
        assert!(!updated.contains("Old content"));
        assert!(updated.contains("## 更新日志"));
    }

    #[test]
    fn test_add_new_section() {
        let doc = r#"# Task: Test

## 基本信息
- ID: 123
"#;

        let updated = update_doc_section(doc, "## API 规格", "API content").unwrap();

        assert!(updated.contains("## API 规格"));
        assert!(updated.contains("API content"));
    }

    #[test]
    fn test_append_to_changelog() {
        let doc = r#"# Task: Test

## 更新日志
- [2026-01-28] Initial
"#;

        let updated = append_to_changelog(doc, "- [2026-01-29] Updated").unwrap();

        assert!(updated.contains("- [2026-01-28] Initial"));
        assert!(updated.contains("- [2026-01-29] Updated"));
    }

    #[test]
    fn test_append_to_changelog_with_next_section() {
        let doc = r#"# Task: Test

## 更新日志
- [2026-01-28] Initial

## 其他章节
Some content
"#;

        let updated = append_to_changelog(doc, "- [2026-01-29] Updated").unwrap();

        assert!(updated.contains("- [2026-01-28] Initial"));
        assert!(updated.contains("- [2026-01-29] Updated"));
        assert!(updated.contains("## 其他章节"));
        // Verify the new entry comes before the next section
        let changelog_pos = updated.find("## 更新日志").unwrap();
        let new_entry_pos = updated.find("- [2026-01-29] Updated").unwrap();
        let next_section_pos = updated.find("## 其他章节").unwrap();
        assert!(new_entry_pos > changelog_pos);
        assert!(new_entry_pos < next_section_pos);
    }

    #[test]
    fn test_section_header_from_doc_section() {
        assert_eq!(section_header_from_doc_section("api_spec"), "## API 规格");
        assert_eq!(section_header_from_doc_section("test_cases"), "## 测试用例");
        assert_eq!(
            section_header_from_doc_section("dependencies"),
            "## 依赖和风险"
        );
        assert_eq!(section_header_from_doc_section("changelog"), "## 更新日志");
        assert_eq!(
            section_header_from_doc_section("implementation_hints"),
            "## 实现要点"
        );
        assert_eq!(section_header_from_doc_section("unknown"), "## 未知章节");
    }
}
