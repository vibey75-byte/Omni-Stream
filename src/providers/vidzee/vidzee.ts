import {
    BaseProvider,
    type Subtitle,
    type SourceType
} from '@omss/framework';

import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source
} from '@omss/framework';

import type { StreamResponse } from './vidzee.types';
import { decrypt, deriveKey } from './decrypt';

export class VidZeeProvider extends BaseProvider {
    readonly id = 'vidzee';
    readonly name = 'VidZee';
    readonly enabled = true;

    readonly BASE_URL = 'https://core.vidzee.wtf';
    readonly PLAYER_URL = 'https://player.vidzee.wtf';

    readonly HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7051.98 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: this.PLAYER_URL,
        Origin: this.PLAYER_URL
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media, { type: 'movie' });
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media, {
            type: 'tv',
            season: media.s?.toString(),
            episode: media.e?.toString()
        });
    }

    private async getSources(
        media: ProviderMediaObject,
        params: { type: 'movie' | 'tv'; season?: string; episode?: string }
    ): Promise<ProviderResult> {
        try {
            const tmdbId = media.tmdbId;

            const decKey = await this.fetchDecryptionKey();
            if (!decKey) {
                return this.emptyResult('Failed to fetch key', media);
            }

            const serverPromises = Array.from({ length: 14 }, (_, i) =>
                this.fetchServer(tmdbId, i, params)
            );

            const results = await Promise.allSettled(serverPromises);

            const successful: StreamResponse[] = [];

            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) {
                    successful.push(r.value);
                }
            }

            if (!successful.length) {
                return this.emptyResult('No servers found', media);
            }

            const decryptResults = await Promise.all(
                successful.map(async (res) => {
                    const links = await Promise.all(
                        res.url.map((u: { link: string }) =>
                            decrypt(u.link, decKey)
                        )
                    );
                    return { res, links };
                })
            );

            const allLinks: string[] = [];
            const subtitles = new Map<string, Subtitle>();

            for (const { res, links } of decryptResults) {
                allLinks.push(...links);

                for (const track of res.tracks) {
                    const key = `${track.lang}_${res.serverInfo.number}`;

                    if (!subtitles.has(key)) {
                        subtitles.set(key, {
                            url: this.createProxyUrl(track.url, this.HEADERS),
                            label: track.lang.replace(/\d+/g, '').trim(),
                            format: 'vtt'
                        });
                    }
                }
            }

            const uniqueLinks = [...new Set(allLinks)].filter(
                (link): link is string => typeof link === 'string' && link.startsWith('http')
            );

            const sources: Source[] = uniqueLinks.map((link) => ({
                url: this.createProxyUrl(link, this.HEADERS),
                type: 'hls' as SourceType,
                quality: this.inferQuality(link),
                audioTracks: [],
                provider: {
                    id: this.id,
                    name: this.name
                }
            }));

            return {
                sources,
                subtitles: Array.from(subtitles.values()),
                diagnostics: []
            };
        } catch (error) {
            return this.emptyResult(
                error instanceof Error ? error.message : 'Unknown error',
                media
            );
        }
    }

    private async fetchServer(
        tmdbId: string,
        serverId: number,
        params: { type: 'movie' | 'tv'; season?: string; episode?: string }
    ): Promise<StreamResponse | null> {
        try {
            let url = `${this.PLAYER_URL}/api/server?id=${tmdbId}&sr=${serverId}`;

            if (params.type === 'tv' && params.season && params.episode) {
                url += `&ss=${params.season}&ep=${params.episode}`;
            }

            const response = await fetch(url, { headers: this.HEADERS });

            if (!response.ok) return null;

            return (await response.json()) as StreamResponse;
        } catch {
            return null;
        }
    }

    private async fetchDecryptionKey(): Promise<string | null> {
        try {
            const response = await fetch(`${this.BASE_URL}/api-key`, {
                headers: this.HEADERS
            });

            if (!response.ok) return null;

            const data = await response.text();
            if (!data) return null;

            return await deriveKey(data);
        } catch {
            return null;
        }
    }

    private emptyResult(
        message: string,
        media: ProviderMediaObject
    ): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [
                {
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: ${message}`,
                    field: '',
                    severity: 'error'
                }
            ]
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(this.BASE_URL, {
                method: 'HEAD',
                headers: this.HEADERS
            });

            return response.status === 200;
        } catch {
            return false;
        }
    }
}
