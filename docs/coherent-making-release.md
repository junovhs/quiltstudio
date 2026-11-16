# Coherent making release

November 15, 2026. Integrated follow-through to the product review and first adaptive-camera release.

## User outcome

Bring or discover a quilt idea, make it the intended size, then make batches while keeping the digital plan aligned with the fabric on the table. The maker can accept a changed overall size and preserve already-cut or sewn work.

## Delivered

- Guided welcome and persistent Idea → Design → Size → Make & adapt navigation.
- Local image crop, palette/grid extraction, reviewed editable patchwork draft, tracing quilt, and saved reference overlay.
- Familiar-unit proportional resizing with separate exact/flexible sizing and material-width settings.
- Visual piece map with stable labels and planned/cut/sewn/measured progress. Matching batches, smaller batches within compound panels, and protection for physical work.
- Camera/photo estimates with ruler calibration, editable outlines, and a four-corner perspective reference; results flow into the selected piece's measurement checkpoint.
- Actual dimensions update affected unmade neighbors. Joining strips become real geometry, cuts, and fabric estimates; preview shows the complete grid-line effect.
- Compatible sewn neighbors combine into an assembly with archived component measurements and a new measurement checkpoint.
- Remaining cuts, materials, construction checks, technique guidance, and a printable making-plan download. Whole-design diagrams clearly distinguish themselves from remaining work and cutting templates.
- iPhone viewport/keyboard/lifecycle shell patterns, responsive making controls, local-save failure feedback, and first-install precaching of the actual hashed app build.

## Verification

`npm test`: 25 passing tests. Coverage includes physical-work guards, stable identities, actual measurements, remaining counts, strip insertion and yardage, joining and archives, progress reconciliation, image drafting, export escaping, rotated/reflected panel expansion, camera geometry, and offline installation success/failure.

`npm run check`: zero errors; existing unused-CSS warnings in ContextBar and Sizes. `npm run build`: succeeds, with the bundle-size advisory.

Browser verification: reference example to editable 48-inch quilt; selected batch cut/sewn; actual 8-inch outside measurement; inserted joining strip; joined assembly; reload retains progress; remaining cuts omit completed fabric; making-plan download contains current status and remaining work. Checked the 390 × 844 layout and expanding a compound assembly into independent smaller batches without changing its design.

## Boundaries

Camera measurements remain estimates. Physical accuracy, installed-iPhone camera permissions, background/resume, and real keyboard behavior need device validation (ISS-05). Browser and synthetic tests do not establish a cutting tolerance.

Image drafts interpret a chosen regular grid using solid and half-square-triangle pieces. Tracing supports other references; this is not universal AI reconstruction. Seam-method warnings remain visible, including non-square triangle budgets and constructions requiring a separate method. Assembly adaptation uses the rectangular grid rather than an unrestricted sewing constraint solver.

Issue coverage: ISS-01 through ISS-04 and ISS-06 through ISS-09 are implemented in the integrated flow; ISS-05 remains the physical-device validation task. Issues are local Ishoo records, not GitHub issues.

Decisions: [physical work and remaining cuts](decisions/004-physical-pieces-and-remaining-work.md), [reference-to-editable design](decisions/005-reference-to-editable-design.md). Product evidence and the seven-element StoryBrand worksheet remain in [the product review](../PRODUCT_REVIEW.md).
