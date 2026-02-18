import {
    IAppAccessors,
    IConfigurationExtend,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { ApiSecurity, ApiVisibility } from '@rocket.chat/apps-engine/definition/api';
import { settings } from './settings';
import { WebhookEndpoint } from './endpoints/WebhookEndpoint';

export class RfdDiscussionsApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        // Register settings
        for (const setting of settings) {
            await configuration.settings.provideSetting(setting);
        }

        // Register webhook endpoint
        await configuration.api.provideApi({
            visibility: ApiVisibility.PUBLIC,
            security: ApiSecurity.UNSECURE,
            endpoints: [
                new WebhookEndpoint(this),
            ],
        });
    }
}
