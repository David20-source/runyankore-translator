/**
 * SIMPLE & RELIABLE Offline Dictionary for Runyankore Translator
 * Uses JSON instead of SQLite - ALWAYS WORKS
 */

class SimpleOfflineDictionary {
    constructor() {
        this.data = null;
        this.loaded = false;
        this.loading = false;
        this.version = null;
    }
    
    async initialize() {
        if (this.loaded) {
            console.log('✅ Offline dictionary already loaded');
            return true;
        }
        
        if (this.loading) {
            console.log('⏳ Dictionary loading in progress...');
            return false;
        }
        
        this.loading = true;
        console.log('📦 Loading simple offline dictionary...');
        
        try {
            // Try to load from localStorage first (fastest)
            const cached = localStorage.getItem('runyankore_offline_dict');
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (parsed && parsed.translations && Array.isArray(parsed.translations)) {
                        this.data = parsed.translations;
                        this.version = parsed.version;
                        this.loaded = true;
                        this.loading = false;
                        console.log(`✅ Loaded ${this.data.length} translations from cache`);
                        this.updateUI(true);
                        return true;
                    }
                } catch (e) {
                    console.log('⚠️ Cache corrupted, loading fresh');
                }
            }
            
            // Load from server
            const response = await fetch('/static/data/offline_dictionary.json');
            if (!response.ok) {
                throw new Error(`Failed to load dictionary: ${response.status}`);
            }
            
            const jsonData = await response.json();
            
            // Validate data
            if (!jsonData.translations || !Array.isArray(jsonData.translations)) {
                throw new Error('Invalid dictionary format');
            }
            
            this.data = jsonData.translations;
            this.version = jsonData.version;
            this.loaded = true;
            
            // Cache in localStorage for instant loading next time
            try {
                localStorage.setItem('runyankore_offline_dict', JSON.stringify(jsonData));
                console.log('💾 Dictionary cached locally');
            } catch (e) {
                console.log('⚠️ Could not cache in localStorage (might be full)');
            }
            
            console.log(`✅ Loaded ${this.data.length} translations`);
            console.log(`📊 Version: ${this.version}`);
            
            this.updateUI(true);
            return true;
            
        } catch (error) {
            console.error('❌ Failed to load offline dictionary:', error);
            this.loading = false;
            this.updateUI(false, error.message);
            return false;
        } finally {
            this.loading = false;
        }
    }
    
    // ALWAYS use this method before any operation
    async ensureLoaded() {
        if (!this.loaded && !this.loading) {
            return await this.initialize();
        }
        return this.loaded;
    }
    
    // Search for translations
    async search(query, language = 'both', limit = 30) {
    const isLoaded = await this.ensureLoaded();
    if (!isLoaded || !this.data) {
        return [];
    }
    
    query = query.toLowerCase().trim();
    if (!query) return [];
    
    const results = [];
    
    for (const item of this.data) {
        const runyLower = item.r.toLowerCase();
        const engLower = item.e.toLowerCase();
        let matches = false;
        
        if (language === 'runyankore') {
            matches = runyLower.includes(query);
        } else if (language === 'english') {
            matches = engLower.includes(query);
        } else {
            matches = runyLower.includes(query) || engLower.includes(query);
        }
        
        if (matches) {
            // Calculate relevance score
            let score = 0;
            if (runyLower === query || engLower === query) score = 100;
            else if (runyLower.startsWith(query) || engLower.startsWith(query)) score = 80;
            else if (runyLower.includes(query) || engLower.includes(query)) score = 60;
            
            // ✅ FIXED: Calculate confidence based on match type
            let confidence = 0.8; // Default
            if (score === 100) confidence = 1.0;   // Exact match
            else if (score === 80) confidence = 0.9; // Starts with
            else if (score === 60) confidence = 0.7; // Contains
            
            results.push({
                runyankore: item.r,
                english: item.e,
                category: item.c,
                confidence: confidence, // ✅ FIXED: Now uses calculated value, not hardcoded 0.8
                word_type: this.determineWordType(item.r, item.e),
                relevance: score
            });
            
            if (results.length >= limit) break;
        }
    }
    
    // Sort by relevance
    return results.sort((a, b) => b.relevance - a.relevance);
}
    
    // Exact match translation
    async exactMatch(text, fromRunyankore = true) {
    const isLoaded = await this.ensureLoaded();
    if (!isLoaded || !this.data) return null;
    
    text = text.toLowerCase().trim();
    
    for (const item of this.data) {
        if (fromRunyankore) {
            if (item.r.toLowerCase() === text) {
                return {
                    translation: item.e,
                    confidence: 1.0, // ✅ FIXED: Changed from 0.9 to 1.0
                    category: item.c
                };
            }
        } else {
            if (item.e.toLowerCase() === text) {
                return {
                    translation: item.r,
                    confidence: 1.0, // ✅ FIXED: Changed from 0.9 to 1.0
                    category: item.c
                };
            }
        }
    }
    
    return null;
}
    
    // Helper method to determine word type
    determineWordType(runyankore, english) {
        const runyWords = runyankore.split(/\s+/).length;
        const engWords = english.split(/\s+/).length;
        
        if (runyWords === 1 && engWords === 1) return 'word';
        if (runyWords <= 3 && engWords <= 3) return 'phrase';
        return 'sentence';
    }
    
   // Get statistics
