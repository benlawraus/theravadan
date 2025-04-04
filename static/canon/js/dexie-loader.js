// This script will be loaded as idb-loader-main.js in the Django template
// Requires dexie.js and progress-window.js to be loaded first

(async function() {
    // Wait for DOM to be fully loaded
    if (document.readyState !== 'complete') {
        await new Promise(resolve => {
            window.addEventListener('load', resolve);
        });
    }

    // Define database version - increment this when schema changes
    const dbVersion = 4;

    // Check if data has already been loaded for current version
    const loadedVersion = localStorage.getItem('buddhistTextsLoadedVersion');
    if (loadedVersion === dbVersion.toString()) {
        console.log(`Buddhist texts already loaded for version ${dbVersion}. Skipping data loading.`);
        // Dispatch event with zero counts since we're not loading anything
        dispatchLoadedEvent(0, 0, 0);
        return;
    }

    // Flag to determine if loading is needed
    const needsLoading = localStorage.getItem('buddhistTextsLoaded') !== 'true';

    console.log("Buddhist texts Dexie.js loader initializing...");

    // Check if Dexie is available
    if (typeof Dexie === 'undefined') {
        console.error("Error: Dexie library not loaded. Please make sure Dexie is loaded before this script.");
        return;
    }

    // Define root languages, translation languages, and text categories
    const rootLanguages = ["pli", "pra", "san", "lzh"];
    const translationLanguages = [
        "cs", "de", "en", "es", "fi", "fr", "gu", "hi", "id",
        "it", "jpn", "lo", "lt", "my", "pl", "ru", "sr", "th", "vi"
    ];
    const textCategories = ["sutta", "vinaya", "abhidhamma"];

    // Create arrays to track all possible files
    let allFiles = [];

    // Add root language files (X_Z.json)
    rootLanguages.forEach(rootLang => {
        textCategories.forEach(category => {
            // Skip abhidhamma for pra, san, and lzh as mentioned
            if (category === "abhidhamma" &&
                (rootLang === "pra" || rootLang === "san" || rootLang === "lzh")) {
                return;
            }

            allFiles.push({
                filename: `${rootLang}_${category}`,
                url: `/static/canon/json/${rootLang}_${category}.json`,
                isRoot: true,
                rootLang: rootLang,
                category: category
            });
        });
    });

    // Add translation files (X_Y_Z.json)
    rootLanguages.forEach(rootLang => {
        translationLanguages.forEach(transLang => {
            textCategories.forEach(category => {
                // Skip abhidhamma for pra, san, and lzh as mentioned
                if (category === "abhidhamma" &&
                    (rootLang === "pra" || rootLang === "san" || rootLang === "lzh")) {
                    return;
                }

                allFiles.push({
                    filename: `${rootLang}_${transLang}_${category}`,
                    url: `/static/canon/json/${rootLang}_${transLang}_${category}.json`,
                    isRoot: false,
                    rootLang: rootLang,
                    transLang: transLang,
                    category: category
                });
            });
        });
    });

    const totalFiles = allFiles.length;
    let currentFileIndex = 0;
    let successfulLoads = 0;
    let failedLoads = 0;

    try {
        // Get current language from the page if available
        const currentLanguage = lang_code;
        console.log("Current language:", currentLanguage);

        // Define Dexie database class
        class BuddhistTextsDatabase extends Dexie {
            constructor() {
                super('BuddhistTextsDB');
                this.version(dbVersion).stores(generateStoreSchema());
            }
        }

        // Generate store schema for Dexie
        function generateStoreSchema() {
            const schema = {};
            
            // Add root language stores
            rootLanguages.forEach(rootLang => {
                textCategories.forEach(category => {
                    // Skip abhidhamma for pra, san, and lzh
                    if (category === "abhidhamma" &&
                        (rootLang === "pra" || rootLang === "san" || rootLang === "lzh")) {
                        return;
                    }
                    
                    const storeName = `${rootLang}_${category}`;
                    // Define store with key as primary
                    schema[storeName] = '';  // Empty string means no index, just primary key
                });
            });
            
            // Add translation stores
            rootLanguages.forEach(rootLang => {
                translationLanguages.forEach(transLang => {
                    textCategories.forEach(category => {
                        // Skip abhidhamma for pra, san, and lzh
                        if (category === "abhidhamma" &&
                            (rootLang === "pra" || rootLang === "san" || rootLang === "lzh")) {
                            return;
                        }
                        
                        const storeName = `${rootLang}_${transLang}_${category}`;
                        // Define store with key as primary
                        schema[storeName] = '';  // Empty string means no index, just primary key
                    });
                });
            });
            
            return schema;
        }

        // Create and open the database
        const db = new BuddhistTextsDatabase();
        console.log("Dexie database opened successfully.");

        // If ProgressWindow is available and loading is needed, create it
        if (typeof ProgressWindow !== 'undefined' && needsLoading) {
            ProgressWindow.create(totalFiles);
            // Add a loading indicator to the body
            document.body.classList.add('loading-database');
        }

        await loadNextFile();

        // Function to check if data already exists in store
        async function storeHasData(storeName) {
            try {
                if (!db[storeName]) {
                    console.log(`Store ${storeName} doesn't exist.`);
                    return false;
                }

                const count = await db[storeName].count();
                return count > 0;
            } catch (error) {
                console.error(`Error checking if ${storeName} has data:`, error);
                return false;
            }
        }

        // Store data in IndexedDB with original structure
        async function storeData(fileInfo, data) {
            try {
                const storeName = fileInfo.filename;

                // Skip if table doesn't exist
                if (!db[storeName]) {
                    console.warn(`Table ${storeName} doesn't exist. Skipping.`);
                    currentFileIndex++;
                    updateProgress();
                    await loadNextFile();
                    return;
                }

                // Begin transaction
                await db.transaction('rw', db[storeName], async () => {
                    // Process each text path entry in the JSON
                    for (const textPath of Object.keys(data)) {
                        // Store with original structure: key = text path, value = data for that path
                        await db[storeName].put(data[textPath], textPath);
                    }
                });

                console.log(`Successfully stored data for ${storeName}`);
                successfulLoads++;

                currentFileIndex++;
                updateProgress();
                await loadNextFile();
            } catch (error) {
                console.error(`Error storing data for ${fileInfo.filename}:`, error);
                failedLoads++;
                currentFileIndex++;
                updateProgress();
                await loadNextFile();
            }
        }

        // Fetch JSON data
        async function fetchData(url) {
            try {
                const response = await fetch(url);

                // If file doesn't exist (404), just return null
                if (response.status === 404) {
                    return null;
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                return await response.json();
            } catch (error) {
                console.error(`Error fetching ${url}:`, error);
                return null;
            }
        }

        // Update progress window
        function updateProgress() {
            if (typeof ProgressWindow !== 'undefined') {
                ProgressWindow.update(currentFileIndex, totalFiles);
            }

            console.log(`Progress: ${currentFileIndex}/${totalFiles} (${successfulLoads} loaded, ${failedLoads} failed)`);
        }

        // Load the next file
        async function loadNextFile() {
            if (currentFileIndex >= totalFiles) {
                console.log("All files processed.");
                console.log(`Summary: ${successfulLoads} files loaded, ${failedLoads} files failed/missing`);

                if (typeof ProgressWindow !== 'undefined') {
                    ProgressWindow.close();
                }

                // Remove loading indicator
                document.body.classList.remove('loading-database');

                dispatchLoadedEvent();
                return;
            }

            const fileInfo = allFiles[currentFileIndex];
            const storeName = fileInfo.filename;

            // Check if this store already has data
            const hasData = await storeHasData(storeName);

            if (hasData) {
                console.log(`${storeName} already has data. Skipping.`);
                currentFileIndex++;
                updateProgress();
                await loadNextFile();
                return;
            }

            console.log(`Processing ${fileInfo.url}...`);

            // Try to fetch the data
            const data = await fetchData(fileInfo.url);

            if (data === null) {
                console.log(`File not found or error for ${fileInfo.url}. This may be expected for some combinations.`);
                currentFileIndex++;
                updateProgress();
                await loadNextFile();
            } else {
                await storeData(fileInfo, data);
            }
        }

    } catch (error) {
        console.error("Critical error setting up database:", error);

        // Remove loading indicator
        document.body.classList.remove('loading-database');

        if (typeof ProgressWindow !== 'undefined') {
            ProgressWindow.close();
        }
    }

    // Function to dispatch the 'buddhist-texts-loaded' event
    function dispatchLoadedEvent(successful = successfulLoads, failed = failedLoads, total = totalFiles) {
        // Set flags in localStorage to indicate that data has been loaded
        localStorage.setItem('buddhistTextsLoaded', 'true');
        localStorage.setItem('buddhistTextsLoadedVersion', dbVersion.toString());

        // Dispatch event when loading is complete - useful for other scripts that depend on this data
        const event = new CustomEvent('buddhist-texts-loaded', {
            detail: {
                successful: successful,
                failed: failed,
                total: total
            }
        });
        document.dispatchEvent(event);
    }

})();
