import { Link } from "expo-router";
import { Text, View } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";

export function HomeScreen() {
  const state = surfaceState("ready");
  return (
    <View>
      <Text>{state.kind}</Text>
      <Link href={ROUTE_HREFS.modal}>Open modal</Link>
      <Link href={ROUTE_HREFS.detail("1")}>Open detail</Link>
      <Link href={ROUTE_HREFS.settings}>Settings</Link>
    </View>
  );
}
