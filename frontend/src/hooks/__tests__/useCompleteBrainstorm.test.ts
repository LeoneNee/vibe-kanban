import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCompleteBrainstorm } from '../useCompleteBrainstorm';
import type { BrainstormCard } from '@/utils/extractJsonCards';

// Mock sessionsApi
vi.mock('@/lib/api', () => ({
  sessionsApi: {
    followUp: vi.fn(),
  },
}));

// Mock useEntries
vi.mock('@/contexts/EntriesContext', () => ({
  useEntries: vi.fn(() => ({
    entries: [],
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
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    await result.current.complete(mockCards, 'claude_code');

    expect(sessionsApi.followUp).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        prompt: expect.stringContaining('/story-doc-generator'),
        executor_profile_id: {
          executor: 'claude_code',
          variant: null,
        },
      })
    );
  });

  it('should reset loading state after completion', async () => {
    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    expect(result.current.isCompleting).toBe(false);

    await result.current.complete(mockCards, 'claude_code');

    await waitFor(() => {
      expect(result.current.isCompleting).toBe(false);
    });
  });

  it('should handle errors from sessionsApi', async () => {
    const { sessionsApi } = await import('@/lib/api');
    (sessionsApi.followUp as any).mockRejectedValueOnce(
      new Error('API error')
    );

    const { result } = renderHook(() =>
      useCompleteBrainstorm({ sessionId: 'test-session' })
    );

    await expect(
      result.current.complete(mockCards, 'claude_code')
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
      result.current.complete(mockCards, 'claude_code')
    ).rejects.toThrow('No session ID');

    expect(sessionsApi.followUp).not.toHaveBeenCalled();
  });
});
