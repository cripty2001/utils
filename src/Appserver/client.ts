import { Whispr, WhisprSetter } from "@cripty2001/whispr";
import { decode, encode } from "@msgpack/msgpack";
import { Dispatcher } from "../Dispatcher";
import { AppserverData } from "./common";

export type { AppserverData };

export class ClientError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class ClientServerError extends Error {
    constructor(public code: string, message: string, public payload: AppserverData = {}) {
        super(message);
    }
}

export class ClientValidationError extends ClientError {
    constructor(public errors: any[]) {
        super("Validation Error");
    }
}


export class Client {
    private authToken: Whispr<string | null>;
    private setAuthToken: WhisprSetter<string | null>;
    public user: Dispatcher<string | null, AppserverData | null>;

    private constructor(private url: string) {
        const [_authToken, _setAuthToken] = Whispr.create<string | null>(null);
        this.authToken = _authToken;

        this.setAuthToken = (t: string | null) => {
            if (t === this.authToken.value)
                return true;
            return _setAuthToken(t);
        };

        this.user = new Dispatcher(this.authToken, async (token) => {
            if (token === null)
                return null;

            const { user } = await this.unsafeExec<{}, { user: AppserverData | null }>('auth/whoami', {});

            return user;
        }, 0);  // Sync execution
    }

    public static create(url: string): Client {
        return new Client(url);
    }

    public async login(token: string): Promise<boolean> {
        this.setAuthToken(token);
        return await this.user.data.wait(data => {
            if (data.loading)
                return;

            return data.ok
        });
    }

    public async exec<I extends AppserverData, O extends AppserverData>(
        action: string,
        input: I
    ): Promise<O> {
        return this.unsafeExec(`/exec/${action}`, input);
    }

    private async unsafeExec<I extends AppserverData, O extends AppserverData>(
        action: string,
        input: I
    ): Promise<O> {
        const testedToken = this.authToken.value

        const res = await fetch(`${this.url}${action}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/vnd.msgpack",
                ...(testedToken !== null ? { "Authorization": `Bearer ${testedToken}` } : {}),
            },
            body: new Blob(
                [new Uint8Array(
                    encode(input)
                )],
                { type: 'application/msgpack' }
            ),
        });

        if (res.status === 401 || res.status === 403) {
            if (testedToken === this.authToken.value) {
                this.setAuthToken(null);
            }
            throw new ClientError("Permission denied");
        }

        if (res.status === 404)
            throw new ClientError("Not found");

        const decoded = decode(await res.arrayBuffer());
        let responseData;

        if (res.status === 200)
            return decoded as O;
        if (res.status === 422) {
            responseData = decoded as { errors: any[] };
            throw new ClientValidationError(responseData.errors);
        }
        if (res.status === 400 || res.status === 500) {
            responseData = decoded as { error: string; code: string; payload: AppserverData; };
            throw new ClientServerError(responseData.code, responseData.error, responseData.payload);
        }

        throw new ClientError(`Unexpected server response: ${res.status}`);
    }
}