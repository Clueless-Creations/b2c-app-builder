import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
export function atomicFile(file: string, bytes: string): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, file);
    const directory = openSync(path.dirname(file), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
export function durableUnlink(file: string): void {
  unlinkSync(file);
  const descriptor = openSync(path.dirname(file), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
