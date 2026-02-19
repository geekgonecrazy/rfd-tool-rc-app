import {
    HttpStatusCode,
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';
import { IApp } from '@rocket.chat/apps-engine/definition/IApp';
import { SettingId } from '../settings';
import { WebhookPayload, WebhookResponse } from '../lib/types';
import { verifySignature } from '../lib/crypto';
import { DiscussionManager } from '../lib/DiscussionManager';
import { DiscussionStore } from '../lib/DiscussionStore';

export class WebhookEndpoint extends ApiEndpoint {
    public path = 'webhook';

    constructor(app: IApp) {
        super(app);
    }

    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<IApiResponse> {
        const logger = this.app.getLogger();

        try {
            // Get settings
            const webhookSecret = await read.getEnvironmentReader().getSettings().getValueById(SettingId.WebhookSecret);
            const parentChannel = await read.getEnvironmentReader().getSettings().getValueById(SettingId.ParentChannel);
            const siteUrlOverride = await read.getEnvironmentReader().getSettings().getValueById(SettingId.SiteUrl);
            const prefix = await read.getEnvironmentReader().getSettings().getValueById(SettingId.Prefix) || 'RFD';

            if (!webhookSecret) {
                logger.error('Webhook secret not configured');
                return this.errorResponse(HttpStatusCode.INTERNAL_SERVER_ERROR, 'Webhook secret not configured');
            }

            if (!parentChannel) {
                logger.error('Parent channel not configured');
                return this.errorResponse(HttpStatusCode.INTERNAL_SERVER_ERROR, 'Parent channel not configured');
            }

            // Verify signature
            const signature = request.headers['x-rfd-signature'] as string;
            const bodyString = JSON.stringify(request.content);

            if (!verifySignature(bodyString, signature, webhookSecret)) {
                logger.warn('Invalid webhook signature');
                return this.errorResponse(HttpStatusCode.UNAUTHORIZED, 'Invalid signature');
            }

            // Parse payload
            const payload = request.content as WebhookPayload;
            
            if (!payload || !payload.event || !payload.rfd) {
                logger.warn('Invalid webhook payload');
                return this.errorResponse(HttpStatusCode.BAD_REQUEST, 'Invalid payload');
            }

            logger.info(`Received webhook: ${payload.event} for RFD ${payload.rfd.id}`);

            // Get site URL
            let siteUrl = siteUrlOverride;
            if (!siteUrl) {
                try {
                    const serverSettings = read.getEnvironmentReader().getServerSettings();
                    siteUrl = await serverSettings.getValueById('Site_Url');
                } catch (e) {
                    // Fallback if we can't read server settings
                    siteUrl = 'https://chat.example.com';
                }
            }

            // Create discussion manager
            const discussionManager = new DiscussionManager(read, modify, persis);

            // Handle event
            switch (payload.event) {
                case 'rfd.created':
                    return await this.handleCreated(payload, parentChannel, siteUrl, prefix, discussionManager, read.getPersistenceReader(), persis, logger);

                case 'rfd.updated':
                    return await this.handleUpdated(payload, read.getPersistenceReader(), persis, discussionManager, parentChannel, siteUrl, prefix, logger);

                default:
                    logger.warn(`Unknown event type: ${payload.event}`);
                    return this.errorResponse(HttpStatusCode.BAD_REQUEST, `Unknown event type: ${payload.event}`);
            }
        } catch (error) {
            logger.error('Webhook processing error:', error);
            return this.errorResponse(
                HttpStatusCode.INTERNAL_SERVER_ERROR,
                error instanceof Error ? error.message : 'Internal error'
            );
        }
    }

    private async handleCreated(
        payload: WebhookPayload,
        parentChannel: string,
        siteUrl: string,
        prefix: string,
        manager: DiscussionManager,
        persistenceRead: any,
        persistence: IPersistence,
        logger: any,
    ): Promise<IApiResponse> {
        const rfdId = payload.rfd.id;

        // First check if the incoming RFD already has a discussion link
        if (payload.rfd.discussion) {
            logger.info(`RFD ${rfdId} already has discussion link: ${payload.rfd.discussion}`);
            return this.jsonResponse({
                success: true,
                message: 'Discussion already exists',
                discussion: {
                    id: this.extractRoomIdFromUrl(payload.rfd.discussion) || '',
                    url: payload.rfd.discussion,
                },
            });
        }

        // Check persistence for existing discussion
        const existingDiscussion = await DiscussionStore.getDiscussion(persistenceRead, rfdId);
        if (existingDiscussion) {
            logger.info(`Found existing discussion for RFD ${rfdId} in persistence: ${existingDiscussion.roomUrl}`);
            return this.jsonResponse({
                success: true,
                message: 'Discussion already exists (from persistence)',
                discussion: {
                    id: existingDiscussion.roomId,
                    url: existingDiscussion.roomUrl,
                },
            });
        }

        // Create new discussion
        logger.info(`Creating discussion for RFD ${rfdId}: ${payload.rfd.title}`);

        const discussion = await manager.createDiscussion(
            parentChannel,
            payload.rfd,
            payload.link,
            siteUrl,
            prefix,
        );

        if (!discussion) {
            return this.errorResponse(HttpStatusCode.INTERNAL_SERVER_ERROR, 'Failed to create discussion');
        }

        // Store in persistence
        await DiscussionStore.storeDiscussion(persistence, rfdId, discussion.id, discussion.url);
        logger.info(`Discussion created and stored: ${discussion.url}`);

        const response: WebhookResponse = {
            success: true,
            discussion: {
                id: discussion.id,
                url: discussion.url,
            },
        };

        return this.jsonResponse(response);
    }

    private extractRoomIdFromUrl(url: string): string | null {
        const match = url.match(/\/group\/([^\/\?]+)/);
        return match ? match[1] : null;
    }

    private async handleUpdated(
        payload: WebhookPayload,
        persistenceRead: any,
        persistence: IPersistence,
        manager: DiscussionManager,
        parentChannel: string,
        siteUrl: string,
        prefix: string,
        logger: any,
    ): Promise<IApiResponse> {
        const rfdId = payload.rfd.id;

        // Check if we have a discussion URL to update - first from payload, then from persistence
        let discussionUrl = payload.rfd.discussion;
        
        if (!discussionUrl) {
            const existingDiscussion = await DiscussionStore.getDiscussion(persistenceRead, rfdId);
            if (existingDiscussion) {
                discussionUrl = existingDiscussion.roomUrl;
                logger.info(`Found discussion URL from persistence for RFD ${rfdId}: ${discussionUrl}`);
            }
        }

        // If no discussion exists, create one
        if (!discussionUrl) {
            logger.info(`RFD ${rfdId} has no discussion, creating one`);
            
            const discussion = await manager.createDiscussion(
                parentChannel,
                payload.rfd,
                payload.link,
                siteUrl,
                prefix,
            );

            if (!discussion) {
                return this.errorResponse(HttpStatusCode.INTERNAL_SERVER_ERROR, 'Failed to create discussion');
            }

            // Store in persistence
            await DiscussionStore.storeDiscussion(persistence, rfdId, discussion.id, discussion.url);
            logger.info(`Discussion created for updated RFD: ${discussion.url}`);

            return this.jsonResponse({
                success: true,
                discussion: {
                    id: discussion.id,
                    url: discussion.url,
                },
            });
        }

        // Update the payload's discussion URL for the manager
        payload.rfd.discussion = discussionUrl;

        if (!payload.changes) {
            logger.info(`No changes provided for RFD ${payload.rfd.id}`);
            return this.jsonResponse({ success: true, message: 'No changes to process' });
        }

        logger.info(`Updating discussion for RFD ${payload.rfd.id}`);

        await manager.updateDiscussion(
            payload.rfd.discussion,
            payload.rfd,
            payload.link,
            payload.changes,
        );

        return this.jsonResponse({ success: true });
    }

    private errorResponse(status: HttpStatusCode, message: string): IApiResponse {
        const response: WebhookResponse = {
            success: false,
            error: message,
        };
        return {
            status,
            content: response,
        };
    }

    private jsonResponse(content: any): IApiResponse {
        return {
            status: HttpStatusCode.OK,
            content,
        };
    }
}
