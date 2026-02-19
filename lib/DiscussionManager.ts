import {
    IModify,
    IRead,
    IPersistence,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RFD, RFDChanges, STATE_DESCRIPTIONS } from './types';

export class DiscussionManager {
    constructor(
        private readonly read: IRead,
        private readonly modify: IModify,
        private readonly persistence: IPersistence,
        private readonly logger?: ILogger,
    ) {}

    private log(message: string): void {
        if (this.logger) {
            this.logger.info(message);
        }
    }

    /**
     * Create a new discussion for an RFD
     */
    async createDiscussion(
        parentChannel: string,
        rfd: RFD,
        rfdLink: string,
        siteUrl: string,
        prefix: string = 'RFD',
    ): Promise<{ id: string; url: string } | null> {
        // Get the parent room
        const parentRoom = await this.read.getRoomReader().getByName(parentChannel);
        if (!parentRoom) {
            throw new Error(`Parent channel '${parentChannel}' not found`);
        }

        // Get bot user (the app user)
        const appUser = await this.read.getUserReader().getAppUser();
        if (!appUser) {
            throw new Error('App user not found');
        }

        // Build discussion name and description
        const discussionName = `${prefix}-${rfd.id}: ${rfd.title}`;
        const description = this.buildDescription(rfd, rfdLink);

        // Create the discussion
        const discussionBuilder = this.modify.getCreator().startDiscussion()
            .setParentRoom(parentRoom)
            .setDisplayName(discussionName)
            .setSlugifiedName(this.slugify(`${prefix.toLowerCase()}-${rfd.id}-${rfd.title}`))
            .setCreator(appUser);

        const discussionId = await this.modify.getCreator().finish(discussionBuilder);
        
        if (!discussionId) {
            throw new Error('Failed to create discussion');
        }

        // Get the created discussion room
        const discussion = await this.read.getRoomReader().getById(discussionId);
        if (!discussion) {
            throw new Error('Discussion created but could not be retrieved');
        }

        // Set the description (includes status and link)
        const fullDescription = `${description}\n\n📝 View ADR: ${rfdLink}`;
        await this.setRoomDescription(discussion, fullDescription, appUser);

        // Add authors to the discussion
        await this.addAuthorsToDiscussion(discussion, parentRoom, rfd.authors);

        // Post initial message
        await this.postMessage(
            discussion,
            appUser,
            `🎉 **New ${prefix} Created**\n\n` +
            `**${rfd.title}**\n\n` +
            `${STATE_DESCRIPTIONS[rfd.state]}\n\n` +
            `🔗 [Read the full ${prefix}](${rfdLink})\n\n` +
            `_Authors: ${rfd.authors.join(', ')}_`
        );

        // Build discussion URL as a universal/deep link for mobile and desktop app support
        // Format: https://go.rocket.chat/room?host={host}&path=group/{roomId}
        const discussionUrl = this.buildDeepLink(siteUrl, `group/${discussionId}`);

        return {
            id: discussionId,
            url: discussionUrl,
        };
    }

