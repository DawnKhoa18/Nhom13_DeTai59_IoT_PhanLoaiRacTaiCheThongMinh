# Biên dịch Firmware ESP32 qua Docker
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " [DOCKER] BIEN DICH FIRMWARE ESP32 BANG PLATFORMIO" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan

docker compose run --rm firmware-builder

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host ">>> BIEN DICH THANH CONG! <<<" -ForegroundColor Green
    Write-Host "File nap: .pio\build\esp32doit-devkit-v1\firmware.bin" -ForegroundColor White
} else {
    Write-Host "Co loi trong qua trinh bien dich firmware!" -ForegroundColor Red
}
