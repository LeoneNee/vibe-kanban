# Fix SaveBrainstormResultButton TypeScript Errors — TDD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 TypeScript compilation errors in `SaveBrainstormResultButton.tsx` caused by using `UnifiedLogEntry` type instead of `PatchTypeWithKey` type.

**Architecture:** The `extractMarkdownContent` function incorrectly declares its parameter as `UnifiedLogEntry[]`, but the actual data source (`useEntries()` from `EntriesContext`) provides `PatchTypeWithKey[]`. These are fundamentally different types with different field names. The fix is to: (1) export `extractMarkdownContent` as a testable pure function, (2) change its parameter type to `PatchTypeWithKey[]`, (3) fix all property access paths to match `PatchType` / `NormalizedEntry` structure.

**Tech Stack:** TypeScript, React, Vitest, shared types (`PatchType`, `NormalizedEntry`, `NormalizedEntryType`)

---

## Background: Type Structure Reference

Before starting, understand these types from `shared/types.ts`:

```typescript
// PatchType — discriminated union by "type" field
type PatchType =
  | { type: "NORMALIZED_ENTRY"; content: NormalizedEntry }
  | { type: "STDOUT"; content: string }
  | { type: "STDERR"; content: string }
  | { type: "DIFF"; content: Diff };

// PatchTypeWithKey — PatchType + extra keys
type PatchTypeWithKey = PatchType & {
  patchKey: string;
  executionProcessId: string;
};

// NormalizedEntry
type NormalizedEntry = {
  timestamp: string | null;
  entry_type: NormalizedEntryType;
  content: string;
};

// NormalizedEntryType — discriminated union by "type" field
type NormalizedEntryType =
  | { type: "user_message" }
  | { type: "assistant_message" }
  | { type: "tool_use"; tool_name: string; ... }
  | ... // others
```

**Property access mapping (old → new):**

| Old (broken) | New (correct) | Why |
|---|---|---|
| `entry.type` | `entry.type` | Same — `PatchType` discriminant field |
| `entry.data` | Does not exist | `UnifiedLogEntry` never had `.data` either |
| `entry.data.type` | `entry.content.entry_type.type` | `NormalizedEntry.entry_type.type` |
| `entry.data.content` | `entry.content.content` | `NormalizedEntry.content` |

---

## Task 1: Create test file with test cases for `extractMarkdownContent`

**Files:**
- Create: `frontend/src/components/workspace/__tests__/extractMarkdownContent.test.ts`

**Step 1: Write all failing tests**

Create the test file with the following content:

