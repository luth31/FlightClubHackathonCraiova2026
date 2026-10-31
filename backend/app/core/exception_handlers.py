from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.core.exceptions import DomainError

def register_exception_handlers(app: FastAPI):
    @app.exception_handler(DomainError)
    async def domain_error(_request: Request, exc: DomainError):
        return JSONResponse(status_code=exc.status, content={'detail': exc.message})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        # Raw inputs may contain non-finite JSON numbers or sensitive payloads.
        # Preserve standard validation locations/messages without echoing them.
        errors=[{'type':e['type'],'loc':e['loc'],'msg':e['msg']} for e in exc.errors()]
        return JSONResponse(status_code=422,content={'detail':errors})
