# Store screenshot compositor

This package composes existing captures into store screenshot layouts. It exports
those layouts per locale. It validates the deliverables. It does nothing else.

## Responsibilities

| Step     | Owner                                          | Effect  | Result                                        |
| -------- | ---------------------------------------------- | ------- | --------------------------------------------- |
| Capture  | `b2c/mobile-app-operation.capture-screenshot`  | observe | Raw pixels with capture provenance            |
| Compose  | `store-screenshot-compose/marketing-screenshots.compose-layout` | draft | One SVG per capture plus `provenance.json` |
| Export   | `store-screenshot-compose/marketing-screenshots.export-localized` | draft | One directory per locale with its own `provenance.json` |
| Validate | `store-screenshot-compose/marketing-screenshots.validate-deliverables` | observe | JSON report; exit 0 or exit 1 |
| Upload   | `asc screenshots` upload after founder approval | publish | Store listing change with provider readback   |

Capture happens before this package runs. Upload happens after a founder approves
the validated deliverables. The adapter refuses `--upload` and `--capture` with
exit code 2.

## Evidence rules

1. A composed asset is not capture evidence. Its `provenance.json` records
   `kind: composed-marketing-asset`, `notCaptureEvidence: true`, and
   `source: composited`. The mobile observation contract accepts only
   `capture.source: app-pixels`, so a composed asset cannot pass as a capture.
2. Every output links its source captures. Each `composedFrom` entry records the
   capture id, relative path, sha256, width, height, device, and source
   fingerprint. When the capture carries no fingerprint, the value is the string
   `unknown`. Never fill it in.
3. The compose step verifies each capture before it renders. The bytes must hash
   to the declared sha256. The PNG or JPEG header must report the declared width
   and height. A mismatch stops the run before any file is written.
4. `composedAt` comes from `--now`. The adapter never reads the clock. The same
   inputs and the same `--now` value produce the same bytes.
5. The validate step re-reads everything. It fails on a missing capture, a sha256
   mismatch, an output outside the wells table, an SVG whose header disagrees
   with its declared size, and a missing or incomplete `provenance.json`.
6. A wells table marked `partial` yields a warning in every report. Its wells are
   fixture dimensions, not store wells. Do not treat a pass against a partial
   table as store readiness.
7. Validation proves the deliverables are consistent. It does not prove design
   acceptance, store acceptance, or that the app displayed the state shown.

## Limits

- No capture. The adapter never launches an app or reads a device.
- No upload. The adapter never contacts a store or a provider.
- No raster rendering. Outputs are SVG files that reference the capture files.
- No network, no subprocess, no package code beyond Node built-ins.
- The tuck showcase captures carry no source fingerprint. Provenance built from
  them records `sourceFingerprint: unknown`.
