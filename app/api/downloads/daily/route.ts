import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Define the structure of the daily summary data
export interface DailyDownload {
  date: string; // YYYY-MM-DD
  downloads: number;
}

export async function GET() {
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

    // Prepare and run the query to get daily deltas, ordered by date
    const stmt = db.prepare(`
      SELECT date, downloads_delta
      FROM daily_summary
      ORDER BY date ASC
    `);
    // Fetch deltas directly
    const rows = stmt.all() as { date: string; downloads_delta: number }[];

    // Map rows to API response format
    const data: DailyDownload[] = rows.map(row => ({
      date: row.date,
      downloads: row.downloads_delta,
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