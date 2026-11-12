/**
 * Test helper (0.6): simulateSetup(config, outcome) plays the widget's events into an OpenConfig's callbacks in the
 * order the widget sends them (protocol/protocol.json), with no iframe and no network. Use it to test your handlers,
 * or a setup store, against a fake provider. It never calls the control plane.
 */
import type { OpenConfig, SetupType } from "./index";

export type SimulatedOutcome =
  | { kind: "success"; setupType?: SetupType; provider?: string | null }
  | { kind: "error"; code: string; message?: string }
  | { kind: "fallback"; reason: string; provider?: string }
  | { kind: "cancel" };

export interface SimulateOptions {
  domain: string;
  /** The provider name the fake detects. */
  provider?: string;
}

/** Plays one setup, synchronously, and returns the statuses it reported. */
export function simulateSetup(config: OpenConfig, outcome: SimulatedOutcome, opts: SimulateOptions): string[] {
  const steps: string[] = [];
  const step = (s: string, extra: Record<string, unknown> = {}) => {
    steps.push(s);
    config.onStepChange?.({ step: s, domain: opts.domain, provider: opts.provider, ...extra });
  };
  step("DOMAIN_ANALYSIS");
  step("DOMAIN_SETUP");
  switch (outcome.kind) {
    case "success": {
      step("IN_PROGRESS");
      step("FINISHED_SUCCESSFULLY");
      const result = {
        jobId: "job_simulated",
        domain: opts.domain,
        setupType: outcome.setupType ?? "automatic",
        provider: outcome.provider === undefined ? opts.provider ?? null : outcome.provider,
        success: true as const,
      };
      config.onSuccess?.(result);
      config.onClose?.({ lastStatus: "FINISHED_SUCCESSFULLY", shared: false, manualScreenDisabled: false });
      break;
    }
    case "error": {
      const message = outcome.message ?? "Something went wrong.";
      step("EXIT_WITH_ERROR", { error: { code: outcome.code, title: message } });
      config.onError?.(Object.assign(new Error(message), { code: outcome.code }) as never);
      config.onClose?.({ lastStatus: "EXIT_WITH_ERROR", shared: false, manualScreenDisabled: false });
      break;
    }
    case "fallback": {
      config.onFallback?.({ reason: outcome.reason, provider: outcome.provider ?? opts.provider, screen: "manual" });
      step("MANUAL_CONFIGURATION");
      config.onClose?.({ lastStatus: "MANUAL_CONFIGURATION", shared: false, manualScreenDisabled: false });
      break;
    }
    case "cancel":
      config.onClose?.({ lastStatus: steps[steps.length - 1], shared: false, manualScreenDisabled: false });
      break;
  }
  return steps;
}
