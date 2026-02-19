import {
    IModify,
    IRead,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RFD, RFDChanges, STATE_DESCRIPTIONS } from './types';

export class DiscussionManager {
    constructor(
        private readonly read: IRead,
        private readonly modify: IModify,
        private readonly persistence: IPersistence,
    ) {}

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

        // Build discussion URL using the room ID (not slug)
        const discussionUrl = `${siteUrl}/group/${discussionId}`;

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
     * Add authors to a discussion by matching emails to users in the parent channel
     */
    private async addAuthorsToDiscussion(
        discussion: IRoom,
        parentRoom: IRoom,
        authorEmails: string[],
    ): Promise<void> {
        // Get members of the parent room
        const members = await this.read.getRoomReader().getMembers(parentRoom.id);
        
        for (const email of authorEmails) {
            // Try to find user by email
            const user = members.find(m => 
                m.emails?.some(e => e.address.toLowerCase() === email.toLowerCase())
            );
            
            if (user) {
                try {
                    const updater = await this.modify.getUpdater().room(discussion.id, user);
                    updater.addMemberToBeAddedByUsername(user.username);
                    await this.modify.getUpdater().finish(updater);
                } catch (e) {
                    // User might already be a member, ignore errors
                }
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
        } catch (e) {
            // Log but don't fail - some room types may not support description
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
     */
    private extractRoomIdFromUrl(url: string): string | null {
        const match = url.match(/\/group\/([^\/\?]+)/);
        return match ? match[1] : null;
    }
}
