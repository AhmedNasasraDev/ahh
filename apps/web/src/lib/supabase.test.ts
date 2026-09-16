import { describe, expect, it } from 'vitest';
import { getSupabase, looksLikeServiceRoleKey, supabaseStatus } from './supabase.js';

describe('Supabase is prepared but not connected', () => {
  it('reports itself unconfigured when the env vars are absent', () => {
    const s = supabaseStatus();
    expect(s.configured).toBe(false);
    if (!s.configured) expect(s.reason).toBe('missing-env');
  });

  it('returns no client, so nothing can accidentally call a server', () => {
    expect(getSupabase()).toBeNull();
  });
});

describe('HANDOFF §6 — a service-role key must never reach the browser', () => {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');

  it('recognises a service-role JWT', () => {
    const key = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.sig`;
    expect(looksLikeServiceRoleKey(key)).toBe(true);
  });

  it('accepts an anon JWT', () => {
    const key = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon' })}.sig`;
    expect(looksLikeServiceRoleKey(key)).toBe(false);
  });

  it('does not throw on a malformed key', () => {
    expect(looksLikeServiceRoleKey('not-a-jwt')).toBe(false);
    expect(looksLikeServiceRoleKey('')).toBe(false);
  });
});
