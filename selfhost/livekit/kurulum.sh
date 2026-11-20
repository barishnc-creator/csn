#!/usr/bin/env bash
# CSN — kendi LiveKit sunucusu (Ubuntu 22.04/24.04, arm64 veya amd64; Oracle Cloud Always Free için yazıldı).
# Tek komut:  curl -fsSL https://raw.githubusercontent.com/barishnc-creator/csn/main/selfhost/livekit/kurulum.sh | sudo bash
# Ne yapar: Docker kurar, LiveKit + Caddy (otomatik HTTPS) + Redis çalıştırır, güvenlik duvarını açar,
#           API anahtarını üretir ve /opt/csn-livekit/BILGI.txt dosyasına yazar.
# Alan adı gerekmez: <ip>.sslip.io adı kullanılır (ücretsiz, Let's Encrypt sertifikası Caddy ile alınır).
# Kendi alan adın varsa:  sudo DOMAIN=ses.ornek.com bash kurulum.sh
set -euo pipefail

DIR=/opt/csn-livekit
LK_IMAGE=livekit/livekit-server:v1.13
[ "$(id -u)" = 0 ] || { echo "sudo ile çalıştır"; exit 1; }

echo "== Genel IP bulunuyor"
IP=$(curl -fsS4 https://api.ipify.org || curl -fsS4 https://ifconfig.me)
DOMAIN=${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}
echo "   IP: $IP  alan adı: $DOMAIN"

echo "== Takas alanı (küçük makinelerde bellek yetmezliğine karşı)"
if ! swapon --show | grep -q .; then
  MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
  if [ "$MEM" -lt 4000 ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
fi

echo "== Docker"
# İlk açılışta otomatik güncellemeler apt kilidini tutar: bitmesini bekle
for i in $(seq 1 60); do pgrep -x "apt|apt-get|dpkg|unattended-upgr" >/dev/null || break; sleep 5; done
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker

echo "== Güvenlik duvarı (Oracle Ubuntu imajı iptables ile her şeyi kapatır)"
# Oracle imajında INPUT zincirinin sonunda REJECT var: kurallar onun önüne eklenir
open_port() {
  iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null && return
  local n; n=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
  if [ -n "$n" ]; then iptables -I INPUT "$n" -p "$1" --dport "$2" -j ACCEPT; else iptables -A INPUT -p "$1" --dport "$2" -j ACCEPT; fi
}
for P in tcp:80 tcp:443 tcp:7881 udp:3478 udp:50000:60000 udp:30000:40000; do open_port "${P%%:*}" "${P#*:}"; done
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; else
  DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null && netfilter-persistent save; fi
if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 7881/tcp; ufw allow 3478/udp; ufw allow 50000:60000/udp; ufw allow 30000:40000/udp; fi

mkdir -p "$DIR" && cd "$DIR"
if [ ! -f keys.env ]; then
  echo "API_KEY=API$(openssl rand -hex 6)" > keys.env
  echo "API_SECRET=$(openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-44)" >> keys.env
  chmod 600 keys.env
fi
. ./keys.env

cat > livekit.yaml <<YAML
port: 7880
bind_addresses: [""]
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
redis:
  address: localhost:6379
keys:
  $API_KEY: $API_SECRET
turn:
  enabled: true
  udp_port: 3478
  domain: $DOMAIN
room:
  empty_timeout: 300
logging:
  level: info
YAML

cat > Caddyfile <<CADDY
$DOMAIN {
  reverse_proxy localhost:7880
}
CADDY

cat > docker-compose.yml <<YAML
services:
  livekit:
    image: $LK_IMAGE
    command: --config /etc/livekit.yaml
    network_mode: host
    restart: unless-stopped
    volumes: [./livekit.yaml:/etc/livekit.yaml:ro]
    depends_on: [redis]
  redis:
    image: redis:7-alpine
    command: redis-server --bind 127.0.0.1 --save ""
    network_mode: host
    restart: unless-stopped
  caddy:
    image: caddy:2
    network_mode: host
    restart: unless-stopped
    volumes: [./Caddyfile:/etc/caddy/Caddyfile:ro, caddy_data:/data]
volumes:
  caddy_data:
YAML

echo "== Başlatılıyor"
docker compose pull -q
docker compose up -d

echo "== Sertifika bekleniyor (en çok 2 dk)"
for i in $(seq 1 40); do
  if curl -fsS "https://$DOMAIN" >/dev/null 2>&1; then OK=1; break; fi; sleep 3
done

cat > BILGI.txt <<INFO
Supabase → Edge Functions → Secrets'a şu üçünü ekle:
  LIVEKIT_SELF_URL     wss://$DOMAIN
  LIVEKIT_SELF_KEY     $API_KEY
  LIVEKIT_SELF_SECRET  $API_SECRET
(LiveKit Cloud anahtarlarına dokunma; bu sunucu çalışmazsa CSN otomatik olarak onlara döner.)
INFO
chmod 600 BILGI.txt
echo
if [ "${OK:-}" = 1 ]; then echo "✅ Hazır: https://$DOMAIN"; else
  echo "⚠️  https://$DOMAIN henüz yanıt vermiyor. Oracle'da 'Security List' giriş kuralları açık mı? (README adım 3)"; fi
echo
cat BILGI.txt
