@echo off
REM OnLuyenHSG - 1 click chay ca cum (backend + tunnel ngrok)
REM Dat shortcut file nay vao shell:startup de mo may la tu chay.
cd /d %~dp0
echo ============================================================
echo  OnLuyenHSG - dang khoi dong (giu 2 cua so hien ra, dung tat)
echo ============================================================
REM /MIN = mo thu nho duoi taskbar cho gon, DUNG TAT 2 cua so nay khi dang test
start "OnLuyenHSG Server" /min cmd /k "cd /d %~dp0 && npm run prod:lan"
echo [1/2] Da mo cua so Server (build web + chay backend)...
echo       Doi backend len han roi moi mo tunnel...
timeout /t 25 /nobreak >nul
REM Goi truc tiep node (on dinh hon npm run khi mo may)
start "OnLuyenHSG Tunnel" /min cmd /k "cd /d %~dp0 && node scripts/cloudflared.cjs 8765"
echo [2/2] Da mo cua so Tunnel.
echo.
echo  XONG. Xem link public https trong cua so "OnLuyenHSG Tunnel".
echo  Link cung duoc luu vao file public-url.txt sau vai giay.
echo  Tat app: dong 2 cua so "OnLuyenHSG Server" va "OnLuyenHSG Tunnel".
timeout /t 10 /nobreak >nul
