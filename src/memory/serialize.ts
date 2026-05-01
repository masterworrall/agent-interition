import { Writer, DataFactory } from 'n3';
import type { MemoryEntry, IndexManifest, IndexEntry, WriteEntryInput } from './types.js';
import {
  MEM,
  RDF_TYPE,
  XSD,
  DCTERMS,
  STANDARD_VERSION,
  Active,
  Private,
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
  Index,
} from './vocab.js';
import type { EntryType } from './vocab.js';

const { namedNode, literal, quad } = DataFactory;

/**
 * Serialize a MemoryEntry to Turtle. The result is the .ttl content for the metadata resource.
 * The fragment <#entry> is used as the entry's identifier within the resource.
 */
export function serializeEntry(entry: MemoryEntry): string {
  const writer = new Writer({
    prefixes: {
      mem: MEM,
      xsd: XSD,
      dcterms: DCTERMS,
    },
  });

  const subject = namedNode('#entry');

  writer.addQuad(quad(subject, namedNode(RDF_TYPE), namedNode(entry.type)));
  writer.addQuad(quad(subject, namedNode(label), literal(entry.label)));
  writer.addQuad(quad(subject, namedNode(author), namedNode(entry.author)));
  writer.addQuad(
    quad(subject, namedNode(created), literal(entry.created, namedNode(`${XSD}dateTime`))),
  );
  writer.addQuad(quad(subject, namedNode(status), namedNode(entry.status)));
  writer.addQuad(quad(subject, namedNode(scope), namedNode(entry.scope)));
  writer.addQuad(quad(subject, namedNode(standardVersion), literal(entry.standardVersion)));

  for (const tag of entry.appliesTo) {
    writer.addQuad(quad(subject, namedNode(appliesTo), literal(tag)));
  }

  if (entry.bodyUri) {
    writer.addQuad(quad(subject, namedNode(body), namedNode(entry.bodyUri)));
  }
  if (entry.bodyHash) {
    writer.addQuad(quad(subject, namedNode(bodyHash), literal(entry.bodyHash)));
  }
  if (entry.authoritativeSource) {
    writer.addQuad(
      quad(subject, namedNode(authoritativeSource), namedNode(entry.authoritativeSource)),
    );
  }
  if (entry.retrieve) {
    writer.addQuad(quad(subject, namedNode(retrieve), literal(entry.retrieve)));
  }
  if (entry.occurred) {
    writer.addQuad(
      quad(subject, namedNode(occurred), literal(entry.occurred, namedNode(`${XSD}dateTime`))),
    );
  }
  if (entry.supersedes) {
    writer.addQuad(quad(subject, namedNode(supersedes), namedNode(entry.supersedes)));
  }
  if (entry.supersededBy) {
    writer.addQuad(quad(subject, namedNode(supersededBy), namedNode(entry.supersededBy)));
  }

  return writeAndReturn(writer);
}

/**
 * Serialize the index manifest to Turtle.
 */
export function serializeIndex(manifest: IndexManifest): string {
  const writer = new Writer({
    prefixes: {
      mem: MEM,
      xsd: XSD,
      dcterms: DCTERMS,
    },
  });

  const indexNode = namedNode('');
  writer.addQuad(quad(indexNode, namedNode(RDF_TYPE), namedNode(Index)));
  writer.addQuad(quad(indexNode, namedNode(standardVersion), literal(manifest.standardVersion)));
  writer.addQuad(
    quad(
      indexNode,
      namedNode(`${DCTERMS}modified`),
      literal(manifest.modified, namedNode(`${XSD}dateTime`)),
    ),
  );

  for (const entry of manifest.entries) {
    const entryNode = namedNode(entry.uri);
    writer.addQuad(quad(entryNode, namedNode(RDF_TYPE), namedNode(entry.type)));
    writer.addQuad(quad(entryNode, namedNode(label), literal(entry.label)));
    writer.addQuad(quad(entryNode, namedNode(scope), namedNode(entry.scope)));
    writer.addQuad(quad(entryNode, namedNode(status), namedNode(entry.status)));
    writer.addQuad(
      quad(
        entryNode,
        namedNode(`${DCTERMS}modified`),
        literal(entry.modified, namedNode(`${XSD}dateTime`)),
      ),
    );
    for (const tag of entry.appliesTo) {
      writer.addQuad(quad(entryNode, namedNode(appliesTo), literal(tag)));
    }
  }

  return writeAndReturn(writer);
}

/**
 * Build a fresh MemoryEntry from a WriteEntryInput, populating defaults.
 */
export function buildEntry(
  input: WriteEntryInput,
  opts: {
    uri: string;
    authorWebId: string;
    bodyUri?: string;
    bodyHash?: string;
    supersedes?: string;
    nowIso?: string;
  },
): MemoryEntry {
  const now = opts.nowIso ?? new Date().toISOString();
  return {
    uri: opts.uri,
    type: input.type as EntryType,
    label: input.label,
    author: opts.authorWebId,
    created: now,
    status: Active,
    scope: input.scope ?? Private,
    appliesTo: input.appliesTo ?? [],
    standardVersion: STANDARD_VERSION,
    bodyUri: opts.bodyUri,
    bodyHash: opts.bodyHash,
    authoritativeSource: input.authoritativeSource,
    retrieve: input.retrieve,
    occurred: input.occurred,
    supersedes: opts.supersedes,
  };
}

function writeAndReturn(writer: Writer): string {
  let result = '';
  writer.end((error, output) => {
    if (error) throw error;
    result = output;
  });
  return result;
}
