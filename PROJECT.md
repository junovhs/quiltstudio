# Project 001 — Floral medallion quilt

**Status:** planning · **Units:** inches, finished unless marked · **Seam allowance:** ¼″

The designer app (src/, deployed to Cloudflare Pages) draws the quilt from simple shapes and calculates
block sizes, the cut list, yardage and sewing order from a handful of size inputs.
This file records the design decisions behind it.

## Decisions

- Symmetric medallion: royal-blue floral, chocolate brown, cream, black.
- The outer checkerboard edge is **purchased checkerboard binding fabric**. It is not pieced and
  does not add to the quilt's size.
- Four equal floral border strips. Left/right strips go on first; the top/bottom strips get a
  floral square sewn to each end.
- Every part of the design is a rectangle on a grid, filled one of four ways:
  solid, diagonal split (HST / HRT), flying goose, or n×n checkerboard.

## Blocks (default sizes)

| Block | Make | Finished | Grid | Made of |
|---|---:|---|---|---|
| Corner | 4 | 9 × 9 | 2¼ / 4½ / 2¼ | 4 brown squares, 4 floral geese with cream wings, nine-patch (1½″ squares) |
| Side | 4 | 20 × 9 | bands 2¼, middle row 4½ | floral band, 2 HRTs + nine-patch + 2 mirrored HRTs, floral band |
| Center star | 1 | 20 × 20 | 5 / 10 / 5 | 4 floral squares, 4 floral geese with brown wings, 4×4 checkerboard (2½″ squares) |
| Floral border | — | 4½ wide | — | 4 strips 38 long + 4 squares 4½ |

9 + 20 + 9 = 38 center, + 4½ + 4½ border = **47 × 47 finished**.

Geese are kept at exactly 2:1 (4½ × 2¼, 10 × 5) so stitch-and-flip gives sharp points.

## Open questions

- The side-block triangle units come out 4½ × 3⅞ (not square), so they are half-rectangle
  triangles: use an HRT ruler or paper-piece them.
- Fabric directionality of the floral print.
- Backing and batting choices.
