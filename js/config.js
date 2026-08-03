const ALLOWED_USERS = ['مهدی', 'صادق', 'آرزو', 'دنیز']
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

export { ALLOWED_USERS, ADMIN_NAME, USERS_DATABASE }