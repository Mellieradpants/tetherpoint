import { useState } from "react";
import { AnalyzeRequest } from "../types";

interface InputFormProps {
  onSubmit: (request: AnalyzeRequest) => void;
  loading: boolean;
}

export function InputForm({ onSubmit, loading }: InputFormProps) {
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState<
    "xml" | "html" | "json" | "text"
  >("text");
  const [runMeaning, setRunMeaning] = useState(true);
  const [runOrigin, setRunOrigin] = useState(true);
  const [runVerification, setRunVerification] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      content,
      content_type: contentType,
      options: {
        run_meaning: runMeaning,
        run_origin: runOrigin,
        run_verification: runVerification,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="input-form">
      <div className="form-group">
        <label htmlFor="content">Document Content</label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          placeholder="Paste document content here..."
          required
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="content-type">Content Type</label>
          <select
            id="content-type"
            value={contentType}
            onChange={(e) =>
              setContentType(e.target.value as "xml" | "html" | "json" | "text")
            }
          >
            <option value="text">Text</option>
            <option value="html">HTML</option>
            <option value="xml">XML</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={runMeaning}
              onChange={(e) => setRunMeaning(e.target.checked)}
            />
            Meaning
          </label>
          <label>
            <input
              type="checkbox"
              checked={runOrigin}
              onChange={(e) => setRunOrigin(e.target.checked)}
            />
            Origin
          </label>
          <label>
            <input
              type="checkbox"
              checked={runVerification}
              onChange={(e) => setRunVerification(e.target.checked)}
            />
            Verification
          </label>
        </div>
      </div>

      <button type="submit" disabled={loading || !content.trim()}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>
    </form>
  );
}
