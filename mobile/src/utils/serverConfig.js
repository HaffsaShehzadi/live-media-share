import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_SERVER_URL = '@lms_server_url';
const STORAGE_KEY_USER_NAME = '@lms_user_name';

export function getAutoDetectedServerUrl() {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      Constants.manifest2?.extra?.expoClient?.hostUri ||
      Constants.manifest?.debuggerHost;

    if (hostUri) {
      const host = hostUri.split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:4000`;
      }
    }
  } catch (e) {
    // ignore
  }
  return 'http://10.113.48.40:4000';
}

export async function getServerUrl() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_SERVER_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch (e) {
    // ignore
  }
  return getAutoDetectedServerUrl();
}

export async function setServerUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(STORAGE_KEY_SERVER_URL, clean);
  return clean;
}

export async function getSavedUserName() {
  try {
    const name = await AsyncStorage.getItem(STORAGE_KEY_USER_NAME);
    return name || '';
  } catch (e) {
    return '';
  }
}

export async function saveUserName(name) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_USER_NAME, (name || '').trim());
  } catch (e) {
    // ignore
  }
}

/**
 * Extracts a clean meeting code even if the user pastes a full WhatsApp invite message or URL.
 */
export function extractRoomCode(input) {
  if (!input || typeof input !== 'string') return '';
  const text = input.trim().toLowerCase();

  // 1. Check if it contains /join/<code>
  const joinMatch = text.match(/\/join\/([a-z0-9-]+)/i);
  if (joinMatch && joinMatch[1]) {
    return joinMatch[1].toLowerCase();
  }

  // 2. Check if it contains standard xxx-xxxx-xxx meet code pattern anywhere in pasted text
  const meetPattern = text.match(/\b([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})\b/);
  if (meetPattern && meetPattern[1]) {
    return meetPattern[1];
  }

  // 3. Otherwise clean alphanumeric + dashes
  return text.replace(/[^a-z0-9-]/g, '');
}

/**
 * Generates a fallback local Google Meet style code in case user starts offline/instant
 */
export function generateLocalMeetCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const part = (len) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(3)}-${part(4)}-${part(3)}`;
}
