# Story Document Generation - Manual Test Checklist

This checklist covers manual testing for the Story Brainstorm documentation generation feature.

## Prerequisites

- [ ] Backend running: `pnpm run backend:dev:watch`
- [ ] Frontend running: `pnpm run frontend:dev`
- [ ] At least one project with repo configured

## Test 1: Story Creation with Document Generation

- [ ] Navigate to Project Stories page
- [ ] Click "Start Brainstorm"
- [ ] Verify branch selector shows for each repo
- [ ] Select branch for each repo
- [ ] Fill in brainstorm prompt
- [ ] Submit and create Story
- [ ] Verify doc file created: `docs/stories/{id}-{slug}/README.md`
- [ ] Verify file contains:
  - Story title
  - Story ID
  - Status
  - Description
  - Tasks section placeholder
  - Changelog section

## Test 2: Task Creation with Document Generation

- [ ] Create Task under a Story via create-and-start
- [ ] Verify task doc created: `docs/stories/{story-slug}/{task-id}-{task-slug}.md`
- [ ] Verify task doc contains:
  - Task title
  - Reference to parent Story
  - Task type
  - Status
  - Description
  - Implementation hints (if description has bullet points)
  - Related files section
  - Changelog section

## Test 3: Read Document API

- [ ] Get task/story ID from database or UI
- [ ] Call `GET /api/tasks/{task-id}/doc`
- [ ] Verify returns markdown content
- [ ] Call with non-existent task ID
- [ ] Verify returns appropriate error (400 or 404)

## Test 4: Update Document API

### 4.1 Add API Spec Section
- [ ] Call `PATCH /api/tasks/{task-id}/doc` with:
  ```json
  {
    "section": "api_spec",
    "content": "POST /api/test\nRequest: { \"test\": true }"
  }
  ```
- [ ] Read doc file manually
- [ ] Verify `## API 规格` section added with content

### 4.2 Add Test Cases Section
- [ ] Call PATCH with section: "test_cases"
- [ ] Verify section added

### 4.3 Append to Changelog
- [ ] Call PATCH with section: "changelog", content: "- [2026-01-28] First update"
- [ ] Call PATCH again with: "- [2026-01-28] Second update"
- [ ] Verify both entries present in changelog (appended, not replaced)

## Test 5: Branch Selection

- [ ] Open Story Brainstorm page
- [ ] Verify all project repos shown with branch dropdowns
- [ ] Verify loading state while branches are fetched
- [ ] Change branch selection for a repo
- [ ] Create workspace
- [ ] Verify workspace created with selected branch (check database or workspace details)

## Test 6: Slugify Edge Cases

### 6.1 Special Characters
- [ ] Create Story with title: "Fix: Bug #123 [URGENT]"
- [ ] Verify doc path uses slug: "fix-bug-123-urgent"

### 6.2 Multiple Spaces and Dashes
- [ ] Create Story with title: "A   B---C"
- [ ] Verify slug: "a-b-c"

### 6.3 Non-ASCII Characters
- [ ] Create Story with Chinese title: "用户登录 API"
- [ ] Verify slug contains only ASCII: "api" (Chinese chars removed)

## Test 7: Error Handling

### 7.1 Non-existent Task
- [ ] Call GET /api/tasks/{random-uuid}/doc
- [ ] Verify appropriate error response

### 7.2 Missing Parent Story
- [ ] Try to create Task without parent_workspace_id
- [ ] Verify request fails with validation error

### 7.3 Missing Document File
- [ ] Create a Task (doc generated)
- [ ] Manually delete the doc file from filesystem
- [ ] Call GET /api/tasks/{task-id}/doc
- [ ] Verify error message indicates doc not found

## Test Results

| Test | Pass/Fail | Notes |
|------|-----------|-------|
| 1. Story Creation | | |
| 2. Task Creation | | |
| 3. Read API | | |
| 4. Update API | | |
| 5. Branch Selection | | |
| 6. Slugify Edge Cases | | |
| 7. Error Handling | | |

## Issues Found

_Document any issues discovered during testing here_

---

Last updated: 2026-01-28
