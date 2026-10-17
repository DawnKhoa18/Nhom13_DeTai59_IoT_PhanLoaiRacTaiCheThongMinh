# Khởi chạy Docker Stack cho Smart Recycling IoT System
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " [DOCKER] KHOI CHAY SMART RECYCLING IOT STACK" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan

docker compose up -d web-dashboard mqtt-broker

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host ">>> DICH VU DA SAN SANG! <<<" -ForegroundColor Green
    Write-Host "1. Web Dashboard  : http://localhost:8088" -ForegroundColor White
    Write-Host "2. MQTT Broker TCP: localhost:1883" -ForegroundColor White
    Write-Host "3. MQTT WebSocket : localhost:9001" -ForegroundColor White
    Write-Host ""
    Write-Host "Mo trinh duyet truy cap: http://localhost:8088" -ForegroundColor Cyan
    Start-Process "http://localhost:8088"
} else {
    Write-Host "Loi khi khoi chay Docker. Hay kiem tra Docker Desktop da bat chua!" -ForegroundColor Red
}
