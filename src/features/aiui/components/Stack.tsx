'use client';

import type { ViewProps } from './types';

export default function Stack({ gap = 12, direction = 'column', children }: ViewProps<{ gap?: number; direction?: 'column' | 'row' }>) {
    return (
        <div className={`flex ${direction === 'row' ? 'flex-row flex-wrap' : 'flex-col'}`} style={{ gap }}>
            {children}
        </div>
    );
}
