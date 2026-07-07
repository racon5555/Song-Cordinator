import type { SongContext } from '../ai/provider';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type Panel = { title: string; caption: string; scene: string; background: string };

function figure(x: number, y: number, s: number, color: string, mood: 'up' | 'down'): string {
  const armY = mood === 'up' ? -28 : 12;
  return `
    <g stroke="${color}" stroke-width="6" stroke-linecap="round" fill="none">
      <circle cx="${x}" cy="${y - 60 * s}" r="${18 * s}" fill="${color}" stroke="none"/>
      <line x1="${x}" y1="${y - 40 * s}" x2="${x}" y2="${y + 20 * s}"/>
      <line x1="${x}" y1="${y - 25 * s}" x2="${x - 35 * s}" y2="${y - 25 * s + armY * s}"/>
      <line x1="${x}" y1="${y - 25 * s}" x2="${x + 35 * s}" y2="${y - 25 * s + armY * s}"/>
      <line x1="${x}" y1="${y + 20 * s}" x2="${x - 25 * s}" y2="${y + 60 * s}"/>
      <line x1="${x}" y1="${y + 20 * s}" x2="${x + 25 * s}" y2="${y + 60 * s}"/>
    </g>`;
}

function note(x: number, y: number, s: number, color: string): string {
  return `
    <g fill="${color}">
      <ellipse cx="${x}" cy="${y}" rx="${12 * s}" ry="${9 * s}" transform="rotate(-20 ${x} ${y})"/>
      <rect x="${x + 8 * s}" y="${y - 55 * s}" width="${4 * s}" height="${55 * s}"/>
      <path d="M ${x + 8 * s} ${y - 55 * s} q ${20 * s} ${5 * s} ${22 * s} ${20 * s} l -${6 * s} 0 q -${4 * s} -${10 * s} -${16 * s} -${12 * s} z"/>
    </g>`;
}

function buildPanels(ctx: SongContext): Panel[] {
  const [k1, k2, k3, k4] = ctx.keywords;
  const theme = (k: string | undefined, fallback: string): string => escapeXml(k ?? fallback);

  return [
    {
      title: '1. Anfang',
      caption: `Alles beginnt mit «${theme(k1, 'einem Gefühl')}».`,
      background: '#fdf3d8',
      scene: `
        <circle cx="140" cy="120" r="55" fill="#f6c453"/>
        ${Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return `<line x1="${140 + Math.cos(a) * 70}" y1="${120 + Math.sin(a) * 70}" x2="${140 + Math.cos(a) * 95}" y2="${120 + Math.sin(a) * 95}" stroke="#f6c453" stroke-width="6" stroke-linecap="round"/>`;
        }).join('')}
        ${figure(300, 330, 1, '#355070', 'up')}
        ${note(420, 300, 1, '#6d597a')}`,
    },
    {
      title: '2. Konflikt',
      caption: `Doch «${theme(k2, 'der Zweifel')}» stellt alles in Frage.`,
      background: '#e3e7f1',
      scene: `
        <path d="M 120 100 q 30 -50 85 -35 q 15 -40 70 -30 q 55 -10 65 40 q 45 10 30 55 q -15 35 -60 25 l -160 0 q -45 5 -30 -55 z" fill="#8d99ae"/>
        <polygon points="255,165 225,235 255,235 215,320 285,225 250,225 285,165" fill="#f6c453" stroke="#e09f3e" stroke-width="3"/>
        ${figure(150, 350, 0.9, '#355070', 'down')}
        ${figure(430, 350, 0.9, '#b56576', 'down')}`,
    },
    {
      title: '3. Wendepunkt',
      caption: `Ein Wendepunkt: «${theme(k3, 'Hoffnung')}» taucht auf.`,
      background: '#e8f1e4',
      scene: `
        <polygon points="290,90 315,170 400,170 330,220 355,300 290,250 225,300 250,220 180,170 265,170" fill="#f6c453" stroke="#e09f3e" stroke-width="4"/>
        ${figure(290, 400, 1.1, '#355070', 'up')}
        ${note(160, 340, 0.8, '#6d597a')}
        ${note(430, 330, 1, '#b56576')}`,
    },
    {
      title: '4. Auflösung',
      caption: `Am Ende bleibt «${theme(k4 ?? k1, 'die Musik')}».`,
      background: '#fbe4e4',
      scene: `
        <path d="M 290 200 c -35 -60 -130 -35 -125 30 c 5 55 80 95 125 130 c 45 -35 120 -75 125 -130 c 5 -65 -90 -90 -125 -30 z" fill="#e56b6f" opacity="0.85"/>
        ${figure(200, 400, 0.95, '#355070', 'up')}
        ${figure(380, 400, 0.95, '#b56576', 'up')}
        ${note(90, 300, 0.7, '#6d597a')}
        ${note(480, 280, 0.8, '#6d597a')}`,
    },
  ];
}

export function buildComicSvg(ctx: SongContext): string {
  const panels = buildPanels(ctx);
  const size = 580;
  const gap = 20;
  const total = size * 2 + gap * 3;

  const panelSvg = panels
    .map((panel, i) => {
      const px = gap + (i % 2) * (size + gap);
      const py = gap + Math.floor(i / 2) * (size + gap);
      return `
      <g transform="translate(${px} ${py})">
        <rect width="${size}" height="${size}" rx="14" fill="${panel.background}" stroke="#2b2d42" stroke-width="4"/>
        <text x="24" y="46" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#2b2d42">${escapeXml(panel.title)}</text>
        <g transform="translate(0 40)">${panel.scene}</g>
        <rect x="16" y="${size - 86}" width="${size - 32}" height="66" rx="10" fill="#ffffff" stroke="#2b2d42" stroke-width="3"/>
        <text x="${size / 2}" y="${size - 44}" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#2b2d42">${panel.caption}</text>
      </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">
  <rect width="${total}" height="${total}" fill="#2b2d42"/>
  ${panelSvg}
</svg>`;
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
