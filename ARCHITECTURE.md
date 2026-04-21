### Architecture

Tetherpoint is a constraint-based parsing and traceability system.

The system is structured as a simple pipeline:

1. Input Layer  
   Raw text or structured content (JSON, HTML, XML, plain text)

2. Parsing Layer (Constraint-Based)  
   - Splits input into discrete statements (nodes)  
   - Extracts explicit fields (actor, action, condition, etc.)  
   - Does not allow inferred data  
   - Preserves missing information as "not specified"  
   - Anchors all output to source text  

3. Output Layer  
   Structured, traceable representation of meaning

The system does not generate free-form answers.  
It constrains interpretation and exposes how meaning is formed.
### Parsing Layer

The system does not perform free-form interpretation.

Instead, it enforces structured parsing under strict constraints:

- Input text is split into discrete statements (nodes)
- Each node is parsed into explicit fields (actor, action, condition, etc.)
- No inferred data is allowed
- Missing information is preserved as "not specified"
- All outputs remain anchored to source text

This ensures that interpretation is constrained, traceable, and auditable.
