# CampusCart

**The VIT Bhopal student marketplace.**

Buy and sell across campus — electronics, books, cycles, furniture, services. Built
with Next.js 16, Prisma 7, and a monochrome design system that stays out of the way.

---

## Quick start

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and the three secrets
docker compose up -d        # local Postgres
npm run db:setup            # schema + search indexes + seed
npm run admin:create        # an admin account for the hidden panel
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run db:check` verifies the database is reachable, the schema is migrated,
and the seed has run. Start there if something is misbehaving.

### Generating the secrets

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 48   # ADMIN_JWT_SECRET
```

### Signing in without an SMS provider

`OTP_SMS_PROVIDER` defaults to `console`. Codes are printed to the terminal and,
in development only, returned in the API response so the login screen can show
them. No provider account is needed to work on the app.

That echo is gated on `NODE_ENV !== 'production'`, and a production build refuses
to boot while the provider is still `console` — see [Delivering codes](#delivering-codes).

### Delivering codes

Five real delivery channels, all behind one interface, all selected by
`OTP_SMS_PROVIDER`:

| Value | Channel | Notes |
|---|---|---|
| `whatsapp` | WhatsApp Cloud API (Meta) | No TRAI DLT registration. Needs a Meta Business account and an approved template. |
| `msg91-whatsapp` | WhatsApp via MSG91 | MSG91 handles Meta verification and template approval — the slow part of going direct. |
| `msg91` / `fast2sms` | SMS (India) | Requires TRAI DLT registration with the vendor. |
| `twilio` | SMS (global) | Simplest to start, priciest per message in India. |

**WhatsApp is usually the better default here.** Delivery is more reliable than
Indian SMS, there's no DLT paperwork, and students read it faster.

Meta does not permit free-form OTP messages, so create a template in WhatsApp
Manager with category **Authentication**, then:

```
OTP_SMS_PROVIDER="whatsapp"
WHATSAPP_PHONE_NUMBER_ID="..."     # WhatsApp Manager → API setup
WHATSAPP_ACCESS_TOKEN="..."        # a permanent System User token, not the 24h test one
WHATSAPP_TEMPLATE_NAME="campuscart_otp"
```

The provider sends the code as both a body parameter and a button parameter —
the copy-code button reads it from the latter, and omitting it renders a button
that copies nothing.

`npm run env:check` exercises these guards without deploying.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint |
| `npm run env:check` | Verify the production env guards |
| `npm run db:check` | Diagnose connection, schema, and seed state |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed categories, flags, settings |
| `npm run db:studio` | Prisma Studio |
| `npm run admin:create` | Create an admin (interactive, prompts for a password) |
| `npm run assets` | Re-render icons, favicon, and the OG card from `public/brand/*.svg` |

---

## Architecture

A single Next.js app. Route handlers are the API — there is no separate backend.

```
src/
  app/
    (app)/         signed-in surfaces: home, sell, chats, saved, settings, profile
    (auth)/        login and onboarding
    (admin)/       the hidden panel, mounted on an env-configured segment
    api/           every route handler
    listing/       public listing pages (shareable without an account)
    legal/         terms and privacy
  components/      ui primitives, then feature folders
  lib/             server helpers; lib/client/* is browser-only
```

**Auth.** Phone OTP is the primary path; a verified VIT email adds a badge.
Access tokens are 15-minute JWTs in httpOnly cookies. Refresh tokens are opaque
random strings stored hashed, rotated on use, with reuse detectable as theft.

**CSRF.** `proxy.ts` issues a random token in a JS-readable cookie; the client
echoes it in `x-csrf-token`. Every state-changing route goes through `mutation()`,
which verifies it before the body is read.

**Realtime.** SSE at `/api/realtime`, backed by in-process pub/sub. Correct for a
single instance. To scale horizontally, swap the two functions in `lib/realtime.ts`
for Redis pub/sub — every caller already goes through `publish`/`subscribe`.

**Storage.** Local disk behind an S3-shaped driver. Uploads are verified by magic
bytes, re-encoded with sharp (which strips EXIF, including GPS), and stored
content-addressed. Set `STORAGE_DRIVER=s3` and implement `S3Driver` to move to R2
or S3 — the interface and env vars are already in place.

**Search.** Postgres trigram similarity, so "labtop" finds "laptop". The ranking
query is one parameterised statement; every user-supplied filter is applied
afterwards through Prisma, never string-concatenated into SQL.

---

## The two things worth understanding

### Phone numbers

A number is never on a profile or a listing. A buyer requests it, the seller
approves or rejects that specific request, and approval is scoped to one listing —
approving someone for a cycle is not consent to be called about everything else.
Sellers can revoke at any time.

Exactly one route returns another user's number: `GET /api/user/[userId]/phone`.
It re-checks the grant on every call, and every denial returns an identical 403,
so the response cannot distinguish "never asked" from "was rejected" from "was
revoked".

### The admin panel

Mounted at `/${ADMIN_PANEL_PATH}` — never linked, never in the sitemap, and
deliberately absent from `robots.txt` (a `Disallow` rule would publish the one
thing it relies on staying unguessable). A wrong path 404s identically to any
other miss.

The hidden path is obfuscation, not the security boundary. The real boundary is
that every `/api/admin/*` route requires a live admin session — a separate cookie,
a separate signing secret, and a separate JWT audience from user auth, so a user
token can never satisfy an admin check.

Admins are created only by `npm run admin:create`, which prompts interactively and
stores a scrypt hash. Credentials are never in env or code.

Reading a reported conversation is the most invasive thing the panel can do, and
is fenced four ways: MODERATOR or above; a report must exist and name a
conversation; the 30-day moderation window must still be open; and a
`ChatAccessLog` row is written **before** the messages are returned, so a read
cannot happen without a trace.

---

## Environment

See `.env.example` for the full list.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | *required* |
| `JWT_ACCESS_SECRET` | Signs access tokens | *required* |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | *required* |
| `ADMIN_JWT_SECRET` | Signs admin tokens | *required* |
| `ADMIN_PANEL_PATH` | Hidden admin route — **change this before deploying** | `control-a7f3c9` |
| `VIT_EMAIL_DOMAIN` | Domain that grants the verified badge | `vitbhopal.ac.in` |
| `OTP_SMS_PROVIDER` | `console` \| `whatsapp` \| `msg91-whatsapp` \| `msg91` \| `twilio` \| `fast2sms` | `console` |
| `OTP_EMAIL_PROVIDER` | `console` \| `resend` \| `smtp` | `console` |
| `STORAGE_DRIVER` | `local` \| `s3` | `local` |
| `FEATURE_LISTING_APPROVAL` | Hold new listings for review | `false` |

---

## Deploying

1. Provision Postgres and run `npm run db:setup` (or generate a baseline
   migration first — see the note in `scripts/db-indexes.ts`).
2. Set every required variable, and **change `ADMIN_PANEL_PATH`** — the default is
   in this repository, and production boot rejects it.
3. Set `NEXT_PUBLIC_APP_URL` to the real origin; OG tags and share links use it.
4. Configure a real `OTP_SMS_PROVIDER` — `whatsapp` is the recommended channel
   for an Indian campus. The app refuses to boot in production while this is
   still `console`, or while the selected provider is missing credentials, so
   this cannot be forgotten silently.
5. For more than one instance, move storage to S3/R2 and realtime to Redis.
6. Create the first admin with `npm run admin:create`.

---

## Future features

Schema exists, no logic implemented — these land as additive migrations rather
than rewrites: subscriptions (₹29/month), ratings and reviews, wallet and
transactions, coupons, referrals, promoted listings.

The subscription model is designed so that a paying buyer skipping manual approval
never overrides a seller who has kept `requirePhoneApproval` on.

---

## Tech stack

Next.js 16 (App Router) · TypeScript strict with `noUncheckedIndexedAccess` ·
Prisma 7 · Postgres · Tailwind 4 · Framer Motion · jose · zod · sharp

## License

MIT
