/**
 * Buddhist Texts Search Handler
 * This file handles the search process as three distinct steps:
 * 1. Listen for search requests
 * 2. Execute search with appropriate search function
 * 3. Render results
 */

// Listen for the search event
document.addEventListener('buddhist-texts-search', function(event) {
    const { searchTerm, langCode } = event.detail;

    console.log(`Search requested: "${searchTerm}" in language: ${langCode}`);

    // Step 1: Show loading state
    const resultsContainer = document.getElementById("results");
    if (!resultsContainer) {
        console.error("No container with id 'results' found.");
        return;
    }

    resultsContainer.innerHTML = `
        <div class="search-loading">
            <div class="spinner"></div>
            <span>Searching...</span>
        </div>
    `;

    // Step 2: Execute the appropriate search based on language
    executeSearch(searchTerm, langCode)
        .then(results => {
            // Step 3: Render the results
            renderResults(results, searchTerm);
        })
        .catch(error => {
            console.error("Error during search:", error);
            resultsContainer.innerHTML = `
                <div class="error-container">
                    <p>Error searching: ${error.message}</p>
                    <button onclick="document.dispatchEvent(new CustomEvent('buddhist-texts-search', 
                        { detail: { searchTerm: '${searchTerm}', langCode: '${langCode}' } }))">
                        Try Again
                    </button>
                </div>
            `;
        });
});

/**
 * Step 2: Execute the search with appropriate function based on language
 * @param {string} searchTerm - The term to search for
 * @param {string} langCode - The language code
 * @returns {Promise<Array>} - Promise resolving to results array
 */
async function executeSearch(searchTerm, langCode) {
    // Determine search function based on language code
    const rootLanguages = ['pli', 'pra', 'san', 'lzh'];

    if (rootLanguages.includes(langCode)) {
        // Make sure rootLanguageSearch is available
        if (typeof rootLanguageSearch !== 'function') {
            throw new Error("Root language search function not available. Make sure the search script is loaded.");
        }
        const results = await rootLanguageSearch(searchTerm, langCode);
        console.log(`Found ${results.length} results using rootLanguageSearch:`, results);
        return results;
    } else {
        // Use regular language search
        if (typeof languageAwareSearch !== 'function') {
            throw new Error("Search function not available. Make sure the search script is loaded.");
        }
        const results = await languageAwareSearch(searchTerm, langCode);
        console.log(`Found ${results.length} results using languageAwareSearch:`, results);
        return results;
    }
}

/**
 * Step 3: Render search results to the page
 * @param {Array} results - The search results
 * @param {string} searchTerm - The term that was searched for
 */
