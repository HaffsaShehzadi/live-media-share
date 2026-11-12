import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Share,
  Platform,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { io } from 'socket.io-client';
import { getWebRTCEngineHTML } from '../webrtc/webrtcEngineHtml';

export default function MeetingRoomScreen({
  roomId,
  userName,
  serverUrl,
  initialMode = 'camera',
  onLeave,
}) {
  useKeepAwake();

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const socketRef = useRef(null);
  const isCapturingRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState('front'); // 'front' | 'back'
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  // Local sharing state: 'none' | 'video-file' | 'demo-video' | 'screen-board' | 'camera-stage'
  const [localShareMode, setLocalShareMode] = useState(
    initialMode === 'video' ? 'video-file' : initialMode === 'screen' ? 'screen-board' : 'none'
  );
  const [shareSheetVisible, setShareSheetVisible] = useState(false);

  // Room & Remote Peer state
  const [socketConnected, setSocketConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [remotePeerName, setRemotePeerName] = useState('2nd Phone');
  const [remoteFrameUri, setRemoteFrameUri] = useState(null);
  const [remoteShareMode, setRemoteShareMode] = useState('none');
  const [remotePresenterId, setRemotePresenterId] = useState(null);

  // Chat state
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const inviteLink = `${serverUrl}/join/${roomId}`;

  // Request camera permission non-blockingly on mount
  useEffect(() => {
    if (!camPermission?.granted) {
      requestCamPermission().catch(() => {});
    }
  }, [camPermission, requestCamPermission]);

  // Connect to Socket.io Signaling & Media Relay Server
  useEffect(() => {
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 25,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join-room', {
        roomId,
        userName: userName || 'User',
        initialMediaState: { isAudioMuted: false, isVideoOff: false },
      });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('room-state-sync', (data) => {
      if (!data) return;
      if (typeof data.participantsCount === 'number') {
        setParticipantCount(data.participantsCount);
      }
      if (data.presenterSocketId !== undefined) {
        setRemotePresenterId(data.presenterSocketId);
      }
      if (data.roomShareMode) {
        setRemoteShareMode(data.roomShareMode);
      }
      if (Array.isArray(data.participants)) {
        const other = data.participants.find((p) => p.socketId !== socket.id);
        if (other && other.userName) {
          setRemotePeerName(other.userName);
        }
      }
    });

    socket.on('room-joined', (data) => {
      const peers = data?.peers || [];
      setParticipantCount(peers.length + 1);
      if (peers.length > 0 && peers[0].userName) {
        setRemotePeerName(peers[0].userName);
      }
      if (data?.presenterSocketId) {
        setRemotePresenterId(data.presenterSocketId);
        setRemoteShareMode(data.roomShareMode || 'none');
      }
    });

    socket.on('peer-joined', (data) => {
      setParticipantCount((prev) => Math.max(2, prev + 1));
      if (data?.userName) {
        setRemotePeerName(data.userName);
      }
    });

    socket.on('peer-media-updated', (data) => {
      if (!data) return;
      if (data.socketId !== socket.id) {
        if (data.userName) setRemotePeerName(data.userName);
        setRemoteShareMode(data.shareMode || 'none');
        setRemotePresenterId(data.presenterSocketId || null);
        if (data.isVideoOff && data.shareMode === 'none') {
          setRemoteFrameUri(null);
        }
      }
    });

    // Receive Live Camera, Video File, or Screen Share frames from the other phone!
    socket.on('screen-frame', (data) => {
      if (data && data.frame) {
        setRemoteFrameUri(data.frame);
        setParticipantCount((prev) => Math.max(2, prev));
        if (data.fromUserName) {
          setRemotePeerName(data.fromUserName);
        }
        if (data.mode) {
          setRemoteShareMode(data.mode);
        }
      }
    });

    socket.on('peer-left', () => {
      setParticipantCount((prev) => {
        const next = Math.max(1, prev - 1);
        if (next <= 1) {
          setRemoteFrameUri(null);
          setRemoteShareMode('none');
          setRemotePresenterId(null);
        }
        return next;
      });
    });

    socket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.emit('leave-room');
      socket.disconnect();
    };
  }, [serverUrl, roomId, userName]);

  // Continuous Native Camera Streaming Loop when local camera is active
  useEffect(() => {
    const isUsingCamera =
      isCamOn &&
      camPermission?.granted &&
      cameraReady &&
      (localShareMode === 'none' || localShareMode === 'camera-stage');

    if (!isUsingCamera) return;

    let active = true;
    let timerId = null;

    const captureNextFrame = async () => {
      if (!active) return;

      // If the OTHER phone is actively presenting a video/screen, don't flood the socket
      const selfId = socketRef.current?.id;
      const otherIsPresenting =
        remotePresenterId &&
        selfId &&
        remotePresenterId !== selfId &&
        remoteShareMode !== 'none' &&
        remoteShareMode !== 'camera' &&
        localShareMode === 'none';

      if (
        !otherIsPresenting &&
        cameraRef.current &&
        socketRef.current?.connected &&
        !isCapturingRef.current
      ) {
        isCapturingRef.current = true;
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.2,
            base64: true,
            shutterSound: false,
            skipProcessing: false,
          });
          if (active && photo && photo.base64) {
            socketRef.current.emit('screen-frame', {
              frame: `data:image/jpeg;base64,${photo.base64}`,
              mode: localShareMode === 'camera-stage' ? 'camera-stage' : 'camera',
            });
          }
        } catch (e) {
          // ignore transient capture busy error
        } finally {
          isCapturingRef.current = false;
        }
      }

      if (active) {
        timerId = setTimeout(captureNextFrame, 380);
      }
    };

    timerId = setTimeout(captureNextFrame, 500);

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [
    isCamOn,
    camPermission?.granted,
    cameraReady,
    localShareMode,
    remotePresenterId,
    remoteShareMode,
  ]);

  const emitMediaState = useCallback((mode, isVideoOffVal = !isCamOn) => {
    if (!socketRef.current?.connected) return;
    const mappedMode =
      mode === 'video-file' || mode === 'demo-video'
        ? 'video'
        : mode === 'screen-board'
        ? 'screen'
        : mode === 'camera-stage'
        ? 'camera-stage'
        : 'none';

    socketRef.current.emit('media-state-change', {
      isAudioMuted: !isMicOn,
      isVideoOff: isVideoOffVal,
      shareMode: mappedMode,
    });
  }, [isCamOn, isMicOn]);

  const handleToggleMic = () => {
    setIsMicOn((prev) => !prev);
  };

  const handleToggleCam = () => {
    setIsCamOn((prev) => {
      const next = !prev;
      emitMediaState(localShareMode, !next);
      return next;
    });
  };

  const handleFlipCamera = () => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  };

  const startSharingMode = (mode) => {
    setShareSheetVisible(false);
    setLocalShareMode(mode);
    if (mode === 'camera-stage' && !isCamOn) {
      setIsCamOn(true);
    }
    emitMediaState(mode, false);
  };

  const stopAllSharing = () => {
    setLocalShareMode('none');
    emitMediaState('none', !isCamOn);
  };

  const handlePresenterWebViewMessage = useCallback((event) => {
    try {
      const { type, payload } = JSON.parse(event.nativeEvent.data);
      if (type === 'PRESENTER_FRAME' && payload?.frame) {
        if (socketRef.current?.connected) {
          socketRef.current.emit('screen-frame', {
            frame: payload.frame,
            mode: payload.mode || 'video',
          });
        }
      }
    } catch (e) {}
  }, []);

  const presenterSource = useMemo(() => {
    if (
      localShareMode !== 'video-file' &&
      localShareMode !== 'demo-video' &&
      localShareMode !== 'screen-board'
    ) {
      return null;
    }
    return {
      html: getWebRTCEngineHTML({
        mode: localShareMode,
        userName: userName || 'Presenter',
      }),
      baseUrl: 'https://localhost',
    };
  }, [localShareMode, userName]);

  const handleShareInvite = async () => {
    try {
      await Share.share({
        title: 'Join My Live Media Share Meeting',
        message: `📹 Join my Live Media & Screen Share meeting!\n\n🔑 Meeting Code: ${roomId}\n🔗 Direct Link: ${inviteLink}\n\nOpen the Live Media Share app and enter the code above to watch live!`,
        url: inviteLink,
      });
    } catch (err) {
      Alert.alert('Meeting Code', `Share this code with the 2nd phone:\n\n${roomId}`);
    }
  };

  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('chat-message', { text });
    setChatInput('');
  };

  const isPresentingWebView =
    localShareMode === 'video-file' ||
    localShareMode === 'demo-video' ||
    localShareMode === 'screen-board';

  // Determine banner label for remote activity
  const getRemoteBannerLabel = () => {
    if (localShareMode !== 'none') {
      if (localShareMode === 'video-file' || localShareMode === 'demo-video') {
        return '🎬 You are sharing a Video to 2nd Phone';
      }
      if (localShareMode === 'screen-board') {
        return '📲 You are sharing Screen to 2nd Phone';
      }
      return '📸 You are broadcasting Camera Full-Screen';
    }
    if (remoteShareMode === 'video') {
      return `🎬 ${remotePeerName} is sharing a Video`;
    }
    if (remoteShareMode === 'screen') {
      return `📲 ${remotePeerName} is sharing Screen`;
    }
    if (remoteShareMode === 'camera-stage') {
      return `📸 ${remotePeerName} is broadcasting Camera`;
    }
    return null;
  };

  const activeBannerLabel = getRemoteBannerLabel();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top Google Meet Style Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, socketConnected ? styles.dotOnline : styles.dotOffline]} />
          <View>
            <View style={styles.codeRow}>
              <Text style={styles.roomCodeText}>{roomId}</Text>
              <View style={styles.countBadge}>
                <Ionicons name="people" size={12} color="#93c5fd" />
                <Text style={styles.countText}>{participantCount}</Text>
              </View>
            </View>
            <Text style={styles.subStatusText}>
              {participantCount >= 2
                ? `Connected Live with ${remotePeerName}`
                : socketConnected
                ? 'Waiting for 2nd phone to join...'
                : 'Connecting to signaling server...'}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.inviteBtn} onPress={handleShareInvite}>
            <Ionicons name="share-social-outline" size={16} color="#ffffff" />
            <Text style={styles.inviteBtnText}>Share Link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => {
              setChatVisible(true);
              setUnreadCount(0);
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#e2e8f0" />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Stage Area */}
      <View style={styles.stageContainer}>
        {/* Top Status Pill inside Stage */}
        <View style={styles.stageTopBar}>
          <View style={styles.peerPill}>
            <View
              style={[
                styles.liveDotSmall,
                { backgroundColor: participantCount >= 2 ? '#22c55e' : '#f59e0b' },
              ]}
            />
            <Text style={styles.peerPillText}>
              {participantCount >= 2
                ? `2 Phones Connected (${remotePeerName})`
                : 'Waiting for 2nd phone...'}
            </Text>
          </View>

          {activeBannerLabel && (
            <View style={styles.presentingPill}>
              <Text style={styles.presentingPillText}>{activeBannerLabel}</Text>
            </View>
          )}
        </View>

        {/* 1. If THIS phone is presenting a Video File / Demo Video / Screen Whiteboard */}
        {isPresentingWebView && presenterSource ? (
          <View style={styles.presenterWrapper}>
            <WebView
              originWhitelist={['*']}
              source={presenterSource}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              allowFileAccess={true}
              allowUniversalAccessFromFileURLs={true}
              mixedContentMode="always"
              onMessage={handlePresenterWebViewMessage}
              style={{ flex: 1, backgroundColor: '#090d16' }}
            />
            <View style={styles.presenterFooter}>
              <Text style={styles.presenterFooterText}>
                🔴 Streaming live to {remotePeerName}
              </Text>
              <TouchableOpacity style={styles.stopShareBtn} onPress={stopAllSharing}>
                <Text style={styles.stopShareBtnText}>Stop Sharing</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : localShareMode === 'camera-stage' ? (
          /* 2. If THIS phone is broadcasting its Camera in Full-Screen Stage Mode */
          <View style={styles.fullCameraStage}>
            {camPermission?.granted && isCamOn ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                animateShutter={false}
                mute={true}
                onCameraReady={() => setCameraReady(true)}
              />
            ) : (
              <View style={styles.centeredEmpty}>
                <Text style={styles.emptyTitle}>Camera Permission Required</Text>
                <TouchableOpacity style={styles.allowCamBtn} onPress={requestCamPermission}>
                  <Text style={styles.allowCamBtnText}>Allow Camera Access</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.presenterFooter}>
              <Text style={styles.presenterFooterText}>
                📸 Broadcasting {facing === 'back' ? 'Back' : 'Front'} Camera Live
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.flipStageBtn} onPress={handleFlipCamera}>
                  <Text style={styles.stopShareBtnText}>🔄 Flip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.stopShareBtn} onPress={stopAllSharing}>
                  <Text style={styles.stopShareBtnText}>Stop Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : remoteFrameUri ? (
          /* 3. Remote Live Stream from the Other Phone (Camera, Video File, or Screen Share!) */
          <View style={styles.remoteStreamContainer}>
            <Image
              source={{ uri: remoteFrameUri }}
              style={styles.remoteStageImage}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
        ) : (
          /* 4. Waiting / Ready State when no remote stream has arrived yet */
          <View style={styles.centeredEmpty}>
            <View style={styles.pulseCircle}>
              <Ionicons name="phone-portrait-outline" size={38} color="#60a5fa" />
            </View>
            <Text style={styles.emptyTitle}>
              {participantCount >= 2 ? `${remotePeerName} is in the Room!` : 'Ready to Share Live!'}
            </Text>
            <Text style={styles.emptySub}>
              {participantCount >= 2
                ? 'Turn on your camera or tap "Share Screen" below to stream a video or screen live!'
                : 'Share the meeting code or link with the 2nd phone. Once they join, whatever you open, record, or share will appear live on their screen!'}
            </Text>
            <TouchableOpacity style={styles.shareCodePill} onPress={handleShareInvite}>
              <Ionicons name="link-outline" size={18} color="#60a5fa" />
              <Text style={styles.shareCodePillText}>Share Meeting Link ({roomId})</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Floating Local Camera Preview (PiP) when not in Full-Screen Camera Stage */}
        {localShareMode !== 'camera-stage' && (
          <View style={styles.pipCard}>
            {!camPermission?.granted ? (
              <TouchableOpacity style={styles.pipPermissionBtn} onPress={requestCamPermission}>
                <Ionicons name="camera-outline" size={24} color="#60a5fa" />
                <Text style={styles.pipPermText}>Tap to Allow Camera</Text>
              </TouchableOpacity>
            ) : isCamOn ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                animateShutter={false}
                mute={true}
                onCameraReady={() => setCameraReady(true)}
              />
            ) : (
              <View style={styles.pipCamOff}>
                <Ionicons name="videocam-off-outline" size={26} color="#94a3b8" />
                <Text style={styles.pipPermText}>Cam Off</Text>
              </View>
            )}

            <TouchableOpacity style={styles.pipFlipBtn} onPress={handleFlipCamera}>
              <Ionicons name="camera-reverse-outline" size={16} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.pipLabelBox}>
              <Text style={styles.pipLabelText}>
                You ({facing === 'back' ? 'Back' : 'Front'})
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Bottom Google Meet Style Control Bar */}
      <View style={styles.controlsBar}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={handleToggleMic}>
          <View style={[styles.ctrlIcon, !isMicOn && styles.ctrlIconOff]}>
            <Ionicons name={isMicOn ? 'mic' : 'mic-off'} size={22} color="#ffffff" />
          </View>
          <Text style={styles.ctrlText}>{isMicOn ? 'Mic On' : 'Muted'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={handleToggleCam}>
          <View style={[styles.ctrlIcon, !isCamOn && styles.ctrlIconOff]}>
            <Ionicons name={isCamOn ? 'videocam' : 'videocam-off'} size={22} color="#ffffff" />
          </View>
          <Text style={styles.ctrlText}>{isCamOn ? 'Cam On' : 'Cam Off'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={handleFlipCamera}>
          <View style={styles.ctrlIcon}>
            <Ionicons name="camera-reverse" size={22} color="#ffffff" />
          </View>
          <Text style={styles.ctrlText}>Flip Cam</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={() => {
            if (localShareMode !== 'none') {
              stopAllSharing();
            } else {
              setShareSheetVisible(true);
            }
          }}
        >
          <View style={[styles.ctrlIcon, localShareMode !== 'none' && styles.ctrlIconActive]}>
            <Ionicons
              name={localShareMode !== 'none' ? 'stop-circle' : 'share-outline'}
              size={22}
              color="#ffffff"
            />
          </View>
          <Text style={styles.ctrlText}>
            {localShareMode !== 'none' ? 'Stop Share' : 'Share Screen'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={() => onLeave && onLeave()}>
          <View style={styles.endCallIcon}>
            <Ionicons name="call" size={22} color="#ffffff" />
          </View>
          <Text style={styles.ctrlText}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* Share Screen / Media Options Modal */}
      <Modal
        visible={shareSheetVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShareSheetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.shareSheet}>
            <Text style={styles.sheetTitle}>Share Live to 2nd Phone</Text>
            <Text style={styles.sheetSub}>
              Select what you want to display live on the 2nd phone's screen:
            </Text>

            <TouchableOpacity
              style={styles.shareOption}
              onPress={() => startSharingMode('video-file')}
            >
              <View style={[styles.shareOptIcon, { backgroundColor: 'rgba(236, 72, 153, 0.2)' }]}>
                <Ionicons name="film" size={24} color="#f472b6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptTitle}>Open & Share Video from Gallery</Text>
                <Text style={styles.shareOptDesc}>
                  Pick any video from your phone and play it live on the 2nd phone
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareOption}
              onPress={() => startSharingMode('demo-video')}
            >
              <View style={[styles.shareOptIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <Ionicons name="play-circle" size={24} color="#34d399" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptTitle}>Stream Live Demo Video Player</Text>
                <Text style={styles.shareOptDesc}>
                  Test instant animated HD video streaming with 1 click
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareOption}
              onPress={() => startSharingMode('screen-board')}
            >
              <View style={[styles.shareOptIcon, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                <Ionicons name="phone-portrait" size={24} color="#60a5fa" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptTitle}>Share Screen / Screenshots / Whiteboard</Text>
                <Text style={styles.shareOptDesc}>
                  Present phone screenshots, photos, or draw live on screen
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareOption}
              onPress={() => startSharingMode('camera-stage')}
            >
              <View style={[styles.shareOptIcon, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                <Ionicons name="camera" size={24} color="#fbbf24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptTitle}>Full-Screen Live Camera Broadcast</Text>
                <Text style={styles.shareOptDesc}>
                  Record & stream your Front or Back camera full-screen to the 2nd phone
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelSheetBtn}
              onPress={() => setShareSheetVisible(false)}
            >
              <Text style={styles.cancelSheetText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* In-Meeting Live Chat Modal */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setChatVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.chatSheet}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>In-Call Messages ({roomId})</Text>
              <TouchableOpacity onPress={() => setChatVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.chatList}
              ListEmptyComponent={
                <Text style={styles.emptyChatText}>
                  No messages yet. Say hello to the other phone!
                </Text>
              }
              renderItem={({ item }) => (
                <View style={styles.msgBubble}>
                  <View style={styles.msgHeader}>
                    <Text style={styles.msgSender}>{item.senderName}</Text>
                    <Text style={styles.msgTime}>{item.timestamp}</Text>
                  </View>
                  <Text style={styles.msgText}>{item.text}</Text>
                </View>
              )}
            />

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Send a message to everyone..."
                placeholderTextColor="#64748b"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChatMessage}
              />
              <TouchableOpacity style={styles.sendBtn} onPress={sendChatMessage}>
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    height: 60,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: '#22c55e',
  },
  dotOffline: {
    backgroundColor: '#f59e0b',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomCodeText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e293b',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  subStatusText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  inviteBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  chatBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  stageContainer: {
    flex: 1,
    backgroundColor: '#0b1120',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageTopBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 25,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  peerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  liveDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  peerPillText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  presentingPill: {
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  presentingPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  presenterWrapper: {
    flex: 1,
    width: '100%',
    paddingTop: 52,
  },
  fullCameraStage: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  presenterFooter: {
    height: 56,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presenterFooterText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
  },
  flipStageBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stopShareBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stopShareBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  remoteStreamContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#050811',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteStageImage: {
    width: '100%',
    height: '100%',
  },
  centeredEmpty: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 350,
  },
  pulseCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(37, 99, 235, 0.16)',
    borderWidth: 2,
    borderColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 18,
  },
  shareCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  shareCodePillText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
  },
  allowCamBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  allowCamBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  pipCard: {
    position: 'absolute',
    bottom: 16,
    right: 14,
    width: 118,
    height: 168,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#3b82f6',
    elevation: 8,
    zIndex: 30,
  },
  pipPermissionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  pipCamOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  pipPermText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  pipFlipBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipLabelBox: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  pipLabelText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  controlsBar: {
    height: 76,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 8,
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 56,
  },
  ctrlIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlIconOff: {
    backgroundColor: '#ef4444',
    borderColor: '#f87171',
  },
  ctrlIconActive: {
    backgroundColor: '#2563eb',
    borderColor: '#60a5fa',
  },
  endCallIcon: {
    width: 52,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  shareSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#334155',
    padding: 20,
    paddingBottom: 30,
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  sheetSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 14,
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
  },
  shareOptIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareOptTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  shareOptDesc: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 15,
  },
  cancelSheetBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelSheetText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  chatSheet: {
    height: '72%',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: '#334155',
    padding: 16,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  chatTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  chatList: {
    paddingVertical: 14,
    gap: 10,
  },
  emptyChatText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 13,
  },
  msgBubble: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  msgHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  msgSender: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '700',
  },
  msgTime: {
    color: '#64748b',
    fontSize: 11,
  },
  msgText: {
    color: '#f1f5f9',
    fontSize: 14,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
