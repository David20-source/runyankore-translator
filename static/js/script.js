// Global variables
let translationHistory = [];
let currentTranslation = null;
let statisticsLoaded = false; // ADD THIS to prevent multiple loads
let britishVoice = null; // Cache for British voice

// ========== AUTOCOMPLETE VARIABLES ==========
let autocompleteTimeout = null;
let lastSearchQuery = '';

// Auto-expand textareas based on content
function autoExpand(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 300);
    textarea.style.height = newHeight + 'px';
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
     // ========== CLEAR OLD CACHE (ADD THIS) ==========
    localStorage.removeItem('runyankore_cached_stats');
    console.log('🗑️ Cleared old cached statistics');
    // ================================================
    // IMMEDIATELY hide counters to prevent flash
    const dictElement = document.getElementById('dictionaryCount');
    const phraseElement = document.getElementById('phraseCount');
    
    if (dictElement) dictElement.style.opacity = '0';
    if (phraseElement) phraseElement.style.opacity = '0';

      updateHeaderVersion();
    
    // Initialize textareas with auto-expand and character counters
    const runyankoreInput = document.getElementById('runyankoreInput');
    const englishInput = document.getElementById('englishInput');

    if (runyankoreInput) {
        runyankoreInput.addEventListener('input', function() {
            autoExpand(this);
            document.getElementById('runyankoreCharCount').textContent = this.value.length;
        });
        
        if (runyankoreInput.value.trim()) {
            autoExpand(runyankoreInput);
        }
        document.getElementById('runyankoreCharCount').textContent = runyankoreInput.value.length;
    }

    if (englishInput) {
        englishInput.addEventListener('input', function() {
            autoExpand(this);
            document.getElementById('englishCharCount').textContent = this.value.length;
        });
        
        if (englishInput.value.trim()) {
            autoExpand(englishInput);
        }
        document.getElementById('englishCharCount').textContent = englishInput.value.length;
    }
    
    // Set up translation buttons
    const translateToEnglishBtn = document.getElementById('translateToEnglishBtn');
    const translateToRunyankoreBtn = document.getElementById('translateToRunyankoreBtn');
    
    if (translateToEnglishBtn) {
        translateToEnglishBtn.addEventListener('click', translateToEnglish);
    }
    
    if (translateToRunyankoreBtn) {
        translateToRunyankoreBtn.addEventListener('click', translateToRunyankore);
    }
    
    // Set up dictionary search
    const dictionarySearchInput = document.getElementById('dictionarySearch');
    if (dictionarySearchInput) {
        dictionarySearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchDictionary();
            }
        });
    }
    
    // Initialize autocomplete
    initAutocomplete();
    
    // Initialize speech synthesis and load British voice
    initializeSpeech();
    
    // Set up network status monitoring
    setupNetworkMonitoring();
    
    // Load statistics - ONLY ONCE
    loadStatistics();
    
    // ✅ ADD THESE NETWORK LISTENERS HERE
    window.addEventListener('online', function() {
        console.log('🌐 Back online - refreshing statistics');
        loadStatistics(true); // Force refresh when coming back online
        showNotification('Back online - refreshing statistics', 'success');
    });

    window.addEventListener('offline', function() {
        console.log('📴 Offline - using cached statistics');
        showNotification('Now in offline mode', 'info');
    });
    
    // Load history from localStorage
    try {
        const savedHistory = localStorage.getItem('runyankore_history');
        if (savedHistory) {
            translationHistory = JSON.parse(savedHistory);
        }
    } catch (e) {
        translationHistory = [];
    }
    
    // Setup translation confirmation checkbox
    setupTranslationConfirmation();
    
    // Start PWA features
    startKeepAlive();
    setTimeout(() => {
        requestWakeLock();
    }, 1000);

    // Handle visibility change
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        setTimeout(() => {
            if (window.OfflineDictionary && !window.OfflineDictionary.loaded) {
                window.OfflineDictionary.initialize().catch(console.error);
            }
            setupNetworkIndicator();
            // Don't reload statistics on visibility change
            if (!navigator.onLine) {
                showNotification('App resumed in offline mode', 'info');
            }
            restoreAppState();
            requestWakeLock();
        }, 500);
    } else {
        saveAppState();
    }
});

// Fix modal labels
fixModalLabels();

}); // ← This closes DOMContentLoaded

