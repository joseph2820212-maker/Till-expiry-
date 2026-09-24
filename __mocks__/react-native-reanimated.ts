const Reanimated = {
  default: { call: () => {} },
  useSharedValue: (v: unknown) => ({ value: v }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (v: unknown) => v,
  withSpring: (v: unknown) => v,
  withSequence: (...args: unknown[]) => args[args.length - 1],
  withDelay: (_d: number, v: unknown) => v,
  Easing: { linear: (v: number) => v, ease: (v: number) => v },
  runOnJS: (fn: (...a: unknown[]) => unknown) => fn,
  createAnimatedComponent: (c: unknown) => c,
};
module.exports = Reanimated;
