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

class Logger {
    private static instance: Logger;

    public lines: Whispr<LoggerItem[]>;
    private setLines: (errors: LoggerItem[]) => void;

    private constructor() {
        [this.lines, this.setLines] = Whispr.create<LoggerItem[]>([]);

        window.addEventListener("unhandledrejection", (e) => this.log(e.reason, "error"))
        window.addEventListener("error", (e: any) => this.logError(this.reconstructError(e)));
    }

    private reconstructError(e: any): Error {
        if (e.error && e.error instanceof Error) {
            return e.error
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

    public log(message: string, severity: LoggerItem['severity'] = "info", context?: string) {
        const item: LoggerItem = {
            id: getRandomId(),
            date: new Date(),
            message,
            severity,
            context,
            dismiss: () => {
                this.setLines(this.lines.value.filter(i => i.id !== item.id));
            },
            trace: (new Error()).stack
        };

        this.setLines([...this.lines.value, item]);
    }

    public logError(error: Error | DOMException | any) {
        if (
            error instanceof DOMException ||
            error instanceof Error ||
            false
        ) {
            return this.log(error.message, "error", error.stack);
        }

        console.trace('UNKNOWN ERROR', error);
        return this.log("Unknown error - See Console", "error");
    }
}

export default Logger.getInstance();
