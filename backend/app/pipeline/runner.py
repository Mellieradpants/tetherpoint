"""Pipeline runner: orchestrates layers in locked order."""

from __future__ import annotations

from app.input.handler import process_input
from app.meaning.handler import process_meaning
from app.origin.handler import process_origin
from app.output.handler import assemble_output
from app.schemas.models import AnalyzeRequest, PipelineError, PipelineResponse
from app.selection.handler import process_selection
from app.structure.handler import process_structure
from app.verification.handler import process_verification


def run_pipeline(request: AnalyzeRequest) -> PipelineResponse:
    """Execute the locked 7-layer pipeline:
    Input → Structure → Selection → Meaning → Origin → Verification → Output
    """
    errors: list[PipelineError] = []

    # 1. Input
    input_result = process_input(request.content, request.content_type)
    if input_result.parse_status == "error":
        errors.append(PipelineError(
            layer="input",
            error="; ".join(input_result.parse_errors) or "Parse failed",
            fatal=True,
        ))

    # 2. Structure
    structure_result = process_structure(input_result)
    if structure_result.node_count == 0 and input_result.parse_status == "ok":
        errors.append(PipelineError(
            layer="structure",
            error="No nodes extracted from valid input",
            fatal=False,
        ))

    # 3. Selection
    selection_result = process_selection(structure_result)

    # 4. Meaning
    meaning_result = process_meaning(
        selection_result.selected_nodes,
        run=request.options.run_meaning,
    )
    if meaning_result.status == "skipped" and request.options.run_meaning:
        errors.append(PipelineError(
            layer="meaning",
            error=meaning_result.message or "Meaning layer could not execute",
            fatal=False,
        ))

    # 5. Origin
    origin_result = process_origin(
        input_result,
        run=request.options.run_origin,
    )

    # 6. Verification
    verification_result = process_verification(
        selection_result.selected_nodes,
        run=request.options.run_verification,
    )

    # 7. Output
    output_result = assemble_output(
        input_result,
        structure_result,
        selection_result,
        meaning_result,
        origin_result,
        verification_result,
    )

    return PipelineResponse(
        input=input_result,
        structure=structure_result,
        selection=selection_result,
        meaning=meaning_result,
        origin=origin_result,
        verification=verification_result,
        output=output_result,
        errors=errors,
    )
