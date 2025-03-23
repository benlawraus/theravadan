// This script requires both idb and fuse.js to be loaded before it runs
// Include these script tags first:
// <script src="https://cdn.jsdelivr.net/npm/idb@7.1.1/build/umd.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js"></script>

const DB_NAME = "LanguageFilesDB";
const DB_VERSION = 3;

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
 * The actual record structure in IndexedDB is:
 * {
 *   sutta_ref: "path/to/sutta",
 *   thread_list: [
 *     {"patton": {"verseindex": "ma1:0.1", "verse": "Medium Discourses 1"}},
 *     ...
 *   ],
 *   title_verseindex: "..."
 * }
 *
 * @param {string} searchTerm - The term to search for.
 * @param {string} storeName - The object store name (e.g., a language code like "en").
 * @returns {Promise<Array>} - List of matching verses with verseindex, verse, author, and URL key.
 */
async function searchInIndexedDB(searchTerm, storeName) {
    try {
        const { openDB } = idb;
        const db = await openDB(DB_NAME, DB_VERSION);

        // Collect all verses for the search index
        const allVerses = [];

        // Set up transaction to read all records
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);

        // Use cursor to iterate through all records
        let cursor = await store.openCursor();

        // First pass: collect all verses
        while (cursor) {
            const record = cursor.value;
            // urlKey is used to construct the link to the full text.
            const urlKey = record.sutta_ref;

            if (record && Array.isArray(record.thread_list)) {
                record.thread_list.forEach(threadItem => {
                    // threadItem might be empty if there are no verses for a given author.
                    if (!threadItem) return;

                    // Extract verses from author-keyed structure
                    for (const author in threadItem) {
                        const thread = threadItem[author];
                        if (thread && thread.verse && typeof thread.verse === 'string') {
                            allVerses.push({
                                url_key: urlKey,
                                verseindex: thread.verseindex,
                                verse: normalizeText(thread.verse), //normalize here
                                author: author,
                                title: normalizeText(record.title) // add the title, for searching
                            });
                        }
                    }
                });
            }

            // Move to next record
            cursor = await cursor.continue();
        }

        // Configure Fuse.js options
        const options = {
            includeScore: true,
            shouldSort: true,
            threshold: 0.2, // Lower threshold for stricter matching
            useExtendedSearch: true, // Enable extended search for better multi-term matching
            ignoreLocation: false, // Better for longer texts
            location: 0,
            distance: 100,
            // Ensure all words must match
            findAllMatches: true,
            minMatchCharLength: 3, // Minimum character length for a match
            keys: ['verse']
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
        // This is necessary because Fuse.js's extended search doesn't guarantee
        // that all words in the query will appear in the result if any word is
        // not an exact match. For example, if the query is "red apple" and a verse
        // has "redish apple" then this would match if we do not have this extra filter.
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

// Make the function available globally
window.searchInIndexedDB = searchInIndexedDB;