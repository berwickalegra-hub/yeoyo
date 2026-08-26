import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { generateUniqueAffiliateCode } from './code';

describe('generateUniqueAffiliateCode', () => {
  it('returns an 8-character uppercase code on the first try when unused', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const code = await generateUniqueAffiliateCode();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    // Excludes visually-ambiguous characters.
    expect(code).not.toMatch(/[01OI]/);
  });

  it('retries on collision and returns the first free code', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'taken' } as never)
      .mockResolvedValueOnce(null as never);
    const code = await generateUniqueAffiliateCode();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'taken' } as never);
    await expect(generateUniqueAffiliateCode()).rejects.toThrow();
  });
});
