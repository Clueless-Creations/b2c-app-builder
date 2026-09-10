import { Link, router } from "expo-router";
import { Text, View } from "react-native";
import { nativeCapabilityStatus } from "../native/capability-status";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";
import { EmptyState } from "../ui/empty-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";
import { PressFeedback } from "../ui/press-feedback";
import { playSemanticHaptic } from "../ui/haptics";

export function HomeScreen() {
  const empty = surfaceState("empty", "No items yet.");
  const capability = nativeCapabilityStatus();
  return (
    <KeyboardAvoidingScreen>
      <EmptyState
        title="Home"
        message={empty.message ?? "No items yet."}
        actionLabel="Open settings"
        onAction={() => {
          void playSemanticHaptic("selection");
          router.push(ROUTE_HREFS.settings);
        }}
      />
      <Text>{capability.message}</Text>
      <PressFeedback onPress={() => void playSemanticHaptic("selection")}>
        <Link href={ROUTE_HREFS.modal}>Open modal</Link>
      </PressFeedback>
      <PressFeedback onPress={() => void playSemanticHaptic("selection")}>
        <Link href={ROUTE_HREFS.detail("1")}>Open detail</Link>
      </PressFeedback>
      <View>
        <Link href={ROUTE_HREFS.settings}>Settings</Link>
      </View>
    </KeyboardAvoidingScreen>
  );
}
