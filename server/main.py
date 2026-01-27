from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI(title="Infrastructure Calculator")

root = Path(__file__).resolve().parents[1]
app.mount("/config", StaticFiles(directory=root / "config"), name="config")
app.mount("/", StaticFiles(directory=root / "web", html=True), name="web")