function renderResults(results, searchTerm) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = "";

    if (results.length === 0) {
        resultsContainer.innerHTML = `<p>No results found for "${searchTerm}".</p>`;
        return;
    }

    // Group results by category (Sutta, Vinaya, Abhidhamma)
    const categories = {
        "Sutta": [],
        "Vinaya": [],
        "Abhidhamma": []
    };

    // Track verse indices we've already seen to avoid duplicates
    const seenVerseIndices = new Set();

    // Categorize the results based on the store name (filtering out duplicates)
    results.forEach(result => {
        // Skip this result if we've already seen this verse index
        if (seenVerseIndices.has(result.verseindex)) {
            return;
        }

        // Mark this verse index as seen
        seenVerseIndices.add(result.verseindex);

        let category = "Sutta"; // Default category

        // Check the store name to determine category
        if (result.store && typeof result.store === 'string') {
            const storeParts = result.store.split('_');
            if (storeParts.length >= 2) {
                const categoryType = storeParts[storeParts.length - 1].toLowerCase();
                if (categoryType === 'vinaya') {
                    category = "Vinaya";
                } else if (categoryType === 'abhidhamma') {
                    category = "Abhidhamma";
                }
            }
        } else {
            // Fallback to checking URL as before
            if (result.url_key.includes("vinaya")) {
                category = "Vinaya";
            } else if (result.url_key.includes("abhidhamma")) {
                category = "Abhidhamma";
            }
        }

        categories[category].push(result);
    });

    // Count the total number of unique results after filtering duplicates
    const totalUniqueResults = categories.Sutta.length + categories.Vinaya.length + categories.Abhidhamma.length;

    // Add search stats
    const searchStatsDiv = document.createElement("div");
    searchStatsDiv.className = "search-stats";
    searchStatsDiv.innerHTML = `
        <p>Found ${totalUniqueResults} unique results for "${searchTerm}" in ${categories.Sutta.length} Suttas, 
        ${categories.Vinaya.length} Vinaya texts, and ${categories.Abhidhamma.length} Abhidhamma texts.</p>
    `;
    resultsContainer.appendChild(searchStatsDiv);

    // Add search results header
    const header = document.createElement("h2");
    header.textContent = "Search Results";
    resultsContainer.appendChild(header);

    const resultsList = document.createElement("div");
    resultsList.id = "results-list";
    resultsContainer.appendChild(resultsList);

    // Create sections for each category
    for (const [category, categoryResults] of Object.entries(categories)) {
        if (categoryResults.length === 0) continue;

        // Add category header
        const categoryHeader = document.createElement("h3");
        categoryHeader.textContent = category;
        resultsList.appendChild(categoryHeader);

        // Add all results for this category
        categoryResults.forEach(result => {
            const resultParagraph = document.createElement("p");

            const link = document.createElement("a");
            // Use url_key as HTMLFILENAME
            const cleanUrlKey = result.url_key.startsWith('/') ? result.url_key.substring(1) : result.url_key;

            // For root language searches, link to English version
            const rootLanguages = ['pli', 'pra', 'san', 'lzh'];
            const linkLangCode = rootLanguages.includes(lang_code) ? 'en' : lang_code;

            link.href = `/canon/${linkLangCode}/${cleanUrlKey}.html#${result.verseindex}`;
            // Set the link text to verse index
            link.textContent = result.verseindex;
            resultParagraph.appendChild(link);

            // Add VERSE content with highlighting and context
            const verseText = result.verse || "";
            const highlightedVerse = highlightWithContext(verseText, searchTerm);

            // Create a container for the verse content to properly insert the HTML
            const verseContainer = document.createElement("div");
            verseContainer.innerHTML = highlightedVerse;
            resultParagraph.appendChild(verseContainer);

            resultsList.appendChild(resultParagraph);
        });
    }

    console.log("Search complete. Results rendered.");
}

/**
 * Highlights search terms within text, splitting search into individual words
 * @param {string} text The original text
 * @param {string} term The search term to highlight
 * @returns {string} HTML with highlighting
 */
function highlightSearchTerm(text, term) {
    if (!term || !text) return text;

    // First, try to match the entire phrase
    const escapedPhrase = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const phraseRegex = new RegExp(escapedPhrase, 'gi');

    // If the exact phrase is found, highlight it as one unit
    if (text.match(phraseRegex)) {
        return text.replace(phraseRegex, '<mark>$&</mark>');
    }

    // If not, highlight individual words without breaking existing HTML
    // Split search term into individual words
    const searchWords = term.trim().split(/\s+/).filter(word => word.length > 0);

    // Create a temporary element to safely work with HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;

    // Process text nodes only, avoiding modification of HTML tags
    const walkNodes = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            let content = node.textContent;
            let modified = false;

            // Apply highlighting for each word
            for (const word of searchWords) {
                if (word.length < 2) continue; // Skip very short words

                const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedWord})`, 'gi');

                if (regex.test(content)) {
                    content = content.replace(regex, '<mark>$1</mark>');
                    modified = true;
                }
            }

            // Replace the text node with highlighted HTML if modified
            if (modified) {
                const span = document.createElement('span');
                span.innerHTML = content;
                node.parentNode.replaceChild(span, node);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== 'MARK') {
            // Recursively process child nodes, skipping already highlighted content
            Array.from(node.childNodes).forEach(walkNodes);
        }
    };

    // Apply highlighting to all text nodes
    Array.from(tempDiv.childNodes).forEach(walkNodes);

    return tempDiv.innerHTML;
}

/**
 * Highlights terms and provides context around matches
 * @param {string} text The original text
 * @param {string} term The search term to highlight
 * @param {number} contextLength Number of characters to show around matches
 * @returns {string} HTML with highlighting and context
 */
function highlightWithContext(text, term, contextLength = 50) {
    if (!term || !text) return text;

    // For short texts, just use the normal highlighter
    if (text.length <= contextLength * 3) {
        return highlightSearchTerm(text, term);
    }

    // Try to match the entire phrase first
    const escapedPhrase = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const phraseRegex = new RegExp(escapedPhrase, 'gi');

    // If the exact phrase is found, use it for context
    if (text.match(phraseRegex)) {
        // Find all phrase matches
        let allMatches = [];
        let match;
        while ((match = phraseRegex.exec(text)) !== null) {
            allMatches.push({
                index: match.index,
                length: match[0].length,
                word: match[0]
            });
        }

        // Create snippets with context around phrase matches
        return createSnippetsWithContext(text, allMatches, term, contextLength);
    }

    // Otherwise, use individual words for matching
    const searchWords = term.trim().split(/\s+/).filter(word => word.length > 0);

    // Find all matches for all words
    let allMatches = [];

    searchWords.forEach(word => {
        if (word.length < 2) return; // Skip very short words

        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedWord})`, 'gi');

        let match;
        while ((match = regex.exec(text)) !== null) {
            allMatches.push({
                index: match.index,
                length: match[0].length,
                word: match[0]
            });
        }
    });

    return createSnippetsWithContext(text, allMatches, term, contextLength);
}

