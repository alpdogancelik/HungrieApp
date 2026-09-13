import{AuthGate}from"@/components/AuthGate";import{AdminShell}from"@/components/AdminShell";
export const dynamic="force-dynamic";export const fetchCache="force-no-store";
export default function Layout({children}:{children:React.ReactNode}){return <AuthGate><AdminShell>{children}</AdminShell></AuthGate>}
