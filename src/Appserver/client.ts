import { Whispr } from "@cripty2001/whispr";
import { decode, encode } from "@msgpack/msgpack";
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
    public loggedIn: Whispr<boolean>;

    private constructor(private url: string) {
        [this.authToken, this.setAuthToken] = Whispr.create<string | null>(null);
        this.loggedIn = Whispr.from(
            { authToken: this.authToken },
            ({ authToken }) => authToken !== null
        );
    }
    public static create(url: string): Client {
        return new Client(url);
    }

    public setAuthToken(token: string | null) {
        this.setAuthToken(token ?? null);
    }

    public async exec<I extends AppserverData, O extends AppserverData>(
        action: string,
        input: I
    ): Promise<O> {
        const res = await fetch(`${this.url}/exec/${action}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/vnd.msgpack",
                ...(this.authToken !== null ? { "Authorization": `Bearer ${this.authToken}` } : {}),
            },
            body: new Blob(
                [new Uint8Array(
                    encode(input)
                )],
                { type: 'application/msgpack' }
            ),
        });

        const decoded = decode(await res.arrayBuffer());
        let responseData;

        switch (res.status) {
            case 401:
            case 403:
                this.setAuthToken(null);
                throw new ClientError("Permission denied");
            case 200:
                responseData = decoded as O;
                return responseData;
            case 422:
                responseData = decoded as { errors: any[] };
                throw new ClientValidationError(responseData.errors);
            case 400:
            case 500:
                responseData = decoded as { error: string; code: string; payload: AppserverData; };
                throw new ClientServerError(responseData.code, responseData.error, responseData.payload);
            default:
                throw new ClientError(`Unexpected server response: ${res.status}`);
        }
    }
}