import { NextRequest, NextResponse } from "next/server";

type Bucket={count:number;resetAt:number};
const buckets=new Map<string,Bucket>(),WINDOW_MS=60_000,MAX_REQUESTS=120;
export function proxy(request:NextRequest){
  const requestId=request.headers.get("x-request-id")??crypto.randomUUID();
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown",now=Date.now(),key=`${ip}:${request.nextUrl.pathname}`;
  const current=buckets.get(key);const bucket=!current||current.resetAt<=now?{count:1,resetAt:now+WINDOW_MS}:{...current,count:current.count+1};buckets.set(key,bucket);
  if(buckets.size>10_000)for(const [entry,value] of buckets)if(value.resetAt<=now)buckets.delete(entry);
  if(bucket.count>MAX_REQUESTS)return NextResponse.json({error:"Too many requests",requestId},{status:429,headers:{"Retry-After":String(Math.ceil((bucket.resetAt-now)/1000)),"X-Request-Id":requestId}});
  const headers=new Headers(request.headers);headers.set("x-request-id",requestId);
  const response=NextResponse.next({request:{headers}});response.headers.set("X-Request-Id",requestId);response.headers.set("X-RateLimit-Limit",String(MAX_REQUESTS));response.headers.set("X-RateLimit-Remaining",String(Math.max(0,MAX_REQUESTS-bucket.count)));return response;
}
export const config={matcher:["/api/:path*"]};
