import { CheckCircle2, CopyIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { copyToClipboard } from "../";

export type CopiableProps = {
    value: string;
    className?: string;
}

export default function Copiable({ value, className }: CopiableProps) {
    const [copying, setCopying] = useState(false);

    const copy = useCallback(() => {
        copyToClipboard(value);
        setCopying(true);
        setTimeout(() => {
            setCopying(false);
        }, 1000);
    }, [value, setCopying]);

    return (
        <div onClick={copy} className={`flex flex-row items-center justify-between gap-2 cursor-pointer ${className}`}>
            <span>
                {value}
            </span>
            {copying ?
                <CheckCircle2 className="w-4 h-4" /> :
                <CopyIcon className="w-4 h-4" />}
        </div>
    );
}