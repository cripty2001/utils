# Appserver Client guide

This document is the entry point for anyone — human or agent — **consuming** APIs built on the `Appserver` framework via the `Client` class from `@cripty2001/utils/appserver/client`. It covers setup, authentication, making calls, typing inputs and outputs, and the full error model.

It is intentionally self-contained: you should not need to read any existing call site to understand how to add a new one. A full worked example lives at the end (§8).

Read it before writing call sites. The conventions here are not suggestions.

---

## 1. What the Client is

- A **typed RPC caller** that mirrors the server's RPC model: every call is a `POST` to the server's mount point, carrying an `action` string and an `input` object.
- The wire format is **MessagePack** (`application/vnd.msgpack`). You never touch MessagePack yourself: the `Client` encodes your input and decodes the response. Binary payloads (`Uint8Array`) round-trip natively — no base64.
- Authentication is **Bearer token**, stored inside the `Client` instance. You set it once via `login()`; every subsequent `exec()` sends it automatically.
- The `Client` exposes a reactive `loggedIn` whispr (a signal — see §3) so UI layers can subscribe to auth state without polling.

**You do not write fetch calls, set Content-Type headers, or decode MessagePack.** You call `client.exec(action, input)` and get back the typed return value.

---

## 2. Tech stack

| Layer       | Choice                                              |
| ----------- | --------------------------------------------------- |
| Language    | TypeScript, strict mode                             |
| Client      | `@cripty2001/utils/appserver/client`                |
| Wire format | MessagePack (transparent — not imported by callers) |
| Auth        | Bearer token stored in `Client`, sent automatically |
| Reactivity  | `@cripty2001/whispr` (`Whispr<T>` signal)           |

---

## 3. Creating a client

```ts
import { Client } from "@cripty2001/utils/appserver/client";

const client = Client.create("https://api.example.com", {
  rpcMount: "/exec", // must match the server's mount path
});
```

`rpcMount` is the path prefix the server listens on for RPC calls. A leading `/` is optional — the client normalizes it. It must match whatever the server registered its dispatcher at.

### The `loggedIn` signal

`client.loggedIn` is a `Whispr<boolean>` — a reactive signal derived from the internal token state. Subscribe to it to track auth state:

```ts
client.loggedIn.subscribe((isLoggedIn) => {
  // update nav bar, show login overlay, etc.
});

// Or read current value imperatively:
if (client.loggedIn.value) {
  /* ... */
}
```

It flips to `false` automatically when `logout()` is called or when a `401`/`403` is received. It flips back to `true` when `login()` is called with a new token. You do not manage it manually — it is derived from the internal token state.

---

## 4. Authentication

### Login

```ts
await client.login(bearerToken);
```

Stores the token internally. Every subsequent `exec()` sends `Authorization: Bearer <token>` automatically. `login()` does not validate the token with the server — it just stores it and unblocks any calls currently suspended waiting for a token.

### Logout

```ts
client.logout();
```

Clears the token. Any in-flight `exec()` calls that subsequently hit a `401`/`403` will suspend and wait for the next `login()` call.

### How `exec()` handles auth failures — no `ClientAuthError` in call sites

**`exec()` never throws `ClientAuthError`.** Internally, if a call gets a `401`/`403` from the server, the client clears the token and suspends the call — blocking until `login()` is called with a new token, then retrying automatically. The caller never sees the failure and never loses the call.

This means:

- **Never handle `ClientAuthError` in call sites.** It is an internal detail of the retry loop, not a public error.
- **No call is ever lost to token expiry.** A call that hits an expired token mid-flight will pause and complete after re-authentication.
- **Auth UI is driven entirely by `loggedIn`.** Subscribe once at the app root. When `loggedIn` flips to `false`, show a login overlay. When the user authenticates, call `login()` — all suspended calls resume.

```tsx
// App root — one subscriber, one login overlay
client.loggedIn.subscribe((isLoggedIn) => {
  setShowLoginOverlay(!isLoggedIn);
});

{
  showLoginOverlay && <LoginOverlay onLogin={(token) => client.login(token)} />;
}
```

---

## 5. Making calls — `exec`

```ts
const result = await client.exec<InputType, OutputType>(action, input, onError);
```

- `action` — the endpoint path, no leading slash: `'version/ios'`, `'user/cert/revoke'`.
- `input` — a plain object matching the server's input schema. TypeBox's `Static<typeof schema>` gives you the exact type.
- `onError` — optional map of `ClientServerError` codes to handlers (see §6). This is the primary way to react to expected server-side failures.
- The return value is typed as `O` — whatever the server handler returns.

**You are responsible for the types.** The client is generic: it doesn't validate the output at runtime. Use the server's exported input schema to derive `I`, and type `O` from what you know the server returns.

### Importing the input schema for type safety

Server endpoint files export their input schema:

