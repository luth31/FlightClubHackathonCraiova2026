from alembic import context
from app.database import Base,engine
from app.people import models as people_models
from app.documents import models as document_models
from app.contracts import models as contract_models
from app.sharing import models as share_models
from app.core import models as core_models
from app.suppliers import models as supplier_models
from app.tasks import models as task_models
from app.identity import models as identity_models
config=context.config
target_metadata=Base.metadata

def include_object(object,name,type_,reflected,compare_to):
    return not name.startswith('document_search') if name else True

def run_migrations_offline():
    from app.config import settings
    context.configure(url=settings.database_url,target_metadata=target_metadata,literal_binds=True,dialect_opts={'paramstyle':'named'})
    with context.begin_transaction(): context.run_migrations()

def run_migrations_online():
    with engine.connect() as connection:
        context.configure(connection=connection,target_metadata=target_metadata,render_as_batch=True,include_object=include_object)
        with context.begin_transaction(): context.run_migrations()

if context.is_offline_mode(): run_migrations_offline()
else: run_migrations_online()
