# Appserver API guide

This document is the entry point for anyone — human or agent — writing API handlers in this codebase. It is a deep dive on **how APIs are built on top of the `Appserver` class from `@cripty2001/utils`**: the file layout, the registration pattern, input/output typing, authentication, and (most importantly) the error model.

It is intentionally self-contained: you should not need to read any existing endpoint to understand how to add a new one. A full worked example covering every common case lives at the end (§13).

Read it before making changes. The conventions here are not suggestions — deviations cause friction and should be justified, not accidental.

---

## 1. What the API layer is

- A **typed RPC runner**, not a REST/HTTP-verbs-and-resources API. Every endpoint is a `POST` to `/exec/<action>` that takes one input object and returns one output object.
- The wire format is **MessagePack** (`Content-Type: application/vnd.msgpack`), not JSON. This is enforced by the framework — a JSON request will be rejected with `REQUEST_INVALID_TYPE_HEADER`. You never touch MessagePack yourself: the framework decodes the request and encodes your return value. The only reason to care is that MessagePack supports `Uint8Array` natively, so binary payloads (signatures, certificates, images) flow in and out as plain `Uint8Array` with no base64 dance.
- Transport, framing, validation, auth, and error mapping are all handled by the shared `Appserver` class from `@cripty2001/utils/appserver/server`. The matching client is `@cripty2001/utils/appserver/client`.

**You do not write HTTP routes, Request/Response handlers, or fetch logic.** You write pure functions `(input) => output` or `(input, user) => output`, declare an input schema, and register them. The framework does the rest.

---

## 2. Tech stack for the API layer

| Layer               | Choice                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language            | TypeScript, strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`)                                    |
| Server framework    | `@cripty2001/utils/appserver/server` (internal)                                                                                                         |
| Schema / validation | `@sinclair/typebox`, re-exported as `Type` from the appserver module — **always import from there**, never from typebox directly, to avoid version skew |
| Wire format         | MessagePack (handled by the framework — not imported by handlers)                                                                                       |

---

## 3. Directory layout for APIs

```
src/
  index.ts                    # Bootstrap: constructs Appserver, registers every API
  api/
    <segment1>/
      <segment2>.ts           # One file per endpoint. Path mirrors the exposed URL.
```

**Rules for the `src/api/` tree — these are not suggestions:**

1. **The folder path IS the URL path.** `src/api/foo/bar.ts` is exposed at `/exec/foo/bar`. Never break this mapping. Renaming a file moves the endpoint.
2. **Every path segment is a single lowercase word.** `version`, `ios`, `utils`, `identicon` — not `version-check`, not `userProfile`, not `user_profile`. If you feel you need two words in a segment, rethink the shape: usually it means a deeper folder (`user/cert/revoke` instead of `user/revokeCert`) or a sharper verb. Single-word segments keep URLs, folders, and register-function names readable and unambiguous.
3. **One endpoint per file.** Don't register two actions from the same file. This keeps the path-to-file mapping trivial and files short.
4. **No barrel / `index.ts` files inside `src/api/`.** Each endpoint file is imported directly by the bootstrap.

---

## 4. The API file template

Every endpoint file has the same shape:

```ts
import type { Appserver } from '@cripty2001/utils/appserver/server';
import { Type } from '@cripty2001/utils/appserver/server';

// 1. Input schema — declared with TypeBox, EXPORTED so clients can import it.
export const <camelCasePath>InputSchema = Type.Object({
    field: Type.String(),
    // ...
});

