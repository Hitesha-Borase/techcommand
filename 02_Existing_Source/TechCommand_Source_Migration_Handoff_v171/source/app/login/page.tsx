import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PasswordLogin } from "@/components/password-login";
import { loginScreen } from "@/lib/login-screen";
export const dynamic="force-dynamic";
export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const query=await searchParams;
 const state=await loginScreen(new Request("https://app.techcommandhq.com/login",{headers:await headers()}),{
 check:typeof query.check==="string"?query.check:undefined,
 error:typeof query.error==="string"?query.error:undefined,
 change:typeof query.change==="string"?query.change:undefined,
 });
 if(state.confirmed && state.initialStep==="ready") redirect("/");
 return <PasswordLogin {...state}/>;
}
