export interface VideasyEncryptedResponse {
    data: string;
    isEncrypted?: boolean;
}

export interface VideasyDecryptedPayload {
    sources: VideasyRawSource[];
    subtitles?: VideasyRawSubtitle[];
}

export interface VideasyRawSource {
    url: string;
    quality?: string;
    type?: string;
}

export interface VideasyRawSubtitle {
    url: string;
    label?: string;
    language?: string;
    lang?: string;
}

export interface VideasyApiParams {
    title: string;
    mediaType: 'movie' | 'tv';
    totalSeasons?: number;
    episodeId: number;
    seasonId: number;
    tmdbId: string | number;
    imdbId?: string;
    language?: string;
}

export interface VideasyServer {
    readonly name: string;
    readonly url: string;
    readonly language?: string;
}
