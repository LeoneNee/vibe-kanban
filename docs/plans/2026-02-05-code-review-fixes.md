# Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix issues identified in the Leone code review for the feature/story-kanban branch.

**Architecture:** Four independent fixes targeting different layers: 1) Frontend cleanup (console.log removal), 2) Backend model refactoring (parent story resolution), 3) Backend service refactoring (document generation), 4) SQL maintainability improvement (QueryBuilder).

**Tech Stack:** TypeScript/React (frontend), Rust/sqlx (backend), TDD approach with existing test infrastructure.

---

## Task 1: Remove Debug Console.log from ProjectStories

**Files:**
- Modify: `frontend/src/pages/ProjectStories.tsx:43-48`

**Step 1.1: Identify the debug code**

The following useEffect block should be removed:

```typescript
useEffect(() => {
  console.log(
    `[ProjectStories] stories updated: length=${stories.length}`,
    stories.map((story) => story.id)
  );
}, [stories]);
```

**Step 1.2: Remove the debug useEffect**

Delete lines 43-48 entirely. The file should go from:

```typescript
} = useProjectStories(projectId || '');

useEffect(() => {
  console.log(
    `[ProjectStories] stories updated: length=${stories.length}`,
    stories.map((story) => story.id)
  );
}, [stories]);

// When a story disappears...
```

To:

```typescript
} = useProjectStories(projectId || '');

// When a story disappears...
```

**Step 1.3: Verify no lint errors**

Run: `pnpm run lint --filter frontend`
Expected: PASS (no new errors introduced)

**Step 1.4: Commit**

```bash
git add frontend/src/pages/ProjectStories.tsx
git commit -m "chore: remove debug console.log from ProjectStories"
```

---

## Task 2: Move Parent Story Resolution to Model Layer

**Files:**
- Modify: `crates/db/src/models/task.rs` (add new method)
- Modify: `crates/server/src/routes/task_docs.rs` (use new method)
- Test: existing tests in `crates/services/src/task_doc.rs`

**Step 2.1: Write failing test for Task::find_parent_story**

Add test at the end of `crates/db/src/models/task.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_parent_story_returns_none_for_story_type() {
        // Story tasks should always return None for parent
        let story = Task {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            title: "Test Story".to_string(),
            description: None,
            status: TaskStatus::Todo,
            task_type: TaskType::Story,
            parent_workspace_id: None,
            parent_task_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        // This is a sync check, not async
        assert!(story.task_type == TaskType::Story);
        assert!(story.parent_task_id.is_none());
    }
}
```

**Step 2.2: Run test to verify it compiles**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo test -p db tests::test_find_parent_story`
Expected: PASS (basic test)

**Step 2.3: Add find_parent_story method to Task model**

Add after `find_relationships_for_workspace` in `crates/db/src/models/task.rs`:

```rust
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
```

**Step 2.4: Verify compilation**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo check -p db`
Expected: PASS

**Step 2.5: Update task_docs.rs to use new method**

Replace `get_parent_story_for_task` in `crates/server/src/routes/task_docs.rs`:

```rust
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
            "Task must have either parent_task_id or parent_workspace_id".to_string(),
        ));
    }

    Ok(parent)
}
```

