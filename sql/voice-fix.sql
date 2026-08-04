-- ============================================================
-- رفع ارسال و پخش پیام صوتی (ویس)
-- این دستورات را در SQL Editor دشبورد Supabase اجرا کنید
-- (بخش: SQL Editor → New query → Paste → Run)
-- ============================================================

-- 1) ساخت باکت ذخیره‌سازی صدا (اگر نبود)
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', true)
on conflict (id) do update set public = true;

-- 2) اجازه آپلود فایل صدا برای همه کاربران (رفع خطای RLS)
drop policy if exists "voice-upload-anon" on storage.objects;
create policy "voice-upload-anon"
on storage.objects for insert
with check (bucket_id = 'voice-messages');

-- 3) اجازه خواندن فایل‌های صدا (عمومی)
drop policy if exists "voice-read-public" on storage.objects;
create policy "voice-read-public"
on storage.objects for select
using (bucket_id = 'voice-messages');

-- 4) اجازه حذف فایل صدا (اختیاری، برای دکمه حذف ویس)
drop policy if exists "voice-delete-any" on storage.objects;
create policy "voice-delete-any"
on storage.objects for delete
using (bucket_id = 'voice-messages');

-- 5) ستون‌های جدید جدول صدا (برای چت گروهی/خصوصی) — اختیاری
alter table public.voice_messages
    add column if not exists chat_type text default 'group',
    add column if not exists group_id bigint,
    add column if not exists receiver_id text,
    add column if not exists user_avatar text;

-- 6) ستون گروه برای نظرسنجی‌ها — اختیاری
alter table public.polls
    add column if not exists group_id bigint;

-- 7) فعال‌سازی ریل‌تایم برای پین/ویس/نظرسنجی
-- (بدون این، پین و ویس جدید برای بقیه بدون رفرش نمایش داده نمی‌شود)
alter publication supabase_realtime add table pinned_messages;
alter publication supabase_realtime add table voice_messages;
alter publication supabase_realtime add table polls;
