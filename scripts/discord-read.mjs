import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
let token;
export async function discordRead(route) {
  if (!token) {
    const tokenFile=process.env.AION_DISCORD_TOKEN_FILE || join(homedir(),'.codex','mcp','discord','bot-token.dpapi');
    try {
      token=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; $s=Get-Content -LiteralPath $env:AION_DISCORD_TOKEN_FILE -Raw | ConvertTo-SecureString; $c=[PSCredential]::new('DiscordBot',$s); [Console]::Write($c.GetNetworkCredential().Password); $s.Dispose()"],{encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','pipe'],env:{...process.env,AION_DISCORD_TOKEN_FILE:tokenFile,PSModulePath:'C:/Windows/System32/WindowsPowerShell/v1.0/Modules'}}).trim();
    } catch { throw Error('Private Discord credential unavailable'); }
  }
  for (let attempt=0;attempt<4;attempt++) {
    let response;
    try { response=await fetch('https://discord.com/api/v10'+route,{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(20000)}); }
    catch { throw Error('Discord read timed out or failed'); }
    const data=await response.json();
    if (response.status===429 && attempt<3 && Number(data.retry_after)<=30) { await new Promise(r=>setTimeout(r,Number(data.retry_after)*1000+300)); continue; }
    if (!response.ok) throw Error(`Discord read failed: HTTP ${response.status}`);
    return data;
  }
}
