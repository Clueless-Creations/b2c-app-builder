import type { ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

export interface KeyboardAvoidingScreenProps {
  children: ReactNode;
  dismissLabel?: string;
}

export function KeyboardAvoidingScreen({ children, dismissLabel = "Dismiss keyboard" }: KeyboardAvoidingScreenProps) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={dismissLabel} onPress={() => Keyboard.dismiss()}>
        <Text>{dismissLabel}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
