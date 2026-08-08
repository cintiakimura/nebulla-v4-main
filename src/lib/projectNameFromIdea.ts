/**
 * Human project label from a goal/brief — skips lead-in verbs and filler.
 * Shared by My Projects Continue and chat "Create a new project:".
 * Authority: nebula-project/recovery-orchestration.md §7.1
 */
export function shortNameFromIdea(idea: string): string {
  let t = idea.trim().replace(/\s+/g, ' ');
  if (!t) return 'New Project';

  const longBrief = t.length >= 100;
  if (longBrief) {
    const topic =
      t.match(/\b((?:tutor|teaching|teach)\s+(?:kids?|children|students?)\b[^.,;]{0,48})/i) ||
      t.match(/\b(?:app|application|webapp|platform|tool)\s+(?:for|to)\s+([^.,;]{6,72})/i) ||
      t.match(/\b(?:app|application|webapp)\s+that\s+(.+)/i);
    if (topic?.[1]) t = topic[1];
  }

  t = t.replace(
    /^(please\s+)?(build|create|make|design|scaffold)\s+(me\s+)?(an?\s+|the\s+)?/i,
    '',
  );
  t = t.replace(/^me\s+(an?\s+|the\s+)?/i, '');
  t = t.replace(/^(an?|the)\s+/i, '');

  if (longBrief) {
    t = t.replace(/^responsiven?e?\s*/i, '');
    t = t.replace(/^\([^)]*\)\s*/g, '');
    t = (t.split(/\bwhere\b|\bthe teacher\b|\bthe parents\b|\. /i)[0] || t).trim();
  }

  const words = t.split(/\s+/).filter(Boolean).slice(0, 5);
  const name = words
    .join(' ')
    .replace(/[^a-z0-9 &+\-']/gi, '')
    .trim()
    .slice(0, 48);

  return name || 'New Project';
}
