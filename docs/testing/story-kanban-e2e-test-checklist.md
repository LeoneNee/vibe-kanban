# Story Kanban E2E Test Checklist

**Date**: 2026-01-26
**Feature**: Story Kanban (Two-level task management)
**Branch**: feature/story-kanban

## Test Environment

- Start dev server: `pnpm run dev`
- Frontend: http://localhost:5173 (or auto-assigned port)
- Backend: Check console for backend port

---

## Test Scenarios

### 1. Navigation Flow ✓/✗

**Test 1.1: Project → Stories Navigation**
- [ ] Open application
- [ ] Navigate to Projects page
- [ ] Click on a project card
- [ ] **Expected**: Navigate to `/projects/:id/stories`
- [ ] **Expected**: See Story kanban with 3 columns (Backlog, In Progress, Done)

**Test 1.2: Stories → Tasks Navigation**
- [ ] On Stories page, create a test Story (or use existing)
- [ ] Click on the Story card
- [ ] **Expected**: Navigate to `/projects/:id/stories/:storyId/tasks`
- [ ] **Expected**: See Task kanban with 5 columns

---

### 2. Story Management ✓/✗

**Test 2.1: Create Story**
- [ ] On Stories page, click "+" button in any column (Backlog/In Progress/Done)
- [ ] Enter Story title: "Test Story 1"
- [ ] Enter Story description: "This is a test story"
- [ ] Click "Create" or "Save"
- [ ] **Expected**: Story appears in the corresponding column
- [ ] **Expected**: Story card shows title and description

**Test 2.2: Story Drag and Drop**
- [ ] Drag a Story from Backlog column
- [ ] Drop it in In Progress column
- [ ] **Expected**: Story moves to In Progress column
- [ ] Drag Story from In Progress to Done
- [ ] **Expected**: Story moves to Done column
- [ ] Refresh page
- [ ] **Expected**: Story remains in Done column (state persisted)

**Test 2.3: Story Search**
- [ ] On Stories page, focus search input (or press `/`)
- [ ] Type partial Story title
- [ ] **Expected**: Stories list filtered to show matching results only
- [ ] Clear search
- [ ] **Expected**: All Stories visible again

---

### 3. Task Management Under Story ✓/✗

**Test 3.1: Create Task Under Story**
- [ ] Navigate to a Story's Task kanban (click Story card)
- [ ] Click "+" button in any column (Todo/In Progress/In Review/Done/Cancelled)
- [ ] Enter Task title: "Test Task 1"
- [ ] Enter Task description (optional)
- [ ] Click "Create"
- [ ] **Expected**: Task appears in the corresponding column
- [ ] **Expected**: Task is automatically linked to the parent Story

**Test 3.2: Verify Task Association**
- [ ] Create 2-3 Tasks under a Story
- [ ] Navigate back to Stories page (breadcrumb or back button)
- [ ] **Expected**: Story card shows child task count badge (e.g., "3 tasks")
- [ ] Click the Story again
- [ ] **Expected**: All created Tasks are visible in Task kanban

**Test 3.3: Task Drag and Drop**
- [ ] In Task kanban, drag a Task from Todo column
- [ ] Drop it in In Progress column
- [ ] **Expected**: Task moves to In Progress column
- [ ] Continue dragging through In Review → Done
- [ ] **Expected**: Task progresses through columns correctly
- [ ] Refresh page
- [ ] **Expected**: Task status persisted

---

### 4. Data Integrity ✓/✗

**Test 4.1: Story has task_type='story'**
- [ ] Open browser DevTools → Network tab
- [ ] Create a new Story
- [ ] Find the POST `/api/tasks` request
- [ ] Check request payload
- [ ] **Expected**: `task_type: "story"` present
- [ ] **Expected**: `parent_task_id: null` or not present

**Test 4.2: Task has task_type='task' and parent_task_id**
- [ ] Navigate to a Story's Task kanban
- [ ] Open browser DevTools → Network tab
- [ ] Create a new Task
- [ ] Find the POST `/api/tasks` request
- [ ] Check request payload
- [ ] **Expected**: `task_type: "task"` present
- [ ] **Expected**: `parent_task_id: <storyId>` present

