"""Active Structure handler wrapper with fragment-aware hierarchy validation.

The base implementation remains deterministic and unchanged in handler_base.py.
This module patches only validation gates so preserved fragments can remain
visible without being treated as required PRIMARY_RULE hierarchy members.
"""

from __future__ import annotations

from typing import Optional

from . import handler_base as _base

# Re-export the base module surface, including private helpers used by tests.
for _name in dir(_base):
    if _name not in globals():
        globals()[_name] = getattr(_base, _name)


def _is_fragment_node(node: StructureNode) -> bool:
    return "fragment:incomplete" in node.tags or _base._is_non_substantive_fragment(
        node.normalized_text
    )


def _has_primary_rule_candidate(nodes: list[StructureNode]) -> bool:
    return any(
        node.role == "PRIMARY_RULE" or _base._is_primary_candidate(node.normalized_text)
        for node in nodes
    )


def _has_primary_rule_text(text: str) -> bool:
    return _base._is_primary_candidate(text)


def validateSection(
    section_nodes: list[StructureNode],
    visible_nodes: Optional[list[StructureNode]] = None,
) -> list[StructureValidationIssue]:
    if not section_nodes:
        return []

    issues: list[StructureValidationIssue] = []
    section_id = section_nodes[0].section_id
    visible_section_nodes = visible_nodes if visible_nodes is not None else section_nodes

    hierarchy_nodes = [node for node in visible_section_nodes if not _is_fragment_node(node)]
    if not hierarchy_nodes:
        return []

    parents = [node for node in hierarchy_nodes if node.role == "PRIMARY_RULE"]

    if len(parents) == 0:
        if not _has_primary_rule_candidate(hierarchy_nodes):
            return []
        message = f"{section_id}: missing PRIMARY_RULE"
        issues.append(_base._make_issue(section_id, "missing_primary", message))
        for node in hierarchy_nodes:
            _base._record_node_error(node, message)
        return issues

    if len(parents) > 1:
        message = f"{section_id}: multiple PRIMARY_RULE nodes detected"
        issues.append(_base._make_issue(section_id, "multiple_primary", message))
        for node in hierarchy_nodes:
            _base._record_node_error(node, message)
        return issues

    parent = parents[0]
    if not _base._is_atomic_parent(parent.normalized_text):
        message = f"{section_id}: {parent.node_id} exceeds atomic parent constraints"
        issues.append(_base._make_issue(section_id, "oversized_node", message, node_id=parent.node_id))
        _base._record_node_error(parent, message)

    for node in hierarchy_nodes:
        if node.role == "BOILERPLATE":
            message = f"{section_id}: visible boilerplate leaked into output"
            issues.append(_base._make_issue(section_id, "boilerplate_leak", message, node_id=node.node_id))
            _base._record_node_error(node, message)

        if len(node.normalized_text) > MAX_NODE_LENGTH or not _base._is_atomic_node(node.normalized_text):
            message = f"{section_id}: {node.node_id} is oversized or non-atomic"
            issues.append(_base._make_issue(section_id, "oversized_node", message, node_id=node.node_id))
            _base._record_node_error(node, message)

        if not node.role:
            message = f"{section_id}: {node.node_id} is unclassified"
            issues.append(_base._make_issue(section_id, "unclassified_node", message, node_id=node.node_id))
            _base._record_node_error(node, message)

        if node.role == "PRIMARY_RULE":
            continue

        if node.parent_id != parent.node_id:
            message = f"{section_id}: {node.node_id} is unattached"
            issues.append(_base._make_issue(section_id, "unattached_child", message, node_id=node.node_id))
            _base._record_node_error(node, message)

    return issues


def _walk_json(obj: object, path: str, out: list[dict[str, str]]) -> None:
    if isinstance(obj, str) and obj.strip():
        out.append({"text": obj.strip(), "anchor": f"jsonpath:{path}"})
    elif isinstance(obj, dict):
        for key, value in obj.items():
            _walk_json(value, f"{path}.{key}", out)
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            _walk_json(value, f"{path}[{index}]", out)


def _parse_with_validation(
    section_index: int,
    text: str,
    anchor: str,
    node_start_index: int,
) -> tuple[list[StructureNode], int, list[StructureValidationIssue], bool]:
    try:
        nodes, next_index = _base._parse_section(
            section_index,
            text,
            anchor,
            node_start_index,
            aggressive=False,
        )
    except ValueError as exc:
        _base.logger.info("Atomicity guard triggered for section %s: %s", section_index, exc)
        nodes, next_index = [], node_start_index

    validation_issues = _base._validate_sections(nodes)
    fragment_only_section = _base._is_non_substantive_fragment(text)
    primary_rule_text = _has_primary_rule_text(text)
    if not nodes and (fragment_only_section or not primary_rule_text):
        return nodes, next_index, [], False
    if not nodes:
        validation_issues = [
            _base._make_issue(
                f"section-{section_index:04d}-00",
                "missing_primary",
                f"section-{section_index:04d}-00: parser produced no visible atomic PRIMARY_RULE",
            )
        ]
    if not validation_issues:
        return nodes, next_index, [], False
    if fragment_only_section or not primary_rule_text:
        return nodes, next_index, [], False

    try:
        reparsed_nodes, reparsed_next_index = _base._parse_section(
            section_index,
            text,
            anchor,
            node_start_index,
            aggressive=True,
        )
    except ValueError as exc:
        _base.logger.warning(
            "Aggressive atomicity guard triggered for section %s: %s",
            section_index,
            exc,
        )
        reparsed_nodes, reparsed_next_index = [], node_start_index

    reparse_issues = _base._validate_sections(reparsed_nodes)
    if not reparsed_nodes and (fragment_only_section or not primary_rule_text):
        return reparsed_nodes, reparsed_next_index, [], False
    if not reparsed_nodes:
        reparse_issues = [
            _base._make_issue(
                f"section-{section_index:04d}-00",
                "missing_primary",
                f"section-{section_index:04d}-00: aggressive reparse produced no visible atomic PRIMARY_RULE",
            )
        ]
    if not reparse_issues:
        for node in reparsed_nodes:
            if node.validation_status == "valid":
                node.validation_status = "repaired"
        _base.logger.info("Aggressive hierarchy reparse succeeded for section %s", section_index)
        return reparsed_nodes, reparsed_next_index, validation_issues, True

    _base.logger.warning("Hierarchy validation still failing for section %s", section_index)
    return reparsed_nodes, reparsed_next_index, reparse_issues, False


_base.validateSection = validateSection
_base._walk_json = _walk_json
_base._parse_with_validation = _parse_with_validation

process_structure = _base.process_structure