// Initialize speech synthesis and cache British voice
function initializeSpeech() {
    // Load voices and cache the British one
    function loadVoices() {
        const voices = window.speechSynthesis.getVoices();
        
        // Cache British voice for later use
        britishVoice = voices.find(voice => 
            voice.lang.includes('en-GB') ||
            voice.name.includes('British') ||
            voice.name.includes('Daniel') ||
            voice.name.includes('Serena') ||
            voice.name.includes('Kate') ||
            voice.name.includes('Google UK') ||
            voice.name.includes('Microsoft George') ||
            voice.name.includes('Microsoft Hazel') ||
            voice.name.includes('Microsoft Susan')
        );
        
        if (britishVoice) {
            console.log('🇬🇧 British voice loaded:', britishVoice.name);
        } else {
            console.log('⚠️ No British voice found, will use fallback');
        }
    }
    
    // Load voices immediately if available
    if (window.speechSynthesis.getVoices().length > 0) {
        loadVoices();
    }
    
    // Also load when voices change
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

// Network monitoring for offline/online detection
function setupNetworkMonitoring() {
    function updateNetworkStatus() {
        const isOnline = navigator.onLine;
        const offlineIndicator = document.getElementById('offlineStatus');
        
        if (offlineIndicator) {
            if (isOnline) {
                offlineIndicator.classList.remove('show');
            } else {
                offlineIndicator.classList.add('show');
            }
        }
    }
    
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
}

// Unified translation function with offline fallback
async function translateWithOfflineFallback(text, fromRunyankore) {
    if (window.OfflineDictionary && window.OfflineDictionary.loaded) {
        const offlineResult = await window.OfflineDictionary.exactMatch(text, fromRunyankore);
        if (offlineResult) {
            return {
                success: true,
                translation: offlineResult.translation,
                confidence: 1.0,
                source: 'offline',
                direction: fromRunyankore ? 'runyankore_to_english' : 'english_to_runyankore',
                original: text,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    if (navigator.onLine) {
        try {
            const endpoint = fromRunyankore ? '/api/translate/rny-to-eng' : '/api/translate/eng-to-rny';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });
            
            if (response.ok) {
                const data = await response.json();
                return { 
                    ...data, 
                    source: 'online',
                    direction: fromRunyankore ? 'runyankore_to_english' : 'english_to_runyankore',
                    original: text
                };
            } else {
                return {
                    success: false,
                    message: 'Translation not found. Try a different word or check spelling.',
                    source: 'online_error'
                };
            }
        } catch (onlineError) {
            return {
                success: false,
                message: 'Network error. Please check your connection.',
                source: 'network_error'
            };
        }
    }
    
    return {
        success: false,
        message: window.OfflineDictionary && window.OfflineDictionary.loaded 
            ? 'Translation not found in offline dictionary. Connect to internet for Smart Match.'
            : 'You are offline and dictionary is not loaded. Please connect to internet.',
        source: 'none'
    };
}

// Main translation functions
async function translateToEnglish() {
    const input = document.getElementById('runyankoreInput');
    const text = input.value.trim();
    
    if (!text) {
        showNotification('Please enter Runyankore text to translate', 'error');
        return;
    }
    
    const resultDiv = document.getElementById('translationResult');
    resultDiv.innerHTML = '<div class="spinner"></div><p>Translating...</p>';
    document.getElementById('confidenceScore').textContent = '..';
    
    try {
        const result = await translateWithOfflineFallback(text, true);
        
        if (result.success) {
            const badge = result.source === 'offline' 
                ? '<span title="Offline translation" style="margin-left: 10px; font-size: 14px; color: #4f46e5;">📱</span>'
                : '<span title="Smart Match" style="margin-left: 10px; font-size: 14px; color: #10b981;">🌐</span>';
            
            resultDiv.innerHTML = `<div class="translation-text">${result.translation} ${badge}</div>`;
            
            const confidencePercent = Math.round((result.confidence || 0.5) * 100);
            document.getElementById('confidenceScore').textContent = confidencePercent;
            
            currentTranslation = result;
            showWordDetails(result);
            
            setTimeout(() => {
                saveTranslationToLocalStorage(result);
            }, 100);
            
            showNotification(
                result.source === 'offline' 
                    ? 'Translated using offline dictionary!' 
                    : 'Translated using Smart Match!',
                'success'
            );
        } else {
            resultDiv.innerHTML = `<div class="error-message">${result.message}</div>`;
            showNotification(result.message, 'error');
        }
    } catch (error) {
        resultDiv.innerHTML = '<div class="error-message">Translation failed unexpectedly</div>';
        showNotification('Translation failed', 'error');
    }
}

async function translateToRunyankore() {
    const input = document.getElementById('englishInput');
    const text = input.value.trim();
    
    if (!text) {
        showNotification('Please enter English text to translate', 'error');
        return;
    }
    
    const resultDiv = document.getElementById('translationResult');
    resultDiv.innerHTML = '<div class="spinner"></div><p>Translating...</p>';
    document.getElementById('confidenceScore').textContent = '..';
    
    try {
        const result = await translateWithOfflineFallback(text, false);
        
        if (result.success) {
            const badge = result.source === 'offline' 
                ? '<span title="Offline translation" style="margin-left: 10px; font-size: 14px; color: #4f46e5;">📱</span>'
                : '<span title="Smart Match" style="margin-left: 10px; font-size: 14px; color: #10b981;">🌐</span>';
            
            resultDiv.innerHTML = `<div class="translation-text">${result.translation} ${badge}</div>`;
            
            const confidencePercent = Math.round((result.confidence || 0.5) * 100);
            document.getElementById('confidenceScore').textContent = confidencePercent;
            
            currentTranslation = result;
            showWordDetails(result);
            
            setTimeout(() => {
                saveTranslationToLocalStorage(result);
            }, 100);
            
            showNotification(
                result.source === 'offline' 
                    ? 'Translated using offline dictionary!' 
                    : 'Translated using Smart Match!',
                'success'
            );
        } else {
            resultDiv.innerHTML = `<div class="error-message">${result.message}</div>`;
            showNotification(result.message, 'error');
        }
    } catch (error) {
        resultDiv.innerHTML = '<div class="error-message">Translation failed unexpectedly</div>';
        showNotification('Translation failed', 'error');
    }
}

function showWordDetails(translationData) {
    const wordDetailsDiv = document.getElementById('wordDetails');
    
    const sourceText = translationData.source === 'offline' 
        ? '<span style="background: #4f46e5; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">📱 Offline</span>' 
        : '<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">🌐 Smart Match</span>';
    
    wordDetailsDiv.innerHTML = `
        <div class="word-info">
            <p><strong>Original:</strong> ${translationData.original || 'N/A'}</p>
            <p><strong>Translated:</strong> ${translationData.translation || 'N/A'}</p>
            <p><strong>Confidence:</strong> ${Math.round((translationData.confidence || 0) * 100)}%</p>
            <p><strong>Direction:</strong> ${(translationData.direction || '').replace(/_/g, ' ')}</p>
            <p><strong>Source:</strong> ${sourceText}</p>
            <p><strong>Time:</strong> ${new Date(translationData.timestamp || Date.now()).toLocaleTimeString()}</p>
        </div>
    `;
}

// ========== IMPROVED AUTOCOMPLETE HANDLING ==========

function initAutocomplete() {
    const searchInput = document.getElementById('dictionarySearch');
    const searchBox = document.querySelector('.search-box');
    const autocompleteDiv = document.getElementById('autocompleteResults');
    
    if (!searchInput) return;
    
    // Input event handler
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        
        if (query.length >= 2) {
            // Add active class to search box
            if (searchBox) {
                searchBox.classList.add('active-autocomplete');
            }
            
            // Show loading indicator
            if (autocompleteDiv) {
                autocompleteDiv.innerHTML = '<div class="autocomplete-item" style="justify-content: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
                autocompleteDiv.classList.add('show');
            }
            
            // Debounce the search
            clearTimeout(window.autocompleteTimeout);
            window.autocompleteTimeout = setTimeout(() => {
                fetchAutocompleteSuggestions(query);
            }, 300);
        } else {
            // Hide autocomplete if query is too short
            hideAutocomplete();
        }
    });
    
    // Focus event handler
    searchInput.addEventListener('focus', function() {
        const query = this.value.trim();
        if (query.length >= 2) {
            if (searchBox) {
                searchBox.classList.add('active-autocomplete');
            }
            if (autocompleteDiv) {
                autocompleteDiv.classList.add('show');
            }
        }
    });
    
    // Blur event handler with delay
    searchInput.addEventListener('blur', function() {
        // Small delay to allow clicking on autocomplete items
        setTimeout(() => {
            const autocompleteDiv = document.getElementById('autocompleteResults');
            if (autocompleteDiv && !autocompleteDiv.matches(':hover')) {
                hideAutocomplete();
            }
        }, 200);
    });
    
    // Click outside to close
    document.addEventListener('click', function(e) {
        const searchInput = document.getElementById('dictionarySearch');
        const autocompleteDiv = document.getElementById('autocompleteResults');
        const searchBox = document.querySelector('.search-box');
        
        if (!searchInput.contains(e.target) && 
            !autocompleteDiv.contains(e.target) && 
            !e.target.closest('.search-box button')) {
            hideAutocomplete();
        }
    });
    
    // Escape key to close
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideAutocomplete();
        }
    });
}

function hideAutocomplete() {
    const autocompleteDiv = document.getElementById('autocompleteResults');
    const searchBox = document.querySelector('.search-box');
    
    if (autocompleteDiv) {
        autocompleteDiv.classList.remove('show');
        setTimeout(() => {
            autocompleteDiv.innerHTML = '';
        }, 300);
    }
    
    if (searchBox) {
        searchBox.classList.remove('active-autocomplete');
    }
}

function handleAutocompleteSelection(runyankore, english) {
    const searchInput = document.getElementById('dictionarySearch');
    const searchBox = document.querySelector('.search-box');
    
    // Use Runyankore if available, otherwise English
    const selectedWord = runyankore || english;
    
    if (selectedWord && searchInput) {
        searchInput.value = selectedWord;
        searchInput.focus();
        
        // Hide autocomplete immediately
        hideAutocomplete();
        
        // Clear any existing dictionary results
        const dictionaryResults = document.getElementById('dictionaryResults');
        if (dictionaryResults) {
            dictionaryResults.innerHTML = '<div class="spinner"></div><p>Searching...</p>';
        }
        
        // Perform search after a short delay
        setTimeout(() => {
            searchDictionary();
        }, 50);
    }
}

