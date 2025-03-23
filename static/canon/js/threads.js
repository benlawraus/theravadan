// This script requires idb to be loaded before it runs
// Include this script tag first:
// <script src="https://cdn.jsdelivr.net/npm/idb@7.1.1/build/umd.js"></script>

(async function() {
    // Get openDB from global idb object
    const { openDB } = idb;

    // Helper: retrieve a language file from IndexedDB using IDB
    async function getLanguageData(lang, suttaRef) {
        try {
            // Open the database
            const db = await openDB('LanguageFilesDB', 3);

            // Get the record from the store
            const record = await db.get(lang, suttaRef);

            // Return the data
            return record;
        } catch (error) {
            console.error(`Error retrieving data for ${lang}/${suttaRef}:`, error);
            return null;
        }
    }

    // Split the URL path into non-empty segments.
    const pathParts = window.location.pathname.split('/').filter(function(part) {
        return part.length > 0;
    });

    if (pathParts.length < 2) {
        console.error("Not enough URL segments to determine lang_code and root_lang.");
        return;
    }

    // lang_code is the first segment; root_lang is the second.
    const lang_code = pathParts[0];
    const root_lang = pathParts[1];

    // htmlfilename is the whole part of the URL excluding the first segment.
    // It will include the root_lang and all subsequent segments.
    const htmlfilename = pathParts.slice(1).join('/');
    if (!htmlfilename) {
        console.error("htmlfilename is not defined.");
        return;
    }

    console.log("URL Info:", {
        lang_code,
        root_lang,
        htmlfilename
    });

    // Define all root languages
    const rootLanguages = ['pli', 'san', 'pra', 'lzh'];

    // Check if display language is one of the root languages and matches the root language
    const sameLanguage = lang_code === root_lang && rootLanguages.includes(lang_code);
    console.log(`Same language: ${sameLanguage} (${lang_code} === ${root_lang})`);

    // Check if we're viewing a root language text in another root language
    // In this case, we want to display both since they're different root languages
    const differentRootLanguages = lang_code !== root_lang && rootLanguages.includes(lang_code) && rootLanguages.includes(root_lang);
    console.log(`Different root languages: ${differentRootLanguages} (${lang_code} ≠ ${root_lang})`);

    // Retrieve the root data and translation data from IndexedDB.
    let rootData, transData;
    try {
        rootData = await getLanguageData(root_lang, htmlfilename);
        if (!rootData) {
            console.error("No root data found for htmlfilename:", htmlfilename);
            return;
        }

        console.log("Root Data Structure:", rootData);

        // Only get translation data if the languages are different
        if (!sameLanguage) {
            // transData might be null if a translation is not available.
            transData = await getLanguageData(lang_code, htmlfilename);
            console.log("Translation Data Structure:", transData);
        }
    } catch (error) {
        console.error("Error retrieving language data:", error);
        return;
    }

    // Find the container element where threads will be displayed.
    const container = document.getElementById("container");
    if (!container) {
        console.error("No container element with id 'container' found.");
        return;
    }

    // Validate that the thread_list exists and is an array.
    if (!Array.isArray(rootData.thread_list)) {
        console.error("Invalid thread_list format:", rootData.thread_list);
        return;
    }

    // Iterate through each thread in the root data.
    rootData.thread_list.forEach(function(threadItem, index) {
        // Skip empty thread items or items that are not objects
        if (!threadItem) {
            return;
        }

        console.log(`Thread item ${index}:`, threadItem);

        // Handle different possible structures of the thread item
        let thread_root;
        let authorName = "";

        if (typeof threadItem === 'object') {
            // Case 1: Already has verseindex and verse directly (flat structure)
            if (threadItem.verseindex && threadItem.verse) {
                thread_root = threadItem;
            }
            // Case 2: Has author as key (nested structure)
            else {
                for (const author in threadItem) {
                    if (threadItem[author] && typeof threadItem[author] === 'object' &&
                        threadItem[author].verseindex && threadItem[author].verse) {
                        thread_root = threadItem[author];
                        authorName = author;
                        break;
                    }
                }
            }
        }

        // Skip if we couldn't find a valid thread
        if (!thread_root || !thread_root.verseindex || !thread_root.verse) {
            console.log(`Couldn't extract valid thread data for item ${index}`);
            return;
        }

        console.log(`Processing thread ${index}, verseindex: ${thread_root.verseindex}`);

        // Create paragraph element
        const p = document.createElement("p");
        p.id = thread_root.verseindex;

        // Create a span element for the root verse.
        const spanRoot = document.createElement("span");
        if (rootData.title_verseindex && thread_root.verseindex === rootData.title_verseindex) {
            spanRoot.className = "root big-bold";
        } else {
            spanRoot.className = "root";
        }
        spanRoot.textContent = thread_root.verse;
        p.appendChild(spanRoot);

        // Only add a line break if we're going to add translations
        if (!sameLanguage && transData && Array.isArray(transData.thread_list) && index < transData.thread_list.length) {
            p.appendChild(document.createElement("br"));
        }

        // Add translation threads if available and languages are different
        if (!sameLanguage && transData && Array.isArray(transData.thread_list) && index < transData.thread_list.length) {
            const transThread = transData.thread_list[index];
            console.log(`Translation thread ${index}:`, transThread);

            // Handle different possible structures for translation thread
            if (transThread) {
                // Case 1: Direct verse object
                if (transThread.verseindex && transThread.verse) {
                    if (transThread.verseindex === thread_root.verseindex &&
                        transThread.verse && transThread.verse.trim().length > 0) {
                        const spanTrans = document.createElement("span");
                        spanTrans.className = "translator"; // Default class if no author
                        spanTrans.textContent = transThread.verse;
                        p.appendChild(spanTrans);
                        p.appendChild(document.createElement("br"));
                    }
                }
                // Case 2: Author keyed object
                else {
                    for (const author in transThread) {
                        if (transThread.hasOwnProperty(author) &&
                            typeof transThread[author] === 'object') {
                            const thread = transThread[author];

                            // Check that the translation thread's verseindex matches the root thread's verseindex.
                            if (thread.verseindex !== thread_root.verseindex) {
                                continue;
                            }

                            // Only add the translation if the verse text exists.
                            if (thread.verse && thread.verse.trim().length > 0) {
                                const spanTrans = document.createElement("span");
                                spanTrans.className = author;
                                spanTrans.textContent = thread.verse;
                                p.appendChild(spanTrans);
                                p.appendChild(document.createElement("br"));
                            }
                        }
                    }
                }
            }
        }

        // Append the created paragraph to the container.
        container.appendChild(p);
    });

    console.log("Rendering complete");
})();

// After rendering all threads...
if (window.location.hash) {
    // Remove the '#' from the hash.
    const targetId = window.location.hash.substring(1);
    // Use a timeout to ensure the DOM has updated.
    setTimeout(() => {
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            console.error("Target element not found for hash:", targetId);
        }
    }, 100); // Adjust delay if necessary.
}