import { Whispr, WhisprSetter } from "@cripty2001/whispr";
import { isEqual } from "lodash";
import { sleep } from ".";

export type DispatcherStatePayload<T> =
    {
        loading: true,
        progress: number,
    } | (
        { loading: false } & (
            {
                ok: true;
                data: T
            } | {
                ok: false;
                error: Error
            }
        )
    )

type DispatcherState<T> = {
    controller: AbortController;
    payload: DispatcherStatePayload<T>;
}

type DispatcherFunction<I, O> = (data: I, setProgress: (p: number) => void, signal: AbortSignal) => Promise<O>
export class Dispatcher<I, O> {
    private state: Whispr<DispatcherState<O>>;
    private setState: WhisprSetter<DispatcherState<O>>;

    public data: Whispr<DispatcherStatePayload<O>>;
    public filtered: Whispr<O | null>;

    public readonly DEBOUNCE_INTERVAL;
    private readonly f: DispatcherFunction<I, O>;

    private value: Whispr<I>; // Value is a whispr that we are subscribed to. We must keep a reference to it to avoid the subscription being automatically canceled
    private lastValue: I | null = null; // Last value, to avoid useless dispatches

    /**
     * Create a new dispatcher 
     * @param value The whispr value that will trigger f call when changed. Using this pattern instead of exposing a dispatch method allow to return the full dispatcher to anyone, without having to worry about them messing it
     * @param f The async function to call. It should return a promise that resolves to the data.
     * @param DEBOUNCE_INTERVAL The debounce interval in milliseconds. Default to 200ms. The function will not be called if this time has not passed since the last call. If another change happens during the wait, the first function call will be aborted.
     * 
     * @remarks If the debounce interval is 0, the function will be called synchronously, as a Whispr listener would do.
     * @remarks The value is deep checked for equality. The function will be called only if the value changed deeply
     * @remarks Data updating flag is set in a synchronous way. This means that in the event your DEBOUNCE_INTERVAL is near infinity, you still get the data set to updating true immediately when you update the value. It just wait like this forever
     */
    constructor(value: Whispr<I>, f: DispatcherFunction<I, O>, DEBOUNCE_INTERVAL: number = 200) {
        // Initing state
        this.f = f;
        this.DEBOUNCE_INTERVAL = DEBOUNCE_INTERVAL;
        this.value = value;

        [this.state, this.setState] = Whispr.create<DispatcherState<O>>({
            controller: new AbortController(),
            payload: {
                loading: true,
                progress: 0,
            }
        });

        // Subscribing to input changes
        this.value.subscribe((v) => {
            if (this.lastValue !== null && isEqual(this.lastValue, v))
                return;

            this.lastValue = v;
            this.dispatch(v);
        });

        // Initing public derived whisprs
        this.data = Whispr
            .from({ state: this.state }, ({ state }) => state.payload);

        this.filtered = Whispr.from(
            {
                data: this.data
            },
            ({ data }) => {
                if (data.loading)
                    return null;
                if (!data.ok)
                    return null;
                return data.data;
            }
        )
    }

    private reset() {
        // Aborting previous request
        this.state.value.controller.abort();

        // Initing new abort controller
        const controller = new AbortController();

        // Resetting response state
        this.setState({
            controller,
            payload: {
                loading: true,
                progress: 0,
            }
        });

        // Creating generic state update function
        const updateState = (value: DispatcherStatePayload<O>) => {
            if (controller.signal.aborted)  // Working on local controller, not global one. Old controller will change and be aborted on reset, global one will always be running
                return;

            this.setState({
                controller: this.state.value.controller, // Keeping the effective controller, not the internal old one (even if, in practice, they should be the same, if everything worked well),
                payload: value,
            });
        }

        // Returning state update function
        return {
            commit: (data: O) => {
                updateState({
                    loading: false,
                    ok: true,
                    data,
                });
            },
            raise: (error: Error) => {
                updateState({
                    loading: false,
                    ok: false,
                    error,
                });
            },
            progress: (p: number) => {
                updateState({
                    loading: true,
                    progress: p,
                });
            },
            controller
        };
    };

    private dispatch(data: I): Promise<void> {
        const signals = this.reset();

        const toReturn = (async () => {
            // Allow for sync operations
            if (this.DEBOUNCE_INTERVAL > 0) {
                await sleep(this.DEBOUNCE_INTERVAL);
            }
            if (signals.controller.signal.aborted)
                throw new DOMException('Debounced', 'AbortError');

            // Scheduling function execution
            return await this.f(data, signals.progress, signals.controller.signal)
        })()
            .then((res) => {
                signals.commit(res);
            })
            .catch((e) => {
                signals.raise(e instanceof Error ? e : new Error(JSON.stringify(e)));
            });

        return toReturn;
    }
}