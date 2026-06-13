import { Whispr } from "@cripty2001/whispr";
import { getRandomId } from "..";

export type LoggerItem = {
    id: string,
    date: Date,
    message: string,
    severity: "success" | "info" | "warning" | "error",
    context: string | undefined,
    dismiss: () => void,
    trace: string | undefined
}

const AUTO_DISMISS_MS: Record<LoggerItem["severity"], number> = {
    success: 5000,
    info: 5000,
    warning: 6000,
    error: 8000,
};

class Logger {
    private static instance: Logger;

    public lines: Whispr<LoggerItem[]>;
    private setLines: (errors: LoggerItem[]) => void;
    private readonly dismissTimers = new Map<string, number>();

    private constructor() {
        [this.lines, this.setLines] = Whispr.create<LoggerItem[]>([]);

        if (typeof window !== "undefined") {
            window.addEventListener("unhandledrejection", (e) => this.log(e.reason, "error"));
            window.addEventListener("error", (e: ErrorEvent) => this.logError(this.reconstructError(e)));
        }
    }

    private reconstructError(e: ErrorEvent): Error {
        if (e.error && e.error instanceof Error) {
            return e.error;
        }
        if (e.message && typeof e.message === 'string') {
            return new Error(e.message);
        }

        return new Error("Unknown error");
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private removeItem(id: string): void {
        const timer = this.dismissTimers.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.dismissTimers.delete(id);
        }
        this.setLines(this.lines.value.filter((i) => i.id !== id));
    }

    public log(message: string, severity: LoggerItem['severity'] = "info", context?: string) {
        const id = getRandomId();
        const item: LoggerItem = {
            id,
            date: new Date(),
            message,
            severity,
            context,
            dismiss: () => this.removeItem(id),
            trace: (new Error()).stack,
        };

        this.setLines([...this.lines.value, item]);

        if (typeof window !== "undefined") {
            const timer = window.setTimeout(() => item.dismiss(), AUTO_DISMISS_MS[severity]);
            this.dismissTimers.set(id, timer);
        }
    }

    public logError(error: Error | DOMException | unknown) {
        if (
            error instanceof DOMException ||
            error instanceof Error
        ) {
            return this.log(error.message, "error", error.stack);
        }

        console.trace('UNKNOWN ERROR', error);
        return this.log("Unknown error - See Console", "error");
    }
}

export default Logger.getInstance();
