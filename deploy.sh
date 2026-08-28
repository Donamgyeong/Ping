#!/bin/bash
set -e

cd "$(dirname "$0")"

CERT_DIR="./data/certbot/conf/live/$DOMAIN"
COMPOSE_CMD="sudo docker compose -f docker-compose.override.yml --env-file ./.env"

echo "인증서 확인 경로: $CERT_DIR/fullchain.pem"

$COMPOSE_CMD pull

# if [ -f "$CERT_DIR/fullchain.pem" ] || [ -L "$CERT_DIR/fullchain.pem" ]; then
#     echo "▶ [최초 배포 감지] SSL 인증서 초기화 작업을 시작합니다."

#     mkdir -p "$CERT_DIR"
#     openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
#       -keyout "$CERT_DIR/privkey.pem" \
#       -out "$CERT_DIR/fullchain.pem" \
#       -subj "/CN=localhost"

#     $COMPOSE_CMD up -d --remove-orphans

#     sleep 30

#     rm -rf "$CERT_DIR"

#     $COMPOSE_CMD run --rm --entrypoint "certbot" certbot certonly --webroot \
#       --webroot-path=/var/www/certbot \
#       --email "$EMAIL" \
#       --agree-tos \
#       --no-eff-email \
#       -d "$DOMAIN"

#     $COMPOSE_CMD exec proxy nginx -s reload
# else
#     $COMPOSE_CMD up -d --remove-orphans
#     echo "기존 SSL 인증서가 확인되었습니다. 인증서 초기화를 건너뜁니다."
# fi


$COMPOSE_CMD up -d --remove-orphans
# 전체 서비스 기동 후 불필요한 이미지 정리
sudo docker image prune -f