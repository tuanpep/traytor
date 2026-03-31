/**
 * Fuzzy search utility for filtering tasks by title/query.
 */
export interface FuzzyMatch {
  item: string;
  score: number;
  matches: number[];
}

/**
 * Simple fuzzy matching algorithm.
 * Returns a score (0 = no match, higher = better match).
 * Tracks character positions that matched for highlighting.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (q.length === 0) return { item: text, score: 0, matches: [] };

  // Exact substring match is strongest
  const substringIndex = t.indexOf(q);
  if (substringIndex >= 0) {
    const matches = Array.from({ length: q.length }, (_, i) => substringIndex + i);
    return { item: text, score: 100 + (q.length / t.length) * 50, matches };
  }

  // Fuzzy character-by-character match
  let score = 0;
  let qIdx = 0;
  const matches: number[] = [];
  let lastMatchIdx = -1;

  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) {
      matches.push(tIdx);
      score += 10;

      // Consecutive character bonus
      if (lastMatchIdx === tIdx - 1) {
        score += 5;
      }

      // Word boundary bonus (match at start of word)
      if (tIdx === 0 || t[tIdx - 1] === ' ' || t[tIdx - 1] === '-' || t[tIdx - 1] === '_') {
        score += 15;
      }

      lastMatchIdx = tIdx;
      qIdx++;
    }
  }

  if (qIdx < q.length) return null; // Didn't match all characters

  // Adjust score by how much of the text was matched
  score *= (q.length / t.length);

  return { item: text, score, matches };
}

/**
 * Filter and sort items by fuzzy query.
 */
export function fuzzyFilter<T extends { label: string }>(
  items: T[],
  query: string
): (T & { _matchScore: number; _matchPositions: number[] })[] {
  if (!query) {
    return items.map((item) => ({ ...item, _matchScore: 0, _matchPositions: [] }));
  }

  const results: (T & { _matchScore: number; _matchPositions: number[] })[] = [];

  for (const item of items) {
    const match = fuzzyMatch(query, item.label);
    if (match) {
      results.push({ ...item, _matchScore: match.score, _matchPositions: match.matches });
    }
  }

  return results.sort((a, b) => b._matchScore - a._matchScore);
}

/**
 * Highlight matched characters in a string using ANSI colors.
 */
export function highlightMatches(text: string, positions: number[], color: (s: string) => string): string {
  if (positions.length === 0) return text;

  const posSet = new Set(positions);
  let result = '';

  for (let i = 0; i < text.length; i++) {
    if (posSet.has(i)) {
      result += color(text[i]);
    } else {
      result += text[i];
    }
  }

  return result;
}
