import type { MemoryEntry, IndexManifest, IndexEntry, WriteEntryInput } from './types.js';
import {
  containerForType,
  CONTAINERS,
  Episode,
  Identity,
  Reference,
  STANDARD_VERSION,
  Active,
  Superseded,
} from './vocab.js';
import type { EntryType } from './vocab.js';
import { hashBody, verifyBodyHash } from './hash.js';
import { episodeSlug, slugify } from './slug.js';
import { parseEntry, parseIndex } from './parse.js';
import { serializeEntry, serializeIndex, buildEntry } from './serialize.js';
import { validateEntry, validateWrite } from './validate.js';

export interface MemoryStoreOptions {
  podBase: string; // e.g. "https://orion.interition-lab/orion/"
  agentWebId: string; // e.g. "https://orion.interition-lab/orion/profile/card#me"
  authFetch: typeof fetch;
}

export class MemoryStore {
  private readonly podBase: string;
  private readonly memoryBase: string;
  private readonly indexUrl: string;
  private readonly agentWebId: string;
  private readonly authFetch: typeof fetch;

  constructor(opts: MemoryStoreOptions) {
    this.podBase = opts.podBase.endsWith('/') ? opts.podBase : `${opts.podBase}/`;
    this.memoryBase = `${this.podBase}memory/`;
    this.indexUrl = `${this.memoryBase}index.ttl`;
    this.agentWebId = opts.agentWebId;
    this.authFetch = opts.authFetch;
  }

  /**
   * Ensure the memory/ container layout exists. Idempotent — creates only what's missing.
   */
  async ensureContainers(): Promise<void> {
    const containers = [
      this.memoryBase,
      `${this.memoryBase}${CONTAINERS.identity}`,
      `${this.memoryBase}${CONTAINERS.preferences}`,
      `${this.memoryBase}${CONTAINERS.procedures}`,
      `${this.memoryBase}${CONTAINERS.references}`,
      `${this.memoryBase}${CONTAINERS.episodes}`,
      `${this.memoryBase}${CONTAINERS.superseded}`,
    ];
    for (const c of containers) {
      await this.ensureContainer(c);
    }
    // Initialise the index if missing
    const head = await this.authFetch(this.indexUrl, { method: 'HEAD' });
    if (head.status === 404) {
      const empty: IndexManifest = {
        uri: this.indexUrl,
        standardVersion: STANDARD_VERSION,
        modified: new Date().toISOString(),
        entries: [],
      };
      await this.putTurtle(this.indexUrl, serializeIndex(empty));
    }
  }

  /**
   * Load the index manifest. Always loaded at session-start.
   */
  async loadIndex(): Promise<IndexManifest> {
    const res = await this.authFetch(this.indexUrl);
    if (!res.ok) {
      if (res.status === 404) {
        return {
          uri: this.indexUrl,
          standardVersion: STANDARD_VERSION,
          modified: new Date().toISOString(),
          entries: [],
        };
      }
      throw new Error(`Failed to load index: ${res.status}`);
    }
    return parseIndex(await res.text(), this.indexUrl);
  }

  /**
   * Load a single entry by URI (the metadata resource URL).
   * Body is fetched lazily — entry.body remains undefined until loadBody() is called.
   */
  async getEntry(metadataUrl: string): Promise<MemoryEntry> {
    const res = await this.authFetch(metadataUrl);
    if (!res.ok) throw new Error(`Failed to load entry ${metadataUrl}: ${res.status}`);
    const turtle = await res.text();
    const entry = parseEntry(turtle, metadataUrl);
    // Restore the URI to the metadata URL with the fragment we serialized
    entry.uri = `${metadataUrl}#entry`;
    const validation = validateEntry(entry);
    if (!validation.valid) {
      throw new Error(
        `Invalid entry at ${metadataUrl}: ${validation.errors.map((e) => e.message).join('; ')}`,
      );
    }
    return entry;
  }

  /**
   * Fetch the markdown body for an entry and verify its hash.
   * Returns the markdown content. Throws on hash mismatch.
   */
  async loadBody(entry: MemoryEntry): Promise<string> {
    if (!entry.bodyUri) throw new Error(`Entry ${entry.uri} has no body`);
    const res = await this.authFetch(entry.bodyUri);
    if (!res.ok) throw new Error(`Failed to load body ${entry.bodyUri}: ${res.status}`);
    const content = await res.text();
    if (entry.bodyHash && !verifyBodyHash(content, entry.bodyHash)) {
      throw new Error(`Body hash mismatch for ${entry.uri} — drift detected`);
    }
    return content;
  }

