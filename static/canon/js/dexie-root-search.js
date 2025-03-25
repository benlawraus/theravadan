// This script requires only dexie.js to be loaded before it runs
// Include this script tag first:
// <script src="https://unpkg.com/dexie@latest/dist/dexie.js"></script>

const ROOT_DB_NAME = "BuddhistTextsDB";
const ROOT_DB_VERSION = 4;

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
 * Initialize the Dexie database with the existing schema
 * @returns {Dexie} The Dexie database instance
 */
function initializeRootDatabase() {
    // Create a Dexie database with the same schema
    const db = new Dexie(ROOT_DB_NAME);
    
    // Since the original DB was created without indices, we need to define
    // tables without any explicit indices here too
    const stores = {};
    
    // Define root language and text categories
    const rootLanguages = ["pli", "pra", "san", "lzh"];
    const textCategories = ["sutta", "vinaya", "abhidhamma"];
    
    // Add root language tables only (X_Z format)
    rootLanguages.forEach(rootLang => {
        textCategories.forEach(category => {
            // Skip abhidhamma for pra, san, and lzh
            if (category === "abhidhamma" && 
                (rootLang === "pra" || rootLang === "san" || rootLang === "lzh")) {
                return;
            }
            
            const storeName = `${rootLang}_${category}`;
            stores[storeName] = '';  // No index, just primary key
        });
    });
    
    // Define schema version
    db.version(ROOT_DB_VERSION).stores(stores);
    
    return db;
}

/**
 * Searches for a term inside the root text stores (X_Z format).
 * Only searches in stores like pli_sutta, pra_sutta, lzh_sutta, etc.
 *
 * @param {string} searchTerm - The term to search for.
 * @param {string} rootLang - The root language code (e.g., "pli", "lzh").
 * @returns {Promise<Array>} - List of matching verses with verseindex and verse.
 */
async function rootLanguageSearch(searchTerm, rootLang) {
    try {
        // Initialize the database
        const db = initializeRootDatabase();
        
        // Normalize search term
        const normalizedSearchTerm = normalizeText(searchTerm);
        
        // Split into words for multi-word search
        const searchWords = normalizedSearchTerm.split(' ').filter(word => word.length > 0);
        
        // Get all relevant stores that match our pattern rootLang_category
        const storeNames = db.tables.map(table => table.name)
            .filter(name => {
                const parts = name.split('_');
                // Include only stores with 2 parts (X_Z format) where X is the root language
                return parts.length === 2 && parts[0] === rootLang;
            });
        
        if (storeNames.length === 0) {
            console.warn(`No root stores found for language: ${rootLang}`);
            return [];
        }
        
        // Collect all verses for searching
        const allVerses = [];
        
        // Process each relevant store
        for (const storeName of storeNames) {
            try {
                // Get the store so we can access both keys and values
                const table = db.table(storeName);
                const collection = table.toCollection();
                
                // Use each() to iterate through keys and values together
                await collection.each((record, cursor) => {
                    const urlKey = cursor.key; // Get the actual primary key
                    
                    if (record && record.root) {
                        // Loop through each verse index in the root structure
                        for (const verseIndex in record.root) {
                            const verseObj = record.root[verseIndex];
                            if (verseObj && verseObj.verse && typeof verseObj.verse === 'string') {
                                allVerses.push({
                                    url_key: urlKey,
                                    verseindex: verseIndex,
                                    verse: verseObj.verse,
                                    normalized_verse: normalizeText(verseObj.verse),
                                    store: storeName // Include store name for reference
                                });
                            }
                        }
                    }
                });
            } catch (error) {
                console.error(`Error processing store ${storeName}:`, error);
            }
        }
        
        // Filter verses that match the search term
        let results = allVerses;
        
        if (searchWords.length > 0) {
            // Filter verses that contain all search words
            results = allVerses.filter(verse => {
                const normalizedVerse = verse.normalized_verse;
                // For each word, check if it exists in the verse
                return searchWords.every(word => 
                    normalizedVerse.includes(word)
                );
            });
            
            // Calculate a simple score based on word frequency and position
            results = results.map(verse => {
                let score = 0;
                const normalizedVerse = verse.normalized_verse;
                
                // Higher score for exact phrase match
                if (normalizedVerse.includes(normalizedSearchTerm)) {
                    score -= 0.5; // Lower is better
                }
                
                // Calculate score based on positions of words
                // Words appearing earlier get better scores
                let totalPosition = 0;
                let matchCount = 0;
                
                searchWords.forEach(word => {
                    const position = normalizedVerse.indexOf(word);
                    if (position !== -1) {
                        totalPosition += position;
                        matchCount++;
                    }
                });
                
                // Average position of matched words (lower is better)
                if (matchCount > 0) {
                    score += (totalPosition / matchCount) / normalizedVerse.length;
                }
                
                return {
                    ...verse,
                    score: score
                };
            });
            
            // Sort by score (lower is better)
            results.sort((a, b) => a.score - b.score);
        }
        
        // Close database connection
        db.close();
        
        return results;
        
    } catch (error) {
        console.error("Root language search failed:", error);
        return []; // Return empty array on error
    }
}

// Make the function available globally
window.rootLanguageSearch = rootLanguageSearch;
