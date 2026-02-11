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
