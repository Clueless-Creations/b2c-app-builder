export interface AppReviewPlistIdentity {
  readonly bundleId: string;
  readonly marketingVersion: string;
  readonly buildNumber: string;
}

const BINARY_MAGIC = "bplist00";

function decodeXmlText(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function parseXmlPlistScalars(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  const pattern = /<key>\s*([^<]+?)\s*<\/key>\s*(?:<string>([\s\S]*?)<\/string>|<integer>\s*([^<]+?)\s*<\/integer>|<real>\s*([^<]+?)\s*<\/real>)/gi;
  for (const match of contents.matchAll(pattern)) {
    const key = decodeXmlText(match[1] ?? "").trim();
    if (!key) continue;
    if (match[2] !== undefined) values[key] = decodeXmlText(match[2]).trim();
    else if (match[3] !== undefined) values[key] = match[3].trim();
    else if (match[4] !== undefined) values[key] = match[4].trim();
  }
  return values;
}

function readUIntBE(bytes: Buffer, offset: number, size: number): number {
  if (size <= 0 || offset < 0 || offset + size > bytes.length) {
    throw new Error("Binary property list integer is out of range");
  }
  if (size === 8) {
    const value = bytes.readBigUInt64BE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Binary property list integer is too large");
    }
    return Number(value);
  }
  let value = 0;
  for (let index = 0; index < size; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
  }
  return value;
}

function readSignedIntBE(bytes: Buffer, offset: number, size: number): number {
  if (size === 1) return bytes.readInt8(offset);
  if (size === 2) return bytes.readInt16BE(offset);
  if (size === 4) return bytes.readInt32BE(offset);
  if (size === 8) {
    const value = bytes.readBigInt64BE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new Error("Binary property list integer is too large");
    }
    return Number(value);
  }
  return readUIntBE(bytes, offset, size);
}

function parseBinaryPlistScalars(bytes: Buffer): Record<string, string> {
  if (bytes.length < 40 || bytes.subarray(0, 8).toString("ascii") !== BINARY_MAGIC) {
    throw new Error("Compiled Info.plist is not a binary property list");
  }
  const trailer = bytes.subarray(bytes.length - 32);
  const offsetIntSize = trailer[6] ?? 0;
  const objectRefSize = trailer[7] ?? 0;
  const objectCount = readUIntBE(trailer, 8, 8);
  const topObject = readUIntBE(trailer, 16, 8);
  const offsetTableOffset = readUIntBE(trailer, 24, 8);
  if (offsetIntSize < 1 || objectRefSize < 1 || objectCount < 1) {
    throw new Error("Binary property list trailer is invalid");
  }
  if (offsetTableOffset + objectCount * offsetIntSize > bytes.length - 32) {
    throw new Error("Binary property list offset table is invalid");
  }

  const objectOffset = (index: number): number => {
    if (index < 0 || index >= objectCount) {
      throw new Error("Binary property list object reference is invalid");
    }
    return readUIntBE(bytes, offsetTableOffset + index * offsetIntSize, offsetIntSize);
  };

  const readRef = (offset: number): number => readUIntBE(bytes, offset, objectRefSize);

  const readInlineLength = (offset: number, info: number): { readonly length: number; readonly headerSize: number } => {
    if (info !== 0x0f) return { length: info, headerSize: 1 };
    const marker = bytes[offset + 1];
    if (marker === undefined || (marker & 0xf0) !== 0x10) {
      throw new Error("Binary property list length marker is invalid");
    }
    const size = 1 << (marker & 0x0f);
    return { length: readUIntBE(bytes, offset + 2, size), headerSize: 2 + size };
  };

  const parseObject = (index: number): unknown => {
    const offset = objectOffset(index);
    const marker = bytes[offset];
    if (marker === undefined) throw new Error("Binary property list object is missing");
    const type = marker >> 4;
    const info = marker & 0x0f;
    switch (type) {
      case 0x0:
        if (info === 0x8) return false;
        if (info === 0x9) return true;
        return undefined;
      case 0x1:
        return readSignedIntBE(bytes, offset + 1, 1 << info);
      case 0x5: {
        const sized = readInlineLength(offset, info);
        return bytes.subarray(offset + sized.headerSize, offset + sized.headerSize + sized.length).toString("ascii");
      }
      case 0x6: {
        const sized = readInlineLength(offset, info);
        const utf16 = bytes.subarray(offset + sized.headerSize, offset + sized.headerSize + sized.length * 2);
        const swapped = Buffer.alloc(utf16.length);
        for (let index = 0; index < utf16.length; index += 2) {
          swapped[index] = utf16[index + 1] ?? 0;
          swapped[index + 1] = utf16[index] ?? 0;
        }
        return swapped.toString("utf16le");
      }
      case 0x7: {
        const sized = readInlineLength(offset, info);
        return bytes.subarray(offset + sized.headerSize, offset + sized.headerSize + sized.length).toString("utf8");
      }
      case 0xa:
      case 0xc: {
        const sized = readInlineLength(offset, info);
        const items: unknown[] = [];
        for (let item = 0; item < sized.length; item += 1) {
          items.push(parseObject(readRef(offset + sized.headerSize + item * objectRefSize)));
        }
        return items;
      }
      case 0xd: {
        const sized = readInlineLength(offset, info);
        const record: Record<string, unknown> = {};
        for (let item = 0; item < sized.length; item += 1) {
          const key = parseObject(readRef(offset + sized.headerSize + item * objectRefSize));
          const value = parseObject(readRef(offset + sized.headerSize + (sized.length + item) * objectRefSize));
          if (typeof key === "string" && key) record[key] = value;
        }
        return record;
      }
      default:
        return undefined;
    }
  };

  const top = parseObject(topObject);
  const values: Record<string, string> = {};
  if (!top || typeof top !== "object" || Array.isArray(top)) return values;
  for (const [key, value] of Object.entries(top)) {
    if (typeof value === "string") values[key] = value.trim();
    else if (typeof value === "number" && Number.isFinite(value)) values[key] = String(value);
    else if (typeof value === "boolean") values[key] = value ? "true" : "false";
  }
  return values;
}

