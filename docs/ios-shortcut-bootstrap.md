# iOS Shortcut: Peloton token bootstrap from iPhone Safari

One-tap replacement for the DevTools dance. Run the Shortcut from Safari's
Share Sheet while signed in to `members.onepeloton.com` and it POSTs the full
Auth0 token bundle to `POST /api/admin/peloton-bootstrap`.

Use this whenever the access token expires (every ~48 hours) — or, with a
healthy `refresh_token` + `client_id`, only once per refresh-token lifetime
(months, typically).

## What the Shortcut sends

The endpoint expects:

```typescript
{
  access_token: string         // required
  refresh_token: string | null // optional but recommended
  client_id: string | null     // optional but recommended
  expires_at: number | null    // optional; JWT exp is preferred anyway
  source: 'localStorage' | 'fetch-intercept'
}
```

`refresh_token` + `client_id` together unlock the auto-refresh path. Without
both, the server stores the access token and surfaces a warning that the
refresh-token flow is dormant.

## Step 1: the JavaScript action

This is the script the Shortcut runs inside the page. It tries `localStorage`
first (the win condition) and falls back to a `fetch` intercept (best-effort).

```javascript
(async () => {
  // ---- Strategy 1: read Auth0 SDK keys from localStorage ----
  // Auth0 SPA SDK keys are formatted:
  //   @@auth0spajs@@::<client_id>::<audience>::<scope>
  // The client_id lives in the key name, so we parse it from there rather
  // than trusting any field in the JSON body (the original brief suggested
  // body.oauthTokenScope as a fallback — that's a scope string, not a
  // client_id, and would corrupt the stored credentials).
  const auth0Keys = Object.keys(localStorage).filter((k) =>
    k.startsWith('@@auth0spajs@@::')
  );

  for (const k of auth0Keys) {
    try {
      const blob = JSON.parse(localStorage.getItem(k));
      const body = blob?.body ?? blob;
      if (body?.access_token) {
        const parts = k.split('::');
        const clientId = parts[1] || null;
        completion(JSON.stringify({
          source: 'localStorage',
          access_token: body.access_token,
          refresh_token: body.refresh_token ?? null,
          client_id: clientId,
          expires_at: body.expires_at ?? blob.expiresAt ?? null,
        }));
        return;
      }
    } catch (_) { /* keep scanning */ }
  }

  // ---- Strategy 2: monkey-patch fetch, wait for an authed call ----
  // This only succeeds if the SPA happens to issue an authed fetch within
  // the wait window. The script can't force one by issuing its own
  // api.onepeloton.com fetch — that request would have no Authorization
  // header. Best-effort only; do not assume it works.
  let captured = null;
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [, opts = {}] = args;
    const headers = opts.headers || {};
    const auth =
      headers.Authorization ||
      headers.authorization ||
      (headers instanceof Headers &&
        (headers.get?.('Authorization') || headers.get?.('authorization')));
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      captured = auth.slice(7);
    }
    return originalFetch.apply(this, args);
  };

  // Coax the SPA into issuing a request.
  window.scrollBy(0, 1);
  await new Promise((r) => setTimeout(r, 1500));
  window.fetch = originalFetch;

  if (captured) {
    completion(JSON.stringify({
      source: 'fetch-intercept',
      access_token: captured,
      refresh_token: null,
      client_id: null,
      expires_at: null,
    }));
  } else {
    completion(JSON.stringify({ error: 'no_token_found' }));
  }
})();
```

`completion(value)` is the iOS Shortcuts convention for returning data from
"Run JavaScript on Webpage" to the next action.

## Step 2: build the Shortcut

In the iOS Shortcuts app, create a new shortcut. In its details panel, enable
**Show in Share Sheet** and set the share input to **Safari webpages** only.

Add these actions in order:

1. **Run JavaScript on Webpage** — paste the script above. Input is the
   Shortcut's "Shortcut Input" (Safari Web Page).
2. **Get Dictionary from Input** — pass it the output of the previous action.
3. **If** dictionary has any value for key **`error`**:
   - **Show Notification**: `"Peloton bootstrap failed — no token found. Make sure you're signed in to members.onepeloton.com."`
   - **Stop Shortcut**.
4. **Otherwise:**
   - **Get Contents of URL**:
     - URL: `https://<your-app-domain>/api/admin/peloton-bootstrap`
     - Method: **POST**
     - Request Body: **JSON** — map the dictionary keys (`source`,
       `access_token`, `refresh_token`, `client_id`, `expires_at`) into the
       request body.
     - Headers:
       - `Authorization: Bearer <CRON_SECRET>` (paste the same secret used by
         `/admin`)
       - `Content-Type: application/json`
   - **Get Dictionary from Input** (operating on the response).
   - **Show Notification** using the dictionary's `warning` value if present,
     otherwise a success message including `owner_name` and the
     `refresh_enabled` boolean.

## Step 3: one-time iOS setting

**Settings → Shortcuts → Advanced → Allow Running Scripts** must be ON. iOS
hides this by default; without it, the JavaScript action silently no-ops.

The first run also prompts: *"Allow this shortcut to access members.onepeloton.com?"*
— choose **Always Allow**.

## Steady-state UX

- **Token bundle captured (`source: 'localStorage'`):** refresh-token flow
  engages. Re-run the Shortcut only when the refresh token itself rotates out
  (months, depending on Auth0 tenant config) or `/admin/health` flags a
  failed refresh.
- **Only the access token captured (`source: 'fetch-intercept'`):** re-run
  every ~40 hours. Still a 15-second tap on the phone instead of a 5-minute
  DevTools session on a laptop.

## What the endpoint does with the payload

Cross-reference for `app/api/admin/peloton-bootstrap/route.ts`:

- Validates `access_token` via Peloton `/api/me`. Rejects 401 with a clear
  error message.
- Decodes the JWT `exp` claim as the source of truth for the expiry; the
  body's `expires_at` is fallback only.
- Refuses to overwrite if the bootstrap token belongs to a different Peloton
  user than the existing owner row.
- Upserts the owner's `member_credentials` row.
- Returns `{ ok, owner_name, peloton_user_id, token_expires_at,
  refresh_enabled, source, warning }`. The Shortcut should surface `warning`
  to you whenever it's non-null.

## Honest caveat on the fetch-intercept fallback

The fallback strategy works in theory but has never been validated against
Peloton's current SPA behavior in this project. If the localStorage path
turns out to be the only one that ever fires, that's fine — bootstrap once,
let auto-refresh take over. If neither fires, file an issue and investigate
the SPA's auth implementation (cache mode, where it stores tokens) before
expanding the fallback logic.
