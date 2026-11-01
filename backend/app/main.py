import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from fastapi import FastAPI,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from alembic import command
from alembic.config import Config
from app.config import settings
from app.seed import seed
from app.core.exception_handlers import register_exception_handlers
from app.core.auth_router import router as auth_router
from app.identity.router import router as identity_router
from app.identity.service import validate_configuration
from app.documents.router import router as documents_router
from app.contracts.router import router as contracts_router
from app.sharing.router import router as sharing_router
from app.assistant.router import router as assistant_router
from app.people.router import router as people_router
from app.exchange.router import router as exchange_router
from app.suppliers.router import router as suppliers_router
from app.tasks.router import router as tasks_router
from app.reports.router import router as reports_router
from app.suppliers.catalog_router import router as catalog_router
from app.suppliers.registration_router import router as registration_router
from app.operations.router import router as operations_router
from app.operations.map_config import router as operations_map_router
from app.collaboration.router import router as collaboration_router
from app.equipment.router import router as equipment_router
from app.renewals.router import router as renewals_router
from app.workspace.router import router as workspace_router
from app.documents.followup import router as document_followup_router

@asynccontextmanager
async def lifespan(app):
    validate_configuration()
    if settings.database_url.startswith('sqlite:///'):
        Path(settings.database_url.removeprefix('sqlite:///')).parent.mkdir(parents=True,exist_ok=True)
    settings.storage_dir.mkdir(parents=True,exist_ok=True)
    config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    command.upgrade(config,'head')
    seed()
    from app.renewals.service import sync_all, monitor
    await asyncio.to_thread(sync_all)
    from app.database import SessionLocal
    from app.extraction.service import backfill
    from app.extraction.worker import start
    with SessionLocal() as db: backfill(db)
    worker = start() if settings.extraction_enabled else None
    renewal_monitor = asyncio.create_task(monitor())
    try:
        yield
    finally:
        renewal_monitor.cancel()
        with suppress(asyncio.CancelledError):
            await renewal_monitor
        if worker:
            worker[0].set()
            worker[1].join(timeout=2)

app=FastAPI(title='FlyLeaf API',version='0.1.0',description='Local demonstration workspace. Synthetic airport documents; session-based access control.',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins + settings.oidc_extra_origins,allow_credentials=True,allow_methods=['GET','POST','PATCH','DELETE','OPTIONS'],allow_headers=['Content-Type'])
register_exception_handlers(app)

@app.middleware('http')
async def security_headers(request: Request,call_next):
    # Cookie-authenticated mutations reject cross-origin browser requests.
    origin=request.headers.get('origin')
    if request.method in ('POST','PATCH','DELETE','PUT') and origin:
        own=f'{request.url.scheme}://{request.headers.get("host","")}'
        if origin not in settings.cors_origins and origin not in settings.oidc_extra_origins and origin!=own:
            return JSONResponse(status_code=403,content={'detail':'Originea cererii nu este permisă.'})
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['Cache-Control']='no-store'
    return response

for router in (auth_router,identity_router,documents_router,contracts_router,sharing_router,assistant_router,people_router,exchange_router,suppliers_router,tasks_router,catalog_router,registration_router,operations_map_router,operations_router,reports_router,collaboration_router,equipment_router,renewals_router,workspace_router,document_followup_router):
    app.include_router(router)

@app.get('/api/health')
def health():
    return {'status':'ok','service':'FlyLeaf','airport_id':settings.airport_id,'demo':True}
