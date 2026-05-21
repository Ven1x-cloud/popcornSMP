# SMP Website Prototype

Dit is een eerste gratis proefopstelling:

- `frontend/` -> statische site voor GitHub Pages
- `backend/` -> Flask API voor PythonAnywhere of lokaal testen

## Snel lokaal testen

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Backend draait dan op `http://127.0.0.1:5000`

### Frontend
Open `frontend/index.html` in je browser, of start lokaal een simpele server:

```bash
cd frontend
python -m http.server 5500
```

Open daarna `http://127.0.0.1:5500`

## Default owner account
Bij de eerste start maakt de backend automatisch een owner-account aan.

Standaard:
- username: `owner`
- password: `changeme123!`

Verander dit later direct.

## Wat dit prototype al kan
- health check
- registreren
- inloggen met token
- rollen: USER / ADMIN / OWNER
- admin-only mock server control
- command log

## Wat later komt
- Minecraft account linking
- echte server bridge
- betere auth/productie security
