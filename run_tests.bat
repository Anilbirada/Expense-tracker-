@echo off
title Expense Tracker — Automated Test Suite
cd /d "%~dp0backend"
python -m pytest -v
pause
