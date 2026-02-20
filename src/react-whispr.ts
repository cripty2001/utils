import { Whispr } from "@cripty2001/whispr";
import { useCallback, useEffect, useRef, useState } from "react";

import { isEqual } from "lodash";
import { CURRENT_TS_MS, getRandomId, JSONEncodable } from ".";
import { Dispatcher } from "./Dispatcher";
import { Searcher, SearcherData } from "./Searcher";

/**
 * Convert a Whispr value into a reactive react value, usable in function components with the standard react reactive system.
 * If the value is not a Whispr, it is returned as is, thus allowing for progressive migration and adoption
 * @param w A reactive react value or a Whispr containing it
 * @param computer An optional function to compute the returned value. This is useful to extract a part of a larger whispr, or to compute a derived value. It is the analog of useMemo with a single dependency (the whispr itself)
 * @returns A reactive react value
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
    const value_w = useRef<Whispr<O>>(
        Whispr.create(computer(w.value))[0]
    );
    const unsubscribe = useRef<() => void>(() => { });

    const [value, setValue] = useState(value_w.current.value);
    const valueref = useRef(value);  // Yep, react and his strange stale closures...

    useEffect(() => {
        unsubscribe.current();
        value_w.current = Whispr.from(
            { w },
            ({ w }) => computer(w)
        )
        unsubscribe.current = value_w.current.subscribe((newValue) => {
            if (isEqual(newValue, valueref.current))
                return;

            setValue(newValue);
            valueref.current = newValue;
        });
        return () => unsubscribe.current();
    }, [w, computer]);

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
 * @param unsafe If true, the callback will be allowed to throw errors, that will then bubble up
 */
export function useOnWhispr<T>(w: Whispr<T>, cb: (value: T) => void, unsafe: boolean = false): void {
    useEffect(() => {
        const unsub = w.subscribe(cb, undefined, unsafe);
        return () => unsub();
    }, [w, cb]);
}

/**
 * Return a reactive current timestamp (ms)
 * @returns The current timestamp
 */
