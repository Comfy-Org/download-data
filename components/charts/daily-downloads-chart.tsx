'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceArea, ReferenceLine, Label } from 'recharts';
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

  // Precompute date category domain for the X axis
  const dates = React.useMemo(() => chartData.map((d) => d.date), [chartData]);

  /**
   * Formats an ISO date string (YYYY-MM-DD) into a compact form.
   * Example: 2025-11-03 -> Nov 3
   */
  function formatIsoDateToAbbreviatedMonthDay(value: string): string {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!isoMatch) return value;
    const monthIndex = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (!Number.isFinite(monthIndex) || !Number.isFinite(day)) return value;
    const monthAbbreviations = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ] as const;
    if (monthIndex < 0 || monthIndex > 11) return value;
    return `${monthAbbreviations[monthIndex]} ${day}`;
  }

  /**
   * Formats Y-axis ticks as localized numbers, hiding zero to reduce clutter.
   */
  function formatYAxisTickHideZero(value: number): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    return numeric === 0 ? '' : numeric.toLocaleString();
  }

  const backfillAnnotations = React.useMemo(() => {
    // Compute label anchor positions for backfill spans. For degenerate spans
    // (overlap collapses to a single tick) we hide the label to avoid it sitting
    // on the Y-axis. For narrow spans on edges, nudge the label one tick inward.
    if (dates.length === 0 || events.length === 0) return [] as { key: string; x: string; text: string }[];
    const findFirstIndexOnOrAfter = (target: string) => {
      const idx = dates.findIndex((d) => d >= target);
      return idx === -1 ? dates.length - 1 : idx;
    };
    const findLastIndexOnOrBefore = (target: string) => {
      for (let i = dates.length - 1; i >= 0; i -= 1) {
        if (dates[i] <= target) return i;
      }
      return 0;
    };
    return events
      .map((e, i) => {
        let startIndex = dates.indexOf(e.startDate);
        if (startIndex === -1) startIndex = findFirstIndexOnOrAfter(e.startDate);
        let endIndex = dates.indexOf(e.endDate);
        if (endIndex === -1) endIndex = findLastIndexOnOrBefore(e.endDate);

        if (startIndex > endIndex) {
          const temp = startIndex;
          startIndex = endIndex;
          endIndex = temp;
        }

        const width = endIndex - startIndex;
        // Hide label for zero-width overlaps to avoid Y-axis placement
        if (width < 1) return null;

        let midIndex = Math.floor((startIndex + endIndex) / 2);
        // Nudge off chart edges when possible
        if (midIndex === 0 && dates.length > 1) midIndex = 1;
        if (midIndex === dates.length - 1 && dates.length > 1) midIndex = Math.max(0, dates.length - 2);

        const x = dates[midIndex];
        const text = `Backfilled (${e.strategy})`;
        return { key: `${e.startDate}-${e.endDate}-${i}`, x, text };
      })
      .filter((v): v is { key: string; x: string; text: string } => v !== null);
  }, [dates, events]);

  // Clamp backfill shading to visible domain and snap to nearest category keys
  const clampedBackfillAreas = React.useMemo(() => {
    if (dates.length === 0 || events.length === 0) return [] as { key: string; x1: string; x2: string }[];
    const findFirstIndexOnOrAfter = (target: string) => {
      const idx = dates.findIndex((d) => d >= target);
      return idx; // -1 means target is after visibleEnd
    };
    const findLastIndexOnOrBefore = (target: string) => {
      for (let i = dates.length - 1; i >= 0; i -= 1) {
        if (dates[i] <= target) return i; // -1 means target is before visibleStart
      }
      return -1;
    };
    return events.map((e, i) => {
      let startIndex = dates.indexOf(e.startDate);
      if (startIndex === -1) startIndex = findFirstIndexOnOrAfter(e.startDate);
      let endIndex = dates.indexOf(e.endDate);
      if (endIndex === -1) endIndex = findLastIndexOnOrBefore(e.endDate);

      // Skip if event does not overlap visible window
      if (startIndex === -1 || endIndex === -1) return null;

      if (startIndex > endIndex) {
        const temp = startIndex;
        startIndex = endIndex;
        endIndex = temp;
      }
      const x1 = dates[startIndex];
      const x2 = dates[endIndex];
      return { key: `${e.startDate}-${e.endDate}-${i}`, x1, x2 };
    }).filter((v): v is { key: string; x1: string; x2: string } => v !== null);
  }, [dates, events]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily New Downloads</CardTitle>
        <CardDescription>
          Net new downloads per day for all portable ComfyUI releases.
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
                top: 16,
                bottom: 10,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatIsoDateToAbbreviatedMonthDay}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                 tickLine={false}
                 axisLine={false}
                 tickMargin={8}
                 tickFormatter={formatYAxisTickHideZero}
              />
              {clampedBackfillAreas.map((span) => (
                <ReferenceArea key={span.key} x1={span.x1} x2={span.x2} fill="#8884d8" fillOpacity={0.08} />
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
              {backfillAnnotations.map((a) => (
                <ReferenceLine key={a.key} x={a.x} stroke="transparent">
                  <Label value={a.text} position="top" fontSize={10} />
                </ReferenceLine>
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
