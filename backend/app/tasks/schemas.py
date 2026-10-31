from datetime import date
from pydantic import BaseModel,Field,field_validator
class Assignment(BaseModel):
    assigned_to: str=Field(min_length=1,max_length=100)
    due_date: date | None=None
    comment: str=Field(min_length=3,max_length=2000)
    version: int=Field(ge=1)
    @field_validator('comment',mode='before')
    @classmethod
    def trim(cls,value):
        return value.strip() if isinstance(value,str) else value

class TaskComment(BaseModel):
    comment: str=Field(min_length=3,max_length=2000)
    version: int=Field(ge=1)
    @field_validator('comment',mode='before')
    @classmethod
    def trim(cls,value):
        return value.strip() if isinstance(value,str) else value
