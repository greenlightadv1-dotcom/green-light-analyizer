"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { saveCreatorProfile, type CreatorProfileState } from "@/lib/media-kit/actions";
import type { Profile } from "@/lib/auth";

const textareaClass =
  "w-full resize-y rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

const SOCIAL_FIELDS = [
  { key: "youtube", labelKey: "mediaKit.socialYoutube", placeholder: "@handle" },
  { key: "instagram", labelKey: "mediaKit.socialInstagram", placeholder: "@handle" },
  { key: "tiktok", labelKey: "mediaKit.socialTiktok", placeholder: "@handle" },
  { key: "x", labelKey: "mediaKit.socialX", placeholder: "@handle" },
  { key: "twitch", labelKey: "mediaKit.socialTwitch", placeholder: "handle" },
] as const;

function SaveButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button type="submit" disabled={pending} fullWidth={false} className="px-5">
      {pending ? t("common.saving") : t("common.save")}
    </Button>
  );
}

/**
 * "Creator Profile setup" + "Social Accounts Integration" — the friendlier
 * layer on top of §7's verified-audience model, not a replacement for it.
 * avg_views, engagement_rate, declared/verified_top_countries and
 * audience_verified stay exactly where they were, on media_kits, driven by
 * PlatformCard/VerificationPanel below this on the page — this component
 * only ever touches the new profiles columns from migration 0017.
 *
 * Both sections share ONE <form> and ONE save action deliberately:
 * saveCreatorProfile() writes every field from whatever FormData it
 * receives, so two independent forms hitting the same action would each
 * silently blank out the other's fields on save.
 */
export function CreatorProfileCard({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const [state, formAction] = useActionState<CreatorProfileState, FormData>(
    saveCreatorProfile,
    { error: null, saved: false },
  );
  const socialLinks = profile.social_links ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <GlassPanel className="p-6">
        <h2 className="text-sm font-semibold text-fg">{t("mediaKit.creatorProfile")}</h2>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-fg/10 bg-fg/5">
              {profile.avatar_url ? (
                // Arbitrary creator-supplied external URL; next/image needs a
                // configured remote-pattern allowlist that can't cover an
                // unknown host set.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-fg/30">
                  {profile.full_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <Field
                id="avatar_url"
                name="avatar_url"
                type="url"
                label={t("mediaKit.avatarUrl")}
                placeholder="https://…"
                defaultValue={profile.avatar_url ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="block text-xs font-medium tracking-wide text-fg/70 uppercase">
              {t("mediaKit.nameLabel")}
            </p>
            <p className="text-sm text-fg">{profile.full_name}</p>
            <p className="text-xs text-fg/40">{t("mediaKit.editNameInSettings")}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bio" className="block text-xs font-medium tracking-wide text-fg/70 uppercase">
              {t("mediaKit.bio")}
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              maxLength={1000}
              placeholder={t("mediaKit.bioPlaceholder")}
              defaultValue={profile.bio ?? ""}
              className={textareaClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="country"
              name="country"
              label={t("mediaKit.country")}
              placeholder="Egypt"
              defaultValue={profile.country ?? ""}
            />
            <Field
              id="primary_language"
              name="primary_language"
              label={t("mediaKit.primaryLanguage")}
              placeholder="Arabic"
              defaultValue={profile.primary_language ?? ""}
            />
          </div>

          <Field
            id="base_rate_usd"
            name="base_rate_usd"
            type="number"
            min={0}
            step="1"
            label={t("mediaKit.baseRate")}
            placeholder="e.g. 1200"
            hint={t("mediaKit.baseRateHint")}
            defaultValue={profile.base_rate_usd ?? ""}
          />
        </div>
      </GlassPanel>

      <GlassPanel className="p-6">
        <h2 className="text-sm font-semibold text-fg">{t("mediaKit.socialAccounts")}</h2>
        <p className="mt-1 text-xs text-fg/40">{t("mediaKit.socialAccountsNote")}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {SOCIAL_FIELDS.map(({ key, labelKey, placeholder }) => (
            <Field
              key={key}
              id={`social_${key}`}
              name={`social_${key}`}
              label={t(labelKey)}
              placeholder={placeholder}
              defaultValue={socialLinks[key] ?? ""}
            />
          ))}
        </div>
      </GlassPanel>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.saved ? <Alert tone="info">{t("common.saved")}</Alert> : null}

      <SaveButton />
    </form>
  );
}
