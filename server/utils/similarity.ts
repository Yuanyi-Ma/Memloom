/**
 * 基于 bigram 的轻量文本相似度（Dice coefficient），返回 0~1。
 * 用于服务端去重安全网——不需要外部 NLP 依赖。
 */
export function normalizedSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bi = s.slice(i, i + 2);
      set.set(bi, (set.get(bi) || 0) + 1);
    }
    return set;
  };
  const aB = bigrams(a);
  const bB = bigrams(b);
  let overlap = 0;
  for (const [bi, count] of aB) {
    overlap += Math.min(count, bB.get(bi) || 0);
  }
  const totalA = a.length - 1;
  const totalB = b.length - 1;
  return (2 * overlap) / (totalA + totalB);
}
