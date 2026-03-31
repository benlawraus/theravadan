// This script will be loaded as idb-loader-main.js in the Django template
// Requires dexie.js, dexie-shared.js, and progress-window.js to be loaded first

(async function() {
    // Wait for DOM to be fully loaded
    if (document.readyState !== 'complete') {
        await new Promise(resolve => {
            window.addEventListener('load', resolve);
        });
    }

    // Check if data has already been loaded for current version
    const loadedVersion = localStorage.getItem('buddhistTextsLoadedVersion');
    if (loadedVersion === DEXIE_DB_VERSION.toString()) {
        console.log(`Buddhist texts already loaded for version ${DEXIE_DB_VERSION}. Skipping data loading.`);
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

    // Determine base URL for JSON files
    let baseUrl = typeof json_data_root !== 'undefined' ? json_data_root : '/static/canon/json/';
    if (!baseUrl.endsWith('/')) baseUrl += '/';

    // Create arrays to track all possible files
    let allFiles = [];

    // Add root language files (X_Z.json)
    ROOT_LANGUAGES.forEach(rootLang => {
        TEXT_CATEGORIES.forEach(category => {
            if (!isValidCombination(rootLang, category)) return;

            allFiles.push({
                filename: `${rootLang}_${category}`,
                url: `${baseUrl}${rootLang}_${category}.json`,
                isRoot: true,
                rootLang: rootLang,
                category: category
            });
        });
    });

    // Add translation files (X_Y_Z.json)
    ROOT_LANGUAGES.forEach(rootLang => {
        TRANSLATION_LANGUAGES.forEach(transLang => {
            TEXT_CATEGORIES.forEach(category => {
                if (!isValidCombination(rootLang, category)) return;

                allFiles.push({
                    filename: `${rootLang}_${transLang}_${category}`,
                    url: `${baseUrl}${rootLang}_${transLang}_${category}.json`,
                    isRoot: false,
                    rootLang: rootLang,
                    transLang: transLang,
                    category: category
                });
            });
        });
    });

    const totalFiles = allFiles.length;
    let processedCount = 0;
    let successfulLoads = 0;
    let failedLoads = 0;

    // Number of concurrent fetches
    const CONCURRENCY = 4;

    try {
        // Get current language from the page if available
        const currentLanguage = lang_code;
        console.log("Current language:", currentLanguage);

        // Use the shared database instance
        const db = getSharedDatabase();
        console.log("Dexie database opened successfully.");

        // If ProgressWindow is available and loading is needed, create it
        if (typeof ProgressWindow !== 'undefined' && needsLoading) {
            ProgressWindow.create(totalFiles);
            document.body.classList.add('loading-database');
        }

        // Check if data already exists in store
        async function storeHasData(storeName) {
            try {
                if (!db[storeName]) return false;
                const count = await db[storeName].count();
                return count > 0;
            } catch (error) {
                console.error(`Error checking if ${storeName} has data:`, error);
                return false;
            }
        }

        // Add normalized_verse to each verse object for faster searching later
        function addNormalizedVerses(data, isRoot) {
            for (const textPath of Object.keys(data)) {
                const record = data[textPath];
                if (isRoot && record.root) {
                    for (const verseIndex in record.root) {
                        const verseObj = record.root[verseIndex];
                        if (verseObj && verseObj.verse && typeof verseObj.verse === 'string') {
                            verseObj.normalized_verse = normalizeText(verseObj.verse);
                        }
                    }
                }
                if (record.texts) {
                    for (const author in record.texts) {
                        const translation = record.texts[author];
                        for (const verseIndex in translation) {
                            const verseObj = translation[verseIndex];
                            if (verseObj && verseObj.verse && typeof verseObj.verse === 'string') {
                                verseObj.normalized_verse = normalizeText(verseObj.verse);
                            }
                        }
                    }
                }
            }
        }

        // Store data in IndexedDB with normalized verses
        async function storeData(fileInfo, data) {
            try {
                const storeName = fileInfo.filename;

                if (!db[storeName]) {
                    console.warn(`Table ${storeName} doesn't exist. Skipping.`);
                    return;
                }

                // Add normalized verses at load time
                addNormalizedVerses(data, fileInfo.isRoot);

                await db.transaction('rw', db[storeName], async () => {
                    for (const textPath of Object.keys(data)) {
                        await db[storeName].put(data[textPath], textPath);
                    }
                });

                console.log(`Successfully stored data for ${storeName}`);
                successfulLoads++;
            } catch (error) {
                console.error(`Error storing data for ${fileInfo.filename}:`, error);
                failedLoads++;
            }
        }

        // Fetch JSON data
        async function fetchData(url) {
            try {
                const response = await fetch(url);
                if (response.status === 404) return null;
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error(`Error fetching ${url}:`, error);
                return null;
            }
        }

        // Update progress window
        function updateProgress() {
            if (typeof ProgressWindow !== 'undefined') {
                ProgressWindow.update(processedCount, totalFiles);
            }
            console.log(`Progress: ${processedCount}/${totalFiles} (${successfulLoads} loaded, ${failedLoads} failed)`);
        }

        // Process a single file
        async function processFile(fileInfo) {
            const storeName = fileInfo.filename;

            const hasData = await storeHasData(storeName);
            if (hasData) {
                console.log(`${storeName} already has data. Skipping.`);
                processedCount++;
                updateProgress();
                return;
            }

            console.log(`Processing ${fileInfo.url}...`);
            const data = await fetchData(fileInfo.url);

            if (data === null) {
                console.log(`File not found or error for ${fileInfo.url}. This may be expected for some combinations.`);
            } else {
                await storeData(fileInfo, data);
            }

            processedCount++;
            updateProgress();
        }

        // Process all files with limited concurrency
        async function processAllFiles() {
            let index = 0;

            async function next() {
                while (index < allFiles.length) {
                    const fileInfo = allFiles[index++];
                    await processFile(fileInfo);
                }
            }

            // Launch CONCURRENCY workers
            const workers = [];
            for (let i = 0; i < Math.min(CONCURRENCY, allFiles.length); i++) {
                workers.push(next());
            }
            await Promise.all(workers);
        }

        await processAllFiles();

        console.log("All files processed.");
        console.log(`Summary: ${successfulLoads} files loaded, ${failedLoads} files failed/missing`);

        if (typeof ProgressWindow !== 'undefined') {
            ProgressWindow.close();
        }

        document.body.classList.remove('loading-database');
        dispatchLoadedEvent();

    } catch (error) {
        console.error("Critical error setting up database:", error);
        document.body.classList.remove('loading-database');

        if (typeof ProgressWindow !== 'undefined') {
            ProgressWindow.close();
        }
    }

    // Function to dispatch the 'buddhist-texts-loaded' event
    function dispatchLoadedEvent(successful = successfulLoads, failed = failedLoads, total = totalFiles) {
        localStorage.setItem('buddhistTextsLoaded', 'true');
        localStorage.setItem('buddhistTextsLoadedVersion', DEXIE_DB_VERSION.toString());

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