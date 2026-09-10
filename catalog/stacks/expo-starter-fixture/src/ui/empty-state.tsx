import { Pressable, Text, View } from "react-native";

export interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View accessibilityRole="summary">
      <Text accessibilityRole="header">{title}</Text>
      <Text>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction}>
          <Text>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
