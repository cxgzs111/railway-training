@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   下载离线依赖库脚本
echo   机务段个人定向培训建议生成系统
echo ============================================
echo.

if not exist "libs" (
    mkdir libs
    echo [已创建] libs 文件夹
) else (
    echo [已存在] libs 文件夹
)

echo.
echo [1/2] 检查 Tailwind CSS ...
if exist "libs\tailwind.js" (
    echo [已存在] tailwind.js，跳过下载
) else (
    echo 正在下载 Tailwind CSS ...
    powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://cdn.tailwindcss.com' -OutFile 'libs\tailwind.js' -UseBasicParsing; Write-Host '[成功] tailwind.js' } catch { Write-Host '[失败] tailwind.js - ' $_.Exception.Message }"
)

echo.
echo [2/2] 下载 XLSX.js (Excel解析库) - 尝试多个源 ...

if exist "libs\xlsx.full.min.js" (
    echo [已存在] xlsx.full.min.js，跳过下载
    goto :done
)

echo 尝试源1: cdnjs.cloudflare.com ...
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' -OutFile 'libs\xlsx.full.min.js' -UseBasicParsing -TimeoutSec 15; Write-Host '[成功] xlsx.full.min.js (cdnjs)' } catch { Write-Host '[失败] cdnjs - ' $_.Exception.Message }"
if exist "libs\xlsx.full.min.js" goto :checksize1
goto :try2

:checksize1
for %%A in ("libs\xlsx.full.min.js") do if %%~zA GTR 1000 goto :done
del "libs\xlsx.full.min.js" 2>nul

:try2
echo 尝试源2: unpkg.com ...
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js' -OutFile 'libs\xlsx.full.min.js' -UseBasicParsing -TimeoutSec 15; Write-Host '[成功] xlsx.full.min.js (unpkg)' } catch { Write-Host '[失败] unpkg - ' $_.Exception.Message }"
if exist "libs\xlsx.full.min.js" goto :checksize2
goto :try3

:checksize2
for %%A in ("libs\xlsx.full.min.js") do if %%~zA GTR 1000 goto :done
del "libs\xlsx.full.min.js" 2>nul

:try3
echo 尝试源3: cdn.jsdelivr.net ...
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js' -OutFile 'libs\xlsx.full.min.js' -UseBasicParsing -TimeoutSec 15; Write-Host '[成功] xlsx.full.min.js (jsdelivr)' } catch { Write-Host '[失败] jsdelivr - ' $_.Exception.Message }"
if exist "libs\xlsx.full.min.js" goto :checksize3
goto :try4

:checksize3
for %%A in ("libs\xlsx.full.min.js") do if %%~zA GTR 1000 goto :done
del "libs\xlsx.full.min.js" 2>nul

:try4
echo 尝试源4: cdn.sheetjs.com (官方源) ...
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js' -OutFile 'libs\xlsx.full.min.js' -UseBasicParsing -TimeoutSec 15; Write-Host '[成功] xlsx.full.min.js (sheetjs官方)' } catch { Write-Host '[失败] sheetjs官方 - ' $_.Exception.Message }"
if exist "libs\xlsx.full.min.js" goto :checksize4
goto :allfailed

:checksize4
for %%A in ("libs\xlsx.full.min.js") do if %%~zA GTR 1000 goto :done
del "libs\xlsx.full.min.js" 2>nul

:allfailed
echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   所有CDN源均下载失败！
echo   请手动下载 xlsx.full.min.js：
echo.
echo   方法1: 用浏览器打开以下任一地址，右键另存为到 libs 文件夹：
echo     https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
echo     https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js
echo     https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js
echo.
echo   方法2: 在能上网的电脑下载后拷贝到 libs\xlsx.full.min.js
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
goto :end

:done
echo.
echo ============================================
echo   下载完成！
echo   FileSaver 已内嵌到页面中，无需单独下载。
echo   请刷新 index.html 页面即可使用。
echo ============================================

:end
echo.
pause
