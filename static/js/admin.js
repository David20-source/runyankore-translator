// admin.js - COMPLETELY FIXED VERSION

// ========== PENDING REVIEW COUNT FUNCTIONS ==========
async function updatePendingReviewCount() {
    try {
        const response = await fetch('/admin/api/translations/pending');
        
        if (response.ok) {
            const data = await response.json();
            const count = data.success ? data.count : 0;
            
            // Update the badge in the sidebar
            const badgeElement = document.getElementById('pendingReviewCount');
            if (badgeElement) {
                badgeElement.textContent = count;
                
                // Add/remove styling based on count
                if (count > 0) {
                    badgeElement.classList.add('has-pending');
                } else {
                    badgeElement.classList.remove('has-pending');
                }
            }
            
            return count;
        }
    } catch (error) {
        console.error('Error fetching pending count:', error);
    }
    return 0;
}

let currentEditId = null;

function showAddModal() {
    document.getElementById('addModal').classList.add('active');
    document.getElementById('addRunyankore').focus();
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
    document.getElementById('addTranslationForm').reset();
}

function showImportModal() {
    document.getElementById('importModal').classList.add('active');
    document.getElementById('importText').focus();
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
    document.getElementById('importFile').value = '';
    document.getElementById('importText').value = '';
    document.getElementById('importPreview').style.display = 'none';
}

