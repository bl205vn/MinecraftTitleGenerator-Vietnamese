@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.node22;%PATH%"
"%~dp0.node22\node.exe" --experimental-import-meta-resolve compile.js
set "compile_exit=%errorlevel%"
pause
exit /b %compile_exit%
