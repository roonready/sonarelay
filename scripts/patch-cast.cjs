// Cast sends CONNECT from the TLS callback. Load schemas synchronously before
// returning the proto module, so a fast connection cannot race async file I/O.
const fs=require('node:fs'),path=require('node:path');
const root=path.dirname(require.resolve('castv2'));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(version!=='0.1.10')throw new Error('Review Cast schema patch for version '+version);
const target=path.join(root,'lib/proto.js');let source=fs.readFileSync(target,'utf8');
if(!source.includes('MUSIC_BRIDGE_SYNC_SCHEMA')){
 if(!source.includes('protobuf.load(__dirname + "/cast_channel.proto", onLoad)'))throw new Error('Cast schema patch mismatch');
 source=source.replace('var builder = protobuf.load(__dirname + "/cast_channel.proto", onLoad);','// MUSIC_BRIDGE_SYNC_SCHEMA: initialize before exporting serializers.');
 source=source.replace('var extensions = [];','var extensions = [];\nonLoad(null, protobuf.loadSync(__dirname + "/cast_channel.proto"));');
 fs.writeFileSync(target,source);
}
console.log('Cast synchronous schema patch ready');
