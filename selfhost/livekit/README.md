# CSN — kendi LiveKit sunucumuz (Oracle Cloud Always Free)

LiveKit Cloud'un ücretsiz planındaki 5.000 dk/ay sınırına takılmamak için. Ücretsiz:
Oracle Always Free (A1: 4 çekirdek ARM, 24 GB RAM, aylık 10 TB çıkış) + LiveKit (açık kaynak) + sslip.io (alan adı) + Let's Encrypt (HTTPS).

## Nasıl çalışır
- **Önce LiveKit Cloud, sorun olursa yedek sunucu.** `livekit-token` (Ayarlar → Ses sunucusu, yalnız sahip):
  - **Otomatik** (varsayılan): Cloud kullanılır. Biri Cloud'a bağlanamazsa (kota bitti, Cloud çöktü) uygulama yeniden ister, fonksiyon herkesi **3 saatliğine** yedeğe geçirir. Süre bitince Cloud yeniden denenir. Yedekte o odada konuşan varsa yeni gelen de oraya gider, oda bölünmez.
  - **Hep Cloud** / **Hep yedek**: elle sabit. Yedek ayakta değilse her durumda Cloud kullanılır.
- Yedeği tamamen devre dışı bırakmak için Supabase'deki 3 `LIVEKIT_SELF_*` sırrını silmek yeter.
- **Günlük kontrol:** `.github/workflows/ses-yedek-kontrol.yml` her sabah `host.txt`'teki adrese bakar. Yanıt yoksa iş başarısız olur, GitHub e-posta atar.
- Sunucuda: LiveKit + Redis + Caddy (Docker). TURN, LiveKit'in kendi içindeki sunucu (UDP 3478). Kısıtlı ağlarda ICE/TCP 7881'e düşer.

## Adımlar
1. **Oracle hesabı** (varsa geç): cloud.oracle.com → Always Free. Kart doğrulaması ister, ücret çekmez.
   - A1 makinesi çoğu bölgede "Out of host capacity" verir. 2. adımdaki betik bunu otomatik olarak yeniden dener.
   - İsteğe bağlı: hesabı "Pay As You Go"ya yükseltmek A1 bulmayı çok kolaylaştırır. Ücretsiz sınırlar içinde yine 0 TL'dir, ama kart bağlıdır. Bu senin kararın.
2. **Makineyi oluştur:** Oracle konsolunda sağ üstteki `>_` (Cloud Shell) → şunu yapıştır:
   ```
   curl -fsSL https://raw.githubusercontent.com/barishnc-creator/csn/main/selfhost/livekit/oracle-olustur.sh | bash
   ```
   Betik ağı ve güvenlik kurallarını hazırlar, makineyi açar (yer yoksa dakikada bir dener), ardından LiveKit kurulumu makinede kendiliğinden başlar.
   A1 hiç çıkmazsa küçük AMD makine (1 GB, birkaç kişilik ses için yeter, ekran paylaşımı zorlanabilir):
   `SHAPE=VM.Standard.E2.1.Micro bash <(curl -fsSL https://raw.githubusercontent.com/barishnc-creator/csn/main/selfhost/livekit/oracle-olustur.sh)`
3. **Anahtarları al** (3–5 dk sonra, yine Cloud Shell'de; betik komutu ekrana yazar):
   ```
   ssh ubuntu@<IP> sudo cat /opt/csn-livekit/BILGI.txt
   ```
4. **Supabase → Edge Functions → Secrets**: `LIVEKIT_SELF_URL`, `LIVEKIT_SELF_KEY`, `LIVEKIT_SELF_SECRET` ekle. (Eski LiveKit Cloud sırlarına dokunma.)
5. Claude'a "sunucu hazır" de: güncel `livekit-token` fonksiyonu yayına alınır, bakım duyurusu kaldırılır.

## Elle kurulum (makine zaten varsa)
Ubuntu 22.04/24.04'te: `curl -fsSL https://raw.githubusercontent.com/barishnc-creator/csn/main/selfhost/livekit/kurulum.sh | sudo bash`
Oracle'da ayrıca VCN → Security List'te giriş kuralları gerekir: TCP 22, 80, 443, 7881 · UDP 3478, 50000-60000, 30000-40000.

## Bakım
- Durum: `cd /opt/csn-livekit && sudo docker compose ps` · Kayıtlar: `sudo docker compose logs -f livekit`
- Güncelleme: `sudo docker compose pull && sudo docker compose up -d`
- **Oracle makineyi geri alırsa** (uzun süre boşta kalan ücretsiz makineler geri alınabilir): Cloud Shell'de 2. adımdaki komutu tekrar çalıştır, sonra yeni IP ile `host.txt` ve 3 sırrı güncelle.
- Anahtarlar `/opt/csn-livekit/keys.env` dosyasında (yalnız root okur). Depoya asla yazılmaz.
