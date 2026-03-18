import { describe, it, expect } from 'vitest';
import { generateCardId } from '../../utils/id';

describe('ID Generation', () => {
  it('should generate ID in correct format', () => {
    const id = generateCardId();
    expect(id).toMatch(/^kb-\d{8}-[0-9a-f]{12}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
        ids.add(generateCardId());
    }
    expect(ids.size).toBe(100);
  });
});
