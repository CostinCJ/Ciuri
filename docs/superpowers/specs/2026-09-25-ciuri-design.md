# Ciuri — Design (specificație)

Joc de cărți online, multiplayer, în echipe, cu pachet unguresc. Inspirat din tromf.ro și din regulile jocului „Cruce”.

- **Platformă:** site web, Next.js (App Router, TypeScript), hostat gratuit pe Vercel
- **Backend:** Supabase gratuit (Postgres, Realtime, Anonymous Auth)
- **Limbă interfață:** română

---

## 1. Regulile jocului

### 1.1 Pachetul

Pachet unguresc de 20 de cărți (fără 7, 8, 9). Culori: roșu, verde, ghindă, dubă.

| Carte | Nume | Valoare | Ordine (mic → mare) |
|---|---|---|---|
| Alsó | Doiul | 2 | 1 |
| Felső | Treiul („omul”) | 3 | 2 |
| Király | Patrul („calul”) | 4 | 3 |
| X | Zece | 10 | 4 |
| Ász | As | 11 | 5 |

Total puncte în pachet: 120.

### 1.2 Jucători și echipe

- Exact 4 jucători. Locurile 0 și 2 formează **echipa A**, locurile 1 și 3 **echipa B**, deci coechipierii stau față în față.
- Sensul jocului e sensul acelor de ceasornic (loc 0 → 1 → 2 → 3).
- Primul care împarte e ales aleatoriu. Apoi cel care împarte se mută cu un loc la fiecare rundă.
- „Primul jucător” e cel de după cel care împarte.

### 1.3 Desfășurarea unei runde

1. Se amestecă și se împart **3 cărți** fiecăruia.
2. **Licitația**, în două etape (§1.4): prima cu 3 cărți, a doua cu 5 cărți.
3. În funcție de rezultat, se joacă contractul (§1.6–1.10) sau jocul normal (§1.11).

### 1.4 Licitația

Licitația are **două etape**.

**Etapa 1 (cu primele 3 cărți)**

- Fiecare jucător vorbește **o singură dată**, în ordine, începând cu primul jucător.
- Ce poate zice:

| Contract | Cine îl poate zice | Valoare |
|---|---|---|
| Ciuri | oricine are Treiul + Patrul de aceeași culoare în primele 3 cărți | 12 |
| Adunare | oricine | 12 |
| Pas (Nimic) | oricine | — |

- Licitația **se termină imediat la primul Ciuri sau la prima Adunare**: cel care l-a zis câștigă licitația, iar ceilalți nu mai vorbesc. Ciuri se joacă cu 3 cărți (§1.7), iar Adunarea se calculează pe loc (§1.8).

**Între etape**

- Dacă toți 4 zic Pas (Nimic), se împart încă **2 cărți** fiecăruia, deci câte 5.
- Cartea de tromf este a 5-a carte a celui care împarte. Se arată tuturor și rămâne în mâna lui.

**Etapa 2 (cu 5 cărți)**

- Vorbește **doar primul jucător**, după ce și-a văzut toate cele 5 cărți. Ceilalți nu mai vorbesc.
- Ce poate zice:

| Contract | Valoare |
|---|---|
| Tromful tău (cu alegerea culorii) | 6 |
| Mare | 6 |
| Mica | 4 |
| Pas (Nimic) | — |

- Dacă zice Pas (Nimic), urmează jocul normal (§1.11), cu tromful dat de cartea arătată. Înainte de joc se verifică dacă trebuie să se împartă din nou (§1.11).

**Pentru orice contract**

- **Coechipierul celui care l-a licitat nu joacă**, iar cărțile lui se pun deoparte (3 cărți la Ciuri și Adunare, 5 cărți la Tromful tău, Mare și Mica). Contractul se joacă de cel care l-a licitat contra celor 2 adversari.
- La Ciuri, Tromful tău, Mare și Mica, cel care a licitat contractul deschide prima mână.

### 1.5 Regulile de pus cărțile (jocul cu tromf)

Se aplică în jocul normal, la Ciuri și la Tromful tău.

