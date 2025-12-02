import { useRef } from "react";
import { useSynced } from "../react-whispr";

const slideUpKeyframes = `
@keyframes slide-up {
    from { 
        transform: translateY(20px);
        opacity: 0;
    }
    to { 
        transform: translateY(0);
        opacity: 1;
    }
}
`;

if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = slideUpKeyframes;
    if (!document.head.querySelector('style[data-slide-up-keyframes]')) {
        style.setAttribute('data-slide-up-keyframes', 'true');
        document.head.appendChild(style);
    }
}

export type ModalComponentProps = {
    children: React.ReactNode,
    open: boolean | undefined,
    setOpen: (open: boolean) => void | undefined
}

let modalCount = 0

export default function ModalComponent(props: ModalComponentProps) {
    const zIndex = useRef(1000 + modalCount++).current;
    const id = useRef(`modal-${zIndex}`).current;

    const [open, setOpen] = useSynced(true, props.open, props.setOpen)

    if (!open) return null;

    return (
        <div
            id={id}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem',
                height: '100vh',
                width: '100vw',
                zIndex: zIndex
            }}
            onClick={() => setOpen(false)}
        >
            <div
                style={{ maxWidth: '100%', animation: 'slide-up 0.3s ease-out' }}
                onClick={(e) => e.stopPropagation()}
            >
                {props.children}
            </div>
        </div>
    )
}