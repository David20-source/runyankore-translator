// ========== PWA INSTALL BUTTON FUNCTIONALITY ==========
// File: static/js/pwa-install.js

(function() {
    console.log('PWA Install: Script loaded');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePWA);
    } else {
        // DOM already loaded
        initializePWA();
    }
    
  function initializePWA() {
    console.log('PWA Install: Initializing...');
    
    // Add Wake Lock hint for mobile
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        console.log('📱 Mobile device detected - enabling sleep prevention features');
        
        // Show hint about PWA benefits after delay (only if not already installed)
        setTimeout(() => {
            if (!window.matchMedia('(display-mode: standalone)').matches && 
                !window.navigator.standalone) {
                console.log('📱 PWA benefits: Better sleep management, offline use, faster loading');
                // Show notification about PWA benefits
                if (typeof showNotification === 'function') {
                    showNotification('📱 Install as app for better sleep management & offline use', 'info');
                }
            }
        }, 8000); // Show after 8 seconds
    }
    
        
        const installContainer = document.getElementById('pwaInstallContainer');
        const installBtn = document.getElementById('installAppBtn');
        
        if (!installContainer || !installBtn) {
            console.error('PWA Install: Required elements not found!');
            return;
        }
        
        let deferredPrompt = null;
        
        // Check if we can install PWA
        const canInstallPWA = 'serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window;
        
        if (!canInstallPWA) {
            console.log('PWA Install: Not supported on this browser');
            // Handle iOS separately
            if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
                setTimeout(() => {
                    showNotification('📱 Tap Share → "Add to Home Screen" to install this app', 'info');
                }, 5000);
            }
            return;
        }
        
        // Listen for the beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', function(e) {
            console.log('PWA Install: beforeinstallprompt event fired');
            
            // Prevent Chrome from automatically showing the prompt
            e.preventDefault();
            
            // Stash the event so it can be triggered later
            deferredPrompt = e;
            
            // Show the install button
            if (installContainer) {
                installContainer.style.display = 'flex'; // CHANGE TO FLEX
                installBtn.classList.add('pulse');
                console.log('PWA Install: Button shown');
            }
            
            // Show a notification
            showNotification('✨ Install this app for faster access and offline use!', 'info');
        });
        
        // Handle install button click
        installBtn.addEventListener('click', async function() {
            console.log('PWA Install: Button clicked');
            
            if (!deferredPrompt) {
                console.log('PWA Install: No deferred prompt available');
                showNotification('Installation not available. Try refreshing the page.', 'error');
                return;
            }
            
            // Show the install prompt
            deferredPrompt.prompt();
            
            // Wait for the user to respond to the prompt
            try {
                const choiceResult = await deferredPrompt.userChoice;
                
                if (choiceResult.outcome === 'accepted') {
                    console.log('PWA Install: User accepted the install prompt');
                    showNotification('🎉 App installed successfully! You can now open it from your home screen.', 'success');
                    
                    // Hide the install button after successful installation
                    if (installContainer) {
                        installContainer.style.display = 'none';
                    }
                } else {
                    console.log('PWA Install: User dismissed the install prompt');
                    showNotification('Installation cancelled. You can install it later from the browser menu.', 'info');
                }
            } catch (error) {
                console.error('PWA Install Error:', error);
                showNotification('Installation failed. Please try again.', 'error');
            }
            
            // Clear the deferredPrompt variable
            deferredPrompt = null;
        });
        
        // Hide install button if app is already installed
        window.addEventListener('appinstalled', function() {
            console.log('PWA Install: App was installed');
            if (installContainer) {
                installContainer.style.display = 'none';
            }
            deferredPrompt = null;
            
            // Show welcome message
            setTimeout(() => {
                showNotification('Welcome to the Runyankore Translator app! 🎉', 'success');
            }, 1000);
        });
        
        // Check if app is already installed
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            console.log('PWA Install: App is already installed');
            if (installContainer) {
                installContainer.style.display = 'none';
            }
        }
    }
    
    // Helper function to show notifications
    function showNotification(message, type = 'info') {
        console.log('PWA Notification:', message);
        
        // Try to use existing notification system
        const notification = document.getElementById('notification');
        const messageEl = document.getElementById('notificationMessage');
        
        if (notification && messageEl) {
            messageEl.textContent = message;
            notification.className = `notification ${type}`;
            notification.style.display = 'block';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 4000);
        } else {
            // Fallback alert
            alert(message);
        }
    }
})();