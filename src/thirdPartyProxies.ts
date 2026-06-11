export const knownThirdPartyProxies: Record<string, RegExp[]> = {
    'https://hls1.vid1.site': [/\/proxy\/(.+)$/],

    'https://madplay.site': [/\/api\/[^/]+\/proxy\?url=(.+)$/],

    'https://streams.smashystream.top': [/\/proxy\/m3u8\/(.+?)\/[^/]+$/],

    '*': [
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/|https?%3A%2F%2F).+)$/,
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/)?[^/]+\/file2\/.+)$/,
        /^https:\/\/.+?\.workers\.dev\/((?:https?:\/\/).+)$/,
        /\/proxy\/(.+)$/,
        /\/(?:m3u8|mp4)-proxy\?url=(.+?)(?:&|$)/,
        /\/api\/[^/]+\/proxy\?url=(.+)$/,
        /\/proxy\?.*url=([^&]+)/,
        /\/stream\/proxy\/(.+)$/,
        /^https:\/\/[^/]+\/((?:https?:\/\/)?[a-zA-Z0-9.-]+\/file2\/.+)$/,
        /^https:\/\/[^/]+\.workers\.dev\/(?:m3u8|mp4)-proxy\?url=(.+?)(?:&|$)/
    ]
};
