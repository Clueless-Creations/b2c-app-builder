import { Tabs } from "expo-router";
import { TAB_SCREENS } from "../../src/navigation/route-graph";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name={TAB_SCREENS[0]} />
      <Tabs.Screen name={TAB_SCREENS[1]} />
    </Tabs>
  );
}
