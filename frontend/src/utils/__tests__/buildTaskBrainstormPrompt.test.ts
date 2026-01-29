import { describe, it, expect } from 'vitest';
import { buildTaskBrainstormPrompt } from '../buildTaskBrainstormPrompt';

describe('buildTaskBrainstormPrompt', () => {
  it('should include /brainstorming skill reference', () => {
    const prompt = buildTaskBrainstormPrompt('Test Task', 'Some description');
    expect(prompt).toContain('/brainstorming');
  });

  it('should include task title', () => {
    const prompt = buildTaskBrainstormPrompt('My Task Title', 'desc');
    expect(prompt).toContain('My Task Title');
  });

  it('should include task description when provided', () => {
    const prompt = buildTaskBrainstormPrompt('Title', 'Task description here');
    expect(prompt).toContain('Task description here');
  });

  it('should handle empty description', () => {
    const prompt = buildTaskBrainstormPrompt('Title', '');
    expect(prompt).toContain('Title');
    expect(prompt).not.toContain('undefined');
  });
});
