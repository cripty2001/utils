import { AppserverData } from "./common";
import { decode, encode } from "@msgpack/msgpack";

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
    constructor(private url: string) { }

    public async exec<I extends AppserverData, O extends AppserverData>(
        action: string,
        input: I
    ): Promise<O> {
        const res = await fetch(`${this.url}/exec/${action}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/vnd.msgpack",
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