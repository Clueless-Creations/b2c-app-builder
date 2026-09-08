/**
 * WCAG 2 relative-luminance contrast. One formula for Design Room warnings
 * and design-worthiness errors.
 */

export function parseHex(value: string): [number, number, number] | undefined {
  const captured = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!captured) {
    return undefined;
  }
  const hex =
    captured.length === 3
      ? captured
          .split("")
          .map((char) => char + char)
          .join("")
      : captured;
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number | undefined {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) {
    return undefined;
  }
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when the background is dark enough that the AAA body-text target is a contextual review signal. */
export function isDarkBackground(background: string): boolean {
  const rgb = parseHex(background);
  if (!rgb) return false;
  return relativeLuminance(rgb) < 0.4;
}
