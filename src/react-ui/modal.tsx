import { useCallback, useEffect, useRef, type ReactNode } from "react";

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

export type ModalActions = {
    dismiss: () => void;
};

export type ModalContent = ReactNode | ((actions: ModalActions) => ReactNode);

export type ModalComponentProps = {
    children: ModalContent;
    open: boolean;
    setOpen: (open: boolean) => void;
    animate?: boolean;
    panelClassName?: string;
};

let modalCount = 0;

export default function ModalComponent({
    children,
    open,
    setOpen,
    animate = false,
    panelClassName = "",
}: ModalComponentProps) {
    const zIndex = useRef(1000 + modalCount++).current;
    const id = useRef(`modal-${zIndex}`).current;

    const dismiss = useCallback(() => setOpen(false), [setOpen]);

    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") dismiss();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, dismiss]);

    if (!open) return null;

    const content = typeof children === "function" ? children({ dismiss }) : children;

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
                zIndex: zIndex,
            }}
            onClick={dismiss}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={panelClassName}
                style={{ maxWidth: '100%', animation: animate ? 'slide-up 0.3s ease-out' : undefined }}
                onClick={(e) => e.stopPropagation()}
            >
                {content}
            </div>
        </div>
    );
}
