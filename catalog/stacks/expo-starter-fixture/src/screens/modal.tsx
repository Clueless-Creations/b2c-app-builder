import { Link } from "expo-router";
import { Text } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";
import { playSemanticHaptic } from "../ui/haptics";

export function ModalScreen() {
  const state = surfaceState("ready");
  return (
    <KeyboardAvoidingScreen>
      <Text>{state.kind}</Text>
      <Link href={ROUTE_HREFS.home} onPress={() => void playSemanticHaptic("confirmation")}>
        Close
      </Link>
    </KeyboardAvoidingScreen>
  );
}
