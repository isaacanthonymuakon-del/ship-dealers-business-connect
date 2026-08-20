import type { MetadataRoute } from "next";
export default function sitemap():MetadataRoute.Sitemap{const base="https://shipdealersconnect.site";return ["","/support","/safety","/terms","/privacy","/refunds"].map((path,index)=>({url:base+path,lastModified:new Date(),changeFrequency:index===0?"daily":"monthly",priority:index===0?1:.6}))}
