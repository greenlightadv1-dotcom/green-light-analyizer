-- ---------------------------------------------------------------------------
-- Green Light — deal rooms and messages are written by the server only.
--
-- Every write to deal_chats and messages in the product already goes through
-- a server action or the inbound webhook using the service role: that is where
-- the §6.1 mask runs, where the violation log is written, and where Discover's
-- rating and the escrow state machine are checked. The INSERT/UPDATE grants
-- and policies that 0003/0004/0010 gave `authenticated` were never used by the
-- app — and, because the anon key is public by design, they let any signed-in
-- user skip all of that by calling PostgREST directly from the browser.
--
-- Verified against the live schema before this migration, in a transaction
-- that was rolled back:
--
--   * a company inserted into `messages` directly and the text was stored
--     UNMASKED ("wa.me/2010… or call 0101…") with no violation logged — the
--     contact-exchange filter and the permanent-ban evidence both bypassed;
--   * a company inserted a `deal_chats` row into another creator's inbox with
--     sender_email 'security@greenlightadvs.com' — no creator validation, no
--     rate limit, and a spoofable sender;
--   * a creator moved a deal an admin had marked 'paid' back to 'new' — the
--     policy's WITH CHECK only stopped *setting* paid, not leaving it, so the
--     escrow record (§12) could be erased by a party.
--
-- With the grants gone none of those can reach the table. Reads are untouched:
-- SELECT policies still scope each room and its messages to its parties and to
-- admins, and realtime (which needs SELECT only) keeps working. Undo with the
-- GRANTs at the bottom if a future feature genuinely needs client-side writes —
-- but it should get its own policy, written for that feature, rather than
-- these.
-- ---------------------------------------------------------------------------

revoke insert, update on public.deal_chats from authenticated;
revoke insert on public.messages from authenticated;

-- The policies were the only thing these grants were for. Dropped so no one
-- reads them later as a guard that is still doing work.
drop policy if exists deal_chats_insert on public.deal_chats;
drop policy if exists deal_chats_update on public.deal_chats;
drop policy if exists messages_insert on public.messages;

-- To undo (not recommended — see above):
--   grant insert (id, creator_id, company_id, sender_email, sponsorship_type, target_countries)
--     on public.deal_chats to authenticated;
--   grant update (deal_status, sponsorship_type, target_countries) on public.deal_chats to authenticated;
--   grant insert (id, chat_id, sender_id, message_text) on public.messages to authenticated;
--   ...and recreate the three policies from 0010.
