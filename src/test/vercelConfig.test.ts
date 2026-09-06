import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelConfig {
  headers?: Array<{
    source: string;
    headers: VercelHeader[];
  }>;
}

function getContentSecurityPolicy(): string {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
  ) as VercelConfig;

  const header = config.headers
    ?.flatMap((entry) => entry.headers)
    .find(({ key }) => key.toLowerCase() === 'content-security-policy');

  if (!header) throw new Error('Content-Security-Policy header is missing');
  return header.value;
}

function parseDirectives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, values] as const;
      }),
  );
}

describe('Vercel Content-Security-Policy', () => {
  it('does not permit inline scripts or JavaScript eval', () => {
    const directives = parseDirectives(getContentSecurityPolicy());

    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('script-src')).toContain("'self'");
    expect(directives.get('script-src')).toContain("'wasm-unsafe-eval'");
    expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
    expect(directives.get('script-src')).not.toContain("'unsafe-eval'");
  });

  it('retains the resources required by Mapbox GL JS', () => {
    const directives = parseDirectives(getContentSecurityPolicy());

    expect(directives.get('worker-src')).toEqual(["'self'", 'blob:']);
    expect(directives.get('img-src')).toEqual(
      expect.arrayContaining(['data:', 'blob:']),
    );
    expect(directives.get('connect-src')).toEqual(
      expect.arrayContaining([
        'https://api.mapbox.com',
        'https://events.mapbox.com',
      ]),
    );
  });

  it('keeps privileged document capabilities locked down', () => {
    const directives = parseDirectives(getContentSecurityPolicy());

    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
  });
});
