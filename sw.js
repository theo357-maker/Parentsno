// ============================================
// SERVICE WORKER PRINCIPAL - VERSION 2.0.0
// Gestion des notifications, cache, synchronisation
// ============================================

const CACHE_NAME = 'cs-parent-v2';
const API_CACHE = 'cs-api-v2';
const DYNAMIC_CACHE = 'cs-dynamic-v2';

const STATIC_ASSETS = [
  '/',
  'index.html',
  'manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ============================================
// INSTALLATION - Mise en cache des assets statiques
// ============================================
self.addEventListener('install', event => {
  console.log('✅ Service Worker: Installation');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Mise en cache des assets statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================
// ACTIVATION - Nettoyage des anciens caches
// ============================================
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activation');
  
  event.waitUntil(
    Promise.all([
      // Nettoyer les anciens caches
      caches.keys().then(keys => {
        return Promise.all(
          keys.filter(key => key !== CACHE_NAME && key !== API_CACHE && key !== DYNAMIC_CACHE)
            .map(key => caches.delete(key))
        );
      }),
      // Prendre le contrôle immédiatement
      self.clients.claim()
    ])
  );
});

// ============================================
// STRATÉGIE DE CACHE (Stale-While-Revalidate)
// ============================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Stratégie pour les assets statiques (Cache First)
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }
  
  // Stratégie pour les API Firebase (Network First avec fallback cache)
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          return caches.open(API_CACHE).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            return new Response(JSON.stringify({ offline: true }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }
  
  // Stratégie par défaut (Network First)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        return caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => caches.match(event.request))
  );
});

