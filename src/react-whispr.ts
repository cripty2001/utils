import { Whispr } from "@cripty2001/whispr";
import { useCallback, useEffect, useRef, useState } from "react";

import { isEqual } from "lodash";
import { CURRENT_TS_MS } from ".";
import { Dispatcher } from "./Dispatcher";
import { SearcherData, useSearcher_w } from "./Searcher";

/**
 * Convert a Whispr value into a reactive react value, usable in function components with the standard react reactive system.
 * If the value is not a Whispr, it is returned as is, thus allowing for progressive migration and adoption
 * @param w A reactive react value or a Whispr containing it
 * @param computer An optional function to compute the returned value. This is useful to extract a part of a larger whispr, or to compute a derived value. It is the analog of useMemo with a single dependency (the whispr itself)
 * @returns A reactive react value
 * 
 * @remarks The value is NOT REACTIVE, and the same applies to the computer, if any. Only changes to its content will trigger a change, not changes to the object itself.
 * 
 * @example
 * export default function MyComponent(props: { value:  Whispr<string> }) {
 *   const value = useWhisprValue(props.value);
 * 
 *   return <div>{value}</div>;
 * }
 */
export function useWhisprValue<I, O = I>(
    w: Whispr<I>,
    computer: (data: I) => O = (d) => d as unknown as O
): O {
    const value_w = useRef(
        Whispr.from(
            { w },
            ({ w }) => computer(w)
        )
    ).current;

    const [value, setValue] = useState(value_w.value);

    value_w.subscribe((newValue) => {
        if (isEqual(newValue, value))
            return;

        setValue(newValue);
    }, false);  // Already got the initial value, and this will call syncronously generate a react warning as called on an not yet mounted component

    return value;
}

/**
 * Wrap a (react) value into a Whispr, if it is not one already.
 * @param data A Whispr or a normal (react reactable) value
 * @returns The whispr'd value, or the original whispr if it was one (allow for incremental adoption)
 * 
 * @remarks The returned whispr has already been ref-fed, so it can be directly used without worrying about react recreating it or similar bad things
 */
export function useWhispr<T>(data: T | Whispr<T>): Whispr<T> {
    const [w, setW] = useRef(Whispr.create(
        data instanceof Whispr ?
            data.value :
            data
    )).current;

    useEffect(() => {
        setW(data instanceof Whispr ? data.value : data);
    }, [data, setW]);

    // Hooks can't be called conditionally, so we need to do this check at the end
    if (data instanceof Whispr)
        return data;

    return w;
}

/**
 * Subscribe a callback to a Whispr inside a react component, properly handling unsubscription on unmount.
 * @param w The whispr to subscribe to
 * @param cb The callback to call on value change
 */
export function useOnWhispr<T>(w: Whispr<T>, cb: (value: T) => void): void {
    useEffect(() => {
        const unsub = w.subscribe(cb);
        return () => unsub();
    }, [w, cb]);
}

/**
 * Return a reactive current timestamp (ms), updated at the given interval.
 * @returns The current timestamp
 */
export function useCurrentTimestamp(refresh: number = 1000): number {
    return useWhisprValue(CURRENT_TS_MS);
}

/**
 * Debounce a reactive value, deep checking for equality, and stopping updates until the value changes.
 * @param value The value to debounce
 * @returns The debounced value
 */
export function useDebounced<T>(value: T): T {
    const lastEmitted = useRef(value);
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        if (isEqual(lastEmitted.current, value))
            return;

        lastEmitted.current = value;
        setDebounced(value);
    }, [value]);

    return debounced;
}

/**
 * Allow for having a locally defined state, that can be kept synced with an external one, if available.
 * @param def The default value
 * @param value The value to sync
 * @param setValue The function to set the value
 * @returns The synced value and the function to set it
 */
