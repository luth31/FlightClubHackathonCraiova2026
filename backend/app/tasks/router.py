from fastapi import APIRouter,Depends,Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user
from app.tasks.schemas import Assignment
from app.tasks import service
router=APIRouter(prefix='/api/tasks',tags=['Assigned work'])

@router.get('')
def listing(status: str=Query('pending',pattern='^(pending|completed|cancelled|all)$'),mine: bool=False,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.list_tasks(db,user,status,mine)

@router.get('/{task_id}')
def detail(task_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    task,doc=service.get_task(db,user,task_id)
    return service.serialize(db,task,user,doc)

@router.post('/{task_id}/assign')
def assign(task_id: str,body: Assignment,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.assign(db,user,task_id,body)

from app.tasks.schemas import TaskComment

@router.post('/{task_id}/comments',status_code=201)
def comment(task_id: str,body: TaskComment,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.add_comment(db,user,task_id,body)
