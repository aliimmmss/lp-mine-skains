@echo off
rem Read-only pool observation for LP Mine. Safe: signs nothing, moves no funds.
cd /d "%~dp0.."
if exist .rpc-url (
  set /p ROBINHOOD_RPC_URL=<.rpc-url
)
call npm run --workspace @lp-mine/worker pools:observe >> data\observe.log 2>&1
