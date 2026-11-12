@echo off
title Live Media Share - Launcher
echo =======================================================
echo   Starting Live Media Share Backend and Expo App...
echo =======================================================

start "Live Media Share - Backend (Port 4000)" cmd /k "cd /d D:\live-media-share\backend && npm start"
timeout /t 2 /nobreak >nul
start "Live Media Share - Expo Mobile App" cmd /k "cd /d D:\live-media-share\mobile && npx expo start"

echo Both servers have been launched in separate windows!
