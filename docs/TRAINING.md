# Agent Interition — Phase 1 Training Exercise

**Instructor:** Two (Agent Infrastructure Lead)
**Student:** You — a new developer joining Interition

This training walks you through everything Phase 1 built. By the end you will understand how AI agents get identity, storage, and the ability to share data — all built on open standards.

---

## Prerequisites

- Node.js 20+ (`node --version`)
- npm (`npm --version`)
- Git
- A terminal

---

## A Note on Docker

You may have noticed a `docker/` directory in this project. The Docker setup is built for **deployment** — it packages CSS, auto-bootstraps agents, and configures a Cloudflare tunnel in a single `docker-compose up`.

This training runs CSS **locally** instead, using `npm run css:start`. This is simpler for learning because you can see everything directly on your machine — no container layer in between.

| | Local (`npm run css:start`) | Docker (`docker-compose up`) |
|---|---|---|
| CSS server | Runs on your machine | Runs in a container |
| Data storage | `.solid-data/` folder | `pod-data` Docker volume |
| Agent bootstrap | Manual (CLI or scripts) | Automatic via `BOOTSTRAP_AGENTS` env var |
| Port | 3000 | 3000 (mapped) |
| Use case | Development / training | Deployment / demos |

You do **not** need Docker running for this training. Everything here uses the local server.

---

## Part 1: Get the Code

```bash
# Clone the repository
git clone https://github.com/interition/agent-interition.git
cd agent-interition

# Install dependencies
npm install
```

Take a look at the project structure:

```bash
ls -la src/
```

You'll see four key modules:
| Directory | Purpose |
|-----------|---------|
| `src/bootstrap/` | Creates agent accounts, WebIDs, and Pods |
| `src/auth/` | OAuth 2.0 client credentials for authenticated requests |
| `src/sharing/` | WAC (Web Access Control) — grant and revoke access |
| `src/demo/` | A working demo of two agents sharing data |

---

## Part 2: Start the Solid Server

Community Solid Server (CSS) is the Pod server. It stores all agent data.

```bash
npm run css:start
```

You should see output ending with something like:

```
Listening to server at http://localhost:3000/
```

**Leave this terminal running.** Open a new terminal for the next steps.

**What just happened?**
- CSS started on port 3000
- It's using file-based storage in `.solid-data/`
- It's ready to create accounts, Pods, and manage access control

Visit http://localhost:3000/ in your browser — you'll see the CSS welcome page.

---

## Part 3: Provision Your First Agent

Now let's create an agent. This gives it:
1. A **CSS account** (like a user account on the server)
2. A **WebID** (a globally unique identity URL)
3. A **Pod** (personal data storage)
4. **Client credentials** (for programmatic authentication)

```bash
npm run bootstrap -- --name alice --displayName "Alice the Agent"
```

You'll see JSON output like:

```json
{
  "webId": "http://localhost:3000/alice/profile/card#me",
  "podUrl": "http://localhost:3000/alice/",
  "clientCredentials": {
    "id": "...",
    "secret": "..."
  }
}
```

**Save this output!** You'll need the credentials later.

**What just happened?** Six steps ran behind the scenes:

1. **Created a CSS account** — POST to `/.account/account/`
2. **Added password login** — so the agent can authenticate
3. **Created a Pod** — storage space at `/agents/alice/`
4. **Generated client credentials** — OAuth 2.0 id + secret
5. **Patched WebID profile** — added RDF metadata (name, type)
6. **Created Pod structure** — three containers: `memory/`, `shared/`, `conversations/`

**Explore the Pod in your browser:**

- WebID profile: http://localhost:3000/alice/profile/card#me
- Pod root: http://localhost:3000/alice/
- Shared folder: http://localhost:3000/alice/shared/
- Memory folder: http://localhost:3000/alice/memory/

---

## Part 4: Understand What a WebID Is

Open Alice's WebID in your browser:

```
http://localhost:3000/alice/profile/card#me
```

This returns RDF (Linked Data). The profile says things like:

```turtle
<#me> a <http://xmlns.com/foaf/0.1/Agent> ;
      <http://xmlns.com/foaf/0.1/name> "Alice the Agent" ;
      <https://interition.com/ns/agent#agentName> "alice" .
```

**Key concepts:**
- A **WebID** is a URL that identifies an agent (or person)
- The `#me` fragment points to the specific entity in the document
- Other agents use this URL to refer to Alice
- It's an open standard — any Solid-compliant server can host one

---

## Part 5: Write Code — Provision a WebID and Pod Programmatically

Create a new file to do what the CLI did, but in code:

```bash
touch src/training/step1-provision.ts
```

Paste this into `src/training/step1-provision.ts`:

