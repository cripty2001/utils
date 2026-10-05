import type React from "react";
import type { Dispatcher, DispatcherStatePayload } from "../Dispatcher";
import { useWhisprValue } from "../react-whispr";
import { useEffect, useMemo, useRef } from "react";

const spinKeyframes = `
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
`;

if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = spinKeyframes;
    if (!document.head.querySelector('style[data-spin-keyframes]')) {
        style.setAttribute('data-spin-keyframes', 'true');
        document.head.appendChild(style);
    }
}

export type LoaderProps<I, O> = {
    data: Dispatcher<I, O>
    children: (props: { data: O }) => React.ReactNode;
    loader?: React.ReactNode
    computeRefreshKey?: (input: I) => string
}

export default function Loader<I, O>(props: LoaderProps<I, O>) {
    const ck = props.computeRefreshKey ?? ((input: I) => JSON.stringify(input));

    const active = useRef<DispatcherStatePayload<I, O>>({
        input: undefined as unknown as I,
        response: { loading: true, progress: 0 }
    });
    const incoming = useWhisprValue(props.data.data);

    if (
        ck(active.current.input) !== ck(incoming.input) ||
        !incoming.response.loading
    ) {
        active.current = incoming;
    }

    return (
        <div>
            <Content data={active.current} children={props.children} loader={props.loader} />
        </div>
    )
}

function Content<T>({ data, children, loader }: {
    data: DispatcherStatePayload<unknown, T>,
    children: (props: { data: T }) => React.ReactNode,
    loader?: React.ReactNode
}) {
    const response = data.response;

    if (response.loading)
        return loader ?? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <div style={{
                    animation: 'spin 1s linear infinite',
                    borderRadius: '9999px',
                    height: '3rem',
                    width: '3rem',
                    borderTop: '2px solid #111827',
                    borderBottom: '2px solid #111827'
                }}></div>
            </div>
        )
    if (!response.ok)
        return <div style={{ color: '#ef4444' }}>{response.error.message}</div>

    return children({ data: response.data });
}