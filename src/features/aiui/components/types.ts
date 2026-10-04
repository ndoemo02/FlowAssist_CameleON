import type { ReactNode } from 'react';

export type ActionHandler = (name: string, context?: Record<string, unknown>) => void;

/** Wspólny kształt komponentu katalogu: propsy już zwalidowane i z rozwiązanymi bindingami. */
export type ViewProps<P> = P & { onAction: ActionHandler; children?: ReactNode };
