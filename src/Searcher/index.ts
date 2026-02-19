
export type SearcherData<T> = {
    queries: string[]
    order: number
    doc: T
}

export class Searcher<T> {
    private data: SearcherData<T>[] = []
    constructor(data: SearcherData<T>[]) {
        this.data = data
    }

    public search(query: string, limit: number): SearcherData<T>[] {
        return this.data
            .filter(item =>
                query === '' ||
                item.queries.some(q => q.includes(
                    query.toLowerCase()
                ))
            )
            .sort((a, b) => a.order - b.order)
            .slice(0, limit)
    }

    public updateData(data: SearcherData<T>[]) {
        this.data = data.map(item => ({
            ...item,
            queries: item.queries.map(q => q.toLowerCase())
        }))
    }
}

// export function useSearcher_w<T>(data: Whispr<SearcherData<T>[]>, query: Whispr<string>): Whispr<SearcherData<T>[]> {
//     const searcher = new Searcher<T>(data.value);
//     let unsubscribe_q: () => void = () => { }
//     let unsubscribe_d: () => void = () => { }

//     const [toReturn, setToReturn] = Whispr.create<SearcherData<T>[]>([], () => {
//         unsubscribe_q();
//         unsubscribe_d();
//     })

//     unsubscribe_q = query.subscribe((q) => {
//         let result = searcher.search(q);
//         setToReturn(result);
//     }, true)

//     unsubscribe_d = data.subscribe((d) => {
//         searcher.updateData(d);
//     }, true)

//     return toReturn
// }