// 2. Register function — named register<PascalCasePath>, takes the server, returns void.
export function register<PascalCasePath>(server: Appserver<null>): void {
    server.registerPublic(     // or registerPrivate — see §6
        '<segment1>/<segment2>', // action path — MUST match this file's folder/filename
        <camelCasePath>InputSchema,
        async (input) => {
            // 3. Handler: pure async function. `input` is already validated and typed.
            //    Return an AppserverData-compatible value — that IS the output type.
            return { /* ... */ };
        },
    );
}
```

Then wire it up in the bootstrap (`src/index.ts`):

```ts
import { register<PascalCasePath> } from './api/<segment1>/<segment2>.js';
// ...
register<PascalCasePath>(server);
```

The `.js` extension on the relative import is required by the `Bundler` moduleResolution + `verbatimModuleSyntax` TS combo, even though source files are `.ts`.

### Naming conventions (strict)

| Thing              | Rule                                                                              | Example                                  |
| ------------------ | --------------------------------------------------------------------------------- | ---------------------------------------- |
| File path          | `src/api/<seg>/<seg>.ts`                                                          | `src/api/version/ios.ts`                 |
| URL path           | `<seg>/<seg>` (no leading slash in `register*` call; framework prepends `/exec/`) | `version/ios` → `POST /exec/version/ios` |
| Register fn        | `register<PascalCasePath>`                                                        | `registerVersionIos`                     |
| Input schema const | `<camelCasePath>InputSchema`                                                      | `versionIosInputSchema`                  |
| Path segments      | single lowercase word, no hyphens, no camelCase                                   | `version`, `ios`, `utils`, `identicon`   |

---

## 5. Input and output types

### Input — declared, exported, TypeBox

- Every endpoint declares an input schema with `Type.Object({ ... })`. **Always an object at the top level**, even for single-field inputs. Never take a bare string, number, or array at the top.
- The schema constant is **exported** so the client can import it for shared type inference.
- The handler's `input` parameter is automatically typed from the schema via `Static<ISchema>` — don't annotate it manually.
- The framework validates the input **before** your handler runs. Invalid input returns HTTP `422` with the list of TypeBox errors; your handler never sees malformed data. Don't re-validate shape in the handler; validate _semantics_ only (e.g. "this ID exists in the DB", "this version is in the supported list").

### Output — inferred, no schema

- The return type of the handler is the output type. **There is no output schema, on purpose** — output shapes evolve freely and are inferred by TS, not validated at runtime.
- The output must be `AppserverData`:

  ```ts
  type AppserverData =
    | null
    | boolean
    | number
    | string
    | Uint8Array
    | AppserverData[]
    | { [key: string]: AppserverData };
  ```

  i.e. JSON-like, **plus `Uint8Array`** for binary payloads. No `Date`, no `undefined`, no class instances, no `bigint`, no `Map`/`Set`. Convert at the boundary (ISO strings for dates, etc.).

- The client gets the return value back as-is (msgpack-encoded then decoded). Whatever shape you return is what callers consume.
- **Discriminated unions** (`{ ok: true, ... } | { ok: false, ... }`) are idiomatic for "success or structured failure that the client must branch on" — but **only** when the "failure" is a normal, expected business outcome (e.g. "version not supported, here's the upgrade link"). For genuine errors, throw — see §7.

---

## 6. Public vs. Private endpoints

The framework exposes two registration methods:

| Method                                          | Auth     | Handler signature         | When to use                                                                     |
| ----------------------------------------------- | -------- | ------------------------- | ------------------------------------------------------------------------------- |
| `server.registerPublic(path, schema, handler)`  | None     | `(input) => output`       | Anonymous endpoints: health, version checks, public reads, identicon generation |
| `server.registerPrivate(path, schema, handler)` | Required | `(input, user) => output` | Anything that needs a logged-in user                                            |

### Auth flow

- Clients send `Authorization: Bearer <token>`.
- The token is passed to the `parseUser` function provided to `new Appserver(...)` in the bootstrap. That function returns the resolved user (any `AppserverData` shape) or `null` if the token is invalid / expired / absent.
- For `registerPrivate`, a `null` user automatically yields HTTP `403` with code `PERMISSION_DENIED` (via the internal `AppserverAuthError`) — **you don't write that check**.
- For `registerPublic`, the user is implicitly unused; the handler takes only `input`.
- There is also a built-in `POST /auth/whoami` endpoint (registered by the framework itself) that returns the currently authenticated user, stripped of keys starting with `_` (use `_`-prefixed keys for internal, non-exposed fields like password hashes or session nonces).

### The `Appserver<U>` generic

`Appserver<U>` is parameterized by the user type. Every `register<Name>` function should type its parameter as `Appserver<U>` matching the bootstrap's `U`. When `U` changes (e.g. auth lands), the bootstrap changes in one place and every private handler sees the new user type automatically.

If the project has no real user model yet, use `Appserver<null>` and a `parseUser` stub that returns `null`. Every `registerPrivate` endpoint will reject calls until `parseUser` is implemented, but endpoints stay as-is.

---

## 7. Error handling — the important distinction

There are **two categories of errors**. Getting this right matters because it's the difference between a useful, actionable error and a leaked stack trace.

### 7.1 Handled errors — `AppserverHandledError`

Use when something went wrong **in a way the caller needs to know about and can reasonably react to**. Examples: "this certificate is already revoked", "this fiscal code is malformed", "this organization doesn't exist".

```ts
import { AppserverHandledError } from "@cripty2001/utils/appserver/server";

