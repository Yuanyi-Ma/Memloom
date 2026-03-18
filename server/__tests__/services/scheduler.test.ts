import { describe, it, expect } from 'vitest';
import {
  calculateNextSchedule,
  isMastered,
  ScheduleState,
  Rating,
  INITIAL_EF,
  MIN_EF,
  MAX_EF,
  MASTERED_THRESHOLD,
} from '../../services/scheduler';

describe('SM-2 Scheduler', () => {
  // --- 常量验证 ---
  describe('Constants', () => {
    it('INITIAL_EF should be 2.5', () => {
      expect(INITIAL_EF).toBe(2.5);
    });

    it('MIN_EF should be 1.3', () => {
      expect(MIN_EF).toBe(1.3);
    });

    it('MAX_EF should be 3.0', () => {
      expect(MAX_EF).toBe(3.0);
    });

    it('MASTERED_THRESHOLD should be 3', () => {
      expect(MASTERED_THRESHOLD).toBe(3);
    });
  });

  // --- isMastered ---
  describe('isMastered', () => {
    it('consecutive_correct >= 3 → true', () => {
      expect(isMastered(3)).toBe(true);
      expect(isMastered(5)).toBe(true);
    });

    it('consecutive_correct < 3 → false', () => {
      expect(isMastered(2)).toBe(false);
      expect(isMastered(0)).toBe(false);
    });
  });

  // --- calculateNextSchedule ---
  describe('calculateNextSchedule', () => {
    const today = '2026-03-12';

    // 辅助：创建默认初始状态
    function makeInitial(overrides?: Partial<ScheduleState>): ScheduleState {
      return {
        ef: INITIAL_EF,
        interval_days: 1,
        review_count: 0,
        consecutive_correct: 0,
        ...overrides,
      };
    }

    // ---- 评 "会" 相关 ----
    it('首次复习评"会" → interval = max(1, floor(1 * 2.6)) = 2, ef = 2.6', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '会', today);

      expect(result.ef).toBe(2.6);
      expect(result.interval_days).toBe(2); // floor(1 * 2.6) = 2
      expect(result.consecutive_correct).toBe(1);
      expect(result.review_count).toBe(1);
      expect(result.next_review_date).toBe('2026-03-14');
    });

    it('连续 3 次"会" → EF 每次 +0.1', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today); // ef=2.6
      state = calculateNextSchedule(state, '会', today); // ef=2.7
      const result = calculateNextSchedule(state, '会', today); // ef=2.8

      expect(result.ef).toBe(2.8);
      expect(result.consecutive_correct).toBe(3);
      expect(result.review_count).toBe(3);
    });

    it('高 EF 评"会"后 EF 受 MAX_EF 约束', () => {
      const state = makeInitial({ ef: 3.0, interval_days: 10 });
      const result = calculateNextSchedule(state, '会', today);

      expect(result.ef).toBe(3.0); // 已在上限，不再增长
      expect(result.interval_days).toBe(30); // floor(10 * 3.0)
    });

    it('首次复习（全默认值）评"会" → 验证完整输出', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '会', today);

      expect(result).toEqual({
        ef: 2.6,
        interval_days: 2,
        next_review_date: '2026-03-14',
        review_count: 1,
        consecutive_correct: 1,
      });
    });

    // ---- 评 "模糊" 相关 ----
    it('评"模糊" → interval 固定 2，EF 下降 0.15', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '模糊', today);

      expect(result.ef).toBe(2.35); // 2.5 - 0.15
      expect(result.interval_days).toBe(2);
      expect(result.consecutive_correct).toBe(0);
      expect(result.next_review_date).toBe('2026-03-14');
    });

    it('连续 2 次"会"后评"模糊" → consecutive 重置', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today); // cc=1
      state = calculateNextSchedule(state, '会', today); // cc=2
      const result = calculateNextSchedule(state, '模糊', today);

      expect(result.consecutive_correct).toBe(0);
    });

    // ---- 评 "不会" 相关 ----
    it('评"不会" → interval 固定 1，EF 大幅下降 0.3', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '不会', today);

      expect(result.ef).toBe(2.2); // 2.5 - 0.3
      expect(result.interval_days).toBe(1);
      expect(result.consecutive_correct).toBe(0);
      expect(result.next_review_date).toBe('2026-03-13');
    });

    // ---- EF 边界测试 ----
    it('EF 不低于 MIN_EF (1.3)', () => {
      // 从 1.3 开始再评"不会"
      const state = makeInitial({ ef: 1.3 });
      const result = calculateNextSchedule(state, '不会', today);

      expect(result.ef).toBe(1.3); // 不会低于 MIN_EF
    });

    it('连续多次"不会"后 EF 仍等于 1.3', () => {
      let state = makeInitial();
      for (let i = 0; i < 10; i++) {
        state = calculateNextSchedule(state, '不会', today);
      }
      expect(state.ef).toBe(1.3);
    });

    it('连续多次"会"后 EF 不超过 MAX_EF (3.0)', () => {
      let state = makeInitial();
      for (let i = 0; i < 20; i++) {
        state = calculateNextSchedule(state, '会', today);
      }
      expect(state.ef).toBe(3.0);
    });

    // ---- review_count 累加 ----
    it('review_count 每次调用递增 1', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today);
      expect(state.review_count).toBe(1);
      state = calculateNextSchedule(state, '不会', today);
      expect(state.review_count).toBe(2);
      state = calculateNextSchedule(state, '模糊', today);
      expect(state.review_count).toBe(3);
    });

    // ---- 日期计算 ----
    it('日期跨月计算正确', () => {
      const state = makeInitial({ ef: 3.0, interval_days: 25 });
      // interval = floor(25 * 3.0) = 75
      const result = calculateNextSchedule(state, '会', '2026-01-15');
      expect(result.next_review_date).toBe('2026-03-31');
    });
  });
});
