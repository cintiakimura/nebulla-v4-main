/**
 * Human project label from a goal/brief — skips lead-in verbs.
 * Shared by My Projects Continue and chat "Create a new project:".
 */
export function shortNameFromIdea(idea: string): string {
  let t = idea.trim().replace(/\s+/g, ' ');
  t = t.replace(/^(build|create|make|design|scaffold)\s+(an?\s+|the\s+)?/i, '');
  t = t.replace(/^(an?|the)\s+/i, '');
  const words = t.split(/\s+/).filter(Boolean).slice(0, 5);
  const name = words
    .join(' ')
    .replace(/[^a-z0-9 &+\-]/gi, '')
    .trim()
    .slice(0, 48);
  return name || 'New Project';
}
