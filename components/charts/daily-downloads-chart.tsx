'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceArea } from 'recharts';
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
import { type BackfillEvent } from '@/app/api/backfill/events/route';

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
  const [timeframe, setTimeframe] = React.useState<Timeframe>('1month');
  const [events, setEvents] = React.useState<BackfillEvent[]>([]);

  React.useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      try {
        setLoading(true);
        const [r1, r2] = await Promise.all([
          fetch(`/api/downloads/daily?timeframe=${timeframe}`, { signal: controller.signal }),
          fetch(`/api/backfill/events?timeframe=${timeframe}`, { signal: controller.signal }),
        ]);
        if (!r1.ok) {
          throw new Error(`HTTP error! status: ${r1.status}`);
        }
        if (!r2.ok) {
          throw new Error(`HTTP error! status: ${r2.status}`);
        }
        const [jsonData, eventsData] = await Promise.all([
          r1.json() as Promise<DailyDownload[]>,
          r2.json() as Promise<BackfillEvent[]>,
        ]);
        setData(jsonData);
        setEvents(eventsData);
        setError(null);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('Failed to fetch download data:', e);
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred');
        }
        setData([]);
        setEvents([]);
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
          {events.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              Backfilled data present: {events.map((e) => `${e.startDate}→${e.endDate} (${e.strategy})`).join(', ')}
            </div>
          )}
          {data.length > 1 && (
            <div className="mt-2">
              <p className="text-sm">
                <span className="font-medium">Change over timeframe:</span>
                <span className={`ml-2 ${
                  data[data.length - 1].downloadsDelta - data[0].downloadsDelta > 0
                    ? 'text-green-600'
                    : data[data.length - 1].downloadsDelta - data[0].downloadsDelta < 0
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}>
                  {data[data.length - 1].downloadsDelta - data[0].downloadsDelta > 0 ? '+' : ''}
                  {(data[data.length - 1].downloadsDelta - data[0].downloadsDelta).toLocaleString()} downloads/day
                </span>
                <span className="ml-2">
                  ({
                    data[data.length - 1].downloadsDelta - data[0].downloadsDelta > 0
                      ? '+'
                      : data[data.length - 1].downloadsDelta - data[0].downloadsDelta < 0
                      ? '-'
                      : ''
                  }
                  {Math.abs((data[data.length - 1].downloadsDelta - data[0].downloadsDelta) / data[0].downloadsDelta * 100).toFixed(1)}%)
                </span>
              </p>
            </div>
          )}
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
              {events.map((e, idx) => (
                <ReferenceArea key={`${e.startDate}-${e.endDate}-${idx}`} x1={e.startDate} x2={e.endDate} fill="#8884d8" fillOpacity={0.08} />
              ))}
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
