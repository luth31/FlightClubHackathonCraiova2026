"""Generate local demonstration gateway credentials; no secret values are printed."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID

ROOT = Path(__file__).resolve().parents[1] / '.runtime' / 'exchange'
ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
if (ROOT / 'ready').exists():
    print('Existing local gateway credentials retained.')
    raise SystemExit(0)

now = datetime.now(timezone.utc)
ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'FlyLeaf local demonstration CA')])
ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(ca_key.public_key())
    .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1))
    .not_valid_after(now+timedelta(days=365)).add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True)
    .add_extension(x509.KeyUsage(digital_signature=True,content_commitment=False,key_encipherment=False,data_encipherment=False,
        key_agreement=False,key_cert_sign=True,crl_sign=True,encipher_only=False,decipher_only=False),critical=True)
    .sign(ca_key,hashes.SHA256()))
(ROOT/'ca.crt').write_bytes(ca.public_bytes(serialization.Encoding.PEM))
for airport in ('dunarea','carpati'):
    key = rsa.generate_private_key(public_exponent=65537,key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,f'{airport}-gateway')])
    cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(ca.subject).public_key(key.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=90))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(f'{airport}-gateway')]),critical=False)
        .add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH,ExtendedKeyUsageOID.CLIENT_AUTH]),critical=False)
        .sign(ca_key,hashes.SHA256()))
    (ROOT/f'{airport}.crt').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    keyfile = ROOT/f'{airport}.key'
    keyfile.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    keyfile.chmod(0o600)
    tokenfile=ROOT/f'{airport}.token';tokenfile.write_text(secrets.token_hex(48));tokenfile.chmod(0o644)
# The CA key is deliberately not persisted or mounted into either gateway.
(ROOT/'ready').write_text('Local test credentials; regenerate after expiry by removing this directory.\n')
print('Created two mutually authenticated gateway certificates and independent local connector secrets.')
