# CSN — Devir notu

> Yeni bir oturum buradan devam eder. Önce bunu, sonra `CLAUDE.md`'yi oku.
> Son güncelleme: 2026-11-15

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
| Uygulama içi ekran paylaşımı seçici + Electron masaüstü uygulaması (`desktop/`) | ⏳ alt ajan çalışıyor |

## Migrationlar (sırayla uygulandı)
`0001_init` → `0002_lock_anon_functions` → `0003_owner_and_revisions` → `0004_dm_kind` → `0005_roles_dm_reactions_pins_profile` → `0006_server_reload` → `0007_friendships`

## Sıradaki adaylar
1. Windows masaüstü uygulaması (Tauri): oyun içindeyken de çalışan bas-konuş, sistem tepsisi
2. Kod bölme: ana JS paketi ~1,1 MB (LiveKit ve RNNoise yalnız sese girince yüklensin)
3. Bildirim ayarları (kanal sessize alma), okunmamışların sunucuda saklanması
4. Grup DM'leri
5. Sabitlenen ya da aranan mesaja atlamak şu an yalnız yüklenmiş mesajlarda çalışıyor

## Çalışma şekli
- Değişiklik istekleri uygulama içindeki **Revizeler** bölümünden de gelir. Yalnız `approved` olanlar yapılır (bkz. `CLAUDE.md`).
- Kod değişince: `npm run build` → commit → push (`main`) → Pages yayını → kullanıcı **CSN → Herkesi yenile** der.
- Bağlam %50'yi geçince bu dosyayı güncelle ve commit'le.
