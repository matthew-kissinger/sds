/**
 * Platform detection hook
 * Detects whether user is on mobile or desktop
 */
export function usePlatform() {
    const { useState, useEffect } = window.React;
    const [platform, setPlatform] = useState('desktop');

    useEffect(() => {
        const checkPlatform = () => {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                           window.innerWidth <= 768;
            setPlatform(isMobile ? 'mobile' : 'desktop');
        };

        checkPlatform();
        window.addEventListener('resize', checkPlatform);
        return () => window.removeEventListener('resize', checkPlatform);
    }, []);

    return platform;
}
