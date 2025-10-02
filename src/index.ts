export type JSONEncodable = number | string | boolean | JSONEncodable[] | { [key: string]: JSONEncodable };

export type TypeofArray<T extends any[]> = T extends (infer U)[] ? U : never;
export type TypeofRecord<T extends Record<string, any>> = T extends Record<
    string,
    infer U
>
    ? U
    : never;

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

