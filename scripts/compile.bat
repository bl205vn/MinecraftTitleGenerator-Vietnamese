@echo off
setlocal
cd /d "%~dp0"
set "NODE22=%~dp0..\.tools\node-v22.23.4-win-x64\node.exe"
if exist "%NODE22%" (
  set "PATH=%~dp0..\.tools\node-v22.23.4-win-x64;%PATH%"
) else (
  set "NODE22=node"
)
"%NODE22%" -e "if(process.versions.modules!=='127'){console.error('This build requires Node 22 (ABI 127). Install the project portable runtime or use a patched Node 22 release.');process.exit(1)}"
if errorlevel 1 exit /b 1
if /i "%~1"=="--check" goto check
"%NODE22%" --experimental-import-meta-resolve compile.js
set "BUILD_EXIT=%ERRORLEVEL%"
pause
exit /b %BUILD_EXIT%
:check
"%NODE22%" --input-type=module -e "import createGL from 'gl'; import {Canvas} from 'skia-canvas'; const gl=createGL(8,8); if(!gl)throw new Error('Unable to create WebGL context'); const canvas=new Canvas(8,8); console.log(JSON.stringify({node:process.version,abi:process.versions.modules,webgl:gl.getParameter(gl.VERSION),canvas:[canvas.width,canvas.height]})); gl.getExtension('STACKGL_destroy_context').destroy();"
exit /b %ERRORLEVEL%