/**
 * Helper function to create snippets with context
 * @param {string} text The original text
 * @param {Array} matches Array of match objects {index, length, word}
 * @param {string} term The search term
 * @param {number} contextLength Context length
 * @returns {string} Formatted HTML with highlights and context
 */
function createSnippetsWithContext(text, matches, term, contextLength) {
    // Sort matches by position in text
    matches.sort((a, b) => a.index - b.index);

    // If no matches, return a snippet from the beginning
    if (matches.length === 0) {
        return text.substring(0, contextLength * 2) + "...";
    }

    // Merge overlapping or close matches
    let mergedMatches = [];
    let currentMatch = matches[0];

    for (let i = 1; i < matches.length; i++) {
        const nextMatch = matches[i];

        // If this match overlaps or is very close to the current one
        if (nextMatch.index <= currentMatch.index + currentMatch.length + contextLength) {
            // Extend current match
            currentMatch.length = Math.max(
                currentMatch.length,
                nextMatch.index + nextMatch.length - currentMatch.index
            );
        } else {
            // Save current match and move to next
            mergedMatches.push(currentMatch);
            currentMatch = nextMatch;
        }
    }

    // Add the last match
    mergedMatches.push(currentMatch);

    // Create highlighted snippets
    let result = "";
    let lastEnd = 0;

    mergedMatches.forEach((match, i) => {
        const start = Math.max(0, match.index - contextLength);
        const end = Math.min(text.length, match.index + match.length + contextLength);

        // Add ellipsis if we're skipping content
        if (start > lastEnd) {
            result += "... ";
        } else if (i > 0) {
            // If snippets overlap, just continue from the last end
            result = result.substring(0, result.length - 3); // Remove last ellipsis if any
        }

        // Extract the snippet
        const snippet = text.substring(start, end);

        // For the entire phrase, use the simple highlighter
        const escapedPhrase = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const phraseRegex = new RegExp(escapedPhrase, 'gi');

        let highlightedSnippet;
        if (snippet.match(phraseRegex)) {
            highlightedSnippet = snippet.replace(phraseRegex, '<mark>$&</mark>');
        } else {
            // For individual words, use the improved highlighter
            // But with a simpler approach since we're working with plain text snippets
            highlightedSnippet = snippet;
            term.trim().split(/\s+/).filter(word => word.length >= 2).forEach(word => {
                const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordRegex = new RegExp(`(${escapedWord})`, 'gi');
                highlightedSnippet = highlightedSnippet.replace(wordRegex, '<mark>$1</mark>');
            });
        }

        result += highlightedSnippet;

        if (end < text.length) {
            result += " ...";
        }

        lastEnd = end;
    });

    return result;
}