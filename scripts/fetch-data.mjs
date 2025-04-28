import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'downloads.db');
const githubRepo = 'comfyanonymous/ComfyUI';
const githubApiUrl = `https://api.github.com/repos/${githubRepo}/releases`;

// Inject PAT from secrets
const githubToken = process.env.PAT;

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
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
      downloads_total INTEGER NOT NULL,
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
    (asset_id, asset_name, date, download_count, draft, prerelease)
    VALUES (@asset_id, @asset_name, @date, @download_count, @draft, @prerelease);
  `);
  db.transaction((rows) => {
    for (const release of rows) {
      const draftFlag = release.draft ? 1 : 0;
      const prereleaseFlag = release.prerelease ? 1 : 0;
      for (const asset of release.assets) {
        insert.run({
          asset_id: asset.id,
          asset_name: asset.name,
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
  const today = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const totalToday = db.prepare(
    'SELECT COALESCE(SUM(download_count), 0) AS total FROM asset_daily_stats WHERE date = ?'
  ).get(today).total;
  const totalYesterday = db.prepare(
    'SELECT COALESCE(SUM(download_count), 0) AS total FROM asset_daily_stats WHERE date = ?'
  ).get(yesterdayDate).total;
  const delta = totalToday - totalYesterday;
  const insertSummary = db.prepare(
    `INSERT OR REPLACE INTO daily_summary (date, downloads_total, downloads_delta) VALUES (?, ?, ?);`
  );
  insertSummary.run(today, totalToday, delta);
  console.log(`Daily summary stored for ${today}: total=${totalToday}, delta=${delta}`);
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
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed.');
        }
      });
    }
  }
}

main();
