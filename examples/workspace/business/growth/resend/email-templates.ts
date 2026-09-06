export type LaunchEmailCategory =
  | 'transactional'
  | 'lifecycle'
  | 'marketing'
  | 'support';

export type LaunchEmailTag = {
  name: string;
  value: string;
};

export type LaunchEmail = {
  purpose: string;
  category: LaunchEmailCategory;
  subject: string;
  preview: string;
  html: string;
  text: string;
  tags: LaunchEmailTag[];
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKeyHint: string;
};

export type LaunchEmailDesignSystem = {
  source: string;
  colors: {
    canvas: string;
    surface: string;
    border: string;
    text: string;
    mutedText: string;
    accent: string;
    accentText: string;
    link: string;
    footerText: string;
  };
  typography: {
    bodyFontFamily: string;
    headingFontFamily: string;
    bodySize: string;
    bodyLineHeight: string;
    headingSize: string;
    headingLineHeight: string;
    footerSize: string;
  };
  radius: {
    card: string;
    button: string;
  };
  spacing: {
    pagePadding: string;
    cardPadding: string;
    logoGap: string;
    buttonMargin: string;
    footerPadding: string;
  };
  email: {
    maxWidth: string;
    logoHeight: string;
  };
};

export type LaunchEmailBrand = {
  appName: string;
  appUrl: string;
  supportEmail: string;
  fromName?: string;
  logoUrl?: string;
  primaryColor?: string;
  mailingAddress?: string;
  preferencesUrl?: string;
  unsubscribeUrl?: string;
  designSystem: LaunchEmailDesignSystem;
};

type BaseInput = {
  brand: LaunchEmailBrand;
  recipientName?: string;
};

export type WaitlistConfirmationInput = BaseInput & {
  referralUrl?: string;
  nextStepUrl?: string;
};

export type SupportRequestReceivedInput = BaseInput & {
  ticketId: string;
  issueSummary?: string;
  expectedResponseTime?: string;
  supportUrl?: string;
};

export type SupportReplyInput = BaseInput & {
  ticketId: string;
  message: string;
  nextStepUrl?: string;
};

export type EntitlementGrantedInput = BaseInput & {
  entitlementName: string;
  accessDuration: string;
  refreshInstructions?: string;
  manageSubscriptionUrl?: string;
};

export type RestorePurchasesHelpInput = BaseInput & {
  platform: 'ios' | 'android' | 'web' | 'unknown';
  restoreUrl?: string;
  extraStep?: string;
};

export type PaymentFailedInput = BaseInput & {
  planName: string;
  billingPortalUrl: string;
  retryByDate?: string;
};

export type TrialExpiringInput = BaseInput & {
  planName: string;
  trialEndsAt: string;
  manageSubscriptionUrl: string;
};

export type AccountDeletionConfirmedInput = BaseInput & {
  deletionCompletedAt: string;
  retainedDataNote?: string;
  restartUrl?: string;
};

type ResolvedEmailDesign = {
  canvas: string;
  surface: string;
  border: string;
  text: string;
  mutedText: string;
  accent: string;
  accentText: string;
  link: string;
  footerText: string;
  bodyFontFamily: string;
  headingFontFamily: string;
  bodySize: string;
  bodyLineHeight: string;
  headingSize: string;
  headingLineHeight: string;
  footerSize: string;
  cardRadius: string;
  buttonRadius: string;
  pagePadding: string;
  cardPadding: string;
  logoGap: string;
  buttonMargin: string;
  footerPadding: string;
  maxWidth: string;
  logoHeight: string;
};

function resolveDesignSystem(brand: LaunchEmailBrand): ResolvedEmailDesign {
  const design = brand.designSystem;

  return {
    canvas: design?.colors?.canvas ?? '#f6f7f9',
    surface: design?.colors?.surface ?? '#ffffff',
    border: design?.colors?.border ?? '#e5e7eb',
    text: design?.colors?.text ?? '#111827',
    mutedText: design?.colors?.mutedText ?? '#374151',
    accent: design?.colors?.accent ?? brand.primaryColor ?? '#111827',
    accentText: design?.colors?.accentText ?? '#ffffff',
    link: design?.colors?.link ?? design?.colors?.accent ?? brand.primaryColor ?? '#111827',
    footerText: design?.colors?.footerText ?? '#6b7280',
    bodyFontFamily: design?.typography?.bodyFontFamily ?? 'Arial, sans-serif',
    headingFontFamily: design?.typography?.headingFontFamily ?? design?.typography?.bodyFontFamily ?? 'Arial, sans-serif',
    bodySize: design?.typography?.bodySize ?? '15px',
    bodyLineHeight: design?.typography?.bodyLineHeight ?? '1.6',
    headingSize: design?.typography?.headingSize ?? '24px',
    headingLineHeight: design?.typography?.headingLineHeight ?? '1.2',
    footerSize: design?.typography?.footerSize ?? '12px',
    cardRadius: design?.radius?.card ?? '12px',
    buttonRadius: design?.radius?.button ?? '8px',
    pagePadding: design?.spacing?.pagePadding ?? '32px 16px',
    cardPadding: design?.spacing?.cardPadding ?? '28px',
    logoGap: design?.spacing?.logoGap ?? '24px',
    buttonMargin: design?.spacing?.buttonMargin ?? '28px 0',
    footerPadding: design?.spacing?.footerPadding ?? '18px 4px',
    maxWidth: design?.email?.maxWidth ?? '560px',
    logoHeight: design?.email?.logoHeight ?? '36px',
  };
}

