import { Link, router } from "expo-router";
import { Text, View } from "react-native";
import { nativeCapabilityStatus } from "../native/capability-status";
import { notificationRestoreHref } from "../notifications/handoff";
import { listLocalCacheNotes } from "../offline/local-cache";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { permissionSafeState } from "../permissions/safe-state";
import { currentLocalSession } from "../session/local-session";
import { surfaceState } from "../states/surface-state";
import { EmptyState } from "../ui/empty-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";
import { PressFeedback } from "../ui/press-feedback";
import { playSemanticHaptic } from "../ui/haptics";

export function HomeScreen() {
  const session = currentLocalSession();
  const notes = listLocalCacheNotes(session.appUserId);
  const permission = permissionSafeState({ platform: "web", outcome: "denied" });
  const restore = notificationRestoreHref({ tokenOk: true, receiptOk: true, itemId: "1" });
  const empty = surfaceState("empty", session.signedIn ? "No local notes yet." : "Sign in locally to use the cache.");
  const capability = nativeCapabilityStatus();
  return (
    <KeyboardAvoidingScreen>
      <EmptyState
        title="Home"
        message={empty.message ?? "No items yet."}
        actionLabel={session.signedIn ? "Open settings" : "Sign in"}
        onAction={() => {
          void playSemanticHaptic("selection");
          router.push(session.signedIn ? ROUTE_HREFS.settings : ROUTE_HREFS.signIn);
        }}
      />
      <Text>{session.signedIn ? `Signed in as ${session.appUserId}` : "Signed out"}</Text>
      <Text>{`Local notes: ${notes.length}`}</Text>
      <Text>{permission.message}</Text>
      <Text>{capability.message}</Text>
      {restore ? (
        <PressFeedback onPress={() => router.push(restore)}>
          <Text>Restore notification route</Text>
        </PressFeedback>
      ) : null}
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
