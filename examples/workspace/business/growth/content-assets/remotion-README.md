# Remotion Starter Notes

Create the actual Remotion project inside the launch repo only after `CONTENT_ASSETS.md` records route approval and Remotion license status.

Recommended setup:

```bash
cd content-assets
npx create-video@latest --yes --blank --no-tailwind remotion
cd remotion
npx remotion studio
```

Expected layout after setup:

```text
content-assets/
  remotion/
    package.json
    remotion.config.ts
    src/
    public/
  out/
```

Use the `remotion-best-practices` skill before writing compositions. Keep local assets in `growth/content-assets/remotion/public/` and reference them with `staticFile()`.
