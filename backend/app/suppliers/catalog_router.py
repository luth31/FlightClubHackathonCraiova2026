from fastapi import APIRouter,Depends
from app.database import get_db
from app.core.security import current_user
from app.suppliers import catalog
from app.suppliers.schemas import ContractLink,SupplierUpdate
router=APIRouter(prefix='/api/suppliers',tags=['Supplier catalog'])
@router.get('')
def listing(db=Depends(get_db),user=Depends(current_user)): return catalog.listing(db,user)
@router.get('/{supplier_id}')
def detail(supplier_id:str,db=Depends(get_db),user=Depends(current_user)): return catalog.detail(db,user,supplier_id)
@router.get('/{supplier_id}/contracts')
def contracts(supplier_id:str,db=Depends(get_db),user=Depends(current_user)): return catalog.contract_list(db,user,supplier_id)
@router.post('/{supplier_id}/contracts')
def link(supplier_id:str,body:ContractLink,db=Depends(get_db),user=Depends(current_user)): return catalog.link_contract(db,user,supplier_id,body)
@router.patch('/{supplier_id}')
def update(supplier_id:str,body:SupplierUpdate,db=Depends(get_db),user=Depends(current_user)): return catalog.update(db,user,supplier_id,body)
