# ComfyUI Download Data

A simple dashboard to track, log, and visualize daily download counts for the portable version of **ComfyUI**.

## Overview

This project fetches release and asset download data from the ComfyUI GitHub repository, stores it in a local SQLite database, aggregates daily download totals, and presents interactive charts through a Next.js dashboard.

## Features

- **Automated Data Fetching**: Retrieve GitHub release and asset download counts via a Node.js script.
- **Local Persistence**: Store raw data in SQLite (`data/downloads.db`) and maintain a `daily_summary` table for easy trend analysis.
- **Interactive Dashboard**: Visualize download metrics with a responsive React interface using Recharts.
- **Scheduled Updates**: Leverage GitHub Actions to run the fetch script daily at 10:49 UTC and commit updates.
- **No External Dependencies**: Everything runs locally without requiring external database services.

## Tech Stack

- **Next.js 15** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **Better-SQLite3** for database interactions
- **GitHub Actions** for scheduled data updates

## Getting Started

### Prerequisites

- Node.js v22 or newer (tested with v22)
- pnpm as package manager (v10 recommended)

### Installation

```bash
git clone https://github.com/comfyanonymous/comfy-download-data.git
cd comfy-download-data
pnpm install
```

### Fetching Data

Run the data fetching script to create or update the SQLite database:

```bash
pnpm getdata
# or: node scripts/fetch-data.mjs
```

This populates `data/downloads.db` and updates daily summaries.

### Running the Dashboard

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Building for Production

```bash
pnpm build
pnpm start
```

## Database Schema

### asset_daily_stats

The `asset_daily_stats` table tracks daily download counts for each GitHub asset, including flags for draft and prerelease status.

Column | Type | Description
--- | --- | ---
asset_id | INTEGER | The GitHub asset ID.
asset_name | TEXT | The name of the asset.
date | TEXT | Date in `YYYY-MM-DD` format.
download_count | INTEGER | Number of downloads for the asset on that date.
draft | INTEGER | 1 if the release is a draft, 0 otherwise.
prerelease | INTEGER | 1 if the release is a prerelease, 0 otherwise.
fetch_timestamp | TEXT | ISO 8601 timestamp when the data was fetched (default to current time).

```sql
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
```

### daily_summary

The `daily_summary` table stores the daily delta (net new downloads) across all assets.

Column | Type | Description
--- | --- | ---
date | TEXT | Date in `YYYY-MM-DD` format.
downloads_delta | INTEGER | Net new downloads attributed to this date.
fetch_timestamp | TEXT | ISO 8601 timestamp when the summary was recorded (default to current time).

```sql
CREATE TABLE IF NOT EXISTS daily_summary (
  date TEXT PRIMARY KEY,
  downloads_delta INTEGER NOT NULL,
  fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

### backfill_events

Records when the fetcher backfills missing days.

Column | Type | Description
--- | --- | ---
id | INTEGER | Auto-increment primary key.
start_date | TEXT | First backfilled date `YYYY-MM-DD`.
end_date | TEXT | Last backfilled date `YYYY-MM-DD`.
strategy | TEXT | `even`, `pattern`, or `stochastic`.
lookback_days | INTEGER | Lookback window used, if applicable.
trend_window | INTEGER | Trend window used, if applicable.
noise_scale | REAL | Noise scale used, if applicable.
total_delta | INTEGER | Total downloads distributed across the backfilled span.
created_at | TEXT | Timestamp when the event was recorded.

```sql
CREATE TABLE IF NOT EXISTS backfill_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  strategy TEXT NOT NULL,
  lookback_days INTEGER,
  trend_window INTEGER,
  noise_scale REAL,
  total_delta INTEGER NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

### Backfill Behavior

If the fetch process misses days, the script evenly distributes the total change
between the last available snapshot and today across all missing days. This avoids
one-day spikes when resuming after a gap.

Environment variables:
- `BACKFILL_STRATEGY`: `even` (default), `pattern`, `stochastic`, or `none`.
  - `even`: distribute evenly across the gap.
  - `pattern`: replay recent variability and scale to the gap’s total.
  - `stochastic`: synthesize a series using recent trend and noise, then scale to match the gap’s total (deterministic with seed).
  - `none`: disable backfill; use only the previous day’s diff.
- `BACKFILL_MIN_GAP_DAYS`: minimum number of missing days to trigger backfill (default: `2`).
- `BACKFILL_LOOKBACK_DAYS`: number of days to learn the pattern shape from for `pattern` (default: `30`).
- `BACKFILL_PATTERN_FALLBACK`: behavior when pattern is unavailable or invalid; `even` (default) or `fail`.
  
Stochastic options:
- `BACKFILL_TREND_WINDOW`: moving-average window for trend estimation (default: `7`).
- `BACKFILL_NOISE_SCALE`: multiplier for noise standard deviation derived from recent daily changes (default: `1`).
- `BACKFILL_RANDOM_SEED`: optional fixed seed; defaults to a deterministic seed derived from dates.
- `BACKFILL_STOCHASTIC_FALLBACK`: `even` (default), `pattern`, or `fail`.

## GitHub Actions Workflow

A workflow in `.github/workflows/fetch-data.yml` is configured to:

1. Run the fetch script daily at 10:49 UTC.
2. Commit changes to `data/downloads.db` if new data is fetched.

## Backfill Annotations in UI

The dashboard shades backfilled date ranges and shows a short note above the chart. Data is served via `GET /api/backfill/events?timeframe=...` and rendered as subtle `ReferenceArea` overlays.

## Daily Bucketing & Scheduling

Data is assigned to a canonical daily “bucket” defined by a UTC cutoff time.

- `DAILY_CUTOFF_UTC`: HH:mm UTC string (default: `10:49`). If a run occurs before this time, data is bucketed to the previous date; otherwise to the current date.
- `BUCKET_WRITE_MODE`: `once` (default) or `replace`.
  - `once`: if `asset_daily_stats` already has rows for the bucket date, the script skips writing asset rows again. This prevents manual, late-day runs from inflating the current bucket and reducing the following day’s delta.
  - `replace`: always overwrite the bucket’s asset rows.
- `SUMMARY_WRITE_MODE`: `once` (default) or `replace`.
  - Controls writes to `daily_summary`. In `once`, `INSERT OR IGNORE` preserves the first summary written for a bucket.

Tip: Keep `BUCKET_WRITE_MODE=once` and `SUMMARY_WRITE_MODE=once` to maintain consistent day-over-day deltas even if you trigger manual runs mid‑day.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [GPL-3.0 license](LICENSE).

## Acknowledgments

- Built with Next.js, React, Tailwind CSS, and Better-SQLite3.
