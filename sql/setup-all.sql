-- ============================================================
-- Yey — نصب کامل قابلیت‌های جدید
-- این دستورات را یک‌بار در SQL Editor دشبورد Supabase اجرا کنید
-- (Supabase → SQL Editor → New query → Paste → Run)
-- ============================================================

-- ============ 1) باکت‌های ذخیره‌سازی ============
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true),
       ('memories', 'memories', true)
on conflict (id) do update set public = true;

-- دسترسی آپلود/خواندن/حذف فایل‌های چت
drop policy if exists "chat-files-upload" on storage.objects;
create policy "chat-files-upload" on storage.objects for insert
with check (bucket_id = 'chat-files');
drop policy if exists "chat-files-read" on storage.objects;
create policy "chat-files-read" on storage.objects for select
using (bucket_id = 'chat-files');
drop policy if exists "chat-files-delete" on storage.objects;
create policy "chat-files-delete" on storage.objects for delete
using (bucket_id = 'chat-files');

-- دسترسی خاطرات
drop policy if exists "memories-upload" on storage.objects;
create policy "memories-upload" on storage.objects for insert
with check (bucket_id = 'memories');
drop policy if exists "memories-read" on storage.objects;
create policy "memories-read" on storage.objects for select
using (bucket_id = 'memories');
drop policy if exists "memories-delete" on storage.objects;
create policy "memories-delete" on storage.objects for delete
using (bucket_id = 'memories');

-- ============ 2) ستون‌های جدید جدول پیام‌ها (عکس/فایل/موقعیت) ============
alter table public.messages
    add column if not exists attachment_url text,
    add column if not exists attachment_type text,
    add column if not exists attachment_name text,
    add column if not exists location_lat double precision,
    add column if not exists location_lng double precision;

-- ============ 3) حضور زنده (آنلاین/آفلاین) ============
create table if not exists public.user_presence (
    user_id text primary key,
    user_name text,
    user_avatar text,
    last_seen timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.user_presence enable row level security;
drop policy if exists "presence-select" on public.user_presence;
create policy "presence-select" on public.user_presence for select using (true);
drop policy if exists "presence-upsert" on public.user_presence;
create policy "presence-upsert" on public.user_presence for all using (true) with check (true);

-- ============ 4) نوتیفیکیشن‌های درون‌برنامه‌ای ============
create table if not exists public.notifications (
    id bigint generated always as identity primary key,
    user_id text not null,
    notif_key text,
    title text,
    body text,
    notif_type text,
    icon text,
    link text,
    read boolean default false,
    created_at timestamptz default now()
);

alter table public.notifications enable row level security;
drop policy if exists "notifications-select" on public.notifications;
create policy "notifications-select" on public.notifications for select using (true);
drop policy if exists "notifications-insert" on public.notifications;
create policy "notifications-insert" on public.notifications for insert with check (true);
drop policy if exists "notifications-update" on public.notifications;
create policy "notifications-update" on public.notifications for update using (true);

-- ============ 5) تماس صوتی/تصویری (WebRTC) ============
create table if not exists public.call_rooms (
    id bigint generated always as identity primary key,
    created_by text,
    created_by_name text,
    active boolean default true,
    created_at timestamptz default now()
);

create table if not exists public.call_members (
    id bigint generated always as identity primary key,
    room_id bigint not null references public.call_rooms(id) on delete cascade,
    user_id text not null,
    user_name text,
    active boolean default true,
    joined_at timestamptz default now()
);

create table if not exists public.call_signals (
    id bigint generated always as identity primary key,
    room_id bigint not null references public.call_rooms(id) on delete cascade,
    from_id text,
    to_id text,
    signal_type text,
    payload jsonb,
    created_at timestamptz default now()
);

alter table public.call_rooms enable row level security;
alter table public.call_members enable row level security;
alter table public.call_signals enable row level security;
drop policy if exists "calls-all" on public.call_rooms;
create policy "calls-all" on public.call_rooms for all using (true) with check (true);
drop policy if exists "calls-members-all" on public.call_members;
create policy "calls-members-all" on public.call_members for all using (true) with check (true);
drop policy if exists "calls-signals-all" on public.call_signals;
create policy "calls-signals-all" on public.call_signals for all using (true) with check (true);

-- ============ 6) تقویم مشترک گروهی ============
create table if not exists public.events (
    id bigint generated always as identity primary key,
    title text not null,
    event_date date not null,
    event_time text,
    event_type text default 'دیگر',
    created_by text,
    created_by_name text,
    created_at timestamptz default now()
);

alter table public.events enable row level security;
drop policy if exists "events-all" on public.events;
create policy "events-all" on public.events for all using (true) with check (true);

-- ============ 7) فعال‌سازی ریل‌تایم برای جداول جدید ============
alter publication supabase_realtime add table user_presence;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table call_rooms;
alter publication supabase_realtime add table call_members;
alter publication supabase_realtime add table call_signals;
alter publication supabase_realtime add table events;