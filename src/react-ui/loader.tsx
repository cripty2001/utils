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

export type LoaderProps<T> = {
    data: Dispatcher<unknown, T>
    children: (props: { data: T }) => React.ReactNode;
    loader?: React.ReactNode
    showRefreshing?: boolean
}

export default function Loader<T>(props: LoaderProps<T>) {
    const prev = useRef<DispatcherStatePayload<T>>({ loading: true, progress: 0 });
    const state = useWhisprValue(props.data.data);

    if (!state.loading) {
        prev.current = state;
    }

    const data = useMemo(() => {
        if (props.showRefreshing)
            return state;

        if (state.loading && prev.current !== null)
            return prev.current;

        return state;
    }, [state.loading, prev.current, props.showRefreshing]);

    return (
        <div>
            <Content data={data} children={props.children} loader={props.loader} />
        </div>
    )
}

function Content<T>({ data, children, loader }: {
    data: DispatcherStatePayload<T>,
    children: (props: { data: T }) => React.ReactNode,
    loader?: React.ReactNode
}) {
    if (data.loading)
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
    if (!data.ok)
        return <div style={{ color: '#ef4444' }}>{data.error.message}</div>

    return children({ data: data.data });
}