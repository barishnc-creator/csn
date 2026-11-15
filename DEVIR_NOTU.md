# CSN — Devir notu

> Yeni bir oturum buradan devam eder. Önce bunu, sonra `CLAUDE.md`'yi oku.
> Son güncelleme: 2026-11-15 (revize #17, #20-#23 yayında)

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
| Electron masaüstü uygulaması (`desktop/`), kurulum: Actions → "Masaüstü (Windows)" ya da `desktop-v*` etiketi | ✅ 0.1.1 yayında: https://github.com/barishnc-creator/csn/releases/latest (Actions → "Masaüstü (Windows)" elle başlatılınca `desktop/package.json` sürümüyle yeni Release açar; bu ortamdan etiket push'u engelli) |

## Migrationlar (sırayla uygulandı)
`0001_init` → `0002_lock_anon_functions` → `0003_owner_and_revisions` → `0004_dm_kind` → `0005_roles_dm_reactions_pins_profile` → `0006_server_reload` → `0007_friendships` → `0008_tag_banner` → `0009_channel_join_roles` → `0010_channels_select_row_based` → `0011_submit_revisions_perm` → `0012_music` → `0013_soundpad` → `0014_server_theme` → `0015_stickers` → `0016_music_bot` → `0017_bot_settings` → `0018_manage_sounds_perm`

## Bekleyen karar
- Masaüstü .exe imzasız: Windows 11 "Akıllı Uygulama Denetimi" açık olan bilgisayarlarda engelleniyor (egunesx'te oldu). Geçici çözüm: PWA olarak yükleme (⚙️ → Uygulama olarak yükle). Kalıcı çözüm seçenekleri (Microsoft Store, ücretsiz bireysel hesap / kod imzalama sertifikası) kullanıcıya sunuldu; **"şimdilik kalsın" dedi**, sormadan başlama.

## Dikkat
- Supabase'te `insert(...).select()` (RETURNING) kullanırken okuma kuralının yeni satırı görebildiğinden emin ol (kanallar için `0010` ile düzeltildi).
- Bazı migrationlarda (politika silme) Supabase MCP kullanıcıdan onay ister; yanıt gelmezse zaman aşımı olur, kullanıcıya söyle.

## Sıradaki işler
- Onaylı revize yok (#17, #20-#24 bitti). Yeni istek için `select * from revisions where status='approved'`.
- Masaüstü 0.1.3 derlemesi bu oturumda tetiklendi; Releases'ta olduğunu doğrula. Kullanıcı canlıda başlık çubuğunu denemeli.

## Sıradaki adaylar
- Müzik botu canlıda denenmeli (iki kişiyle: sıra, tekrar, konsol). Bot hesabı `b0700000-0000-4000-8000-00000000b070` (`src/lib/bots.ts`)
- Başka yöneticinin yüklediği sticker silinince dosya depoda kalıyor (soundpad ile aynı sınır)
- Soundpad yayını Supabase broadcast (herkese açık kanal); istenirse LiveKit data mesajlarına taşınabilir
- Başka yöneticinin yüklediği ses silinince dosya depoda kalıyor
- Okunmamış sayılarını sunucuda saklama (şu an yenileyince sıfırlanıyor) — kullanıcıya önerildi
- GIF araması için GIPHY API anahtarı (ücretsiz) alınırsa sınırsız arama eklenebilir
0. Android uygulaması (Capacitor APK): kullanıcı "şimdilik kalsın" dedi, sormadan başlama
1. Masaüstü: oyun içindeyken de çalışan bas-konuş (globalShortcut), sistem tepsisi, uygulama simgesi (`desktop/build/icon.ico`), otomatik güncelleme
   - Bilinen sınır: masaüstünde sistem sesi paylaşılınca CSN'nin kendi sesi de gider (yankı)
2. Kod bölme: ana JS paketi ~1,1 MB (LiveKit ve RNNoise yalnız sese girince yüklensin)
3. Bildirim ayarları (kanal sessize alma), okunmamışların sunucuda saklanması
4. Grup DM'leri
5. Sabitlenen ya da aranan mesaja atlamak şu an yalnız yüklenmiş mesajlarda çalışıyor

## Çalışma şekli
- Değişiklik istekleri uygulama içindeki **Revizeler** bölümünden de gelir. Yalnız `approved` olanlar yapılır (bkz. `CLAUDE.md`).
- Kod değişince: `npm run build` → commit → push (`main`) → Pages yayını → kullanıcı **CSN → Herkesi yenile** der.
- Bağlam %50'yi geçince bu dosyayı güncelle ve commit'le.
