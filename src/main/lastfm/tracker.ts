import type { LastfmPreferences, MusicPlaybackSnapshot } from '../../shared/types';
export interface LastfmSubmission {method:'track.updateNowPlaying'|'track.scrobble';parameters:Record<string,string>}
interface Play {track:MusicPlaybackSnapshot;startedAt:number;listened:number;np:boolean;scrobble:boolean}
export class LastfmTracker {
 private current?:Play;
 private previous?:{position:number;at:number;playing:boolean;rate:number};
 reset(){this.current=undefined;this.previous=undefined;}
 preferencesChanged(before:LastfmPreferences,after:LastfmPreferences){
  if(this.current&&before.scrobbling!==after.scrobbling){this.current.listened=0;this.previous=undefined;}
  if(this.current&&!before.nowPlaying&&after.nowPlaying)this.current.np=false;
 }
 observe(track:MusicPlaybackSnapshot|undefined,settings:LastfmPreferences,now:number,epoch:number):LastfmSubmission[]{
  if(!track||!track.title?.trim()||!track.artist?.trim()){this.previous=undefined;return [];}
  const position=typeof track.position==='number'&&Number.isFinite(track.position)&&track.position>=0?track.position:undefined;
  const rate=Number.isFinite(track.rate)&&track.rate>0?track.rate:1;
  const old=this.current?.track;
  const changed=!old||old.title!==track.title||old.artist!==track.artist||(old.trackId&&track.trackId&&old.trackId!==track.trackId);
  const replay=!changed&&position!==undefined&&this.previous&&position<2&&this.previous.position>5&&position<this.previous.position-5;
  if(changed||replay){this.current={track:{...track},startedAt:track.playing?Math.floor(epoch/1000):0,listened:0,np:false,scrobble:false};this.previous=undefined;}
  const current=this.current!;current.track={...track};let progressed=false;
  if(track.playing&&!current.startedAt)current.startedAt=Math.floor(epoch/1000);
  if(track.playing&&this.previous&&!this.previous.playing)current.np=false;
  if(this.previous&&position!==undefined){
   const wall=(now-this.previous.at)/1000,delta=position-this.previous.position;
   // Count observed listening, never a seek, pause, buffering or a missed long gap.
   if(track.playing&&this.previous.playing&&wall>0&&wall<=5&&delta>0&&delta<=wall*Math.max(rate,this.previous.rate)+1.5){
    if(settings.scrobbling)current.listened+=Math.min(wall,delta/Math.max(rate,this.previous.rate));progressed=true;
   }
  }
  this.previous=position!==undefined?{position,at:now,playing:track.playing,rate}:undefined;
  const submissions:LastfmSubmission[]=[],parameters:Record<string,string>={artist:track.artist.trim().slice(0,1000),track:track.title.trim().slice(0,1000)};
  if(track.album?.trim())parameters.album=track.album.trim().slice(0,1000);
  const duration=typeof track.duration==='number'&&Number.isFinite(track.duration)&&track.duration>0?track.duration:undefined;
  if(duration)parameters.duration=String(Math.floor(duration));
  if(settings.nowPlaying&&track.playing&&(progressed||position===undefined)&&!current.np){current.np=true;submissions.push({method:'track.updateNowPlaying',parameters:{...parameters}});}
  if(settings.scrobbling&&duration&&duration>30&&current.listened>=Math.min(duration/2,240)&&!current.scrobble){current.scrobble=true;submissions.push({method:'track.scrobble',parameters:{...parameters,timestamp:String(current.startedAt)}});}
  return submissions;
 }
}
