# Visual And Motion Production

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## Higgsfield Visual And Motion Production

Purpose: produce launch visuals, mockups, icons, mascots, animations, demo videos, screenshot art, and ad creative from the locked design system.

Use after `DESIGN.md` exists or after a provisional design direction is explicitly labeled `draft`.

Access:

- Higgsfield is a paid/account-gated visual production path. If unavailable, ask before using Remotion, local HTML/CSS/SVG/canvas, founder-owned assets, public-domain assets, or real app screenshots as the free fallback.

Local skill routing:

- `higgsfield-product-photoshoot` for product/brand images, hero banners, lifestyle scenes, Pinterest pins, social carousels, and static ad creative packs.
- `higgsfield-generate` for app icons, general images, text-forward graphics, UI illustrations, video generation, image-to-video, Marketing Studio ads, and Virality Predictor analysis.
- `higgsfield-soul-id` for face-faithful founder/presenter/avatar identity when owned photos are available and the user approves.
- `higgsfield-marketplace-cards` when a marketplace/listing visual card is the target output.

Model intent:

- GPT Image 2: icons, graphic UI imagery, launch visuals, text-forward concepts.
- Nano Banana 2/Pro: mascots, character sheets, stylized references, expressive guide states.
- Soul Location: environment/background art, paywall scene backgrounds, empty-state art, and abstract scenes — prompt-only, no reference photo required.
- Soul Cast: text-only characterful mascot or persona generation when no reference photo is available.
- Seedream 4.5: vector/flat-illustration sequences and face-anchored complex scene edits.
- Seedance 2.5 — confirm the current model id via the `higgsfield-generate` skill: 4-15 second product demos, onboarding animation clips, image-to-video, multi-shot motion, and believable-person UGC video. Seedance 2.5 is the first version whose skin texture reads as human on a phone screen. For a clip that must pass as a real person, do not use an older Seedance without flagging the downgrade.
- Marketing Studio: UGC ads, presenter videos, product demos, unboxing/review formats, hooks/settings/avatars/products.
- Virality Predictor: score finished demo/ad/onboarding videos for hook, attention, retention, and distraction risk.

Media preflight: `media_upload` + `media_confirm` are REQUIRED before Soul training (`--image`), Virality scoring (`--video`), ad-reference creation, and custom avatar creation. Run both steps and confirm the upload ID before proceeding.

Session discovery (read-only, free): before generating, use `show_characters`, `show_medias`, `show_generations`, `show_reference_elements`, `presets_show`, and `models_explore` to reuse existing Soul characters, uploaded media, prior outputs, brand/style references, and presets instead of re-uploading or re-generating. For a multi-app account, call `select_workspace` first so Soul identities, avatars, and product entities do not bleed across brands. For category-specific modes not listed above (e.g. `virtual_try_on` / `ugc_virtual_try_on` for apparel, `closeup_product_with_person` for beauty, `conceptual_product`, `wild_card`), consult the `higgsfield-generate` and `higgsfield-product-photoshoot` skill mode/model catalogs.

Format caution — Veo 3.1: hard format limits are 16:9 or 9:16 only, and durations 4/6/8s only. Do not use Veo 3.1 for non-standard App Preview ratios or durations outside those values.

Ad-reference caution: ad references (`--ad-reference-id`) are MUTUALLY EXCLUSIVE with `--hook_id`/`--setting_id` at generation time. Pick reference-driven OR composed-from-blocks, never both in the same call.

Cost-Tier Discipline: by default, use the quality-first model for each task (matching the upstream `higgsfield-generate` skill default). The cheap-first z_image → production-model path (Recipe 6 below) is a spend-reduction option offered ONLY at the [`paid-tool-routing.md`](../../operations/paid-tool-routing.md) spend-confirmation prompt, never applied silently. This intentionally overrides the upstream quality-first default because this skill is spend-sensitive and founder-gated.

Rules:

- Put `DESIGN.md` constraints into the generation brief: palette, typography mood, shapes, texture, motion energy, banned aesthetics, and intended surface.
- All generated assets must be embedded or referenced in HTML proofs: `design/design-room.html`, `product/onboarding.html`, screenshot HTML, landing HTML, or ad-preview HTML.
- Label assets as `direction`, `draft`, or `production`.
- Do not present generated screenshots as real app functionality. Store screenshots must show truthful app UI and avoid unsupported claims, prices, or features.
- For animations, write the storyboard and reduced-motion fallback before generation, then verify the clip in layout.

## Product Ad Structure And Prompt Craft

