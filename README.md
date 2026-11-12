# 📹 Live Media Share (Google Meet Style 2-Phone Streaming App)

A complete **Google Meet-style Peer-to-Peer Live Camera, Video File, and Screen Sharing Application** built with **Expo (React Native)**, **Node.js**, **Socket.io**, and **WebRTC**.

---

## ✨ Key Features

1. **🔗 Google Meet Style Room Links & Codes**
   - Tap **New Meeting** on Phone 1 to generate a unique Meeting Code (e.g. `abc-defg-hij`) and shareable Invite Link.
   - Send the link/code directly via **WhatsApp, SMS, or Copy** using the native share sheet.
   - Phone 2 pastes the link or enters the code and taps **Join** to connect immediately.

2. **📹 Live Two-Way Camera & Audio Streaming**
   - Real-time low-latency WebRTC video & audio call between both phones.
   - Switch between **Front Camera** and **Back Camera** (`Flip Cam`) live while recording/streaming.

3. **🎬 Open & Share Video from Phone Gallery**
   - Inside a meeting, tap **Share Screen** $\rightarrow$ **Open & Share Video from Gallery** (or **Stream Live Demo Video**).
   - Select any video from Phone 1's gallery; as it plays on Phone 1, Phone 2 watches the live stream on its main stage!

4. **📲 Screen & Interactive Presentation Sharing**
   - Share your screen, screenshots/photos from your phone, or draw live on the interactive whiteboard while Phone 2 watches every update in real time.
   - Works out-of-the-box in **Expo Go** and also supports full OS screen capture in **Expo Development Builds**.

5. **💬 In-Call Live Chat**
   - Send real-time text messages between the connected phones during the stream.

---

## 📂 Project Structure

```
D:\live-media-share
├── backend/                  # Node.js + Express + Socket.io Signaling & Room Server (Port 4000)
│   ├── package.json
│   └── server.js
└── mobile/                   # Expo (React Native) Mobile App
    ├── App.js
    ├── app.json
    ├── index.js
    ├── package.json
    └── src/
        ├── screens/
        │   ├── HomeScreen.js
        │   └── MeetingRoomScreen.js
        ├── utils/
        │   └── serverConfig.js
        └── webrtc/
            └── webrtcEngineHtml.js
```

---

## 🚀 How to Run the Project

### Step 1: Start the Signaling Backend Server
Open a terminal in `D:\live-media-share\backend`:
```bash
cd D:\live-media-share\backend
npm start
```
The server will start on `http://0.0.0.0:4000` and display your PC's Wi-Fi / Hotspot IP address.

### Step 2: Start the Expo Mobile App
Open a second terminal in `D:\live-media-share\mobile`:
```bash
cd D:\live-media-share\mobile
npx expo start
```
Scan the QR code on **both phones** using **Expo Go** (make sure your PC and both phones are on the same Wi-Fi or Mobile Hotspot).

---

## 🛠️ Optional: Full Native Android Screen Share (Development Build)
If you want to capture other apps outside the app (e.g. Android Home Screen / WhatsApp) using native Android `MediaProjection`:
```bash
cd D:\live-media-share\mobile
npx expo install @config-plugins/react-native-webrtc react-native-webrtc
npx expo run:android
```
