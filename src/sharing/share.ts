import { grantAccess } from './acl-manager.js';
import { sendNotification } from '../notifications/inbox.js';
import { findAgentByName } from '../discovery/directory.js';
import { AccessMode } from './types.js';

export interface ShareResult {
  granted: boolean;
  notified: boolean;
  notificationUrl?: string;
  error?: string;
}

/**
 * High-level sharing: grants access on a resource and sends a notification
 * to the recipient's inbox. If notification fails, the ACL grant still stands.
 */
export async function shareResource(
  resourceUrl: string,
  recipientWebId: string,
  recipientInboxUrl: string,
  modes: AccessMode[],
  senderWebId: string,
  authFetch: typeof fetch,
): Promise<ShareResult> {
  // Step 1: Grant access
  await grantAccess(resourceUrl, recipientWebId, modes, authFetch, senderWebId);

  // Step 2: Send notification (best-effort)
  try {
    const notificationUrl = await sendNotification(
      recipientInboxUrl,
      senderWebId,
      recipientWebId,
      resourceUrl,
      modes,
      authFetch,
    );

    return { granted: true, notified: true, notificationUrl };
  } catch (err) {
    return {
      granted: true,
      notified: false,
      error: `Notification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Convenience: discover an agent by name, then share a resource with them.
 */
export async function shareResourceByName(
  resourceUrl: string,
  recipientName: string,
  modes: AccessMode[],
  senderWebId: string,
  serverUrl: string,
  authFetch: typeof fetch,
): Promise<ShareResult> {
  const agent = await findAgentByName(serverUrl, recipientName, authFetch);
  if (!agent) {
    throw new Error(`Agent "${recipientName}" not found in directory`);
  }

  const inboxUrl = `${agent.podUrl}inbox/`;
  return shareResource(resourceUrl, agent.webId, inboxUrl, modes, senderWebId, authFetch);
}
