import Home from "@/app/page";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return <Home initialView={module} />;
}
