-- Doğrudan mesajlar kanal türü olarak tutulur (ayrı migration: yeni enum değeri aynı işlemde kullanılamaz)
alter type public.channel_kind add value if not exists 'dm';
