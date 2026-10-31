# Best Practices for Structuring a FastAPI Project

The most widely adopted way to structure a FastAPI project is by **Package/Domain (Feature-based)** or by **Layer (Layer-based)**.

For small to medium projects, a **Layered Architecture** is clean and straightforward. For larger applications, a **Domain-Driven / Package-based Architecture** scales better because features are kept isolated.

---

## 1. Directory Structure

### Recommended Structure: Domain / Feature-Based (Best for Scale)
Keep each module self-contained with its own routes, schemas, models, and business logic.

```text
my_project/
├── app/
│   ├── __init__.py
│   ├── main.py              # App initialization, exception handlers & routers
│   ├── config.py            # Pydantic BaseSettings
│   ├── database.py          # DB engine & session setup
│   ├── dependencies.py      # Global/Shared dependencies (e.g., get_db)
│   │
│   ├── core/                # Core security, utility, middleware
│   │   ├── security.py
│   │   ├── exceptions.py    # Shared application exception types
│   │   └── exception_handlers.py # FastAPI exception-to-HTTP mapping
│   │
│   ├── users/               # 'users' domain/feature module
│   │   ├── __init__.py
│   │   ├── router.py        # APIRouter endpoints
│   │   ├── schemas.py       # Pydantic request/response models
│   │   ├── models.py        # Database ORM models (SQLAlchemy/SQLModel)
│   │   ├── service.py       # Business logic
│   │   ├── exceptions.py    # Feature-specific exception types
│   │   └── dependencies.py  # Feature-specific dependencies
│   │
│   └── items/               # 'items' domain/feature module
│       ├── __init__.py
│       ├── router.py
│       ├── schemas.py
│       ├── models.py
│       └── service.py
│
├── alembic/                 # Database migrations
├── tests/                   # Test suite mirroring app/
│   ├── conftest.py
│   └── users/
├── .env
├── requirements.txt
└── README.md
```

---

## 2. Key Component Implementation

### Configuration (`app/config.py`)
Use Pydantic's `BaseSettings` for type-safe environment variables.

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FastAPI App"
    DATABASE_URL: str
    SECRET_KEY: str

    class Config:
        env_file = ".env"

settings = Settings()
```

### Schemas vs. Models (`app/users/schemas.py` & `models.py`)
Keep database models separated from Pydantic schemas:
* **`schemas.py`**: Pydantic models for request validation and response serialization.
* **`models.py`**: SQLAlchemy or SQLModel classes for DB tables.

```python
# app/users/schemas.py
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr

    class Config:
        from_attributes = True
```

### Service / Business Logic (`app/users/service.py`)
Keep heavy logic out of your routers. Routers should only handle HTTP status codes, request parsing, and response returning.

```python
# app/users/service.py
from sqlalchemy.orm import Session
from app.users import models, schemas

def create_user(db: Session, user_data: schemas.UserCreate):
    db_user = models.User(email=user_data.email, hashed_password=hash_password(user_data.password))
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user
```

### Routers (`app/users/router.py`)
Use `APIRouter` to group related endpoints.

```python
# app/users/router.py
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.dependencies import get_db
from app.users import schemas, service

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return service.create_user(db=db, user_data=user)
```

### Exception Handlers (`app/core/exception_handlers.py`)
Define feature-specific exceptions in the feature's `exceptions.py` and shared application exceptions in `app/core/exceptions.py`. Services should raise these plain Python exceptions; keep HTTP status codes and response formatting in FastAPI exception handlers so business logic stays independent of the web framework.

```python
# app/users/exceptions.py
class UserNotFoundError(Exception):
    pass
```

```python
# app/core/exception_handlers.py
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from app.users.exceptions import UserNotFoundError

async def user_not_found_handler(
    request: Request, exc: UserNotFoundError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": "User not found"},
    )

def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(UserNotFoundError, user_not_found_handler)
```

Register handlers on the `FastAPI` application during initialization; `@app.exception_handler(...)` is an alternative to `app.add_exception_handler(...)`. This centralizes error responses without repeating `try`/`except` blocks in routers.

Keep FastAPI's default HTTP and request-validation handlers unless the API requires a custom error contract. When overriding them, handle Starlette's `HTTPException` to cover both framework and application errors, preserve its status code and headers, and handle FastAPI's `RequestValidationError` separately (normally HTTP 422). Unexpected errors should return a generic HTTP 500 response; keep internal exception details out of client responses. Verify handler status codes, response bodies, and required headers with API tests.

### Main Entrypoint (`app/main.py`)
Keep `main.py` minimal—initialize the app, attach middlewares/events, and register exception handlers and routers.

```python
# app/main.py
from fastapi import FastAPI
from app.core.exception_handlers import register_exception_handlers
from app.users.router import router as users_router
from app.items.router import router as items_router

app = FastAPI(title="My API")
register_exception_handlers(app)

app.include_router(users_router)
app.include_router(items_router)
```

---

## 3. Best Practices to Keep in Mind

1. **Decouple Router from Business Logic:** Route handlers should validate inputs (handled automatically by Pydantic) and pass data to a service/controller function.
2. **Use Dependency Injection (`Depends`):** Inject database sessions, auth middleware, and common parameters via FastAPI's `Depends` system.
3. **Async vs Sync Rules:**
   * Use `async def` only when performing non-blocking async operations (`await`).
   * Use standard synchronous `def` for traditional blocking I/O (like standard SQLAlchemy calls) so FastAPI runs them safely in an internal threadpool.
4. **Lifespan Context Manager:** Use `lifespan` instead of deprecated `on_event("startup")` for managing database pools, Redis clients, or background tasks.
5. **Database Migrations:** Set up **Alembic** right from day one rather than creating tables manually via `Base.metadata.create_all()`.
