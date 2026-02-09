# Navigation Context Preservation - QA Checklist

**Date:** 2026-02-09
**Feature:** Story context preservation in navigation
**Related Plan:** `docs/plans/2026-02-09-navigation-context-preservation-fix.md`

## Setup

Before testing, start the development server in QA mode:

```bash
pnpm run dev:qa
```

## Test Scenarios

### ✅ Scenario 1: Story → Task → Attempt Navigation

**Objective:** Verify story context is maintained throughout navigation

**Steps:**
1. Navigate to Projects page
2. Click on a project
3. Click on a story card
4. **Verify:** URL is `/projects/{projectId}/stories/{storyId}/tasks`
5. Click on a task card
6. **Verify:** URL is `/projects/{projectId}/stories/{storyId}/tasks/{taskId}`
7. **Verify:** Breadcrumb shows: `{Story Title} > {Task Title}`
8. Click on an attempt in the list (if exists)
9. **Verify:** URL is `/projects/{projectId}/stories/{storyId}/tasks/{taskId}/attempts/{attemptId}`
10. **Verify:** Breadcrumb shows: `{Story Title} > {Task Title} > {Branch Name}`
11. Click story name in breadcrumb
12. **Verify:** Returns to `/projects/{projectId}/stories/{storyId}/tasks`
13. Press browser back button multiple times
14. **Verify:** Navigates through story-contextual URLs

**Expected Results:**
- [ ] All URLs contain `/stories/{storyId}` segment
- [ ] Story name visible in breadcrumb
- [ ] Story name is clickable and navigates back to story tasks
- [ ] Browser back/forward works correctly
- [ ] No loss of story context at any step

---

### ✅ Scenario 2: Task Creation Under Story

**Objective:** Verify newly created tasks are properly linked to story

**Steps:**
1. Navigate to a story's tasks page
2. Click "Create Task" button
3. Fill in task details:
   - Title: "Test Task for Story Context"
   - Description: "Testing parent_task_id assignment"
4. Click "Create" button
5. **Verify:** New task appears in story's task list
6. Click on the new task
7. **Verify:** Task details show correct story context
8. **Verify:** URL contains `/stories/{storyId}`
9. Open browser dev tools → Network tab
10. Refresh page and check the task API response
11. **Verify:** `parent_task_id` field equals the story ID
12. **Verify:** `parent_workspace_id` is `null`

**Expected Results:**
- [ ] Task created successfully
- [ ] Task appears in story's task list
- [ ] Task has correct `parent_task_id` value
- [ ] Navigation maintains story context
- [ ] API response shows correct parent assignment

---

### ✅ Scenario 3: Workflow Button - Brainstorm (Opt-In)

**Objective:** Verify brainstorm navigation is opt-in, not automatic

**Steps:**
1. Create a new task under a story
2. Click on the newly created task
3. **Verify:** Task panel opens (no automatic navigation)
4. **Verify:** "Start Brainstorm" button is visible in workflow section
5. **Verify:** Text shows "下一步: Start Brainstorm"
6. Wait 5 seconds
7. **Verify:** Still on task detail page (no auto-navigation)
8. Click "Start Brainstorm" button
9. **Verify:** Navigates to brainstorm page
10. **Verify:** URL is `/projects/{projectId}/stories/{storyId}/tasks/{taskId}/brainstorm`

**Expected Results:**
- [ ] No automatic navigation to brainstorm
- [ ] Workflow button shows "Start Brainstorm"
- [ ] Button click navigates to brainstorm page
- [ ] User has control over when to start brainstorming

---

### ✅ Scenario 4: Regular Tasks (Without Story Context)

**Objective:** Verify navigation works correctly for tasks not under stories

**Steps:**
1. Navigate to "All Tasks" view (not story-specific)
2. Click on a task that has no `parent_task_id`
3. **Verify:** URL is `/projects/{projectId}/tasks/{taskId}` (no `/stories/` segment)
4. **Verify:** Breadcrumb shows only: `{Task Title}`
5. Click on an attempt
6. **Verify:** URL is `/projects/{projectId}/tasks/{taskId}/attempts/{attemptId}`
7. **Verify:** No story name in breadcrumb

**Expected Results:**
- [ ] URLs do NOT contain `/stories/` segment
- [ ] Breadcrumb does NOT show story name
- [ ] Navigation works correctly without story context
- [ ] No errors in console

---

### ✅ Scenario 5: Breadcrumb Navigation

**Objective:** Verify breadcrumb links work correctly

**Steps:**
1. Navigate to: `/projects/{projectId}/stories/{storyId}/tasks/{taskId}/attempts/{attemptId}`
2. **Verify:** Breadcrumb shows: `{Story Title} > {Task Title} > {Branch}`
3. Click on story title in breadcrumb
4. **Verify:** Navigates to `/projects/{projectId}/stories/{storyId}/tasks`
5. Navigate back to attempt (browser back or click through)
6. Click on task title in breadcrumb
7. **Verify:** Navigates to `/projects/{projectId}/stories/{storyId}/tasks/{taskId}`

**Expected Results:**
- [ ] Story title link works
- [ ] Task title link works
- [ ] Correct URLs after clicking breadcrumb links
- [ ] Breadcrumb hierarchy is correct

---

### ✅ Scenario 6: Edge Cases

**Objective:** Test edge cases and error handling

**Steps:**

**6.1 Deep Linking**
1. Manually enter URL: `/projects/{projectId}/stories/{storyId}/tasks/{taskId}`
2. **Verify:** Page loads correctly
3. **Verify:** Breadcrumb shows story name

**6.2 Invalid Story ID**
1. Manually enter URL with invalid story ID
2. **Verify:** Graceful error handling (no crash)

**6.3 Task with Missing Parent Story**
1. If a task references a deleted story
2. **Verify:** Application handles gracefully

**6.4 Multiple Browser Tabs**
1. Open same task in two tabs
2. Navigate in both tabs
3. **Verify:** No interference between tabs
4. **Verify:** URLs remain correct in both

**Expected Results:**
- [ ] Deep linking works
- [ ] Invalid IDs handled gracefully
- [ ] No crashes or console errors
- [ ] Multi-tab navigation works correctly

---

## Test Results Summary

**Tester:**
**Date:**
**Browser:** Chrome / Firefox / Safari
**OS:** macOS / Windows / Linux

| Scenario | Status | Notes |
|----------|--------|-------|
| 1. Story → Task → Attempt | ⬜ Pass / ❌ Fail | |
| 2. Task Creation | ⬜ Pass / ❌ Fail | |
| 3. Workflow Button | ⬜ Pass / ❌ Fail | |
| 4. Regular Tasks | ⬜ Pass / ❌ Fail | |
| 5. Breadcrumb Navigation | ⬜ Pass / ❌ Fail | |
| 6. Edge Cases | ⬜ Pass / ❌ Fail | |

**Overall Status:** ⬜ Pass / ❌ Fail

---

## Issues Found

If any issues are found during testing, document them here:

### Issue 1
- **Scenario:**
- **Steps to Reproduce:**
- **Expected:**
- **Actual:**
- **Severity:** Critical / High / Medium / Low

### Issue 2
- **Scenario:**
- **Steps to Reproduce:**
- **Expected:**
- **Actual:**
- **Severity:** Critical / High / Medium / Low

---

## Notes

Any additional observations or comments:

---

## Sign-Off

- [ ] All scenarios tested and passed
- [ ] No critical or high severity issues found
- [ ] Ready for production deployment

**Tested By:**
**Date:**
**Signature:**
