import { Parser } from 'n3';
import type { MemoryEntry, IndexManifest, IndexEntry } from './types.js';
import {
  MEM,
  RDF_TYPE,
  DCTERMS,
  STANDARD_VERSION,
  Active,
  Private,
  ENTRY_TYPES,
  STATUSES,
  SCOPES,
  Index,
  author,
  created,
  status,
  scope,
  appliesTo,
  label,
  body,
  bodyHash,
  authoritativeSource,
  retrieve,
  occurred,
  supersedes,
  supersededBy,
  standardVersion,
} from './vocab.js';
import type { EntryType, Status, Scope } from './vocab.js';

/**
 * Parse a metadata Turtle document into a MemoryEntry.
 * The base URL is used to resolve relative URIs (the entry's <#entry> fragment, etc.).
 */
export function parseEntry(turtle: string, baseUrl: string): MemoryEntry {
  const parser = new Parser({ baseIRI: baseUrl });
  const quads = parser.parse(turtle);

  // Find the entry subject — typically <#entry>, but accept any subject with rdf:type ∈ ENTRY_TYPES
  let subject: string | undefined;
  let type: EntryType | undefined;

  for (const q of quads) {
    if (q.predicate.value === RDF_TYPE && (ENTRY_TYPES as readonly string[]).includes(q.object.value)) {
      subject = q.subject.value;
      type = q.object.value as EntryType;
      break;
    }
  }

  if (!subject || !type) {
    throw new Error(`No entry subject found in metadata at ${baseUrl}`);
  }

  // Build a single-subject view
  const props: Record<string, string[]> = {};
  for (const q of quads) {
    if (q.subject.value !== subject) continue;
    const list = (props[q.predicate.value] ??= []);
    list.push(q.object.value);
  }

  const get = (p: string): string | undefined => props[p]?.[0];
  const getAll = (p: string): string[] => props[p] ?? [];

  return {
    uri: subject,
    type,
    label: get(label) ?? '',
    author: get(author) ?? '',
    created: get(created) ?? '',
    status: ((get(status) as Status) && (STATUSES as readonly string[]).includes(get(status)!) ? get(status) : Active) as Status,
    scope: ((get(scope) as Scope) && (SCOPES as readonly string[]).includes(get(scope)!) ? get(scope) : Private) as Scope,
    appliesTo: getAll(appliesTo),
    standardVersion: get(standardVersion) ?? STANDARD_VERSION,
    bodyUri: get(body),
    bodyHash: get(bodyHash),
    authoritativeSource: get(authoritativeSource),
    retrieve: get(retrieve),
    occurred: get(occurred),
    supersedes: get(supersedes),
    supersededBy: get(supersededBy),
  };
}

/**
 * Parse the index manifest Turtle into an IndexManifest.
 */
export function parseIndex(turtle: string, baseUrl: string): IndexManifest {
  const parser = new Parser({ baseIRI: baseUrl });
  const quads = parser.parse(turtle);

  // The Index is the subject typed mem:Index (typically <>)
  let indexSubject: string | undefined;
  for (const q of quads) {
    if (q.predicate.value === RDF_TYPE && q.object.value === Index) {
      indexSubject = q.subject.value;
      break;
    }
  }

  // Group quads by subject, skip the index itself, gather entry rows
  const bySubject: Record<string, Record<string, string[]>> = {};
  for (const q of quads) {
    const s = (bySubject[q.subject.value] ??= {});
    (s[q.predicate.value] ??= []).push(q.object.value);
  }

  let modified = '';
  let version = STANDARD_VERSION;
  if (indexSubject && bySubject[indexSubject]) {
    modified = bySubject[indexSubject][`${DCTERMS}modified`]?.[0] ?? '';
    version = bySubject[indexSubject][standardVersion]?.[0] ?? STANDARD_VERSION;
  }

  const entries: IndexEntry[] = [];
  for (const [subj, props] of Object.entries(bySubject)) {
    if (subj === indexSubject) continue;
    const types = props[RDF_TYPE] ?? [];
    const matchedType = types.find((t) => (ENTRY_TYPES as readonly string[]).includes(t));
    if (!matchedType) continue;

    entries.push({
      uri: subj,
      type: matchedType as EntryType,
      label: props[label]?.[0] ?? '',
      scope: ((props[scope]?.[0] as Scope) ?? Private) as Scope,
      appliesTo: props[appliesTo] ?? [],
      status: ((props[status]?.[0] as Status) ?? Active) as Status,
      modified: props[`${DCTERMS}modified`]?.[0] ?? '',
    });
  }

  return {
    uri: indexSubject ?? baseUrl,
    standardVersion: version,
    modified,
    entries,
  };
}
