# Appserver API guide

Covers both sides of the RPC system: the server (`AppserverDispatcher` from `@cripty2001/utils/appserver/server`) and the client (`Client` from `@cripty2001/utils/appserver/client`). Self-contained. A worked example covering every common case is in §15.

---

## Part I — Server

---

## 1. What the API layer is

- A **typed RPC dispatcher**. Every endpoint is reached via a single `POST` to a bound Express path (e.g. `/exec`). The body contains `{ action, payload }` where `action` is a slash-routed string identifying the handler and `payload` is the input object.
- Wire format is **MessagePack** (`Content-Type: application/vnd.msgpack`). A JSON request is rejected with `REQUEST_INVALID_TYPE_HEADER`. You never touch MessagePack yourself — the dispatcher decodes the request body and encodes your return value. Binary payloads (`Uint8Array`) flow in and out natively with no base64.
- The dispatcher is `AppserverDispatcher`. It binds to an existing Express app; it does not create one itself.

**You write `{ schema, handler }` module objects. The dispatcher handles validation, routing, and error mapping.**

---

## 2. Tech stack

| Layer               | Choice                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language            | TypeScript, strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`)                                          |
| Dispatcher          | `AppserverDispatcher` from `@cripty2001/utils/appserver/server`                                                                                               |
| Schema / validation | `@sinclair/typebox`, re-exported as `Type`, `Static`, `TSchema`, `Value` from the appserver module — **always import from there**, never from typebox directly |
| Wire format         | MessagePack (handled by the dispatcher — not imported by handlers)                                                                                            |

---

## 3. Directory layout

```
src/
  index.ts               # Bootstrap: creates Express app, AppserverDispatcher, calls bind/autoload
  api/
    <segment>/
      <segment>.ts        # One file per endpoint. Path mirrors action string.
```

**Rules for `src/api/`:**

1. **Folder/file path IS the action string.** `src/api/foo/bar.ts` compiles to `foo/bar.js` and is autoloaded as action `foo/bar`.
2. **Every path segment is a single lowercase alphanumeric word.** The autoloader enforces regex `^([a-z0-9]+\/)*[a-z0-9]+$`. Hyphens, underscores, uppercase, and multi-word segments throw at startup. Use a deeper folder (`user/cert/revoke`) or a sharper verb instead.
3. **One endpoint per file.** The autoloader registers the file's default export as one action.
4. **No barrel / `index.ts` files inside `src/api/`.** Each file is standalone.
5. **Autoload points at compiled output, not source.** The autoloader scans for `.js` files. Point it at `dist/api` (or equivalent), not `src/api`.

---

## 4. The endpoint module shape

Every endpoint file must have a **default export** satisfying `AppserverModule`:

```ts
import { Type } from '@cripty2001/utils/appserver/server';
import type { AppserverModule } from '@cripty2001/utils/appserver/server';

// Export the input schema so clients can import the type.
export const myActionInputSchema = Type.Object({
    field: Type.String(),
});

const mod: AppserverModule<typeof myActionInputSchema> = {
    schema: myActionInputSchema,
    handler: async (input, auth) => {
        // input is typed and pre-validated.
        // auth is the raw Bearer token string, or undefined if absent.
        return { /* AppserverData-compatible value */ };
    },
};

