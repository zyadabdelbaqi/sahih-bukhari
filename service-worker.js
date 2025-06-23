// اسم الكاش، تم تغييره لإجبار المتصفح على تحديث الكاش بالكامل
const CACHE_NAME = 'bukhari-hadith-cache-v2';
// قائمة بالموارد الأساسية التي يجب تخزينها مؤقتًا عند التثبيت
const STATIC_ASSETS = [
    './', // يضمن تخزين المسار الرئيسي (index.html) مؤقتًا
    './index.html',
    './bukhari.json', // ملف بيانات الأحاديث الرئيسي
    './kitab-base.woff2', // خط مخصص
    './kitab-base-bold.woff2', // خط مخصص
    'https://cdn.tailwindcss.com', // Tailwind CSS CDN
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap', // Google Font CSS
    'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap' // Google Font CSS
    // ملاحظة: الخطوط الفعلية من fonts.gstatic.com سيتم التعامل معها بواسطة استراتيجية الجلب أدناه
];

// حدث التثبيت: يتم تشغيله عند تثبيت Service Worker لأول مرة أو عند وجود إصدار جديد
self.addEventListener('install', event => {
    console.log('[SW] تثبيت Service Worker...');
    // تخطي الانتظار لضمان تفعيل Service Worker الجديد فورًا
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] تخزين الأصول الثابتة مؤقتًا:', STATIC_ASSETS);
                // إضافة جميع الموارد المحددة إلى الكاش
                // استخدام `new Request(url, {credentials: 'omit'})` للتعامل مع موارد الطرف الثالث (مثل الخطوط)
                return cache.addAll(STATIC_ASSETS.map(url => new Request(url, {credentials: 'omit'})))
                    .catch(error => {
                        console.error('[SW] فشل تخزين بعض الأصول مؤقتًا أثناء التثبيت:', error);
                        // يمكن هنا تسجيل URLs المحددة التي فشلت للمساعدة في التصحيح
                        Promise.all(STATIC_ASSETS.map(url =>
                            fetch(url, {credentials: 'omit'})
                                .then(response => {
                                    if (!response.ok) {
                                        console.warn(`[SW] فشل في جلب: ${url} (الحالة: ${response.status}) للتخزين المؤقت`);
                                    }
                                    return response;
                                })
                                .catch(err => {
                                    console.error(`[SW] خطأ في جلب ${url} للتخزين المؤقت:`, err);
                                })
                        ));
                    });
            })
    );
});

// حدث التفعيل: يتم تشغيله بعد التثبيت بنجاح
self.addEventListener('activate', event => {
    console.log('[SW] تفعيل Service Worker جديد...');
    // حذف أي كاشات قديمة لم تعد مستخدمة
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] حذف الكاش القديم:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // المطالبة بالتحكم الفوري في جميع العملاء (النوافذ المفتوحة)
    self.clients.claim(); 
});

// حدث الجلب (Fetch): يتم تشغيله عند كل طلب شبكة من المتصفح
self.addEventListener('fetch', event => {
    // تجاهل طلبات POST، و chrome-extension:، و data: URLs
    if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://') || event.request.url.startsWith('data:')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // إذا تم العثور على استجابة في الكاش، قم بإرجاعها فورًا
                if (cachedResponse) {
                    console.log(`[SW] خدمة من الكاش: ${event.request.url}`);
                    return cachedResponse;
                }

                // إذا لم يتم العثور عليها في الكاش، حاول جلبها من الشبكة
                console.log(`[SW] جلب من الشبكة: ${event.request.url}`);
                return fetch(event.request)
                    .then(networkResponse => {
                        // تحقق مما إذا كانت الاستجابة صالحة (ليست خطأ شبكة أو استجابة غير شفافة)
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            // إذا كانت الاستجابة غير صالحة، قم بإرجاعها كما هي (قد تكون 404، إلخ)
                            console.log(`[SW] استجابة الشبكة غير صالحة للتخزين المؤقت: ${event.request.url} (الحالة: ${networkResponse ? networkResponse.status : 'لا يوجد استجابة'}, النوع: ${networkResponse ? networkResponse.type : 'N/A'})`);
                            return networkResponse;
                        }

                        // هام: استنسخ الاستجابة. الاستجابة عبارة عن "تدفق" ولا يمكن قراءتها إلا مرة واحدة.
                        // نحن نستهلكها هنا للتخزين المؤقت، ويحتاج المتصفح إلى استهلاكها أيضًا.
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                                console.log(`[SW] تم تخزين مورد جديد مؤقتًا: ${event.request.url}`);
                            })
                            .catch(err => {
                                console.error(`[SW] فشل تخزين ${event.request.url} مؤقتًا:`, err);
                            });

                        return networkResponse;
                    })
                    .catch(() => {
                        // هذا الجزء يتعامل مع أخطاء الشبكة (مثل عدم وجود اتصال)
                        console.error(`[SW] فشل الجلب ولا يوجد كاش لـ: ${event.request.url}. على الأرجح عدم اتصال.`);
                        // يمكنك هنا عرض صفحة "بلا اتصال" مخصصة إذا أردت
                        // على سبيل المثال: return caches.match('/offline.html');
                        // بالنسبة لبيانات التطبيق والأصول، فإن فشل الجلب مقبول
                        return new Response(null, {status: 503, statusText: 'Service Unavailable - Offline'});
                    });
            })
    );
});
