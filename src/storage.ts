import AsyncStorage from '@react-native-async-storage/async-storage';
import { DynastyState } from './engine';

const STORAGE_KEY = 'gridiron_dynasty_save_v1';

export async function saveDynastyState(state: DynastyState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to save dynasty state:', err);
  }
}

export async function loadDynastyState(): Promise<DynastyState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DynastyState;
  } catch (err) {
    console.warn('Failed to load dynasty state:', err);
    return null;
  }
}

export async function clearDynastyState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear dynasty state:', err);
  }
}
