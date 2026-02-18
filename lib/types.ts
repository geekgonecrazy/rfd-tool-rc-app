export interface RFD {
    id: string;
    title: string;
    authors: string[];
    state: RFDState;
    discussion?: string;
    tags: string[];
    content: string;
    contentMD: string;
    createdAt: string;
    modifiedAt: string;
}

export type RFDState = 
    | 'prediscussion'
    | 'ideation'
    | 'discussion'
    | 'published'
    | 'committed'
    | 'abandoned';

export interface FieldChange<T = any> {
    old: T;
    new: T;
}

export interface RFDChanges {
    title?: FieldChange<string>;
    state?: FieldChange<RFDState>;
    authors?: FieldChange<string[]>;
    tags?: FieldChange<string[]>;
    discussion?: FieldChange<string>;
    content?: boolean;
}

export interface WebhookPayload {
    event: 'rfd.created' | 'rfd.updated';
    timestamp: string;
    rfd: RFD;
    link: string;
    changes?: RFDChanges;
}

export interface WebhookResponse {
    success: boolean;
    error?: string;
    discussion?: {
        id: string;
        url: string;
    };
}

export const STATE_DESCRIPTIONS: Record<RFDState, string> = {
    prediscussion: '🔒 Pre-Discussion - Not yet open for feedback',
    ideation: '💡 Ideation - Early idea, feedback welcome',
    discussion: '💬 Discussion - Actively seeking input',
    published: '📋 Published - Accepted, open for comments',
    committed: '✅ Committed - Implemented',
    abandoned: '❌ Abandoned - No longer being pursued',
};
