# CSN

Arkadaşlar ve ekip için kapalı, Discord benzeri sohbet uygulaması.

## Özellikler
- **Metin kanalları:** anlık mesaj, düzenleme/silme, yanıtlama, @bahsetme (+ `@herkes`), "yazıyor…" göstergesi, okunmamış işaretleri, masaüstü bildirimi
- **Biçimlendirme:** `**kalın**`, `*italik*`, `~~çizili~~`, `` `kod` ``, kod blokları, `||spoiler||`, `> alıntı`, bağlantılar
- **Dosyalar:** sürükle-bırak, yapıştır, 25 MB'a kadar; resim/video/ses önizleme (gizli depolama, imzalı bağlantı)
- **Sesli kanallar:** konuşan göstergesi, sustur/sağırlaştır, kişi başı ses seviyesi (sağ tık), gürültü ve yankı engelleme, bas-konuş, cihaz seçimi, mikrofon testi
- **Kamera ve ekran paylaşımı:** 1080p/30fps ekran + sistem sesi, büyütme ve tam ekran
- **Üyeler:** çevrimiçi / boşta / rahatsız etmeyin, özel durum, profil fotoğrafı
- **Yönetim:** davet kodları (süre ve kullanım sınırı), kanal ekle/düzenle/sırala/sil, roller (yönetici, moderatör, üye), üye atma

## Kurulum

### 1. Supabase
1. Yeni proje aç, `supabase/migrations/0001_init.sql` dosyasını SQL Editor'da çalıştır.
2. `.env.example` → `.env.local` kopyala, proje URL'si ve `sb_publishable_` anahtarını yaz.
3. İsteğe bağlı: Authentication → Providers → Email → "Confirm email" kapatılırsa kayıt anında giriş yapılır.

### 2. LiveKit (ses ve ekran paylaşımı)
1. livekit.io'da ücretsiz proje aç; URL, API Key ve API Secret'ı al.
2. Supabase → Edge Functions → Secrets: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. `supabase/functions/livekit-token` fonksiyonunu dağıt.

### 3. Çalıştır
```bash
npm install
npm run dev
```
İlk giriş yapan kişi "Sunucuyu kur" ile yönetici olur, sonra Ayarlar → Davetler'den arkadaşlarına kod üretir.