Purpose: replace the `<hook + DESIGN.md brief>` placeholder used across the Chained Recipes below with a concrete structure, so a generated ad proves one specific feature instead of drifting into abstract mood with no UI on screen. Applies to `--prompt` text for polished, openly-an-ad output: `tv_spot`, product demos, hero ads, and any Remotion ad/social composition. For the UGC-family modes (`ugc`, `ugc_how_to`, `ugc_unboxing`, `product_review`), use the **UGC Realism Prompt Structure** below instead. The same applies to any clip that must read as a real person filming themselves. The two registers are opposites. A mix fails as both.

Before writing the prompt, fix two things:

- **The reference.** Which screenshot, icon, or UI state is actually in frame, and its real shape, color, and layout — the prompt must not contradict it.
- **The one claim.** What the feature is, what it does, and why it is worth opening the app for. One claim per ad; do not stack three features into one 15-second cut.

Four-beat structure (scale the timings below to the recipe's `--duration`; ratios assume a 15s ad):

1. **Identification hook (0–2s).** The app or feature is on screen in a clean hero shot before anything else happens. Never open on abstract particles, smoke, or a transition effect with no real UI visible — hiding the product for the first two seconds loses the viewer who would have recognized it.
2. **Usage / function (2–8s).** Show the feature being used, or the screen changing state, in a way that makes the mechanism obvious without narration — a tap, a result appearing, a before/after.
3. **Creative escalation (8–12s).** Turn the benefit into one memorable image. Stay anchored to the real product here — escalate the feeling, not the feature list.
4. **Final hero shot (12–15s).** End clean, on the app's actual icon or screen, matching `DESIGN.md` palette and motion energy.

Consistency and accuracy rules — apply regardless of which tool renders the ad:

- Keep exact screens, copy, icons, and proportions from the real app; do not invent functionality, ratings, or claims the product does not have. This is the same truthful-UI rule the block above states for store screenshots — it applies to ad creative too.
- Cut on action (hard cut, match cut, cut on motion) between beats. Avoid morphing/dissolve transitions mid-cut — they make the product illegible at the exact moment a viewer would recognize it.
- Match the beat to the feature type: a utility feature reads best as a before/after; a creative/output feature needs the result visible; a habit/streak feature needs the moment of use shown, not just the icon.

Fill the `--prompt` argument in Recipe 1 step 8 and Recipe 2 step 4 with the structure that matches the mode. `tv_spot` takes the four beats above. UGC-family modes take the **UGC Realism Prompt Structure**. Write the prompt for the specific feature and the current `DESIGN.md` tokens. Then discard the placeholder text.

### Master Prompt Template

A literal starting point for the four-beat structure above — use this as the `--prompt` body when a call needs the full text instead of being composed from scratch. Attach the app's actual screenshot/icon references as the generation input; the block below is the text prompt only. Keep the structure and rules intact; only the bracketed brief content should change per app/feature.

```
Use all attached images as references for one product commercial.
Create a highly creative premium product advertisement for the exact product shown in the reference images.
Format: [match the --aspect_ratio of the generation call this prompt is passed to — 9:16 vertical for Recipe 1 and every Recipe 2 mode below; 16:9 only if that specific call requests horizontal].
Duration: maximum 15 seconds.
Goal: make the viewer immediately understand what the product is, what it is used for, why it is desirable, and what emotional/visual world belongs to it.

Important:
This must be a clear advertising creative, not an abstract VFX film. Do not begin with random dust, ice, smoke, particles, explosions, liquid, or abstract textures unless the actual product is visible and understandable in the same moment. The product must appear clearly within the first 1-2 seconds.

First, silently analyze the attached references:
For a mobile app reference (screenshot, icon, or App Store listing) — this skill's primary case — identify the screen or feature shown, its controls, the state transition or action it performs, its color and shape language, target user, desired outcome, and emotional promise. Do not infer packaging, physical materials, or ingredients for an app reference. For a physical-product reference (used only with the Market Category Modifiers below, outside this skill's core scope), identify the main product, its packaging, shape, label, color, material, ingredients, usage ritual, target customer, desired result, and emotional promise.

Universal creative rule:
Build the concept from the product itself. The ad can be surreal, cinematic, luxurious, playful, futuristic, sensory, scientific, mythic, or dramatic, but it must always stay anchored to the real product and its use.

Ad structure:
0-3 seconds — PRODUCT IDENTIFICATION HOOK:
Open with the product clearly visible in a premium hero shot.
3-8 seconds — USAGE / FUNCTION / TRANSFORMATION:
Show the product being used or interacting with its world in a way that makes its purpose obvious.
8-12 seconds — CREATIVE ESCALATION:
Turn the product's benefit into a memorable cinematic image.
12-15 seconds — FINAL HERO SHOT:
End with a clean, premium final product shot.

Camera:
macro close-ups for texture, clean product hero shots for packaging, hands-in-action for usage, slow luxury push-ins for premium feeling, fast precise cuts for performance.

Lighting:
soft clean light for hygiene, glossy reflections for premium, rim light for silhouette, warm light for comfort, clinical light for precision, dramatic contrast for power.

CRITICAL — Editing:
Do not use morphing transitions. Every cut must be a clean editorial transition: hard cut, match cut, cut on motion, whip-pan cut, or product close-up cut.

Product accuracy:
Keep the product visually consistent with the reference image. Preserve its main shape, colors, materials, proportions.
```

### Market Category Modifiers

Append the matching row's modifier text to the end of the Master Prompt above; replace bracketed placeholders with the app's real feature detail. For this skill's actual output — a mobile app — Tech / Electronics (functional/setup features) and Everyday Products (single-benefit features) are the nearest fit; keep the remaining rows for a founder producing ecommerce or physical-product ad creative outside this skill's core app-launch scope, or for an app feature that genuinely behaves like one of these categories (e.g. a fitness app's workout feature under Sports / Fitness).

| Category                 | What the video must prove                                 | Modifier text                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tech / Electronics       | Setup, response, or functional change                     | Show [main feature] during realistic use. Include an interaction shot, a visible response, and a close-up of [physical detail, or for an app the specific UI control]. Keep interfaces, controls or ports (whichever the reference actually has), proportions, and behavior accurate. |
| Skincare / Beauty        | Texture, application, finish, or routine                  | Show the real texture, amount, application, and cosmetic finish of [product]. Use soft light and clean macro details. Do not invent ingredients, medical effects, or unrealistic transformations.                                                                                     |
| Automotive / Accessories | Installation, fit, visibility, or before/after appearance | Show where [product] attaches, how it fits, and the off/on or before/after difference. Keep scale, mounting position, reflections, and light behavior realistic.                                                                                                                      |
| Fashion / Apparel        | Fit, silhouette, fabric behavior, and construction        | Show [product] on the body from useful angles. Include texture, seams, fastening details, and movement demonstrating [stretch, support, or drape]. Preserve its real cut, color, and material.                                                                                        |
| Food / Drink             | Preparation, texture, serving moment, and appetite appeal | Show [product] being prepared, opened, served, or consumed realistically. Use macro texture and appetite cues. Add steam, splashes, or ingredients only when physically relevant.                                                                                                     |
| Home / Lifestyle         | Scale, setup, spatial use, and everyday benefit           | Establish the product's real size in a believable environment. Show setup, interaction, and the change created by [main benefit]. Preserve its dimensions and construction.                                                                                                           |
| Sports / Fitness         | Fit, grip, resistance, support, or movement               | Show [product] during its intended activity. Use close-ups of grip, material, contact points, and movement to demonstrate [specific function]. Avoid unsupported claims.                                                                                                              |
| Everyday Products        | One simple problem and one visible payoff                 | Use one sequence: [problem] → [product action] → [visible result]. Show the product immediately and increase perceived value without disguising what it is.                                                                                                                           |

## UGC Realism Prompt Structure

Purpose: the prompt rules for a clip that must read as a real person filming themselves. This applies to the UGC-family Marketing Studio modes (`ugc`, `ugc_how_to`, `ugc_unboxing`, `product_review`) and to Recipe 7. The target is not a good ad. The target is a moment that accidentally became content. The viewer must not identify the clip as an ad. The viewer must not identify the clip as AI. Polish causes both failures. Maximize stop rate, watch-through, and believability. Minimize creator energy, ad delivery, and narrative polish.

**Script first.** The script keeps or loses the viewer. The model cannot fix a weak script. Seedance renders a weak script and a strong script with equal quality. Do not spend on UGC generation before the script survives the judge-panel loop in `ugc-creator-engine.md` (Script Bank And Judge Panel). If the hook would not stop a scroll, say so before you generate. If the script makes a claim the product cannot back, flag it. The truthful-UI rule above also applies to spoken claims.

Five realism principles. Every prompt encodes all five:

1. **Social context truth.** The person is mid-conversation, replying, or thinking out loud — never presenting. The clip always shows an implied reason for the recording.
2. **Imperfect presence.** Real posture, casual gestures, micro hesitation. No clean delivery. No punchlines.
3. **Thought-while-talking.** "like", "i don't know", trailing thoughts, one real pause. Spoken logic, not written logic.
4. **Alive environment.** Background motion, lighting inconsistency, room tone.
5. **No resolution.** End unresolved or interrupted. Never end on a payoff, a lesson, or a slogan.

### First-Frame Prompt (GPT Image 2 / Nano Banana)

One specific person in one specific place — invent the specifics and commit. Always stack the realism keywords. Each removed keyword moves the output toward the plastic AI look. Adapt the person and the place; keep the stack:

```
ultra realistic iphone front camera selfie, [specific person, age range] in [specific
lived-in place], [named light source — window left, lamp behind, afternoon light through
a windshield — never "good lighting"], real skin texture with visible pores, light
under-eye shadows, candid mid-sentence expression, eyes off lens, one hand raised talking
to camera, lived-in background with one imperfect detail, shallow depth of field,
authentic tiktok vlog aesthetic, no text, no captions, 9:16
```

### Video Prompt (Seedance 2.5, first frame as reference)

Feed the first frame in as the reference image. Write the prompt as a second-by-second shot breakdown. Do not write a vibe description. Scale the timestamps to the clip duration. Match the generation duration to the timestamps; a mismatch desyncs the delivery. Template:

```
subject: the person from the reference frame — same hair, same clothes, same place

camera: handheld front camera selfie perspective, chest-up framing, natural micro
shakes, 9:16

audio: clear phone-mic voice with light room tone, one ambient sound event, no music

00:00-00:03 — hook mid-sentence, as if we joined late: [hook line]
00:03-00:12 — natural blinks, one gaze break, one filler word, one micro pause, body
shifts once: [script body]
00:12-00:15 — CTA as an afterthought, trailing off, never a slogan: [cta line]

keep the skin texture, no beauty-filter look, lips synced
```

Behavioral beats: pick 2-3 per video. Vary the set for each video. Options: glance away, lean back, shrug, adjust phone grip, react to a sound, half-laugh at own sentence.

Rules that hold across a batch:

- Do not polish the script into ad copy. Imperfect beats polished. If a line sounds written, rewrite it until it sounds said.
- Give every video in a batch a different person, room, light source, and beat set. Repetition is the #1 tell.
- Generate at 720p first. Upscale only the take that survives review. A 720p clip costs a few dollars on current platforms. Prices and model access change fast. Verify live pricing at the `paid-tool-routing.md` spend confirmation.

**Converted-reference shortcut.** Use this when a UGC video already converted for a comparable product. Run the video through video analysis (`mcp__claude_ai_Higgsfield__video_analysis_create`, or Gemini as fallback). Ask for a 1:1 timestamped breakdown of everything on screen. The breakdown becomes the video-prompt skeleton. The judge-approved script goes in as the dialogue. The shortcut replaces the prompt text only. Seedance still needs a first-frame reference image, so the first-frame step still runs.

**Edit pass.** The generation is raw footage; treat it as footage. Cut the dead space at the start. Tighten every pause. Add captions. Put a sound under it. Edit it the same way a real creator's selfie video gets edited. Remotion (below) renders caption and cutdown variants reproducibly. A manual editor pass is acceptable at low volume.

**Believability test.** Before scale, show the finished clip to one real human who did not make it. If they identify it as AI or as an ad, the script is the usual cause. Return to the judge panel, not to the model settings. Record `passed — <detail>` or `failed — <detail>` in the manifest `believability` field; `check:content-assets` blocks a done-tier status without an explicit pass. Virality scoring (Recipe 3) still applies before paid distribution. The virality score measures attention, not believability. Run both.

## Higgsfield Chained Recipes

These are the canonical recipe bodies. Other files route to a recipe by name and add only their surface-specific note. Pick from this table; run only the matching recipe.

| Recipe                                                                                                         | Run when                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [1: Soul-Once Founder-Face Ads](#recipe-1-soul-once-founder-face-ads)                                          | the founder's own face should front ads or editorial content                                 |
| [2: App Store URL → UGC Ad Batch](#recipe-2-app-store-url--ugc-ad-batch-click-to-ad)                           | a live store listing exists and the ask is a batch of UGC-style ads from it                  |
| [3: Virality Closed Loop](#recipe-3-virality-closed-loop)                                                      | published clips need scoring and the next batch should learn from the winners                |
| [4: Master → All Platforms](#recipe-4-master--all-platforms-reframe--personal_clipper)                         | one master asset must fan out to every aspect ratio and platform cut                         |
| [5: Seasonal Restyle Refresh](#recipe-5-seasonal-restyle-refresh)                                              | existing creative needs a holiday or seasonal reskin without a new concept                   |
| [6: Cheap-First Direction](#recipe-6-cheap-first-direction-z_image--production-model)                          | direction is unproven — explore cheaply before spending on a production model                |
| [7: Script-First Believable-Person UGC](#recipe-7-script-first-believable-person-ugc-first-frame--seedance-25) | the clip must pass as a real person filming themselves; script and believability gates apply |

### Recipe 1: Soul-Once Founder-Face Ads

Purpose: create a reusable founder/presenter Soul identity once, then produce weekly Marketing Studio video ads from it.

1. **Check for existing Soul.** Call `mcp__claude_ai_Higgsfield__show_characters` and check `identity/training-manifest.json` `soul_reference_id`. If a trained Soul exists, jump to step 6.
2. **Media preflight.** For each founder photo, call `mcp__claude_ai_Higgsfield__media_upload` then `mcp__claude_ai_Higgsfield__media_confirm`. Record each `upload_id`.
3. **Spend confirm.** Surface current balance via `mcp__claude_ai_Higgsfield__balance`. Confirm Soul training spend with the founder per `paid-tool-routing.md`.
4. **Train Soul.** Use `--soul-2` for still/image-driven campaigns; use `--soul-cinematic` when the launch needs talking-head or presenter VIDEO:
   ```bash
   higgsfield soul-id create --name "founder" --soul-2 \
     --image a.png --image b.png --output-dir ./identity
   ```
   Save the returned `reference_id` to `identity/training-manifest.json` `soul_reference_id`.
5. **Create avatar.** Use the upload ID from the preflight:
   ```bash
   higgsfield marketing-studio avatars create --name "Founder" --image <upload_id>
   ```
   Save `avatar_id` to the identity manifest's `avatar_id`. Write `avatars.json` as `[{"id":"<avatar_id>","type":"custom"}]`.
6. **Import app product.** If not already done:
   ```bash
   higgsfield marketing-studio webproducts fetch \
     --url <app-store-url> --wait
   ```
7. **Spend confirm for ad batch.** Surface current balance via `mcp__claude_ai_Higgsfield__balance`. Confirm weekly generation spend with the founder per `paid-tool-routing.md`.
8. **Generate ads (weekly).** Inject DESIGN.md tokens into every `--prompt`. Structure the `ugc` mode shown here per **UGC Realism Prompt Structure** above. Use **Product Ad Structure And Prompt Craft** only when this recipe runs a `tv_spot`. The script must first survive the judge panel per `ugc-creator-engine.md`:
   ```bash
   higgsfield generate create marketing_studio_video \
     --prompt "<hook + DESIGN.md brief>" \
     --avatars @avatars.json \
     --product_ids @products.json \
     --mode ugc \
     --duration 15 --resolution 720p --aspect_ratio 9:16 \
     --output-dir ./ads/ugc --wait
   ```
9. **Score virality.** Media preflight the output video, then:
   ```bash
   higgsfield generate create brain_activity --video ./ads/ugc/<output>.mp4 --wait
   ```
   Record `virality_score` (overall, peak hook second, sustain %, Default Mode risk) in `CONTENT_ASSETS.md` and `PAID_UA.md`.
10. **Reframe winner.** Use `mcp__claude_ai_Higgsfield__reframe` for 9:16 / 1:1 / 16:9 variants. Confirm the exact invocation via the `higgsfield-generate` skill or MCP tool help before running.
11. **CONTENT_ASSETS.md.** Record prompt_brief, soul_reference_id, avatar_id, source_job_id, virality_score, output paths, QA, and approval state. For UGC-family modes also record script_id, judge_verdict, and believability; `check:content-assets` enforces them.
12. **Founder gate.** Founder approves before public posting, store upload, or paid campaign launch.
13. **Distribute.** On approval, hand off to Fastlane per `fastlane-growth-ops.md`.

---

### Recipe 2: App Store URL → UGC Ad Batch (Click-to-Ad)

Purpose: turn the live App Store listing into a multi-format UGC ad batch without manual product setup.

1. **Import via App Store URL:**
   ```bash
   higgsfield marketing-studio webproducts fetch \
     --url <app-store-url> --wait
   ```
2. **Pick avatar.** Use a preset avatar or a custom Soul avatar. For custom Soul, confirm `avatar_id` exists in `state/business-state.json`; if not, run Recipe 1 steps 2–5 first.
3. **Spend confirm.** Surface balance via `mcp__claude_ai_Higgsfield__balance`. Confirm spend for the planned mode batch with the founder per `paid-tool-routing.md`.
4. **Generate parallel mode batch.** Inject DESIGN.md tokens into every `--prompt`. Structure the three UGC-family calls (`ugc`, `ugc_unboxing`, `product_review`) per **UGC Realism Prompt Structure** above, each with a judge-panel-surviving script. Structure the `tv_spot` call per **Product Ad Structure And Prompt Craft**. Vary person, room, light, and beat set across the UGC calls. A batch that repeats one avatar in one room is the #1 tell. The `--url` shortcut reuses the backend entity but does NOT inject brief — always add `--prompt` explicitly:
   ```bash
   higgsfield generate create marketing_studio_video \
     --url <app-store-url> \
     --prompt "<hook + DESIGN.md brief>" \
     --mode ugc --duration 15 --aspect_ratio 9:16 \
     --output-dir ./ads/ugc --wait

   higgsfield generate create marketing_studio_video \
     --url <app-store-url> \
     --prompt "<hook + DESIGN.md brief>" \
     --mode ugc_unboxing --duration 15 --aspect_ratio 9:16 \
     --output-dir ./ads/ugc_unboxing --wait

   higgsfield generate create marketing_studio_video \
     --url <app-store-url> \
     --prompt "<hook + DESIGN.md brief>" \
     --mode product_review --duration 15 --aspect_ratio 9:16 \
     --output-dir ./ads/product_review --wait

   higgsfield generate create marketing_studio_video \
     --url <app-store-url> \
     --prompt "<hook + DESIGN.md brief>" \
     --mode tv_spot --duration 15 --aspect_ratio 9:16 \
     --output-dir ./ads/tv_spot --wait
   ```
5. **Score each variant.** Media preflight each output, then run `brain_activity` per Recipe 3. Record virality scores in `CONTENT_ASSETS.md` and `PAID_UA.md`.
6. **Save winners as ad references.** Ad references are MUTUALLY EXCLUSIVE with `--hook_id`/`--setting_id` — do not mix:
   ```bash
   higgsfield marketing-studio ad-references create --job <job_id> --json | jq -r .id
   ```
7. **CONTENT_ASSETS.md.** Record prompt_brief, webproduct_id, avatar_id, source_job_id, virality_score, ad-reference IDs, output paths, QA, and approval state. For the UGC-family modes also record script_id, judge_verdict, and believability; `check:content-assets` enforces them.
8. **Founder gate.** Founder approves before upload or paid campaign launch.

---

### Recipe 3: Virality Closed Loop

Purpose: score every creative before distribution; never pay for a campaign without a recorded virality score.

1. **Generate or capture creative.** Use any generation recipe or real app footage.
2. **Media preflight.** Call `mcp__claude_ai_Higgsfield__media_upload` then `mcp__claude_ai_Higgsfield__media_confirm` for the video file. Record the upload ID.
3. **Score:**
   ```bash
   higgsfield generate create brain_activity --video ./ad.mp4 --wait
   ```
   Returns: overall 0–100, peak hook second, sustain %, Default Mode Network risk. No prompt required.
4. **Decision rules:**
   - Overall < 50: revise hook or switch mode; regenerate before paid distribution.
   - Default Mode risk HIGH: shorten the video or front-load the core value prop.
   - Sustain < 70%: re-cut to remove drop-off section before distribution.
5. **Iterate.** Revise, regenerate, re-score until the decision threshold is met.
6. **Record.** Log score history (overall, peak hook second, sustain %, DMN risk) in `CONTENT_ASSETS.md` per-asset `virality_score` field and in `PAID_UA.md` `virality_score` + `hook_dmn_risk` columns.
7. **Gate.** Paid distribution proceeds ONLY after a virality score is recorded in `CONTENT_ASSETS.md`. This is a hard gate — record the score before handing off to `paid-user-acquisition.md` or Fastlane.

---

### Recipe 4: Master → All Platforms (reframe + personal_clipper)

Purpose: produce one high-quality master video then derive all platform ratios and short clips without re-generating.

1. **Source master.** For App Preview: MUST be real app footage — an in-app simulator recording (rung 0), MobAI, or XcodeBuildMCP capture per `xcodebuildmcp-testing.md` / `mobai-toolbelt.md`; verify the capture's native resolution against the target well before compositing. For ads/social: generated or captured footage is acceptable.
2. **Long-recording trim (optional).** For recordings longer than 60 seconds, use `mcp__claude_ai_Higgsfield__personal_clipper_create` to extract short clips, then poll `mcp__claude_ai_Higgsfield__personal_clipper_status` until complete. Confirm the exact invocation via the `higgsfield-generate` skill or MCP tool help before running.
3. **Spend confirm.** Surface balance via `mcp__claude_ai_Higgsfield__balance`. Confirm reframe spend with the founder per `paid-tool-routing.md`.
4. **Reframe to all platform ratios.** Use `mcp__claude_ai_Higgsfield__reframe` with the master video to produce 9:16, 1:1, and 16:9 variants. Confirm the exact invocation via the `higgsfield-generate` skill or MCP tool help before running. Veo 3.1 format limits (16:9 or 9:16 only; 4/6/8s only) do NOT apply to `reframe` — reframe operates on existing footage.
5. **Score each variant.** Media preflight each variant, then run `brain_activity` per Recipe 3.
6. **CONTENT_ASSETS.md.** Record all output URLs, source_job_id (link derivative to master), virality_score per variant, intended platform, QA, and approval state.
7. **Founder gate.** Founder approves before upload, scheduling, or store submission.
8. **Distribute.** On approval, hand off to Fastlane per `fastlane-growth-ops.md` or App Store Connect per `app-store-connect-cli.md`.

---

### Recipe 5: Seasonal Restyle Refresh

Purpose: refresh CPP backgrounds, event art, and supporting screenshot art for seasonal App Store windows without touching the real-UI screenshot layer.

1. **Check seasonal window.** Confirm with `aso-store-ops.md` / `seasonal-aso` skill that the seasonal window is active or approaching.
2. **Load locked supporting asset.** Identify the specific CPP background, event art, or empty-state asset to restyle. This must be the SUPPORTING ART layer — do NOT restyle or replace the real-UI screenshot layer.
3. **Spend confirm.** Surface balance via `mcp__claude_ai_Higgsfield__balance`. Confirm spend with the founder per `paid-tool-routing.md`.
4. **Restyle with seasonal context:**
   ```bash
   higgsfield product-photoshoot create \
     --mode restyle \
     --prompt "<seasonal context + DESIGN.md palette: colors, texture, mood, banned aesthetics>" \
     --image ./supporting-art/background.jpg \
     --count 3 \
     --output-dir ./seasonal/<season>
   ```
   Generate 2–3 variants. Label all outputs `status:draft`.
5. **CONTENT_ASSETS.md.** Record prompt_brief (with DESIGN.md tokens and seasonal context), source asset, output paths, variant labels (status:draft), and approval gate.
6. **Founder gate.** Founder must approve before CPP upload, App Store event submission, or IAP promotional art upload. Do not upload any seasonal restyle without explicit founder approval.
7. **Upload.** On approval, use `app-store-connect-cli.md` upload procedures for CPP/event/IAP art.

---

### Recipe 6: Cheap-First Direction (z_image → production model)

Purpose: minimize credit spend on direction-finding before committing production-quality credits.

**Rule-5 reconciliation:** the upstream `higgsfield-generate` skill defaults to quality-first and says do NOT pre-optimize for cheaper models unless asked. In this spend-sensitive, founder-gated skill, cheap-first is offered ONLY as a spend-reduction option at the `paid-tool-routing.md` spend-confirmation prompt — never applied silently. Present it as an option, let the founder choose, then proceed.

1. **At spend-confirmation prompt.** Offer the cheap-first path as an option: "Run z_image drafts first (cheaper) to lock direction, then production model on the winner. Saves approximately X credits vs. running production model on all variants. Proceed with cheap-first or production-only?"
2. **Translate DESIGN.md brief.** Extract palette, typography mood, shapes, texture, banned aesthetics, and intended surface into a tight prompt.
3. **Check icon_style token.** If `DESIGN.md` `icon_style` is `character`, `cartoon`, or `mascot`, use `nano_banana_2` or `nano_banana_pro` for drafts, not `z_image`. Otherwise, use `z_image` for cheap drafts.
4. **Draft run (z_image, 5–8 variants):**
   ```bash
   higgsfield generate create z_image \
     --prompt "<DESIGN.md brief>" \
     --aspect_ratio 1:1 \
     --wait
   ```
   Label all outputs `status:direction`. Add their proof routes to `DESIGN.md` and structured design state, then render `design/design-room.html` for founder side-by-side review.
5. **Pick 2–3 directions.** Founder (or, if the founder delegates to the agent, the agent using the council) selects directions to promote.
6. **Production-model run on confirmed directions:**
   ```bash
   higgsfield generate create gpt_image_2 \
     --prompt "<DESIGN.md brief, on-image text if needed>" \
     --aspect_ratio 1:1 \
     --wait
   ```
   (Use `nano_banana_2`/`nano_banana_pro` for character/mascot; `seedream_v4_5` for vector/flat illustration.)
   Label promoted outputs `status:draft`.
7. **Design proof.** Record `status:draft` variants in `DESIGN.md` or the relevant screen plan, route them through structured design state, and render `design/design-room.html` in a side-by-side layout.
8. **Founder selects.** Founder picks final production asset. Label selected output `status:production`.
9. **CONTENT_ASSETS.md.** Record prompt_brief (DESIGN.md tokens), model used at each stage, direction outputs (status:direction), draft outputs (status:draft), final output (status:production), output paths, QA, and approval state.

---

### Recipe 7: Script-First Believable-Person UGC (First Frame → Seedance 2.5)

Purpose: produce a UGC clip that passes as a real person, from a judged script, without Marketing Studio avatars. The path is two prompts: one first-frame image, then one reference-driven video.

1. **Script gate.** The script must first survive the judge-panel loop in `ugc-creator-engine.md` (Script Bank And Judge Panel). No panel verdict, no generation. Judge 10+ scripts per batch; generate only the survivors. Record `script_id` (`ugc/script-bank.md#<format-id>`, resolving to a recorded row) and `judge_verdict` (`passed — <detail>` or `survived — <detail>`) for the manifest — `check:content-assets` requires both on every UGC-family asset and rejects a failing verdict at any status.
2. **Converted-reference check.** If a converting UGC video exists for a comparable product, run the **Converted-reference shortcut** above. The breakdown becomes the video-prompt skeleton for step 5. Step 3 still runs; Seedance needs the first-frame reference image.
3. **Spend confirm.** Surface balance via `mcp__claude_ai_Higgsfield__balance`. Confirm the batch spend with the founder per `paid-tool-routing.md` before any generation call. The approved ceiling covers both the first-frame image credits and the video credits. Verify live per-clip pricing there; do not trust remembered numbers.
4. **First frame.** Generate with `gpt_image_2` (or `nano_banana_2` for a stylized person) using the **First-Frame Prompt** template above. One specific person in one specific place; commit to the specifics. Label the output `status:draft`.
5. **Generate video.** Seedance 2.5 — confirm the exact model id via the `higgsfield-generate` skill. Image-to-video with the first frame as reference; prompt per the **Video Prompt** template above. 9:16, 720p first. Match `--duration` to the prompt's timestamps; a mismatch desyncs the delivery. Record a `prompt_brief` that carries the `DESIGN.md` tokens for any app UI shown in frame; the realism register governs the person and the scene.
6. **Edit pass.** Treat the output as raw footage per the **Edit pass** rules above: cut dead space, tighten pauses, captions, sound. Use the Remotion route for reproducible caption and cutdown variants.
7. **Believability test.** Show the cut to one real human who did not make it. If they identify it as AI or as an ad, return to the judge panel (the script), not to the model settings. Record the result in the manifest `believability` field.
8. **Score virality.** Media preflight the winner, then `brain_activity` per Recipe 3. Upscale only the winning take.
9. **CONTENT_ASSETS.md.** Set `asset_kind: ugc` on the manifest asset — every generated video must classify itself, because a Seedance route name alone does not reveal a believable-person clip. Record script_id, judge_verdict, prompt_brief (DESIGN.md tokens), first-frame prompt, video prompt, model ids, output paths, believability, virality_score, QA, and approval state. `check:content-assets` blocks a UGC-family asset without a resolving script_id and a passing judge_verdict. It also blocks a done-tier status without a `passed` believability result.
10. **Founder gate.** Founder approves before public posting or paid distribution. The batch rule holds: every clip gets a different person, room, light, and beat set.

## Remotion Content Asset Production

Purpose: create reproducible videos, stills, screenshot frames, app previews, UGC overlays, captions, and ad/social variants from real product UI, brand tokens, copy, and source media.

Use when:

- the founder does not want to pay for Higgsfield or approves a lower-cost local route
- a code-rendered template is better than a one-off generated visual
- assets must be batch-rendered across hooks, CTAs, locales, dimensions, or campaign variants
- real app screenshots/recordings need framing, captions, motion, or store/social formatting

Access and license:

- Load `paid-tool-routing.md` before replacing Higgsfield with Remotion.
- Load `remotion-content-assets.md` before scaffolding a Remotion project or claiming rendered assets are ready.
- Refresh current Remotion docs and license before setup, CLI flags, commercial-use guidance, or renderer API examples.
- Record license eligibility or founder approval in `CONTENT_ASSETS.md` or `strategy/TOOL_DECISIONS.md`.

Recommended setup in the launch repo, not inside this skill package:

```bash
mkdir -p content-assets
cd content-assets
npx create-video@latest --yes --blank --no-tailwind remotion
cd remotion
npx remotion studio
```

Common commands:

```bash
npx remotion compositions
npx remotion still <composition-id> --scale=0.25 --frame=30 --output ../out/frame30.png
npx remotion render <composition-id> --output ../out/video.mp4
npx remotion still <still-id> --output ../out/still.png
```

Rules:

- Use the `remotion-best-practices` skill when available.
- Prefer `<Composition>` and `<Still>` entries with typed props and Zod schemas for variable copy or dimensions.
- Put local images, video, audio, and captions in the Remotion `public/` folder and reference them with `staticFile()`.
- Use frame-based animation APIs such as `useCurrentFrame()`, `interpolate()`, `spring()`, and `Sequence`; do not rely on CSS animations for render-critical motion.
- Keep real app UI visible when the asset claims to show the app.
- Record source inputs, render commands, output paths, dimensions, duration, route decision, license status, and claim checks in `CONTENT_ASSETS.md` and `growth/content-assets/manifest.json`.
- Do not publish, schedule, upload store assets, run paid campaigns, or pay for rendering infrastructure without founder approval.
