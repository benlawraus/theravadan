/**
 * Shared constants, utilities, and database initialization for Dexie search.
 * Must be loaded after dexie.js and before dexie-loader.js, dexie-search.js, dexie-root-search.js.
 */

const DEXIE_DB_NAME = "BuddhistTextsDB";
// Bumped to 6 to add the paritta stores. Raising the version makes existing
// clients rebuild, which they must: the new stores would otherwise stay empty.
const DEXIE_DB_VERSION = 6;

const ROOT_LANGUAGES = ["pli", "pra", "san", "lzh"];
const TRANSLATION_LANGUAGES = [
    "cs", "de", "en", "es", "fi", "fr", "gu", "hi", "id",
    "it", "jpn", "lo", "lt", "my", "pl", "ru", "sr", "th", "vi"
];
// 'paritta' holds anthologies such as the Catubhāṇavārapāḷi. Only their own
// material is stored: passages an anthology borrows from the canon stay in the
// sutta stores, so a search matches a borrowed line once, not twice.
const TEXT_CATEGORIES = ["sutta", "vinaya", "abhidhamma", "paritta"];

/**
 * Check whether a root language / category combination is valid.
 * Abhidhamma is excluded for pra, san, and lzh; paritta exists only in Pali.
 */
function isValidCombination(rootLang, category) {
    if (category === "abhidhamma" &&
        (rootLang === "pra" || rootLang === "san" || rootLang === "lzh")) {
        return false;
    }
    if (category === "paritta" && rootLang !== "pli") {
        return false;
    }
    return true;
}

/**
 * Generate the Dexie store schema object for all tables.
 */
function generateStoreSchema() {
    const schema = {};

    ROOT_LANGUAGES.forEach(rootLang => {
        TEXT_CATEGORIES.forEach(category => {
            if (!isValidCombination(rootLang, category)) return;
            schema[`${rootLang}_${category}`] = '';
        });
    });

    ROOT_LANGUAGES.forEach(rootLang => {
        TRANSLATION_LANGUAGES.forEach(transLang => {
            TEXT_CATEGORIES.forEach(category => {
                if (!isValidCombination(rootLang, category)) return;
                schema[`${rootLang}_${transLang}_${category}`] = '';
            });
        });
    });

    return schema;
}

/**
 * Normalize a string by removing accents/diacritics and lowercasing.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Shared Dexie database instance (lazy-initialized).
 */
let _sharedDb = null;

function getSharedDatabase() {
    if (!_sharedDb) {
        _sharedDb = new Dexie(DEXIE_DB_NAME);
        _sharedDb.version(DEXIE_DB_VERSION).stores(generateStoreSchema());
    }
    return _sharedDb;
}

/**
 * Score search results by relevance.
 * Lower score = better match.
 * @param {Array} verses - Array of verse objects with normalized_verse property
 * @param {string} normalizedSearchTerm - The full normalized search phrase
 * @param {string[]} searchWords - Individual normalized search words
 * @returns {Array} Scored and sorted results
 */
function scoreAndSortResults(verses, normalizedSearchTerm, searchWords) {
    const scored = verses.map(verse => {
        let score = 0;
        const nv = verse.normalized_verse;

        // Exact phrase match bonus
        if (nv.includes(normalizedSearchTerm)) {
            score -= 0.5;
        }

        // Average position of matched words (earlier = better)
        let totalPosition = 0;
        let matchCount = 0;

        searchWords.forEach(word => {
            const position = nv.indexOf(word);
            if (position !== -1) {
                totalPosition += position;
                matchCount++;
            }
        });

        if (matchCount > 0) {
            score += (totalPosition / matchCount) / nv.length;
        }

        return { ...verse, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored;
}