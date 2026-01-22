@echo off
chcp 65001 >nul
echo ========================================
echo   智能课务系统 - 启动前后端服务
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] 检查项目结构...
if not exist "backend\package.json" (
    echo [错误] 未找到后端目录，请确保在项目根目录运行此脚本
    pause
    exit /b 1
)

if not exist "frontend\package.json" (
    echo [错误] 未找到前端目录，请确保在项目根目录运行此脚本
    pause
    exit /b 1
)

echo [2/4] 检查依赖是否已安装...
if not exist "backend\node_modules" (
    echo [提示] 后端依赖未安装，正在安装...
    cd backend
    call npm install
    cd ..
)

if not exist "frontend\node_modules" (
    echo [提示] 前端依赖未安装，正在安装...
    cd frontend
    call npm install
    cd ..
)

echo [3/4] 启动后端服务 (端口 3000)...
start "后端服务 - buzzersteam" cmd /k "cd /d %~dp0backend && echo 后端服务启动中... && echo 端口: http://localhost:3000 && echo API文档: http://localhost:3000/api-docs && echo. && npm run dev"

REM 等待 2 秒，让后端先启动
timeout /t 2 /nobreak >nul

echo [4/4] 启动前端服务 (端口 5173)...
start "前端服务 - buzzersteam" cmd /k "cd /d %~dp0frontend && echo 前端服务启动中... && echo 访问地址: http://localhost:5173 && echo. && npm run dev"

echo.
echo ========================================
echo   服务启动完成！
echo ========================================
echo   后端: http://localhost:3000
echo   前端: http://localhost:5173
echo   API文档: http://localhost:3000/api-docs
echo ========================================
echo.
echo 提示: 关闭对应的 CMD 窗口即可停止服务
echo 按任意键关闭此窗口...
pause >nul