async function searchDictionary() {
    // Hide autocomplete when searching
    hideAutocomplete();
    
    const searchInput = document.getElementById('dictionarySearch');
    const query = searchInput.value.trim();
    
    if (!query) {
        showNotification('Please enter a search query', 'error');
        return;
    }
    
    const resultsDiv = document.getElementById('dictionaryResults');
    resultsDiv.innerHTML = '<div class="spinner"></div><p>Searching...</p>';
    
    try {
        let results = [];
        let searchSource = 'offline';
        
        if (window.OfflineDictionary && window.OfflineDictionary.loaded) {
            results = await window.OfflineDictionary.search(query, 'both', 20);
            if (results.length > 0) {
                searchSource = 'offline';
            }
        }
        
        if (results.length === 0 && navigator.onLine) {
            try {
                const response = await fetch('/api/dictionary/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ query: query })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.results && data.results.length > 0) {
                        results = data.results;
                        searchSource = 'online';
                    }
                }
            } catch (onlineError) {}
        }
        
        if (results.length > 0) {
            let html = `<div class="search-source" style="margin-bottom: 10px; padding: 5px; background: #f3f4f6; border-radius: 5px; font-size: 14px;">
                <i class="fas fa-${searchSource === 'offline' ? 'mobile-alt' : 'wifi'}"></i>
                Search results from ${searchSource === 'offline' ? 'offline dictionary' : 'online database'}
            </div>`;
            
            html += '<div class="dictionary-results-list">';
            
            results.forEach((result) => {
                const isOffline = searchSource === 'offline';
                html += `
                    <div class="dictionary-item" style="margin-bottom: 10px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <div class="dictionary-item-header" style="display: flex; align-items: center; margin-bottom: 5px;">
                            <span class="runyankore-word" style="font-weight: 600; color: #4f46e5;">${result.runyankore || 'N/A'}</span>
                            <span class="arrow" style="margin: 0 10px; color: #6b7280;">→</span>
                            <span class="english-word" style="font-weight: 600; color: #059669;">${result.english || 'N/A'}</span>
                            ${isOffline ? '<span style="margin-left: 10px; font-size: 12px; color: #4f46e5;">📱</span>' : ''}
                        </div>
                        <div class="dictionary-item-footer" style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280;">
                            <span class="category">${result.category || 'general'}</span>
                            ${result.confidence ? `<span class="confidence">${Math.round(result.confidence * 100)}% match</span>` : ''}
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            resultsDiv.innerHTML = html;
            showNotification(`Found ${results.length} result(s)`, 'success');
        } else {
            let message = 'No results found';
            let hint = '';
            
            if (!navigator.onLine) {
                message = 'No matches found in offline dictionary';
                hint = '<p class="hint" style="font-size: 12px; color: #6b7280; margin-top: 5px;">Connect to internet for more results</p>';
            } else if (window.OfflineDictionary && !window.OfflineDictionary.loaded) {
                message = 'Offline dictionary not loaded';
                hint = '<p class="hint" style="font-size: 12px; color: #6b7280; margin-top: 5px;">Please wait for dictionary to load</p>';
            }
            
            resultsDiv.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 20px;">
                    <i class="fas fa-search" style="font-size: 48px; color: #9ca3af; margin-bottom: 10px;"></i>
                    <p style="color: #6b7280;">${message}</p>
                    ${hint}
                </div>
            `;
            showNotification(message, 'info');
        }
    } catch (error) {
        let errorMessage = 'Search failed. Please try again.';
        if (!navigator.onLine) {
            errorMessage = 'You are offline. Using local dictionary.';
        }
        resultsDiv.innerHTML = `<div class="error-message">${errorMessage}</div>`;
        showNotification(errorMessage, 'error');
    }
}

// ========== AUTOCOMPLETE HELPER FUNCTIONS ==========

async function fetchAutocompleteSuggestions(query) {
    const autocompleteDiv = document.getElementById('autocompleteResults');
    if (!autocompleteDiv) return;
    
    try {
        let suggestions = [];
        
        // Try offline dictionary
        if (window.OfflineDictionary && window.OfflineDictionary.loaded) {
            suggestions = await window.OfflineDictionary.search(query, 'both', 10);
        }
        
        // Try online if available
        if (suggestions.length === 0 && navigator.onLine) {
            try {
                const response = await fetch('/api/dictionary/autocomplete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: query, limit: 10 })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        suggestions = data.results || [];
                    }
                }
            } catch (error) {
                console.log('Server autocomplete error:', error);
            }
        }
        
        if (suggestions.length > 0) {
            displayAutocompleteSuggestions(query, suggestions);
        } else {
            autocompleteDiv.innerHTML = '<div class="autocomplete-item" style="justify-content: center; color: #6b7280;"><i class="fas fa-search"></i> No matches found</div>';
        }
    } catch (error) {
        console.log('Autocomplete error:', error);
        autocompleteDiv.innerHTML = '<div class="autocomplete-item" style="justify-content: center; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Error loading suggestions</div>';
    }
}

