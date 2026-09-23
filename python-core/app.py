from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import routes_auth
import routes_bank
import routes_exams
import routes_meta
import routes_students


def build_app():
    app = FastAPI(title="OnLuyen HSG Core")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"], allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )
    app.include_router(routes_meta.router)
    app.include_router(routes_bank.router)
    app.include_router(routes_students.router)
    app.include_router(routes_auth.router)
    app.include_router(routes_exams.router)
    return app
