#!/bin/bash
# ONLYOFFICE Document Server Auto-Installer for Linux

set -e

echo "========================================================"
echo "      ONLYOFFICE Document Server - Offline Auto Installer"
echo "========================================================"
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "[INFO] Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm -f get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo "[OK] Docker installed successfully."
fi

# Check if ONLYOFFICE is already running
if docker ps -a --format '{{.Names}}' | grep -Eq "^onlyoffice-documentserver$"; then
    echo "[INFO] Existing ONLYOFFICE container found. Starting..."
    docker start onlyoffice-documentserver
else
    echo "[INFO] Pulling and running ONLYOFFICE Document Server on port 8088..."
    docker run -i -t -d -p 8088:80 \
        --name onlyoffice-documentserver \
        --restart=always \
        -e JWT_ENABLED=false \
        -e ALLOW_PRIVATE_IP_ADDRESS=true \
        -e USE_UNAUTHORIZED_STORAGE=true \
        onlyoffice/documentserver
fi

echo ""
echo "========================================================"
echo "[SUCCESS] ONLYOFFICE Document Server is running offline!"
echo "Server URL: http://localhost:8088"
echo "========================================================"