export function useCurrentTimestamp(): number {
    return useWhisprValue(CURRENT_TS_MS());
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
        throw new Error('Either both value and setValue must be provided, or both must be undefined');

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
 * Wraps an async function into a reactable data structure that tracks loading state, progress, and results.
 * 
 * **Error Handling:** This function does NOT throw errors. Instead, errors are stored in the returned dispatcher's state.
 * Check the dispatcher's `data` property to access the error state. The dispatcher's promise resolves successfully
 * even when errors occur - errors are captured and stored in the reactive state for UI consumption.
 * 
 * @param f The async function to call. It should return a promise that resolves to the data. It is not reactive.
 * @param data The data to give to f. It must be stable, as anything in the dependency array of the useEffect and similars in the react ecosystem. If null, this function will act like an useEffect with an empty dependency array.
 * @param debouce Debounce time in ms. Default to 200ms. The async function will not be called if this time has not passed since the useAsync first invocation or value change. If another change happens during the wait, the first function call is never executed.
 * @returns A Dispatcher object containing:
 *   - `data`: A Whispr<DispatcherStatePayload<O>> that contains the loading state, progress, and either the result data or error
 *   - `filtered`: A Whispr<O | null> that contains the result data when successful, or null when loading or on error
 * 
 * @type I Input for the async function.
 * @type O Output for the async function.
 * 
 * @example
 * const dispatcher = useAsync(async (userId) => {
 *   const response = await fetch(`/api/users/${userId}`);
 *   return response.json();
 * }, userId);
 * 
 * const state = useWhisprValue(dispatcher.data);
 * // state can be: { loading: true, progress: 0 } | { loading: false, ok: true, data: T } | { loading: false, ok: false, error: Error }
 * 
 * if (!state.loading && !state.ok) {
 *   console.error('Error:', state.error);
 * }
 */
export function useAsync<I, O>(
    f: (input: I, setProgress: (p: number) => void, signal: AbortSignal) => Promise<O>,
    data: I,
    debouce: number = 200
): Dispatcher<I, O> {
    // Initing reactive input
    const [input, setInput] = useSafeRef(() => Whispr.create(data ?? getRandomId() as I));

    useEffect(() => {
        if (data !== null) {
            setInput(data); // Debouncing already handled by dispatcher
        }
    }, [data, setInput]);

    // Initing dispatcher
    const dispatcher: Dispatcher<I, O> = useSafeRef(() =>
        new Dispatcher<I, O>(input, f, debouce)
    );

    // Returning dispatcher
    return dispatcher;
}

/**
 * Async version of useEffect with debouncing. Executes an async function as a side effect when data changes.
 * 
 * **Error Handling:** This function THROWS errors. Unlike `useAsync`, errors are not stored in state but are thrown
 * as promise rejections. Use this when you want errors to propagate (e.g., to error boundaries or try/catch blocks).
 * 
 * @param f The async function to execute. It should return a promise. It is not reactive.
 * @param data The data that triggers the effect. It must be stable, as anything in the dependency array of useEffect.
 *   If null, this function will act like useEffect with an empty dependency array.
 * @param debounce Debounce time in ms. Default to 200ms. The async function will not be called if this time has not
 *   passed since the last data change. If another change happens during the wait, the first function call is aborted.
 * 
 * @remarks This function returns void - it is purely for side effects, similar to useEffect.
 * @remarks Errors thrown by the async function will cause the promise to reject. If you need to handle errors
 *   in the UI without throwing, use `useAsync` instead.
 * 
 * @example
 * useAsyncEffect(async (userId, setProgress, signal) => {
 *   const response = await fetch(`/api/users/${userId}`, { signal });
 *   if (!response.ok) throw new Error('Failed to fetch');
 *   const data = await response.json();
 *   // Do something with data
 * }, userId, 300);
 */
export function useAsyncEffect<I>(
    f: (input: I, setProgress: (p: number) => void, signal: AbortSignal) => Promise<void>,
    data: I,
    debounce: number = 200
): void {
    const dispatcher = useAsync(f, data, debounce);
    useOnWhispr(dispatcher.data, (data) => {
        if (!data.loading && !data.ok) {
            throw data.error;
        }
    }, true);
}

/**
 * Format a timestamp into a relative time string (e.g. "5 minutes ago", "in 2 hours"), using the browser locale.
 * 
 * @param data The data to format. Reactive
 * @returns The formatted timestamp
 */
export function useRelTime(_data: number | Date): string {
    const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto" })
    const data = useWhispr(_data);

    const toReturn = useSafeRef(() =>
        Whispr.from({ data, curr: CURRENT_TS_MS() }, ({ data, curr }) => {
            const then = data instanceof Date ? data.getTime() : data;
            const seconds = Math.round(then - curr) / 1000;
            const { base, unit } = getRelTimeFormat(seconds);

            const rounded = seconds > 0 ?
                Math.floor(seconds / base) :
                Math.ceil(seconds / base);

            return rtf.format(
                rounded,
                unit as Intl.RelativeTimeFormatUnit
            );
        })
    );

    return useWhisprValue(toReturn);
}

function getRelTimeFormat(_diff: number): { base: number, unit: string } {
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

/**
 * React shorthand for the Searcher
 * @param data The data to search on 
 * @return An arra containing
 *  - The current query (updated synchronously with the user input)
 *  - The function to set the query (aka the one to put onto the input element)
 *  - The filtered data
 *  - A boolean indicating if the search is pending
 */
export function useSearcher<T extends JSONEncodable>(data: SearcherData<T>[], limit: number): [string, (q: string) => void, SearcherData<T>[], boolean] {
    const searcher = useRef(new Searcher<T>(data))

    const [pending, setPending] = useState(false)
    const [results, setResults] = useState<AsyncInputValue<{ q: string }, { results: SearcherData<T>[] }>>(
        {
            results: [],
            _meta: {
                ts: 0,
                config: { q: "" }
            }
        }
    )

    const [q, setQ] = useAsyncInput<{ q: string }, { results: SearcherData<T>[] }>(results, setResults, async ({ q }) => {
        return {
            results: searcher.current.search(q, limit)
        }
    }, setPending)

    useEffect(() => {
        searcher.current.updateData(data)
        setResults(draft => {
            draft.results = searcher.current.search(q.q, limit)
            return draft
        })
    }, [data, q, limit, setResults])

    return [
        q.q,
        (q: string) => setQ(draft => { draft.q = q }),
        results.results,
        pending
    ]
}
/**
 * A react ref hook with safe lazy initialization, ready for safe side effects.
 * @remarks The initialization function will only be called once, and the result will be stored in the ref.
 * @param value The value to initialize the ref with. If a function is provided, it will be called to initialize the ref.
 * @returns 
 */
export function useSafeRef<T>(value: (() => T)): T {
    const ref = useRef<T | null>(null);

    if (ref.current === null) {
        ref.current = value();
    }

    return ref.current;
}

export type AsyncInputValue<C extends Record<string, JSONEncodable>, R extends Record<string, JSONEncodable>> = R & {
    _meta: {
        ts: number;
        config: C;
    }
}
/**
 * Creates a bidirectional async input handler that manages synchronous config updates
 * and asynchronous result computation with automatic deduplication and conflict resolution.
 * 
 * This hook acts as a "gateway" between controlled input components and expensive async
 * operations (like autocomplete, search, or validation). It maintains two separate concerns:
 * 
 * 1. **External state** (`value`/`setValue` params): Contains only valid, complete data.
 *    Updates when async operations complete. Parent components see no debouncing/loading states.
 * 
 * 2. **Internal state** (returned `value`/`setValue`): Synchronously tracks user input/config.
 *    Updates immediately on user interaction without waiting for async results.
 * 
 * The hook automatically:
 * - Merges updates from both external (param) and internal (returned) setValue calls
 * - Detects and discards stale async results
 * - Handles concurrent updates gracefully with last-write-wins semantics
 * 
 * @template C - Configuration object type (the input/config that triggers async work)
 * @template R - Result object type (the output of the async handler)
 * 
 * @param value - Current external value containing both result data and metadata with config/timestamp. Metadata should be considered opaque, and always carried araoud as they are
 * @param setValue - Callback to update external value when async operations complete
 * @param handler - Async function that computes results from config.
 * @param setPending? - Callback to check if the async operation is in flight or ended. If this is called with false, setValue has already been called with the latest result. To avoid concurrency problems, setValue is always called BEFORE calling this with false. No assumption be made for call with true. Please note that this function may be called rapidly even without real updates. The only assumption that should be made about this is the fact that once it is called with false, the value is guaranteed to be the latest reported one, until a call with true. A call with true may means that the value is outdated, or maybe no. There is simply no guarantee about the result when this value is true.
 * 
 * @returns Array containing:
 *   - `value`: Current config (updates synchronously with user input)
 *   - `setValue`: Function to update config (triggers new async operation)
 *   - `result`: Latest computed result or null if no result yet. Useful for displaying loaders
 * 
 * @example
 * ```tsx
 * // Parent component manages complete, valid autocomplete selections
 * const [selectedUser, setSelectedUser] = useState<AsyncInputValue<{query: string}, {id: string, name: string}>>(...)
 * 
 * function AutocompleteInput({selectedUser, setSelectedUser}) {
 *   const [ value, setValue, result ] = useAsyncInput<{query: string}, {id: string, name: string}>(
 *     selectedUser,
 *     setSelectedUser,
 *     async ({query}) => fetchUsers(query) // Debounced by useAsync
 *   );
 * 
 *   return (
 *     <input 
 *       value={value.query}
 *       onChange={e => setValue({query: e.target.value})} // Immediate update
 *     />
 *     {result === null ? <Spinner /> : <UserList users={result} />}
 *   );
 * }
 * ```
 * 
 * @remarks
 * The returned `result` will lag behind `value` during async processing. Consider showing a loader or some other similar indication
 * Handler is NOT reactive. Conceptually it is a pure function that derives an async status from the value input, so there is no reason for it to be reactive, and this saves a lot heachaches with react reactivity loops.
 */
export function useAsyncInput<C extends Record<string, JSONEncodable>, R extends Record<string, JSONEncodable>>(
    value: AsyncInputValue<C, R>,
    setValue: (value: AsyncInputValue<C, R>) => void,
    handler: (config: C) => Promise<R>,
    setPending: (pending: boolean) => void = () => { },
): [
        value: C,
        setValue: (updater: (draft: C) => C | void) => void,
        result: R | null
    ] {
    const [meta, setMeta] = useState<{
        config: C;
        ts: number;
    }>({
        config: value._meta.config,
        ts: value._meta.ts
    });

    useEffect(() => {
        setPending(true);
    }, [meta, setPending]);

    useEffect(() => {
        if (value._meta.ts > meta.ts) {
            setMeta(value._meta);
        }
    }, [value, meta, setMeta]);

    const result_d = useAsync<{
        config: C;
        ts: number;
    }, AsyncInputValue<C, R>>(
        async ({ config, ts }) => {
            const r = await handler(config);
            return {
                ...r,
                _meta: {
                    ts: ts,
                    config: config,
                },
            };
        }, meta, 0);

    const result = useWhisprValue(result_d.filtered);

    useEffect(() => {
        if (result === null)
            return;

        if (result._meta.ts <= value._meta.ts)
            return setPending(false); // Value is already updated, but we still need to clear the pending state. Also, we can't just update the value, as it will cause loops.

        setValue(result);
        setPending(false);
    }, [result, value, setValue, setPending]);

    const returnedSetValue = useCallback((updater: (draft: C) => C | void) => {
        const cloned = structuredClone(meta.config);
        const new_data = updater(cloned);
        const chosen = new_data ?? cloned;

        setMeta({
            config: chosen,
            ts: Date.now(),
        });
    }, [meta, setMeta]);

    return [
        meta.config,
        returnedSetValue,
        result,
    ];
}