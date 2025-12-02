export type TableProps = {
    value: (string | React.ReactNode)[][]
    headers: string[]
}

export default function Table({ value, headers }: TableProps) {
    if (value.length === 0) {
        return (
            <div style={{ textAlign: 'center', paddingTop: '2rem', paddingBottom: '2rem', color: '#4b5563' }}>No data found</div>
        )
    }

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%' }}>
                    <thead style={{ backgroundColor: '#f3f4f6' }}>
                        <tr>
                            {headers.map((header, index) => (
                                <th
                                    key={index}
                                    style={{
                                        paddingLeft: '1.5rem',
                                        paddingRight: '1.5rem',
                                        paddingTop: '0.75rem',
                                        paddingBottom: '0.75rem',
                                        textAlign: 'left',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        color: '#6b7280',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody style={{ backgroundColor: 'white' }}>
                        {value.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                style={{
                                    borderTop: rowIndex > 0 ? '1px solid #e5e7eb' : 'none',
                                    transition: 'background-color 0.15s ease-in-out'
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f9fafb' }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'white' }}
                            >
                                {row.map((cell, cellIndex) => (
                                    <td
                                        key={cellIndex}
                                        style={{
                                            paddingLeft: '1.5rem',
                                            paddingRight: '1.5rem',
                                            paddingTop: '1rem',
                                            paddingBottom: '1rem',
                                            whiteSpace: 'nowrap',
                                            fontSize: '0.875rem',
                                            fontWeight: cellIndex === 0 ? 500 : 400,
                                            color: cellIndex === 0 ? '#111827' : '#4b5563'
                                        }}
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
