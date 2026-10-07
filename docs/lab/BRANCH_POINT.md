# Punkt rozgałęzienia: linia badawcza `lab/kwanteleon-p1.7b`

> Dokument punktu rozgałęzienia. Dodany 2026-10-07 za zgodą właściciela.
>
> Decyzje właściciela, które wyznaczają ten punkt:
> - linia P1.7b jest zachowana tutaj bez resetu, cherry-picków ani upraszczania;
> - rozwój runtime przenosi się do nowego, prywatnego repo `ndoemo02/cameleon-presentation-runtime`. Ma ono świeżą historię, a jego bazą jest `fdc79b6` (P1.7a);
> - D7 przechodzi tam jako ADAPT, bez cherry-picka;
> - nośnik R-1 to natywny kontrakt `cameleon.presentation/1`. Ewentualne tłumaczenie A2UI/AG-UI robi przyszły gateway.

## Co to jest

Gałąź zachowuje **eksperymentalny stan P1.7b**, czyli normatywny profil transportu `flowassist-transport/1`. Kontekst:
- profil powstał przy założeniu, że CameleON **odbudowuje** dowolnie duży, przyrostowo budowany stan producenta po zerwaniu połączenia;
- 2026-10-07 właściciel ustalił granicę systemu inaczej. CameleON jest **konsumentem i rendererem prezentacji**, w metaforze właściciela manekinem, który dostaje gotowe ubrania;
- research, agregację, paginację i przygotowanie ograniczonych artefaktów robi warstwa inference/gateway.

Linia nie jest kontynuowana w tym repo. Rozwój runtime przenosi się do nowego repozytorium Presentation Runtime (`docs/lab/` → odnośniki).

## Stan zamrożony

| Co | Wartość |
|---|---|
| Tag migawki | `lab/kwanteleon-p1.7b-snapshot-2026-10-07` → `57787e5` |
| Baza | `feat/aiui-prototype` @ `6cca2dc` na remote (P1.7a zamknięte: tag `p1.7a-closed` → `fdc79b6`) |
| Commity linii | 13: `3e7b69d..57787e5` (pakiet 1: profil, schematy, testy; pakiet 2: `PROFILE_RULES` + parytet, D7 `parseEventDiagnostic`; poprawki A1–A4, A1+/A5) |
| Testy | vitest 643/643; pełny tsc: 1 znany błąd (Lanyard); e2e 39/15/0 i `next build` PASS (na `84f22c6`) |
| Zachowanie runtime | bez zmian względem P1.7a: reguły [P1.6] nie są zaimplementowane; kod P1.7b jest neutralny (stałe, refaktor D7, wyrocznia `resyncPlan.ts`) |

## Stan review w chwili zamrożenia

- **Recenzent Claude:** pakiety 1 i 2 GO (po poprawkach).
- **Recenzent Claude, ostatnia runda (`57787e5`):** GO WITH FIXES. Otwarte decyzje:
  - M1b — sieroty komponentów;
  - M2 — tablice niepodzielne w kanonicznym planie;
  - L1b — powtarzane `MESSAGE_TOO_LARGE`.

  Po resecie granicy **wszystkie trzy tracą przedmiot**.
- **Astra:**
  - review P1.7b: NO-GO (4 uwagi, $1.2876);
  - weryfikacja: NO-GO (A1 nieusunięte, nowa sprzeczność 256 KiB, $0.6243);
  - A1+/A5 naniesione w `57787e5`, ale **nie zweryfikowane przez Astrę**.

## Co z tej linii jest wartościowe dalej

- **Do nowego runtime:**
  - D7 `parseEventDiagnostic` (zamknięte przyczyny, ścieżki, `surfaceId`);
  - guardy granicy: FU-3, FU-4;
  - warstwy walidacji (A4);
  - jedno miejsce na akcję i tożsamość interruptu (D12, M1, N1, N2);
  - klasyfikacja awarii (M2), limity czasu (H1), `seq` i deduplikacja (D6).
- **Do przyszłego profilu transportu i gatewaya:** wiązanie AG-UI 1.0, ramka `CUSTOM flowassist.frame`, lifecycle przez interrupt, reconnect i `offline` (D14).
- **Tylko jako materiał źródłowy, bez przenoszenia:**
  - transakcja resync z częściami (A1);
  - puste miejsca w tablicach (A2, D16/B4b);
  - niezmiennik odtwarzalności i kanoniczny plan (A1+);
  - A5.

## Dokumenty w `docs/lab/`

- `OWNER_DIRECTION_2026-10-07.md` — decyzja właściciela, wyzwalacz;
- `BOUNDARY_RESET_P1.7b.md` — macierz producent / gateway / klient, werdykty KEEP/MOVE/REMOVE/REWRITE, szkic kontraktu;
- `RESEARCH_BRIEF_Presentation_Contract_v1.md` — pytania Q1–Q10;
- `PLAN_P1.7b_profile.md`, `PLAN_P1.7_capabilities.md` — plany i historia decyzji;
- `reviews/` — review Astry i Claude dla P1.7.
