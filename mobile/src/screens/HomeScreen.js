import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Share,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getServerUrl,
  setServerUrl,
  getAutoDetectedServerUrl,
  getSavedUserName,
  saveUserName,
  extractRoomCode,
  generateLocalMeetCode,
} from '../utils/serverConfig';

export default function HomeScreen({ onJoinMeeting }) {
  const [userName, setUserName] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [serverUrl, setServerUrlState] = useState('');
  const [serverOnline, setServerOnline] = useState(false);
  const [checkingServer, setCheckingServer] = useState(true);

  // Modals
  const [newMeetingSheetVisible, setNewMeetingSheetVisible] = useState(false);
  const [createdRoomInfo, setCreatedRoomInfo] = useState(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [customServerInput, setCustomServerInput] = useState('');

  useEffect(() => {
    async function init() {
      const savedName = await getSavedUserName();
      if (savedName) {
        setUserName(savedName);
      } else {
        const randomNum = Math.floor(10 + Math.random() * 89);
        setUserName(`Phone-${randomNum}`);
      }

      const url = await getServerUrl();
      setServerUrlState(url);
      setCustomServerInput(url);
      checkServerHealth(url);
    }
    init();
  }, []);

  const checkServerHealth = async (urlToTest) => {
    setCheckingServer(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${urlToTest}/api/info`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (e) {
      setServerOnline(false);
    } finally {
      setCheckingServer(false);
    }
  };

  const handleSaveUserName = (val) => {
    setUserName(val);
    saveUserName(val);
  };

  // Create a room on the backend (or fallback local code if offline)
  const createRoom = async () => {
    setCreatingRoom(true);
    try {
      const res = await fetch(`${serverUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: userName || 'Host' }),
      });
      const data = await res.json();
      setCreatingRoom(false);
      return data;
    } catch (e) {
      setCreatingRoom(false);
      const fallbackCode = generateLocalMeetCode();
      return {
        roomId: fallbackCode,
        inviteUrl: `${serverUrl}/join/${fallbackCode}`,
      };
    }
  };

  // 1. "Get a meeting link to share" (Google Meet style)
  const handleGetLinkToShare = async () => {
    const roomData = await createRoom();
    setCreatedRoomInfo(roomData);
  };

  // 2. "Start an instant meeting"
  const handleStartInstantMeeting = async (initialMode = 'camera') => {
    const roomData = await createRoom();
    setNewMeetingSheetVisible(false);
    setCreatedRoomInfo(null);
    onJoinMeeting({
      roomId: roomData.roomId,
      userName: userName.trim() || 'Host',
      serverUrl,
      initialMode,
    });
  };

  // 3. Join existing meeting via Code or Pasted Link
  const handleJoinByCodeOrLink = () => {
    const cleanCode = extractRoomCode(joinInput);
    if (!cleanCode || cleanCode.length < 3) {
      Alert.alert('Invalid Code or Link', 'Please enter a valid meeting code (e.g. abc-defg-hij) or paste the shared meeting link.');
      return;
    }
    onJoinMeeting({
      roomId: cleanCode,
      userName: userName.trim() || 'Viewer',
      serverUrl,
      initialMode: 'camera',
    });
  };

  // Share the generated link via WhatsApp / SMS / System Share Sheet
  const handleShareGeneratedLink = async (roomInfo) => {
    if (!roomInfo) return;
    try {
      await Share.share({
        title: 'Join My Live Media Share Meeting',
        message: `📹 Join my Live Media Share meeting!\n\n🔑 Meeting Code: ${roomInfo.roomId}\n🔗 Link: ${roomInfo.inviteUrl}\n\nOpen the app and paste the code or link to join!`,
        url: roomInfo.inviteUrl,
      });
    } catch (e) {
      // ignore
    }
  };

  const handleSaveServerUrl = async () => {
    const saved = await setServerUrl(customServerInput);
    setServerUrlState(saved);
    setServerModalVisible(false);
    checkServerHealth(saved);
  };

  const handleResetAutoServerUrl = async () => {
    const autoUrl = getAutoDetectedServerUrl();
    setCustomServerInput(autoUrl);
    const saved = await setServerUrl(autoUrl);
    setServerUrlState(saved);
    setServerModalVisible(false);
    checkServerHealth(saved);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.logoIcon}>
              <Ionicons name="videocam" size={22} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.appTitle}>Live Media Share</Text>
              <Text style={styles.appSubtitle}>Google Meet Style P2P Streaming</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.serverBadge,
              serverOnline ? styles.serverOnline : styles.serverOffline,
            ]}
            onPress={() => {
              setCustomServerInput(serverUrl);
              setServerModalVisible(true);
            }}
          >
            {checkingServer ? (
              <ActivityIndicator size="small" color="#60a5fa" />
            ) : (
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: serverOnline ? '#22c55e' : '#f59e0b' },
                ]}
              />
            )}
            <Text style={styles.serverBadgeText}>
              {serverOnline ? 'Server Online' : 'Server Setup'}
            </Text>
            <Ionicons name="settings-outline" size={14} color="#cbd5e1" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Section */}
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>
              Real-Time Camera, Video & Screen Sharing for 2 Phones
            </Text>
            <Text style={styles.heroDesc}>
              Create a meeting on Phone 1, share the link or code with Phone 2, and stream live camera, gallery videos, or your screen instantaneously.
            </Text>

            {/* User Display Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Your Display Name</Text>
              <View style={styles.nameInputWrapper}>
                <Ionicons name="person-outline" size={18} color="#94a3b8" />
                <TextInput
                  style={styles.nameInput}
                  placeholder="Enter your name (e.g. Ali)"
                  placeholderTextColor="#64748b"
                  value={userName}
                  onChangeText={handleSaveUserName}
                />
              </View>
            </View>

            {/* Primary Google Meet Style Buttons */}
            <TouchableOpacity
              style={styles.newMeetingBtn}
              onPress={() => {
                setCreatedRoomInfo(null);
                setNewMeetingSheetVisible(true);
              }}
            >
              <Ionicons name="videocam" size={20} color="#ffffff" />
              <Text style={styles.newMeetingBtnText}>New Meeting</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR JOIN EXISTING</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Join with Code or Link */}
            <View style={styles.joinRow}>
              <View style={styles.joinInputBox}>
                <Ionicons name="keypad-outline" size={18} color="#94a3b8" />
                <TextInput
                  style={styles.joinInput}
                  placeholder="Enter meeting code or paste link"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={joinInput}
                  onChangeText={setJoinInput}
                  onSubmitEditing={handleJoinByCodeOrLink}
                />
                {joinInput.length > 0 && (
                  <TouchableOpacity onPress={() => setJoinInput('')}>
                    <Ionicons name="close-circle" size={18} color="#64748b" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.joinBtn,
                  joinInput.trim().length < 3 && styles.joinBtnDisabled,
                ]}
                onPress={handleJoinByCodeOrLink}
              >
                <Text style={styles.joinBtnText}>Join</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Start Feature Cards */}
          <Text style={styles.sectionHeader}>Quick Share Shortcuts</Text>
          <View style={styles.featuresGrid}>
            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => handleStartInstantMeeting('video')}
            >
              <View style={[styles.featureIcon, { backgroundColor: 'rgba(236, 72, 153, 0.16)' }]}>
                <Ionicons name="film-outline" size={24} color="#f472b6" />
              </View>
              <Text style={styles.featureTitle}>Share Video File</Text>
              <Text style={styles.featureSub}>
                Open a video from gallery & stream live to 2nd phone
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => handleStartInstantMeeting('screen')}
            >
              <View style={[styles.featureIcon, { backgroundColor: 'rgba(59, 130, 246, 0.16)' }]}>
                <Ionicons name="phone-portrait-outline" size={24} color="#60a5fa" />
              </View>
              <Text style={styles.featureTitle}>Share Screen</Text>
              <Text style={styles.featureSub}>
                Present screen, slides, or whiteboard to 2nd phone
              </Text>
            </TouchableOpacity>
          </View>

          {/* How It Works Guide */}
          <View style={styles.guideCard}>
            <Text style={styles.guideTitle}>💡 How to Use on 2 Phones:</Text>
            <Text style={styles.guideStep}>
              1. Open this app on both phones (connected to the same Wi-Fi or Hotspot).
            </Text>
            <Text style={styles.guideStep}>
              2. On <Text style={styles.bold}>Phone 1</Text>, tap <Text style={styles.bold}>New Meeting</Text> and share the Link/Code to Phone 2.
            </Text>
            <Text style={styles.guideStep}>
              3. On <Text style={styles.bold}>Phone 2</Text>, enter the code and tap <Text style={styles.bold}>Join</Text>.
            </Text>
            <Text style={styles.guideStep}>
              4. Tap <Text style={styles.bold}>Share Screen</Text> inside the call to stream camera, gallery videos, or screen live!
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Google Meet Style "New Meeting" Bottom Sheet Modal */}
      <Modal
        visible={newMeetingSheetVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setNewMeetingSheetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Start a Meeting</Text>
              <TouchableOpacity onPress={() => setNewMeetingSheetVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {creatingRoom && (
              <View style={styles.creatingRow}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.creatingText}>Generating meeting room...</Text>
              </View>
            )}

            {createdRoomInfo ? (
              <View style={styles.createdLinkBox}>
                <Text style={styles.createdLabel}>Here's the link to your meeting:</Text>
                <Text style={styles.createdSub}>
                  Share this code or link with the 2nd phone so they can join you:
                </Text>

                <View style={styles.codeHighlightBox}>
                  <View>
                    <Text style={styles.codeSmallLabel}>MEETING CODE</Text>
                    <Text style={styles.codeBigValue}>{createdRoomInfo.roomId}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.shareSheetBtn}
                    onPress={() => handleShareGeneratedLink(createdRoomInfo)}
                  >
                    <Ionicons name="share-social" size={18} color="#fff" />
                    <Text style={styles.shareSheetBtnText}>Share Link</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.enterCreatedRoomBtn}
                  onPress={() => {
                    const info = createdRoomInfo;
                    setNewMeetingSheetVisible(false);
                    setCreatedRoomInfo(null);
                    onJoinMeeting({
                      roomId: info.roomId,
                      userName: userName.trim() || 'Host',
                      serverUrl,
                      initialMode: 'camera',
                    });
                  }}
                >
                  <Ionicons name="enter-outline" size={20} color="#fff" />
                  <Text style={styles.enterCreatedRoomText}>Enter Meeting Room Now</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.sheetAction} onPress={handleGetLinkToShare}>
                  <View style={styles.sheetActionIcon}>
                    <Ionicons name="link-outline" size={22} color="#60a5fa" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetActionTitle}>Get a meeting link to share</Text>
                    <Text style={styles.sheetActionSub}>
                      Generate a code & link to send via WhatsApp or SMS
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetAction}
                  onPress={() => handleStartInstantMeeting('camera')}
                >
                  <View style={styles.sheetActionIcon}>
                    <Ionicons name="videocam-outline" size={22} color="#34d399" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetActionTitle}>Start an instant meeting</Text>
                    <Text style={styles.sheetActionSub}>
                      Jump straight into the live room and invite inside
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetAction}
                  onPress={() => handleStartInstantMeeting('video')}
                >
                  <View style={styles.sheetActionIcon}>
                    <Ionicons name="film-outline" size={22} color="#f472b6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetActionTitle}>Start & share a video file</Text>
                    <Text style={styles.sheetActionSub}>
                      Open a video from your phone and stream it live
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Server URL Configuration Modal */}
      <Modal
        visible={serverModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setServerModalVisible(false)}
      >
        <View style={styles.modalBackdropCenter}>
          <View style={styles.serverModalCard}>
            <Text style={styles.sheetTitle}>Signaling Server URL</Text>
            <Text style={styles.createdSub}>
              Automatically detected from Expo. Ensure your PC backend server is running on port 4000.
            </Text>

            <TextInput
              style={styles.serverInput}
              value={customServerInput}
              onChangeText={setCustomServerInput}
              placeholder="http://10.113.48.40:4000"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.serverModalButtons}>
              <TouchableOpacity
                style={styles.resetServerBtn}
                onPress={handleResetAutoServerUrl}
              >
                <Text style={styles.resetServerText}>Auto-Detect IP</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveServerBtn} onPress={handleSaveServerUrl}>
                <Text style={styles.saveServerText}>Save & Connect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  topBar: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  appSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
  },
  serverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  serverOnline: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  serverOffline: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serverBadgeText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 36,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 22,
  },
  heroTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
    marginBottom: 8,
  },
  heroDesc: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  nameInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
    height: 46,
    gap: 8,
  },
  nameInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
  },
  newMeetingBtn: {
    backgroundColor: '#2563eb',
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#2563eb',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  newMeetingBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e293b',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  joinInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
    height: 48,
    gap: 8,
  },
  joinInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
  },
  joinBtn: {
    backgroundColor: '#0ea5e9',
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnDisabled: {
    backgroundColor: '#1e293b',
  },
  joinBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  featuresGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  featureCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  featureTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  featureSub: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
  },
  guideCard: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  guideTitle: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  guideStep: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '700',
    color: '#ffffff',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#334155',
    padding: 20,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  creatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  creatingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sheetActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  sheetActionSub: {
    color: '#94a3b8',
    fontSize: 12,
  },
  createdLinkBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  createdLabel: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  createdSub: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  codeHighlightBox: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#3b82f6',
    marginBottom: 14,
  },
  codeSmallLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  codeBigValue: {
    color: '#60a5fa',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  shareSheetBtn: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  shareSheetBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  enterCreatedRoomBtn: {
    backgroundColor: '#10b981',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  enterCreatedRoomText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  serverModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  serverInput: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  serverModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  resetServerBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetServerText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  saveServerBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveServerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
