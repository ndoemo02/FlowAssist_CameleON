# Weryfikacja Astry po poprawkach A1–A4 (P1.7b)

> 2026-10-07, task `2jtd09qhg68zqq5wxae8j2pyzw`, koszt $0.6243. Wejście: jej review NO-GO, decyzje A1–A4, diff 8ff3762..3483f94, zmienione sekcje profilu (HEAD 3483f94). Tokeny: 29983 wejście / 6489 wyjście, finish_reason: stop.

## Weryfikacja czterech uwag

### 1. A1 — **nieusunięta**
Porcjowanie naprawia przykład 2 × 150 KiB: **§7.5, l. 245–246** dopuszcza podstawę i uzupełnienia, nakazując: „Duży stan **dzieli się na części**”. Nie zapewnia jednak odtwarzalności każdego legalnego stanu.

**Kontrprzykład:** tablica długości 1025, następnie 1025 legalnych usunięć elementów według §10.7. Stan zawiera 1025 pustych miejsc.

- **§7.5, l. 247:** agent „MUSI odtworzyć każde z nich osobnym `updateDataModel`”.
- Potrzeba więc co najmniej **1026 części**: podstawa i 1025 korekt, jeszcze bez komponentów, `stage` i `narration`.
- **§7.7, l. 280:** „najwyżej **1024 części**”.

Nadal istnieje legalny stan, którego nie można odtworzyć zgodnie z kontraktem. `RESYNC_LIMIT` określa reakcję klienta na przekroczenie, ale nie usuwa konfliktu z obowiązkiem odtworzenia „pełnego bieżącego stanu” (§7.5, l. 242).

**Potrzebne rozstrzygnięcie:** invariant odtwarzalności stanu w budżecie, uwzględniający korekty pustych miejsc, albo jawny wyjątek dopuszczający terminalne nieodtworzenie legalnego stanu poza budżetem.

### 2. A2 — **usunięta**
Usunięto lukę reprezentacji pustego miejsca w JSON:

- **§7.5, l. 247:** „podstawa i części materializują je jako `null`”, następnie osobne `updateDataModel` z `path`, „bez `value`”.
- **§7.7, l. 285–286:** „Aktywny stan i renderer nie widzą niczego przed `complete`”; publikacja następuje „jednym krokiem koordynatora”.

Pozostawienie `null` po odrzuconej korekcie jest jawnie określone w §7.7, l. 293, a nie pozostawione adapterowi. Problem liczby korekt wskazałam pod A1.

### 3. A3 — **usunięta**
- **§7.6, l. 261–262:** zakaz usuwania i ponownego tworzenia dotyczy „**tylko** surface’ów istniejących po obu stronach”.
- **§7.6, l. 263:** surface istniejący tylko u klienta „jest w trakcie uzgadniania **usuwany**”.

Nie ma już sprzeczności z nakazem `deleteSurface` w §7.5.

### 4. A4 — **usunięta**
- **§4.5, l. 118:** fatalna walidacja wymaga „**obecności** `message` (dowolna wartość JSON, także `null`)”.
- **§4.5, l. 120:** wada wiadomości profilu „odrzuca **tylko tę wiadomość**”; `seq` liczy się dalej.
- **§4.5, l. 122:** „Pełnego schematu wiadomości NIE WOLNO używać jako fatalnej bramki ramki”.

`frame.schema.json` odpowiada tej granicy: `message` jest wymagane, ale ma schemat `{}`. Osobna fatalna walidacja sterowania i routing każdego obiektu z własnym kluczem `resync` są jawne (§4.5, l. 119).

## Nowa sprzeczność — MEDIUM: przekroczenie 256 KiB podczas resync

**§7.7, l. 279–284** wymienia wśród limitów „każda część ≤ 256 KiB”, po czym stanowi:

> „Przekroczenie jest fatalne: `profile:RESYNC_LIMIT`”.

Tymczasem **§7.7, l. 291** mówi:

> „Niefatalne odrzucenie części (§11, także `MESSAGE_TOO_LARGE`) nie przerywa transakcji”.

Drugą reakcję potwierdzają §10.8, l. 392 i §14, l. 510.

**Scenariusz:** część ma 300 KiB, lecz zdarzenie mieści się w 1 MiB, a transakcja w 1024 częściach i 16 MiB. Adapter musi wybrać: przerwać i odrzucić transakcję czy pominąć część i kontynuować do publikacji.

**Minimalna poprawka:** ograniczyć fatalne `RESYNC_LIMIT` do przekroczenia `maxParts` lub `maxBytes`; przekroczenie 256 KiB pozostawić niefatalnym `MESSAGE_TOO_LARGE`, liczonym do obu budżetów.

## Potrzebne

Do dalszej kontroli, poza powyższymi ustaleniami:
- pełne §6, §7.1–7.3, §9, §11.1 i §11.3–11.5 oraz definicje P3 i P6–P9;
- nadal niedostarczone schematy, pliki kernela i transportu, ADR 0002 oraz przypięte źródła AG-UI/A2UI wskazane w poprzednim review.

Ocena statyczna; wyników testów autora nie weryfikowałam.

## Werdykt: **NO-GO**

Dla deklaracji „P1.7b zamknięte, P1.6 może startować bez nowych reguł transportowych”: pozostaje A1 oraz sprzeczna reakcja na nadmiarową część. Brak implementacji reguł `[P1.6]` nie jest podstawą tego werdyktu.