import { CopyIcon, LucideIcon } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../index";

export type InputComponentPropsVariantsItem = {
    input: string,
    label: string,
    wrapper: string,
}
export type InputComponentPropsVariants = Record<string, InputComponentPropsVariantsItem> & {
    default: InputComponentPropsVariantsItem
}

export type InputComponentProps<V extends InputComponentPropsVariants> = {
    label?: string,
    icon?: React.ReactElement<LucideIcon>,
    value: string,
    setValue: (value: string) => void,
    required?: boolean,
    children: ({ value, setValue, className }: { value: string, setValue: (value: string) => void, className: string }) => React.ReactNode,
    copy?: boolean,
    variant?: keyof V,
    validate?: (value: string) => void,
    variants: V
}

export default function InputComponent<Variants extends InputComponentPropsVariants>(props: InputComponentProps<Variants>) {
    const variant = props.variant
    const baseClassName = props.variants[variant ?? "default"]

    const [error, setError] = useState<string | null>(null)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                {props.label &&
                    <label className={baseClassName.label}>
                        {props.label}
                    </label>
                }
                {props.copy &&
                    <CopyIcon
                        style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                        onClick={() => copyToClipboard(props.value)}
                    />
                }
            </div>
            <div style={{ position: 'relative' }} className={baseClassName.wrapper}>
                {props.icon &&
                    <div style={{ position: 'absolute', left: '0.5rem', top: '0.5rem' }}>
                        {props.icon}
                    </div>
                }
                <div style={{ paddingLeft: props.icon ? '2rem' : '0.5rem' }}>
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
                        className: baseClassName.input
                    })}
                </div>
            </div>
            {error &&
                <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                    {error}
                </div>
            }
        </div>
    );
}