1. Ești obligat să răspunzi la culoarea cerută.
2. Ești obligat să iei mâna dacă poți, adică să pui o carte care bate cea mai mare carte de pe masă. Dacă mâna e deja tăiată cu tromf și ai doar culoarea cerută, pui orice carte din culoarea cerută.
3. Dacă nu ai culoarea cerută, ești obligat să tai cu tromf. Dacă pe masă e deja tromf, ești obligat să-l bați dacă poți.
4. Dacă nu ai nici culoarea cerută, nici tromf, pui orice carte.
5. Mâna o ia cel mai mare tromf. Dacă nu s-a pus tromf, o ia cea mai mare carte din culoarea cerută.
6. Cine ia mâna deschide următoarea.

### 1.6 Strigarea

- Treiul + Patrul de aceeași culoare în mână formează o **strigare**.
- Se strigă doar când **deschizi** o mână: pui Treiul **sau** Patrul, oricare vrei, și ai și perechea lui în mână.
- Primești punctele imediat, în contul echipei tale: **20** pentru o culoare obișnuită, **40** dacă e culoarea tromfului.
- Din mână iese doar cartea pusă, perechea rămâne.
- O pereche se poate striga o singură dată.
- Strigarea e opțională: poți pune Treiul sau Patrul fără să strigi. Excepție: la Ciuri strigarea e automată (§1.7).
- Strigările nu există la Mare, Mica și Adunare.

### 1.7 Ciuri (12 puncte)

- Se poate licita doar dacă ai Treiul + Patrul de aceeași culoare în primele 3 cărți.
- **Tromful e culoarea strigării.** Nu se mai împart cărți.
- Se joacă **cu câte 3 cărți**: cel care a licitat contra celor 2 adversari, adică 3 mâini.
- **Prima carte a celui care a licitat:**
  - Dacă a treia carte e de culoarea tromfului, poate deschide cu oricare dintre cele 3 cărți.
  - Dacă a treia carte e de altă culoare, e obligat să deschidă cu Treiul sau cu Patrul.
- Strigarea de **40** se primește când se pune pe masă primul dintre Treiul și Patrul (ca deschidere, conform §1.6).
- **Succes:** cel care a licitat ajunge la cel puțin 66 de puncte (≥ 66) (40 + punctele din mâinile luate) → echipa lui primește 12 puncte.
- **Eșec:** echipa adversă primește 12 puncte.
- Se joacă toate cele 3 mâini până la capăt, iar rezultatul se calculează la final.

### 1.8 Adunare (12 puncte)

- **Nu se joacă nicio mână.** Cel care a licitat și cei 2 adversari își arată cele 3 cărți. Coechipierul nu le arată.
- Se adună valorile celor 9 cărți. Nu există tromf și nu există strigări.
- **Sumă de 66 sau mai mult** (≥ 66) → echipa celui care a licitat primește 12 puncte. Altfel (≤ 65), echipa adversă primește 12 puncte.
- Cărțile arătate și calculul sunt afișate tuturor la finalul rundei.

### 1.9 Mare (6 puncte) și Mica (4 puncte)

- Doar primul jucător le poate licita, în etapa a 2-a (§1.4), după ce și-a văzut cele 5 cărți.
- Se joacă **cu câte 5 cărți**, **fără tromf**, cel care a licitat contra celor 2 adversari. Cartea de tromf arătată nu mai contează.
- Cel care a licitat deschide **fiecare** mână.
- Adversarii sunt obligați să răspundă la culoare, dar **nu** sunt obligați să ia mâna. Dacă nu au culoarea, pun orice carte.
- **Mare:** dacă un adversar pune o carte **mai mare** din culoarea cerută → eșec.
- **Mica:** dacă un adversar pune o carte **mai mică** din culoarea cerută → eșec.
- **Succes:** după 5 mâini fără eșec, echipa celui care a licitat primește 6 puncte la Mare, 4 puncte la Mica.
- **Eșec:** runda se oprește imediat, iar echipa adversă primește 6 puncte la Mare, 4 puncte la Mica.

### 1.10 Tromful tău (6 puncte)

