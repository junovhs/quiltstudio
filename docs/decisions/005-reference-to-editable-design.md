# ADR 005: Make visual references editable through a reviewed draft

Status: Accepted, November 15, 2026.

## Context

The original job is to turn an AI image or rough drawing into structured geometry that can be refined and measured. Inspiration, interpretation, and construction are separate steps. The user wants visual accessibility and a delightful route into making.

## Decision

Offer three entry routes: discover an idea, bring a picture, or start with simple panels. Keep Idea → Design → Size → Make & adapt visible in the editor. Preserve existing projects and familiar design tools.

For a picture, let the maker crop, choose a grid and palette, review an editable solid/half-square-triangle draft, and explicitly accept it into a new quilt. Provide a tracing quilt and attachable reference overlay for images that need interpretation by the maker. Keep processing local. Store the reduced reference with the project, including its normal save/export/sync paths.

## Why and alternatives

A deterministic local draft is fast, private in processing, and works without a model provider. Claiming universal picture-to-pattern conversion would hide uncertain geometry and construction. Overlay-only import would not satisfy the request to begin with typed pieces, while automatic interpretation without review could make a visually plausible but unintended design.

## Consequences

Grid drafts suit regular patchwork; arbitrary sketches need tracing and editing. Source images increase project size and are included when projects are exported or synced, which the import UI discloses. Construction checks remain visible after import. StoryBrand informs the guided path and promise, while the maker retains control over both design and process.

Verification: reference extraction tests cover palette/geometry and cut derivation; browser verification covers the illustrated reference → editable quilt → making journey.
