import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'downloads.db');
const githubRepo = 'comfyanonymous/ComfyUI';
const githubApiUrl = `https://api.github.com/repos/${githubRepo}/releases`;

// Inject PAT from secrets
const githubToken = process.env.PAT;

function formatDate(date) {
  return date.toISOString().split('T')[0];
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
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayDate = formatDate(yesterday);
  // Calculate delta per asset to avoid negative values when assets are missing
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
  const insertSummary = db.prepare(
    `INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`
  );
  insertSummary.run(todayDate, delta);
  console.log(`Daily summary stored for ${todayDate}: delta=${delta}`);
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
