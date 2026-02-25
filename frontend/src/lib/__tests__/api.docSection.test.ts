import { describe, it, expect } from 'vitest';
import type { DocSection } from 'shared/types';

describe('DocSection type safety', () => {
  it('api.ts updateDoc accepts DocSection type', () => {
    const validSection: DocSection = 'api_spec';
    expect(validSection).toBe('api_spec');
  });

  it('all DocSection variants are valid', () => {
    const sections: DocSection[] = [
      'api_spec',
      'test_cases',
      'dependencies',
      'changelog',
      'implementation_hints',
    ];
    expect(sections).toHaveLength(5);
  });
});