throw new AppserverHandledError(
  "CERTIFICATE_ALREADY_REVOKED", // code — SCREAMING_SNAKE_CASE, stable, machine-readable
  "This certificate has already been revoked.", // human-readable message
  { revokedAt: "2026-04-10T12:00:00Z" }, // optional structured payload (AppserverData)
);
```

- The client receives `{ error, code, payload }` with HTTP `500` (the framework's default status for handled errors). On the client side this arrives as a `ClientServerError` with matching `.code`, `.message`, `.payload`.
- Pick codes that are **actionable**: the client should be able to `switch` on `code` to drive the right UI (a specific message, a retry button, a redirect).
- Keep messages user-facing: plain language, no internal jargon, no stack info, no DB field names. The message is what ends up in a toast or dialog.
- Put any extra context (IDs, timestamps, hints) in `payload`, not interpolated into the message — clients format the message themselves.
- The `code` is the contract; treat it like a public API. Don't rename it casually, because clients key off it.

### 7.2 Unhandled errors — plain `Error` / exceptions

Use for **"this shouldn't have happened" bugs**: invariants violated, upstream service crashed, a `null` that should never be `null`. The user should not see the details.

```ts
if (cert === null) {
  // Not an AppserverHandledError — the caller can't act on this.
  throw new Error(`Invariant: cert ${id} was fetched but came back null`);
}
```

- The framework logs it server-side (`console.log("Unhandled server error:", e)`) and returns a generic `{ error: 'Internal server error', code: 'INTERNAL_SERVERERROR' }` with HTTP `500`. The client sees nothing useful — on purpose.
- Never throw a plain `Error` with a message you'd be embarrassed to show to someone. Assume logs may end up shared with customers or on-call engineers outside your team.
- **Don't catch-and-rethrow as `AppserverHandledError` just to get a nicer message out.** If the problem isn't the caller's to solve, let it fall through. Promoting a bug to a handled error hides the bug.

### 7.3 Decision rule

Ask: _"Is this failure something the caller did, or something they can act on?"_

- **Yes** → `AppserverHandledError` with a specific code, a user-facing message, and optional payload.
- **No** → throw a regular `Error` with enough detail for server-side debugging.

If you're unsure, err on the side of plain `Error`. It's easier to promote an internal error to a handled one later than to remove a misleading handled error that clients are already keyed on.

### 7.4 Framework errors you should _not_ throw manually

- `AppserverAuthError` — thrown automatically by `registerPrivate` when the user is `null`. Don't instantiate it.
- `HTTP 422` with TypeBox errors — emitted automatically when the input fails schema validation. Your handler never runs in that case.

---

## 8. Bootstrap: the entry file

The bootstrap (typically `src/index.ts`) does two things, and only two things:

1. Construct the `Appserver`, passing `parseUser`, `getMetrics`, and allowed CORS origins.
2. Import and call every `register<Name>(server)` function.

An express server is automatically created, started and wired up to all the registered routes.

```ts
import { Appserver } from "@cripty2001/utils/appserver/server";
import { registerVersionIos } from "./api/version/ios.js";
import { registerUtilsIdenticon } from "./api/utils/identicon.js";

const PORT = 3000;
const parseUser = async (_token: string) => null; // replace with real token resolution
const getMetrics = () => ({
  /* name: number */
});
const origins = ["http://localhost:5173"];

const server = new Appserver(PORT, parseUser, getMetrics, origins);

