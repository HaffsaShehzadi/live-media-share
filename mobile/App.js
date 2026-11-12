import React, { useState, useEffect } from 'react';
import { Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import MeetingRoomScreen from './src/screens/MeetingRoomScreen';
import {
  extractRoomCode,
  getServerUrl,
  getSavedUserName,
} from './src/utils/serverConfig';

export default function App() {
  const [activeSession, setActiveSession] = useState(null);

  // Handle Deep Links (e.g. livemediashare://join/abc-defg-hij)
  useEffect(() => {
    const handleDeepLink = async (url) => {
      if (!url) return;
      if (url.includes('/join/')) {
        const roomId = extractRoomCode(url);
        if (roomId) {
          const serverUrl = await getServerUrl();
          const userName = (await getSavedUserName()) || 'Mobile-User';
          setActiveSession({
            roomId,
            userName,
            serverUrl,
            initialMode: 'camera',
          });
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    const sub = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      sub && sub.remove && sub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#090d16" />
      {activeSession ? (
        <MeetingRoomScreen
          roomId={activeSession.roomId}
          userName={activeSession.userName}
          serverUrl={activeSession.serverUrl}
          initialMode={activeSession.initialMode}
          onLeave={() => setActiveSession(null)}
        />
      ) : (
        <HomeScreen onJoinMeeting={(session) => setActiveSession(session)} />
      )}
    </SafeAreaProvider>
  );
}
