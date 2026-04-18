import { useState } from "react";
import "./App.css";
import { InputForm } from "./components/InputForm";
import { ResultsView } from "./components/ResultsView";
import type { AnalyzeRequest, PipelineResponse } from "./types";
import { analyzeDocumentRequest } from "./api/client";

function App() {
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(true);

  const handleSubmit = async (request: AnalyzeRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await analyzeDocumentRequest(request);
      setResult(data);
      setShowInput(false);
    } catch (err) {
      console.error("Analysis failed:", err);
      setError("Analysis failed. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <header>
        <h1>Tetherpoint</h1>
        <p className="subtitle">Source-Anchored Parsing Stack</p>
        {result && (
          <button type="button" onClick={() => setShowInput(!showInput)}>
            {showInput ? "Hide Input" : "New Analysis"}
          </button>
        )}
      </header>

      {error && <div className="error-banner">{error}</div>}

      {showInput && <InputForm onSubmit={handleSubmit} loading={loading} />}

      <div className="results">
  <ResultsView data={result || ({} as any)} />
</div>
    </div>
  );
}

export default App;