registerVersionIos(server);
registerUtilsIdenticon(server);
```

Adding an endpoint = one `import` line and one `register<Name>(server)` call here. Group registrations by folder and alphabetize within each group — it stays readable as the list grows.

`getMetrics` returns `Record<string, number>` and is exposed at `GET /metrics` in Prometheus format (keys are lowercased, non-alphanumerics collapsed to `_`, then prefixed with `app_`). Values must be finite numbers; non-finite values cause the metrics endpoint to emit an error comment.

**Keep the bootstrap as wiring only.** No business logic, no per-route conditionals, no ad-hoc Express middleware. If you're tempted to add logic here, it belongs in an endpoint file or a shared module.

---

## 9. Adding a new API — checklist

1. **Path.** Confirm each segment is a single lowercase word. `user/revoke` ✅. `user/revoke-cert` ❌. `user/revokeCert` ❌. If two words feel necessary, use a deeper path (`user/cert/revoke`) or a sharper verb.
2. **Create the file** at `src/api/<seg>/<seg>.ts`. `mkdir` the folder if it doesn't exist.
3. **Write the input schema** with TypeBox, exported as `<camelCasePath>InputSchema`. Top-level must be `Type.Object({ ... })`.
4. **Write the register function** named `register<PascalCasePath>`. Use `registerPrivate` if auth is required, `registerPublic` otherwise.
5. **Map each failure mode** to a category (§7):
   - Caller's fault / actionable → `AppserverHandledError('SPECIFIC_CODE', 'message', { payload })`
   - "Shouldn't happen" / internal → plain `throw new Error(...)`
6. **Return a concrete output shape.** Prefer narrow, explicit types (not `any`, not `unknown`). For "success or expected failure", use a discriminated union with `ok: true | false`.
7. **Register in the bootstrap:** import and call `register<PascalCasePath>(server)`.
8. **Build & type-check.** Strict mode is not negotiable; fix every TS error, don't silence.
9. **Test locally** using the `@cripty2001/utils/appserver/client` client — don't hand-roll fetch + msgpack.

---

## 10. Conventions and gotchas

- **Always import `Type`, `Static`, `TSchema`, `Value` from the appserver module**, not from `@sinclair/typebox` directly. The appserver re-exports them to keep everyone on the same TypeBox version; a direct import risks subtle type-identity mismatches.
- **Don't do work at module top-level** beyond declaring schemas and constants. The file is imported once by the bootstrap; don't trigger side effects at import time (no DB connections, no timers, no fetches).
- **Don't reach into `req`/`res`.** You don't have them. If you think you need headers, cookies, or custom status codes, you're fighting the framework — reshape the endpoint instead.
- **Binary data** (PDFs, signatures, DER blobs, images) travels as `Uint8Array`, in and out. Don't base64-encode — msgpack handles binary natively.
- **No `undefined` in outputs.** Use `null` or omit the key. `exactOptionalPropertyTypes` is on, so most of these get caught by the type checker.
- **`.js` extensions on relative imports** are required even though source files are `.ts`.
- **CORS origins** are a constructor arg to `Appserver`. Adjust in the bootstrap; don't add per-route CORS.
- **Input is frozen.** Treat the `input` argument as immutable. If you need to transform, make a copy.
- **Comments:** document _why_, not _what_. A well-named identifier beats any comment.

---

## 11. Anti-patterns — do not do these

- A path segment with a hyphen, underscore, or camelCase: `user-certs`, `user_certs`, `userCerts`. Use a nested folder or rename.
- Two endpoints registered from the same file.
- Importing `Type` from `@sinclair/typebox` directly.
- Returning the raw exception or `err.message` inside a response payload.
- Catching every exception and returning `{ ok: false, message: e.message }` — you're turning bugs into handled errors and hiding them.
- Adding a JSON endpoint, an Express route, or middleware by hand.
- Parsing `req.body` yourself.
- Declaring a schema for the _output_ — inference is deliberate.
- Mutating `input` inside the handler.
- Using an `AppserverHandledError` for something the caller genuinely can't act on (infrastructure failure, programmer bug).
- Using a plain `Error` for something the caller must react to (the client will receive a useless generic message).
- Putting business logic in the bootstrap file. That file is wiring only.

---

## 12. HTTP-level error map (for client-side debugging)

| Status                               | Meaning                                              | Body shape                             |
| ------------------------------------ | ---------------------------------------------------- | -------------------------------------- |
| `200`                                | Success                                              | Handler return value (msgpack-encoded) |
| `400`                                | Bad request format (not msgpack, unparseable body)   | `{ error, code }`                      |
| `401`                                | Authentication required (private endpoint, no token) | `{ error, code }`                      |
| `403` (`code: PERMISSION_DENIED`)    | `AppserverAuthError`                                 | `{ error, code, payload }`             |
| `422`                                | Input failed schema validation                       | `{ errors, received }`                 |
| `500` (`code: INTERNAL_SERVERERROR`) | Unhandled server exception                           | `{ error, code }`                      |
| `500` (other `code`)                 | `AppserverHandledError` thrown by handler            | `{ error, code, payload }`             |

On the client (`@cripty2001/utils/appserver/client`) these surface as:

- `200` → handler return value
- `401` / `403` → `ClientAuthError` (plus an internal token reset in `Client.exec`)
- `422` → `ClientValidationError` with `.errors`
- `400` / `500` → `ClientServerError` with `.code`, `.message`, `.payload`
- anything else → `ClientError`

---

## 13. Complete worked example (cookbook)

A self-contained walkthrough exercising every pattern you're likely to hit: public endpoint, private endpoint, discriminated-union output, handled error with payload, unhandled error, binary input/output, optional/nullable fields, arrays, nested objects, and the bootstrap that wires them together.

Assume a fictional user type:

```ts
type AppUser = {
  id: string;
  fullName: string;
  _passwordHash: string; // '_' prefix → stripped by built-in /auth/whoami
};
```

### 13.1 Public endpoint — simple input/output

`src/api/health/ping.ts`

```ts
import type { Appserver } from "@cripty2001/utils/appserver/server";
import { Type } from "@cripty2001/utils/appserver/server";

