from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

app = FastAPI(title="Infrastructure Calculator")

# Add CORS middleware to allow CDN resources
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

root = Path(__file__).resolve().parents[1]
app.mount("/config", StaticFiles(directory=root / "config"), name="config")
app.mount("/", StaticFiles(directory=root / "web", html=True), name="web")
