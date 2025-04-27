# ComfyUI Download Stats Dashboard

A simple dashboard to track, log, and visualize daily download counts for the portable version of **ComfyUI**.

## Overview

This project fetches release and asset download data from the ComfyUI GitHub repository, stores it in a local SQLite database, aggregates daily download totals, and presents interactive charts through a Next.js dashboard.

## Features

- **Automated Data Fetching**: Retrieve GitHub release and asset download counts via a Node.js script.
- **Local Persistence**: Store raw data in SQLite (`data/downloads.db`) and maintain a `daily_summary` table for easy trend analysis.
- **Interactive Dashboard**: Visualize download metrics with a responsive React interface using Recharts.
- **Scheduled Updates**: Leverage GitHub Actions to run the fetch script daily at 07:00 UTC and commit updates.
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

- **releases**: Stores GitHub release metadata (`id`, `tag_name`, `name`, `published_at`, `draft`, `prerelease`).
- **assets**: Records individual asset download counts (`id`, `release_id`, `name`, `download_count`).
- **daily_summary**: Aggregated total downloads per date with `downloads_delta` from the previous day.

## GitHub Actions Workflow

A workflow in `.github/workflows/fetch-data.yml` is configured to:

1. Run the fetch script daily at 07:00 UTC.
2. Commit changes to `data/downloads.db` if new data is fetched.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [GPL-3.0 license](LICENSE).

## Acknowledgments

- Built with Next.js, React, Tailwind CSS, and Better-SQLite3.
