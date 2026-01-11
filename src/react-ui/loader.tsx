import type React from "react";
import type { Dispatcher, DispatcherStatePayload } from "../Dispatcher";
import { useWhisprValue } from "../react-whispr";

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
    children: React.ComponentType<{ data: T }>
    loader?: React.ReactNode
}

export default function Loader<T>(props: LoaderProps<T>) {
    const data = useWhisprValue(props.data.data);

    return (
        <div>
            <Content data={data} children={props.children} loader={props.loader} />
        </div>
    )
}

function Content<T>({ data, children, loader }: {
    data: DispatcherStatePayload<T>,
    children: React.ComponentType<{ data: T }>,
    loader?: React.ReactNode
}) {
    const ChildComponent = children;

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

    return <ChildComponent data={data.data} />
}