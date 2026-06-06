'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface ChartDatum {
  label: string
  value: number
}

export function Chart({
  data,
  title,
  valueLabel = 'Count',
}: {
  data: ChartDatum[]
  title?: string
  valueLabel?: string
}) {
  if (data.length === 0) return null

  return (
    <div className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3">
      {title && <p className="mb-2 text-xs font-medium text-gray-500">{title}</p>}
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <Tooltip formatter={(v) => [Number(v), valueLabel]} />
          <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
