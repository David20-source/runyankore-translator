// trash.js - Trash Bin Management
let selectedItems = new Set();

// Initialize trash page
document.addEventListener('DOMContentLoaded', function() {
    console.log('Trash page initialized');
    
    // Initialize event listeners
    initializeEventListeners();
    initializeTableFilters();
});

function initializeEventListeners() {
    // Empty Trash button
    document.getElementById('emptyTrashBtn')?.addEventListener('click', showEmptyTrashModal);
    document.getElementById('closeEmptyTrashModal')?.addEventListener('click', closeEmptyTrashModal);
    document.getElementById('cancelEmptyTrash')?.addEventListener('click', closeEmptyTrashModal);
    document.getElementById('confirmEmptyTrash')?.addEventListener('click', emptyTrash);
    
    // Restore buttons
    document.querySelectorAll('.btn-restore').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            restoreItem(id);
        });
    });
    
    // Permanent delete buttons
    document.querySelectorAll('.btn-permanent-delete').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            permanentDeleteItem(id);
        });
    });
    
    // Bulk selection
    document.getElementById('selectAllCheckbox')?.addEventListener('change', toggleSelectAll);
    document.querySelectorAll('.item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelection);
    });
    
    // Bulk action buttons
    document.getElementById('cancelBulkSelect')?.addEventListener('click', clearSelection);
    document.getElementById('bulkRestoreBtn')?.addEventListener('click', bulkRestore);
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', bulkDelete);
}

function initializeTableFilters() {
    // Search functionality
    const searchInput = document.getElementById('searchTrash');
    if (searchInput) {
        searchInput.addEventListener('input', filterTable);
    }
    
    // Category filter
    const categoryFilter = document.getElementById('filterCategory');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterTable);
    }
    
    // Date filter
    const dateFilter = document.getElementById('filterDate');
    if (dateFilter) {
        dateFilter.addEventListener('change', filterTable);
    }
}

// ========== TABLE FILTERING ==========

function filterTable() {
    const searchTerm = document.getElementById('searchTrash').value.toLowerCase();
    const categoryFilter = document.getElementById('filterCategory').value;
    const dateFilter = document.getElementById('filterDate').value;
    
    const rows = document.querySelectorAll('#trashTable tbody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const runyankore = row.cells[2].textContent.toLowerCase();
        const english = row.cells[3].textContent.toLowerCase();
        const category = row.getAttribute('data-category');
        const deletedAt = row.getAttribute('data-deleted-at');
        
        let shouldShow = true;
        
        // Search filter
        if (searchTerm && !runyankore.includes(searchTerm) && !english.includes(searchTerm)) {
            shouldShow = false;
        }
        
        // Category filter
        if (categoryFilter && category !== categoryFilter) {
            shouldShow = false;
        }
        
        // Date filter
        if (dateFilter && deletedAt) {
            const deletedDate = new Date(deletedAt);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - parseInt(dateFilter));
            
            if (deletedDate < cutoffDate) {
                shouldShow = false;
            }
        }
        
        if (shouldShow) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    // Show/hide no results message
    const noResultsMessage = document.getElementById('noResultsMessage');
    const tableContainer = document.querySelector('.table-responsive');
    
    if (visibleCount === 0 && rows.length > 0) {
        if (noResultsMessage) noResultsMessage.style.display = 'block';
        if (tableContainer) tableContainer.style.display = 'none';
    } else {
        if (noResultsMessage) noResultsMessage.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'block';
    }
}

// ========== BULK SELECTION ==========

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.item-checkbox');
    
    checkboxes.forEach(checkbox => {
        if (checkbox.closest('tr').style.display !== 'none') {
            checkbox.checked = selectAll.checked;
            updateCheckboxSelection(checkbox);
        }
    });
    
    updateBulkActionsBar();
}

function updateSelection(event) {
    updateCheckboxSelection(event.target);
    updateBulkActionsBar();
}

