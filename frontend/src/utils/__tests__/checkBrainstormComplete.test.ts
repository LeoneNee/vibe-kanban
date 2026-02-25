import { describe, it, expect } from 'vitest';
import { isBrainstormFullyComplete } from '../checkBrainstormComplete';
import type { BrainstormCard } from '../extractJsonCards';

describe('isBrainstormFullyComplete', () => {
  it('should return false for empty array', () => {
    expect(isBrainstormFullyComplete([])).toBe(false);
  });

  it('should return false if card has tasks but no doc_content', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1' }],
      },
    ];
    expect(isBrainstormFullyComplete(cards)).toBe(false);
  });

  it('should return false if card has doc_content but no tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        doc_content: '# Story doc',
      },
    ];
    expect(isBrainstormFullyComplete(cards)).toBe(false);
  });

  it('should return false if doc_content is empty string', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        doc_content: '',
        tasks: [{ title: 'Task 1' }],
      },
    ];
    expect(isBrainstormFullyComplete(cards)).toBe(false);
  });

  it('should return false if doc_content is whitespace only', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        doc_content: '   \n  ',
        tasks: [{ title: 'Task 1' }],
      },
    ];
    expect(isBrainstormFullyComplete(cards)).toBe(false);
  });

  it('should return true when all cards have doc_content and tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        doc_content: '# Story 1\n## Description',
        tasks: [{ title: 'Task 1' }],
      },
      {
        title: 'Story 2',
        doc_content: '# Story 2\n## Description',
        tasks: [{ title: 'Task 2' }, { title: 'Task 3' }],
      },
    ];
    expect(isBrainstormFullyComplete(cards)).toBe(true);
  });

  it('should return false if any card is incomplete (mixed)', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        doc_content: '# Complete story',
        tasks: [{ title: 'Task 1' }],
      },
      {
        title: 'Story 2',
        // Missing doc_content
        tasks: [{ title: 'Task 2' }],
      },
    ];
    expect(isBrainstormFullyComplete(cards)).toBe(false);
  });

  it('should return false if tasks is empty array', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        doc_content: '# Story doc',
        tasks: [],
      },
    ];
    expect(isBrainstormFullyComplete(cards)).toBe(false);
  });
});
