#!/usr/bin/env node
/**
 * check-email.ts — Email lane Present/Proven/Optimized validator.
 *
 * PRESENT  (warning when partial, error when done):
 *   - growth/EMAIL_OPS.md exists
 *   - sender map has at least one populated row (non-placeholder from address)
 *   - a sending domain is recorded (not resend.dev)
 *   - template inventory has at least one row
 *
 * PROVEN   (hard error when lane is done):
 *   - proof/email-domain-verified.* exists and is non-empty
 *   - proof/email-spf-dkim-pass.* exists and is non-empty
 *   - proof/email-test-send-log.* exists and is non-empty
 *   - SECRETS.md lists RESEND_API_KEY and references Doppler (keys not in raw .env)
 *
 * PRESENT+ (warning when partial, error when done — beyond template presence):
 *   - growth/EMAIL_OPS.md references the sender-domain DNS records (SPF and DKIM)
 *     that the proof artifacts attest to
 *   - growth/EMAIL_OPS.md documents unsubscribe handling
 *   - growth/EMAIL_OPS.md maps brand tokens from DESIGN.md (the resend
 *     email-templates.ts LaunchEmailDesignSystem contract)
 *
 * OPTIMIZED (warning always, regardless of lane status):
 *   - critical lifecycle automations are wired: trial-expiry, payment-failure,
 *     welcome/activation.  Missing or TODO rows fire warnings.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { asString, getPath, issue, loadProjectState, parseCliArgs, readText, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const state = loaded.state;

// ---------------------------------------------------------------------------
// Lane status
// ---------------------------------------------------------------------------
const emailStatus = state ? asString(getPath(state, "lanes.email.status"))?.toLowerCase() : undefined;
const emailDone = emailStatus === "succeeded";
const emailSkipped = emailStatus === "not_needed" || emailStatus === "deferred";

if (emailSkipped) {
  reportAndExit("Email lane check", issues);
  // No argument: honor the exit code reportAndExit set (errors still fail on the skip path).
  process.exit();
}

// Use "error" when done, "warning" when partial/unknown.
function presentSeverity(): "error" | "warning" {
  return emailDone ? "error" : "warning";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const emailOpsPath = "growth/EMAIL_OPS.md";
const emailOpsText = readText(args.root, emailOpsPath);

function readOptional(relativePath: string): string | undefined {
  return readText(args.root, relativePath);
}

/**
 * Glob a directory for files whose basename starts with the given prefix.
 * Returns all matching absolute paths.
 */
function globProof(root: string, prefix: string): string[] {
  const proofDir = path.join(root, "proof");
  if (!existsSync(proofDir) || !statSync(proofDir).isDirectory()) {
    return [];
  }
  return readdirSync(proofDir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(proofDir, name));
}