function displayAutocompleteSuggestions(query, suggestions) {
    const autocompleteDiv = document.getElementById('autocompleteResults');
    if (!autocompleteDiv) return;
    
    let html = '';
    
    suggestions.forEach((suggestion, index) => {
        const runyankore = suggestion.runyankore || '';
        const english = suggestion.english || '';
        const type = suggestion.type || suggestion.category || 'word';
        
        // Remove any quotes that could break HTML
        const safeRunyankore = runyankore.replace(/['"`]/g, '');
        const safeEnglish = english.replace(/['"`]/g, '');
        
        // Highlight matches
        const highlightedRunyankore = highlightMatch(runyankore, query);
        const highlightedEnglish = highlightMatch(english, query);
        
        // Generate unique ID for this suggestion
        const suggestionId = `suggestion-${Date.now()}-${index}`;
        
        html += `
            <div class="autocomplete-item" 
                 id="${suggestionId}"
                 onclick="handleAutocompleteSelection('${safeRunyankore}', '${safeEnglish}')">
                <i class="fas fa-${getTypeIcon(type)}" style="color: #4f46e5; flex-shrink: 0;"></i>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${highlightedRunyankore}
                    </div>
                    <div style="font-size: 0.9rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${highlightedEnglish}
                    </div>
                </div>
                <div style="margin-left: 8px; color: #9ca3af; font-size: 0.9rem;">→</div>
            </div>
        `;
    });
    
    autocompleteDiv.innerHTML = html;
    autocompleteDiv.classList.add('show');
}

function highlightMatch(text, query) {
    if (!text || !query) return text;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);
    
    return `${before}<span style="background: #fef3c7; color: #92400e; font-weight: 600; padding: 0 2px; border-radius: 2px;">${match}</span>${after}`;
}

function getTypeIcon(type) {
    const iconMap = {
        'word': 'font',
        'phrase': 'comment',
        'sentence': 'comment-alt',
        'verb': 'running',
        'noun': 'cube',
        'adjective': 'palette',
        'general': 'language',
        'greeting': 'hand-paper',
        'question': 'question-circle',
        'food': 'utensils',
        'family': 'users',
        'animal': 'paw',
        'time': 'clock'
    };
    return iconMap[type.toLowerCase()] || 'language';
}

// History functions
async function viewTranslationHistory() {
    const modal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    
    historyList.innerHTML = '<div class="spinner"></div><p>Loading history...</p>';
    modal.classList.add('active');
    
    try {
        let localHistory = JSON.parse(localStorage.getItem('runyankore_history') || '[]');
        
        if (localHistory.length > 0) {
            let html = '<div class="history-source" style="margin-bottom: 10px; padding: 5px; background: #f3f4f6; border-radius: 5px;">Local browser history</div>';
            
            localHistory.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
            
            localHistory.slice(0, 30).forEach(item => {
                const sourceIcon = item.source === 'offline' ? '📱' : '🌐';
                html += `
                    <div class="history-item" style="margin-bottom: 10px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <div class="original" style="font-weight: 600; margin-bottom: 5px;">${item.original || 'N/A'}</div>
                        <div class="translation" style="margin-bottom: 5px;">${item.translation || 'N/A'}</div>
                        <div class="meta" style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280;">
                            <span class="direction">${item.direction ? item.direction.replace(/_/g, ' ') : 'unknown'}</span>
                            <span class="confidence">${Math.round((item.confidence || 0) * 100)}% confidence</span>
                            <span class="source">${sourceIcon}</span>
                            <span class="time">${formatDateTime(item.savedAt || item.timestamp)}</span>
                        </div>
                    </div>
                `;
            });
            
            historyList.innerHTML = html;
            
            // Add export button if not exists (FREE FEATURE)
            const modalFooter = document.querySelector('#historyModal .modal-footer');
            if (modalFooter && !document.getElementById('exportHistoryBtn')) {
                const exportBtn = document.createElement('button');
                exportBtn.id = 'exportHistoryBtn';
                exportBtn.className = 'btn-primary';
                exportBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Export to PDF';
                exportBtn.onclick = () => exportHistoryToPDF();
                modalFooter.insertBefore(exportBtn, modalFooter.firstChild);
            }
        } else {
            historyList.innerHTML = '<div class="empty-state"><p>No translation history yet.</p></div>';
        }
    } catch (error) {
        historyList.innerHTML = '<div class="error-message">Failed to load history</div>';
    }
}

function saveTranslation() {
    if (!currentTranslation) {
        showNotification('No translation to save', 'error');
        return;
    }
    
    saveTranslationToLocalStorage(currentTranslation);
    
    if (navigator.onLine) {
        try {
            saveTranslationToServer(currentTranslation);
        } catch (serverError) {}
    }
    
    showNotification('Translation saved to history', 'success');
}

function saveTranslationToLocalStorage(translation) {
    let localHistory = JSON.parse(localStorage.getItem('runyankore_history') || '[]');
    
    const historyItem = {
        ...translation,
        savedAt: new Date().toISOString()
    };
    
    const exists = localHistory.some(item => 
        item.original === translation.original && 
        item.translation === translation.translation
    );
    
    if (!exists) {
        localHistory.unshift(historyItem);
        if (localHistory.length > 100) {
            localHistory = localHistory.slice(0, 100);
        }
        localStorage.setItem('runyankore_history', JSON.stringify(localHistory));
        translationHistory = localHistory;
    }
}

async function saveTranslationToServer(translation) {
    try {
        const response = await fetch('/api/history/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(translation)
        });
    } catch (error) {}
}

async function clearHistory() {
    if (confirm('Are you sure you want to clear all translation history?')) {
        localStorage.removeItem('runyankore_history');
        translationHistory = [];
        
        if (navigator.onLine) {
            try {
                const response = await fetch('/api/history/clear', {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showNotification('History cleared (local + server)', 'success');
                } else {
                    showNotification('Local history cleared, server failed', 'info');
                }
            } catch (error) {
                showNotification('Local history cleared, server unreachable', 'info');
            }
        } else {
            showNotification('Local history cleared (offline)', 'success');
        }
        document.getElementById('historyList').innerHTML = '<div class="empty-state"><p>No translation history yet.</p></div>';
    }
}

// Utility functions
function clearDictionarySearch() {
    document.getElementById('dictionarySearch').value = '';
    document.getElementById('dictionaryResults').innerHTML = `
        <div class="result-placeholder">
            <i class="fas fa-search"></i>
            <p>Search the dictionary to see results...</p>
        </div>
    `;
}

async function refreshOfflineDictionary() {
    console.log('🔄 Manual refresh button clicked - Refreshing page...');
    
    const refreshBtn = document.querySelector('.refresh-btn');
    const originalHTML = refreshBtn ? refreshBtn.innerHTML : null;
    
    if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        refreshBtn.disabled = true;
    }
    
    showNotification('Refreshing page to get latest updates...', 'info');
    
    // Simple page reload with cache busting
    setTimeout(() => {
        window.location.reload(true); // true = force reload from server, bypass cache
    }, 500);
}

// ========== CRITICAL FIX: Add Translation Modal Functions ==========
function showAddTranslationModal() {
    const modal = document.getElementById('addTranslationModal');
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.classList.add('modal-open');
    
    // Reset form fields
    document.getElementById('newRunyankore').value = '';
    document.getElementById('newEnglish').value = '';
    document.getElementById('translationType').value = 'word';
    
    // Reset confirmation checkbox and button state
    const checkbox = document.getElementById('translationConfirmation');
    const submitBtn = document.getElementById('submitTranslationBtn');
    if (checkbox) checkbox.checked = false;
    if (submitBtn) submitBtn.disabled = true;
    
    // Apply label fix IMMEDIATELY
    setTimeout(fixModalLabels, 10);
    
    // Focus on first input
    setTimeout(() => {
        const firstInput = document.getElementById('newRunyankore');
        if (firstInput) firstInput.focus();
    }, 50);
}

function closeModal() {
    const addModal = document.getElementById('addTranslationModal');
    const historyModal = document.getElementById('historyModal');
    
    if (addModal) addModal.classList.remove('active');
    if (historyModal) historyModal.classList.remove('active');
    
    document.body.classList.remove('modal-open');
    document.body.style.overflow = 'auto';
    
    // Clear form
    document.getElementById('newRunyankore').value = '';
    document.getElementById('newEnglish').value = '';
    document.getElementById('translationType').value = 'word';
    
    // Reset confirmation checkbox
    const confirmationCheckbox = document.getElementById('translationConfirmation');
    const submitButton = document.getElementById('submitTranslationBtn');
    if (confirmationCheckbox) confirmationCheckbox.checked = false;
    if (submitButton) submitButton.disabled = true;
}

// ========== NEW SUBMIT TRANSLATION FUNCTION ==========
async function submitNewTranslation() {
    // Get form values
    const runyankore = document.getElementById('newRunyankore').value.trim();
    const english = document.getElementById('newEnglish').value.trim();
    const type = document.getElementById('translationType').value;
    
    // Validate inputs
    if (!runyankore || !english) {
        showNotification('Both Runyankore and English fields are required', 'error');
        return;
    }
    
    // Validate confirmation checkbox
    const confirmationCheckbox = document.getElementById('translationConfirmation');
    if (!confirmationCheckbox || !confirmationCheckbox.checked) {
        showNotification('Please confirm that your translation is accurate', 'error');
        return;
    }
    
    // Get submit button and show loading state
    const submitBtn = document.getElementById('submitTranslationBtn');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    
    // Show submitting state
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        submitBtn.disabled = true;
    }
    
    try {
        // Prepare data
        const translationData = {
            runyankore: runyankore,
            english: english,
            category: type,
            needs_review: true
        };
        
        // Send to server
        const response = await fetch('/api/translations/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(translationData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show success message on button for 3 seconds
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-check-circle"></i>Submitted successfully.';
                
                // After 3 seconds, close modal and reset button
                setTimeout(() => {
                    // Show success notification
                    showNotification('Translation submitted for review! It will appear after admin approval.', 'success');

                    // Reset button back to normal state
                    if (submitBtn && originalBtnText) {
                        submitBtn.innerHTML = originalBtnText;
                        submitBtn.disabled = false; // Re-enable the button
                    }
                    
                    // Close modal and reset form
                    closeModal();
                    
                    // Update statistics
                    loadStatistics(true);
                    
                    // Clear dictionary search
                    clearDictionarySearch();
                }, 4000); // Keep message visible for 3 seconds
            }

            else {
                // If no button, just show notification and close
                showNotification('Translation submitted for review! It will appear after admin approval.', 'success');
                closeModal();
                loadStatistics(true);
                clearDictionarySearch();
            }
        
        } else {
            // Restore button state on error
            if (submitBtn && originalBtnText) {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
            showNotification(data.message || 'Failed to add translation', 'error');
        }
    } catch (error) {
        // Restore button state on error
        if (submitBtn && originalBtnText) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
        showNotification('Network error. Please try again.', 'error');
    }
}

// ========== FIX FOR MODAL LABELS ==========
function fixModalLabels() {
    const runyankoreLabel = document.querySelector('#addTranslationModal label[for="newRunyankore"]');
    const englishLabel = document.querySelector('#addTranslationModal label[for="newEnglish"]');
    
    if (runyankoreLabel) {
        let html = runyankoreLabel.innerHTML;
        
        // Remove any leading "A" 
        html = html.replace(/^A\s*/, '');
        
        // Ensure correct icon is there (updated from fa-font to fa-pen-fancy)
        if (!html.includes('fa-pen-fancy') && !html.includes('<i class')) {
            html = '<i class="fas fa-pen-fancy"></i> ' + html.trim();
        }
        
        runyankoreLabel.innerHTML = html;
    }
    
    if (englishLabel) {
        let html = englishLabel.innerHTML;
        
        // Remove any leading "A"
        html = html.replace(/^A\s*/, '');
        
        // Ensure correct icon is there (updated from fa-font to fa-pen-alt)
        if (!html.includes('fa-pen-alt') && !html.includes('<i class')) {
            html = '<i class="fas fa-pen-alt"></i> ' + html.trim();
        }
        
        englishLabel.innerHTML = html;
    }
}

// ========== SETUP CONFIRMATION CHECKBOX ==========
function setupTranslationConfirmation() {
    const checkbox = document.getElementById('translationConfirmation');
    const submitBtn = document.getElementById('submitTranslationBtn');
    
    if (checkbox && submitBtn) {
        // Update button state based on checkbox
        checkbox.addEventListener('change', function() {
            submitBtn.disabled = !this.checked;
        });
        
        // Also check inputs are filled
        const runyankoreInput = document.getElementById('newRunyankore');
        const englishInput = document.getElementById('newEnglish');
        
        function updateSubmitState() {
            const runyankoreFilled = runyankoreInput ? runyankoreInput.value.trim().length > 0 : false;
            const englishFilled = englishInput ? englishInput.value.trim().length > 0 : false;
            
            if (runyankoreFilled && englishFilled && checkbox.checked) {
                submitBtn.disabled = false;
            } else {
                submitBtn.disabled = true;
            }
        }
        
        if (runyankoreInput) {
            runyankoreInput.addEventListener('input', updateSubmitState);
        }
        if (englishInput) {
            englishInput.addEventListener('input', updateSubmitState);
        }
    }
}

function clearText(textareaId) {
    document.getElementById(textareaId).value = '';
    if (textareaId === 'runyankoreInput') {
        document.getElementById('runyankoreCharCount').textContent = '0';
    } else if (textareaId === 'englishInput') {
        document.getElementById('englishCharCount').textContent = '0';
    }
}

function insertPhrase(textareaId, phrase) {
    const textarea = document.getElementById(textareaId);
    textarea.value = phrase;
    textarea.focus();
    
    if (textareaId === 'runyankoreInput') {
        document.getElementById('runyankoreCharCount').textContent = phrase.length;
    } else if (textareaId === 'englishInput') {
        document.getElementById('englishCharCount').textContent = phrase.length;
    }
}

function clearTranslationResult() {
    document.getElementById('translationResult').innerHTML = `
        <div class="result-placeholder">
            <i class="fas fa-language"></i>
            <p>Your translation will appear here...</p>
        </div>
    `;
    document.getElementById('confidenceScore').textContent = '..';
    document.getElementById('wordDetails').innerHTML = 'Click on words below to see details';
    currentTranslation = null;
}

async function copyTranslation() {
    if (!currentTranslation) {
        showNotification('No translation to copy', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(currentTranslation.translation);
        showNotification('Translation copied to clipboard!', 'success');
    } catch (err) {
        showNotification('Failed to copy translation', 'error');
    }
}

// ========== SPEECH FUNCTIONS - FULLY FREE ==========

function speakText(textareaId) {
    const text = document.getElementById(textareaId).value;
    if (!text) {
        showNotification('No text to speak', 'error');
        return;
    }
    
    if (!('speechSynthesis' in window)) {
        showNotification('Text-to-speech not supported in your browser', 'error');
        return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    if (textareaId === 'runyankoreInput') {
        // ===== RUNYANKORE ONLY =====
        speakRunyankore(text);
    } else {
        // ===== ENGLISH ONLY =====
        speakEnglish(text);
    }
}

// Separate function for English - Uses Jenny voice (best on Windows)
function speakEnglish(text) {
    // Cancel any ongoing speech to prevent overlapping
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    function speakWithBestVoice() {
        const voices = window.speechSynthesis.getVoices();
        
        // DIRECTLY SELECT JENNY (best voice on your system)
        let selectedVoice = voices.find(voice => voice.name === 'Microsoft Jenny Online (Natural) - English (United States)');
        
        // If Jenny not found, try other high-quality voices
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
                voice.name.includes('Jenny') ||
                voice.name.includes('Emma') ||
                voice.name.includes('Aria') ||
                voice.name.includes('Brian') ||
                voice.name.includes('Christopher') ||
                voice.name.includes('Michelle')
            );
        }
        
        // If still not found, use any Microsoft voice
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
                voice.name.includes('Microsoft') && voice.lang.startsWith('en')
            );
        }
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
            console.log('🔊 Using voice:', selectedVoice.name);
        } else {
            utterance.lang = 'en-US';
            console.log('🔊 Using default English');
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        window.speechSynthesis.speak(utterance);
    }
    
    // Make sure voices are loaded before speaking
    if (window.speechSynthesis.getVoices().length > 0) {
        speakWithBestVoice();
    } else {
        window.speechSynthesis.addEventListener('voiceschanged', speakWithBestVoice, { once: true });
    }
    
    showNotification('🔊 Speaking English...', 'success');
}

