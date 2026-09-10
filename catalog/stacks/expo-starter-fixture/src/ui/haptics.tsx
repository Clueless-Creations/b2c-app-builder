import { Platform } from "react-native";
import * as ExpoHaptics from "expo-haptics";

export type SemanticHapticIntent = "selection" | "confirmation" | "success" | "warning" | "error" | "unavailable";

export async function playSemanticHaptic(intent: SemanticHapticIntent): Promise<void> {
  if (Platform.OS === "web" || intent === "unavailable") return;
  try {
    switch (intent) {
      case "selection":
        await ExpoHaptics.selectionAsync();
        return;
      case "confirmation":
        await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
        return;
      case "success":
        await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
        return;
      case "warning":
        await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning);
        return;
      case "error":
        await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error);
        return;
      default: {
        const exhaustive: never = intent;
        throw new Error(`unhandled haptic intent: ${String(exhaustive)}`);
      }
    }
  } catch {
    return;
  }
}
