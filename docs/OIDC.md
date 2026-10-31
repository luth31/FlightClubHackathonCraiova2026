# Identitatea aeroportului prin Keycloak

FlyLeaf oferă două moduri explicite: `demo` pentru autentificarea locală de dezvoltare și `oidc` pentru autentificarea reală printr-un realm Keycloak al aeroportului. În modul OIDC, ruta de autentificare prin parolă locală este dezactivată, iar sesiunile create anterior în modul demo nu sunt acceptate. Documentele și conturile de demonstrație rămân fictive, indiferent de modul autentificării.

Pentru acces din tailnet, folosește [configurația Tailscale](TAILSCALE.md). Doar deployment-ul separat pentru prezentare folosește aceeași origine HTTPS pentru website, API și autentificare. Configurația locală implicită își păstrează porturile și fluxul de autentificare.

## Configurare

Exemplu Craiova pentru demonstrația locală Docker:

```dotenv
FLYLEAF_AUTH_MODE=oidc
FLYLEAF_OIDC_ISSUER=http://127.0.0.1:8180/realms/craiova
FLYLEAF_OIDC_INTERNAL_ISSUER=http://craiova-identity:8080/realms/craiova
FLYLEAF_OIDC_CLIENT_ID=flyleaf-web
FLYLEAF_OIDC_REDIRECT_URI=http://127.0.0.1:8080/api/auth/oidc/callback
FLYLEAF_OIDC_FRONTEND_URL=http://127.0.0.1:8080/
FLYLEAF_OIDC_SESSION_MINUTES=60
FLYLEAF_COOKIE_SECURE=false
```

Pentru Sibiu se folosesc realm-ul `sibiu`, porturile publice 8181/8081 și transportul intern `sibiu-identity:8080`. Numele diferite de realm evită suprapunerea cookie-urilor Keycloak când două servicii locale folosesc același host pe porturi diferite. Issuer-ul public este identitatea verificată în token; adresa internă este exclusiv transportul backendului. Nu se acceptă un issuer diferit din discovery sau din token.

Clientul Keycloak trebuie să fie **public**, cu Standard Flow activ, Implicit Flow și Direct Access Grants dezactivate, PKCE S256 obligatoriu și redirect URI exact. Nu se configurează wildcard-uri de redirect. Configurația curentă acceptă tokenuri ID semnate RS256, algoritmul implicit al realm-ului demonstrativ. În afara loopback-ului, URL-urile publice necesită HTTPS; pentru HTTPS se cere `FLYLEAF_COOKIE_SECURE=true`. Traficul HTTP intern este adecvat doar rețelei de demonstrație controlate.