    /**
     * Update an existing discussion based on RFD changes
     */
    async updateDiscussion(
        discussionUrl: string,
        rfd: RFD,
        rfdLink: string,
        changes: RFDChanges,
    ): Promise<void> {
        // Extract room ID from URL (e.g., https://chat.example.com/group/ROOM_ID)
        const roomId = this.extractRoomIdFromUrl(discussionUrl);
        if (!roomId) {
            throw new Error(`Could not extract room ID from URL: ${discussionUrl}`);
        }

        const discussion = await this.read.getRoomReader().getById(roomId);
        if (!discussion) {
            throw new Error(`Discussion room with ID '${roomId}' not found`);
        }

        const appUser = await this.read.getUserReader().getAppUser();
        if (!appUser) {
            throw new Error('App user not found');
        }

        // Build update message parts
        const updateParts: string[] = [];

        // Handle state change
        if (changes.state) {
            const fullDescription = `${this.buildDescription(rfd, rfdLink)}\n\n📝 View ADR: ${rfdLink}`;
            await this.setRoomDescription(discussion, fullDescription, appUser);
            updateParts.push(
                `📊 **Status changed:** ${STATE_DESCRIPTIONS[changes.state.old]} → ${STATE_DESCRIPTIONS[changes.state.new]}`
            );
        }

        // Handle title change
        if (changes.title) {
            updateParts.push(
                `📝 **Title changed:** "${changes.title.old}" → "${changes.title.new}"`
            );
            // Note: Changing discussion name requires special permissions, just report it
        }

        // Handle content change
        if (changes.content) {
            updateParts.push(
                `📄 **Content updated** - [View the latest version](${rfdLink})`
            );
        }

        // Handle author changes
        if (changes.authors) {
            const newAuthors = changes.authors.new.filter(
                a => !changes.authors!.old.includes(a)
            );
            if (newAuthors.length > 0) {
                // Try to add new authors to the discussion
                const parentRoom = discussion.parentRoom 
                    ? await this.read.getRoomReader().getById(discussion.parentRoom.id)
                    : null;
                    
                if (parentRoom) {
                    await this.addAuthorsToDiscussion(discussion, parentRoom, newAuthors);
                }
                updateParts.push(
                    `👤 **New authors added:** ${newAuthors.join(', ')}`
                );
            }
        }

        // Handle tag changes
        if (changes.tags) {
            const addedTags = changes.tags.new.filter(t => !changes.tags!.old.includes(t));
            const removedTags = changes.tags.old.filter(t => !changes.tags!.new.includes(t));
            
            if (addedTags.length > 0 || removedTags.length > 0) {
                let tagMsg = '🏷️ **Tags changed:**';
                if (addedTags.length > 0) {
                    tagMsg += ` +${addedTags.join(', +')}`;
                }
                if (removedTags.length > 0) {
                    tagMsg += ` -${removedTags.join(', -')}`;
                }
                updateParts.push(tagMsg);
            }
        }

        // Post update message if there are changes to report
        if (updateParts.length > 0) {
            await this.postMessage(
                discussion,
                appUser,
                `🔄 **ADR Updated**\n\n${updateParts.join('\n\n')}`
            );
        }
    }

    /**
     * Build the description string for a discussion
     */
    private buildDescription(rfd: RFD, rfdLink: string): string {
        return `${STATE_DESCRIPTIONS[rfd.state]} | Tags: ${rfd.tags.join(', ') || 'none'}`;
    }

    /**
     * Add authors to a discussion by matching emails/usernames to users in parent channel
     */
    private async addAuthorsToDiscussion(
        discussion: IRoom,
        parentRoom: IRoom,
        authorEmails: string[],
    ): Promise<void> {
        this.log(`Adding authors to discussion: ${JSON.stringify(authorEmails)}`);
        
        const appUser = await this.read.getUserReader().getAppUser();
        if (!appUser) {
            this.log('No app user found');
            return;
        }

        // Get members of the parent room to match against
        const members = await this.read.getRoomReader().getMembers(parentRoom.id);
        this.log(`Parent room ${parentRoom.slugifiedName} has ${members.length} members`);
        
        for (const authorInput of authorEmails) {
            // Skip empty inputs
            if (!authorInput || !authorInput.trim()) continue;
            
            let user: IUser | undefined;
            
            // Parse the author input - could be:
            // - "email@example.com"
            // - "Name <email@example.com>"
            // - "username"
            const trimmedInput = authorInput.trim();
            const emailMatch = trimmedInput.match(/<([^>]+)>/);
            const email = emailMatch ? emailMatch[1].toLowerCase() : trimmedInput.toLowerCase();
            
            this.log(`Looking for author: "${trimmedInput}", parsed email: "${email}"`);
            
            // First try to match by email in parent room members
            user = members.find(m => 
                m.emails?.some(e => e.address.toLowerCase() === email)
            );
            
            if (user) {
                this.log(`Found user by email: ${user.username}`);
            }
            
            // If not found by email, try by username
            if (!user) {
                // Try treating the input as a username
                user = members.find(m => 
                    m.username.toLowerCase() === email ||
                    m.username.toLowerCase() === trimmedInput.toLowerCase()
                );
                if (user) {
                    this.log(`Found user by username in members: ${user.username}`);
                }
            }
            
            // If still not found, try to get user directly by username
            if (!user && !email.includes('@')) {
                try {
                    user = await this.read.getUserReader().getByUsername(trimmedInput);
                    if (user) {
                        this.log(`Found user by direct username lookup: ${user.username}`);
                    }
                } catch (e) {
                    this.log(`User not found by username: ${trimmedInput}`);
                }
            }
            
            if (user) {
                try {
                    this.log(`Adding user ${user.username} to discussion ${discussion.id}`);
                    const updater = await this.modify.getUpdater().room(discussion.id, appUser);
                    updater.addMemberToBeAddedByUsername(user.username);
                    await this.modify.getUpdater().finish(updater);
                    this.log(`Successfully added ${user.username}`);
                } catch (e) {
                    this.log(`Error adding user ${user.username}: ${e}`);
                }
            } else {
                this.log(`No user found for author: ${trimmedInput}`);
            }
        }
    }

