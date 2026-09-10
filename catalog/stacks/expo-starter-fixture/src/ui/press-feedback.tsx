import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { TOKEN_MOTION_DURATION_FAST } from "./tokens";

export interface PressFeedbackProps extends PressableProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function PressFeedback({ children, style, ...props }: PressFeedbackProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
  return (
    <Pressable
      {...props}
      nativeID={TOKEN_MOTION_DURATION_FAST}
      style={(state) => [
        style,
        state.pressed
          ? { opacity: reduceMotion ? 0.7 : 0.55, transform: [{ scale: reduceMotion ? 1 : 0.98 }] }
          : { opacity: 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}
