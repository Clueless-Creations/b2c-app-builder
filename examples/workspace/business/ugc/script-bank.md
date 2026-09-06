# UGC Script Bank

Status: template until the first judged script lands.

One row per script. A script earns filming or generation spend by surviving the judge panel (`ugc-creator-engine.md`, Script Bank And Judge Panel). The Judge verdict cell must start with `passed`, `survived`, or `failed` (`passed — <detail>` form); the checker parses the prefix, so a negated pass does not read as a pass. A UGC-family manifest asset in `growth/content-assets/manifest.json` must point its `script_id` at a row in this file (`ugc/script-bank.md#<Format ID>`). `check:content-assets` verifies the Format ID cell matches, and at a done-tier asset status it also requires this row to hold real (non-placeholder) hook/script text and a passing verdict.

| Format ID | Hook | Script | Judge verdict | Judge notes | CTA mechanic | Product insertion |
| --- | --- | --- | --- | --- | --- | --- |
| FMT-001 | replace with the surviving hook line | replace with the surviving script text | pending | one note per judge lens: pacing, vocabulary, idea strength, structure | app open or store page | where the product appears and why the moment is truthful |