export function parseInfoPlistScalarsFromBytes(bytes: Buffer): Record<string, string> {
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString("ascii") === BINARY_MAGIC) {
    return parseBinaryPlistScalars(bytes);
  }
  return parseXmlPlistScalars(bytes.toString("utf8"));
}

export function incrementBuildNumber(value: string): string {
  const parts = value.trim().split(".");
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) return "1";
  const last = parts.at(-1);
  if (last === undefined) return "1";
  parts[parts.length - 1] = String(Number(last) + 1);
  return parts.join(".");
}

export function renderIdentityPlist(identity: AppReviewPlistIdentity): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    `<key>CFBundleIdentifier</key><string>${escapeXmlText(identity.bundleId)}</string>`,
    `<key>CFBundleShortVersionString</key><string>${escapeXmlText(identity.marketingVersion)}</string>`,
    `<key>CFBundleVersion</key><string>${escapeXmlText(identity.buildNumber)}</string>`,
    "</dict></plist>",
    "",
  ].join("\n");
}

export function upsertInfoPlistIdentity(existing: string, identity: AppReviewPlistIdentity): string {
  if (!/<plist\b/i.test(existing)) return renderIdentityPlist(identity);
  let next = existing;
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ["CFBundleIdentifier", identity.bundleId],
    ["CFBundleShortVersionString", identity.marketingVersion],
    ["CFBundleVersion", identity.buildNumber],
  ];
  for (const [key, value] of pairs) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(<key>\\s*${escapedKey}\\s*<\\/key>\\s*)<(string|integer)>[\\s\\S]*?<\\/\\2>`, "i");
    if (pattern.test(next)) {
      next = next.replace(pattern, `$1<string>${escapeXmlText(value)}</string>`);
      continue;
    }
    if (!/<\/dict>\s*<\/plist>/i.test(next)) return renderIdentityPlist(identity);
    next = next.replace(/<\/dict>\s*<\/plist>/i, `<key>${key}</key><string>${escapeXmlText(value)}</string>\n</dict></plist>`);
  }
  return next;
}

export function requiredPlistIdentity(values: Record<string, string>): AppReviewPlistIdentity | undefined {
  const bundleId = values.CFBundleIdentifier?.trim() ?? "";
  const marketingVersion = values.CFBundleShortVersionString?.trim() ?? "";
  const buildNumber = values.CFBundleVersion?.trim() ?? "";
  if (!bundleId || !marketingVersion || !buildNumber) return undefined;
  return { bundleId, marketingVersion, buildNumber };
}
