'use client';

import * as React from 'react';
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis,
} from 'recharts';
import clsx from 'clsx';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { type DailyDownload } from '@/app/api/downloads/daily/route';

// Define available timeframes
type Timeframe = '1week' | '1month' | '3months' | 'all';

const timeframeOptions: { value: Timeframe; label: string }[] = [
  { value: '1week', label: '1 Week' },
  { value: '1month', label: '1 Month' },
  { value: '3months', label: '3 Months' },
  { value: 'all', label: 'All Time' },
];

const chartConfig = {
  downloads: {
    label: 'Daily New Downloads',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export function DailyDownloadsChart() {
  const [data, setData] = React.useState<DailyDownload[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [timeframe, setTimeframe] = React.useState<Timeframe>('all');

  React.useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/downloads/daily?timeframe=${timeframe}`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData: DailyDownload[] = await response.json();
        setData(jsonData);
        setError(null);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('Failed to fetch download data:', e);
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred');
        }
        setData([]); // Clear data on error
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    return () => controller.abort();
  }, [timeframe]); // Re-fetch when timeframe changes

  const formattedData = React.useMemo(() => {
    return data.map(item => ({
      date: item.date,
      // use new schema field for daily delta
      downloads: item.downloadsDelta,
    }));
  }, [data]);

  // Use all data points without filtering
  const chartData = formattedData;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily New Downloads</CardTitle>
        <CardDescription>
          Net new downloads per day for all portable ComfyUI releases.
        </CardDescription>
        <div className="flex flex-wrap gap-2 mt-4">
          {timeframeOptions.map((option) => (
            <button
              type="button"
              aria-pressed={timeframe === option.value}
              key={option.value}
              onClick={() => setTimeframe(option.value)}
              className={clsx(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                timeframe === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading && <p>Loading chart data...</p>}
        {error && <p className="text-destructive">Error loading data: {error}</p>}
        {!loading && !error && data.length === 0 && <p>No download data available.</p>}
        {!loading && !error && data.length > 0 && chartData.length === 0 && (
          <p>Not enough data to display download deltas.</p>
        )}
        {!loading && !error && chartData.length > 0 && (
          <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
                top: 10,
                bottom: 10,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                // tickFormatter={(value) => value.slice(5)} // Optionally format date ticks (MM-DD)
              />
              <YAxis
                 tickLine={false}
                 axisLine={false}
                 tickMargin={8}
                 tickFormatter={(value) => value.toLocaleString()} // Format Y-axis numbers
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" hideLabel />}
              />
              <Area
                dataKey="downloads"
                type="natural"
                fill="var(--color-downloads)"
                fillOpacity={0.4}
                stroke="var(--color-downloads)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}