async function submitAddTranslation() {
    const runyankore = document.getElementById('addRunyankore').value.trim();
    const english = document.getElementById('addEnglish').value.trim();
    const category = document.getElementById('addCategory').value || 'general';
    
    if (!runyankore || !english) {
        showNotification('Both Runyankore and English fields are required', 'error');
        return;
    }
    
    console.log('Adding translation:', { runyankore, english, category });
    
    try {
        // FIXED: Changed to consistent endpoint pattern (matching others)
         const response = await fetch('/api/translations/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                runyankore: runyankore,
                english: english,
                category: category
            })
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            showNotification(data.message || 'Translation added successfully!', 'success');
            closeAddModal();
            
            // Update pending review count immediately
            updatePendingReviewCount();
            
            // FIXED: Delay reload so notification is visible
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showNotification(data.message || 'Failed to add translation', 'error');
        }
    } catch (error) {
        console.error('Add translation error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

// ========== EDIT FUNCTIONS ==========

function editTranslation(id) {
    console.log('Editing translation ID:', id);
    
    fetch('/admin/api/translations/get/' + id)
        .then(function(response) {
            console.log('Edit fetch response:', response.status);
            return response.json();
        })
        .then(function(data) {
            console.log('Edit fetch data:', data);
            if (data.success) {
                const trans = data.translation;
                currentEditId = id;
                
                // Fill edit form
                document.getElementById('editTranslationId').value = id;
                document.getElementById('editRunyankore').value = trans.runyankore || '';
                document.getElementById('editEnglish').value = trans.english || '';
                document.getElementById('editCategory').value = trans.category || 'general';
                
                // Show edit modal
                document.getElementById('editModal').classList.add('active');
                document.getElementById('editRunyankore').focus();
                
                showNotification('Translation loaded for editing', 'info');
            } else {
                showNotification('Failed to fetch translation details: ' + (data.message || ''), 'error');
            }
        })
        .catch(function(error) {
            console.error('Edit fetch error:', error);
            showNotification('Network error. Please try again.', 'error');
        });
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    currentEditId = null;
    document.getElementById('editTranslationForm').reset();
}

async function submitEditTranslation() {
    const id = document.getElementById('editTranslationId').value;
    const runyankore = document.getElementById('editRunyankore').value.trim();
    const english = document.getElementById('editEnglish').value.trim();
    const category = document.getElementById('editCategory').value || 'general';
    
    if (!runyankore || !english) {
        showNotification('Both Runyankore and English fields are required', 'error');
        return;
    }
    
    console.log('Updating translation ID:', id, { runyankore, english, category });
    
    try {
        const response = await fetch('/admin/api/translations/' + id, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                runyankore: runyankore,
                english: english,
                category: category
            })
        });
        
        console.log('Edit response status:', response.status);
        const data = await response.json();
        console.log('Edit response data:', data);
        
        if (data.success) {
            showNotification(data.message || 'Translation updated successfully!', 'success');
            closeEditModal();
            
            // FIXED: Delay reload so notification is visible
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showNotification(data.message || data.error || 'Failed to update translation', 'error');
        }
    } catch (error) {
        console.error('Edit translation error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

// Delete function - IMPROVED VERSION
function deleteTranslation(id) {
    console.log('Deleting translation ID:', id);
    
    if (confirm('Are you sure you want to delete this translation?')) {
        fetch('/admin/api/translations/' + id, {
            method: 'DELETE'
        })
        .then(function(response) {
            console.log('Delete response status:', response.status);
            return response.json();
        })
        .then(function(data) {
            console.log('Delete response data:', data);
            if (data.success) {
                showNotification(data.message || 'Translation deleted successfully!', 'success');
                
                // FIXED: Remove the row from table immediately with animation
                const row = document.querySelector(`tr[data-translation-id="${id}"]`);
                if (row) {
                    row.style.transition = 'all 0.5s ease';
                    row.style.opacity = '0';
                    row.style.height = '0';
                    row.style.overflow = 'hidden';
                    row.style.padding = '0';
                    row.style.margin = '0';
                    row.style.border = 'none';
                    
                    setTimeout(() => {
                        row.remove();
                        // Optional: Update the total count display
                        updateTotalCount();
                    }, 500);
                } else {
                    // Fallback: reload after delay if row not found
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                }
            } else {
                showNotification(data.message || 'Failed to delete translation', 'error');
            }
        })
        .catch(function(error) {
            console.error('Delete translation error:', error);
            showNotification('Network error. Please try again.', 'error');
        });
    }
}

// Helper function to update total count display
function updateTotalCount() {
    const totalElement = document.querySelector('.stat-info h3');
    if (totalElement) {
        const currentTotal = parseInt(totalElement.textContent) || 0;
        totalElement.textContent = (currentTotal - 1).toString();
    }
}

// Export function
async function exportData() {
    try {
        const response = await fetch('/admin/api/export');
        const data = await response.json();
        
        if (data.success) {
            // Create a download link
            const jsonData = JSON.stringify(data.data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'runyankore-translations-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('Exported ' + data.count + ' translations', 'success');
        } else {
            showNotification(data.error || 'Export failed', 'error');
        }
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Export failed', 'error');
    }
}

// Import functions
function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            document.getElementById('importText').value = JSON.stringify(data, null, 2);
            showPreview(data);
        } catch (error) {
            showNotification('Invalid JSON file', 'error');
        }
    };
    reader.readAsText(file);
}

function showPreview(data) {
    const preview = document.getElementById('previewContent');
    const importPreview = document.getElementById('importPreview');
    
    if (!Array.isArray(data) || data.length === 0) {
        importPreview.style.display = 'none';
        return;
    }
    
    let html = '<div style="margin-top: 10px;">';
    const previewItems = data.slice(0, 3);
    previewItems.forEach(function(item) {
        html += '<div style="margin-bottom: 10px; padding: 10px; background: white; border-radius: 5px;">' +
            '<strong>' + (item.runyankore || '') + '</strong> → ' + (item.english || '');
        if (item.category) {
            html += '<span style="color: #6b7280; font-size: 0.9em;"> (' + item.category + ')</span>';
        }
        html += '</div>';
    });
    
    if (data.length > 3) {
        html += '<div style="color: #6b7280; font-size: 0.9em;">... and ' + (data.length - 3) + ' more</div>';
    }
    html += '</div>';
    
    preview.innerHTML = html;
    importPreview.style.display = 'block';
}

