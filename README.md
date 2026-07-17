Gen Studio AI-Powered Presentation Builder

A full-stack AI presentation generator with **live streaming generation**, a beautiful slide editor, and PPTX export. Built with FastAPI + Next.js.


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


## ✅ Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python      | 3.10+   | `python3 --version` |
| Node.js     | 18+     | `node --version` |
| pip         | latest  | comes with Python |
| npm         | 9+      | comes with Node |
| **LLM**     | —       | Ollama (free/local) OR OpenAI API key |



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



# Ports
FAST_API_PORT=8005
NEXTJS_PORT=3000



