import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ROOT_STACK_SCREENS } from "../src/navigation/route-graph";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack>
        <Stack.Screen name={ROOT_STACK_SCREENS[0]} />
        <Stack.Screen name={ROOT_STACK_SCREENS[1]} options={{ presentation: "modal" }} />
        <Stack.Screen name={ROOT_STACK_SCREENS[2]} />
      </Stack>
    </SafeAreaProvider>
  );
}
