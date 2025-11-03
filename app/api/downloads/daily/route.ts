import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Define the structure of the daily summary data
export interface DailyDownload {
  date: string;           // YYYY-MM-DD
  downloadsDelta: number; // net new downloads for the day
  fetchTimestamp: string; // ISO timestamp when this summary was recorded
}

// Define valid timeframes and helper for threshold calculation
const ALLOWED_TIMEFRAMES = ['1week', '1month', '3months', 'all'] as const;
type Timeframe = typeof ALLOWED_TIMEFRAMES[number];

export async function GET(request: Request) {
  // Parse the timeframe from the URL query parameters
  const { searchParams } = new URL(request.url);
  const rawTimeframe = searchParams.get('timeframe');
  const timeframe: Timeframe = rawTimeframe && ALLOWED_TIMEFRAMES.includes(rawTimeframe as Timeframe)
    ? (rawTimeframe as Timeframe)
    : '1month';
  // Determine how many recent data points to return for each timeframe
  const POINT_COUNTS: Record<Timeframe, number | null> = {
    '1week': 7,
    '1month': 30,
    '3months': 90,
    'all': null,
  };
  const maxRows = POINT_COUNTS[timeframe];
  
  const dataDir = path.resolve(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'downloads.db');

  // Check if the database file exists
  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found:', dbPath);
    return NextResponse.json(
      { error: 'Download data not found.' },
      { status: 500 }
    );
  }

  let db;
  try {
    // Connect to the SQLite database (read-only)
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    // Fetch either the last N rows or all rows
    let rows: { date: string; downloads_delta: number; fetch_timestamp: string }[];
    if (maxRows) {
      // Get most recent maxRows entries, then reverse to chronological order
      const recentDesc = db.prepare(
        `SELECT date, downloads_delta, fetch_timestamp
         FROM daily_summary
         ORDER BY date DESC
         LIMIT ?`
      ).all(maxRows) as typeof rows;
      rows = recentDesc.reverse();
    } else {
      // Return all data
      rows = db.prepare(
        `SELECT date, downloads_delta, fetch_timestamp
         FROM daily_summary
         ORDER BY date ASC`
      ).all() as typeof rows;
    }

    // Map rows to API response format
    const data: DailyDownload[] = rows.map(row => ({
      date: row.date,
      downloadsDelta: row.downloads_delta,
      fetchTimestamp: row.fetch_timestamp,
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Database query failed:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve download data.' },
      { status: 500 }
    );
  } finally {
    // Ensure the database connection is closed
    if (db) {
      try {
        db.close();
      } catch (err: unknown) {
        console.error('Error closing database:', (err as Error).message);
      }
    }
  }
}
