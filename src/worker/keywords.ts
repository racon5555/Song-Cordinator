import { normalize } from './itunes';

const STOPWORDS = new Set([
  'the', 'and', 'you', 'your', 'yours', 'that', 'this', 'with', 'for', 'not', 'but', 'all',
  'are', 'was', 'were', 'she', 'him', 'her', 'his', 'they', 'them', 'from', 'have', 'has',
  'had', 'will', 'would', 'can', 'could', 'should', 'there', 'here', 'when', 'what', 'who',
  'how', 'why', 'out', 'about', 'into', 'just', 'like', 'get', 'got', 'let', 'dont', 'aint',
  'gonna', 'wanna', 'cause', 'oooh', 'oh', 'yeah', 'hey', 'now', 'then', 'than', 'too',
  'been', 'being', 'because', 'every', 'ever', 'never', 'always', 'come', 'know', 'well',
  'der', 'die', 'das', 'und', 'ich', 'du', 'wir', 'ihr', 'sie', 'ist', 'sind', 'ein', 'eine',
  'nicht', 'mit', 'von', 'auf', 'für', 'fur', 'den', 'dem', 'des', 'mich', 'dich', 'mein',
  'dein', 'aber', 'auch', 'noch', 'wie', 'was', 'wenn', 'dann', 'doch', 'nur', 'mal', 'schon',
]);

export function topKeywords(text: string, max = 6): string[] {
  const counts = new Map<string, number>();
  for (const word of normalize(text).split(' ')) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}
