-- Read-only, masked export of Green Light application data for an off-production
-- migration rehearsal. Personal data and secrets are replaced inside the query
-- (emails, names, free text, tokens), keeping NULL-ness and text length so
-- constraint checks stay meaningful. auth.users is exported as ids only.
-- This is NOT a backup: it omits auth internals, vault, storage objects and roles.
select jsonb_build_object(
 'auth_users', (select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]') from auth.users),
 'profiles', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
     'full_name', 'Name '||left(md5(p.id::text), 6),
     'primary_email', 'u-'||left(md5(p.id::text), 10)||'@example.invalid',
     'bio', case when p.bio is null then null else repeat('x', char_length(p.bio)) end,
     'banned_reason', case when p.banned_reason is null then null else repeat('x', char_length(p.banned_reason)) end,
     'whatsapp_number', case when p.whatsapp_number is null then null else '+201000000000' end,
     'avatar_url', case when p.avatar_url is null then null else 'https://example.invalid/a.png' end,
     'social_links', case when p.social_links is null then null else '{}'::jsonb end,
     'company_website', case when p.company_website is null then null else 'https://example.invalid' end,
     'inbound_alias', case when p.inbound_alias is null then null else 'a'||left(md5(p.inbound_alias), 10) end,
     'previous_inbound_alias', case when p.previous_inbound_alias is null then null else 'a'||left(md5(p.previous_inbound_alias), 10) end,
     'shareable_slug', case when p.shareable_slug is null then null else 's'||left(md5(p.shareable_slug), 10) end)), '[]') from public.profiles p),
 'media_kits', (select coalesce(jsonb_agg(to_jsonb(k) || jsonb_build_object(
     'platform_handle', case when k.platform_handle is null then null else '@handle'||left(md5(k.id::text), 6) end)), '[]') from public.media_kits k),
 'deal_chats', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object(
     'sender_email', 's-'||left(md5(d.id::text), 10)||'@example.invalid',
     'security_check', case when d.security_check is null then null else '{}'::jsonb end,
     'company_profile', case when d.company_profile is null then null else '{}'::jsonb end)), '[]') from public.deal_chats d),
 'messages', (select coalesce(jsonb_agg(to_jsonb(g) || jsonb_build_object(
     'message_text', repeat('x', greatest(char_length(g.message_text), 1)),
     'relay_error', case when g.relay_error is null then null else repeat('x', char_length(g.relay_error)) end)), '[]') from public.messages g),
 'inbound_emails', (select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object(
     'sender_email', case when i.sender_email is null then null else 'e-'||left(md5(i.id::text), 10)||'@example.invalid' end,
     'subject', case when i.subject is null then null else repeat('x', char_length(i.subject)) end,
     'to_alias', case when i.to_alias is null then null else 'a'||left(md5(i.to_alias), 10) end,
     'provider_message_id', case when i.provider_message_id is null then null else 'm'||md5(i.provider_message_id) end,
     'detail', case when i.detail is null then null else repeat('x', char_length(i.detail)) end)), '[]') from public.inbound_emails i),
 'oauth_connections', (select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(
     'access_token', 'redacted', 'refresh_token', case when o.refresh_token is null then null else 'redacted' end,
     'external_account_id', case when o.external_account_id is null then null else 'acct-'||left(md5(o.id::text), 8) end)), '[]') from public.oauth_connections o),
 'violation_logs', (select coalesce(jsonb_agg(to_jsonb(v) || jsonb_build_object(
     'redacted_excerpt', case when v.redacted_excerpt is null then null else repeat('x', char_length(v.redacted_excerpt)) end)), '[]') from public.violation_logs v),
 'admin_actions', (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object(
     'old_value', case when a.old_value is null then null else 'x' end,
     'new_value', case when a.new_value is null then null else 'x' end)), '[]') from public.admin_actions a),
 'promo_codes', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('code', 'CODE'||left(md5(c.code), 6))), '[]') from public.promo_codes c),
 'access_requests', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.access_requests r),
 'company_members', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.company_members c)
) as export;
