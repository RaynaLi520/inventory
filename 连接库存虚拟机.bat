@echo off
title JA Inventory VM

set "SSH_KEY=%USERPROFILE%\.ssh\henan_inventory_vm_ed25519"

if not exist "%SSH_KEY%" (
  echo SSH key not found: %SSH_KEY%
  echo Please restore the dedicated VM key before connecting.
  pause
  exit /b 1
)

ssh -i "%SSH_KEY%" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 itadmin@172.16.100.198

if errorlevel 1 (
  echo.
  echo Connection failed. Check the company network and VM status.
  pause
)