// ========== OPTION B: ONE-TIME SWAHILI INFO NOTIFICATION (PER SESSION) ==========
function showSwahiliInfo() {
    // Check if already shown in THIS SESSION
    if (sessionStorage.getItem('swahili_info_shown')) return;
    
    // Add animation style if not already present
    if (!document.getElementById('swahili-info-style')) {
        const style = document.createElement('style');
        style.id = 'swahili-info-style';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'swahili-info-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: white;
        border-left: 4px solid #4f46e5;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        padding: 18px 22px;
        z-index: 10000;
        max-width: 340px;
        animation: slideInRight 0.3s ease;
        font-family: 'Poppins', sans-serif;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; gap: 15px;">
            <div style="background: #e0e7ff; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="fas fa-language" style="color: #4f46e5; font-size: 20px;"></i>
            </div>
            <div style="flex: 1;">
                <h4 style="margin: 0 0 6px 0; color: #1f2937; font-size: 16px; font-weight: 600;">About Pronunciation</h4>
                <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 13px; line-height: 1.6;">
                    Runyankore is spoken using <strong>Swahili voice technology</strong> - the closest available match for accurate Bantu pronunciation.
                </p>
                <div style="display: flex; justify-content: flex-end;">
                    <button onclick="this.closest('#swahili-info-notification').remove()" 
                            style="background: #4f46e5; color: white; border: none; padding: 8px 20px; border-radius: 30px; font-size: 13px; font-weight: 500; cursor: pointer; box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);">
                        <i class="fas fa-check"></i> Got it
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Mark as shown for THIS SESSION ONLY
    sessionStorage.setItem('swahili_info_shown', 'true');
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        const notif = document.getElementById('swahili-info-notification');
        if (notif) notif.remove();
    }, 10000);
}

// Separate function for Runyankore - uses Swahili voice
function speakRunyankore(text) {
    // Show Swahili info on first use of this session
    showSwahiliInfo();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to find Swahili voice for better Bantu pronunciation
    const voices = window.speechSynthesis.getVoices();
    const swahiliVoice = voices.find(v => 
        v.lang.includes('sw') || 
        v.name.toLowerCase().includes('swahili')
    );
    
    if (swahiliVoice) {
        utterance.voice = swahiliVoice;
        utterance.lang = 'sw';
        console.log('Using Swahili voice for Runyankore');
    } else {
        // Fallback to Swahili language code if voice not found
        utterance.lang = 'sw';
    }
    
    utterance.rate = 1.0; // Normal speed
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    showNotification('🔊 Speaking Runyankore with Swahili voice...', 'success');
    window.speechSynthesis.speak(utterance);
}

function speakTranslation() {
    if (!currentTranslation) {
        showNotification('No translation to speak', 'error');
        return;
    }
    
    if (!('speechSynthesis' in window)) {
        showNotification('Text-to-speech not supported in your browser', 'error');
        return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    if (currentTranslation.direction === 'runyankore_to_english') {
        // ===== ENGLISH TRANSLATION RESULT =====
        speakEnglish(currentTranslation.translation);
        showNotification('🔊 Speaking English translation...', 'success');
    } else {
        // ===== RUNYANKORE TRANSLATION RESULT =====
        speakRunyankore(currentTranslation.translation);
        showNotification('🔊 Speaking Runyankore translation with Swahili voice...', 'success');
    }
}

// ========== VOICE INPUT - FULLY FREE ==========
function startVoiceInput(inputId) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Voice input is not supported in your browser. Try Chrome or Edge.');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById(inputId).value = transcript;
        // Auto-update character count
        if (inputId === 'englishInput') {
            document.getElementById('englishCharCount').textContent = transcript.length;
            // Auto-translate after voice input
            document.getElementById('translateToRunyankoreBtn')?.click();
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
        alert('Could not recognize speech. Please try again.');
    };
    
    recognition.start();
    showNotification('🎤 Listening... Speak now', 'success');
}

// Add voice input button to English textarea
function addVoiceInputButton() {
    const englishActions = document.querySelector('#englishInput')?.closest('.textarea-container')?.querySelector('.textarea-actions');
    if (englishActions && !document.getElementById('voiceInputEnglish')) {
        const voiceBtn = document.createElement('button');
        voiceBtn.id = 'voiceInputEnglish';
        voiceBtn.className = 'action-btn';
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        voiceBtn.title = 'Speak English (Voice Input)';
        voiceBtn.onclick = () => startVoiceInput('englishInput');
        englishActions.appendChild(voiceBtn);
    }
}

// Call this after DOM loads
setTimeout(addVoiceInputButton, 1000);

// Preload voices but don't force any English voice selection
if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', function() {
        console.log('Voices loaded:', window.speechSynthesis.getVoices().length);
    });
}

// ========== STATISTICS FUNCTIONS WITH OFFLINE SUPPORT ==========

function isCacheValid(cachedData) {
    if (!cachedData) return false;
    
    // Check if cache is too old (more than 1 day)
    const cacheAge = Date.now() - (cachedData.timestamp || 0);
    const MAX_CACHE_AGE = 24 * 60 * 60 * 1000; // 24 hours
    
    if (cacheAge > MAX_CACHE_AGE) {
        console.log('🗑️ Cache expired, clearing old data');
        return false;
    }
    
    // Check if version matches current
    const currentVersion = 'v2.0';
    if (cachedData.version && cachedData.version !== currentVersion) {
        console.log(`🗑️ Cache version mismatch: ${cachedData.version} vs ${currentVersion}`);
        return false;
    }
    
    return true;
}

