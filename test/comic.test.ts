import { describe, expect, it } from 'vitest';
import { buildComicSvg, svgToDataUri } from '../src/worker/comic/svg';
import type { SongContext } from '../src/worker/ai/provider';

const ctx: SongContext = {
  artistInput: 'The Beatles',
  titleInput: 'Let It Be',
  wordCount: 245,
  keywords: ['wisdom', 'mother', 'darkness', 'light'],
};

describe('buildComicSvg', () => {
  it('renders four titled panels', () => {
    const svg = buildComicSvg(ctx);
    expect(svg).toContain('1. Anfang');
    expect(svg).toContain('2. Konflikt');
    expect(svg).toContain('3. Wendepunkt');
    expect(svg).toContain('4. Auflösung');
    expect(svg).toContain('wisdom');
  });

  it('escapes XML-unsafe keyword content', () => {
    const svg = buildComicSvg({ ...ctx, keywords: ['<script>alert(1)</script>'] });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('svgToDataUri', () => {
  it('produces a base64 SVG data URI', () => {
    const uri = svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = Buffer.from(uri.split(',')[1] ?? '', 'base64').toString('utf8');
    expect(decoded).toContain('<svg');
  });
});
