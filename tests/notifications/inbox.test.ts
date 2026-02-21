import { describe, it, expect, vi } from 'vitest';
import { sendNotification, checkInbox, deleteNotification } from '../../src/notifications/inbox.js';

describe('sendNotification', () => {
  it('POSTs a notification to the inbox and returns the location', async () => {
    let postedBody = '';
    let postedUrl = '';
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      postedUrl = typeof url === 'string' ? url : url.toString();
      postedBody = init?.body as string;
      return new Response(null, {
        status: 201,
        headers: { location: '/beta/inbox/notification-123' },
      });
    }) as unknown as typeof fetch;

    const result = await sendNotification(
      'http://localhost:3000/beta/inbox/',
      'http://localhost:3000/alpha/profile/card#me',
      'http://localhost:3000/beta/profile/card#me',
      'http://localhost:3000/alpha/shared/data.ttl',
      ['Read'],
      mockFetch,
    );

    expect(postedUrl).toBe('http://localhost:3000/beta/inbox/');
    expect(postedBody).toContain('as:Announce');
    expect(postedBody).toContain('as:actor <http://localhost:3000/alpha/profile/card#me>');
    expect(postedBody).toContain('as:target <http://localhost:3000/beta/profile/card#me>');
    expect(postedBody).toContain('as:object <http://localhost:3000/alpha/shared/data.ttl>');
    expect(result).toBe('http://localhost:3000/beta/inbox/notification-123');
  });

  it('throws on failed POST', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response('Forbidden', { status: 403 });
    }) as unknown as typeof fetch;

    await expect(
      sendNotification(
        'http://localhost:3000/beta/inbox/',
        'http://localhost:3000/alpha/profile/card#me',
        'http://localhost:3000/beta/profile/card#me',
        'http://localhost:3000/alpha/shared/data.ttl',
        ['Read'],
        mockFetch,
      ),
    ).rejects.toThrow('Failed to send notification');
  });
});

describe('checkInbox', () => {
  it('lists and parses notifications from inbox', async () => {
    const containerTurtle = `
@prefix ldp: <http://www.w3.org/ns/ldp#>.
<> a ldp:BasicContainer;
    ldp:contains <notification-1>.
`;

    const notificationTurtle = `
@prefix as: <https://www.w3.org/ns/activitystreams#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.
<> a as:Announce;
    as:actor <http://localhost:3000/alpha/profile/card#me>;
    as:target <http://localhost:3000/beta/profile/card#me>;
    as:object <http://localhost:3000/alpha/shared/data.ttl>;
    as:summary "Resource shared: http://localhost:3000/alpha/shared/data.ttl";
    as:published "2026-02-21T10:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
    solid:accessModes "Read".
`;

    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.endsWith('inbox/')) {
        return new Response(containerTurtle, { status: 200 });
      }
      if (urlStr.includes('notification-1')) {
        return new Response(notificationTurtle, { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const notifications = await checkInbox(
      'http://localhost:3000/beta/inbox/',
      mockFetch,
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0].actor).toBe('http://localhost:3000/alpha/profile/card#me');
    expect(notifications[0].target).toBe('http://localhost:3000/beta/profile/card#me');
    expect(notifications[0].resourceUrl).toBe('http://localhost:3000/alpha/shared/data.ttl');
    expect(notifications[0].modes).toContain('Read');
  });

  it('returns empty array for empty inbox', async () => {
    const emptyContainer = `
@prefix ldp: <http://www.w3.org/ns/ldp#>.
<> a ldp:BasicContainer.
`;

    const mockFetch = vi.fn(async () => {
      return new Response(emptyContainer, { status: 200 });
    }) as unknown as typeof fetch;

    const notifications = await checkInbox(
      'http://localhost:3000/beta/inbox/',
      mockFetch,
    );

    expect(notifications).toHaveLength(0);
  });

  it('throws on failed inbox read', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response('Forbidden', { status: 403 });
    }) as unknown as typeof fetch;

    await expect(
      checkInbox('http://localhost:3000/beta/inbox/', mockFetch),
    ).rejects.toThrow('Failed to read inbox');
  });
});

describe('deleteNotification', () => {
  it('sends DELETE to the notification URL', async () => {
    let deletedUrl = '';
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deletedUrl = typeof url === 'string' ? url : url.toString();
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await deleteNotification(
      'http://localhost:3000/beta/inbox/notification-1',
      mockFetch,
    );

    expect(deletedUrl).toBe('http://localhost:3000/beta/inbox/notification-1');
  });

  it('accepts 404 for already-deleted notifications', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    await expect(
      deleteNotification('http://localhost:3000/beta/inbox/notification-1', mockFetch),
    ).resolves.not.toThrow();
  });
});
