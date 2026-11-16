// Run with Electron: electron scripts/generate-icons.cjs
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
app.setPath('userData',path.join(root,'.verification','icon-generator'));
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});
 try{
  await window.loadURL('data:text/html,<html></html>');
  const logo=fs.readFileSync(path.join(root,'assets/logo.svg'),'utf8');
  // Keep the complete supplied mark, centered on a transparent square.
  const square=logo.replace('viewBox="0 0 240 100"','viewBox="0 -70 240 240"').replace('width="190px"','width="256" height="256"');
  const publicDir=path.join(root,'src/renderer/public');fs.mkdirSync(publicDir,{recursive:true});
  fs.writeFileSync(path.join(publicDir,'favicon.svg'),square);
  const sizes=[16,24,32,48,64,128,256],pngs=[];
  for(const size of [...sizes,512]){
   const data=await window.webContents.executeJavaScript(`(async()=>{
    const image=new Image();image.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(square).toString('base64'))};await image.decode();
    const canvas=document.createElement('canvas');canvas.width=${size};canvas.height=${size};
    canvas.getContext('2d').drawImage(image,0,0,${size},${size});return canvas.toDataURL('image/png').split(',')[1];
   })()`);
   const png=Buffer.from(data,'base64');
   if(sizes.includes(size))pngs.push({size,png});
   if(size===32)fs.writeFileSync(path.join(publicDir,'favicon-32.png'),png);
   if(size===512)fs.writeFileSync(path.join(root,'assets/icon.png'),png);
  }
  const header=Buffer.alloc(6+16*pngs.length);header.writeUInt16LE(1,2);header.writeUInt16LE(pngs.length,4);
  let offset=header.length;
  pngs.forEach(({size,png},i)=>{
   const start=6+16*i;header[start]=header[start+1]=size===256?0:size;
   header.writeUInt16LE(1,start+4);header.writeUInt16LE(32,start+6);
   header.writeUInt32LE(png.length,start+8);header.writeUInt32LE(offset,start+12);offset+=png.length;
  });
  const ico=Buffer.concat([header,...pngs.map(item=>item.png)]);
  fs.writeFileSync(path.join(root,'assets/icon.ico'),ico);
  fs.writeFileSync(path.join(publicDir,'favicon.ico'),ico);
  console.log('Generated SVG, PNG and multi-size ICO assets from assets/logo.svg');
 }finally{window.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
