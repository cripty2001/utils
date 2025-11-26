import express, { type Express } from 'express';
import { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { decode, encode } from "@msgpack/msgpack";
import { AppserverData } from './common';

// Helpful for avoiding sinclair version mismatch between this and the actual user of the package
export { Type, Static, TSchema } from '@sinclair/typebox';
export { Value } from '@sinclair/typebox/value';

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
    private getMetrics: () => Record<string, number>;
    private registered: Set<string> = new Set();

    constructor(port: number, parseUser: AppserverUsergetter<U>, getMetrics: () => Record<string, number>) {
        this.parseUser = parseUser;
        this.getMetrics = getMetrics;

        this.app = express();
        this.app.listen(port);

        this.app.get('/metrics', async (req, res) => {
            await this.handleMetricsRequest(req, res);
        });
    }

    private async handleMetricsRequest(req: express.Request, res: express.Response): Promise<void> {
        try {
            const metrics = this.getMetrics();
            const toReturn = Object.entries(metrics)
                .map(([name, value]) => {
                    if (typeof value !== 'number' || !isFinite(value))
                        throw new Error(`Metric value for "${name}" is not a number`);

                    const prometheusName = 'app_' + name
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, '_')
                        .replace(/_+/g, '_')
                        .replace(/^_+|_+$/g, '');

                    return `# TYPE ${prometheusName} gauge\n${prometheusName} ${value}\n`;
                })
                .join('');

            res
                .status(200)
                .type('text/plain')
                .send(toReturn);
        } catch (e) {
            console.log("Error generating metrics:", e);
            res
                .status(500)
                .type('text/plain')
                .send('# Error generating metrics\n');
        }
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

        if (this.registered.has(action))
            throw new Error(`Action ${action} is already registered`);
        this.registered.add(action)

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
                                errors: [...Value.Errors(inputSchema, unsafeData)],
                                received: unsafeData
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