/** Giriş yapılamayan bot hesapları */
export const MUSIC_BOT_ID = 'b0700000-0000-4000-8000-00000000b070'
export const UPDATE_BOT_ID = 'c5b00000-0000-4000-8000-00000000c5b0'
export const isBot = (id: string) => id === MUSIC_BOT_ID || id === UPDATE_BOT_ID
