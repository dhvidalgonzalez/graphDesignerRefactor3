# Extensible analysis architecture

## Registry-driven UI

`src/domain/analysis/analysisRegistry.js` is the frontend catalogue. Each study declares its label, unit cost, default options, result mode and overlay capability. The analysis panel renders fields from the selected type rather than assuming power flow.

## Common orchestration contract

The React client sends a semantic request containing the diagram, base operating case, analysis type and serialized options. The Amplify orchestrator reads the synchronized document from S3, validates it, applies operating cases and writes input schema version 2.

```json
{
  "schemaVersion": 2,
  "studyId": "study-id",
  "analysisType": "CONTINGENCY_N_1",
  "analysisOptions": {},
  "electricalModel": {},
  "scenarios": []
}
```

Only the operating-case sweep uses `scenarios`; every scenario includes a fully applied electrical model so the worker remains independent from React and Amplify internals.

## Result views

A study can contain one or several network states. `analysisResults.js` exposes all of them as a common list of views:

- AC/DC: one network view.
- N-1: base case plus each converged outage.
- Case sweep: one view per converged operating case.
- Loadability: last acceptable state and first limiting state.

The selected view drives the canvas, result tables and component inspector.

## Overlay layout

Result labels are not part of the electrical model. Their offsets are stored in `AnalysisStudy.resultLayoutJson` through `saveAnalysisResultLayout`; local storage is used as a resilient cache. Moving a label therefore does not alter the diagram storage version or invalidate the study.

## Future studies

A future analysis should add:

1. A frontend registry definition and option editor.
2. Type-specific validation in the orchestrator.
3. A solver module registered in its dispatcher.
4. A result-view adapter and optional component parameter sections.

Short-circuit, unbalanced power flow and protection coordination remain disabled until the component model includes sequence, grounding and protection data.
