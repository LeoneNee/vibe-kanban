import { describe, it, expect } from 'vitest';
import { hasAllTasksGenerated } from '../checkBrainstormComplete';
import type { BrainstormCard } from '../extractJsonCards';

describe('hasAllTasksGenerated', () => {
  it('should return false for empty array', () => {
    expect(hasAllTasksGenerated([])).toBe(false);
  });

  it('should return false if any card has no tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
      {
        title: 'Story 2',
        // No tasks
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(false);
  });

  it('should return false if any card has empty tasks array', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
      {
        title: 'Story 2',
        tasks: [],
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(false);
  });

  it('should return true if all cards have at least one task', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
      {
        title: 'Story 2',
        tasks: [
          { title: 'Task 2', description: 'Desc 2' },
          { title: 'Task 3', description: 'Desc 3' },
        ],
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(true);
  });

  it('should return false for single card without tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(false);
  });

  it('should return true for single card with tasks', () => {
    const cards: BrainstormCard[] = [
      {
        title: 'Story 1',
        tasks: [{ title: 'Task 1', description: 'Desc 1' }],
      },
    ];

    expect(hasAllTasksGenerated(cards)).toBe(true);
  });
});