async function loadStatistics(forceRefresh = false) {
    // If already loaded and not forcing refresh, skip
    if (statisticsLoaded && !forceRefresh) {
        return;
    }
    
    console.log('🔄 Loading statistics...', navigator.onLine ? 'Online' : 'Offline', 
                forceRefresh ? '(forced)' : '(normal)');
    
    // Show loading state immediately ONLY if not already loaded
    if (!statisticsLoaded) {
        document.getElementById('dictionaryCount').textContent = '...';
        document.getElementById('phraseCount').textContent = '...';
        document.getElementById('dictionaryCount').style.opacity = '1';
        document.getElementById('phraseCount').style.opacity = '1';
    }
    
    try {
        const response = await fetch('/static/data/database_version.json?v=' + Date.now());
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('✅ Statistics loaded:', {
            words: data.words,
            phrases: data.phrases,
            total: data.total_translations
        });
        
        const words = data.words || (navigator.onLine ? 289 : 500);
        const phrases = data.phrases || (navigator.onLine ? 25 : 1000);
        
        // Update the elements
        const dictElement = document.getElementById('dictionaryCount');
        const phraseElement = document.getElementById('phraseCount');
        
        if (navigator.onLine) {
            dictElement.textContent = `${data.words || 289}`;
            phraseElement.textContent = `${data.phrases || 25}`;
        } else {
            dictElement.textContent = `${words}+`;
            phraseElement.textContent = `${phrases}+`;
        }
        
        // Add fade transition
        dictElement.style.transition = 'opacity 0.3s ease-in-out';
        phraseElement.style.transition = 'opacity 0.3s ease-in-out';
        
        // Ensure they're visible
        dictElement.style.opacity = '1';
        phraseElement.style.opacity = '1';
        
        // Add class to body for CSS
        document.body.classList.add('statistics-loaded');
        
        // Save to localStorage
        try {
            localStorage.setItem('runyankore_cached_stats', JSON.stringify({
                words: data.words || words,
                phrases: data.phrases || phrases,
                total: data.total_translations || 314,
                timestamp: Date.now(),
                version: data.display_version || 'v2.0'
            }));
            console.log('✅ Statistics saved to localStorage');
        } catch (e) {
            console.log('Could not save to localStorage:', e);
        }
        
        statisticsLoaded = true;
        return { words, phrases, total: data.total_translations || 314 };
        
    } catch (error) {
        console.warn('❌ Error loading statistics:', error);
        
        // Try cached data as fallback
        return loadCachedStatistics();
    }
}

// Helper function for loading cached statistics (WORKS OFFLINE)
function loadCachedStatistics() {
    const dictElement = document.getElementById('dictionaryCount');
    const phraseElement = document.getElementById('phraseCount');
    
    // Make visible immediately
    if (dictElement) dictElement.style.opacity = '1';
    if (phraseElement) phraseElement.style.opacity = '1';
    
    try {
        // Try to get cached stats from localStorage
        const cachedStats = localStorage.getItem('runyankore_cached_stats');
        
        if (cachedStats) {
            const data = JSON.parse(cachedStats);
            const words = data.words || 500;
            const phrases = data.phrases || 1000;
            
            console.log('📱 Using cached statistics:', { 
                words, 
                phrases,
                cached: true
            });
            
            dictElement.textContent = `${words}`;
            phraseElement.textContent = `${phrases}`;
            
            dictElement.style.transition = 'opacity 0.3s ease-in-out';
            phraseElement.style.transition = 'opacity 0.3s ease-in-out';
            
            dictElement.style.opacity = '1';
            phraseElement.style.opacity = '1';
            
            document.body.classList.add('statistics-loaded');
            statisticsLoaded = true;
            return { words, phrases, total: data.total || 314 };
        }
    } catch (e) {
        console.log('No valid cached stats found in localStorage:', e);
    }
    
    // Ultimate fallback
    console.log('⚠️ Using hardcoded default statistics');
    
    dictElement.textContent = '500';
    phraseElement.textContent = '1000';
    
    dictElement.style.opacity = '1';
    phraseElement.style.opacity = '1';
    
    document.body.classList.add('statistics-loaded');
    statisticsLoaded = true;
    return { words: 500, phrases: 1000, total: 1500 };
}

// Function to update header version dynamically
async function updateHeaderVersion() {
    const versionElement = document.getElementById('headerVersionText');
    if (!versionElement) return;
    
    try {
        versionElement.textContent = '...';
        
        const response = await fetch('/static/data/database_version.json?v=' + Date.now());
        const data = await response.json();
        
        const version = data.display_version || data.version || 'v2.0';
        
        versionElement.textContent = version;
        
        console.log('✅ Header version updated on load:', version);
        
        try {
            localStorage.setItem('runyankore_last_version', JSON.stringify({
                version: version,
                timestamp: Date.now()
            }));
        } catch (e) {}
        
    } catch (error) {
        console.log('❌ Could not fetch version, trying cache:', error);
        
        try {
            const cached = localStorage.getItem('runyankore_last_version');
            if (cached) {
                const data = JSON.parse(cached);
                versionElement.textContent = data.version || 'v2.0';
                console.log('📱 Using cached version:', data.version);
            }
        } catch (e) {
            versionElement.textContent = 'v2.0';
        }
    }
}

