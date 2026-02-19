import {
    IPersistence,
    IPersistenceRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface StoredDiscussion {
    rfdId: string;
    roomId: string;
    roomUrl: string;
    createdAt: string;
}

/**
 * Stores and retrieves discussion mappings for RFDs
 */
export class DiscussionStore {
    private static ASSOCIATION_TYPE = 'rfd-discussion';

    /**
     * Get the stored discussion for an RFD
     */
    static async getDiscussion(read: IPersistenceRead, rfdId: string): Promise<StoredDiscussion | null> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `${this.ASSOCIATION_TYPE}:${rfdId}`
        );

        const results = await read.readByAssociation(association);
        if (results && results.length > 0) {
            return results[0] as StoredDiscussion;
        }
        return null;
    }

    /**
     * Store a discussion mapping for an RFD
     */
    static async storeDiscussion(
        persistence: IPersistence,
        rfdId: string,
        roomId: string,
        roomUrl: string
    ): Promise<void> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `${this.ASSOCIATION_TYPE}:${rfdId}`
        );

        const data: StoredDiscussion = {
            rfdId,
            roomId,
            roomUrl,
            createdAt: new Date().toISOString(),
        };

        await persistence.updateByAssociation(association, data, true);
    }

    /**
     * Check if a discussion already exists for an RFD
     */
    static async hasDiscussion(read: IPersistenceRead, rfdId: string): Promise<boolean> {
        const discussion = await this.getDiscussion(read, rfdId);
        return discussion !== null;
    }
}
