import { copyToClipboard } from "@cripty2001/utils";
import { CopyIcon } from "lucide-react";
import { useState } from "react";

export type InputComponentProps<Variants extends Record<string, string>> = {
    label?: string,
    value: string,
    setValue: (value: string) => void,
    required?: boolean,
    children: ({ value, setValue, className }: { value: string, setValue: (value: string) => void, className: string }) => React.ReactNode,
    copy?: boolean,
    variant?: keyof Variants,
    validate?: (value: string) => void,
    variants: Variants
}

export default function InputComponent<Variants extends Record<string, string>>(props: InputComponentProps<Variants>) {
    const variant = props.variant ?? ""
    const baseClassName = props.variants[variant] ?? ""

    const [error, setError] = useState<string | null>(null)

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-row justify-between items-center gap-2">
                {props.label &&
                    <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {props.label}
                    </label>
                }
                {props.copy &&
                    <CopyIcon
                        className="w-4 h-4 cursor-pointer"
                        onClick={() => copyToClipboard(props.value)}
                    />
                }
            </div>
            <div className="relative">
                {props.children({
                    value: props.value,
                    setValue: (v) => {
                        try {
                            if (props.required && v === "")
                                throw new Error("Required field is empty")

                            props.validate?.(v)
                            props.setValue(v)
                            setError(null)
                        }
                        catch (e: any) {
                            setError(e.message)
                        }
                    },
                    className: baseClassName
                })}
            </div>
            {error &&
                <div className="text-red-500 text-xs">
                    {error}
                </div>
            }
        </div>
    );
}