```typescript
/**
 * Training Step 1: Provision a WebID and Pod programmatically
 *
 * This does the same thing as:
 *   npm run bootstrap -- --name bob --displayName "Bob the Builder"
 *
 * But now you can see every step in code.
 */
import { provisionAgent } from '../bootstrap/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  console.log('=== Step 1: Provisioning Agent Bob ===\n');

  const bob = await provisionAgent({
    name: 'bob',
    displayName: 'Bob the Builder',
    serverUrl: SERVER_URL,
  });

  console.log('WebID:       ', bob.webId);
  console.log('Pod URL:     ', bob.podUrl);
  console.log('Credential ID:', bob.clientCredentials.id);
  console.log('Secret:       ', bob.clientCredentials.secret);
  console.log('\nBob now has:');
  console.log('  - A globally unique identity (WebID)');
  console.log('  - Personal storage (Pod) with memory/, shared/, conversations/');
  console.log('  - OAuth credentials to authenticate programmatically');

  return bob;
}

main().catch(console.error);
```

Run it:

```bash
npx tsx src/training/step1-provision.ts
```

Visit Bob's profile: http://localhost:3000/bob/profile/card#me

---

## Part 6: Write Code — Authenticate and Write Data

Now let's have Bob write something to his Pod. Agents need to authenticate first.

Create `src/training/step2-write-data.ts`:

```typescript
/**
 * Training Step 2: Authenticate as an agent and write data to its Pod
 *
 * This demonstrates:
 *   1. Getting an authenticated fetch using client credentials
 *   2. Writing RDF (Linked Data) to the agent's Pod
 *   3. Reading it back to verify
 */
import { provisionAgent } from '../bootstrap/index.js';
import { getAuthenticatedFetch } from '../auth/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  // --- Provision a fresh agent ---
  console.log('=== Step 2: Write Data to a Pod ===\n');
  console.log('Provisioning agent "carol"...');

  const carol = await provisionAgent({
    name: 'carol',
    displayName: 'Carol the Creator',
    serverUrl: SERVER_URL,
  });

  console.log(`Carol's WebID: ${carol.webId}\n`);

  // --- Get authenticated fetch ---
  // This exchanges client credentials for a Bearer token
  // The returned fetch function automatically adds the Authorization header
  console.log('Authenticating with client credentials...');

  const authFetch = await getAuthenticatedFetch(
    SERVER_URL,
    carol.clientCredentials.id,
    carol.clientCredentials.secret
  );

  console.log('Authenticated! Carol can now read/write her Pod.\n');

  // --- Write a Turtle document to the Pod ---
  // Turtle is a human-readable RDF format
  const noteContent = `
@prefix schema: <http://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#note1>
    a schema:TextDigitalDocument ;
    schema:name "My First Note" ;
    schema:text "Hello from Carol! This is data stored in my Solid Pod." ;
    schema:dateCreated "${new Date().toISOString()}"^^xsd:dateTime .
`;

  const noteUrl = `${carol.podUrl}shared/my-note.ttl`;
  console.log(`Writing note to: ${noteUrl}`);

  const writeResponse = await authFetch(noteUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: noteContent,
  });

  console.log(`Write response: ${writeResponse.status} ${writeResponse.statusText}\n`);

  // --- Read it back ---
  console.log('Reading the note back...');
  const readResponse = await authFetch(noteUrl);
  const body = await readResponse.text();

  console.log(`Read response: ${readResponse.status}`);
  console.log('Content:');
  console.log('---');
  console.log(body);
  console.log('---');
  console.log('\nCarol wrote Linked Data to her Pod and read it back!');
}

main().catch(console.error);
```

Run it:

```bash
npx tsx src/training/step2-write-data.ts
```

**What just happened?**

1. **Authentication**: Carol's credentials were exchanged for a Bearer token via OAuth 2.0
2. **Write**: A PUT request stored Turtle (RDF) in Carol's Pod at `/shared/my-note.ttl`
3. **Read**: A GET request retrieved the data back

The data is **Linked Data** — it uses standard vocabularies (schema.org) so any application that understands RDF can read it.

---

## Part 7: Write Code — Grant Access and Share Data

This is the core of what makes Solid powerful: **controlled sharing**.

Create `src/training/step3-sharing.ts`:

```typescript
/**
 * Training Step 3: Two agents sharing data with access control
 *
 * This demonstrates:
 *   1. Agent A writes data to its Pod
 *   2. Agent B tries to read it — DENIED (403)
 *   3. Agent A grants Agent B read access via WAC
 *   4. Agent B reads it — SUCCESS (200)
 *   5. Agent A revokes access
 *   6. Agent B tries again — DENIED (403)
 *
 * This is the fundamental pattern for agent-to-agent collaboration.
 */
