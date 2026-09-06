import { composeCatalog } from "../../../catalog/index.js";
import { validateCatalog } from "../../../catalog/validate.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("catalog refuses YAML state reads and instructions while accepting current runtime state", () => {
    const catalog = composeCatalog(skillRoot);
    const workflow = catalog.workflows[0]!;
    workflow.instructions += "\nRead state/runtime.yaml before planning.";
    assert(
      validateCatalog(catalog, skillRoot).some((item) => item.code === "catalog_graph.workflow.invalid_state_authority"),
      "YAML state instructions must be refused",
    );
    workflow.instructions = "Read runtime state through the supported status operation.";
    workflow.reads = ["state/runtime.yml"];
    assert(
      validateCatalog(catalog, skillRoot).some((item) => item.code === "catalog_graph.workflow.invalid_state_authority"),
      "YAML state reads must be refused",
    );
    workflow.reads = ["state/business-state.json"];
    assert(
      !validateCatalog(catalog, skillRoot).some((item) => item.code === "catalog_graph.workflow.invalid_state_authority"),
      "current runtime state must remain supported",
    );
  });
}
