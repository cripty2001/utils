import express, { type Express } from 'express';
import { JSONEncodable } from '.';
import { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export type AppserverHandler<
    I extends JSONEncodable,
    U extends JSONEncodable,
    O extends JSONEncodable,
> = (input: I, user: U | null) => Promise<O> | O;

export type AppserverUsergetter<U extends JSONEncodable> = (token: string) => Promise<U | null>;

class AppserverError extends Error {
    constructor(public code: string, message: string, payload: JSONEncodable = {}, public status = 500) {
        super(message);
    }
}

export class AppserverHandledError extends AppserverError {
    constructor(code: string, message: string, payload: JSONEncodable = {}) {
        super(code, message, payload);
    }
}

export class Appserver<U extends JSONEncodable> {
    private app: express.Express;
    private parseUser: AppserverUsergetter<U>;

    constructor(port: number, parseUser: AppserverUsergetter<U>) {
        this.parseUser = parseUser;

        this.app = express();
        this.app.listen(port);
    }

    private async parseInput<T extends JSONEncodable>(req: any): Promise<{ data: T; user: U | null; }> {
        if (req.headers['content-type'] !== 'application/json')
            throw new AppserverError('REQUEST_INVALID_TYPE_HEADER', 'Content-Type must be application/json', 400);

        const data = (() => {
            try {
                return JSON.parse(req.body);
            } catch {
                throw new AppserverError('REQUEST_INVALID_BODY', 'Request body is not valid JSON', 400);
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
        O extends JSONEncodable,
        I extends Static<ISchema> & JSONEncodable = Static<ISchema> & JSONEncodable,
    >(
        action: string,
        inputSchema: ISchema,
        handler: AppserverHandler<I, U, O>): void {
        this.app.post(`/exec/${action}`, async (req, res) => {
            try {
                const { data: unsafeData, user } = await this.parseInput<I>(req);

                if (!Value.Check(inputSchema, unsafeData))
                    return res
                        .status(422)
                        .json({
                            errors: [...Value.Errors(inputSchema, unsafeData)]
                        });
                const data = unsafeData as I;

                const output: O = await handler(data, user);
                return res
                    .json(output);

            } catch (e) {
                if (e instanceof AppserverError)
                    return res
                        .status(e.status)
                        .json({ error: e.message, code: e.code });

                return res
                    .status(500)
                    .json({ error: 'Internal server error', code: 'INTERNAL_SERVERERROR' });
            }
        });
    }
}