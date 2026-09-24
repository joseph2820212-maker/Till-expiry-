/** Jest mock for expo-haptics: records calls, never touches native. */
export const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' } as const;
export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' } as const;
export const notificationAsync = jest.fn(async () => {});
export const impactAsync = jest.fn(async () => {});
export const selectionAsync = jest.fn(async () => {});
export default { NotificationFeedbackType, ImpactFeedbackStyle, notificationAsync, impactAsync, selectionAsync };