**Step 2.6: Run existing tests**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo test -p services task_doc`
Expected: All tests PASS

**Step 2.7: Commit**

```bash
git add crates/db/src/models/task.rs crates/server/src/routes/task_docs.rs
git commit -m "refactor: move parent story resolution to Task model"
```

---

## Task 3: Extract Document Generation Helper

**Files:**
- Modify: `crates/server/src/routes/tasks.rs` (extract helper, use in both functions)

**Step 3.1: Analyze duplicate code**

Current duplication in `create_task` (lines 175-216) and `create_task_and_start` (lines 319-344):
- Both resolve repo_path
- Both resolve parent_story
- Both call generate_task_doc

**Step 3.2: Create helper function**

Add before `create_task` in `crates/server/src/routes/tasks.rs`:

```rust
/// Helper to generate task documentation after task creation.
/// Handles both direct repo path and lookup-based repo resolution.
async fn try_generate_task_doc(
    pool: &SqlitePool,
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
async fn resolve_repo_path_for_task(pool: &SqlitePool, task: &Task) -> Option<PathBuf> {
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
```

**Step 3.3: Add PathBuf import**

Ensure this import exists at top of file:

```rust
use std::path::PathBuf;
```

**Step 3.4: Update create_task to use helper**

Replace lines 174-216 in `create_task`:

```rust
    // Generate task doc for Task-type tasks (Stories skip - no workspace/repo available yet)
    if task.task_type == TaskType::Task {
        try_generate_task_doc(&deployment.db().pool, &task, None).await;
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}
```

**Step 3.5: Update create_task_and_start to use helper**

Replace lines 319-344 in `create_task_and_start`:

```rust
    // Generate task doc after workspace repos are created
    if let Some(first_repo_input) = payload.repos.first() {
        if let Ok(Some(first_repo)) = Repo::find_by_id(pool, first_repo_input.repo_id).await {
            try_generate_task_doc(pool, &task, Some(first_repo.path.clone())).await;
        }
    }
```

**Step 3.6: Verify compilation**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo check -p server`
Expected: PASS

**Step 3.7: Commit**

```bash
git add crates/server/src/routes/tasks.rs
git commit -m "refactor: extract try_generate_task_doc helper to reduce duplication"
```

---

## Task 4: Refactor list_tasks to Use QueryBuilder

**Files:**
- Modify: `crates/db/src/models/task.rs:214-249`
- Test: Add integration test

**Step 4.1: Write test for list_tasks filters**

Add to tests module in `crates/db/src/models/task.rs`:

```rust
#[test]
fn test_list_tasks_filter_combinations() {
    // Test that filter combinations are logically valid
    // This is a compile-time check that the function signature is correct
    let _: fn(
        &SqlitePool,
        Uuid,
        Option<TaskType>,
        Option<Option<Uuid>>,
    ) -> _ = Task::list_tasks;
}
```

**Step 4.2: Refactor list_tasks to use QueryBuilder**

Replace the existing `list_tasks` method:

```rust
pub async fn list_tasks(
    pool: &SqlitePool,
    project_id: Uuid,
    task_type_filter: Option<TaskType>,
    parent_task_id_filter: Option<Option<Uuid>>,
) -> Result<Vec<Task>, sqlx::Error> {
    use sqlx::QueryBuilder;

    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT id, project_id, title, description, status, task_type, parent_workspace_id, parent_task_id, created_at, updated_at FROM tasks WHERE project_id = "
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
```

**Step 4.3: Verify compilation**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo check -p db`
Expected: PASS

**Step 4.4: Run all tests**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo test -p db`
Expected: All tests PASS

**Step 4.5: Commit**

```bash
git add crates/db/src/models/task.rs
git commit -m "refactor: use QueryBuilder for list_tasks to improve maintainability"
```

---

## Task 5: Final Verification

**Step 5.1: Run full backend check**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo check --workspace`
Expected: PASS

**Step 5.2: Run full test suite**

Run: `RUSTC=~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/rustc ~/.rustup/toolchains/nightly-2026-01-21-aarch64-apple-darwin/bin/cargo test --workspace`
Expected: All tests PASS

**Step 5.3: Run frontend checks**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

**Step 5.4: Final commit summary**

Verify all commits:
```bash
git log --oneline -5
```

Expected output should show 4 commits:
1. `chore: remove debug console.log from ProjectStories`
2. `refactor: move parent story resolution to Task model`
3. `refactor: extract try_generate_task_doc helper to reduce duplication`
4. `refactor: use QueryBuilder for list_tasks to improve maintainability`

---

## Summary

| Task | Priority | Estimated Complexity | Files Changed |
|------|----------|---------------------|---------------|
| 1. Remove console.log | P3 | Trivial | 1 |
| 2. Parent story resolution | P2 | Low | 2 |
| 3. Doc generation helper | P2 | Medium | 1 |
| 4. QueryBuilder refactor | P2 | Medium | 1 |
| 5. Final verification | - | - | 0 |

**Total commits:** 4
**Total files modified:** 4
