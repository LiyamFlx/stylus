import { describe, it, expect, beforeEach } from 'vitest';
import { estimateLocalStorageUsage, formatBytes, STORAGE_WARNING_THRESHOLD } from './storageUsage';

describe('estimateLocalStorageUsage', () => {
  beforeEach(() => localStorage.clear());

  it('reports zero usage for empty storage', () => {
    const usage = estimateLocalStorageUsage();
    expect(usage.usedBytes).toBe(0);
    expect(usage.ratio).toBe(0);
  });

  it('sums key + value length across all stored keys', () => {
    localStorage.setItem('a', '12345');
    localStorage.setItem('bb', '1234567890');
    const usage = estimateLocalStorageUsage();
    // 'a'(1) + '12345'(5) + 'bb'(2) + '1234567890'(10) = 18
    expect(usage.usedBytes).toBe(18);
  });

  it('ratio reflects usage against the assumed quota', () => {
    localStorage.setItem('k', 'x'.repeat(1_000_000));
    const usage = estimateLocalStorageUsage();
    expect(usage.ratio).toBeGreaterThan(0);
    expect(usage.ratio).toBeCloseTo(usage.usedBytes / usage.assumedQuotaBytes, 10);
  });

  it('STORAGE_WARNING_THRESHOLD is a sane fraction', () => {
    expect(STORAGE_WARNING_THRESHOLD).toBeGreaterThan(0);
    expect(STORAGE_WARNING_THRESHOLD).toBeLessThan(1);
  });
});

describe('formatBytes', () => {
  it('formats bytes under 1KB as B', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes as KB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('formats megabytes as MB with one decimal', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
