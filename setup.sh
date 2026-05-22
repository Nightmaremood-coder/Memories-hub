#!/usr/bin/env bash
# Memories-Hub — automatische installatie voor Ubuntu/Debian
# Gebruik: curl -fsSL https://raw.githubusercontent.com/nightmaremood-coder/memories-hub/main/setup.sh | bash

set -euo pipefail

REPO_URL="https://github.com/nightmaremood-coder/memories-hub.git"
INSTALL_DIR="memories-hub"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[memories-hub]${NC} $*"; }
success() { echo -e "${GREEN}[memories-hub]${NC} $*"; }
warn()    { echo -e "${YELLOW}[memories-hub]${NC} $*"; }
error()   { echo -e "${RED}[memories-hub]${NC} $*" >&2; exit 1; }

generate_secret() {
  python3 -c "import secrets; print(secrets.token_hex(48))" 2>/dev/null \
    || openssl rand -hex 48 2>/dev/null \
    || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 96
}

# ── Vereisten controleren ──────────────────────────────────────────────────────
info "Vereisten controleren..."

command -v docker >/dev/null 2>&1 || error "Docker is niet geïnstalleerd. Installeer het via: https://docs.docker.com/engine/install/ubuntu/"
docker compose version >/dev/null 2>&1 || error "Docker Compose (v2) is niet beschikbaar. Voer 'sudo apt install docker-compose-plugin' uit."
command -v git >/dev/null 2>&1 || error "Git is niet geïnstalleerd. Voer 'sudo apt install git' uit."

# Docker socket bereikbaarheidscheck (veelvoorkomend probleem op Ubuntu)
if ! docker info >/dev/null 2>&1; then
  echo ""
  echo -e "${RED}[memories-hub]${NC} Geen toegang tot de Docker socket."
  echo ""
  echo "  Voer dit uit en start het script daarna opnieuw:"
  echo ""
  echo -e "  ${CYAN}sudo usermod -aG docker \$USER${NC}"
  echo -e "  ${CYAN}newgrp docker${NC}"
  echo ""
  exit 1
fi

success "Alle vereisten aanwezig."

# ── Repository klonen ──────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Bestaande installatie gevonden in ./$INSTALL_DIR — bijwerken..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Repository klonen naar ./$INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── .env aanmaken (alleen als die nog niet bestaat) ───────────────────────────
if [ -f ".env" ]; then
  warn ".env bestaat al — secrets worden niet overschreven."
else
  info "Configuratie aanmaken met willekeurige secrets..."

  DB_PASS=$(generate_secret)
  REDIS_PASS=$(generate_secret)
  JWT_ACCESS=$(generate_secret)
  JWT_REFRESH=$(generate_secret)

  cat > .env <<EOF
POSTGRES_DB=memorieshub
POSTGRES_USER=mhub
POSTGRES_PASSWORD=${DB_PASS}
REDIS_PASSWORD=${REDIS_PASS}
JWT_ACCESS_SECRET=${JWT_ACCESS}
JWT_REFRESH_SECRET=${JWT_REFRESH}
MAX_UPLOAD_SIZE_MB=500
WORKER_CONCURRENCY=2
EOF

  success ".env aangemaakt met veilige willekeurige wachtwoorden."
fi

# ── Docker images bouwen en starten ───────────────────────────────────────────
info "Docker images bouwen (dit kan de eerste keer 5–10 minuten duren)..."
docker compose build

info "Memories-Hub starten..."
docker compose up -d

# ── Wachten tot de API bereikbaar is ──────────────────────────────────────────
info "Wachten tot de API gereed is..."
MAX_WAIT=90
ELAPSED=0
until curl -sf http://localhost:8080/health >/dev/null 2>&1; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    warn "API is na ${MAX_WAIT}s nog niet bereikbaar. Controleer: docker compose logs api"
    break
  fi
done

# ── Lokaal IP ophalen ──────────────────────────────────────────────────────────
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "192.168.x.x")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Memories-Hub is succesvol geïnstalleerd!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Mobiele app API:${NC}   http://${LAN_IP}:8080/api/v1"
echo -e "  ${CYAN}Admin paneel:${NC}      http://${LAN_IP}:8888  (alleen lokaal netwerk)"
echo ""
echo -e "  ${YELLOW}Eerste stap:${NC} Registreer een account via de mobiele app."
echo -e "             Het eerste account wordt automatisch admin."
echo ""
echo -e "  ${YELLOW}Port forwarding:${NC}  Stel poort 8080 door in je router naar ${LAN_IP}:8080"
echo -e "                   zodat de app ook buiten je thuisnetwerk werkt."
echo ""
echo -e "  ${YELLOW}Logs bekijken:${NC}    docker compose logs -f"
echo -e "  ${YELLOW}Stoppen:${NC}          docker compose down"
echo -e "  ${YELLOW}Backup:${NC}           ./scripts/backup.sh"
echo ""
