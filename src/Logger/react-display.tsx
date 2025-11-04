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
        <div style={{
            position: 'fixed',
            bottom: 0,
            right: 0,
            width: '100%',
            zIndex: 50,
            padding: '1rem',
            borderRadius: '0.5rem',
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                alignItems: 'center',
                width: '100%',
                justifyContent: 'center',
            }}>
                {
                    [...messages]
                        .reverse()
                        .slice(0, 3)
                        .map((message) => (
                            <div
                                key={message.id}
                                style={{
                                    padding: '0.5rem',
                                    borderRadius: '0.375rem',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    color: '#fff',
                                    width: '100%',
                                    maxWidth: '65ch',
                                    cursor: 'pointer',
                                    backgroundColor: getColor(message.severity)
                                }}
                                onClick={message.dismiss}
                            >
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}>
                                    <div>
                                        <strong>[{relTs(message.date)}] </strong>
                                        {message.context && <span style={{
                                            marginLeft: '0.5rem',
                                        }}> - {message.context} </span>}
                                    </div>
                                    <button
                                        onClick={message.dismiss}
                                        style={{
                                            marginLeft: '1rem',
                                            color: '#fff',
                                            fontWeight: 'bold',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: 0,
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <div style={{
                                    marginTop: '0.25rem',
                                }}>{message.message}</div>
                            </div>
                        ))}
            </div>
        </div>
    );
}