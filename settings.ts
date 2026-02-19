import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum SettingId {
    ParentChannel = 'parent_channel',
    WebhookSecret = 'webhook_secret',
    SiteUrl = 'site_url',
    Prefix = 'prefix',
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
];
