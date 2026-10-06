# Architecture Decision Records — CameleON

Decyzje architektoniczne warstwy AI-to-UI (`src/features/aiui/`). Każdy spike i każda zmiana
zależności w v1.3+ jest oceniana względem tych dokumentów.

| ADR | Tytuł | Status |
|-----|-------|--------|
| [0001](0001-kernel-invariants.md) | Inwarianty kernela CameleON (I1–I10) | Zaakceptowany (v1.3) |
| [0002](0002-protocol-compatibility-axes.md) | Trzy osie zgodności protokołu | Zaakceptowany; polityka wersji koperty otwarta |
| [0003](0003-local-vs-semantic-actions.md) | Akcje lokalne vs semantyczne | Zaakceptowany (v1.3) |
| [0004](0004-library-adapter-rules.md) | Reguły adapterów bibliotek | Zaakceptowany (v1.3) |
| [0005](0005-observed-behaviors.md) | Zachowania ujawnione przez korpus fixture'ów (OBS-1 do OBS-6) | Zaakceptowany; decyzje 2026-10-05 |
| [0006](0006-browser-harness-findings.md) | Ustalenia harnessu przeglądarkowego (E2E-1, E2E-2, FLAKE-1/2, A11Y-1..3) | Zaakceptowany; E2E-1, E2E-2, A11Y-1..3 zrealizowane; FLAKE-1 OPEN |
| [0007](0007-item-state-taxonomy.md) | Taksonomia stanów elementu (P0.4; ST-1..ST-4) | Zaakceptowany; ST-1 zrealizowane (b); ST-2, ST-3 zostają; ST-4 do decyzji |

## Zasady

- Stan opisany na kodzie z `6e96223` (kernel bez zmian od tego commita).
- Każde twierdzenie wskazuje plik i symbol oraz test, który go pilnuje. Brak testu jest zapisany jawnie.
- Zmiana inwariantu wymaga nowego ADR (status „zastępuje 000N”) i decyzji właściciela. Zielone testy nie wystarczą.
- Źródło decyzji: `PLAN_v1.3_proposal.md` (v1.3.2 FINAL, poza repo), review Astry (`Astra1.md`).
