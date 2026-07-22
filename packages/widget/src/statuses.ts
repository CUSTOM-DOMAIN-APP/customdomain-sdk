/**
 * The widget's public state machine: 15 statuses with incumbent-identical names so
 * an incumbent tenant's step-tracking migrates unchanged (spec §1.6). Internally
 * the widget has more screens (~33 across branches); each maps onto exactly one
 * public status, emitted to the SDK on every transition.
 */
export type Status =
  | "INITIAL"
  | "ENTER_DOMAIN"
  | "DOMAIN_ANALYSIS"
  | "DOMAIN_SETUP"
  | "IN_PROGRESS"
  | "EXISTING_RECORDS"
  | "LOGIN"
  | "LOGIN_2FA"
  | "MANUAL_CONFIGURATION"
  | "PROVIDER_MANUAL_SELECTION"
  | "EXIT_WITH_ERROR"
  | "DKIM_SETUP"
  | "FINISHED_SUCCESSFULLY"
  | "FINISHED_SUCCESSFULLY_MANUAL"
  | "FINISHED_SUCCESSFULLY_LINK_SHARED";

/**
 * Error catalog (spec §1.6): open union, incumbent-compatible codes. Every error
 * surfaced to the SDK carries {code, title, details}.
 */
export const ERROR_CODES = [
  "AccessDeniedError", // provider denied the OAuth consent
  "AuthCodeError", // code exchange failed
  "InvalidCredentialsError", // Mode D login rejected
  "InvalidDomainError", // malformed/unsupported domain input
  "EmailNotVerifiedError",
  "SpfRecordsLimitError",
  "SpfRecordsLengthError",
  "GenericError",
  "TimeoutError", // propagation window elapsed
  "UserInputTimeoutError", // idle too long on an interactive screen
  "SessionError", // widget JWT expired/invalid
  "ProviderError", // provider API rejected the write
  "PurchaseDomainError",
  "RegistroDomainInTransition",
  "DomainConnectError", // DC apply-URL flow failed
  "PopupBlockedError", // browser blocked the OAuth window
  "RateLimitError", // 429 from the control-plane
  "NetworkError", // fetch-level failure
  // Entri-parity codes the control-plane now emits verbatim (CP-PAR-2): the
  // domain's NS delegation is missing/unusable, and the provider rejected the
  // authorization. Kept as the exact PascalCase the server sends so a migrating
  // integrator branching on either receives it unchanged.
  "InvalidNameservers",
  "ProviderAuthenticationError",
  // 402 quota rejection (billing "quota_exceeded"): a distinct, branchable
  // plan-limit code so integrators can prompt an upgrade instead of collapsing
  // it into GenericError (F8 / WS5-6).
  "PlanLimitError",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface WidgetError {
  code: ErrorCode | string;
  title: string;
  details?: string;
}

/** setup_type union surfaced in browser events (spec §1.6). */
export type SetupType = "automatic" | "manual" | "semiautomatic" | "sharedLogin" | "purchase";
