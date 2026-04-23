import { decode, encode } from "@msgpack/msgpack";
import { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import express from 'express';
import { readdir } from "fs/promises";
import path from "path";
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

export class AppserverDispatcher {
    private registry = new Map<string, AppserverModule>();

    public register(action: string, mod: AppserverModule): void {
        if (this.registry.has(action))
            throw new Error(`Action already registered: "${action}"`);

        this.registry.set(action, mod);
    }

    public async autoload(base: string): Promise<void> {
        const absBase = path.resolve(base);
        const files = await readdir(absBase, {
            recursive: true,
            withFileTypes: true
        });

        for (const entry of files) {
            if (!entry.isFile() || !entry.name.endsWith('.js'))
                continue;

            const fullPath = path.join(entry.parentPath, entry.name);

            const action = path
                .relative(absBase, fullPath)
                .replace(/\.js$/, '')
                .split(path.sep)
                .join('/');

            const ACTION_REGEX = /^([a-z0-9]+\/)*[a-z0-9]+$/;
            if (!ACTION_REGEX.test(action))
                throw new Error(`Invalid module path "${action}" — all segments must be lowercase alphanumeric`);

            const mod = await import(fullPath);
            if (!mod.default || typeof mod.default.handler !== 'function' || !mod.default.schema)
                throw new Error(`Module "${fullPath}" must have a default export satisfying ApiModule`);

            this.register(action, mod.default);
        }
    }

    public bind(app: express.Express, path: string): void {
        app.post(path, express.raw({
            type: 'application/vnd.msgpack',
            limit: '2gb'
        }), async (req, res) => {
            await this.dispatch(req, res);
        });
    }

    private async dispatch(req: express.Request, res: express.Response): Promise<void> {
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
                throw new AppserverError("REQUEST_INVALID_ACTION", "Missing action field", 400);

            const mod = this.registry.get(action);
            if (mod === undefined)
                throw new AppserverError("ACTION_NOT_FOUND", `Action not found: ${action}`, 404);

            const token = req.headers['authorization']?.startsWith('Bearer ') ?
                req.headers['authorization'].slice(7) :
                undefined;

            if (!Value.Check(mod.schema, payload))
                return respond(422, {
                    errors: JSON.stringify(Value.Errors(mod.schema, payload)),
                    received: payload as AppserverData,
                });

            return respond(200, await mod.handler(payload, token));
        }
        catch (e) {
            if (e instanceof AppserverError)
                return respond(e.status, {
                    error: e.message,
                    code: e.code,
                    payload: e.payload
                });

            console.error("Unhandled server error:", e);
            return respond(500, {
                error: 'Internal server error',
                code: 'INTERNAL_SERVERERROR'
            });
        }
    }
}