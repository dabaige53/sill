import {createSillRuntime} from './http.mjs';
import html from '../../dist/cloud/index.html';
// No credentials, persistence, per-user state or client instances in module globals.
export default {fetch(request,env){
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY||!env.APP_ORIGIN)return new Response('Not configured',{status:503});
 let oauthClientIds=[];try{oauthClientIds=JSON.parse(env.OAUTH_CLIENT_IDS||'[]');}catch{}
 return createSillRuntime({url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,appOrigin:env.APP_ORIGIN,agentAudience:env.AGENT_AUDIENCE,mcpEnabled:env.MCP_ENABLE==='true',oauthConsentEnabled:env.OAUTH_CONSENT_ENABLE==='true',oauthClientIds},{html})(request);
}};
