import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'downloads.db');
const githubRepo = 'comfyanonymous/ComfyUI';
const githubApiUrl = `https://api.github.com/repos/${githubRepo}/releases`;

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Connect to SQLite database
// The 'verbose' option logs SQL statements to the console, useful for debugging
const db = new Database(dbPath, { verbose: console.log });

// --- Database Schema Setup ---
function setupDatabase() {
  // Create releases table: Stores overall info about each release
  db.exec(`
    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY,          -- GitHub's release ID
      tag_name TEXT UNIQUE NOT NULL,   -- e.g., "v1.0.0"
      name TEXT,                       -- Release title
      published_at TEXT,               -- ISO 8601 timestamp
      fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- When this record was fetched/updated
    );
  `);

  // Create assets table: Stores download counts for each asset within a release
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY,          -- GitHub's asset ID
      release_id INTEGER NOT NULL,     -- Foreign key to releases table
      name TEXT NOT NULL,              -- Asset filename (e.g., "ComfyUI_windows_portable.zip")
      download_count INTEGER NOT NULL,
      fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- When this count was fetched/updated
      FOREIGN KEY (release_id) REFERENCES releases (id) ON DELETE CASCADE
    );
  `);

  // Create daily_summary table: Stores total downloads per day (aggregated from assets)
  // This simplifies querying for daily trends.
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_summary (
      date TEXT PRIMARY KEY,           -- Date in 'YYYY-MM-DD' format
      total_downloads INTEGER NOT NULL,
      fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- When this summary was calculated
    );
  `);

  console.log('Database tables ensured.');
}

// --- GitHub API Fetching ---
async function fetchGitHubReleases() {
  console.log(`Fetching releases from ${githubApiUrl}...`);
  try {
    // GitHub API prefers a User-Agent header
    const response = await fetch(githubApiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ComfyUI-Download-Stats-Fetcher (Node.js)',
        // If you hit rate limits, you might need a GitHub Personal Access Token
        // 'Authorization': `token YOUR_GITHUB_TOKEN`
      }
    });

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

// --- Data Processing and Storage ---
function storeReleaseData(releases) {
  if (!releases || releases.length === 0) {
    console.log('No release data to store.');
    return;
  }

  const insertRelease = db.prepare(`
    INSERT OR REPLACE INTO releases (id, tag_name, name, published_at)
    VALUES (@id, @tag_name, @name, @published_at);
  `);

  const insertAsset = db.prepare(`
    INSERT OR REPLACE INTO assets (id, release_id, name, download_count)
    VALUES (@id, @release_id, @name, @download_count);
  `);

  // Use a transaction for efficiency and atomicity
  db.transaction((releasesData) => {
    for (const release of releasesData) {
      if (!release.draft) { // Only store non-draft releases (including prereleases)
        console.log(`Processing release: ${release.tag_name}`);
        insertRelease.run({
          id: release.id,
          tag_name: release.tag_name,
          name: release.name,
          published_at: release.published_at,
        });

        for (const asset of release.assets) {
          insertAsset.run({
            id: asset.id,
            release_id: release.id,
            name: asset.name,
            download_count: asset.download_count,
          });
        }
      } else {
         console.log(`Skipping draft: ${release.tag_name}`);
      }
    }
  })(releases); // Execute the transaction

  console.log('Finished storing release and asset data.');
}

// --- Aggregation ---
function updateDailySummary() {
    console.log('Updating daily summary...');

    // Calculate total downloads across all assets
    const { total_downloads } = db.prepare('SELECT SUM(download_count) as total_downloads FROM assets').get();

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Insert or update the summary for today
    const upsertSummary = db.prepare(`
        INSERT INTO daily_summary (date, total_downloads)
        VALUES (@date, @total_downloads)
        ON CONFLICT(date) DO UPDATE SET
            total_downloads = excluded.total_downloads,
            fetch_timestamp = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
    `);

    upsertSummary.run({
        date: today,
        total_downloads: total_downloads || 0 // Use 0 if sum is null (no assets yet)
    });

    console.log(`Daily summary updated for ${today} with total downloads: ${total_downloads || 0}`);
}


// --- Main Execution ---
async function main() {
  try {
    setupDatabase();
    const releases = await fetchGitHubReleases();
    storeReleaseData(releases);
    updateDailySummary();
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
