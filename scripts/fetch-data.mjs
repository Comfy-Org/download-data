import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'downloads.db');
const githubRepo = 'comfyanonymous/ComfyUI';
const githubApiUrl = `https://api.github.com/repos/${githubRepo}/releases`;

// Inject PAT from secrets
const githubToken = process.env.PAT;
const backfillStrategy = (process.env.BACKFILL_STRATEGY || 'even').toLowerCase();
const backfillMinimumGapDays = Number.parseInt(process.env.BACKFILL_MIN_GAP_DAYS || '2', 10);

/**
 * Formats a Date to YYYY-MM-DD.
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Parses YYYY-MM-DD into a Date in UTC.
 */
function parseDate(value) {
  const [year, month, day] = value.split('-').map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Returns a new date string that is `days` after the given YYYY-MM-DD date.
 */
function addDays(dateString, days) {
  const date = parseDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/**
 * Calculates whole-day difference from start (exclusive) to end (inclusive).
 */
function daysBetweenExclusiveInclusive(startDateString, endDateString) {
  const start = parseDate(startDateString);
  const end = parseDate(endDateString);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((end.getTime() - start.getTime()) / msPerDay);
  return diff;
}

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Connect to SQLite database
// The 'verbose' option logs SQL statements to the console, useful for debugging
const db = new Database(dbPath, { verbose: console.log });

// --- Database Schema Setup ---
function setupDatabase() {
  // Create unified stats table: one row per asset per day including flags
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_daily_stats (
      asset_id INTEGER NOT NULL,
      asset_name TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      date TEXT NOT NULL,
      download_count INTEGER NOT NULL,
      draft INTEGER NOT NULL,
      prerelease INTEGER NOT NULL,
      fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (asset_id, date)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_summary (
      date TEXT PRIMARY KEY,
      downloads_delta INTEGER NOT NULL,
      fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  console.log('Database tables ensured.');
}

// --- GitHub API Fetching ---
async function fetchGitHubReleases() {
  console.log(`Fetching releases from ${githubApiUrl}...`);
  try {
    // Build headers and add auth if available
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ComfyUI-Download-Stats-Fetcher (Node.js)'
    };
    if (githubToken) {
      headers.Authorization = `token ${githubToken}`;
    }

    const response = await fetch(githubApiUrl, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
    }

    const releases = await response.json();
    console.log(`Fetched ${releases.length} releases.`);
    return releases;
  } catch (error) {
    console.error('Error fetching GitHub releases:', error);
    return []; // Return empty array on error
  }
}

// --- Daily Stats Storage ---
function storeDailyStats(releases) {
  console.log('Storing daily asset stats...');
  const today = new Date().toISOString().split('T')[0];
  const insert = db.prepare(`
    INSERT OR REPLACE INTO asset_daily_stats
    (asset_id, asset_name, tag_name, date, download_count, draft, prerelease)
    VALUES (@asset_id, @asset_name, @tag_name, @date, @download_count, @draft, @prerelease);
  `);
  db.transaction((rows) => {
    for (const release of rows) {
      const draftFlag = release.draft ? 1 : 0;
      const prereleaseFlag = release.prerelease ? 1 : 0;
      for (const asset of release.assets) {
        insert.run({
          asset_id: asset.id,
          asset_name: asset.name,
          tag_name: release.tag_name,
          date: today,
          download_count: asset.download_count,
          draft: draftFlag,
          prerelease: prereleaseFlag
        });
      }
    }
  })(releases);
  console.log('Daily stats stored.');
}

// Add new function to calculate and store daily summary
function storeDailySummary() {
  console.log('Storing daily summary...');
  const today = new Date();
  const todayDate = formatDate(today);

  if (backfillStrategy === 'none') {
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    const yesterdayDate = formatDate(yesterday);
    const deltaRow = db.prepare(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN old.download_count IS NULL THEN new.download_count
            ELSE new.download_count - old.download_count
          END
        ), 0) AS delta
      FROM asset_daily_stats AS new
      LEFT JOIN asset_daily_stats AS old
        ON new.asset_id = old.asset_id AND old.date = ?
      WHERE new.date = ?
    `).get(yesterdayDate, todayDate);
    const delta = deltaRow.delta;
    const upsert = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
    upsert.run(todayDate, delta);
    console.log(`Daily summary stored (no backfill) for ${todayDate}: delta=${delta}`);
    return;
  }

  const lastSnapshotRow = db.prepare(
    `SELECT MAX(date) AS last_date
     FROM asset_daily_stats
     WHERE date < ?`
  ).get(todayDate);
  const lastSnapshotDate = lastSnapshotRow && lastSnapshotRow.last_date ? lastSnapshotRow.last_date : null;

  if (!lastSnapshotDate) {
    const upsertFirst = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
    upsertFirst.run(todayDate, 0);
    console.log(`First run detected. Initialized ${todayDate} with delta=0.`);
    return;
  }

  const gapDays = daysBetweenExclusiveInclusive(lastSnapshotDate, todayDate);
  if (gapDays <= 0) {
    throw new Error('Invalid gap calculation for daily summary.');
  }

  if (gapDays < backfillMinimumGapDays) {
    const yesterdayDate = addDays(todayDate, -1);
    const deltaRow = db.prepare(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN old.download_count IS NULL THEN new.download_count
            ELSE new.download_count - old.download_count
          END
        ), 0) AS delta
      FROM asset_daily_stats AS new
      LEFT JOIN asset_daily_stats AS old
        ON new.asset_id = old.asset_id AND old.date = ?
      WHERE new.date = ?
    `).get(yesterdayDate, todayDate);
    const delta = deltaRow.delta;
    const upsert = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
    upsert.run(todayDate, delta);
    console.log(`Daily summary stored (small gap) for ${todayDate}: delta=${delta}`);
    return;
  }

  const totalDeltaRow = db.prepare(`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN old.download_count IS NULL THEN new.download_count
          ELSE new.download_count - old.download_count
        END
      ), 0) AS delta
    FROM asset_daily_stats AS new
    LEFT JOIN asset_daily_stats AS old
      ON new.asset_id = old.asset_id AND old.date = ?
    WHERE new.date = ?
  `).get(lastSnapshotDate, todayDate);
  const totalDelta = Number(totalDeltaRow.delta || 0);

  const gapDates = Array.from({ length: gapDays }, (_, i) => addDays(lastSnapshotDate, i + 1));

  const base = gapDates.length > 0 ? Math.floor(totalDelta / gapDates.length) : 0;
  const remainder = gapDates.length > 0 ? totalDelta % gapDates.length : 0;

  const upsert = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
  const tx = db.transaction((dates) => {
    dates.forEach((d, i) => {
      const value = base + (i < remainder ? 1 : 0);
      upsert.run(d, value);
    });
  });
  tx(gapDates);
  console.log(
    `Backfilled ${gapDates.length} day(s) from ${gapDates[0]} to ${gapDates[gapDates.length - 1]} evenly with total delta=${totalDelta}`
  );
}

// --- Main Execution ---
async function main() {
  try {
    setupDatabase();
    const releases = await fetchGitHubReleases();
    storeDailyStats(releases);
    storeDailySummary();
  } catch (error) {
    console.error('An error occurred during the fetch process:', error);
  } finally {
    // Close the database connection
    if (db) {
      try {
        db.close();
        console.log('Database connection closed.');
      } catch (err) {
        console.error('Error closing database:', err.message);
      }
    }
  }
}

main();