```ts
// From the server codebase (or a shared types package)
import { versionIosInputSchema } from "../api/version/ios.js";
import type { Static } from "@cripty2001/utils/appserver/server";

type VersionIosInput = Static<typeof versionIosInputSchema>;
// { version: string }

const result = await client.exec<VersionIosInput, { ok: boolean }>(
  "version/ios",
  { version: "1.0.0" },
);
```

---

## 6. Error model

`exec()` has a deliberate philosophy: **you should not need a `try/catch` at the call site**. Expected server-side failures are handled via the `onError` map passed to `exec()`. Everything else — bugs, misconfigurations, truly unexpected failures — should propagate to the app's global error boundary, which decides how to surface them (toast, crash page, etc.).

```ts
import {
  ClientError,
  ClientServerError,
  ClientValidationError,
} from "@cripty2001/utils/appserver/client";
```

### Error hierarchy

```
ClientError
├── ClientAuthError       (internal — never thrown from exec(), do not catch)
├── ClientValidationError (422 — call site bug, let it propagate)
└── ClientServerError     (400 / 404 / 500 — server-side handled or unhandled error)
```

### 6.1 `ClientServerError` — 400 / 404 / 500

Thrown for non-2xx responses that aren't auth or validation. Covers both **handled errors** (`AppserverHandledError` on the server, `code` is specific) and **unhandled errors** (server bug, `code` is `INTERNAL_SERVERERROR`).

```ts
class ClientServerError extends ClientError {
  code: string; // machine-readable, SCREAMING_SNAKE_CASE
  message: string; // human-readable, suitable for display
  payload: AppserverData; // optional structured context from the server
}
```

The idiomatic way to handle specific codes is via the `onError` argument to `exec()` — a map of code strings to async handler functions. If a `ClientServerError` is thrown and its `code` matches a key in the map, the handler is called with the error's `payload`, then the error is rethrown. If no handler matches, the error propagates as-is.

```ts
await client.exec(
  "user/cert/revoke",
  { certId, notes: null, witnesses: [] },
  {
    CERT_NOT_FOUND: async () => {
      showToast("Certificate not found.");
    },
    CERT_ALREADY_REVOKED: async (payload) => {
      const { revokedAt } = payload as { revokedAt: string };
      showToast(`Already revoked at ${revokedAt}.`);
    },
  },
);
// No try/catch needed. Unhandled codes (including INTERNAL_SERVERERROR)
// propagate to the global error boundary.
```

The `code` is the stable contract — don't key the map on `message`. Messages are human-readable and may change; codes are versioned.

### 6.2 `ClientValidationError` — 422

Thrown when the server rejected the input because it failed schema validation. This is a **call site bug**: the input you sent didn't match the server's TypeBox schema. Do not catch it — let it propagate. Catching it hides the bug. Fix the input shape.

```ts
class ClientValidationError extends ClientError {
  errors: unknown; // TypeBox error list (JSON-stringified by the server)
}
```

### 6.3 `ClientError` — base / unexpected

Base class for all client errors. Also thrown directly on completely unexpected HTTP statuses. Indicates a misconfigured URL, wrong mount path, or similar environmental problem. Do not catch it — let it surface.

```ts
class ClientError extends Error {}
```

### The global error boundary

Unhandled `ClientServerError` (e.g. `INTERNAL_SERVERERROR`), `ClientValidationError`, and `ClientError` all propagate up. The app's top-level error boundary is the right place to catch these and decide how to present them — a generic toast for server errors, a crash page for bugs. This keeps error presentation consistent and call sites clean.

---

## 7. What `AppserverData` is

Both input and output must be `AppserverData`:

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

JSON-like, **plus `Uint8Array`** for binary. No `Date` (use ISO strings), no `undefined` (use `null` or omit), no class instances, no `bigint`, no `Map`/`Set`.

Binary payloads (`Uint8Array`) travel as-is — msgpack handles them natively. Don't base64-encode when sending binary; don't base64-decode when receiving it.

---

## 8. Complete worked example

Covers: client creation, login, public endpoint, private endpoint with `onError`, binary output.

### Setup

```ts
import { Client } from "@cripty2001/utils/appserver/client";

const client = Client.create("https://api.example.com", { rpcMount: "/exec" });
```

### Auth UI (app root)

```tsx
client.loggedIn.subscribe((isLoggedIn) => {
  setShowLoginOverlay(!isLoggedIn);
});

{
  showLoginOverlay && <LoginOverlay onLogin={(token) => client.login(token)} />;
}
```

### Public endpoint — discriminated union output

```ts
type VersionIosResult =
  | { ok: true }
  | {
      ok: false;
      title: string;
      message: string;
      link: { title: string; url: string } | null;
    };

async function checkAppVersion(version: string): Promise<void> {
  const result = await client.exec<{ version: string }, VersionIosResult>(
    "version/ios",
    { version },
  );
  // 200 means the server responded correctly.
  // What the result contains is a contract with the endpoint, not the framework.
  if (!result.ok) {
    showUpdatePrompt(result.title, result.message, result.link);
  }
}
```

