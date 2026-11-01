from datetime import date
from pydantic import BaseModel, Field, model_validator
from typing import Literal
from app.people.names import display_name


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
    model_config = {'extra': 'forbid'}
    active: bool


class PresenceUpdate(BaseModel):
    model_config = {'extra': 'forbid'}
    status: Literal['automatic', 'available', 'busy', 'do_not_disturb', 'be_right_back', 'away', 'offline']
    duration_minutes: int | None = Field(default=None, ge=1, le=10080, strict=True)


class StatusMessageUpdate(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    message: str = Field(max_length=280)
    duration_minutes: int | None = Field(default=None, ge=1, le=10080, strict=True)


class EmployeeCreate(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    first_name: str = Field(min_length=1, max_length=75)
    middle_name: str = Field(default='', max_length=75)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=5, max_length=254, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    department_id: str = Field(max_length=100)
    job_title: str = Field(min_length=2, max_length=150)
    manager_id: str | None = None
    access_profile: Literal['employee', 'technician'] = 'employee'

    @property
    def name(self):
        return display_name(self.first_name, self.middle_name, self.last_name)

    @model_validator(mode='after')
    def name_length(self):
        if len(self.name) > 150:
            raise ValueError('Numele complet poate avea cel mult 150 de caractere.')
        return self


class EmployeeUpdate(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    first_name: str | None = Field(default=None, min_length=1, max_length=75)
    middle_name: str | None = Field(default=None, max_length=75)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    department_id: str | None = None
    job_title: str | None = Field(default=None, min_length=2, max_length=150)
    manager_id: str | None = None

    @model_validator(mode='after')
    def supplied_names(self):
        for key in ('first_name', 'middle_name', 'last_name'):
            if key in self.model_fields_set and getattr(self, key) is None:
                raise ValueError('Numele nu poate fi null. Folosește un șir gol pentru prenumele secundar.')
        return self


class AppointmentCreate(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    department_id: str
    user_id: str
    effective_date: date
    reason: str = Field(min_length=3, max_length=1000)


class SigningAuthority(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    enabled: bool
    reason: str = Field(min_length=3, max_length=1000)
