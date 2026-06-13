import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import logger, { type LoggerItem } from "../Logger/Logger";
import { useWhisprValue } from "../react-whispr";

const SEVERITY_STYLES = {
    error: {
        icon: AlertCircle,
        container: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40",
        iconClass: "text-red-600 dark:text-red-400",
        textClass: "text-red-800 dark:text-red-200",
    },
    warning: {
        icon: TriangleAlert,
        container: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40",
        iconClass: "text-amber-600 dark:text-amber-400",
        textClass: "text-amber-900 dark:text-amber-200",
    },
    success: {
        icon: CheckCircle2,
        container: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40",
        iconClass: "text-emerald-600 dark:text-emerald-400",
        textClass: "text-emerald-900 dark:text-emerald-200",
    },
    info: {
        icon: Info,
        container: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/40",
        iconClass: "text-blue-600 dark:text-blue-400",
        textClass: "text-blue-900 dark:text-blue-200",
    },
} as const;

const MAX_VISIBLE_TOASTS = 3;

/** ~5 lines at text-sm / leading-snug */
const MESSAGE_MAX_HEIGHT_CLASS = "max-h-[6.875rem]";

export type LoggerReactDisplayProps = {
    zIndex?: number;
};

function LoggerReactDisplayItem({ message }: { message: LoggerItem }) {
    const styles = SEVERITY_STYLES[message.severity];
    const Icon = styles.icon;

    return (
        <div
            role="alert"
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-lg ${styles.container}`}
        >
            <Icon size={16} className={`mt-0.5 shrink-0 ${styles.iconClass}`} />
            <p
                className={`min-w-0 flex-1 overflow-y-auto text-sm leading-snug ${MESSAGE_MAX_HEIGHT_CLASS} ${styles.textClass}`}
            >
                {message.message}
            </p>
            <button
                type="button"
                onClick={message.dismiss}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function LoggerReactDisplay({ zIndex = 5000 }: LoggerReactDisplayProps) {
    const messages = useWhisprValue(logger.lines);
    const visible = [...messages].reverse().slice(0, MAX_VISIBLE_TOASTS);

    if (visible.length === 0) return null;

    return (
        <div
            className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center px-4"
            style={{ zIndex }}
        >
            <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2">
                {visible.map((message) => (
                    <LoggerReactDisplayItem key={message.id} message={message} />
                ))}
            </div>
        </div>
    );
}
