// This script requires idb to be loaded before it runs
// Include these script tags first:
// <script src="https://cdn.jsdelivr.net/npm/idb@7.1.1/build/umd.js"></script>
// <script src="progress-window.js"></script>

(async function() {
    // Get openDB from global idb object
    const { openDB } = idb;

    // Define root languages and translation languages
    const rootLanguages = ["pli", "pra", "san", "lzh"];
    const translationLanguages = [
        "cs", "de", "en", "es", "fi", "fr", "gu", "hi", "id",
        "it", "jpn", "lo", "lt", "my", "pl", "ru", "sr", "th", "vi"
    ];

    // Create the full list of files to process
    const languageFiles = [
        // Root language files
        ...rootLanguages.map(lang => ({
            lang: lang,
            url: `/static/canon/json/${lang}.json`,
            isRoot: true
        })),

        // Translation files for each root language
        ...rootLanguages.flatMap(rootLang =>
            translationLanguages.map(transLang => ({
                lang: `${rootLang}_${transLang}`,
                url: `/static/canon/json/${rootLang}_${transLang}.json`,
                isRoot: false,
                rootLang: rootLang,
                transLang: transLang
            }))
        )
    ];

    const totalFiles = languageFiles.length;
    let currentFileIndex = 0;

    try {
        // Open the database using IDB
        const db = await openDB('LanguageFilesDB', 5, {  // Increased version number
            upgrade(db, oldVersion, newVersion, transaction) {
                console.log("Upgrading IndexedDB...");

                // Create object stores for root languages
                rootLanguages.forEach(lang => {
                    if (!db.objectStoreNames.contains(lang)) {
                        db.createObjectStore(lang, { keyPath: "path" });
                        console.log("Created root object store:", lang);
                    }
                });

                // Create object stores for each translation language
                languageFiles.filter(file => !file.isRoot).forEach(file => {
                    const storeName = file.lang;
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: "path" });
                        console.log("Created translation object store:", storeName);
                    }
                });
            }
        });

        console.log("IndexedDB opened successfully.");
        ProgressWindow.create(totalFiles);
        await loadNextLanguageFile();

        // Function to check if a language file already has data
        async function languageFileExists(storeName) {
            try {
                const count = await db.count(storeName);
                return count > 0;
            } catch (error) {
                console.error(`Error checking if ${storeName} exists:`, error);
                return false;
            }
        }

        // Store language data
        async function storeLanguageData(fileInfo, data) {
            try {
                const storeName = fileInfo.lang;
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);

                // Process each path in the data
                for (const path of Object.keys(data)) {
                    await store.put({
                        path: path,
                        ...data[path]  // Store all properties from the JSON
                    });
                }

                await tx.done;
                console.log(`All records for ${storeName} stored.`);

                // Free memory
                if (window.all_text && window.all_text[storeName]) {
                    delete window.all_text[storeName];
                    console.log(`Removed ${storeName} data from window.all_text.`);
                }

                currentFileIndex++;
                ProgressWindow.update(currentFileIndex, totalFiles);
                await loadNextLanguageFile();
            } catch (error) {
                console.error(`Transaction error for ${fileInfo.lang}:`, error);
                currentFileIndex++;
                ProgressWindow.update(currentFileIndex, totalFiles);
                await loadNextLanguageFile();
            }
        }

        // Load language JSON via fetch
        async function fetchLanguageData(url) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.error(`Error fetching ${url}:`, error);
                return null;
            }
        }

        // Load the next language file
        async function loadNextLanguageFile() {
            if (currentFileIndex >= totalFiles) {
                console.log("All language files processed.");
                ProgressWindow.close();
                return;
            }

            const fileInfo = languageFiles[currentFileIndex];
            const storeName = fileInfo.lang;

            // Check if language data already exists
            const exists = await languageFileExists(storeName);

            if (exists) {
                console.log(`Language data for ${storeName} already exists in IndexedDB. Skipping load.`);
                currentFileIndex++;
                ProgressWindow.update(currentFileIndex, totalFiles);
                await loadNextLanguageFile();
            } else {
                console.log(`Loading language file for ${storeName} from ${fileInfo.url}...`);

                // Try to get data from window.all_text first (if available)
                if (window.all_text && window.all_text[storeName]) {
                    await storeLanguageData(fileInfo, window.all_text[storeName]);
                } else {
                    // Otherwise fetch the JSON directly
                    const data = await fetchLanguageData(fileInfo.url);
                    if (data) {
                        await storeLanguageData(fileInfo, data);
                    } else {
                        console.error(`Failed to load data for ${storeName}.`);
                        currentFileIndex++;
                        ProgressWindow.update(currentFileIndex, totalFiles);
                        await loadNextLanguageFile();
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error setting up database:", error);
        ProgressWindow.close();
    }
})();
