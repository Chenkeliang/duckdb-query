from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import data_sources, query

app = FastAPI(
    title="Interactive Data Query API",
    description="API for interactive data querying and joining.",
    version="0.1.0",
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for simplicity, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_sources.router)
app.include_router(query.router)

@app.get("/", tags=["Default"])
async def root():
    return {"message": "Welcome to the Interactive Data Query API"}