export default mod;
```

The autoloader checks `mod.default.handler` (must be a function) and `mod.default.schema` (must be truthy) at startup. A file that does not satisfy this throws immediately.

### Naming conventions

| Thing         | Rule                                                         | Example                           |
| ------------- | ------------------------------------------------------------ | --------------------------------- |
| File path     | `src/api/<seg>/<seg>.ts`                                     | `src/api/version/ios.ts`          |
| Action string | `<seg>/<seg>` (matches file path without `.ts` extension)    | `version/ios`                     |
| Schema const  | `<camelCasePath>InputSchema`                                 | `versionIosInputSchema`           |
| Segments      | single lowercase alphanumeric word, no hyphens, no camelCase | `version`, `ios`, `cert`, `utils` |

---

## 5. Input and output types

### Input — declared, exported, TypeBox

- Always `Type.Object({ ... })` at the top level, even for empty inputs (`Type.Object({})`). Never a bare string, number, or array at the top.
- Export the schema constant so clients can import it.
- The handler's `input` parameter is typed automatically from the schema. Do not annotate it manually.
- Internally the input type is modeled as `Static<typeof schema> & AppserverData`:
  - `Static<typeof schema>` gives you the TypeScript type derived from the TypeBox schema.
  - `& AppserverData` ensures that whatever the schema describes is also representable on the wire (msgpack-safe / JSON-like: primitives, arrays, objects, `Uint8Array`, `null`).
- Validation runs before the handler. Invalid input returns `422` with TypeBox errors. Your handler never sees malformed data. Validate semantics only (e.g. "does this ID exist") — not shape.

### Output — inferred, no schema

- The return type is inferred. There is no output schema, intentionally.
- Must be `AppserverData`:
  ```ts
  type AppserverData =
    | null | boolean | number | string | Uint8Array
    | AppserverData[]
    | { [key: string]: AppserverData };
  ```
  No `Date`, `undefined`, class instances, `bigint`, `Map`, or `Set`. Use ISO strings for dates. Use `null` instead of `undefined`.
- **Discriminated unions** (`{ ok: true, ... } | { ok: false, ... }`) are idiomatic for expected business branching. For genuine errors, throw — see §7.

---

## 6. Authentication

The dispatcher passes the raw Bearer token to every handler as `auth: string | undefined`. **There is no automatic auth enforcement.** Auth is fully manual in the handler.

- If `Authorization: Bearer <token>` is present, `auth` is the token string (after stripping `Bearer `).
- If absent or malformed, `auth` is `undefined`.
- If your endpoint requires auth, check `auth`, resolve the token yourself, and throw `AppserverAuthError` if unauthorized.

```ts
handler: async (input, auth) => {
    if (!auth) throw new AppserverAuthError();
    const user = await resolveToken(auth);
    if (!user) throw new AppserverAuthError();
    // ...
}
```

### [Example] Recommended OIDC integration pattern (oidc-spa)

`Client` deliberately doesn't fetch or refresh tokens — that's the OIDC library's job. To stay logged in indefinitely, **proactively** push fresh tokens into the Client whenever your OIDC library renews them, then bind a UI overlay to `client.loggedIn` for the unrecoverable case.

Two-line proactive renewal (using `oidc-spa`):

```ts
const oidc = await createOidc({ /* … */ });

if (oidc.isUserLoggedIn) {
    const { idToken } = await oidc.getTokens();
    await client.login(idToken);

    // Re-push every time the underlying library refreshes the session.
    oidc.subscribeToTokensChange(({ idToken }) => {
        void client.login(idToken);
    });
}

```

This works because Client logged in status only changes when an api report an auth error, this mean that as long as the latest set token is valid, the api will never report an auth error.

---

## 7. Error handling

Two categories of throwable errors, plus one for auth.

### 7.1 Handled errors — `AppserverHandledError`

For failures the caller **can and must react to**: "certificate already revoked", "organization not found", "fiscal code malformed".

```ts
import { AppserverHandledError } from '@cripty2001/utils/appserver/server';

throw new AppserverHandledError(
    'CERTIFICATE_ALREADY_REVOKED',                // code — SCREAMING_SNAKE_CASE, stable, treat as public API
    'This certificate has already been revoked.', // user-facing message, no internals
    { revokedAt: '2026-04-10T12:00:00Z' },        // optional AppserverData payload
);
```

- Maps to HTTP `500` with body `{ error, code, payload }`.
- `code` is a contract — clients `switch` on it. Don't rename casually.
- Message is user-facing: plain language, no stack info, no DB field names.
- Extra context goes in `payload`, not interpolated into the message.

### 7.2 Auth errors — `AppserverAuthError`

For missing or invalid credentials.

```ts
import { AppserverAuthError } from '@cripty2001/utils/appserver/server';

throw new AppserverAuthError();
// or:
throw new AppserverAuthError('Session expired', 'SESSION_EXPIRED');
// constructor: (message?, code?) — both optional
```

- Maps to HTTP `403` with code `PERMISSION_DENIED` by default.
- Use only for auth/permission failures, not for business logic rejections.

### 7.3 Unhandled errors — plain `Error`

For **"this should not have happened"** bugs: violated invariants, upstream crashes, unexpected nulls.

```ts
if (cert === null)
    throw new Error(`Invariant: cert ${id} fetched but returned null`);
```

- Dispatcher logs server-side and returns generic `{ error: 'Internal server error', code: 'INTERNAL_SERVERERROR' }` with HTTP `500`. Caller sees nothing useful — on purpose.
- Never catch-and-rethrow as `AppserverHandledError` to surface a nicer message. That hides bugs.

### 7.4 Decision rule

_"Is this failure something the caller did, or can act on?"_
- Yes → `AppserverHandledError`
- It's an auth/permission problem → `AppserverAuthError`
- No, it's an internal bug → plain `throw new Error(...)`

When unsure, use plain `Error`. Easier to promote later than to un-ship a handled error clients are keyed on.

---

## 8. Bootstrap (server)

```ts
import express from 'express';
import { AppserverDispatcher } from '@cripty2001/utils/appserver/server';

