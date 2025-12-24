import { Loader2, LucideIcon } from "lucide-react";
import { useState } from "react";


export type ButtonProps = {
    onClick: () => void | Promise<void>
    children: React.ReactElement
    className?: string
}

export function Button({ onClick, children, className }: ButtonProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const handleClick = async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
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
                className={className}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                }}
            >
                {loading ?
                    <Loader2 style={{
                        width: '1rem',
                        height: '1rem',
                        animation: 'spin 1s linear infinite',
                    }} /> :
                    children
                }
            </div>
            {error && <div style={{
                color: '#ef4444'
            }}>{error}</div>}
        </>
    )
}

export type TextButtonProps = Omit<ButtonProps, 'children'> & {
    title: string,
    icon?: React.ReactElement<LucideIcon>
}

export function TextButton({ title, onClick, className, icon }: TextButtonProps) {
    return (
        <Button onClick={onClick} className={className}>
            <div className="flex flex-row gap-4 items-center justify-center">
                {icon}
                {title}
            </div>
        </Button>
    )
}