- Doar primul jucător îl poate licita, în etapa a 2-a (§1.4). Își **alege culoarea tromfului** după ce și-a văzut toate cele 5 cărți. Cartea de tromf arătată nu mai contează.
- Se joacă **cu câte 5 cărți**, cel care a licitat contra celor 2 adversari. Coechipierul nu joacă, iar cele 5 cărți ale lui se pun deoparte.
- Se joacă după §1.5, cu strigări (§1.6). Deschide cel care a licitat.
- **Succes:** cel puțin 66 de puncte (≥ 66) (mâini luate + strigări) → echipa lui primește 6 puncte. Altfel, echipa adversă primește 6 puncte.
- Se joacă toate mâinile până la capăt, iar rezultatul se calculează la final.

### 1.11 Jocul normal (nu a licitat nimeni)

- Toți jucătorii au deja câte 5 cărți (§1.4).
- **Tromful e ultima carte împărțită**, adică a 5-a carte a celui care împarte. Cartea se arată tuturor și rămâne în mâna lui.
- **Se împarte din nou** dacă niciunul dintre cei doi adversari ai celui care împarte (primul jucător și jucătorul dinaintea celui care împarte) nu are nicio carte din culoarea tromfului. Cărțile se amestecă și se împart din nou, împarte același jucător, iar licitația reîncepe cu etapa 1. Scorul și numărul rundei nu se schimbă. Împărțirea din nou apare în jurnal.
- Se joacă echipă contra echipă, după §1.5, cu strigări (§1.6). Deschide primul jucător.
- **Echipa care ia ultima mână câștigă runda.** Punctajul depinde de ce au strâns adversarii ei (mâini luate + strigări):

| Situația adversarilor | Puncte pentru echipa câștigătoare |
|---|---|
| n-au luat nicio mână | 3 |
| au luat cel puțin o mână, dar au mai puțin de 33 de puncte | 2 |
| au 33 de puncte sau mai mult | 1 |

- **Stop:**
  - Stop se poate zice **oricând, de oricine**: orice jucător, în orice moment al jocului normal, chiar dacă nu e rândul lui și chiar înainte să se termine prima mână.
  - Dacă echipa lui are cel puțin 66 de puncte (≥ 66) (mâini luate + strigări) → primește 3 puncte. Altfel, echipa adversă primește 3 puncte.
  - Runda se termină imediat.
  - La contracte (Ciuri, Adunare, Tromful tău, Mare, Mica) nu există Stop.

### 1.12 Meciul

- Se joacă până la **21 de puncte**. Prima echipă care ajunge la 21 sau mai mult câștigă.
- După meci, butonul „Încă un meci” pornește un meci nou cu aceleași locuri, dacă sunt toți 4 prezenți.

---

## 2. Experiența de joc

### 2.1 Pagina de start (`/`)

- Câmp pentru nume (2–20 caractere, păstrat în browser).
- **Creează cameră** generează un cod de 4 caractere, fără caractere ușor de confundat (de exemplu `K7XQ`), și duce la `/room/K7XQ`.
- **Intră în cameră** acceptă un cod. Merge și cu link direct.

### 2.2 Camera de așteptare

- 4 locuri, cu echipele marcate vizual. Click pe un loc liber pentru a te așeza. Poți schimba locul cât timp jocul nu a început.
- Când sunt ocupate toate cele 4 locuri, pornește o **numărătoare de 3 secunde** și jocul începe automat. Dacă cineva se ridică între timp, numărătoarea se anulează.
- Într-o cameră plină sau cu jocul pornit pot intra doar jucătorii care au deja loc acolo, cum e cazul la reconectare. Ceilalți văd mesajul „Camera e plină”.

### 2.3 Masa de joc

- Mâna ta e jos, coechipierul sus, adversarii în stânga și în dreapta. Cărțile celorlalți apar cu fața în jos.
- **La centru:** mâna curentă, cartea de tromf sau culoarea tromfului, contractul activ.
- **Sus:** scorul meciului (A – B, până la 21) și punctele din runda curentă.
- **Licitație:** un panou cu butoanele permise doar pentru tine. La Tromful tău alegi culoarea.
- **Cărțile nepermise sunt dezactivate.** Dacă poți striga, la click pe un Trei sau un Patru te întreabă „Strigi?”. Butonul **Stop** apare când e permis.
- **Cronometru** vizibil pentru jucătorul la rând.
- **Jurnal** de evenimente, de exemplu „Ana a strigat 40”, „Echipa B ia mâna”, „Ion a zis Adunare”.
- **Rezumatul rundei**, timp de 5 secunde: cine a câștigat, calculul punctelor, cărțile arătate la Adunare.
- **Indicator** pentru jucătorii deconectați.
- Interfața se adaptează și pe telefon ținut orizontal.

