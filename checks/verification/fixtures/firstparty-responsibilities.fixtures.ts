import { composeAuthoredCatalog } from "../../../catalog/authoring.js";
import { FIRSTPARTY_WORKER_TARGET, firstpartyWorkerResponsibilities } from "../../../catalog/firstparty-recipes.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function refuses(action: () => unknown, expected: string) {
  let message = "";
  try {
    action();
  } catch (error) {
    message = String(error);
  }
  assert(message.includes(expected), `expected ${expected}, got ${message || "no refusal"}`);
}
export function register(h: Harness): void {
  h.check("default business responsibility inventory preserves actual provider-bearing guidance", () => {
    const catalog = composeAuthoredCatalog(skillRoot);
    const responsibilities = firstpartyWorkerResponsibilities(catalog);
    assert(
      responsibilities.length === catalog.workflows.filter((workflow) => workflow.domainId !== "domain.machine").length,
      "business work was silently omitted",
    );
    assert(
      responsibilities.every((entry) => entry.workflow.domainId !== "domain.machine"),
      "maintainer work entered the business recipe",
    );
    const money = responsibilities.find((entry) => entry.workflow.id === "workflow.money.revenue-monetization")!;
    assert(
      money.workflow.instructions.includes("RevenueCat") && money.workflow.providerIds.includes("provider.revenuecat"),
      "actual default guidance was falsely made provider-neutral",
    );
    assert(FIRSTPARTY_WORKER_TARGET.platform === "host" && FIRSTPARTY_WORKER_TARGET.runtime === "agent-cli", "worker support must not claim an app SDK target");
  });
  h.check("new or moved work requires an explicit authored responsibility decision", () => {
    const catalog = composeAuthoredCatalog(skillRoot);
    const added = structuredClone(catalog);
    added.workflows.push({ ...added.workflows[0]!, id: "workflow.product.unreviewed" });
    refuses(() => firstpartyWorkerResponsibilities(added), "firstparty.unclassified_workflow");
    const moved = structuredClone(catalog);
    moved.workflows.find((entry) => entry.id === "workflow.money.revenue-monetization")!.domainId = "domain.product";
    refuses(() => firstpartyWorkerResponsibilities(moved), "firstparty.responsibility_changed");
  });
  h.check("default recipe refuses a hidden dependency on maintainer-only work", () => {
    const catalog = composeAuthoredCatalog(skillRoot);
    catalog.workflows.find((entry) => entry.id === "workflow.money.revenue-monetization")!.dependencies.push("workflow.machine.definition-graph-maintenance");
    refuses(() => firstpartyWorkerResponsibilities(catalog), "firstparty.business_dependency_outside_recipe");
  });
}
