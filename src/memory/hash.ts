import { createHash } from 'node:crypto';

/**
 * SHA-256 hash of a memory body, formatted as `sha256:<hex>` for storage in mem:bodyHash.
 */
export function hashBody(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/**
 * Returns true if the recorded hash matches the live content.
 * Used to detect drift between metadata and body.
 */
export function verifyBodyHash(content: string, recordedHash: string): boolean {
  return hashBody(content) === recordedHash;
}
