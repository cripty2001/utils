export type AppserverData =
    | null
    | boolean
    | number
    | string
    | Uint8Array
    | AppserverData[]
    | { [key: string]: AppserverData };