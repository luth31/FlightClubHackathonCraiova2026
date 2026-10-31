from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user
from app.assistant import service

router=APIRouter(prefix='/api/assistant',tags=['Evidence assistant'])
class Question(BaseModel):
    question: str=Field(min_length=2,max_length=1000)

@router.post('')
def ask(body: Question,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.ask(body.question,db,user)
