export interface RouteSession {stop():Promise<void>}
/** Serialize destination changes while preparing capture during the original click. */
export class SelectionRouter<T> {
 private version=0;
 private queue:Promise<void>=Promise.resolve();
 private controller?:AbortController;
 private current?:RouteSession;
 constructor(private prepare:(id:string)=>Promise<T>,private start:(id:string,input:Promise<T>,signal:AbortSignal)=>Promise<RouteSession>,private discard:(input:T)=>void){}
 route(id:string):Promise<void>{
  const version=++this.version;
  // getDisplayMedia must be requested before awaiting old receiver shutdown.
  const input=id?this.prepare(id):undefined;
  void input?.catch(()=>{});
  this.controller?.abort();
  const operation=this.queue.catch(()=>{}).then(async()=>{
   const old=this.current;this.current=undefined;
   await old?.stop();
   if(version!==this.version || !id){if(input)await input.then(this.discard,()=>{});return;}
   const controller=new AbortController();this.controller=controller;
   try{
    const session=await this.start(id,input!,controller.signal);
    if(version!==this.version || controller.signal.aborted)await session.stop();
    else this.current=session;
   }catch(error){
    if(input)await input.then(this.discard,()=>{});
    if(version===this.version)throw error;
   }
  });
  this.queue=operation.catch(()=>{});
  return operation;
 }
 stop(){return this.route('');}
}
