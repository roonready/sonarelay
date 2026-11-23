export interface RouteSession {stop():Promise<void>}
/** Stop the previous relay before starting capture for the next destination. */
export class SelectionRouter {
 private version=0;
 private queue:Promise<void>=Promise.resolve();
 private controller?:AbortController;
 private current?:RouteSession;
 constructor(private start:(id:string,signal:AbortSignal)=>Promise<RouteSession>){}
 route(id:string):Promise<void>{
  const version=++this.version;
  this.controller?.abort();
  const operation=this.queue.catch(()=>{}).then(async()=>{
   const old=this.current;this.current=undefined;
   await old?.stop();
   if(version!==this.version || !id)return;
   const controller=new AbortController();this.controller=controller;
   try{
    const session=await this.start(id,controller.signal);
    if(version!==this.version || controller.signal.aborted)await session.stop();
    else this.current=session;
   }catch(error){
    if(version===this.version)throw error;
   }
  });
  this.queue=operation.catch(()=>{});
  return operation;
 }
 stop(){return this.route('');}
}
