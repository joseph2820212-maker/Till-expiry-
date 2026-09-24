// In-memory SecureStore mock for Jest.
const store: Record<string, string> = {};

export const getItemAsync = jest.fn(async (key: string): Promise<string | null> => store[key] ?? null);
export const setItemAsync = jest.fn(async (key: string, value: string): Promise<void> => { store[key] = value; });
export const deleteItemAsync = jest.fn(async (key: string): Promise<void> => { delete store[key]; });
