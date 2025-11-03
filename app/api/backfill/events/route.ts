import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface BackfillEvent {
  startDate: string;
  endDate: string;
  strategy: 'even' | 'pattern' | 'stochastic';
  lookbackDays: number | null;
  trendWindow: number | null;
  noiseScale: number | null;
  totalDelta: number;
  createdAt: string;
}

const ALLOWED_TIMEFRAMES = ['1week', '1month', '3months', 'all'] as const;
type Timeframe = typeof ALLOWED_TIMEFRAMES[number];

export const runtime = 'nodejs';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return formatDate(d);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawTimeframe = searchParams.get('timeframe');
  const timeframe: Timeframe = rawTimeframe && ALLOWED_TIMEFRAMES.includes(rawTimeframe as Timeframe)
    ? (rawTimeframe as Timeframe)
    : 'all';

  const dataDir = path.resolve(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'downloads.db');

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: 'Download data not found.' }, { status: 500 });
  }

  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    let thresholdDate: string | null = null;
    if (timeframe === '1week') thresholdDate = daysAgo(7);
    if (timeframe === '1month') thresholdDate = daysAgo(30);
    if (timeframe === '3months') thresholdDate = daysAgo(90);

    let rows: { start_date: string; end_date: string; strategy: string; lookback_days: number | null; trend_window: number | null; noise_scale: number | null; total_delta: number; created_at: string; }[];
    if (thresholdDate) {
      rows = db.prepare(
        `SELECT start_date, end_date, strategy, lookback_days, trend_window, noise_scale, total_delta, created_at
         FROM backfill_events
         WHERE end_date >= ?
         ORDER BY start_date ASC`
      ).all(thresholdDate) as typeof rows;
    } else {
      rows = db.prepare(
        `SELECT start_date, end_date, strategy, lookback_days, trend_window, noise_scale, total_delta, created_at
         FROM backfill_events
         ORDER BY start_date ASC`
      ).all() as typeof rows;
    }

    const data: BackfillEvent[] = rows.map((r) => ({
      startDate: r.start_date,
      endDate: r.end_date,
      strategy: r.strategy as BackfillEvent['strategy'],
      lookbackDays: r.lookback_days ?? null,
      trendWindow: r.trend_window ?? null,
      noiseScale: (r.noise_scale ?? null) as number | null,
      totalDelta: r.total_delta,
      createdAt: r.created_at,
    }));

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve backfill events.' }, { status: 500 });
  } finally {
    if (db) {
      try { db.close(); } catch {}
    }
  }
}