  /**
   * Load all entries whose appliesTo tags intersect with the provided tags.
   * Identity entries are always included regardless of tags.
   */
  async loadByTags(tags: string[]): Promise<MemoryEntry[]> {
    const index = await this.loadIndex();
    const tagSet = new Set(tags);
    const matched = index.entries.filter((e) => {
      if (e.status !== Active) return false;
      if (e.type === Identity) return true;
      return e.appliesTo.some((t) => tagSet.has(t));
    });
    return Promise.all(matched.map((e) => this.getEntry(stripFragment(e.uri))));
  }

  async loadIdentity(): Promise<MemoryEntry | null> {
    const index = await this.loadIndex();
    const id = index.entries.find((e) => e.type === Identity && e.status === Active);
    if (!id) return null;
    return this.getEntry(stripFragment(id.uri));
  }

  /**
   * List all entries on the Pod by walking each container. Used by reconstitute
   * to confirm what's on disk vs what's in the index.
   */
  async listAll(): Promise<IndexEntry[]> {
    const index = await this.loadIndex();
    return index.entries;
  }

  /**
   * Write a new memory entry.
   * Atomic protocol per standard §7.1: body → metadata → index PATCH/PUT.
   * Throws on validation failure or HTTP failure. Caller decides retry.
   */
  async write(input: WriteEntryInput): Promise<MemoryEntry> {
    const validation = validateWrite(input);
    if (!validation.valid) {
      throw new MemoryValidationError(validation.errors.map((e) => e.message).join('; '), validation.errors);
    }

    const slug = this.slugForInput(input);
    const container = `${this.memoryBase}${containerForType(input.type as EntryType)}`;
    const metadataUrl = `${container}${slug}.ttl`;
    const bodyUrl = input.body ? `${container}${slug}.md` : undefined;

    // Step 1: PUT body if applicable
    let computedHash: string | undefined;
    if (input.body && bodyUrl) {
      computedHash = hashBody(input.body);
      await this.putMarkdown(bodyUrl, input.body);
    }

    // Step 2: PUT metadata
    const entry = buildEntry(input, {
      uri: `${metadataUrl}#entry`,
      authorWebId: this.agentWebId,
      bodyUri: bodyUrl,
      bodyHash: computedHash,
    });
    await this.putTurtle(metadataUrl, serializeEntry(entry));

    // Step 3: update the index (full PUT — small file). v0.4 may switch to PATCH.
    await this.addToIndex(entry, metadataUrl);

    return entry;
  }

  /**
   * Supersede an existing entry.
   * - Writes new pair to the same container as the old entry
   * - Updates the new entry's mem:supersedes to point at the moved old metadata
   * - Moves the old pair to superseded/<container-name>/<slug>.{ttl,md}
   * - Updates old metadata with mem:supersededBy and mem:status mem:Superseded
   * - Updates the index (removes old, adds new)
   */
  async supersede(oldEntryUri: string, input: WriteEntryInput): Promise<MemoryEntry> {
    const oldMetadataUrl = stripFragment(oldEntryUri);
    const oldEntry = await this.getEntry(oldMetadataUrl);

    if (oldEntry.type === Identity) {
      throw new Error('Identity entries are write-once and cannot be superseded via this API.');
    }
    if (oldEntry.type === Episode) {
      throw new Error('Episodes are append-only and cannot be superseded.');
    }

    // Move the old entry to superseded/<container>/
    const containerSlug = containerForType(oldEntry.type);
    const oldSlug = oldMetadataUrl.split('/').slice(-1)[0].replace(/\.ttl$/, '');
    const movedTtlUrl = `${this.memoryBase}${CONTAINERS.superseded}${containerSlug}${oldSlug}.ttl`;
    const movedMdUrl = oldEntry.bodyUri
      ? `${this.memoryBase}${CONTAINERS.superseded}${containerSlug}${oldSlug}.md`
      : undefined;

    await this.ensureContainer(`${this.memoryBase}${CONTAINERS.superseded}${containerSlug}`);

    // Move body first (if present)
    if (oldEntry.bodyUri && movedMdUrl) {
      const bodyContent = await this.loadBody(oldEntry);
      await this.putMarkdown(movedMdUrl, bodyContent);
      await this.deleteResource(oldEntry.bodyUri);
    }

    // Write the moved metadata with status Superseded
    const movedEntry: MemoryEntry = {
      ...oldEntry,
      uri: `${movedTtlUrl}#entry`,
      bodyUri: movedMdUrl,
      status: Superseded,
    };
    await this.putTurtle(movedTtlUrl, serializeEntry(movedEntry));
    await this.deleteResource(oldMetadataUrl);

    // Now write the new entry, supersedes pointing at the moved old metadata fragment
    const validation = validateWrite(input);
    if (!validation.valid) {
      throw new MemoryValidationError(validation.errors.map((e) => e.message).join('; '), validation.errors);
    }

    const slug = this.slugForInput(input);
    const container = `${this.memoryBase}${containerForType(input.type as EntryType)}`;
    const newMetadataUrl = `${container}${slug}.ttl`;
    const newBodyUrl = input.body ? `${container}${slug}.md` : undefined;

    let newHash: string | undefined;
    if (input.body && newBodyUrl) {
      newHash = hashBody(input.body);
      await this.putMarkdown(newBodyUrl, input.body);
    }

    const newEntry = buildEntry(input, {
      uri: `${newMetadataUrl}#entry`,
      authorWebId: this.agentWebId,
      bodyUri: newBodyUrl,
      bodyHash: newHash,
      supersedes: movedEntry.uri,
    });
    await this.putTurtle(newMetadataUrl, serializeEntry(newEntry));

    // Update the moved old metadata with supersededBy now that we know the new URI
    movedEntry.supersededBy = newEntry.uri;
    await this.putTurtle(movedTtlUrl, serializeEntry(movedEntry));

    // Index: remove the old entry, add the new
    await this.replaceIndexEntry(oldEntry.uri, newEntry, newMetadataUrl);

    return newEntry;
  }

