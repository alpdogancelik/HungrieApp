import { notFound } from "next/navigation";
import { AdminReviewPreview } from "@/components/AdminReviewPreview";
export default function Page(){if(process.env.NODE_ENV!=="development")notFound();return <AdminReviewPreview/>}
