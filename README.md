# 🎨 PPT Generator — AI-Powered Presentation Builder

A full-stack AI presentation generator with **live streaming generation**, a beautiful slide editor, and PPTX export. Built with FastAPI + Next.js.

---

## 🗂️ Project Structure

```
ppt-generator/
├── .env                        ← Your config (copy from .env.example)
├── .env.example
├── start.sh                    ← One-command startup (both services)
├── start-backend.sh            ← Backend only
├── start-frontend.sh           ← Frontend only
├── app_data/                   ← Generated files (auto-created)
│   ├── presentations/
│   └── images/
└── servers/
    ├── fastapi/                ← Python backend
    │   ├── main.py
    │   ├── database.py
    │   ├── requirements.txt
    │   ├── api/v1/
    │   │   ├── auth/           ← JWT auth endpoints
    │   │   └── ppt/endpoints/  ← Presentation, slides, export...
    │   ├── services/
    │   │   ├── llm_client.py           ← LLM abstraction
    │   │   ├── presentation_builder.py ← Full AI pipeline
    │   │   ├── image_generation.py     ← Image gen (DALL-E / ComfyUI / placeholder)
    │   │   └── pptx_generator.py       ← python-pptx export
    │   ├── models/sql/         ← SQLModel database models
    │   └── lib/
    │       ├── themes.py
    │       └── layouts.py
    └── nextjs/                 ← Next.js 14 frontend
        ├── app/
        │   ├── login/          ← Login page
        │   ├── dashboard/      ← Presentation gallery
        │   ├── new/            ← 5-step wizard
        │   └── presentation/[id]/
        │       ├── page.tsx    ← Full editor
        │       └── generate/   ← Live SSE streaming generation
        ├── components/editor/
        │   ├── SlideRenderer.tsx   ← All 12 layouts rendered
        │   ├── SlideThumbnail.tsx  ← Left panel thumbnails
        │   └── SlideProperties.tsx ← Right panel properties
        ├── store/              ← Redux slices
        └── lib/api/            ← Axios API client
```

---

## ✅ Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python      | 3.10+   | `python3 --version` |
| Node.js     | 18+     | `node --version` |
| pip         | latest  | comes with Python |
| npm         | 9+      | comes with Node |
| **LLM**     | —       | Ollama (free/local) OR OpenAI API key |

**Optional:**
- Ollama running locally for free LLM inference
- OpenAI API key for GPT-4o-mini / DALL-E
- ComfyUI + SDXL Lightning for local image generation

---

## 🚀 Quick Start (Recommended)

### Step 1: Get the project

```bash
# If you downloaded the ZIP, unzip it:
unzip ppt-generator.zip
cd ppt-generator

# Or if cloned:
cd ppt-generator
```

### Step 2: Configure environment

```bash
cp .env.example .env
```

Open `.env` and configure your LLM. **Choose one option:**

**Option A — Ollama (free, runs locally):**
```bash
# First install Ollama: https://ollama.ai
ollama pull llama3.2

# In .env:
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.2
LLM_API_KEY=ollama
```

**Option B — OpenAI:**
```bash
# In .env:
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-your-key-here
```

**Option C — Any OpenAI-compatible API (Groq, Together, etc.):**
```bash
# In .env (example using Groq):
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama3-8b-8192
LLM_API_KEY=gsk_your-groq-key
```

### Step 3: Start everything

```bash
chmod +x start.sh
./start.sh
```

That's it! The script will:
1. Create a Python virtual environment
2. Install all Python dependencies
3. Install all Node dependencies
4. Start the FastAPI backend on **port 8000**
5. Start the Next.js frontend on **port 3000**

### Step 4: Open your browser

```
http://localhost:3000
```

Login with: **admin / changeme123**
(Change these in `.env` via `AUTH_USERNAME` and `AUTH_PASSWORD`)

---

## 🛠️ Manual Setup (Alternative)

If you prefer to run services separately in two terminals:

