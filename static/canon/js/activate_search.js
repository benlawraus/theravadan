// Update loading status
function updateLoadingStatus(message) {
    const statusElement = document.getElementById('loading-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Function to remove loading overlay and show content
function removeLoadingOverlay() {
    const overlay = document.getElementById('db-loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }

    // Show all content-hidden elements
    document.querySelectorAll('.content-hidden').forEach(element => {
        element.classList.remove('content-hidden');
    });

    // Mark as loaded in the session
    sessionStorage.setItem('buddhist-texts-db-loaded', 'true');
}

// Check if we've already loaded the database in this session
const dbAlreadyLoaded = sessionStorage.getItem('buddhist-texts-db-loaded');

// Skip loading if database was already loaded in this session
if (dbAlreadyLoaded === 'true') {
    console.log('Database was already loaded in this session, skipping initialization');
    updateLoadingStatus('Using cached database');
    removeLoadingOverlay();
} else {
    // Listen for the database loaded event
    document.addEventListener('buddhist-texts-loaded', function(e) {
        console.log('Buddhist texts database loaded:', e.detail);
        updateLoadingStatus('Database loaded successfully!');

        // Short delay to ensure all scripts have initialized
        setTimeout(removeLoadingOverlay, 500);
    });

    // Fallback timeout in case the event never fires
    setTimeout(function() {
        if (document.getElementById('db-loading-overlay').style.display !== 'none') {
            console.warn('Loading timeout reached. Showing content anyway.');
            updateLoadingStatus('Loading timeout reached. Some features might not be available.');
            setTimeout(removeLoadingOverlay, 1000);
        }
    }, 30000); // 30 second timeout
}

// Error handler for script loading failures
window.addEventListener('error', function(event) {
    console.error('Script loading error:', event);
    updateLoadingStatus('Error loading resources: ' + event.message);
}, true); // Use capture phase

// Initialize form handling after DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    const searchForm = document.getElementById('search-form');

    if (searchForm) {
        searchForm.addEventListener('submit', function(event) {
            event.preventDefault();

            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                const searchTerm = searchInput.value.trim();

                if (searchTerm) {
                    // Update URL with search parameters without reloading
                    const url = new URL(window.location);
                    url.searchParams.set('q', searchTerm);
                    window.history.pushState({}, '', url);

                    // Dispatch custom event to trigger search
                    const searchEvent = new CustomEvent('buddhist-texts-search', {
                        detail: {
                            searchTerm: searchTerm,
                            langCode: lang_code
                        }
                    });
                    document.dispatchEvent(searchEvent);
                } else {
                    console.log("No search term provided.");
                    document.getElementById("results").innerHTML = "<p>Please enter a search term.</p>";
                }
            }
        });
    }

    // Handle initial search term if present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('q');

    if (searchParam && searchParam.trim() !== '') {
        // Wait for database to be ready before searching
        const checkDatabaseAndSearch = function() {
            if (sessionStorage.getItem('buddhist-texts-db-loaded') === 'true') {
                // Dispatch search event after short delay to ensure scripts are loaded
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent('buddhist-texts-search', {
                        detail: {
                            searchTerm: searchParam.trim(),
                            langCode: lang_code
                        }
                    }));
                }, 100);
            } else {
                // Check again after a short delay
                setTimeout(checkDatabaseAndSearch, 100);
            }
        };

        checkDatabaseAndSearch();
    }
});
