@echo off
setlocal
set "PATH=%~dp0.node22;%PATH%"
"%~dp0.node22\node.exe" "%~dp0.node22\node_modules\npm\bin\npm-cli.js" %*
exit /b %errorlevel%
