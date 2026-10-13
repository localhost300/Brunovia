import Home from "@/app/page";

const adminRoles = ["HR_MANAGER"] as const;

export default function AdminPortal() {
  return (
    <Home
      allowedRoles={[...adminRoles]}
      portalName="Administrator"
      initialView="Dashboard"
    />
  );
}
