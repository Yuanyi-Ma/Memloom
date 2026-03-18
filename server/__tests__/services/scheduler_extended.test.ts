import { describe, it, expect } from 'vitest';
import {
  calculateNextSchedule,
  isMastered,
  ScheduleState,
  INITIAL_EF,
} from '../../services/scheduler';

describe('SM-2 Scheduler - 边界条件补充', () => {
  function makeInitial(overrides?: Partial<ScheduleState>): ScheduleState {
    return {
      ef: INITIAL_EF,
      interval_days: 1,
      review_count: 0,
      consecutive_correct: 0,
      ...overrides,
    };
  }

  it('跨年日期（12 月 → 次年 1 月）', () => {
    const state = makeInitial({ interval_days: 10, ef: 2.5 });
    // interval = floor(10 * 2.6) = 26
    const result = calculateNextSchedule(state, '会', '2025-12-20');
    // 2025-12-20 + 26 天 = 2026-01-15
    expect(result.next_review_date).toBe('2026-01-15');
  });

  it('闰年 2 月 28 日 + 1 天 → 2 月 29 日', () => {
    // 2028 年是闰年
    const state = makeInitial({ interval_days: 1, ef: 2.5 });
    // interval = floor(1 * 2.6) = 2
    const result = calculateNextSchedule(state, '会', '2028-02-27');
    expect(result.next_review_date).toBe('2028-02-29');
  });

  it('非闰年 2 月 28 日 + 1 天 → 3 月 1 日', () => {
    const state = makeInitial();
    // interval = floor(1 * 2.6) = 2
    const result = calculateNextSchedule(state, '会', '2027-02-27');
    expect(result.next_review_date).toBe('2027-03-01');
  });

  it('interval_days 为 0 时被 max(1, ...) 保护', () => {
    // ef 接近最小值时，floor(0 * ef) = 0，应被 max(1, ...) 保护
    const state = makeInitial({ interval_days: 0, ef: 1.3 });
    const result = calculateNextSchedule(state, '会', '2026-03-12');
    expect(result.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('EF 在 "模糊" 后再 "会" 的完整序列', () => {
    let state = makeInitial();
    // 评模糊: ef = 2.35, interval = 2
    state = calculateNextSchedule(state, '模糊', '2026-03-12');
    expect(state.ef).toBe(2.35);
    expect(state.consecutive_correct).toBe(0);

    // 评会: ef = 2.45, interval = max(1, floor(2 * 2.45)) = 4
    state = calculateNextSchedule(state, '会', '2026-03-14');
    expect(state.ef).toBe(2.45);
    expect(state.consecutive_correct).toBe(1);
    expect(state.interval_days).toBe(4);
  });

  it('极端：EF 从最低值连续评 "会" 恢复', () => {
    let state = makeInitial({ ef: 1.3, interval_days: 1 });
    // 连续 5 次会
    for (let i = 0; i < 5; i++) {
      state = calculateNextSchedule(state, '会', '2026-03-12');
    }
    expect(state.ef).toBe(1.8); // 1.3 + 0.1 * 5
    expect(state.consecutive_correct).toBe(5);
  });

  it('交替评分序列', () => {
    let state = makeInitial();
    // 会 → 不会 → 会 → 模糊 → 会
    state = calculateNextSchedule(state, '会', '2026-03-12');
    expect(state.consecutive_correct).toBe(1);
    
    state = calculateNextSchedule(state, '不会', '2026-03-12');
    expect(state.consecutive_correct).toBe(0);
    
    state = calculateNextSchedule(state, '会', '2026-03-12');
    expect(state.consecutive_correct).toBe(1);
    
    state = calculateNextSchedule(state, '模糊', '2026-03-12');
    expect(state.consecutive_correct).toBe(0);
    
    state = calculateNextSchedule(state, '会', '2026-03-12');
    expect(state.consecutive_correct).toBe(1);
    
    // review_count 应该是 5
    expect(state.review_count).toBe(5);
  });

  it('isMastered 边界值 = MASTERED_THRESHOLD', () => {
    expect(isMastered(3)).toBe(true);
    expect(isMastered(2)).toBe(false);
  });
});
