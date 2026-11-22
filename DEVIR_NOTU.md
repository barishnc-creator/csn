# CSN — Devir notu

> Yeni bir oturum buradan devam eder. Önce bunu, sonra `CLAUDE.md`'yi oku.
> Son güncelleme: 2026-11-22 (ses, kamera, ekran Cloudflare Realtime üzerinden canlıda çalışıyor; voice_mode = cf)

## Durum özeti
CSN yayında: **https://barishnc-creator.github.io/csn/** (GitHub Pages, `main`'e her push'ta `.github/workflows/pages.yml` ile yayınlanır).

- **Supabase projesi:** `csn`, ref `esdqtglbauovytdppjmt`, eu-central-2. Yönetim Supabase MCP ile yapılıyor (`apply_migration`, `execute_sql`, `deploy_edge_function`).
- **LiveKit Cloud:** Anahtarlar Supabase Edge Function secrets'ta (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). Ses ve ekran paylaşımı çalışıyor; kullanıcı doğruladı.
- **Sahip:** Barış (`members.is_owner = true`). egunesx de yönetici.
- **Bu ortamdan erişim:** supabase.co ve github.io'ya doğrudan erişilemiyor (proxy). Doğrulamalar MCP SQL testleri ve sahte veriyle Playwright ekran görüntüleriyle yapılıyor.

