@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   Node.js 安装引导
echo ============================================
echo.

:: Check if Node.js is already installed
where node >nul 2>&1
if %errorlevel%==0 (
    echo [已安装] Node.js 已存在:
    node --version
    echo.
    echo 如需重新安装，请先卸载当前版本。
    echo 可直接运行 setup.bat 初始化项目。
    pause
    exit /b
)

echo Node.js 尚未安装，正在尝试自动安装...
echo.

:: Try winget first
where winget >nul 2>&1
if %errorlevel%==0 (
    echo [方法1] 使用 winget 安装 Node.js LTS ...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if %errorlevel%==0 (
        echo.
        echo [成功] Node.js 安装完成！
        echo 请关闭此窗口，重新打开一个新的命令行窗口，然后运行 setup.bat
        pause
        exit /b
    )
    echo [失败] winget 安装失败，尝试其他方法...
)

echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   自动安装失败，请手动安装：
echo.
echo   1. 打开浏览器访问: https://nodejs.org/zh-cn
echo   2. 下载 "长期维护版(LTS)" 安装包
echo   3. 双击安装，一路点"下一步"即可
echo   4. 安装完成后，关闭此窗口
echo   5. 双击运行 setup.bat 初始化项目
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
pause
