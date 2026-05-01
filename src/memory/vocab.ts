/**
 * Solid Memory Standard vocabulary constants.
 *
 * Standard: crd-office/solid-memory-standard.md (v0.2 DRAFT, 2026-05-01)
 * Work record: A156
 *
 * The Turtle vocab is published at https://interition.ai/vocab/memory#
 * (See solid-memory-vocab.ttl for the source.)
 */

export const MEM = 'https://interition.ai/vocab/memory#';

export const STANDARD_VERSION = '0.2';

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const DCTERMS = 'http://purl.org/dc/terms/';

// Reserved namespaces — entries MUST NOT encode predicates from these as authoritative facts
export const RESERVED_AUTHORITATIVE_NAMESPACES = [
  'https://interition.ai/vocab/work#',
  'https://interition.ai/vocab/cmdb#',
] as const;

// Classes
export const Identity = `${MEM}Identity`;
export const Preference = `${MEM}Preference`;
export const Procedure = `${MEM}Procedure`;
export const Reference = `${MEM}Reference`;
export const Episode = `${MEM}Episode`;
export const Index = `${MEM}Index`;

export const ENTRY_TYPES = [Identity, Preference, Procedure, Reference, Episode] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

// Predicates
export const author = `${MEM}author`;
export const created = `${MEM}created`;
export const supersedes = `${MEM}supersedes`;
export const supersededBy = `${MEM}supersededBy`;
export const status = `${MEM}status`;
export const scope = `${MEM}scope`;
export const appliesTo = `${MEM}appliesTo`;
export const label = `${MEM}label`;
export const body = `${MEM}body`;
export const bodyHash = `${MEM}bodyHash`;
export const authoritativeSource = `${MEM}authoritativeSource`;
export const retrieve = `${MEM}retrieve`;
export const occurred = `${MEM}occurred`;
export const standardVersion = `${MEM}standardVersion`;

// Status values
export const Active = `${MEM}Active`;
export const Superseded = `${MEM}Superseded`;
export const Archived = `${MEM}Archived`;
export const Pending = `${MEM}Pending`;

export const STATUSES = [Active, Superseded, Archived, Pending] as const;
export type Status = (typeof STATUSES)[number];

// Scope values
export const Private = `${MEM}Private`;
export const OfficeShared = `${MEM}OfficeShared`;
export const TeamShared = `${MEM}TeamShared`;

export const SCOPES = [Private, OfficeShared, TeamShared] as const;
export type Scope = (typeof SCOPES)[number];

// Container slugs (relative to <agent>/memory/)
export const CONTAINERS = {
  identity: 'identity/',
  preferences: 'preferences/',
  procedures: 'procedures/',
  references: 'references/',
  episodes: 'episodes/',
  superseded: 'superseded/',
  embeddings: 'embeddings/', // reserved for v0.4
} as const;

export function containerForType(type: EntryType): string {
  switch (type) {
    case Identity:
      return CONTAINERS.identity;
    case Preference:
      return CONTAINERS.preferences;
    case Procedure:
      return CONTAINERS.procedures;
    case Reference:
      return CONTAINERS.references;
    case Episode:
      return CONTAINERS.episodes;
  }
}
