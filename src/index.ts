import { isEqualWith } from "lodash";

export type JSONEncodable = number | string | boolean | JSONEncodable[] | null | { [key: string]: JSONEncodable };

export type TypeofArray<T extends any[]> = T extends (infer U)[] ? U : never;
export type TypeofRecord<T extends Record<string, any>> = T extends Record<
    string,
    infer U
>
    ? U
    : never;

export type AtLeastOne<T> = {
    [K in keyof T]: Pick<T, K> & Partial<Omit<T, K>>
}[keyof T];

export function getRandom(_alphabeth: string, length: number): string {
    const alphabeth = _alphabeth.split("");
    const toReturn: string[] = [];
    while (toReturn.length < length) {
        toReturn.push(alphabeth[Math.floor(Math.random() * alphabeth.length)]);
    }
    return toReturn.join("");
}

export function getRandomId(length: number = 20): string {
    const ALPHABET =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    return getRandom(ALPHABET, length);
}

export function getRandomOtp(
    length: number = 6,
    char: boolean = false
): string {
    const ALPHABET = "0123456789" + (char ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "");
    return getRandom(ALPHABET, length);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseHash(fields: string[]): URLSearchParams {
    // Checking empty hash
    if (window.location.hash === "") return new URLSearchParams();

    // Parsing hash
    const data = new URLSearchParams(window.location.hash.replace(/^#/, "?"));

    // Extracting fields
    const toReturn: URLSearchParams = new URLSearchParams();
    for (const field of fields) {
        if (data.has(field)) {
            toReturn.set(field, data.get(field) as string);
            data.delete(field);
        }
    }

    // Reencoding hash without extracted fields
    window.location.hash = `#${data.toString()}`;

    // Returning extracted fields
    return toReturn;
}

export async function loop(cb: () => Promise<void>, interval: number, onError: (e: any) => Promise<void> = async (e) => { console.error(e) }): Promise<void> {
    while (true) {
        try {
            await cb();
        } catch (e) {
            await onError(e);
        }
        finally {
            await sleep(interval);
        }
    }
}


/**
 * Float aware deep equality check between two values.
 */
export function isEqual(a: any, b: any): boolean {
    const TOLERANCE = 1e-9;

    const toReturn = isEqualWith(a, b, (a, b) => {
        if (typeof a === 'number' && typeof b === 'number')
            return Math.abs(a - b) < TOLERANCE;

        return undefined;
    });
    return toReturn;
}
export function arrayStep(from: number, to: number, step: number): number[] {
    const result: number[] = [];
    for (let i = from; i <= to; i += step) {
        result.push(i);
    }
    return result;
}
export function copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text)
}

export function stableLog(obj: any, message: string = ''): void {
    console.log(message, JSON.parse(JSON.stringify(obj)));
}

export function parseQuery(query: string | Record<string, any> | URLSearchParams, fields: string[]): { extracted: URLSearchParams, left: URLSearchParams } {
    const data = (() => {
        if (typeof query === 'string') {
            return new URLSearchParams(query);
        }
        else if (query instanceof URLSearchParams) {
            return query;
        }
        else {
            const toReturn = new URLSearchParams();
            for (const k in query) {
                toReturn.set(k, query[k]);
            }
            return toReturn;
        }
    })();

    // Extracting fields
    const toReturn: URLSearchParams = new URLSearchParams();
    for (const field of fields) {
        if (data.has(field)) {
            toReturn.set(field, data.get(field) as string);
            data.delete(field);
        }
    }

    // Returning extracted fields
    return {
        extracted: toReturn,
        left: data
    };
}