---
description: Łańcuch 5 agentów do budowy landing page FlowAssist - Intent Control Layer dla B2B lead generation
---

> **HISTORYCZNE** — dokument sprzed CameleONa (łańcuch agentów dla landing page B2B ze stycznia 2026). Nie opisuje aktualnej architektury.
> Aktualny stan projektu: [`AGENTS.md`](../../AGENTS.md).


# 🎯 Agent Chain: FlowAssist Landing Page

Landing page B2B dla deterministycznego NLU - lead generation, nie sprzedaż online.

---

## Cel i Scope

- **Cel**: Zebrać maile enterprise leadów
- **Demo**: Pokazać Intent Control Layer w akcji
- **Branża**: Logistyka / Fleet Management
- **Timeline**: MVP 3 dni

---

## Chain: 5 Agentów (Sequential)

```
CRO Architect → NLU Demo Architect → 3D/Web Dev → Analytics → QA/DevOps
```

---

## Agent 1: CRO Architect
**Skills**: `page-cro`, `copywriting`, `form-cro`

```markdown
Zadania:
1. Napisz H1/subheadline (3 warianty do A/B)
2. Zaprojektuj sekwencję sekcji (Hero → Horizontal Scroll → Demo → Obiekcje → Form)
3. Horizontal scroll: 6 paneli, benefit + proof + micro-CTA
4. Lead magnet: "Checklist audytowalności AI" - gated PDF
5. Obiekcje enterprise: Security, Compliance, Wdrożenie, "Czy zadziała u nas"
6. Copy dla CTA buttons
```

**Output**: `docs/cro-blueprint.md`, `copy/headlines.md`, `copy/objections.md`

---

## Agent 2: NLU Demo Architect
**Skills**: `ai-agents-architect`, `autonomous-agents`

```markdown
Zadania:
1. Zaprojektuj Intent Translator Debugger UI
   - Raw input → LLM proposal → Guard diff → Final intent
2. Zaprojektuj Deterministic Gate UI
   - Przykłady odmów: confidence, permissions, forbidden fields
3. Zaprojektuj Audit Trail UI
   - Log: timestamp, intent_id, state_before/after, rule_hit
4. Napisz 8 przykładowych komend dla logistyki
5. Przygotuj mock responses (JSON)
```

**Output**: `docs/demo-spec.md`, `data/commands.json`, `data/mock-responses.json`

---

## Agent 3: 3D/Web Developer
**Skills**: `3d-web-experience`, `frontend-design`, `scroll-experience`

```markdown
Zadania:
1. Setup Next.js + Tailwind + dark theme tokens
2. Hero section z mini 3D "control panel" (React Three Fiber)
3. Horizontal scroll (scroll-snap CSS, NO JS hijack)
4. Intent Translator Debugger component
5. Deterministic Gate component
6. Audit Trail component (tabela z efektem "typing")
7. Email form + success state
8. Mobile fallback dla 3D (static image)
9. Loading states (Suspense + skeleton)
```

**Output**: `frontend/src/components/`, `frontend/src/3d/`

---

## Agent 4: Analytics Engineer
**Skills**: `analytics-tracking`

```markdown
Zadania:
1. Setup Plausible lub Amplitude
2. Zaimplementuj eventy:
   - page_viewed, hero_cta_clicked
   - horizontal_scroll_start, panel_viewed (1-6), horizontal_scroll_complete
   - demo_opened, demo_command_entered, demo_module_switched
   - form_started, form_submitted
   - accordion_opened
3. Skonfiguruj funnel: page → demo → form
4. Dashboard z primary metric: form_submitted / page_viewed
```

**Output**: `lib/analytics.ts`, `docs/tracking-plan.md`

---

## Agent 5: QA/DevOps
**Skills**: `vercel-deployment`, `testing-patterns`

```markdown
Zadania:
1. Vercel project setup
2. Environment variables (RESEND_API_KEY, ANALYTICS_KEY)
3. Performance audit (Lighthouse > 90)
4. Mobile test (iOS Safari, Android Chrome)
5. Smoke test: form submission, demo interaction
6. A/B test setup (H1 warianty) - Vercel Edge Config / Optimizely
```

**Output**: `vercel.json`, `.github/workflows/deploy.yml`, `docs/qa-checklist.md`

---

## Timeline MVP

```
Dzień 1: Agent 1 + Agent 2 (dokumentacja + design)
Dzień 2: Agent 3 (implementacja)
Dzień 3: Agent 4 + Agent 5 (tracking + deploy)
```

---

## Struktura Projektu

```
FlowAssistant/
├── app/
│   ├── (landing)/
│   │   └── page.tsx          # Main landing
│   └── api/
│       └── lead/route.ts     # Email capture
├── components/
│   ├── Hero.tsx
│   ├── HorizontalScroll.tsx
│   ├── IntentTranslator.tsx
│   ├── DeterministicGate.tsx
│   ├── AuditTrail.tsx
│   ├── Objections.tsx
│   └── LeadForm.tsx
├── 3d/
│   └── ControlPanel.tsx      # R3F mini 3D
├── lib/
│   ├── analytics.ts
│   └── resend.ts
├── data/
│   ├── commands.json
│   └── mock-responses.json
└── docs/
    ├── cro-blueprint.md
    ├── demo-spec.md
    └── tracking-plan.md
```

---

## Wywołanie Agenta

```
@agent CRO-Architect napisz H1/subheadline warianty używając skill page-cro
@agent NLU-Demo-Architect zaprojektuj Intent Translator używając skill ai-agents-architect
@agent 3D-Web-Dev zaimplementuj horizontal scroll używając skill scroll-experience
@agent Analytics-Engineer setup Plausible używając skill analytics-tracking
@agent QA-DevOps deploy to Vercel używając skill vercel-deployment
```
