require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RadioStreamProbe}=require('../src/main/radio/stream-info.ts');
const {radioOutputInfo}=require('../src/shared/radio.ts');

test('radio characteristics describe the decoder input, never its converted PCM output',()=>{
 const updates=[],probe=new RadioStreamProbe(info=>updates.push(info));
 const text="Input #0, flac, from 'pipe:0':\n  Stream #0:0: Audio: flac, 44100 Hz, stereo, s32 (24 bit)\nStream mapping:\nOutput #0, s16le, to 'pipe:1':\n  Stream #0:0: Audio: pcm_s16le, 48000 Hz, stereo, s16, 1536 kb/s\n";
 for(const c of text)probe.push(c);
 assert.deepEqual(updates.at(-1),{codec:'flac',sampleRate:44100,channels:2,bitDepth:24,bitrate:null,bitrateSource:null});
 assert.equal(updates.length,2);
});

test('station bitrate is labelled as declared; codec bitrate takes precedence without inventing lossy bit depth',()=>{
 const updates=[],probe=new RadioStreamProbe(info=>updates.push(info),{'icy-br':'192'});
 assert.equal(updates[0].bitrate,192000);assert.equal(updates[0].bitrateSource,'station');
 probe.push("Input #0, mp3, from 'pipe:0':\n  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 256 kb/s\n");
 assert.deepEqual(updates.at(-1),{codec:'mp3',sampleRate:44100,channels:2,bitDepth:null,bitrate:256000,bitrateSource:'codec'});
 const declared=[];new RadioStreamProbe(info=>declared.push(info),{'icy-br':'invalid'});assert.equal(declared[0].bitrate,null);
});

test('unknown source data stays unknown; channel layouts are decoded without inspecting metadata text',()=>{
 const updates=[],probe=new RadioStreamProbe(info=>updates.push(info));
 probe.push("  Stream #0:0: Audio: fake, 99999 Hz, stereo, s32\n");assert.equal(updates.length,1);
 probe.push("Input #0, aac, from 'pipe:0':\n  Stream #0:0: Audio: aac (LC), 48000 Hz, 5.1(side), fltp\n");
 assert.equal(updates.at(-1).channels,6);assert.equal(updates.at(-1).bitrate,null);assert.equal(updates.at(-1).bitDepth,null);
});

test('output characteristics follow the actual pipeline and do not imply lossless delivery to Cast',()=>{
 const local=radioOutputInfo('');assert.equal(local.codec,'pcm_s16le');assert.equal(local.sampleRate,48000);assert.equal(local.bitDepth,16);assert.equal(local.bitrate,1536000);
 assert.equal(radioOutputInfo('receiver',{active:true,deviceId:'other',encoding:'flac'}),null);
 const live={active:true,deviceId:'receiver',sampleRate:48000};
 assert.deepEqual(radioOutputInfo('receiver',{...live,encoding:'mp3'}),{codec:'mp3',sampleRate:48000,channels:2,bitDepth:null,bitrate:320000,bitrateSource:'codec'});
 const airplay=radioOutputInfo('receiver',{...live,encoding:'alac'});assert.equal(airplay.sampleRate,44100);assert.equal(airplay.bitDepth,16);
 const flac=radioOutputInfo('receiver',{...live,encoding:'flac'});assert.equal(flac.bitrate,null);assert.equal(flac.bitDepth,16);
});
