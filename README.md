# Memories-Hub

Zelfgehost foto- en video-deelplatform. Jij host alles op je eigen computer thuis — geen cloud, volledige controle.

## Architectuur

```
Internet
   │
   ▼
[Router: port 8080 doorgestuurd]
   │
   ▼
nginx-proxy:8080  (public_net)
   │
   ▼
api:3000  ──── internal_net ────┬── postgres:5432
                                ├── redis:6379
                                ├── worker
                                └── admin-panel:8888 (127.0.0.1 only)
```

## Snel starten

**Vereisten:** Docker + Docker Compose v2

```bash
# 1. Kopieer de environment-configuratie
cp .env.example .env

# 2. Pas de waarden aan in .env (wachtwoorden, paden, secrets)
nano .env

# 3. Maak de storage-map aan (of stel MEDIA_STORAGE_PATH in op een extern schijfpad)
mkdir -p storage/originals storage/renditions

# 4. Start het systeem
docker compose up -d

# 5. Maak de eerste admin-gebruiker aan
#    Genereer eerst een bcrypt-hash van je gewenste wachtwoord:
docker compose exec api node -e "
  const bcrypt = require('bcrypt');
  bcrypt.hash('JOUW_WACHTWOORD', 12).then(h => console.log(h));
"
#    Kopieer de hash en voer het seed-script uit:
docker compose exec postgres psql -U mhub memorieshub \
  -c "INSERT INTO users (username, email, password_hash, display_name, role, status)
      VALUES ('admin', 'admin@memories-hub.local', 'JOUW_HASH', 'Administrator', 'admin', 'active')
      ON CONFLICT DO NOTHING;"
```

## Toegang

| Interface | Adres | Toegankelijk via |
|---|---|---|
| Mobiele app API | `http://JOUW_IP:8080/api/v1` | Internet (na port forwarding) |
| Admin paneel | `http://SERVER_LAN_IP:8888` | Alleen lokaal netwerk |

## Port forwarding

1. Zoek het LAN-IP van je server: `ip addr show`
2. Ga naar de beheerpagina van je router (`192.168.1.1` of `192.168.0.1`)
3. Voeg een port-forwarding regel toe:
   - Protocol: TCP
   - Extern poort: `8080`
   - Intern IP: jouw server LAN-IP (bijv. `192.168.1.50`)
   - Intern poort: `8080`
4. Vind je publieke IP: `curl -s https://ipinfo.io/ip`
5. Stel in de mobiele app in: `http://PUBLIEK_IP:8080/api/v1`

**Aanbevolen: Dynamic DNS**

Gebruik DuckDNS zodat je een vaste hostnaam hebt ook als je publieke IP wijzigt:
```bash
docker run -d --restart unless-stopped \
  -e SUBDOMAINS=memories-hub \
  -e TOKEN=jouw-duckdns-token \
  linuxserver/duckdns
```

## API endpoints overzicht

Alle endpoints hebben prefix `/api/v1`. Authenticatie via `Authorization: Bearer <token>`.

| Categorie | Voorbeeld |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` |
| Categorieën | `GET /categories`, `POST /categories` |
| Evenementen | `GET /categories/:id/events`, `POST /categories/:id/events` |
| Permissies | `POST /events/:id/permissions` |
| Media | `POST /events/:id/media` (upload), `GET /media/:id/thumb` |
| Groepen | `GET /groups`, `POST /groups/:id/members` |
| Admin (LAN) | `GET /admin/stats`, `PATCH /admin/users/:id/status` |

## Media-ondersteuning

| Type | Formaten |
|---|---|
| Foto's | JPG, PNG, WebP, HEIC/HEIF, GIF, BMP, TIFF |
| RAW | DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW |
| Video's | MP4, MOV, AVI, MKV, WebM, M4V, 3GP, MTS |

Originelen worden altijd bewaard. De worker genereert automatisch:
- `thumb_256.webp` — 256x256 thumbnail voor grid-weergave
- `preview_1080.webp` — gecomprimeerde preview voor volledig scherm
- `video_720p.mp4` — gecomprimeerde video voor streaming

## Backup

```bash
./scripts/backup.sh /pad/naar/backups
```

Maakt een database-dump (SQL.gz) en een media-archief (tar.gz) aan.
