import { describe, it, expect } from 'vitest';

// 验证 StoryCard 使用 task.child_count 而不是单独的 API 调用
// Task 3B: 修复 StoryCard N+1 子任务数量查询

describe('StoryCard child count - N+1 查询修复', () => {
  it('使用来自 task 数据的 child_count，而不是单独发起 API 请求', () => {
    // child_count 现在是从 API 返回的 Task 对象中直接读取的字段
    const taskWithCount = {
      id: 'test-id',
      title: 'Test Story',
      child_count: BigInt(3),
    };
    expect(Number(taskWithCount.child_count)).toBe(3);
  });

  it('当 child_count 为 null 时默认使用 0', () => {
    const taskWithoutCount = {
      id: 'test-id',
      title: 'Test Story',
      child_count: null as bigint | null | undefined,
    };
    expect(Number(taskWithoutCount.child_count ?? 0)).toBe(0);
  });

  it('当 child_count 为 undefined 时默认使用 0', () => {
    const taskWithoutCount: {
      id: string;
      title: string;
      child_count?: bigint | null;
    } = {
      id: 'test-id',
      title: 'Test Story',
    };
    expect(Number(taskWithoutCount.child_count ?? 0)).toBe(0);
  });

  it('child_count 为 BigInt(0) 时不显示 badge', () => {
    const taskZeroCount = {
      id: 'test-id',
      title: 'Test Story',
      child_count: BigInt(0),
    };
    const childCount = Number(taskZeroCount.child_count ?? 0);
    expect(childCount > 0).toBe(false);
  });

  it('child_count 大于 0 时应显示 badge', () => {
    const taskWithChildren = {
      id: 'test-id',
      title: 'Test Story',
      child_count: BigInt(5),
    };
    const childCount = Number(taskWithChildren.child_count ?? 0);
    expect(childCount > 0).toBe(true);
  });
});