```typescript
import { describe, it, expect } from 'vitest';
import { extractMarkdownContent } from '../SaveBrainstormResultButton';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory/types';

// Helper to build a NORMALIZED_ENTRY with assistant_message
function makeAssistantEntry(content: string, patchKey = 'k1'): PatchTypeWithKey {
  return {
    type: 'NORMALIZED_ENTRY',
    content: {
      timestamp: null,
      entry_type: { type: 'assistant_message' },
      content,
    },
    patchKey,
    executionProcessId: 'proc-1',
  };
}

// Helper to build a NORMALIZED_ENTRY with user_message
function makeUserEntry(content: string, patchKey = 'k2'): PatchTypeWithKey {
  return {
    type: 'NORMALIZED_ENTRY',
    content: {
      timestamp: null,
      entry_type: { type: 'user_message' },
      content,
    },
    patchKey,
    executionProcessId: 'proc-1',
  };
}

// Helper to build a STDOUT entry
function makeStdoutEntry(content: string, patchKey = 'k3'): PatchTypeWithKey {
  return {
    type: 'STDOUT',
    content,
    patchKey,
    executionProcessId: 'proc-1',
  };
}

describe('extractMarkdownContent', () => {
  it('returns null for empty array', () => {
    expect(extractMarkdownContent([])).toBeNull();
  });

  it('returns null when only STDOUT entries exist', () => {
    const entries = [makeStdoutEntry('hello'), makeStdoutEntry('world')];
    expect(extractMarkdownContent(entries)).toBeNull();
  });

  it('returns null when only user_message entries exist', () => {
    const entries = [makeUserEntry('## 需求细节\nsome content')];
    expect(extractMarkdownContent(entries)).toBeNull();
  });

  it('extracts content from markdown code block', () => {
    const md = '# Title\n\nSome body text';
    const content = `Here is the result:\n\`\`\`markdown\n${md}\n\`\`\`\nDone.`;
    const entries = [makeAssistantEntry(content)];
    expect(extractMarkdownContent(entries)).toBe(md);
  });

  it('extracts content starting from section header (## 需求细节)', () => {
    const content = '好的，以下是分析结果：\n\n## 需求细节\n\n- 功能A\n- 功能B';
    const entries = [makeAssistantEntry(content)];
    expect(extractMarkdownContent(entries)).toBe('## 需求细节\n\n- 功能A\n- 功能B');
  });

  it('extracts content starting from english section header (## Implementation Details)', () => {
    const content = 'Analysis:\n\n## Implementation Details\n\n- Step 1\n- Step 2';
    const entries = [makeAssistantEntry(content)];
    expect(extractMarkdownContent(entries)).toBe('## Implementation Details\n\n- Step 1\n- Step 2');
  });

  it('falls back to first ## heading for long content with lists', () => {
    const longPrefix = 'A'.repeat(201);
    const content = `${longPrefix}\n- item\n\n## Custom Section\n\nDetails here`;
    const entries = [makeAssistantEntry(content)];
    expect(extractMarkdownContent(entries)).toBe('## Custom Section\n\nDetails here');
  });

  it('returns null for short assistant_message without matching patterns', () => {
    const content = 'Just a short response without headers.';
    const entries = [makeAssistantEntry(content)];
    expect(extractMarkdownContent(entries)).toBeNull();
  });

  it('searches from the end of entries array (last assistant_message wins)', () => {
    const entries = [
      makeAssistantEntry('## 需求细节\n\nOld content'),
      makeUserEntry('请更新'),
      makeAssistantEntry('## 需求细节\n\nNew content'),
    ];
    expect(extractMarkdownContent(entries)).toBe('## 需求细节\n\nNew content');
  });

  it('markdown code block takes priority over section headers', () => {
    const md = '# Extracted';
    const content = `\`\`\`markdown\n${md}\n\`\`\`\n\n## 需求细节\n\nShould not match`;
    const entries = [makeAssistantEntry(content)];
    expect(extractMarkdownContent(entries)).toBe(md);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/workspace/__tests__/extractMarkdownContent.test.ts`

Expected: FAIL — `extractMarkdownContent` is not exported from `SaveBrainstormResultButton`.

---

## Task 2: Export `extractMarkdownContent` from source file (minimal change to make import work)

**Files:**
- Modify: `frontend/src/components/workspace/SaveBrainstormResultButton.tsx:14`

**Step 1: Add `export` keyword to the function**

Change line 14 from:

```typescript
function extractMarkdownContent(entries: UnifiedLogEntry[]): string | null {
```

to:

```typescript
export function extractMarkdownContent(entries: UnifiedLogEntry[]): string | null {
```

**Step 2: Run tests to confirm they still fail (but now with type errors, not import errors)**

Run: `cd frontend && npx vitest run src/components/workspace/__tests__/extractMarkdownContent.test.ts`

Expected: FAIL — type errors because tests pass `PatchTypeWithKey[]` but function expects `UnifiedLogEntry[]`.

---

## Task 3: Fix the function signature and property access paths

**Files:**
- Modify: `frontend/src/components/workspace/SaveBrainstormResultButton.tsx:1-59`

**Step 1: Fix the imports — replace `UnifiedLogEntry` with `PatchTypeWithKey`**

Replace line 8:

```typescript
import type { UnifiedLogEntry } from '@/types/logs';
```

with:

```typescript
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory/types';
import type { NormalizedEntry } from 'shared/types';
```

**Step 2: Fix the function signature**

Replace line 14:

```typescript
export function extractMarkdownContent(entries: UnifiedLogEntry[]): string | null {
```

with:

```typescript
export function extractMarkdownContent(entries: PatchTypeWithKey[]): string | null {
```

**Step 3: Fix the property access paths inside the function**

Replace lines 18-23:

```typescript
    if (
      entry?.type === 'NORMALIZED_ENTRY' &&
      entry?.data?.type === 'assistant_message'
    ) {
      const content = entry.data.content;
      if (typeof content !== 'string') continue;
```

with:

```typescript
    if (entry?.type === 'NORMALIZED_ENTRY') {
      const normalized = entry.content as NormalizedEntry;
      if (normalized.entry_type.type !== 'assistant_message') continue;
      const content = normalized.content;
```

Note: The `as NormalizedEntry` cast is safe here because TypeScript narrows `entry.type === 'NORMALIZED_ENTRY'` to `{ type: "NORMALIZED_ENTRY"; content: NormalizedEntry }`, so `entry.content` is already `NormalizedEntry`. The cast is explicit documentation. The `typeof content !== 'string'` check is removed because `NormalizedEntry.content` is always `string` per the type definition.

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/workspace/__tests__/extractMarkdownContent.test.ts`

Expected: ALL PASS (10 tests).

**Step 5: Run full TypeScript check to confirm all 4 errors are gone**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "SaveBrainstormResultButton"`

Expected: `0` (no errors mentioning this file).

**Step 6: Commit**

```bash
git add frontend/src/components/workspace/SaveBrainstormResultButton.tsx frontend/src/components/workspace/__tests__/extractMarkdownContent.test.ts
git commit -m "fix(frontend): fix SaveBrainstormResultButton TypeScript errors

Replace incorrect UnifiedLogEntry type with PatchTypeWithKey.
Fix property access paths: entry.data → entry.content,
entry.data.type → entry.content.entry_type.type,
entry.data.content → entry.content.content.

Add comprehensive unit tests for extractMarkdownContent function."
```

---

## Task 4: Run full project checks to confirm no regressions

**Files:** None (verification only)

**Step 1: Run full frontend type check**

Run: `pnpm run check`

Expected: No errors (or at least no NEW errors related to this change).

**Step 2: Run all frontend tests**

Run: `cd frontend && npx vitest run`

Expected: All tests pass.

**Step 3: Confirm no other files import `extractMarkdownContent`**

Run: `grep -r "extractMarkdownContent" frontend/src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "SaveBrainstormResultButton.tsx"`

Expected: No output (only used internally + test file).

---

## Error-to-Fix Traceability

| Error | Line | Fix Location | Fix Description |
|---|---|---|---|
| TS2339: Property 'type' does not exist on `UnifiedLogEntry` | 19 | Task 3 Step 2 | Change param type to `PatchTypeWithKey[]` — `.type` is valid on `PatchType` |
| TS2339: Property 'data' does not exist on `UnifiedLogEntry` | 20 | Task 3 Step 3 | Replace `.data.type` with `.content.entry_type.type` |
| TS2339: Property 'data' does not exist on `UnifiedLogEntry` | 22 | Task 3 Step 3 | Replace `.data.content` with `.content.content` |
| TS2345: `PatchTypeWithKey[]` not assignable to `UnifiedLogEntry[]` | 75 | Task 3 Step 2 | Function now accepts `PatchTypeWithKey[]` — call site matches |