const app = express();
const dispatcher = new AppserverDispatcher();

await dispatcher.autoload('./dist/api'); // must be awaited before bind/listen

dispatcher.bind(app, '/exec'); // all registered actions route through this POST path

app.listen(3000);
```

`autoload` throws if any file has an invalid action path, a missing/malformed default export, or a duplicate action. For manual registration (testing, dynamic cases):

```ts
dispatcher.register('action/path', { schema: mySchema, handler: myHandler });
```

Keep the bootstrap as wiring only. No business logic.

---

## 9. HTTP-level error map (server)

| Status | Trigger                                    | Body shape                                    |
| ------ | ------------------------------------------ | --------------------------------------------- |
| `200`  | Handler returned successfully              | Handler return value (msgpack-encoded)        |
| `400`  | Wrong Content-Type, missing/invalid action | `{ error, code }`                             |
| `403`  | `AppserverAuthError` thrown                | `{ error, code, payload }`                    |
| `404`  | Action not in registry                     | `{ error, code }`                             |
| `422`  | Input failed schema validation             | `{ errors: string, received }`                |
| `500`  | `AppserverHandledError` thrown             | `{ error, code, payload }`                    |
| `500`  | Plain `Error` thrown                       | `{ error, code: 'INTERNAL_SERVERERROR' }`     |

Note: `errors` in the `422` body is a JSON-serialized string of TypeBox errors (from `JSON.stringify(Value.Errors(...))`), not a parsed object. The client receives it as a string; parse it if you need the structure.

---

## 10. Adding a new endpoint — checklist

1. **Path.** Every segment must match `[a-z0-9]+`. `user/cert/revoke` ✅. `user/revoke-cert` ❌.
2. **Create** `src/api/<seg>/<seg>.ts`.
3. **Write the input schema**, exported as `<camelCasePath>InputSchema`. Top-level `Type.Object({})`.
4. **Write the module** as a default export `{ schema, handler }`.
5. **Handle auth** if needed: check `auth`, resolve the token, throw `AppserverAuthError` if not authorized.
6. **Map failure modes** (§7): actionable → `AppserverHandledError`, auth → `AppserverAuthError`, bug → plain `Error`.
7. **Return a concrete shape.** No `undefined`, no class instances.
8. **Build & type-check.** Strict mode is non-negotiable.
9. **Verify autoload.** Compiled file must appear under the autoload base with the correct path.

---

## 11. Anti-patterns (server)

- Path segment with hyphen, underscore, or uppercase — autoloader throws.
- Not exporting a default `AppserverModule` — autoloader throws.
- Importing `Type` from `@sinclair/typebox` directly instead of the appserver module.
- Not checking `auth` in a handler that requires it — the dispatcher does not enforce this.
- Catching every exception and returning `{ ok: false, message: e.message }` — turns bugs into handled errors.
- Returning `err.message` in a response payload.
- Declaring an output schema — output type inference is intentional.
- Mutating `input` inside the handler.
- Pointing `autoload` at `src/api` (source) instead of compiled output.
- Business logic in the bootstrap.

---

## Part II — Client

---

## 12. What the client is

`Client` from `@cripty2001/utils/appserver/client` is a typed MessagePack RPC client that mirrors the server's dispatcher. It:

- Manages a Bearer token reactively via `Whispr<string | null>` from `@cripty2001/whispr`.
- Encodes requests as `{ action, payload }` in MessagePack and decodes responses.
- Maps HTTP status codes to typed error classes.
- On auth errors (`401` or `403`), **automatically clears the token and suspends the in-flight call** until a new token is provided via `login()`, then retries — enabling transparent re-authentication.
- Accepts per-call error handlers keyed by server error code, for side effects before rethrow.

---

## 13. Client API

### Construction

```ts
import { Client } from '@cripty2001/utils/appserver/client';

