@echo off
chcp 65001 >nul
echo ========================================
echo   停止智能课务系统服务
echo ========================================
echo.

echo 正在查找并停止 Node.js 进程...

REM 停止后端服务 (端口 3000)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo 正在停止后端服务 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

REM 停止前端服务 (端口 5173)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo 正在停止前端服务 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo 服务已停止！
echo 如果进程仍在运行，请手动关闭对应的 CMD 窗口
echo.
pause

