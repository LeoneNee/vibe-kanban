import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCompleteBrainstorm } from '../useCompleteBrainstorm';
import type { BrainstormCard } from '@/utils/extractJsonCards';
import { BaseCodingAgent } from 'shared/types';

// Mock sessionsApi - resolve immediately for testing
vi.mock('@/lib/api', () => ({
  sessionsApi: {
    followUp: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useEntries
vi.mock('@/contexts/EntriesContext', () => ({
  useEntries: vi.fn(() => ({
    entries: [{ id: 'initial-entry' }], // Start with one entry
  })),
}));

describe('useCompleteBrainstorm', () => {
  const mockCards: BrainstormCard[] = [
    {
      id: 'story-1',
      title: 'Test Story',
      description: 'Test description',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return complete function and loading state', () => {
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    expect(result.current.complete).toBeDefined();
    expect(result.current.isCompleting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should call sessionsApi.followUp with correct prompt', async () => {
    const { sessionsApi } = await import('@/lib/api');
    const { useEntries } = await import('@/contexts/EntriesContext');

    // Mock entries to return increasing length on subsequent calls
    let callCount = 0;
    (useEntries as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      entries: Array(++callCount).fill({ id: 'entry' }),
    }));

    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    await result.current.complete(mockCards, BaseCodingAgent.CLAUDE_CODE);

    expect(sessionsApi.followUp).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        prompt: expect.stringContaining('/story-doc-generator'),
        executor_profile_id: {
          executor: BaseCodingAgent.CLAUDE_CODE,
          variant: null,
        },
      })
    );
  });

  it('should handle errors from sessionsApi', async () => {
    const { sessionsApi } = await import('@/lib/api');
    (sessionsApi.followUp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('API error')
    );

    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    // Error will be thrown before waiting for entries
    await expect(
      result.current.complete(mockCards, BaseCodingAgent.CLAUDE_CODE)
    ).rejects.toThrow('API error');

    await waitFor(() => {
      expect(result.current.error).toBe('API error');
      expect(result.current.isCompleting).toBe(false);
    });
  });

  it('should not call API if sessionId is undefined', async () => {
    const { sessionsApi } = await import('@/lib/api');
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: undefined })
    );

    await expect(
      result.current.complete(mockCards, BaseCodingAgent.CLAUDE_CODE)
    ).rejects.toThrow('No session ID');

    expect(sessionsApi.followUp).not.toHaveBeenCalled();
  });
});
