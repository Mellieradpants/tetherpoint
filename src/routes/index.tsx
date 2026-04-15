import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnalyzeForm } from "../components/AnalyzeForm";
import { Workspace } from "../components/Workspace";
import type { PipelineResponse } from "../components/Workspace";
import { analyzeDocument } from "../lib/api-client";

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
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(true);

  const handleSubmit = async (content: string, contentType: string, options: Record<string, boolean>) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeDocument({
        content,
        content_type: contentType,
        options: {
          run_meaning: options.run_meaning ?? false,
          run_origin: options.run_origin ?? true,
          run_verification: options.run_verification ?? true,
        },
      });
      setResult(data as PipelineResponse);
      setShowInput(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background md:h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-primary tracking-tight">Tetherpoint</h1>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest hidden sm:inline">
            Source-Anchored Parsing
          </span>
        </div>
        {result && (
          <button
            type="button"
            onClick={() => setShowInput(!showInput)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showInput ? "Hide Input" : "New Analysis"}
          </button>
        )}
      </header>

      {/* Input area (collapsible after results) */}
      {showInput && (
        <div className={`border-b border-border bg-surface/50 ${result ? "max-h-[40vh] overflow-y-auto" : ""}`}>
          <div className="mx-auto max-w-3xl px-4 py-4">
            <AnalyzeForm onSubmit={handleSubmit} loading={loading} />
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Workspace */}
      {result ? (
        <div className="flex-1 md:overflow-hidden">
          <Workspace data={result} />
        </div>
      ) : !loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-semibold text-primary mb-1">Tetherpoint</div>
            <div className="text-xs text-muted-foreground">Paste content and run the 7-layer pipeline</div>
          </div>
        </div>
      )}
    </div>
  );
}