const client = Client.create(url, { rpcMount });
```

`Client.create` is the only constructor. Do not call `new Client(...)`.

| Parameter          | Type     | Description                                                                                    |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `url`              | `string` | Base URL of the server, e.g. `'https://api.example.com'`. No trailing slash needed.           |
| `options.rpcMount` | `string` | Path to the dispatcher's bound route, e.g. `'/exec'`. **Must start with `/`.**                      |

All requests are sent as `POST` to `url + rpcMount`.

### Token management

```ts
await client.login(token: string): Promise<boolean>
client.logout(): void
client.loggedIn: Whispr<boolean>
```

- **`login(token)`** — stores the token in the reactive `Whispr`. Always resolves `true`. Makes **no network call** — it does not validate the token against the server. The token is sent as `Authorization: Bearer <token>` on all subsequent `exec` calls.
- **`logout()`** — synchronously clears the token.
- **`loggedIn`** — a `Whispr<boolean>` reactive observable. Derives to `true` when a token is set, `false` when cleared. Not a plain boolean — read synchronously via `.value`, or subscribe reactively. Useful for binding to UI visibility state.

### Executing actions

```ts
await client.exec<I, O>(
    action: string,
    input: I,
    onError?: Record<string, (payload: AppserverData) => Promise<void>>,
): Promise<O>
```

| Parameter | Type                                                        | Description                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`  | `string`                                                    | The action string, e.g. `'user/cert/revoke'`. Must match a registered server action exactly.                                                                                                             |
| `input`   | `I extends AppserverData`                                   | The input payload. Validated server-side against the endpoint's schema.                                                                                                                                  |
| `onError` | `Record<string, (payload: AppserverData) => Promise<void>>` | Optional. Map of server error `code` → async callback. Called **before** the error is rethrown. Use for side effects on known codes (toasts, cache invalidation, analytics). Does not suppress the throw. |

**Return value:** the handler's return value, decoded from MessagePack as `O`. `O` is not verified at runtime — it is a cast. You are responsible for knowing the server's return shape.

### Auth retry loop

When `exec` encounters a `ClientAuthError` (HTTP `401` or `403`):

1. Calls `logout()` — clears the token.
2. Calls `await this.token.load()` — **suspends** until the `Whispr<string | null>` token changes to a non-null value, i.e. until `login(newToken)` is called from somewhere (a login modal, an OAuth callback, etc.).
3. Retries the original request with the new token.

This means **`exec` can suspend indefinitely** if `login()` is never called. Design accordingly: a `ClientAuthError` should trigger a login prompt; `login()` must be called on success to unblock. If the user navigates away without logging in, the suspended promise is simply abandoned.

The retry only fires for `ClientAuthError`. All other errors throw immediately (after running any matching `onError` handler).

---

## 14. Error classes (client)

All extend `ClientError extends Error`.

| Class                  | Triggered by         | Key fields                                                                  |
| ---------------------- | -------------------- | --------------------------------------------------------------------------- |
| `ClientAuthError`      | HTTP `401` or `403`  | `.code: string`, `.payload: AppserverData`                                  |
| `ClientServerError`    | HTTP `400`, `404`, `500` | `.code: string`, `.payload: AppserverData`                              |
| `ClientValidationError`| HTTP `422`           | `.errors: unknown` — the raw JSON string from the server; parse if needed   |
| `ClientError`          | Unexpected status    | `.message: string`                                                          |

`ClientAuthError` also triggers `logout()` automatically inside `unsafeExec` before being caught by the retry loop. Do not catch `ClientAuthError` yourself unless you want to short-circuit the retry.

`ClientServerError.code` maps directly to the `code` field of `AppserverHandledError` on the server. This is the cross-side contract — `switch` on it.

---

## 15. Complete worked example

### Server side

`src/api/user/cert/revoke.ts`

```ts
import {
    Type,
    AppserverHandledError,
    AppserverAuthError,
} from '@cripty2001/utils/appserver/server';
import type { AppserverModule } from '@cripty2001/utils/appserver/server';

export const userCertRevokeInputSchema = Type.Object({
    certId: Type.String(),
    reason: Type.Optional(
        Type.Union([
            Type.Literal('COMPROMISED'),
            Type.Literal('SUPERSEDED'),
            Type.Literal('OTHER'),
        ]),
    ),
    notes: Type.Union([Type.String(), Type.Null()]),
    witnesses: Type.Array(Type.String()),
});

declare function resolveToken(token: string): Promise<{ id: string } | null>;
declare function loadCert(id: string): Promise<{ id: string; ownerId: string; revokedAt: string | null } | null>;
declare function persistRevocation(certId: string, reason: string): Promise<void>;

const mod: AppserverModule<typeof userCertRevokeInputSchema> = {
    schema: userCertRevokeInputSchema,
    handler: async (input, auth) => {
        // Auth: manual — dispatcher does not enforce this
        if (!auth) throw new AppserverAuthError();
        const user = await resolveToken(auth);
        if (!user) throw new AppserverAuthError();

        // Semantic validation → AppserverHandledError
        const cert = await loadCert(input.certId);
        if (!cert)
            throw new AppserverHandledError('CERT_NOT_FOUND', `No certificate with id ${input.certId}.`, { certId: input.certId });

        if (cert.ownerId !== user.id)
            throw new AppserverHandledError('CERT_NOT_OWNED', 'You do not own this certificate.');

        if (cert.revokedAt !== null)
            throw new AppserverHandledError('CERT_ALREADY_REVOKED', 'This certificate has already been revoked.', { revokedAt: cert.revokedAt });

        await persistRevocation(cert.id, input.reason ?? 'OTHER');

        // Defensive re-check: if this fails it is an internal bug, not a caller error
        const after = await loadCert(cert.id);
        if (!after || after.revokedAt === null)
            throw new Error(`Invariant: cert ${cert.id} was not persisted as revoked`);

        return {
            certId: after.id,
            revokedAt: after.revokedAt,
            reason: input.reason ?? 'OTHER',
            witnessCount: input.witnesses.length,
        };
    },
};

export default mod;
```

