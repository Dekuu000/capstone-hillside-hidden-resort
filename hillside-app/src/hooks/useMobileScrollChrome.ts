import { useEffect, useState } from 'react';

export function useMobileScrollChrome() {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        let lastY = window.scrollY;
        let rafId = 0;

        const handleScroll = () => {
            if (rafId) return;

            rafId = window.requestAnimationFrame(() => {
                const currentY = window.scrollY;
                const delta = currentY - lastY;
                const atTop = currentY < 24;

                if (atTop || delta < -8) {
                    setVisible(true);
                } else if (delta > 8) {
                    setVisible(false);
                }

                lastY = currentY;
                rafId = 0;
            });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, []);

    return { visible };
}

