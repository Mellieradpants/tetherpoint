import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnalyzeForm } from "../components/AnalyzeForm";
import { ResultsPanel } from "../components/ResultsPanel";
import { analyzePipeline } from "../lib/analyze";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tetherpoint — Source-Anchored Parsing Stack" },
      { name: "description", content: "API-first document analysis through a locked 7-layer pipeline." },
    ],
  }),
  component: Index,
});

function Index() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (content: string, contentType: string, options: Record<string, boolean>) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzePipeline({
        data: {
          content,
          content_type: contentType,
          options: {
            run_meaning: options.run_meaning ?? false,
            run_origin: options.run_origin ?? true,
            run_verification: options.run_verification ?? true,
          },
        },
      });
      setResult(data as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-lg font-semibold text-foreground tracking-tight">Tetherpoint</h1>
          <p className="text-xs text-muted-foreground">Source-anchored parsing stack · 7-layer pipeline</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <AnalyzeForm onSubmit={handleSubmit} loading={loading} />

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && <ResultsPanel data={result as any} />}
      </main>
    </div>
  );
}
