from datetime import date
from pydantic import BaseModel, Field, model_validator
from typing import Literal
import re
import unicodedata


def work_email(name: str) -> str:
    parts = name.split()
    if len(parts) < 2:
        raise ValueError('Introdu prenumele și numele de familie pentru generarea emailului.')
    first = unicodedata.normalize('NFKD', parts[0]).encode('ascii', 'ignore').decode().lower()
    last = unicodedata.normalize('NFKD', parts[-1]).encode('ascii', 'ignore').decode().lower()
    last = re.sub(r"['’]", '', last)
    if not first or not re.fullmatch(r'[a-z]+(?:-[a-z]+)*', last) or not re.match(r'[a-z]', first):
        raise ValueError('Numele trebuie să permită generarea unei adrese de email valide.')
    local = f'{first[0]}.{last}'
    if len(local) > 64:
        raise ValueError('Numele de familie este prea lung pentru adresa de email.')
    return f'{local}@arm.ro'


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


class EmployeeCreate(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    name: str = Field(min_length=2, max_length=150)
    email: str | None = Field(default=None, min_length=5, max_length=254)
    department_id: str = Field(max_length=100)
    job_title: str = Field(min_length=2, max_length=150)
    manager_id: str | None = None
    access_profile: Literal['employee', 'technician'] = 'employee'

    @model_validator(mode='after')
    def generated_email(self):
        generated = work_email(self.name)
        if self.email is not None and self.email.lower() != generated:
            raise ValueError('Emailul de serviciu este generat automat din numele angajatului.')
        self.email = generated
        return self


class EmployeeUpdate(BaseModel):
    model_config = {'extra': 'forbid', 'str_strip_whitespace': True}
    name: str | None = Field(default=None, min_length=2, max_length=150)
    department_id: str | None = None
    job_title: str | None = Field(default=None, min_length=2, max_length=150)
    manager_id: str | None = None


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
