@echo off
echo =====================================================
echo  [DOCKER] BIEN DICH FIRMWARE ESP32 BANG PLATFORMIO
echo =====================================================

docker compose run --rm firmware-builder

if %ERRORLEVEL% EQU 0 (
    echo.
    echo >>> BIEN DICH THANH CONG! <<<
    echo File nạp: .pio\build\esp32doit-devkit-v1\firmware.bin
) else (
    echo [LOI] Co loi trong qua trinh bien dich firmware!
)
pause