// Even a "no real input" endpoint takes an object at the top level.
// Prefer Type.Object({}) over omitting the schema.
export const healthPingInputSchema = Type.Object({});

export function registerHealthPing(server: Appserver<AppUser>): void {
  server.registerPublic(
    "health/ping",
    healthPingInputSchema,
    async (_input) => {
      // Output shape is inferred from this return — no schema needed.
      return {
        ok: true,
        ts: new Date().toISOString(), // Date → string at the boundary
      };
    },
  );
}
```

### 13.2 Public endpoint — discriminated-union output

`src/api/version/ios.ts`

```ts
import type { Appserver } from "@cripty2001/utils/appserver/server";
import { Type } from "@cripty2001/utils/appserver/server";

// The business outcome is "supported" or "not supported with upgrade info".
// That's not an error — it's normal, expected branching — so we model it in the return type.
type SupportedVersionData =
  | { ok: true }
  | {
      ok: false;
      title: string;
      message: string;
      link: { title: string; url: string } | null;
    };

const SUPPORTED_VERSIONS: Record<string, SupportedVersionData> = {
  "1.0.0": { ok: true },
  "0.9.0": {
    ok: false,
    title: "Update required",
    message: "Please update to 1.0.0.",
    link: { title: "App Store", url: "https://apps.apple.com/..." },
  },
};

export const versionIosInputSchema = Type.Object({
  version: Type.String(),
});

export function registerVersionIos(server: Appserver<AppUser>): void {
  server.registerPublic("version/ios", versionIosInputSchema, async (input) => {
    const data = SUPPORTED_VERSIONS[input.version];
    if (!data)
      // Unknown version is an expected negative outcome, not an error.
      // Client shows "please upgrade"; no throw.
      return {
        ok: false,
        title: "Version not supported",
        message: `Version ${input.version} is not supported.`,
        link: null,
      };
    return data;
  });
}
```

### 13.3 Private endpoint — handled error, unhandled error, nested schema

`src/api/user/cert/revoke.ts`

```ts
import type { Appserver } from "@cripty2001/utils/appserver/server";
import {
  Type,
  AppserverHandledError,
} from "@cripty2001/utils/appserver/server";

// Nested objects, optional fields, nullable fields, arrays — all via TypeBox.
export const userCertRevokeInputSchema = Type.Object({
  certId: Type.String(),
  reason: Type.Optional(
    // optional = key may be absent
    Type.Union([
      Type.Literal("COMPROMISED"),
      Type.Literal("SUPERSEDED"),
      Type.Literal("OTHER"),
    ]),
  ),
  notes: Type.Union([Type.String(), Type.Null()]), // nullable = required key, value may be null
  witnesses: Type.Array(Type.String()), // array of strings, required
});

// Fake storage layer — illustrative only.
declare function loadCert(id: string): Promise<{
  id: string;
  ownerId: string;
  revokedAt: string | null;
} | null>;
declare function persistRevocation(
  certId: string,
  reason: string,
): Promise<void>;

export function registerUserCertRevoke(server: Appserver<AppUser>): void {
  server.registerPrivate(
    "user/cert/revoke",
    userCertRevokeInputSchema,
    async (input, user) => {
      // --- 1) Semantic validation: map to AppserverHandledError ---
      const cert = await loadCert(input.certId);
      if (cert === null)
        throw new AppserverHandledError(
          "CERT_NOT_FOUND",
          `No certificate with id ${input.certId}.`,
          { certId: input.certId },
        );

      if (cert.ownerId !== user.id)
        throw new AppserverHandledError(
          "CERT_NOT_OWNED",
          "You do not own this certificate.",
        );

      if (cert.revokedAt !== null)
        throw new AppserverHandledError(
          "CERT_ALREADY_REVOKED",
          "This certificate has already been revoked.",
          { revokedAt: cert.revokedAt },
        );

      // --- 2) Do the work. If this throws, it's an internal bug. ---
      await persistRevocation(cert.id, input.reason ?? "OTHER");

      // --- 3) Defensive re-check to illustrate an UNHANDLED error ---
      const after = await loadCert(cert.id);
      if (after === null || after.revokedAt === null)
        // The client can't do anything with this — it's our bug.
        // Generic 500 INTERNAL_SERVERERROR is correct.
        throw new Error(
          `Invariant: cert ${cert.id} was not persisted as revoked`,
        );

      // --- 4) Return an explicit shape. No undefined. ---
      return {
        certId: after.id,
        revokedAt: after.revokedAt,
        reason: input.reason ?? "OTHER",
        witnessCount: input.witnesses.length,
      };
    },
  );
}
```

### 13.4 Binary in, binary out

`src/api/utils/thumbnail.ts`

```ts
import type { Appserver } from "@cripty2001/utils/appserver/server";
import { Type } from "@cripty2001/utils/appserver/server";

