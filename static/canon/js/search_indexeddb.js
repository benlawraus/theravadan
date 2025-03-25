// This script requires both idb and fuse.js to be loaded before it runs
// Include these script tags first:
// <script src="https://cdn.jsdelivr.net/npm/idb@7.1.1/build/umd.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js"></script>

const DB_NAME = "BuddhistTextsDB";
const DB_VERSION = 4;

/**
 * Normalize a string by removing accents, lower casing, etc.
 * @param {string} text The text to normalize.
 * @returns {string} The normalized text.
 */
function normalizeText(text) {
    if (!text) return '';
    // Remove accents and diacritics
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Convert to lowercase
    return text.toLowerCase();
}

/**
 * Searches for a term inside the `verse` field in the stored data using Fuse.js for fuzzy searching.
 * Function accepts a language code (e.g., 'en') but internally works with stores that follow
 * the pattern X_Y_Z where X are codes [pli,lzh,pra,etc], Y is the language code,
 * and Z are ['sutta','vinaya','abhidhamma']
 *
 * @param {string} searchTerm - The term to search for.
 * @param {string} langCode - The language code (e.g., "en").
 * @returns {Promise<Array>} - List of matching verses with verseindex, verse, author, and URL key.
 */
async function languageAwareSearch(searchTerm, langCode) {
    try {
        const { openDB } = idb;
        const db = await openDB(DB_NAME, DB_VERSION);

        // Get all store names from the database
        const storeNames = db.objectStoreNames;

        // Filter stores that match our pattern X_[langCode]_Z
        const relevantStores = Array.from(storeNames).filter(store => {
            const parts = store.split('_');
            return parts.length === 3 && parts[1] === langCode;
        });

        if (relevantStores.length === 0) {
            console.warn(`No stores found for language code: ${langCode}`);
            return [];
        }

        // Collect all verses for the search index
        const allVerses = [];

        // Process each relevant store
        for (const storeName of relevantStores) {
            // Set up transaction to read all records
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);

            // Use cursor to iterate through all records
            let cursor = await store.openCursor();

            // First pass: collect all verses
            while (cursor) {
                const urlKey = cursor.key; // The key is the URL parameter
                const record = cursor.value;

                if (record && record.texts) {
                    // Extract verses from translator-keyed structure
                    for (const author in record.texts) {
                        const translation = record.texts[author];
                        // Loop through each verse index and its content
                        for (const verseIndex in translation) {
                            const verseObj = translation[verseIndex];
                            if (verseObj && verseObj.verse && typeof verseObj.verse === 'string') {
                                allVerses.push({
                                    url_key: urlKey,
                                    verseindex: verseIndex,
                                    verse: normalizeText(verseObj.verse), // normalize here
                                    author: author,
                                    store: storeName // Include store name for reference
                                });
                            }
                        }
                    }
                }

                // Move to next record
                cursor = await cursor.continue();
            }
        }

        // Configure Fuse.js options
        const options = {
            includeScore: true,
            shouldSort: true,
            threshold: 0.175, // Lower threshold for stricter matching
            useExtendedSearch: true, // Enable extended search for better multi-term matching
            ignoreLocation: false, // Better for longer texts
            location: 0,
            distance: 100,
            // Ensure all words must match
            findAllMatches: true,
            minMatchCharLength: 3, // Minimum character length for a match
            keys: ['verse'] // Only search in verse field
        };

        // Create Fuse instance with the collected verses
        const fuse = new Fuse(allVerses, options);

        // Prepare search terms for better matching
        let searchQuery = normalizeText(searchTerm);

        // For multi-word searches, enforce that all words should match
        if (searchTerm.includes(' ')) {
            const searchWords = searchTerm.split(' ');
            // Format as an AND query for all words
            searchQuery = searchWords.map(word => `'${word}`).join(' ');
        }

        // Perform the search with the formatted query
        const searchResults = fuse.search(searchQuery);

        // Filter results to enforce stricter matching for multi-word searches
        let results = searchResults;

        // For multi-word searches, perform additional filtering
        if (searchTerm.includes(' ')) {
            const searchWords = searchTerm.split(' ').map(word => word.toLowerCase());

            // Only keep results that contain ALL search words
            results = searchResults.filter(result => {
                const verse = result.item.verse.toLowerCase();
                return searchWords.every(word => verse.includes(word));
            });
        }

        // Extract the item from each result (and include the score)
        results = results.map(result => ({
            ...result.item,
            score: result.score
        }));

        // Close database connection
        db.close();

        return results;

    } catch (error) {
        console.error("Search failed:", error);
        return []; // Return empty array on error
    }
}

// Make the functions available globally
window.languageAwareSearch = languageAwareSearch;
window.searchInIndexedDB = languageAwareSearch; // For backward compatibility