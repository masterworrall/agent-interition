/**
 * Gets an authenticated fetch function using CSS client credentials.
 *
 * CSS v7 flow:
 * 1. POST /.oidc/token with Basic auth (id:secret) and grant_type=client_credentials
 * 2. Receive a Bearer access_token (JWT, 600s expiry)
 * 3. Use Authorization: Bearer <token> on subsequent requests
 */

export async function getAuthenticatedFetch(
  serverUrl: string,
  id: string,
  secret: string,
): Promise<typeof fetch> {
  const tokenUrl = `${serverUrl}/.oidc/token`;
  const authString = Buffer.from(`${id}:${secret}`).toString('base64');

  let token: string | null = null;
  let tokenExpiry = 0;

  async function refreshToken(): Promise<string> {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        authorization: `Basic ${authString}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'webid',
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to get access token: ${res.status} ${await res.text()}`);
    }

    const json = await res.json() as { access_token: string; expires_in: number };
    token = json.access_token;
    // Refresh 30s before expiry
    tokenExpiry = Date.now() + (json.expires_in - 30) * 1000;
    return token;
  }

  async function getToken(): Promise<string> {
    if (!token || Date.now() >= tokenExpiry) {
      return refreshToken();
    }
    return token;
  }

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const accessToken = await getToken();
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${accessToken}`);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}
