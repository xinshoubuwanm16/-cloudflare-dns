@echo off
chcp 65001 >nul
title CloudNS 二级域名分发平台

set NODE_DIR=%~dp0nodeportable
if not exist "%NODE_DIR%\node.exe" (
  echo [错误] 未找到便携版 Node.js (%NODE_DIR%\node.exe)
  echo 请安装 Node.js 18+ 后执行: npm install ^&^& npm start
  pause
  exit /b 1
)

set PATH=%NODE_DIR%;%PATH%

if not exist "%~dp0node_modules" (
  echo 首次运行，正在安装依赖...
  call "%NODE_DIR%\npm.cmd" install
)

echo.
echo ==========================================
echo    CloudNS 已启动
echo    访问地址: http://localhost:3000
echo    管理员:   admin / admin123
echo    (关闭此窗口即停止服务)
echo ==========================================
echo.

"%NODE_DIR%\node.exe" "%~dp0src\server.js"
pause
