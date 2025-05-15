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

export async function GET(request: Request) {
  // Parse the timeframe from the URL query parameters
  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || 'all';
  
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

    // Calculate the date threshold based on the timeframe
    let dateThreshold = '';
    const today = new Date();
    
    switch (timeframe) {
      case '1week':
        // 1 week ago
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        dateThreshold = oneWeekAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
        break;
      case '1month':
        // 1 month ago
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        dateThreshold = oneMonthAgo.toISOString().split('T')[0];
        break;
      case '3months':
        // 3 months ago
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(today.getMonth() - 3);
        dateThreshold = threeMonthsAgo.toISOString().split('T')[0];
        break;
      case 'all':
      default:
        // No date threshold for all-time
        dateThreshold = '';
        break;
    }

    // Define the type for our database rows
    let rows: { date: string; downloads_delta: number; fetch_timestamp: string }[];
      // Prepare and run the query based on whether we have a date threshold
    if (dateThreshold) {
      const stmt = db.prepare(`
        SELECT date, downloads_delta, fetch_timestamp
        FROM daily_summary
        WHERE date >= ?
        ORDER BY date ASC
      `);
      rows = stmt.all(dateThreshold) as { date: string; downloads_delta: number; fetch_timestamp: string }[];
    } else {
      const stmt = db.prepare(`
        SELECT date, downloads_delta, fetch_timestamp
        FROM daily_summary
        ORDER BY date ASC
      `);
      rows = stmt.all() as { date: string; downloads_delta: number; fetch_timestamp: string }[];
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