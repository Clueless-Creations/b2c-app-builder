import { Link } from "expo-router";
import { Text, View } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";

export function ModalScreen() {
  const state = surfaceState("ready");
  return (
    <View>
      <Text>{state.kind}</Text>
      <Link href={ROUTE_HREFS.home}>Close</Link>
    </View>
  );
}
