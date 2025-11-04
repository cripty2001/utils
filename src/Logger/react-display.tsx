import { useRelTime, useWhisprValue } from "../react-whispr";
import logger from "./Logger";
import { X } from "lucide-react";

export function LoggerReactDisplay() {
    const messages = useWhisprValue(logger.lines);

    const getColor = (severity: string) => {
        switch (severity) {
            case 'success':
                return '#4CAF50';
            case 'info':
                return '#2196F3';
            case 'warning':
                return '#FF9800';
            case 'error':
                return '#F44336';
            default:
                return '#333';
        }
    };

    const relTs = useRelTime();

    return (
        <div className="fixed bottom-0 right-0 w-full z-50  p-4 rounded " >
            <div className="flex flex-col gap-2 items-center w-full justify-center" >
                {
                    [...messages]
                        .reverse()
                        .slice(0, 3)
                        .map((message) => (
                            <div
                                key={message.id}
                                className={`p-2 rounded shadow-md text-white ng-black w-full max-w-prose cursor-pointer`}
                                onClick={message.dismiss}
                                style={{
                                    backgroundColor: getColor(message.severity)
                                }
                                }
                            >
                                <div className="flex justify-between items-center" >
                                    <div>
                                        <strong>[{relTs(message.date)}] </strong>
                                        {message.context && <span className="ml-2" > - {message.context} </span>}
                                    </div>
                                    < button
                                        onClick={message.dismiss}
                                        className="ml-4 text-white font-bold"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                < div className="mt-1" > {message.message} </div>
                            </div>
                        ))}
            </div>
        </div>
    );
}