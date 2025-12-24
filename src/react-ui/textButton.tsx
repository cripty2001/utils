import { LucideIcon } from "lucide-react"
import Button, { ButtonProps } from "./button"

export type TextButtonProps = Omit<ButtonProps, 'children'> & {
    title: string,
    icon?: React.ReactElement<LucideIcon>
}

export default function TextButton({ title, onClick, className, icon }: TextButtonProps) {
    return (
        <Button onClick={onClick} className={className}>
            <div className="flex flex-row gap-4 items-center justify-center">
                {icon}
                {title}
            </div>
        </Button>
    )
}