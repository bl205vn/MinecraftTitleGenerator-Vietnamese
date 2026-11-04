@echo off
setlocal
set "PATH=%~dp0.node22;%PATH%"
"%~dp0.node22\node.exe" %*
exit /b %errorlevel%
