import { Link, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";
import { Skeleton } from "../ui/skeleton";

export function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = surfaceState(id ? "ready" : "empty", id ? undefined : "Missing item.");
  return (
    <KeyboardAvoidingScreen>
      <Skeleton loading={state.kind === "loading"}>
        <Text>{id ?? "none"}</Text>
        <Text>{state.kind}</Text>
        <Link href={ROUTE_HREFS.home}>Back</Link>
      </Skeleton>
    </KeyboardAvoidingScreen>
  );
}
