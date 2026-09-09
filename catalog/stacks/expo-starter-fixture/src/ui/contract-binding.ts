export const EXPO_UI_ADAPTER_MANIFEST = "surfaces/ui-library/adapters/expo.json";

export const EXPO_UI_CONTRACT_BINDINGS = [
  { contractId: "feedback.empty-state", status: "specified-not-adapted" as const },
  { contractId: "feedback.skeleton", status: "specified-not-adapted" as const },
  { contractId: "feedback.haptics", status: "specified-not-adapted" as const },
  { contractId: "input.keyboard-behavior", status: "specified-not-adapted" as const },
  { contractId: "interaction.press-feedback", status: "specified-not-adapted" as const },
] as const;
