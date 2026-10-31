from datetime import date
from pydantic import BaseModel, Field, model_validator


class DateInterval(BaseModel):
    starts_at: date
    ends_at: date

    @model_validator(mode='after')
    def ordered_dates(self):
        if self.ends_at < self.starts_at:
            raise ValueError('Data de sfârșit trebuie să fie după data de început.')
        return self


class DelegationCreate(DateInterval):
    from_user: str
    to_user: str
    reason: str = Field(min_length=3, max_length=1000)


class LeaveCreate(DateInterval):
    reason: str = Field(default='Concediu de odihnă', min_length=3, max_length=1000)


class LeaveDecision(BaseModel):
    action: str = Field(pattern='^(approve|reject)$')
    comment: str = Field(default='', max_length=1000)


class AccountUpdate(BaseModel):
    active: bool
