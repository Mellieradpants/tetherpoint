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
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Type</span>
        <div className="flex gap-0.5 rounded-md bg-surface p-0.5">
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setContentType(ct)}
              className={`rounded px-3 py-1 text-[11px] font-mono transition-colors ${
                contentType === ct
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
        placeholder="Paste document content here…"
        className="w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        rows={6}
      />

      <div className="flex flex-wrap items-center gap-4">
        {[
          { label: "Meaning (AI)", checked: runMeaning, set: setRunMeaning },
          { label: "Origin", checked: runOrigin, set: setRunOrigin },
          { label: "Verification", checked: runVerification, set: setRunVerification },
        ].map(opt => (
          <label key={opt.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={opt.checked}
              onChange={(e) => opt.set(e.target.checked)}
              className="rounded border-border"
            />
            {opt.label}
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
        <button
          type="button"
          onClick={() => { setContent(SAMPLE_HTML); setContentType("html"); }}
          className="rounded-md bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          Load Sample
        </button>
      </div>
    </form>
  );
}
