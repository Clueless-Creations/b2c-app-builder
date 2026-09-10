export const EXPO_UI_ADAPTER_MANIFEST = "surfaces/ui-library/adapters/expo.json";

export const EXPO_UI_CONTRACT_BINDINGS = [
  { contractId: "feedback.empty-state", status: "implemented" as const, symbol: "EmptyState" },
  { contractId: "feedback.skeleton", status: "implemented" as const, symbol: "Skeleton" },
  { contractId: "feedback.haptics", status: "implemented" as const, symbol: "playSemanticHaptic" },
  { contractId: "input.keyboard-behavior", status: "implemented" as const, symbol: "KeyboardAvoidingScreen" },
  { contractId: "interaction.press-feedback", status: "implemented" as const, symbol: "PressFeedback" },
] as const;
