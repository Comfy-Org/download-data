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
const backfillLookbackDays = Number.parseInt(process.env.BACKFILL_LOOKBACK_DAYS || '30', 10);
const backfillPatternFallback = (process.env.BACKFILL_PATTERN_FALLBACK || 'even').toLowerCase();
const backfillNoiseScale = Number.parseFloat(process.env.BACKFILL_NOISE_SCALE || '1');
const backfillTrendWindow = Number.parseInt(process.env.BACKFILL_TREND_WINDOW || '21', 10);
const backfillRandomSeed = process.env.BACKFILL_RANDOM_SEED || null;
const backfillStochasticFallback = (process.env.BACKFILL_STOCHASTIC_FALLBACK || 'even').toLowerCase();

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

/**
 * Scales a non-negative shape array so that the result consists of integers
 * that sum exactly to targetSum, using largest remainder rounding.
 */
function scaleSeriesToTotal(shape, targetSum) {
  const n = shape.length;
  if (n === 0) return [];
  const total = shape.reduce((a, b) => a + Math.max(0, b), 0);
  if (targetSum === 0) return new Array(n).fill(0);
  if (total <= 0) return null;
  const raw = shape.map((v) => (Math.max(0, v) / total) * targetSum);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = targetSum - floors.reduce((a, b) => a + b, 0);
  const fractional = raw.map((v, i) => [i, v - Math.floor(v)]);
  fractional.sort((a, b) => b[1] - a[1]);
  const result = floors.slice();
  for (let k = 0; k < fractional.length && remainder > 0; k++) {
    const idx = fractional[k][0];
    result[idx] += 1;
    remainder -= 1;
  }
  return result;
}

/**
 * Builds a repeated pattern series of length targetLength from the provided
 * baseline array, taking the most recent values and cycling if needed.
 */
function buildPatternSeries(baseline, targetLength) {
  const source = baseline.slice(-Math.min(baseline.length, targetLength));
  if (source.length === 0) return [];
  const result = [];
  let i = 0;
  while (result.length < targetLength) {
    result.push(source[i % source.length]);
    i += 1;
  }
  return result;
}

/**
 * Simple deterministic PRNG (mulberry32) seeded by a 32-bit integer.
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hashes a string into a 32-bit unsigned integer for seeding.
 */
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Returns a function that produces N(0,1) samples using Box-Muller with the given PRNG.
 */
function makeNormalGenerator(prng) {
  let spare = null;
  return function normal() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = prng() * 2 - 1;
      v = prng() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const mul = Math.sqrt(-2.0 * Math.log(s) / s);
    spare = v * mul;
    return u * mul;
  };
}

/**
 * Computes a trailing moving average with the given window. Non-negative clamp.
 */
function computeMovingAverage(series, window) {
  if (window <= 1) return series.slice();
  const out = [];
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i];
    if (i >= window) sum -= series[i - window];
    const denom = Math.min(i + 1, window);
    out.push(Math.max(0, sum / denom));
  }
  return out;
}

/**
 * Computes a simple linear regression slope over equally spaced x for y series.
 */
function computeLinearTrendSlope(series) {
  const n = series.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (series[i] - meanY);
    den += dx * dx;
  }
  if (den === 0) return 0;
  return num / den;
}

/**
 * Computes standard deviation of first differences of a series.
 */
