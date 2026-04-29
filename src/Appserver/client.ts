import { Whispr, WhisprSetter } from "@cripty2001/whispr";
import { decode, encode } from "@msgpack/msgpack";
import { AppserverData } from "./common";

export type { AppserverData };

export type ClientCreateOptions = {
    rpcMount: string;
};

export class ClientError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class ClientAuthError extends ClientError {
    constructor(
        public readonly code: string = "PERMISSION_DENIED",
        message: string = "Permission denied",
        public readonly payload: AppserverData = {},
    ) {
        super(message);
    }
}
export class ClientServerError extends ClientError {
    constructor(public code: string, message: string, public payload: AppserverData = {}) {
        super(message);
    }
}
type ClientValidationErrorError = {
    path: string;
    message: string;
    value: unknown;
}
export class ClientValidationError extends ClientError {
    public readonly errors: ClientValidationErrorError[];
    constructor(errors: ClientValidationErrorError[]) {
        const first = errors[0] ?? {
            path: "Internal Error",
            message: "",
            value: undefined,
        };
        super(`[Validation Error] ${first.path}: ${first.message}`);
        this.errors = errors;
    }
}

export class Client {
    private readonly token: Whispr<string | null>;
    private readonly setToken: WhisprSetter<string | null>;
    public readonly loggedIn: Whispr<boolean>;

    private constructor(
        private url: string,
        private readonly rpcMount: string,
    ) {
        const [token, setToken] = Whispr.create<string | null>(null);
        this.token = token;
        this.setToken = setToken;
        this.loggedIn = token.transform((t) => t !== null);
    }

    public static create(url: string, options: ClientCreateOptions): Client {
        const m = options.rpcMount.startsWith("/") ?
            options.rpcMount :
            `/${options.rpcMount}`;
        return new Client(url, m);
    }

    public async login(token: string): Promise<boolean> {
        this.setToken(token);
        return true;
    }

    public logout(): void {
        this.setToken(null);
    }

    public async exec<I extends AppserverData, O extends AppserverData>(
        action: string,
        input: I,
        onError: Record<string, (payload: AppserverData) => Promise<void>> = {},
    ): Promise<O> {
        while (true) {
            try {
                return await this.unsafeExec(action, input);
            } catch (e) {
                if (e instanceof ClientAuthError) {
                    this.logout();
                    await this.token.load();
                    continue;
                }

                if (e instanceof ClientServerError) {
                    const handler = onError[e.code];
                    if (handler) {
                        await handler(e.payload);
                    }
                }
                throw e;
            }
        }
    }

    private async unsafeExec<I extends AppserverData, O extends AppserverData>(
        action: string,
        input: I,
    ): Promise<O> {
        const testedToken = this.token.value;
        const actionKey = action;
        const wireBody = {
            action: actionKey,
            payload: input as AppserverData,
        };

        const res = await fetch(`${this.url}${this.rpcMount}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/vnd.msgpack",
                ...(testedToken !== null ? { Authorization: `Bearer ${testedToken}` } : {}),
            },
            body: new Uint8Array(encode(wireBody)),
        });

        const buf = await res.arrayBuffer();

        const decoded = decode(buf);

        if (res.status === 200)
            return decoded as O;

        if (res.status === 422) {
            const data = decoded as {
                errors: ClientValidationErrorError[];
                received: AppserverData;
            }
            throw new ClientValidationError(data.errors);
        }

        const genericError = decoded as {
            error: string;
            code: string;
            payload: AppserverData;
        }
        if (res.status === 400 || res.status === 404 || res.status === 500) {
            throw new ClientServerError(
                genericError.code,
                genericError.error,
                genericError.payload ?? {},
            );
        }

        if (res.status === 401 || res.status === 403) {
            this.setToken(null);
            throw new ClientAuthError(
                genericError.code,
                genericError.error,
                genericError.payload,
            )
        }

        throw new ClientError(`Unexpected server response: ${res.status}`);
    }
}