### Private endpoint — expected failures via `onError`

```ts
type RevokeCertInput = {
  certId: string;
  reason?: "COMPROMISED" | "SUPERSEDED" | "OTHER";
  notes: string | null;
  witnesses: string[];
};

type RevokeCertOutput = {
  certId: string;
  revokedAt: string;
  reason: string;
  witnessCount: number;
};

async function revokeCertificate(certId: string): Promise<void> {
  const result = await client.exec<RevokeCertInput, RevokeCertOutput>(
    "user/cert/revoke",
    { certId, notes: null, witnesses: [] },
    {
      CERT_NOT_FOUND: async () => {
        showToast("Certificate not found.");
      },
      CERT_NOT_OWNED: async () => {
        showToast("You do not own this certificate.");
      },
      CERT_ALREADY_REVOKED: async (payload) => {
        const { revokedAt } = payload as { revokedAt: string };
        showToast(`Already revoked at ${revokedAt}.`);
      },
    },
  );
  // Only reached if no error was thrown.
  showSuccess(`Certificate revoked at ${result.revokedAt}`);
}
```

### Binary output

```ts
type ThumbnailInput = { image: Uint8Array; maxWidth: number };
type ThumbnailOutput = { mime: string; bytes: Uint8Array };

async function generateThumbnail(imageBytes: Uint8Array): Promise<Uint8Array> {
  const result = await client.exec<ThumbnailInput, ThumbnailOutput>(
    "utils/thumbnail",
    { image: imageBytes, maxWidth: 256 },
  );
  return result.bytes; // already Uint8Array — no decoding step
}
```

---

## 9. HTTP-level status map

For debugging. Under normal use you never inspect status codes — the client throws typed errors instead. Auth statuses (401/403) are handled internally by the retry loop and never surface to callers.

| Status | Thrown as               | Notes                                           |
| ------ | ----------------------- | ----------------------------------------------- |
| `200`  | _(return value)_        | `exec()` resolves with decoded output           |
| `400`  | `ClientServerError`     | Bad request format (shouldn't happen)           |
| `401`  | _(internal)_            | Token cleared, call suspended, retried on login |
| `403`  | _(internal)_            | Token cleared, call suspended, retried on login |
| `404`  | `ClientServerError`     | `code: ACTION_NOT_FOUND` — wrong action string  |
| `422`  | `ClientValidationError` | Input failed schema validation                  |
| `500`  | `ClientServerError`     | Handled or unhandled server error               |
| other  | `ClientError`           | Unexpected — check the URL/mount path           |

---

## 10. Conventions and gotchas

- **One `Client` instance for the app.** Don't create a new client per call or per component. The token and the suspended-call queue live in the instance.
- **Don't persist the token.** On page reload, re-authenticate the user through your auth flow. Persisting tokens and replaying them bypasses whatever trust decision the authenticator made (device trust, session limits, etc.) — that decision belongs to the authenticator, not to you.
- **`login()` always returns `true`.** It does not validate the token. Validation happens on the first private `exec()` — if the token is rejected, the call suspends and waits for a fresh login.
- **Don't access `.payload` without a cast.** `payload` is typed as `AppserverData`. Cast to a concrete shape inside the relevant `onError` handler: `payload as { revokedAt: string }`.
- **Binary in = `Uint8Array`.** Pass `Uint8Array` directly for binary inputs. Don't base64 — msgpack handles it natively.
- **Binary out = `Uint8Array`.** If the server returns binary, it arrives as `Uint8Array` already. No decoding step.
- **Action strings have no leading slash.** `'user/cert/revoke'`, not `'/user/cert/revoke'`. The client prepends the mount path.
- **200 means the server responded syntactically correctly.** What the response contains — success, failure, a union — is a contract with the endpoint, not the framework. Don't assume `200` means the operation succeeded.

---

## 11. Anti-patterns — do not do these

- Constructing your own `fetch` call instead of using `exec()` — you lose typed errors, automatic auth retry, and msgpack handling.
- Writing `try/catch` at the call site to handle `ClientServerError` — use the `onError` map instead. Catch blocks at call sites scatter error handling logic and make it easy to accidentally swallow errors.
- Catching `ClientValidationError` or `ClientError` anywhere other than the global error boundary — these are bugs, not business logic; silencing them hides the problem.
- Branching on `e.message` instead of `e.code` in `onError` handlers — messages are human-readable and not a stable contract.
- Creating a new `Client` per `exec()` call — you lose the token state and the suspended-call queue.
- Base64-encoding binary before sending — msgpack handles `Uint8Array` natively; encoding doubles the payload and is wrong.
- Manually setting `Authorization` headers — `login()` handles this; the framework sends the header automatically.
- Persisting the bearer token across sessions and replaying it on load — re-authenticate the user instead; token persistence decisions belong to the authenticator.
