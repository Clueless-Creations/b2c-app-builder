# Store screenshot compositor

This contributor package wraps a screenshot compositor as three distinct operations: compose a layout, export it per locale, and validate the deliverables. It composes captures that already exist. It never captures and it never uploads. Every composed asset carries provenance that links it to its source captures, so a composed asset cannot pass as capture evidence.

## Responsibilities

| Step     | Owner                                                                  | Effect  | Proof it leaves                                            |
| -------- | ---------------------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| Capture  | `b2c/mobile-app-operation.capture-screenshot`                          | observe | Raw pixels, `capture.source: app-pixels`, device and build |
| Compose  | `store-screenshot-compose/marketing-screenshots.compose-layout`        | draft   | One SVG per capture and `provenance.json`                  |
| Export   | `store-screenshot-compose/marketing-screenshots.export-localized`      | draft   | One directory per locale, each with `provenance.json`      |
| Validate | `store-screenshot-compose/marketing-screenshots.validate-deliverables` | observe | JSON report; exit 0 on pass, exit 1 on any failure         |
| Upload   | `asc screenshots` upload after founder approval                        | publish | Store readback                                             |

The adapter refuses `--upload` and `--capture` with exit code 2 and a JSON refusal.

## Files

| File                             | Resource kind | Purpose                                                              |
| -------------------------------- | ------------- | -------------------------------------------------------------------- |
| `extension.yaml`                 | manifest      | Capability, three operations, three command implementations, recipe  |
| `compose.mjs`                    | adapter       | Dependency-free Node 22 script with the three modes                  |
| `compositor.md`                  | knowledge     | Responsibility split and evidence rules; also the role prompt        |
| `pack.yaml`                      | catalog-pack  | One workflow per operation in a pack-local domain                    |
| `templates/device-well.svg.tmpl` | asset         | SVG layout template with named placeholders                          |
| `wells.json`                     | asset         | Accepted output sizes; marked `partial`, see limits                  |
| `copy.sample.json`               | asset         | Sample per-locale headlines for the tuck showcase captures           |
| `schemas/*.json`                 | schema        | Input, output, and evidence schemas for each operation               |

## Commands

Compose from a capture manifest. The manifest lists each capture with its path, sha256, width, height, device, and source fingerprint. Paths resolve against the manifest.

```sh
node compose.mjs compose \
  --captures captures/captures.json \
  --template templates/device-well.svg.tmpl \
  --wells wells.json \
  --locale en-US \
  --copy copy.sample.json \
  --now 2026-09-05T00:00:00Z \
  --out composed
```

Export the composed directory per locale. Each locale gets `composed/locales/<locale>/` with its own SVG set and `provenance.json`.

```sh
node compose.mjs export --composed composed --locales en-US,es-ES --copy copy.sample.json
```

Validate the composed directory and every locale directory under it.

```sh
node compose.mjs validate --composed composed --wells wells.json
```

Every mode writes one JSON report to stdout. Exit 0 means the mode completed and, for validate, that every check passed. Exit 1 means a failed check or a bad input; the report names the code. Exit 2 means the adapter refused an out-of-scope request.

Capture manifest shape:

```json
{
  "kind": "capture-manifest",
  "captures": [
    {
      "captureId": "native-home",
      "path": "native-home.png",
      "sha256": "3111c52c7e523ff7f1c6bf8d4707b1501094227f3028e6c249240932c3245a0d",
      "width": 1206,
      "height": 2622,
      "device": "ios-simulator",
      "sourceFingerprint": null
    }
  ]
}
```

A capture may name a `well` id. Without one, the well with the same width and height is selected.

## Evidence rules

1. `provenance.json` records `kind: composed-marketing-asset`, `notCaptureEvidence: true`, and `source: composited`. The mobile observation contract accepts only `capture.source: app-pixels`. A composed output fails that contract.
2. Each output records `composedFrom` with the capture id, relative path, sha256, width, height, device, and source fingerprint. A capture without a fingerprint records the string `unknown`.
3. Compose re-hashes every capture and reads the PNG or JPEG header before it renders. A sha256 or dimension mismatch stops the run before any file is written.
4. `composedAt` comes from `--now`. The adapter never reads the clock. The same inputs and the same `--now` produce the same bytes.
5. Validate fails on: a missing `provenance.json`, a missing field, a missing capture, a capture sha256 mismatch, an output outside the wells table, an output whose SVG header disagrees with its declared size, an output whose bytes changed, and an output that no longer references its source capture.
6. Validate re-verifies the template sha256 when the template is reachable. When it is not, the report carries a warning and the sha256 is not claimed.
7. A pass proves that the deliverables are consistent with their sources. It is not design acceptance, store acceptance, or proof that the app displayed the state shown.

## Limits

- No raster rendering. Outputs are SVG files that reference the capture files by relative path. Rasterization for a store packet is separate work.
- No upload. Upload stays with the asc route after founder approval.
- No capture. Capture belongs to `b2c/mobile-app-operation.capture-screenshot`.
- No network, no subprocess, no package code beyond Node built-ins.
- `wells.json` is marked `partial`. No exact store well size is citable from repository knowledge; `knowledge/store/apple-signing-release.md` records minimum native widths only, and `knowledge/store/store-console-workflow.md` defers exact sizes to Apple or to `asc screenshots sizes`. The shipped wells are the recorded dimensions of the tuck showcase captures and are accepted for that fixture only. Every report repeats this warning.
- The tuck showcase captures carry no source fingerprint. Provenance built from them records `sourceFingerprint: unknown`. That limitation is carried, not hidden.
- Fonts are not embedded. The sample copy names a host font family with license `unknown`.

## Verification

`checks/verification/fixtures/screenshot-compose.fixtures.ts` snapshots this package into a temporary store, runs the pinned `compose.mjs` through `node` without a shell, and proves: the tuck showcase manifest hashes match the capture bytes; compose writes one SVG per capture with provenance that links the sources; validate passes on intact output and fails on a corrupted capture, a missing `provenance.json`, and a wrong dimension; `--upload` and `--capture` exit 2; export produces one directory per locale; and a composed output is rejected by `mobileObservationSchema` while a genuine capture record passes. Each adapter report is checked against the output schema its operation declares.

```sh
npx tsx checks/verification/fixtures/run.ts screenshot-compose
```

The fixture reads `examples/tuck/showcase/` and never modifies it.
