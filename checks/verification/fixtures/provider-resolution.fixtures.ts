import { resolveProviderImplementation } from "../../../kernel/composition/providers.js";
import { definition, author } from "./binding-resolution.fixtures.js";
import { assert, type Harness } from "./_harness.js";
function grouped() {
  const value = definition();
  value.providers = [{ id: "binding/vendor", version: "2.0.0", title: "Selected vendor", description: "One vendor across operation implementations" }];
  for (const implementation of value.implementations) implementation.provider = "binding/vendor";
  return value;
}
export function register(h: Harness) {
  h.check("provider resolution uses group version, operation and target rather than treating provider IDs as implementations", () => {
    const dependency = author(h, grouped()),
      request = { operation: "binding/build", provider: { id: "binding/vendor", version: "2.0.0" }, target: { platform: "ios", runtime: "swiftui" } };
    const found = resolveProviderImplementation([dependency], request);
    assert(
      found.implementation.id === "binding/native" && found.implementation.version === "1.0.0",
      "group did not resolve exact target implementation independently of provider version",
    );
    for (const invalid of [
      { ...request, provider: { id: "binding/native", version: "1.0.0" } },
      { ...request, provider: { id: "binding/vendor", version: "1.0.0" } },
      { ...request, target: { platform: "android", runtime: "compose" } },
      { ...request, operation: "binding/missing" },
    ]) {
      let refused = false;
      try {
        resolveProviderImplementation([dependency], invalid);
      } catch {
        refused = true;
      }
      assert(refused, "missing provider mapping fell through");
    }
  });
  h.check("ambiguous provider operation implementations refuse instead of first-match selection", () => {
    const value = grouped();
    value.implementations.push({ ...structuredClone(value.implementations[0]!), id: "binding/also-native" });
    const dependency = author(h, value);
    let refused = false;
    try {
      resolveProviderImplementation([dependency], {
        operation: "binding/build",
        provider: { id: "binding/vendor", version: "2.0.0" },
        target: { platform: "ios", runtime: "swiftui" },
      });
    } catch {
      refused = true;
    }
    assert(refused, "ambiguous implementation selected");
  });
}
