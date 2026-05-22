# Memories-Hub

Zelfgehost foto- en video-deelplatform. Jij host alles op je eigen computer thuis — geen cloud, volledige controle.

## Installatie (Ubuntu / Debian server)

### Optie A — Als de repo publiek staat (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/nightmaremood-coder/memories-hub/main/setup.sh | bash
```

> De repo publiek maken: GitHub → Settings → Danger Zone → **Change visibility → Public**

### Optie B — Als de repo privé blijft

```bash
git clone https://github.com/nightmaremood-coder/memories-hub.git
cd memories-hub
bash setup.sh
```

> Voor klonen van een privé-repo heb je een [Personal Access Token](https://github.com/settings/tokens) nodig als wachtwoord, of een SSH-sleutel.

---

Het script doet alles automatisch:
- Controleert of Docker en Git aanwezig zijn
- Genereert veilige willekeurige wachtwoorden in een `.env` bestand
- Bouwt de Docker images en start alle services
- Toont het adres van de API en het admin paneel

**Na de installatie:** Registreer via de mobiele app een account. Het **eerste account wordt automatisch admin** — je kunt meteen inloggen zonder goedkeuring.

---

## Architectuur

```
Internet
   │
   ▼
[Router: poort 8080 doorgestuurd]
   │
   ▼
nginx-proxy:8080  (public_net)
   │
   ▼
api:3000  ──── internal_net ────┬── postgres:5432
                                ├── redis:6379
                                ├── worker (media-verwerking)
                                └── admin-panel:8888 (alleen LAN)
```

**Twee netwerken:**
- `public_net` — alleen de Nginx proxy en de API (internet-bereikbaar)
- `internal_net` — database, Redis, worker en admin paneel (nooit internet-bereikbaar)

---

## Handmatig installeren (zonder het script)

**Vereisten:** Docker + Docker Compose v2, Git

```bash
# 1. Repository klonen
git clone https://github.com/nightmaremood-coder/memories-hub.git
cd memories-hub

# 2. Configuratie aanmaken
cp .env.example .env
nano .env   # pas de wachtwoorden en secrets aan

# 3. Starten (storage wordt automatisch aangemaakt door Docker)
docker compose up -d
```

**Eerste account = automatisch admin.** Registreer via de mobiele app — geen verdere stap nodig.

### Media opslaan op een externe schijf of NAS

Standaard slaat Docker de media op in een beheerde volume (`docker volume`). Wil je dit op een externe schijf opslaan, open dan `docker-compose.yml` en verwijder de opmerking bij het `media_storage` blok onderaan de volumes-sectie:

```yaml
media_storage:
  driver: local
  driver_opts:
    type: none
    o: bind
    device: /mnt/nas/memories-hub   # ← jouw pad hier
```

---

## Toegang

| Interface | Adres | Bereikbaar via |
|---|---|---|
| Mobiele app API | `http://JOUW_IP:8080/api/v1` | Internet (na port forwarding) |
| Admin paneel | `http://SERVER_LAN_IP:8888` | Alleen lokaal netwerk |

---

## Port forwarding instellen

Om de app ook buiten je thuisnetwerk te gebruiken:

1. Zoek het LAN-IP van je server: `hostname -I | awk '{print $1}'`
2. Ga naar de beheerpagina van je router (meestal `192.168.1.1`)
3. Voeg een port-forwarding regel toe:
   - Protocol: **TCP**
   - Extern poort: **8080**
   - Intern IP: jouw server-IP (bijv. `192.168.1.50`)
   - Intern poort: **8080**
4. Vind je publieke IP: `curl -s https://ipinfo.io/ip`
5. Stel in de mobiele app in: `http://PUBLIEK_IP:8080/api/v1`

> **Tip — Dynamic DNS:** Als je publieke IP regelmatig wijzigt, gebruik dan [DuckDNS](https://www.duckdns.org) voor een vaste hostnaam:
> ```bash
> docker run -d --restart unless-stopped \
>   -e SUBDOMAINS=mijn-memories \
>   -e TOKEN=jouw-duckdns-token \
>   linuxserver/duckdns
> ```

**Poort 8888 (admin paneel) NOOIT doorsturen naar buiten.**

---

## API endpoints

Alle endpoints hebben prefix `/api/v1`. Authenticatie via `Authorization: Bearer <token>`.

| Categorie | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Categorieën | `GET/POST /categories`, `GET/PATCH/DELETE /categories/:id` |
| Evenementen | `GET/POST /categories/:id/events`, `GET/PATCH/DELETE /events/:id` |
| Permissies | `GET/POST /events/:id/permissions`, `DELETE /events/:id/permissions/:permId` |
| Media | `GET/POST /events/:id/media`, `GET /media/:id/thumb`, `/preview`, `/video`, `/original` |
| Groepen | `GET/POST /groups`, `POST/DELETE /groups/:id/members` |
| Admin (LAN) | `GET /admin/users`, `PATCH /admin/users/:id/status`, `GET /admin/stats` |

---

## Ondersteunde bestandsformaten

| Type | Formaten |
|---|---|
| Foto's | JPG, PNG, WebP, HEIC/HEIF, GIF, BMP, TIFF |
| RAW | DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW |
| Video's | MP4, MOV, AVI, MKV, WebM, M4V, 3GP, MTS |

De worker genereert automatisch gecomprimeerde versies voor de app:
- `thumb_256.webp` — miniatuur voor grid-weergave
- `preview_1080.webp` — gecomprimeerde preview voor volledig scherm
- `video_720p.mp4` — gecomprimeerde video voor streaming

Originelen worden altijd bewaard voor de downloadknop.

---

## Beheer

```bash
# Logs bekijken
docker compose logs -f

# Stoppen
docker compose down

# Updaten naar nieuwe versie
git pull && docker compose build && docker compose up -d

# Backup maken (database + media)
./scripts/backup.sh /pad/naar/backups
```
