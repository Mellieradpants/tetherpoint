import { useState } from "react";
import { InputForm } from "../components/InputForm";
import { ResultsView } from "../components/ResultsView";
import { AnalyzeRequest, PipelineResponse } from "../types";

export function HomePage() {
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (request: AnalyzeRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
  const response = await fetch(
  "https://anchored-flow-stack.onrender.com/analyze",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-analyze-secret": "Apple_Banana_Bridge_123",
    },
    body: JSON.stringify(request),
  }
);    

if (!response.ok) {
  throw new Error("Analysis failed");
}

const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <header>
        <h1>Tetherpoint</h1>
        <p className="subtitle">Source-anchored parsing stack</p>
      </header>

      <InputForm onSubmit={handleSubmit} loading={loading} />

      {error && <div className="error-banner">{error}</div>}

      {result && <ResultsView data={result} />}
    </div>
  );
}
