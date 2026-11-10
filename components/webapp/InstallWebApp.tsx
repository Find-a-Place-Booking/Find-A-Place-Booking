"use client";
import React from "react";
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function InstallWebApp(){
 const [prompt,setPrompt]=React.useState<InstallEvent|null>(null),[help,setHelp]=React.useState(false),[installed,setInstalled]=React.useState(false);
 React.useEffect(()=>{setInstalled(window.matchMedia("(display-mode: standalone)").matches);const capture=(e:Event)=>{e.preventDefault();setPrompt(e as InstallEvent)};const done=()=>setInstalled(true);window.addEventListener("beforeinstallprompt",capture);window.addEventListener("appinstalled",done);return()=>{window.removeEventListener("beforeinstallprompt",capture);window.removeEventListener("appinstalled",done)}},[]);
 if(installed)return null;
 return <section className="panel stack"><strong>Keep this app handy</strong><button className="button secondary" onClick={()=>{if(prompt)void prompt.prompt().then(()=>{setPrompt(null)});else setHelp(v=>!v)}}>Add to home screen</button>{help?<p className="muted">On iPhone, open this page in Safari, tap Share, then Add to Home Screen. On Android, open your browser menu and choose Install app or Add to Home screen. You can also keep using it in your browser.</p>:null}</section>
}