function updateCheckboxSelection(checkbox) {
    const id = parseInt(checkbox.value);
    
    if (checkbox.checked) {
        selectedItems.add(id);
    } else {
        selectedItems.delete(id);
        // Uncheck select all if any checkbox is unchecked
        document.getElementById('selectAllCheckbox').checked = false;
    }
}

function updateBulkActionsBar() {
    const bulkActionsBar = document.getElementById('bulkActionsBar');
    const selectedCount = document.getElementById('selectedCount');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    
    if (selectedItems.size > 0) {
        bulkActionsBar.style.display = 'flex';
        selectedCount.textContent = selectedItems.size;
        
        // Update select all checkbox state
        const visibleCheckboxes = Array.from(document.querySelectorAll('.item-checkbox'))
            .filter(cb => cb.closest('tr').style.display !== 'none');
        const allVisibleChecked = visibleCheckboxes.every(cb => cb.checked);
        selectAllCheckbox.checked = allVisibleChecked;
    } else {
        bulkActionsBar.style.display = 'none';
        selectAllCheckbox.checked = false;
    }
}

function clearSelection() {
    selectedItems.clear();
    document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('selectAllCheckbox').checked = false;
    updateBulkActionsBar();
}

// ========== RESTORE FUNCTIONS ==========

async function restoreItem(id) {
    if (!confirm('Restore this translation?')) return;
    
    try {
        const response = await fetch(`/admin/api/trash/restore/${id}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show notification BEFORE animation
            showNotification(data.message || 'Translation restored successfully', 'success');
            
            // Remove row from table
            const row = document.querySelector(`tr[data-translation-id="${id}"]`);
            if (row) {
                row.style.transition = 'all 0.3s ease';
                row.style.opacity = '0';
                row.style.height = '0';
                row.style.overflow = 'hidden';
                row.style.padding = '0';
                row.style.margin = '0';
                
                setTimeout(() => {
                    row.remove();
                    updateTrashStats();
                    updateEmptyTrashButton();
                    
                    // Check if table is now empty
                    const remainingRows = document.querySelectorAll('#trashTable tbody tr');
                    if (remainingRows.length === 0) {
                        window.location.reload(); // Reload to show empty state
                    }
                }, 300);
            } else {
                // If row not found, update stats anyway
                updateTrashStats();
                updateEmptyTrashButton();
            }
        } else {
            showNotification(data.message || data.error || 'Failed to restore translation', 'error');
        }
    } catch (error) {
        console.error('Restore error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

async function bulkRestore() {
    if (selectedItems.size === 0) return;
    
    if (!confirm(`Restore ${selectedItems.size} selected items?`)) return;
    
    try {
        const response = await fetch('/admin/api/trash/bulk/restore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: Array.from(selectedItems) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`${data.restored_count} items restored successfully`, 'success');
            
            // Remove selected rows
            selectedItems.forEach(id => {
                const row = document.querySelector(`tr[data-translation-id="${id}"]`);
                if (row) row.remove();
            });
            
            selectedItems.clear();
            updateBulkActionsBar();
            updateTrashStats();
            updateEmptyTrashButton();
        } else {
            showNotification(data.error || 'Failed to restore items', 'error');
        }
    } catch (error) {
        console.error('Bulk restore error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

// ========== DELETE FUNCTIONS ==========

async function permanentDeleteItem(id) {
    if (!confirm('Permanently delete this translation? This cannot be undone!')) return;
    
    try {
        const response = await fetch(`/admin/api/trash/permanent/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show notification BEFORE animation
            showNotification(data.message || 'Translation permanently deleted', 'success');
            
            // Remove row from table
            const row = document.querySelector(`tr[data-translation-id="${id}"]`);
            if (row) {
                row.style.transition = 'all 0.3s ease';
                row.style.opacity = '0';
                row.style.height = '0';
                row.style.overflow = 'hidden';
                row.style.padding = '0';
                row.style.margin = '0';
                
                setTimeout(() => {
                    row.remove();
                    updateTrashStats();
                    updateEmptyTrashButton();
                    
                    // Check if table is now empty
                    const remainingRows = document.querySelectorAll('#trashTable tbody tr');
                    if (remainingRows.length === 0) {
                        window.location.reload(); // Reload to show empty state
                    }
                }, 300);
            } else {
                // If row not found, update stats anyway
                updateTrashStats();
                updateEmptyTrashButton();
            }
        } else {
            showNotification(data.message || data.error || 'Failed to delete translation', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

async function bulkDelete() {
    if (selectedItems.size === 0) return;
    
    if (!confirm(`Permanently delete ${selectedItems.size} selected items? This cannot be undone!`)) return;
    
    try {
        const response = await fetch('/admin/api/trash/bulk/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: Array.from(selectedItems) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`${data.deleted_count} items permanently deleted`, 'success');
            
            // Remove selected rows
            selectedItems.forEach(id => {
                const row = document.querySelector(`tr[data-translation-id="${id}"]`);
                if (row) row.remove();
            });
            
            selectedItems.clear();
            updateBulkActionsBar();
            updateTrashStats();
            updateEmptyTrashButton();
        } else {
            showNotification(data.error || 'Failed to delete items', 'error');
        }
    } catch (error) {
        console.error('Bulk delete error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

// ========== EMPTY TRASH ==========

function showEmptyTrashModal() {
    const modal = document.getElementById('emptyTrashModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeEmptyTrashModal() {
    const modal = document.getElementById('emptyTrashModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function emptyTrash() {
    closeEmptyTrashModal();
    
    try {
        const response = await fetch('/admin/api/trash/empty', {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Trash emptied successfully (${data.count} items removed)`, 'success');
            
            // Remove all rows from table
            const rows = document.querySelectorAll('#trashTable tbody tr');
            rows.forEach(row => {
                row.style.transition = 'all 0.3s ease';
                row.style.opacity = '0';
                row.style.height = '0';
                row.style.overflow = 'hidden';
            });
            
            setTimeout(() => {
                // Reload page to show empty state
                window.location.reload();
            }, 500);
        } else {
            showNotification(data.error || 'Failed to empty trash', 'error');
        }
    } catch (error) {
        console.error('Empty trash error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

// ========== HELPER FUNCTIONS ==========

function updateTrashStats() {
    const itemCount = document.querySelectorAll('#trashTable tbody tr').length;
    const countElement = document.querySelector('.stat-info h3');
    if (countElement) {
        countElement.textContent = itemCount;
    }
}

function updateEmptyTrashButton() {
    const itemCount = document.querySelectorAll('#trashTable tbody tr').length;
    const emptyBtn = document.getElementById('emptyTrashBtn');
    if (emptyBtn) {
        emptyBtn.disabled = itemCount === 0;
    }
}

// ========== NOTIFICATION FUNCTION ==========

function showNotification(message, type = 'success') {
    console.log('Showing notification:', message, type);
    
    let notification = document.getElementById('notification');
    
    // If notification element doesn't exist, create it
    if (!notification) {
        console.log('Creating notification element');
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    
    // Always set the content (overwrites previous content)
    notification.innerHTML = `<span>${message}</span>`;
    
    // Reset and apply classes
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('show');
    
    // Ensure it's visible
    notification.style.display = 'block';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        // Hide after animation completes
        setTimeout(() => {
            notification.style.display = 'none';
        }, 300);
    }, 3000);
}

// ========== TEST FUNCTION ==========
// Uncomment to test notifications
/*
function testNotifications() {
    console.log('Testing notifications...');
    showNotification('Test success notification!', 'success');
    setTimeout(() => showNotification('Test error notification!', 'error'), 1000);
    setTimeout(() => showNotification('Test info notification!', 'info'), 2000);
}

// Add this button to your HTML for testing:
// <button onclick="testNotifications()" style="position:fixed;bottom:10px;right:10px;padding:10px;background:blue;color:white;">Test Notifications</button>
*/