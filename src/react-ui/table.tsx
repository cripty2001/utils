export type TableProps = {
    value: (string | React.ReactNode)[][]
    headers: string[]
}

export default function Table({ value, headers }: TableProps) {
    if (value.length === 0) {
        return (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">No data found</div>
        )
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            {headers.map((header, index) => (
                                <th
                                    key={index}
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {value.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                {row.map((cell, cellIndex) => (
                                    <td
                                        key={cellIndex}
                                        className={`px-6 py-4 whitespace-nowrap text-sm ${cellIndex === 0
                                            ? "font-medium text-gray-900 dark:text-white"
                                            : "text-gray-600 dark:text-gray-400"
                                            }`}
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
