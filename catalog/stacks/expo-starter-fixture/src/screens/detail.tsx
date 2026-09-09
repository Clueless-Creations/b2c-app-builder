import { Link, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { ROUTE_HREFS } from "../navigation/route-graph";
import { surfaceState } from "../states/surface-state";

export function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = surfaceState("ready");
  return (
    <View>
      <Text>{id}</Text>
      <Text>{state.kind}</Text>
      <Link href={ROUTE_HREFS.home}>Back</Link>
    </View>
  );
}
