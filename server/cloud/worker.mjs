import {createSillRuntime} from './http.mjs';
import html from '../../dist/cloud/index.html';
import appHtml from '../../dist/cloud/app.html';
import brandIcon from '../../assets/sill-icon.png';
// No credentials, persistence, per-user state or client instances in module globals.
export default {fetch(request,env){
 if(request.method==='GET'&&new URL(request.url).pathname==='/assets/sill-icon.png')return new Response(brandIcon,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY||!env.APP_ORIGIN)return new Response('Not configured',{status:503});
 let oauthClientIds=[];try{oauthClientIds=JSON.parse(env.OAUTH_CLIENT_IDS||'[]');}catch{}
 return createSillRuntime({url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,appOrigin:env.APP_ORIGIN,agentAudience:env.AGENT_AUDIENCE,mcpEnabled:env.MCP_ENABLE==='true',oauthConsentEnabled:env.OAUTH_CONSENT_ENABLE==='true',oauthClientIds},{html,appHtml})(request);
}};
