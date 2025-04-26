import { DailyDownloadsChart } from "@/components/charts/daily-downloads-chart";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen p-8 sm:p-16">
      <header className="w-full max-w-4xl mb-8">
        <h1 className="text-3xl font-bold text-center">ComfyUI Download Stats</h1>
      </header>
      <main className="w-full max-w-4xl">
        <DailyDownloadsChart />
        {/* You can add more charts or data displays here */}
      </main>
      <footer className="mt-12 text-center text-muted-foreground">
        Data fetched from GitHub Releases API.
      </footer>
    </div>
  );
}
