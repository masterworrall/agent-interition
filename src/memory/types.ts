import type { EntryType, Scope, Status } from './vocab.js';

export interface MemoryEntry {
  uri: string;
  type: EntryType;
  label: string;
  author: string;
  created: string; // ISO 8601
  status: Status;
  scope: Scope;
  appliesTo: string[];
  standardVersion: string;
  // Optional / type-specific
  bodyUri?: string;
  bodyHash?: string;
  body?: string; // markdown content, fetched on demand
  supersedes?: string;
  supersededBy?: string;
  authoritativeSource?: string;
  retrieve?: string;
  occurred?: string; // ISO 8601, episodes only
}

export interface IndexManifest {
  uri: string;
  standardVersion: string;
  modified: string;
  entries: IndexEntry[];
}

export interface IndexEntry {
  uri: string;
  type: EntryType;
  label: string;
  scope: Scope;
  appliesTo: string[];
  status: Status;
  modified: string;
}

export interface WriteEntryInput {
  type: EntryType;
  label: string;
  appliesTo?: string[];
  scope?: Scope;
  body?: string; // markdown — required for Preference/Procedure, optional for Identity/Episode, forbidden for Reference
  authoritativeSource?: string; // Reference only
  retrieve?: string; // Reference only
  occurred?: string; // Episode only — ISO 8601
}

export interface ValidationError {
  code:
    | 'missing_required'
    | 'forbidden_field'
    | 'authoritative_source_duplication'
    | 'identity_edit'
    | 'episode_mutation'
    | 'standard_version_skew';
  message: string;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
