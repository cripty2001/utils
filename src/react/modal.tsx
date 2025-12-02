import { useRef } from "react";
import { useSynced } from "../react-whispr";

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
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-6"
            style={{ zIndex: zIndex }}
            onClick={() => setOpen(false)}
        >
            <div
                className="w-full animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                {props.children}
            </div>
        </div>
    )
}