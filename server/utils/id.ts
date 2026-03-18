import crypto from 'crypto';

export function generateCardId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hex = crypto.randomBytes(6).toString('hex');
  return `kb-${dateStr}-${hex}`;
}