async getStats() {
    const isLoaded = await this.ensureLoaded();
    if (!isLoaded || !this.data) {
        return { 
            total: 0, 
            words: 0, 
            phrases: 0, 
            sentences: 0,
            version: '1.0',
            display_version: 'v1.0'
        };
    }
    
    let words = 0;
    let phrases = 0;
    let sentences = 0;
    
    for (const item of this.data) {
        const type = this.determineWordType(item.r, item.e);
        if (type === 'word') words++;
        else if (type === 'phrase') phrases++;
        else if (type === 'sentence') sentences++;
    }
    
    // Try to get clean version from API
    let displayVersion = 'v1.0';
    let cleanVersion = '1.0';
    
    try {
        const response = await fetch('/api/database/version');
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                displayVersion = data.version.display || 'v1.0';
                cleanVersion = data.version.semantic || '1.0';
            }
        }
    } catch (e) {
        // If API fails, try to format the timestamp version
        if (this.version && this.version.includes('_')) {
            // Convert "20260106_090434" to "v2026.1.6"
            const datePart = this.version.split('_')[0];
            if (datePart.length >= 8) {
                const year = datePart.substring(0, 4);
                const month = parseInt(datePart.substring(4, 6));
                const day = parseInt(datePart.substring(6, 8));
                displayVersion = `v${year}.${month}.${day}`;
                cleanVersion = `${year}.${month}.${day}`;
            }
        } else if (this.version) {
            displayVersion = `v${this.version}`;
            cleanVersion = this.version;
        }
    }
    
    return {
        total: this.data.length,
        words: words,
        phrases: phrases,
        sentences: sentences,
        version: cleanVersion,        // Clean like "2.3.0"
        display_version: displayVersion  // Like "v2.3.0"
    };
}
    
    // Get categories
    async getCategories() {
        const isLoaded = await this.ensureLoaded();
        if (!isLoaded || !this.data) return [];
        
        const categoryCount = {};
        for (const item of this.data) {
            const cat = item.c || 'general';
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        }
        
        return Object.entries(categoryCount)
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);
    }
    
    // Update UI
    updateUI(success, error = null) {
        // Update offline indicator
        const offlineIndicator = document.getElementById('offlineStatus');
        if (offlineIndicator) {
            if (success) {
                offlineIndicator.innerHTML = '<i class="fas fa-check-circle"></i> Offline Ready';
                offlineIndicator.style.color = '#10b981';
            } else {
                offlineIndicator.innerHTML = '<i class="fas fa-times-circle"></i> Offline Failed';
                offlineIndicator.style.color = '#ef4444';
            }
        }
        
        // Update stats in header
        // this.updateStatsInHeader(); 
        
        // Show notification
        if (success) {
            this.showNotification('Offline dictionary loaded!', 'success');
        } else if (error) {
            this.showNotification(`Offline failed: ${error}`, 'error');
        }
    }
    
    // Update header statistics
    async updateStatsInHeader() {
        const stats = await this.getStats();
        
        const wordCountEl = document.getElementById('dictionaryCount');
        const phraseCountEl = document.getElementById('phraseCount');
        
        if (wordCountEl) {
            wordCountEl.textContent = `${stats.words}+`;
        }
        
        if (phraseCountEl) {
            phraseCountEl.textContent = `${stats.phrases}+`;
        }
    }
    
    // Clear cache
    clearCache() {
        try {
            localStorage.removeItem('runyankore_offline_dict');
            this.data = null;
            this.loaded = false;
            this.version = null;
            console.log('🗑️ Local cache cleared');
            return true;
        } catch (e) {
            console.error('Failed to clear cache:', e);
            return false;
        }
    }
    
    // Check for updates
    async checkForUpdates() {
    try {
        // Try to get version from version file first
        const versionResponse = await fetch('/static/data/offline_dictionary_version.json?v=' + Date.now());
        if (versionResponse.ok) {
            const versionData = await versionResponse.json();
            return versionData.version !== this.version;
        }
        
        // Fallback: try the main JSON file
        const response = await fetch('/static/data/offline_dictionary.json?v=' + Date.now());
        if (!response.ok) return false;
        
        const data = await response.json();
        return data.version !== this.version;
        
    } catch (error) {
        console.log('⚠️ Could not check for updates:', error);
        return false;
    }
}

async forceReload() {
    console.log('🔄 Forcing dictionary reload...');
    
    // Clear cache
    this.clearCache();
    
    // Reset state
    this.data = null;
    this.loaded = false;
    this.version = null;
    
    // Load fresh
    const success = await this.initialize();
    
    if (success) {
        this.showNotification('Offline dictionary updated!', 'success');
    } else {
        this.showNotification('Failed to reload dictionary', 'error');
    }
    
    return success;
}
    
    // Show notification
    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }
    
    // Quick test - always returns essential phrases even if loading fails
    getEssentialPhrases() {
        return [
            { r: "Amagara gawe?", e: "How is your life?", c: "greetings" },
            { r: "Yebare", e: "Thank you", c: "greetings" },
            { r: "Oraire ota", e: "Good morning", c: "greetings" },
            { r: "Ndi gye", e: "I am fine", c: "greetings" },
            { r: "Agandi", e: "How are you?", c: "greetings" }
        ];
    }
}

// Create global instance
window.OfflineDictionary = new SimpleOfflineDictionary();

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    // Start loading immediately
    setTimeout(() => {
        window.OfflineDictionary.initialize().catch(console.error);
    }, 500);
    
    // Also set up network detection
    function updateNetworkStatus() {
        const isOnline = navigator.onLine;
        const indicator = document.getElementById('offlineStatus');
        
        if (indicator) {
            if (isOnline) {
                indicator.classList.remove('show');
            } else {
                indicator.classList.add('show');
                // Ensure dictionary is loaded when offline
                if (!window.OfflineDictionary.loaded) {
                    window.OfflineDictionary.initialize().catch(console.error);
                }
            }
        }
    }
    
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
});