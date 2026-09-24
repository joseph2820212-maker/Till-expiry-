/** Jest mock for expo-notifications: an in-memory schedule, never touches native. */
type Req = { identifier: string; content: any; trigger: any };
let scheduled: Req[] = [];
let permission: 'granted' | 'denied' | 'undetermined' = 'undetermined';
let seq = 0;

export const SchedulableTriggerInputTypes = { DATE: 'date', DAILY: 'daily' } as const;
export const AndroidImportance = { DEFAULT: 3, HIGH: 4 } as const;

export const getPermissionsAsync = jest.fn(async () => ({ status: permission, granted: permission === 'granted', canAskAgain: permission !== 'denied' }));
export const requestPermissionsAsync = jest.fn(async () => { if (permission === 'undetermined') permission = 'granted'; return { status: permission, granted: permission === 'granted', canAskAgain: permission !== 'denied' }; });
export const setNotificationChannelAsync = jest.fn(async () => null);
export const setNotificationHandler = jest.fn();
export const scheduleNotificationAsync = jest.fn(async (req: { identifier?: string; content: any; trigger: any }) => {
  const identifier = req.identifier ?? `n${++seq}`;
  scheduled = scheduled.filter(s => s.identifier !== identifier);
  scheduled.push({ identifier, content: req.content, trigger: req.trigger });
  return identifier;
});
export const cancelScheduledNotificationAsync = jest.fn(async (id: string) => { scheduled = scheduled.filter(s => s.identifier !== id); });
export const cancelAllScheduledNotificationsAsync = jest.fn(async () => { scheduled = []; });
export const getAllScheduledNotificationsAsync = jest.fn(async () => scheduled.map(s => ({ identifier: s.identifier, content: s.content, trigger: s.trigger })));

/** Test helpers (not part of the real API). */
export const __setPermission = (p: typeof permission) => { permission = p; };
export const __reset = () => { scheduled = []; permission = 'undetermined'; seq = 0; };
