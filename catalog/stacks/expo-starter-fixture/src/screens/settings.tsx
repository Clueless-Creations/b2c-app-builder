import { Link } from "expo-router";
import { Text } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";
import { Skeleton } from "../ui/skeleton";

export function SettingsScreen() {
  const state = surfaceState("ready");
  return (
    <KeyboardAvoidingScreen>
      <Skeleton loading={false}>
        <Text>{state.kind}</Text>
      </Skeleton>
      <Link href={ROUTE_HREFS.home}>Home</Link>
    </KeyboardAvoidingScreen>
  );
}