function computeDeltaStd(series) {
  if (series.length < 2) return 0;
  const deltas = [];
  for (let i = 1; i < series.length; i++) deltas.push(series[i] - series[i - 1]);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const varSum = deltas.reduce((a, b) => a + (b - mean) * (b - mean), 0) / deltas.length;
  return Math.sqrt(varSum);
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

  if (backfillStrategy === 'pattern') {
    if (totalDelta < 0) {
      throw new Error('Negative total delta for pattern backfill.');
    }
    const baselineRows = db.prepare(
      `SELECT date, downloads_delta
       FROM daily_summary
       WHERE date < ?
       ORDER BY date DESC
       LIMIT ?`
    ).all(lastSnapshotDate, backfillLookbackDays);
    const baseline = baselineRows.map((r) => Number(r.downloads_delta || 0)).reverse();
    const pattern = buildPatternSeries(baseline, gapDates.length);
    if (pattern.length === 0 || pattern.every((v) => v <= 0)) {
      if (backfillPatternFallback === 'even') {
        const base = gapDates.length > 0 ? Math.floor(totalDelta / gapDates.length) : 0;
        const remainder = gapDates.length > 0 ? totalDelta % gapDates.length : 0;
        const upsertEven = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
        const txEven = db.transaction((dates) => {
          dates.forEach((d, i) => {
            const value = base + (i < remainder ? 1 : 0);
            upsertEven.run(d, value);
          });
        });
        txEven(gapDates);
        console.log(`Backfilled ${gapDates.length} day(s) evenly (pattern unavailable) with total delta=${totalDelta}`);
        return;
      }
      throw new Error('Pattern backfill unavailable and fallback is not even.');
    }
    const scaled = scaleSeriesToTotal(pattern, totalDelta);
    if (scaled === null) {
      if (backfillPatternFallback === 'even') {
        const base = gapDates.length > 0 ? Math.floor(totalDelta / gapDates.length) : 0;
        const remainder = gapDates.length > 0 ? totalDelta % gapDates.length : 0;
        const upsertEven = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
        const txEven = db.transaction((dates) => {
          dates.forEach((d, i) => {
            const value = base + (i < remainder ? 1 : 0);
            upsertEven.run(d, value);
          });
        });
        txEven(gapDates);
        console.log(`Backfilled ${gapDates.length} day(s) evenly (pattern invalid) with total delta=${totalDelta}`);
        return;
      }
      throw new Error('Invalid pattern for backfill and fallback is not even.');
    }
    const upsertPattern = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
    const txPattern = db.transaction((dates, values) => {
      dates.forEach((d, i) => {
        upsertPattern.run(d, values[i]);
      });
    });
    txPattern(gapDates, scaled);
    console.log(
      `Backfilled ${gapDates.length} day(s) with pattern from ${gapDates[0]} to ${gapDates[gapDates.length - 1]} (lookback=${backfillLookbackDays}, total delta=${totalDelta})`
    );
    return;
  }

  if (backfillStrategy === 'stochastic') {
    if (totalDelta < 0) {
      throw new Error('Negative total delta for stochastic backfill.');
    }
    const baselineRows = db.prepare(
      `SELECT date, downloads_delta
       FROM daily_summary
       WHERE date < ?
       ORDER BY date DESC
       LIMIT ?`
    ).all(lastSnapshotDate, backfillLookbackDays);
    const baseline = baselineRows.map((r) => Number(r.downloads_delta || 0)).reverse();
    const ma = computeMovingAverage(baseline, Math.max(2, backfillTrendWindow));
    const slope = computeLinearTrendSlope(ma);
    const maLast = ma.length > 0 ? ma[ma.length - 1] : 0;
    const sigma = computeDeltaStd(baseline) * (Number.isFinite(backfillNoiseScale) ? backfillNoiseScale : 1);

    const seedString = backfillRandomSeed || `${lastSnapshotDate}|${todayDate}`;
    const prng = mulberry32(hashStringToSeed(seedString));
    const normal = makeNormalGenerator(prng);

    const raw = gapDates.map((_, i) => {
      const trend = Math.max(0, maLast + slope * (i + 1));
      const noise = sigma > 0 ? normal() * sigma : 0;
      const value = trend + noise;
      return value > 0 ? value : 0;
    });

    const scaled = scaleSeriesToTotal(raw, totalDelta);
    if (scaled === null || scaled.every((v) => v === 0) && totalDelta > 0) {
      if (backfillStochasticFallback === 'pattern') {
        // reuse pattern branch by setting strategy temporarily
        const pattern = buildPatternSeries(baseline, gapDates.length);
        const scaledPattern = scaleSeriesToTotal(pattern, totalDelta);
        if (scaledPattern === null) {
          if (backfillPatternFallback === 'even') {
            const base = gapDates.length > 0 ? Math.floor(totalDelta / gapDates.length) : 0;
            const remainder = gapDates.length > 0 ? totalDelta % gapDates.length : 0;
            const upsertEven = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
            const txEven = db.transaction((dates) => {
              dates.forEach((d, i) => {
                const value = base + (i < remainder ? 1 : 0);
                upsertEven.run(d, value);
              });
            });
            txEven(gapDates);
            console.log(`Backfilled ${gapDates.length} day(s) evenly (pattern invalid) with total delta=${totalDelta}`);
            return;
          }
          throw new Error('Pattern fallback invalid and BACKFILL_PATTERN_FALLBACK!=even.');
        }
        const upsertPattern = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
        const txPattern = db.transaction((dates, values) => {
          dates.forEach((d, i) => {
            upsertPattern.run(d, values[i]);
          });
        });
        txPattern(gapDates, scaledPattern);
        console.log(
          `Backfilled ${gapDates.length} day(s) with pattern (stochastic fallback) from ${gapDates[0]} to ${gapDates[gapDates.length - 1]} (lookback=${backfillLookbackDays}, total delta=${totalDelta})`
        );
        return;
      }
      if (backfillStochasticFallback === 'even') {
        const base = gapDates.length > 0 ? Math.floor(totalDelta / gapDates.length) : 0;
        const remainder = gapDates.length > 0 ? totalDelta % gapDates.length : 0;
        const upsertEven = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
        const txEven = db.transaction((dates) => {
          dates.forEach((d, i) => {
            const value = base + (i < remainder ? 1 : 0);
            upsertEven.run(d, value);
          });
        });
        txEven(gapDates);
        console.log(`Backfilled ${gapDates.length} day(s) evenly (stochastic unavailable) with total delta=${totalDelta}`);
        return;
      }
      throw new Error('Stochastic backfill unavailable and fallback is not even/pattern.');
    }

    const upsertStochastic = db.prepare(`INSERT OR REPLACE INTO daily_summary (date, downloads_delta) VALUES (?, ?);`);
    const txStochastic = db.transaction((dates, values) => {
      dates.forEach((d, i) => {
        upsertStochastic.run(d, values[i]);
      });
    });
    txStochastic(gapDates, scaled);
    console.log(
      `Backfilled ${gapDates.length} day(s) with stochastic series from ${gapDates[0]} to ${gapDates[gapDates.length - 1]} (lookback=${backfillLookbackDays}, slope=${slope.toFixed(4)}, sigma=${sigma.toFixed(4)}, total delta=${totalDelta})`
    );
    return;
  }

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
    `Backfilled ${gapDates.length} day(s) evenly from ${gapDates[0]} to ${gapDates[gapDates.length - 1]} with total delta=${totalDelta}`
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