export function useSynced<T extends any>(def: T, value: T | undefined, setValue: ((value: T) => void) | undefined): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [v, setV] = useState(def);

    if (
        (value !== undefined && setValue === undefined) ||
        (value === undefined && setValue !== undefined)
    )
        throw new Error('Either value and setValue must be provided, or both must be undefined');

    const setValueRef = useRef(setValue);
    useEffect(() => {
        setValueRef.current = setValue;
    }, [setValue]);

    // Only sync downstream (external -> local)
    useEffect(() => {
        if (value === undefined) return;
        if (isEqual(v, value)) return;

        console.log('SYNC DOWNSTREAM', value);
        setV(value);
    }, [value]);

    // Return a setter that updates both
    const syncedSetter = useCallback((newValue: React.SetStateAction<T>) => {
        setV(prev => {
            const resolved = typeof newValue === 'function'
                ? (newValue as (prev: T) => T)(prev)
                : newValue;

            // Update external immediately if available
            if (setValueRef.current) {
                setValueRef.current(resolved);
            }

            return resolved;
        });
    }, []);

    return [v, syncedSetter];
}

/**
 * 
 * Wraps an async function into a reactable data.
 * 
 * @param f The async function to call. It should return a promise that resolves to the data. It is not reactive
 * @param data The data to give to f. It must be stable, as anything in the dependency array of the useEffect and similars in the react ecosystem.
 * @param debouce Debounce time in ms. Default to 200ms. The async function will not be called if this time has not passed since the useAsync first invocation or value change. If another change happens during the wait, the first function call is never executed
 * @returns  The dispatcher
 * 
 * @type I Input for the async function.
 * @type O Output for the async function
 */
export function useAsync<I, O>(
    f: (input: I, setProgress: (p: number) => void, signal: AbortSignal) => Promise<O>,
    data: I,
    debouce: number = 200
): Dispatcher<I, O> {
    // Initing reactive input
    const [input, setInput] = useRef(Whispr.create(data)).current;
    useEffect(() => {
        setInput(data); // Debouncing already handled by dispatcher
    }, [data, setInput]);

    // Initing dispatcher
    const dispatcher: Dispatcher<I, O> = useRef(
        new Dispatcher<I, O>(input, f, debouce)
    ).current;

    // Returning dispatcher
    return dispatcher
}

/**
 * Format a timestamp into a relative time string (e.g. "5 minutes ago", "in 2 hours"), using the browser locale.
 * The refreshed time is reactive.
 * @param refresh The refresh interval, in milliseconds. Default to 1000ms.
 * @returns A callback (reactive, will change on refresh) that formats a given timestamp into a relative time string.
 */
export function useRelTime(refresh: number = 1000): (ts: Date | number) => string {
    const currTs = useCurrentTimestamp(refresh);
    const rtf = useRef(new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto" })).current;

    const getFormat = (_diff: number) => {
        const diff = Math.abs(_diff);
        const breakpoints = [
            {
                base: 1,
                limit: 60,
                unit: "second"
            },
            {
                base: 60,
                limit: 60,
                unit: "minute"
            },
            {
                base: 60 * 60,
                limit: 24,
                unit: "hour"
            },
            {
                base: 60 * 60 * 24,
                limit: 45,
                unit: "day"
            },
        ] as const;

        for (const { base, limit, unit } of breakpoints) {
            if (diff < limit * base) return {
                base,
                unit
            };
        }

        return {
            base: 60 * 60 * 24 * 7,
            unit: "week"
        };
    }

    const cb = useCallback((ts: Date | number): string => {
        const now = currTs;
        const then = ts instanceof Date ? ts.getTime() : ts;
        const delta = then - now;
        const seconds = Math.round(delta / 1000);

        const { base, unit } = getFormat(seconds);

        const rounded = seconds > 0 ?
            Math.floor(seconds / base) :
            Math.ceil(seconds / base);

        return rtf.format(
            rounded,
            unit as Intl.RelativeTimeFormatUnit
        );
    }, [currTs, rtf]);

    return cb;
}

/**
 * React shorthand for the Searcher
 * @param data The data to search on 
 * @param q The query to search for 
 * @return The filtered data
 * 
 */
export function useSearcher<T>(data: SearcherData<T>[], q: string): SearcherData<T>[] {
    const q_w = useWhispr(q)
    const data_w = useWhispr(data)
    const searcher = useSearcher_w(data_w, q_w)
    return useWhisprValue(searcher)
}