**Test 4.3: API Filtering**
- [ ] Open browser DevTools → Network tab
- [ ] Navigate to Stories page
- [ ] Find GET `/api/projects/:id/tasks?task_type=story` request
- [ ] **Expected**: Response contains only Stories (task_type='story')
- [ ] Navigate to a Story's Tasks
- [ ] Find GET `/api/projects/:id/tasks?task_type=task&parent_task_id=:storyId` request
- [ ] **Expected**: Response contains only Tasks under that Story

---

### 5. UI/UX ✓/✗

**Test 5.1: Breadcrumb Navigation**
- [ ] Navigate to a Story's Task kanban
- [ ] **Expected**: Breadcrumb shows: `Story Title > Tasks` (or similar)
- [ ] Click on Story Title in breadcrumb
- [ ] **Expected**: Navigate back to Stories page

**Test 5.2: Empty States**
- [ ] Create a new project (or use empty project)
- [ ] Navigate to Stories page
- [ ] **Expected**: Empty state message: "No stories yet"
- [ ] **Expected**: "Create First Story" button visible
- [ ] Create a Story
- [ ] Click the Story to open Tasks
- [ ] **Expected**: Empty state for Tasks

**Test 5.3: Child Task Count Badge**
- [ ] On Stories page, locate a Story with 0 tasks
- [ ] **Expected**: No badge visible (or "0 tasks" not shown)
- [ ] Navigate to that Story and create 1 Task
- [ ] Go back to Stories page
- [ ] **Expected**: Badge shows "1 task" (singular)
- [ ] Create 2 more Tasks (total 3)
- [ ] Go back to Stories page
- [ ] **Expected**: Badge shows "3 tasks" (plural)

**Test 5.4: Responsive Layout**
- [ ] Resize browser window to mobile width (<768px)
- [ ] **Expected**: Kanban columns stack or scroll horizontally
- [ ] **Expected**: Cards remain readable
- [ ] Resize to desktop width
- [ ] **Expected**: All 3 Story columns visible side by side

---

### 6. Edge Cases ✓/✗

**Test 6.1: Delete Story with Tasks**
- [ ] Create a Story
- [ ] Add 2 Tasks under it
- [ ] Delete the Story (if delete function exists)
- [ ] **Expected**: Confirm orphaned Tasks are handled (deleted or error prevented)

**Test 6.2: Concurrent Edits**
- [ ] Open same project in two browser tabs
- [ ] In Tab 1: Move a Story to In Progress
- [ ] In Tab 2: Refresh page
- [ ] **Expected**: Story in In Progress column in Tab 2

**Test 6.3: Long Titles**
- [ ] Create Story with very long title (100+ characters)
- [ ] **Expected**: Title truncates gracefully in card
- [ ] **Expected**: Full title visible in detail view/hover

**Test 6.4: Special Characters**
- [ ] Create Story with title: `Test & <Story> "Quotes" 'Single'`
- [ ] **Expected**: Characters render correctly (no XSS)
- [ ] Create Task with emoji: `🚀 Deploy Feature`
- [ ] **Expected**: Emoji displays correctly

---

### 7. Error Handling ✓/✗

**Test 7.1: Network Error**
- [ ] Stop backend server (Ctrl+C)
- [ ] Try to create a Story
- [ ] **Expected**: Error message displayed
- [ ] **Expected**: No crash or blank screen

**Test 7.2: Invalid Navigation**
- [ ] Manually navigate to `/projects/invalid-id/stories`
- [ ] **Expected**: Error message or redirect to valid page

**Test 7.3: Missing Data**
- [ ] Navigate to `/projects/:id/stories/:invalidStoryId/tasks`
- [ ] **Expected**: Error message: "Story not found" or similar

---

## Test Results Summary

**Date Tested**: ___________
**Tester**: ___________
**Pass Rate**: ___ / ___ tests

### Critical Issues Found
1.
2.
3.

### Minor Issues Found
1.
2.
3.

### Notes
-
-
-

---

## Sign-off

- [ ] All critical scenarios pass
- [ ] All edge cases handled gracefully
- [ ] UI/UX meets requirements
- [ ] Data integrity verified
- [ ] Ready for merge

**Approved by**: ___________
**Date**: ___________
