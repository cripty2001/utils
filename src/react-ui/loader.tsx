import type React from "react";
import type { AppserverData } from "../Appserver/client";
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

export type LoaderProps<T extends AppserverData> = {
    data: Dispatcher<unknown, T>
    children: (data: T) => React.ReactNode
}

export default function Loader<T extends AppserverData>(props: LoaderProps<T>) {
    const data = useWhisprValue(props.data.data);
    return (
        <div>
            <Content data={data} >{(data) =>
                props.children(data)
            }</Content>
        </div>
    )
}

function Content<T extends AppserverData>({ data, children }: { data: DispatcherStatePayload<T>, children: (data: T) => React.ReactNode }) {
    if (data.loading)
        return (
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

    return children(data.data)
}