
### Parsing Layer

The system does not perform free-form interpretation.

Instead, it enforces structured parsing under strict constraints:

- Input text is split into discrete statements (nodes)
- Each node is parsed into explicit fields (actor, action, condition, etc.)
- No inferred data is allowed
- Missing information is preserved as "not specified"
- All outputs remain anchored to source text

This ensures that interpretation is constrained, traceable, and auditable.
