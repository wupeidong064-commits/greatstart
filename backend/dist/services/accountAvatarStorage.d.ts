export declare const AVATAR_MAX_BYTES: number;
export declare function readAccountAvatar(userId: string): Promise<string | null>;
export declare function saveAccountAvatar(userId: string, input: Buffer): Promise<string | null>;
export declare function removeAccountAvatar(userId: string): Promise<void>;
//# sourceMappingURL=accountAvatarStorage.d.ts.map