#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.mjs';
import { Service } from './service.mjs';
import { createMcpServer } from './mcp.mjs';
import { startHttp } from './http.mjs';
import { publicError } from './schemas.mjs';

let service,http,mcp;
try {
  service=new Service(loadConfig());
  if(process.argv.includes('--http')){
    http=await startHttp(service,{host:process.env.QG_HOST||'127.0.0.1',port:Number(process.env.QG_PORT||4317)});
    console.error(`Sill listening on ${process.env.QG_HOST||'127.0.0.1'}:${http.address().port}`);
  } else if(process.argv.includes('--stdio')) {mcp=createMcpServer(service);await mcp.connect(new StdioServerTransport());}
  else throw new Error('Use --stdio or --http');
} catch(error) {console.error(JSON.stringify(publicError(error)));if(service)await service.close();process.exitCode=1;}
let closing=false;
const close=async()=>{if(closing)return;closing=true;if(http)http.close();if(mcp)await mcp.close();if(service)await service.close();process.exit(0);};
process.on('SIGINT',close);process.on('SIGTERM',close);
if(process.argv.includes('--stdio'))process.stdin.on('end',close);
