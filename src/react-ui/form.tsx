import { LucideIcon } from "lucide-react"
import { useMemo } from "react"
import { TypeofRecord } from ".."
import Button from "./button"
import InputComponent, { InputComponentPropsVariants } from "./input"

export type FormComponentPropsInput = {
    label?: string,
    required: boolean,
    key: string,
    icon?: React.ReactElement<LucideIcon>
} & (
        {
            type: "text" | "email" | "password" | "tel",
        } |
        {
            type: "select",
            options: string[],
        }
    )


export type FormComponentProps<T extends Record<string, string>> = {
    inputs: FormComponentPropsInput[],
    submit?: {
        label: string,
        callback: (values: T) => void | Promise<void>
    }
    value: T,
    setValue: React.Dispatch<React.SetStateAction<T>>
    variant: TypeofRecord<InputComponentPropsVariants> & {
        button: string
    }
}

export default function FormComponent<T extends Record<string, string>>(props: FormComponentProps<T>) {
    const variants = useMemo(() => ({
        default: props.variant
    }), [props.variant])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {props.inputs.map((input, index) => (() => {
                const value = props.value[input.key]
                const setValue = (v: string) => props.setValue(prev => ({
                    ...prev,
                    [input.key]: v
                }))
                switch (input.type) {
                    case "text":
                    case "email":
                    case "password":
                    case "tel":
                        return <InputComponent
                            label={input.label}
                            value={value}
                            setValue={setValue}
                            variant="default"
                            variants={variants}
                            key={index}
                        >
                            {({ value, setValue, className }) => (
                                <input
                                    type={input.type}
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    required={input.required}
                                    className={className}
                                    placeholder={input.label}
                                />
                            )}
                        </InputComponent>
                    case "select":
                        return <InputComponent
                            label={input.label}
                            value={value}
                            setValue={setValue}
                            variant="default"
                            variants={variants}
                            key={index}
                            required={input.required}
                            validate={(v) => {
                                if (!input.options.includes(v))
                                    throw new Error("Invalid option")
                            }}
                        >
                            {({ value, setValue, className }) => (
                                <select
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    required={input.required}
                                    className={className}
                                >
                                    {input.options.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            )}
                        </InputComponent>
                    default:
                        return <div style={{ color: '#ef4444', backgroundColor: 'white' }}>Unknown input type</div>
                }
            })())}
            {props.submit &&
                <Button className={variants.default.button} title={props.submit.label} onClick={() => props.submit?.callback(props.value)} />
            }
        </div>
    )
}