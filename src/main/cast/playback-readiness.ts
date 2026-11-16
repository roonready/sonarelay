// PLAYING alone can precede actual media-clock progress on Cast receivers.
// Confirm media-clock progress without an additional wall-clock delay.
export class CastPlaybackReadiness {
 private lastTime?:number;
 private session:unknown;
 reset(){this.lastTime=undefined;this.session=undefined;}
 observe(status:any):boolean{
  const time=status?.currentTime;
  if(status?.playerState!=='PLAYING'||typeof time!=='number'||!Number.isFinite(time)||time<0){this.reset();return false;}
  if(this.lastTime===undefined||this.session!==status.mediaSessionId||time<=this.lastTime){
   this.session=status.mediaSessionId;this.lastTime=time;return false;
  }
  const delta=time-this.lastTime!;this.lastTime=time;
  // A discontinuous seek is not evidence that the audio output has started.
  return delta<=5;
 }
}
