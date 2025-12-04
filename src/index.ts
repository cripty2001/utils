import { Whispr } from "@cripty2001/whispr";
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
export type ExactlyOne<T> = {
    [K in keyof T]: Pick<T, K> & Partial<Record<Exclude<keyof T, K>, never>>
}[keyof T];
export type AllRequired<T> = T extends ExactlyOne<infer U>
    ? ExactlyOne<Required<U>>
    : never;

/**
 * Generate a random string from the given alphabeth.
 * @param _alphabeth The alphabeth to draw characters from
 * @param length The length of the string to generate
 * @returns The generated string
 */
export function getRandom(_alphabeth: string, length: number): string {
    const alphabeth = _alphabeth.split("");
    const toReturn: string[] = [];
    while (toReturn.length < length) {
        toReturn.push(alphabeth[Math.floor(Math.random() * alphabeth.length)]);
    }
    return toReturn.join("");
}

/**
 * Generate a random, url safe, id string, with 3 bits of entropy per character.
 * @param length The length of the id to generate
 * @returns The generated id
 */
export function getRandomId(length: number = 20): string {
    const ALPHABET =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    return getRandom(ALPHABET, length);
}

/**
 * Generate a random one time password (OTP). 
 * @param length The length of the OTP to generate
 * @param char Allow for characters to be inserted in the otp
 * @returns The generated otp
 */
export function getRandomOtp(
    length: number = 6,
    char: boolean = false
): string {
    const ALPHABET = "0123456789" + (char ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "");
    return getRandom(ALPHABET, length);
}

/**
 * Pause the execution for the given number of milliseconds.    
 * @param ms The number of milliseconds to sleep
 */
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

/**
 * Start an infinite loop executing an async callback spaced by at least the given interval.
 * The loop ignores errors (the next execution is not affected), but an optional error callback can be provided to handle them.
 * The error callback can return true to stop the loop. An error in the error callback will be logged, but the loop will continue.
 * 
 * @param cb The (async) callback to execute
 * @param interval The minimum interval between two executions, in milliseconds. The execution may be scheduled later, but not earlier.
 * @param onError The error callback. Return true to stop the loop.
 */
export async function loop(cb: () => Promise<void>, interval: number, onError: (e: any) => Promise<boolean> = async (e) => { console.error(e); return false; }): Promise<void> {
    while (true) {
        try {
            await cb();
        } catch (e) {
            const stop = await onError(e)
                .catch((e) => {
                    console.error("Error in loop error handler:", e);
                    return false;
                });

            if (stop)
                break;
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
/**
 * Copy the given text to clipboard.
 * @param text The text to copy to clipboard
 */
export function copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text)
}

/**
 * Download data as a file.
 * @param data The data to download
 * @param filename The filename to use
 * @param mimeType The mime type of the data
 */
export function download(data: string | Blob, filename: string, mimeType: string = 'application/octet-stream'): void {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

/**
 * Generate a random int between min and max, inclusive.
 * @param min The minimum allowed number
 * @param max The maximum allowed number
 * @returns The generated random int
 */
export function randBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get an environment variable, throwing if it is not defined and no default value is provided.
 * @param key The environment variable key
 * @param defaultValue The default value to use if the environment variable is not defined
 * @returns The environment variable value, or the default value if provided
 */
export function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key] ?? defaultValue;

    if (value === undefined)
        throw new Error(`Environment variable ${key} is not defined and no default value was provided.`);

    return value;
}

const [currentTsMs, setCurrentTsMs] = Whispr.create<number>(Date.now());
const currentTsMsInterval: NodeJS.Timeout | null = null;
export const CURRENT_TS_MS = () => {
    if (currentTsMsInterval === null) {
        setInterval(() => {
            setCurrentTsMs(Date.now());
        }, 200);
    }
    return currentTsMs;
};


export function timediff2HumanReadable(diffMs: number): string {
    const { unit, diff } = (() => {
        let toReturn = diffMs

        const OPTIONS = [
            { divisor: 1000, unit: 'milliseconds' },
            { divisor: 60, unit: 'seconds' },
            { divisor: 60, unit: 'minutes' },
            { divisor: 24, unit: 'hours' },
            { divisor: 30, unit: 'days' },
            { divisor: 12, unit: 'months' },
            { divisor: 1, unit: 'years' },
        ]

        while (OPTIONS.length) {
            const { divisor, unit } = OPTIONS.shift()!;

            if (Math.abs(toReturn) < divisor)
                return {
                    unit,
                    diff: toReturn
                };

            toReturn = toReturn / divisor;
        }

        return { unit: 'years', diff: toReturn };
    })();

    const rtf = new Intl.RelativeTimeFormat();

    return rtf.format(Math.round(diff), unit as Intl.RelativeTimeFormatUnit);
}

export function fn2promise<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = fn();
    return result instanceof Promise ?
        result :
        Promise.resolve(result);
}