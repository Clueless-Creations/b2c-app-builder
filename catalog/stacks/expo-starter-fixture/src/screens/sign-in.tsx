import { router } from "expo-router";
import { Text } from "react-native";
import { applyLocalSessionEvent } from "../session/local-session";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";
import { PressFeedback } from "../ui/press-feedback";
import { playSemanticHaptic } from "../ui/haptics";

export function SignInScreen() {
  const state = surfaceState("ready", "Local session only. Not an identity provider.");
  return (
    <KeyboardAvoidingScreen>
      <Text>{state.message}</Text>
      <PressFeedback
        onPress={() => {
          void playSemanticHaptic("confirmation");
          void applyLocalSessionEvent("sign-in", { incomingUserId: "local-user", callbackTrusted: true }).then(() => {
            router.replace(ROUTE_HREFS.home);
          });
        }}
      >
        <Text>Sign in locally</Text>
      </PressFeedback>
      <PressFeedback
        onPress={() => {
          void applyLocalSessionEvent("cancelled");
        }}
      >
        <Text>Cancel</Text>
      </PressFeedback>
    </KeyboardAvoidingScreen>
  );
}
