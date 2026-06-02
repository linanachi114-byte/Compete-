@echo off
taskkill /F /PID 69500 /T
echo Exit code: %ERRORLEVEL%
