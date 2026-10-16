import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, bootstrap } from '../apps/web/src/api';

afterEach(() => vi.unstubAllGlobals());

describe('web API responses', () => {
  it('explains an empty proxy failure instead of exposing a JSON parse error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(bootstrap()).rejects.toThrow('เชื่อมต่อระบบในเครื่องไม่ได้');
  });

  it('explains network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(bootstrap()).rejects.toThrow('npm run dev');
  });

  it('reports malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>')));
    await expect(bootstrap()).rejects.toThrow('คำตอบไม่ถูกต้อง');
  });

  it('preserves API error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Invalid local token' }, { status: 403 })),
    );
    await expect(api('/dashboard')).rejects.toThrow('Invalid local token');
  });

  it('can bootstrap after an outage and refresh the token after a restart', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(Response.json({ token: 'first-token' }))
      .mockResolvedValueOnce(Response.json({ token: 'restarted-token' }))
      .mockResolvedValueOnce(Response.json({ ready: true }));
    vi.stubGlobal('fetch', fetch);
    await expect(bootstrap()).rejects.toThrow('เชื่อมต่อระบบในเครื่องไม่ได้');
    await bootstrap();
    await bootstrap();
    await expect(api('/dashboard')).resolves.toEqual({ ready: true });
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/dashboard',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-local-token': 'restarted-token' }),
      }),
    );
  });
});
