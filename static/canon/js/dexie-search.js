// Translation language search (X_Y_Z stores)
// Requires dexie.js and dexie-shared.js to be loaded first

/**
 * Searches for a term in translation language stores (e.g. pli_en_sutta).
 *
 * @param {string} searchTerm - The term to search for.
 * @param {string} langCode - The language code (e.g., "en").
 * @returns {Promise<Array>} - List of matching verses.
 */
async function languageAwareSearch(searchTerm, langCode) {
    try {
        const db = getSharedDatabase();

        const normalizedSearchTerm = normalizeText(searchTerm);
        const searchWords = normalizedSearchTerm.split(' ').filter(word => word.length > 0);

        // Get stores matching X_{langCode}_Z
        const storeNames = db.tables.map(table => table.name)
            .filter(name => {
                const parts = name.split('_');
                return parts.length === 3 && parts[1] === langCode;
            });

        if (storeNames.length === 0) {
            console.warn(`No stores found for language code: ${langCode}`);
            return [];
        }

        const matchedVerses = [];

        for (const storeName of storeNames) {
            try {
                const table = db.table(storeName);

                await table.toCollection().each((record, cursor) => {
                    const urlKey = cursor.key;

                    if (!record || !record.texts) return;

                    for (const author in record.texts) {
                        const translation = record.texts[author];
                        for (const verseIndex in translation) {
                            const verseObj = translation[verseIndex];
                            if (!verseObj || typeof verseObj.verse !== 'string') continue;

                            // Use pre-normalized text if available, otherwise normalize on the fly
                            const nv = verseObj.normalized_verse || normalizeText(verseObj.verse);

                            if (searchWords.every(word => nv.includes(word))) {
                                matchedVerses.push({
                                    url_key: urlKey,
                                    verseindex: verseIndex,
                                    verse: verseObj.verse,
                                    normalized_verse: nv,
                                    author: author,
                                    store: storeName
                                });
                            }
                        }
                    }
                });
            } catch (error) {
                console.error(`Error processing store ${storeName}:`, error);
            }
        }

        return scoreAndSortResults(matchedVerses, normalizedSearchTerm, searchWords);

    } catch (error) {
        console.error("Search failed:", error);
        return [];
    }
}

// Make the functions available globally
window.languageAwareSearch = languageAwareSearch;
window.searchInIndexedDB = languageAwareSearch; // Backward compatibility