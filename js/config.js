const ALLOWED_USERS = ['مهدی', 'صادق', 'آرزو', 'دنیز']
const ADMIN_NAME = 'مهدی'
// کد ورود ادمین (می‌تونی اینو عوض کنی)
const ADMIN_CODE = '696'
// دکمه تغییر کد: بعد از ورود ادمین، از تنظیمات می‌تونی کد جدید بذاری
const ADMIN_CODE_STORAGE_KEY = 'yey-admin-code'

const USERS_DATABASE = {
    'مهدی': {
        id: 'user_001',
        name: 'مهدی',
        avatar: 'assets/avatars/mehdi.png',
        role: 'admin',
        color: '#6C5CE7'
    },
    'صادق': {
        id: 'user_002',
        name: 'صادق',
        avatar: 'assets/avatars/sadegh.png',
        role: 'member',
        color: '#c90c0c'
    },
    'آرزو': {
        id: 'user_003',
        name: 'آرزو',
        avatar: 'assets/avatars/arezo.png',
        role: 'member',
        color: '#0051ff'
    },
    'دنیز': {
        id: 'user_004',
        name: 'دنیز',
        avatar: 'assets/avatars/deniz.png',
        role: 'member',
        color: '#00f7ff'
    }
}

export { ALLOWED_USERS, ADMIN_NAME, ADMIN_CODE, ADMIN_CODE_STORAGE_KEY, USERS_DATABASE }