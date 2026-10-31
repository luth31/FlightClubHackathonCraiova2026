"""Embedded PDF signatures using per-user self-signed demonstration certificates.
Not a qualified eIDAS signing service. Private keys stay in the backend keystore.
"""
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from pyhanko.sign import signers, fields
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext
from asn1crypto import x509 as asn1_x509
from app.config import settings
from app.core.exceptions import DomainError

def signer_for(user):
    folder=settings.storage_dir/'keystore'
    folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    pfx=folder/f'{user.id}.p12'
    certpath=folder/f'{user.id}.der'
    if not pfx.exists():
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,f'{user.name} — AeroDesk DEMO'),x509.NameAttribute(NameOID.ORGANIZATION_NAME,settings.airport_name)])
        cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(datetime.now(timezone.utc)-timedelta(days=1)).not_valid_after(datetime.now(timezone.utc)+timedelta(days=365)).add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True).add_extension(x509.KeyUsage(digital_signature=True,content_commitment=True,key_encipherment=False,data_encipherment=False,key_agreement=False,key_cert_sign=False,crl_sign=False,encipher_only=False,decipher_only=False),critical=True).sign(key,hashes.SHA256()))
        pfx.write_bytes(pkcs12.serialize_key_and_certificates(user.id.encode(),key,cert,None,serialization.NoEncryption()))
        pfx.chmod(0o600)
        certpath.write_bytes(cert.public_bytes(serialization.Encoding.DER))
    signer=signers.SimpleSigner.load_pkcs12(str(pfx))
    if not signer: raise DomainError('Certificatul de demonstrație nu poate fi încărcat.',500)
    return signer,hashlib.sha256(certpath.read_bytes()).hexdigest()

def sign_file(user,input_path,output_path):
    signer,fingerprint=signer_for(user)
    with open(input_path,'rb') as source,open(output_path,'wb') as target:
        writer=IncrementalPdfFileWriter(source)
        meta=signers.PdfSignatureMetadata(field_name='AeroDeskApproval',reason='Aprobare document — certificat demonstrativ, fără valoare calificată',location=settings.airport_name)
        signers.PdfSigner(meta,signer=signer,new_field_spec=fields.SigFieldSpec(sig_field_name='AeroDeskApproval',box=(40,30,340,75))).sign_pdf(writer,output=target)
    return fingerprint

def verify_file(path,signer_id,expected_fingerprint):
    certpath=settings.storage_dir/'keystore'/f'{signer_id}.der'
    if not certpath.exists(): return {'integrity':False,'certificate_trusted':False,'reason':'Certificatul nu este în registrul local.'}
    certificate=certpath.read_bytes()
    pinned=hashlib.sha256(certificate).hexdigest()==expected_fingerprint
    try:
        with open(path,'rb') as stream:
            reader=PdfFileReader(stream)
            if not reader.embedded_signatures: return {'integrity':False,'certificate_trusted':False,'reason':'Semnătura lipsește.'}
            embedded=reader.embedded_signatures[0]
            pinned=pinned and hashlib.sha256(embedded.signer_cert.dump()).hexdigest()==expected_fingerprint
            context=ValidationContext(trust_roots=[asn1_x509.Certificate.load(certificate)],allow_fetching=False)
            result=validate_pdf_signature(embedded,signer_validation_context=context)
            return {'integrity':bool(result.intact and result.valid and pinned),'certificate_trusted':bool(pinned),'cryptographic_valid':bool(result.valid),'coverage':str(result.coverage),'reason':'Semnătură verificată cu certificatul demonstrativ înregistrat.' if result.intact and result.valid and pinned else 'Documentul sau certificatul nu corespunde.'}
    except Exception:
        return {'integrity':False,'certificate_trusted':False,'reason':'Verificarea criptografică a eșuat.'}
