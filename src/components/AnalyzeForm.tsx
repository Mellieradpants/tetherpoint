import { useState } from "react";

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Federal Energy Commission Report</title>
  <meta name="author" content="Sarah Chen">
  <meta property="og:title" content="FERC Grid Standards 2025">
</head>
<body>
  <p>The Federal Energy Regulatory Commission enacted Order No. 2222-A on November 1, 2024.</p>
  <p>Tesla Inc. reported Q3 2024 revenue of $25.2 billion.</p>
  <p>The Supreme Court ruled in West Virginia v. EPA.</p>
</body>
</html>`;

const CONTENT_TYPES = ["text", "html", "xml", "json"] as const;

interface AnalyzeFormProps {
  onSubmit: (content: string, contentType: string, options: Record<string, boolean>) => void;
  loading: boolean;
}

export function AnalyzeForm({ onSubmit, loading }: AnalyzeFormProps) {
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState<string>("text");
  const [runMeaning, setRunMeaning] = useState(false);
  const [runOrigin, setRunOrigin] = useState(true);
  const [runVerification, setRunVerification] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(content, contentType, {
      run_meaning: runMeaning,
      run_origin: runOrigin,
      run_verification: runVerification,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-foreground">Content Type</label>
        <div className="flex gap-1">
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setContentType(ct)}
              className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
                contentType === ct
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {ct}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste document content here..."
        className="w-full rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        rows={8}
      />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={runMeaning} onChange={(e) => setRunMeaning(e.target.checked)} className="rounded" />
          Meaning (AI)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={runOrigin} onChange={(e) => setRunOrigin(e.target.checked)} className="rounded" />
          Origin
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={runVerification} onChange={(e) => setRunVerification(e.target.checked)} className="rounded" />
          Verification
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
        <button
          type="button"
          onClick={() => { setContent(SAMPLE_HTML); setContentType("html"); }}
          className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          Load Sample
        </button>
      </div>
    </form>
  );
}