function showStatistics() {
    const modal = document.getElementById('statisticsModal');
    const contentDiv = document.getElementById('statisticsContent');
    
    if (!modal || !contentDiv) {
        console.error('❌ Statistics modal elements not found!');
        return;
    }
    
    contentDiv.innerHTML = `
        <div class="stats-loading">
            <div class="spinner"></div>
            <p>Loading statistics...</p>
        </div>
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    
    // Load statistics directly
    loadStatisticsModal();
}

// ========== EXPORT HISTORY TO PDF - FULLY FREE ==========
async function exportHistoryToPDF() {
    const history = JSON.parse(localStorage.getItem('runyankore_history') || '[]');
    if (history.length === 0) {
        alert('No translation history to export.');
        return;
    }
    
    const escapeHtml = (text) => {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    
    let tableRows = '';
    
    for (const item of history) {
        let originalText = '';
        let translatedText = '';
        let directionText = '';
        let directionClass = '';
        
        if (item.direction === 'runyankore_to_english') {
            originalText = item.original || item.text || '';
            translatedText = item.translation || '';
            directionText = 'Runyankore → English';
            directionClass = 'direction-rny';
        }
        else if (item.direction === 'english_to_runyankore') {
            originalText = item.original || item.text || '';
            translatedText = item.translation || '';
            directionText = 'English → Runyankore';
            directionClass = 'direction-eng';
        }
        else {
            const original = (item.original || item.text || '').toLowerCase();
            const englishWords = ['the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'i', 'at', 'be', 'this', 'have', 'from'];
            let englishWordCount = 0;
            for (const word of englishWords) {
                if (original.includes(' ' + word + ' ') || original.startsWith(word + ' ') || original.endsWith(' ' + word)) {
                    englishWordCount++;
                }
            }
            
            if (englishWordCount > 0) {
                originalText = item.original || item.text || '';
                translatedText = item.translation || '';
                directionText = 'English → Runyankore';
                directionClass = 'direction-eng';
            } else {
                originalText = item.original || item.text || '';
                translatedText = item.translation || '';
                directionText = 'Runyankore → English';
                directionClass = 'direction-rny';
            }
        }
        
        const date = new Date(item.timestamp || item.savedAt || Date.now());
        tableRows += `<tr><td style="border:1px solid #ddd;padding:8px;">${escapeHtml(date.toLocaleString())}</td><td style="border:1px solid #ddd;padding:8px;"><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;${directionClass === 'direction-rny' ? 'background:#e0e7ff;color:#4f46e5;' : 'background:#d1fae5;color:#059669;'}">${directionText}</span></td><td style="border:1px solid #ddd;padding:8px;font-weight:bold;color:#4f46e5;">${escapeHtml(originalText) || '—'}</td><td style="border:1px solid #ddd;padding:8px;color:#059669;">${escapeHtml(translatedText) || '—'}</td></tr>`;
    }
    
    const pdfContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Runyankore Translation History</title><style>body{font-family:Arial,sans-serif;padding:20px;}h1{color:#4f46e5;}.subtitle{color:#666;margin-bottom:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top;}th{background:#4f46e5;color:white;}tr:nth-child(even){background:#f9f9f9;}.footer{margin-top:30px;text-align:center;font-size:12px;color:#999;}</style></head><body><h1>📖 Runyankore Translation History</h1><div class="subtitle">Generated on: ${new Date().toLocaleString()}</div><div class="subtitle">Total translations: ${history.length}</div><table><thead><tr><th style="width:20%">Date & Time</th><th style="width:15%">Direction</th><th style="width:32%">Original Text</th><th style="width:33%">Translation</th></tr></thead><tbody>${tableRows}</tbody></table><div class="footer"><p>Exported from Runyankore Smart Translator</p><p>Preserving Runyankore language through technology</p></div></body></html>`;
    
    const blob = new Blob([pdfContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    setTimeout(() => { URL.revokeObjectURL(url); }, 100);
    showNotification('📄 Opening PDF preview...', 'success');
}

async function loadStatisticsModal() {
    const contentDiv = document.getElementById('statisticsContent');
    
    if (!contentDiv) {
        console.error('❌ statisticsContent element not found!');
        return;
    }
    
    try {
        const response = await fetch('/static/data/database_version.json?v=' + Date.now());
        const data = await response.json();
        
        const dictElement = document.getElementById('dictionaryCount');
        const phraseElement = document.getElementById('phraseCount');
        const versionElement = document.getElementById('headerVersionText');
        
        if (dictElement && phraseElement) {
            const words = data.words || (navigator.onLine ? 289 : 500);
            const phrases = data.phrases || (navigator.onLine ? 25 : 1000);
            
            if (navigator.onLine) {
                dictElement.textContent = `${words}`;
                phraseElement.textContent = `${phrases}`;
            } else {
                dictElement.textContent = `${words}+`;
                phraseElement.textContent = `${phrases}+`;
            }
        }
        
        if (versionElement) {
            versionElement.textContent = data.display_version || data.version || 'v2.0';
        }

        let html = '<div class="stats-container">';
        html += '<h3 class="stats-title">Runyankore ↔ English Translator Statistics</h3>';
        
        html += '<div class="stats-grid">';
        html += `
            <div class="stat-card version-card">
                <div class="stat-label">Dictionary Version</div>
                <div class="stat-value">${data.display_version || data.version || 'N/A'}</div>
                <div class="stat-sub">Last Built: ${data.build_date || 'Unknown'}</div>
            </div>
            
            <div class="stat-card total-card">
                <div class="stat-label">Total Offline Translations</div>
                <div class="stat-value">${data.total_translations || data.count || 0}</div>
            </div>
            
            <div class="stat-card words-card">
                <div class="stat-label">Words</div>
                <div class="stat-value">${data.words || 0}</div>
            </div>
            
            <div class="stat-card phrases-card">
                <div class="stat-label">Phrases</div>
                <div class="stat-value">${data.phrases || 0}</div>
            </div>
        `;
        html += '</div>';
        
        html += '<div class="additional-stats">';
        html += '<h4><i class="fas fa-info-circle"></i> Additional Information</h4>';
        html += `<div class="stat-info"><strong>Dictionary Version:</strong> ${data.display_version || data.version || 'N/A'}</div>`;
        html += `<div class="stat-info"><strong>Total Offline Translations:</strong> ${data.total_translations || data.count || 0}</div>`;
        html += `<div class="stat-info"><strong>Words:</strong> ${data.words || 0}</div>`;
        html += `<div class="stat-info"><strong>Phrases:</strong> ${data.phrases || 0}</div>`;
        html += `<div class="stat-info"><strong>Categories:</strong> ${data.categories || 0}</div>`;
        html += `<div class="stat-info"><strong>Last Build Date:</strong> ${data.build_date || data.created_at || 'Unknown'}</div>`;
        html += `<div class="stat-info"><strong>Status:</strong> ${navigator.onLine ? '<span class="online-status">Online 🌐</span>' : '<span class="offline-status">Offline 📱</span>'}</div>`;
        html += '</div>';
        
        html += '<div class="stats-footer">More translations coming soon!</div>';
        html += '</div>';
        
        contentDiv.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading statistics:', error);
        
        contentDiv.innerHTML = `
            <div class="stats-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Statistics</h3>
                <p>Could not load statistics data. Please check your connection and try again.</p>
                <button onclick="loadStatisticsModal()" class="btn btn-primary">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function showAbout() {
    document.getElementById('aboutTranslatorModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeAboutModal() {
    document.getElementById('aboutTranslatorModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    document.body.classList.remove('modal-open');
}

function closeStatisticsModal() {
    const modal = document.getElementById('statisticsModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    document.body.classList.remove('modal-open'); 
}

// Notification system
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const messageSpan = document.getElementById('notificationMessage');
    
    if (!notification || !messageSpan) return;
    
    messageSpan.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Utility formatting functions
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Close modals when clicking outside
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        closeModal();
        closeAboutModal();
        closeStatisticsModal();
        closeUserGuideModal();
        closeDonationModal();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
        closeAboutModal();
        closeStatisticsModal();
        closeUserGuideModal();
        closeDonationModal();
    }
});

// State recovery system
function saveAppState() {
    const state = {
        timestamp: Date.now(),
        runyankoreInput: document.getElementById('runyankoreInput')?.value || '',
        englishInput: document.getElementById('englishInput')?.value || '',
        translation: currentTranslation || null
    };
    
    localStorage.setItem('pwa_app_state', JSON.stringify(state));
}

function restoreAppState() {
    try {
        const savedState = localStorage.getItem('pwa_app_state');
        if (savedState) {
            const state = JSON.parse(savedState);
            
            if (Date.now() - state.timestamp < 300000) {
                const runyankoreInput = document.getElementById('runyankoreInput');
                const englishInput = document.getElementById('englishInput');
                
                if (runyankoreInput && state.runyankoreInput) {
                    runyankoreInput.value = state.runyankoreInput;
                }
                
                if (englishInput && state.englishInput) {
                    englishInput.value = state.englishInput;
                }
                
                if (state.translation) {
                    currentTranslation = state.translation;
                }
            }
        }
    } catch (e) {}
}

window.addEventListener('beforeunload', saveAppState);

// PWA Network Indicator
function setupNetworkIndicator() {
    const indicator = document.getElementById('pwaNetworkStatus');
    if (!indicator) return;
    
    let hideTimeout;
    
    function updateIndicator() {
        const isOnline = navigator.onLine;
        
        if (hideTimeout) clearTimeout(hideTimeout);
        
        if (isOnline) {
            indicator.innerHTML = '<i class="fas fa-wifi"></i><span>Back Online</span>';
            indicator.className = 'pwa-network-status show online';
            
            hideTimeout = setTimeout(() => {
                indicator.classList.remove('show');
            }, 3000);
        } else {
            indicator.innerHTML = '<i class="fas fa-wifi-slash"></i><span>Offline Mode</span>';
            indicator.className = 'pwa-network-status show';
            indicator.classList.remove('online');
        }
    }
    
    updateIndicator();
    window.addEventListener('online', updateIndicator);
    window.addEventListener('offline', updateIndicator);
}

// Keep-alive system for PWA
let keepAliveInterval;

function startKeepAlive() {
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
        
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        
        keepAliveInterval = setInterval(() => {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const messageChannel = new MessageChannel();
                navigator.serviceWorker.controller.postMessage('keepAlive', 
                    [messageChannel.port2]);
            }
        }, 30000);
        
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    const messageChannel = new MessageChannel();
                    navigator.serviceWorker.controller.postMessage('wakeUp', 
                        [messageChannel.port2]);
                }
            }
        });
    }
}

// Wake Lock API
let wakeLock = null;

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {});
        } catch (err) {}
    }
}

// ========== USER GUIDE MODAL FUNCTIONS ==========
function showUserGuideModal() {
    const modal = document.getElementById('userGuideModal');
    if (!modal) {
        console.error('User Guide modal not found!');
        return;
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    
    const guideContent = modal.querySelector('.guide-content');
    if (guideContent) {
        guideContent.scrollTop = 0;
    }
    
    console.log('User Guide modal opened');
}

function closeUserGuideModal() {
    const modal = document.getElementById('userGuideModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    document.body.classList.remove('modal-open');
}

function printGuide() {
    const modal = document.getElementById('userGuideModal');
    if (!modal) return;
    
    const printWindow = window.open('', '_blank');
    const content = modal.querySelector('.guide-content').innerHTML;
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Runyankore Translator - User Guide</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                }
                h4 {
                    color: #4f46e5;
                    border-bottom: 2px solid #4f46e5;
                    padding-bottom: 5px;
                    margin-top: 30px;
                }
                .step {
                    margin: 15px 0;
                    padding: 10px;
                    background: #f8fafc;
                    border-left: 3px solid #10b981;
                }
                .badge {
                    background: #e0e7ff;
                    color: #4f46e5;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    margin: 0 3px;
                }
                .warning-box {
                    background: #fffbeb;
                    border: 1px solid #fbbf24;
                    padding: 15px;
                    margin: 20px 0;
                }
                @media print {
                    body { font-size: 12pt; }
                    .step { break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <h1>Runyankore Translator User Guide</h1>
            <p><em>Last updated: ${new Date().toLocaleDateString()}</em></p>
            ${content}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

// ========== FEEDBACK SYSTEM FUNCTIONS ==========

// Get or create user token
function getUserToken() {
    let token = localStorage.getItem('feedback_user_token');
    if (!token) {
        token = 'user_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('feedback_user_token', token);
    }
    return token;
}

// Show feedback modal
function showFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    if (!modal) return;
    
    document.getElementById('feedbackName').value = '';
    document.getElementById('feedbackEmail').value = '';
    document.getElementById('feedbackType').value = 'general';
    document.getElementById('feedbackMessage').value = '';
    
    const statusDiv = document.getElementById('feedbackStatus');
    statusDiv.style.display = 'none';
    statusDiv.innerHTML = '';
    
    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

// Close feedback modal
function closeFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('modal-open');
}

// Submit feedback
async function submitFeedback() {
    const name = document.getElementById('feedbackName').value.trim();
    const email = document.getElementById('feedbackEmail').value.trim();
    const type = document.getElementById('feedbackType').value;
    const message = document.getElementById('feedbackMessage').value.trim();
    
    if (!message) {
        showFeedbackStatus('Please enter a message', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submitFeedbackBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;
    
    try {
        const token = getUserToken();
        
        const response = await fetch('/api/feedback/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Token': token
            },
            body: JSON.stringify({
                name: name,
                email: email,
                type: type,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showFeedbackStatus('Thank you for your feedback!', 'success');
            setTimeout(() => {
                closeFeedbackModal();
                viewUserFeedbackHistory();
            }, 2000);
        } else {
            showFeedbackStatus('Error: ' + (data.error || 'Failed to submit'), 'error');
        }
    } catch (error) {
        showFeedbackStatus('Network error. Please try again.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Show feedback status
function showFeedbackStatus(message, type) {
    const statusDiv = document.getElementById('feedbackStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = message;
    statusDiv.className = type === 'success' ? 'success-message' : 'error-message';
    
    statusDiv.style.backgroundColor = type === 'success' ? '#d1fae5' : '#fee2e2';
    statusDiv.style.color = type === 'success' ? '#065f46' : '#991b1b';
    statusDiv.style.border = type === 'success' ? '1px solid #10b981' : '1px solid #ef4444';
}

// ========== USER FEEDBACK HISTORY FUNCTIONS ==========

// View user's own feedback history
async function viewUserFeedbackHistory() {
    const modal = document.getElementById('userFeedbackHistoryModal');
    if (!modal) {
        console.error('Feedback history modal not found');
        return;
    }
    
    const container = document.getElementById('userFeedbackList');
    container.innerHTML = '<div class="feedback-loading"><i class="fas fa-spinner fa-spin"></i> Loading your feedback...</div>';
    
    modal.classList.add('active');
    document.body.classList.add('modal-open');
    
    const token = getUserToken();
    
    try {
        const response = await fetch('/api/user/feedback?token=' + token);
        const data = await response.json();
        
        if (data.success) {
            displayUserFeedback(data.feedback);
        } else {
            container.innerHTML = '<div class="feedback-error">Error loading feedback</div>';
        }
    } catch (error) {
        console.error('Error loading feedback:', error);
        container.innerHTML = '<div class="feedback-error">Network error. Please try again.</div>';
    }
}

// Display user's feedback history
function displayUserFeedback(feedback) {
    const container = document.getElementById('userFeedbackList');
    
    if (!feedback || feedback.length === 0) {
        container.innerHTML = `
            <div class="feedback-empty">
                <i class="fas fa-comment-slash"></i>
                <p>You haven't submitted any feedback yet.</p>
                <button class="btn-primary" onclick="closeUserFeedbackHistory(); showFeedbackModal();">
                    <i class="fas fa-plus"></i> Send Feedback
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    feedback.forEach(item => {
        const utcDate = new Date(item.created_at);
        const ugandaDate = new Date(utcDate.getTime() + (3 * 60 * 60 * 1000));
        
        const year = ugandaDate.getFullYear();
        const month = String(ugandaDate.getMonth() + 1).padStart(2, '0');
        const day = String(ugandaDate.getDate()).padStart(2, '0');
        const hours = String(ugandaDate.getHours()).padStart(2, '0');
        const minutes = String(ugandaDate.getMinutes()).padStart(2, '0');
        const seconds = String(ugandaDate.getSeconds()).padStart(2, '0');
        
        const localDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        let repliedDate = '';
        if (item.replied_at) {
            const utcReplied = new Date(item.replied_at);
            const ugandaReplied = new Date(utcReplied.getTime() + (3 * 60 * 60 * 1000));
            
            const rYear = ugandaReplied.getFullYear();
            const rMonth = String(ugandaReplied.getMonth() + 1).padStart(2, '0');
            const rDay = String(ugandaReplied.getDate()).padStart(2, '0');
            const rHours = String(ugandaReplied.getHours()).padStart(2, '0');
            const rMinutes = String(ugandaReplied.getMinutes()).padStart(2, '0');
            const rSeconds = String(ugandaReplied.getSeconds()).padStart(2, '0');
            
            repliedDate = `${rYear}-${rMonth}-${rDay} ${rHours}:${rMinutes}:${rSeconds}`;
        }
        
        const typeClass = item.feedback_type || 'general';
        const typeIcon = getFeedbackIcon(item.feedback_type);
        
        let statusBadge = '';
        if (item.is_replied) {
            statusBadge = '<span class="feedback-status replied"><i class="fas fa-check-circle"></i> Replied</span>';
        } else if (item.is_read) {
            statusBadge = '<span class="feedback-status read"><i class="fas fa-eye"></i> Read</span>';
        } else {
            statusBadge = '<span class="feedback-status pending"><i class="fas fa-clock"></i> Pending</span>';
        }
        
        html += `
            <div class="feedback-item" data-id="${item.id}">
                <div class="feedback-item-header">
                    <div>
                        <span class="feedback-type ${typeClass}">
                            <i class="fas ${typeIcon}"></i> ${item.feedback_type || 'General'}
                        </span>
                        ${statusBadge}
                    </div>
                    <span class="feedback-date"><i class="fas fa-calendar"></i> ${localDate}</span>
                </div>
                
                <div class="feedback-message">
                    ${item.message.replace(/\n/g, '<br>')}
                </div>
                
                ${item.admin_reply ? `
                    <div class="feedback-admin-reply">
                        <small><i class="fas fa-reply"></i> Admin reply:</small>
                        <p>${item.admin_reply.replace(/\n/g, '<br>')}</p>
                        <small>${repliedDate}</small>
                    </div>
                ` : ''}
                
                <div class="feedback-actions">
                    <button class="feedback-delete-btn" onclick="deleteUserFeedback(${item.id})">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Helper function to get icon for feedback type
function getFeedbackIcon(type) {
    const icons = {
        'bug': 'fa-bug',
        'suggestion': 'fa-lightbulb',
        'praise': 'fa-heart',
        'question': 'fa-question-circle',
        'general': 'fa-comment'
    };
    return icons[type] || 'fa-comment';
}

// Close user feedback history
function closeUserFeedbackHistory() {
    const modal = document.getElementById('userFeedbackHistoryModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
}

// Delete user's own feedback
async function deleteUserFeedback(feedbackId) {
    if (!confirm('Are you sure you want to delete this feedback?')) return;
    
    const token = getUserToken();
    const deleteBtn = event.target.closest('.feedback-delete-btn');
    const originalText = deleteBtn.innerHTML;
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    deleteBtn.disabled = true;
    
    try {
        const response = await fetch(`/api/feedback/delete/${feedbackId}`, {
            method: 'DELETE',
            headers: {
                'X-User-Token': token
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Feedback deleted successfully', 'success');
            viewUserFeedbackHistory();
        } else {
            showNotification('Error deleting feedback', 'error');
            deleteBtn.innerHTML = originalText;
            deleteBtn.disabled = false;
        }
    } catch (error) {
        showNotification('Network error', 'error');
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
    }
}

// ========== DONATION/SUPPORT MODAL FUNCTIONS ==========

function showDonationModal() {
    const modal = document.getElementById('donationModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
    }
}

function closeDonationModal() {
    const modal = document.getElementById('donationModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        document.body.style.overflow = 'auto';
    }
}

// Export functions
window.RunyankoreTranslator = {
    translateToEnglish,
    translateToRunyankore,
    searchDictionary,
    showAddTranslationModal,
    viewTranslationHistory,
    saveTranslation,
    clearHistory,
    showNotification,
    copyToClipboard,
    startVoiceInput,
    exportHistoryToPDF
};