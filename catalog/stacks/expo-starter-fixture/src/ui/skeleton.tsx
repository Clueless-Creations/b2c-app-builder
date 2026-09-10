import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { MOTION_DURATION_REVEAL_MS, TOKEN_MOTION_DURATION_REVEAL } from "./tokens";

export interface SkeletonProps {
  loading: boolean;
  children: ReactNode;
}

export function Skeleton({ loading, children }: SkeletonProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useState(() => new Animated.Value(0.4))[0];

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

  useEffect(() => {
    if (!loading || reduceMotion) {
      opacity.stopAnimation();
      opacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: MOTION_DURATION_REVEAL_MS, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: MOTION_DURATION_REVEAL_MS, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [loading, opacity, reduceMotion]);

  if (!loading) return children;
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity: reduceMotion ? 1 : opacity }}
      nativeID={TOKEN_MOTION_DURATION_REVEAL}
    >
      <View>{children}</View>
    </Animated.View>
  );
}