async function submitImport() {
    const importText = document.getElementById('importText').value.trim();
    
    if (!importText) {
        showNotification('Please provide JSON data to import', 'error');
        return;
    }
    
    try {
        const data = JSON.parse(importText);
        
        if (!Array.isArray(data)) {
            showNotification('JSON data must be an array of translations', 'error');
            return;
        }
        
        const response = await fetch('/admin/api/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ translations: data })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            closeImportModal();
            
            // FIXED: Delay reload so notification is visible
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showNotification(result.error || 'Import failed', 'error');
        }
    } catch (error) {
        console.error('Import error:', error);
        showNotification('Invalid JSON data', 'error');
    }
}

// Notification function - IMPROVED VERSION
function showNotification(message, type = 'success') {
    console.log('Showing notification:', message, type);
    
    let notification = document.getElementById('notification');
    if (!notification) {
        console.log('Creating notification element');
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        notification.innerHTML = '<span id="notificationMessage"></span>';
        document.body.appendChild(notification);
        
        // Add CSS if needed
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 15px 25px;
                    border-radius: 10px;
                    color: white;
                    font-weight: 500;
                    z-index: 99999;
                    transform: translateX(120%);
                    opacity: 0;
                    transition: all 0.5s ease;
                    max-width: 400px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                }
                .notification.show {
                    transform: translateX(0);
                    opacity: 1;
                }
                .notification.success {
                    background: #10b981;
                    border-left: 4px solid #059669;
                }
                .notification.error {
                    background: #ef4444;
                    border-left: 4px solid #dc2626;
                }
                .notification.info {
                    background: #3b82f6;
                    border-left: 4px solid #1d4ed8;
                }
                .notification.warning {
                    background: #f59e0b;
                    border-left: 4px solid #d97706;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    const messageSpan = document.getElementById('notificationMessage');
    if (messageSpan) {
        messageSpan.textContent = message;
    } else {
        notification.textContent = message;
    }
    
    // Reset classes
    notification.className = 'notification';
    notification.classList.add(type);
    
    // Force reflow
    notification.offsetHeight;
    
    // Add show class
    notification.classList.add('show');
    
    console.log('Notification classes:', notification.className);
    
    // Auto-hide after 4 seconds
    setTimeout(function() {
        notification.classList.remove('show');
        // Remove from DOM after animation
        setTimeout(() => {
            if (notification.parentNode && !notification.classList.contains('show')) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 4000);
}

// Test function for debugging
function testNotificationSystem() {
    console.log('Testing notification system...');
    showNotification('Test notification - Success!', 'success');
    setTimeout(() => showNotification('Test notification - Error!', 'error'), 1000);
    setTimeout(() => showNotification('Test notification - Info!', 'info'), 2000);
}

// Initialize dashboard with event listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin dashboard initialized - FIXED VERSION');

     // Initialize filter and sort
    initFilterSort();
    
    // Initialize and update pending review count
    updatePendingReviewCount();
    // Set auto-refresh every 30 seconds
    setInterval(updatePendingReviewCount, 15000);
    
    // Listen for messages from review page
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'updatePendingCount') {
            updatePendingReviewCount();
        }
    });
    
    // Add Translation button in sidebar
    const addTranslationBtn = document.getElementById('addTranslationBtn');
    if (addTranslationBtn) {
        addTranslationBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showAddModal();
        });
    }

      // ========== ADD THIS FOR OFFLINE DB UPDATE ==========
    const updateOfflineDBBtn = document.getElementById('updateOfflineDB');
    if (updateOfflineDBBtn) {
        updateOfflineDBBtn.addEventListener('click', function(e) {
            e.preventDefault();
            updateOfflineDatabase();
        });
    }

        // ========== ADD SMOOTH SCROLL TO TRANSLATIONS HERE ==========
    const translationsLink = document.getElementById('translationsLink');
    const viewAllTranslations = document.getElementById('viewAllTranslations');
    
    function scrollToTranslations() {
        const target = document.getElementById('translationsSection');
        if (target) {
            // Scroll smoothly to the translations section
            target.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start'
            });
            
            // Optional: Add a temporary highlight
            target.style.transition = 'box-shadow 0.3s ease';
            target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
            
            setTimeout(() => {
                target.style.boxShadow = '';
            }, 1500);
            
            return true;
        }
        return false;
    }
    
    // Add event listener for sidebar Translations link
    if (translationsLink) {
        translationsLink.addEventListener('click', function(e) {
            e.preventDefault();
            scrollToTranslations();
        });
    }
    
    // Add event listener for Quick Actions "View All Translations"
    if (viewAllTranslations) {
        viewAllTranslations.addEventListener('click', function(e) {
            e.preventDefault();
            scrollToTranslations();
        });
    }
    
    // Quick Actions buttons
    document.getElementById('addNewTranslation')?.addEventListener('click', function(e) {
        e.preventDefault();
        showAddModal();
    });
    
    document.getElementById('exportData')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportData();
    });
    
    document.getElementById('importData')?.addEventListener('click', function(e) {
        e.preventDefault();
        showImportModal();
    });
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            window.location.reload();
        });
    }
    
    // Edit buttons - FIXED selector
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-edit-id');
            if (id) editTranslation(id);
        });
    });
    
    // Delete buttons - FIXED selector
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-delete-id');
            if (id) deleteTranslation(id);
        });
    });
    
    // Modal close buttons
    document.getElementById('closeAddModal')?.addEventListener('click', closeAddModal);
    document.getElementById('cancelAddModal')?.addEventListener('click', closeAddModal);
    document.getElementById('closeEditModal')?.addEventListener('click', closeEditModal);
    document.getElementById('cancelEditModal')?.addEventListener('click', closeEditModal);
    document.getElementById('closeImportModal')?.addEventListener('click', closeImportModal);
    document.getElementById('cancelImportModal')?.addEventListener('click', closeImportModal);
    
    // Submit buttons
    document.getElementById('submitAddTranslation')?.addEventListener('click', submitAddTranslation);
    document.getElementById('submitEditTranslation')?.addEventListener('click', submitEditTranslation);
    document.getElementById('submitImport')?.addEventListener('click', submitImport);
    
    // Import file input
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', function() {
            handleFileSelect(this);
        });
    }
    
    // Import textarea preview
    const importText = document.getElementById('importText');
    if (importText) {
        importText.addEventListener('input', function() {
            try {
                const data = JSON.parse(this.value);
                showPreview(data);
            } catch {
                document.getElementById('importPreview').style.display = 'none';
            }
        });
    }
    
    // Close modals when clicking outside
    document.addEventListener('click', function(event) {
        const modals = document.querySelectorAll('.modal.active');
        modals.forEach(function(modal) {
            if (event.target === modal) {
                if (modal.id === 'addModal') closeAddModal();
                if (modal.id === 'editModal') closeEditModal();
                if (modal.id === 'importModal') closeImportModal();
            }
        });
    });
    
    // Close modals with Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeAddModal();
            closeEditModal();
            closeImportModal();
        }
    });
    
    // Optional: Add a test button for debugging
    const debugButton = document.createElement('button');
    debugButton.textContent = 'Test Notifications';
    debugButton.style.cssText = 'position:fixed;bottom:10px;right:10px;padding:10px;background:#007bff;color:white;border:none;border-radius:5px;z-index:99999;';
    debugButton.addEventListener('click', testNotificationSystem);
    document.body.appendChild(debugButton);
    
    console.log('Event listeners attached successfully');
});

