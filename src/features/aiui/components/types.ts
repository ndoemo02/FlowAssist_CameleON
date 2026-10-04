import type { ReactNode } from 'react';

export type ActionHandler = (name: string, context?: Record<string, unknown>) => void;

/** Gęstość widoku ustawiana przez warstwę (nie przez agenta): karta na stole vs ekran / panel. */
export type Density = 'card' | 'screen';

/** Wspólny kształt komponentu katalogu: propsy już zwalidowane i z rozwiązanymi bindingami. */
export type ViewProps<P> = P & { onAction: ActionHandler; children?: ReactNode; density?: Density };
