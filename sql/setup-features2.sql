-- ============================================================
-- Yey — قابلیت‌های جدید: نوتیفیکیشن‌ها، جستجو، تقویم، تماس
-- این دستورات را یک‌بار در SQL Editor دشبورد Supabase اجرا کنید
-- (Supabase → SQL Editor → New query → Paste → Run)
-- قبلش حتماً setup-all.sql و voice-fix.sql هم اجرا شده باشند.
-- ============================================================

-- ============ 1) ایندکس برای جستجوی سریع پیام‌ها ============
create index if not exists idx_messages_search on public.messages (chat_type, group_id, created_at desc);
create index if not exists idx_messages_receiver on public.messages (chat_type, receiver_id, created_at desc);

-- ============ 2) نوتیفیکیشن خودکار برای پیام جدید / منشن ============
-- (ستون‌های لازم پیام — در صورت نیاز مجدداً ساخته می‌شوند)
alter table public.messages
    add column if not exists attachment_url text,
    add column if not exists attachment_type text,
    add column if not exists attachment_name text,
    add column if not exists location_lat double precision,
    add column if not exists location_lng double precision;
-- وقتی پیام متنی در چت گروهی/خصوصی نوشته می‌شود، برای اعضای مربوطه
-- یک ردیف در جدول notifications ساخته می‌شود.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    m record;
    ntype text;
begin
    -- چت گروهی: به همه اعضای گروه (به‌جز فرستنده)
    if NEW.chat_type = 'group' then
        for m in
            select user_id, user_name from public.group_members
            where group_id = NEW.group_id and user_id is not null and user_id <> NEW.user_id
        loop
            ntype := 'message';
            if NEW.content is not null and m.user_name is not null
               and position(m.user_name in NEW.content) > 0 then
                ntype := 'mention';
            end if;
            insert into public.notifications
                (user_id, notif_key, title, body, notif_type, icon, link)
            values
                (m.user_id,
                 'msg-' || NEW.id,
                 NEW.user_name || ' در ' || coalesce((select name from public.chat_groups where id = NEW.group_id), 'گروه'),
                 case
                    when NEW.content is not null and length(trim(NEW.content)) > 0 then left(NEW.content, 120)
                    when NEW.attachment_type like 'image/%' then '🖼️ عکس'
                    when NEW.attachment_type is not null then '📎 فایل'
                    else 'پیام جدید'
                 end,
                 ntype,
                 case when ntype = 'mention' then '📍' else '💬' end,
                 '/#chat');
        end loop;
    -- چت خصوصی: فقط برای گیرنده
    elsif NEW.receiver_id is not null and NEW.user_id <> NEW.receiver_id then
        insert into public.notifications
            (user_id, notif_key, title, body, notif_type, icon, link)
        values
            (NEW.receiver_id,
             'msg-' || NEW.id,
             NEW.user_name || ' (خصوصی)',
             case
                when NEW.content is not null and length(trim(NEW.content)) > 0 then left(NEW.content, 120)
                when NEW.attachment_type like 'image/%' then '🖼️ عکس'
                when NEW.attachment_type is not null then '📎 فایل'
                else 'پیام جدید'
             end,
             'message', '💬', '/#chat');
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
after insert on public.messages
for each row execute function public.notify_new_message();

-- ============ 3) نوتیفیکیشن ویس جدید ============
create or replace function public.notify_new_voice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    m record;
begin
    if NEW.chat_type = 'group' then
        for m in
            select user_id from public.group_members
            where group_id = NEW.group_id and user_id is not null and user_id <> NEW.user_id
        loop
            insert into public.notifications
                (user_id, notif_key, title, body, notif_type, icon, link)
            values
                (m.user_id, 'voice-' || NEW.id,
                 NEW.user_name || ' در ' || coalesce((select name from public.chat_groups where id = NEW.group_id), 'گروه'),
                 '🎤 پیام صوتی (' || coalesce(NEW.duration, 0) || ' ثانیه)',
                 'message', '🎤', '/#chat');
        end loop;
    elsif NEW.receiver_id is not null and NEW.user_id <> NEW.receiver_id then
        insert into public.notifications
            (user_id, notif_key, title, body, notif_type, icon, link)
        values
            (NEW.receiver_id, 'voice-' || NEW.id,
             NEW.user_name || ' (خصوصی)',
             '🎤 پیام صوتی (' || coalesce(NEW.duration, 0) || ' ثانیه)',
             'message', '🎤', '/#chat');
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_new_voice on public.voice_messages;
create trigger trg_notify_new_voice
after insert on public.voice_messages
for each row execute function public.notify_new_voice();

-- ============ 4) نوتیفیکیشن تسویه ============
create or replace function public.notify_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.to_user_id is not null and NEW.from_user_id <> NEW.to_user_id then
        insert into public.notifications
            (user_id, notif_key, title, body, notif_type, icon, link)
        values
            (NEW.to_user_id, 'settle-' || NEW.id,
             '💳 تسویه حساب',
             NEW.from_user || ' مبلغ ' || NEW.amount || ' تومان به تو تسویه کرد',
             'settlement', '💳', '/#expenses');
    end if;
    return NEW;
end;
$$;

-- ستون‌های لازم جدول تسویه (اگه نبود)
alter table public.settlements
    add column if not exists from_user_id text,
    add column if not exists to_user_id text;

drop trigger if exists trg_notify_settlement on public.settlements;
create trigger trg_notify_settlement
after insert on public.settlements
for each row execute function public.notify_settlement();

-- ============ 5) نوتیفیکیشن رویداد تقویم ============
create or replace function public.notify_new_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    m record;
begin
    for m in
        select user_id, user_name from public.user_presence
        where user_id is not null and user_id <> NEW.created_by
    loop
        insert into public.notifications
            (user_id, notif_key, title, body, notif_type, icon, link)
        values
            (m.user_id, 'event-' || NEW.id,
             '📅 رویداد جدید: ' || NEW.title,
             NEW.event_date || coalesce(' ساعت ' || NEW.event_time, '') || ' — توسط ' || NEW.created_by_name,
             'event', '📅', '/#calendar');
    end loop;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_new_event on public.events;
create trigger trg_notify_new_event
after insert on public.events
for each row execute function public.notify_new_event();

-- ============ 6) ریل‌تایم جدول نوتیفیکیشن و ستون‌های اضافه ============
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table user_presence;

-- ستون‌های ارجاع‌دهنده در جدول تسویه و گیرندهٔ نوتیفیکیشن
alter table public.settlements
    add column if not exists from_user_id text,
    add column if not exists to_user_id text;

-- ستون برای ذخیره مسیر استوریج خاطرات (در صورت نیاز)
alter table public.memories
    add column if not exists storage_path text;