  // ── Internals ──

  private slugForInput(input: WriteEntryInput): string {
    if (input.type === Episode && input.occurred) {
      return episodeSlug(input.label, input.occurred);
    }
    return slugify(input.label);
  }

  private async addToIndex(entry: MemoryEntry, metadataUrl: string): Promise<void> {
    const index = await this.loadIndex();
    index.entries.push({
      uri: `${metadataUrl}#entry`,
      type: entry.type,
      label: entry.label,
      scope: entry.scope,
      appliesTo: entry.appliesTo,
      status: entry.status,
      modified: entry.created,
    });
    index.modified = new Date().toISOString();
    await this.putTurtle(this.indexUrl, serializeIndex(index));
  }

  private async replaceIndexEntry(
    oldUri: string,
    newEntry: MemoryEntry,
    newMetadataUrl: string,
  ): Promise<void> {
    const index = await this.loadIndex();
    index.entries = index.entries.filter((e) => e.uri !== oldUri);
    index.entries.push({
      uri: `${newMetadataUrl}#entry`,
      type: newEntry.type,
      label: newEntry.label,
      scope: newEntry.scope,
      appliesTo: newEntry.appliesTo,
      status: newEntry.status,
      modified: newEntry.created,
    });
    index.modified = new Date().toISOString();
    await this.putTurtle(this.indexUrl, serializeIndex(index));
  }

  private async ensureContainer(url: string): Promise<void> {
    const head = await this.authFetch(url, { method: 'HEAD' });
    if (head.ok) return;
    if (head.status !== 404) {
      throw new Error(`Unexpected status checking ${url}: ${head.status}`);
    }
    const res = await this.authFetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/turtle',
        link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
      },
      body: '',
    });
    if (!res.ok && res.status !== 409) {
      throw new Error(`Failed to create container ${url}: ${res.status} ${await res.text()}`);
    }
  }

  private async putTurtle(url: string, body: string): Promise<void> {
    const res = await this.authFetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'text/turtle' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Failed to PUT ${url}: ${res.status} ${await res.text()}`);
    }
  }

  private async putMarkdown(url: string, body: string): Promise<void> {
    const res = await this.authFetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'text/markdown' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Failed to PUT ${url}: ${res.status} ${await res.text()}`);
    }
  }

  private async deleteResource(url: string): Promise<void> {
    const res = await this.authFetch(url, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to DELETE ${url}: ${res.status}`);
    }
  }
}

export class MemoryValidationError extends Error {
  constructor(message: string, public readonly errors: import('./types.js').ValidationError[]) {
    super(message);
    this.name = 'MemoryValidationError';
  }
}

function stripFragment(uri: string): string {
  const i = uri.indexOf('#');
  return i === -1 ? uri : uri.slice(0, i);
}
