// ============================================================
// BACKGROUND SYNC MANAGER
// Espace Parent CS la Colombe
// ============================================================

class BackgroundSyncManager {
    constructor() {
        this.isSyncing = false;
        this.syncQueue = [];
        this.syncInterval = null;
        this.lastSyncTime = localStorage.getItem('lastSyncTime') || 0;
        this.db = null;
    }
    
    async initialize() {
        console.log('🔄 BackgroundSync: Initialisation...');
        
        await this.initDatabase();
        
        // Vérifier périodiquement
        this.syncInterval = setInterval(() => {
            this.checkAndSync();
        }, 15 * 60 * 1000); // 15 minutes
        
        // Synchroniser au démarrage
        setTimeout(() => this.checkAndSync(), 5000);
        
        // Écouter les événements de connexion
        window.addEventListener('online', () => {
            console.log('🌐 Connexion rétablie - Synchronisation...');
            this.checkAndSync(true);
        });
        
        console.log('✅ BackgroundSync: Initialisé');
    }
    
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('BackgroundSyncDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const store = db.createObjectStore('syncQueue', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('timestamp', 'timestamp');
                    store.createIndex('status', 'status');
                    store.createIndex('type', 'type');
                }
                
                if (!db.objectStoreNames.contains('syncLog')) {
                    db.createObjectStore('syncLog', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                }
            };
        });
    }
    
    async checkAndSync(force = false) {
        if (!navigator.onLine) {
            console.log('🌐 Hors ligne - Synchronisation reportée');
            return;
        }
        
        if (this.isSyncing && !force) {
            console.log('🔄 Synchronisation déjà en cours');
            return;
        }
        
        this.isSyncing = true;
        
        try {
            // Synchroniser les données en attente
            await this.processSyncQueue();
            
            // Vérifier les mises à jour
            await this.checkForUpdates();
            
            this.lastSyncTime = Date.now();
            localStorage.setItem('lastSyncTime', this.lastSyncTime);
            
            console.log('✅ BackgroundSync: Synchronisation terminée');
            
        } catch (error) {
            console.error('❌ BackgroundSync: Erreur synchronisation:', error);
            await this.logError('sync_error', error);
        } finally {
            this.isSyncing = false;
        }
    }
    
    async processSyncQueue() {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readonly');
            const store = transaction.objectStore('syncQueue');
            const index = store.index('status');
            const request = index.getAll('pending');
            
            request.onsuccess = async () => {
                const items = request.result;
                
                if (items.length === 0) {
                    resolve();
                    return;
                }
                
                console.log(`🔄 Synchronisation de ${items.length} élément(s) en attente`);
                
                for (const item of items) {
                    try {
                        await this.syncItem(item);
                        await this.markAsSynced(item.id);
                    } catch (error) {
                        console.error('❌ Erreur synchronisation item:', item, error);
                        await this.markAsFailed(item.id, error);
                    }
                }
                
                resolve();
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async syncItem(item) {
        switch(item.type) {
            case 'notification':
                await this.syncNotification(item.data);
                break;
            case 'grade':
                await this.syncGrade(item.data);
                break;
            case 'incident':
                await this.syncIncident(item.data);
                break;
            case 'homework':
                await this.syncHomework(item.data);
                break;
            case 'communique':
                await this.syncCommunique(item.data);
                break;
            default:
                console.log('Type inconnu:', item.type);
        }
    }
    
    async syncNotification(data) {
        // Implémenter la synchronisation des notifications
        console.log('📨 Sync notification:', data);
        return true;
    }
    
    async syncGrade(data) {
        // Implémenter la synchronisation des notes
        console.log('📊 Sync grade:', data);
        return true;
    }
    
    async syncIncident(data) {
        // Implémenter la synchronisation des incidents
        console.log('⚠️ Sync incident:', data);
        return true;
    }
    
    async syncHomework(data) {
        // Implémenter la synchronisation des devoirs
        console.log('📚 Sync homework:', data);
        return true;
    }
    
    async syncCommunique(data) {
        // Implémenter la synchronisation des communiqués
        console.log('📄 Sync communique:', data);
        return true;
    }
    
    async markAsSynced(id) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async markAsFailed(id, error) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                item.status = 'failed';
                item.error = error.message;
                item.retryCount = (item.retryCount || 0) + 1;
                
                const putRequest = store.put(item);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
    
    async checkForUpdates() {
        try {
            const response = await fetch('/version.json?t=' + Date.now());
            const data = await response.json();
            
            const currentVersion = localStorage.getItem('app_version');
            
            if (data.version !== currentVersion) {
                console.log(`🆕 Nouvelle version disponible: ${data.version}`);
                
                // Notifier l'utilisateur
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Mise à jour disponible', {
                        body: `Version ${data.version} disponible`,
                        icon: '/icons/icon-192x192.png',
                        badge: '/icons/icon-72x72.png',
                        tag: 'update-notification',
                        requireInteraction: true
                    });
                }
                
                // Stocker l'information
                localStorage.setItem('new_version_available', data.version);
                localStorage.setItem('new_version_mandatory', data.mandatory);
            }
            
        } catch (error) {
            console.error('❌ Erreur vérification mise à jour:', error);
        }
    }
    
    async logError(type, error) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncLog'], 'readwrite');
            const store = transaction.objectStore('syncLog');
            
            const logEntry = {
                type: type,
                error: error.message,
                stack: error.stack,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                online: navigator.onLine
            };
            
            const request = store.add(logEntry);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    addToQueue(type, data) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            
            const item = {
                type: type,
                data: data,
                timestamp: Date.now(),
                status: 'pending',
                retryCount: 0
            };
            
            const request = store.add(item);
            
            request.onsuccess = () => {
                console.log(`✅ Élément ajouté à la file d'attente: ${type}`);
                resolve();
                
                // Essayer de synchroniser immédiatement
                if (navigator.onLine && !this.isSyncing) {
                    this.checkAndSync();
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    getStatus() {
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            queueCount: this.syncQueue.length,
            online: navigator.onLine
        };
    }
}

// Exporter pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackgroundSyncManager;
} else {
    window.BackgroundSyncManager = BackgroundSyncManager;
}