import html from './index.html';
const headers={'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Cache-Control':'no-cache'};
export default {fetch(request){
 const path=new URL(request.url).pathname;
 if(/^\/(api|mcp)(\/|$)/.test(path))return Response.json({error:'NOT_CONNECTED',message:'Static demo: backend and MCP are not connected.'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 if(path==='/'||path==='/index.html')return new Response(request.method==='HEAD'?null:html,{headers});
 return new Response('Not found',{status:404});
}};