// ==================== OFFLINE DATABASE SYNC ====================

/**
 * Update offline database (syncs from main DB to offline DB)
 */
async function updateOfflineDatabase() {
    if (!confirm('Update offline database? This will sync all current translations to the offline version for mobile/offline use.')) {
        return;
    }
    
    try {
        showNotification('Updating offline database...', 'info');
        
        const response = await fetch('/admin/api/export-offline', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Offline database exported successfully!', 'success');
            
            // Wait a bit for the file to be written
            setTimeout(async () => {
                // Force reload the offline dictionary on main page
                if (window.OfflineDictionary && window.OfflineDictionary.forceReload) {
                    const reloaded = await window.OfflineDictionary.forceReload();
                    if (reloaded) {
                        showNotification('Offline dictionary is now up to date!', 'success');
                    }
                } else {
                    showNotification('Please refresh the main page to see updates', 'info');
                }
            }, 1500);
            
        } else {
            showNotification('Export failed: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Update offline DB error:', error);
        showNotification('Network error while updating offline database', 'error');
    }
}

// Make function globally available
window.updateOfflineDatabase = updateOfflineDatabase;

// ========== FILTER AND SORT FUNCTIONS ==========

let currentFilter = '';
let currentSearchField = 'all';
let currentSort = 'runyankore';

function highlightText(text, searchTerm) {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight-search">$1</span>');
}

function filterAndSortTranslations() {
    const searchTerm = currentFilter.toLowerCase().trim();
    const rows = document.querySelectorAll('#translationsTableBody tr');
    let visibleCount = 0;
    
    if (rows.length === 0) return 0;
    
    // Store original rows data for sorting
    const rowsArray = Array.from(rows);
    
    // Apply filtering
    const filteredRows = rowsArray.filter(row => {
        if (!searchTerm) return true;
        
        if (currentSearchField === 'all') {
            const runyankore = row.dataset.runyankore || '';
            const english = row.dataset.english || '';
            const category = row.dataset.category || '';
            
            return runyankore.includes(searchTerm) || 
                   english.includes(searchTerm) || 
                   category.includes(searchTerm);
        } else {
            const fieldValue = row.dataset[currentSearchField] || '';
            return fieldValue.includes(searchTerm);
        }
    });
    
    // Apply sorting
    filteredRows.sort((a, b) => {
        let aValue, bValue;
        
        switch(currentSort) {
            case 'runyankore':
                aValue = a.dataset.runyankore || '';
                bValue = b.dataset.runyankore || '';
                return aValue.localeCompare(bValue);
                
            case 'runyankore_desc':
                aValue = a.dataset.runyankore || '';
                bValue = b.dataset.runyankore || '';
                return bValue.localeCompare(aValue);
                
            case 'english':
                aValue = a.dataset.english || '';
                bValue = b.dataset.english || '';
                return aValue.localeCompare(bValue);
                
            case 'english_desc':
                aValue = a.dataset.english || '';
                bValue = b.dataset.english || '';
                return bValue.localeCompare(aValue);
                
            case 'category':
                aValue = a.dataset.category || '';
                bValue = b.dataset.category || '';
                return aValue.localeCompare(bValue);
                
            case 'category_desc':
                aValue = a.dataset.category || '';
                bValue = b.dataset.category || '';
                return bValue.localeCompare(aValue);
                
            case 'id':
                aValue = parseInt(a.dataset.translationId) || 0;
                bValue = parseInt(b.dataset.translationId) || 0;
                return aValue - bValue;
                
            case 'id_desc':
                aValue = parseInt(a.dataset.translationId) || 0;
                bValue = parseInt(b.dataset.translationId) || 0;
                return bValue - aValue;
                
            default:
                return 0;
        }
    });
    
    // Update table body
    const tbody = document.getElementById('translationsTableBody');
    if (!tbody) return 0;
    
    tbody.innerHTML = '';
    
    filteredRows.forEach(row => {
        // Clone the row to avoid reference issues
        const newRow = row.cloneNode(true);
        
        // Remove any existing highlight classes first
        newRow.classList.remove('highlight');
        
        // Apply highlighting if search term exists
        if (searchTerm) {
            const cells = newRow.querySelectorAll('td:not(:last-child)');
            let hasHighlight = false;
            
            cells.forEach((cell, index) => {
                if (index === 1 && (currentSearchField === 'all' || currentSearchField === 'runyankore')) {
                    const originalText = row.dataset.runyankore || '';
                    if (originalText.includes(searchTerm)) {
                        const strongEl = cell.querySelector('strong');
                        if (strongEl) {
                            strongEl.innerHTML = highlightText(strongEl.textContent, searchTerm);
                            hasHighlight = true;
                        }
                    }
                } else if (index === 2 && (currentSearchField === 'all' || currentSearchField === 'english')) {
                    const originalText = row.dataset.english || '';
                    if (originalText.includes(searchTerm)) {
                        cell.innerHTML = highlightText(cell.textContent, searchTerm);
                        hasHighlight = true;
                    }
                } else if (index === 3 && (currentSearchField === 'all' || currentSearchField === 'category')) {
                    const originalText = row.dataset.category || '';
                    if (originalText.includes(searchTerm)) {
                        const badgeEl = cell.querySelector('.category-badge');
                        if (badgeEl) {
                            badgeEl.innerHTML = highlightText(badgeEl.textContent, searchTerm);
                            hasHighlight = true;
                        }
                    }
                }
            });
            
            // Highlight the entire row only if we found matches
            if (hasHighlight) {
                newRow.classList.add('highlight');
            }
        }
        
        tbody.appendChild(newRow);
        visibleCount++;
    });
    
    // Update count display
    const countElement = document.getElementById('tableCount');
    if (countElement) {
        countElement.textContent = visibleCount;
    }
    
    // Update active filters display
    updateActiveFiltersDisplay();
    
    // Reattach event listeners to action buttons
    reattachActionListeners();
    
    return visibleCount;
}

function updateActiveFiltersDisplay() {
    const tagsContainer = document.getElementById('activeFilterTags');
    if (!tagsContainer) return;
    
    tagsContainer.innerHTML = '';
    
    if (currentFilter) {
        const filterTag = document.createElement('div');
        filterTag.className = 'filter-tag';
        filterTag.innerHTML = `
            <span>Search: "${currentFilter}"</span>
            <i class="fas fa-times clear-filter" data-type="search"></i>
        `;
        tagsContainer.appendChild(filterTag);
    }
    
    if (currentSort !== 'runyankore') {
        const sortText = {
            'runyankore_desc': 'Sort: Runyankore (Z-A)',
            'english': 'Sort: English (A-Z)',
            'english_desc': 'Sort: English (Z-A)',
            'category': 'Sort: Category (A-Z)',
            'category_desc': 'Sort: Category (Z-A)',
            'id': 'Sort: ID (Oldest)',
            'id_desc': 'Sort: ID (Newest)'
        }[currentSort] || 'Custom Sort';
        
        const sortTag = document.createElement('div');
        sortTag.className = 'filter-tag';
        sortTag.innerHTML = `
            <span>${sortText}</span>
            <i class="fas fa-times clear-filter" data-type="sort"></i>
        `;
        tagsContainer.appendChild(sortTag);
    }
    
    // Show/hide active filters section
    const activeFiltersSection = document.querySelector('.active-filters');
    if (activeFiltersSection) {
        if (currentFilter || currentSort !== 'runyankore') {
            activeFiltersSection.style.display = 'flex';
        } else {
            activeFiltersSection.style.display = 'none';
        }
    }
}

function reattachActionListeners() {
    // Reattach edit button listeners
    document.querySelectorAll('#translationsTableBody .btn-edit').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-edit-id');
            if (id) editTranslation(id);
        });
    });
    
    // Reattach delete button listeners
    document.querySelectorAll('#translationsTableBody .btn-delete').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-delete-id');
            if (id) deleteTranslation(id);
        });
    });
}

