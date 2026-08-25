#!/bin/bash
CERT_DIR="./data/certbot/conf/live/$DOMAIN"

if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
    echo "▶ [최초 배포 감지] SSL 인증서 초기화 작업을 시작합니다."

    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout "$CERT_DIR/privkey.pem" \
      -out "$CERT_DIR/fullchain.pem" \
      -subj "/CN=localhost"

    docker compose -f docker-compose.override.yml up -d proxy

    rm -rf "$CERT_DIR"
    sudo docker compose -f docker-compose.override.yml run --rm certbot certonly --webroot \
      --webroot-path=/var/www/certbot \
      --email $EMAIL \
      --agree-tos \
      --no-eff-email \
      -d $DOMAIN

    sudo docker compose -f docker-compose.override.yml exec proxy nginx -s reload 
else
    echo "기존 SSL 인증서가 확인되었습니다. 인증서 초기화를 건너뜁니다."
fi

sudo docker compose -f docker-compose.override.yml up -d --remove-orphans
sudo docker image prune -f