// ============================================
// GESTION DES NOTIFICATIONS PUSH
// ============================================
self.addEventListener('push', event => {
  console.log('📨 Push reçu:', event);
  
  let data = {};
  
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'CS la Colombe',
      body: event.data ? event.data.text() : 'Nouvelle notification',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: { type: 'general' }
    };
  }
  
  const options = {
    title: data.title || 'CS la Colombe',
    body: data.body || 'Nouvelle notification',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-72x72.png',
    image: data.image,
    vibrate: [200, 100, 200],
    data: data.data || { type: 'general', url: data.url || '/' },
    actions: data.actions || [
      { action: 'open', title: 'Ouvrir' },
      { action: 'close', title: 'Fermer' }
    ],
    tag: data.tag || `notif-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false
  };
  
  // Mettre à jour le badge
  updateBadgeCount(1);
  
  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// ============================================
// GESTION DES ACTIONS SUR LES NOTIFICATIONS
// ============================================
self.addEventListener('notificationclick', event => {
  console.log('👆 Notification cliquée:', event);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  notification.close();
  
  // Mettre à jour le badge (décrémenter)
  updateBadgeCount(-1);
  
  if (action === 'close') return;
  
  // Ouvrir la bonne page
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Si une fenêtre est déjà ouverte, la focus
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            client.focus();
            // Envoyer un message pour naviguer vers la bonne page
            client.postMessage({
              type: 'NAVIGATE',
              page: data.page || 'dashboard',
              data: data
            });
            return;
          }
        }
        
        // Sinon, ouvrir une nouvelle fenêtre
        return clients.openWindow(data.url || '/index.html');
      })
  );
});

// ============================================
// GESTION DES MESSAGES (Communication avec la page)
// ============================================
self.addEventListener('message', event => {
  console.log('📨 Message reçu du client:', event.data);
  
  switch (event.data.type) {
    case 'SAVE_PARENT_DATA':
      saveParentData(event.data.data);
      break;
      
    case 'CHECK_NOW':
      checkForUpdates(event.data.timestamp);
      break;
      
    case 'UPDATE_BADGE':
      updateBadgeCount(event.data.data.count);
      break;
      
    case 'GET_BADGE_COUNT':
      getBadgeCount().then(count => {
        event.ports[0].postMessage({ count });
      });
      break;
      
    case 'SYNC_NOW':
      syncOfflineData();
      break;
      
    case 'ACTIVATE_NOW':
      console.log('✅ Activation forcée du Service Worker');
      self.skipWaiting();
      break;
      
    case 'PING':
      // Répondre pour maintenir le SW actif
      event.ports[0].postMessage({ type: 'PONG', timestamp: Date.now() });
      break;
  }
});

// ============================================
// SYNCHRONISATION EN ARRIÈRE-PLAN
// ============================================
self.addEventListener('sync', event => {
  console.log('🔄 Synchronisation:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncOfflineData());
  }
  
  if (event.tag === 'periodic-sync') {
    event.waitUntil(periodicCheck());
  }
});

// Synchronisation périodique (toutes les heures)
async function periodicCheck() {
  console.log('⏰ Vérification périodique...');
  
  try {
    // Vérifier si l'utilisateur est connecté
    const parentData = await getParentData();
    if (!parentData) return;
    
    // Vérifier les nouvelles données
    const updates = await checkForUpdates();
    
    if (updates > 0) {
      // Mettre à jour le badge
      await updateBadgeCount(updates);
      
      // Notifier l'utilisateur
      await self.registration.showNotification('📱 Mise à jour disponible', {
        body: `${updates} nouvelle(s) notification(s)`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'update-available',
        data: { type: 'update' }
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur vérification périodique:', error);
  }
}

// ============================================
// SYNCHRONISATION DES DONNÉES HORS LIGNE
// ============================================
async function syncOfflineData() {
  console.log('🔄 Synchronisation des données hors ligne...');
  
  try {
    // Récupérer les données stockées en IndexedDB
    const db = await openDB();
    const offlineNotifications = await getOfflineNotifications(db);
    const pendingActions = await getPendingActions(db);
    
    // Envoyer les notifications en attente
    for (const notif of offlineNotifications) {
      await sendNotification(notif);
      await markNotificationAsSent(db, notif.id);
    }
    
    // Exécuter les actions en attente
    for (const action of pendingActions) {
      await executeAction(action);
      await markActionAsDone(db, action.id);
    }
    
    console.log('✅ Synchronisation terminée');
    
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    
    // Réessayer plus tard
    self.registration.sync.register('sync-notifications');
  }
}

// ============================================
// GESTION DU BADGE D'APPLICATION
// ============================================
async function updateBadgeCount(change) {
  try {
    let count = await getBadgeCount();
    count = Math.max(0, count + change);
    
    // Sauvegarder le nouveau count
    await saveBadgeCount(count);
    
    // Mettre à jour le badge si supporté
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    }
    
    // Informer tous les clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BADGE_UPDATED',
        count: count
      });
    });
    
  } catch (error) {
    console.error('❌ Erreur mise à jour badge:', error);
  }
}

async function getBadgeCount() {
  const db = await openDB();
  const tx = db.transaction('metadata', 'readonly');
  const store = tx.objectStore('metadata');
  const data = await store.get('badgeCount');
  return data?.count || 0;
}

async function saveBadgeCount(count) {
  const db = await openDB();
  const tx = db.transaction('metadata', 'readwrite');
  const store = tx.objectStore('metadata');
  await store.put({ id: 'badgeCount', count });
}

// ============================================
// INDEXEDDB POUR LE STOCKAGE HORS LIGNE
// ============================================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CSParentOfflineDB', 2);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('notifications')) {
        const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
        notifStore.createIndex('timestamp', 'timestamp');
        notifStore.createIndex('sent', 'sent');
      }
      
      if (!db.objectStoreNames.contains('actions')) {
        const actionStore = db.createObjectStore('actions', { keyPath: 'id' });
        actionStore.createIndex('timestamp', 'timestamp');
        actionStore.createIndex('status', 'status');
      }
      
      if (!db.objectStoreNames.contains('parent')) {
        db.createObjectStore('parent', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('children')) {
        const childStore = db.createObjectStore('children', { keyPath: 'matricule' });
        childStore.createIndex('class', 'class');
        childStore.createIndex('type', 'type');
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveParentData(data) {
  const db = await openDB();
  const tx = db.transaction(['parent', 'children'], 'readwrite');
  
  // Sauvegarder les données parent
  const parentStore = tx.objectStore('parent');
  await parentStore.put({ id: 'current', ...data, savedAt: Date.now() });
  
  // Sauvegarder les enfants
  if (data.children) {
    const childStore = tx.objectStore('children');
    for (const child of data.children) {
      await childStore.put(child);
    }
  }
  
  console.log('💾 Données parent sauvegardées hors ligne');
}

async function getParentData() {
  const db = await openDB();
  const tx = db.transaction('parent', 'readonly');
  const store = tx.objectStore('parent');
  return await store.get('current');
}

async function saveOfflineNotification(notification) {
  const db = await openDB();
  const tx = db.transaction('notifications', 'readwrite');
  const store = tx.objectStore('notifications');
  
  await store.put({
    id: notification.id || `offline-${Date.now()}`,
    ...notification,
    savedAt: Date.now(),
    sent: false
  });
}

async function getOfflineNotifications(db) {
  const tx = db.transaction('notifications', 'readonly');
  const store = tx.objectStore('notifications');
  const index = store.index('sent');
  return await index.getAll(IDBKeyRange.only(false));
}

async function markNotificationAsSent(db, id) {
  const tx = db.transaction('notifications', 'readwrite');
  const store = tx.objectStore('notifications');
  const notif = await store.get(id);
  if (notif) {
    notif.sent = true;
    notif.sentAt = Date.now();
    await store.put(notif);
  }
}

// ============================================
// VÉRIFICATION DES MISES À JOUR
// ============================================
async function checkForUpdates() {
  console.log('🔍 Vérification des mises à jour...');
  
  try {
    const parentData = await getParentData();
    if (!parentData || !parentData.matricule) return 0;
    
    let newCount = 0;
    const now = new Date().toISOString();
    const lastCheck = localStorage.getItem('lastCheck') || '2000-01-01';
    
    // Simuler une vérification (à adapter avec Firebase)
    const response = await fetch(`/api/check-updates?parent=${parentData.matricule}&since=${lastCheck}`);
    
    if (response.ok) {
      const data = await response.json();
      newCount = data.count || 0;
      
      if (newCount > 0) {
        // Sauvegarder les notifications
        for (const notif of data.notifications) {
          await saveOfflineNotification(notif);
        }
      }
    }
    
    localStorage.setItem('lastCheck', now);
    return newCount;
    
  } catch (error) {
    console.error('❌ Erreur vérification mises à jour:', error);
    return 0;
  }
}

// ============================================
// GESTION DES MISES À JOUR DU SERVICE WORKER
// ============================================
self.addEventListener('updatefound', () => {
  console.log('🔄 Nouvelle version du Service Worker détectée');
  
  const installingWorker = self.registration.installing;
  
  installingWorker.addEventListener('statechange', () => {
    if (installingWorker.state === 'installed') {
      if (navigator.serviceWorker.controller) {
        // Nouvelle version disponible
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'UPDATE_AVAILABLE',
              version: '2.0.0'
            });
          });
        });
      }
    }
  });
});

// ============================================
// NETTOYAGE PÉRIODIQUE
// ============================================
setInterval(async () => {
  // Nettoyer les vieilles notifications (plus de 30 jours)
  const db = await openDB();
  const tx = db.transaction('notifications', 'readwrite');
  const store = tx.objectStore('notifications');
  const index = store.index('timestamp');
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const oldNotifications = await index.getAll(IDBKeyRange.upperBound(thirtyDaysAgo));
  
  for (const notif of oldNotifications) {
    await store.delete(notif.id);
  }
  
  console.log('🧹 Nettoyage des vieilles données terminé');
}, 24 * 60 * 60 * 1000); // Tous les jours