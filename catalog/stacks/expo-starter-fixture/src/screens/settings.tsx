import { Link, router } from "expo-router";
import { Text } from "react-native";
import { applyLocalSessionEvent, currentLocalSession } from "../session/local-session";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";
import { PressFeedback } from "../ui/press-feedback";
import { Skeleton } from "../ui/skeleton";
import { playSemanticHaptic } from "../ui/haptics";

export function SettingsScreen() {
  const session = currentLocalSession();
  const state = surfaceState("ready");
  return (
    <KeyboardAvoidingScreen>
      <Skeleton loading={false}>
        <Text>{state.kind}</Text>
        <Text>{session.signedIn ? session.appUserId : "signed out"}</Text>
      </Skeleton>
      {session.signedIn ? (
        <PressFeedback
          onPress={() => {
            void playSemanticHaptic("selection");
            void applyLocalSessionEvent("account-switch", { incomingUserId: "local-user-b" });
          }}
        >
          <Text>Switch local account</Text>
        </PressFeedback>
      ) : null}
      <PressFeedback
        onPress={() => {
          void applyLocalSessionEvent("revoked").then(() => router.replace(ROUTE_HREFS.signIn));
        }}
      >
        <Text>Sign out</Text>
      </PressFeedback>
      <Link href={ROUTE_HREFS.home}>Home</Link>
    </KeyboardAvoidingScreen>
  );
}
