export function mediaCorsHeaders():Record<string,string>{
 return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range, Content-Type, Cache-Control, If-Modified-Since','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges','Access-Control-Allow-Private-Network':'true'};
}