    /**
     * Set the room description via setData
     */
    private async setRoomDescription(room: IRoom, description: string, user: IUser): Promise<void> {
        try {
            const updater = await this.modify.getUpdater().room(room.id, user);
            updater.setData({ description } as Partial<IRoom>);
            await this.modify.getUpdater().finish(updater);
            this.log(`Set room description for ${room.id}`);
        } catch (e) {
            this.log(`Failed to set room description: ${e}`);
        }
    }

    /**
     * Post a message to a room
     */
    private async postMessage(room: IRoom, sender: IUser, text: string): Promise<void> {
        const messageBuilder = this.modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(sender)
            .setText(text);

        await this.modify.getCreator().finish(messageBuilder);
    }

    /**
     * Convert a string to a URL-safe slug
     */
    private slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 50);
    }

    /**
     * Extract room ID from a discussion URL
     * Handles URLs like:
     *   - https://chat.example.com/group/ROOM_ID
     *   - https://chat.example.com/group/ROOM_ID?msg=xyz
     *   - https://go.rocket.chat/room?host=example.com&path=group/ROOM_ID
     */
    extractRoomIdFromUrl(url: string): string | null {
        // Try direct group URL format first: /group/ROOM_ID
        const directMatch = url.match(/\/group\/([^\/\?]+)/);
        if (directMatch) {
            return directMatch[1];
        }

        // Try go.rocket.chat deep link format: ?path=group/ROOM_ID or &path=group/ROOM_ID
        const goRocketChatMatch = url.match(/[?&]path=group(?:%2F|\/)([^&]+)/i);
        if (goRocketChatMatch) {
            return decodeURIComponent(goRocketChatMatch[1]);
        }

        return null;
    }

    /**
     * Check if a URL is a valid Rocket.Chat discussion URL for our server
     * Valid URLs are:
     *   - URLs on our site (matching siteUrl host)
     *   - go.rocket.chat deep links pointing to our host
     * Invalid URLs are:
     *   - External URLs (GitHub, etc.)
     *   - go.rocket.chat links pointing to a different host
     */
    isValidDiscussionUrl(url: string, siteUrl: string): boolean {
        if (!url) {
            return false;
        }

        try {
            const parsedUrl = new URL(url);
            const parsedSiteUrl = new URL(siteUrl);

            // Check if it's a go.rocket.chat deep link
            if (parsedUrl.host.toLowerCase() === 'go.rocket.chat') {
                // Extract host parameter from go.rocket.chat URL
                const hostParam = parsedUrl.searchParams.get('host');
                if (!hostParam) {
                    return false;
                }
                // Check if the host in the deep link matches our site URL host
                return hostParam.toLowerCase() === parsedSiteUrl.host.toLowerCase();
            }

            // Check if the URL is from our site (matching host)
            if (parsedUrl.host.toLowerCase() === parsedSiteUrl.host.toLowerCase()) {
                return true;
            }

            return false;
        } catch {
            // If URL parsing fails, the URL is invalid
            return false;
        }
    }

    /**
     * Build a universal/deep link URL for Rocket.Chat
     * Converts a site URL and path into a go.rocket.chat deep link
     * that works with mobile apps and desktop clients.
     * 
     * Example: siteUrl="https://open.rocket.chat", path="group/abc123"
     * Returns: "https://go.rocket.chat/room?host=open.rocket.chat&path=group/abc123"
     */
    private buildDeepLink(siteUrl: string, path: string): string {
        // Extract host from siteUrl (e.g., "https://open.rocket.chat" -> "open.rocket.chat")
        let host: string;
        try {
            const url = new URL(siteUrl);
            host = url.host;
        } catch {
            // Fallback: extract host using regex if URL parsing fails
            // This handles formats like "https://host.com:3000/path?query" -> "host.com:3000"
            const match = siteUrl.match(/^(?:https?:\/\/)?([^\/\?\#]+)/);
            host = match ? match[1] : siteUrl;
        }
        
        return `https://go.rocket.chat/room?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`;
    }
}