**Terminal 1 — Backend:**
```bash
cd servers/fastapi
python3 -m venv .venv
source .venv/bin/activate         # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
APP_DATA_DIR=../../app_data uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd servers/nextjs
npm install --legacy-peer-deps
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

---

## 🪟 Windows Setup

```powershell
# Terminal 1 (PowerShell) — Backend
cd servers\fastapi
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:APP_DATA_DIR="..\..\app_data"
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd servers\nextjs
npm install --legacy-peer-deps
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev
```

---

## 🖼️ Image Generation Options

By default, the app generates **colorful placeholder images** (no GPU needed). To enable real AI images:

### DALL-E 3 (via OpenAI):
```bash
# In .env:
USE_DALLE=true
OPENAI_API_KEY=sk-your-key
```

### ComfyUI with SDXL Lightning (local GPU):
```bash
# Install ComfyUI from: https://github.com/comfyanonymous/ComfyUI
# Download SDXL Lightning LoRA and place in models/loras/
# Start ComfyUI on port 8188, then in .env:
USE_COMFYUI=true
COMFYUI_URL=http://localhost:8188
```

---

## 🌐 API Reference

The backend runs at `http://localhost:8000`. Interactive docs: `http://localhost:8000/docs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Get JWT token |
| GET  | `/api/v1/auth/me` | Current user |
| GET  | `/api/v1/presentations` | List all |
| POST | `/api/v1/presentations` | Create new |
| GET  | `/api/v1/presentations/{id}` | Get with slides |
| GET  | `/api/v1/presentations/{id}/generate/stream` | **SSE stream** |
| PUT  | `/api/v1/slides/{id}` | Update slide |
| POST | `/api/v1/export/{id}/pptx` | Generate PPTX |
| GET  | `/api/v1/export/{id}/pptx/download` | Download PPTX |
| POST | `/api/v1/images/generate` | Generate image |

---

## 🎨 Themes & Layouts

**6 Built-in Themes:** Light, Dark, Royal, Ocean, Sunset, Forest

**12 Slide Layouts:**
- `title` — Title slide with subtitle
- `bullets` — Bullet points (optional image)
- `two_column` — Two-column comparison
- `image_left` / `image_right` — Image + content
- `stats` — Big number statistics cards
- `quote` — Large pull quote
- `timeline` — Chronological timeline
- `comparison` — Side-by-side pros/cons
- `team` — Team member cards
- `agenda` — Table of contents
- `blank` — Empty canvas

---

## 🔧 Configuration Reference

All settings in `.env`:

```bash
# Database (SQLite by default, no setup needed)
DATABASE_URL=sqlite+aiosqlite:///./app_data/ppt_generator.db

# LLM
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.2
LLM_API_KEY=ollama
LLM_MAX_TOKENS=4096

# Image generation
USE_COMFYUI=false
USE_DALLE=false
OPENAI_API_KEY=          # needed if USE_DALLE=true
COMFYUI_URL=http://localhost:8188

# Auth
AUTH_USERNAME=admin
AUTH_PASSWORD=changeme123
SECRET_KEY=change-this-random-string

# Performance
SLIDE_GENERATION_BATCH_SIZE=3  # slides to generate in parallel

# Ports
FAST_API_PORT=8000
NEXTJS_PORT=3000
```

---

## 🐛 Troubleshooting

**Backend fails to start:**
```bash
# Check Python version
python3 --version   # needs 3.10+

# Try installing deps manually
cd servers/fastapi
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

**LLM not responding:**
- For Ollama: make sure `ollama serve` is running and the model is pulled (`ollama pull llama3.2`)
- Check LLM_BASE_URL in `.env` — no trailing slash
- Test: `curl http://localhost:11434/v1/models`

**Frontend can't reach backend:**
- Make sure backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in `.env`
- The Next.js proxy in `next.config.js` rewrites `/api/*` to the backend

**PPTX export fails:**
- Make sure `python-pptx` is installed: `pip install python-pptx`
- Check `app_data/presentations/` directory is writable

**Images are just colored squares:**
- That's normal! Default mode uses placeholder images.
- To get real images, set `USE_DALLE=true` + `OPENAI_API_KEY` in `.env`

---

## 📋 Feature Checklist

- [x] 5-step creation wizard (topic, audience, tone, density, theme)
- [x] Live SSE streaming generation (outline → slides → images)
- [x] 12 slide layout types
- [x] 6 color themes
- [x] Slide editor with inline editing
- [x] Image generation (placeholder / DALL-E / ComfyUI)
- [x] PPTX export
- [x] JWT authentication
- [x] SQLite database (zero config)
- [x] Undo/redo in editor
- [x] Speaker notes
- [x] Zoom controls
- [x] Slide thumbnail panel
- [ ] PostgreSQL support (configured via DATABASE_URL)
- [ ] PDF export (needs Chrome/Puppeteer)
- [ ] Multi-user accounts
- [ ] Collaborative editing

---

## 📄 License

MIT — use it, build on it, ship it.
