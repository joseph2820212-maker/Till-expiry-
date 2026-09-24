import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * useKeyboardMode — a debounced, flicker-free keyboard-active signal.
 *
 * A naive `keyboardDidShow → true / keyboardDidHide → false` flips state on every
 * raw event. On device those events are delayed and noisy: tapping a field, or
 * switching between fields, briefly emits hide→show, which makes anything gated on
 * it (e.g. AppBottomActions) flash in and out.
 *
 * This hook:
 *  - marks the keyboard active IMMEDIATELY when it starts opening (iOS `will`
 *    events fire before the animation, so the bottom bar never flashes);
 *  - DELAYS marking it closed, so a quick hide→show while switching fields is
 *    absorbed and never produces a flicker;
 *  - listens to both `will*` and `did*` events for cross-platform safety.
 *
 * Returns `true` while the keyboard is (or is about to be) open.
 */
export function useKeyboardMode(): boolean {
  const [keyboardActive, setKeyboardActive] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
    };
    const markOpen = () => {
      clearShowTimer();
      setKeyboardActive(true);
    };
    const markClosed = () => {
      clearShowTimer();
      // Delay re-showing bottom actions. This absorbs the noisy hide→show events
      // iOS/Android emit when the user switches between fields, so the bar never
      // flickers — it only returns once the keyboard is genuinely gone.
      showTimer.current = setTimeout(() => {
        setKeyboardActive(false);
        showTimer.current = null;
      }, 180);
    };

    const subs = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', markOpen),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', markClosed),
      // Extra safety where the will* events are unreliable or never fire.
      Keyboard.addListener('keyboardDidShow', markOpen),
      Keyboard.addListener('keyboardDidHide', markClosed),
    ];

    return () => {
      clearShowTimer();
      subs.forEach(sub => sub.remove());
    };
  }, []);

  return keyboardActive;
}