`src/index.ts`

```ts
import express from 'express';
import { AppserverDispatcher } from '@cripty2001/utils/appserver/server';

const app = express();
const dispatcher = new AppserverDispatcher();

await dispatcher.autoload('./dist/api');
dispatcher.bind(app, '/exec');

app.listen(3000);
```

### Client side

```ts
import {
    Client,
    ClientAuthError,
    ClientServerError,
    ClientValidationError,
} from '@cripty2001/utils/appserver/client';

// Construct once, reuse across the app.
const client = Client.create('https://api.example.com', { rpcMount: '/exec' });

// Store the token. No network call is made here.
await client.login(bearerTokenFromYourAuthFlow);

// Reactive auth state — bind to UI if needed.
console.log(client.loggedIn.value); // true

try {
    const result = await client.exec(
        'user/cert/revoke',
        {
            certId: 'abc123',
            notes: null,
            witnesses: ['alice', 'bob'],
            // reason is optional, omit freely
        },
        {
            // onError: side-effect callbacks keyed by server error code.
            // Runs before the error is rethrown — use for toasts, logging, cache busting, etc.
            'CERT_ALREADY_REVOKED': async (payload) => {
                console.warn('Already revoked at', payload);
            },
        },
    );

    console.log(result.certId, result.revokedAt, result.witnessCount);

} catch (e) {
    if (e instanceof ClientValidationError) {
        // HTTP 422 — input did not match the server's schema.
        // e.errors is the raw JSON string from the server.
        const errors = JSON.parse(e.errors as string);
        console.error('Validation failed:', errors);

    } else if (e instanceof ClientServerError) {
        // AppserverHandledError from the server, or 400/404.
        // Switch on e.code — it maps directly to the server's error code.
        switch (e.code) {
            case 'CERT_NOT_FOUND':
                // e.payload.certId available
                break;
            case 'CERT_NOT_OWNED':
                break;
            case 'CERT_ALREADY_REVOKED':
                // e.payload.revokedAt available
                // onError above also ran before this catch
                break;
            case 'ACTION_NOT_FOUND':
                // Mismatched action string — likely a client/server version skew
                break;
            case 'INTERNAL_SERVERERROR':
                // Bug on the server — show generic failure
                break;
        }

    } else if (e instanceof ClientAuthError) {
        // HTTP 401/403. Normally the retry loop handles this transparently.
        // Only reaches here if the retry loop itself encounters another auth failure
        // (e.g. the new token is also invalid).
    }
}

client.logout();
console.log(client.loggedIn.value); // false
```

### Auth retry flow (narrative)

```
client.exec('user/cert/revoke', ...) called — token is null
  → server returns 403
  → client clears token, suspends, awaits token.load()
  [your UI shows a login modal]
  → user authenticates, you call client.login(newToken)
  → token.load() resolves
  → exec retries automatically with the new token
  → returns result normally
```

If `login()` is never called, `exec` suspends indefinitely. Ensure your auth UI always either calls `login()` or the outstanding promise is abandoned (e.g. component unmounts, navigation occurs).

---

## 16. When in doubt

- If you need to bypass the dispatcher (custom Express routes, JSON endpoints), you are building a parallel code path without validation or typed errors. Reshape the endpoint instead.
- If you think you need to catch `ClientAuthError` yourself, you are probably fighting the retry loop. Let it run; only intercept it if you need to abort (navigate away without waiting for re-login).
- If the inferred `O` in `exec<I, O>` feels wrong, supply it explicitly: `client.exec<MyInput, MyOutput>(...)`. The ground truth is the server handler's return type — keep both sides in sync.