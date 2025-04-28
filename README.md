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
- npm, yarn, or pnpm as package manager

### Installation

```bash
git clone https://github.com/comfyanonymous/comfy-download-data.git
cd comfy-download-data
npm install
# or yarn install
# or pnpm install
```

### Fetching Data

Run the data fetching script to create or update the SQLite database:

```bash
npm run getdata
# or node scripts/fetch-data.mjs
```

This populates `data/downloads.db` and updates daily summaries.

### Running the Dashboard

Start the development server:

```bash
npm run dev
# or yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Building for Production

```bash
npm run build
npm run start
```

## Database Schema

### asset_daily_stats

The `asset_daily_stats` table tracks daily download counts for each GitHub asset, including flags for draft and prerelease status.

Column | Type | Description
--- | --- | ---
asset_id | INTEGER | The GitHub asset ID.
date | TEXT | Date in `YYYY-MM-DD` format.
download_count | INTEGER | Number of downloads for the asset on that date.
draft | INTEGER | 1 if the release is a draft, 0 otherwise.
prerelease | INTEGER | 1 if the release is a prerelease, 0 otherwise.
fetch_timestamp | TEXT | ISO 8601 timestamp when the data was fetched (default to current time).

```sql
CREATE TABLE IF NOT EXISTS asset_daily_stats (
  asset_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  download_count INTEGER NOT NULL,
  draft INTEGER NOT NULL,
  prerelease INTEGER NOT NULL,
  fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (asset_id, date)
);
```

### daily_summary

The `daily_summary` table summarizes daily total and delta of downloads.

Column | Type | Description
--- | --- | ---
date | TEXT | Date in `YYYY-MM-DD` format.
downloads_total | INTEGER | Total downloads for all assets on that date.
downloads_delta | INTEGER | Difference in downloads compared to the previous day.
fetch_timestamp | TEXT | ISO 8601 timestamp when the summary was fetched (default to current time).

```sql
CREATE TABLE IF NOT EXISTS daily_summary (
  date TEXT PRIMARY KEY,
  downloads_total INTEGER NOT NULL,
  downloads_delta INTEGER NOT NULL,
  fetch_timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

## GitHub Actions Workflow

A workflow in `.github/workflows/fetch-data.yml` is configured to:

1. Run the fetch script daily at 10:49 UTC.
2. Commit changes to `data/downloads.db` if new data is fetched.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [GPL-3.0 license](LICENSE).

## Acknowledgments

- Built with Next.js, React, Tailwind CSS, and Better-SQLite3.
