// Root language search (X_Z stores)
// Requires dexie.js and dexie-shared.js to be loaded first

/**
 * Searches for a term in root language stores (e.g. pli_sutta).
 *
 * @param {string} searchTerm - The term to search for.
 * @param {string} rootLang - The root language code (e.g., "pli").
 * @returns {Promise<Array>} - List of matching verses.
 */
async function rootLanguageSearch(searchTerm, rootLang) {
    try {
        const db = getSharedDatabase();

        const normalizedSearchTerm = normalizeText(searchTerm);
        const searchWords = normalizedSearchTerm.split(' ').filter(word => word.length > 0);

        // Get stores matching {rootLang}_{category} (2-part names only)
        const storeNames = db.tables.map(table => table.name)
            .filter(name => {
                const parts = name.split('_');
                return parts.length === 2 && parts[0] === rootLang;
            });

        if (storeNames.length === 0) {
            console.warn(`No root stores found for language: ${rootLang}`);
            return [];
        }

        const matchedVerses = [];

        for (const storeName of storeNames) {
            try {
                const table = db.table(storeName);

                await table.toCollection().each((record, cursor) => {
                    const urlKey = cursor.key;

                    if (!record || !record.root) return;

                    for (const verseIndex in record.root) {
                        const verseObj = record.root[verseIndex];
                        if (!verseObj || typeof verseObj.verse !== 'string') continue;

                        // Use pre-normalized text if available, otherwise normalize on the fly
                        const nv = verseObj.normalized_verse || normalizeText(verseObj.verse);

                        if (searchWords.every(word => nv.includes(word))) {
                            matchedVerses.push({
                                url_key: urlKey,
                                verseindex: verseIndex,
                                verse: verseObj.verse,
                                normalized_verse: nv,
                                store: storeName
                            });
                        }
                    }
                });
            } catch (error) {
                console.error(`Error processing store ${storeName}:`, error);
            }
        }

        return scoreAndSortResults(matchedVerses, normalizedSearchTerm, searchWords);

    } catch (error) {
        console.error("Root language search failed:", error);
        return [];
    }
}

// Make the function available globally
window.rootLanguageSearch = rootLanguageSearch;