// Uint8Array is a first-class TypeBox type AND a first-class msgpack type.
// No base64 anywhere.
export const utilsThumbnailInputSchema = Type.Object({
  image: Type.Uint8Array(),
  maxWidth: Type.Integer({ minimum: 1, maximum: 4096 }),
});

declare function resizeImage(
  bytes: Uint8Array,
  maxWidth: number,
): Promise<Uint8Array>;

export function registerUtilsThumbnail(server: Appserver<AppUser>): void {
  server.registerPublic(
    "utils/thumbnail",
    utilsThumbnailInputSchema,
    async (input) => {
      const resized = await resizeImage(input.image, input.maxWidth);
      return {
        mime: "image/webp",
        bytes: resized, // returned as Uint8Array — client receives Uint8Array
      };
    },
  );
}
```

### 13.5 The bootstrap

`src/index.ts`

```ts
import { Appserver } from "@cripty2001/utils/appserver/server";

// One import per endpoint, grouped by folder, alphabetical within group.
import { registerHealthPing } from "./api/health/ping.js";
import { registerUserCertRevoke } from "./api/user/cert/revoke.js";
import { registerUtilsThumbnail } from "./api/utils/thumbnail.js";
import { registerVersionIos } from "./api/version/ios.js";

const PORT = 3000;

// Resolves the bearer token to your user shape, or null if invalid/absent.
// Keys starting with '_' are stripped by the built-in /auth/whoami endpoint.
const parseUser = async (_token: string): Promise<AppUser | null> => {
  // TODO: look up the token, return the user or null
  return null;
};

// Prometheus gauges exposed at GET /metrics.
const getMetrics = () => ({
  active_sessions: 0,
  queued_jobs: 0,
});

// CORS allowlist for browser clients.
const origins = ["http://localhost:5173", "https://app.example.com"];

const server = new Appserver<AppUser>(PORT, parseUser, getMetrics, origins);

registerHealthPing(server);
registerUserCertRevoke(server);
registerUtilsThumbnail(server);
registerVersionIos(server);

type AppUser = {
  id: string;
  fullName: string;
  _passwordHash: string;
};
```

### 13.6 What the client sees

Using `@cripty2001/utils/appserver/client`:

```ts
import {
  Client,
  ClientServerError,
  ClientValidationError,
} from "@cripty2001/utils/appserver/client";

const client = Client.create("https://api.example.com");
await client.login(bearerToken);

try {
  const res = await client.exec("user/cert/revoke", {
    certId: "abc",
    notes: null,
    witnesses: [],
    // reason omitted — it's optional
  });
  // res is the handler's return value, typed as { certId, revokedAt, reason, witnessCount }
} catch (e) {
  if (e instanceof ClientValidationError) {
    // 422: schema mismatch (e.errors is the TypeBox error list)
  } else if (e instanceof ClientServerError) {
    switch (e.code) {
      case "CERT_NOT_FOUND":
        /* show "not found" */ break;
      case "CERT_NOT_OWNED":
        /* show "access denied" */ break;
      case "CERT_ALREADY_REVOKED":
        /* show "already revoked at " + e.payload.revokedAt */ break;
      case "INTERNAL_SERVERERROR":
        /* show generic failure, file a bug */ break;
    }
  }
}
```

This is the full surface area. Everything else is a variation on these patterns.

---

## 14. When in doubt

If you're about to do something the framework doesn't support, **change the endpoint shape**, don't bypass the framework. Bypasses metastasize: one handcrafted route becomes two, then a whole parallel code path, and suddenly half the API doesn't have validation or typed errors. The constraint is the feature.
