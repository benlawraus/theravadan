/**
 * Improved literal substring search for root languages that handles the actual data structure.
 *
 * @param {string} searchTerm - The term to search for.
 * @param {string} storeName - The object store name (language code).
 * @returns {Promise<Array>} - List of matching verses.
 */
async function literalSearchInIndexedDB(searchTerm, storeName) {
    try {
        const { openDB } = idb;
        const db = await openDB(DB_NAME, DB_VERSION);

        // Normalize and split search term for comparison
        const normalizedSearchTerm = normalizeText(searchTerm);
        // Split into individual words for multi-word searches
        const searchWords = normalizedSearchTerm.split(/\s+/).filter(word => word.length > 0);

        console.log(`Searching for words: ${searchWords.join(', ')}`);

        // Collect all verses for searching
        const allVerses = [];

        // Set up transaction to read all records
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);

        // Use cursor to iterate through all records
        let cursor = await store.openCursor();

        // Collect all verses
        while (cursor) {
            const record = cursor.value;
            const urlKey = record.sutta_ref;

            // Handle the actual structure where thread_list is an array of objects with verse data directly
            if (record && Array.isArray(record.thread_list)) {
                record.thread_list.forEach(threadItem => {
                    if (!threadItem || !threadItem.verse || typeof threadItem.verse !== 'string') return;

                    // Keep original verse for display, normalized for searching
                    allVerses.push({
                        url_key: urlKey,
                        verseindex: threadItem.verseindex,
                        verse: threadItem.verse,
                        normalizedVerse: normalizeText(threadItem.verse),
                        // Use a placeholder author if needed
                        author: threadItem.author || "unknown",
                        title: record.title || null
                    });
                });
            }

            // Move to next record
            cursor = await cursor.continue();
        }

        // Perform matching differently based on whether it's a single or multi-word search
        let results = [];

        if (searchWords.length === 1) {
            // Single word search - simple substring match
            results = allVerses.filter(item =>
                item.normalizedVerse.includes(searchWords[0])
            );
        } else {
            // Multi-word search - check if ALL words appear in the verse
            results = allVerses.filter(item => {
                const verseText = item.normalizedVerse;
                return searchWords.every(word => verseText.includes(word));
            });
        }

        // Sort results by relevance (shorter verses that contain the search term are more relevant)
        results.sort((a, b) => a.normalizedVerse.length - b.normalizedVerse.length);

        // Format results to match the structure of fuzzy search results
        const formattedResults = results.map(item => ({
            url_key: item.url_key,
            verseindex: item.verseindex,
            verse: item.verse, // Use original non-normalized verse for display
            author: item.author,
            title: item.title,
            // Add a placeholder score to maintain compatibility with fuzzy search results
            score: 0
        }));

        // Close database connection
        db.close();

        console.log(`Found ${formattedResults.length} results for "${searchTerm}"`);
        return formattedResults;

    } catch (error) {
        console.error("Literal search failed:", error);
        return []; // Return empty array on error
    }
}

// Update the languageAwareSearch function
async function languageAwareSearch(searchTerm, langCode) {
    // Define root languages
    const rootLanguages = ['pli', 'san', 'pra', 'lzh'];

    if (!searchTerm || searchTerm.trim() === '') {
        console.log("Empty search term provided");
        return [];
    }

    // Check if the language code is a root language
    if (rootLanguages.includes(langCode)) {
        // For root languages, use improved literal substring search
        console.log(`Using literal substring search for root language: ${langCode}`);
        return await literalSearchInIndexedDB(searchTerm, langCode);
    } else {
        // For non-root languages, use the fuzzy search with title fetching
        console.log(`Using fuzzy search for non-root language: ${langCode}`);
        return await enhancedSearchInIndexedDB(searchTerm, langCode);
    }
}

// Make the functions available globally
window.literalSearchInIndexedDB = literalSearchInIndexedDB;
window.languageAwareSearch = languageAwareSearch;
