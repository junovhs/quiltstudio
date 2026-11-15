# ADR 001: Preserve actual work while the plan adapts

Status: Accepted. 2026-11-15. Related: ISS-01, ISS-03, ISS-06, ISS-08.

## Context
The maker starts with approximate dimensions, cuts batches as needed, and makes adjoining strips fit the blocks she has actually sewn. The creator explicitly requires this workflow alongside precise planning.

## Decision
Distinguish flexible overall targets, explicit size locks, and measured physical occurrences. Record outer dimensions with their seam state. Isolate a measured occurrence from its reusable block definition. Reject adjustments that resize existing measured work. Offer a next-strip helper whose cut length follows the joining edge; keep global cut lists for advance planning.

## Why and alternatives
Requiring all cuts upfront conflicts with the reported workflow. Globally updating every copy from one measurement rewrites unrelated physical pieces. The chosen approach keeps practical judgment with the maker and makes conflicts visible.

## Consequences
The initial implementation handles measurements at the quilt's top-level panel/block layout. Rows/columns can adapt where no existing measurement conflicts. More complex placements require layout changes. A standalone next-strip helper does not silently add fabric to the drawn design or yardage total. Seam state is explicit to avoid counting allowances twice. Per-piece construction tracking beyond these checkpoints remains in ISS-06.
