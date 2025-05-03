import { DailyDownloadsChart } from "@/components/charts/daily-downloads-chart";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen p-8 sm:p-16">
      <header className="w-full max-w-4xl mb-8">
        <h1 className="text-3xl font-bold text-center">ComfyUI Download Data</h1>
      </header>
      {/* TEMPORARY WARNING BANNER */}
      <div className="w-full max-w-4xl mb-6">
        <div className="bg-yellow-100 border border-yellow-300 text-yellow-900 rounded-lg px-4 py-3 text-center text-sm font-medium">
          <strong>Notice:</strong> Upgrades are under construction. Please ignore the data for May 3rd, 2025.
        </div>
      </div>
      <main className="w-full max-w-4xl">
        <DailyDownloadsChart />
        {/* You can add more charts or data displays here */}
      </main>
      <footer className="mt-12 text-center text-muted-foreground">
        <a href="https://github.com/benceruleanlu/comfyui-download-data" className="text-blue-500 hover:underline" target="_blank">Data fetched daily from GitHub Releases API.</a>
      </footer>
    </div>
  );
}
