import { Link } from "expo-router";
import { Text } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";
import { EmptyState } from "../ui/empty-state";
import { KeyboardAvoidingScreen } from "../ui/keyboard-behavior";

export function NotFoundScreen() {
  const empty = surfaceState("empty", "This static route does not exist.");
  return (
    <KeyboardAvoidingScreen>
      <EmptyState title="Not found" message={empty.message ?? "Missing route."} />
      <Text>
        <Link href={ROUTE_HREFS.home}>Home</Link>
      </Text>
    </KeyboardAvoidingScreen>
  );
}
