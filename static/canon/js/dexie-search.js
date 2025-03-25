// This script requires only dexie.js to be loaded before it runs
// Include this script tag first:
// <script src="https://unpkg.com/dexie@latest/dist/dexie.js"></script>

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
 * Initialize the Dexie database with the existing schema
 * @returns {Dexie} The Dexie database instance
 */
function initializeDatabase() {
    // Create a Dexie database with the same schema
    const db = new Dexie(DB_NAME);
    
    // Since the original DB was created without indices, we need to define
    // tables without any explicit indices here too
    const stores = {};
    
    // If we can access the database's object store names, use them
    if (indexedDB && indexedDB.databases) {
        // This is a future-compatible way to get the schema
        // But for now, we'll use the existing schema pattern
        const rootLanguages = ["pli", "pra", "san", "lzh"];
        const translationLanguages = [
            "cs", "de", "en", "es", "fi", "fr", "gu", "hi", "id",
            "it", "jpn", "lo", "lt", "my", "pl", "ru", "sr", "th", "vi"
        ];
        const textCategories = ["sutta", "vinaya", "abhidhamma"];
        
        // Add root language tables
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
        
        // Add translation tables
        rootLanguages.forEach(rootLang => {
            translationLanguages.forEach(transLang => {
                textCategories.forEach(category => {
                    // Skip abhidhamma for pra, san, and lzh
                    if (category === "abhidhamma" && 
                        (rootLang === "pra" || rootLang === "san" || rootLang === "lzh")) {
                        return;
                    }
                    
                    const storeName = `${rootLang}_${transLang}_${category}`;
                    stores[storeName] = '';  // No index, just primary key
                });
            });
        });
    }
    
    // Define schema version
    db.version(DB_VERSION).stores(stores);
    
    return db;
}

/**
 * Searches for a term inside the `verse` field in the stored data using Dexie.js filtering.
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
        // Initialize the database
        const db = initializeDatabase();
        
        // Normalize search term
        const normalizedSearchTerm = normalizeText(searchTerm);
        
        // Split into words for multi-word search
        const searchWords = normalizedSearchTerm.split(' ').filter(word => word.length > 0);
        
        // Get all relevant stores that match our pattern X_[langCode]_Z
        const storeNames = db.tables.map(table => table.name)
            .filter(name => {
                const parts = name.split('_');
                return parts.length === 3 && parts[1] === langCode;
            });
        
        if (storeNames.length === 0) {
            console.warn(`No stores found for language code: ${langCode}`);
            return [];
        }
        
        // Collect all verses for searching
        const allVerses = [];
        
        // Process each relevant store
        for (const storeName of storeNames) {
            try {
                // Use Dexie to get all records from the store
                const records = await db.table(storeName).toArray();
            
            // Process each record
            // In Dexie, each record is the value and keys must be accessed differently
            // Get the store so we can access both keys and values
            const table = db.table(storeName);
            const collection = table.toCollection();
            
            // Use each() to iterate through keys and values together
            await collection.each((record, cursor) => {
                const urlKey = cursor.key; // Get the actual primary key
                
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
                                    verse: verseObj.verse,
                                    normalized_verse: normalizeText(verseObj.verse), // Store normalized version for searching
                                    author: author,
                                    store: storeName // Include store name for reference
                                });
                            }
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
                    score -= 0.5; // Lower is better (like Fuse.js)
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
            
            // Sort by score (lower is better, just like Fuse.js)
            results.sort((a, b) => a.score - b.score);
        }
        
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