Lista explicită `defaultClientScopes` trebuie să includă **`basic`**. Din Keycloak 25, acest scope furnizează mapper-ele pentru `sub` și `auth_time`; omiterea sa poate elimina câmpurile obligatorii pentru validarea identității și autentificării recente. Validatorul aplicației păstrează aceste cerințe. [Ghidul de upgrade Keycloak](https://www.keycloak.org/docs/26.8.1/upgrading/)

## Asocierea identității cu permisiunile

Implicit, numai cele șase conturi locale fictive sunt asociate prin harta explicită `DEMO_SUBJECTS` din `backend/app/identity/service.py`. UUID-urile rămân stabile la schimbarea numelui produsului și coincid cu ID-urile din importurile realm-urilor `craiova` și `sibiu`. Un aeroport necunoscut nu primește automat asocieri demonstrative.

Pentru o instalare reală se configurează explicit `FLYLEAF_OIDC_SUBJECT_MAP` ca obiect JSON `{"provider-subject":"local-user-id"}`. O hartă goală nu permite niciun cont. Angajații provisionați folosesc asocierile persistente `(identity_issuer, identity_subject)` din baza de date.

Asocierea folosește numai subiectul stabil al issuer-ului fixat. Numele, emailul, `preferred_username` și rolurile primite din token nu creează conturi și nu acordă roluri. FlyLeaf verifică existența, aeroportul și starea activă a contului local; rolurile și starea locală sunt verificate în continuare la accesarea aplicației.

## Fluxul implementat

1. `GET /api/auth/oidc/login` citește discovery de la transportul configurat și verifică issuer-ul și toate endpointurile în același realm. Redirectul către Keycloak include `response_type=code`, `scope=openid profile`, PKCE S256, state, nonce, `prompt=login`, `max_age=0` și `ui_locales=ro`.
2. O tranzacție de cinci minute păstrează pe server verificatorul PKCE, nonce și configurația exactă a cererii. State și cookie-ul de corelare sunt comparate prin hash-uri; cookie-ul este HttpOnly, SameSite=Lax și separat per aeroport.
3. Callback-ul consumă tranzacția printr-o ștergere atomică înaintea schimbului de cod. Astfel, două callback-uri simultane sau o reluare după un token invalid nu pot refolosi tranzacția. Codul este schimbat pe server cu verificatorul PKCE și redirect URI original.
4. Cheia este obținută numai de la JWKS-ul realm-ului configurat. Sunt verificate semnătura RS256, issuer-ul, audience, authorized party, expirarea, data emiterii, nonce și autentificarea recentă. `iss` din răspunsul de autorizare este verificat când providerul îl furnizează.
5. După asocierea subiectului, aplicația rotește sesiunea proprie, înregistrează conectarea și face redirect la adresa frontend configurată. Niciun token Keycloak nu este transmis interfeței sau păstrat în localStorage. Tokenurile providerului nu sunt persistate.

`GET /api/session` oferă `auth: {mode, login_url, logout_url}`. În modul OIDC, utilizatorul neautentificat nu primește directorul de conturi. Erorile callback-ului sunt coduri stabile în `?auth_error=...`, fără tokenuri sau detalii sensibile. Adresa de întoarcere nu poate fi aleasă prin parametrii cererii.

`POST /api/auth/logout` șterge mai întâi sesiunea FlyLeaf și cookie-urile aplicației, apoi întoarce `redirect_url` către logout-ul Keycloak. Interfața navighează la acea adresă; providerul poate cere confirmare deoarece aplicația nu păstrează și nu trimite un `id_token_hint`. Clientul Keycloak înregistrează exact `FLYLEAF_OIDC_FRONTEND_URL` în `post.logout.redirect.uris`. Destinația nu poate fi schimbată prin parametrii cererii. Următoarea conectare cere autentificare nouă. Back-channel logout și sincronizarea automată a dezactivării din provider nu sunt implementate. Sesiunea locală are implicit 60 de minute; dezactivarea locală blochează imediat accesul. O dezactivare efectuată numai în Keycloak afectează autentificările viitoare, nu anulează automat o sesiune FlyLeaf deja emisă.

## Verificări

`backend/tests/test_oidc.py` folosește tokenuri RSA semnate real și un transport provider controlat. Acoperă autentificarea completă, transmiterea verificatorului PKCE, rolurile exclusiv locale, subiecte necunoscute, conturi inactive, issuer/audience/nonce/semnătură/date incorecte, endpointuri străine, state expirat sau legat de alt browser și callback-uri concurente. Acest test nu înlocuiește verificarea finală în browser cu cele două servicii Keycloak.

Surse tehnice: [endpointurile și fluxurile OIDC Keycloak](https://www.keycloak.org/securing-apps/oidc-layers), [validarea ID Token în OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation), [PKCE — RFC 7636](https://www.rfc-editor.org/rfc/rfc7636), [validarea JWT cu PyJWT](https://pyjwt.readthedocs.io/en/stable/usage.html). Documentația este inspirație tehnică pentru implementare, nu o certificare a aplicației.


## Provisionarea angajaților

Administrarea conturilor prin HR este descrisă în [USER_MANAGEMENT.md](USER_MANAGEMENT.md). Conturile noi folosesc asocieri persistente `(identity_issuer, identity_subject)` în baza FlyLeaf; callback-ul verifică aceste asocieri înaintea hărții explicite pentru conturile existente. Nu se creează conturi și nu se acordă permisiuni din numele, emailul sau rolurile tokenului.

Clientul confidențial `flyleaf-provisioner` este folosit numai de backend, cu service-account și `realm-management/manage-users`. Configurația sa este separată de clientul public `flyleaf-web`. Importul la pornire nu actualizează realm-uri existente; consultați pașii din ghid fără a șterge volumele.
