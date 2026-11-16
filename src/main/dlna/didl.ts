import { escapeXml } from './soap-client';
export function didl(url: string, title: string, bytes?: number, mime='audio/wav') {
 return `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="SonaRelay" parentID="0" restricted="1"><dc:title>${escapeXml(title)}</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><res protocolInfo="http-get:*:${escapeXml(mime)}:*"${bytes===undefined?'':` size="${bytes}"`}>${escapeXml(url)}</res></item></DIDL-Lite>`;
}
