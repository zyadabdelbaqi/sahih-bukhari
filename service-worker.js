// اسم الكاش، يمكن تغييره لتحديث الكاش
const CACHE_NAME = 'bukhari-hadith-cache-v1';
// قائمة بالموارد التي يجب تخزينها مؤقتًا عند التثبيت
const urlsToCache = [
    '/',
    '/index.html',
    '/bukhari.json', // ملف بيانات الأحاديث
    '/kitab-base.woff2', // خطوط مخصصة
    '/kitab-base-bold.woff2', // خطوط مخصصة
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap',
    'https://fonts.gstatic.com' // للسماح بتحميل موارد الخطوط من هذا النطاق
    // يمكن إضافة أي ملفات CSS أو JS أو صور أخرى هنا
];

// حدث التثبيت: يتم تشغيله عند تثبيت Service Worker لأول مرة
self.addEventListener('install', event => {
    console.log('Service Worker: Install Event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching App Shell');
                // إضافة جميع الموارد المحددة إلى الكاش
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('Service Worker: Caching failed', error);
            })
    );
});

// حدث التفعيل: يتم تشغيله بعد التثبيت بنجاح (أو عند تحديث Service Worker)
self.addEventListener('activate', event => {
    console.log('Service Worker: Activate Event');
    // حذف أي كاشات قديمة
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // المطالبة بالتحكم الفوري في جميع العملاء (النوافذ المفتوحة)
    return self.clients.claim();
});

// حدث الجلب (Fetch): يتم تشغيله عند كل طلب شبكة من المتصفح
self.addEventListener('fetch', event => {
    // تجاهل طلبات chrome-extension: و cross-origin بدون سياسة CORS مناسبة
    if (event.request.url.startsWith('chrome-extension://') || !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // إذا تم العثور على استجابة في الكاش، قم بإرجاعها
                if (response) {
                    console.log('Service Worker: Serving from cache', event.request.url);
                    return response;
                }
                // إذا لم يتم العثور عليها في الكاش، قم بجلبها من الشبكة
                console.log('Service Worker: Fetching from network', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // تحقق مما إذا كانت الاستجابة صالحة (ليست خطأ شبكة أو استجابة غير شفافة)
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // استنساخ الاستجابة لأنها "stream" ولا يمكن قراءتها إلا مرة واحدة
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                // تخزين الاستجابة الجديدة في الكاش
                                cache.put(event.request, responseToCache);
                            })
                            .catch(error => {
                                console.error('Service Worker: Failed to cache new resource', event.request.url, error);
                            });
                        return networkResponse;
                    }
                ).catch(error => {
                    // في حالة فشل جلب الشبكة (عادة بسبب عدم وجود اتصال)
                    console.error('Service Worker: Fetch failed, trying cache for:', event.request.url, error);
                    // يمكنك هنا إرجاع صفحة "بلا اتصال" مخصصة إذا أردت
                    // For example: return caches.match('/offline.html');
                    // لخطوط جوجل والموارد الخارجية، قد لا يكون هناك كاش متاح، لذا فقط قم بالرفض
                    return new Response(null, { status: 503, statusText: 'Service Unavailable - Offline' });
                });
            })
    );
});