function proofFileExists(root: string, prefix: string): boolean {
  const matches = globProof(root, prefix);
  if (matches.length === 0) return false;
  // At least one match must be non-empty.
  return matches.some((filePath) => {
    try {
      return statSync(filePath).size > 0;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// PRESENT checks
// ---------------------------------------------------------------------------
if (!emailOpsText) {
  issues.push(
    issue(
      presentSeverity(),
      "email.doc_missing",
      "growth/EMAIL_OPS.md is required for the email lane. Copy business/growth/EMAIL_OPS.md and fill in the sender map, domain, and template inventory.",
      emailOpsPath,
    ),
  );
} else {
  // Check sender map has at least one non-placeholder from address.
  // A placeholder looks like "<!-- e.g. ..." or is blank.
  const senderMapPopulated = emailOpsText.split(/\r?\n/).some((line) => {
    // Table row with at least two pipe chars and a value that looks like a real email address.
    return /\|/.test(line) && /@[\w.-]+\.[a-z]{2,}/i.test(line) && !line.includes("<!--");
  });
  if (!senderMapPopulated) {
    issues.push(
      issue(
        presentSeverity(),
        "email.sender_map_unpopulated",
        "growth/EMAIL_OPS.md sender map has no populated from-address row. Add at least one real sender address to the sender map table.",
        emailOpsPath,
      ),
    );
  }

  // Check that a sending domain is recorded and is not resend.dev.
  const hasSendingDomain = /mail\.|notify\.|updates\.|transact\.|noreply\.|no-reply\.|hello\.|support\.|email\./.test(emailOpsText);
  // Only flag resend.dev when it appears to be used as an actual sending address or domain value,
  // not in a prohibition or documentation sentence (e.g. "resend.dev is not acceptable").
  const usesResendDevDomain = emailOpsText.split(/\r?\n/).some((line) => {
    if (!/resend\.dev/i.test(line)) return false;
    // Skip lines that are clearly documenting the prohibition.
    if (/not acceptable|not for production|do not use|instead of|avoid|prohibited|example.*not|cannot.*use/i.test(line)) return false;
    // Skip template-comment lines (backtick code or HTML comments used as prose).
    if (/`resend\.dev`/i.test(line) && /not|avoid|unacceptable|prohibit/i.test(line)) return false;
    // Flag when it looks like a real value: table cell, env var assignment, from: address.
    return /(@resend\.dev|from.*resend\.dev|resend\.dev.*@|\|\s*resend\.dev|=.*resend\.dev)/i.test(line);
  });
  if (usesResendDevDomain) {
    issues.push(
      issue(
        "error",
        "email.resend_dev_domain",
        "growth/EMAIL_OPS.md references resend.dev as a sending domain. Production sends require a verified custom domain or subdomain, not resend.dev.",
        emailOpsPath,
      ),
    );
  }
  if (!hasSendingDomain && !usesResendDevDomain) {
    issues.push(
      issue(
        presentSeverity(),
        "email.sending_domain_missing",
        "growth/EMAIL_OPS.md does not record a sending subdomain (e.g. mail.example.com). Fill in the Domain/DNS Status table before marking this lane done.",
        emailOpsPath,
      ),
    );
  }

  // Sender-domain DNS proof reference: the doc must name the SPF and DKIM
  // records the proof/email-spf-dkim-pass.* artifact attests to.
  if (!/\bSPF\b/i.test(emailOpsText) || !/\bDKIM\b/i.test(emailOpsText)) {
    issues.push(
      issue(
        presentSeverity(),
        "email.dns_proof_reference_missing",
        "growth/EMAIL_OPS.md does not reference the sender-domain DNS records (SPF and DKIM). Fill the Domain/DNS Status table so the proof artifacts have a documented basis.",
        emailOpsPath,
      ),
    );
  }

  // Unsubscribe handling must be documented, not implied.
  if (!/unsubscribe/i.test(emailOpsText)) {
    issues.push(
      issue(
        presentSeverity(),
        "email.unsubscribe_handling_missing",
        "growth/EMAIL_OPS.md does not document unsubscribe handling. Classify every sender-map row (transactional vs lifecycle/marketing) and record how lifecycle unsubscribes are honored.",
        emailOpsPath,
      ),
    );
  }

  // Brand tokens: production templates pull their design system from DESIGN.md
  // (business/growth/resend/email-templates.ts LaunchEmailDesignSystem contract).
  if (!emailOpsText.includes("DESIGN.md")) {
    issues.push(
      issue(
        presentSeverity(),
        "email.brand_tokens_missing",
        "growth/EMAIL_OPS.md does not record the DESIGN.md brand-token mapping. Email templates must pull colors/typography/radius/spacing from DESIGN.md (the email-templates.ts LaunchEmailDesignSystem contract) before production sends.",
        emailOpsPath,
      ),
    );
  }

  // Check template inventory has at least one entry.
  const hasTemplate =
    /email-templates\.ts|resend\/|\.tsx?|hosted.?template|resend business/i.test(emailOpsText) &&
    // Must appear in a table row, not just in a comment.
    emailOpsText.split(/\r?\n/).some((line) => /\|/.test(line) && /email-templates|\.tsx?|hosted.?template/i.test(line) && !line.includes("<!--"));
  if (!hasTemplate) {
    issues.push(
      issue(
        presentSeverity(),
        "email.template_inventory_missing",
        "growth/EMAIL_OPS.md does not list any email templates. Add at least one template reference to the sender map table.",
        emailOpsPath,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// PROVEN checks (hard errors regardless of partial/done when lane is done)
// ---------------------------------------------------------------------------
if (emailDone) {
  // Domain verification proof.
  if (!proofFileExists(args.root, "email-domain-verified")) {
    issues.push(
      issue(
        "error",
        "email.proof.domain_verified_missing",
        "Email lane is done but proof/email-domain-verified.* is missing or empty. Capture a Resend dashboard screenshot or CLI output confirming the sending domain is Verified.",
        "proof/email-domain-verified.*",
      ),
    );
  }

  // SPF + DKIM pass proof.
  if (!proofFileExists(args.root, "email-spf-dkim-pass")) {
    issues.push(
      issue(
        "error",
        "email.proof.spf_dkim_missing",
        "Email lane is done but proof/email-spf-dkim-pass.* is missing or empty. Capture MX Toolbox or Gmail header check output showing SPF=pass and DKIM=pass for the sending domain.",
        "proof/email-spf-dkim-pass.*",
      ),
    );
  }

  // Test-send log proof.
  if (!proofFileExists(args.root, "email-test-send-log")) {
    issues.push(
      issue(
        "error",
        "email.proof.test_send_missing",
        "Email lane is done but proof/email-test-send-log.* is missing or empty. Record a successful test transactional send to an external inbox (Gmail, iCloud, or Outlook).",
        "proof/email-test-send-log.*",
      ),
    );
  }

  // API keys via Doppler, not raw .env.
  const secretsText = readOptional("SECRETS.md") ?? readOptional("trust/secrets/SECRETS.md");
  if (!secretsText) {
    issues.push(
      issue(
        "error",
        "email.secrets_doc_missing",
        "Email lane is done but SECRETS.md is missing. RESEND_API_KEY must be routed through Doppler and documented in SECRETS.md before the email lane can be marked done.",
        "SECRETS.md",
      ),
    );
  } else {
    if (!secretsText.includes("RESEND_API_KEY")) {
      issues.push(
        issue(
          "error",
          "email.secrets.resend_key_unrouted",
          "SECRETS.md does not list RESEND_API_KEY. All Resend API keys must be documented and routed through Doppler before the email lane is done.",
          "SECRETS.md",
        ),
      );
    }
    if (!secretsText.toLowerCase().includes("doppler")) {
      issues.push(
        issue(
          "error",
          "email.secrets.doppler_not_referenced",
          "SECRETS.md does not reference Doppler. Resend API keys must be stored in Doppler, not raw .env files, before the email lane is done.",
          "SECRETS.md",
        ),
      );
    }
  }

  // Raw .env with Resend key is a hard error when done.
  const envText = readOptional(".env") ?? readOptional(".env.local");
  if (envText && /RESEND_API_KEY\s*=\s*[^\s#]+/.test(envText)) {
    issues.push(
      issue(
        "error",
        "email.secrets.resend_key_in_env",
        "RESEND_API_KEY found in a raw .env file. Route it through Doppler before marking the email lane done.",
        ".env",
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// OPTIMIZED checks (warnings — lifecycle automations)
// ---------------------------------------------------------------------------
if (emailOpsText) {
  // Check for the override comment that suppresses automation warnings.
  const automationOverride = /<!--\s*email-automation-override\s*:/i.test(emailOpsText);

  if (!automationOverride) {
    // Each entry: [label used in warning messages, regex to detect a "done or skipped" row]
    const criticalAutomations: Array<{ label: string; detectRegex: RegExp }> = [
      {
        label: "trial-expiry reminder",
        detectRegex: /trial[.\s-_]*expir/i,
      },
      {
        label: "payment-failure / billing recovery",
        detectRegex: /payment[.\s-_]*fail/i,
      },
      {
        label: "welcome / activation",
        detectRegex: /welcome\s*\/\s*activation|welcome.*activation|user\.created.*welcome|welcome.*user\.created/i,
      },
    ];

    for (const automation of criticalAutomations) {
      // Find the line(s) in growth/EMAIL_OPS.md that reference this automation.
      const matchingLines = emailOpsText.split(/\r?\n/).filter((line) => automation.detectRegex.test(line));

      if (matchingLines.length === 0) {
        // Automation section is entirely absent.
        issues.push(
          issue(
            "warning",
            `email.automation.${automation.label.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/, "")}`.replace(/ /g, "_"),
            `growth/EMAIL_OPS.md does not document the ${automation.label} lifecycle automation. Add a row to the automations table (done/skipped) or add <!-- email-automation-override: <reason> --> to suppress this warning.`,
            emailOpsPath,
          ),
        );
      } else {
        // Automation is documented — check it is not still TODO.
        const allTodo = matchingLines.every((line) => /TODO/i.test(line) && !/done|skipped/i.test(line));
        if (allTodo) {
          issues.push(
            issue(
              "warning",
              `email.automation.${automation.label.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/, "")}_todo`,
              `growth/EMAIL_OPS.md ${automation.label} automation row still reads TODO. Update the status to done or skipped, or add <!-- email-automation-override: <reason> --> to suppress this warning.`,
              emailOpsPath,
            ),
          );
        }
      }
    }
  }
}

reportAndExit("Email lane check", issues);
