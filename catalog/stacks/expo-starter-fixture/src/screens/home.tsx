import { Link, router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { nativeCapabilityStatus } from "../native/capability-status";
import { notificationRestoreHref } from "../notifications/handoff";
import { listLocalCacheNotes, reopenLocalCache, writeLocalCacheNote } from "../offline/local-cache";
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
  const [, setTick] = useState(0);
  const notes = listLocalCacheNotes(session.appUserId);
  const permission = permissionSafeState({ platform: "web", outcome: "denied" });
  const restore = notificationRestoreHref({ tokenOk: true, receiptOk: true, itemId: "1" });
  const owner = session.appUserId;
  const empty = surfaceState("empty", session.signedIn ? "No local notes yet." : "Sign in locally to use the cache.");
  const capability = nativeCapabilityStatus();
  return (
    <KeyboardAvoidingScreen>
      {notes.length === 0 ? (
        <EmptyState
          title="Home"
          message={empty.message ?? "No items yet."}
          actionLabel={session.signedIn ? "Open settings" : "Sign in"}
          onAction={() => {
            void playSemanticHaptic("selection");
            router.push(session.signedIn ? ROUTE_HREFS.settings : ROUTE_HREFS.signIn);
          }}
        />
      ) : (
        notes.map((note) => <Text key={note.id}>{note.body}</Text>)
      )}
      <Text>{session.signedIn ? `Signed in as ${session.appUserId}` : "Signed out"}</Text>
      <Text>{`Local notes: ${notes.length}`}</Text>
      {session.signedIn && owner ? (
        <PressFeedback
          onPress={() => {
            void playSemanticHaptic("selection");
            writeLocalCacheNote({
              id: `note-${notes.length + 1}`,
              owner,
              body: "local cache only",
            });
            setTick((value) => value + 1);
          }}
        >
          <Text>Add local note</Text>
        </PressFeedback>
      ) : null}
      <PressFeedback
        onPress={() => {
          void playSemanticHaptic("selection");
          reopenLocalCache();
          setTick((value) => value + 1);
        }}
      >
        <Text>Reopen local cache</Text>
      </PressFeedback>
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
