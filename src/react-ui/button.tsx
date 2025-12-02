import { Loader2 } from "lucide-react";
import { useState } from "react";

export type ButtonProps = {
    title: string,
    onClick: () => void | Promise<void>
    className?: string
}

export default function Button({ title, onClick, className }: ButtonProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const handleClick = async () => {
        if (loading) return;
        setLoading(true);
        (async () => {
            const p = onClick()
            if (p instanceof Promise) {
                await p
            }
        })()
            .catch(e => setError(e instanceof Error ? e.message : "Unknown error"))
            .finally(() => setLoading(false))
    }
    return (
        <>
            <div
                onClick={handleClick}
                className={`cursor-pointer ${className}`}
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <div>{title}</div>}
            </div>
            {error && <div className="text-red-500">{error}</div>}
        </>
    )
}