function clearAllFilters() {
    currentFilter = '';
    currentSort = 'runyankore';
    currentSearchField = 'all';
    
    document.getElementById('searchInput').value = '';
    document.getElementById('searchField').value = 'all';
    document.getElementById('sortBy').value = 'runyankore';
    
    // Clear all highlights and show all rows
    const rows = document.querySelectorAll('#translationsTableBody tr');
    const tbody = document.getElementById('translationsTableBody');
    
    if (tbody && rows.length > 0) {
        tbody.innerHTML = '';
        
        // Restore original rows without highlights
        const originalRows = Array.from(rows);
        originalRows.forEach(row => {
            const newRow = row.cloneNode(true);
            
            // Remove highlight classes
            newRow.classList.remove('highlight');
            
            // Restore original text (remove highlight spans)
            const cells = newRow.querySelectorAll('td');
            cells.forEach(cell => {
                if (cell.innerHTML.includes('highlight-search')) {
                    // Replace highlighted text with plain text
                    const span = cell.querySelector('.highlight-search');
                    if (span) {
                        cell.innerHTML = cell.innerHTML.replace(/<span class="highlight-search">([^<]*)<\/span>/g, '$1');
                    }
                }
                
                // Also restore strong elements if they were modified
                const strongEl = cell.querySelector('strong');
                if (strongEl && strongEl.innerHTML.includes('highlight-search')) {
                    strongEl.innerHTML = strongEl.innerHTML.replace(/<span class="highlight-search">([^<]*)<\/span>/g, '$1');
                }
                
                // Restore category badges
                const badgeEl = cell.querySelector('.category-badge');
                if (badgeEl && badgeEl.innerHTML.includes('highlight-search')) {
                    badgeEl.innerHTML = badgeEl.innerHTML.replace(/<span class="highlight-search">([^<]*)<\/span>/g, '$1');
                }
            });
            
            tbody.appendChild(newRow);
        });
        
        // Update count
        const countElement = document.getElementById('tableCount');
        if (countElement) {
            countElement.textContent = rows.length;
        }
    }
    
    // Hide active filters
    const activeFiltersSection = document.querySelector('.active-filters');
    if (activeFiltersSection) {
        activeFiltersSection.style.display = 'none';
    }
    
    // Clear the active filter tags
    const tagsContainer = document.getElementById('activeFilterTags');
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
    }
    
    // Reattach event listeners
    reattachActionListeners();
}