import { provisionAgent } from '../bootstrap/index.js';
import { getAuthenticatedFetch } from '../auth/index.js';
import { grantAccess, revokeAccess } from '../sharing/index.js';
import type { AccessMode } from '../sharing/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  console.log('=== Step 3: Agent-to-Agent Sharing ===\n');

  // --- Create WebID and Pod for two agents ---
  console.log('Provisioning Agent Dan...');
  const dan = await provisionAgent({
    name: 'dan',
    displayName: 'Dan the Data Owner',
    serverUrl: SERVER_URL,
  });

  console.log('Provisioning Agent Eve...');
  const eve = await provisionAgent({
    name: 'eve',
    displayName: 'Eve the Explorer',
    serverUrl: SERVER_URL,
  });

  console.log(`Dan's WebID: ${dan.webId}`);
  console.log(`Eve's WebID: ${eve.webId}\n`);

  // --- Authenticate both agents ---
  const danFetch = await getAuthenticatedFetch(
    SERVER_URL, dan.clientCredentials.id, dan.clientCredentials.secret
  );
  const eveFetch = await getAuthenticatedFetch(
    SERVER_URL, eve.clientCredentials.id, eve.clientCredentials.secret
  );

  // --- Dan writes a secret document ---
  const secretUrl = `${dan.podUrl}shared/secret-plan.ttl`;

  const secretContent = `
@prefix schema: <http://schema.org/> .

<#plan>
    a schema:Message ;
    schema:text "The secret plan: deploy Solid Pods for all agents!" ;
    schema:author <${dan.webId}> .
`;

  console.log('Dan writes a secret document to his Pod...');
  await danFetch(secretUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: secretContent,
  });
  console.log('Written!\n');

  // --- Eve tries to read WITHOUT permission ---
  console.log('Eve tries to read Dan\'s secret (no permission yet)...');
  const denied = await eveFetch(secretUrl);
  console.log(`Response: ${denied.status} ${denied.statusText}`);
  console.log('ACCESS DENIED — as expected. Eve has no permission.\n');

  // --- Dan grants Eve read access ---
  console.log('Dan grants Eve READ access to his secret...');
  await grantAccess(
    secretUrl,           // the resource to share
    eve.webId,           // who to share with
    ['Read'] as AccessMode[],   // what access to give
    danFetch,            // Dan's authenticated fetch (he's the owner)
    dan.webId            // owner WebID — ensures Dan keeps access
  );
  console.log('Access granted!\n');

  // --- Eve reads WITH permission ---
  console.log('Eve tries again...');
  const allowed = await eveFetch(secretUrl);
  const content = await allowed.text();
  console.log(`Response: ${allowed.status} ${allowed.statusText}`);
  console.log('Content:');
  console.log('---');
  console.log(content);
  console.log('---');
  console.log('ACCESS GRANTED — Eve can now read the secret!\n');

  // --- Dan revokes Eve's access ---
  console.log('Dan revokes Eve\'s access...');
  await revokeAccess(
    secretUrl,    // the resource
    eve.webId,    // whose access to remove
    danFetch      // Dan's authenticated fetch
  );
  console.log('Access revoked!\n');

  // --- Eve tries again after revocation ---
  console.log('Eve tries one more time...');
  const revoked = await eveFetch(secretUrl);
  console.log(`Response: ${revoked.status} ${revoked.statusText}`);
  console.log('ACCESS DENIED — Dan revoked the permission.\n');

  // --- Summary ---
  console.log('=== Summary ===');
  console.log('1. Each agent has its own identity (WebID) and storage (Pod)');
  console.log('2. By default, only the owner can access their Pod');
  console.log('3. Owners can grant specific access (Read, Write, Append, Control)');
  console.log('4. Owners can revoke access at any time');
  console.log('5. This is WAC (Web Access Control) — a W3C standard');
  console.log('\nThis is the foundation for secure agent collaboration.');
}

main().catch(console.error);
```

Run it:

```bash
npx tsx src/training/step3-sharing.ts
```

You should see the full cycle: **write → deny → grant → allow → revoke → deny**.

---

## Part 8: Write Code — Multiple Access Modes

WAC supports four access modes. Let's explore them.

Create `src/training/step4-access-modes.ts`:

```typescript
/**
 * Training Step 4: Understanding WAC Access Modes
 *
 * WAC (Web Access Control) has four permission levels:
 *   - Read:    Can read the resource
 *   - Write:   Can overwrite the resource
 *   - Append:  Can add to the resource (but not overwrite)
 *   - Control: Can modify the ACL (permissions) of the resource
 *
 * This script demonstrates granting Write access so another agent
 * can collaborate by modifying shared data.
 */
