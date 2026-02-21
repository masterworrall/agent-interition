import { Parser } from 'n3';
import { SharingNotification } from './types.js';

/**
 * Sends a sharing notification to an agent's inbox using LDP POST.
 * CSS auto-generates the notification URI; the Location header gives us the URL.
 */
export async function sendNotification(
  inboxUrl: string,
  senderWebId: string,
  recipientWebId: string,
  resourceUrl: string,
  modes: string[],
  authFetch: typeof fetch,
): Promise<string> {
  const now = new Date().toISOString();
  const modeList = modes.map((m) => `"${m}"`).join(', ');

  const body = `@prefix as: <https://www.w3.org/ns/activitystreams#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

<> a as:Announce;
    as:actor <${senderWebId}>;
    as:target <${recipientWebId}>;
    as:object <${resourceUrl}>;
    as:summary "Resource shared: ${resourceUrl}";
    as:published "${now}"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
    solid:accessModes ${modeList}.
`;

  const res = await authFetch(inboxUrl, {
    method: 'POST',
    headers: {
      'content-type': 'text/turtle',
      slug: `notification-${Date.now()}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Failed to send notification: ${res.status} ${await res.text()}`);
  }

  // CSS returns the created resource URL in the Location header
  const location = res.headers.get('location');
  if (location) {
    return new URL(location, inboxUrl).href;
  }

  // Fallback: can't determine exact URL
  return inboxUrl;
}

/**
 * Checks an agent's inbox for sharing notifications.
 * Reads the inbox container, then fetches each notification.
 */
export async function checkInbox(
  inboxUrl: string,
  authFetch: typeof fetch,
): Promise<SharingNotification[]> {
  // GET the inbox container to list contained resources
  const res = await authFetch(inboxUrl, {
    headers: { accept: 'text/turtle' },
  });

  if (!res.ok) {
    throw new Error(`Failed to read inbox: ${res.status} ${await res.text()}`);
  }

  const containerTurtle = await res.text();
  const notificationUrls = parseContainerMembers(containerTurtle, inboxUrl);

  const notifications: SharingNotification[] = [];
  for (const url of notificationUrls) {
    try {
      const notification = await fetchNotification(url, authFetch);
      if (notification) {
        notifications.push(notification);
      }
    } catch {
      // Skip unreadable notifications
    }
  }

  return notifications;
}

/**
 * Deletes a notification from an agent's inbox.
 */
export async function deleteNotification(
  notificationUrl: string,
  authFetch: typeof fetch,
): Promise<void> {
  const res = await authFetch(notificationUrl, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete notification: ${res.status} ${await res.text()}`);
  }
}

/**
 * Parses an LDP container's Turtle to extract contained resource URLs.
 */
function parseContainerMembers(turtle: string, baseUrl: string): string[] {
  const parser = new Parser({ baseIRI: baseUrl });
  const urls: string[] = [];

  try {
    const quads = parser.parse(turtle);
    for (const quad of quads) {
      if (
        quad.predicate.value === 'http://www.w3.org/ns/ldp#contains'
      ) {
        urls.push(quad.object.value);
      }
    }
  } catch {
    // If parsing fails, return empty list
  }

  return urls;
}

/**
 * Fetches and parses a single notification resource.
 */
async function fetchNotification(
  url: string,
  authFetch: typeof fetch,
): Promise<SharingNotification | null> {
  const res = await authFetch(url, {
    headers: { accept: 'text/turtle' },
  });

  if (!res.ok) return null;

  const turtle = await res.text();
  return parseNotification(turtle, url);
}

/**
 * Parses a notification's Turtle into a SharingNotification object.
 */
function parseNotification(turtle: string, url: string): SharingNotification | null {
  const parser = new Parser({ baseIRI: url });

  let actor = '';
  let target = '';
  let resourceUrl = '';
  let published = '';
  let summary = '';
  const modes: string[] = [];

  try {
    const quads = parser.parse(turtle);
    for (const quad of quads) {
      switch (quad.predicate.value) {
        case 'https://www.w3.org/ns/activitystreams#actor':
          actor = quad.object.value;
          break;
        case 'https://www.w3.org/ns/activitystreams#target':
          target = quad.object.value;
          break;
        case 'https://www.w3.org/ns/activitystreams#object':
          resourceUrl = quad.object.value;
          break;
        case 'https://www.w3.org/ns/activitystreams#published':
          published = quad.object.value;
          break;
        case 'https://www.w3.org/ns/activitystreams#summary':
          summary = quad.object.value;
          break;
        case 'http://www.w3.org/ns/solid/terms#accessModes':
          modes.push(quad.object.value);
          break;
      }
    }
  } catch {
    return null;
  }

  if (!actor || !resourceUrl) return null;

  return {
    id: url,
    actor,
    target,
    resourceUrl,
    modes,
    published,
    summary: summary || undefined,
  };
}
