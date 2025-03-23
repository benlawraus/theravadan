(async function() {
    // --- Parse URL to get lang_code ---
    // Expected URL structure: /search/<lang_code>?q=...
    const pathParts = window.location.pathname.split('/').filter(part => part.length > 0);
    let lang_code = (pathParts.length >= 2 && pathParts[1]) ? pathParts[1] : 'en';
    console.log("lang_code:", lang_code);

    // --- Get search term from query parameter ?q=... ---
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get("q");
    if (!queryParam) {
        console.log("No search term provided.");
        document.getElementById("results").textContent = "Please enter a search term.";
        return;
    }
    const searchTerm = queryParam.trim();
    console.log("Search term:", searchTerm);

    // --- Show loading state ---
    const resultsContainer = document.getElementById("results");
    if (!resultsContainer) {
        console.error("No container with id 'results' found.");
        return;
    }
    resultsContainer.innerHTML = "<p>Searching...</p>";

    // --- Call searchInIndexedDB with the lang_code as the store name ---
    let results;
    try {
        results = await languageAwareSearch(searchTerm, lang_code);
        console.log(`Found ${results.length} results:`, results);
    } catch (error) {
        console.error("Error during search:", error);
        resultsContainer.innerHTML = `
            <div class="error-container">
                <p>Error searching: ${error.message}</p>
                <button onclick="location.reload()">Try Again</button>
            </div>`;
        return;
    }

    // --- Render the results ---
    resultsContainer.innerHTML = "";

    if (results.length === 0) {
        resultsContainer.innerHTML = `<p>No results found for "${searchTerm}".</p>`;
    } else {
        // Group results by category (Sutta, Vinaya, Abhidhamma)
        const categories = {
            "Sutta": [],
            "Vinaya": [],
            "Abhidhamma": []
        };

        // Categorize the results
        results.forEach(result => {
            // Determine category based on url_key or other properties
            let category = "Sutta"; // Default category

            // This is a simplified approach - you may need to adjust the logic based on your actual data structure
            if (result.url_key.includes("vinaya")) {
                category = "Vinaya";
            } else if (result.url_key.includes("abhidhamma")) {
                category = "Abhidhamma";
            }

            categories[category].push(result);
        });

        // Add search stats
        const searchStatsDiv = document.createElement("div");
        searchStatsDiv.className = "search-stats";
        searchStatsDiv.innerHTML = `
            <p>Found ${results.length} results for "${searchTerm}" in ${categories.Sutta.length} Suttas, 
            ${categories.Vinaya.length} Vinaya texts, and ${categories.Abhidhamma.length} Abhidhamma texts.</p>
        `;
        resultsContainer.appendChild(searchStatsDiv);

        // Add search results header
        const header = document.createElement("h2");
        header.textContent = "Search Results";
        resultsContainer.appendChild(header);

        // Pagination setup
        const resultsPerPage = 10;
        let currentPage = 1;
        const totalPages = Math.ceil(results.length / resultsPerPage);
        const resultsList = document.createElement("div");
        resultsList.id = "results-list";
        resultsContainer.appendChild(resultsList);

        // Function to render a specific page of results
        function renderResultsPage(page) {
            resultsList.innerHTML = "";
            currentPage = page;

            // Create sections for each category
            for (const [category, categoryResults] of Object.entries(categories)) {
                if (categoryResults.length === 0) continue;

                // Add category header
                const categoryHeader = document.createElement("h3");
                categoryHeader.textContent = category;
                resultsList.appendChild(categoryHeader);

                // Calculate pagination for this category
                const startIndex = (page - 1) * resultsPerPage;
                const endIndex = startIndex + resultsPerPage;

                // Filter results for this category and page
                const pageResults = categoryResults.filter((_, index) => {
                    return index >= startIndex && index < endIndex;
                });

                // Add results for this category
                pageResults.forEach(result => {
                    const resultParagraph = document.createElement("p");

                    const link = document.createElement("a");
                    // Use url_key as HTMLFILENAME
                    const cleanUrlKey = result.url_key.startsWith('/') ? result.url_key.substring(1) : result.url_key;
                    link.href = `/${lang_code}/${cleanUrlKey}#${result.verseindex}`;

                    // If there's a title, use it as link text
                    if (result.title) {
                        link.textContent = result.title;
                    } else {
                        // If no title, use VERSEINDEX as the link text
                        link.textContent = result.verseindex;
                    }

                    resultParagraph.appendChild(link);

                    // Add VERSEINDEX (only as text if there was a title)
                    if (result.title) {
                        resultParagraph.appendChild(document.createTextNode(" " + result.verseindex));
                    }

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

            // Add pagination controls if needed
            if (totalPages > 1) {
                const paginationContainer = document.createElement("div");
                paginationContainer.className = "pagination";

                for (let i = 1; i <= totalPages; i++) {
                    const pageButton = document.createElement("button");
                    pageButton.textContent = i;
                    pageButton.className = i === page ? "active" : "";
                    pageButton.onclick = () => renderResultsPage(i);
                    paginationContainer.appendChild(pageButton);
                }

                // Remove existing pagination if any
                const existingPagination = document.querySelector(".pagination");
                if (existingPagination) {
                    existingPagination.remove();
                }

                resultsContainer.appendChild(paginationContainer);
            }
        }

        // Initial render of first page
        renderResultsPage(1);
    }

    console.log("Search complete. Final results:", results);
})();

/**
 * Highlights search terms within text, splitting search into individual words
 * @param {string} text The original text
 * @param {string} term The search term to highlight
 * @returns {string} HTML with highlighting
 */
function highlightSearchTerm(text, term) {
    if (!term || !text) return text;

    // Split search term into individual words
    const searchWords = term.trim().split(/\s+/).filter(word => word.length > 0);

    let highlightedText = text;

    // Highlight each word separately
    searchWords.forEach(word => {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedWord})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });

    return highlightedText;
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

    // Split search term into individual words for better matching
    const searchWords = term.trim().split(/\s+/).filter(word => word.length > 0);

    // Find all matches for all words
    let allMatches = [];

    searchWords.forEach(word => {
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

    // Sort matches by position in text
    allMatches.sort((a, b) => a.index - b.index);

    // If no matches, return a snippet from the beginning
    if (allMatches.length === 0) {
        return text.substring(0, contextLength * 2) + "...";
    }

    // Merge overlapping or close matches
    let mergedMatches = [];
    let currentMatch = allMatches[0];

    for (let i = 1; i < allMatches.length; i++) {
        const nextMatch = allMatches[i];

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

        // Highlight all search terms in the snippet
        result += highlightSearchTerm(snippet, term);

        if (end < text.length) {
            result += " ...";
        }

        lastEnd = end;
    });

    return result;
}