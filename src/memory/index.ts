/**
 * Solid Memory Library — implementation of the Solid Memory Standard v0.2.
 *
 * Spec: crd-office/solid-memory-standard.md
 * Work record: A157
 */

export { MemoryStore, MemoryValidationError } from './store.js';
export type { MemoryStoreOptions } from './store.js';
export type {
  MemoryEntry,
  IndexManifest,
  IndexEntry,
  WriteEntryInput,
  ValidationResult,
  ValidationError,
} from './types.js';
export {
  Identity,
  Preference,
  Procedure,
  Reference,
  Episode,
  Active,
  Superseded,
  Archived,
  Pending,
  Private,
  OfficeShared,
  TeamShared,
  STANDARD_VERSION,
  MEM,
} from './vocab.js';
export type { EntryType, Status, Scope } from './vocab.js';
export { validateWrite, validateEntry } from './validate.js';
export { hashBody, verifyBodyHash } from './hash.js';
