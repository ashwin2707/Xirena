# Xirena

Backend for a voice assistant. You speak, it transcribes, thinks, replies in a synthesised voice,
and remembers durable facts about you across conversations.

One HTTP request does the whole turn: raw audio in → transcribe → load context → stream LLM tokens
→ pipe those tokens into text-to-speech → stream transcript, text, and audio back over
Server-Sent Events → persist the turn → extract long-term memories in the background.

There is no frontend yet. This repo is the API and its supporting libraries.

## Stack

| Concern | Choice |
| --- | --- |
| Runtime | Node 26 (native `WebSocket`, native `--env-file`) |
| Language | TypeScript 7, ESM throughout, `strict` + `noUncheckedIndexedAccess` |
| HTTP | Fastify 5 |
| Validation | Zod 4 via `fastify-type-provider-zod` |
| Database | Postgres via Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Argon2id passwords (`@node-rs/argon2`), JWT access tokens, opaque refresh tokens, Discord OAuth2 |
| Speech-to-text | Groq Whisper |
| LLM | Groq chat completions |
| Text-to-speech | ElevenLabs, streaming over a raw WebSocket |
| Tooling | pnpm workspaces, Biome, TypeScript project references |

## Layout

```
apps/
  api/                 Fastify HTTP server — the only deployable
    src/
      index.ts         Process entry: listen, signal handling, graceful shutdown
      server.ts        buildServer(): plugins, error handler, route registration
      env.ts           Zod-validated process.env (throws at import if invalid)
      session.ts       Refresh-cookie read/write, public user shape
      sse.ts           Server-Sent Events stream helpers
      ai.ts / db.ts    Singleton wiring of the two libs
      types.ts         Fastify + JWT module augmentation
      routes/          auth, conversations, discord, memories, voice

libs/
  ai/                  Provider layer behind three interfaces
    src/
      config.ts        createAI(): builds the concrete providers
      conversation.ts  Assistant: prompt assembly + memory extraction
      llm/             LLMProvider  → GroqLLM
      stt/             STTProvider  → GroqWhisperSTT
      tts/             TTSProvider  → ElevenLabsTTS

  db/                  Prisma client behind hand-written service classes
    prisma/schema/     One .prisma file per model, plus migrations
    src/
      client.ts        Prisma client construction
      errors.ts        Domain errors the API maps to status codes
      services/        auth, user, conversation, memory
```

`apps/api` depends on both libs. The libs do not depend on each other or on Fastify — `libs/ai`
knows nothing about HTTP, and `libs/db` knows nothing about either.

## Prerequisites

- **Node >= 26.** The TTS client uses the global `WebSocket`, and the run scripts use `--env-file`.
- **pnpm 11.** The root `package.json` declares it under `devEngines`, so corepack will fetch it.
- **A Postgres database.** Anything Postgres-compatible works; the `.env.example` files point at
  Prisma Postgres.

## Setup

```bash
pnpm install
```

Create the two env files. They are separate on purpose: the API reads its own config at runtime,
while the Prisma CLI reads `libs/db/.env` when running migrations.

```bash
cp apps/api/.env.example apps/api/.env
cp libs/db/.env.example libs/db/.env
```

Fill in `apps/api/.env`. At minimum you need `DATABASE_URL`, a 32-character-or-longer
`JWT_SECRET`, `GROQ_API_KEY`, and `ELEVEN_LABS_API_KEY` — the process refuses to start without
them. Generate the secret with:

```bash
openssl rand -hex 32
```

Set `DATABASE_URL` in `libs/db/.env` to the same database.

Apply the schema and generate the client:

```bash
pnpm --filter @xirena/db run db:migrate
```

Build and run:

```bash
pnpm build
pnpm --filter @xirena/api run start
```

## Environment

Validated by `apps/api/src/env.ts`. Anything missing or malformed throws at startup rather than
failing on the first request.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `3000` | |
| `DATABASE_URL` | **yes** | — | Postgres connection string |
| `JWT_SECRET` | **yes** | — | Minimum 32 characters |
| `ACCESS_TOKEN_TTL` | no | `15m` | Duration string, e.g. `30s`, `15m`, `2h` |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | Positive integer |
| `WEB_ORIGIN` | no | `http://localhost:5173` | CORS origin and OAuth redirect target. No trailing slash |
| `GROQ_API_KEY` | **yes** | — | Used for both chat and Whisper |
| `GROQ_LLM_MODEL` | no | `llama-3.3-70b-versatile` | |
| `GROQ_STT_MODEL` | no | `whisper-large-v3-turbo` | |
| `ELEVEN_LABS_API_KEY` | **yes** | — | |
| `ELEVEN_LABS_MODEL` | no | `eleven_flash_v2_5` | |
| `ELEVEN_LABS_VOICE` | no | `EXAVITQu4vr4xnSDxMaL` | Voice ID |
| `ELEVEN_LABS_OUTPUT_FORMAT` | no | `mp3_22050_32` | Must start with `mp3` or `pcm` |
| `DISCORD_CLIENT_ID` | no | — | Discord routes only register if all three are set |
| `DISCORD_CLIENT_SECRET` | no | — | |
| `DISCORD_CALLBACK_URL` | no | — | e.g. `http://localhost:3000/auth/discord/callback` |

## Scripts

