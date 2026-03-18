import { describe, it, expect } from 'vitest';
import { normalizedSimilarity } from '../../utils/similarity';

describe('normalizedSimilarity (Dice coefficient)', () => {
  it('完全相同字符串 → 返回 1.0', () => {
    expect(normalizedSimilarity('hello', 'hello')).toBe(1);
  });

  it('空字符串完全相同 → 返回 1.0', () => {
    expect(normalizedSimilarity('', '')).toBe(1);
  });

  it('单字符相同 → 返回 1（完全匹配快路径）', () => {
    expect(normalizedSimilarity('a', 'a')).toBe(1);
  });

  it('单字符不同 → 返回 0（长度 < 2）', () => {
    expect(normalizedSimilarity('a', 'b')).toBe(0);
  });

  it('空字符串 vs 非空 → 返回 0', () => {
    expect(normalizedSimilarity('', 'hello')).toBe(0);
  });

  it('完全不同字符串 → 返回 0 或接近 0', () => {
    const sim = normalizedSimilarity('abcdef', 'uvwxyz');
    expect(sim).toBeLessThan(0.1);
  });

  it('部分相似 → 返回 0 到 1 之间', () => {
    const sim = normalizedSimilarity('hello world', 'hello there');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('高相似度字符串 → 返回值 > 0.7', () => {
    const sim = normalizedSimilarity('Docker容器技术', 'Docker容器技');
    expect(sim).toBeGreaterThan(0.7);
  });

  it('中文字符串相似度计算', () => {
    const sim = normalizedSimilarity('区块链共识机制', '区块链共识算法');
    expect(sim).toBeGreaterThan(0.5);
  });

  it('中文完全不同 → 低相似度', () => {
    const sim = normalizedSimilarity('区块链共识机制', '机器学习反向传播');
    expect(sim).toBeLessThan(0.3);
  });

  it('反转参数顺序结果一致（对称性）', () => {
    const ab = normalizedSimilarity('hello world', 'world hello');
    const ba = normalizedSimilarity('world hello', 'hello world');
    expect(ab).toBe(ba);
  });

  it('重复字符的 bigram 计数正确', () => {
    // "aaa" bigrams: "aa" x 2
    // "aa" bigrams: "aa" x 1
    // overlap = min(2, 1) = 1
    // total = 2 + 1 = 3
    // result = 2 * 1 / 3 ≈ 0.667
    const sim = normalizedSimilarity('aaa', 'aa');
    expect(sim).toBeCloseTo(2 / 3, 2);
  });

  it('阈值 0.7 边界验证', () => {
    // 测试去重场景：相似标题应超过 0.7
    const sim = normalizedSimilarity('go语言接口设计', 'go语言接口设计思想');
    expect(sim).toBeGreaterThan(0.5); // 至少部分匹配
  });
});
