# Member self-serve Peloton connect

Lets each group member store their own Peloton token bundle — including the
refresh token that keeps their sync alive for months — without the admin ever
handling tokens or sharing CRON_SECRET.

## How it works

1. Admin opens `/admin`, finds the member row, clicks **connect link**. A
   personal URL like `https://<host>/connect/<24-char-code>` is minted (or
   rotated) and copied to the clipboard. Text it to the member.
2. Member opens the link and follows three steps on the page: sign in to
   `members.onepeloton.com` on a computer, run the copy-paste console snippet
   there, paste the result back into the page, hit **Connect**.
3. `/api/connect` validates the code, checks the token against Peloton
   `/api/me`, and **verifies the token belongs to that member's
   `peloton_user_id`** — you can't accidentally (or deliberately) attach
   someone else's account to your link.
4. The full bundle lands in `member_credentials`; `getFreshPelotonSession`
   in `lib/sync.ts` auto-refreshes from then on.

## Pieces

| Piece | Path |
|---|---|
| Migration | `supabase/member_connect_codes_migration.sql` |
| Public endpoint | `app/api/connect/route.ts` (GET validate, POST store) |
| Admin endpoint | `app/api/admin/connect-codes/route.ts` (mint/rotate/list) |
| Member page | `app/connect/[code]/page.tsx` |
| Admin button | members list on `app/admin/page.tsx` |

## Security notes

- Codes are 24 chars of base62 (~143 bits) — unguessable. Still, minting a
  new link **rotates** the old one; do that if a link leaks.
- `member_connect_codes` is service-role-only under RLS. Never relax that:
  the `members` table is publicly readable, and codes must not be.
- Bad codes return generic 404s (no existence oracle).
- The wrong-account guard means a member's link is useless to anyone who
  isn't signed in to that member's Peloton account.

## iPhone path (optional, for repeat captures)

The console-snippet flow needs a computer. If a member has no computer, adapt
the iOS Shortcut from `docs/ios-shortcut-bootstrap.md`: replace the POST URL
with `https://<host>/api/connect`, drop the Authorization header, and add a
`code` field (their personal code) to the JSON body. Share the finished
Shortcut via iCloud link — recipients tap once to install.

In steady state members shouldn't need repeat captures at all: one good
capture with the refresh bundle keeps the sync alive until the refresh token
rotates out (months) or they change their Peloton password.