Run from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm build` | Generates the Prisma client, then builds all three packages via project references |
| `pnpm check` | Biome lint + format check |
| `pnpm check:write` | Biome lint + format, applying fixes |

Package-scoped:

| Command | What it does |
| --- | --- |
| `pnpm --filter @xirena/api run start` | Runs the built server with `apps/api/.env` loaded |
| `pnpm --filter @xirena/api run dev` | Watch-restarts the built server (see caveat below) |
| `pnpm --filter @xirena/db run db:migrate` | Creates and applies a migration in development |
| `pnpm --filter @xirena/db run db:deploy` | Applies pending migrations — use this in production |
| `pnpm --filter @xirena/db run db:generate` | Regenerates the Prisma client only |
| `pnpm --filter @xirena/db run db:studio` | Opens Prisma Studio |
| `pnpm --filter @xirena/db run db:reset` | Drops and recreates the database. Destructive |

> **Caveat on `dev`:** it watches `dist/`, which nothing rebuilds on its own. Run
> `pnpm exec tsc -b --watch` in a second terminal alongside it.

## API

All routes returning or mutating user data require `Authorization: Bearer <accessToken>` and are
scoped to the authenticated user. Refresh tokens live in an httpOnly cookie scoped to `/auth`, and
are rotated on every refresh.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Liveness + a `SELECT 1` against Postgres |
| `POST` | `/auth/register` | — | Email + password signup |
| `POST` | `/auth/login` | — | Email + password login |
| `POST` | `/auth/refresh` | cookie | Rotates the refresh token, returns a new access token |
| `POST` | `/auth/logout` | cookie | Revokes the presented refresh token |
| `POST` | `/auth/logout-all` | bearer | Revokes every live refresh token for the user |
| `GET` | `/auth/me` | bearer | Current user |
| `GET` | `/auth/discord` | — | Starts the Discord OAuth2 flow |
| `GET` | `/auth/discord/callback` | — | Completes it, sets the cookie, redirects to `WEB_ORIGIN` |
| `GET` | `/conversations` | bearer | List the user's conversations |
| `POST` | `/conversations` | bearer | Create one |
| `GET` | `/conversations/:id` | bearer | Conversation + a page of messages (`?before=<ISO date>`) |
| `DELETE` | `/conversations/:id` | bearer | Delete it; messages cascade |
| `POST` | `/conversations/:id/voice` | bearer | **The voice turn.** Audio in, SSE out |
| `GET` | `/memories` | bearer | List stored facts |
| `POST` | `/memories` | bearer | Add one manually |
| `DELETE` | `/memories/:id` | bearer | Delete one |

### The voice turn

`POST /conversations/:id/voice` takes a raw audio body — no multipart. Set `Content-Type` to one
of `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`, or
`application/octet-stream`; the extension handed to Whisper is derived from it. The body limit is
8 MiB.

The response is `text/event-stream`. Each frame is a JSON object on a `data:` line:

```
data: {"type":"transcript","text":"what's the weather like"}
data: {"type":"delta","text":"It's "}
data: {"type":"delta","text":"sunny "}
data: {"type":"audio","b64":"SUQzBAAAA..."}
data: {"type":"done"}
```

| Event | Meaning |
| --- | --- |
| `transcript` | What Whisper heard. Sent once, before generation starts |
| `delta` | A chunk of the assistant's reply text |
| `audio` | Base64 audio in `ELEVEN_LABS_OUTPUT_FORMAT`. Concatenate in arrival order |
| `done` | The turn completed and was persisted |
| `error` | The turn failed after streaming began. No `done` will follow |

Failures *before* the stream opens come back as ordinary status codes — `400` for a missing or
non-audio body, `404` for a conversation the user does not own, `422` when Whisper found no
speech. Once the stream is open, everything is reported as an `error` event instead, because the
status code has already been sent.

Closing the connection aborts the turn: the abort propagates to all three providers, and nothing
is persisted.

## Data model

```
User ─┬─< OAuthAccount        (provider, providerAccountId) unique
      ├─< RefreshToken        tokenHash unique; rotated, revocable, expiring
      ├─< Memory              durable facts, optionally traced to a Conversation
      └─< Conversation ──< Message
```

Everything cascades from `User`. Deleting a conversation cascades its messages.

Migrations live in `libs/db/prisma/schema/migrations/`. The schema is split across one file per
model in `libs/db/prisma/schema/`, which Prisma 7 reads as a directory.

## Known gaps

Deliberate, and worth knowing before you build on this:

- **No tests, at all.** The provider interfaces (`LLMProvider`, `STTProvider`, `TTSProvider`) are
  designed to be faked, and `ElevenLabsTTS` accepts a `wsUrl` so it can be pointed at a local
  WebSocket server.
- **No email verification.** Password signup trusts the address as typed. Nothing sets
  `User.emailVerified`, so automatic OAuth account linking never fires — a Discord sign-in always
  creates its own account rather than attaching to a same-email one. That is deliberate: linking on
  an unverified email is an account-takeover vector.
- **Access tokens cannot be revoked.** Logout and `logout-all` kill refresh tokens, but an issued
  access token stays valid until it expires (15 minutes by default).
- **No rate limiting.** Nothing throttles any route. Every voice turn spends money at three
  providers, so this needs to come back before the API is reachable by anyone but you.
- **No metrics or tracing.** Logs are the only observability. `voice turn completed` carries
  per-phase timings, which is the starting point.
