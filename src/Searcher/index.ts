import { Whispr } from "@cripty2001/whispr"

export type SearcherData<T> = {
    queries: string[]
    doc: T
}

export class Searcher<T> {
    private data: SearcherData<T>[] = []
    constructor(data: SearcherData<T>[]) {
        this.data = data
    }

    public search(query: string): SearcherData<T>[] {
        if (query === "") return this.data

        return this.data.filter(item =>
            item.queries.some(q => q.includes(
                query.toLowerCase()
            ))
        )
    }
}

export function useSearcher_w<T>(data: SearcherData<T>[], query: Whispr<string>): Whispr<SearcherData<T>[]> {
    const searcher = new Searcher<T>(data);
    let unsubscribe: () => void = () => { }

    const [toReturn, setToReturn] = Whispr.create<SearcherData<T>[]>([], () => unsubscribe())

    unsubscribe = query.subscribe((q) => {
        let result = searcher.search(q);
        setToReturn(result);
    }, true)

    return toReturn
}