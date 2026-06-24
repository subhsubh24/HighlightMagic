import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkQuota, incrementQuota, FREE_EXPORT_LIMIT } from './quota';

describe('quota (KV not configured — graceful degradation)', () => {
  const savedUrl = process.env.KV_REST_API_URL;
  const savedToken = process.env.KV_REST_API_TOKEN;

  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    if (savedUrl !== undefined) process.env.KV_REST_API_URL = savedUrl;
    else delete process.env.KV_REST_API_URL;
    if (savedToken !== undefined) process.env.KV_REST_API_TOKEN = savedToken;
    else delete process.env.KV_REST_API_TOKEN;
  });

  it('checkQuota returns allowed=true when KV is not configured', async () => {
    const result = await checkQuota('user-abc');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(FREE_EXPORT_LIMIT);
  });

  it('incrementQuota resolves without error when KV is not configured', async () => {
    await expect(incrementQuota('user-abc')).resolves.toBeUndefined();
  });

  it('FREE_EXPORT_LIMIT matches iOS + web constant (5)', () => {
    expect(FREE_EXPORT_LIMIT).toBe(5);
  });
});