### 2.4 Chat

- Panou de chat în cameră, vizibil tot timpul, cu istoricul mesajelor din cameră.
- Mesaje de maximum 300 de caractere. Limită de 1 mesaj pe secundă de jucător, verificată pe server.

### 2.5 Timp limită

| Situație | Timp | Când expiră |
|---|---|---|
| Licitație (ambele etape) | 20 s | se consideră „Pas (Nimic)” |
| Pusul unei cărți | 30 s | se pune automat cea mai mică carte permisă (la valoare egală, prima culoare în ordinea roșu, verde, ghindă, dubă); fără strigare și fără Stop |

La Ciuri, cartea pusă automat respectă și regula primei cărți.

La Mare și Mica, pentru un adversar al licitatorului, cartea pusă automat e cea mai mică dintre cărțile permise care nu strică jocul (o carte de altă culoare, ori una din culoarea cerută mai mică decât cea a licitatorului la Mare sau mai mare la Mica). Numai dacă toate cărțile permise ar strica jocul se pune cea mai mică dintre ele; astfel, un adversar nu câștigă nimic lăsând timpul să expire.

### 2.6 Deconectare

- Identitatea e o sesiune anonimă Supabase, păstrată în browser. La refresh sau la revenire jucătorul intră automat pe locul lui.
- Jocul nu se oprește: timpul limită mută automat pentru cel deconectat.

### 2.7 Cărțile

Cărțile sunt **desenate de noi în SVG**, fără imagini externe, deci nu există probleme de drepturi de autor. Nu s-a găsit un set complet de cărți unguresti cu licență liberă: Wikimedia are doar fotografii, iar seturile de pe GitHub nu au licență.

- **Fond și colț:** fond crem, cu valoarea în colț (2, 3, 4, 10, A) și simbolul culorii.
- **Simboluri:** roșu (inimă), verde (frunză), ghindă, dubă (clopoțel).
- **Centru:** simbolul culorii, mare, plus numele cărții (Doi, Trei, Patru, Zece, As).
- **Spatele cărții:** un model simplu cu dungi.

Nu se folosesc imagini de pe tromf.ro. Dacă apare mai târziu un set cu licență liberă, se poate înlocui doar componenta de carte.

---

## 3. Arhitectura tehnică

### 3.1 Componente

```
Browser (Next.js/React) ──POST──► Rute API Next.js (Vercel, Node) ──► Supabase Postgres
        ▲                                 │ lib/game (reguli)                 │
        └──── Supabase Realtime (modificări în DB + presence) ◄───────────────┘
```

| Unitate | Rol | Depinde de |
|---|---|---|
| `lib/game/` | Motorul jocului, cod pur: tipuri, pachet, reguli, licitație, punctaj, `applyAction(state, action) → state`, `legalMoves`, `redactFor(seat)` | nimic |
| `lib/server/` | Încarcă/salvează starea, rulează motorul, scrie vederile publice și private; client Supabase cu cheia de service | `lib/game`, Supabase |
| `app/api/*` | Rute HTTP: `rooms` (creare), `rooms/[code]/join`, `seat`, `game/action`, `game/timeout`, `chat` | `lib/server` |
| `app/` (UI) | Paginile start, cameră și masă; se abonează la Realtime | Supabase client (anon) |

### 3.2 Tabele Supabase (RLS activat pe toate)

