"use client";
import { useParams } from "next/navigation";
import { AdminRestaurantCommissionPage } from "@/components/AdminRestaurantCommissionPage";

export default function Page() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return <AdminRestaurantCommissionPage restaurantId={restaurantId} />;
}
