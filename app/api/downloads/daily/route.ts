import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Define the structure of the daily summary data
interface DailyDownload {
  date: string; // YYYY-MM-DD
  total_downloads: number;
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

    // Prepare and run the query to get all daily summaries, ordered by date
    const stmt = db.prepare(`
      SELECT date, total_downloads
      FROM daily_summary
      ORDER BY date ASC
    `);
    const data: DailyDownload[] = stmt.all() as DailyDownload[];

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
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        }
      });
    }
  }
} 