| Tabel | Conținut | Citire | Scriere |
|---|---|---|---|
| `rooms` | `code`, `status` (`lobby`/`playing`/`finished`), `score_a`, `score_b`, `created_at` | membrii camerei | doar serverul |
| `room_players` | `room_id`, `user_id`, `seat` (0–3 sau null), `name` | membrii camerei | doar serverul |
| `game_public` | `room_id`, `version`, `state` (jsonb, vedere publică), `deadline` | membrii camerei | doar serverul |
| `game_hands` | `room_id`, `user_id`, `cards` (jsonb) | **doar proprietarul** (`auth.uid() = user_id`) | doar serverul |
| `game_secret` | `room_id`, `version`, `state` (jsonb complet, inclusiv pachetul) | nimeni (doar cheia de service) | doar serverul |
| `messages` | `room_id`, `user_id`, `name`, `text`, `created_at` | membrii camerei | doar serverul |

Clientul **nu scrie niciodată direct** în baza de date. Toate modificările trec prin rutele API, care verifică token-ul Supabase al jucătorului.

### 3.3 Cum decurge o acțiune

1. Clientul trimite `POST /api/game/action { code, action, expectedVersion }` cu token-ul lui.
2. Serverul face următoarele, **într-o singură tranzacție** (funcție Postgres RPC):
   - încarcă `game_secret`;
   - verifică locul jucătorului și rândul;
   - aplică `applyAction`, iar acțiunile nepermise primesc 400;
   - scrie noua stare cu `version + 1`, doar dacă versiunea nu s-a schimbat între timp; altfel răspunde 409 și clientul reîncarcă starea;
   - actualizează `game_public`, `game_hands` și `rooms`.
3. Supabase Realtime trimite modificările fiecărui client, cu RLS aplicat, deci fiecare își vede doar cărțile lui.

### 3.4 Timp limită

- Fiecare stare care așteaptă o mutare conține `deadline`.
- Când ora limită trece, fiecare client conectat apelează `POST /api/game/timeout { code, version }`.
- Serverul verifică `now() > deadline` și versiunea, apoi aplică mutarea automată (§2.5). Dacă apelurile vin de la mai mulți clienți, doar primul reușește.
- După o mutare automată, serverul setează `deadline` pentru următoarea mutare.

Tot acest mecanism face și tranzițiile automate: pornirea după numărătoarea de 3 secunde și trecerea la runda următoare după afișarea rezumatului.

### 3.5 Prezență

Supabase Realtime Presence pe canalul `room:{code}` arată cine e conectat. Prezența e doar informativă și nu afectează regulile.

### 3.6 Configurare

- Variabile de mediu: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Migrările SQL (tabele, RLS, RPC) stau în `supabase/migrations/`.
- Stilizare cu Tailwind CSS.

---

## 4. Tratarea erorilor

- **Acțiune nepermisă:** 400 cu un mesaj în română. Motorul e sursa de adevăr, deci UI-ul poate greși doar vizual.
- **Conflict de versiune (409):** clientul reîncarcă starea și nu repetă automat acțiunea.
- **Pierderea conexiunii Realtime:** la reconectare, clientul reîncarcă `game_public` și mâna lui.
- **Cameră inexistentă sau plină:** mesaj clar pe pagina camerei.

---

## 5. Testare

- **Vitest, `lib/game`:** câte un test pentru fiecare regulă din §1, printre care:
  - obligațiile de răspuns, luare și tăiere;
  - cine ia mâna;
  - strigarea de 20 și de 40, din care iese o singură carte;
  - Ciuri cu prima carte obligatorie, la succes și la eșec;
  - Adunare, Ciuri, Tromful tău și Stop la limita 65 și 66;
  - Mare și Mica, cu eșec la prima mână și succes;
  - Tromful tău;
  - jocul normal cu punctajele 3/2/1 și limita de 33;
  - Stop corect și greșit;
  - prioritatea din licitație;
  - rotația celui care împarte și finalul la 21;
  - mutarea automată la expirarea timpului;
  - `redactFor` nu scapă cărțile altor jucători.
- **Teste pentru rutele API:** cu motorul real și un strat de stocare în memorie.
- **Playwright:** 4 contexte de browser creează sau intră în cameră, pornesc automat, licitează, joacă o rundă întreagă și verifică scorul și chat-ul.

---

## 6. În afara primei versiuni

- conturi și clasament;
- jucători controlați de calculator;
- spectatori;
- timp limită configurabil;
- ștergerea automată a camerelor vechi.
