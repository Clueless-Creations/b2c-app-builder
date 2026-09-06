import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";

/** Read bounded regular bytes without waiting on FIFOs or following a substituted final symlink. Callers validate ancestor containment. */
export function boundedFileBytes(file: string, maxBytes: number): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("file.invalid_read_limit");
  const before = lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) throw new Error("file.nonregular_or_oversized");
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > maxBytes) throw new Error("file.changed_or_oversized");
    const bytes = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      const received = readSync(descriptor, bytes, count, bytes.length - count, null);
      if (!received) break;
      count += received;
    }
    if (count > maxBytes) throw new Error("file.oversized");
    return bytes.subarray(0, count);
  } finally {
    closeSync(descriptor);
  }
}
