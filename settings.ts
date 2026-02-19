import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum SettingId {
    ParentChannel = 'parent_channel',
    WebhookSecret = 'webhook_secret',
    SiteUrl = 'site_url',
    Prefix = 'prefix',
    OverwriteInvalidDiscussionUrl = 'overwrite_invalid_discussion_url',
    UseDeepLinks = 'use_deep_links',
}

export const settings: ISetting[] = [
    {
        id: SettingId.ParentChannel,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Parent Channel',
        i18nDescription: 'The channel where discussions will be created (e.g., "adrs" or "architecture")',
    },
    {
        id: SettingId.WebhookSecret,
        type: SettingType.PASSWORD,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Webhook Secret',
        i18nDescription: 'Shared secret for validating incoming webhooks (HMAC-SHA256). Must match the secret configured in rfd-tool.',
    },
    {
        id: SettingId.SiteUrl,
        type: SettingType.STRING,
        packageValue: '',
        required: false,
        public: false,
        i18nLabel: 'Site URL Override',
        i18nDescription: 'Override the Rocket.Chat site URL for discussion links (leave empty to use server default)',
    },
    {
        id: SettingId.Prefix,
        type: SettingType.STRING,
        packageValue: 'RFD',
        required: false,
        public: false,
        i18nLabel: 'Discussion Prefix',
        i18nDescription: 'Prefix for discussion names (e.g., "RFD" or "ADR"). Default: RFD',
    },
    {
        id: SettingId.OverwriteInvalidDiscussionUrl,
        type: SettingType.BOOLEAN,
        packageValue: false,
        required: false,
        public: false,
        i18nLabel: 'Overwrite Invalid Discussion URL',
        i18nDescription: 'When enabled, if an RFD has an invalid discussion URL (e.g., pointing to GitHub instead of Rocket.Chat), a new discussion will be created to replace it.',
    },
    {
        id: SettingId.UseDeepLinks,
        type: SettingType.BOOLEAN,
        packageValue: true,
        required: false,
        public: false,
        i18nLabel: 'Use Deep Links',
        i18nDescription: 'When enabled, discussion URLs will use the go.rocket.chat universal deep link format (e.g., https://go.rocket.chat/room?host=chat.example.com&path=group/room-id) which works with mobile apps and desktop clients. When disabled, direct site URLs will be used (e.g., https://chat.example.com/group/room-id).',
    },
];
