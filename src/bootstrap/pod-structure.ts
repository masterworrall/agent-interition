/**
 * Creates the standard container structure inside an agent's pod.
 * Containers in Solid are created by PUT-ing with the right content type.
 */
export async function createPodContainers(
  podUrl: string,
  authFetch: typeof fetch,
  ownerWebId?: string,
): Promise<void> {
  const containers = ['memory/', 'shared/', 'conversations/', 'inbox/'];

  for (const container of containers) {
    const url = new URL(container, podUrl).href;
    const res = await authFetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/turtle',
        'if-none-match': '*',
        link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
      },
      body: '',
    });
    // 201 Created or 409 Conflict (already exists) are both fine
    if (!res.ok && res.status !== 409) {
      throw new Error(`Failed to create container ${container}: ${res.status} ${await res.text()}`);
    }
  }

  // Set inbox ACL: owner gets full control, all authenticated agents can append
  if (ownerWebId) {
    const inboxUrl = new URL('inbox/', podUrl).href;
    await setInboxAcl(inboxUrl, ownerWebId, authFetch);
  }
}

/**
 * Sets the ACL for the inbox container:
 * - Owner: Read, Write, Control
 * - All authenticated agents: Append only
 * - Uses acl:default so individual notifications inherit the container ACL
 */
async function setInboxAcl(
  inboxUrl: string,
  ownerWebId: string,
  authFetch: typeof fetch,
): Promise<void> {
  const aclUrl = `${inboxUrl}.acl`;
  const aclBody = `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#owner>
    a acl:Authorization;
    acl:agent <${ownerWebId}>;
    acl:accessTo <${inboxUrl}>;
    acl:default <${inboxUrl}>;
    acl:mode acl:Read, acl:Write, acl:Control.

<#authenticated-append>
    a acl:Authorization;
    acl:agentClass acl:AuthenticatedAgent;
    acl:accessTo <${inboxUrl}>;
    acl:default <${inboxUrl}>;
    acl:mode acl:Append.
`;

  const res = await authFetch(aclUrl, {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: aclBody,
  });

  if (!res.ok) {
    throw new Error(`Failed to set inbox ACL: ${res.status} ${await res.text()}`);
  }
}
