import Button from "./button"
import InputComponent, { InputComponentPropsVariants } from "./input"

export type FormComponentPropsInput = {
    label: string,
    required: boolean,
    key: string,
} & (
        {
            type: "text" | "email" | "password" | "tel",
        } |
        {
            type: "select",
            options: string[],
        }
    )


export type FormComponentProps<T extends Record<string, string>, V extends InputComponentPropsVariants> = {
    inputs: FormComponentPropsInput[],
    onSubmit: (values: T) => void,
    submitLabel: string,
    value: T,
    setValue: React.Dispatch<React.SetStateAction<T>>
    variants: V
}

export default function FormComponent<T extends Record<string, string>, V extends InputComponentPropsVariants>(props: FormComponentProps<T, V>) {
    return (
        <div className="flex flex-col gap-4">
            {props.inputs.map(input => (() => {
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
                            variant="form"
                            variants={props.variants}
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
                            variant="form"
                            variants={props.variants}
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
                        return <div className="text-red-500 bg-white">Unknown input type</div>
                }
            })())}
            <Button title={props.submitLabel} onClick={() => props.onSubmit(props.value)} />
        </div>
    )
}