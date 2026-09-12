import { readFileSync } from "node:fs";
import path from "node:path";
import { inspectPackage } from "../../../kernel/composition/resources.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const packageRoot = path.join(skillRoot, "examples/extensions/postiz-social");

type OfficialCreateRequest = {
  content: string;
  integration: string;
  type: "draft" | "schedule";
  date?: string;
};

type OfficialCreateResponse = {
  postId: string;
  integration: { id: string };
};

function createFakePostizTransport(): {
  calls: OfficialCreateRequest[];
  create(request: OfficialCreateRequest): OfficialCreateResponse;
} {
  const calls: OfficialCreateRequest[] = [];
  return {
    calls,
    create(request) {
      calls.push(request);
      return { postId: "post-fixture-1", integration: { id: request.integration } };
    },
  };
}

function resourceText(relativePath: string): string {
  return readFileSync(path.join(packageRoot, relativePath), "utf8");
}

export function register(harness: Harness): void {
  harness.check("postiz-extension: metadata validates and keeps provider operations namespaced", () => {
    const snapshot = inspectPackage(packageRoot);
    assert(snapshot.extension.id === "postiz-social/package", snapshot.extension.id);
    assert(snapshot.extension.providers?.[0]?.id === "postiz-social/postiz-api", "provider escaped package namespace");
    assert(snapshot.extension.capabilities[0]?.operations.length === 4, "expected draft, schedule, list, and delete operations");
    assert(snapshot.extension.implementations.every((item) => item.mode === "manual"), "live implementation leaked into the source fixture");
  });

  harness.check("postiz-extension: official request and response shapes stay separate from adapter output", () => {
    const input = JSON.parse(resourceText("schemas/post.input.json")) as { properties: Record<string, unknown>; required: string[] };
    const output = JSON.parse(resourceText("schemas/post.output.json")) as { properties: Record<string, unknown>; required: string[] };
    assert(input.properties.type && input.properties.date, "schedule input lost its type/date fields");
    assert(input.required.includes("content") && input.required.includes("platform"), "content/platform are not required");
    assert(output.required.includes("postId") && output.required.includes("integrationId"), "provider identifiers are not preserved");
    const integration = resourceText("integration.md");
    assert(integration.includes("type: draft") && integration.includes("type: schedule"), "draft/schedule distinction is missing");
    assert(integration.includes("GET /public/v1/posts") && integration.includes("DELETE /public/v1/posts/:id"), "read/delete contract is missing");
    assert(integration.includes("AGPL-3.0") && integration.includes("does not vendor"), "license boundary or no-vendoring statement is missing");

    const transport = createFakePostizTransport();
    const draft = transport.create({ content: "fixture draft", integration: "integration-fixture-1", type: "draft" });
    assert(transport.calls.length === 1 && transport.calls[0]?.type === "draft", "fake transport did not preserve draft classification");
    assert(!("date" in transport.calls[0]!), "draft request unexpectedly gained a schedule date");
    assert(draft.postId === "post-fixture-1" && draft.integration.id === "integration-fixture-1", "official response identifiers were not preserved");
    const adapterOutput = { postId: draft.postId, integrationId: draft.integration.id, status: "draft", reconciled: false };
    assert(adapterOutput.integrationId === draft.integration.id, "adapter output should map the provider integration id at the boundary");
  });

  harness.check("postiz-extension: draft cannot silently become publication and live proof stays explicit", () => {
    const manifest = resourceText("extension.yaml");
    const integration = resourceText("integration.md");
    assert(manifest.includes("effect: draft") && manifest.includes("effect: publish"), "effect classes are not distinct");
    assert(manifest.includes("founder-gated") && manifest.includes("No live scheduling is implemented"), "publication authority boundary is missing");
    assert(integration.includes("fake transport") && integration.includes("live support"), "fixture/live evidence distinction is missing");
    assert(integration.includes("Missing/ambiguous") || integration.includes("uncertain"), "uncertain or missing upstream behavior is not called out");
    assert(integration.includes("alternate social provider") || integration.includes("selected connection"), "provider-selection boundary is missing");
  });
}
