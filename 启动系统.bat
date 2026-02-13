@echo off
chcp 65001 >nul 2>&1
title 机务段个人定向培训建议生成系统
echo ============================================
echo   机务段个人定向培训建议生成系统
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js！
    echo 请先运行 install_nodejs.bat 安装 Node.js
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络连接。
        pause
        exit /b 1
    )
    echo [完成] 依赖安装成功！
    echo.
)

echo [启动] 正在启动服务器...
echo.
echo   服务器就绪后会自动打开浏览器
echo   关闭此窗口可停止服务器
echo ============================================
echo.

:: Use vite --open to auto-open browser AFTER server is ready
call npx vite --host --open
pause
