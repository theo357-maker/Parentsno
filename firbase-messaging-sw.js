// ============================================
// FIREBASE MESSAGING SERVICE WORKER
// Gestion des notifications push Firebase
// ============================================

importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBn7VIddclO7KtrXb5sibCr9SjVLjOy-qI",
  authDomain: "theo1d.firebaseapp.com",
  projectId: "theo1d",
  storageBucket: "theo1d.firebasestorage.app",
  messagingSenderId: "269629842962",
  appId: "1:269629842962:web:a80a12b04448fe1e595acb",
  measurementId: "G-TNSG1XFMDZ"
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ============================================
// GESTION DES NOTIFICATIONS EN ARRIÈRE-PLAN
// ============================================

// Quand l'app est en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('📨 [firebase-messaging-sw] Message en arrière-plan:', payload);
  
  const notificationTitle = payload.notification?.title || 'CS la Colombe';
  const notificationOptions = {
    body: payload.notification?.body || 'Nouvelle notification',
    icon: payload.notification?.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    image: payload.notification?.image,
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'close', title: 'Fermer' }
    ],
    tag: payload.data?.tag || `fcm-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now()
  };
  
  // Personnaliser selon le type de notification
  const type = payload.data?.type;
  
  switch(type) {
    case 'incident':
      notificationOptions.title = `⚠️ ${notificationTitle}`;
      notificationOptions.actions = [
        { action: 'view', title: 'Voir l\'incident' },
        { action: 'close', title: 'Fermer' }
      ];
      break;
      
    case 'presence':
      notificationOptions.title = `📅 ${notificationTitle}`;
      notificationOptions.badge = '/icons/icon-72x72.png';
      break;
      
    case 'grade':
    case 'cote':
      notificationOptions.title = `📊 ${notificationTitle}`;
      notificationOptions.actions = [
        { action: 'view', title: 'Voir les notes' },
        { action: 'close', title: 'Fermer' }
      ];
      break;
      
    case 'homework':
      notificationOptions.title = `📚 ${notificationTitle}`;
      notificationOptions.actions = [
        { action: 'view', title: 'Voir le devoir' },
        { action: 'close', title: 'Fermer' }
      ];
      break;
      
    case 'payment':
      notificationOptions.title = `💰 ${notificationTitle}`;
      break;
      
    case 'communique':
      notificationOptions.title = `📄 ${notificationTitle}`;
      break;
      
    case 'timetable':
      notificationOptions.title = `⏰ ${notificationTitle}`;
      break;
  }
  
  // Mettre à jour le badge (compter +1)
  updateBadgeCount(1);
  
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================
// GESTION DES CLIKS SUR NOTIFICATIONS
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 [firebase-messaging-sw] Notification cliquée:', event);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  notification.close();
  
  // Mettre à jour le badge (décrémenter)
  updateBadgeCount(-1);
  
  if (action === 'close') return;
  
  // Déterminer l'URL à ouvrir
  let url = '/index.html';
  
  if (data.page) {
    url = `/index.html#${data.page}`;
    
    if (data.childId) {
      url += `?child=${data.childId}`;
    }
  } else if (data.url) {
    url = data.url;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            client.focus();
            // Envoyer les données de navigation
            client.postMessage({
              type: 'FCM_NAVIGATE',
              page: data.page || 'dashboard',
              data: data
            });
            return;
          }
        }
        
        return clients.openWindow(url);
      })
  );
});

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

// Mettre à jour le badge de l'application
async function updateBadgeCount(change) {
  try {
    let count = await getBadgeCount();
    count = Math.max(0, count + change);
    
    await saveBadgeCount(count);
    
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    }
    
    // Informer les clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BADGE_UPDATED',
        count: count
      });
    });
    
  } catch (error) {
    console.error('❌ Erreur badge:', error);
  }
}

// Récupérer le compteur de badge
async function getBadgeCount() {
  try {
    const cache = await caches.open('badge-cache');
    const response = await cache.match('/badge-count');
    if (response) {
      const data = await response.json();
      return data.count || 0;
    }
  } catch (error) {
    console.error('❌ Erreur récupération badge:', error);
  }
  return 0;
}

// Sauvegarder le compteur de badge
async function saveBadgeCount(count) {
  try {
    const cache = await caches.open('badge-cache');
    const response = new Response(JSON.stringify({ count, timestamp: Date.now() }));
    await cache.put('/badge-count', response);
  } catch (error) {
    console.error('❌ Erreur sauvegarde badge:', error);
  }
}