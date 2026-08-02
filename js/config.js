// js/config.js
const ALLOWED_USERS = ['مهدی', 'صادق', 'دنیز']
const ADMIN_NAME = 'مهدی'

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
    'دنیز': {
        id: 'user_003',
        name: 'دنیز',
        avatar: 'assets/avatars/deniz.png',
        role: 'member',
        color: '#00f7ff'
    }
}

export { ALLOWED_USERS, ADMIN_NAME, USERS_DATABASE }