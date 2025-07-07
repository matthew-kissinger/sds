/**
 * Skeleton Loader Utility
 * Loads and injects the skeleton loader HTML into the page
 */

export async function loadSkeletonLoader() {
    try {
        const response = await fetch('components/skeleton-loader.html');
        if (!response.ok) {
            throw new Error(`Failed to load skeleton loader: ${response.status}`);
        }
        
        const skeletonHTML = await response.text();
        
        // Find the react-overlay container
        const reactOverlay = document.getElementById('react-overlay');
        if (reactOverlay) {
            // Insert the skeleton loader at the beginning of react-overlay
            reactOverlay.insertAdjacentHTML('afterbegin', skeletonHTML);
            console.log('✅ Skeleton loader injected successfully');
        } else {
            console.error('❌ React overlay container not found');
        }
    } catch (error) {
        console.error('❌ Failed to load skeleton loader:', error);
        // Fallback: show a simple loading message
        const reactOverlay = document.getElementById('react-overlay');
        if (reactOverlay) {
            reactOverlay.insertAdjacentHTML('afterbegin', `
                <div id="skeleton-loader" class="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center">
                    <div class="text-center text-white">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Loading...</p>
                    </div>
                </div>
            `);
        }
    }
}

// Auto-load skeleton loader when this script is imported
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSkeletonLoader);
} else {
    loadSkeletonLoader();
}
