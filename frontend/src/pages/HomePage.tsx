import * as React from "react";

export function HomePage() {
  const [content, setContent] = React.useState("");
  const [result, setResult] = React.useState<unknown>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleAnalyze() {
    if (!content.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "https://anchored-flow-stack.onrender.com/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-analyze-secret": "Apple_Banana_Bridge!123",
          },
          body: JSON.stringify({
            content,
            content_type: "text",
            options: {
              run_meaning: true,
              run_origin: true,
              run_verification: true,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Analysis failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setResult({ error: "Failed to analyze" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "700px",
          padding: "30px",
          background: "#111827",
          borderRadius: "12px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        }}
      >
        <h1 style={{ marginBottom: "20px" }}>Tetherpoint Analyzer</h1>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste text here..."
          style={{
            width: "100%",
            height: "150px",
            padding: "12px",
            fontSize: "14px",
            marginBottom: "20px",
            borderRadius: "8px",
            border: "1px solid #374151",
            background: "#020617",
            color: "#e5e7eb",
          }}
        />

        <button
          type="button"
          onClick={handleAnalyze}
          style={{
            padding: "10px 20px",
            fontSize: "14px",
            cursor: "pointer",
            borderRadius: "8px",
            border: "none",
            background: "#3b82f6",
            color: "white",
          }}
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>

        {result !== null && (
          <pre
            style={{
              marginTop: "20px",
              background: "#020617",
              padding: "15px",
              borderRadius: "8px",
              overflowX: "auto",
              fontSize: "12px",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}