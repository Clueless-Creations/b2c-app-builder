import { Link } from "expo-router";
import { Text, View } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";

export function SettingsScreen() {
  const state = surfaceState("ready");
  return (
    <View>
      <Text>{state.kind}</Text>
      <Link href={ROUTE_HREFS.home}>Home</Link>
    </View>
  );
}
