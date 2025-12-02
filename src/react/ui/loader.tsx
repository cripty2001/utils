import type { AppserverData } from "@cripty2001/utils/appserver/client"
import type { Dispatcher, DispatcherStatePayload } from "@cripty2001/utils/dispatcher"
import { useWhisprValue } from "@cripty2001/utils/react-whispr"
import type React from "react"

export type LoaderProps<T extends AppserverData> = {
    data: Dispatcher<unknown, T>
    children: (data: T) => React.ReactNode
}

export default function Loader<T extends AppserverData>(props: LoaderProps<T>) {
    const data = useWhisprValue(props.data.data);
    return (
        <div className="">
            <Content data={data} >{(data) =>
                props.children(data)
            }</Content>
        </div>
    )
}

function Content<T extends AppserverData>({ data, children }: { data: DispatcherStatePayload<T>, children: (data: T) => React.ReactNode }) {
    if (data.loading)
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900 dark:border-white"></div>
            </div>
        )
    if (!data.ok)
        return <div className="text-red-500">{data.error.message}</div>

    return children(data.data)
}