/**
 * Deliberately local, not an import of `tooling/lib/html.ts`. This file is
 * payload: it is copied into a launched business repo, where nothing under
 * `tooling/` exists. The extra `&#39;` rule is also correct here and wrong
 * there — email HTML passes through client rewriters that do not all agree on
 * attribute quoting, while every page the skill renders is double-quoted and
 * byte-compared against a fresh render.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function greeting(name?: string): string {
  return name ? `Hi ${name},` : 'Hi,';
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function lineBreakText(lines: Array<string | undefined>): string {
  return lines.filter(Boolean).map((line) => cleanText(line ?? '')).join('\n\n');
}

function oneClickUnsubscribeHeaders(unsubscribeUrl?: string): Record<string, string> | undefined {
  if (!unsubscribeUrl) return undefined;

  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function button(label: string, href: string, brand: LaunchEmailBrand): string {
  const design = resolveDesignSystem(brand);

  return `
    <p style="margin:${escapeHtml(design.buttonMargin)};">
      <a href="${escapeHtml(href)}" style="background:${escapeHtml(design.accent)};border-radius:${escapeHtml(design.buttonRadius)};color:${escapeHtml(design.accentText)};display:inline-block;font-family:${escapeHtml(design.bodyFontFamily)};font-size:${escapeHtml(design.bodySize)};font-weight:700;line-height:44px;padding:0 18px;text-decoration:none;">
        ${escapeHtml(label)}
      </a>
    </p>
  `;
}

function renderLayout(input: {
  brand: LaunchEmailBrand;
  preview: string;
  title: string;
  bodyHtml: string;
  category: LaunchEmailCategory;
}): string {
  const { brand, preview, title, bodyHtml, category } = input;
  const design = resolveDesignSystem(brand);
  const brandName = escapeHtml(brand.fromName ?? brand.appName);
  const footerParts = [
    `Sent by ${brandName}.`,
    `Need help? Email <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${escapeHtml(design.link)};">${escapeHtml(brand.supportEmail)}</a>.`,
    brand.preferencesUrl && category !== 'transactional'
      ? `<a href="${escapeHtml(brand.preferencesUrl)}" style="color:${escapeHtml(design.link)};">Manage email preferences</a>.`
      : undefined,
    brand.mailingAddress ? escapeHtml(brand.mailingAddress) : undefined,
    brand.designSystem?.source ? `Email styling derived from ${escapeHtml(brand.designSystem.source)}.` : undefined,
  ].filter(Boolean);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="x-preview" content="${escapeHtml(preview)}">
  </head>
  <body style="background:${escapeHtml(design.canvas)};margin:0;padding:0;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
    <main style="font-family:${escapeHtml(design.bodyFontFamily)};margin:0 auto;max-width:${escapeHtml(design.maxWidth)};padding:${escapeHtml(design.pagePadding)};">
      <section style="background:${escapeHtml(design.surface)};border:1px solid ${escapeHtml(design.border)};border-radius:${escapeHtml(design.cardRadius)};padding:${escapeHtml(design.cardPadding)};">
        ${
          brand.logoUrl
            ? `<img alt="${brandName}" src="${escapeHtml(brand.logoUrl)}" style="display:block;height:${escapeHtml(design.logoHeight)};margin:0 0 ${escapeHtml(design.logoGap)};width:auto;">`
            : `<p style="color:${escapeHtml(design.text)};font-family:${escapeHtml(design.headingFontFamily)};font-size:16px;font-weight:700;margin:0 0 ${escapeHtml(design.logoGap)};">${brandName}</p>`
        }
        <h1 style="color:${escapeHtml(design.text)};font-family:${escapeHtml(design.headingFontFamily)};font-size:${escapeHtml(design.headingSize)};line-height:${escapeHtml(design.headingLineHeight)};margin:0 0 16px;">${escapeHtml(title)}</h1>
        <div style="color:${escapeHtml(design.mutedText)};font-family:${escapeHtml(design.bodyFontFamily)};font-size:${escapeHtml(design.bodySize)};line-height:${escapeHtml(design.bodyLineHeight)};">
          ${bodyHtml}
        </div>
      </section>
      <footer style="color:${escapeHtml(design.footerText)};font-family:${escapeHtml(design.bodyFontFamily)};font-size:${escapeHtml(design.footerSize)};line-height:1.5;padding:${escapeHtml(design.footerPadding)};">
        ${footerParts.map((part) => `<p style="margin:0 0 6px;">${part}</p>`).join('')}
      </footer>
    </main>
  </body>
</html>`;
}

function launchEmail(input: {
  brand: LaunchEmailBrand;
  purpose: string;
  category: LaunchEmailCategory;
  subject: string;
  preview: string;
  title: string;
  bodyHtml: string;
  text: string;
  tags: LaunchEmailTag[];
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKeyHint: string;
}): LaunchEmail {
  return {
    purpose: input.purpose,
    category: input.category,
    subject: input.subject,
    preview: input.preview,
    html: renderLayout({
      brand: input.brand,
      preview: input.preview,
      title: input.title,
      bodyHtml: input.bodyHtml,
      category: input.category,
    }),
    text: input.text,
    tags: input.tags,
    replyTo: input.replyTo,
    headers: input.headers,
    idempotencyKeyHint: input.idempotencyKeyHint,
  };
}

export function waitlistConfirmationEmail(input: WaitlistConfirmationInput): LaunchEmail {
  const appName = input.brand.appName;
  const title = `You are on the ${appName} waitlist`;
  const design = resolveDesignSystem(input.brand);
  const referral = input.referralUrl
    ? `Share your invite link here: ${input.referralUrl}`
    : undefined;

  return launchEmail({
    brand: input.brand,
    purpose: 'Confirm waitlist signup and nudge referral/share action.',
    category: 'lifecycle',
    subject: `You are on the ${appName} waitlist`,
    preview: `We saved your spot for ${appName}.`,
    title,
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>Your spot is saved. We will send the next update when early access opens.</p>
      ${input.nextStepUrl ? button('See what is next', input.nextStepUrl, input.brand) : ''}
      ${input.referralUrl ? `<p>Your invite link: <a href="${escapeHtml(input.referralUrl)}" style="color:${escapeHtml(design.link)};">${escapeHtml(input.referralUrl)}</a></p>` : ''}
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      `Your spot is saved for ${appName}. We will send the next update when early access opens.`,
      input.nextStepUrl ? `Next step: ${input.nextStepUrl}` : undefined,
      referral,
    ]),
    tags: [
      { name: 'category', value: 'waitlist' },
      { name: 'template', value: 'waitlist_confirmation' },
    ],
    headers: oneClickUnsubscribeHeaders(input.brand.unsubscribeUrl),
    idempotencyKeyHint: 'waitlist/{email-or-user-id}',
  });
}

export function supportRequestReceivedEmail(input: SupportRequestReceivedInput): LaunchEmail {
  const responseTime = input.expectedResponseTime ?? 'within one business day';
  const title = `We got your request${input.ticketId ? ` #${input.ticketId}` : ''}`;

  return launchEmail({
    brand: input.brand,
    purpose: 'Acknowledge an inbound support request and set response expectations.',
    category: 'support',
    subject: `${input.brand.appName} support request received`,
    preview: `We received your message and will reply ${responseTime}.`,
    title,
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>Thanks for reaching out. We received your message and will reply ${escapeHtml(responseTime)}.</p>
      ${input.issueSummary ? `<p><strong>Summary:</strong> ${escapeHtml(input.issueSummary)}</p>` : ''}
      ${input.supportUrl ? button('View support request', input.supportUrl, input.brand) : ''}
      <p>Please reply to this email if you need to add more detail.</p>
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      `Thanks for reaching out. We received your message and will reply ${responseTime}.`,
      input.issueSummary ? `Summary: ${input.issueSummary}` : undefined,
      input.supportUrl ? `View support request: ${input.supportUrl}` : undefined,
      'Please reply to this email if you need to add more detail.',
    ]),
    tags: [
      { name: 'category', value: 'support' },
      { name: 'template', value: 'support_received' },
    ],
    replyTo: input.brand.supportEmail,
    idempotencyKeyHint: `support-received/${input.ticketId}`,
  });
}

export function supportReplyEmail(input: SupportReplyInput): LaunchEmail {
  const title = `Update on request #${input.ticketId}`;

  return launchEmail({
    brand: input.brand,
    purpose: 'Send a human or agent-assisted customer support reply.',
    category: 'support',
    subject: `${input.brand.appName} support update`,
    preview: cleanText(input.message).slice(0, 120),
    title,
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>${escapeHtml(input.message)}</p>
      ${input.nextStepUrl ? button('Continue', input.nextStepUrl, input.brand) : ''}
      <p>If this did not solve it, reply and we will keep working from request #${escapeHtml(input.ticketId)}.</p>
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      input.message,
      input.nextStepUrl ? `Continue: ${input.nextStepUrl}` : undefined,
      `If this did not solve it, reply and we will keep working from request #${input.ticketId}.`,
    ]),
    tags: [
      { name: 'category', value: 'support' },
      { name: 'template', value: 'support_reply' },
    ],
    replyTo: input.brand.supportEmail,
    idempotencyKeyHint: `support-reply/${input.ticketId}/{message-id}`,
  });
}

export function entitlementGrantedEmail(input: EntitlementGrantedInput): LaunchEmail {
  const refreshInstructions =
    input.refreshInstructions ??
    'Open the app, go to Settings, and tap Restore Purchases or Refresh Access.';
  const title = `${input.brand.appName} access has been added`;

  return launchEmail({
    brand: input.brand,
    purpose: 'Tell a customer that a support or beta entitlement has been granted.',
    category: 'transactional',
    subject: `${input.brand.appName} access is ready`,
    preview: `Your ${input.entitlementName} access is active for ${input.accessDuration}.`,
    title,
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>We added <strong>${escapeHtml(input.entitlementName)}</strong> access to your account for ${escapeHtml(input.accessDuration)}.</p>
      <p>${escapeHtml(refreshInstructions)}</p>
      <p>This access grant does not change app-store billing, cancel a subscription, issue a refund, or create a paid subscription.</p>
      ${input.manageSubscriptionUrl ? button('Manage subscription', input.manageSubscriptionUrl, input.brand) : ''}
      <p>If the app still does not unlock, reply with the email or user ID shown in your app settings.</p>
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      `We added ${input.entitlementName} access to your account for ${input.accessDuration}.`,
      refreshInstructions,
      'This access grant does not change app-store billing, cancel a subscription, issue a refund, or create a paid subscription.',
      input.manageSubscriptionUrl ? `Manage subscription: ${input.manageSubscriptionUrl}` : undefined,
      'If the app still does not unlock, reply with the email or user ID shown in your app settings.',
    ]),
    tags: [
      { name: 'category', value: 'account_access' },
      { name: 'template', value: 'entitlement_granted' },
    ],
    replyTo: input.brand.supportEmail,
    idempotencyKeyHint: 'entitlement-granted/{user-id}/{entitlement-id}/{grant-id}',
  });
}

export function restorePurchasesHelpEmail(input: RestorePurchasesHelpInput): LaunchEmail {
  const platformLabel = input.platform === 'ios' ? 'iPhone or iPad' : input.platform === 'android' ? 'Android device' : 'device';
  const extraStep = input.extraStep ? `${input.extraStep}` : undefined;

  return launchEmail({
    brand: input.brand,
    purpose: 'Help a customer recover app access after a purchase or device change.',
    category: 'support',
    subject: `Restoring your ${input.brand.appName} access`,
    preview: 'Try these steps to refresh your purchase access.',
    title: 'Restore purchase access',
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>Try these steps on the ${escapeHtml(platformLabel)} where you bought access:</p>
      <ol>
        <li>Open ${escapeHtml(input.brand.appName)} and sign in with the same account.</li>
        <li>Open Settings or Account.</li>
        <li>Tap Restore Purchases or Refresh Access.</li>
        <li>Restart the app if the access screen does not update.</li>
        ${extraStep ? `<li>${escapeHtml(extraStep)}</li>` : ''}
      </ol>
      ${input.restoreUrl ? button('Open restore help', input.restoreUrl, input.brand) : ''}
      <p>If that does not work, reply with your app user ID and a screenshot of the purchase screen.</p>
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      `Try these steps on the ${platformLabel} where you bought access:`,
      `1. Open ${input.brand.appName} and sign in with the same account.`,
      '2. Open Settings or Account.',
      '3. Tap Restore Purchases or Refresh Access.',
      '4. Restart the app if the access screen does not update.',
      extraStep ? `5. ${extraStep}` : undefined,
      input.restoreUrl ? `Restore help: ${input.restoreUrl}` : undefined,
      'If that does not work, reply with your app user ID and a screenshot of the purchase screen.',
    ]),
    tags: [
      { name: 'category', value: 'support' },
      { name: 'template', value: 'restore_purchases_help' },
    ],
    replyTo: input.brand.supportEmail,
    idempotencyKeyHint: 'restore-help/{user-id}/{ticket-id}',
  });
}

export function paymentFailedEmail(input: PaymentFailedInput): LaunchEmail {
  const title = `Payment issue for ${input.planName}`;
  const retryCopy = input.retryByDate
    ? `Please update your billing details by ${input.retryByDate} to avoid losing access.`
    : 'Please update your billing details to keep access active.';

  return launchEmail({
    brand: input.brand,
    purpose: 'Recover a failed subscription payment without exposing billing details.',
    category: 'transactional',
    subject: `Update your ${input.brand.appName} billing details`,
    preview: retryCopy,
    title,
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>We could not complete the latest payment for ${escapeHtml(input.planName)}.</p>
      <p>${escapeHtml(retryCopy)}</p>
      ${button('Update billing', input.billingPortalUrl, input.brand)}
      <p>We do not collect card details by email. Use the secure billing page above.</p>
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      `We could not complete the latest payment for ${input.planName}.`,
      retryCopy,
      `Update billing: ${input.billingPortalUrl}`,
      'We do not collect card details by email. Use the secure billing page above.',
    ]),
    tags: [
      { name: 'category', value: 'billing' },
      { name: 'template', value: 'payment_failed' },
    ],
    replyTo: input.brand.supportEmail,
    idempotencyKeyHint: 'payment-failed/{user-id}/{invoice-or-event-id}',
  });
}

export function trialExpiringEmail(input: TrialExpiringInput): LaunchEmail {
  const title = `${input.planName} trial ends soon`;

  return launchEmail({
    brand: input.brand,
    purpose: 'Remind a trial user before subscription conversion or access change.',
    category: 'lifecycle',
    subject: `Your ${input.brand.appName} trial ends soon`,
    preview: `Your ${input.planName} trial ends ${input.trialEndsAt}.`,
    title,
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>Your ${escapeHtml(input.planName)} trial ends ${escapeHtml(input.trialEndsAt)}.</p>
      <p>You can manage the plan, cancel, or update billing before then.</p>
      ${button('Manage plan', input.manageSubscriptionUrl, input.brand)}
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      `Your ${input.planName} trial ends ${input.trialEndsAt}.`,
      'You can manage the plan, cancel, or update billing before then.',
      `Manage plan: ${input.manageSubscriptionUrl}`,
    ]),
    tags: [
      { name: 'category', value: 'trial' },
      { name: 'template', value: 'trial_expiring' },
    ],
    headers: oneClickUnsubscribeHeaders(input.brand.unsubscribeUrl),
    idempotencyKeyHint: 'trial-expiring/{user-id}/{trial-id}',
  });
}

export function accountDeletionConfirmedEmail(input: AccountDeletionConfirmedInput): LaunchEmail {
  const retainedData =
    input.retainedDataNote ??
    'Some records may be retained only where required for security, legal, tax, fraud-prevention, or platform compliance obligations.';

  return launchEmail({
    brand: input.brand,
    purpose: 'Confirm account or data deletion completion.',
    category: 'transactional',
    subject: `${input.brand.appName} account deletion confirmed`,
    preview: `Your deletion request was completed ${input.deletionCompletedAt}.`,
    title: 'Account deletion confirmed',
    bodyHtml: `
      <p>${escapeHtml(greeting(input.recipientName))}</p>
      <p>Your account deletion request was completed ${escapeHtml(input.deletionCompletedAt)}.</p>
      <p>${escapeHtml(retainedData)}</p>
      ${input.restartUrl ? button('Start again', input.restartUrl, input.brand) : ''}
      <p>If you did not request this, contact support immediately.</p>
    `,
    text: lineBreakText([
      greeting(input.recipientName),
      `Your account deletion request was completed ${input.deletionCompletedAt}.`,
      retainedData,
      input.restartUrl ? `Start again: ${input.restartUrl}` : undefined,
      'If you did not request this, contact support immediately.',
    ]),
    tags: [
      { name: 'category', value: 'privacy' },
      { name: 'template', value: 'account_deletion_confirmed' },
    ],
    replyTo: input.brand.supportEmail,
    idempotencyKeyHint: 'account-deletion-confirmed/{user-id}/{deletion-event-id}',
  });
}
