'use client';

import { useEffect, useState } from 'react';

// Compact = wąski ekran albo niski (telefon w poziomie, np. 844×390). Niezależne od historycznej
// flagi isMobile w page.tsx (liczonej raz, tylko po szerokości).
const QUERY = '(max-width: 767px), (max-height: 500px)';

export function useCompact() {
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia(QUERY);
        const update = () => setCompact(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    return compact;
}
