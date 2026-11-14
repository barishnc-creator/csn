# CSN

Arkadaş ve ekip için Discord benzeri sohbet uygulaması: metin kanalları, sesli kanallar, kamera, ekran paylaşımı.

## Yapı
- `src/` React + Vite + TypeScript arayüz. Durum: `src/lib/store.tsx` (üyeler, kanallar, presence), `src/voice/VoiceContext.tsx` (LiveKit: ses, kamera, ekran).
- `supabase/migrations/` veritabanı şeması ve RLS. Yeni değişiklik = yeni numaralı migration dosyası; eskileri düzenleme.
- `supabase/functions/livekit-token/` ses odası anahtarı üreten Edge Function.

## Kurallar
- Arayüz metinleri Türkçe.
- Gizli anahtar (LiveKit secret, Supabase service_role) asla depoya yazılmaz; yalnız Supabase Edge Function secrets'ta durur. Arayüzde yalnız `sb_publishable_` anahtarı kullanılır.
- Erişim kontrolü RLS'tedir; yeni tabloda RLS açılmadan iş bitmiş sayılmaz.
- `npm run build` (tsc + vite) geçmeden commit atılmaz.

## Çalışma kuralı (kullanıcının kişisel kuralı)
- Bir adım başarısız olursa "yapılamaz" deyip durma: araştır, alternatif yol bul, çöz ve devam et. Kullanıcıya olumsuz dönmeden önce bütün makul seçenekleri dene.
- Sadece gerçekten kullanıcının elinde olan bir adım kalırsa (hesap açma, onay verme gibi), onu en kısa ve net haliyle iste; geri kalan her şeyi bitirmiş ol.
