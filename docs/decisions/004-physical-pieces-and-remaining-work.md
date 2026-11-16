# ADR 004: Track physical pieces through an adaptive making workspace

Status: Accepted, November 15, 2026. Extends ADR 001.

## Context

The maker cuts batches when needed, fits the next strip to the block that actually exists, and lets the overall quilt grow or shrink. A calculator disconnected from the drawn quilt cannot keep future cuts, fabric estimates, and exports coherent.

## Decision

Give layout occurrences stable IDs and visible labels. Record planned, cut, sewn, and measured states against their geometry and content. Guard edits that would silently change physical work. Allow explicitly reopening a checkpoint to correct a record. Preserve unaffected progress when future geometry changes.

Use one visual making workspace for selecting a batch, recording actual dimensions, reviewing changed neighbors, inserting or linking a joining strip, and combining sewn neighbors into an assembly. Archive the component measurements when an assembly replaces them. Offer expansion of an unmade compound panel into independently tracked children while preserving geometry and orientation. Rejoining those children creates a new measurable assembly.

Derive remaining cuts and estimates from unmade occurrences. Label whole-design references separately. Printable making plans carry progress, remaining cuts, assumptions, construction warnings, and technique guidance.

## Why and alternatives

Stable occurrence identity matches real fabric and avoids confusing one repeated block with every copy. Pure design-level checkmarks lose this distinction. A standalone strip calculator was rejected as the final experience because its output did not change the design or reserve fabric. A general physical constraint solver is unnecessary for this release; the existing rectangular layout provides explicit, testable boundaries.

## Consequences

Cut or measured work can prevent an edit; the maker receives an explanation instead of silently rewritten measurements. Inserted strips follow a grid line and may add several segments; preview their count, geometry, and quilt size before applying. Only compatible rectangular neighbors can form an assembly. Some advanced constructions need an independent method; the app surfaces that boundary. Checkpoints remain optional, but remaining-work totals depend on the maker recording progress.

Verification: `tests/making.test.ts` checks identity, protection, remaining cuts, inserted strips, measurement updates, assembly history, selective progress, and expansion under every rotation/reflection.
