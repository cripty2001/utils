import express, { type Express } from 'express';
import { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { decode, encode } from "@msgpack/msgpack";
import { AppserverData } from './common';

encode({}); // Fixes issue with msgpack not being included in build
export type AppserverHandler<
    I extends AppserverData,
    U extends AppserverData,
    O extends AppserverData,
> = (input: I, user: U | null) => Promise<O> | O;

export type AppserverUsergetter<U extends AppserverData> = (token: string) => Promise<U | null>;

class AppserverError extends Error {
    constructor(public code: string, message: string, public payload: AppserverData = {}, public status = 500) {
        super(message);
    }
}

export class AppserverAuthError extends AppserverError {
    constructor() {
        super("PERMISSION_DENIED", "You have no right to access this page", {}, 403);
    }
}

export class AppserverHandledError extends AppserverError {
    constructor(code: string, message: string, payload: AppserverData = {}) {
        super(code, message, payload);
    }
}

export class Appserver<U extends AppserverData> {
    private app: express.Express;
    private parseUser: AppserverUsergetter<U>;

    constructor(port: number, parseUser: AppserverUsergetter<U>) {
        this.parseUser = parseUser;

        this.app = express();
        this.app.listen(port);
    }

    private async parseInput<T extends AppserverData>(req: any): Promise<{ data: T; user: U | null; }> {
        if (req.headers['content-type'] !== 'application/vnd.msgpack')
            throw new AppserverError('REQUEST_INVALID_TYPE_HEADER', 'Content-Type must be a messagepack (application/vnd.msgpack)', 400);

        const data = (() => {
            try {
                return decode(req.body);
            } catch (e) {
                throw new AppserverError('REQUEST_INVALID_BODY', 'Request body is not valid msgpack', 400);
            }
        })() as T;

        const authHeader = req.headers['authorization'];
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

        return {
            data,
            user: token ? await this.parseUser(token) : null
        };
    }

    public register<
        ISchema extends TSchema,
        O extends AppserverData,
        I extends Static<ISchema> & AppserverData = Static<ISchema> & AppserverData,
    >(
        action: string,
        inputSchema: ISchema,
        auth: boolean,
        handler: AppserverHandler<I, U, O>): void {
        this.app.post(`/exec/${action}`, express.raw({ type: 'application/vnd.msgpack' }), async (req, res) => {
            const { status, data } = await (async () => {
                try {
                    const { data: unsafeData, user } = await this.parseInput<I>(req);

                    if (auth && user === null)
                        return {
                            status: 401,
                            data: { error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' }
                        };

                    if (!Value.Check(inputSchema, unsafeData))
                        return {
                            status: 422,
                            data: {
                                errors: [...Value.Errors(inputSchema, unsafeData)]
                            }
                        }

                    return {
                        status: 200,
                        data: await handler(unsafeData as I, user)
                    }

                } catch (e) {
                    if (e instanceof AppserverError)
                        return {
                            status: e.status,
                            data: { error: e.message, code: e.code, payload: e.payload }
                        };

                    console.log("Unhandled server error:", e);
                    return {
                        status: 500,
                        data: { error: 'Internal server error', code: 'INTERNAL_SERVERERROR' }
                    };
                }
            })();

            res
                .status(status)
                .send(encode(data));
        });
    }
}