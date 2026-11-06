"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

interface SparklineProps {
  data?: { timestamp: number; chainlink: number; fynd?: number }[];
  inverted?: boolean;
}

export function RateSparkline({ data, inverted }: SparklineProps) {
  // Only render chart when real data is provided
  if (!data || data.length === 0) {
    return (
      <div className="flex h-16 w-full items-center justify-center">
        <span className="text-[11px] text-muted/50">No rate data</span>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    time: d.timestamp,
    rate: inverted ? 1 / d.chainlink : d.chainlink,
  }));

  const rates = chartData.map((d) => d.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const padding = (max - min) * 0.2 || 0.001;

  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
        >
          <defs>
            <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[min - padding, max + padding]} hide />
          <Area
            type="monotone"
            dataKey="rate"
            stroke="#3b82f6"
            strokeWidth={1.5}
            fill="url(#rateGradient)"
            dot={false}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
