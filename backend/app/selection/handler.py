"""Selection layer: deterministic node eligibility. No AI, no interpretation."""

from __future__ import annotations

from app.schemas.models import SelectionResult, StructureNode, StructureResult


def process_selection(structure: StructureResult) -> SelectionResult:
    """Select nodes eligible for downstream processing. Deterministic rules only."""
    selected: list[StructureNode] = []
    excluded: list[StructureNode] = []
    log: list[str] = []

    for node in structure.nodes:
        reasons: list[str] = []

        # Rule 1: must have source_text
        if not node.source_text or not node.source_text.strip():
            reasons.append("empty source_text")

        # Rule 2: invalid nodes should not continue downstream
        if node.validation_status == "invalid":
            reasons.append("hierarchy validation failed")

        # Rule 3: must not be blocked by CFS
        if node.blocked_flags:
            reasons.append(f"blocked by CFS: {', '.join(node.blocked_flags)}")

        # Rule 4: explicit hierarchy roles count as structure signals
        has_hierarchy_signal = node.role in {
            "PRIMARY_RULE",
            "EVIDENCE",
            "CONDITION",
            "EXCEPTION",
            "CONSEQUENCE",
            "DEFINITION",
        }

        # Rule 5: must have at least one structured signal
        has_signal = any([
            has_hierarchy_signal,
            node.actor,
            node.action,
            node.condition,
            node.temporal,
            node.jurisdiction,
            node.mechanism,
            node.risk and any(node.risk.values()),
            node.who,
            node.when,
            node.where,
        ])
        if not has_signal:
            reasons.append("no structured signal detected")

        if reasons:
            excluded.append(node)
            log.append(f"{node.node_id}: EXCLUDED - {'; '.join(reasons)}")
        else:
            selected.append(node)
            log.append(f"{node.node_id}: SELECTED")

    return SelectionResult(
        selected_nodes=selected,
        excluded_nodes=excluded,
        selection_log=log,
    )
