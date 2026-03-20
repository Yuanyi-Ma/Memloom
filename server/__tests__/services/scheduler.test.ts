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

// =========================================
// 辅助函数
// =========================================
function makeInitial(overrides?: Partial<ScheduleState>): ScheduleState {
  return {
    ef: INITIAL_EF,
    interval_days: 1,
    review_count: 0,
    consecutive_correct: 0,
    ...overrides,
  };
}

describe('SM-2 Scheduler', () => {
  // =========================================
  // 1. 常量验证
  // =========================================
  describe('Constants', () => {
    it('INITIAL_EF = 2.5', () => {
      expect(INITIAL_EF).toBe(2.5);
    });

    it('MIN_EF = 1.3', () => {
      expect(MIN_EF).toBe(1.3);
    });

    it('MAX_EF = 3.0', () => {
      expect(MAX_EF).toBe(3.0);
    });

    it('MASTERED_THRESHOLD = 3', () => {
      expect(MASTERED_THRESHOLD).toBe(3);
    });
  });

  // =========================================
  // 2. isMastered
  // =========================================
  describe('isMastered', () => {
    it('consecutive_correct = 0 → false', () => {
      expect(isMastered(0)).toBe(false);
    });

    it('consecutive_correct = 2 → false（恰好低于阈值）', () => {
      expect(isMastered(2)).toBe(false);
    });

    it('consecutive_correct = 3 → true（等于阈值）', () => {
      expect(isMastered(3)).toBe(true);
    });

    it('consecutive_correct = 5 → true（超过阈值）', () => {
      expect(isMastered(5)).toBe(true);
    });

    it('consecutive_correct = 100 → true（大值）', () => {
      expect(isMastered(100)).toBe(true);
    });
  });

  // =========================================
  // 3. 评分分支：「会」
  // =========================================
  describe('评分「会」', () => {
    const today = '2026-03-12';

    it('首次复习 → ef=2.6, interval=2, cc=1', () => {
      const result = calculateNextSchedule(makeInitial(), '会', today);
      expect(result).toEqual({
        ef: 2.6,
        interval_days: 2,
        next_review_date: '2026-03-14',
        review_count: 1,
        consecutive_correct: 1,
      });
    });

    it('连续 3 次「会」→ EF 每次 +0.1', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today); // ef=2.6
      state = calculateNextSchedule(state, '会', today); // ef=2.7
      const result = calculateNextSchedule(state, '会', today); // ef=2.8
      expect(result.ef).toBe(2.8);
      expect(result.consecutive_correct).toBe(3);
      expect(result.review_count).toBe(3);
    });

    it('已在 MAX_EF 时评「会」→ EF 不再增长', () => {
      const state = makeInitial({ ef: 3.0, interval_days: 10 });
      const result = calculateNextSchedule(state, '会', today);
      expect(result.ef).toBe(3.0);
      expect(result.interval_days).toBe(30); // floor(10 * 3.0)
    });

    it('interval 增长轨迹：1 → 2 → 5 → 14 → ...', () => {
      let state = makeInitial();
      // 第1次：ef=2.6, interval=max(1,floor(1*2.6))=2
      state = calculateNextSchedule(state, '会', today);
      expect(state.interval_days).toBe(2);

      // 第2次：ef=2.7, interval=max(1,floor(2*2.7))=5
      state = calculateNextSchedule(state, '会', today);
      expect(state.interval_days).toBe(5);

      // 第3次：ef=2.8, interval=max(1,floor(5*2.8))=14
      state = calculateNextSchedule(state, '会', today);
      expect(state.interval_days).toBe(14);

      // 第4次：ef=2.9, interval=max(1,floor(14*2.9))=40
      state = calculateNextSchedule(state, '会', today);
      expect(state.interval_days).toBe(40);
    });

    it('interval_days=0 时被 max(1,...) 保护', () => {
      const state = makeInitial({ interval_days: 0, ef: 1.3 });
      const result = calculateNextSchedule(state, '会', today);
      expect(result.interval_days).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================
  // 4. 评分分支：「模糊」
  // =========================================
  describe('评分「模糊」', () => {
    const today = '2026-03-12';

    it('首次复习评「模糊」→ interval=2, ef=2.35, cc=0', () => {
      const result = calculateNextSchedule(makeInitial(), '模糊', today);
      expect(result.ef).toBe(2.35);
      expect(result.interval_days).toBe(2);
      expect(result.consecutive_correct).toBe(0);
      expect(result.next_review_date).toBe('2026-03-14');
    });

    it('连续 2 次「会」后评「模糊」→ consecutive 重置', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today);
      state = calculateNextSchedule(state, '会', today);
      expect(state.consecutive_correct).toBe(2);
      const result = calculateNextSchedule(state, '模糊', today);
      expect(result.consecutive_correct).toBe(0);
    });

    it('评「模糊」后再评「会」→ 正确恢复', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '模糊', today); // ef=2.35, interval=2
      expect(state.ef).toBe(2.35);
      state = calculateNextSchedule(state, '会', today); // ef=2.45, interval=max(1,floor(2*2.45))=4
      expect(state.ef).toBe(2.45);
      expect(state.consecutive_correct).toBe(1);
      expect(state.interval_days).toBe(4);
    });
  });

  // =========================================
  // 5. 评分分支：「不会」
  // =========================================
  describe('评分「不会」', () => {
    const today = '2026-03-12';

    it('首次复习评「不会」→ interval=1, ef=2.2, cc=0', () => {
      const result = calculateNextSchedule(makeInitial(), '不会', today);
      expect(result.ef).toBe(2.2);
      expect(result.interval_days).toBe(1);
      expect(result.consecutive_correct).toBe(0);
      expect(result.next_review_date).toBe('2026-03-13');
    });

    it('评「不会」后 consecutive_correct 归零', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today);
      state = calculateNextSchedule(state, '会', today);
      expect(state.consecutive_correct).toBe(2);
      const result = calculateNextSchedule(state, '不会', today);
      expect(result.consecutive_correct).toBe(0);
    });
  });

  // =========================================
  // 6. EF 边界
  // =========================================
  describe('EF 边界', () => {
    const today = '2026-03-12';

    it('EF 不低于 MIN_EF (1.3)：从 1.3 评「不会」仍为 1.3', () => {
      const state = makeInitial({ ef: 1.3 });
      const result = calculateNextSchedule(state, '不会', today);
      expect(result.ef).toBe(1.3);
    });

    it('EF 不低于 MIN_EF：从 1.35 评「模糊」→ 1.3（不低于下限）', () => {
      const state = makeInitial({ ef: 1.35 });
      const result = calculateNextSchedule(state, '模糊', today);
      expect(result.ef).toBe(1.3); // 1.35 - 0.15 = 1.2 → clamped to 1.3
    });

    it('连续 10 次「不会」后 EF 仍为 1.3', () => {
      let state = makeInitial();
      for (let i = 0; i < 10; i++) {
        state = calculateNextSchedule(state, '不会', today);
      }
      expect(state.ef).toBe(1.3);
    });

    it('EF 不超过 MAX_EF：连续 20 次「会」', () => {
      let state = makeInitial();
      for (let i = 0; i < 20; i++) {
        state = calculateNextSchedule(state, '会', today);
      }
      expect(state.ef).toBe(3.0);
    });

    it('EF 从最低值连续「会」逐步恢复', () => {
      let state = makeInitial({ ef: 1.3, interval_days: 1 });
      for (let i = 0; i < 5; i++) {
        state = calculateNextSchedule(state, '会', today);
      }
      expect(state.ef).toBe(1.8); // 1.3 + 0.1 * 5
      expect(state.consecutive_correct).toBe(5);
    });

    it('EF 浮点精度：不产生小数位数过多', () => {
      let state = makeInitial({ ef: 1.45 });
      state = calculateNextSchedule(state, '模糊', today); // 1.45 - 0.15 = 1.30
      expect(state.ef).toBe(1.3);

      state = makeInitial({ ef: 2.95 });
      state = calculateNextSchedule(state, '会', today); // 2.95 + 0.1 = 3.05 → clamped 3.0
      expect(state.ef).toBe(3.0);
    });
  });

  // =========================================
  // 7. review_count 累加
  // =========================================
  describe('review_count', () => {
    const today = '2026-03-12';

    it('每次调用递增 1，不受评分类型影响', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today);
      expect(state.review_count).toBe(1);
      state = calculateNextSchedule(state, '不会', today);
      expect(state.review_count).toBe(2);
      state = calculateNextSchedule(state, '模糊', today);
      expect(state.review_count).toBe(3);
    });
  });

  // =========================================
  // 8. 交替评分序列
  // =========================================
  describe('交替评分序列', () => {
    const today = '2026-03-12';

    it('会 → 不会 → 会 → 模糊 → 会：consecutive 正确追踪', () => {
      let state = makeInitial();
      state = calculateNextSchedule(state, '会', today);
      expect(state.consecutive_correct).toBe(1);

      state = calculateNextSchedule(state, '不会', today);
      expect(state.consecutive_correct).toBe(0);

      state = calculateNextSchedule(state, '会', today);
      expect(state.consecutive_correct).toBe(1);

      state = calculateNextSchedule(state, '模糊', today);
      expect(state.consecutive_correct).toBe(0);

      state = calculateNextSchedule(state, '会', today);
      expect(state.consecutive_correct).toBe(1);

      expect(state.review_count).toBe(5);
    });

    it('从「不会」恢复到「掌握」需要连续 3 次「会」', () => {
      let state = makeInitial();
      // 先评一次不会
      state = calculateNextSchedule(state, '不会', today);
      expect(isMastered(state.consecutive_correct)).toBe(false);

      // 连续 3 次会
      state = calculateNextSchedule(state, '会', today);
      state = calculateNextSchedule(state, '会', today);
      state = calculateNextSchedule(state, '会', today);
      expect(isMastered(state.consecutive_correct)).toBe(true);
    });
  });

  // =========================================
  // 9. 日期计算
  // =========================================
  describe('日期计算', () => {
    it('普通日期加天数', () => {
      const state = makeInitial(); // interval=1, ef=2.5 → 新 interval=2
      const result = calculateNextSchedule(state, '会', '2026-03-12');
      expect(result.next_review_date).toBe('2026-03-14');
    });

    it('跨月：3月31日 + 天数', () => {
      const state = makeInitial({ interval_days: 1, ef: 2.5 });
      // interval = floor(1 * 2.6) = 2
      const result = calculateNextSchedule(state, '会', '2026-03-30');
      expect(result.next_review_date).toBe('2026-04-01');
    });

    it('跨月：1月31日 + 1天 = 2月1日', () => {
      const state = makeInitial(); // interval = 2
      const result = calculateNextSchedule(state, '不会', '2026-01-31');
      // 不会 → interval=1, next = 2026-02-01
      expect(result.next_review_date).toBe('2026-02-01');
    });

    it('月末：4月30日 + 1天 = 5月1日', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '不会', '2026-04-30');
      expect(result.next_review_date).toBe('2026-05-01');
    });

    it('跨年：12月20日 + 26天 = 次年1月15日', () => {
      const state = makeInitial({ interval_days: 10, ef: 2.5 });
      // interval = floor(10 * 2.6) = 26
      const result = calculateNextSchedule(state, '会', '2025-12-20');
      expect(result.next_review_date).toBe('2026-01-15');
    });

    it('跨年：12月31日 + 1天 = 次年1月1日', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '不会', '2025-12-31');
      expect(result.next_review_date).toBe('2026-01-01');
    });

    it('闰年：2月27日 + 2天 = 2月29日（2028闰年）', () => {
      const state = makeInitial({ interval_days: 1, ef: 2.5 });
      const result = calculateNextSchedule(state, '会', '2028-02-27');
      expect(result.next_review_date).toBe('2028-02-29');
    });

    it('非闰年：2月27日 + 2天 = 3月1日（2027非闰年）', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '会', '2027-02-27');
      expect(result.next_review_date).toBe('2027-03-01');
    });

    it('闰年：2月29日 + 1天 = 3月1日', () => {
      const state = makeInitial();
      const result = calculateNextSchedule(state, '不会', '2028-02-29');
      expect(result.next_review_date).toBe('2028-03-01');
    });

    it('大 interval 跨月：1月15日 + 75天 = 3月31日', () => {
      const state = makeInitial({ ef: 3.0, interval_days: 25 });
      // interval = floor(25 * 3.0) = 75
      const result = calculateNextSchedule(state, '会', '2026-01-15');
      expect(result.next_review_date).toBe('2026-03-31');
    });
  });

  // =========================================
  // 10. 端到端多步真实日期序列
  // =========================================
  describe('端到端多步真实日期序列', () => {
    it('模拟真实复习流程：按实际日期逐步推进', () => {
      let state = makeInitial();

      // Day 1 (2026-03-12): 创建卡片，首次复习评「会」
      state = calculateNextSchedule(state, '会', '2026-03-12');
      expect(state.next_review_date).toBe('2026-03-14'); // +2天
      expect(state.ef).toBe(2.6);

      // Day 3 (2026-03-14): 按时复习评「会」
      state = calculateNextSchedule(state, '会', '2026-03-14');
      expect(state.next_review_date).toBe('2026-03-19'); // +5天
      expect(state.ef).toBe(2.7);

      // Day 8 (2026-03-19): 按时复习评「模糊」→ 回退
      state = calculateNextSchedule(state, '模糊', '2026-03-19');
      expect(state.next_review_date).toBe('2026-03-21'); // +2天（固定）
      expect(state.ef).toBe(2.55);
      expect(state.consecutive_correct).toBe(0);

      // Day 10 (2026-03-21): 复习评「会」→ 开始重新积累
      state = calculateNextSchedule(state, '会', '2026-03-21');
      expect(state.ef).toBe(2.65);
      expect(state.consecutive_correct).toBe(1);
      // interval = max(1, floor(2 * 2.65)) = 5
      expect(state.interval_days).toBe(5);
      expect(state.next_review_date).toBe('2026-03-26');
    });

    it('从零开始到掌握的完整路径', () => {
      let state = makeInitial();
      let date = '2026-01-01';

      // 连续 3 次「会」达到掌握
      state = calculateNextSchedule(state, '会', date);
      date = state.next_review_date;
      expect(state.consecutive_correct).toBe(1);

      state = calculateNextSchedule(state, '会', date);
      date = state.next_review_date;
      expect(state.consecutive_correct).toBe(2);

      state = calculateNextSchedule(state, '会', date);
      expect(state.consecutive_correct).toBe(3);
      expect(isMastered(state.consecutive_correct)).toBe(true);

      // 验证 review_count
      expect(state.review_count).toBe(3);
    });

    it('困难卡片：反复「不会」后逐步恢复', () => {
      let state = makeInitial();
      const today = '2026-03-12';

      // 连续 3 次「不会」
      for (let i = 0; i < 3; i++) {
        state = calculateNextSchedule(state, '不会', today);
      }
      expect(state.ef).toBe(1.6); // 2.5 - 0.3*3 = 1.6
      expect(state.interval_days).toBe(1); // 始终为 1

      // 再 2 次「不会」→ EF 继续下降但不低于 1.3
      state = calculateNextSchedule(state, '不会', today);
      expect(state.ef).toBe(1.3);
      state = calculateNextSchedule(state, '不会', today);
      expect(state.ef).toBe(1.3); // 不再下降

      // 开始恢复：连续 3 次「会」
      state = calculateNextSchedule(state, '会', today);
      expect(state.ef).toBe(1.4);
      state = calculateNextSchedule(state, '会', today);
      expect(state.ef).toBe(1.5);
      state = calculateNextSchedule(state, '会', today);
      expect(state.ef).toBe(1.6);
      expect(state.consecutive_correct).toBe(3);
      expect(isMastered(state.consecutive_correct)).toBe(true);
    });
  });
});
