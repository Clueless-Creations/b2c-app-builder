import { loadProductInstanceDocument, productYamlPath } from "../../../../catalog/ontology/instance-load.js";
import { readPlanningArtifact } from "../../../../kernel/session/planning-context.js";
import { issue, type Issue } from "../../../../tooling/lib/launch-state.js";
import { validateOfferTest } from "../research/offer-evidence.js";

/** A class.price is an accepted commercial decision, not a pricing hypothesis.
 * This content gate never substitutes for the host's legal_pricing effect authority. */
export function validateProductPriceEvidence(root: string, requireOffer = false, owner = ""): Issue[] {
  const issues: Issue[] = [];
  let hasPrice = false;
  try {
    hasPrice = loadProductInstanceDocument(productYamlPath(root)).instances.some((item) => item.classId === "class.price");
  } catch {
    return requireOffer ? [issue("error", "pricing.product_invalid", "Read a valid canonical product before approving prices.", "product.yaml")] : [];
  }
  if (!hasPrice && !requireOffer) return issues;
  const isDecider = (value: string) => {
    const name = value.trim();
    if (!name || /\b(agent|codex|claude|gpt|assistant|bot|automation|autopilot|ai)\b/i.test(name)) return false;
    // The opening build mandate is not an exact production-price approval.
    if (name === "Founder opening mandate") return false;
    return /\b(founder|owner)\b/i.test(name) || (owner.length > 2 && name.toLowerCase().includes(owner.toLowerCase()));
  };
  try {
    validateOfferTest(readPlanningArtifact(root, "strategy/OFFER_TEST.md")?.toString("utf8"), issues, isDecider);
  } catch {
    issues.push(
      issue(
        "error",
        "pricing.offer_unreadable",
        "The current offer evidence must resolve safely before approving a production price.",
        "strategy/OFFER_TEST.md",
      ),
    );
  }
  return issues;
}
