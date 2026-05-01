import { createHash } from 'node:crypto';

/**
 * Generate a URL-safe slug from a label, with a short hash suffix for uniqueness.
 *
 * Examples:
 *   slugify("No heredocs in shell scripts") => "no-heredocs-in-shell-scripts-a1b2c3"
 *   slugify("Team work records (epics, tasks)") => "team-work-records-epics-tasks-d4e5f6"
 */
export function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop punctuation
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

  const suffix = createHash('sha256')
    .update(label + Date.now())
    .digest('hex')
    .slice(0, 6);

  return base ? `${base}-${suffix}` : suffix;
}

/**
 * Generate a slug for an Episode that includes the date — episodes are typically dated.
 *
 * Example:
 *   episodeSlug("STATUS bypass incident", "2026-04-30T08:30:00Z")
 *     => "2026-04-30-status-bypass-incident-a1b2c3"
 */
export function episodeSlug(label: string, occurredIso: string): string {
  const datePart = occurredIso.slice(0, 10); // YYYY-MM-DD
  const labelPart = slugify(label).replace(/-[a-f0-9]{6}$/, ''); // drop the suffix
  const suffix = createHash('sha256')
    .update(label + occurredIso)
    .digest('hex')
    .slice(0, 6);
  return `${datePart}-${labelPart}-${suffix}`;
}
