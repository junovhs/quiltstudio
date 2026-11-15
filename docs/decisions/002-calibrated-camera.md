# ADR 002: Local camera measurement with a visible reference

Status: Accepted. 2026-11-15. Related: ISS-02, ISS-05, ISS-08.

## Context
The user requests live camera edge detection and measurement and explicitly accepts a ruler in the image. The deployment target is an iPhone PWA.

## Decision
Use rear-camera frames or imported photos. Suggest fabric outlines locally, allow point correction, and calibrate using two ruler ticks for overhead photos or four reference corners with known rectangular dimensions for perspective correction. Freeze a frame before accepting a measurement; never change the quilt based on a moving live estimate. Preserve manual entry and photo fallback.

## Why and alternatives
Native measurement apps can use ARKit tracking and, on compatible hardware, depth. The PWA implementation uses ordinary camera frames and known scale. Guessing inches from an uncalibrated monocular image is not grounded. A native-only application would change the agreed delivery architecture. Manual entry alone would not fulfill the camera request.

## Consequences
The detector assumes a contrasting, unobstructed background and offers suggestions, not guaranteed segmentation. Patterned edges, wrinkles, lens distortion, and calibration error can affect measurements. Two-point ruler calibration does not correct arbitrary camera tilt. Geometry and synthetic detection are automated-testable; physical accuracy remains a separate real-device issue. Photos remain on the device, and no remote model is required.

## Evidence
- [Apple ARKit scene depth](https://developer.apple.com/documentation/arkit/arframe/scenedepth)
- [OpenCV planar homography](https://docs.opencv.org/4.13.0/d9/dab/tutorial_homography.html)
- [Web camera API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
