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

    public updateData(data: SearcherData<T>[]) {
        this.data = data
    }
}

export function useSearcher_w<T>(data: Whispr<SearcherData<T>[]>, query: Whispr<string>): Whispr<SearcherData<T>[]> {
    const searcher = new Searcher<T>(data.value);
    let unsubscribe_q: () => void = () => { }
    let unsubscribe_d: () => void = () => { }

    const [toReturn, setToReturn] = Whispr.create<SearcherData<T>[]>([], () => unsubscribe())

    unsubscribe_q = query.subscribe((q) => {
        let result = searcher.search(q);
        setToReturn(result);
    }, true)

    unsubscribe_d = data.subscribe((d) => {
        searcher.updateData(d);
    }, true)

    return toReturn
}