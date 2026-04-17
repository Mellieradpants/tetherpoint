import { useState } from "react";
import { InputForm } from "./components/InputForm";
import { ResultsView } from "./components/ResultsView";
import type { AnalyzeRequest, PipelineResponse } from "./types";
import { analyzeDocumentRequest } from "./api/client";

function App() {
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (request: AnalyzeRequest) => {
    setLoading(true);
    try {
      const data = await analyzeDocumentRequest(request);
      setResult(data);
    } catch (err) {
      console.error("Analysis failed:", err);
      alert("Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <InputForm onSubmit={handleSubmit} loading={loading} />
      {result && <ResultsView data={result} />}
    </div>
  );
}

export default App;