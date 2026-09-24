import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent } from 'react-native';

/**
 * useKeyboardHeight — the live keyboard height (0 when closed).
 *
 * For bottom-sheet modals where KeyboardAvoidingView is unreliable (a sheet
 * rendered inside a RN <Modal> can end up hidden behind the keyboard): apply the
 * returned height as paddingBottom on the sheet's wrapper so the input always
 * sits above the keyboard. Kept in the shared hook layer so screens never wire
 * raw Keyboard listeners themselves.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const onShow = (e: KeyboardEvent) => setHeight(e?.endCoordinates?.height ?? 0);
    const onHide = () => setHeight(0);
    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];
    return () => subs.forEach(s => s.remove());
  }, []);
  return height;
}
