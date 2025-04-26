'use client';

import * as React from 'react';
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis,
} from 'recharts';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { type DailyDownload } from '@/app/api/downloads/daily/route'; // Adjust if needed

const chartConfig = {
  downloads: {
    label: 'Downloads',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export function DailyDownloadsChart() {
  const [data, setData] = React.useState<DailyDownload[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/downloads/daily');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData: DailyDownload[] = await response.json();
        setData(jsonData);
        setError(null);
      } catch (e) {
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
  }, []);

  const formattedData = React.useMemo(() => {
    return data.map(item => ({
      date: item.date,
      downloads: item.downloads,
    }));
  }, [data]);

  // Calculate total downloads
  const totalDownloads = React.useMemo(() => {
    return formattedData.reduce((acc, curr) => acc + curr.downloads, 0);
  }, [formattedData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Downloads</CardTitle>
        <CardDescription>
          Total downloads per day for ComfyUI releases.
          {totalDownloads > 0 && ` Total: ${totalDownloads.toLocaleString()}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <p>Loading chart data...</p>}
        {error && <p className="text-destructive">Error loading data: {error}</p>}
        {!loading && !error && data.length === 0 && <p>No download data available.</p>}
        {!loading && !error && data.length > 0 && (
          <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
            <AreaChart
              accessibilityLayer
              data={formattedData}
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