import {NextRequest} from "next/server";
import {mobileHeaders,mobileJson} from "@/lib/mobile/http";
/** Adapts only fixed first-party trip handlers; retains their validation and notification logic. */
export async function mobileTripBridge(request:NextRequest,handler:(r:NextRequest)=>Promise<Response>){
 const origin=request.headers.get("origin");
 if(origin && origin!==request.nextUrl.origin && !mobileHeaders(request)["Access-Control-Allow-Origin"])
   return mobileJson(request,{error:"Invalid app origin."},403);
 const headers=new Headers(request.headers);
 headers.set("origin",request.nextUrl.origin);
 headers.set("referer",request.nextUrl.origin+"/trip");
 const body=request.method==="GET"?undefined:await request.text();
 if(body && body.length>16000)return mobileJson(request,{error:"Request too large."},413);
 const forwarded=new NextRequest(request.url,{method:request.method,headers,body});
 const result=await handler(forwarded);
 const response=new Response(result.body,{status:result.status,headers:result.headers});
 for(const [key,value]of Object.entries(mobileHeaders(request)))response.headers.set(key,value);
 return response;
}
