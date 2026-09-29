import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { type Static, type TSchema, type TypeBoxTypeProvider, Type } from '@fastify/type-provider-typebox';
import path from 'path';
import { readdir } from 'fs/promises';
import { createRemoteJWKSet, errors, type JWTPayload, jwtVerify, type RemoteJWKSet } from 'jose';

export { Type }

declare module 'fastify' {
    interface FastifyRequest {
        user: { id: string } | null;
    }
}

export class Appserver {
    public readonly fastify = Fastify({ logger: true })
        .withTypeProvider<TypeBoxTypeProvider>();
    private readonly jwks: RemoteJWKSet;
    private readonly issuer: string;
    private readonly audience: string;

    private static async resolveAuth(baseUrl: string): Promise<{ jwks: RemoteJWKSet, issuer: string }> {
        const res = await fetch(`${baseUrl}/.well-known/openid-configuration`);
        if (!res.ok)
            throw new Error(`OIDC discovery failed: ${res.status}`);

        const config = await res.json() as {
            jwks_uri?: string,
            issuer?: string
        };
        if (!config?.jwks_uri)
            throw new Error('OIDC discovery failed: jwks_uri not found');
        if (!config.issuer)
            throw new Error('OIDC discovery failed: issuer not found');

        const jwksUrl = config.jwks_uri;
        const issuer = config.issuer;

        const jwks = createRemoteJWKSet(new URL(jwksUrl))

        return {
            jwks,
            issuer
        };
    }

    private readonly rpcBase: string;
    private constructor(rpcBase: string, jwks: RemoteJWKSet, issuer: string, audience: string) {
        this.rpcBase = rpcBase;
        this.jwks = jwks;
        this.issuer = issuer;
        this.audience = audience;
    }

    public static async create(audience: string, issuerUrl: string, rpcBase: string = '/exec') {
        const { jwks, issuer } = await this.resolveAuth(issuerUrl);
        const appserver = new Appserver(rpcBase, jwks, issuer, audience);

        appserver.fastify.setErrorHandler(
            appserver.handleError
                .bind(appserver)
        );

        appserver.fastify.addContentTypeParser(
            'application/octet-stream',
            { parseAs: 'buffer', bodyLimit: 64 * 1024 * 1024 },
            (_req, body, done) => {
                done(null, body);
            },
        );

        appserver.fastify.decorateRequest('user', null);

        return appserver;
    }

    public async listen(port: number) {
        await this.fastify.listen({
            port,
            host: '0.0.0.0'
        });
    }

    public registerRpc<
        TInput extends TSchema,
        TOutput extends TSchema,
    >(
        route: string,
        schema: {
            input: TInput;
            output: TOutput;
        },
        scope: string,
        handler: (data: Static<TInput>, user: { id: string }) => Promise<Static<TOutput>>,
    ): void {
        const routeSchema: {
            body: TSchema;
            response: { 200: TSchema };
        } = {
            body: schema.input,
            response: {
                200: schema.output,
            },
        };

        this.fastify.post(
            `${this.rpcBase}/${route.replace(/^\/+/, '')}`,
            {
                preHandler: [
                    this.enforceAccess(scope)
                ],
                schema: routeSchema,
            },
            async (request) => {
                const user = request.user as { id: string };
                return handler(request.body as Static<TInput>, user);
            },
        );
    }

    private enforceAccess(scope: string) {
        return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
            const token = request.headers.authorization;
            if (!token || !token.startsWith('Bearer '))
                throw new AppserverAuthHandledError('HEADER_MISSING', 'Missing or invalid authorization header', true);

            type Payload = JWTPayload & { scope?: string };
            const payload = await (async () => {
                try {
                    const { payload } = await jwtVerify<Payload>(token.slice(7), this.jwks, {
                        issuer: this.issuer,
                        audience: this.audience,
                        requiredClaims: ['sub'],
                    });

                    return payload;
                } catch (err) {
                    if (err instanceof errors.JWTExpired)
                        throw new AppserverAuthHandledError('TOKEN_EXPIRED', 'Access token has expired.', true);
                    if (
                        err instanceof errors.JWTInvalid
                        || err instanceof errors.JWTClaimValidationFailed
                        || err instanceof errors.JWSSignatureVerificationFailed
                        || err instanceof errors.JWSInvalid
                        || err instanceof errors.JWKSNoMatchingKey
                        || err instanceof errors.JOSEAlgNotAllowed
                    )
                        throw new AppserverAuthHandledError('TOKEN_INVALID', 'Access token is invalid', true);
                    if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid)
                        throw new Error(
                            'Failed to verify the access token against the identity provider JWKS.',
                            { cause: err },
                        );
                    if (err instanceof Error)
                        throw err;

                    throw new Error('Unexpected failure while verifying the access token.', {
                        cause: err
                    });
                }
            })();

            const scopes = payload.scope?.split(' ') ?? [];
            if (!scopes.includes(`res:${scope}`))
                throw new AppserverAuthHandledError('MISSING_SCOPE', 'Access token scope is not valid.', false);

            if (!payload.sub)
                throw new Error('JOSE assert failed, sub is missing despite being required');

            request.user = {
                id: payload.sub
            };
        };
    }

    private handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
        if (error.validation)
            return reply
                .code(422)
                .send({
                    errors: error.validation,
                });

        if (error instanceof AppserverHandledError)
            return reply
                .status(error.status)
                .send({
                    code: error.code,
                    message: error.message,
                    details: error.details as unknown as Record<string, unknown>,
                });

        request.log.error({
            error: {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack,
            }
        }, 'unhandled error');

        reply
            .status(500)
            .send({
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
            });
    }

    public async autoload(base: string): Promise<void> {
        const absBase = path.resolve(base);
        const files = await readdir(absBase, {
            recursive: true,
            withFileTypes: true
        });

        const jsFiles = files
            .filter(e => e.isFile() && e.name.endsWith('.js'));

        if (jsFiles.length === 0) {
            console.warn(
                `[appserver] autoload found no .js files in "${absBase}".`,
                `If you are using TypeScript, make sure the api directory is included in your tsconfig`,
                `and that you are pointing autoload at the compiled output directory, not the source.`
            );
            return;
        }

        for (const entry of jsFiles) {
            const fullPath = path.join(entry.parentPath, entry.name);

            const action = path
                .relative(absBase, fullPath)
                .replace(/\.js$/, '')
                .split(path.sep)
                .join('/');

            const ACTION_REGEX = /^([a-z0-9]+\/)*[a-z0-9]+$/;
            if (!ACTION_REGEX.test(action))
                throw new Error(`Invalid module path "${action}" — all segments must be lowercase alphanumeric`);

            const mod = await import(fullPath) as { default: (app: Appserver, path: string) => void };
            if (!mod.default)
                throw new Error(`Module "${fullPath}" must have a default export containing a registering function (register(app: Appserver) => void)`);

            mod.default(this, action);
        }
    }
}

class AppserverHandledError<T extends TSchema = Record<string, never>> extends Error {
    public readonly status: number;
    public readonly code: string;
    public readonly details: T;

    constructor(code: string, message: string, status: number, details: T) {
        super(message);

        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export class AppserverAuthHandledError extends AppserverHandledError {
    constructor(code: string, message: string, recoverable: boolean = false) {
        super(code, message, recoverable ? 401 : 403, {});
    }
}

export class AppserverUserHandledError<T extends TSchema = Record<string, never>> extends AppserverHandledError<T> {
    constructor(code: string, message: string, details: T) {
        super(code, message, 400, details ?? {});
    }
}

