@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   项目初始化脚本
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

echo [检测] Node.js 版本:
node --version
echo [检测] npm 版本:
call npm --version
echo.

:: Install dependencies
echo [1/3] 安装项目依赖（首次需要几分钟）...
call npm install
if %errorlevel% neq 0 (
    echo [错误] npm install 失败！请检查网络连接。
    echo 如果是网络问题，可以尝试设置淘宝镜像：
    echo   npm config set registry https://registry.npmmirror.com
    echo 然后重新运行此脚本。
    pause
    exit /b 1
)

echo.
echo [2/3] 依赖安装完成！
echo.
echo [3/3] 启动开发服务器...
echo ============================================
echo   服务器启动后，请在浏览器访问:
echo   http://localhost:5173
echo.
echo   按 Ctrl+C 可停止服务器
echo ============================================
echo.
call npx vite --host
pause