// Initialize filter/sort functionality
function initFilterSort() {
    // Initialize the table display on page load
    setTimeout(() => {
        filterAndSortTranslations();
    }, 100);
    
    // Search input with debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentFilter = this.value;
                filterAndSortTranslations();
            }, 300);
        });
    }
    
    // Clear search button
    const clearSearchBtn = document.getElementById('clearSearch');
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function() {
            if (searchInput) {
                searchInput.value = '';
                currentFilter = '';
                filterAndSortTranslations();
            }
        });
    }
    
    // Search field selector
    const searchField = document.getElementById('searchField');
    if (searchField) {
        searchField.addEventListener('change', function() {
            currentSearchField = this.value;
            if (currentFilter) {
                filterAndSortTranslations();
            }
        });
    }
    
    // Sort selector
    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
        sortBy.addEventListener('change', function() {
            currentSort = this.value;
        });
    }
    
    // Apply sort button
    const applySortBtn = document.getElementById('applySort');
    if (applySortBtn) {
        applySortBtn.addEventListener('click', function() {
            filterAndSortTranslations();
        });
    }
    
    // Clear all filters button
    const clearAllBtn = document.getElementById('clearAllFilters');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', clearAllFilters);
    }
    
    // Clear individual filter tags (event delegation)
    const activeFilterTags = document.getElementById('activeFilterTags');
    if (activeFilterTags) {
        activeFilterTags.addEventListener('click', function(e) {
            if (e.target.classList.contains('clear-filter')) {
                const filterType = e.target.dataset.type;
                
                if (filterType === 'search') {
                    currentFilter = '';
                    if (searchInput) {
                        searchInput.value = '';
                    }
                } else if (filterType === 'sort') {
                    currentSort = 'runyankore';
                    if (sortBy) {
                        sortBy.value = 'runyankore';
                    }
                }
                
                filterAndSortTranslations();
            }
        });
    }
    
    // Enable Enter key to apply search
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                currentFilter = this.value;
                filterAndSortTranslations();
            }
        });
    }
}