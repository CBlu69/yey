// js/map.js - کامل با اشتراک موقعیت زنده و لغو
import { supabase } from './supabase.js'
import { getCurrentUser } from './auth.js'

export function initMap(user) {
    let map
    let userMarker
    let userLocation = null
    let allPins = []
    let sharingActive = false
    let sharingMarker = null
    let sharingTimer = null
    let sharingUpdateInterval = null
    let sharingStartTime = null
    let sharingLocationId = null

    function createMap() {
        const mapContainer = document.getElementById('map-container')
        if (!mapContainer) return

        map = L.map('map-container').setView([35.6892, 51.3890], 13)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map)

        loadPins()
        startLocationTracking()
        updateShareButton()
    }

    function startLocationTracking() {
        if (!('geolocation' in navigator)) {
            setDefaultLocation()
            return
        }

        navigator.geolocation.watchPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }
                updateUserMarker()

                // اگه اشتراک فعاله، موقعیت رو آپدیت کن
                if (sharingActive) {
                    updateSharingMarker()
                }
            },
            () => setDefaultLocation(),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
    }

    function updateUserMarker() {
        if (!userLocation || !map) return

        if (userMarker) {
            userMarker.setLatLng(userLocation)
        } else {
            userMarker = L.marker(userLocation, {
                icon: L.divIcon({
                    html: `<div style="font-size:24px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">📍</div>`,
                    className: 'user-marker',
                    iconSize: [24, 24]
                })
            }).addTo(map)
                .bindPopup('موقعیت من')
        }
    }

    function setDefaultLocation() {
        if (!userLocation) {
            userLocation = { lat: 35.6892, lng: 51.3890 }
            updateUserMarker()
        }
    }

    // ============ اشتراک موقعیت ============
    const shareBtn = document.getElementById('share-location-btn')

    shareBtn?.addEventListener('click', () => {
        if (sharingActive) {
            stopSharing()
        } else {
            startSharing()
        }
    })

    async function startSharing() {
        if (!userLocation) {
            window.showToast('موقعیت هنوز مشخص نشده', 'warning')
            return
        }

        const currentUser = getCurrentUser()

        // ذخیره توی دیتابیس
        const { data, error } = await supabase
            .from('shared_locations')
            .insert([{
                user_id: currentUser?.id,
                user_name: currentUser?.name,
                user_avatar: currentUser?.avatar || '👤',
                latitude: userLocation.lat,
                longitude: userLocation.lng,
                is_active: true
            }])
            .select()

        if (error) {
            window.showToast('خطا در اشتراک موقعیت', 'error')
            return
        }

        const locationId = data?.[0]?.id

        sharingActive = true
        sharingStartTime = Date.now()
        sharingLocationId = locationId

        // ساختن نشانگر...
        if (!sharingMarker) {
            sharingMarker = L.marker(userLocation, {
                icon: L.divIcon({
                    html: `<div style="
                    width:20px; height:20px; 
                    background: #2ed573; 
                    border: 3px solid #fff; 
                    border-radius:50%; 
                    box-shadow: 0 0 15px rgba(46,213,115,0.8);
                    animation: pulse 1.5s infinite;
                "></div>`,
                    className: 'sharing-marker',
                    iconSize: [20, 20]
                })
            }).addTo(map)
                .bindPopup(`
            <div style="text-align:center;">
                <b>${currentUser?.avatar || ''} ${currentUser?.name || 'من'}</b><br>
                <span style="color:#2ed573;">🟢 در حال اشتراک موقعیت</span><br>
                <small id="sharing-timer-display">۰:۰۰</small>
            </div>
        `)
        }

        updateShareButton()
        updateSharingTimer()
        sharingTimer = setInterval(updateSharingTimer, 1000)
        sharingMarker.on('popupopen', updateSharingTimer)

        window.showToast('📍 موقعیتت داره به اشتراک گذاشته میشه', 'success', 2000)

        // آپدیت موقعیت هر ۵ ثانیه
        sharingUpdateInterval = setInterval(async () => {
            if (sharingActive && userLocation && sharingLocationId) {
                await supabase
                    .from('shared_locations')
                    .update({
                        latitude: userLocation.lat,
                        longitude: userLocation.lng
                    })
                    .eq('id', sharingLocationId)
            }
        }, 5000)
    }

    async function stopSharing() {
        sharingActive = false

        if (sharingLocationId) {
            await supabase
                .from('shared_locations')
                .update({
                    is_active: false,
                    stopped_at: new Date().toISOString()
                })
                .eq('id', sharingLocationId)

            sharingLocationId = null
        }

        if (sharingMarker) {
            map.removeLayer(sharingMarker)
            sharingMarker = null
        }

        if (sharingTimer) {
            clearInterval(sharingTimer)
            sharingTimer = null
        }

        if (sharingUpdateInterval) {
            clearInterval(sharingUpdateInterval)
            sharingUpdateInterval = null
        }

        sharingStartTime = null
        updateShareButton()

        window.showToast('اشتراک موقعیت متوقف شد', 'info', 2000)
    }

    function updateSharingMarker() {
        if (sharingMarker && userLocation) {
            sharingMarker.setLatLng(userLocation)
        }
    }

    function updateSharingTimer() {
        if (!sharingStartTime || !sharingMarker) return

        const elapsed = Math.floor((Date.now() - sharingStartTime) / 1000)
        const minutes = Math.floor(elapsed / 60)
        const seconds = elapsed % 60

        const timerDisplay = document.getElementById('sharing-timer-display')
        if (timerDisplay) {
            timerDisplay.textContent = `⏱ ${minutes}:${seconds.toString().padStart(2, '0')}`
        }

        // آپدیت popup
        const currentUser = getCurrentUser()
        sharingMarker.setPopupContent(`
            <div style="text-align:center;">
                <b>${currentUser?.avatar || ''} ${currentUser?.name || 'من'}</b><br>
                <span style="color:#2ed573;">🟢 در حال اشتراک موقعیت</span><br>
                <small>⏱ ${minutes}:${seconds.toString().padStart(2, '0')}</small><br>
                <button onclick="window.stopMapSharing()" 
                        style="margin-top:8px; padding:6px 14px; background:#ff4757; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:12px; font-family:inherit;">
                    ⏹ توقف اشتراک
                </button>
            </div>
        `)
    }

    function updateShareButton() {
        if (!shareBtn) return

        if (sharingActive) {
            shareBtn.className = 'map-btn danger-btn'
            shareBtn.innerHTML = '⏹ توقف اشتراک'
        } else {
            shareBtn.className = 'map-btn primary-btn'
            shareBtn.innerHTML = '📍 اشتراک موقعیت'
        }
    }

    // تابع گلوبال برای توقف از popup
    window.stopMapSharing = () => {
        stopSharing()
        map.closePopup()
    }

    // ============ اضافه کردن پین ============
    document.getElementById('add-pin-btn')?.addEventListener('click', async () => {
        if (!map) return

        const pinName = await window.showPrompt('📍 نام این مکان چیه؟', '')
        if (!pinName) return

        window.showToast('حالا روی نقشه کلیک کن 🗺️', 'info', 2000)
        map.getContainer().style.cursor = 'crosshair'

        map.once('click', async (e) => {
            map.getContainer().style.cursor = ''
            const { lat, lng } = e.latlng
            const currentUser = getCurrentUser()

            const { data, error } = await supabase
                .from('pins')
                .insert([{
                    name: pinName,
                    latitude: lat,
                    longitude: lng,
                    user_id: currentUser?.id,
                    user_name: currentUser?.name
                }])
                .select()

            if (error) {
                window.showToast('خطا در ذخیره پین', 'error')
                return
            }

            if (data && data[0]) {
                addPinToMap(data[0])
            }

            window.showToast(`پین "${pinName}" اضافه شد ✅`, 'success')
        })
    })

    function addPinToMap(pin) {
        const currentUser = getCurrentUser()
        const isOwner = pin.user_id === currentUser?.id

        const marker = L.marker([pin.latitude, pin.longitude], {
            icon: L.divIcon({
                html: `<div style="font-size:28px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">📌</div>`,
                className: 'pin-marker',
                iconSize: [28, 28]
            })
        }).addTo(map)

        let popupContent = `
            <div style="text-align:center; min-width:150px;">
                <b>📌 ${pin.name}</b><br>
                <small style="color:#9d9dab;">توسط ${pin.user_name || 'ناشناس'}</small><br>
                <small style="color:#9d9dab;">${new Date(pin.created_at).toLocaleDateString('fa-IR')}</small>
        `

        if (isOwner) {
            popupContent += `
                <button onclick="window.deletePin(${pin.id})" 
                        style="margin-top:8px; padding:6px 14px; background:#ff4757; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:12px; font-family:inherit;">
                    🗑️ حذف پین
                </button>
            `
        }

        popupContent += `</div>`

        marker.bindPopup(popupContent)
        allPins.push({ id: pin.id, marker })
    }

    window.deletePin = async (pinId) => {
        const confirmed = await window.showConfirm('مطمئنی می‌خوای این پین رو حذف کنی؟', 'حذف پین')
        if (!confirmed) return

        const { error } = await supabase
            .from('pins')
            .delete()
            .eq('id', pinId)

        if (error) {
            window.showToast('خطا در حذف پین', 'error')
            return
        }

        const pinData = allPins.find(p => p.id === pinId)
        if (pinData && pinData.marker) {
            map.removeLayer(pinData.marker)
        }
        allPins = allPins.filter(p => p.id !== pinId)

        window.showToast('پین حذف شد', 'success')
    }

    async function loadPins() {
        if (!map) return

        const { data, error } = await supabase
            .from('pins')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) return

        if (data) {
            data.forEach(pin => addPinToMap(pin))
        }
    }

    // گوش دادن به پین‌های جدید
    supabase
        .channel('pins')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'pins' },
            (payload) => {
                if (!allPins.find(p => p.id === payload.new.id)) {
                    addPinToMap(payload.new)
                }
            }
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'pins' },
            (payload) => {
                const pinData = allPins.find(p => p.id === payload.old.id)
                if (pinData && pinData.marker) {
                    map.removeLayer(pinData.marker)
                }
                allPins = allPins.filter(p => p.id !== payload.old.id)
            }
        )
        .subscribe()

    setTimeout(createMap, 500)
}