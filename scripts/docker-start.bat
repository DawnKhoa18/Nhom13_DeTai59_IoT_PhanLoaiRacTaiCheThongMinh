@echo off
echo =====================================================
echo  [DOCKER] KHOI CHAY SMART RECYCLING IOT STACK
echo =====================================================

docker compose up -d web-dashboard mqtt-broker

if %ERRORLEVEL% EQU 0 (
    echo.
    echo >>> DICH VU DA SAN SANG! <<<
    echo 1. Web Dashboard  : http://localhost:8088
    echo 2. MQTT Broker TCP: localhost:1883
    echo 3. MQTT WebSocket : localhost:9001
    echo.
    start http://localhost:8088
) else (
    echo [LOI] Khong the khoi chay Docker Compose. Hay kiem tra Docker Desktop!
)
pause