import { provisionAgent } from '../bootstrap/index.js';
import { getAuthenticatedFetch } from '../auth/index.js';
import { grantAccess, revokeAccess } from '../sharing/index.js';
import type { AccessMode } from '../sharing/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  console.log('=== Step 4: Access Modes Deep Dive ===\n');

  // --- Create WebID and Pod for two agents ---
  const frank = await provisionAgent({
    name: 'frank', displayName: 'Frank', serverUrl: SERVER_URL,
  });
  const grace = await provisionAgent({
    name: 'grace', displayName: 'Grace', serverUrl: SERVER_URL,
  });

  const frankFetch = await getAuthenticatedFetch(
    SERVER_URL, frank.clientCredentials.id, frank.clientCredentials.secret
  );
  const graceFetch = await getAuthenticatedFetch(
    SERVER_URL, grace.clientCredentials.id, grace.clientCredentials.secret
  );

  // --- Frank creates a collaborative document ---
  const docUrl = `${frank.podUrl}shared/collab-doc.ttl`;

  await frankFetch(docUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: `
@prefix schema: <http://schema.org/> .
<#doc> a schema:TextDigitalDocument ;
    schema:name "Collaboration Document" ;
    schema:text "Frank started this document." .
`,
  });
  console.log('Frank created a collaborative document.\n');

  // --- Grant Read + Write access ---
  console.log('Frank grants Grace READ + WRITE access...');
  await grantAccess(
    docUrl,
    grace.webId,
    ['Read', 'Write'] as AccessMode[],  // Two modes!
    frankFetch,
    frank.webId  // owner WebID — ensures Frank keeps access
  );
  console.log('Granted!\n');

  // --- Grace reads the document ---
  console.log('Grace reads the document:');
  const readRes = await graceFetch(docUrl);
  console.log(await readRes.text());

  // --- Grace overwrites with her changes ---
  console.log('Grace updates the document...');
  const updateRes = await graceFetch(docUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: `
@prefix schema: <http://schema.org/> .
<#doc> a schema:TextDigitalDocument ;
    schema:name "Collaboration Document" ;
    schema:text "Grace updated this document! Frank started it, Grace improved it." .
`,
  });
  console.log(`Update response: ${updateRes.status} ${updateRes.statusText}\n`);

  // --- Frank reads Grace's changes ---
  console.log('Frank reads the updated document:');
  const frankRead = await frankFetch(docUrl);
  console.log(await frankRead.text());

  // --- Clean up ---
  console.log('Frank revokes Grace\'s access...');
  await revokeAccess(docUrl, grace.webId, frankFetch);
  console.log('Revoked.\n');

  console.log('=== Access Modes Reference ===');
  console.log('  Read    — GET requests (view data)');
  console.log('  Write   — PUT/DELETE requests (modify/remove data)');
  console.log('  Append  — POST requests (add data, cannot overwrite)');
  console.log('  Control — modify .acl files (manage permissions)');
  console.log('\nCombine modes for fine-grained access control.');
}

main().catch(console.error);
```

Run it:

```bash
npx tsx src/training/step4-access-modes.ts
```

---

## Part 9: Run the Built-in Demo

The repository includes a complete demo that does everything above in one go:

```bash
npm run demo
```

Read the source to see how it all fits together:

```
src/demo/two-agents.ts
```

---

## Part 10: Run the Tests

```bash
# Unit tests (no server needed)
npm test

# Integration tests (requires CSS running on port 3000)
CSS_URL=http://localhost:3000 npm test
```

---

## Part 11: Clean Up

```bash
# Stop the CSS server (Ctrl+C in its terminal)

# Remove local data
npm run clean
```

---

## What You Learned

| Concept | What It Means |
|---------|--------------|
| **WebID** | A URL that uniquely identifies an agent |
| **Pod** | Personal data storage the agent (and its user) owns |
| **CSS** | Community Solid Server — hosts Pods |
| **WAC** | Web Access Control — W3C standard for permissions |
| **Client Credentials** | OAuth 2.0 tokens for programmatic authentication |
| **Turtle** | Human-readable RDF format for Linked Data |
| **ACL** | Access Control List — a file that defines who can access what |

## The Big Picture

```
┌──────────────┐          ┌──────────────┐
│  Agent Dan   │          │  Agent Eve   │
│  (WebID)     │          │  (WebID)     │
│              │          │              │
│  Pod:        │   WAC    │  Pod:        │
│  /shared/  ──┼──grant──►│  can read    │
│  /memory/    │  revoke  │  Dan's data  │
│              │◄─────────┤              │
└──────────────┘          └──────────────┘
       │                         │
       └────── CSS (port 3000) ──┘
```

**Agents own their data. They choose who to share it with. They can revoke access at any time.**

That's the Solid promise — and it works today.

---

## Next Steps

- Read `docs/STRATEGY.md` for the full technical strategy
- Look at the source code in `src/bootstrap/agent-provisioner.ts` to see the 6-step provisioning flow
- Look at `src/sharing/acl-manager.ts` to see how WAC rules are written
- Phase 2 will package all of this as an OpenClaw Skill
