/**
 * Fetches the title in the root language and matches it to the corresponding verse in the target language.
 *
 * @param {string} suttaRef - The sutta reference path (e.g., "dn/dn1").
 * @param {string} langCode - The target language code.
 * @returns {Promise<string|null>} - The title in the target language or null if not found.
 */
async function fetchTitleFromRootLanguage(suttaRef, langCode) {
    // Skip processing if langCode is already a root language
    const rootLanguages = ['pli', 'san', 'pra', 'lzh'];
    if (rootLanguages.includes(langCode)) {
        return null;
    }

    try {
        const { openDB } = idb;
        const db = await openDB(DB_NAME, DB_VERSION);

        // 1. Extract the root language storage from suttaRef (first part before '/')
        const rootCode = suttaRef.split('/')[0];

        // 2. Get the record from root language storage to find title_verseindex
        const rootTx = db.transaction(rootCode, "readonly");
        const rootStore = rootTx.objectStore(rootCode);
        const rootRecord = await rootStore.get(suttaRef);

        if (!rootRecord || !rootRecord.title_verseindex) {
            console.warn(`No title_verseindex found in root storage ${rootCode} for ${suttaRef}`);
            return null;
        }

        const titleVerseIndex = rootRecord.title_verseindex;

        // 3. Return to target language storage to find the corresponding verse
        const targetTx = db.transaction(langCode, "readonly");
        const targetStore = targetTx.objectStore(langCode);
        const targetRecord = await targetStore.get(suttaRef);

        if (!targetRecord || !Array.isArray(targetRecord.thread_list)) {
            console.warn(`No matching record or thread_list found in ${langCode} for ${suttaRef}`);
            return null;
        }

        // 4. Find the verse that matches the title_verseindex
        let titleText = null;

        // Iterate through thread_list to find matching verseindex
        for (const threadItem of targetRecord.thread_list) {
            if (!threadItem) continue;

            for (const author in threadItem) {
                const thread = threadItem[author];
                if (thread && thread.verseindex === titleVerseIndex) {
                    titleText = thread.verse;
                    break;
                }
            }

            if (titleText) break;
        }

        // Close database connection
        db.close();

        return titleText;

    } catch (error) {
        console.error(`Error fetching title from root language for ${suttaRef}:`, error);
        return null;
    }
}

/**
 * Modified search function that includes title information for non-root languages.
 *
 * @param {string} searchTerm - The term to search for.
 * @param {string} storeName - The object store name (language code).
 * @returns {Promise<Array>} - List of matching verses with title information.
 */
async function enhancedSearchInIndexedDB(searchTerm, storeName) {
    try {
        // Get base search results
        const results = await searchInIndexedDB(searchTerm, storeName);

        // Skip title enrichment if storeName is a root language
        const rootLanguages = ['pli', 'san', 'pra', 'lzh'];
        if (rootLanguages.includes(storeName)) {
            return results;
        }

        // Process results to add title information
        const enrichedResults = [];
        const processedSuttaRefs = new Set(); // Track already processed sutta_refs

        for (const result of results) {
            const suttaRef = result.url_key;

            // Only fetch title once per sutta_ref
            if (!processedSuttaRefs.has(suttaRef)) {
                const title = await fetchTitleFromRootLanguage(suttaRef, storeName);
                processedSuttaRefs.add(suttaRef);

                // Add title to all results with the same sutta_ref
                for (const item of results) {
                    if (item.url_key === suttaRef) {
                        enrichedResults.push({
                            ...item,
                            title: title || item.title // Fall back to existing title if needed
                        });
                    }
                }
            }
        }

        return enrichedResults.length > 0 ? enrichedResults : results;

    } catch (error) {
        console.error("Enhanced search failed:", error);
        return []; // Return empty array on error
    }
}

// Make the functions available globally
window.fetchTitleFromRootLanguage = fetchTitleFromRootLanguage;
window.enhancedSearchInIndexedDB = enhancedSearchInIndexedDB;