## Yapılanlar
| Alan | Durum |
|---|---|
| Metin kanalları, dosya, @bahsetme, yazıyor…, okunmamış, bildirim | ✅ |
| Ses kanalları, kamera, ekran paylaşımı, bas-konuş, kişi başı ses | ✅ |
| RNNoise gelişmiş gürültü engelleme (`src/voice/rnnoise.ts`) | ✅ derleniyor, **tarayıcıda denenmedi** |
| Davet kodları, kanal yönetimi | ✅ |
| Sunucu sahibi koruması, Revizeler (yalnız sahip onaylar) | ✅ |
| Özel roller + yetkiler, rollere özel gizli kanallar (`0005`) | ✅ SQL ile test edildi |
| Doğrudan mesajlar + DM sesli arama + gelen arama bildirimi | ✅ SQL ile test edildi, **canlı denenmedi** |
| Emoji tepkileri, mesaj sabitleme, kanalda arama | ✅ |
| Kişisel profil kartı (hakkımda, zamir, kapak rengi, roller) | ✅ |
| Sahibe özel "Herkesi yenile" (`server_state`, `broadcast_reload`) | ✅ |
| Yeni tema (Inter, gradyan düğmeler), Lucide ikonları | ✅ |
| Ayarlar panelinde Geri/Kapat, Arkadaşlar sayfası, sol altta çıkış | ✅ |
| Otomatik yeni sürüm denetimi (`version.json`) + önbelleği atlatan yenileme | ✅ |
| Revize #2: arkadaşlık istekleri (gönder / kabul / reddet / geri çek / çıkar), `0007` | ✅ SQL ile test edildi |
| Uygulama içi ekran paylaşımı seçici (`src/voice/ScreenSharePicker.tsx`) | ✅ derleniyor, **canlı denenmedi** |
| Revize #3 isim etiketi (#0001, otomatik) + kapak fotoğrafı (`0008`) | ✅ |
| Revize #4 sağ tık menüsü: profil, mesaj, arkadaş, ses seviyesi, yöneticiye hızlı çoklu rol | ✅ |
| Revize #5 sağ tık → Roller alt paneli, #6 kanal ayarları (görme + girme rolleri, `0009`), #7 durum seçimi (görünmez dahil), #8 sağda sabit üye paneli, #9 "Revize verebilir" rol yetkisi | ✅ |
| Telefon görünümü (tek panel, geri düğmesi), PWA (ana ekrana ekle) | ✅ |
| Revize #12 birlikte dinle (YouTube IFrame, `music_state`, /çal…), #13 üye paneli başlığı, #14 soundpad (`sounds`, realtime broadcast) | ✅ canlı denenmedi |
| Sahibe revize bildirimi; #yenilikler kanalı + "CSN Güncelleme" bot hesabı (bkz. CLAUDE.md) | ✅ |
| Sunucu temaları (Midnight / Tokyo Night / Catppuccin / Nord / Rosé Pine) + vurgu rengi, yüzen panel düzeni; yöneticiler Ayarlar → Görünüm'den seçer (`0014`, `src/lib/theme.ts`) | ✅ |
| Davet bağlantısı (`?davet=KOD`), kanallarda okunmamış sayaç baloncuğu | ✅ |
| GIF seçici (mesaj kutusunun sağı): `src/lib/gifs.json`, 295 GIPHY GIF, 16 kategori; arama + son kullanılanlar | ✅ GIF'ler canlıda görülmedi (GIPHY bu ortamdan erişilemiyor) |
| Revize #15 sunucu stickerları (`0015`, `src/lib/stickers.ts`, `StickerPicker.tsx`): GIF'in yanında, yöneticiler ekler/siler, mesajda `[sticker:<id>]` | ✅ sahte veriyle ekran görüntüsü, canlı denenmedi |
| Revize #16 uygulamaya uygun onay/uyarı kutuları (`src/lib/dialog.tsx`: `confirmDialog`, `alertDialog`); tüm `confirm()/alert()` kaldırıldı | ✅ |
| Revize #18 müzik botu (`0016`): "CSN Müzik" bot üyesi (plak avatar, rol verilebilir, hep çevrimiçi), ses odasında en altta, sağ tık → müzik ses çubuğu, komutun yazıldığı kanalda konsol (`MusicConsole.tsx`: duraklat/devam/geç/tekrar/sıra/durdur/ses), bu kanala atılan YouTube bağlantısı sıraya girer, `/tekrar`, `/ses`; sahip notu: alttaki revize bildirimi kaldırıldı, üye panelindeki kaldı | ✅ canlı denenmedi |
| Revize #19 kategori başlığında "+" ile hızlı kanal oluşturma (`CreateChannelModal.tsx`, `manage_channels` yetkisi) | ✅ |
| Revize #17 üye paneli: BÜYÜK HARF başlık, rol renkli kutucuk kartlar, grup başlığında sayı rozeti (`MemberList.tsx`, `styles.css` sonu) | ✅ sahte veriyle ekran görüntüsü |
| Revize #20+#22 müzik botu ayarları (`0017`): Ayarlar → Müzik botu (yalnız yöneticiler) ad, resim, özel durum, hakkında, aktiflik durumu (`update_bot_profile` RPC, `profiles.bot_presence`, store'da presence'a eklenir); bota arkadaşlık isteği (tetikleyici) ve DM (`open_dm`) sunucuda reddedilir | ✅ SQL ile test edildi, canlı denenmedi |
| Revize #21 masaüstü 0.1.2: Alt+Enter / F11 tam ekran, koyu başlık çubuğu (`nativeTheme.themeSource='dark'`), ekranı kaplayarak açılır | ✅ derleniyor, **Windows'ta denenmedi** |
| Revize #23 sesli mesaj (`VoiceRecorder.tsx`): mesaj kutusunda mikrofon düğmesi, en fazla 5 dk, Enter gönder / Esc vazgeç, dalga biçimli oynatıcı; ek `voice/duration/waveform` alanlarıyla saklanır | ✅ Chromium sahte mikrofonla kayıt+oynatma denendi |
| Masaüstü 0.1.3: Windows başlık çubuğu yerine sayfanın çizdiği temaya uygun çubuk (`titleBarStyle:'hidden'` + `titleBarOverlay`, `initDesktopTitleBar` in `src/lib/desktop.ts`, renkler `csn:titlebar` IPC ile); müzik kartı (`MusicPanel`) hep küçük başlar | ✅ Windows'ta denenmedi |
| Revize #24 rollere "Soundpad'e ses ekleyebilir" yetkisi (`manage_sounds`, `0018`): yetkili ekler, kendi sesini siler; yöneticiler hepsini | ✅ SQL ile test edildi |
| Revize #25 kanal kategorileri (`0019`, `channel_categories`, `channels.category_id`): bölüm başlığında 📁+ ile kategori, kategori başlığında + ile içine kanal, ⚙ ile ad değiştir/sil (kanallar silinmez), daraltma bu cihazda hatırlanır; kanal ayarlarından kategori değişir (`CategoryModal.tsx`). Sahip notu: sol alttaki ⚙ doğrudan Ayarlar panelini açar; Herkesi yenile + Uygulama olarak yükle panelin sol menüsünde (`ReloadDialog.tsx`) | ✅ SQL ile test edildi, sahte veriyle ekran görüntüsü |
| Revize #26 oda ayarları (`0020`): ses odasına kişi sınırı (kanal ayarlarında kaydırıcı, `channels.user_limit`; `livekit-token` LiveKit `ListParticipants` ile sayar, yöneticiler ve taşınan kişi sınırsız), oda adının yanında `içerideki/sınır` rozeti (dolunca kırmızı), rol yetkisi "Üyeleri taşı" (`move_members`), sağ tık → Taşı › odalar (`voice_moves` tablosu, hedef realtime ile o odaya geçer). Anahtar artık önce alınıyor: oda doluysa mevcut görüşme kopmaz | ✅ RLS SQL ile test edildi, sahte veriyle ekran görüntüsü; **canlı denenmedi** (LiveKit sayımı dahil) |
| Revize #27 kanal başlıkları: METİN/SES KANALLARI ve kategori başlıkları üye paneli gibi (ikon kutucuğu, sayı rozeti, gradyan çizgi) | ✅ sahte veriyle ekran görüntüsü |
| Revize #28 DM modunda sağda **Arkadaş etkinliği** paneli (`FriendsActivity.tsx`): çevrimiçi/seste olanlar üstte, sunucu (CSN) + ses kanalı adı, CANLI etiketi, "Katıl" düğmesi; sunucu modunda üye paneli kalır | ✅ sahte veriyle ekran görüntüsü |
| Revize #29 sürükleyerek taşıma: `move_members` yetkilisi ses kanalındaki kişiyi tutup başka odanın üstüne bırakır (`ChannelSidebar.tsx`, `voice_moves` insert) | ✅ Playwright'ta sürükle-bırak isteği doğrulandı, canlı denenmedi |
| Soundpad tuş atamaları (kullanıcı isteği): her sese kişiye özel kısayol (tek tuş; istenirse Ctrl/Alt ile, bas-konuş tuşu atanamaz, tek tuşlu kısayol yazı alanında çalmaz), bu cihazda saklanır (`src/voice/soundpadKeys.ts`, `SoundpadHotkeys` Layout'ta); soundpad'de "⌨ Tuş ata", Esc vazgeç, Backspace kaldır; aynı kombinasyon başka sesten kalkar. Masaüstü 0.1.4+ ile CSN arka plandayken de (oyun, başka uygulama) çalışır: `desktop/main.js` `uiohook-napi` ile tuşları engellemeden dinler (`csn:set-hotkeys` / `csn:hotkey` IPC), pencere öndeyken sayfa kendi dinleyicisiyle çalar; tarayıcı/PWA'da yalnız sekme odaktayken | ✅ mantık testleri geçti, arayüz canlı denenmedi |
| Yayın çerçevesi (kullanıcı isteği): ekran paylaşırken pencere kenarında ince, nefes alan kırmızı çerçeve + üst ortada "● Yayındasın · Durdur" hapı (`LiveFrame.tsx`, Layout'ta `voice.screenOn`); tıklamaları engellemez, masaüstünde başlık çubuğunun altında, azaltılmış harekette animasyonsuz. İzleyende başkasının ekran kutucuğu ince kırmızı kenarlı (`.tile.screen.remote`) | ✅ sahte veriyle ekran görüntüsü, canlı denenmedi |
| Revize #30 soundpad: yeni ses çalınınca çalan ses kesilir (herkeste; `playGen` ile geç yüklenen eski ses başlamaz), kişi başı sınır 1,5 sn → 0,8 sn (`src/voice/soundpad.ts`) | ✅ derleniyor, canlı denenmedi |
| Yayın yankısı düzeltmesi (acil, kullanıcı isteği): biri ekranı sistem sesiyle paylaşınca CSN'nin çaldığı konuşma sesi de yakalanıp geri geliyordu → ekran sesi `restrictOwnAudio: true` ile isteniyor (Chrome 141+; Electron 45 bunu `loopbackWithoutChrome`'a çevirir, masaüstü web'i uzaktan yüklediği için yeni .exe gerekmez), ekran sesinde AEC/NS/AGC kapalı. Yayına sağ tık → ayrı **yayın sesi** (0-%200, kapat/aç; `settings.streamVolumes`, `setStreamVolume`), kişi ses ayarı artık yalnız mikrofonu etkiler; menü kutucuğun içinde (tam ekranda da) | ✅ derleniyor, sahte veriyle ekran görüntüsü; **yankı canlıda denenmedi** (paylaşan kişi yenilemeli) |
| Güvenlik denetimi (2026-11-15): tüm tablolarda RLS + koruma tetikleyicileri (mesaj/profil/revize/arkadaşlık/sahip) doğrulandı; depoda gizli anahtar yok; markdown HTML üretmiyor; `npm audit` temiz. Bulgu: Realtime yayın/presence kanalları herkese açıktı → `0021`: `realtime.messages` kuralları (yalnız üyeler; `typing-`/`soundpad-` için kanalı görme izni), istemcide tüm kanallar `private: true` | ✅ kurallar SQL ile test edildi; **Realtime Settings → "Allow public access" henüz açık** (kullanıcı canlı doğrulayınca kapatılacak) |
| Electron masaüstü uygulaması (`desktop/`), kurulum: Actions → "Masaüstü (Windows)" ya da `desktop-v*` etiketi | ✅ 0.1.4 yayında (soundpad genel kısayolları; derlemede `uiohook-napi` yüklenmesi doğrulanıyor): https://github.com/barishnc-creator/csn/releases/latest (Actions → "Masaüstü (Windows)" elle başlatılınca `desktop/package.json` sürümüyle yeni Release açar; bu ortamdan etiket push'u engelli) |

## Migrationlar (sırayla uygulandı)
`0001_init` → `0002_lock_anon_functions` → `0003_owner_and_revisions` → `0004_dm_kind` → `0005_roles_dm_reactions_pins_profile` → `0006_server_reload` → `0007_friendships` → `0008_tag_banner` → `0009_channel_join_roles` → `0010_channels_select_row_based` → `0011_submit_revisions_perm` → `0012_music` → `0013_soundpad` → `0014_server_theme` → `0015_stickers` → `0016_music_bot` → `0017_bot_settings` → `0018_manage_sounds_perm` → `0019_channel_categories` → `0020_voice_limit_move` → `0021_realtime_private` → `0022_voice_server_mode` → `0023_cf_voice`

## ⚠️ Ses durumu (2026-11-20)
- LiveKit Cloud Build planı doldu (5.024/5.000 dk), ~1 Aralık'ta yenilenir. Bakım duyurusu açık (`src/lib/maintenance.tsx`, `MAINTENANCE.active`).
- Ücretsiz ikinci LiveKit projesi işe yaramaz: bir hesabın ücretsiz projeleri kotayı paylaşır (docs.livekit.io quotas-and-limits).
- Cloudflare TURN ücretli (0,05 $/GB): kullanılmadı, LiveKit'in kendi TURN'ü kullanılıyor.
- Karar (21 Kas, kart/ödeme YOK): Oracle ücretsiz **AMD E2.1.Micro** üzerinde kendi LiveKit = **kalıcı yedek**; silinmeyecek. Kurulum: `selfhost/livekit/` (README, `kurulum.sh`, `oracle-olustur.sh` `SHAPE=VM.Standard.E2.1.Micro`). Kullanıcı Cloud Shell'de çalıştırıyor; makine oluşunca 3 `LIVEKIT_SELF_*` sırrını kendisi ekleyecek, `selfhost/livekit/host.txt`'e alan adı yazılacak (günlük kontrol için).
- **Önce Cloud, sorunda yedek** (`0022`, `livekit-token` v10, `VoiceContext.tsx`): `server_state.voice_mode` auto/cloud/self. auto'da istemci Cloud'a bağlanamazsa `cloudFailed:true` ile yeniden ister → `voice_fallback_until = now+3h`, herkes yedeğe; süre bitince Cloud, ama yedekte o odada kimse varsa oraya. Sahip: Ayarlar → **Ses sunucusu** (`VoiceServerDialog.tsx`, `set_voice_mode` RPC). Günlük kontrol: `.github/workflows/ses-yedek-kontrol.yml` (başarısızsa GitHub e-postası).
- Doğrulananlar: seçim mantığı 9 senaryoda Deno + sahte sunucuyla; `set_voice_mode` RLS (üye reddedildi, sahip değiştirdi, geçersiz değer reddedildi); LiveKit v1.13 yapılandırması açılıyor; iptables kuralları. **Denenmedi:** gerçek Oracle'da uçtan uca, sslip.io sertifikası, canlı ses ve Cloud kota hatasında geçiş, ayar penceresinin görünümü.

- **Araştırma (21 Kas, "ücretsiz + sınırsız" hedefi):** Cloudflare Realtime **SFU + TURN ayda 1.000 GB ücretsiz** (ortak kota, sonrası 0,05 $/GB; ürün sayfası "no credit card required" diyor: panelde doğrulanmadı). Önceki "Cloudflare TURN ücretli" notu YANLIŞTI. 1.000 GB ≈ 70.000+ dinleyici-saat ses ya da ~900 izleyici-saat 1080p yayın; LiveKit Cloud 5.000 dk = 83 kişi-saat. Seçenekler kullanıcıya sunuldu: (A) Oracle'da LiveKit (kod değişmez, makine gücü/kapasite sorunu), (B) ses katmanını Cloudflare Realtime SFU'ya taşımak (büyük yeniden yazım: `VoiceContext.tsx` livekit-client'a bağlı; oda/katılımcı/konuşan bilgisi Supabase presence + kendi kodumuz). **Kullanıcı B'yi seçti (21 Kas): aşamalı geçiş.**

## 🔜 SÜREN İŞ: sesi Cloudflare Realtime SFU'ya taşımak (B planı)
Kurallar: kart/ödeme YOK; Cloudflare panelde kart isterse dur, kullanıcıya sor.

**1. aşama (yalnız mikrofon) yazıldı ve yayında (21 Kas), canlıda mikrofon sesi doğrulandı**:
- `0023_cf_voice` uygulandı: `voice_mode` 4. değer `cf`; `voice_sessions` (kişi → kanal, `pub_session`, `sub_session`, `tracks[]`, `last_seen`; RLS: yalnız `can_view_channel` okur, yazma yok), `voice_beat()` (30 sn'de bir; kendi satırını tazeler + kanaldaki 90 sn içinde taze satırları döndürür), `voice_leave(pub)`.
- `supabase/functions/cf-voice` v1 dağıtıldı (verify_jwt kapalı, kendi doğrular). İşlemler: `join` (livekit-token ile aynı üyelik/izin/kişi sınırı + 2 Cloudflare oturumu), `publish`, `unpublish`, `pull` (hedef AYNI kanalda ve o izi yayınlıyorsa), `answer`, `close`. İstemci oturum kimliği seçemez.
- `src/voice/cfVoice.ts` (`CfRoom`): iki RTCPeerConnection (yayın: istemci offer; dinleme: SFU offer → `answer`), işlemler oturum başına sırada, kişi başı ses GainNode, konuşan göstergesi AnalyserNode, RNNoise (`createRnnoiseTrack`), susturma = `track.enabled`, çekme başarısızsa 1,5 sn'de yeniden dener.
- `VoiceContext.tsx`: girişte `server_state.voice_mode` okunur; `cf` ise `CfRoom`, değilse LiveKit (değişmedi). Cloudflare'de kamera/ekran düğmeleri "henüz yok" uyarısı verir.
- Ayarlar → Ses sunucusu → **Cloudflare (deneme)**.
- Doğrulananlar: `npm run build`, `deno check`, cf-voice 22 senaryo sahte Supabase + sahte Cloudflare ile (izinler, oda dolu, başka kanaldan iz çekememe, oturum yönlendirme). **Doğrulanmadı:** gerçek Cloudflare ile ses, RLS SQL testi (MCP onay istedi, zaman aşımı), Chrome'da Web Audio ile yankı engelleme, hoparlör seçimi (`AudioContext.setSinkId`).
- Belge kaynağı: bu ortamdan developers.cloudflare.com kapalı; `github.com/cloudflare/cloudflare-docs` deposundan okundu (`src/content/docs/realtime/sfu/`, OpenAPI `public/realtime/static/realtime-api-2024-05-21.yaml`).

**2. aşama (kamera + ekran + yayın sesi) yayında (22 Kas); kullanıcı canlıda denedi: "her şey çalışıyor"** (hangi adımları tek tek denediği sorulmadı). Not: Pages yayını iki kez "github-pages paketi bulunamadı" ile düştü; `pages.yml`'e bekleme + ikinci deneme eklendi.
- `cfVoice.ts`: `setCamera`, `switchCamera`, `startScreen` (kalite profilleri `CF_SHARE` VoiceContext'te; `restrictOwnAudio`), `stopScreen`; iz adları her yayında yeni (`cam-xxxx`, `screen-xxxx`, `screen-audio-xxxx`); kapatma pazarlıklı (`transceiver.stop()` + offer → `unpublish` sdp ile, `force:false`). Dinleyen odadaki tüm izleri çeker (görünmeyen videoyu duraklatma YOK: kota tüketir, ileride eklenebilir). Yayın sesi ayrı kazanç (`streamVolumes`).
- `VoiceParticipant.camera/screen` artık `VideoSource` (`attach/detach`); LiveKit `Track` yapısal olarak uyuyor.
- `cf-voice` v4 dağıtıldı (iz adı deseni, pazarlıklı `unpublish`). Sahte sunucu testleri geçti (25 senaryo).
- Doğrulanmadı: gerçek Cloudflare ile kamera/ekran, yayın sesi, masaüstü uygulamasında kaynak seçimi, kapatıp yeniden açma.

**3. tur (22 Kas) yayında, canlıda DENENMEDİ:**
- Kota koruması: görüntü (cam/screen) yalnız `CallStage` ekrandayken ve pencere görünürken indirilir; pencere 20 sn gizli kalırsa bırakılır (`voice.setWatching`, `cf.setVideoWanted`). Ses ve yayın sesi hep gelir.
- Otomatik yeniden bağlanma (`CfRoom.recover`): PeerConnection `failed`, 8 sn `disconnected` ya da Cloudflare 410 → aynı odaya yeni oturumlarla 4 deneme (0,5/2/5/10 sn). Mikrofon + kamera geri açılır; ekran paylaşımı yeniden başlatılmaz (uyarı verir).
- TURN desteği sunucuda hazır (`cf-voice` v5): `CF_TURN_KEY_ID` + `CF_TURN_KEY_TOKEN` sırları eklenirse `join` kısa ömürlü TURN kimliği döndürür; yoksa STUN. Sırlar EKLENMEDİ (biri bağlanamazsa: Cloudflare → Realtime → TURN → anahtar oluştur).

**Eksikler / sıradakiler**
- **CANLI DOĞRULANDI (22 Kas):** kullanıcı sanal kartla Cloudflare Realtime'ı açtı (bugün 0 $), `csn` SFU uygulaması + `CF_REALTIME_*` sırları eklendi, `voice_mode = cf`. İki kişiyle karşılıklı ses çalışıyor (kullanıcı doğruladı; günlüklerde join/publish 200). RLS SQL testi geçti. Bakım duyurusu kapatıldı (`MAINTENANCE.active=false`). Sıradaki: 2. aşama (kamera + ekran).
0. (Çözüldü) ~~ENGEL (22 Kas): Cloudflare Realtime'ı etkinleştirmek ödeme yöntemi istiyor** (kart / PayPal / Apple-Google Pay; bugün 0 $, 1.000 GB sonrası 0,05 $/GB). Kullanıcının kuralı kart yok: duruldu, karar kullanıcıda. Kullanıcı sanal kartla devam etti.~~
1. (Kullanıcı) Cloudflare hesabı → Realtime → Serverless SFU → uygulama oluştur → Supabase Edge Function sırları `CF_REALTIME_APP_ID`, `CF_REALTIME_APP_TOKEN` (App Secret). Adımlar kullanıcıya verildi. Kart istenirse dur.
2. Sırlar gelince: sahip Ayarlar → Ses sunucusu → Cloudflare seçer, iki kişiyle canlı deneme. Hata olursa `query_logs` ile cf-voice günlüklerine bak.
3. `livekit-token`'a "mod cf iken 409" koruması depoda var ama DAĞITILMADI (yayındaki v10). Cloudflare varsayılan olmadan önce dağıt.
4. (Yazıldı, bkz. üstte) 2. aşama: kamera + ekran (+ ekran sesi). `VoiceParticipant.camera/screen` LiveKit `Track` tipinde; `MediaStreamTrack` tabanlı ortak tipe çevir (`VoiceView.tsx`, `SettingsModal.tsx`). Sunucu tarafı hazır (iz adları `cam`, `screen`, `screen-audio`; `unpublish`).
5. Bilinen sınırlar: yalnız STUN (UDP kapalı ağlarda bağlanamayabilir; Cloudflare TURN ayrı anahtar ister, aynı 1.000 GB kotadan); bağlantı koparsa otomatik yeniden bağlanma yok (uyarı verip odadan düşer); bas-konuşta ilk basışta mikrofon izni/yayın ~1 sn gecikir; sekmesi kapanan kişi 90 sn listede kalabilir; DTX kapalı.
6. Oracle yedek: kullanıcı makineyi açıp `LIVEKIT_SELF_*` sırlarını ekleyince adresi `selfhost/livekit/host.txt`'e yaz, canlı test, `MAINTENANCE.active=false`, #yenilikler.

## Bekleyen karar
- Masaüstü .exe imzasız: Windows 11 "Akıllı Uygulama Denetimi" açık olan bilgisayarlarda engelleniyor (egunesx'te oldu). Geçici çözüm: PWA olarak yükleme (⚙️ → Uygulama olarak yükle). Kalıcı çözüm seçenekleri (Microsoft Store, ücretsiz bireysel hesap / kod imzalama sertifikası) kullanıcıya sunuldu; **"şimdilik kalsın" dedi**, sormadan başlama.

## Dikkat
- Supabase'te `insert(...).select()` (RETURNING) kullanırken okuma kuralının yeni satırı görebildiğinden emin ol (kanallar için `0010` ile düzeltildi).
- Bazı migrationlarda (politika silme) Supabase MCP kullanıcıdan onay ister; yanıt gelmezse zaman aşımı olur, kullanıcıya söyle.

## Sıradaki işler
- Onaylı revize kalmadı (#26-#30 bitti). Yeni istek gelirse `select * from revisions where status='approved'`.

## Kullanıcıyla konuşulan, bekleyen
- Güvenlik: kanallar özel yapıldı; kullanıcı sohbetin canlı aktığını doğrulayınca Supabase → Realtime → Settings → **Allow public access** kapatılacak. Ayrıca Auth → **Leaked password protection** açılması önerildi.
- Otomatik revize: "CSN onaylı revize denetimi" zamanlanmış görevi (saatte bir, yeni oturum) kuruldu ama **kapalı**: bu oturumdan göreve Supabase bağlantısı eklenemedi. Kullanıcı claude.ai → zamanlanmış görevler'den Supabase bağlantısını + `barishnc-creator/csn` deposunu ekleyip açacak.
- Uygulama adı değişikliği düşünülüyor (CSN = "couissin"). 10 öneri verildi (Kuzenhane, Cousy, Kuzn, Cuzzo, Tayfa, Cousinverse, Kuzen.io, Cousin Club, Familia, CSN+). Kullanıcı "isme daha sonra karar vereceğim" dedi: **sormadan başlama**. Seçince: `index.html` başlığı, `public/manifest`, `desktop/package.json` productName, sol üst logo harfi, metinler.

## Sıradaki adaylar
- Müzik botu canlıda denenmeli (iki kişiyle: sıra, tekrar, konsol). Bot hesabı `b0700000-0000-4000-8000-00000000b070` (`src/lib/bots.ts`)
- Başka yöneticinin yüklediği sticker silinince dosya depoda kalıyor (soundpad ile aynı sınır)
- Soundpad yayını Supabase broadcast (herkese açık kanal); istenirse LiveKit data mesajlarına taşınabilir
- Başka yöneticinin yüklediği ses silinince dosya depoda kalıyor
- Okunmamış sayılarını sunucuda saklama (şu an yenileyince sıfırlanıyor) — kullanıcıya önerildi
- GIF araması için GIPHY API anahtarı (ücretsiz) alınırsa sınırsız arama eklenebilir
0. Android uygulaması (Capacitor APK): kullanıcı "şimdilik kalsın" dedi, sormadan başlama
1. Masaüstü: oyun içindeyken de çalışan bas-konuş (soundpad'deki `uiohook-napi` altyapısı yeniden kullanılabilir), sistem tepsisi, uygulama simgesi (`desktop/build/icon.ico`), otomatik güncelleme
   - Yankı (sistem sesi paylaşımı) `restrictOwnAudio` ile çözüldü; canlı doğrulama bekliyor
2. Kod bölme: ana JS paketi ~1,1 MB (LiveKit ve RNNoise yalnız sese girince yüklensin)
3. Bildirim ayarları (kanal sessize alma), okunmamışların sunucuda saklanması
4. Grup DM'leri
5. Sabitlenen ya da aranan mesaja atlamak şu an yalnız yüklenmiş mesajlarda çalışıyor

## Çalışma şekli
- Değişiklik istekleri uygulama içindeki **Revizeler** bölümünden de gelir. Yalnız `approved` olanlar yapılır (bkz. `CLAUDE.md`).
- Kod değişince: `npm run build` → commit → push (`main`) → Pages yayını → kullanıcı **CSN → Herkesi yenile** der.
- Bağlam %50'yi geçince bu dosyayı güncelle ve commit'le.
