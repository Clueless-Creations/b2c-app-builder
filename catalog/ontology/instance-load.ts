import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import YAML from "yaml";
import { PRODUCT_COPY_FIELDS, type ProductCopy, type ProductInstance, type ProductInstanceDocument, type ProductMeta } from "./instance-types.js";
import { isOntologyClassId, isOntologySlotId, type OntologyClassId, type OntologySlotId } from "./types.js";

const schemaPath = fileURLToPath(new URL("./instance.schema.json", import.meta.url));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value;
}

function asSlotValues(value: unknown, field: string): string[] {
  if (typeof value === "string") {
    if (value.trim() === "") throw new Error(`${field} must be a non-empty string`);
    return [value];
  }
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${field} must be a string or a non-empty string array`);
  }
  return value;
}

function parseMeta(value: unknown): ProductMeta {
  if (!isRecord(value)) throw new Error("meta must be an object");
  return {
    version: asString(value.version, "meta.version"),
    name: asString(value.name, "meta.name"),
    ...(value.slug !== undefined ? { slug: asString(value.slug, "meta.slug") } : {}),
    description: asString(value.description, "meta.description"),
    status: asString(value.status, "meta.status"),
  };
}

function parseCopy(value: unknown): ProductCopy {
  if (!isRecord(value)) throw new Error("copy must be an object");
  const copy = {} as ProductCopy;
  for (const [yamlKey, field] of PRODUCT_COPY_FIELDS) {
    copy[field] = asString(yamlKey === "complete_scope" ? (value.complete_scope ?? value.v1_boundary) : value[yamlKey], `copy.${yamlKey}`);
  }
  return copy;
}

function parseInstance(value: unknown, index: number): ProductInstance {
  if (!isRecord(value)) throw new Error(`instances[${index}] must be an object`);
  const classRaw = asString(value.class_id, `instances[${index}].class_id`);
  if (!isOntologyClassId(classRaw)) throw new Error(`instances[${index}].class_id "${classRaw}" is not a class id`);
  const classId: OntologyClassId = classRaw;
  if (!isRecord(value.slots)) throw new Error(`instances[${index}].slots must be an object`);
  const slots: ProductInstance["slots"] = {};
  for (const [slotId, raw] of Object.entries(value.slots)) {
    if (!isOntologySlotId(slotId)) throw new Error(`instances[${index}].slots key "${slotId}" is not a slot id`);
    const id: OntologySlotId = slotId;
    slots[id] = asSlotValues(raw, `instances[${index}].slots.${slotId}`).map((item) => (slotId === "slot.feature.scope" && item === "v1" ? "required" : item));
  }
  return {
    id: asString(value.id, `instances[${index}].id`),
    classId,
    slots,
  };
}

export function productYamlPath(workspaceRoot: string, fileName = "product.yaml"): string {
  return path.join(workspaceRoot, fileName);
}

export function loadProductInstanceDocument(filePath: string): ProductInstanceDocument {
  if (!existsSync(filePath)) throw new Error(`product instance document is missing at ${filePath}`);
  return parseProductInstanceDocument(YAML.parse(readFileSync(filePath, "utf8")));
}

/** Validate already-read authored input through the same schema and ontology rules. */
export function parseProductInstanceDocument(parsed: unknown): ProductInstanceDocument {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(parsed)) {
    const detail = (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ");
    throw new Error(`product.yaml failed JSON Schema: ${detail}`);
  }
  if (!isRecord(parsed)) throw new Error("product.yaml must parse to an object");
  if (!Array.isArray(parsed.instances)) throw new Error("instances must be an array");
  return {
    schemaVersion: typeof parsed.schema_version === "number" ? parsed.schema_version : 0,
    meta: parseMeta(parsed.meta),
    copy: parseCopy(parsed.copy),
    instances: parsed.instances.map(parseInstance),
  };
}
