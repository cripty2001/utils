import { decode, encode } from "@msgpack/msgpack";
import { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type express from 'express';
import { AppserverData } from './common';
export type { AppserverData };

// Helpful for avoiding sinclair version mismatch between this and the actual user of the package
export { Static, TSchema, Type } from '@sinclair/typebox';
export { Value } from '@sinclair/typebox/value';

encode({}); // Fixes issue with msgpack not being included in build

export type AppserverHandler<
    I extends AppserverData,
    O extends AppserverData,
> = (input: I, auth: string | undefined) => Promise<O> | O;

class AppserverError extends Error {
    constructor(public code: string, message: string, public payload: AppserverData = {}, public status = 500) {
        super(message);
    }
}

export class AppserverAuthError extends AppserverError {
    constructor(message: string = "You have no right to access this page", code: string = "PERMISSION_DENIED") {
        super(code, message, {}, 403);
    }
}

export class AppserverHandledError extends AppserverError {
    constructor(code: string, message: string, payload: AppserverData = {}) {
        super(code, message, payload);
    }
}

export type AppserverModule<
    ISchema extends TSchema = TSchema,
    O extends AppserverData = AppserverData,
    I extends Static<ISchema> & AppserverData = Static<ISchema> & AppserverData,
> = {
    schema: ISchema;
    handler: AppserverHandler<I, O>;
};

export function createDispatch(): {
    register: <ISchema extends TSchema>(action: string, mod: AppserverModule<ISchema>) => void;
    dispatch: (req: Express.Request, res: Express.Response) => Promise<void>;
} {
    const registry = new Map<string, AppserverModule>();

    function register<ISchema extends TSchema>(action: string, mod: AppserverModule<ISchema>): void {
        if (registry.has(action))
            throw new Error(`Action already registered: "${action}"`);
        registry.set(action, mod as AppserverModule);
    }

    const dispatch = async (req: express.Request, res: express.Response) => {
        const respond = (status: number, data: AppserverData) => {
            res
                .status(status)
                .send(encode(data));
        };

        try {
            if (req.headers['content-type'] !== 'application/vnd.msgpack')
                throw new AppserverError('REQUEST_INVALID_TYPE_HEADER', 'Content-Type must be a messagepack (application/vnd.msgpack)', 400);

            const parsed = (() => {
                try {
                    return decode(req.body);
                } catch (e) {
                    throw new AppserverError('REQUEST_INVALID_BODY', 'Request body is not valid msgpack', 400);
                }
            })() as AppserverData;

            const { action, payload } = parsed as Record<string, AppserverData>;

            if (typeof action !== 'string')
                return respond(400, { error: 'Missing action field', code: 'REQUEST_INVALID_ACTION' });

            const mod = registry.get(action);
            if (mod === undefined)
                return respond(404, { error: `Action not found: ${action}`, code: 'ACTION_NOT_FOUND' });

            const token = req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : undefined;

            if (!Value.Check(mod.schema, payload))
                return respond(422, { errors: [...Value.Errors(mod.schema, payload)], received: payload });

            return respond(200, await mod.handler(payload, token));

        } catch (e) {
            if (e instanceof AppserverError)
                return respond(e.status, { error: e.message, code: e.code, payload: e.payload });

            console.error("Unhandled server error:", e);
            return respond(500, { error: 'Internal server error', code: 'INTERNAL_SERVERERROR' });
        }
    };

    return { register, dispatch };
}